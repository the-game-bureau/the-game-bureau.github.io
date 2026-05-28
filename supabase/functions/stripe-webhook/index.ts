// stripe-webhook — handles checkout.session.completed and routes to
// either:
//   metadata.tgb_kind === 'gift_card' → gift_codes (mark the user-facing
//     access code paid, see create-gift-checkout).
//   otherwise (legacy gift-shop POD path) → gift_orders (Printful order).
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
const RESEND_API_KEY          = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM             = Deno.env.get('RESEND_FROM') ?? 'The Game Bureau <gifts@thegamebureau.com>';
const SITE_ORIGIN             = Deno.env.get('SITE_ORIGIN') ?? 'https://thegamebureau.com';

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

  // ── Route on metadata.tgb_kind ──────────────────────────────────────
  if (session.metadata?.tgb_kind === 'gift_card') {
    return await handleGiftCard(session);
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

// ── Access-code handler ──────────────────────────────────────────────────
// The user-facing access code is generated up-front by create-gift-checkout and
// stored on the row at insert time. The webhook's job is to:
//   1. Transition status pending → paid
//   2. Capture Stripe receipt info (charge id, receipt URL, buyer email)
//   3. Email the recipient (if recipient_email was provided up-front)
//   4. Email the buyer their copy of the access code
// Idempotent: replay on an already-paid/redeemed session is a no-op.
async function handleGiftCard(session: Stripe.Checkout.Session): Promise<Response> {
  const { data: existing, error: lookupError } = await supa
    .from('gift_codes')
    .select('id,code,status,game_id,game_name,recipient_email,recipient_name,buyer_name,buyer_email,message,price_cents,currency')
    .eq('stripe_session_id', session.id)
    .maybeSingle();
  if (lookupError) {
    return new Response('DB lookup failed: ' + lookupError.message, { status: 500 });
  }
  if (!existing) {
    return new Response('No matching gift_codes row for session ' + session.id, { status: 404 });
  }
  if (existing.status === 'paid' || existing.status === 'redeemed') {
    return new Response('Already processed', { status: 200 });
  }
  if (!existing.code) {
    // Defensive: shouldn't happen with the new create-gift-checkout, but
    // mirrors the legacy generate-here behavior so an older row still
    // resolves.
    return new Response('Row is missing an access code — please contact support.', { status: 500 });
  }

  // Pull Stripe receipt info so admins can cross-reference in the
  // dashboard. We expand latest_charge to get the hosted receipt URL.
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  let stripeChargeId: string | null = null;
  let stripeReceiptUrl: string | null = null;
  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge && typeof pi.latest_charge !== 'string'
        ? pi.latest_charge
        : null;
      stripeChargeId   = charge?.id ?? null;
      stripeReceiptUrl = charge?.receipt_url ?? null;
    } catch (_) { /* not fatal — webhook still completes */ }
  }
  const stripeCustomerEmail = session.customer_details?.email ?? null;

  const { error: updateError } = await supa
    .from('gift_codes')
    .update({
      status:                'paid',
      stripe_payment_intent: paymentIntentId,
      stripe_charge_id:      stripeChargeId,
      stripe_receipt_url:    stripeReceiptUrl,
      stripe_customer_email: stripeCustomerEmail,
      updated_at:            new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('status', 'pending');
  if (updateError) {
    return new Response('Update failed: ' + updateError.message, { status: 500 });
  }

  // Email the recipient (only if they were provided at create-time —
  // the unified flow now collects recipient post-purchase via
  // send-gift-code, so most webhook firings skip this).
  if (existing.recipient_email) {
    await sendGiftEmail({ ...existing, code: existing.code });
  }

  // Email the buyer their own copy of the access code. Prefer the email the
  // buyer typed into the modal; fall back to the address Stripe
  // collected for the receipt.
  const buyerAddress = existing.buyer_email || stripeCustomerEmail || null;
  if (buyerAddress) {
    await sendBuyerEmail({ ...existing, code: existing.code }, buyerAddress);
  }

  return new Response('OK', { status: 200 });
}

interface GiftEmailRow {
  id: string;
  code: string;
  game_id: string;
  game_name: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  message: string | null;
  price_cents: number | null;
  currency: string | null;
}

async function sendGiftEmail(row: GiftEmailRow): Promise<void> {
  if (!row.recipient_email) {
    await markEmail(row.id, 'skipped', 'No recipient_email on row.');
    return;
  }
  if (!RESEND_API_KEY) {
    await markEmail(row.id, 'skipped', 'RESEND_API_KEY not set.');
    return;
  }

  const subject = (row.buyer_name ? `${row.buyer_name} sent you ` : 'You’ve received ')
    + 'a game from The Game Bureau';
  const html = renderGiftEmailHtml(row);
  const text = renderGiftEmailText(row);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   'Bearer ' + RESEND_API_KEY,
      },
      body: JSON.stringify({
        from:     RESEND_FROM,
        to:       [row.recipient_email],
        reply_to: row.buyer_email || undefined,
        subject,
        html,
        text,
      }),
    });
    if (!response.ok) {
      const errText = (await response.text()).slice(0, 500);
      await markEmail(row.id, 'failed', `Resend HTTP ${response.status}: ${errText}`);
      return;
    }
    await markEmail(row.id, 'sent', null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markEmail(row.id, 'failed', msg.slice(0, 500));
  }
}

