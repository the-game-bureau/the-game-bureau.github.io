-- `created_at` IS `updated`, AND IT IS MADE TO MEAN IT. 2026-09-01.
--
-- The pair reads `created` / `updated` now: when the audience was first filed,
-- and when the row last changed. 2026090111 renamed the first half and left
-- this note open in as many words -- two columns, both true, both called
-- created -- so this is that decision taken.
--
-- **A TRIGGER COMES WITH THE NAME, and that is the part that is not cosmetic.**
-- `created_at` was a plain `default now()` with nothing writing it afterwards,
-- so renamed and left alone it would be an `updated` column that never updates.
-- That is exactly the fault 2026090111 was fixing three hours ago: `updated_at`
-- had been frozen since the club rows were merged in, and drawn as Changed it
-- read as a bug in the room rather than as a column that had stopped being
-- maintained. Renaming without the trigger would put the same fault back under
-- the same name.
--
-- SO THE TWO ARE NOW GENUINELY DIFFERENT FACTS, which they were not this
-- morning: `created` is written once by its default and never moved, `updated`
-- is written on every write by the trigger.
--
-- WHAT THE EXISTING VALUES MEAN, said rather than glossed: `created_at` held
-- the day each row entered THIS table, which is 2026-08-30 to 2026-09-01 for
-- every one of them -- the club merge and this week's work. As an `updated`
-- stamp those are true and unremarkable; from the first write onward the column
-- says something worth reading.
--
-- ONE READER, AND IT IS NOT A PAGE. `teams` does not select it; the room draws
-- it. Checked against the catalogue rather than assumed.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences rename column created_at to updated;
alter table public.audiences alter column updated set default now();

comment on column public.audiences.updated is
  'When this row last changed. Written by tgb_audiences_touch on every insert '
  'and update -- a column called updated that nothing updates is the fault this '
  'replaced, so the trigger is what makes the name true. Its sibling `created` '
  'is stamped once on insert and never moves.';

-- ---------------------------------------------------------------------------
-- The trigger.
-- ---------------------------------------------------------------------------
-- IT IGNORES WHAT THE CALLER SENT, deliberately. `new.updated` set by hand
-- would be a client asserting when a row changed, which is the one thing a
-- clock on the server is for -- and it is the same reasoning that keeps
-- `game_responses.created_at` the database's own clock rather than the phone's.
create or replace function public.tgb_audiences_touch()
returns trigger
language plpgsql
as $function$
begin
  new.updated := now();
  return new;
end;
$function$;

drop trigger if exists audiences_touch on public.audiences;
create trigger audiences_touch
  before insert or update on public.audiences
  for each row execute function public.tgb_audiences_touch();

commit;

-- ---------------------------------------------------------------------------
-- Verify BY WRITING, not by reading the catalogue. A declared default and a
-- firing trigger are two different claims, and only a write tests the second.
-- ---------------------------------------------------------------------------
-- begin;
--   -- an update moves `updated` and leaves `created` alone
--   select id, created, updated from public.audiences where id = 'chicago-bears';
--   update public.audiences set description = 'probe' where id = 'chicago-bears';
--   select id, created, updated, updated > created as moved
--     from public.audiences where id = 'chicago-bears';
--   -- and an insert stamps both
--   insert into public.audiences (id, type, full_name) values ('probe-zzz','interest','Probe Zzz');
--   select created::date = current_date as created_today,
--          updated::date = current_date as updated_today
--     from public.audiences where id = 'probe-zzz';
-- rollback;
