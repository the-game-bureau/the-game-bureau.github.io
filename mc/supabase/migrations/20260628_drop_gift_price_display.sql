-- Remove prices from the gift shop.
--
-- The "Price (display)" text box was removed from the gift-shop admin, and the
-- import helpers no longer write a price. Drop the price_display column so the
-- schema matches. Run in the Supabase SQL editor (service-role).
--
-- Safe to run repeatedly (IF EXISTS). Any code still reading price_display just
-- gets NULL/undefined; the public shop already hides prices via CSS.

alter table public.gift_shop_items
  drop column if exists price_display;

-- The gift shop shows no prices at all. The two columns below power the parked
-- Printful POD / Stripe cart flow only (STRIPE_PUBLISHABLE_KEY is currently
-- empty, so nothing reads them). Uncomment to purge them too — only do this if
-- you are sure the POD cart will not be revived:
--
-- alter table public.gift_shop_items drop column if exists price_cents;
-- alter table public.gift_shop_items drop column if exists currency;
