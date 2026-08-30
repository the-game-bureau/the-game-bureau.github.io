-- AN ANSWER IS MULTIPLE CHOICE OR ONE WORD. THERE IS NO THIRD OPTION.
--
-- That was already true of all eight rows and was true by luck: nothing stopped
-- a row carrying `answer = 'Tracy Porter'` with `choices = null`, which is a
-- team standing in the street being asked to type two words exactly right,
-- spelling and all. **It looks perfectly correct in the table** -- an answer is
-- present, a question is present -- and it is unanswerable in practice.
--
-- THE RULE, NOW ENFORCED:
--
--   choices is not null   -> multiple choice, and `answer` must be one of them
--                            (trivia_answer_is_a_choice, already in place)
--   choices is null       -> the team types it, so it must be a SINGLE WORD
--
-- WHY ONE WORD RATHER THAN A SHORT PHRASE: anything longer is graded on spacing
-- and punctuation as well as knowledge, and a team that knew the answer loses
-- the points to a hyphen. If a two-word answer is the only good answer, that is
-- a question that wants choices.
--
-- NO BACKSLASH IN THE PATTERN, DELIBERATELY. `[[:space:]]` is a POSIX class and
-- needs none; this repo has lost a file to a backslash escape eaten between a
-- heredoc and the file it was writing, twelve times over.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083011_trivia_answer_is_one_word_or_a_choice.sql

begin;

alter table public.trivia drop constraint if exists trivia_free_answer_is_one_word;
alter table public.trivia
  add constraint trivia_free_answer_is_one_word
  check (choices is not null or btrim(answer) !~ '[[:space:]]');

comment on column public.trivia.answer is
  'One of `choices` when there are choices, otherwise a SINGLE WORD the team '
  'types. A multi-word free-text answer is refused: it grades spelling and '
  'spacing rather than knowledge. If two words are the only good answer, the '
  'question wants choices.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by making it refuse rather than by the absence of an error.
--
--   insert into public.trivia (id, question, answer)
--     values ('denver-co', 'q', 'John Elway');
--                     -- expect 23514 trivia_free_answer_is_one_word
--
--   select count(*) from public.trivia;                      -- expect 8
--   select count(*) from public.trivia where choices is null; -- expect 3
-- ---------------------------------------------------------------------------
