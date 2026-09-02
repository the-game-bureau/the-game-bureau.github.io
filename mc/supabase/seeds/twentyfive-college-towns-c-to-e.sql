-- TWENTY-FIVE MORE COLLEGE TOWNS, CONTINUING ALPHABETICALLY. 2026-09-01.
--
-- The blanks in `first` order, Capital down to Edinboro. Same rule as the three
-- seeds before it: fill the ones I would defend and leave the rest. **A wrong
-- city here is not cosmetic** -- `tgb_slug(city)` is how `destinations` is keyed
-- and how `tgb_anti_audience` finds a game's rival, so a plausible mistake
-- resolves silently and looks exactly like a right answer.
--
-- SIX ARE NAMED FOR THEIR OWN TOWN: Defiance, Dickinson State, Dubuque, East
-- Stroudsburg, Edinboro and Claremont's consortium. The rest are campuses whose
-- town is a matter of record.
--
-- FIVE IN THE RUN ARE SKIPPED AND EACH FOR ITS OWN REASON:
--   BLUEFIELD    two schools of that name in two states, as before.
--   CONCORD      **Concord University is in ATHENS, West Virginia** -- a school
--                whose name is a town it is not in, and there are Concords in
--                North Carolina and New Hampshire to be wrong about. The exact
--                shape of the `Austin` trap, so it waits for better evidence.
--   CROWN        a common name and a small programme.
--   CUMBERLANDS  the University of the Cumberlands is in Williamsburg, Kentucky
--                and I would be recalling rather than knowing.
--   DES MOINES   **`first` is the TOWN and the code is GRANDVIEW**, so the row
--                is Grand View University and its own name half is already a
--                city. That is a data question rather than a lookup, and filling
--                `city` would paper over it.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

update public.audiences a set city = v.city
  from (values
    -- named for their own town
    ('Defiance College',            'Defiance, OH'),
    ('Dickinson State University',  'Dickinson, ND'),
    ('Dubuque',                     'Dubuque, IA'),
    ('East Stroudsburg',            'East Stroudsburg, PA'),
    ('Edinboro',                    'Edinboro, PA'),
    ('Claremont Mudd Scripps',      'Claremont, CA'),

    -- a matter of record
    ('Capital',                     'Columbus, OH'),
    ('Carleton',                    'Northfield, MN'),
    ('Carson Newman',               'Jefferson City, TN'),
    ('Catawba',                     'Salisbury, NC'),
    ('Catholic',                    'Washington, DC'),
    ('Central Missouri',            'Warrensburg, MO'),
    ('Central Oklahoma',            'Edmond, OK'),
    ('Central Washington',          'Ellensburg, WA'),
    ('Centre',                      'Danville, KY'),
    ('Chapman',                     'Orange, CA'),
    ('Coe',                         'Cedar Rapids, IA'),
    ('Colorado Mesa',               'Grand Junction, CO'),
    ('Concordia Chicago',           'River Forest, IL'),
    ('Culver-Stockton College',     'Canton, MO'),
    ('Dakota State University',     'Madison, SD'),
    ('Dakota Wesleyan',             'Mitchell, SD'),
    ('Delta State',                 'Cleveland, MS'),
    ('Dickinson',                   'Carlisle, PA'),
    ('Eastern New Mexico',          'Portales, NM')
  ) as v(first, city)
 where a.first = v.first
   and a.league = 'NCAAF'
   and (a.city is null or btrim(a.city) = '');

commit;

-- ---------------------------------------------------------------------------
-- Verify. Twenty-five filled and `destinations` up by exactly twenty-five.
-- **`Washington, DC` IS THE ONE TO LOOK AT**: `DC` is not a state code, and the
-- form here is `City, ST` on every other row -- it keys as `washington-dc`,
-- which is what the whole catalogue already spells for the District.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and city is not null and btrim(city) <> '') as college_with_a_city,
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and (city is null or btrim(city) = '')) as still_blank,
--   (select count(*) from public.destinations) as destinations,
--   (select count(distinct id) from public.destinations) as distinct_ids;
