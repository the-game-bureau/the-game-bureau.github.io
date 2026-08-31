-- `tgbid` IS DROPPED. THE TEAM KEY DOES ITS JOB.
--
-- **A CLUB HAD TWO IDENTIFIERS AND THEY COULD ONLY EVER DRIFT.** `team_key` is
-- `LEAGUE:CODE`, readable and derived; `tgbid` was a bare number. Measured
-- before anything was touched, and this is the whole argument:
--
--   games where the two name DIFFERENT clubs .......... 0
--   games carrying a tgbid but no team_key ............ 0
--   games carrying a team_key but no tgbid ............ 0
--
-- So it was a second name for the same thing on all 367 rows, kept in step by
-- nothing. **A second identifier that agrees today is one that will disagree the
-- first time somebody writes only one of them.**
--
-- ── WHAT HAD TO MOVE FIRST, AND IT WAS NOT ALL OF IT IN THE DATABASE ──────
--
--   mc/minigames/jersey/jerseys.json  101 puzzles keyed on tgbid -> team_key
--   mc/minigames/jersey/index.html    the whole lookup, and its ?tgbid= link
--   mc/assets/team-palette.js         the tgbid match tier, which BOTH ENGINES
--                                     resolve a club through
--   mc/marquee/index.html             stopped writing games.*_tgbid, and an
--                                     anchor event names its clubs in words now
--   mc/events/index.html              the two fields, already off screen
--   gifts/index.html, games-prefetch.js, the two matchup makers, the room
--
-- **THE JERSEY MINIGAME IS THE ONE THAT WOULD HAVE BROKEN SILENTLY.** Its 101
-- puzzles carried `player1tgbid`, so dropping the column would have left every
-- jersey without its club colours and nothing would have said so. Three of its
-- 39 tgbids resolved to nothing ALREADY -- 37, 61 and 63 are in no teams row --
-- so those puzzles were broken before today and are no worse now.
--
-- ── WHAT IS RETIRED IN PLACE RATHER THAN DROPPED ──────────────────────────
--
-- `games.away_team_tgbid` / `home_team_tgbid` and the two on `events`. Nothing
-- writes or reads them now. **`public.games` is read by both engines with
-- `select=*` and is the paid product**, so removing a column from it is a
-- different change from this one, on a different day.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083025_tgbid_goes_the_key_stays.sql

begin;

-- THE VIEW READS THE COLUMN, so it stands aside and is rebuilt in the SAME
-- transaction: nothing that reads `teams` ever sees it missing.
drop view if exists public.teams;

alter table public.audiences drop column if exists tgbid;

create view public.teams with (security_invoker = true) as
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
  'the table had EXCEPT `tgbid`, which was a second identifier for the same club '
  'as `team_key` -- 0 rows where the two disagreed -- and could only ever drift. '
  'Edit a club in `audiences`.';

grant select on public.teams to anon, authenticated;

comment on column public.games.away_team_tgbid is
  'RETIRED 2026-08-30. Nothing writes or reads it; use away_team_key. Kept '
  'because public.games is read by both engines with select=* and dropping a '
  'column from it is a change to the paid product.';
comment on column public.games.home_team_tgbid is
  'RETIRED 2026-08-30. Nothing writes or reads it; use home_team_key.';
comment on column public.events.away_team_tgbid is
  'RETIRED 2026-08-30. Never carried a value on any row; the clubs are named by '
  'away_team_geo and away_team_nickname.';
comment on column public.events.home_team_tgbid is
  'RETIRED 2026-08-30. Never carried a value on any row.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select count(*) from public.teams;                     -- expect 639
--   select column_name from information_schema.columns
--    where table_name = 'teams' and column_name = 'tgbid'; -- expect 0 rows
--   -- every club is still reachable by the key the pages now use:
--   select count(*) from public.games g
--    where coalesce(g.away_team_key, g.home_team_key) is not null
--      and not exists (select 1 from public.teams x
--                       where x.team_key in (g.away_team_key, g.home_team_key));
--                                                          -- expect 0
-- ---------------------------------------------------------------------------
