-- Delete the four waypoints in cities that aren't in public.cities
-- ---------------------------------------------------------------------------
-- The /mc/waypoints/ city filter surfaced four waypoints sitting in cities the
-- catalog has never had: Frankfurt am Main, São Paulo, Dublin, and Liverpool.
-- Decision (2026-07-27): remove the waypoints rather than add the cities.
--
-- Safety checks run before writing this:
--   * All 395 rows in public.games were scanned for these wpids. None
--     references 38, 1224, 1227, or 1228, so no route loses a stop.
--   * Nothing else in the schema carries a foreign key to waypoints.wpid.
--
-- Three of these are NFL International Series venues whose sibling cities
-- (Berlin, Madrid, Munich, London, Mexico City, Rio de Janeiro, Melbourne,
-- Toronto) ARE in the catalog as normal destinations, so if the International
-- Series set is ever rebuilt these four will need re-adding — the full rows are
-- preserved in the rollback block below for exactly that reason.
--
-- Idempotent: deleting an already-deleted row is a no-op.

delete from public.waypoints
 where wpid in (
   38,    -- The Cavern Club, Liverpool, England
   1224,  -- Deutsche Bank Park, Frankfurt am Main, Germany
   1227,  -- Croke Park, Drumcondra (Dublin 3), Ireland
   1228   -- Neo Química Arena, São Paulo, Brazil
 );

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0:
--   select count(*) from public.waypoints where wpid in (38, 1224, 1227, 1228);
--
-- Remaining waypoint cities with no catalog match — after this and 2026072701
-- these should be only the deferred suburb-vs-metro calls (Hapeville, Smyrna,
-- Jacksonville Beach, Neptune Beach, Marin County):
--   select w.city, count(*)
--     from public.waypoints w
--    where nullif(btrim(w.city), '') is not null
--      and lower(split_part(w.city, ',', 1)) not in (
--            select lower(split_part(c.city, ',', 1)) from public.cities c)
--    group by w.city order by w.city;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Full rows as they stood immediately before deletion. Restores the original
-- wpids; drop the wpid column from both lists to let the sequence reassign.
--
-- insert into public.waypoints
--   (wpid, city, state, address, name, description, w3w, zip, lat, lon)
-- values
--   (38, 'Liverpool', 'England', 'Mathew Street', 'The Cavern Club',
--    'The Cavern Club is a music venue on Mathew Street, Liverpool, England.',
--    'https://w3w.co/exact.level.allows', 'L2 6RE', 53.406353, -2.987316),
--   (1224, 'Frankfurt am Main', 'Germany', '362 Mörfelder Landstraße', 'Deutsche Bank Park',
--    'Frankfurt venue for the NFL International Series.',
--    'https://w3w.co/often.arranged.succeed', '60528', 50.068581, 8.645472),
--   (1227, 'Drumcondra, Dublin 3', 'Ireland', 'Jones'' Rd', 'Croke Park',
--    'Dublin venue for the NFL International Series.',
--    'https://w3w.co/sake.storm.trap', null, null, null),
--   (1228, 'São Paulo', 'Brazil', '3158 Avenida Sport Club Corinthians Paulista', 'Neo Química Arena',
--    'São Paulo (Arena Corinthians) venue for the NFL International Series.',
--    null, '03591', -23.545262, -46.474231);
