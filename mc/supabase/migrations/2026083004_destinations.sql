-- DESTINATIONS: EVERY CITY A FANDOM CAN TAKE OVER.
--
-- The first table built for the generative model. A game has been a stored row
-- per matchup, which is why there are 395 of them and none is live: every
-- combination had to be written out in advance. **A game is really a CITY plus
-- a VISITING FANDOM**, and the anchor event is a reason to be there rather than
-- a component. One route through Chicago serves every club that visits it.
--
-- This table is the left-hand side of that: the places, and who calls each of
-- them home. 32 NFL rows to start, one per club.
--
-- WHY IT IS NOT A VIEW OVER public.teams, which is the obvious objection:
--
--   1. `teams.city_name` IS WRONG FOR SAN FRANCISCO. It says "San Jose" for the
--      49ers, whose fanbase column says San Francisco and whose venue is Santa
--      Clara. A view would inherit that; a table is a place to correct it once.
--   2. A DESTINATION OUTLIVES ITS CLUB'S ROW. A city stays a place people visit
--      whether or not we still carry the league that took us there.
--   3. IT WILL GAIN COLUMNS A TEAM HAS NO BUSINESS HAVING: a route, an airport,
--      a walkability note, whether we have anything written for it yet.
--
-- THE CITY IS THE FANBASE CITY, NEVER THE VENUE TOWN. Boston, not Foxborough.
-- Dallas, not Arlington. New York, not East Rutherford. Nobody takes over
-- Orchard Park. That rule is already written down for the routines and this is
-- the same rule stored.
--
-- SHARED MARKETS ARE TWO ROWS, NOT ONE. New York holds the Giants and the Jets;
-- Los Angeles holds the Rams and the Chargers. They are two fandoms and two
-- takeovers, and the nickname is in the key precisely so both fit.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083004_destinations.sql

begin;

create table if not exists public.destinations (
  -- ID = CITY + STATE + LEAGUE + NICKNAME, and it is GENERATED rather than
  -- supplied. A key a writer types is a key a writer can mistype, and this one
  -- is a pure function of the four columns beside it: derived, it cannot drift
  -- from them, and a rename is one UPDATE rather than an UPDATE plus a hunt for
  -- every row that spelled the old key.
  id text generated always as (
    lower(
      regexp_replace(city,     '[^a-zA-Z0-9]+', '-', 'g') || '-' ||
      regexp_replace(state,    '[^a-zA-Z0-9]+', '-', 'g') || '-' ||
      regexp_replace(league,   '[^a-zA-Z0-9]+', '-', 'g') || '-' ||
      regexp_replace(nickname, '[^a-zA-Z0-9]+', '-', 'g')
    )
  ) stored primary key,

  city     text not null,
  -- TWO LETTERS, the postal abbreviation. `teams` and `events` both already
  -- spell a state this way, and a table that spelled it out would be the one
  -- thing nothing else could join to.
  state    text not null,
  league   text not null,
  nickname text not null,

  constraint destinations_state_len check (char_length(state) = 2),
  constraint destinations_city_not_blank check (btrim(city) <> ''),
  constraint destinations_nickname_not_blank check (btrim(nickname) <> '')
);

comment on table public.destinations is
  'Every city a visiting fandom can take over, one row per club. The left-hand '
  'side of the generative model: a game is a CITY plus a VISITING FANDOM, and '
  'the anchor event is a reason to be there rather than a component.';
comment on column public.destinations.id is
  'city-state-league-nickname, lowercased and hyphenated. GENERATED, never '
  'supplied: a pure function of the four columns beside it, so it cannot drift.';
comment on column public.destinations.city is
  'The FANBASE city, never the venue town. Boston not Foxborough, Dallas not '
  'Arlington, New York not East Rutherford. Nobody takes over Orchard Park.';

-- A city with more than one club is two rows and must stay reachable as one
-- place, which is what this index is for rather than uniqueness.
create index if not exists destinations_city_idx
  on public.destinations (lower(city), state);
create index if not exists destinations_league_idx
  on public.destinations (league);

alter table public.destinations enable row level security;

-- Reference data with nothing private in it, read the same way `teams` and
-- `leagues` are read: by the public pages, with the publishable key.
drop policy if exists "destinations are public" on public.destinations;
create policy "destinations are public" on public.destinations
  for select using (true);

drop policy if exists "destinations admin insert" on public.destinations;
drop policy if exists "destinations admin update" on public.destinations;
drop policy if exists "destinations admin delete" on public.destinations;
create policy "destinations admin insert" on public.destinations
  for insert to authenticated with check (is_photo_admin());
create policy "destinations admin update" on public.destinations
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "destinations admin delete" on public.destinations
  for delete to authenticated using (is_photo_admin());

grant select on public.destinations to anon, authenticated;
grant insert, update, delete on public.destinations to authenticated;

-- ---------------------------------------------------------------------------
-- THE 32.
--
-- Taken from `public.teams` rather than typed, so the spelling matches what the
-- rest of the database already holds -- with ONE correction, made here and
-- named rather than smuggled: `teams.city_name` says SAN JOSE for the 49ers.
-- Its own `fanbase` column says San Francisco, which is the documented rule and
-- what a fan would say. The source below is `fanbase`, which is right for all
-- 32; `city_name` is right for 31.
-- ---------------------------------------------------------------------------
insert into public.destinations (city, state, league, nickname)
select
  btrim(split_part(t.fanbase, ',', 1)),
  upper(btrim(split_part(t.fanbase, ',', 2))),
  t.league,
  btrim(t.mascot)
  from public.teams t
 where t.league = 'NFL'
   and coalesce(btrim(t.fanbase), '') <> ''
   and coalesce(btrim(t.mascot), '') <> ''
on conflict (id) do nothing;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers rather than the absence of an error.
-- ---------------------------------------------------------------------------
--
--   select count(*) from public.destinations;                  -- expect 32
--   select count(distinct id) from public.destinations;        -- expect 32
--   select count(distinct lower(city) || state) from public.destinations;
--                                                              -- expect 30
--                                          (New York and Los Angeles hold two)
--
--   -- the fanbase-city rule held, so none of these appears:
--   select city from public.destinations
--    where city in ('Foxborough','Orchard Park','East Rutherford','Arlington',
--                   'Inglewood','Santa Clara','Glendale','Paradise',
--                   'Miami Gardens','Landover','San Jose');
--                                                              -- expect 0 rows
--
--   -- the two shared markets:
--   select city, state, string_agg(nickname, ' + ' order by nickname)
--     from public.destinations group by 1,2 having count(*) > 1;
--                                     -- expect New York and Los Angeles only
--
--   -- and the key really is derived:
--   select id from public.destinations order by id limit 3;
--                                     -- expect atlanta-ga-nfl-falcons, ...
