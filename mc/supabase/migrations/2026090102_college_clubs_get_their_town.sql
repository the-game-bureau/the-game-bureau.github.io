-- THE FBS COLLEGE CLUBS GET THEIR TOWN. 2026-09-01.
--
-- 499 of the 641 audiences had no `home_place_id`, and every one of them is a
-- college club. THERE IS NO COLUMN TO DERIVE IT FROM, which was measured rather
-- than assumed: `teams_retired` holds `city_name`, `venue_city` AND `game_city`
-- empty on all 515 NCAAF rows, and the only thing an NCAAF row carries is
-- `fanbase`, which is the SCHOOL. So the town comes from outside the database,
-- exactly as 2026083013 recorded when it seeded the SEC: "Every town was
-- resolved by hand."
--
-- MATCHING THE SCHOOL NAME AGAINST `places` IS NOT A DERIVATION, IT IS A
-- COINCIDENCE, and it was tried first. 26 of the 499 match a place we already
-- hold, and THREE OF THE 26 ARE WRONG OR UNUSABLE:
--
--     Washington / Huskies   would take washington-dc.  It is SEATTLE.
--     Columbia / Lions       would take columbia-mo or -sc.  It is NEW YORK.
--     Columbia                matches two places, so it is ambiguous anyway.
--
-- A wrong town looks exactly like a right one and nothing downstream would ever
-- report it, which is why the mapping below is written out one school at a time
-- instead. Every row is a claim somebody can check.
--
-- SCOPE: THE 119 WITH A CONFERENCE, which is the FBS tier -- the programmes that
-- fill hotels and could actually anchor a game. THE OTHER 380 ARE LEFT ALONE and
-- are named at the foot of this file: they carry no conference, they are small
-- colleges, and filling them is a much larger body of claims for clubs no game
-- is pitched at. They keep a null, which the room draws as `no home`.
--
-- IT CREATES THE PLACES IT NEEDS. `home_place_id` is a foreign key into
-- `public.places`, which held 95 rows; most college towns were not among them.
-- A place arrives with city and state only -- `id` is generated, and the point
-- is deliberately left null rather than guessed, because this project has
-- already put fourteen markers on one city centroid that way.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. School to town. One row per claim.
-- ---------------------------------------------------------------------------
create temporary table town (school text, mascot text, city text, st text)
  on commit drop;

