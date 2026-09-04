-- A QUESTION IS NAMED BY ITS ANSWER (2026-09-03)
--
-- `challenges.name = answer` for every row of type `question` that has one.
-- NINE ROWS. Trivia is NOT touched -- see below.
--
-- THE OLD NAMES, so this is reversible. This table has NO BACKUP anywhere (the
-- dumps are 2026-08-05 and do not include it), and on 2026-09-03 a row went
-- missing from it with no identifiable cause and had to be reconstructed from
-- a screenshot. Anything here that overwrites authored text writes the old
-- value down first.
--
--   update public.challenges set name = v.n from (values
--     (6,  'Where they come from'),
--     (10, 'Home side, home league'),
--     (21, 'Cloud Gate, by its real name'),
--     (22, 'Buckingham Fountain, four states'),
--     (23, 'Ceres, and what she lacks'),
--     (24, 'The Billy Goat, 1945'),
--     (26, 'Rosenberg''s Address'),
--     (85, 'He''s Nuts!'),
--     (89, 'Jefferson Davis'' House')
--   ) as v(id, n) where challenges.id = v.id;
--
-- THREE OF THE NINE PRODUCE A NAME NOBODY WOULD WRITE, and they are named here
-- rather than quietly skipped, because skipping them would be scaling the ask
-- down without being asked:
--
--   id 6   -> `{{away_team_geo}}`   a raw variable token. The NAME is drawn as
--   id 10  -> `{{league}}`          plain text -- only the PROMPT resolves
--                                   variables -- so these read literally in the
--                                   list and match nothing anybody searches.
--   id 26  -> `1825, 18 25, eighteen twenty-five`
--                                   an answer carrying its accepted VARIANTS,
--                                   which is a matcher rather than a name.
--
-- Fixing those three is one UPDATE with three literals, in the room or here.
--
-- WHY NOT TRIVIA. 37 rows also have answers and are also questions in the
-- ordinary sense, and the ask said "questions" the day after `kind` became
-- `type` -- so it is read as the TYPE. Including them is one word:
--   ... where type in ('question','trivia') ...
-- **Do that deliberately**: a trivia name becoming `Chicago` or `1985` makes a
-- list of 37 rows that cannot be told apart, and the answers there are
-- routinely one word.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090314_a_question_is_named_by_its_answer.sql

begin;

update public.challenges
   set name = btrim(answer)
 where type = 'question'
   and answer is not null
   and btrim(answer) <> ''
   and name is distinct from btrim(answer);

commit;

-- VERIFY --------------------------------------------------------------------
--   select id, name, answer from public.challenges
--    where type = 'question' order by id;
--     -> name = answer on all nine
--
--   select count(*) from public.challenges
--    where type = 'question' and answer is not null and name <> btrim(answer);
--     -> 0
--
--   select count(*) from public.challenges;   -> 62, unchanged
