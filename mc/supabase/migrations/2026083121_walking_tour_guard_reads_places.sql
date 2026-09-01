-- THE MAJOR-LEAGUE GUARD READS `places`, NOT `teams.city_name` (2026-08-31)
-- ===========================================================================
-- `tgb_pull_walking_tours` refused every tour with:
--
--     42703: column t.city_name does not exist
--
-- because 2026083026 dropped the five geo columns from `audiences` and
-- `public.teams` is a VIEW over it. A club's town lives in `places` now,
-- reached through `audiences.home_place_id`.
--
-- THIS IS THE SECOND FAULT IN THIS FUNCTION IN ELEVEN DAYS AND THE FIRST WAS
-- HIDING IT. Re-running 2026081804 today fixed the stale `waypoints.archived`
-- write; only a call that made the function do its job reached the next line
-- that fails. An empty payload answers {"filed": 0} and looks healthy.
--
-- WHY `places` IS THE RIGHT SOURCE AND `city_name` WAS NOT: that column
-- DISAGREED with the place it pointed at for 21 clubs -- it said San Jose for
-- the 49ers and New York for the Nets and the Devils -- which is why it was
-- dropped rather than kept. `places.city` is the bare town, which is exactly
-- what `routes.city` and `waypoints.city` both hold.
--
-- PATCHED IN PLACE FROM THE LIVE DEFINITION, ONE EXPRESSION SWAPPED, never
-- re-typed. A `create or replace` written afresh rewrites the WHOLE body, and
-- this project has already silently lost a column that way (the socials pull
-- stopped writing `confidence` for five days). Changing one substring cannot
-- drop anything, and it repairs whatever is actually installed even if that has
-- drifted from the file in the repo.
--
-- Apply:  cd mc && supabase db query --linked --file supabase/migrations/2026083121_walking_tour_guard_reads_places.sql

begin;

do $patch$
declare
  v_src  text;
  v_old  text;
  v_new  text;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc
   where proname = 'tgb_pull_walking_tours'
     and pronamespace = 'public'::regnamespace
     and prokind = 'f';

  if v_src is null then
    raise exception 'tgb_pull_walking_tours is not installed';
  end if;

  v_old := 'select 1 from public.teams t'
        || chr(10) || '       where t.league in (''NFL'', ''NBA'', ''MLB'', ''NHL'')'
        || chr(10) || '         and lower(btrim(coalesce(t.city_name, ''''))) = lower(v_city)';

  v_new := 'select 1 from public.audiences a'
        || chr(10) || '       join public.places p on p.id = a.home_place_id'
        || chr(10) || '       where upper(a.family) in (''NFL'', ''NBA'', ''MLB'', ''NHL'')'
        || chr(10) || '         and lower(btrim(coalesce(p.city, ''''))) = lower(v_city)';

  if position(v_old in v_src) = 0 then
    raise exception 'the guard is not the shape this patch expects; read the live definition before editing';
  end if;

  execute replace(v_src, v_old, v_new);
end
$patch$;

-- THE COMMENT NAMED THE DROPPED COLUMN TOO, so it described a rule the function
-- no longer keeps. A comment out of step with its body is worse than none.
comment on function public.tgb_pull_walking_tours(jsonb) is
  'PATH BOT''s write path. SECURITY DEFINER, insert-only, callable with the publishable key. Files up to 4 published walking tours a call into routes / route_stops / waypoints. The city must be the home town of an NFL, NBA, MLB or NHL club, resolved through audiences.home_place_id into places.city, and the caps on tours and stops per call are fixed: those constants are what make it safe to expose to anon, so do not add parameters for them.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY. NOT BY THE ABSENCE OF AN ERROR: a `create or replace` that returns
-- cleanly says nothing about whether the function runs. File a real four-stop
-- walk, read what landed, and roll it back.
--
--   begin;
--   select public.tgb_pull_walking_tours(jsonb_build_object('tours', jsonb_build_array(
--     jsonb_build_object('city','Green Bay','state','WI','title','PROBE DELETE ME',
--       'shape','point_to_point','source_url','https://example.org/probe',
--       'stops', jsonb_build_array(
--         jsonb_build_object('name','PROBE One','address','1265 Lombardi Ave','lat','44.5013','lon','-88.0622','description','probe'),
--         jsonb_build_object('name','PROBE Two','address','1901 S Oneida St','lat','44.4990','lon','-88.0650','description','probe'),
--         jsonb_build_object('name','PROBE Three','address','100 N Broadway','lat','44.5140','lon','-88.0180','description','probe'),
--         jsonb_build_object('name','PROBE Four','address','320 N Adams St','lat','44.5160','lon','-88.0160','description','probe')))));
--   select count(*) from public.waypoints where name like 'PROBE %';
--   rollback;
--
-- Expect filed 1, four waypoints created and four located. A town that is not a
-- major-league city -- Foxborough -- must still come back `invalid`.
