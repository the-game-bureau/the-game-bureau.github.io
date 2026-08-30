-- A QUESTION MAY NOT OPEN WITH "One word".
--
-- It was the convention for a typed answer and it was the wrong shape: an
-- instruction to the FORM, bolted onto the front of a sentence a team reads
-- aloud standing in a street. **The question should ask for one word in its own
-- words** -- "the last name of", "which river", "the surname" -- and then it
-- needs no label at all.
--
-- ENFORCED RATHER THAN REMEMBERED, because the prefix is the obvious thing to
-- reach for the next time somebody writes a typed question, and a rule that
-- lives only in a document is a rule the tenth question breaks.
--
-- ANCHORED TO THE START, deliberately. A question is free to use the phrase in
-- the middle of a sentence if it ever genuinely needs to; what is refused is
-- the label out in front.
--
-- THE TEXT BOX STILL SAYS "One word" AS ITS PLACEHOLDER, and that is the right
-- place for it: the box saying what it takes is a form telling you its shape,
-- which is exactly what the question should not have been doing.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083014_trivia_no_one_word_prefix.sql

begin;

alter table public.trivia drop constraint if exists trivia_no_one_word_prefix;
alter table public.trivia
  add constraint trivia_no_one_word_prefix
  check (lower(btrim(question)) not like 'one word%');

comment on column public.trivia.question is
  'Read aloud by a team, outdoors, on a phone. A typed question must ask for a '
  'single word in its own words ("the last name of", "which river"), never with '
  'a "One word:" label in front, which a CHECK refuses.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by making it refuse.
--   insert into public.trivia (id, question, answer)
--     values ('denver-co', 'One word: who?', 'nobody');
--                        -- expect 23514 trivia_no_one_word_prefix
--   select count(*) from public.trivia where question ilike 'one word%';
--                        -- expect 0
-- ---------------------------------------------------------------------------