insert into town (school, mascot, city, st) values
  -- ACC
  ('Atlanta',          'Yellow Jackets',  'Atlanta',         'GA'),
  ('Blacksburg',       'Hokies',          'Blacksburg',      'VA'),
  ('Boston',           'Eagles',          'Boston',          'MA'),
  ('California',       'Golden Bears',    'Berkeley',        'CA'),
  ('Clemson',          'Tigers',          'Clemson',         'SC'),
  ('Dallas',           'Mustangs',        'Dallas',          'TX'),
  ('Duke',             'Blue Devils',     'Durham',          'NC'),
  ('Florida State',    'Seminoles',       'Tallahassee',     'FL'),
  ('Louisville',       'Cardinals',       'Louisville',      'KY'),
  ('Miami',            'Hurricanes',      'Miami',           'FL'),
  ('North Carolina',   'Tar Heels',       'Chapel Hill',     'NC'),
  ('Pittsburgh',       'Panthers',        'Pittsburgh',      'PA'),
  ('Raleigh',          'Wolfpack',        'Raleigh',         'NC'),
  ('Stanford',         'Cardinal',        'Stanford',        'CA'),
  ('Syracuse',         'Orange',          'Syracuse',        'NY'),
  ('Virginia',         'Cavaliers',       'Charlottesville', 'VA'),
  ('Wake Forest',      'Demon Deacons',   'Winston-Salem',   'NC'),
  -- American
  ('Army',             'Black Knights',   'West Point',      'NY'),
  ('Birmingham',       'Blazers',         'Birmingham',      'AL'),
  ('Boca Raton',       'Owls',            'Boca Raton',      'FL'),
  ('Charlotte',        '49ers',           'Charlotte',       'NC'),
  ('East Carolina',    'Pirates',         'Greenville',      'NC'),
  ('Memphis',          'Tigers',          'Memphis',         'TN'),
  ('Navy',             'Midshipmen',      'Annapolis',       'MD'),
  ('New Orleans',      'Green Wave',      'New Orleans',     'LA'),
  ('North Texas',      'Mean Green',      'Denton',          'TX'),
  ('Rice',             'Owls',            'Houston',         'TX'),
  ('San Antonio',      'Roadrunners',     'San Antonio',     'TX'),
  ('South Florida',    'Bulls',           'Tampa',           'FL'),
  ('Temple',           'Owls',            'Philadelphia',    'PA'),
  ('Tulsa',            'Golden Hurricane','Tulsa',           'OK'),
  -- Big 12
  ('Arizona',          'Wildcats',        'Tucson',          'AZ'),
  ('Arizona State',    'Sun Devils',      'Tempe',           'AZ'),
  ('Baylor',           'Bears',           'Waco',            'TX'),
  ('Cincinnati',       'Bearcats',        'Cincinnati',      'OH'),
  ('Colorado',         'Buffaloes',       'Boulder',         'CO'),
  ('Fort Worth',       'Horned Frogs',    'Fort Worth',      'TX'),
  ('Houston',          'Cougars',         'Houston',         'TX'),
  ('Iowa State',       'Cyclones',        'Ames',            'IA'),
  ('Kansas',           'Jayhawks',        'Lawrence',        'KS'),
  ('Kansas State',     'Wildcats',        'Manhattan',       'KS'),
  ('Oklahoma State',   'Cowboys',         'Stillwater',      'OK'),
  ('Orlando',          'Knights',         'Orlando',         'FL'),
  ('Provo',            'Cougars',         'Provo',           'UT'),
  ('Texas Tech',       'Red Raiders',     'Lubbock',         'TX'),
  ('Utah',             'Utes',            'Salt Lake City',  'UT'),
  ('West Virginia',    'Mountaineers',    'Morgantown',      'WV'),
  -- Big Ten
  ('Illinois',         'Fighting Illini', 'Champaign',       'IL'),
  ('Indiana',          'Hoosiers',        'Bloomington',     'IN'),
  ('Iowa',             'Hawkeyes',        'Iowa City',       'IA'),
  ('Los Angeles',      'Trojans',         'Los Angeles',     'CA'),
  ('Los Angeles',      'Bruins',          'Los Angeles',     'CA'),
  ('Maryland',         'Terrapins',       'College Park',    'MD'),
  ('Michigan',         'Wolverines',      'Ann Arbor',       'MI'),
  ('Michigan State',   'Spartans',        'East Lansing',    'MI'),
  ('Minnesota',        'Golden Gophers',  'Minneapolis',     'MN'),
  ('Nebraska',         'Cornhuskers',     'Lincoln',         'NE'),
  ('Northwestern',     'Wildcats',        'Evanston',        'IL'),
  ('Ohio State',       'Buckeyes',        'Columbus',        'OH'),
  ('Oregon',           'Ducks',           'Eugene',          'OR'),
  ('Penn State',       'Nittany Lions',   'State College',   'PA'),
  ('Purdue',           'Boilermakers',    'West Lafayette',  'IN'),
  ('Rutgers',          'Scarlet Knights', 'Piscataway',      'NJ'),
  -- WASHINGTON IS SEATTLE. The name match would have said Washington DC.
  ('Washington',       'Huskies',         'Seattle',         'WA'),
  ('Wisconsin',        'Badgers',         'Madison',         'WI'),
  -- Conference USA
  ('Delaware',         'Blue Hens',       'Newark',          'DE'),
  ('El Paso',          'Miners',          'El Paso',         'TX'),
  ('Jacksonville State','Gamecocks',      'Jacksonville',    'AL'),
  ('Kennesaw State',   'Owls',            'Kennesaw',        'GA'),
  ('Liberty',          'Flames',          'Lynchburg',       'VA'),
  ('Louisiana Tech',   'Bulldogs',        'Ruston',          'LA'),
  ('Miami',            'Panthers',        'Miami',           'FL'),
  ('Middle Tennessee', 'Blue Raiders',    'Murfreesboro',    'TN'),
  ('Missouri State',   'Bears',           'Springfield',     'MO'),
  ('New Mexico State', 'Aggies',          'Las Cruces',      'NM'),
  ('Sam Houston',      'Bearkats',        'Huntsville',      'TX'),
  ('Western Kentucky', 'Hilltoppers',     'Bowling Green',   'KY'),
  -- Independents
  ('South Bend',       'Fighting Irish',  'South Bend',      'IN'),
  ('UConn',            'Huskies',         'Storrs',          'CT'),
  -- MAC
  ('Akron',            'Zips',            'Akron',           'OH'),
  ('Ball State',       'Cardinals',       'Muncie',          'IN'),
  ('Bowling Green',    'Falcons',         'Bowling Green',   'OH'),
  ('Buffalo',          'Bulls',           'Buffalo',         'NY'),
  ('Central Michigan', 'Chippewas',       'Mount Pleasant',  'MI'),
  ('Eastern Michigan', 'Eagles',          'Ypsilanti',       'MI'),
  ('Kent State',       'Golden Flashes',  'Kent',            'OH'),
  ('Massachusetts',    'Minutemen',       'Amherst',         'MA'),
  ('Miami (OH)',       'RedHawks',        'Oxford',          'OH'),
  ('Northern Illinois','Huskies',         'DeKalb',          'IL'),
  ('Ohio',             'Bobcats',         'Athens',          'OH'),
  ('Toledo',           'Rockets',         'Toledo',          'OH'),
  ('Western Michigan', 'Broncos',         'Kalamazoo',       'MI'),
  -- Mountain West
  ('Air Force',        'Falcons',         'Colorado Springs','CO'),
  ('Hawai''i',         'Rainbow Warriors','Honolulu',        'HI'),
  ('Las Vegas',        'Rebels',          'Las Vegas',       'NV'),
  ('Nevada',           'Wolf Pack',       'Reno',            'NV'),
  ('New Mexico',       'Lobos',           'Albuquerque',     'NM'),
  ('San José State',   'Spartans',        'San Jose',        'CA'),
  -- Pac-12
  ('Boise State',      'Broncos',         'Boise',           'ID'),
  ('Colorado State',   'Rams',            'Fort Collins',    'CO'),
  ('Fresno State',     'Bulldogs',        'Fresno',          'CA'),
  ('Oregon State',     'Beavers',         'Corvallis',       'OR'),
  ('San Diego State',  'Aztecs',          'San Diego',       'CA'),
  ('Texas State',      'Bobcats',         'San Marcos',      'TX'),
  ('Utah State',       'Aggies',          'Logan',           'UT'),
  ('Washington State', 'Cougars',         'Pullman',         'WA'),
  -- Sun Belt
  ('App State',        'Mountaineers',    'Boone',           'NC'),
  ('Arkansas State',   'Red Wolves',      'Jonesboro',       'AR'),
  ('Coastal Carolina', 'Chanticleers',    'Conway',          'SC'),
  ('Georgia Southern', 'Eagles',          'Statesboro',      'GA'),
  ('Georgia State',    'Panthers',        'Atlanta',         'GA'),
  ('James Madison',    'Dukes',           'Harrisonburg',    'VA'),
  ('Louisiana',        'Ragin'' Cajuns',  'Lafayette',       'LA'),
  ('Marshall',         'Thundering Herd', 'Huntington',      'WV'),
  ('Mobile',           'Jaguars',         'Mobile',          'AL'),
  ('Monroe',           'Warhawks',        'Monroe',          'LA'),
  ('Old Dominion',     'Monarchs',        'Norfolk',         'VA'),
  ('Southern Miss',    'Golden Eagles',   'Hattiesburg',     'MS'),
  ('Troy',             'Trojans',         'Troy',            'AL');

