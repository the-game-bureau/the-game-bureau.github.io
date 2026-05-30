// lookup-gift-code — POST { session_id }
//
// Called by the buyer's browser when the modal has a Stripe session id
// but still needs the issued access code + recipient details. New
// checkouts pre-issue the access code at session creation, but this
// remains useful for older redirect/session flows and defensive polling.
//
// We don't authenticate the caller (the session_id is in the URL the
// buyer holds). The session_id itself is the secret here — guessable
// session ids are 1-in-quadrillion-ish so a scan attack isn't viable.
//
// Setup:
//   supabase functions deploy lookup-gift-code --no-verify-jwt

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST')    return json(405, { error: 'POST only' });

  let payload: { session_id?: string };
  try { payload = await req.json(); }
  catch { return json(400, { error: 'Invalid JSON.' }); }

  const sessionId = String(payload.session_id ?? '').trim();
  if (!sessionId) return json(400, { error: 'session_id required' });

  const { data: row, error } = await supa
    .from('gift_codes')
    .select('code,status,game_id,game_name,recipient_email,recipient_name,price_cents,currency')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  if (error)  return json(500, { error: 'Lookup failed: ' + error.message });
  if (!row)   return json(404, { error: 'Not found' });

  return json(200, row);
});
