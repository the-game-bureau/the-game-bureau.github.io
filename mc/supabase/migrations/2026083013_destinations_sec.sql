-- THE SEC JOINS THE DESTINATIONS, 16 ROWS.
--
-- **THIS ONE COULD NOT BE SEEDED FROM `public.teams` AND THAT IS THE WHOLE
-- NOTE.** For NCAAF that table holds `city_name = NULL` on all 16 rows and
-- `fanbase` holds the SCHOOL rather than a place: `Alabama`, `Georgia`, `Texas`.
-- Two of them happen to be towns (`Oxford`, `Starkville`) which makes the column
-- look usable and is exactly how a bad seed gets written. **Every town below is
-- resolved by hand**, which this file records so nobody tries the shortcut again.
--
-- THE COLLEGE CASE INVERTS THE ALIAS RULE, AND IT MATTERS MORE HERE THAN
-- ANYWHERE. In the pro leagues the city is what a fan says and the alias is the
-- exception. **Here almost nobody says the town.** They say Alabama, not
-- Tuscaloosa; Georgia, not Athens; Texas, not Austin. The town is still the
-- right thing to STORE, because that is where a game is walked and Athens and
-- Austin are real, walkable places, but **the alias is the only way in** and a
-- row without one is unreachable in practice.
--
-- THREE TIGERS AND TWO BULLDOGS, and the key absorbs it: `auburn-al-ncaaf-tigers`,
-- `baton-rouge-la-ncaaf-tigers` and `columbia-mo-ncaaf-tigers` are three ids,
-- because the city is in the key. **Two Columbias as well**, MO and SC, told
-- apart by the state for the same reason.
--
-- NASHVILLE NOW HOLDS THREE CLUBS across three leagues: Titans, Predators and
-- Commodores. AUBURN is the only row whose town and school share a name.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083013_destinations_sec.sql

begin;

insert into public.destinations (city, state, league, nickname) values
  ('Tuscaloosa',      'AL', 'NCAAF', 'Crimson Tide'),
  ('Fayetteville',    'AR', 'NCAAF', 'Razorbacks'),
  ('Auburn',          'AL', 'NCAAF', 'Tigers'),
  ('Gainesville',     'FL', 'NCAAF', 'Gators'),
  ('Athens',          'GA', 'NCAAF', 'Bulldogs'),
  ('Lexington',       'KY', 'NCAAF', 'Wildcats'),
  ('Baton Rouge',     'LA', 'NCAAF', 'Tigers'),
  ('Columbia',        'MO', 'NCAAF', 'Tigers'),
  ('Norman',          'OK', 'NCAAF', 'Sooners'),
  ('Oxford',          'MS', 'NCAAF', 'Rebels'),
  ('Columbia',        'SC', 'NCAAF', 'Gamecocks'),
  ('Starkville',      'MS', 'NCAAF', 'Bulldogs'),
  ('Knoxville',       'TN', 'NCAAF', 'Volunteers'),
  ('Austin',          'TX', 'NCAAF', 'Longhorns'),
  ('College Station', 'TX', 'NCAAF', 'Aggies'),
  ('Nashville',       'TN', 'NCAAF', 'Commodores')
on conflict (id) do nothing;

-- WITHOUT THESE THE ROWS ARE UNFINDABLE. See the note above: the school name is
-- what a fan types, and it is not the town.
update public.destinations d set aliases = v.a
  from (values
    ('tuscaloosa-al-ncaaf-crimson-tide',   array['alabama','bama','roll tide']),
    ('fayetteville-ar-ncaaf-razorbacks',   array['arkansas','hogs','woo pig']),
    ('auburn-al-ncaaf-tigers',             array['war eagle']),
    ('gainesville-fl-ncaaf-gators',        array['florida']),
    ('athens-ga-ncaaf-bulldogs',           array['georgia','uga','dawgs']),
    ('lexington-ky-ncaaf-wildcats',        array['kentucky']),
    ('baton-rouge-la-ncaaf-tigers',        array['lsu','louisiana','geaux tigers']),
    ('columbia-mo-ncaaf-tigers',           array['missouri','mizzou']),
    ('norman-ok-ncaaf-sooners',            array['oklahoma','boomer sooner']),
    ('oxford-ms-ncaaf-rebels',             array['ole miss','mississippi','hotty toddy']),
    ('columbia-sc-ncaaf-gamecocks',        array['south carolina']),
    ('starkville-ms-ncaaf-bulldogs',       array['mississippi state','hail state']),
    ('knoxville-tn-ncaaf-volunteers',      array['tennessee','vols','rocky top']),
    ('austin-tx-ncaaf-longhorns',          array['texas','hook em']),
    ('college-station-tx-ncaaf-aggies',    array['texas a&m','texas am','aggieland']),
    ('nashville-tn-ncaaf-commodores',      array['vanderbilt','vandy'])
  ) as v(id, a)
 where d.id = v.id;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select league, count(*) from public.destinations group by 1 order by 1;
--                                     -- NBA 30, NCAAF 16, NFL 32, NHL 32 = 110
--   -- every SEC row is findable by the name a fan actually uses:
--   select city, nickname, cardinality(aliases) from public.destinations
--    where league = 'NCAAF' and cardinality(aliases) = 0;   -- expect 0 rows
--   -- the three Tigers and the two Columbias are distinct:
--   select id from public.destinations where nickname = 'Tigers' order by id;
--   -- and no alias names another destination's city:
--   select distinct a from public.destinations d, unnest(d.aliases) a
--    where exists (select 1 from public.destinations x
--                   where lower(x.city) = a and lower(x.city) <> lower(d.city));
-- ---------------------------------------------------------------------------
