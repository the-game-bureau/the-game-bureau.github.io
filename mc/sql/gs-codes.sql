-- gift-codes — Stripe-backed access codes that unlock a specific game.
--
-- Buyer flow:
--   1. Buyer clicks "Gift this game" on /game/run/?id=X
--   2. gs-create-checkout Edge Function creates Stripe Embedded Checkout
--      + inserts a 'pending' row keyed on stripe_session_id with a
--      pre-issued access code.
--   3. Buyer pays. stripe-webhook fires checkout.session.completed.
--   4. Webhook confirms payment, updates the row to status='paid', and
--      leaves the pre-issued access code ready for the buyer.
--
-- Redemption flow:
--   1. Player enters an access code in the payment modal on the text/map
--      game engines.
--   2. gs-redeem-code Edge Function verifies access code + game_id match and the
--      row is still status='paid'. On success it sets status='redeemed' and
--      returns ok=true. Engine writes to localStorage so a refresh skips re-redemption.
--
-- Service role is the only writer. The webhook + Edge Functions use the
-- service role; the public anon role gets nothing. Redemption goes through
-- the Edge Function specifically so anon can't scan access codes by guessing.

-- ── games pricing source of truth ─────────────────────────────────────
-- The old games.price column is display text ("$17.99"). Keep it for UI,
-- but derive a numeric price_cents value for checkout so Stripe charges
-- from a stable integer.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS price_cents integer;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS currency text DEFAULT 'usd';

CREATE OR REPLACE FUNCTION public.tgb_parse_price_cents(display_price text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  WITH parsed AS (
    SELECT (regexp_match(display_price, '([0-9]+(?:\.[0-9]+)?)'))[1] AS amount
  )
  SELECT CASE
    WHEN display_price IS NULL OR btrim(display_price) = '' OR upper(btrim(display_price)) = 'FREE' THEN NULL
    WHEN parsed.amount IS NULL THEN NULL
    ELSE round(parsed.amount::numeric * 100)::integer
  END
  FROM parsed
$$;

UPDATE public.games
   SET price_cents = public.tgb_parse_price_cents(price)
 WHERE price_cents IS NULL;

UPDATE public.games
   SET currency = 'usd'
 WHERE currency IS NULL OR btrim(currency) = '';

CREATE OR REPLACE FUNCTION public.tgb_sync_game_price_cents()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.price_cents IS NULL THEN
      NEW.price_cents := public.tgb_parse_price_cents(NEW.price);
    END IF;
  ELSIF NEW.price IS DISTINCT FROM OLD.price THEN
    NEW.price_cents := public.tgb_parse_price_cents(NEW.price);
  END IF;
  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    NEW.currency := 'usd';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tgb_sync_game_price_cents_trigger ON public.games;
CREATE TRIGGER tgb_sync_game_price_cents_trigger
BEFORE INSERT OR UPDATE OF price, currency ON public.games
FOR EACH ROW EXECUTE FUNCTION public.tgb_sync_game_price_cents();

COMMENT ON COLUMN public.games.price_cents IS
  'Checkout price in cents. Maintained from games.price by tgb_sync_game_price_cents; gs-create-checkout prefers this integer and only falls back to parsing price for older installs.';

CREATE TABLE IF NOT EXISTS public.gift_codes (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code                    text        UNIQUE,                    -- pre-issued at checkout-create time; usable only after status='paid'
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

-- Re-redemption tracking. We treat the access code as a bearer token (any
-- device that has it can unlock), but log every redemption attempt so
-- we can spot access codes being heavily reused (sharing, fraud, etc.). The
-- product UI behaves AS IF it's one-per-device — the loosened policy
-- is purely server-side so cleared localStorage / new devices don't
-- generate support calls.
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS redemption_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.gift_codes ADD COLUMN IF NOT EXISTS last_redeemed_at timestamptz;

-- Self-service game-swap tracking. gs-swap-game increments swap_count
-- and updates last_swapped_at on every successful game change. Lets
-- the admin spot access codes that have bounced between games a lot.
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
