-- Seed: Atlanta historic-site waypoints curated from the Atlanta Preservation
-- Center's 2018 "Phoenix Flies" program. Idempotent (matches on name+address),
-- so re-running won't duplicate. wpid is assigned by the table's trigger.
insert into public.waypoints (name, city, state, zip, address, description, lat, lon)
select v.name, v.city, v.state, v.zip, v.address, v.description, v.lat, v.lon
from (values
  ('L.P. Grant Mansion', 'Atlanta', 'GA', '30312', '327 St. Paul Avenue SE', '1856 mansion, Atlanta''s oldest house and HQ of the Atlanta Preservation Center; birthplace of golfer Bobby Jones and once owned by Margaret Mitchell.', 33.740721, -84.377253),
  ('APEX Museum', 'Atlanta', 'GA', '30303', '135 Auburn Avenue NE', 'African American history museum on historic Sweet Auburn Avenue.', 33.755434, -84.383103),
  ('Atlanta Daily World Building', 'Atlanta', 'GA', '30303', '145 Auburn Avenue NE', 'Longtime home of the Atlanta Daily World, a pioneering Black newspaper.', 33.75541, -84.382823),
  ('Atlanta History Center', 'Atlanta', 'GA', '30305', '130 West Paces Ferry Road NW', '33-acre history campus with the Swan House, Smith Farm, and the Atlanta Cyclorama.', 33.841782, -84.38601),
  ('Balzer Theater at Herren''s', 'Atlanta', 'GA', '30303', '84 Luckie Street NW', 'Theater on the site of Herren''s, the first Atlanta restaurant to voluntarily desegregate.', 33.757027, -84.389607),
  ('Wimbish House (Atlanta Woman''s Club)', 'Atlanta', 'GA', '30309', '1150 Peachtree Street NE', '1906 Beaux-Arts mansion, longtime home of the Atlanta Woman''s Club.', 33.785906, -84.383515),
  ('Fulton Bag & Cotton Mill', 'Atlanta', 'GA', '30312', '170 Boulevard SE', '1881 textile mill, now the Cotton Mill Lofts, centerpiece of the Cabbagetown district.', 33.749204, -84.369519),
  ('Burns Club of Atlanta', 'Atlanta', 'GA', '30316', '988 Alloway Place SE', 'Replica of Robert Burns''s Scottish cottage and home of the Burns Club of Atlanta.', 33.727334, -84.35553),
  ('Cathedral of St. Philip', 'Atlanta', 'GA', '30305', '2744 Peachtree Road NW', 'Large Episcopal cathedral in Buckhead.', 33.830709, -84.387283),
  ('Center for Puppetry Arts', 'Atlanta', 'GA', '30309', '1404 Spring Street NW', 'Museum and theater devoted to puppetry, including a Jim Henson collection.', 33.792758, -84.389814),
  ('Historic Shoupade Park', 'Smyrna', 'GA', '30080', '4770 Oakdale Road', 'Civil War ''Shoupade'' fortification remnants along the Silver Comet Rail Trail.', 33.826814, -84.495229),
  ('MARTA Five Points Station', 'Atlanta', 'GA', '30303', '30 Alabama Street SW', 'Central MARTA transit hub in downtown Atlanta.', 33.753759, -84.39108),
  ('East Lake Golf Club', 'Atlanta', 'GA', '30317', '2575 Alston Drive SE', 'Historic golf club, home course of Bobby Jones.', 33.743605, -84.302457),
  ('First Church of Christ, Scientist', 'Atlanta', 'GA', '30309', '150 15th Street NE', 'Historic Midtown church.', 33.788947, -84.383539),
  ('First Presbyterian Church of Atlanta', 'Atlanta', 'GA', '30309', '1328 Peachtree Street NE', 'Gothic Revival church noted for its stained glass windows and organs.', 33.790806, -84.386201),
  ('Swan Coach House', 'Atlanta', 'GA', '30305', '3130 Slaton Drive NW', '1920s carriage house at the Atlanta History Center; restaurant and gallery.', 33.840027, -84.386129),
  ('The Fox Theatre', 'Atlanta', 'GA', '30308', '660 Peachtree Street NE', '1929 Moorish movie palace saved from demolition in 1975.', 33.772643, -84.385562),
  ('Georgia State Capitol', 'Atlanta', 'GA', '30334', '206 Washington Street SW', '1889 gold-domed Georgia State Capitol and Capitol Museum.', 33.749055, -84.388171),
  ('Glenn Memorial United Methodist Church', 'Atlanta', 'GA', '30307', '1660 N. Decatur Road NE', 'Emory-area Methodist church with a historic Little Chapel.', 33.788643, -84.324188),
  ('Goodrum House', 'Atlanta', 'GA', '30305', '320 West Paces Ferry Road NW', '1929 Buckhead mansion designed by architect Philip Trammell Shutze.', 33.843515, -84.3961),
  ('The Healey Building', 'Atlanta', 'GA', '30303', '57 Forsyth Street NW', '1913 Gothic Revival skyscraper in the Fairlie-Poplar district.', 33.756019, -84.389785),
  ('Historic Oakland Cemetery', 'Atlanta', 'GA', '30312', '248 Oakland Avenue SE', '1850 Victorian garden cemetery; resting place of Bobby Jones and Margaret Mitchell.', 33.74749, -84.370855),
  ('Sylvester Cemetery', 'Atlanta', 'GA', '30316', '2073 Braeburn Circle SE', 'Historic East Atlanta cemetery.', 33.732306, -84.329634),
  ('Margaret Mitchell House', 'Atlanta', 'GA', '30309', '957 Crescent Avenue NE', 'Apartment where Margaret Mitchell wrote Gone With the Wind.', 33.781291, -84.384671),
  ('Museum of Contemporary Art of Georgia (MOCA GA)', 'Atlanta', 'GA', '30309', '75 Bennett Street NW, Suite A2', 'Museum dedicated to contemporary art by Georgia artists.', null, null),
  ('Northside Drive Baptist Church', 'Atlanta', 'GA', '30305', '3100 Northside Drive NW', 'Church known for its stained glass.', 33.839059, -84.408304),
  ('Peachtree Christian Church', 'Atlanta', 'GA', '30309', '1580 Peachtree Street NW', 'Gothic Revival church on Peachtree Street.', 33.754012, -84.390034),
  ('Piedmont Driving Club', 'Atlanta', 'GA', '30309', '1215 Piedmont Avenue NE', 'Historic private social club founded in 1887.', 33.787289, -84.378032),
  ('Piedmont Park', 'Atlanta', 'GA', '30309', '1071 Piedmont Avenue NE', 'Atlanta''s signature urban park, redesigned for the 1895 Cotton States Exposition.', 33.7838, -84.378747),
  ('St. Anne''s Episcopal Church', 'Atlanta', 'GA', '30327', '3098 Saint Anne''s Lane NW', 'Church noted for its stained glass windows and Flentrop organ.', 33.839439, -84.417866),
  ('St. Mark United Methodist Church', 'Atlanta', 'GA', '30308', '781 Peachtree Street NE', 'Romanesque Revival church in Midtown.', 33.775915, -84.384113),
  ('Ivy Hall (SCAD)', 'Atlanta', 'GA', '30308', '179 Ponce de Leon Avenue NE', '1883 Edward C. Peters Mansion, a Victorian landmark restored by SCAD.', 33.77211, -84.381127),
  ('Second-Ponce de Leon Baptist Church', 'Atlanta', 'GA', '30305', '2715 Peachtree Road NW', 'Large historic Buckhead church.', 33.828993, -84.386871),
  ('Sweet Auburn Curb Market', 'Atlanta', 'GA', '30303', '209 Edgewood Avenue SE', '1924 municipal public market in the Sweet Auburn district.', null, null),
  ('The Temple', 'Atlanta', 'GA', '30309', '1589 Peachtree Street NE', 'Historic Reform synagogue, bombed in a 1958 civil-rights-era attack.', 33.796479, -84.387963),
  ('The Trolley Barn', 'Atlanta', 'GA', '30307', '963 Edgewood Avenue NE', '1889 streetcar barn in Inman Park, now an event hall.', 33.756181, -84.356076),
  ('Utoy Cemetery', 'Atlanta', 'GA', '30311', '1465 Cahaba Drive SW', 'Historic cemetery on the site of the Civil War Battle of Utoy Creek.', 33.715633, -84.449494),
  ('Westview Cemetery', 'Atlanta', 'GA', '30310', '1680 Westview Drive SW', '1884 cemetery, one of the largest in the Southeast.', 33.747276, -84.431725),
  ('The Wren''s Nest', 'Atlanta', 'GA', '30310', '1050 Ralph David Abernathy Boulevard SW', 'Home of Joel Chandler Harris, author of the Uncle Remus tales, in the West End.', 33.737659, -84.422176),
  ('Rhodes Hall', 'Atlanta', 'GA', '30309', '1516 Peachtree Street NW', '1904 Romanesque Revival ''castle on Peachtree''.', 33.754012, -84.390034),
  ('King Keith House', 'Atlanta', 'GA', '30307', '889 Edgewood Avenue NE', 'Queen Anne Victorian, the most-photographed ''painted lady'' of Inman Park.', 33.755718, -84.358071),
  ('Standing Peachtree Greenspace', 'Atlanta', 'GA', '30327', '2630 Ridgewood Road NW', 'Site near Standing Peachtree, an early Creek settlement on the Chattahoochee.', 33.82622, -84.449935)
) as v(name, city, state, zip, address, description, lat, lon)
where not exists (
  select 1 from public.waypoints w
  where lower(w.name) = lower(v.name)
    and lower(coalesce(w.address,'')) = lower(coalesce(v.address,''))
);
