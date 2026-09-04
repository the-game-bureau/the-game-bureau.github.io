-- 2026090319  MULTIPLE_CHOICE AND TYPE_ANSWER BECOME `question`
--
-- apply by hand:
--   cd mc && supabase db query --linked --file supabase/migrations/2026090319_two_answer_types_become_question.sql
--
-- THE TWO WERE NOT TWO KINDS OF CHALLENGE. They are one kind with two INPUTS,
-- and `choices` already says which: present draws four buttons, null draws a
-- text box. The Trivia room has worked that way since it was built -- *the
-- answer control follows the row, not a setting* -- so the type column was
-- carrying a second copy of what `choices` says.
--
-- AND IT WAS ALREADY WRONG ABOUT SIX ROWS. **6 of the 76 `multiple_choice`
-- rows carry no choices at all**, so they were typed questions filed under the
-- tapped type. A column that disagrees with the column it duplicates is the
-- fault this merge removes.
--
--   76 multiple_choice + 15 type_answer  ->  91 question
--   70 of the 91 carry choices, 21 do not
--
-- TWO CONSTRAINTS HAD TO BE RE-DECIDED RATHER THAN RENAMED, and they are the
-- whole reason this is a migration and not a sweep. Both are below.

begin;

-- ---------------------------------------------------------------------------
-- 1. WIDEN. The value has to be legal before a row can hold it.
-- ---------------------------------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['type_answer', 'minigame', 'photo', 'operations',
                           'multiple_choice', 'waypoint_reveal', 'question']));

-- ---------------------------------------------------------------------------
-- 2. THE SIX CONSTRAINTS THAT NAME THE OLD VALUE COME OFF FIRST.
--
--    LEAVING THEM WOULD REFUSE THE UPDATE, not merely go vacuous:
--    `challenges_ladder_key_belongs_to_type` reads
--        (type = 'multiple_choice' AND ladder_key IS NOT NULL)
--     OR (type <> 'multiple_choice' AND ladder_key IS NULL)
--    so a keyed row LEAVING `multiple_choice` fails the second branch. The
--    other five are written `type <> 'multiple_choice' OR <rule>` and would
--    instead go **silently vacuous** -- every question would stop being checked
--    for a prompt, an answer, a one-word answer and the "One word" prefix, and
--    nothing would say so. That is the 2026090315 lesson, met from both sides
--    in one file.
-- ---------------------------------------------------------------------------
alter table public.challenges drop constraint challenges_ladder_key_belongs_to_type;
alter table public.challenges drop constraint challenges_mc_has_a_prompt;
alter table public.challenges drop constraint challenges_mc_has_an_answer;
alter table public.challenges drop constraint challenges_mc_free_answer_is_one_word;
alter table public.challenges drop constraint challenges_mc_no_one_word_prefix;
alter table public.challenges drop constraint challenges_mc_answer_not_in_prompt;

-- ---------------------------------------------------------------------------
-- 3. MOVE.
-- ---------------------------------------------------------------------------
update public.challenges
   set type = 'question'
 where type in ('multiple_choice', 'type_answer');

-- ---------------------------------------------------------------------------
-- 4. THE DEFAULT MOVES IN THE SAME TRANSACTION.
--    Left behind, every insert that omits `type` arrives as a value the
--    narrowed check refuses -- so the room's own add path starts failing on a
--    column nobody touched.
-- ---------------------------------------------------------------------------
alter table public.challenges alter column type set default 'question';

-- ---------------------------------------------------------------------------
-- 5. THE RULES, RE-SCOPED. Four are the same rule under the new name; two are
--    genuinely different and are argued here rather than in a commit message.
-- ---------------------------------------------------------------------------

-- Unchanged in effect: every question is read aloud at a stop, so it needs the
-- words. 0 of the 91 are blank.
alter table public.challenges add constraint challenges_question_has_a_prompt
  check (type <> 'question' or (prompt is not null and btrim(prompt) <> ''));

-- Widened from multiple choice to every question, and 0 rows are affected: an
-- instruction to the FORM bolted onto a sentence a team reads aloud in the
-- street is the same fault whichever way they answer.
alter table public.challenges add constraint challenges_question_no_one_word_prefix
  check (type <> 'question' or lower(btrim(prompt)) not like 'one word%');

-- RE-DECIDED (1). It was "a multiple choice row has an answer". It is now
-- **a row with OPTIONS has to say which one is right** -- which is the thing
-- that was actually being protected, and it is now scoped to the column that
-- identifies those rows rather than to a type that only mostly did.
--   WHAT IT GIVES UP: a typed question may have no answer, so it is judged by
-- the team. That was already true of 6 rows (the old `any_answer`) and is now
-- true of 21. Nothing reports a marked question whose answer was deleted.
alter table public.challenges add constraint challenges_options_name_their_answer
  check (choices is null or (answer is not null and btrim(answer) <> ''));

