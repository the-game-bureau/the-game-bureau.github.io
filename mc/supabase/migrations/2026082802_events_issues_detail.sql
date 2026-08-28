-- AND WHAT THE AUDIT FOUND, IN WORDS.
--
-- `public.events.issues_detail` beside `issues`. The flag says THAT something
-- is wrong; this says WHAT, in the same sentences the row draws on screen.
--
-- ── WHY THE FLAG WAS NOT ENOUGH ─────────────────────────────────────────────
--
-- `issues = 'YES'` is readable by anything, and answers nothing. The findings
-- themselves live only in the page, recomputed on every render, so a person
-- reading this table in the Supabase editor -- or a routine, or a future room --
-- could see that a row was objected to and had no way to learn why without
-- opening the events room and pressing the button again.
--
-- ── IT IS EXACTLY THE REASONS THAT PRODUCED THE YES ─────────────────────────
--
-- Not the muted notes. Two rules carry `noReview` and report without accusing
-- the row -- a missing start time means the SOURCE has not announced the slot,
-- which is a gap that fills itself. Those are drawn on screen in a quieter pen
-- and are deliberately NOT in here: a column that mixed them would make
-- `issues_detail` non-empty on rows whose flag says NO, and the pair would stop
-- agreeing with each other.
--
-- **THE RULE IS: `issues_detail` IS NON-EMPTY IF AND ONLY IF `issues` IS
-- 'YES'.** They are written in one PATCH so they cannot drift apart.
--
-- ── IT IS A SNAPSHOT AND SAYS SO ────────────────────────────────────────────
--
-- These are the words from the last run, not a live view. Fix a date and the
-- row on screen stops saying it immediately; the column keeps saying it until
-- the sweep runs again, at which point both are rewritten together. That is the
-- same bargain `issues` itself makes and is why the two move as a pair.
--
-- APPLY BY HAND.

alter table public.events
  add column if not exists issues_detail text;

comment on column public.events.issues_detail is
  'What the last audit objected to, one finding per line, in the same words the row shows on screen. Non-empty if and only if issues = YES: the two are written in one PATCH and must not drift. It holds the FORCING reasons only, never the muted notes -- those report without accusing the row, so including them would put text on rows flagged NO. A snapshot of the last run, not a live view.';

-- THE PAIR MUST AGREE. A flag with no words, or words with no flag, is the one
-- state a reader could not interpret -- and it is exactly what a half-applied
-- write would leave behind.
alter table public.events drop constraint if exists events_issues_detail_check;
alter table public.events add constraint events_issues_detail_check
  check (
    (issues = 'YES' and issues_detail is not null and btrim(issues_detail) <> '')
    or
    (issues = 'NO'  and (issues_detail is null or btrim(issues_detail) = ''))
  );

grant update (issues_detail) on public.events to authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The constraint refuses each half on its own:
--      update public.events set issues = 'YES' where true;                  -> 23514
--      update public.events set issues_detail = 'x' where true;             -> 23514
--    and accepts the pair:
--      update public.events set issues = 'YES', issues_detail = 'x' ...     -> ok
-- 2. After pressing Issues in the room, every YES row carries its reasons and
--    every NO row carries none:
--      select issues, count(*), count(issues_detail) from public.events group by 1;
