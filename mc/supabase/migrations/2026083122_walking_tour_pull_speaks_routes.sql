-- `tgb_pull_walking_tours` STILL SAID `paths` (2026-08-31)
-- ===========================================================================
-- It refused every tour with:
--
--     42P01: relation "public.paths" does not exist
--
-- 2026083001 renamed `paths` to `routes`, `path_stops` to `route_stops` and
-- `tour_id` to `route_id` on 2026-08-30. This function was written on
-- 2026-08-18 and still speaks the old vocabulary.
--
-- HOW IT GOT BACK IN, WHICH IS THE LESSON. The pending-migrations table said to
-- RE-RUN 2026081804 to clear a stale `waypoints.archived` write, and doing that
-- REINSTALLED A TWELVE-DAY-OLD BODY over a definition that had been repaired in
-- place. The repo file and the database had diverged and re-running the file was
-- a regression dressed as a fix. **A migration file is a record of what was run
-- on a day, not a description of what is installed now** -- read the live
-- definition before re-running one.
--
-- AND IT WAS THE FOURTH FAULT FOUND IN ONE SITTING, each hidden by the one in
-- front of it: the archived write, then `teams.city_name` (dropped when
-- `audiences` lost its geo columns), then this. **Every one was reachable only
-- by a call that made the function do its job** -- an empty payload answers
-- {"filed": 0} and looks perfectly healthy, which is why the pending table has
-- twice been wrong about this function in both directions.
--
-- PATCHED IN PLACE, EACH USE NAMED. `tour_id` appears 13 times in the body and
-- MOST OF THEM ARE THE LOCAL `v_tour_id`, which is a variable and does not care
-- what it is called; a blind replace would rename the variable in some lines and
-- not others. Only the five real uses are touched, and each replacement asserts
-- it matched exactly once.
--
-- `route_stops` KEEPS `(route_id, ord)` AS ITS KEY, so the `on conflict` clause
-- and the loop-may-name-a-square-twice behaviour are unchanged; only the column
-- name moves.
--
-- Apply:  cd mc && supabase db query --linked --file supabase/migrations/2026083122_walking_tour_pull_speaks_routes.sql

begin;

do $patch$
declare
  v_src text;
  v_out text;
  -- EACH PAIR CARRIES ITS OWN EXPECTED COUNT. `from public.paths p` appears
  -- TWICE -- the title-and-city check and the id check -- and the first run of
  -- this patch refused it for that, correctly: a flat "exactly once" is a rule
  -- about this body rather than about the edit, and the honest thing is to say
  -- how many each replacement should touch.
  v_pairs text[][] := array[
    -- the two tables
    array['from public.paths p',                'from public.routes p', '2'],
    array['insert into public.paths (tour_id, title, shape, city)',
          'insert into public.routes (route_id, title, shape, city)', '1'],
    array['insert into public.path_stops (tour_id, wpid, ord)',
          'insert into public.route_stops (route_id, wpid, ord)', '1'],
    -- the column, where it is genuinely the column
    array['where p.tour_id = v_tour_id',        'where p.route_id = v_tour_id', '1'],
    -- and the prose that named them
    array['-- ONE WALK PER TITLE PER CITY. The routine reads public.paths before it',
          '-- ONE WALK PER TITLE PER CITY. The routine reads public.routes before it', '1'],
    array['-- THE MAJOR-LEAGUE GUARD. teams.city_name is the bare city ("New Orleans"),',
          '-- THE MAJOR-LEAGUE GUARD. places.city is the bare city ("New Orleans"),', '1']
  ];
  v_i int;
  v_hits int;
begin
  select pg_get_functiondef(oid) into v_src
    from pg_proc
   where proname = 'tgb_pull_walking_tours'
     and pronamespace = 'public'::regnamespace
     and prokind = 'f';

  if v_src is null then
    raise exception 'tgb_pull_walking_tours is not installed';
  end if;

  v_out := v_src;
  for v_i in 1 .. array_length(v_pairs, 1) loop
    -- EACH REPLACEMENT MUST MATCH THE NUMBER IT DECLARES. A patch that
    -- silently matches NOTHING is how a `String.replace` once deleted a whole
    -- stylesheet in this repo and said nothing; one that matches MORE than it
    -- expected is editing something it was not aimed at.
    v_hits := (length(v_out) - length(replace(v_out, v_pairs[v_i][1], '')))
              / length(v_pairs[v_i][1]);
    if v_hits <> v_pairs[v_i][3]::int then
      raise exception 'expected % match(es) for %, found %',
        v_pairs[v_i][3], left(v_pairs[v_i][1], 60), v_hits;
    end if;
    v_out := replace(v_out, v_pairs[v_i][1], v_pairs[v_i][2]);
  end loop;

  -- AND NOTHING OLD MAY SURVIVE. The per-pair count above proves each edit
  -- landed; this proves none of the old vocabulary is left anywhere else.
  if v_out like '%public.paths%' or v_out like '%public.path_stops%' then
    raise exception 'the body still names paths after the patch';
  end if;

  execute v_out;
end
$patch$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY. NOT BY THE ABSENCE OF AN ERROR -- a `create or replace` that returns
-- cleanly says nothing about whether the function runs, which is exactly how
-- this one carried three separate breaks for eleven days while reporting
-- success. File a real four-stop walk, read what landed, roll it back:
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
--   select count(*) from public.routes where title = 'PROBE DELETE ME';
--   select count(*) from public.waypoints where name like 'PROBE %';
--   rollback;
--
-- Expect filed 1, one route, four stops, four waypoints, all four located. A
-- town that is not a major-league city -- Foxborough -- must still come back
-- `invalid`.
