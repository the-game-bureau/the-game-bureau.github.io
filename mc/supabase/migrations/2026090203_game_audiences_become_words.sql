-- 2026090203  a game's audiences are WORDS, not keys
--
-- APPLIED 2026-09-02 with `cd mc && supabase db query --linked --file ...`.
--
-- WHAT WAS WRONG: the column held a KEY and the box took PROSE. All 367 stored
-- values were `chicago-bears`-shaped ids into public.audiences, every one of
-- them resolving -- and the Game Builder's audience box is free text with no
-- foreign key and no check behind it. So the field showed a slug nobody wants
-- to read and accepted a sentence nothing could resolve, SILENTLY. It was a
-- text box sitting on top of a key column.
--
-- WHAT IT IS NOW: whatever somebody types. `Chicago Bears fans`. The column is
-- prose, the box is prose, and there is nothing left to disagree.
--
-- THE 367 ARE CONVERTED RATHER THAN LEFT, because a column holding two kinds of
-- thing is the worse of the two states: new games would read `Cubs fans on
-- tour` and old ones `chicago-cubs`, in the same field, with nothing saying
-- which was which.
--
-- WHY THIS IS SAFE FOR THE PAID PRODUCT, measured before it was written rather
-- than argued. `mc/assets/team-palette.js` is loaded by BOTH ENGINES and by the
-- public pages, and it scores an exact `audience_id` match at 30000 -- above
-- the team key at 10000. Turning the value into prose stops that tier matching,
-- so every game falls through to the key:
--
--   367 of 367 games with a target carry an away_team_key
--   367 of 367 of those keys resolve in public.teams
--   367 of 367 name the SAME CLUB the audience id named   <- 0 disagree
--   366 of 366 on the rival/home side likewise
--
-- So no game loses its palette and none changes colour. **Re-run those four
-- counts before touching either column again**; the day one disagrees, this
-- conversion starts repainting games.
--
-- THE KEYS ARE KEPT, in public.games_audience_keys_retired. The conversion is
-- reversible in principle -- strip ' fans' and slug what is left -- and that is
-- arithmetic on a guess, where the retired table is the values themselves. It
-- is also the only record of which club a game was pitched at, now that the
-- column no longer says so in a form anything can join on.
--
-- WHAT IS GIVEN UP, PLAINLY: nothing can join a game to an audience any more.
-- `games.target_audience_id` was a foreign key in everything but name; it is
-- now a sentence. Anything that needs the club reads `away_team_key`, which is
-- what the palette already does and what these counts prove is equivalent.
--
-- AND THE COLUMN NAMES NOW LIE. `target_audience_id` holds no id. Renaming them
-- is eight wiring points in the Game Builder plus a rebuild of
-- games_with_graph_and_teams, so it is its own day's work and is NOT done here.

begin;

-- 1. keep the keys ----------------------------------------------------------
create table if not exists public.games_audience_keys_retired as
select id,
       target_audience_id,
       rival_audience_id,
       now() as retired_at
  from public.games
 where target_audience_id is not null
    or rival_audience_id is not null;

comment on table public.games_audience_keys_retired is
  'The audience KEYS games.target_audience_id / rival_audience_id held before '
  '2026090203 turned both columns into prose. Kept so the conversion is '
  'reversible with values rather than with arithmetic.';

-- 2. the words --------------------------------------------------------------
-- `full_name` plus `fans`, which is what an audience IS: people, not a club.
update public.games g
   set target_audience_id = a.full_name || ' fans'
  from public.audiences a
 where a.id = g.target_audience_id;

update public.games g
   set rival_audience_id = a.full_name || ' fans'
  from public.audiences a
 where a.id = g.rival_audience_id;

commit;

-- Verify. Run these; do not assume the absence of an error means it worked.
--
--   -- nothing still looks like a key, and nothing was lost
--   select count(*) filter (where target_audience_id is not null)  as target_rows,
--          count(*) filter (where rival_audience_id  is not null)  as rival_rows,
--          count(*) filter (where target_audience_id like '% fans') as target_words,
--          count(*) filter (where rival_audience_id  like '% fans') as rival_words
--     from public.games;
--
--   -- and none of them resolves to an audience id any more, which is the point
--   select count(*) from public.games g
--     join public.audiences a on a.id = g.target_audience_id;   -- expect 0
--
--   -- the palette still finds every club through the key
--   select count(*) from public.games g
--     join public.teams t on t.team_key = g.away_team_key
--    where g.target_audience_id is not null;                    -- expect 367
