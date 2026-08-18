-- WAYPOINT COORDINATE BACKFILL, 2026-08-18.
--
-- 31 of 41 unlocated waypoints resolved, in three passes, all through
-- Nominatim at its one-request-per-second policy limit.
--
-- EVERY STATEMENT IS GUARDED BY `and w.lat is null`, so this is safe to run
-- twice and cannot move a point that already exists. The second and third
-- passes matched on NAME rather than address and are weaker for it: each line
-- carries what Nominatim actually returned, and the city had to appear in it.
--
-- Ten rows are left null on purpose. See the note at the bottom.

-- BY STREET ADDRESS (24 rows)
-- Coordinates from Nominatim, 2026-08-18.
-- Only rows that were null are touched; a re-run cannot move a point.
update public.waypoints w set lat = v.lat, lon = v.lon
from (values
  (70, 33.758451, -84.392375),
  (262, 33.759496, -84.392887),
  (263, 33.763268, -84.395117),
  (264, 33.764049, -84.39304),
  (265, 33.758964, -84.391989),
  (266, 33.758713, -84.391422),
  (267, 33.757687, -84.393436),
  (268, 33.757327, -84.393318),
  (271, 39.287667, -76.620623),
  (272, 39.289749, -76.620903),
  (273, 39.291892, -76.621775),
  (274, 39.290004, -76.623358),
  (275, 39.288702, -76.623768),
  (276, 39.290114, -76.620419),
  (277, 39.284465, -76.617277),
  (278, 39.286591, -76.618154),
  (279, 41.785969, -87.742136),
  (280, 41.886019, -87.637309),
  (281, 41.888203, -87.628488),
  (292, 41.888244, -87.629109),
  (294, 41.888498, -87.634456),
  (295, 41.889017, -87.629277),
  (296, 41.892881, -87.62725),
  (297, 41.892186, -87.626254)
) as v(wpid, lat, lon)
where w.wpid = v.wpid and w.lat is null;

-- BY NAME + CITY (5 rows)
-- Coordinates matched BY NAME + CITY, 2026-08-18.
-- Weaker than an address match: each line shows what Nominatim actually
-- returned. Read them before running this.
update public.waypoints w set lat = v.lat, lon = v.lon
from (values
  (63, 39.286772, -76.601423),  -- Little Italy  ->  Little Italy, Baltimore, Maryland, United States
  (84, 39.290923, -76.609598),  -- War Memorial Plaza  ->  War Memorial Plaza, Downtown, Baltimore, Maryland, United States
  (99, 33.755426, -84.388486),  -- Woodruff Park  ->  Woodruff Park, Old Fourth Ward, Atlanta, Fulton County, Georgia, United States
  (103, 33.752352, -84.390130),  -- Underground Atlanta  ->  Underground Atlanta, Lower Wall Street Southeast, Five Points, Old Fourth Ward, Atlanta, F
  (104, 33.760144, -84.393453)  -- Centennial Olympic Park  ->  Centennial Olympic Park, 265, Old Fourth Ward, Atlanta, Fulton County, Georgia, 30313, Uni
) as v(wpid, lat, lon)
where w.wpid = v.wpid and w.lat is null;

-- BY CLEANED-UP NAME (2 rows)
-- Coordinates matched by a CLEANED-UP name search, 2026-08-18.
-- The query that matched and what came back are on each line. Read them.
update public.waypoints w set lat = v.lat, lon = v.lon
from (values
  (73, 35.227207, -80.843090),  -- Independence Square and Four Corner Sculptures  ->  Independence Square, South Tryon Street, Uptown, Charlotte, Mecklenburg County, 
  (100, 33.754652, -84.389275)  -- Atlanta from the Ashes (The Phoenix)  ->  Atlanta from the Ashes, 33, Gilmer Street Southeast, Five Points, Old Fourth War
) as v(wpid, lat, lon)
where w.wpid = v.wpid and w.lat is null;

-- ── THE TEN LEFT NULL, AND WHY ─────────────────────────────────────────────
-- Null means "not located yet", never "has no location", and the page geocodes
-- one on demand -- so leaving these is the honest answer, not a gap. A plausible
-- wrong point is much worse here than a null: nobody rechecks a pin that looks
-- fine. Press Edit then Locate on any of them, or type the point in.
--
--   4    Colfax Avenue at Broadway          an INTERSECTION. A street's centroid
--   14   Cherry Creek Trail at Larimer St   can be a mile from the corner, so
--   16   Cat Alley                          approximating one is not offered.
--   25   Historic Market Street             A SPAN of street, same reason.
--   55   Top of the World, Inner Harbor     a FLOOR of a building (401 E Pratt,
--                                            27th) -- the address geocodes, the
--                                            observation deck is not its own place.
--   57   Pride of Baltimore II              a SHIP. It has no fixed location.
--   101  Five Points Monument               not in OpenStreetMap under any name
--   134  Michigan Soldiers' and Sailors'    tried; Campus Martius is the place it
--                                            stands in, which is a different row.
--   135  Philip A. Hart Plaza               tried five spellings, no city match.
--   211  Rice-Totten Stadium                address is "14000 Highway 82 West"
--                                            with no city; it is at Mississippi
--                                            Valley State University, Itta Bena.
