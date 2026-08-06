-- Venue-only towns: present in public.cities, hidden from all three surfaces.
-- ---------------------------------------------------------------------------
-- A stadium is often not in the city whose name is on the jersey. The Giants
-- and Jets play in East Rutherford, the Cowboys in Arlington, the 49ers in
-- Santa Clara, the Bills in Orchard Park. Those towns have to exist in the city
-- catalog — anchor_events.city and waypoints.city both point at them, and a
-- city the catalog does not know shows up as an orphan — but none of them is a
-- place we sell into. Nobody searches /games/ for Orchard Park, and there is no
-- Inglewood gift shop or Foxborough soundtrack.
--
-- So each one is inserted if missing and flagged hidden on all three surfaces,
-- plus `ignored` for the deprecated single-flag readers. on conflict (city) do
-- update means this also FIXES a row that already exists with the flags unset,
-- which is the actual gap: 2026072701 inserted six of these with `ignored` only,
-- back before the three columns existed.
--
-- Do NOT send slug — the cities_fill_slug BEFORE INSERT trigger derives it, and
-- cities_sync_geo fills the structured geo columns.
--
-- ── WHAT THIS DELIBERATELY DOES NOT TOUCH ───────────────────────────────────
-- "Venue city" here means a town that is ONLY a venue. It does not mean every
-- city that hosts a game. Thirteen of the sixteen NFL Week 1 host cities are
-- the club's own market and are real destinations for us:
--
--   Seattle · Charlotte · Cincinnati · Detroit · Houston · Indianapolis
--   Jacksonville · Pittsburgh · Nashville · Las Vegas · Minneapolis
--   Philadelphia · Kansas City
--
-- Hiding those would pull them out of the /games/ finder, the /soundtracks/
-- cassette rail and Shop By City — several of them already have tapes and gift
-- listings. They are left alone on purpose. If any of them should be hidden,
-- that is a per-city editorial call, made with the checkboxes on the row in
-- data/cities.html rather than in a migration.
--
-- Melbourne, Australia is also left alone. It hosts one Week 1 game, but it is
-- a real international city, not a stadium town, and the same judgement call
-- was already deferred once in 2026072701.

insert into public.cities
  (city, hide_from_games, hide_from_soundtracks, hide_from_gift_shop, ignored)
values
  ('Arlington, Texas',            true, true, true, true),  -- AT&T Stadium — Cowboys (market: Dallas)
  ('East Rutherford, New Jersey', true, true, true, true),  -- MetLife Stadium — Giants + Jets (market: New York)
  ('Foxborough, Massachusetts',   true, true, true, true),  -- Gillette Stadium — Patriots (market: Boston / New England)
  ('Glendale, Arizona',           true, true, true, true),  -- State Farm Stadium — Cardinals (market: Phoenix)
  ('Inglewood, California',       true, true, true, true),  -- SoFi Stadium — Rams + Chargers (market: Los Angeles)
  ('Irving, Texas',               true, true, true, true),  -- former Texas Stadium site — historical
  ('Miami Gardens, Florida',      true, true, true, true),  -- Hard Rock Stadium — Dolphins (market: Miami)
  ('Orchard Park, New York',      true, true, true, true),  -- Highmark Stadium — Bills (market: Buffalo)
  ('Paradise, Nevada',            true, true, true, true),  -- Allegiant Stadium — Raiders (market: Las Vegas)
  ('Santa Clara, California',     true, true, true, true),  -- Levi's Stadium — 49ers (market: San Francisco)
  ('Summerfield, Maryland',       true, true, true, true)   -- Northwest Stadium — Commanders (market: Washington)
on conflict (city) do update
   set hide_from_games       = true,
       hide_from_soundtracks = true,
       hide_from_gift_shop   = true,
       ignored               = true;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- All eleven hidden on all three surfaces:
--   select city, hide_from_games, hide_from_soundtracks, hide_from_gift_shop, ignored
--     from public.cities
--    where hide_from_games and hide_from_soundtracks and hide_from_gift_shop
--    order by city;
--
-- No event points at a city the catalog does not know. Anything this returns is
-- either a venue town to add above, or a typo in the event's City field:
--   select distinct e.city
--     from public.anchor_events e
--    where nullif(btrim(e.city), '') is not null
--      and not exists (select 1 from public.cities c where c.city = e.city)
--    order by e.city;
--
-- Sanity check the other direction — none of the real markets got caught:
--   select city from public.cities
--    where hide_from_games
--      and city in ('Seattle, Washington', 'Philadelphia, Pennsylvania',
--                   'Kansas City, Missouri', 'Minneapolis, Minnesota');
-- Expect zero rows.

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Clears the flags but keeps the rows; deleting them would orphan the events
-- and waypoints filed under those towns.
--   update public.cities
--      set hide_from_games = false, hide_from_soundtracks = false,
--          hide_from_gift_shop = false, ignored = false
--    where city in ('Arlington, Texas', 'East Rutherford, New Jersey', ...);
