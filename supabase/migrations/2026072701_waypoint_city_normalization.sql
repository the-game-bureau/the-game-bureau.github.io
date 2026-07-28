-- Waypoint city normalization + missing venue cities
-- ---------------------------------------------------------------------------
-- The waypoints city filter in /mc/waypoints/ joins waypoints.city to
-- public.cities on the city NAME (waypoints store a bare "New Orleans" plus a
-- separate state; the catalog stores canonical "New Orleans, Louisiana"). That
-- surfaced 19 waypoint cities the catalog doesn't know, in two fixable groups:
--
--   1. Localized or venue-level aliases for a city already in the catalog.
--      These are relabelled onto the catalog city, so their waypoints stop
--      being orphans and start counting toward the right city.
--   2. Stadium towns that are real, distinct municipalities. These are added to
--      public.cities as ignored=true (venue only) — the same treatment Orchard
--      Park, Santa Clara, Glendale, and Miami Gardens already get.
--
-- NOT handled here, because they are judgement calls rather than data errors:
--   * Suburb-vs-metro: Hapeville and Smyrna (Atlanta), Jacksonville Beach and
--     Neptune Beach (Jacksonville), Marin County (San Francisco / the Golden
--     Gate Bridge). Whether a walking tour in Jacksonville Beach is "in
--     Jacksonville" is a product decision, not a typo.
--   * Four real cities absent from the catalog entirely: Frankfurt am Main,
--     São Paulo, Dublin, Liverpool. Each has exactly one waypoint (a stadium,
--     except Liverpool's Cavern Club). They need a call on whether they are
--     destinations we sell and make soundtracks for, or venue-only.
--
-- Idempotent: every statement is guarded or conflict-safe. Rollback at bottom.

-- ── 1. Relabel alias cities onto their catalog city ─────────────────────────
-- Guarded on the current value, so re-running after a later manual edit is a
-- no-op rather than a clobber.

update public.waypoints set city = 'Mexico City', state = 'Mexico'
  where city = 'Ciudad de México';            -- Estadio Azteca (wpid 1229)

update public.waypoints set city = 'Munich', state = 'Germany'
  where city = 'München';                     -- Allianz Arena (wpid 1223)

update public.waypoints set city = 'London', state = 'United Kingdom'
  where city = 'Wembley, London';             -- Wembley Stadium (wpid 1222)

update public.waypoints set city = 'Melbourne', state = 'Australia'
  where city = 'Richmond VIC';                -- Melbourne Cricket Ground (wpid 1230)

-- ── 2. Add the stadium towns as venue-only cities ───────────────────────────
-- Do NOT send slug: the cities_fill_slug BEFORE INSERT trigger derives it from
-- the city string (and cities_sync_geo fills the structured geo columns).
-- on conflict (city) keeps this safe to re-run.

insert into public.cities (city, ignored) values
  ('Arlington, Texas',          true),  -- AT&T Stadium (wpid 1200)
  ('East Rutherford, New Jersey', true),  -- MetLife Stadium (wpid 1213)
  ('Foxborough, Massachusetts', true),  -- Gillette Stadium (wpid 59)
  ('Inglewood, California',     true),  -- SoFi Stadium (wpid 1209)
  ('Irving, Texas',             true),  -- former Texas Stadium site (wpid 57)
  ('Summerfield, Maryland',     true)   -- Northwest Stadium (wpid 1220)
on conflict (city) do nothing;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect zero rows: every waypoint city should now resolve to a catalog city,
-- apart from the deferred judgement calls listed at the top.
--
--   select w.city, count(*)
--     from public.waypoints w
--    where nullif(btrim(w.city), '') is not null
--      and lower(split_part(w.city, ',', 1)) not in (
--            select lower(split_part(c.city, ',', 1)) from public.cities c)
--    group by w.city order by w.city;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- update public.waypoints set city = 'Ciudad de México' where city = 'Mexico City' and name = 'Estadio Azteca';
-- update public.waypoints set city = 'München'          where city = 'Munich'      and name = 'Allianz Arena';
-- update public.waypoints set city = 'Wembley, London'  where city = 'London'      and name = 'Wembley Stadium';
-- update public.waypoints set city = 'Richmond VIC'     where city = 'Melbourne'   and name = 'Melbourne Cricket Ground';
-- delete from public.cities where city in (
--   'Arlington, Texas', 'East Rutherford, New Jersey', 'Foxborough, Massachusetts',
--   'Inglewood, California', 'Irving, Texas', 'Summerfield, Maryland');
