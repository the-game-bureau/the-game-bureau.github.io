-- gift_shop_featured.sql
--
-- Adds a `featured` flag to gift_shop_items and features at least one gift per
-- city. TEXT 'YES' / null, the same convention as public.games.featured (writers
-- use 'YES' / null, never true/false).
--
-- The public shop's default view (shop/index.html `isFeaturedView`: /shop/ with
-- no ?city / ?id / ?item / ?all=1) shows ONLY featured='YES' gifts, titled
-- "Featured gifts". ?all=1 still shows every gift; a city view shows that city's
-- gifts. Re-runnable: the UPDATE just re-sets the same rows to 'YES'.

alter table public.gift_shop_items
  add column if not exists featured text;

-- One featured gift per city: the first LIVE (certified, non-archived,
-- non-shelved) gift in each city, by listing position then most-recently
-- certified. An item shared across cities is set once and covers all of them.
with candidates as (
  select l.item_id,
         row_number() over (
           partition by l.city
           order by l.position nulls last, i.certified_at desc nulls last, l.item_id
         ) as rn
  from public.gift_shop_listings l
  join public.gift_shop_items i on i.id = l.item_id
  where coalesce(l.archived, false) = false
    and coalesce(i.archived, false) = false
    and i.certified_at is not null
    and i.rejected_at is null
)
update public.gift_shop_items i
set featured = 'YES'
from candidates c
where c.rn = 1
  and i.id = c.item_id;

-- Report what got featured, per city (handy to eyeball after running).
-- select l.city, count(*) filter (where i.featured = 'YES') as featured
--   from public.gift_shop_listings l
--   join public.gift_shop_items i on i.id = l.item_id
--  group by l.city order by featured, l.city;
