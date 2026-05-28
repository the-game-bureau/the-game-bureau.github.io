// Legacy LemonSqueezy webhook. Live game purchases now use
// create-gift-checkout + stripe-webhook + redeem-gift-code.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WEBHOOK_SECRET = Deno.env.get('LEMON_WEBHOOK_SECRET') ?? '';

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!WEBHOOK_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex === signature;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('X-Signature') ?? '';

  if (!await verifySignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const eventName = String(meta.event_name ?? '');

  // Only process successful orders
  if (eventName !== 'order_created') {
    return new Response('Ignored', { status: 200 });
  }

  const customData = (meta.custom_data ?? {}) as Record<string, unknown>;
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const attrs = (data.attributes ?? {}) as Record<string, unknown>;

  const orderId = String(data.id ?? '');
  const status = String(attrs.status ?? '');
  const checkoutKey = String(customData.checkout_key ?? '').trim();
  const gameId = String(customData.game_id ?? '').trim();
  const playerId = String(customData.player_id ?? '').trim();
  const email = String(attrs.user_email ?? '').trim();

  if (!checkoutKey || status !== 'paid') {
    return new Response('Skipped', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const { error } = await supabase.from('purchases').upsert(
    { order_id: orderId, game_id: gameId, player_id: playerId, checkout_key: checkoutKey, email, status: 'paid' },
    { onConflict: 'order_id' }
  );

  if (error) {
    console.error('DB insert error:', error.message);
    return new Response('DB error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
