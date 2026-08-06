-- Final coordinate backfill for the five Atlanta Phoenix Flies waypoints that
-- the initial geocode pass missed (resolved by name/refined address lookups).
-- Only updates rows whose coordinates are still null. Idempotent.
update public.waypoints w
set lat = v.lat, lon = v.lon
from (values
  ('Cathedral of St. Philip', 33.830709, -84.387283),
  ('Glenn Memorial United Methodist Church', 33.788643, -84.324188),
  ('Museum of Contemporary Art of Georgia (MOCA GA)', 33.812194, -84.39519),
  ('Second-Ponce de Leon Baptist Church', 33.828993, -84.386871),
  ('The Wren''s Nest', 33.737659, -84.422176)
) as v(name, lat, lon)
where lower(w.name) = lower(v.name)
  and w.lat is null;
