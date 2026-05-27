-- gift-codes — Stripe-backed gift cards that unlock a specific game.
--
-- Buyer flow:
--   1. Buyer clicks "Gift this game" on /game/run/?id=X
--   2. create-gift-checkout Edge Function creates Stripe Embedded Checkout
--      + inserts a 'pending' row keyed on stripe_session_id (no code yet).
--   3. Buyer pays. stripe-webhook fires checkout.session.completed.
--   4. Webhook generates the user-facing code (TGB-XXXX-XXXX), updates the
--      row to status='paid', returns the code in the success page payload.
--
-- Redemption flow:
--   1. Player enters code in the existing payment-overlay "Have a code?"
--      field on the text/map game engines.
--   2. redeem-gift-code Edge Function verifies code + game_id match and the
--      row is still status='paid'. On success it sets status='redeemed' and
--      returns ok=true. Engine writes to localStorage so a refresh skips re-redemption.
--
-- Service role is the only writer. The webhook + Edge Functions use the
-- service role; the public anon role gets nothing. Redemption goes through
-- the Edge Function specifically so anon can't scan codes by guessing.

CREATE TABLE IF NOT EXISTS public.gift_codes (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code                    text        UNIQUE,                    -- nullable until the webhook fills it in on payment
  game_id                 text        NOT NULL,
  game_name               text,                                  -- denormalized for /mc/ admin display
  price_cents             integer     NOT NULL,
  currency                text        NOT NULL DEFAULT 'usd',
  buyer_email             text,
  buyer_name              text,
  recipient_email         text,
  recipient_name          text,
  message                 text,
  stripe_session_id       text        UNIQUE NOT NULL,
  stripe_payment_intent   text,
  status                  text        NOT NULL DEFAULT 'pending', -- pending | paid | redeemed | failed | refunded
  redeemed_at             timestamptz,
  email_status            text,                                   -- null | sent | failed | skipped
  email_error             text,                                   -- failure detail if email_status='failed'
  email_sent_at           timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Email-tracking columns added in a follow-up; ADD COLUMN IF NOT EXISTS
-- keeps the migration safely re-runnable on existing installs.
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS email_status  text;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS email_error   text;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Stripe receipt info captured by the webhook so admins can cross-
-- reference a purchase against the Stripe dashboard without needing to
-- click through. stripe_charge_id is the underlying charge; receipt_url
-- is the hosted Stripe receipt page; customer_email is the address the
-- buyer entered in Stripe Checkout (may differ from buyer_email if the
-- buyer used a different email on the gift form).
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS stripe_charge_id    text;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS stripe_receipt_url  text;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS stripe_customer_email text;

-- Re-redemption tracking. We treat the code as a bearer token (any
-- device that has it can unlock), but log every redemption attempt so
-- we can spot codes being heavily reused (sharing, fraud, etc.). The
-- product UI behaves AS IF it's one-per-device — the loosened policy
-- is purely server-side so cleared localStorage / new devices don't
-- generate support calls.
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS last_redeemed_at timestamptz;

-- Self-service game-swap tracking. swap-gift-game increments swap_count
-- and updates last_swapped_at on every successful game change. Lets
-- the admin spot codes that have bounced between games a lot.
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS swap_count       integer NOT NULL DEFAULT 0;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS last_swapped_at  timestamptz;

CREATE INDEX IF NOT EXISTS gift_codes_code_idx        ON public.gift_codes (code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS gift_codes_status_idx      ON public.gift_codes (status);
CREATE INDEX IF NOT EXISTS gift_codes_game_idx        ON public.gift_codes (game_id);
CREATE INDEX IF NOT EXISTS gift_codes_created_at_idx  ON public.gift_codes (created_at DESC);

ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;

-- No anon access. Webhook + redeem function use the service role bypass.
-- Admin /mc/ view (future) can read via is_photo_admin() in a follow-up patch.
DROP POLICY IF EXISTS "Admins read gift_codes" ON public.gift_codes;
CREATE POLICY "Admins read gift_codes"
  ON public.gift_codes FOR SELECT
  TO authenticated
  USING (public.is_photo_admin());
