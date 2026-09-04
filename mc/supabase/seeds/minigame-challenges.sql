-- ONE CHALLENGE PER MINIGAME
--
-- apply by hand:
--   cd mc && supabase db query --linked --file supabase/seeds/minigame-challenges.sql
--
-- BUILT FROM `minigames/manifest.json`, NOT FROM THE FOLDER LISTING, and the
-- two disagree. The ask said "each child folder is a minigame"; the folder
-- holds **four child folders and two loose html files**, and `teams/` is EMPTY
-- with no playable page at all. The manifest is what BOTH ENGINES and BOTH
-- BUILDERS read, so a challenge naming anything else could never be launched.
--
--   manifest            file                                folder?
--   fieldgoal           fieldgoal.html                      no, a loose file
--   locker              locker.html                         no, a loose file
--   jersey              jersey/index.html                   yes
--   nfl-brain-strainers nfl-brain-strainers/index.html      yes
--   video               video/index.html                    yes
--   (none)              --                                  teams/ is empty
--
-- WHERE THE URL LIVES, AND WHY IT IS THE PROMPT. `public.challenges` has ten
-- columns and none of them is a url: id, name, prompt, answer, type,
-- created_at, updated_at, tags, choices, ladder_key. **The prompt is the only
-- text a team is shown**, so the link goes there, and the manifest id goes in
-- the tags so the row is queryable by which game it launches.
--
-- `{{audience}}` IS A VARIABLE, because the id is per GAME and a challenge row
-- is not. It was added to the Challenge Bank's `VARIABLES` and to the Stop
-- Builder's worked example in the same commit -- **a variable declared in one
-- and not the other is either an `unknown-variable` finding on a good row or a
-- rehearsal that leaves it in its braces.**
--
-- NOTHING READS `?audience=` YET, said plainly rather than left to be found:
-- of the five, only `jersey` reads a query parameter that identifies anybody
-- (`key`, a team key) and `video` reads `clip` and `id`. This URL states the
-- contract; teaching each game to honour it is separate work.
--
-- AND THE ENGINES DO NOT SEND IT EITHER. `buildMinigameUrl` in both
-- `/mc/game/run/text/` and `/mc/game/run/map/` appends `riddle`, `question`,
-- `answer`, `embedded`, `return` and four palette colours -- and no audience.
-- **That is the paid product and was not changed here.**
--
-- `type = 'minigame'` ALREADY MEANS TWO THINGS, which these rows make plain.
-- The six on file are PHYSICAL -- twenty paces, one quiet minute, rock paper
-- scissors -- with no app anywhere. These five are the web-app kind. The `app`
-- tag is what tells them apart, because the type cannot.
--
-- ANSWER IS NULL ON ALL FIVE. The app judges these, which is the shape five of
-- the six existing minigame rows already have.
--
-- LADDER KEY IS NULL AND MUST BE: `challenges_ladder_key_belongs_to_a_question`
-- refuses one on any row that is not a `question`.
--
-- RE-RUNNABLE. It matches on the manifest id in `tags`, so running it twice
-- updates rather than filing a second copy -- there is no unique key on this
-- table to conflict against.

begin;

create temp table minigame_seed (
  mg_id   text,
  mg_name text,
  mg_file text,
  mg_body text
) on commit drop;

insert into minigame_seed values
  ('fieldgoal', 'Paper Field Goal', 'fieldgoal.html',
   'Fold a scrap of paper into a triangle and flick it through a team mate''s goalposts. '
   || 'Everybody gets three attempts and the best score carries the stop.'),
  ('locker', 'Unlock the Locker', 'locker.html',
   'A combination lock, and the numbers are somewhere at this stop. '
   || 'Read what is around you, agree a code between you, and turn the dial.'),
  ('jersey', 'THE JERSEY GAME', 'jersey/index.html',
   'Three shirts, three numbers, one sum. Fill in any two jersey numbers and the '
   || 'remaining jersey works itself out.'),
  ('nfl-brain-strainers', 'Gridiron Puzzle Match', 'nfl-brain-strainers/index.html',
   'Put each riddle on the right square of the board, then pull the scoring lever. '
   || 'Argue about it first; the lever is not kind.'),
  ('video', 'Video Trivia', 'video/index.html',
   'Watch the clip together, then call the play. One answer between you, and no '
   || 'second viewing.');

-- ---------------------------------------------------------------------------
-- UPDATE WHAT IS ALREADY THERE, keyed on the manifest id in `tags`.
-- ---------------------------------------------------------------------------
update public.challenges c
   set name   = s.mg_name,
       prompt = s.mg_body || ' Play it here: /minigames/' || s.mg_file
                || '?audience={{audience}}',
       type   = 'minigame',
       answer = null
  from minigame_seed s
 where c.tags @> array['app', s.mg_id];

-- ---------------------------------------------------------------------------
-- AND FILE THE ONES THAT ARE NOT.
-- ---------------------------------------------------------------------------
insert into public.challenges (name, type, prompt, answer, choices, ladder_key, tags)
select s.mg_name,
       'minigame',
       s.mg_body || ' Play it here: /minigames/' || s.mg_file || '?audience={{audience}}',
       null,
       null,
       null,
       array['minigame', 'app', s.mg_id]
  from minigame_seed s
 where not exists (
         select 1 from public.challenges c where c.tags @> array['app', s.mg_id]);

commit;

-- ===========================================================================
-- VERIFY
-- ===========================================================================
--
-- select id, name, tags, left(prompt, 70) as prompt
--   from public.challenges where tags @> array['app'] order by name;
--   -> five rows, each prompt ending ?audience={{audience}}
--
-- select count(*) from public.challenges
--  where tags @> array['app'] and prompt like '%{{audience}}%';   -> 5
--
-- -- every file the prompts name is one the manifest names:
-- select count(*) from public.challenges where tags @> array['app']
--    and prompt !~ '/minigames/(fieldgoal\.html|locker\.html|jersey/index\.html'
--                 '|nfl-brain-strainers/index\.html|video/index\.html)\?';  -> 0
