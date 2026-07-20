-- Gift shop: "rejected" status for items
-- ---------------------------------------------------------------------------
-- A third state alongside archived/unarchived. `rejected_at` is a TOMBSTONE:
-- when set, the item was reviewed and rejected, and we KEEP THE ROW on purpose
-- so future import prompts (which dedupe against every gift_shop_items row by
-- url/title) never re-suggest it. A rejected item is never shown publicly and
-- can't be published.
--
-- Flow: nightly/importer drops candidates in as archived → an admin either
-- unarchives + publishes, or rejects. Rejecting sets rejected_at (and keeps
-- archived = true). Un-rejecting clears rejected_at.
--
-- Idempotent: safe to re-run.

alter table public.gift_shop_items
  add column if not exists rejected_at timestamptz;

comment on column public.gift_shop_items.rejected_at is
  'When set, the item was rejected: kept as a row so import prompts skip it, never shown publicly, and cannot be published. NULL = not rejected.';

create index if not exists gift_shop_items_rejected_at_idx
  on public.gift_shop_items (rejected_at)
  where rejected_at is not null;
