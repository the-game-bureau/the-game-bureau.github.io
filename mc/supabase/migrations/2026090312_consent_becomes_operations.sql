-- CONSENT IS `operations` (2026-09-03)
--
-- `challenges.kind` carried `consent`, added by 2026083003 for the waiver: a
-- fifth kind, one portable row, and AGREE as the signature. The VALUE is
-- renamed and nothing else about it moves.
--
-- WHAT CARRIES THE MEANING IS UNCHANGED. `challenges.prompt` still holds the
-- full words, `game_responses` still records the whole prompt as the reply so a
-- past signature cannot be rewritten by editing the row, and the engine still
-- has to gate the route on it. This is the label on the kind, not the contract.
--
-- ONE ROW HAS IT. Measured before writing this: trivia 37, question 9,
-- minigame 6, freeform 6, photo 3, consent 1.
--
-- THE ORDER IS NOT NEGOTIABLE: widen, move, narrow. The CHECK has to admit both
-- words before the row passes through it and only the new one after. Same shape
-- as 2026090122, which renamed `audiences.type` from `fandom` to `sports`.
--
-- apply by hand:  cd mc && supabase db query --linked --file supabase/migrations/2026090312_consent_becomes_operations.sql

begin;

-- 1. WIDEN ------------------------------------------------------------------
alter table public.challenges drop constraint if exists challenges_kind_check;
alter table public.challenges add constraint challenges_kind_check
  check (kind = any (array['question', 'minigame', 'photo', 'freeform',
                           'consent', 'operations', 'trivia']));

-- 2. MOVE -------------------------------------------------------------------
update public.challenges set kind = 'operations' where kind = 'consent';

-- 3. NARROW -----------------------------------------------------------------
alter table public.challenges drop constraint challenges_kind_check;
alter table public.challenges add constraint challenges_kind_check
  check (kind = any (array['question', 'minigame', 'photo', 'freeform',
                           'operations', 'trivia']));

-- 4. THE ONE FUNCTION THAT NAMES IT -----------------------------------------
-- PATCHED FROM ITS LIVE DEFINITION, one literal, with the match count asserted.
-- A `create or replace` written afresh rewrites the whole body, and this
-- project has silently lost a column that way.
--   AND IT MATTERS MORE THAN A CATALOGUE TIDY-UP: a plpgsql or sql body is
-- stored as TEXT and resolved at RUNTIME, so a stale literal raises nothing
-- here and nothing at deploy -- it waits for a caller, and then the waiver
-- starts being drawn as a random challenge.
do $$
declare src text; hits int;
begin
  select pg_get_functiondef(oid) into src
    from pg_proc where proname = 'tgb_pick_challenge' and prokind = 'f';
  if src is null then
    raise exception 'tgb_pick_challenge is not installed';
  end if;
  hits := (length(src) - length(replace(src, '''consent''', ''))) / length('''consent''');
  if hits <> 1 then
    raise exception 'expected one consent literal in tgb_pick_challenge, found %', hits;
  end if;
  execute replace(src, '''consent''', '''operations''');
end $$;

commit;

-- VERIFY --------------------------------------------------------------------
-- A statement that returns without error says nothing about a CHECK. Both of
-- these have to be run, and the refusal is the half that matters.
--
--   select kind, count(*) from public.challenges group by kind order by 2 desc;
--     -> operations 1, and no consent
--
--   select count(*) from pg_proc
--    where proname = 'tgb_pick_challenge'
--      and strpos(pg_get_functiondef(oid), 'consent') > 0;
--     -> 0
--
--   begin;
--     update public.challenges set kind = 'consent' where kind = 'operations';
--     -- expect 23514 challenges_kind_check
--   rollback;
