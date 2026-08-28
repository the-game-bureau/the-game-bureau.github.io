-- AN EVENT ROW SAYS WHETHER THE AUDIT FOUND ANYTHING WITH IT.
--
-- `public.events.issues`, 'NO' by default. The Issues sweep writes 'YES' onto a
-- row the checks object to.
--
-- ── WHY A COLUMN AND NOT A ROW IN public.issues ─────────────────────────────
--
-- That table exists and holds soundtrack findings, and this deliberately does
-- not use it. **Nothing writes an event finding there.** The two are different
-- shapes of the same idea and the difference is worth stating, because the
-- obvious tidy-up later would be to merge them:
--
--   public.issues        one row per FINDING, with words, filed by a routine
--                        that ran hours ago and is not here to be asked.
--   events.issues        one flag per EVENT, computed by rules that live in the
--                        page and can be re-run in front of you.
--
-- The findings themselves are not stored: they are recomputed on every render
-- and drawn on the row. So there is nothing here for a table of findings to
-- hold that the page does not already know, and a row in `public.issues` would
-- be a copy that goes stale the moment somebody fixes the date.
--
-- ── WHY IT IS NOT `status` ──────────────────────────────────────────────────
--
-- `status` already carries `review`, and that is a HUMAN's flag: the sweep puts
-- a row into review and deliberately never takes one out, because it cannot
-- know whether the underlying thing was dealt with or merely made to stop
-- matching.
--
-- **THIS COLUMN IS THE MACHINE'S ANSWER AND MOVES BOTH WAYS.** It is what the
-- checks said last time they ran, so fixing a date and re-running turns it back
-- to 'NO'. Keeping the two apart is what lets a row be `review = yes, issues =
-- NO`: somebody flagged it by hand and the rules have nothing to say about it.
--
-- ── 'YES' / 'NO', NOT A BOOLEAN ─────────────────────────────────────────────
--
-- Asked for in those words, and it matches what `public.games` already does
-- with `featured` and `archived`. A CHECK keeps it to the two values, so the
-- looseness that convention usually brings -- `'true'`, `''`, `'Y'` -- cannot
-- get in.
--
-- APPLY BY HAND.

alter table public.events
  add column if not exists issues text not null default 'NO';

alter table public.events drop constraint if exists events_issues_check;
alter table public.events add constraint events_issues_check
  check (issues in ('YES', 'NO'));

comment on column public.events.issues is
  'YES if the last audit found something wrong with this row, NO if not. Written by the Issues button in mc/events/index.html and by nothing else. It is the MACHINE''s answer and moves both ways, unlike status = review, which is a human''s flag and is never cleared automatically. No event finding is ever written to public.issues.';

-- THE SWEEP READS THIS TO FIND WHAT IT LAST FLAGGED, so it is worth an index:
-- the rows it wants are a handful out of thousands.
create index if not exists events_issues_idx
  on public.events (issues)
  where issues = 'YES';

-- Every existing row starts at the default. Nothing is backfilled, because
-- nothing has been audited yet under this column and 'NO' must mean "the checks
-- found nothing", not "the checks have not run" -- see the note in the page
-- about why that distinction is left to the run itself.

grant update (issues) on public.events to authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The column is there and everything starts at NO:
--      select issues, count(*) from public.events group by 1;
-- 2. The CHECK holds:
--      update public.events set issues = 'maybe' where true;  -> 23514
-- 3. After pressing Issues in the room, the count of YES equals the number of
--    rows the page drew a finding on.
