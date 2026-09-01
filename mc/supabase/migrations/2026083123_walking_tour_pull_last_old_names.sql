-- THE LAST OLD NAMES IN `tgb_pull_walking_tours` (2026-08-31)
-- ===========================================================================
--     42704: constraint "path_stops_pkey" for table "route_stops" does not exist
--
-- 2026083001 renamed the CONSTRAINTS as well as the tables, sweeping them from
-- the catalog rather than from a list; the function's `on conflict on constraint`
-- still named the old one.
--
-- THIS IS THE THIRD FILE IN ONE SITTING AND THE FIFTH FAULT IN THIS ONE
-- FUNCTION, and the shape is worth writing down because it will happen again:
--
--   1. it wrote the dropped `waypoints.archived`        42703
--   2. it read the dropped `teams.city_name`            42703
--   3. it named `public.paths`                          42P01
--   4. it named `path_stops_pkey`                       42704
--
-- EACH ONE WAS HIDDEN BY THE ONE IN FRONT OF IT. Every fix revealed the next,
-- and every one was reachable ONLY by a call that made the function do its job:
-- an empty payload answers {"filed": 0} on every one of those broken bodies.
-- **Four round trips because I fixed what the error named instead of asking the
-- catalog what else was stale.** The query that ends this is one statement:
--
--   select ordinality, line from unnest(string_to_array(
--            (select pg_get_functiondef(oid) from pg_proc
--              where proname = '<fn>' and prokind = 'f'), chr(10)))
--          with ordinality as t(line, ordinality)
--    where line like '%<old name>%';
--
-- **RUN THAT AFTER ANY RENAME, ON EVERY FUNCTION THAT TOUCHED THE TABLE.** A
-- plpgsql body is stored as TEXT and resolved at RUNTIME, so a rename leaves
-- every one of these waiting for a caller, and this project has now been bitten
-- by that property five times in four months.
--
-- THE PROSE GOES TOO. Four reason strings and comments still said `path`, and
-- two of them are handed back to the routine in its reply. The vocabulary is
-- the one the person using it speaks, and this project renamed Route to Path
-- and back again precisely so the words would match.
--
-- Apply:  cd mc && supabase db query --linked --file supabase/migrations/2026083123_walking_tour_pull_last_old_names.sql

begin;

do $patch$
declare
  v_src text;
  v_out text;
  v_pairs text[][] := array[
    -- THE ONE THAT ACTUALLY BREAKS IT
    array['on conflict on constraint path_stops_pkey do nothing',
          'on conflict on constraint route_stops_pkey do nothing', '1'],
    -- and the words
    array['''this city already has a path with this title''',
          '''this city already has a route with this title''', '1'],
    array['''a path already holds the id ''',
          '''a route already holds the id ''', '1'],
    array['-- is how a path ends up with two stop 4s.',
          '-- is how a route ends up with two stop 4s.', '1'],
    array['-- which is what paths.city and waypoints.city both hold; teams.fanbase is',
          '-- which is what routes.city and waypoints.city both hold; audiences.name is', '1']
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
    v_hits := (length(v_out) - length(replace(v_out, v_pairs[v_i][1], '')))
              / length(v_pairs[v_i][1]);
    if v_hits <> v_pairs[v_i][3]::int then
      raise exception 'expected % match(es) for %, found %',
        v_pairs[v_i][3], left(v_pairs[v_i][1], 60), v_hits;
    end if;
    v_out := replace(v_out, v_pairs[v_i][1], v_pairs[v_i][2]);
  end loop;

  -- AND NOW NOTHING IN THE BODY MAY SAY `path` AT ALL. `search_path` is the one
  -- legitimate use and is excluded by name; anything else left is a fault that
  -- has not been found yet.
  if replace(v_out, 'search_path', '') like '%path%' then
    raise exception 'the body still says path somewhere: %',
      left(replace(v_out, 'search_path', ''), 200);
  end if;

  execute v_out;
end
$patch$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY: file a real four-stop walk and roll it back. See 2026083122 for the
-- probe. Expect filed 1, one route, four stops, four waypoints, four located,
-- and Foxborough still refused as `invalid`.
