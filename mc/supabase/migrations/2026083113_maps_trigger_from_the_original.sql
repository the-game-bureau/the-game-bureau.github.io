-- 2026-08-31  the maps trigger, rewritten from the ORIGINAL rather than memory
-- ---------------------------------------------------------------------------
-- 2026083112 renamed the atlases trigger function and I RETYPED ITS BODY FROM
-- MEMORY, which put `map_number` in it where the column is `stop_number`. It
-- applied cleanly: **plpgsql only syntax-checks a body**, so a column that does
-- not exist compiles and waits for a caller. The very same file carries a
-- comment warning about this property, and the fault it names -- every game
-- save failing for a day -- happened this morning for the same reason.
--
-- SO THIS IS THE ORIGINAL BODY, structure for structure, with `atlas` swapped
-- for `map` and nothing else touched.

begin;

create or replace function public.tgb_maps_one_name()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $fn$
declare v_existing text;
begin
  -- `pg_trigger_depth()` IS THE ONLY RELIABLE GUARD IN A BEFORE TRIGGER. A
  -- data-shaped one cannot tell the update somebody typed from the update this
  -- trigger just made, and the first version recursed to 54001.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- ADOPT, RATHER THAN REFUSE. Somebody adding a stop to a map should not
    -- have to know its name, and a blank or a stale one must not become a
    -- second name for it.
    select m.map_name into v_existing
      from public.maps m
     where m.map_id = new.map_id
     limit 1;
    if v_existing is not null then
      new.map_name := v_existing;
    end if;
    return new;
  end if;

  -- A RENAME ON ONE ROW IS A RENAME OF THE MAP.
  if new.map_name is distinct from old.map_name then
    update public.maps
       set map_name = new.map_name
     where map_id = new.map_id
       and stop_number is distinct from new.stop_number;
  end if;
  return new;
end;
$fn$;

commit;
