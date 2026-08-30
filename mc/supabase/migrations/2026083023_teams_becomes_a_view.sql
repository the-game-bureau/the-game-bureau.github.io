-- `teams` BECOMES A VIEW OVER `audiences`.
--
-- The merge is 2026083022 and it is verified: 639 clubs across, 0 teams without
-- an audience, 0 fandoms without a colour. This file takes the name.
--
-- ── THE ONE REAL COST, STATED BEFORE IT IS PAID ───────────────────────────
--
-- **SIX FOREIGN KEYS HAVE TO GO, because a view cannot be one's target.**
--
--   games.away_team_key  -> teams.team_key
--   games.home_team_key  -> teams.team_key
--   games.away_team_tgbid -> teams.tgbid
--   games.home_team_tgbid -> teams.tgbid
--   events.away_team_tgbid -> teams.tgbid
--   events.home_team_tgbid -> teams.tgbid
--
-- **What is lost is the database refusing a game that names a club we do not
-- carry.** That is a real guarantee and it is being given up knowingly. Two
-- things soften it and neither makes it nothing: `games` is 395 archived legacy
-- rows, and the `events` pair is on `tgbid`, which that room already documents
-- as optional. **The verify block below is what replaces the guarantee**, and it
-- should be run after anything that writes those columns.
--
-- ── WHY IT IS STILL WORTH IT ──────────────────────────────────────────────
--
-- The alternative is `teams` and `audiences` both holding the club list, which
-- is the fault every step of this rebuild has removed. **Two copies of one fact
-- drift and nothing says so.** Sixteen files read `teams`, two of them the game
-- engines at play time; a view means every one of them keeps working, unchanged,
-- against a single source of truth.
--
-- ── RETIRED IN PLACE ──────────────────────────────────────────────────────
--
-- `teams_retired` keeps all 639 rows so the view can be compared against what it
-- replaced. The drop is commented at the foot and should stay commented until
-- the engines have been read against the view for a while.
--
-- ── A COLUMN'S TYPE IS PART OF THE CONTRACT, AND ONE WAS WRONG ────────────
--
-- `teams.tgbid` is an INTEGER and 2026083022 added it to `audiences` as text, so
-- the first cut of this view handed the engines a string where they had always
-- had a number. **Every row and every value compared equal and the contract was
-- still broken** -- which is why the verify block below compares `data_type`
-- from the catalogue as well as the rows.
--
-- Fixing the COLUMN rather than casting in the view, so there is one truth. The
-- alter is refused while the view reads it (`0A000: cannot alter type of a
-- column used by a view`), so the view stands aside and is rebuilt **inside the
-- same transaction** -- nothing that reads `teams` ever sees it missing.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083023_teams_becomes_a_view.sql

begin;

alter table public.audiences
  alter column tgbid type integer using nullif(btrim(tgbid::text), '')::integer;

-- `teams.updated_at` IS A REAL TIMESTAMP AND `created_at` IS NOT THE SAME FACT,
-- so it comes across rather than being faked from the row's birthday.
alter table public.audiences add column if not exists updated_at timestamptz;
update public.audiences a set updated_at = t.updated_at
  from public.teams t where a.team_key = t.team_key and a.updated_at is null;

alter table public.games  drop constraint if exists games_away_team_key_fkey;
alter table public.games  drop constraint if exists games_home_team_key_fkey;
alter table public.games  drop constraint if exists games_away_team_tgbid_fkey;
alter table public.games  drop constraint if exists games_home_team_tgbid_fkey;
alter table public.events drop constraint if exists events_away_team_tgbid_fkey;
alter table public.events drop constraint if exists events_home_team_tgbid_fkey;

alter table if exists public.teams rename to teams_retired;

comment on table public.teams_retired is
  'RETIRED 2026-08-30. Its 639 rows are now computed by the `teams` VIEW from '
  'public.audiences. Kept so the view can be compared against what it replaced; '
  'nothing reads it. Six foreign keys into it were dropped, because a view '
  'cannot be a foreign key target -- see the migration header.';

create or replace view public.teams
-- SECURITY INVOKER, or the view runs as its owner and hands `anon` whatever the
-- underlying grants were meant to withhold.
with (security_invoker = true) as
select
  upper(a.family)  as league,
  a.conference,
  a.code,
  a.full_name,
  a.first_name,
  a.fanbase,
  a.nickname       as mascot,
  a.sport,
  a.shell,
  a.stripe,
  a.mask,
  a.league_sort,
  a.team_sort,
  a.updated_at,
  a.game_city,
  a.venue_city,
  a.timezone,
  a.team_key,
  a.text_color,
  a.tgbid,
  a.espn_id,
  a.division,
  a.city_name,
  a.state_code,
  a.state_name,
  a.country_code,
  a.country_name
  from public.audiences a
 where a.kind = 'fandom'
   and a.team_key is not null;

comment on view public.teams is
  'A club, computed from public.audiences rather than stored twice. Every column '
  'the table had, in the same order AND THE SAME TYPE, so the sixteen files '
  'that read it -- both game engines included -- keep working unchanged. Edit '
  'a club in `audiences`.';

grant select on public.teams to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and this is the comparison that matters: a view replacing a table the
-- ENGINES read at play time is only safe if every row and every column comes
-- back identical.
--
--   select count(*) from public.teams;                        -- expect 639
--   select count(*) from public.teams_retired;                -- expect 639
--   select count(*) from public.teams_retired r
--    where not exists (select 1 from public.teams v where v.team_key = r.team_key);
--                                                             -- expect 0
--   -- EVERY COLUMN'S TYPE, not only its values. This is the check that caught
--   -- tgbid, and rows alone cannot: expect 0 rows back.
--   select c.column_name, r.data_type as was, c.data_type as now
--     from information_schema.columns c
--     join information_schema.columns r
--       on r.table_name = 'teams_retired' and r.column_name = c.column_name
--    where c.table_name = 'teams' and c.data_type is distinct from r.data_type;
--
--   -- every column's VALUES, not only the key:
--   select count(*) from public.teams v join public.teams_retired r
--          on r.team_key = v.team_key
--    where (v.league, v.code, v.mascot, v.shell, v.stripe, v.mask, v.text_color,
--           v.sport, v.conference, v.division, v.tgbid, v.city_name, v.state_code)
--       is distinct from
--          (r.league, r.code, r.mascot, r.shell, r.stripe, r.mask, r.text_color,
--           r.sport, r.conference, r.division, r.tgbid, r.city_name, r.state_code);
--                                                             -- expect 0
--
-- AND THE GUARANTEE THAT WAS GIVEN UP. Run this after anything writes a club
-- onto a game or an event; it is what the six dropped foreign keys used to do:
--
--   select 'games' t, count(*) from public.games g
--    where coalesce(g.away_team_key, g.home_team_key) is not null
--      and not exists (select 1 from public.teams x
--                       where x.team_key in (g.away_team_key, g.home_team_key))
--   union all
--   select 'events', count(*) from public.events e
--    where coalesce(e.away_team_tgbid, e.home_team_tgbid) is not null
--      and not exists (select 1 from public.teams x
--                       where x.tgbid in (e.away_team_tgbid, e.home_team_tgbid));
-- ---------------------------------------------------------------------------
-- ONCE THE ENGINES HAVE RUN AGAINST THE VIEW FOR A WHILE:
--   -- drop table public.teams_retired;
-- ---------------------------------------------------------------------------
