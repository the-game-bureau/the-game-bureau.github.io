-- 2026-08-31  THE ATLAS RENAME RECURSED FOREVER. `pg_trigger_depth()` is the fix.
--
-- `tgb_atlases_one_name` propagates a rename: change the name on any row of an
-- atlas and every row follows, because the name is one fact stored many times
-- and two rows of one atlas disagreeing would show the same atlas twice under
-- two names with nothing saying so.
--
-- IT PROPAGATED BY RUNNING AN UPDATE, AND THAT UPDATE FIRED THE TRIGGER AGAIN.
-- The guard was `atlas_name is distinct from new.atlas_name`, which reads like
-- it stops after one pass and does not: this is a BEFORE trigger, so the rows
-- it is looking at have not been written yet, the condition stays true, and
-- each nested call starts another. Postgres stopped it with
-- `54001: stack depth limit exceeded` after a few thousand frames.
--
-- NOTHING WAS CORRUPTED, which is the one good thing about failing that way:
-- the whole statement rolled back, and the two probe rows still read the name
-- they started with. **A silent half-rename would have been worse than a
-- crash**, and it is what a cleverer guard might have produced.
--
-- `pg_trigger_depth()` IS THE ONLY RELIABLE TEST, because it asks the question
-- that actually matters: am I the update somebody typed, or am I the update
-- this trigger just made? A data-shaped guard cannot tell those apart in a
-- BEFORE trigger, and that is the whole lesson.
--
-- THE FUNCTION IS REPLACED WHOLE, deliberately, and it is short enough to read
-- in one screen. `create or replace` rewrites the entire body -- this project
-- has silently lost a column that way -- so the safe version of that rule is to
-- keep such a function small enough that the whole of it is in front of you.

begin;

create or replace function public.tgb_atlases_one_name()
returns trigger
language plpgsql
as $fn$
declare v_existing text;
begin
  -- A NESTED CALL IS THE PROPAGATION ITSELF. It must not propagate again, and
  -- the row it is looking at is already being set by the UPDATE that called it.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- ADOPT, RATHER THAN REFUSE. Somebody adding a stop to an atlas should not
    -- have to know its name, and a blank or a stale one must not become a
    -- second name for it.
    select a.atlas_name into v_existing
      from public.atlases a
     where a.atlas_id = new.atlas_id
     limit 1;
    if v_existing is not null then
      new.atlas_name := v_existing;
    end if;
    return new;
  end if;

  -- A RENAME ON ONE ROW IS A RENAME OF THE ATLAS.
  if new.atlas_name is distinct from old.atlas_name then
    update public.atlases
       set atlas_name = new.atlas_name
     where atlas_id = new.atlas_id
       and stop_number is distinct from new.stop_number;
  end if;
  return new;
end;
$fn$;

commit;

-- Verify. The rename is the only thing worth checking, and it has to be checked
-- by DOING it: the broken version raised 54001, so an insert that raises
-- nothing proves nothing here.
--
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Probe Atlas', id, 1 from public.stops order by id limit 1;
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Ignored', id, 2 from public.stops order by id offset 1 limit 1;
--   select distinct atlas_name from public.atlases where atlas_id = 'probe';
--                                                 -- expect Probe Atlas, once
--
--   update public.atlases set atlas_name = 'Renamed'
--    where atlas_id = 'probe' and stop_number = 2;
--   select stop_number, atlas_name from public.atlases
--    where atlas_id = 'probe' order by stop_number;   -- expect BOTH Renamed
--
--   delete from public.atlases where atlas_id = 'probe';
