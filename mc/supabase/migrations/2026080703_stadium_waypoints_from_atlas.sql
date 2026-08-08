-- Seed: the 17 real stadiums stranded in mc/data/atlas.jsonl -> public.waypoints
--
-- WHERE THESE CAME FROM. atlas.jsonl is the store of the archived route builder
-- mc/content.html. It holds 496 place records; 436 of them are the walking-tour
-- places already seeded by 2026073102_places_walking_tour_waypoints.sql, and the
-- remaining 60 are something else entirely — game START LOCATIONS, reverse-
-- imported from games.starting_location_* and stamped with the giveaway
-- description "Imported from N game rows as a starting-location candidate."
--
-- Only these 17 of those 60 are real, named, permanent venues worth standing in
-- front of. The other 43 are street segments dressed up as places ("Girod Street
-- Starting Point", "the flagpole", "North Tunnel Starting Point"), meeting-point
-- restaurants near a stadium, and visitor centres, several of them filed under
-- the wrong city outright — Canal Street Neutral Ground in New Orleans is
-- recorded as Anchorage, Alaska, and Griffith Park's ranger station as
-- Inglewood. They are deliberately NOT imported; the source data is still in
-- atlas.jsonl and in git history if that call is ever revisited.
--
-- EVERY FIELD BELOW IS REWRITTEN, not copied. The atlas rows carry a Nominatim
-- reverse-geocode dump in `address` ("Ford Field, Saint Antoine Street,
-- Greektown, Midtown, Detroit, Wayne County, Michigan, 48226, United States"),
-- a `city` that is sometimes the wrong city, a description that says only that
-- it was imported, and a maps.google.com/?q=lat,lon "source" that proves
-- nothing. This table wants a street line, a plain city, a 2-letter state (or
-- the country for non-US), a ZIP, one tour-guide sentence, and a source URL a
-- human can open. So the addresses were verified against the venues' own pages
-- and Wikipedia in August 2026 rather than carried across.
--
-- Corrections that changed a fact, each verified:
--   "New York New Jersey Stadium"      -> MetLife Stadium
--   "Boston Stadium", Boston MA 02071  -> Gillette Stadium, Foxborough MA 02035
--   "US Bank Stadium"                  -> U.S. Bank Stadium (the venue's own styling)
--   "Tottenham Hotspur Football Club"  -> Tottenham Hotspur Stadium, and the
--                                         postcode N17 0FH -> N17 0BX
--   Allegiant Stadium, Las Vegas       -> Paradise, NV. The stadium is outside
--                                         Las Vegas city limits, and Paradise is
--                                         already in public.cities as a
--                                         venue-only town (2026080103).
--   Ford Field, "Saint Antoine Street" -> 2000 Brush St (the atlas street had no
--                                         number and is the wrong side)
--   Mercedes-Benz Stadium,
--     1414 Andrew Young Intl Blvd      -> 1 AMB Dr NW
--   Santiago Bernabeu, 28020           -> 28036
--   Allianz Arena, Hans-Jensen-Weg     -> Franz-Beckenbauer-Platz 5. The street
--                                         was renamed on 2025-05-01 in tribute to
--                                         Franz Beckenbauer; the ZIP is unchanged.
--   "Estadio Azteca"                   -> Estadio Banorte (retitled 2025 under
--                                         the Banorte sponsorship). Its ZIP could
--                                         NOT be verified, so it is left null —
--                                         a blank is obviously missing, a
--                                         plausible wrong one is not. Same reason
--                                         the street carries no number.
--
-- Run through tgb_import_waypoints_prompt_items rather than a raw INSERT, so
-- this inherits the rules every other waypoint import obeys: wpid comes from the
-- table's gap-filling trigger, a name + city that already exists is skipped, and
-- a row since archived as a do-not-rescrape tombstone is NOT resurrected. That
-- makes the migration idempotent — re-running it inserts nothing.
--
-- The helper must exist first. It lives at mc/supabase/waypoints-prompt-import.sql
-- and is created there; if this fails with "function does not exist", run that
-- file and then this one.
--
-- NOTE ON CITIES, the same caveat 2026073102 carries. waypoints.city has no FK
-- to public.cities, but the Waypoints page joins the two by name to build its
-- city bar, so a city missing from the catalog means the waypoint has no badge
-- to sit under. The nine US stadium towns here are all in `cities` already —
-- Paradise, Foxborough, Orchard Park, East Rutherford, Miami Gardens and
-- Glendale were catalogued as venue-only towns by 2026080103. The four foreign
-- ones may not be. Check with:
--   select distinct w.city from public.waypoints w
--    where not exists (select 1 from public.cities c
--                       where lower(split_part(c.city, ',', 1)) = lower(w.city));

select *
from public.tgb_import_waypoints_prompt_items($tgb$
[
  {
    "name": "NRG Stadium",
    "city": "Houston",
    "state": "TX",
    "zip": "77054",
    "address": "1 NRG Pkwy",
    "description": "Home of the Houston Texans and the first NFL stadium built with a retractable roof, sharing NRG Park with the Astrodome next door.",
    "source_url": "https://www.nrgpark.com/venues/nrg-stadium/"
  },
  {
    "name": "MetLife Stadium",
    "city": "East Rutherford",
    "state": "NJ",
    "zip": "07073",
    "address": "1 MetLife Stadium Dr",
    "description": "The only NFL stadium shared by two clubs, home to both the New York Giants and the New York Jets in the Meadowlands Sports Complex.",
    "source_url": "https://www.metlifestadium.com/"
  },
  {
    "name": "U.S. Bank Stadium",
    "city": "Minneapolis",
    "state": "MN",
    "zip": "55415",
    "address": "401 Chicago Ave",
    "description": "The angular glass-and-steel home of the Minnesota Vikings in Downtown East, with the largest transparent ETFE roof in the country.",
    "source_url": "https://www.usbankstadium.com/"
  },
  {
    "name": "Allegiant Stadium",
    "city": "Paradise",
    "state": "NV",
    "zip": "89118",
    "address": "3333 Al Davis Way",
    "description": "The black domed home of the Las Vegas Raiders, just west of the Strip and outside Las Vegas city limits, with curtain walls that open toward the skyline.",
    "source_url": "https://www.allegiantstadium.com/"
  },
  {
    "name": "Ford Field",
    "city": "Detroit",
    "state": "MI",
    "zip": "48226",
    "address": "2000 Brush St",
    "description": "The indoor home of the Detroit Lions, built into a 1920s Hudson's warehouse whose brick facade forms one whole side of the seating bowl.",
    "source_url": "https://www.fordfield.com/"
  },
  {
    "name": "Paycor Stadium",
    "city": "Cincinnati",
    "state": "OH",
    "zip": "45202",
    "address": "1 W Pete Rose Way",
    "description": "Home of the Cincinnati Bengals on the Ohio River banks downtown, a short walk from the Roebling Suspension Bridge.",
    "source_url": "https://www.bengals.com/stadium/"
  },
  {
    "name": "Highmark Stadium",
    "city": "Orchard Park",
    "state": "NY",
    "zip": "14127",
    "address": "1 Bills Dr",
    "description": "The open-air home of the Buffalo Bills in suburban Orchard Park, famous for lake-effect snow games and the tailgate lots that surround it.",
    "source_url": "https://www.buffalobills.com/stadium/"
  },
  {
    "name": "Soldier Field",
    "city": "Chicago",
    "state": "IL",
    "zip": "60605",
    "address": "1410 Special Olympics Dr",
    "description": "The Chicago Bears' lakefront home, a 1924 neoclassical colonnade wrapped around a 2003 seating bowl on the Museum Campus.",
    "source_url": "https://www.soldierfield.com/"
  },
  {
    "name": "Gillette Stadium",
    "city": "Foxborough",
    "state": "MA",
    "zip": "02035",
    "address": "1 Patriot Pl",
    "description": "Home of the New England Patriots, marked by its lighthouse and bridge at the open end and set within the Patriot Place complex.",
    "source_url": "https://www.gillettestadium.com/"
  },
  {
    "name": "State Farm Stadium",
    "city": "Glendale",
    "state": "AZ",
    "zip": "85305",
    "address": "1 Cardinals Dr",
    "description": "Home of the Arizona Cardinals, with a retractable roof and a natural grass field that rolls out of the building on rails to sit in the sun.",
    "source_url": "https://www.statefarmstadium.com/"
  },
  {
    "name": "Hard Rock Stadium",
    "city": "Miami Gardens",
    "state": "FL",
    "zip": "33056",
    "address": "347 Don Shula Dr",
    "description": "Home of the Miami Dolphins and the Miami Open, shaded by an open-air canopy added in the 2015 renovation.",
    "source_url": "https://www.hardrockstadium.com/"
  },
  {
    "name": "Tottenham Hotspur Stadium",
    "city": "London",
    "state": "United Kingdom",
    "zip": "N17 0BX",
    "address": "782 High Rd",
    "description": "Tottenham Hotspur's home on the site of White Hart Lane, with a retractable pitch that slides away to reveal an NFL surface beneath.",
    "source_url": "https://www.tottenhamhotspur.com/the-stadium/"
  },
  {
    "name": "Mercedes-Benz Stadium",
    "city": "Atlanta",
    "state": "GA",
    "zip": "30313",
    "address": "1 AMB Dr NW",
    "description": "Home of the Atlanta Falcons and Atlanta United, crowned by a camera-iris roof of eight petals that spiral open above the field.",
    "source_url": "https://mercedesbenzstadium.com/"
  },
  {
    "name": "Caesars Superdome",
    "city": "New Orleans",
    "state": "LA",
    "zip": "70112",
    "address": "1500 Sugar Bowl Dr",
    "description": "The New Orleans Saints' domed home at the edge of the Central Business District, host of seven Super Bowls and the annual Sugar Bowl.",
    "source_url": "https://www.caesarssuperdome.com/"
  },
  {
    "name": "Estadio Santiago Bernabeu",
    "city": "Madrid",
    "state": "Spain",
    "zip": "28036",
    "address": "Avenida de Concha Espina 1",
    "description": "Real Madrid's home in Chamartin since 1947, rebuilt with a wraparound steel skin and a retractable pitch stored beneath the stands.",
    "source_url": "https://en.wikipedia.org/wiki/Santiago_Bernab%C3%A9u_Stadium"
  },
  {
    "name": "Allianz Arena",
    "city": "Munich",
    "state": "Germany",
    "zip": "80939",
    "address": "Franz-Beckenbauer-Platz 5",
    "description": "Bayern Munich's home on the northern edge of the city, wrapped in inflated ETFE panels that light the whole building red at night.",
    "source_url": "https://allianz-arena.com/en/"
  },
  {
    "name": "Estadio Banorte",
    "city": "Mexico City",
    "state": "Mexico",
    "zip": null,
    "address": "Calzada de Tlalpan",
    "description": "The stadium long known as Estadio Azteca, in Coyoacan, the only ground to host two World Cup finals and renamed under the Banorte sponsorship in 2025.",
    "source_url": "https://en.wikipedia.org/wiki/Estadio_Azteca"
  }
]
$tgb$::jsonb);