-- RE-DECIDED (2), AND THIS IS THE ONE THAT COULD NOT SIMPLY WIDEN.
--   The rule is that a team outdoors on a phone cannot be asked to type two
-- words exactly right. **6 of the 15 typed rows on file break it and every one
-- of them is a good challenge**: `Lake Michigan`, `Jefferson Davis`,
-- `Hale Boggs`, `The Bean`, `Her face`, and one answer carrying its own
-- variants. A rule that 29% of correct rows break is a rule that is wrong, not
-- a table that is wrong -- the same argument that deleted the `no-answer`
-- finding.
--   SO IT KEEPS EXACTLY THE SET IT HAD, expressed through the column that now
-- means what the old type meant: **a KEYED question is one asked of a fandom or
-- a place**, which is trivia, and trivia typed in the street wants one word.
-- A question read off a plaque may be two. 0 violations either way.
alter table public.challenges add constraint challenges_keyed_free_answer_is_one_word
  check (choices is not null or ladder_key is null
         or btrim(answer) !~ '[[:space:]]');

-- NOT VALID, as it was: one row on file names its own answer in its question
-- and recreating this validated would refuse the whole migration for the very
-- row it was written to spare. Widened to typed questions, which the exemption
-- covers.
--   THE BLANK ESCAPE IS NEW AND IS REQUIRED. With an empty answer the inner
-- expression searches the prompt for a single space and finds one, so the check
-- would refuse every answerless question -- a state this file has just made
-- legal for 21 rows.
alter table public.challenges add constraint challenges_question_answer_not_in_prompt
  check (type <> 'question'
      or btrim(coalesce(answer, '')) = ''
      or strpos(' ' || lower(regexp_replace(prompt, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ',
                ' ' || lower(regexp_replace(btrim(answer), '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') = 0)
  not valid;

-- RE-DECIDED (3). It read "a multiple_choice row HAS a key and nothing else
-- may". A ladder key says a question is asked of a fandom, a city or a
-- waypoint; it has nothing to do with whether the answer is tapped or typed.
--   SO IT IS OPTIONAL ON A QUESTION AND FORBIDDEN EVERYWHERE ELSE -- a photo or
-- a minigame is not keyed to a fandom.
--   WHAT IT GIVES UP, PLAINLY: nothing now forces a question onto the ladder,
-- where every multiple choice row used to be guaranteed reachable by
-- `tgb_content_keys`. 15 typed rows were already unreachable and the room has
-- no field for a key, so no capability is lost -- a guarantee is.
alter table public.challenges add constraint challenges_ladder_key_belongs_to_a_question
  check (ladder_key is null
      or (type = 'question' and ladder_key = lower(ladder_key)
          and btrim(ladder_key) <> ''));

-- ---------------------------------------------------------------------------
-- 6. NARROW. Neither old value may be written again, or the two start
--    diverging back apart in silence.
-- ---------------------------------------------------------------------------
alter table public.challenges drop constraint challenges_type_check;
alter table public.challenges add constraint challenges_type_check
  check (type = any (array['question', 'minigame', 'photo', 'operations',
                           'waypoint_reveal']));

-- ---------------------------------------------------------------------------
-- 7. `tgb_trivia_for` NAMES THE VALUE, AND A FUNCTION FOLLOWS NOTHING.
--    A sql body is stored as TEXT and resolved at RUNTIME, so a stale literal
--    raises nothing here and waits for a caller. Patched from the LIVE
--    definition, one expression, with the match count asserted -- a body
--    rewritten from memory is how this project has lost a column before.
-- ---------------------------------------------------------------------------
do $$
declare src text; hits int;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'tgb_trivia_for' and prokind = 'f';
  if src is null then
    raise notice 'tgb_trivia_for is not installed; nothing to patch';
  else
    select count(*) into hits from regexp_matches(src, 'multiple_choice', 'g');
    if hits <> 1 then
      raise exception 'expected 1 mention of the old value in tgb_trivia_for, found %', hits;
    end if;
    execute replace(src, '''multiple_choice''', '''question''');
  end if;
end $$;

commit;

-- ===========================================================================
-- VERIFY. Run this after. A create that returns without error says nothing
-- about a CHECK; only a write that makes it refuse does.
-- ===========================================================================
--
-- select type, count(*) from public.challenges group by type order by 2 desc;
--   -> question 91, photo 28, minigame 6, operations 1
--
-- select count(*) from public.challenges
--  where type = 'question' and choices is not null;            -> 70
--
-- begin;
--   -- accepted: a typed question with a two word answer and no key
--   insert into public.challenges (name, type, prompt, answer)
--   values ('probe ok', 'question', 'Whose house is this?', 'Jefferson Davis');
--   -- refused: options with no answer
--   insert into public.challenges (name, type, prompt, choices)
--   values ('probe a', 'question', 'Which?', array['x','y','z','w']);
--   -- refused: a key on a photo
--   insert into public.challenges (name, type, prompt, ladder_key)
--   values ('probe b', 'photo', 'Snap it.', 'chicago-il');
--   -- refused: a keyed question with a two word typed answer
--   insert into public.challenges (name, type, prompt, answer, ladder_key)
--   values ('probe c', 'question', 'Who?', 'Bart Starr', '*');
--   -- refused: the old value
--   insert into public.challenges (name, type, prompt, answer)
--   values ('probe d', 'multiple_choice', 'Who?', 'x');
-- rollback;
