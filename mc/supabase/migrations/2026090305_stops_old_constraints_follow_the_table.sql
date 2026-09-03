-- THE CONSTRAINTS FOLLOW THE TABLE.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- 2026090304 renamed `stops_retired` to `stops_old`, and A CONSTRAINT KEEPS ITS
-- OWN NAME THROUGH A TABLE RENAME -- so the table was left carrying four
-- `stops_retired_*` names and half-remembering what it used to be called. This
-- project has paid for that twice already: `routes` kept `paths_pkey`, and
-- `games_target_audience_idx` kept a column name after the column moved.
--
-- NOTHING READS THESE NAMES, checked rather than assumed. The Waypoints room
-- translates a foreign-key refusal with a GENERIC pattern -- `constraint
-- "[a-z_]+" on table "([a-z_]+)"` -- and prints the TABLE it captures, not the
-- constraint. So it says "in stops_old" after this, which is the true thing.

begin;

alter table public.stops_old rename constraint stops_retired_pkey to stops_old_pkey;
alter table public.stops_old rename constraint stops_retired_city_slug_fkey to stops_old_city_slug_fkey;
alter table public.stops_old rename constraint stops_retired_waypoint_id_fkey to stops_old_waypoint_id_fkey;
alter table public.stops_old rename constraint stops_retired_challenge_id_fkey to stops_old_challenge_id_fkey;

-- VERIFY
do $$
declare
  v_stale int;
  v_named int;
begin
  select count(*) into v_stale from pg_constraint con
    join pg_class c on c.oid = con.conrelid
   where c.relname = 'stops_old' and con.conname like 'stops_retired%';
  if v_stale <> 0 then
    raise exception '% constraints still half-remember stops_retired', v_stale;
  end if;

  select count(*) into v_named from pg_constraint con
    join pg_class c on c.oid = con.conrelid
   where c.relname = 'stops_old' and con.conname like 'stops_old%';
  if v_named <> 4 then
    raise exception 'expected 4 stops_old constraints, got %', v_named;
  end if;

  -- the key still works, and only a read of the view says so
  if (select count(*) from public.game_stops) <> 490 then
    raise exception 'game_stops stopped projecting 490 rows';
  end if;

  raise notice 'stops_old: % constraints, all named for the table; game_stops still 490', v_named;
end $$;

commit;
