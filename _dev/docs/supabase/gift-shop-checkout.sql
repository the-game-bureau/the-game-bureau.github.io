-- gift-shop-checkout — Stripe + Printful integration for the public gift shop.
--
-- Adds the columns gift/index.html needs to show a Buy button on POD items
-- (affiliate items stay as-is — they have no price_cents or printful_variant_id).
-- Also creates gift_orders, the table the stripe-webhook Edge Function writes
-- to on checkout.session.completed.
--
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Followed by:
--   Edge Function:  supabase/functions/create-stripe-session
--   Edge Function:  supabase/functions/stripe-webhook
--   Secrets to set:
--     STRIPE_SECRET_KEY       (sk_live_… or sk_test_…)
--     STRIPE_WEBHOOK_SECRET   (whsec_… from the webhook endpoint dashboard)
--     PRINTFUL_API_KEY        (Bearer token from Printful → Settings → Stores → API Access)
--     PRINTFUL_STORE_ID       (numeric, from the Printful API)
--   See each function's index.ts header for the exact setup steps.

-- ── gift_shop_items: cart fields ─────────────────────────────────────────────
ALTER TABLE public.gift_shop_items
  ADD COLUMN IF NOT EXISTS price_cents          integer,
  ADD COLUMN IF NOT EXISTS currency             text DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS printful_variant_id  text;

COMMENT ON COLUMN public.gift_shop_items.price_cents IS
  'Selling price in cents (USD by default). When set together with printful_variant_id, the public gift shop shows a Buy button instead of the Amazon affiliate CTA.';
COMMENT ON COLUMN public.gift_shop_items.printful_variant_id IS
  'Printful sync_variant_id used by the stripe-webhook Edge Function to create the fulfillment order.';

-- ── gift_orders: webhook-written ledger ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gift_orders (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id       text        UNIQUE NOT NULL,
  stripe_payment_intent   text,
  status                  text        NOT NULL DEFAULT 'pending',  -- pending | paid | fulfilled | failed | refunded
  amount_cents            integer,
  currency                text,
  customer_email          text,
  shipping                jsonb,                                   -- name + address from Stripe
  line_items              jsonb       NOT NULL,                    -- [{item_id, printful_variant_id, qty, unit_price_cents, title}]
  printful_order_id       text,
  printful_error          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_orders_status_idx
  ON public.gift_orders (status);

CREATE INDEX IF NOT EXISTS gift_orders_created_at_idx
  ON public.gift_orders (created_at DESC);

ALTER TABLE public.gift_orders ENABLE ROW LEVEL SECURITY;

-- The webhook (service role) is the ONLY writer. No anon INSERT/UPDATE policy.
-- Admin users can read orders via the existing admin_users gate; tighten/relax
-- via Supabase dashboard if you want a public "look up my order" page.
DROP POLICY IF EXISTS "Admins can read gift_orders" ON public.gift_orders;
CREATE POLICY "Admins can read gift_orders"
  ON public.gift_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users a
      WHERE a.email = (auth.jwt() ->> 'email')
    )
  );
