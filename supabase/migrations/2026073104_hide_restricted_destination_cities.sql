-- Hide destination cities we do not want to feature.
--
-- Two SEPARATE editorial calls, deliberately kept apart:
--   Tier A -- governed by a communist party (a political criterion)
--   Tier B -- currently unsafe to visit (a safety criterion)
-- They are not the same judgement and they do not overlap. Vietnam and China
-- rate well on ordinary street-crime measures; Colombia and Egypt are not
-- communist. Blending them into one "bad countries" list would make this file
-- unreadable in a year, so each tier is its own list with its own switch.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY TIER B BEFORE RUNNING. The safety list below reflects US State
-- Department advisory levels as understood when this was written (2026-07-31)
-- and advisories move constantly. Confirm each at
-- https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html
-- and edit the list. Do not treat these values as current just because they are
-- checked into git.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- HIDE, NOT DELETE. This sets all three per-surface hide flags, which takes a
-- city off /games/, /soundtracks/ and /gifts/ -- the same net effect as deleting
-- it, but reversible, and it cannot fail on the soundtracks.city_slug foreign
-- key. A hard DELETE block sits at the bottom, commented, if you want the rows
-- actually gone.
--
-- Verified against the live catalog on 2026-07-31: no soundtracks, no games and
-- only two gift_shop_listings (Moscow, Kyiv) reference any city named here, so
-- nothing of substance is lost either way.
--
-- Safe to re-run: setting a flag that is already true is a no-op.

begin;

-- ── Tier A: communist party-led states ──────────────────────────────────────
-- The five Marxist-Leninist single-party states are China, Cuba, Laos, Vietnam
-- and North Korea. Only three of them appear in the catalog. Keyed on
-- country_code so a city added to one of these countries later is caught by a
-- re-run rather than being missed because nobody remembered to list its slug.
update public.cities
   set hide_from_games       = true,
       hide_from_soundtracks = true,
       hide_from_gift_shop   = true
 where country_code in (
         'CHN',  -- Beijing, Guangzhou, Shanghai
         'CUB',  -- Havana
         'VNM',  -- Da Nang, Hanoi, Ho Chi Minh City
         'LAO',  -- (none currently)
         'PRK'   -- (none currently)
       )
   and not (hide_from_games and hide_from_soundtracks and hide_from_gift_shop);

-- Hong Kong is a judgement call, so it is its own statement rather than being
-- folded into the list above. It is a Special Administrative Region of China
-- with its own country_code ('HKG') and its own legal system, but since 2020 it
-- is governed under Beijing's national security law. Uncomment to include it.
-- update public.cities
--    set hide_from_games       = true,
--        hide_from_soundtracks = true,
--        hide_from_gift_shop   = true
--  where country_code = 'HKG';

-- ── Tier B1: State Dept Level 4, "Do Not Travel" ────────────────────────────
-- The uncontroversial half of the safety list -- active war or a total absence
-- of consular help. Both of these are in the catalog today.
update public.cities
   set hide_from_games       = true,
       hide_from_soundtracks = true,
       hide_from_gift_shop   = true
 where country_code in (
         'RUS',  -- Moscow, Saint Petersburg
         'UKR',  -- Kyiv
         'BLR', 'AFG', 'SYR', 'IRN', 'YEM', 'LBY', 'SOM', 'HTI', 'VEN', 'MLI'
       )
   and not (hide_from_games and hide_from_soundtracks and hide_from_gift_shop);

-- ── Tier B2: State Dept Level 3, "Reconsider Travel" ────────────────────────
-- OFF by default -- this is the tier that costs you real destinations. Level 3
-- is a caution, not a prohibition, and it sweeps in Cartagena, Medellin and
-- Cairo, which are ordinary tourist cities that plenty of operators run trips
-- to. Uncomment the ones you actually want gone.
-- update public.cities
--    set hide_from_games       = true,
--        hide_from_soundtracks = true,
--        hide_from_gift_shop   = true
--  where country_code in (
--          'COL',  -- Bogota, Cartagena, Medellin
--          'EGY',  -- Cairo
--          'SAU',  -- Riyadh, Makkah
--          'ISR'   -- Jerusalem, Tel Aviv  (varies sharply by area and by month)
--        );

-- ── Deliberately NOT swept: Mexico ──────────────────────────────────────────
-- Mexico's advisory is issued STATE BY STATE, not nationally, so a country_code
-- rule is simply wrong here. Of the seven Mexican cities in the catalog,
-- Guadalajara and Puerto Vallarta sit in Jalisco (Level 3) while Cancun, Tulum
-- and Playa del Carmen are in Quintana Roo and Mexico City and Monterrey are
-- lower still. If you want to act on Mexico, do it by state_code:
-- update public.cities
--    set hide_from_games = true, hide_from_soundtracks = true, hide_from_gift_shop = true
--  where country_code = 'MEX' and state_code in ('JAL');

-- ── Keep the deprecated `ignored` flag in step ──────────────────────────────
-- Per the cities-admin convention, `ignored` is true only when all three
-- per-surface flags are. Readers prefer their own column and fall back to this
-- one only when the column is absent, so keeping it accurate costs nothing and
-- protects any surface still on the old flag.
update public.cities
   set ignored = true
 where hide_from_games
   and hide_from_soundtracks
   and hide_from_gift_shop
   and ignored is distinct from true;

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select country_name, count(*), string_agg(city_name, ', ' order by city_name)
--   from public.cities
--  where hide_from_games and hide_from_soundtracks and hide_from_gift_shop
--  group by country_name
--  order by country_name;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- update public.cities
--    set hide_from_games = false, hide_from_soundtracks = false,
--        hide_from_gift_shop = false, ignored = false
--  where country_code in ('CHN','CUB','VNM','RUS','UKR');

-- ── Hard delete, if you want the rows actually gone ─────────────────────────
-- Hiding is reversible and cannot break a foreign key; deleting is neither.
-- Run the two repoint statements FIRST or the delete throws 23503 on
-- soundtracks.city_slug. As of 2026-07-31 no soundtrack references any of these
-- cities and only two gift_shop_listings do (Moscow, Kyiv), but re-check before
-- you run it -- that is exactly the sort of fact that goes stale.
--
-- begin;
--   -- Anything still pointing at a doomed city has to go first.
--   delete from public.soundtrack_songs
--    where city_slug in (select slug from public.cities
--                         where country_code in ('CHN','CUB','VNM','RUS','UKR'));
--   delete from public.soundtracks
--    where city_slug in (select slug from public.cities
--                         where country_code in ('CHN','CUB','VNM','RUS','UKR'));
--   delete from public.gift_shop_listings
--    where city in (select city from public.cities
--                    where country_code in ('CHN','CUB','VNM','RUS','UKR'));
--
--   delete from public.cities
--    where country_code in ('CHN','CUB','VNM','RUS','UKR');
-- commit;
