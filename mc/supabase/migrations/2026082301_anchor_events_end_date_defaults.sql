-- anchor_events.end_date: a single-day event ends the day it starts.
-- ---------------------------------------------------------------------------
-- 2026080101 added end_date for multi-day runs and its comment said "Null for a
-- single-day event". That is a fine convention and it makes every reader carry
-- the fallback: `coalesce(end_date, event_date)` in SQL, `end_date || event_date`
-- in the two places mc/events/index.html asks when an event finishes. A reader
-- that forgets it calls a one-day event undated.
--
-- The page now fills end_date from event_date on every write -- the card mirrors
-- it into the box as you type, the ESPN importer writes it per fixture, and the
-- AI prompt asks for it -- so from here on a row with a date has a last day.
-- This closes the gap behind those writers: the 272 rows filed before it.
--
-- IT IS NOT A NOT NULL CONSTRAINT AND MUST NOT BECOME ONE. event_date is itself
-- nullable, and an event whose date is not yet announced is a real row worth
-- keeping -- the CHECK report on the page names it rather than the database
-- refusing it. A row with no start has no end.

-- ── Backfill ────────────────────────────────────────────────────────────────
update public.anchor_events
   set end_date = event_date
 where end_date is null
   and event_date is not null;

-- ── The trigger, so the rule holds for a writer that is not the page ────────
-- The page is not the only thing that writes here: the AI prompt hands a human
-- an `insert` to run in the SQL editor, and that path never touches our code.
-- A default cannot do this job -- `default event_date` is not legal, since a
-- column default cannot reference another column -- so it is a trigger.
--
-- IT FILLS A BLANK AND NEVER OVERWRITES. A real range somebody typed survives
-- every later update, and clearing end_date on a row that has a start date
-- puts the start back rather than leaving null, which is the same answer the
-- card gives.
create or replace function public.tgb_anchor_events_default_end_date()
returns trigger language plpgsql as $$
begin
  if new.end_date is null and new.event_date is not null then
    new.end_date := new.event_date;
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_anchor_events_end_date on public.anchor_events;
create trigger tgb_anchor_events_end_date
  before insert or update on public.anchor_events
  for each row execute function public.tgb_anchor_events_default_end_date();

comment on column public.anchor_events.end_date is
  'The last day. Equal to event_date for a single-day event, later for a run '
  'of several (a convention, a festival). Filled from event_date by '
  'tgb_anchor_events_end_date when left blank, so it is null only on a row '
  'that has no event_date either.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 0 rows: nothing dated should be missing a last day.
--   select count(*) from public.anchor_events
--    where end_date is null and event_date is not null;
--
-- And expect 0: no row may end before it starts.
--   select id, event_date, end_date from public.anchor_events
--    where end_date < event_date;
--
-- Prove the TRIGGER rather than the backfill -- an insert with no end_date is
-- the call that makes it do its job, and a probe that supplies one proves
-- nothing:
--   insert into public.anchor_events (id, kind, title, event_date)
--   values ('TEST-END-DATE', 'other', 'trigger probe', '2026-12-25')
--   returning id, event_date, end_date;   -- end_date must read 2026-12-25
--   delete from public.anchor_events where id = 'TEST-END-DATE';

-- ── Rollback ────────────────────────────────────────────────────────────────
-- The backfill is not reversible: which rows were null before it is not
-- recorded anywhere. Only the trigger can be taken off.
--   drop trigger if exists tgb_anchor_events_end_date on public.anchor_events;
--   drop function if exists public.tgb_anchor_events_default_end_date();
