-- Store each waypoint's exact coordinates so the map uses them directly instead
-- of geocoding the address every load (which is ambiguous for bare streets).
-- Filled by the Fill button / OSM finder / backfill. Safe to re-run.
alter table public.waypoints add column if not exists lat double precision;
alter table public.waypoints add column if not exists lon double precision;
comment on column public.waypoints.lat is 'Latitude — exact stored point; the map uses this directly (no geocoding).';
comment on column public.waypoints.lon is 'Longitude — paired with lat.';
