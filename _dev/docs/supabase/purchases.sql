-- purchases — records a confirmed LemonSqueezy payment
--
-- Written by the lemon-webhook Edge Function (service role only).
-- Read by the game client (anon key) to verify a checkout_key before unlocking.
--
-- Run in Supabase SQL editor, then deploy the lemon-webhook function and set:
--   LEMON_WEBHOOK_SECRET = <your LemonSqueezy webhook signing secret>
-- in the function's environment variables (Supabase dashboard → Edge Functions → lemon-webhook → Secrets).

CREATE TABLE IF NOT EXISTS purchases (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id     text        UNIQUE NOT NULL,
  game_id      text,
  player_id    text,
  checkout_key text        NOT NULL,
  email        text,
  status       text        DEFAULT 'paid',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Game client (anon key) can read to verify a checkout_key
CREATE POLICY "Public can read purchases"
  ON purchases FOR SELECT
  USING (true);

-- Only the service role (webhook function) can insert/update — no anon INSERT policy
