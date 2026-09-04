-- `trivia` IS `multiple_choice` (2026-09-03)
--
-- The type value. 37 rows -- the largest type in the table.
--
-- WHY THE UNDERSCORE, WHEN THE ASK SAID "multiple choice". The value is used as
-- a CSS class in the room (`is-` + type) to colour its badge, and a space in a
-- class name is two selectors rather than one. `any_answer` took an underscore
-- an hour earlier for the same reason, so this is the convention already here.
--   **THE ROOM DISPLAYS IT WITH A SPACE.** The badge draws underscores as
-- spaces, so it reads MULTIPLE CHOICE and ANY ANSWER, which is what was asked
-- for. If the stored value should carry the space, that is one word here and a
-- slug in the room.
--
-- `trivia` IS ALSO A TAG ON FOUR ROWS AND IS NOT TOUCHED. A tag and a type are
-- different columns; a sweep that counted the word rather than reading the line
-- would have rewritten those four.
--
-- SEVEN CONSTRAINTS TEST THE VALUE, and this is the half that would have been
-- silent: `challenges_trivia_has_an_answer` and its four siblings are written
-- `type <> 'trivia' OR ...`, so **moving the rows without them leaves all five
-- passing vacuously** -- every multiple-choice row would stop being checked for
-- a prompt, an answer, a one-word free answer, an answer hidden in its own
-- question, and the `One word` prefix. Nothing would say so.
--
-- THEY ARE RENAMED TOO, since the definitions are being rewritten anyway: a
-- constraint called `challenges_trivia_has_an_answer` on a type called
-- `multiple_choice` half-remembers what it was called, which is the fault
-- `routes` had keeping `paths_pkey`.
--
-- AND `tgb_trivia_for` IS REPAIRED HERE, having been BROKEN SINCE 2026090313:
-- it reads `t.kind`, and that column became `type` this morning. **The sweep
-- that migration ran matched `c.kind` and this function's alias is `t`**, so it
-- was missed -- a column name is a word, not a substring, and the sweep should
-- have been `\mkind\M` over the whole definition. Nothing calls it, so nothing
-- failed; a call answers `42703 column t.kind does not exist`.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090315_trivia_becomes_multiple_choice.sql

begin;

-- 0. THE LADDER RULE COMES OFF FIRST, AND THE FIRST RUN OF THIS FILE PROVED
--    WHY. It is not an implication like its five siblings -- it is an exclusive
--    OR:
--        (type =  'trivia' and ladder_key is not null and ...)
--     or (type <> 'trivia' and ladder_key is null)
--    so a row LEAVING `trivia` while it still carries a key fails the second
--    branch. The update was refused outright:
--        23514 challenges_ladder_key_belongs_to_trivia
--        Failing row: (39, ... multiple_choice, ... new-orleans-la-nfl-saints)
--    **The whole transaction rolled back and nothing changed**, which is the
--    argument for one transaction. Its five siblings read `type <> 'trivia' OR
--    <rule>` and pass vacuously the moment the type moves, so only this one
--    blocks.
alter table public.challenges drop constraint challenges_ladder_key_belongs_to_trivia;

-- 1. WIDEN, MOVE, NARROW -----------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo', 'any_answer',
                           'operations', 'trivia', 'multiple_choice']));

update public.challenges set type = 'multiple_choice' where type = 'trivia';

alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo', 'any_answer',
                           'operations', 'multiple_choice']));

-- 2. THE SIX RULES THAT ONLY APPLY TO THIS TYPE ------------------------------
-- Dropped and recreated against the new value. **The rows have already moved**,
-- so each is validated against them on the way in -- which is the check that
-- they still hold, and is why this is not merely a rename.
alter table public.challenges add constraint challenges_ladder_key_belongs_to_type
  check (
    (type = 'multiple_choice' and ladder_key is not null
      and ladder_key = lower(ladder_key) and btrim(ladder_key) <> '')
    or (type <> 'multiple_choice' and ladder_key is null)
  );

alter table public.challenges drop constraint challenges_trivia_has_a_prompt;
alter table public.challenges add constraint challenges_mc_has_a_prompt
  check (type <> 'multiple_choice' or (prompt is not null and btrim(prompt) <> ''));

alter table public.challenges drop constraint challenges_trivia_has_an_answer;
alter table public.challenges add constraint challenges_mc_has_an_answer
  check (type <> 'multiple_choice' or (answer is not null and btrim(answer) <> ''));

alter table public.challenges drop constraint challenges_trivia_free_answer_is_one_word;
alter table public.challenges add constraint challenges_mc_free_answer_is_one_word
  check (type <> 'multiple_choice' or choices is not null
         or btrim(answer) !~ '[[:space:]]');

alter table public.challenges drop constraint challenges_trivia_no_one_word_prefix;
alter table public.challenges add constraint challenges_mc_no_one_word_prefix
  check (type <> 'multiple_choice' or lower(btrim(prompt)) not like 'one word%');

-- NOT VALID IS PRESERVED, and it has to be: one row on file names its own
-- answer in its question, and 2026090302's lesson is that `not valid` exempts
-- EXISTING rows only -- recreating this one validated would refuse the whole
-- migration for a row it was deliberately written to spare.
alter table public.challenges drop constraint challenges_trivia_answer_not_in_prompt;
alter table public.challenges add constraint challenges_mc_answer_not_in_prompt
  check (
    type <> 'multiple_choice'
    or strpos(' ' || lower(regexp_replace(prompt, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ',
              ' ' || lower(regexp_replace(btrim(answer), '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') = 0
  ) not valid;

-- 3. THE ONE FUNCTION THAT NAMES IT, patched from its LIVE definition --------
-- TWO faults in one body: the dead `t.kind` and the old value. Each replacement
-- declares how many times it should match and refuses otherwise -- a
-- `String.replace` that silently matches nothing is how this repo once lost a
-- whole stylesheet.
do $$
declare src text; hits int;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'tgb_trivia_for' and prokind = 'f';
  if src is null then
    raise exception 'tgb_trivia_for is not installed';
  end if;

  hits := (length(src) - length(replace(src, 't.kind', ''))) / length('t.kind');
  if hits <> 1 then
    raise exception 'expected one t.kind in tgb_trivia_for, found %', hits;
  end if;
  src := replace(src, 't.kind', 't.type');

  hits := (length(src) - length(replace(src, '''trivia''', ''))) / length('''trivia''');
  if hits <> 1 then
    raise exception 'expected one trivia literal in tgb_trivia_for, found %', hits;
  end if;
  src := replace(src, '''trivia''', '''multiple_choice''');

  execute src;
end $$;

commit;

-- VERIFY ---------------------------------------------------------------------
--   select type, count(*) from public.challenges group by type order by 2 desc;
--     -> multiple_choice 37, and no trivia
--
--   select count(*) from public.challenges c
--    where exists (select 1 from unnest(c.tags) t where lower(t) = 'trivia');
--     -> 4, UNCHANGED. The tag is a different column.
--
--   select conname from pg_constraint
--    where conrelid = 'public.challenges'::regclass
--      and pg_get_constraintdef(oid) like '%trivia%';        -> none
--
--   -- THE FUNCTION HAS TO BE CALLED, not merely compiled. It answered
--   -- `42703 column t.kind does not exist` before this file.
--   select count(*) from public.tgb_trivia_for('chicago-il', null, null, 3);
--
--   -- AND A RULE HAS TO REFUSE, or none of the six is proved to still apply:
--   begin;
--     update public.challenges set answer = null
--      where type = 'multiple_choice' limit 1;
--     -- expect 23514 challenges_mc_has_an_answer
--   rollback;
