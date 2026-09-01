-- 2026-08-31  deleting a waypoint strips it from the stop, it does not delete the stop
-- ---------------------------------------------------------------------------
-- THIS REVERSES 2026083116, WHICH WAS THREE HOURS OLD, and the reversal is the
-- interesting part. That file made every key into `waypoints` CASCADE, on the
-- grounds that the two live tables already did and one answer beats three.
-- **One answer was right and it was the wrong answer.**
--
-- A STOP IS A WAYPOINT PLUS A CHALLENGE, and the stop is where the editorial
-- work is: the challenge somebody chose, its position in the walk, the direction
-- written to lead a team to the next one. **Cascading throws all of that away as
-- a side effect of correcting the catalogue.** A waypoint is usually deleted
-- because it is a duplicate or is simply wrong -- and then what you want is to
-- point the stop at the right one, not to rebuild it.
--
-- SO THE WAYPOINT IS STRIPPED AND THE STOP SURVIVES, carrying its challenge and
-- its place in the order, needing a waypoint. That is a state these tables
-- already understand: `route_stops.challenge_id` has been nullable since
-- 2026083001 for the mirror-image reason -- "a stop is worth recording the
-- moment you know where it is; requiring a challenge up front means inventing
-- filler to save a route."
--
-- IT IS ALSO THE RULE THE ROUTE BUILDER'S OWN REMOVE ALREADY KEEPS: it is a
-- left arrow, not a bin, because taking a stop off a route must not delete the
-- waypoint. This is that rule seen from the other end.
--
-- WHAT HAD TO MOVE, measured first rather than assumed:
--
--     route_stops.wpid            NOT NULL, not in a key      -> nullable
--     stops.waypoint_id           NOT NULL, in a UNIQUE       -> nullable
--     stops_retired.waypoint_id   NOT NULL, not in a key      -> nullable
--     walking_tour_stops.waypoint_id  NOT NULL, IN THE PK     -> see below
--
--   * `stops` KEEPS ITS UNIQUE (city, waypoint_id) AND THAT STILL WORKS. Its
--     primary key is the surrogate `id`, and Postgres treats two NULLs in a
--     unique index as distinct -- so several stripped stops in one city are
--     allowed, while "one place is one stop in a city" still holds for every
--     row that names a place.
--   * `walking_tour_stops` HAD THE WAYPOINT IN ITS PRIMARY KEY, so the key
--     moves to `(tour_id, ord)`, which it already carried as a UNIQUE and which
--     is the same shape `route_stops` uses. Nothing reads this table.
--
-- WHAT IT COSTS, PLAINLY: a stop with no waypoint is a NEW STATE in three
-- tables that rooms read, and both builders drew a missing waypoint as
-- `waypoint <id>`. With a null that would read `waypoint null`. Both rooms are
-- changed in the same commit to say the waypoint was deleted, which is the true
-- thing and is actionable.
--
-- APPLY BY HAND. Remote migration history has drifted; `supabase db push` is
-- refused. Safe with `supabase db query --linked --file`.

begin;

-- 1. route_stops --------------------------------------------------------------
alter table public.route_stops alter column wpid drop not null;
alter table public.route_stops drop constraint route_stops_wpid_fkey;
alter table public.route_stops
  add constraint route_stops_wpid_fkey
  foreign key (wpid) references public.waypoints(wpid) on delete set null;
comment on column public.route_stops.wpid is
  'The waypoint, or NULL for a stop whose waypoint has been deleted. The stop '
  'keeps its challenge, its position and its direction and needs a new place; '
  'deleting a waypoint must not throw that work away.';

-- 2. stops --------------------------------------------------------------------
alter table public.stops alter column waypoint_id drop not null;
alter table public.stops drop constraint stops_waypoint_id_fkey;
alter table public.stops
  add constraint stops_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(wpid) on delete set null;
comment on column public.stops.waypoint_id is
  'The waypoint, or NULL for a stop whose waypoint has been deleted. The UNIQUE '
  '(city, waypoint_id) still holds for every row that names one: Postgres reads '
  'two NULLs in a unique index as distinct, so stripped stops do not collide.';

-- 3. stops_retired ------------------------------------------------------------
alter table public.stops_retired alter column waypoint_id drop not null;
alter table public.stops_retired drop constraint stops_retired_waypoint_id_fkey;
alter table public.stops_retired
  add constraint stops_retired_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(wpid) on delete set null;

-- 4. walking_tour_stops -------------------------------------------------------
-- THE KEY MOVES TO THE ONE IT ALREADY HAD. `(tour_id, ord)` is unique on this
-- table today and is the same identity `route_stops` uses, so this is a swap
-- rather than an invention.
alter table public.walking_tour_stops drop constraint walking_tour_stops_pkey;
alter table public.walking_tour_stops drop constraint walking_tour_stops_tour_id_ord_key;
alter table public.walking_tour_stops
  add constraint walking_tour_stops_pkey primary key (tour_id, ord);
alter table public.walking_tour_stops alter column waypoint_id drop not null;
alter table public.walking_tour_stops drop constraint walking_tour_stops_waypoint_id_fkey;
alter table public.walking_tour_stops
  add constraint walking_tour_stops_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(wpid) on delete set null;

commit;

-- Verify -------------------------------------------------------------------
-- APPLY IT, THEN PROVE IT. Only a delete proves a delete.
--
--   -- 1. every key into waypoints gives it up rather than blocking or cascading
--   select c.conname, c.conrelid::regclass::text, c.confdeltype
--     from pg_constraint c
--    where c.confrelid = 'public.waypoints'::regclass and c.contype = 'f' order by 2;
--   -- expect: confdeltype n on all five
--
--   -- 2. and a delete strips the stop rather than removing it
--   begin;
--     create temp table probe as
--       select s.id, s.waypoint_id from public.stops_retired s where s.waypoint_id is not null limit 1;
--     delete from public.waypoints where wpid = (select waypoint_id from probe);
--     select (select count(*) from public.stops_retired s, probe p where s.id = p.id) as stop_still_there,
--            (select waypoint_id from public.stops_retired s, probe p where s.id = p.id) as its_waypoint;
--     -- expect: 1 and null
--   rollback;
