-- TWENTY-FIVE COLLEGE TOWNS, WORKING ALPHABETICALLY FROM THE TOP. 2026-09-01.
--
-- The blanks in `first` order, taken from Adams State down to Campbellsville.
-- Same rule as the two seeds before it: fill the ones I would defend and leave
-- the rest. **A wrong city here is not cosmetic** -- `tgb_slug(city)` is how
-- `destinations` is keyed and how `tgb_anti_audience` finds a game's rival, so a
-- plausible mistake resolves silently and looks exactly like a right answer. A
-- blank is visible; a wrong town is not.
--
-- ONE IN THE RUN IS SKIPPED AND IT IS WORTH NAMING: **BLUEFIELD**. There are two
-- schools of that name in two states -- Bluefield University in Bluefield,
-- Virginia and Bluefield State in Bluefield, West Virginia -- and the mascot on
-- the row does not cleanly settle which. **A name that does not identify one
-- school is exactly the case the first seed left out**, and it is the same
-- reasoning that left `Monmouth` alone. So the twenty-five run one row further
-- down the alphabet rather than the run being one short.
--
-- THE TRAP IN THIS BATCH IS `Austin`. **Austin College is in SHERMAN, Texas**,
-- not in Austin -- a school named for a person rather than for its town, sitting
-- among a dozen that are named for theirs. Filling it from the name would be the
-- exact failure this file keeps warning about.
--
-- MATCHED ON `first`, WHICH IS THE SCHOOL. `full_name` is the school plus its
-- mascot and `last` is the mascot alone. The guard below means a row that
-- already carries a city is never overwritten.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

update public.audiences a set city = v.city
  from (values
    -- named for their own town, which is the safest class there is
    ('Alfred',                        'Alfred, NY'),
    ('Arkansas Monticello',           'Monticello, AR'),
    ('Aurora',                        'Aurora, IL'),
    ('Bluffton',                      'Bluffton, OH'),
    ('Bridgewater',                   'Bridgewater, VA'),
    ('Campbellsville University',     'Campbellsville, KY'),

    -- a matter of record
    ('Adams State',                   'Alamosa, CO'),
    ('Albright',                      'Reading, PA'),
    ('Allegheny',                     'Meadville, PA'),
    ('American International',        'Springfield, MA'),
    ('Angelo State',                  'San Angelo, TX'),
    ('Anna Maria',                    'Paxton, MA'),
    ('Arkansas Tech',                 'Russellville, AR'),
    ('Augsburg',                      'Minneapolis, MN'),
    ('Austin',                        'Sherman, TX'),
    ('Averett',                       'Danville, VA'),
    ('Avila University',              'Kansas City, MO'),
    ('Baker University',              'Baldwin City, KS'),
    ('Baldwin Wallace',               'Berea, OH'),
    ('Belhaven',                      'Jackson, MS'),
    ('Bethel University Tennessee',   'McKenzie, TN'),
    ('Black Hills State',             'Spearfish, SD'),
    ('British Columbia',              'Vancouver, BC'),
    ('Buena Vista',                   'Storm Lake, IA'),
    ('Cal Lutheran',                  'Thousand Oaks, CA')
  ) as v(first, city)
 where a.first = v.first
   and a.league = 'NCAAF'
   and (a.city is null or btrim(a.city) = '');

commit;

-- ---------------------------------------------------------------------------
-- Verify. Twenty-five filled, nothing already carrying a city overwritten, and
-- `destinations` up by exactly twenty-five -- every fandom with a city and a
-- mascot reaches it now that 2026090120 severed the `places` join, and **not one
-- of these towns is in that catalogue**, so every one of them would have been
-- stored and still invisible before it.
--
-- `Vancouver, BC` IS THE ONE NON-US ROW HERE. The form is `City, ST` and a
-- Canadian province happens to be two letters, so it keys the same way -- the
-- same coincidence this file already records for Toronto and the eight Canadian
-- NHL clubs. **A country whose subdivisions are longer needs a column, not a
-- workaround.**
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and city is not null and btrim(city) <> '') as college_with_a_city,
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and (city is null or btrim(city) = '')) as still_blank,
--   (select count(*) from public.destinations) as destinations,
--   (select count(distinct id) from public.destinations) as distinct_ids;
