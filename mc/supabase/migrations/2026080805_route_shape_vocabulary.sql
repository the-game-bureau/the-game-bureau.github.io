-- 2026080805_route_shape_vocabulary.sql
--
-- Five more route shapes. public.routes.shape was constrained to three —
-- loop / out_and_back / point_to_point — by 2026080804, so the Route Builder's
-- new choices would have been rejected by the database, not by the page: a 400
-- on save with a raw check-constraint name in the status line.
--
-- The additions are ordinary trail vocabulary, and each describes a shape the
-- three could not:
--
--   lollipop      a stick out to a circle, round it, back down the same stick.
--                 Not out_and_back (that repeats the whole way) and not a loop
--                 (that never repeats any of it).
--   figure_eight  two loops crossing at one point, so the walk can be done as
--                 half or whole with no repeated steps. Nothing else offers a
--                 half.
--   horseshoe     a wide U whose ends differ but sit close together. It is a
--                 point_to_point that needs no shuttle, which is the entire
--                 practical difference to whoever is walking it.
--   network       interconnected segments, mixed and matched on the fly. The
--                 one shape with no fixed order at all.
--
-- LOOP AND OUT_AND_BACK STAY. Every route in the table is a loop, and dropping
-- either value would make the constraint fail against live rows.
--
-- The constraint is re-added NOT VALID, as it was: it governs new writes and
-- does not re-scan the table. Nothing needs re-scanning here anyway, since this
-- widens the accepted set rather than narrowing it.

alter table public.routes drop constraint if exists routes_shape_known;
alter table public.routes add constraint routes_shape_known
  check (shape is null or shape in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  )) not valid;

comment on column public.routes.shape is
  'loop (ends where it began) | out_and_back (same ends, different streets) | point_to_point (finishes elsewhere, needs a shuttle) | lollipop (stick out to a circle and back down the stick) | figure_eight (two loops crossing once; walkable as half or whole) | horseshoe (open loop, ends differ but sit close) | network (interconnected segments, mixed on the fly). Trail vocabulary.';

-- The walking-tour importer validates the shape itself and raises a readable
-- error rather than letting the constraint fire, so it has to learn the same
-- seven. Kept in step with mc/supabase/walking-tour-prompt-import.sql and the
-- inlined copy in mc/data/waypoints.html — the standing rule for that pair.
--
-- public.waypoints.tour_shape is deliberately NOT widened: those columns were
-- retired by 2026080804 and nothing reads or writes them.
