-- 2026090205  the two audience indexes stop half-remembering their old columns
--
-- APPLIED 2026-09-02 with `cd mc && supabase db query --linked --file ...`.
--
-- 2026090204 renamed the COLUMNS and the index DEFINITIONS followed by
-- themselves -- both already read `USING btree (target)` / `(rival)` -- but an
-- index keeps its own NAME through a column rename, so the catalogue still had
--
--   games_target_audience_idx  ON public.games USING btree (target)
--   games_rival_audience_idx   ON public.games USING btree (rival)
--
-- which is the shape this project already refuses elsewhere: a table called
-- `routes` whose key is `paths_pkey` half-remembers what it used to be, and the
-- next person greps for the old word and finds a hit that means nothing.
--
-- HOW THEY WERE FOUND, AND THE TRAP IN FINDING THEM. A catalogue sweep for
-- `strpos(indexdef, 'target_audience_id') > 0` returned 2 -- and BOTH WERE
-- FALSE POSITIVES: `games_target_audience_idx` CONTAINS the string
-- `target_audience_id`, because `..._audience_idx` is `..._audience_id` plus an
-- x. The definitions were correct all along.
--   THAT IS THE SECOND SUBSTRING TRAP IN ONE SITTING. The first was
-- `like '%_audience_id%'`, where `_` is a single-character WILDCARD, so it
-- matched `t.audience_id` inside `tgb_build_game` and `tgb_content_keys` --
-- functions that read `game_templates` and have nothing to do with these
-- columns. **A column name is a word, not a substring**: match it with a
-- boundary, or read the line before believing the count.
--
-- SO THIS FILE FIXES A NAME AND NOTHING ELSE. No index is rebuilt, nothing is
-- locked for long, and no query plan changes.

begin;

alter index public.games_target_audience_idx rename to games_target_idx;
alter index public.games_rival_audience_idx  rename to games_rival_idx;

commit;

-- Verify.
--
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'public' and tablename = 'games'
--      and (indexname like '%target%' or indexname like '%rival%');
--   -- expect games_target_idx ... btree (target)
--   --        games_rival_idx  ... btree (rival)
--
--   -- and nothing on the table still says "audience" at all
--   select count(*) from pg_indexes
--    where schemaname = 'public' and tablename = 'games'
--      and indexname like '%audience%';                       -- expect 0
