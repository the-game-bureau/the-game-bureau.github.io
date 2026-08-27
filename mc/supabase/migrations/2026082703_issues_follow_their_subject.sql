-- DELETING A TRACK DELETES THE FINDINGS ABOUT IT.
--
-- ── WHAT BROKE, AND WHEN ────────────────────────────────────────────────────
--
-- A finding used to live IN the track: `soundtrack.findings` was a jsonb column
-- on the row, so deleting the row took its findings with it for free, and both
-- pages said so in as many words. [2026082701] moved findings into a table of
-- their own and **nothing replaced that**.
--
-- So since yesterday, deleting a track has left its finding on file. The card
-- goes quiet on screen -- `markSettled` writes an in-memory flag -- and the row
-- is still there, so a reload brings the finding straight back naming a track
-- that no longer exists. Found on the live table: **2 of 7 findings were
-- already orphaned this way.**
--
-- ── WHY A TRIGGER AND NOT A FIX IN THE PAGE ─────────────────────────────────
--
-- The issues room is not the only thing that deletes a track. **The Tape Room
-- deletes them too, one at a time and in batches, and it has no idea
-- `public.issues` exists.** So a fix in the issues page would leave every Tape
-- Room delete orphaning findings, silently, forever. In a trigger the rule also
-- holds for psql and the Supabase table editor, and cannot be half-applied by a
-- client that dies between two requests.
--
-- Same reasoning that put the soundtrack shelve cascade in the database rather
-- than in the room that pressed the button.
--
-- ── WHY NOT A FOREIGN KEY, WHICH IS THE OBVIOUS ANSWER ──────────────────────
--
-- `issues.subject_id` is TEXT and deliberately generic: it holds a track id
-- today and a gift id tomorrow, and there is no one table for it to reference.
-- A foreign key would tie a table built for every area of the site to one of
-- them. The trigger keys on `area` instead, so each area gets its own and they
-- cannot interfere.
--
-- APPLY BY HAND.

create or replace function public.tgb_issues_drop_with_track()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- SCOPED BY AREA AS WELL AS BY ID. Ids are only unique within their own
  -- table, so without `area` a deleted track would clear a Gift Shop finding
  -- that happened to carry the same number.
  delete from public.issues
   where area = 'soundtrack'
     and subject_id = old.id::text;
  return old;
end $function$;

drop trigger if exists soundtrack_drop_issues on public.soundtrack;
create trigger soundtrack_drop_issues
  after delete on public.soundtrack
  for each row execute function public.tgb_issues_drop_with_track();

comment on function public.tgb_issues_drop_with_track() is
  'Deleting a track deletes the findings about it. In the database rather than in a page, because the Tape Room deletes tracks too and knows nothing about public.issues.';

-- ── THE ORPHANS ALREADY ON FILE ─────────────────────────────────────────────
--
-- Findings naming a track that is no longer there. There is nothing a human can
-- do with one: the fault it describes went with the row.
--
-- ONLY `scope = 'item'`. A group-scope finding is about the LIST and carries no
-- subject at all, so it is not orphaned by a delete and must not be swept up
-- with these.

delete from public.issues i
 where i.area = 'soundtrack'
   and i.scope = 'item'
   and i.subject_id is not null
   and not exists (select 1 from public.soundtrack s where s.id::text = i.subject_id);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. No orphan is left:
--      select count(*) from public.issues i
--       where i.area='soundtrack' and i.scope='item' and i.subject_id is not null
--         and not exists (select 1 from public.soundtrack s where s.id::text = i.subject_id);
--      -> 0
-- 2. AN EMPTY PAYLOAD PROVES NOTHING. File a finding against a real track,
--    delete the track, and check the finding went with it:
--      select count(*) from public.issues where subject_id = '<that id>';  -> 0
