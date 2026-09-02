-- COLLEGE TOWNS, THE ONES THAT CAN BE STOOD BEHIND. 2026-09-01.
--
-- 378 audiences carried no city, every one of them NCAAF -- `teams.city_name`
-- was NULL on every college row when the club list was merged in, so none of
-- them ever had one.
--
-- **THIS FILLS THE ONES I WOULD DEFEND AND LEAVES THE REST BLANK, DELIBERATELY.**
-- A wrong city here is not a cosmetic error: `tgb_slug(city)` is how
-- `destinations` is keyed and how `tgb_anti_audience` finds a game's rival, so
-- a plausible-looking mistake resolves silently and looks exactly like a right
-- answer. **A blank is visible; a wrong town is not.** That is the same rule
-- this project already keeps for a waypoint's coordinates and for a Spotify id.
--
-- WHAT IS IN: the Ivies, the FCS conferences, the HBCUs, the service academies
-- and the well-known Division III programmes -- schools whose town is a matter
-- of record rather than recall.
--
-- WHAT IS LEFT OUT, and why each: a name that does not identify one school
-- (`Monmouth` is a New Jersey university and an Illinois college, and both play
-- football), and the long tail of Division II and III programmes whose town I
-- would be guessing at. **They are better blank**, and the room's own red pen
-- and its `Nowhere` filter are what make them findable.
--
-- THE REST ARE A JOB FOR THE ROOM'S PROMPT, which is the mechanism this project
-- already uses for bulk research it cannot do from memory: an AI with a browser
-- reads each school's own page and hands back one `update` block a person runs.
-- That button is currently a stub.
--
-- THE FORM IS `City, ST`, which is what every other row holds and what
-- `tgb_slug` turns into a `places.id`. **A town that is not in `public.places`
-- is still stored and still useful** -- the badge draws it, the search finds it,
-- the city filter offers it, and both city lists pick it up -- but it does not
-- reach `destinations` until the place exists.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

