-- Seed: "oldest bar" waypoints, one per major North American city.
-- Source data: data/oldestbar.jsonl (51 rows, all still_open = true).
--
-- Column mapping:
--   name         <- name
--   city / state <- city ("Atlanta, GA" split; state stays the 2-letter code,
--                   matching 20260626_atlanta_phoenix_waypoints.sql)
--   zip          <- postal code lifted off the end of address
--   address      <- street line only, the way the rest of the table stores it
--   description  <- "Est. <year>. " + claim_to_fame (there is no year column,
--                   and the year is the whole point of these rows)
--   source_url   <- the first entry in sources
--
-- Two rows use the metro city rather than the address's own municipality, on
-- purpose: Pete's Bar sits in Neptune Beach (filed under Jacksonville) and Mac's
-- Club Deuce in Miami Beach (filed under Miami), so both join to a city that is
-- actually in public.cities. Every other city here is already in the catalog.
--
-- Not carried over: still_open (true for every row) and confidence, neither of
-- which has a column. confidence is also garbled in the source file — the JSONL's
-- source URLs were markdown-autolinked at some point and the damage runs into the
-- tail of every line. Only the FIRST source url per row survived cleanly, which
-- is why source_url takes that one.
--
-- wpid is assigned by the table's trigger. Idempotent: the not-exists guard
-- matches on name + city, so a re-run inserts nothing — and a row that has since
-- been archived as a do-not-rescrape tombstone is not resurrected.

