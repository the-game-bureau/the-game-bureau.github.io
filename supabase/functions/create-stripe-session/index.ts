// create-stripe-session — POST { items: [{ item_id, qty }] }
//
// Looks up each item in gift_shop_items (using the service role, so client
// can't tamper with prices), creates a Stripe Embedded Checkout session,
// and returns { client_secret, session_id } for the public gift shop to
// mount via Stripe.js.
//
// The matching webhook (stripe-webhook) does the Printful fulfillment.
//
// Setup:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
//   supabase secrets set SITE_ORIGIN=https://thegamebureau.com
//     (used as the return_url base; can be http://127.0.0.1:5500 for local dev)
//   supabase functions deploy create-stripe-session --no-verify-jwt
//     (no-verify-jwt because anon shoppers shouldn't need a Supabase session)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SITE_ORIGIN       = Deno.env.get('SITE_ORIGIN') ?? '';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const supa   = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

interface CartLine { item_id: string; qty: number; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });
  if (!STRIPE_SECRET_KEY)       return json(500, { error: 'STRIPE_SECRET_KEY not set.' });

  let payload: { items?: CartLine[] };
  try { payload = await req.json(); }
  catch { return json(400, { error: 'Invalid JSON.' }); }

  const lines = (payload.items ?? []).filter((l) =>
    l && typeof l.item_id === 'string' && Number.isFinite(l.qty) && l.qty > 0
  );
  if (!lines.length) return json(400, { error: 'Cart is empty.' });

  // Cap qty to a sane range; bigger orders need manual handling.
  for (const l of lines) l.qty = Math.min(20, Math.max(1, Math.floor(l.qty)));

  const ids = [...new Set(lines.map((l) => l.item_id))];
  const { data: items, error } = await supa
    .from('gift_shop_items')
    .select('id,title,image_url,price_cents,currency,printful_variant_id,archived')
    .in('id', ids);
  if (error)             return json(500, { error: 'Lookup failed: ' + error.message });
  if (!items?.length)    return json(400, { error: 'No matching items.' });

  // Build Stripe line_items from authoritative server-side data only.
  const byId = new Map(items.map((it) => [it.id, it]));
  const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const fulfillment: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const it = byId.get(line.item_id);
    if (!it)                          return json(400, { error: `Item ${line.item_id} not found.` });
    if (it.archived)                  return json(400, { error: `Item ${it.title || it.id} is archived.` });
    if (!it.price_cents || !it.printful_variant_id) {
      return json(400, { error: `Item ${it.title || it.id} is not available for checkout.` });
    }
    stripeLineItems.push({
      quantity: line.qty,
      price_data: {
        currency: it.currency || 'usd',
        unit_amount: it.price_cents,
        product_data: {
          name: it.title || 'Gift Bureau item',
          images: it.image_url ? [it.image_url] : undefined,
        },
      },
    });
    fulfillment.push({
      item_id: it.id,
      printful_variant_id: it.printful_variant_id,
      qty: line.qty,
      unit_price_cents: it.price_cents,
      title: it.title,
    });
  }

  const returnUrl = (SITE_ORIGIN || new URL(req.url).origin).replace(/\/$/, '') +
    '/gifts/?checkout=complete&session_id={CHECKOUT_SESSION_ID}';

  try {
    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      line_items: stripeLineItems,
      shipping_address_collection: { allowed_countries: ['US'] },
      automatic_tax: { enabled: false },
      return_url: returnUrl,
      metadata: {
        // Stripe metadata caps at 500 chars per value, so we stash the line
        // items in a separate Stripe Customer object? No — for small carts
        // this fits. For bigger carts the webhook re-resolves via DB.
        fulfillment: JSON.stringify(fulfillment).slice(0, 480),
      },
    });

    return json(200, {
      client_secret: session.client_secret,
      session_id:    session.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { error: 'Stripe error: ' + msg });
  }
});
