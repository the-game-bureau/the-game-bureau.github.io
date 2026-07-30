-- Waypoint import: Baltimore, MD (20 stops) + Charlotte, NC (7 stops)
-- Researched 2026-07-29. Paste into the Supabase SQL editor and run.
--
-- Every address and ZIP below was resolved against OpenStreetMap/Nominatim or a
-- named source page; nothing is from memory. Where no street address exists
-- (a harbour, a neighbourhood, a park with no frontage) the address is null
-- rather than invented - the page's Fill button can settle those later, and a
-- null address is honest in a way a guessed one is not.
--
-- The helper is idempotent: a stop whose name + city is already in the table is
-- skipped, so re-running this is safe. It is the same function as
-- supabase/waypoints-prompt-import.sql, inlined so this file stands alone.

create or replace function public.tgb_import_waypoints_prompt_items(items jsonb)
returns table (action text, name text, wpid text, note text)
language plpgsql
as $$
declare
  v_entry jsonb;
  v_name text; v_city text; v_state text; v_zip text; v_address text;
  v_description text;
  v_source_url text;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
begin
  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Expected a JSON array of waypoint objects.';
  end if;
  for v_entry in select value from jsonb_array_elements(items)
  loop
    v_name := nullif(btrim(v_entry->>'name'), '');
    v_city := nullif(btrim(v_entry->>'city'), '');
    v_state := nullif(btrim(v_entry->>'state'), '');
    v_zip := nullif(btrim(v_entry->>'zip'), '');
    v_address := nullif(btrim(v_entry->>'address'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
    v_source_url := nullif(btrim(v_entry->>'source_url'), '');
    if v_name is null then
      return query select 'skipped'::text, null::text, null::text, 'missing name'::text; continue;
    end if;
    v_existing := null;
    select w.wpid into v_existing from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.city, ''))) = lower(coalesce(v_city, '')) limit 1;
    if v_existing is not null then
      return query select 'skipped'::text, v_name, v_existing::text, 'existing name + city (active or archived)'::text; continue;
    end if;
    insert into public.waypoints as w (name, city, state, zip, address, description, source_url)
    values (v_name, v_city, v_state, v_zip, v_address, v_description, v_source_url)
    returning w.wpid into v_wpid;
    return query select 'inserted'::text, v_name, v_wpid::text, null::text;
  end loop;
end;
$$;

