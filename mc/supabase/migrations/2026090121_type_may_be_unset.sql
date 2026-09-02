-- A ROW MAY ARRIVE WITHOUT A TYPE. 2026-09-01.
--
-- `audiences.type` is NOT NULL with **no default**, so every insert has to pick
-- one of the four -- and the MANUAL button in the room therefore wrote
-- `fandom` on every placeholder row, which is a decision the button was making
-- on somebody's behalf and could not avoid making.
--
-- **THE PLACEHOLDER PATTERN IS WHY.** MANUAL writes `_NAME` and `_LAST`, which
-- are visibly not answers; `fandom` looks exactly like an answer, so a row
-- created five seconds ago claimed a type nobody had chosen. A NULL is the
-- honest state and the badge already draws it: with no labels, an empty field
-- shows its own column name, so the cell reads `TYPE` until it is filled in.
--
-- ---------------------------------------------------------------------------
-- WHAT A NULL TYPE COSTS, AND IT IS EXACTLY WHAT IT SHOULD COST
-- ---------------------------------------------------------------------------
-- Three readers filter on `type = 'fandom'` and a NULL fails that test, so an
-- untyped row is simply absent from them until somebody types it:
--
--   VIEW destinations   a game cannot find it as a rival
--   VIEW teams          the engines cannot resolve it as a club
--   the room's filters  it is not counted under any type
--
-- **That is the correct behaviour for a row nobody has finished**, and it is
-- the same argument as leaving a college town blank rather than guessing it: an
-- absent row is visible, a wrongly-typed one is not.
--
-- THE CHECK IS UNCHANGED AND STILL REFUSES A FIFTH VALUE. `audiences_type`
-- allows fandom / artist / interest / historical, and a CHECK passes on NULL by
-- construction -- so this relaxes WHETHER a type is given and not WHICH.
-- Verified below by making it refuse one.
--
-- REVERSIBLE, and the statement is at the foot. Restoring NOT NULL needs every
-- untyped row to have been given one first, which is the point of the count in
-- the verify block.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences alter column type drop not null;

comment on column public.audiences.type is
  'fandom | artist | interest | historical, or NULL on a row nobody has typed '
  'yet. The three readers that filter on fandom skip a NULL, which is the '
  'correct treatment of an unfinished row. 2026090121.';

commit;

-- ---------------------------------------------------------------------------
-- Verify. PROVED BY WRITES THAT MADE IT ACCEPT AND REFUSE, never by the absence
-- of an error -- and both probes rolled back.
-- ---------------------------------------------------------------------------
-- begin;
--   insert into public.audiences (id, full_name, first, last)
--        values ('probe-untyped', 'Probe Untyped', 'Probe', 'Untyped');   -- accepted
--   select type is null as untyped from public.audiences where id = 'probe-untyped';
--   savepoint s;
--     insert into public.audiences (id, full_name, type)
--          values ('probe-bad', 'Probe Bad', 'nonsense');                 -- 23514
--   rollback to s;
--   select
--     (select count(*) from public.audiences where type is null) as untyped_rows,
--     (select count(*) from public.audiences) as rows,
--     (select count(*) from public.destinations) as destinations,
--     (select count(*) from public.teams) as teams;
-- rollback;
--
-- To put it back once every row has a type:
--   alter table public.audiences alter column type set not null;