insert into public.waypoints (name, city, state, zip, address, description, source_url)
select v.name, v.city, v.state, v.zip, v.address, v.description, v.source_url
from (values
  ('Manuel''s Tavern', 'Atlanta', 'GA', '30307', '602 N Highland Ave NE', 'Est. 1956. Atlanta institution founded by Manuel Maloof in 1956; selected as the oldest clearly verified still-operating tavern found for Atlanta, though older restaurant-only claims may exist.', 'https://manuelstavern.com/'),
  ('The Horse You Came In On Saloon', 'Baltimore', 'MD', '21231', '1626 Thames St', 'Est. 1775. Widely described as Baltimore''s oldest saloon, with a claimed 1775 founding and continuous bar operation; Prohibition-era continuity is part of the establishment''s claim.', 'https://www.thehorsebaltimore.com/story'),
  ('Bell in Hand Tavern', 'Boston', 'MA', '02108', '45 Union St', 'Est. 1795. Claims to be America''s oldest continuously operating tavern since 1795, but the business has moved locations and Prohibition complicates strict continuity.', 'https://www.thebellinhand.com/'),
  ('Ulrich''s 1868 Tavern', 'Buffalo', 'NY', '14203', '674 Ellicott St', 'Est. 1868. Buffalo''s oldest tavern, established in 1868; recent reopening/closure history means uninterrupted operation should be treated cautiously.', 'https://ulrichs1868tavern.com/'),
  ('King Eddy', 'Calgary', 'AB', 'T2G 0R9', '438 9 Ave SE', 'Est. 1905. Historic Calgary hotel/bar dating to 1905; continuity is disputed because the venue closed before restoration and reopening, so it is not a clean continuous-operation claim.', 'https://kingeddy.ca/history/'),
  ('Alexander Michael''s', 'Charlotte', 'NC', '28202', '401 W 9th St', 'Est. 1983. Long-running Fourth Ward tavern opened in 1983; selected as the oldest clearly verifiable still-operating bar/tavern found for Charlotte, with confidence limited by sparse public oldest-bar documentation.', 'https://almikestavern.com/'),
  ('Green Mill Cocktail Lounge', 'Chicago', 'IL', '60640', '4802 N Broadway', 'Est. 1907. Historic Chicago cocktail lounge dating to 1907; oldest-bar status in Chicago is disputed depending on whether tavern, liquor-license continuity, or building history is used.', 'https://greenmilljazz.com/'),
  ('Arnold''s Bar and Grill', 'Cincinnati', 'OH', '45202', '210 E 8th St', 'Est. 1861. Cincinnati''s oldest tavern, opened in 1861, with the same bar room still in use.', 'https://www.arnoldsbarandgrill.com/our-stories-1'),
  ('Harbor Inn', 'Cleveland', 'OH', '44113', '1219 Main Ave', 'Est. 1895. Widely cited as Cleveland''s oldest continuously operating bar, opened in 1895 in the Flats.', 'https://harborinncleveland.com/'),
  ('Ringside Cafe', 'Columbus', 'OH', '43215', '19 N Pearl St', 'Est. 1837. Historic downtown Columbus bar/restaurant with roots claimed to 1837; continuity and exact oldest-bar status are not fully settled in public sources.', 'https://www.ringsidecolumbus.com/'),
  ('Stan''s Blue Note', 'Dallas', 'TX', '75206', '2908 Greenville Ave', 'Est. 1952. Commonly cited as Dallas''s oldest continuously operating bar, opened in 1952.', 'https://stansbluenote.com/'),
  ('My Brother''s Bar', 'Denver', 'CO', '80202', '2376 15th St', 'Est. 1873. Widely cited as Denver''s oldest bar, with tavern history at the site dating to 1873.', 'https://mybrothersbar.com/history/'),
  ('Two Way Inn', 'Detroit', 'MI', '48212', '17897 Mount Elliott St', 'Est. 1876. Often cited as Detroit''s oldest bar, operating from an 1876 tavern building; exact uninterrupted continuity is less firmly documented.', 'https://twowayinn.com/'),
  ('Commercial Hotel / Blues on Whyte', 'Edmonton', 'AB', 'T6E 1Z9', '10329 82 Ave NW', 'Est. 1912. Historic Edmonton hotel tavern and blues venue commonly traced to the Commercial Hotel era; selected as the oldest clearly documented still-operating tavern-style venue found, but continuity is not fully verified.', 'https://www.bluesonwhyte.com/'),
  ('Elbo Room', 'Fort Lauderdale', 'FL', '33316', '241 S Fort Lauderdale Beach Blvd', 'Est. 1938. Fort Lauderdale beach bar opened in 1938 and famous from the spring-break era and the film Where the Boys Are.', 'https://elboroom.com/'),
  ('Keggers', 'Green Bay', 'WI', '54303', '231 N Broadway', 'Est. 1935. Long-running Green Bay tavern commonly presented with a 1935 origin; selected as the oldest clearly verifiable still-open bar found, but public documentation is limited.', 'https://www.facebook.com/KeggersGreenBay/'),
  ('La Carafe', 'Houston', 'TX', '77002', '813 Congress St', 'Est. 1950. Often cited as Houston''s oldest bar; the building is much older, but the bar operation is generally dated to the mid-20th century.', 'https://www.lacarafe.com/'),
  ('Slippery Noodle Inn', 'Indianapolis', 'IN', '46225', '372 S Meridian St', 'Est. 1850. Indiana''s oldest continually operated bar in its original building, founded in 1850 as the Tremont House.', 'https://slipperynoodle.com/indianapolis-the-slippery-noodle-about'),
  ('Pete''s Bar', 'Jacksonville', 'FL', '32266', '117 1st St', 'Est. 1933. Jacksonville-area institution opened in 1933 after Prohibition; it is in Neptune Beach rather than Jacksonville city limits, so strict Jacksonville-city status is uncertain.', 'https://petesbar.com/'),
  ('The Peanut', 'Kansas City', 'MO', '64112', '5000 Main St', 'Est. 1933. Long-running Kansas City bar and grill commonly traced to 1933; older building/history claims exist, but this is a verifiable still-open tavern operation.', 'https://www.peanutkc.com/'),
  ('Atomic Liquors', 'Las Vegas', 'NV', '89101', '917 E Fremont St', 'Est. 1952. Las Vegas''s oldest freestanding bar, opened in 1952 and associated with the city''s first tavern liquor license.', 'https://atomic.vegas/about/'),
  ('Golden Gopher', 'Los Angeles', 'CA', '90014', '417 W 8th St', 'Est. 1905. Historic downtown Los Angeles bar with origins claimed to 1905; oldest-bar status is disputed with Cole''s and other historic saloons depending on definition and continuity.', 'https://goldengopherbar.com/'),
  ('Earnestine & Hazel''s', 'Memphis', 'TN', '38103', '531 S Main St', 'Est. 1950. Historic South Main bar with mid-20th-century roots; selected as the oldest clearly documented still-operating tavern found for Memphis, but older claims may exist.', 'https://earnestineandhazels.com/'),
  ('Mac''s Club Deuce', 'Miami', 'FL', '33139', '222 14th St', 'Est. 1926. Widely cited as one of the oldest continuously operating bars in the Miami area; it is in Miami Beach, and strict City of Miami comparisons are complicated by Tobacco Road''s closure.', 'https://macsclubdeuce.com/'),
  ('Landmark 1850 Inn', 'Milwaukee', 'WI', '53207', '5905 S Howell Ave', 'Est. 1850. Milwaukee tavern claiming roots to 1850; oldest-bar status is plausible but not fully independently settled in public sources.', 'https://landmark1850inn.com/'),
  ('Schooner Tavern', 'Minneapolis', 'MN', '55406', '2901 27th Ave S', 'Est. 1932. Long-running Minneapolis tavern commonly dated to 1932; selected as the oldest clearly verifiable still-operating bar found, while some older restaurant/brewery-derived claims are less direct.', 'https://schoonertavern.com/'),
  ('Auberge Saint-Gabriel', 'Montreal', 'QC', 'H2Y 2Z9', '426 Rue Saint-Gabriel', 'Est. 1754. Historic inn in Old Montreal associated with a 1754 liquor license; continuous tavern operation over the full span is not firmly established.', 'https://aubergesaint-gabriel.com/'),
  ('Springwater Supper Club and Lounge', 'Nashville', 'TN', '37203', '115 27th Ave N', 'Est. 1897. Frequently promoted as Tennessee''s oldest bar; the date and continuity claims are traditional and not always independently documented in detail.', 'https://springwatersupperclub.com/'),
  ('Lafitte''s Blacksmith Shop Bar', 'New Orleans', 'LA', '70116', '941 Bourbon St', 'Est. 1772. Famous Bourbon Street bar in an 18th-century building; often promoted as one of the oldest bars in the U.S., but exact establishment date and uninterrupted tavern operation are disputed.', 'https://www.lafittesblacksmithshop.com/'),
  ('The Ear Inn', 'New York', 'NY', '10013', '326 Spring St', 'Est. 1817. Commonly cited as New York City''s oldest bar continuously serving alcohol, with operation dated to 1817.', 'https://www.theearinn.com/about'),
  ('Cattlemen''s Steakhouse', 'Oklahoma City', 'OK', '73108', '1309 S Agnew Ave', 'Est. 1910. Historic Stockyards City restaurant and bar opened in 1910; selected because older Oklahoma City bar-only claims are not clearly documented as still operating.', 'https://cattlemensrestaurant.com/history/'),
  ('Wally''s Mills Avenue Liquors', 'Orlando', 'FL', '32803', '1001 N Mills Ave', 'Est. 1954. Long-running Orlando bar opened in 1954; commonly cited locally as one of Orlando''s oldest bars.', 'https://wallysonmills.com/'),
  ('Château Lafayette', 'Ottawa', 'ON', 'K1N 5S6', '42 York St', 'Est. 1849. Known as The Laff, it claims to be Ottawa''s oldest tavern, established in 1849.', 'https://thelaff.ca/'),
  ('McGillin''s Olde Ale House', 'Philadelphia', 'PA', '19107', '1310 Drury St', 'Est. 1860. Philadelphia''s oldest continuously operating tavern, opened in 1860.', 'https://mcgillins.com/history/'),
  ('Bikini Lounge', 'Phoenix', 'AZ', '85007', '1502 Grand Ave', 'Est. 1947. Long-running Phoenix tiki/dive bar opened in 1947 and commonly cited as one of the city''s oldest operating bars.', 'https://www.thebikinilounge.com/'),
  ('Original Oyster House', 'Pittsburgh', 'PA', '15222', '20 Market Square', 'Est. 1870. Long-running Pittsburgh bar/restaurant opened in 1870; commonly cited as the city''s oldest bar and restaurant, though bar versus restaurant wording varies by source.', 'https://originaloysterhousepittsburgh.com/'),
  ('Huber''s Cafe', 'Portland', 'OR', '97204', '411 SW 3rd Ave', 'Est. 1879. Portland institution tracing its business history to 1879; more precisely a restaurant and bar, so oldest bar-only status is not fully settled.', 'https://hubers.com/'),
  ('Players'' Retreat', 'Raleigh', 'NC', '27605', '105 Oberlin Rd', 'Est. 1951. Raleigh tavern and restaurant opened in 1951; selected as the oldest clearly verified still-operating bar/tavern found for Raleigh.', 'https://playersretreat.com/'),
  ('Pine Cove Tavern', 'Sacramento', 'CA', '95816', '502 29th St', 'Est. 1934. Long-running Sacramento neighborhood dive bar commonly dated to 1934; selected as the oldest clearly verifiable still-open tavern found, with older claims not fully settled.', 'https://www.pinecovetavern.com/'),
  ('Bar-X', 'Salt Lake City', 'UT', '84111', '155 E 200 S', 'Est. 1933. Historic Salt Lake City bar dating to 1933; older Utah saloon claims exist outside Salt Lake City, but Bar-X is a strong city-specific candidate.', 'https://barxslc.com/'),
  ('The Buckhorn Saloon', 'San Antonio', 'TX', '78205', '318 E Houston St', 'Est. 1881. Historic San Antonio saloon founded in 1881; it has moved locations and is now paired with a museum, so continuity in the same premises is not claimed.', 'https://www.buckhornmuseum.com/history/'),
  ('Waterfront Bar & Grill', 'San Diego', 'CA', '92101', '2044 Kettner Blvd', 'Est. 1933. Widely cited as San Diego''s oldest tavern, opened in 1933 after Prohibition.', 'https://waterfrontbarandgrill.com/'),
  ('The Saloon', 'San Francisco', 'CA', '94133', '1232 Grant Ave', 'Est. 1861. Widely cited as San Francisco''s oldest bar, opened in 1861 in North Beach.', 'https://www.sfblues.net/TheSaloon/'),
  ('Caravan Lounge', 'San Jose', 'CA', '95113', '98 S Almaden Ave', 'Est. 1959. Long-running downtown San Jose dive bar commonly dated to 1959; selected as the oldest clearly verifiable still-open bar found, but public oldest-bar documentation is limited.', 'https://www.caravanloungesanjose.com/'),
  ('Central Saloon', 'Seattle', 'WA', '98104', '207 1st Ave S', 'Est. 1892. Commonly cited as Seattle''s oldest saloon, dating to 1892 in Pioneer Square.', 'https://centralsaloon.com/'),
  ('Hammerstone''s', 'St. Louis', 'MO', '63104', '2028 S 9th St', 'Est. 1884. Historic Soulard bar commonly associated with an 1884 origin; selected as a strong oldest-bar candidate, but St. Louis oldest-tavern claims are not fully settled.', 'https://hammerstones.net/'),
  ('The Hub Bar', 'Tampa', 'FL', '33602', '719 N Franklin St', 'Est. 1949. Commonly cited as Tampa''s oldest bar, opened in 1949.', 'https://www.thehubbar.com/'),
  ('Wheatsheaf Tavern', 'Toronto', 'ON', 'M5V 1M9', '667 King St W', 'Est. 1849. Widely cited as Toronto''s oldest bar, established in 1849.', 'https://www.wheatsheaftavern.com/'),
  ('The Lamplighter Public House', 'Vancouver', 'BC', 'V6B 2K8', '92 Water St', 'Est. 1925. Gastown pub dating to 1925 and commonly described as one of Vancouver''s oldest pubs; exact citywide oldest status is not fully settled.', 'https://www.lamplighterpublichouse.com/'),
  ('Old Ebbitt Grill', 'Washington', 'DC', '20005', '675 15th St NW', 'Est. 1856. Washington''s oldest saloon/restaurant business, founded in 1856; it has moved locations, so it is not continuous in the same building.', 'https://www.ebbitt.com/history/'),
  ('Woodbine Hotel Bar', 'Winnipeg', 'MB', 'R3B 1B6', '466 Main St', 'Est. 1878. Historic Winnipeg hotel bar with roots claimed to 1878; selected as the oldest still-operating tavern-style venue found, but continuity and current operating details are not fully documented in strong public sources.', 'https://www.woodbinehotel.ca/')
) as v(name, city, state, zip, address, description, source_url)
where not exists (
  select 1 from public.waypoints w
   where lower(btrim(w.name)) = lower(btrim(v.name))
     and lower(btrim(coalesce(w.city, ''))) = lower(btrim(v.city))
);

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 51 rows, one per city:
--   select wpid, name, city, state, zip
--     from public.waypoints
--    where description like 'Est. %' and source_url is not null
--    order by city;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Take the wpid list from the verify query above and delete by id — don't delete
-- on the description pattern alone, it isn't unique to this batch.
--   delete from public.waypoints where wpid in (...);