async function markEmail(id: string, status: string, error: string | null): Promise<void> {
  await supa
    .from('gift_codes')
    .update({
      email_status:  status,
      email_error:   error,
      email_sent_at: status === 'sent' ? new Date().toISOString() : null,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', id);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function siteOrigin(): string {
  return (SITE_ORIGIN || 'https://thegamebureau.com').replace(/\/$/, '');
}

function gameUrl(gameId: string, code = ''): string {
  const url = new URL(siteOrigin() + '/game/run/');
  url.searchParams.set('id', gameId);
  if (code) {
    url.searchParams.set('access_code', code);
    url.searchParams.set('auto_redeem', '1');
  }
  return url.toString();
}

function renderGiftEmailHtml(row: GiftEmailRow): string {
  const greeting   = row.recipient_name ? `Hi ${escapeHtml(row.recipient_name)},` : 'Hi there,';
  const fromLine   = row.buyer_name ? `from <strong>${escapeHtml(row.buyer_name)}</strong>` : 'for you';
  const gameName   = escapeHtml(row.game_name || 'a Game Bureau game');
  const code       = escapeHtml(row.code);
  const message    = row.message
    ? `<blockquote style="margin:18px 0;padding:14px 18px;border-left:3px solid #c23737;background:#fafafa;color:#444;font-style:italic;">${escapeHtml(row.message)}</blockquote>`
    : '';
  const playLink   = gameUrl(row.game_id, row.code);

  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1f2937;background:#f3eee6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e1d8;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:24px 28px 4px;">
      <p style="margin:0;color:#2d4880;font-size:.78rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">The Game Bureau</p>
      <h1 style="margin:8px 0 0;color:#2d4880;font-size:1.6rem;line-height:1.2;">A game is waiting for you</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;color:#374151;font-size:1rem;line-height:1.55;">
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 12px;">You’ve received <strong>${gameName}</strong> ${fromLine} — a browser-based scavenger hunt written against real city streets.</p>
      ${message}
      <p style="margin:18px 0 8px;">Your access code:</p>
      <div style="display:inline-block;padding:14px 22px;background:#111827;color:#fff;border-radius:10px;font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:1.4rem;letter-spacing:.04em;font-weight:600;">${code}</div>
      <p style="margin:18px 0 12px;font-size:.95rem;color:#555;">Open the game in your browser, tap <em>Start</em>, and when the in-game payment screen appears, enter this access code. The game unlocks immediately.</p>
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(playLink)}" style="display:inline-block;padding:12px 18px;background:#2d4880;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;letter-spacing:.04em;">Open the game →</a>
      </p>
    </td></tr>
    <tr><td style="padding:14px 28px 24px;color:#6b7280;font-size:.82rem;line-height:1.5;border-top:1px solid #f1ece2;">
      One phone, no app, no install. Play any day of the year.<br>
      Questions? Reply to this email.
    </td></tr>
  </table>
</body></html>`;
}

function renderGiftEmailText(row: GiftEmailRow): string {
  const lines = [
    row.recipient_name ? `Hi ${row.recipient_name},` : 'Hi there,',
    '',
    `You’ve received ${row.game_name || 'a Game Bureau game'}` +
      (row.buyer_name ? ` from ${row.buyer_name}` : '') +
      ' — a browser-based scavenger hunt written against real city streets.',
  ];
  if (row.message) {
    lines.push('', '  ' + row.message);
  }
  lines.push(
    '',
    `Your access code: ${row.code}`,
    '',
    'Open the game, tap Start, and enter this access code when prompted.',
    '',
    `Play: ${gameUrl(row.game_id, row.code)}`,
    '',
    '— The Game Bureau',
  );
  return lines.join('\n');
}

// ── Buyer-receipt email (separate from the gift-to-recipient email) ────
// Sent after payment so the buyer has their access code on file. They can use
// it themselves OR share it with someone via the "Send to someone"
// step in the modal (which also fires send-gift-code → recipient
// email). This makes the system survivable if the buyer loses the
// modal before grabbing the access code.
async function sendBuyerEmail(row: GiftEmailRow, buyerAddress: string): Promise<void> {
  if (!RESEND_API_KEY) return;
  const gameName = row.game_name || 'a Game Bureau game';
  const code     = row.code || '';
  if (!code) return;
  const playLink = gameUrl(row.game_id, code);
  const swapLink = siteOrigin() + '/gifts/?swap=' + encodeURIComponent(code);
  const subject  = 'Your access code for ' + gameName;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1f2937;background:#f3eee6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e1d8;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:24px 28px 4px;">
      <p style="margin:0;color:#2d4880;font-size:.78rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;">The Game Bureau</p>
      <h1 style="margin:8px 0 0;color:#2d4880;font-size:1.6rem;line-height:1.2;">Thanks — your access code is ready</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;color:#374151;font-size:1rem;line-height:1.55;">
      <p style="margin:0 0 12px;">Thanks for buying <strong>${escapeHtml(gameName)}</strong>. Here's your access code:</p>
      <div style="display:inline-block;padding:14px 22px;background:#111827;color:#fff;border-radius:10px;font-family:'IBM Plex Mono',Menlo,Consolas,monospace;font-size:1.4rem;letter-spacing:.04em;font-weight:600;">${escapeHtml(code)}</div>
      <p style="margin:18px 0 12px;font-size:.95rem;color:#555;">When you're ready to play, open the game in your browser, tap <em>Start</em>, and enter this access code when prompted. Or send it to someone as a gift.</p>
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(playLink)}" style="display:inline-block;padding:12px 18px;background:#2d4880;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;letter-spacing:.04em;">Open the game →</a>
      </p>
      <p style="margin:20px 0 0;font-size:.88rem;color:#777;">
        Wrong game? <a href="${escapeHtml(swapLink)}" style="color:#2d4880;text-decoration:underline;">Swap to a different one</a> (before you play it).
      </p>
    </td></tr>
    <tr><td style="padding:14px 28px 24px;color:#6b7280;font-size:.82rem;line-height:1.5;border-top:1px solid #f1ece2;">
      Keep this email — it's your receipt and your replacement copy if you ever lose the access code.<br>
      Questions? Reply to this email.
    </td></tr>
  </table>
</body></html>`;
  const text = [
    'Thanks for buying ' + gameName + '.',
    '',
    'Your access code: ' + code,
    '',
    'Open the game, tap Start, and enter this access code when prompted.',
    '',
    'Play: ' + playLink,
    '',
    'Wrong game? Swap to a different one (before you play it):',
    swapLink,
    '',
    'Keep this email — it is your receipt and replacement copy.',
    '',
    '— The Game Bureau',
  ].join('\n');

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   'Bearer ' + RESEND_API_KEY,
      },
      body: JSON.stringify({
        from:    RESEND_FROM,
        to:      [buyerAddress],
        subject,
        html,
        text,
      }),
    });
    // We don't update email_status here — that column is for the
    // recipient gift email, not the buyer receipt. A delivery failure
    // would only show in Resend's dashboard.
  } catch (_) { /* swallow — buyer can still see the access code in the modal */ }
}
