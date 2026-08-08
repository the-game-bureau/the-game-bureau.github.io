-- public.waypoints.walk_order — a suggested position in that city's walk.
--
-- READ THIS BEFORE USING IT FOR ANYTHING. This is NOT a route. The canonical
-- ordering of a route lives on public.stops.ord, where it belongs: a Stop is
-- game + waypoint + challenge, and the SAME waypoint sits at different
-- positions in different games. Nothing about a game's route may be read from
-- this column, and nothing may write a game's route into it.
--
-- What it is: a per-city hint, so the catalog can hold the walking order
-- somebody (or something) already worked out instead of recomputing it. Two
-- producers, both advisory:
--
--   1. The Waypoints page's SUGGEST ORDER button, which solves a shortest walk
--      from the stored lat/lon (nearest neighbour + 2-opt) and can save the
--      result here. On real Denver data that turns a 9.4 km wander into a
--      3.9 km walk.
--   2. The AI import prompts, which now ask the model to sequence what they
--      return. A model that has just researched twelve places in one downtown
--      knows which ones sit on the same block; that judgement is free at
--      research time and expensive to recover afterwards.
--
-- Scope is THE CITY, not the table: positions are 1..n within a city and repeat
-- across cities. Nothing enforces uniqueness, deliberately — an import that
-- lands two 3s is untidy, not broken, and a unique index would make a perfectly
-- reasonable paste fail outright.
--
-- Null means "no suggestion", which is the normal state. Rows without one sort
-- to the end.

alter table public.waypoints add column if not exists walk_order integer;

comment on column public.waypoints.walk_order is
  'Advisory position in this city''s suggested walk, 1..n, scoped to the city. NOT a route: a game''s real ordering is public.stops.ord, because one waypoint sits at different positions in different games. Null = no suggestion.';

-- A negative or zero position is a mistake every time; anything above a few
-- hundred means someone has written a wpid or a year in here.
alter table public.waypoints drop constraint if exists waypoints_walk_order_sane;
alter table public.waypoints add constraint waypoints_walk_order_sane
  check (walk_order is null or (walk_order >= 1 and walk_order <= 999)) not valid;

-- The page's query is "this city's waypoints in walk order", so that is the
-- index. Nulls last matches how the page sorts them.
create index if not exists waypoints_city_walk_order_idx
  on public.waypoints (city, walk_order nulls last);
