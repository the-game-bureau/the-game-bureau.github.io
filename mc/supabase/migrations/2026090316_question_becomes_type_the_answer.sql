-- `question` IS `type_the_answer` (2026-09-03)
--
-- The type value. 9 rows.
--
-- WHY THE UNDERSCORES, WHEN THE ASK SAID "type the answer". The value is used
-- as a CSS class in the room (`is-` + type) to colour its badge, and a space in
-- a class name is two selectors rather than one. `any_answer` and
-- `multiple_choice` both took underscores today for the same reason, so this is
-- the convention already here. **THE ROOM DRAWS UNDERSCORES AS SPACES**, so the
-- badge reads TYPE THE ANSWER.
--
-- IT NAMES THE RIGHT HALF, and the two typed types are worth telling apart
-- because they now read close together:
--     type_the_answer  9 rows, ALL carrying an answer to check against
--     any_answer       6 rows, NONE carrying one -- judged by the team
-- Both are typed; only one can be marked.
--
-- THE COLUMN DEFAULT IS `'question'` AND MOVES WITH THE VALUE. That is the half
-- that would have been silent: left behind, **every insert that omits `type`
-- arrives as a value the narrowed CHECK refuses** -- so the room's own add path
-- would start failing on a column nobody touched. Both are changed inside one
-- transaction, so no window exists where the default and the check disagree.
--
-- NOTHING ELSE IN THE DATABASE NAMES IT, checked rather than assumed: no
-- function, and the only constraint is the type check itself. Unlike
-- `multiple_choice` there are **no `type <> 'question' OR ...` implications**,
-- so nothing can quietly stop enforcing.
--
-- AND `question` IS A QUERY-STRING KEY IN BOTH ENGINES AND IN THE LOCKER
-- MINIGAME (`url.searchParams.set('question', ...)`), which has nothing to do
-- with this column. A sweep that counted the word rather than reading the line
-- would have rewritten all three.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090316_question_becomes_type_the_answer.sql

begin;

-- 1. WIDEN, MOVE, NARROW -----------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo', 'any_answer',
                           'operations', 'multiple_choice', 'type_the_answer']));

update public.challenges set type = 'type_the_answer' where type = 'question';

-- 2. THE DEFAULT MOVES TOO, INSIDE THE SAME TRANSACTION ----------------------
alter table public.challenges alter column type set default 'type_the_answer';

alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['type_the_answer', 'minigame', 'photo', 'any_answer',
                           'operations', 'multiple_choice']));

commit;

-- VERIFY ---------------------------------------------------------------------
--   select type, count(*) from public.challenges group by type order by 2 desc;
--     -> type_the_answer 9, and no question
--
--   select column_default from information_schema.columns
--    where table_schema='public' and table_name='challenges' and column_name='type';
--     -> 'type_the_answer'::text
--
--   -- THE DEFAULT HAS TO BE EXERCISED, not merely read: an insert that omits
--   -- the column is the thing that was about to break.
--   begin;
--     insert into public.challenges (name, prompt, answer)
--     values ('probe', 'A prompt.', 'An answer.') returning id, type;
--     -- expect type_the_answer, NOT a 23514
--   rollback;
--
--   -- AND THE CHECK HAS TO REFUSE THE OLD VALUE:
--   begin;
--     update public.challenges set type = 'question' where id = (
--       select id from public.challenges where type = 'type_the_answer' limit 1);
--     -- expect 23514 challenges_type_check
--   rollback;
