-- AUDIENCES: WHO A GAME IS PITCHED AT.
--
-- The other half of what `destinations` had welded together. A destination is a
-- place AND a club; this is the club half, free of the place, so it can travel.
--
-- **AN AUDIENCE IS NAMED BY WHAT ITS MEMBERS CALL THEMSELVES.** That one rule
-- settles every naming question here and it is not arbitrary: a pro fan says
-- "Bears fan", a college fan says "Alabama fan", never "Crimson Tide fan", and
-- nobody at all says "Tuscaloosa fan". So `name` is the nickname for a pro club
-- and the SCHOOL for a college one, which is also the only thing that makes the
-- key unique -- see below.
--
-- ── THE CLAIM THE WIREFRAME MADE, AND WHY IT IS WITHDRAWN ──────────────────
--
-- It said `destinations.id` would decompose into `places.id` + `audiences.id`:
-- chicago-il + nfl-bears. That is true for 105 of the 110 and **false for five**,
-- measured before this file was written:
--
--   ncaaf-tigers    3 clubs   Auburn / Baton Rouge / Columbia
--   ncaaf-bulldogs  2 clubs   Athens / Starkville
--
-- A league and a mascot do not identify a college club. **An invariant with five
-- exceptions is worse than no invariant**, because everything downstream has to
-- learn the exceptions. So the decomposition is dropped and the relationship is
-- STORED instead: `home_place_id` and `destination_id` say it outright, no string
-- arithmetic anywhere, and the college case stops being special.
--
-- **NOTHING BREAKS.** `destinations.id` is unchanged, so every trivia key written
-- so far reads exactly as it did.
--
-- ── WHAT THE LADDER ACTUALLY NEEDS ────────────────────────────────────────
--
--   nfl-bears     your club, anywhere it travels        <- an audience id
--   nfl-saints    the club you are surrounded by        <- an audience id
--   nfl           the family                            <- `family`
--
-- **EVERY GAME HAS AN AUDIENCE AND AN ANTI-AUDIENCE**, and the anti-audience is
-- not a column: it is the home place's own audience, reached through
-- `home_place_id`. Do not add an `anti_audience` anything.
--
-- ── ALIASES ───────────────────────────────────────────────────────────────
--
-- `destinations.aliases` mixes two kinds: club words (bama, roll tide, carolina)
-- and place words (nola, philly, the six). **They are copied here whole, and the
-- place-only ones still want moving to `places.aliases` in a later pass.** That
-- is stated rather than half-done: destinations keeps its copy and keeps
-- working, so nothing is lost by taking the split slowly.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083017_audiences.sql

begin;

create table if not exists public.audiences (
  id text generated always as (
    lower(
      regexp_replace(family, '[^a-zA-Z0-9]+', '-', 'g') || '-' ||
      regexp_replace(name,   '[^a-zA-Z0-9]+', '-', 'g')
    )
  ) stored primary key,

  -- THE LADDER'S BROADEST NAMED RUNG. A league for a club, a domain otherwise:
  -- nfl, nba, nhl, ncaaf, music, history, film.
  family text not null,
  -- WHAT ITS MEMBERS CALL THEMSELVES. Bears. Alabama. Taylor Swift.
  name   text not null,

  kind text not null default 'fandom',

  -- WHERE THEY ARE AT HOME, when they are at home anywhere. An artist is not.
  -- A historical interest is not. **That one nullable column is the whole
  -- accommodation for a concert walk and a history walk.**
  home_place_id text references public.places (id) on delete set null,
  -- The club's destination row, so the pairing needs no string arithmetic.
  destination_id text references public.destinations (id) on delete set null,

  -- REFERENCE, NOT SPINE: public.teams keeps the colours and the codes.
  -- Deliberately NOT a foreign key, for the reason challenges.scope_team is not:
  -- teams.team_key is generated from league and code, and dropping a league we
  -- stop carrying must not null an audience that is still perfectly good.
  team_key text,

  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),

  constraint audiences_kind check (kind in ('fandom', 'artist', 'interest')),
  constraint audiences_family_not_blank check (btrim(family) <> ''),
  constraint audiences_name_not_blank check (btrim(name) <> ''),
  constraint audiences_aliases_lower check (aliases::text = lower(aliases::text)),
  constraint audiences_aliases_not_blank check (not (aliases && array['']::text[])),
  -- A CLUB HAS A HOME AND A DESTINATION; AN ARTIST HAS NEITHER. What is refused
  -- is a destination with no home, which is the one state no reader could read.
  constraint audiences_destination_needs_home
    check (destination_id is null or home_place_id is not null)
);

