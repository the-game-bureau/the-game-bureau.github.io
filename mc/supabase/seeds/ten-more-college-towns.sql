-- TEN MORE COLLEGE TOWNS. 2026-09-01.
--
-- The same rule as [college-towns-the-confident-ones.sql]: fill the ones I would
-- defend and leave the rest blank. **A wrong city here is not cosmetic** --
-- `tgb_slug(city)` is how `destinations` is keyed and how `tgb_anti_audience`
-- finds a game's rival, so a plausible-looking mistake resolves silently and
-- looks exactly like a right answer. A blank is visible; a wrong town is not.
--
-- SEVEN OF THE TEN ARE SCHOOLS NAMED FOR THEIR OWN TOWN, which is the safest
-- class there is: Adrian, Ashland, Beloit, Bemidji State, Bloomsburg, Chadron
-- State and Clarion. The other three are campuses whose town is a matter of
-- record rather than recall -- Golden, Greencastle and Granville.
--
-- MATCHED ON `first`, WHICH IS THE SCHOOL. `full_name` is the school plus its
-- mascot and `last` is the mascot alone, so `first` is the half that identifies
-- the institution -- and the guard below means a row that already carries a city
-- is never overwritten.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

update public.audiences a set city = v.city
  from (values
    -- named for their own town
    ('Adrian',                   'Adrian, MI'),
    ('Ashland',                  'Ashland, OH'),
    ('Beloit',                   'Beloit, WI'),
    ('Bemidji State',            'Bemidji, MN'),
    ('Bloomsburg',               'Bloomsburg, PA'),
    ('Chadron State',            'Chadron, NE'),
    ('Clarion',                  'Clarion, PA'),
    -- a matter of record
    ('Colorado School of Mines', 'Golden, CO'),
    ('DePauw',                   'Greencastle, IN'),
    ('Denison',                  'Granville, OH')
  ) as v(first, city)
 where a.first = v.first
   and a.league = 'NCAAF'
   and (a.city is null or btrim(a.city) = '');

commit;

-- ---------------------------------------------------------------------------
-- Verify. Ten filled, and -- the one that matters -- nothing already carrying a
-- city was overwritten. `destinations` should grow by exactly ten, since every
-- fandom with a city and a mascot reaches it now that 2026090120 severed the
-- `places` join.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and city is not null and btrim(city) <> '') as college_with_a_city,
--   (select count(*) from public.audiences where league = 'NCAAF'
--      and (city is null or btrim(city) = '')) as still_blank,
--   (select count(*) from public.destinations) as destinations,
--   (select count(distinct id) from public.destinations) as distinct_ids;
