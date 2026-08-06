// gs-send-code — POST { session_id, recipient_email,
//                          recipient_name?, message? }
//
// Post-purchase action. The buyer paid with no recipient up-front (the
// unified "buy this game" flow), then clicked "Send to someone" on the
// success modal. This endpoint updates the gift_codes row with the
// recipient details and emails the access code via Resend.
//
// Authorization: holding the Stripe session_id is treated as proof the
// caller is the buyer (the id is delivered to their browser via the
// return URL and is hard to guess). No login required.
//
// Setup:
//   supabase functions deploy gs-send-code --no-verify-jwt
//   (RESEND_API_KEY + RESEND_FROM + SITE_ORIGIN must be set — same
//    secrets the webhook uses.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM      = Deno.env.get('RESEND_FROM') ?? 'The Game Bureau <gifts@thegamebureau.com>';
const SITE_ORIGIN      = Deno.env.get('SITE_ORIGIN') ?? 'https://thegamebureau.com';

const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

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

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
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

interface GiftRow {
  id: string;
  code: string | null;
  game_id: string;
  game_name: string | null;
  status: string;
  email_status: string | null;
  recipient_email: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
}

async function waitForPaidGiftRow(sessionId: string): Promise<{ row: GiftRow | null; error: string | null }> {
  let lastRow: GiftRow | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row, error } = await supa
      .from('gift_codes')
      .select('id,code,game_id,game_name,status,email_status,recipient_email,buyer_email,buyer_name')
      .eq('stripe_session_id', sessionId)
      .maybeSingle<GiftRow>();
    if (error) return { row: null, error: 'Lookup failed: ' + error.message };
    if (!row) return { row: null, error: 'No purchase found for that session.' };
    lastRow = row;
    if (row.code && row.status === 'paid') return { row, error: null };
    if (row.status !== 'pending') break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { row: lastRow, error: null };
}

function renderHtml(row: GiftRow, message: string, recipientName: string): string {
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const fromLine = row.buyer_name ? `from <strong>${escapeHtml(row.buyer_name)}</strong>` : 'for you';
  const gameName = escapeHtml(row.game_name || 'a Game Bureau game');
  const code     = escapeHtml(row.code || '');
  const msgBlock = message
    ? `<blockquote style="margin:18px 0;padding:14px 18px;border-left:3px solid #c23737;background:#fafafa;color:#444;font-style:italic;">${escapeHtml(message)}</blockquote>`
    : '';
  const playLink = gameUrl(row.game_id, row.code || '');
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
      ${msgBlock}
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

function renderText(row: GiftRow, message: string, recipientName: string): string {
  const lines = [
    recipientName ? `Hi ${recipientName},` : 'Hi there,',
    '',
    `You’ve received ${row.game_name || 'a Game Bureau game'}` +
      (row.buyer_name ? ` from ${row.buyer_name}` : '') +
      ' — a browser-based scavenger hunt written against real city streets.',
  ];
  if (message) lines.push('', '  ' + message);
  lines.push(
    '',
    `Your access code: ${row.code || ''}`,
    '',
    'Open the game, tap Start, and enter this access code when prompted.',
    '',
    `Play: ${gameUrl(row.game_id, row.code || '')}`,
    '',
    '— The Game Bureau',
  );
  return lines.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { ok: false, error: 'POST only' });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); }
  catch { return json(400, { ok: false, error: 'Invalid JSON.' }); }

  const sessionId       = clean(payload.session_id, 200);
  const recipientEmail  = clean(payload.recipient_email, 320);
  const recipientName   = clean(payload.recipient_name, 200);
  const message         = clean(payload.message, 1000);

  if (!sessionId)      return json(400, { ok: false, error: 'session_id is required.' });
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return json(400, { ok: false, error: 'A valid recipient_email is required.' });
  }

  const ready = await waitForPaidGiftRow(sessionId);
  if (ready.error) return json(ready.error.startsWith('No purchase') ? 404 : 500, { ok: false, error: ready.error });
  const row = ready.row;
  if (!row)        return json(404, { ok: false, error: 'No purchase found for that session.' });
  if (!row.code || row.status !== 'paid') {
    return json(409, { ok: false, error: 'Access code is not ready yet or has already been redeemed.' });
  }
  if (row.email_status === 'sent') {
    return json(409, { ok: false, error: 'A gift email was already sent for this purchase.' });
  }

  // Update row with the freshly-supplied recipient details. We don't
  // overwrite if the buyer already provided them at create-checkout.
  await supa
    .from('gift_codes')
    .update({
      recipient_email: recipientEmail,
      recipient_name:  recipientName || row.buyer_name || null,
      message:         message || null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', row.id);

  if (!RESEND_API_KEY) {
    await supa
      .from('gift_codes')
      .update({
        email_status:  'skipped',
        email_error:   'RESEND_API_KEY not set.',
        updated_at:    new Date().toISOString(),
      })
      .eq('id', row.id);
    return json(500, { ok: false, error: 'Email service is not configured.' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   'Bearer ' + RESEND_API_KEY,
      },
      body: JSON.stringify({
        from:     RESEND_FROM,
        to:       [recipientEmail],
        reply_to: row.buyer_email || undefined,
        subject:  (row.buyer_name ? `${row.buyer_name} sent you ` : 'You’ve received ')
                  + 'a game from The Game Bureau',
        html:     renderHtml({ ...row, recipient_email: recipientEmail }, message, recipientName),
        text:     renderText({ ...row, recipient_email: recipientEmail }, message, recipientName),
      }),
    });
    if (!response.ok) {
      const errText = (await response.text()).slice(0, 500);
      await supa
        .from('gift_codes')
        .update({
          email_status: 'failed',
          email_error:  `Resend HTTP ${response.status}: ${errText}`,
          updated_at:   new Date().toISOString(),
        })
        .eq('id', row.id);
      return json(502, { ok: false, error: 'Email service rejected the message.' });
    }
    await supa
      .from('gift_codes')
      .update({
        email_status:  'sent',
        email_error:   null,
        email_sent_at: new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      })
      .eq('id', row.id);
    return json(200, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supa
      .from('gift_codes')
      .update({
        email_status: 'failed',
        email_error:  msg.slice(0, 500),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', row.id);
    return json(500, { ok: false, error: 'Network error sending email.' });
  }
});
