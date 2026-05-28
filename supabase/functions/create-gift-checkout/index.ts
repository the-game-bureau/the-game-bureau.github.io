// create-gift-checkout — POST { game_id, recipient_email?, recipient_name?,
//                                buyer_email?, buyer_name?, message? }
//
// Looks up the game in public.games (service role, so the price is
// authoritative server-side), creates a Stripe Embedded Checkout session
// priced at the game's price, and inserts a 'pending' gift_codes row.
// The matching webhook marks the access code paid after Stripe confirms.
//
// recipient_email is OPTIONAL — the unified flow lets the buyer purchase
// first and decide post-payment whether to play it themselves or send to
// someone (handled by send-gift-code Edge Function). If recipient_email
// IS supplied here, the webhook emails the access code immediately on payment.
//
// Setup:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
//   supabase secrets set SITE_ORIGIN=https://thegamebureau.com
//   supabase functions deploy create-gift-checkout --no-verify-jwt
//   (no-verify-jwt because anon shoppers shouldn't need a Supabase session)

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

// Parse the display price (e.g. "$15", "$15.50", "15") into cents.
// Fallback only: explicit games.price_cents is preferred when present.
function displayPriceToCents(displayPrice: unknown): number {
  if (displayPrice == null) return 0;
  const trimmed = String(displayPrice).trim();
  if (!trimmed || /^free$/i.test(trimmed)) return 0;
  // Strip everything except digits and decimal point.
  const numeric = trimmed.replace(/[^0-9.]/g, '');
  if (!numeric) return 0;
  const dollars = parseFloat(numeric);
  if (!Number.isFinite(dollars) || dollars <= 0) return 0;
  return Math.round(dollars * 100);
}

function gamePriceCents(game: Record<string, unknown>): number {
  const explicit = Number(game.price_cents);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  return displayPriceToCents(game.price);
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });
  if (!STRIPE_SECRET_KEY)       return json(500, { error: 'STRIPE_SECRET_KEY not set.' });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json(400, { error: 'Invalid JSON.' }); }

  const gameId         = clean(payload.game_id, 200);
  const recipientEmail = clean(payload.recipient_email, 320);
  const recipientName  = clean(payload.recipient_name, 200);
  const buyerEmail     = clean(payload.buyer_email, 320);
  const buyerName      = clean(payload.buyer_name, 200);
  const message        = clean(payload.message, 1000);

  if (!gameId) return json(400, { error: 'game_id is required.' });
  // recipient_email is optional in the unified flow. If provided, it
  // must look like an email so the webhook can deliver successfully.
  if (recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return json(400, { error: 'recipient_email is not a valid email.' });
  }

  let { data: game, error } = await supa
    .from('games')
    .select('id,name,price,price_cents,currency,archived')
    .eq('id', gameId)
    .maybeSingle();
  if (error && /price_cents|currency|schema cache|column/i.test(error.message || '')) {
    const fallback = await supa
      .from('games')
      .select('id,name,price,archived')
      .eq('id', gameId)
      .maybeSingle();
    game = fallback.data;
    error = fallback.error;
  }
  if (error)            return json(500, { error: 'Game lookup failed: ' + error.message });
  if (!game)            return json(404, { error: 'Game not found.' });
  if (String(game.archived ?? '').trim().toUpperCase() === 'YES') {
    return json(400, { error: 'This game is archived and cannot be purchased.' });
  }

  const priceCents = gamePriceCents(game);
  if (!priceCents)      return json(400, { error: 'This game is free or has no purchasable price.' });
  const currency = clean(game.currency || 'usd', 10).toLowerCase() || 'usd';

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      // Keep the buyer inside the TgbGift modal after payment so they
      // stay on the page they came from (game engine, landing card,
      // gift shop). The modal fires onComplete and shows the code.
      // Stripe disallows return_url when redirect_on_completion: 'never'.
      redirect_on_completion: 'never',
      automatic_tax: { enabled: false },
      customer_email: buyerEmail || undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency,
          unit_amount: priceCents,
          product_data: {
            name: 'Game access: ' + (game.name || 'The Game Bureau game'),
            description: recipientName
              ? `For ${recipientName} (${recipientEmail})`
              : (recipientEmail ? `For ${recipientEmail}` : 'Access code delivered after payment'),
          },
        },
      }],
      metadata: {
        // Routes the webhook to the access-code branch (vs POD branch).
        tgb_kind:        'gift_card',
        purchase_kind:   'game_access',
        game_id:         gameId,
        game_name:       clean(game.name, 200),
        recipient_email: recipientEmail,
        recipient_name:  recipientName.slice(0, 200),
        buyer_email:     buyerEmail.slice(0, 200),
        buyer_name:      buyerName.slice(0, 200),
        // Stripe caps metadata values at 500 chars; trim message hard.
        message:         message.slice(0, 480),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { error: 'Stripe error: ' + msg });
  }

  // Generate the user-facing access code up-front and insert the pending row
  // already populated with it. This lets the modal show the code as
  // soon as Stripe's onComplete fires — no polling for the webhook to
  // catch up. The webhook still transitions pending → paid and adds
  // charge metadata, but the access code itself never changes.
  //
  // redeem-gift-code refuses to unlock anything with status='pending',
  // so a buyer who has the access code but never paid can't use it.
  let issuedCode = '';
  let insertError: { message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateGiftCode();
    const { error } = await supa.from('gift_codes').insert({
      code:              candidate,
      game_id:           gameId,
      game_name:         game.name,
      price_cents:       priceCents,
      currency,
      buyer_email:       buyerEmail || null,
      buyer_name:        buyerName  || null,
      recipient_email:   recipientEmail || null,
      recipient_name:    recipientName || null,
      message:           message || null,
      stripe_session_id: session.id,
      status:            'pending',
    });
    if (!error) {
      issuedCode = candidate;
      insertError = null;
      break;
    }
    insertError = { message: error.message };
    // 23505 = unique_violation. Could be on code (retry) or on
    // stripe_session_id (caller retried). For session_id collisions,
    // bail — that's a real client bug.
    const msg = String(error.message || '');
    if (msg.includes('stripe_session_id')) break;
    if (!msg.includes('duplicate')) break;
  }
  if (insertError || !issuedCode) {
    return json(500, { error: 'DB insert failed: ' + (insertError?.message || 'unknown') });
  }

  return json(200, {
    client_secret: session.client_secret,
    session_id:    session.id,
    code:          issuedCode,
    amount_cents:  priceCents,
    currency,
    game_name:     game.name || null,
  });
});

function generateGiftCode(): string {
  // Avoid visually ambiguous characters (no 0/O, 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let body = '';
  for (let i = 0; i < buf.length; i++) {
    body += alphabet[buf[i] % alphabet.length];
    if (i === 3) body += '-';
  }
  return 'TGB-' + body;
}