comment on table public.audiences is
  'Who a game is pitched at: a fandom, an artist, an interest. The club half of '
  'what destinations welded together, free of the place so it can travel. Named '
  'by what its members call themselves.';
comment on column public.audiences.name is
  'What its members call themselves: the nickname for a pro club, the SCHOOL for '
  'a college one. Nobody says "Crimson Tide fan" and nobody says "Tuscaloosa '
  'fan"; and the school is also the only thing that makes ncaaf keys unique.';
comment on column public.audiences.home_place_id is
  'Where they are at home, when they are at home anywhere. Null for an artist or '
  'an interest, which is the whole accommodation for a concert or a history walk. '
  'The ANTI-AUDIENCE of a game is reached through this: it is the home place''s '
  'own audience. Never store it separately.';

create index if not exists audiences_family_idx on public.audiences (family);
create index if not exists audiences_home_idx on public.audiences (home_place_id);
create index if not exists audiences_aliases_idx on public.audiences using gin (aliases);

alter table public.audiences enable row level security;
drop policy if exists "audiences are public" on public.audiences;
create policy "audiences are public" on public.audiences for select using (true);
drop policy if exists "audiences admin insert" on public.audiences;
drop policy if exists "audiences admin update" on public.audiences;
drop policy if exists "audiences admin delete" on public.audiences;
create policy "audiences admin insert" on public.audiences
  for insert to authenticated with check (is_photo_admin());
create policy "audiences admin update" on public.audiences
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "audiences admin delete" on public.audiences
  for delete to authenticated using (is_photo_admin());
grant select on public.audiences to anon, authenticated;
grant insert, update, delete on public.audiences to authenticated;

-- ---------------------------------------------------------------------------
-- 1. THE 94 PRO CLUBS. The nickname is unique within a league, so it is the name.
-- ---------------------------------------------------------------------------
insert into public.audiences (family, name, kind)
select distinct lower(d.league), btrim(d.nickname), 'fandom'
  from public.destinations d
 where d.league in ('NFL', 'NBA', 'NHL')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. THE 16 SEC SCHOOLS, WRITTEN OUT.
--
-- **They cannot be derived and the attempt is the trap.** `teams.fanbase` holds
-- the school for NCAAF, but joining a destination to it on the mascot is
-- ambiguous for exactly the five rows that made this necessary: three Tigers and
-- two Bulldogs. The pairing is stated instead.
-- ---------------------------------------------------------------------------
insert into public.audiences (family, name, kind) values
  ('ncaaf', 'Alabama',           'fandom'),
  ('ncaaf', 'Arkansas',          'fandom'),
  ('ncaaf', 'Auburn',            'fandom'),
  ('ncaaf', 'Florida',           'fandom'),
  ('ncaaf', 'Georgia',           'fandom'),
  ('ncaaf', 'Kentucky',          'fandom'),
  ('ncaaf', 'LSU',               'fandom'),
  ('ncaaf', 'Missouri',          'fandom'),
  ('ncaaf', 'Oklahoma',          'fandom'),
  ('ncaaf', 'Ole Miss',          'fandom'),
  ('ncaaf', 'South Carolina',    'fandom'),
  ('ncaaf', 'Mississippi State', 'fandom'),
  ('ncaaf', 'Tennessee',         'fandom'),
  ('ncaaf', 'Texas',             'fandom'),
  ('ncaaf', 'Texas A&M',         'fandom'),
  ('ncaaf', 'Vanderbilt',        'fandom')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. HOME AND DESTINATION, for the pro clubs. Matched on league + nickname,
