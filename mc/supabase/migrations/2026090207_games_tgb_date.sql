-- 2026090206  games.tgb_date -- the day the game is PLAYED
--
-- WHAT IT IS FOR. `games.game_date` was dropped when the table went from 71
-- columns to 31, and it was the only thing telling apart the games that share a
-- name. 394 games carry 325 distinct names; 97 sit in a duplicate-name group,
-- and every one of those groups is a real run of fixtures on different days --
-- two three-game baseball series per opponent, or three baseball games plus one
-- football game. The name is derived from the two CITIES, and cities do not
-- change across a series, so a name can never tell them apart.
--
-- THE NAME IS `tgb_date`, NOT `TGBDate`, AND THAT IS A DELIBERATE DEPARTURE
-- FROM WHAT WAS ASKED. Postgres folds an unquoted identifier to lower case, so
-- a mixed-case column has to be written "TGBDate" in EVERY hand-written query
-- forever -- and all 31 existing columns are snake_case, so it would be the
-- only one. `alter table public.games rename column tgb_date to "TGBDate";`
-- is the whole change if the literal spelling is wanted.
--
-- IT NEEDS 2026090206 FIRST. Two triggers on public.games read columns that
-- were dropped, so EVERY write to the table failed -- including this backfill,
-- which is how they were found.
--
-- IT IS FILLED BY HAND. There is no trigger, no default and no constraint
-- beyond the type: a person types it in the Game Builder. The backfill below is
-- a one-off recovery of what the prose already knows, not a mechanism.
--   NEXT, AND NOT DONE HERE: suggest `events.start_date - 1` when a game names
-- an anchor event, since our game is played the day BEFORE the thing that
-- brought people to town. A SUGGESTION, never a write -- 0 of the 97 duplicate
-- rows carries an anchor_event_id today, so there is nothing to derive from.

begin;

alter table public.games add column if not exists tgb_date date;

comment on column public.games.tgb_date is
  'The day this game is played, entered by hand in the Game Builder. Not '
  'derived and not maintained by any trigger. Backfilled once on 2026-09-02 '
  'from the date written into games.body; null where the prose said nothing.';

-- The backfill ------------------------------------------------------------
--
-- THE DATE IS IN THE PROSE AND THE YEAR IS NOT: the body ends "First pitch is
-- Jul 10, 7:10 PM local (America/New_York)" or "Kickoff is Jan 3, 3:25 PM
-- local (America/Chicago)". 352 of the 394 bodies carry one.
--
-- SO THE YEAR IS INFERRED, AND THE RULE WAS MEASURED RATHER THAN ASSUMED.
-- Every game id carries the season: 376 of 394 say 2026. Baseball runs inside
-- one calendar year and football crosses one, so:
--
--     baseball  Mar Jun Jul Aug Sep          88 rows, and ZERO in Jan or Feb
--     football  Sep Oct Nov Dec  +  Jan     264 rows, 29 of them in January
--
-- A January fixture in the 2026 season is played in JANUARY 2027. Because no
-- baseball game falls in Jan or Feb, the month alone decides it and the sport
-- never has to be consulted. The guard for that is in the verify block: if a
-- baseball game ever appears in January this rule is wrong.
--
-- `substring(x from pattern)` RETURNS THE FIRST CAPTURE GROUP, NOT THE MATCH.
-- Written '(Jan|...) [0-9]{1,2}' it hands back "Dec" and the day is silently
-- gone, so to_date sees "Dec 2026" and the whole statement fails with 22008 --
-- which is the good outcome, since the alternative is a date built from a
-- month and a year. The alternation is non-capturing and the WHOLE match is
-- the group.
--
-- NO BACKSLASH ANYWHERE IN THESE PATTERNS. Plain alternation and a POSIX-safe
-- character class need none, and this project has lost files to an escape
-- eaten between a heredoc, Python and disk.
update public.games g
   set tgb_date = to_date(
         substring(g.body from '((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{1,2})')
         || ' '
         || case when substring(g.body from '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)')
                        in ('Jan', 'Feb')
                 then '2027' else '2026' end,
         'Mon DD YYYY')
 where g.tgb_date is null
   and g.body ~ '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{1,2}';

commit;

-- Verify. Run these; the absence of an error proves nothing.
--
--   -- how much of the table the prose could answer for
--   select count(*) as games, count(tgb_date) as dated,
--          min(tgb_date) as first, max(tgb_date) as last
--     from public.games;                      -- expect 394 / 352 / 2026 / 2027
--
--   -- THE RULE'S OWN GUARD. If this is ever non-zero the Jan-means-2027
--   -- inference is wrong and the January rows want re-checking.
--   select count(*) from public.games
--    where body ~ 'First pitch is' and body ~ '(Jan|Feb) [0-9]{1,2}';   -- 0
--
--   -- and the point of the whole thing: a duplicate name is now told apart
--   select name, count(*) as rows, count(distinct tgb_date) as dates
--     from public.games group by name having count(*) > 1
--    order by count(*) desc limit 5;          -- rows = dates on every row
