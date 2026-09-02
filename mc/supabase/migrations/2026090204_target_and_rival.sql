-- 2026090204  target_audience_id -> target, rival_audience_id -> rival
--
-- APPLIED 2026-09-02 with `cd mc && supabase db query --linked --file ...`.
--
-- THE NAMES HAD STOPPED BEING TRUE. 2026090203 turned both columns into prose
-- -- `Chicago Cubs fans` -- so `_audience_id` promised an id that is not there,
-- and `_id` on a free-text column is the kind of name that sends the next
-- reader looking for a join that does not exist.
--
-- THIS IS THE CHEAPEST DAY IT WILL EVER BE. Nothing on any page reads either
-- column: the Game Builder's audience bar was deleted on 2026-09-02, and
-- `team-palette.js` reads the value only for its top match tier, which prose
-- can never satisfy anyway -- every one of the 367 rows already falls through
-- to `away_team_key`, proved before that conversion.
--
-- THE VIEW IS RENAMED, NOT REBUILT, and the difference matters.
-- `games_with_graph_and_teams` selects both as plain column references, so a
-- view follows a base-table rename BY ITSELF (it holds an attnum, not a name)
-- -- but it KEEPS ITS OWN OUTPUT NAMES. After the base rename alone the view
-- still exposes `target_audience_id`, now sourced from `games.target`, which is
-- the worst of both. `alter view ... rename column` fixes that in place.
--   NOT `create or replace view`: it cannot rename an output column at all and
-- answers 42P16, which this project has already met once.
--   NOT a drop and recreate: that view is 79 columns and the recreate would be
-- a hand-copied definition, which is how a column quietly goes missing.
--
-- PROVED IN A ROLLED-BACK TRANSACTION BEFORE THIS FILE WAS WRITTEN, because a
-- statement that returns without error says nothing about what it left behind:
--
--   after base rename, view output cols   rival_audience_id, target_audience_id
--   after view rename, view output cols   rival, target
--   view still returns a value            Chicago Cubs fans
--   table still returns a value           Chicago Cubs fans
--   view column count                     79
--   rows still carrying a target          367
--
-- WHAT IS NOT TOUCHED: the values, the nullability, the grants (a rename
-- carries column privileges with it), and RLS -- the policies on `games` are
-- `USING (true) WITH CHECK (true)` and name no column.

begin;

alter table public.games rename column target_audience_id to target;
alter table public.games rename column rival_audience_id  to rival;

alter view public.games_with_graph_and_teams rename column target_audience_id to target;
alter view public.games_with_graph_and_teams rename column rival_audience_id  to rival;

comment on column public.games.target is
  'Who the game is pitched at, in words -- "Chicago Bears fans". Free text: no '
  'foreign key, no check. Was target_audience_id, which promised an id it '
  'stopped holding on 2026090203.';
comment on column public.games.rival is
  'Who they are up against, in words. Free text, same as target.';

commit;

-- Verify. Run these; the absence of an error proves nothing here.
--
--   -- the new names exist on both, and the old ones are gone from both
--   select table_name, string_agg(column_name, ', ' order by column_name) as cols
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name in ('games', 'games_with_graph_and_teams')
--      and column_name in ('target', 'rival', 'target_audience_id', 'rival_audience_id')
--    group by table_name;                      -- expect "rival, target" on BOTH
--
--   -- nothing was lost
--   select count(*) as games, count(target) as with_target, count(rival) as with_rival
--     from public.games;                        -- expect 395 / 367 / 366
--
--   -- the view is still whole and still reads
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'games_with_graph_and_teams';  -- 79
--
--   -- and no database object still names the old columns
--   select p.proname from pg_proc p
--    where p.prokind = 'f' and p.pronamespace = 'public'::regnamespace
--      and pg_get_functiondef(p.oid) like '%_audience_id%';                        -- 0 rows