select *
from public.tgb_import_waypoints_prompt_items($tgb$
[
  {
    "name": "Pride of Baltimore Memorial",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21230",
    "address": "201 Key Hwy",
    "description": "A raked clipper mast and a block of pink granite in Rash Field name the four crew lost when the schooner Pride of Baltimore was sunk by a white squall in 1986.",
    "source_url": "https://explore.baltimoreheritage.org/items/show/788"
  },
  {
    "name": "Maryland Science Center",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21230",
    "address": "601 Light St",
    "description": "Three floors of hands-on exhibits, a planetarium and an IMAX anchor the south shore of the Inner Harbor.",
    "source_url": "https://en.wikipedia.org/wiki/Maryland_Science_Center"
  },
  {
    "name": "Baltimore Inner Harbor",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": null,
    "description": "The working seaport that became the model for waterfront redevelopment everywhere else, ringed by a promenade you can walk end to end.",
    "source_url": "https://en.wikipedia.org/wiki/Inner_Harbor"
  },
  {
    "name": "Historic Ships in Baltimore",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "301 E Pratt St",
    "description": "Four vessels and a lighthouse moored across three piers, including USS Constellation, the last Civil War-era warship still afloat.",
    "source_url": "https://en.wikipedia.org/wiki/Historic_Ships_in_Baltimore"
  },
  {
    "name": "Pride of Baltimore II",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": null,
    "description": "A sailing replica of an 1812 Baltimore clipper that serves as Maryland's goodwill ambassador, berthed at the Inner Harbor between voyages.",
    "source_url": "https://en.wikipedia.org/wiki/Pride_of_Baltimore"
  },
  {
    "name": "Harborplace & Promenade",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "200 E Pratt St",
    "description": "The 1980 twin pavilions that launched the festival-marketplace era, now largely emptied and awaiting a court-approved redevelopment.",
    "source_url": "https://en.wikipedia.org/wiki/Harborplace"
  },
  {
    "name": "World Trade Center Baltimore",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "401 E Pratt St",
    "description": "I. M. Pei's pentagonal tower, the tallest equilateral five-sided building in the world, with the Top of the World deck on the 27th floor.",
    "source_url": "https://en.wikipedia.org/wiki/Baltimore_World_Trade_Center"
  },
  {
    "name": "National Aquarium",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "501 E Pratt St",
    "description": "A stacked rainforest-to-reef aquarium on Pier 3 whose glass pyramid is the most recognisable roofline on the harbour.",
    "source_url": "https://en.wikipedia.org/wiki/National_Aquarium_(Baltimore)"
  },
  {
    "name": "Seven Foot Knoll Lighthouse",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": null,
    "description": "An 1856 screwpile lighthouse, the oldest surviving on the Chesapeake, barged in from the mouth of the Patapsco in 1988 and set down on Pier 5.",
    "source_url": "https://en.wikipedia.org/wiki/Seven_Foot_Knoll_Light"
  },
  {
    "name": "Rita Rossi Colwell Center",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "701 E Pratt St",
    "description": "The sail-roofed marine research building on Piers 5 and 6, renamed in 2022 for the microbiologist who was the first woman to direct the National Science Foundation.",
    "source_url": "https://colwellcenter.usmd.edu/about-us"
  },
  {
    "name": "Little Italy",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": null,
    "description": "A dense grid of rowhouses and family restaurants between the harbour and Fells Point, where films are still projected on a wall on summer Fridays.",
    "source_url": "https://en.wikipedia.org/wiki/Little_Italy,_Baltimore"
  },
  {
    "name": "Lloyd Street Synagogue",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "11 Lloyd St",
    "description": "Built in 1845, the third-oldest surviving synagogue in the United States and the first in Maryland.",
    "source_url": "https://en.wikipedia.org/wiki/Lloyd_Street_Synagogue"
  },
  {
    "name": "Phoenix Shot Tower",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "701 E Fayette St",
    "description": "An 1828 brick tower, 234 feet tall, down which molten lead was dropped to form musket shot; it was the tallest structure in the country until 1846.",
    "source_url": "https://en.wikipedia.org/wiki/Phoenix_Shot_Tower"
  },
  {
    "name": "War Memorial Building",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "101 N Gay St",
    "description": "A 1925 classical hall facing City Hall across War Memorial Plaza, built to honour Maryland's dead of the First World War.",
    "source_url": "https://explore.baltimoreheritage.org/items/show/439"
  },
  {
    "name": "Baltimore City Hall",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": "100 Holliday St",
    "description": "An 1875 Second Empire building whose cast-iron dome was raised on an iron frame decades before steel framing was standard.",
    "source_url": "https://en.wikipedia.org/wiki/Baltimore_City_Hall"
  },
  {
    "name": "Preston Gardens Park",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21202",
    "address": null,
    "description": "A narrow terraced garden running down the middle of St. Paul Street, laid out in 1917 on a hillside cleared of the Black neighbourhood that stood there.",
    "source_url": "https://en.wikipedia.org/wiki/St._Paul_and_Calvert_streets"
  },
  {
    "name": "Baltimore Basilica",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21201",
    "address": "408 N Charles St",
    "description": "Benjamin Latrobe's 1821 neoclassical cathedral, the first built in the United States after the Constitution guaranteed religious freedom.",
    "source_url": "https://en.wikipedia.org/wiki/Basilica_of_the_National_Shrine_of_the_Assumption_of_the_Blessed_Virgin_Mary"
  },
  {
    "name": "Washington Monument & Marquis de Lafayette Statue",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21201",
    "address": "699 Washington Place",
    "description": "The country's first substantial monument to George Washington, begun in 1815, with Lafayette on horseback in the square below and 227 steps to the top.",
    "source_url": "https://en.wikipedia.org/wiki/Washington_Monument_(Baltimore)"
  },
  {
    "name": "Westminster Hall & Edgar Allan Poe's Grave",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21201",
    "address": "519 W Fayette St",
    "description": "A church built on brick piers over an existing graveyard, leaving catacombs beneath; Poe lies near the front gate under a monument raised 26 years after his death.",
    "source_url": "https://en.wikipedia.org/wiki/Westminster_Hall_and_Burying_Ground"
  },
  {
    "name": "Edgar Allan Poe House & Museum",
    "city": "Baltimore",
    "state": "MD",
    "zip": "21223",
    "address": "203 N Amity St",
    "description": "The tiny rented rowhouse where Poe lived in the early 1830s and wrote some of his first published stories.",
    "source_url": "https://en.wikipedia.org/wiki/Edgar_Allan_Poe_House_and_Museum"
  },
  {
    "name": "Independence Square and Four Corner Sculptures",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": null,
    "description": "The crossing of Trade and Tryon that the city grew out of, marked at each corner by a bronze allegory of Charlotte: commerce, industry, transportation and the future.",
    "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
  },
  {
    "name": "Old Settlers' Cemetery",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "200 W 5th St",
    "description": "Charlotte's oldest surviving burial ground, in use from the 1770s and holding the graves of the town's founding families.",
    "source_url": "https://en.wikipedia.org/wiki/Old_Settlers%27_Cemetery_(Charlotte,_North_Carolina)"
  },
  {
    "name": "Discovery Place Science",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "301 N Tryon St",
    "description": "Uptown's hands-on science museum, with an aquarium, a rainforest floor and an IMAX dome.",
    "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
  },
  {
    "name": "St. Peter's Episcopal Church",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "115 W 7th St",
    "description": "An 1857 Gothic Revival church whose congregation opened Charlotte's first hospital during the Civil War.",
    "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
  },
  {
    "name": "The Green",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "435 S Tryon St",
    "description": "A half-acre pocket park of literary jokes: signposts to every Charlotte in the world, book-spine benches and frogs that quote poetry.",
    "source_url": "https://en.wikipedia.org/wiki/The_Green_(Charlotte,_North_Carolina)"
  },
  {
    "name": "St. Peter Catholic Church",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "507 S Tryon St",
    "description": "The oldest Catholic parish in Charlotte, founded in 1851, with a Jesuit congregation still meeting in its 1893 brick sanctuary.",
    "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
  },
  {
    "name": "Latta Arcade",
    "city": "Charlotte",
    "state": "NC",
    "zip": "28202",
    "address": "320 S Tryon St",
    "description": "A 1915 skylit shopping arcade built for cotton buyers, who needed the natural light to grade samples, opening onto the brick courtyard of Brevard Court.",
    "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
  }
]
$tgb$::jsonb);
