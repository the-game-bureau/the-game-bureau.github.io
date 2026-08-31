-- 2026-08-31  A QUESTION MAY NOT CONTAIN ITS OWN ANSWER.
--
-- Kevin's rule, and the row that prompted it is on file: trivia_id 8 answers
-- "Chicago" to "Which river is dyed bright green through downtown CHICAGO every
-- St Patrick's Day?" A team reads that aloud in the street and the answer is
-- already in their mouth. It is not a typo, it is a question that tests nothing,
-- and it looks perfectly fine in a table -- which is the shape of fault this
-- project keeps paying for.
--
-- `NOT VALID`, WHICH IS THE WHOLE POINT AND NOT A SHORTCUT. It was asked for as
-- a rule for NEW trivia that does not reach the old, and that is exactly what a
-- NOT VALID check does: Postgres enforces it on every insert and every update
-- from now on and never scans what is already there. One row breaks it today,
-- measured before this was written rather than assumed.
--   WHAT IT COSTS, said rather than discovered: NOT VALID is per ROW, not per
--   row-version, so **the day somebody edits trivia_id 8 the constraint is
--   applied to it** and the edit is refused until the question is reworded.
--   That is the right outcome -- you cannot half-fix that row -- but it will
--   arrive as a surprise, so it is written down here.
--   To sweep the backlog later: fix the row, then
--   `alter table public.trivia validate constraint trivia_answer_not_in_question;`
--   which is what turns the rule from "new rows" into "every row".
--
-- WORD BOUNDARIES, NOT A SUBSTRING. A bare `position(answer in question)` would
-- refuse "The Bears" for a question containing "bearskin", and would miss an
-- answer the question spells with different punctuation. Both sides are
-- flattened -- every run of non-alphanumeric characters becomes one space --
-- and then padded with spaces, so the test is whole words on both sides and
-- case, spacing and punctuation are all forgiven.
--
-- NO BACKSLASH ESCAPES IN THE PATTERN, DELIBERATELY. `[^a-zA-Z0-9]` needs none.
-- This repo has recorded the escaping scar a dozen times and lost two files to
-- it: a pattern written with a backslash reaches the file having lost a level
-- and matches a control character instead. The same reasoning put `[[:space:]]`
-- in `trivia_free_answer_is_one_word` rather than a shorthand class.
--
-- IT APPLIES TO A MULTIPLE CHOICE ROW TOO. The four options are what a team
-- picks between; a question naming the right one is the same broken question
-- with buttons under it.
--
-- THE OTHER THREE CHECKS ARE UNTOUCHED and this one joins them:
--   trivia_answer_is_a_choice        an answer must be among its own options
--   trivia_free_answer_is_one_word   a typed answer is one word
--   trivia_no_one_word_prefix        no question opens with "One word"
-- `trivia.prompt.md` names all of them, so it is updated in this same commit --
-- a writer who trips a constraint should read a sentence, not a 23514.

begin;

alter table public.trivia
  add constraint trivia_answer_not_in_question
  check (
    strpos(
      ' ' || lower(regexp_replace(question, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ',
      ' ' || lower(regexp_replace(btrim(answer), '[^a-zA-Z0-9]+', ' ', 'g')) || ' '
    ) = 0
  ) not valid;

commit;

-- Verify. Run these by hand; each is a call that makes the constraint do its
-- job, because an insert that raises nothing proves nothing.
--
--   -- 1. the constraint exists and is deliberately unvalidated
--   select conname, convalidated from pg_constraint
--    where conrelid = 'public.trivia'::regclass
--      and conname = 'trivia_answer_not_in_question';        -- expect f
--
--   -- 2. the one old row is untouched and still readable
--   select count(*) from public.trivia;                      -- expect 38
--
--   -- 3. a new row naming its answer is REFUSED (expect 23514)
--   insert into public.trivia (id, question, answer)
--   values ('chicago-il', 'Which river runs through Chicago?', 'Chicago');
--
--   -- 4. and one that does not is accepted, then deleted
--   insert into public.trivia (id, question, answer)
--   values ('chicago-il', 'Which river is dyed green every March?', 'Chicago');
--   delete from public.trivia where question = 'Which river is dyed green every March?';
--
--   -- 5. case and punctuation are forgiven (expect 23514)
--   insert into public.trivia (id, question, answer)
--   values ('chicago-il', 'Who were the CHICAGO-bears named for?', 'Chicago Bears');
--
--   -- 6. a word merely CONTAINING the answer is fine (expect success)
--   insert into public.trivia (id, question, answer)
--   values ('chicago-il', 'What lines a bearskin hat?', 'Bear');
--   delete from public.trivia where question = 'What lines a bearskin hat?';
