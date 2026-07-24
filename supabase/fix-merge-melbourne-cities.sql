-- fix-merge-melbourne-cities.sql
--
-- Merges the malformed duplicate "Melbourne, Victoria, Australia"
-- (slug melbourne-victoria, city_name "Melbourne, Victoria") INTO the canonical
-- "Melbourne, Australia" (slug melbourne). Same pattern as the London merge:
-- the dupe holds no unique data (no label, no sound), so re-point every
-- reference and delete it. Non-US cities use "City, Country" (no state), so the
-- Victoria region is dropped, matching the catalog convention.
--
-- References: gift_shop_listings (12 rows, 11 collide with an existing
-- "Melbourne, Australia" listing) and games (2 rows). Run in the Supabase SQL
-- editor. Safe to re-run.

begin;

-- 1. gift_shop_listings — drop dupe-Melbourne listings for items already listed
--    in "Melbourne, Australia" (the (item_id, city) uniqueness), then move the rest.
delete from public.gift_shop_listings dup
 where dup.city = 'Melbourne, Victoria, Australia'
   and exists (
     select 1
       from public.gift_shop_listings keep
      where keep.item_id = dup.item_id
        and keep.city = 'Melbourne, Australia'
   );

update public.gift_shop_listings
   set city = 'Melbourne, Australia'
 where city = 'Melbourne, Victoria, Australia';

-- 2. games — move to the canonical string and fix the structured geo.
update public.games
   set city = 'Melbourne, Australia',
       city_name = 'Melbourne',
       state_code = null,
       state_name = null,
       country_code = 'AUS',
       country_name = 'Australia'
 where city = 'Melbourne, Victoria, Australia';

-- 3. Delete the duplicate catalog row.
delete from public.cities
 where slug = 'melbourne-victoria';

commit;

-- Verify:
-- select city, slug from public.cities where city ilike '%Melbourne%';
-- select count(*) from public.gift_shop_listings where city = 'Melbourne, Victoria, Australia';
-- select count(*) from public.games where city = 'Melbourne, Victoria, Australia';
