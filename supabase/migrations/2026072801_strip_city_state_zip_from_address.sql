-- waypoints.address holds the STREET ONLY
-- ---------------------------------------------------------------------------
-- city, state and zip are their own columns. Repeating them inside `address`
-- makes the value redundant, breaks the geocode queries that append those
-- fields themselves ("800 Decatur St, New Orleans, LA 70116, New Orleans, LA"),
-- and shows the city twice wherever a waypoint is rendered.
--
-- 36 of 38 rows had it, because the "With AI" prompt's own JSON example was
-- '"address": "800 Decatur St, New Orleans, LA 70116"'. The prompt now shows a
-- street-only example and forbids repeating the other fields; this cleans up
-- the rows written before that fix.
--
-- Rule: strip everything from the first comma onward, but ONLY when the segment
-- immediately after that comma is the row's own city. So
--
--   "1250 Bannock St, Denver, CO 80204"        -> "1250 Bannock St"
--   "E Colfax Ave and Broadway, Denver, CO"    -> "E Colfax Ave and Broadway"
--   "1250 Bannock St Suite 200, Denver, CO"    -> "1250 Bannock St Suite 200"
--
-- and a row whose second segment is NOT the city is left alone rather than
-- guessed at — e.g. "Denver Art Museum, 100 W 14th Ave, Denver, CO" keeps its
-- value and shows up in the verification query below for a human to look at.
--
-- Idempotent: after one run nothing matches the where clause. Rollback is not
-- possible (the discarded text is redundant with city/state/zip by definition),
-- so the pre-state is preserved in the verification query, not in an undo.

update public.waypoints
   set address = btrim(split_part(address, ',', 1))
 where address like '%,%'
   and nullif(btrim(city), '') is not null
   and lower(btrim(split_part(address, ',', 2))) = lower(btrim(city));

-- ── Verify ──────────────────────────────────────────────────────────────────
-- 1. Expect 0 rows — nothing left where the address repeats its own city:
--
--   select wpid, address, city
--     from public.waypoints
--    where address ilike '%' || city || '%'
--      and nullif(btrim(city), '') is not null;
--
-- 2. Addresses that still contain a comma, for a human to eyeball. These were
--    deliberately NOT touched (second segment wasn't the city):
--
--   select wpid, name, address, city, state, zip
--     from public.waypoints
--    where address like '%,%'
--    order by wpid;
