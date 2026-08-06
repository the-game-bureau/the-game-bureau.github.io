-- Remove the duplicate Sacramento row from public.cities.
--
-- Why this exists:
-- The catalog carried two rows for the same place --
--   slug 'sacramento'    city 'Sacramento, California'  (created 15:05)
--   slug 'sacramento-ca' city 'Sacramento, CA'          (created 15:29)
-- The second was seeded in the legacy "City, ST" form; tgb_city_slug() saw
-- 'sacramento' already taken by a different city string and qualified the slug
-- rather than colliding, so nothing complained at insert time.
--
-- It surfaces later: any pass that canonicalizes the city string (the SQL
-- tgb_canonical_gift_shop_city, the JS TgbGeo.canonicalCity, or a hand-run
-- normalize) rewrites 'Sacramento, CA' to 'Sacramento, California' and trips
-- the cities_city_key unique index with a bare 23505.
--
-- Nothing points at the stray row -- verified against the live database on
-- 2026-07-31: soundtracks has only city_slug 'sacramento', all four
-- gift_shop_listings rows already say 'Sacramento, California', and neither
-- games nor waypoints has any Sacramento row. So this is a delete, not a merge:
-- there is no data on 'sacramento-ca' to carry over.
--
-- Safe to re-run: the guards make a second run a no-op.

begin;

-- 1. Belt and braces -- if anything DID land on the stray slug or string after
--    the check above, move it to the canonical row before deleting.
update public.soundtracks
   set city_slug = 'sacramento'
 where city_slug = 'sacramento-ca'
   and not exists (select 1 from public.soundtracks s where s.city_slug = 'sacramento');

update public.gift_shop_listings
   set city = 'Sacramento, California',
       updated_at = now()
 where city = 'Sacramento, CA';

update public.games
   set city = 'Sacramento, California'
 where city = 'Sacramento, CA';

-- 2. Drop the duplicate. Both the slug and the exact legacy string must match,
--    so this cannot take out the canonical row even if the slugs are ever
--    swapped around.
delete from public.cities
 where slug = 'sacramento-ca'
   and city = 'Sacramento, CA'
   and exists (select 1 from public.cities c where c.city = 'Sacramento, California');

-- 3. Prove no other row is still in the legacy "City, ST" form, which is the
--    shape that detonates on the next canonicalization pass.
do $$
declare
  v_legacy_count integer;
begin
  select count(*)
    into v_legacy_count
    from public.cities
   where city ~ ',\s*[A-Z]{2}$';

  if v_legacy_count > 0 then
    raise exception
      'public.cities still has % row(s) whose city string is in the legacy "City, ST" form. Canonicalizing them will collide with cities_city_key. Run the verification query at the bottom of this migration and merge them by hand.',
      v_legacy_count;
  end if;
end $$;

commit;

-- Verify: expect one Sacramento row, and zero rows from the second query.
-- select slug, city, city_name, state_code, state_name, country_code, country_name
--   from public.cities
--  where city_name = 'Sacramento';
--
-- select slug, city from public.cities where city ~ ',\s*[A-Z]{2}$' order by city;
--
-- Duplicate places in general (should return nothing):
-- select lower(city_name), state_code, country_code, count(*), array_agg(slug)
--   from public.cities
--  group by 1, 2, 3
-- having count(*) > 1;
