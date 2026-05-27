// swap-gift-game — POST { code, new_game_id }
//
// Self-service game swap. The buyer purchased Game A and decided they
// want Game B instead. As long as the code hasn't been redeemed yet,
// we update the row's game_id (and denormalized game_name) so the same
// code now unlocks the new game.
//
// Policy:
//   • Allowed when status='paid' AND redemption_count = 0
//   • Refused once the code has been used on any device, refunded, or
//     is still 'pending' (Stripe hasn't confirmed payment)
//   • Refused if the new game is archived or doesn't exist
//
// Authorization: holding the code itself is treated as proof. The
// buyer got it in the post-purchase modal and the receipt email.
//
// Setup:
//   supabase functions deploy swap-gift-game --no-verify-jwt

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
  const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.startsWith('TGB')) return '';
  const rest = raw.slice(3);
  if (rest.length !== 8) return '';
  return 'TGB-' + rest.slice(0, 4) + '-' + rest.slice(4, 8);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { ok: false, reason: 'method_not_allowed' });

  let payload: { code?: string; new_game_id?: string };
  try { payload = await req.json(); }
  catch { return json(400, { ok: false, reason: 'invalid_json' }); }

  const code      = normalizeCode(payload.code);
  const newGameId = String(payload.new_game_id ?? '').trim();
  if (!code)      return json(400, { ok: false, reason: 'invalid_code_format' });
  if (!newGameId) return json(400, { ok: false, reason: 'new_game_id_required' });

  const { data: row, error: lookupError } = await supa
    .from('gift_codes')
    .select('id,game_id,game_name,status,redemption_count,swap_count')
    .eq('code', code)
    .maybeSingle();
  if (lookupError) return json(500, { ok: false, reason: 'lookup_failed', message: lookupError.message });
  if (!row)        return json(404, { ok: false, reason: 'code_not_found' });

  if (row.status === 'pending') {
    return json(409, { ok: false, reason: 'not_paid', message: 'Payment is still processing — try again in a moment.' });
  }
  if (row.status === 'refunded' || row.status === 'failed') {
    return json(409, { ok: false, reason: 'not_payable', message: 'This code is no longer redeemable.' });
  }
  if ((Number(row.redemption_count) || 0) > 0 || row.status === 'redeemed') {
    return json(409, { ok: false, reason: 'already_used', message: 'This code has already been used. Swap is only available before the first play.' });
  }

  if (row.game_id === newGameId) {
    // No-op; respond OK so the client UI can move on.
    return json(200, { ok: true, game_id: newGameId, game_name: row.game_name, unchanged: true });
  }

  const { data: game, error: gameError } = await supa
    .from('games')
    .select('id,name,price,archived')
    .eq('id', newGameId)
    .maybeSingle();
  if (gameError) return json(500, { ok: false, reason: 'game_lookup_failed', message: gameError.message });
  if (!game)     return json(404, { ok: false, reason: 'game_not_found' });

  const archived = String(game.archived ?? '').trim().toUpperCase();
  if (archived === 'YES') {
    return json(409, { ok: false, reason: 'game_archived', message: 'That game is no longer available.' });
  }

  const now = new Date().toISOString();
  const nextSwapCount = (Number(row.swap_count) || 0) + 1;

  const { error: updateError } = await supa
    .from('gift_codes')
    .update({
      game_id:         newGameId,
      game_name:       game.name,
      swap_count:      nextSwapCount,
      last_swapped_at: now,
      updated_at:      now,
    })
    .eq('id', row.id);
  if (updateError) return json(500, { ok: false, reason: 'update_failed', message: updateError.message });

  return json(200, {
    ok: true,
    game_id:    newGameId,
    game_name:  game.name,
    price:      game.price,
    swap_count: nextSwapCount,
  });
});
