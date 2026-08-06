-- One gift per product link: enforce a unique link on gift_shop_items.
--
-- Empty / null links are exempt on purpose — archived drafts may have no link
-- yet (Save & Archive works without one) — so this is a PARTIAL unique index.
--
-- If this fails with "could not create unique index ... duplicate key value",
-- there are existing gifts that share a link. Find them with:
--
--   select url, count(*), array_agg(id)
--   from public.gift_shop_items
--   where url is not null and btrim(url) <> ''
--   group by url having count(*) > 1;
--
-- Resolve the duplicates (delete/merge), then re-run this migration.

create unique index if not exists gift_shop_items_url_unique
  on public.gift_shop_items (url)
  where url is not null and btrim(url) <> '';
