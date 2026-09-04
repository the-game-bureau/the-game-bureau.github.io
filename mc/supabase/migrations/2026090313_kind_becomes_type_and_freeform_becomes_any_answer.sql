-- `challenges.kind` IS `challenges.type`, AND `freeform` IS `any_answer` (2026-09-03)
--
-- TWO CHANGES ON ONE TABLE, IN ONE TRANSACTION, because the second is a value
-- of the first and doing them apart means writing the widened CHECK twice.
--
-- WHY `type`: `audiences.type` already means exactly this -- what kind of thing
-- a row is -- so two tables saying one idea two ways is a difference a reader
-- has to learn for nothing. 2026090106 made that column `type` on the same
-- argument.
--
-- `events.kind` IS DELIBERATELY NOT TOUCHED. It is free text with no CHECK, it
-- carries 21 values that are mostly SeatGeek's own taxonomy slugs, and it is
-- read by the Events room, both pull RPCs and the importer. That is its own
-- day's work and was not asked for.
--
-- MEASURED FIRST: trivia 37, question 9, minigame 6, freeform 6, photo 3,
-- operations 1. Seven CHECK constraints name the column and one function does.
--
--   A CONSTRAINT FOLLOWS A COLUMN RENAME BY ITS NODE TREE, so all seven
-- definitions update themselves. **Their NAMES do not**, and only one carries
-- the word.
--   A FUNCTION DOES NOT FOLLOW ANYTHING. Its body is stored as TEXT and
-- resolved at RUNTIME, so `tgb_pick_challenge` would raise 42703 on its next
-- call -- unattended, whenever a stop first drew a random challenge.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090313_kind_becomes_type_and_freeform_becomes_any_answer.sql

begin;

-- 1. THE COLUMN -------------------------------------------------------------
alter table public.challenges rename column kind to type;

-- 2. THE CONSTRAINT NAME, which does not follow. A table whose column is `type`
--    and whose check is `challenges_kind_check` half-remembers what it was
--    called -- the same fault `routes` had keeping `paths_pkey`.
alter table public.challenges rename constraint challenges_kind_check to challenges_type_check;

-- 3. WIDEN, MOVE, NARROW ----------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo',
                           'freeform', 'any_answer', 'operations', 'trivia']));

update public.challenges set type = 'any_answer' where type = 'freeform';

alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo',
                           'any_answer', 'operations', 'trivia']));

-- 4. THE ONE FUNCTION THAT NAMES THE COLUMN ---------------------------------
-- PATCHED FROM ITS LIVE DEFINITION, one named expression, with the match count
-- asserted. A `create or replace` written afresh rewrites the whole body and
-- this project has silently lost a column that way.
do $$
declare src text; hits int;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'tgb_pick_challenge' and prokind = 'f';
  if src is null then
    raise exception 'tgb_pick_challenge is not installed';
  end if;
  hits := (length(src) - length(replace(src, 'c.kind', ''))) / length('c.kind');
  if hits <> 1 then
    raise exception 'expected one c.kind in tgb_pick_challenge, found %', hits;
  end if;
  execute replace(src, 'c.kind', 'c.type');
end $$;

commit;

-- VERIFY --------------------------------------------------------------------
-- A statement that returns without error says nothing about a CHECK, and a
-- `create or replace` says nothing about whether a function still runs.
--
--   select type, count(*) from public.challenges group by type order by 2 desc;
--     -> any_answer 6, and no freeform
--
--   select count(*) from information_schema.columns
--    where table_name = 'challenges' and column_name = 'kind';   -> 0
--
--   select count(*) from pg_proc
--    where proname = 'tgb_pick_challenge' and pg_get_functiondef(oid) ~ '\mkind\M';
--     -> 0
--
--   -- AND THE FUNCTION HAS TO BE CALLED, not merely compiled:
--   select public.tgb_pick_challenge((select stop_id from public.stops limit 1));
--
--   begin;
--     update public.challenges set type = 'freeform' where type = 'any_answer';
--     -- expect 23514 challenges_type_check
--   rollback;