update public.audiences a set city = v.city
  from (values
    -- The Ivy League
    ('Brown', 'Providence, RI'),
    ('Columbia', 'New York, NY'),
    ('Cornell', 'Ithaca, NY'),
    ('Dartmouth', 'Hanover, NH'),
    ('Harvard', 'Cambridge, MA'),
    ('Pennsylvania', 'Philadelphia, PA'),
    ('Princeton', 'Princeton, NJ'),
    ('Yale', 'New Haven, CT'),

    -- The Patriot League
    ('Bucknell', 'Lewisburg, PA'),
    ('Colgate', 'Hamilton, NY'),
    ('Fordham', 'Bronx, NY'),
    ('Georgetown', 'Washington, DC'),
    ('Holy Cross', 'Worcester, MA'),
    ('Lafayette', 'Easton, PA'),
    ('Lehigh', 'Bethlehem, PA'),

    -- HBCUs
    ('Alabama A&M', 'Normal, AL'),
    ('Alabama State', 'Montgomery, AL'),
    ('Albany State', 'Albany, GA'),
    ('Alcorn State', 'Lorman, MS'),
    ('Allen', 'Columbia, SC'),
    ('Arkansas-Pine Bluff', 'Pine Bluff, AR'),
    ('Benedict', 'Columbia, SC'),
    ('Bethune-Cookman', 'Daytona Beach, FL'),
    ('Bowie State', 'Bowie, MD'),
    ('Central State', 'Wilberforce, OH'),
    ('Delaware State', 'Dover, DE'),
    ('Edward Waters', 'Jacksonville, FL'),
    ('Elizabeth City State', 'Elizabeth City, NC'),
    ('Fayetteville State', 'Fayetteville, NC'),
    ('Florida A&M', 'Tallahassee, FL'),
    ('Fort Valley State', 'Fort Valley, GA'),
    ('Hampton', 'Hampton, VA'),
    ('Howard', 'Washington, DC'),
    ('Jackson State', 'Jackson, MS'),
    ('Johnson C. Smith', 'Charlotte, NC'),
    ('Kentucky State', 'Frankfort, KY'),
    ('Lane College', 'Jackson, TN'),
    ('Langston', 'Langston, OK'),
    ('Miles', 'Fairfield, AL'),
    ('Mississippi Valley State', 'Itta Bena, MS'),
    ('Morehouse', 'Atlanta, GA'),
    ('Morgan State', 'Baltimore, MD'),
    ('Norfolk State', 'Norfolk, VA'),
    ('North Carolina A&T', 'Greensboro, NC'),
    ('North Carolina Central', 'Durham, NC'),
    ('Prairie View A&M', 'Prairie View, TX'),
    ('Virginia State', 'Petersburg, VA'),

    -- FCS
    ('Austin Peay', 'Clarksville, TN'),
    ('Cal Poly', 'San Luis Obispo, CA'),
    ('Campbell', 'Buies Creek, NC'),
    ('Central Arkansas', 'Conway, AR'),
    ('Central Connecticut', 'New Britain, CT'),
    ('Charleston Southern', 'Charleston, SC'),
    ('Chattanooga', 'Chattanooga, TN'),
    ('Davidson', 'Davidson, NC'),
    ('Dayton', 'Dayton, OH'),
    ('Drake', 'Des Moines, IA'),
    ('Duquesne', 'Pittsburgh, PA'),
    ('East Tennessee State', 'Johnson City, TN'),
    ('Eastern Illinois', 'Charleston, IL'),
    ('Eastern Kentucky', 'Richmond, KY'),
    ('Eastern Washington', 'Cheney, WA'),
    ('Elon', 'Elon, NC'),
    ('Furman', 'Greenville, SC'),
    ('Gardner-Webb', 'Boiling Springs, NC'),
    ('Houston Christian', 'Houston, TX'),
    ('Idaho', 'Moscow, ID'),
    ('Idaho State', 'Pocatello, ID'),
    ('Illinois State', 'Normal, IL'),
    ('Indiana State', 'Terre Haute, IN'),
    ('Lamar', 'Beaumont, TX'),
    ('Maine', 'Orono, ME'),
    ('Marist', 'Poughkeepsie, NY'),
    ('McNeese', 'Lake Charles, LA'),
    ('Mercer', 'Macon, GA'),
    ('Montana', 'Missoula, MT'),
    ('Montana State', 'Bozeman, MT'),
    ('Morehead State', 'Morehead, KY'),
    ('Murray State', 'Murray, KY'),
    ('New Hampshire', 'Durham, NH'),
    ('Nicholls', 'Thibodaux, LA'),
    ('North Alabama', 'Florence, AL'),
    ('North Dakota', 'Grand Forks, ND'),
    ('North Dakota State', 'Fargo, ND'),
    ('Northern Arizona', 'Flagstaff, AZ'),
    ('Northern Colorado', 'Greeley, CO'),
    ('Northern Iowa', 'Cedar Falls, IA'),
    ('Northwestern State', 'Natchitoches, LA'),
    ('Portland State', 'Portland, OR'),
    ('Presbyterian', 'Clinton, SC'),
    ('Rhode Island', 'Kingston, RI'),
    ('Richmond', 'Richmond, VA'),
    ('Sacramento State', 'Sacramento, CA'),
    ('San Diego', 'San Diego, CA'),
    ('South Dakota', 'Vermillion, SD'),
    ('Southern Illinois', 'Carbondale, IL'),
    ('Southern Utah', 'Cedar City, UT'),
    ('Stetson', 'DeLand, FL'),
    ('Stonehill', 'Easton, MA'),
    ('Towson', 'Towson, MD'),
    ('UAlbany', 'Albany, NY'),
    ('UC Davis', 'Davis, CA'),
    ('Villanova', 'Villanova, PA'),
    ('Butler', 'Indianapolis, IN'),
    ('Merchant Marine', 'Kings Point, NY'),

    -- Division III, and the schools whose town is their name
    ('Amherst', 'Amherst, MA'),
    ('Assumption', 'Worcester, MA'),
    ('Bates', 'Lewiston, ME'),
    ('Bentley', 'Waltham, MA'),
    ('Bowdoin', 'Brunswick, ME'),
    ('Bridgewater State', 'Bridgewater, MA'),
    ('Buffalo State', 'Buffalo, NY'),
    ('Carnegie Mellon', 'Pittsburgh, PA'),
    ('Carthage', 'Kenosha, WI'),
    ('Chicago', 'Chicago, IL'),
    ('Colby', 'Waterville, ME'),
    ('Curry', 'Milton, MA'),
    ('Elmhurst', 'Elmhurst, IL'),
    ('Endicott', 'Beverly, MA'),
    ('Fitchburg State', 'Fitchburg, MA'),
    ('George Mason University', 'Fairfax, VA'),
    ('Hamilton', 'Clinton, NY'),
    ('Hartwick', 'Oneonta, NY'),
    ('Hobart College', 'Geneva, NY'),
    ('Husson', 'Bangor, ME'),
    ('Illinois College', 'Jacksonville, IL'),
    ('Illinois Wesleyan', 'Bloomington, IL'),
    ('Ithaca', 'Ithaca, NY'),
    ('Johns Hopkins University', 'Baltimore, MD'),
    ('Knox', 'Galesburg, IL'),
    ('Lake Forest', 'Lake Forest, IL'),
    ('Long Island University', 'Brookville, NY'),
    ('Maine Maritime', 'Castine, ME'),
    ('Mass Maritime', 'Buzzards Bay, MA'),
    ('Middlebury', 'Middlebury, VT'),
    ('Millikin', 'Decatur, IL'),
    ('MIT', 'Cambridge, MA'),
    ('New Haven', 'West Haven, CT'),
    ('Norwich', 'Northfield, VT'),
    ('North Park', 'Chicago, IL'),
    ('Pace', 'Pleasantville, NY'),
    ('Rochester (NY)', 'Rochester, NY'),
    ('Springfield', 'Springfield, MA'),
    ('St. John Fisher', 'Rochester, NY'),
    ('Tufts', 'Medford, MA'),
    ('UMass Dartmouth', 'Dartmouth, MA'),
    ('Union', 'Schenectady, NY'),
    ('Utica', 'Utica, NY'),
    ('Washington St. Louis', 'St. Louis, MO'),
    ('Wesleyan (CT)', 'Middletown, CT'),
    ('Wheaton (IL)', 'Wheaton, IL'),
    ('Worcester State', 'Worcester, MA'),
    ('Augustana (IL)', 'Rock Island, IL'),
    ('Trinity (TX)', 'San Antonio, TX')
  ) as v(first, city)
 where a.first = v.first
   and a.league = 'NCAAF'
   and (a.city is null or btrim(a.city) = '');

commit;

-- ---------------------------------------------------------------------------
-- Verify. How many were filled, how many are left, and -- the one that matters
-- -- that nothing already carrying a city was overwritten.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and city is not null and btrim(city) <> '') as college_with_a_city,
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and (city is null or btrim(city) = '')) as still_blank,
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select count(*) from public.audiences a where a.city is not null
--      and not exists (select 1 from public.places p
--                       where p.id = public.tgb_slug(a.city))) as city_with_no_place;
