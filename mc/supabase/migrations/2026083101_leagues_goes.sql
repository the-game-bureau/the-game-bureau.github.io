-- 2026-08-31  public.leagues is dropped, and the room with it.
--
-- WHY DROPPING RATHER THAN RETIRING IN PLACE, which is this project's usual
-- answer. `leagues` held ten rows of (sport, league) and every one of them is
-- already in `public.audiences`: the pair repeats on 639 club rows, and the
-- `teams` view over it computes `sport` and `league_sort` from `family`. So
-- this was a SECOND COPY of a computable fact, which is the exact fault the
-- destinations and teams rebuilds removed. A duplicate nothing reads is what
-- makes the next reader ask which copy is true.
--
-- NOTHING DEPENDED ON IT, checked rather than assumed: no foreign key pointed
-- at it (deliberately -- `events.league` is free text, so a concert carrying
-- no league is not refused), no view named it, no function named it, and the
-- only two readers in the repo were the room and its nav entry, both deleted
-- in this commit.
--
-- WHAT IS LOST, plainly. Four of the ten leagues have NO club filed against
-- them -- MLS, WNBA, NASCAR and UFC -- so those four are now unnameable
-- anywhere. That is the one thing the table did that `audiences` cannot: it
-- said what we intend to cover as against what we have entered. It also held
-- the only place the two spellings of `sport` were visible side by side
-- (`teams.sport` lower case, `events.sport` title case); that drift is
-- unchanged and is now invisible again.
--
-- THE SEED IS WRITTEN OUT BELOW so recreating it is a paste rather than an
-- afternoon. 2026082403 is the original migration.
--
--   Auto racing         NASCAR
--   Baseball            MLB
--   Basketball          NBA
--   Basketball          NCAAB
--   Basketball          WNBA
--   Football            NCAAF
--   Football            NFL
--   Hockey              NHL
--   Mixed martial arts  UFC
--   Soccer              MLS

begin;

drop table if exists public.leagues;

commit;

-- Verify. Both answer 0.
--   select count(*) from pg_tables where schemaname='public' and tablename='leagues';
--   select count(*) from pg_constraint where confrelid = to_regclass('public.leagues');
