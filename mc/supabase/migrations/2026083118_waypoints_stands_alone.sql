-- 2026-08-31  waypoints.place_id goes, and the table finally stands alone
-- ---------------------------------------------------------------------------
-- A WAYPOINT DOES NOT DEPEND ON ANY OTHER TABLE. It carries its own city, state
-- and country as plain text, and things point AT it rather than the other way
-- round: five keys into it, and after this, none out.
--
-- `place_id` WAS THE ONE EXCEPTION AND IT WAS DOING NOTHING. Added by 2026083019
-- so cross-table questions could be asked -- "Biloxi holds 20 waypoints and no
-- club" -- and then nothing asked one. Checked rather than assumed before
-- dropping:
--     no page reads or writes it, in the whole repo
--     no view selects it
--     no function names it
--
-- AND IT HAD QUIETLY GONE STALE, which is the argument for removing it rather
-- than leaving it. The backfill filled 536 of 536; the table is 564 now and it
-- was 534 of 564, because nothing maintains it and every row filed since arrived
-- without one. **A column that was complete and is now 95% is worse than one
-- that was never filled**, because a query over it still looks right.
--
-- THE COLUMN IS DROPPED RATHER THAN RETIRED IN PLACE, which is not this project
-- usual answer. Retiring is for a column that held something: the two soundtrack
-- timestamps were the only record of a human judgement, `destinations_retired`
-- is kept so a view can be compared against it. This one is DERIVED -- city and
-- state are on the row, and `places.id` is `city-state` -- so nothing is lost
-- that cannot be recomputed. The statement to rebuild it is at the foot of this
-- file if it is ever wanted back.
--
-- APPLY BY HAND. Remote migration history has drifted; `supabase db push` is
-- refused. Safe with `supabase db query --linked --file`.

begin;

alter table public.waypoints drop column place_id;

commit;

-- Verify -------------------------------------------------------------------
--   -- 1. the column is gone and the row count is untouched
--   select count(*) from public.waypoints;                       -- expect 564
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='waypoints' and column_name='place_id';
--   -- expect: 0 rows
--
--   -- 2. NOTHING POINTS OUT OF waypoints ANY MORE
--   select conname from pg_constraint
--    where conrelid = 'public.waypoints'::regclass and contype = 'f';
--   -- expect: 0 rows
--
--   -- 3. and the five that point IN are untouched
--   select conname, confdeltype from pg_constraint
--    where confrelid = 'public.waypoints'::regclass and contype = 'f' order by 1;
--   -- expect: five rows, confdeltype n on all of them
--
--   -- 4. the room own read still works
--   select wpid, name, city, state, country from public.waypoints limit 1;

-- To rebuild it, if the cross-table questions are ever wanted back ----------
--   alter table public.waypoints
--     add column place_id text references public.places(id) on delete set null;
--   update public.waypoints w set place_id = p.id
--     from public.places p
--    where lower(p.city) = lower(w.city) and lower(p.state) = lower(w.state);
--   -- and something has to MAINTAIN it this time, or it goes stale again: a
--   -- BEFORE INSERT OR UPDATE trigger, the way public.events fills its geo.
