// stripe-webhook — handles checkout.session.completed and creates the
// matching Printful order. Writes a row to gift_orders for every paid
// session so the admin can see what's been fulfilled.
//
// Setup:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
//   supabase secrets set PRINTFUL_API_KEY=xxx
//   supabase secrets set PRINTFUL_STORE_ID=12345
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
//   Stripe dashboard → Developers → Webhooks → Add endpoint
//     URL:    https://<project>.functions.supabase.co/stripe-webhook
//     Event:  checkout.session.completed
//     Copy the signing secret into STRIPE_WEBHOOK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const STRIPE_SECRET_KEY       = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const STRIPE_WEBHOOK_SECRET   = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const PRINTFUL_API_KEY        = Deno.env.get('PRINTFUL_API_KEY') ?? '';
const PRINTFUL_STORE_ID       = Deno.env.get('PRINTFUL_STORE_ID') ?? '';
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
const supa   = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface FulfillmentLine {
  item_id: string;
  printful_variant_id: string;
  qty: number;
  unit_price_cents?: number;
  title?: string | null;
}

async function createPrintfulOrder(
  session: Stripe.Checkout.Session,
  lines: FulfillmentLine[],
): Promise<{ id: string } | { error: string }> {
  if (!PRINTFUL_API_KEY) return { error: 'PRINTFUL_API_KEY not set.' };
  const shipping = session.shipping_details;
  const address  = shipping?.address;
  if (!shipping?.name || !address) return { error: 'Missing shipping address on Stripe session.' };

  const body = {
    external_id: session.id,
    shipping: 'STANDARD',
    recipient: {
      name:     shipping.name,
      address1: address.line1,
      address2: address.line2 ?? undefined,
      city:     address.city,
      state_code: address.state,
      zip:      address.postal_code,
      country_code: address.country,
      email:    session.customer_details?.email ?? undefined,
    },
    items: lines.map((l) => ({
      sync_variant_id: Number(l.printful_variant_id) || l.printful_variant_id,
      quantity: l.qty,
    })),
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization:  'Bearer ' + PRINTFUL_API_KEY,
  };
  if (PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = PRINTFUL_STORE_ID;

  const res = await fetch('https://api.printful.com/orders?confirm=true', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { error: `Printful HTTP ${res.status}: ${text.slice(0, 300)}` };
  try {
    const data = JSON.parse(text);
    return { id: String(data?.result?.id ?? '') };
  } catch {
    return { error: 'Printful returned non-JSON: ' + text.slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST')        return new Response('POST only', { status: 405 });
  if (!STRIPE_WEBHOOK_SECRET)       return new Response('Webhook secret not set', { status: 500 });

  const rawBody  = await req.text();
  const sigHeader = req.headers.get('Stripe-Signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response('Invalid signature: ' + msg, { status: 401 });
  }

  if (event.type !== 'checkout.session.completed') {
    // Ack any other event types so Stripe doesn't keep retrying.
    return new Response('Ignored ' + event.type, { status: 200 });
  }

  // Re-fetch the session expanded so we have line_items + shipping.
  const sessionLite = event.data.object as Stripe.Checkout.Session;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionLite.id, {
      expand: ['line_items', 'shipping_details', 'customer_details'],
    });
  } catch (err) {
    return new Response('Could not retrieve session: ' + (err as Error).message, { status: 500 });
  }

  let lines: FulfillmentLine[] = [];
  try {
    lines = JSON.parse(String(session.metadata?.fulfillment || '[]'));
  } catch { /* fall through; will error below */ }
  if (!lines.length) {
    return new Response('Session metadata missing fulfillment lines.', { status: 400 });
  }

  // Insert pending order row first so we always have a record even if
  // Printful fails. Upsert keyed on stripe_session_id to make this safe to
  // re-run (Stripe will retry until 2xx).
  const orderRow = {
    stripe_session_id:     session.id,
    stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    status:                'paid',
    amount_cents:          session.amount_total ?? null,
    currency:              session.currency ?? null,
    customer_email:        session.customer_details?.email ?? null,
    shipping:              session.shipping_details ?? null,
    line_items:            lines,
  };
  const { error: upsertError } = await supa
    .from('gift_orders')
    .upsert(orderRow, { onConflict: 'stripe_session_id' });
  if (upsertError) {
    return new Response('DB upsert failed: ' + upsertError.message, { status: 500 });
  }

  const pf = await createPrintfulOrder(session, lines);
  if ('error' in pf) {
    await supa.from('gift_orders')
      .update({ status: 'paid', printful_error: pf.error, updated_at: new Date().toISOString() })
      .eq('stripe_session_id', session.id);
    // Return 200 so Stripe doesn't retry forever — admin sees the error in gift_orders.
    return new Response('Printful failed (logged): ' + pf.error, { status: 200 });
  }

  await supa.from('gift_orders')
    .update({
      status: 'fulfilled',
      printful_order_id: pf.id,
      printful_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_session_id', session.id);

  return new Response('OK', { status: 200 });
});
