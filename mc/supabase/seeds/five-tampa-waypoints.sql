-- FIVE TAMPA WAYPOINTS, all downtown and all free to stand in front of.
--
-- APPLIED 2026-09-04 through the Management API (see CLAUDE.md section 1b);
-- the verify block read exactly what it expects. The apply-by-hand note below
-- is kept as the record of why the file was written that way.
--
-- APPLY BY HAND. The publishable key cannot write public.waypoints (RLS grants
-- writes to authenticated only) and this session has no supabase CLI, so it
-- goes in through the SQL editor:
--   https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/sql/new?skip=true
-- or, from a machine with the CLI:
--   cd mc && supabase db query --linked --file supabase/seeds/five-tampa-waypoints.sql
--
-- WHY THESE FIVE. Tampa held 11 waypoints on 2026-09-04 and ten of them are
-- Ybor City, a single walking tour filed by TGB PATH BOT. Downtown and the
-- riverfront, which is where a visiting fandom actually stays, held one bar.
-- These five are a walkable spine down Franklin Street, across Kennedy and
-- over the river, none more than a kilometre from the next.
--
-- THE RULES THE LIBRARY'S OWN PROMPT STATES, kept here:
--   the address is a STREET LINE, never a postal address;
--   the point is the place itself, six decimals, never a city centroid;
--   the source is the page that SAYS SOMETHING about the waypoint and will
--     still be there in five years, which here is its Wikipedia article;
--   the description is read aloud at the stop;
--   the country is always given, the state only where there is one;
--   free, always: the line is the door. Plant Hall's museum charges and its
--     minarets are on the outside, which is what the row points at.
--   wpid is never sent; a trigger assigns it.
--
-- CHECKED BEFORE IT WAS WRITTEN, by mc/_dev/browser-checks/tampa-seed-shape.js:
-- every article resolves, every point sits within 150 m of what Nominatim
-- returns for the street line, every point is inside Tampa, and no name or
-- address is already on file. Two candidates were left out on purpose:
-- Sulphur Springs Water Tower is the oddest thing in the city and eight
-- kilometres from everything else here, and Sacred Heart is a working church
-- whose interior is the point. Both are one row each if wanted.

begin;

insert into public.waypoints
  (name, description, address, city, state, zip, country, lat, lon, source_url)
values

  ('Tampa Theatre',
   'A 1926 movie palace built to look like a Mediterranean courtyard at night, with a ceiling of electric stars and a Wurlitzer organ that still rises out of the floor. Look up at the marquee: it is the same one the city has walked under for a century.',
   '711 N Franklin St', 'Tampa', 'FL', '33602', 'USA',
   27.950381, -82.458807,
   'https://en.wikipedia.org/wiki/Tampa_Theatre'),

  ('Tampa City Hall',
   'The 1915 city hall, still in use, with a clock in its tower that Tampa has called Hortense for as long as anybody can remember. Stand back far enough to read her face; she has been telling this corner the time for over a hundred years.',
   '315 E Kennedy Blvd', 'Tampa', 'FL', '33602', 'USA',
   27.947677, -82.457699,
   'https://en.wikipedia.org/wiki/Tampa_City_Hall'),

  ('Rivergate Tower',
   'The only round skyscraper in Tampa, a 454 foot cylinder of limestone on the riverbank that everybody except its landlord calls the Beer Can Building. Walk round it once. It looks exactly the same from every side, which is the joke.',
   '400 N Ashley Dr', 'Tampa', 'FL', '33602', 'USA',
   27.947310, -82.460632,
   'https://en.wikipedia.org/wiki/Rivergate_Tower'),

  ('Curtis Hixon Waterfront Park',
   'Eight acres of lawn on the Hillsborough River where the old convention hall stood until the city knocked it down and gave the riverbank back. From the water''s edge you can count the silver minarets across the river, which is the next stop.',
   '600 N Ashley Dr', 'Tampa', 'FL', '33602', 'USA',
   27.948838, -82.461804,
   'https://en.wikipedia.org/wiki/Curtis_Hixon_Waterfront_Park'),

  ('Plant Hall Minarets',
   'Thirteen silver minarets on what was built in 1891 as the Tampa Bay Hotel, a railway baron''s palace that is now a university. They are the skyline of the city; find the one with the crescent moon and count the rest from there.',
   '401 W Kennedy Blvd', 'Tampa', 'FL', '33606', 'USA',
   27.945472, -82.464014,
   'https://en.wikipedia.org/wiki/Henry_B._Plant_Museum');

-- ---- VERIFY. Read the numbers; an insert that returns without error says
-- nothing about whether the rows are the ones you meant. ---------------------

-- 1. Five landed, every one located, addressed, sourced and in Tampa, FL, USA.
select count(*)                                            as filed,
       count(*) filter (where lat is not null and lon is not null) as located,
       count(*) filter (where address is not null)          as addressed,
       count(*) filter (where source_url like 'https://en.wikipedia.org/%') as sourced,
       count(*) filter (where city = 'Tampa' and state = 'FL' and country = 'USA') as placed,
       count(*) filter (where wpid is not null)             as keyed
  from public.waypoints
 where name in ('Tampa Theatre', 'Tampa City Hall', 'Rivergate Tower',
                'Curtis Hixon Waterfront Park', 'Plant Hall Minarets');
-- expect: every column 5

-- 2. Tampa went from 11 to 16, and no name is on file twice.
select count(*) as tampa_now,
       count(*) - count(distinct lower(name)) as duplicate_names
  from public.waypoints where city = 'Tampa';
-- expect: tampa_now 16, duplicate_names 0

commit;
