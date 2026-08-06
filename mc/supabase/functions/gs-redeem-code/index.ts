// gs-redeem-code — POST { code, game_id }
//
// Validates that the access code exists and matches the game the player is
// trying to unlock. The first successful redemption transitions the row
// paid → redeemed. Subsequent redemptions of the same access code are also
// accepted (bearer-token policy) — the code unlocks the game on any
// device that presents it. Every redemption bumps redemption_count and
// updates last_redeemed_at so admins can spot heavy reuse passively
// (the public UI still behaves as if it's one-per-device).
//
// This trades strict one-shot semantics for fewer support calls: a
// player who clears localStorage or moves to a second device just
// re-enters their access code and continues.
//
// Setup:
//   supabase functions deploy gs-redeem-code --no-verify-jwt
//   (no-verify-jwt: this is called from an anonymous game-player browser)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

function normalizeCode(value: unknown): string {
  // Strip whitespace and uppercase. Accept with or without dashes, but
  // codes in the DB are stored as 'TGB-XXXX-XXXX' so we normalize input
  // by re-inserting dashes after the 3-char prefix and 4-char segment.
  const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith('TGB')) return '';
  const rest = raw.slice(3);
  if (rest.length !== 8) return '';
  return 'TGB-' + rest.slice(0, 4) + '-' + rest.slice(4, 8);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { ok: false, reason: 'method_not_allowed' });

  let payload: { code?: string; game_id?: string };
  try { payload = await req.json(); }
  catch { return json(400, { ok: false, reason: 'invalid_json' }); }

  const code   = normalizeCode(payload.code);
  const gameId = String(payload.game_id ?? '').trim();
  if (!code)   return json(400, { ok: false, reason: 'invalid_code_format' });
  if (!gameId) return json(400, { ok: false, reason: 'game_id_required' });

  const { data: row, error: lookupError } = await supa
    .from('gift_codes')
    .select('id,game_id,status,redeemed_at,redemption_count')
    .eq('code', code)
    .maybeSingle();
  if (lookupError) return json(500, { ok: false, reason: 'lookup_failed', message: lookupError.message });
  if (!row)        return json(404, { ok: false, reason: 'code_not_found' });

  if (row.game_id !== gameId) {
    // Don't leak which game it's for — just say it doesn't apply here.
    return json(409, { ok: false, reason: 'wrong_game' });
  }

  // Codes only become usable once Stripe has confirmed payment.
  // Refunded / failed codes don't unlock; everything else is fair game.
  if (row.status === 'pending') {
    return json(409, { ok: false, reason: 'code_not_payable', status: row.status });
  }
  if (row.status === 'refunded' || row.status === 'failed') {
    return json(409, { ok: false, reason: 'code_not_payable', status: row.status });
  }

  // Bearer-token policy: the code unlocks the game on any device that
  // presents it. We log every redemption attempt (redemption_count +
  // last_redeemed_at) so the admin can spot heavy reuse, but we don't
  // reject — clearing localStorage / using a second device shouldn't
  // generate a support call.
  const now           = new Date().toISOString();
  const previousCount = Number(row.redemption_count) || 0;
  const nextCount     = previousCount + 1;
  const isFirstRedeem = row.status === 'paid';

  const patch: Record<string, unknown> = {
    redemption_count: nextCount,
    last_redeemed_at: now,
    updated_at:       now,
  };
  if (isFirstRedeem) {
    patch.status      = 'redeemed';
    patch.redeemed_at = now;
  }

  const { error: updateError } = await supa
    .from('gift_codes')
    .update(patch)
    .eq('id', row.id);
  if (updateError) return json(500, { ok: false, reason: 'update_failed', message: updateError.message });

  return json(200, {
    ok: true,
    game_id: gameId,
    redemption_count: nextCount,
    first_redemption: isFirstRedeem,
  });
});
