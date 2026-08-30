-- PUT A FEW GAMES BACK IN THE WINDOW.
--
-- All 395 rows of public.games carry archived = 'YES', so /games/ has been
-- showing an empty shop window. This lights the New Orleans games and Oswald's
-- Diary, which is what was asked for on 2026-08-30.
--
-- `archived` IS TEXT ON THIS TABLE AND 'YES' IS THE ONLY TRUE VALUE. null and
-- '' are false. Never write `false`: PostgREST coerces a JS boolean to the
-- string 'false', which is a NON-EMPTY string, which every reader here treats
-- as truthy, so the row stays hidden and the UI reports success. That is why
-- this sets null rather than anything cleverer.
--
-- WRITTEN BUT NOT APPLIED. The Supabase connection was unavailable when this
-- was written: both `supabase db query --linked` and a plain curl to the REST
-- endpoint timed out. Run it and read the SECOND statement's output rather than
-- trusting the absence of an error.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/seeds/unarchive-new-orleans-and-oswald.sql

begin;

update public.games
   set archived = null
 where coalesce(archived, '') = 'YES'
   and ( name ilike '%oswald%'
      or city ilike '%new orleans%'
      or away_team_city ilike '%new orleans%'
      or home_team_city ilike '%new orleans%' );

commit;

-- VERIFY, and read the rows rather than the absence of an error. Expect the
-- Oswald game plus every fixture with New Orleans on either side of it.
select id,
       name,
       coalesce(city, home_team_city) as host,
       away_team_city,
       game_date::text,
       coalesce(archived, '(live)') as archived
  from public.games
 where coalesce(archived, '') <> 'YES'
 order by game_date nulls last, name;

-- AND CHECK THE PAGE CAN DRAW THEM. /games/ needs a coordinate for each city,
-- which it derives from the average of the waypoints held there. A game whose
-- host or away city has no waypoint will list but will not fly.
--
--   with live as (
--     select lower(btrim(split_part(city, ',', 1))) c from public.games
--      where coalesce(archived, '') <> 'YES'
--     union
--     select lower(btrim(split_part(away_team_city, ',', 1))) from public.games
--      where coalesce(archived, '') <> 'YES'
--   ),
--   wp as (
--     select lower(btrim(city)) c from public.waypoints
--      where lat is not null and city is not null group by 1
--   )
--   select live.c as city_with_no_point
--     from live left join wp on wp.c = live.c
--    where wp.c is null and live.c <> '';
--
-- Baton Rouge is the one club city with no waypoints, and games/index.html
-- carries a static fallback for it and for the venue towns.
