-- Tours live ON public.waypoints, as columns. One tour is a SET OF ROWS that
-- share a tour_id; the row IS the stop.
--
-- WHY NOT A TOURS TABLE. A walking_tours + walking_tour_stops pair was written
-- first and thrown away before it was ever applied. The join-table shape is the
-- textbook answer for "a place appears on several walks", but it answers a
-- question this product does not ask. Here, two tours that both stop at
-- Preservation Hall get TWO ROWS - one per tour - and that is correct, because
-- the stop is not really the same thing twice:
--
--   * The order differs (stop 6 of one walk, stop 2 of the other).
--   * The sentence differs. What you say at a jazz stop on a music walk is not
--     what you say about it on a football walk.
--   * Editing one must not silently edit the other, which a shared row does.
--
-- So a duplicate row is the feature, not the redundancy it looks like. It also
-- keeps every tool that already reads public.waypoints working unchanged - the
-- page, the map, the geocoder, the error badges - instead of teaching each of
-- them a second table.
--
-- The cost, stated plainly: the same place edited on two tours has to be edited
-- twice, and a name+city query returns it more than once. That is accepted.

alter table public.waypoints add column if not exists tour_id text;
alter table public.waypoints add column if not exists tour_title text;
alter table public.waypoints add column if not exists tour_shape text;

comment on column public.waypoints.tour_id is
  'Groups rows into one walking tour. Rows sharing a tour_id ARE that tour, ordered by walk_order. Null = a loose waypoint belonging to no tour, which is what most of the catalog is.';
comment on column public.waypoints.tour_title is
  'What the tour is called when it is sold. Repeated on every row of the tour - denormalised on purpose, so one row carries its whole context.';
comment on column public.waypoints.tour_shape is
  'loop (ends where it began) | out_and_back (same ends, different streets) | point_to_point (finishes elsewhere). Trail vocabulary. Repeated on every row of the tour.';

-- Shape is a closed set. A typo here would silently create a fourth kind of
-- tour that nothing knows how to render.
alter table public.waypoints drop constraint if exists waypoints_tour_shape_known;
alter table public.waypoints add constraint waypoints_tour_shape_known
  check (tour_shape is null or tour_shape in ('loop', 'out_and_back', 'point_to_point'))
  not valid;

-- A tour row needs its group. Title and shape may lag (a human filling one in by
-- hand), but a walk_order with no tour_id is a stop belonging to nothing.
alter table public.waypoints drop constraint if exists waypoints_tour_needs_id;
alter table public.waypoints add constraint waypoints_tour_needs_id
  check (tour_title is null or tour_id is not null)
  not valid;

-- The query this exists to serve: one tour, in walking order.
create index if not exists waypoints_tour_idx
  on public.waypoints (tour_id, walk_order) where tour_id is not null;

-- And "which tours does this city have", for the routine's skip rule.
create index if not exists waypoints_city_tour_idx
  on public.waypoints (city, tour_id) where tour_id is not null;
