-- Canonicalize the three non-US city strings
-- ---------------------------------------------------------------------------
-- "London, England", "Toronto, Ontario" and "Melbourne, Victoria" were seeded
-- in forms that assets/geo.js does not round-trip: canonicalCity() turns them
-- into "London, United Kingdom" / "Toronto, Canada" / "Melbourne, Australia".
-- Because the city string is the key, the admin writing one of these would
-- create a SECOND row for the same place and split its gifts.
--
-- "Melbourne, Victoria" is the worst of the three: parseGeo() fails on it
-- outright (matched=false), so it renders no country oval and no state icon.
--
-- Run this BEFORE 2026072202_merge_gift_shop_cities_into_cities.sql so the bad
-- strings are never copied forward.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

begin;

-- 1. The catalog rows. The `where not exists` guard makes this a no-op if the
--    canonical row somehow already exists (re-run, or someone added it by hand).
update public.cities
   set city = 'London, United Kingdom',
       country_name = 'United Kingdom'
 where slug = 'london'
   and city <> 'London, United Kingdom'
   and not exists (select 1 from public.cities c where c.city = 'London, United Kingdom');

update public.cities
   set city = 'Toronto, Canada'
 where slug = 'toronto'
   and city <> 'Toronto, Canada'
   and not exists (select 1 from public.cities c where c.city = 'Toronto, Canada');

update public.cities
   set city = 'Melbourne, Australia',
       state_name = null
 where slug = 'melbourne'
   and city <> 'Melbourne, Australia'
   and not exists (select 1 from public.cities c where c.city = 'Melbourne, Australia');

-- 2. Everything that stores the city string. gift_shop_cities is the old table
--    (kept until the merge is proven); updating it keeps the two in step.
update public.gift_shop_listings
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end,
       updated_at = now()
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria');

update public.games
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria');

update public.gift_shop_cities
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end,
       updated_at = now()
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria')
   and not exists (
     select 1 from public.gift_shop_cities x
      where x.city in ('London, United Kingdom', 'Toronto, Canada', 'Melbourne, Australia')
        and x.city = case public.gift_shop_cities.city
              when 'London, England'     then 'London, United Kingdom'
              when 'Toronto, Ontario'    then 'Toronto, Canada'
              when 'Melbourne, Victoria' then 'Melbourne, Australia'
            end
   );

-- 3. Re-derive the structured geo columns for the three rows (the cities_sync_geo
--    trigger does this on its own once 2026072202 is applied; this covers the
--    case where this file runs first).
update public.cities t set
  city_name    = (public.tgb_parse_geo(t.city)).city_name,
  state_code   = (public.tgb_parse_geo(t.city)).state_code,
  state_name   = (public.tgb_parse_geo(t.city)).state_name,
  country_code = (public.tgb_parse_geo(t.city)).country_code,
  country_name = (public.tgb_parse_geo(t.city)).country_name
where t.slug in ('london', 'toronto', 'melbourne');

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect the three canonical strings, fully populated geo, and no leftovers.
select slug, city, city_name, state_code, state_name, country_code, country_name
  from public.cities
 where slug in ('london', 'toronto', 'melbourne')
 order by slug;

select 'gift_shop_listings' as src, city, count(*) from public.gift_shop_listings
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria') group by city
union all
select 'games', city, count(*) from public.games
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria') group by city;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- update public.cities set city = 'London, England',     country_name = 'England'  where slug = 'london';
-- update public.cities set city = 'Toronto, Ontario'                                where slug = 'toronto';
-- update public.cities set city = 'Melbourne, Victoria', state_name = 'Victoria'   where slug = 'melbourne';
