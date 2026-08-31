-- A GAME NAMES A TARGET AUDIENCE AND A RIVAL AUDIENCE, AND ITS COLOURS COME
-- FROM THE TARGET.
--
-- **A GAME HAS ALWAYS HAD TWO FANDOMS IN PLAY**, and until now it named them by
-- string: `away_team_key`, `home_team_key`, plus a city and a mascot that a
-- fuzzy scorer matched against `public.teams`. Now that a fandom is a row, a
-- game can point at it.
--
--   TARGET  who the game is pitched at -- the VISITING fandom, whose colours the
--           game wears. That is the standing rule, not a new one: a game takes
--           its copy and its palette from the away club.
--   RIVAL   the fandom they are surrounded by -- the HOME club. It is what
--           `tgb_anti_audience` computes for a generated game, and what a
--           "Know Your Enemy" question is keyed to.
--
-- ── ADDED BESIDE, NEVER INSTEAD OF ────────────────────────────────────────
--
-- `away_team_key` and `home_team_key` keep their values and their meaning.
-- **`public.games` is read by both engines with `select=*` and is the paid
-- product**, so nothing here removes anything: a page that has not caught up
-- reads exactly what it always read.
--
-- ── THE BACKFILL RESOLVES EVERYTHING IT CAN, WHICH IS EVERYTHING ──────────
--
--   367 of 395 carry an away key, and **all 367 resolve to an audience**
--   366 resolve a home key as well
--    28 carry no away key at all -- 12 of them live -- and those are the games
--       that are not a fixture: a history walk, a city walk, a concert. **A game
--       with no travelling side has no target to derive**, which is the same
--       shape /games/ already handles by naming the game instead.
--
-- ── WHY THE COLOURS FOLLOW ────────────────────────────────────────────────
--
-- **218 of the 367 have a stored `primary_color` that DISAGREES with the away
-- club's shell**, and the stored one is the stale half: `serializeGameRow` has
-- skipped writing those columns for fandom games since 2026-06-16, precisely so
-- that `teamPalette()` is the single source of truth. Pointing at the audience
-- makes that lookup an exact join instead of a fuzzy match on a city and a
-- mascot.
--
-- The view gains `audience_id` so a caller holding a game can find the row
-- without a second query.
--
-- ── A NOTE ON TWO WORDS FOR ONE THING ─────────────────────────────────────
--
-- The functions call it `anti_audience`; these columns call it `rival`, which is
-- the word actually used for it. **`tgb_anti_audience` keeps its name on
-- purpose**: `tgb_content_keys`, `tgb_trivia_for` and `tgb_build_game` all call
-- it, and a `create or replace` chain to rename a function is how this project
-- has silently dropped a column before. If they converge, they converge in one
-- migration that does nothing else.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083027_a_game_names_its_audiences.sql

begin;

alter table public.games
  add column if not exists target_audience_id text,
  add column if not exists rival_audience_id  text;

-- ON DELETE SET NULL, never cascade: deleting an audience must not delete a game
-- somebody bought. A game that loses its fandom is a game to look at, not to
-- destroy.
alter table public.games drop constraint if exists games_target_audience_fkey;
alter table public.games add constraint games_target_audience_fkey
  foreign key (target_audience_id) references public.audiences (id) on delete set null;
alter table public.games drop constraint if exists games_rival_audience_fkey;
alter table public.games add constraint games_rival_audience_fkey
  foreign key (rival_audience_id) references public.audiences (id) on delete set null;

comment on column public.games.target_audience_id is
  'Who the game is pitched at: the VISITING fandom, whose colours and copy the '
  'game wears. Null on a game that is not a fixture -- a history walk has no '
  'travelling side, and that is ordinary rather than missing.';
comment on column public.games.rival_audience_id is
  'The fandom they are surrounded by: the HOME club. What tgb_anti_audience '
  'computes for a generated game, and what a Know Your Enemy question is keyed '
  'to. Null when there is nobody to be up against.';

update public.games g set target_audience_id = a.id
  from public.audiences a
 where a.team_key = g.away_team_key and g.target_audience_id is null;

update public.games g set rival_audience_id = a.id
  from public.audiences a
 where a.team_key = g.home_team_key and g.rival_audience_id is null;

create index if not exists games_target_audience_idx on public.games (target_audience_id);
create index if not exists games_rival_audience_idx  on public.games (rival_audience_id);

-- THE VIEW CARRIES THE AUDIENCE ID, so a caller holding a game can join straight
-- to the club rather than scoring a city and a mascot against 639 rows.
drop view if exists public.teams;
create view public.teams with (security_invoker = true) as
select
  a.id             as audience_id,
  upper(a.family)  as league,
  a.conference,
  split_part(a.team_key, ':', 2) as code,
  a.full_name,
  a.first_name,
  a.fanbase,
  a.nickname       as mascot,
  case a.family
    when 'nfl'   then 'football'
    when 'ncaaf' then 'football'
    when 'nba'   then 'basketball'
    when 'mlb'   then 'baseball'
    when 'nhl'   then 'hockey'
  end as sport,
  a.shell,
  a.stripe,
  a.mask,
  case a.family
    when 'nfl' then 0 when 'mlb' then 1 when 'nba' then 2
    when 'ncaaf' then 3 when 'nhl' then 4
  end as league_sort,
  a.team_sort,
  a.updated_at,
  case when p.id is null then null else p.city || ', ' || p.state end as game_city,
  a.venue_city,
  a.timezone,
  a.team_key,
  a.text_color,
  a.espn_id,
  a.division
  from public.audiences a
  left join public.places p on p.id = a.home_place_id
 where a.kind = 'fandom'
   and a.team_key is not null;

comment on view public.teams is
  'A club, computed from public.audiences. `audience_id` is the row a game''s '
  'target_audience_id / rival_audience_id point at, so a palette is an exact '
  'join rather than a fuzzy match on a city and a mascot.';

grant select on public.teams to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select count(*) from public.games where target_audience_id is not null;  -- 367
--   select count(*) from public.games where rival_audience_id  is not null;  -- 366
--   -- a game's colours, straight off its target:
--   select g.id, a.name, a.shell, a.stripe, a.mask
--     from public.games g join public.audiences a on a.id = g.target_audience_id
--    where coalesce(g.archived,'') <> 'YES' limit 5;
--   -- nothing points at an audience that is not there:
--   select count(*) from public.games g
--    where g.target_audience_id is not null
--      and not exists (select 1 from public.audiences a where a.id = g.target_audience_id);
--                                                                            -- 0
-- ---------------------------------------------------------------------------
