-- routes -> paths. A Game contains PATHS; a Path is an ordered list of Stops.
--
-- A rename and nothing else: same columns, same keys, same rows. `alter table
-- ... rename` carries the indexes, the foreign keys, the triggers and the RLS
-- policies with it, so nothing below re-creates any of them.
--
-- WHAT IS DELIBERATELY NOT RENAMED, because the word means three different
-- things in this project and only one of them is a walking route:
--
--   * game_instances.route_color -- the engine's Latin-square rotation slot
--     (blue / black / purple / silver / orange). It has never had anything to do
--     with a walking route, both engines read it at play time, and they are the
--     paid product.
--   * tour_id, on both tables. It stays tour_id and the reason is unchanged:
--     every stored ?tour= link and the NFL Tour Builder's stored prompt point at
--     it. Renaming it to path_id would also re-create the exact collision this
--     column was named around.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

alter table if exists public.routes      rename to paths;
alter table if exists public.route_stops rename to path_stops;

-- The constraint and index names are cosmetic -- Postgres keeps them working
-- under the old name -- but a table called paths whose primary key is called
-- route_stops_pkey is the kind of thing that costs somebody an afternoon.
--
-- route_stops_pkey IN PARTICULAR: tgb_import_walking_tour names that constraint
-- explicitly in its `on conflict`, because plpgsql cannot tell the function's
-- own output columns from the table's inside an index-inference clause. The
-- function is updated in the same commit; if you run this migration without
-- deploying that file, the import raises "constraint route_stops_pkey does not
-- exist" rather than failing quietly.
alter table public.paths       rename constraint routes_pkey to paths_pkey;
alter table public.path_stops  rename constraint route_stops_pkey to path_stops_pkey;

alter index if exists routes_city_idx           rename to paths_city_idx;
alter index if exists route_stops_tour_ord_idx  rename to path_stops_tour_ord_idx;
alter index if exists route_stops_wpid_idx      rename to path_stops_wpid_idx;

comment on table public.paths is
  'One row per walking path. The stops are in public.path_stops; the places themselves are in public.waypoints. Renamed from public.routes 2026-08-17.';
comment on table public.path_stops is
  'Which waypoints a path visits, in what order. Nothing but ids and a position. Renamed from public.route_stops 2026-08-17.';

-- A view under the old names, so anything not yet redeployed keeps working
-- rather than 400ing. READ ONLY on purpose: a writable view would let a stale
-- client keep writing under the old vocabulary indefinitely, which is how the
-- rename never finishes. Drop these once you are sure nothing reads them.
create or replace view public.routes      as select * from public.paths;
create or replace view public.route_stops as select * from public.path_stops;

comment on view public.routes is
  'DEPRECATED compatibility view over public.paths. Read-only. Remove once nothing reads it.';
comment on view public.route_stops is
  'DEPRECATED compatibility view over public.path_stops. Read-only. Remove once nothing reads it.';

grant select on public.routes      to anon, authenticated;
grant select on public.route_stops to anon, authenticated;
