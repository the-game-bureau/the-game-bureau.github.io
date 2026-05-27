-- gift-shop-cards — sells per-game gift cards from /gifts/.
--
-- A "gift card" gift_shop_items row has gift_card_game_id set to the
-- game's id. The /gifts/ renderer detects this and shows a "Gift this
-- game" button that opens the shared gift-buy modal (Stripe Embedded
-- Checkout). Stripe charges the game's current price; the gift_codes
-- row is issued by the existing create-gift-checkout Edge Function.
--
-- Safe to re-run. Requires gift-codes.sql + gift-shop-checkout.sql to
-- have run previously (gift_shop_items + gift_codes must exist).

ALTER TABLE public.gift_shop_items
  ADD COLUMN IF NOT EXISTS gift_card_game_id text;

COMMENT ON COLUMN public.gift_shop_items.gift_card_game_id IS
  'When set, this gift_shop_items row is a gift card for the referenced game. The public /gifts/ renderer shows a "Gift this game" button instead of an affiliate link; Stripe charges the game''s current price via create-gift-checkout.';

CREATE INDEX IF NOT EXISTS gift_shop_items_gift_card_game_idx
  ON public.gift_shop_items (gift_card_game_id)
  WHERE gift_card_game_id IS NOT NULL;

-- Allow gift_shop_items.url to be null. Affiliate items (Amazon,
-- Bookshop) still set url; gift-card items don't have an external link.
-- The public renderer already gates the affiliate path on a non-empty
-- url, so this is safe.
ALTER TABLE public.gift_shop_items
  ALTER COLUMN url DROP NOT NULL;

-- ── Seed: Oswald's Diary price (only run once) ──────────────────────
-- Ensures games.price reflects $17.99 so the in-game payment overlay
-- and the gift-card Stripe charge agree. Other games' prices are left
-- alone — they must be set via the builder for the gift card to work.
UPDATE public.games
   SET price = '$17.99'
 WHERE name ILIKE '%oswald%'
   AND (price IS NULL OR price = '' OR upper(price) = 'FREE' OR price <> '$17.99');

-- ── Seed: a gift_shop_items row for EVERY paid, non-archived game ───
-- Idempotent — only inserts where no gift_card_game_id row exists yet.
-- Price parsed from games.price (e.g. "$17.99" → 1799). Games whose
-- price doesn't parse to a positive number are skipped.
--
-- Re-run this file any time you add a new paid game to seed it as a
-- gift card automatically.
WITH paid_games AS (
  SELECT
    id,
    name,
    price,
    -- Strip everything except digits and decimal, parse to cents.
    -- NULLIF guards against empty strings post-strip.
    (NULLIF(regexp_replace(price, '[^0-9.]', '', 'g'), '')::numeric * 100)::int AS price_cents
  FROM public.games
  WHERE price IS NOT NULL
    AND price <> ''
    AND upper(price) <> 'FREE'
    AND (archived IS NULL OR archived = '' OR upper(archived) <> 'YES')
),
to_insert AS (
  SELECT * FROM paid_games
  WHERE price_cents IS NOT NULL
    AND price_cents > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.gift_shop_items
       WHERE gift_card_game_id = paid_games.id
    )
),
new_items AS (
  INSERT INTO public.gift_shop_items (
    kind, title, description, price_display, price_cents, currency,
    gift_card_game_id, archived
  )
  SELECT
    'gift_card',
    name || ' — Gift Card',
    'Send "' || name || '" as a gift. Your recipient gets a code that unlocks the game on any device.',
    price,
    price_cents,
    'usd',
    id,
    false
  FROM to_insert
  RETURNING id, gift_card_game_id
)
INSERT INTO public.gift_shop_listings (item_id, game_id, position, live, archived)
SELECT id, gift_card_game_id, 0, true, false FROM new_items;
