-- gift_shop_items.category — drives the public /gifts/ grid ordering.
--
-- The shop renders sports-related items first (alphabetical), then
-- everything else (also alphabetical), with no visible category labels.
-- Before this column the grouping was inferred from a title/description
-- keyword heuristic; this gives admins an explicit, authoritative tag.
--
-- Values: 'sports' | 'other'. NULL means "untagged" — the public renderer
-- falls back to the keyword heuristic for those rows until an admin sets
-- the category in /mc/gs-shop.html. Safe to re-run.

alter table public.gift_shop_items
  add column if not exists category text;

alter table public.gift_shop_items
  drop constraint if exists gift_shop_items_category_chk;

alter table public.gift_shop_items
  add constraint gift_shop_items_category_chk
  check (category is null or category in ('sports', 'other'));

comment on column public.gift_shop_items.category is
  'Public gift-shop grouping for /gifts/ ordering: sports | other (NULL = untagged, renderer falls back to a title keyword heuristic). Categories are ordered in the grid, never labeled.';
