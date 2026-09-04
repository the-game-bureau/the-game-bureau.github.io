-- `any_answer` AND `type_the_answer` MERGE INTO `type_answer` (2026-09-03)
--
-- 6 + 9 = 15 rows. The largest type after `multiple_choice`.
--
-- WHAT THE TWO MEANT, measured the hour before this was written:
--     type_the_answer  9 rows, ALL carrying an answer to check against
--     any_answer       6 rows, NONE carrying one -- judged by the team
-- Both were typed. What told them apart was whether the reply could be MARKED.
--
-- **THAT DISTINCTION IS DISCARDED AND IT IS NOT RECOVERABLE FROM THE TYPE.**
-- After this a typed challenge with no stored answer is an ordinary, legitimate
-- row -- 6 of the 15 -- so nothing can tell one that is meant to be judged by
-- the team from one that lost its answer. The only thing left saying which is
-- `answer` itself, and it says the same for both.
--
-- SO THE `no-answer` FINDING IS RETIRED IN THE SAME COMMIT, and that is the
-- cost stated plainly rather than discovered:
--     test: type is typed AND answer is blank
--     say:  'Add an answer, or change the type.'
-- Kept, it reddens **6 of 63 rows** the moment this runs, for a state that was
-- correct five minutes earlier -- and its own call to action becomes impossible
-- to act on, since there is no other typed type to change to. That is the shape
-- of finding this project removes; the orphan ladder-key finding went for the
-- same reason on the same day.
--
-- THE COLUMN DEFAULT IS `'type_the_answer'` AND MOVES WITH IT. Left behind,
-- **every insert that omits `type` arrives as a value the narrowed CHECK
-- refuses**, so the room's own add path starts failing on a column nobody
-- touched. Both change inside one transaction.
--
-- NOTHING ELSE IN THE DATABASE NAMES EITHER VALUE, and the one apparent hit was
-- read rather than counted: `replace_game_graph` matches on
-- **`accepts_any_answer`**, a column of `game_nodes`, which has nothing to do
-- with `challenges.type`. A sweep counting the word would have rewritten it.
-- There are no `type <> '...' OR ...` implications on either value, so nothing
-- can quietly stop enforcing.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090317_two_typed_types_become_type_answer.sql

begin;

-- 1. WIDEN, MOVE, NARROW -----------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['type_the_answer', 'any_answer', 'minigame', 'photo',
                           'operations', 'multiple_choice', 'type_answer']));

update public.challenges set type = 'type_answer'
 where type in ('type_the_answer', 'any_answer');

-- 2. THE DEFAULT MOVES INSIDE THE SAME TRANSACTION ---------------------------
alter table public.challenges alter column type set default 'type_answer';

-- BOTH OLD VALUES LEAVE THE ARRAY. This is a merge, not a rename: neither may
-- be written again, or the two would start diverging back apart in silence.
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['type_answer', 'minigame', 'photo',
                           'operations', 'multiple_choice']));

commit;

-- VERIFY ---------------------------------------------------------------------
--   select type, count(*),
--          count(*) filter (where answer is not null and btrim(answer) <> '') marked
--     from public.challenges group by type order by 2 desc;
--     -> type_answer 15, of which 9 marked and 6 not -- BOTH ARE ORDINARY NOW
--
--   select column_default from information_schema.columns
--    where table_schema='public' and table_name='challenges' and column_name='type';
--     -> 'type_answer'::text
--
--   -- THE DEFAULT HAS TO BE EXERCISED, not merely read back from the catalogue:
--   begin;
--     insert into public.challenges (name, prompt, answer)
--     values ('probe', 'A prompt.', 'An answer.') returning id, type;
--     -- expect type_answer, NOT a 23514
--   rollback;
--
--   -- AND BOTH OLD VALUES HAVE TO BE REFUSED, or the merge can undo itself:
--   begin;
--     update public.challenges set type = 'any_answer'
--      where id = (select id from public.challenges where type='type_answer' limit 1);
--     -- expect 23514 challenges_type_check
--   rollback;
