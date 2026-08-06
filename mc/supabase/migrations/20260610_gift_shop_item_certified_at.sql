-- gift_shop_items.certified_at — the last time an admin "certified" the item
-- (links still valid, price reasonable, etc.). Set from the "Certify Today"
-- checkbox in /mc/gs-shop.html, which PATCHes the current timestamp immediately.
-- NULL = never certified. Safe to re-run.

alter table public.gift_shop_items
  add column if not exists certified_at timestamptz;

-- Promote an earlier date-typed column to timestamptz so we keep the time too.
alter table public.gift_shop_items
  alter column certified_at type timestamptz using certified_at::timestamptz;

comment on column public.gift_shop_items.certified_at is
  'Last time the item was certified by an admin (Certify Today in /mc/gs-shop.html). NULL = never.';