--    which IS unique for NFL, NBA and NHL -- the collisions are college only.
-- ---------------------------------------------------------------------------
update public.audiences a
   set home_place_id = p.id, destination_id = d.id
  from public.destinations d
  join public.places p
    on p.id = lower(regexp_replace(d.city,  '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
              lower(regexp_replace(d.state, '[^a-zA-Z0-9]+', '-', 'g'))
 where a.family = lower(d.league)
   and lower(a.name) = lower(d.nickname)
   and d.league in ('NFL', 'NBA', 'NHL')
   and a.home_place_id is null;

-- 4. HOME AND DESTINATION for the SEC, by the same by-hand pairing the seed used.
update public.audiences a
   set home_place_id = v.place, destination_id = v.dest
  from (values
    ('ncaaf-alabama',           'tuscaloosa-al',      'tuscaloosa-al-ncaaf-crimson-tide'),
    ('ncaaf-arkansas',          'fayetteville-ar',    'fayetteville-ar-ncaaf-razorbacks'),
    ('ncaaf-auburn',            'auburn-al',          'auburn-al-ncaaf-tigers'),
    ('ncaaf-florida',           'gainesville-fl',     'gainesville-fl-ncaaf-gators'),
    ('ncaaf-georgia',           'athens-ga',          'athens-ga-ncaaf-bulldogs'),
    ('ncaaf-kentucky',          'lexington-ky',       'lexington-ky-ncaaf-wildcats'),
    ('ncaaf-lsu',               'baton-rouge-la',     'baton-rouge-la-ncaaf-tigers'),
    ('ncaaf-missouri',          'columbia-mo',        'columbia-mo-ncaaf-tigers'),
    ('ncaaf-oklahoma',          'norman-ok',          'norman-ok-ncaaf-sooners'),
    ('ncaaf-ole-miss',          'oxford-ms',          'oxford-ms-ncaaf-rebels'),
    ('ncaaf-south-carolina',    'columbia-sc',        'columbia-sc-ncaaf-gamecocks'),
    ('ncaaf-mississippi-state', 'starkville-ms',      'starkville-ms-ncaaf-bulldogs'),
    ('ncaaf-tennessee',         'knoxville-tn',       'knoxville-tn-ncaaf-volunteers'),
    ('ncaaf-texas',             'austin-tx',          'austin-tx-ncaaf-longhorns'),
    ('ncaaf-texas-a-m',         'college-station-tx', 'college-station-tx-ncaaf-aggies'),
    ('ncaaf-vanderbilt',        'nashville-tn',       'nashville-tn-ncaaf-commodores')
  ) as v(id, place, dest)
 where a.id = v.id
   and exists (select 1 from public.places p where p.id = v.place)
   and exists (select 1 from public.destinations d where d.id = v.dest);

-- ---------------------------------------------------------------------------
-- 5. THE ALIASES, copied whole from the destination. See the header: the
--    place-only ones still want moving to places.aliases in a later pass.
-- ---------------------------------------------------------------------------
update public.audiences a
   set aliases = d.aliases
  from public.destinations d
 where a.destination_id = d.id
   and cardinality(d.aliases) > 0
   and cardinality(a.aliases) = 0;

-- ---------------------------------------------------------------------------
-- 6. THE COLOURS, through public.teams. Matched on league and mascot, which is
--    ambiguous for college, so college is left for a pass that can tell three
--    Tigers apart. A null team_key costs a palette, not a game.
-- ---------------------------------------------------------------------------
update public.audiences a
   set team_key = t.team_key
  from public.teams t
 where a.team_key is null
   and a.family in ('nfl', 'nba', 'nhl')
   and lower(t.league) = a.family
   and lower(btrim(t.mascot)) = lower(a.name);

-- ---------------------------------------------------------------------------
-- 7. ONE AUDIENCE THAT IS NOT A CLUB, so the shape is proved by a row rather
--    than by an argument. Kevin's own example: Oswald in New Orleans.
--    **No home place, no destination, no team.** That is the whole point.
-- ---------------------------------------------------------------------------
insert into public.audiences (family, name, kind, aliases) values
  ('history', 'JFK', 'interest', array['oswald','lee harvey oswald','kennedy','assassination'])
on conflict (id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers.
--
--   select family, count(*) from public.audiences group by 1 order by 1;
--                                     -- nfl 32, nhl 32, nba 30, ncaaf 16, history 1
--
--   -- every club audience knows where it is at home:
--   select id from public.audiences
--    where kind = 'fandom' and home_place_id is null order by id;   -- expect none
--
--   -- and every destination has exactly one audience:
--   select count(*) from public.destinations d
--    where not exists (select 1 from public.audiences a where a.destination_id = d.id);
--                                                                   -- expect 0
--
--   -- the anti-audience of a game, with no column for it:
--   select a.id as visiting, home.id as anti
--     from public.audiences a
--     cross join lateral (select id from public.audiences x
--                          where x.home_place_id = 'new-orleans-la' limit 1) home
--    where a.id = 'nfl-bears';
--
--   -- the one that is not a club:
--   select id, family, name, kind, home_place_id from public.audiences
--    where kind <> 'fandom';
-- ---------------------------------------------------------------------------
