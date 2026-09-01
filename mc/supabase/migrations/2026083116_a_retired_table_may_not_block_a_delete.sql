-- 2026-08-31  deleting a waypoint is refused by two tables nobody is using
-- ---------------------------------------------------------------------------
-- REPORTED FROM THE ROOM: "Nothing was deleted: update or delete on table
-- waypoints violates foreign key constraint stops_retired_waypoint_id_fkey".
--
-- MEASURED BEFORE ANYTHING WAS CHANGED. Five foreign keys point at
-- public.waypoints, and they did not agree with each other about what deleting
-- one means:
--
--     route_stops.wpid            ON DELETE CASCADE     live
--     stops.waypoint_id           ON DELETE CASCADE     live
--     challenges.scope_wpid       ON DELETE SET NULL    live, deliberate
--     stops_retired.waypoint_id   NO ACTION  <- blocks
--     walking_tour_stops.waypoint_id  NO ACTION  <- blocks
--
-- **60 OF THE 564 WAYPOINTS COULD NOT BE DELETED AT ALL**, and the two keys
-- doing it are the two nothing is maintaining.
--
-- THE PROJECT HAS ALREADY SETTLED WHAT A DELETE MEANS HERE, in 2026080804's own
-- words: "deleting a waypoint must not leave a path pointing at nothing". Both
-- live tables cascade. These two now agree with them, so the answer is one
-- answer rather than three.
--
-- WHY CASCADE AND NOT `DROP THE KEY`. Dropping it would leave the id behind as
-- a plain number, which is defensible for a frozen record and is wrong for
-- these two:
--   * `stops_retired` IS NOT FROZEN. `public.game_stops` selects from it, and
--     both builders read that view -- and the view passes `waypoint_id` STRAIGHT
--     THROUGH without joining waypoints, so an orphaned id would reach the paid
--     product's editors as a stop pointing at a place that no longer exists.
--   * `walking_tour_stops` is read by nothing at all: no view, no function, and
--     no page in the repo. It is a leftover, and it is left in place rather than
--     dropped, per the standing rule. **It is a candidate for retirement and
--     that is a decision, not a tidy-up.**
--
-- WHAT IT COSTS, PLAINLY: deleting a waypoint now takes any stop that used it,
-- in both of those tables as well as the two that already did. That is what the
-- room's confirmation has to say, and now does.
--
-- APPLY BY HAND. Remote migration history has drifted; `supabase db push` is
-- refused. Safe with `supabase db query --linked --file`.

begin;

alter table public.stops_retired
  drop constraint stops_retired_waypoint_id_fkey;
alter table public.stops_retired
  add constraint stops_retired_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(wpid) on delete cascade;

alter table public.walking_tour_stops
  drop constraint walking_tour_stops_waypoint_id_fkey;
alter table public.walking_tour_stops
  add constraint walking_tour_stops_waypoint_id_fkey
  foreign key (waypoint_id) references public.waypoints(wpid) on delete cascade;

commit;

-- Verify -------------------------------------------------------------------
-- APPLY IT, THEN PROVE IT. A `create` that returns without error proves nothing
-- about a delete: only a delete does.
--
--   -- 1. all five agree, and none of them blocks
--   select c.conname, c.conrelid::regclass::text, c.confdeltype
--     from pg_constraint c
--    where c.confrelid = 'public.waypoints'::regclass and c.contype = 'f'
--    order by 2;
--   -- expect: confdeltype c on four, n on challenges_scope_wpid_fkey, a on none
--
--   -- 2. and a waypoint that WAS blocked can now be deleted. Do this in a
--   --    transaction and roll it back -- these are real rows.
--   begin;
--     select w.wpid, w.name from public.waypoints w
--      where exists (select 1 from public.stops_retired s where s.waypoint_id = w.wpid)
--      limit 1;
--     delete from public.waypoints where wpid = <that wpid>;   -- expect: 1
--   rollback;