-- EVERY ROW MUST MATCH EXACTLY ONE AUDIENCE, or a school named twice would
-- update two clubs and a misspelling would update none -- both silently.
-- The pair (fanbase, nickname) is what tells the two Los Angeles rows and the
-- two Miami rows apart.
do $$
declare bad int;
begin
  select count(*) into bad from town t
   where (select count(*) from public.audiences a
           where a.family = 'ncaaf' and a.fanbase = t.school and a.nickname = t.mascot) <> 1;
  if bad > 0 then
    raise exception 'town: % rows do not match exactly one audience', bad;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The places they need.
-- ---------------------------------------------------------------------------
-- NO POINT IS GUESSED. `lat`/`lon` stay null: a coordinate nobody has checked
-- looks exactly like one somebody has, and this project has already put
-- fourteen markers on a single city centroid that way.
insert into public.places (city, state, aliases)
select distinct t.city, t.st, '{}'::text[]
  from town t
 where not exists (select 1 from public.places p
                    where lower(p.city) = lower(t.city) and lower(p.state) = lower(t.st));

-- ---------------------------------------------------------------------------
-- 3. The clubs take their town.
-- ---------------------------------------------------------------------------
-- ONLY WHERE IT IS STILL NULL, so re-running cannot overwrite a town somebody
-- has since corrected by hand.
update public.audiences a
   set home_place_id = p.id
  from town t
  join public.places p on lower(p.city) = lower(t.city) and lower(p.state) = lower(t.st)
 where a.family = 'ncaaf'
   and a.fanbase = t.school
   and a.nickname = t.mascot
   and a.home_place_id is null;

commit;

-- ---------------------------------------------------------------------------
-- Verify. Read the numbers; do not trust the absence of an error.
-- ---------------------------------------------------------------------------
-- Expect: filled 119, ncaaf_still_missing 380 (the ones with no conference),
-- with_conference_missing 0, and 0 pointing at a place that is not there.
--
-- select
--   (select count(*) from public.audiences where family='ncaaf' and home_place_id is not null) as ncaaf_with_town,
--   (select count(*) from public.audiences where family='ncaaf' and home_place_id is null) as ncaaf_still_missing,
--   (select count(*) from public.audiences where family='ncaaf' and home_place_id is null
--      and coalesce(conference,'') <> '') as with_conference_missing,
--   (select count(*) from public.audiences a where a.home_place_id is not null
--      and not exists (select 1 from public.places p where p.id = a.home_place_id)) as orphans,
--   (select count(*) from public.places) as places;
--
-- WHAT IS LEFT, AND IT IS DELIBERATE: 380 college clubs with no conference --
-- small programmes no game is pitched at. They keep a null, which the Audience
-- Queue draws as `no home`. Filling them is another 380 claims, and each one is
-- a fact somebody has to check rather than something the database can derive.
