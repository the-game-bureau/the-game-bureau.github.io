-- Give public.waypoints its coordinates back.
--
-- WHY THIS IS A PERFORMANCE FIX, not a schema nicety. The Waypoints page draws
-- a map of the city you are looking at, and with no coordinates on the row it
-- had to derive every pin from the street address at runtime — through
-- Nominatim, whose usage policy caps a client at one request per second. The
-- loop is necessarily sequential with a 1100 ms gap, so a cold cache cost:
--
--     Denver      37 pins   ~41 s
--     Baltimore   27 pins   ~30 s
--     Atlanta     21 pins   ~23 s
--
-- before the map settled. A localStorage cache hid it on whichever machine had
-- already sat through it once, which is why it read as "sometimes slow" rather
-- than "always slow" — it was fast for the person who built the city and slow
-- for everyone else, in every new browser, after every cache clear.
--
-- With the point stored, the map draws from data the moment the rows arrive and
-- Nominatim is touched only for a waypoint nobody has located yet.
--
-- THESE COLUMNS EXISTED BEFORE. 20260620_add_waypoints_latlon.sql added them and
-- they were later dropped straight in the dashboard with no migration, so the
-- repo still reads as though they are there and only an aside in
-- 2026072703_drop_waypoint_w3w.sql records that they are not. That is also why
-- 2026073102_places_walking_tour_waypoints.sql threw away the 24 coordinates
-- that came with the walking-tour import. Re-adding them here, with a migration
-- this time.
--
-- Nullable on purpose: a waypoint is worth recording before anyone has pinned
-- it, exactly as `challenge_id` is nullable on a stop. Null means "not located
-- yet" and the page geocodes it once, then writes it back.

alter table public.waypoints add column if not exists lat double precision;
alter table public.waypoints add column if not exists lon double precision;

comment on column public.waypoints.lat is
  'Latitude of the waypoint, WGS84. Null = not located yet; the Waypoints page geocodes the address once and writes it back. Never derive a street address from this — see the nightly scout rules in CLAUDE.md.';
comment on column public.waypoints.lon is
  'Longitude of the waypoint, WGS84. Null = not located yet.';

-- Reject impossible values outright. A geocoder that returns a string, or a
-- transposed lat/lon pair, is otherwise invisible until a pin lands in the sea.
-- NOT VALID so the existing rows (all null today) are not re-checked.
alter table public.waypoints drop constraint if exists waypoints_lat_range;
alter table public.waypoints add constraint waypoints_lat_range
  check (lat is null or (lat >= -90 and lat <= 90)) not valid;

alter table public.waypoints drop constraint if exists waypoints_lon_range;
alter table public.waypoints add constraint waypoints_lon_range
  check (lon is null or (lon >= -180 and lon <= 180)) not valid;

-- Both or neither. A half-written point is worse than none: the map would place
-- the pin on the prime meridian rather than skip it.
alter table public.waypoints drop constraint if exists waypoints_latlon_together;
alter table public.waypoints add constraint waypoints_latlon_together
  check ((lat is null) = (lon is null)) not valid;

-- The page's own question is "which rows in this city still need locating", so
-- that is what gets the index.
create index if not exists waypoints_unlocated_idx
  on public.waypoints (city)
  where lat is null;
