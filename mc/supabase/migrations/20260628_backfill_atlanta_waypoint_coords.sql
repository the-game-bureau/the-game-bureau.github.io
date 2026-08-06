-- Backfill coordinates for the Atlanta Phoenix Flies waypoints. The seed insert
-- (20260626) left some rows with null lat/lon; fill them from the geocoded values
-- here. Only updates rows whose coordinates are still null, so it's idempotent
-- and never clobbers coordinates set elsewhere.
update public.waypoints w
set lat = v.lat, lon = v.lon
from (values
  ('L.P. Grant Mansion', 33.740721, -84.377253),
  ('APEX Museum', 33.755434, -84.383103),
  ('Atlanta Daily World Building', 33.75541, -84.382823),
  ('Atlanta History Center', 33.841782, -84.38601),
  ('Balzer Theater at Herren''s', 33.757027, -84.389607),
  ('Wimbish House (Atlanta Woman''s Club)', 33.785906, -84.383515),
  ('Fulton Bag & Cotton Mill', 33.749204, -84.369519),
  ('Burns Club of Atlanta', 33.727334, -84.35553),
  ('Center for Puppetry Arts', 33.792758, -84.389814),
  ('Historic Shoupade Park', 33.826814, -84.495229),
  ('MARTA Five Points Station', 33.753759, -84.39108),
  ('East Lake Golf Club', 33.743605, -84.302457),
  ('First Church of Christ, Scientist', 33.788947, -84.383539),
  ('First Presbyterian Church of Atlanta', 33.790806, -84.386201),
  ('Swan Coach House', 33.840027, -84.386129),
  ('The Fox Theatre', 33.772643, -84.385562),
  ('Georgia State Capitol', 33.749055, -84.388171),
  ('Goodrum House', 33.843515, -84.3961),
  ('The Healey Building', 33.756019, -84.389785),
  ('Historic Oakland Cemetery', 33.74749, -84.370855),
  ('Sylvester Cemetery', 33.732306, -84.329634),
  ('Margaret Mitchell House', 33.781291, -84.384671),
  ('Northside Drive Baptist Church', 33.839059, -84.408304),
  ('Peachtree Christian Church', 33.754012, -84.390034),
  ('Piedmont Driving Club', 33.787289, -84.378032),
  ('Piedmont Park', 33.7838, -84.378747),
  ('St. Mark United Methodist Church', 33.775915, -84.384113),
  ('Ivy Hall (SCAD)', 33.77211, -84.381127),
  ('The Temple', 33.796479, -84.387963),
  ('The Trolley Barn', 33.756181, -84.356076),
  ('Utoy Cemetery', 33.715633, -84.449494),
  ('Westview Cemetery', 33.747276, -84.431725),
  ('Rhodes Hall', 33.754012, -84.390034),
  ('King Keith House', 33.755718, -84.358071),
  ('Standing Peachtree Greenspace', 33.82622, -84.449935)
) as v(name, lat, lon)
where lower(w.name) = lower(v.name)
  and w.lat is null
  and v.lat is not null;
