-- fix-merge-london-cities.sql
--
-- Merges the malformed duplicate "London, England, United Kingdom"
-- (slug london-england, city_name "London, England") INTO the canonical
-- "London, United Kingdom" (slug london). The duplicate holds no unique data
-- (no label, no sound config), so we just re-point every reference to the
-- canonical string and delete it.
--
-- References found: gift_shop_listings (18 rows, 9 of which collide with an
-- existing London, United Kingdom listing) and games (5 rows). teams don't
-- reference it. Run in the Supabase SQL editor. Idempotent-ish: safe to re-run
-- (the second run finds nothing left to move).

begin;

-- 1. gift_shop_listings — a gift can't be listed in the same city twice, so
--    first drop the duplicate-London listings for items that already have a
--    "London, United Kingdom" listing, then move the remainder over.
delete from public.gift_shop_listings dup
 where dup.city = 'London, England, United Kingdom'
   and exists (
     select 1
       from public.gift_shop_listings keep
      where keep.item_id = dup.item_id
        and keep.city = 'London, United Kingdom'
   );

update public.gift_shop_listings
   set city = 'London, United Kingdom'
 where city = 'London, England, United Kingdom';

-- 2. games — move to the canonical string and fix the structured geo the bad
--    row left behind (city_name was "London, England").
update public.games
   set city = 'London, United Kingdom',
       city_name = 'London',
       state_code = null,
       state_name = null,
       country_code = 'GBR',
       country_name = 'United Kingdom'
 where city = 'London, England, United Kingdom';

-- 3. Delete the duplicate catalog row.
delete from public.cities
 where slug = 'london-england';

commit;

-- Verify: one London row, no stray references.
-- select city, slug from public.cities where city ilike '%London%';
-- select count(*) from public.gift_shop_listings where city = 'London, England, United Kingdom';
-- select count(*) from public.games where city = 'London, England, United Kingdom';
