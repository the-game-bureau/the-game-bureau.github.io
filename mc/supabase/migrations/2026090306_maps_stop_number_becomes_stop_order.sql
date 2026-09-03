-- `maps.stop_number` IS `stop_order`.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- The column is a POSITION IN A WALK, not a count and not an identifier, and
-- `stop_order` says so where `stop_number` reads as "which number stop is
-- this". It is also what `route_stops.ord` has always meant on the other side
-- of the product.
--
-- **A BEFORE TRIGGER ON THIS TABLE NAMES IT, WHICH IS THE WHOLE DANGER.**
-- `tgb_maps_one_name` is `BEFORE INSERT OR UPDATE ON public.maps` and its body
-- reads `stop_number` twice on one line. A PLPGSQL BODY IS STORED AS TEXT AND
-- RESOLVED AT RUNTIME, so a bare rename raises nothing here and nothing at
-- deploy time -- it waits for a caller, and then EVERY WRITE TO `maps` fails.
-- This project has now been bitten by that property five times; the one that
-- cost most was `infer_game_team_keys` after `teams.tgbid` was dropped, which
-- stopped every game save for a day.
--
-- THE FUNCTION IS PATCHED FROM ITS LIVE DEFINITION, one named expression, with
-- the match count asserted -- never re-typed from memory. A `create or replace`
-- written afresh rewrites the whole body and this project has silently lost a
-- column that way.
--
-- THE PRIMARY KEY AND BOTH CHECKS CARRY THEMSELVES. A PK is an index over
-- attnums and a CHECK is a parsed node tree, so both follow a column rename --
-- but their NAMES do not, so the two that say "number" are renamed with it. The
-- Atlas room translates `maps_number_positive` into a sentence, so that room
-- changes in the same commit or it hands back a raw 23514.

begin;

alter table public.maps rename column stop_number to stop_order;

comment on column public.maps.stop_order is
  'The stop''s position in the walk. 1 upward for a real stop; 0 is the '
  'placeholder row that IS the map, before it has any stops. Renamed from '
  'stop_number on 2026090306.';

-- ---- the trigger, patched in place -------------------------------------
do $$
declare
  v_src text;
  v_new text;
  v_hits int;
begin
  v_src := pg_get_functiondef('public.tgb_maps_one_name'::regproc);

  -- EXACTLY ONE LINE NAMES IT, and the count is asserted rather than assumed:
  -- a replace that silently matches nothing is how this repo once lost a whole
  -- stylesheet.
  v_hits := (length(v_src) - length(replace(v_src, 'stop_number', '')))
            / length('stop_number');
  if v_hits <> 2 then
    raise exception 'expected 2 mentions of stop_number in tgb_maps_one_name, found %', v_hits;
  end if;

  v_new := replace(v_src, 'stop_number', 'stop_order');
  execute v_new;
end $$;

-- ---- the two constraint names that half-remember ------------------------
alter table public.maps rename constraint maps_number_positive to maps_order_positive;
alter table public.maps rename constraint maps_placeholder_is_numbered to maps_placeholder_is_zero;

-- ---- VERIFY -------------------------------------------------------------
do $$
declare
  v_cols  text;
  v_pk    text;
  v_stale int;
  v_name  text;
begin
  select string_agg(column_name, ',' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'maps';
  if v_cols <> 'map_id,map_name,stop_id,stop_order,city' then
    raise exception 'unexpected columns: %', v_cols;
  end if;

  select pg_get_constraintdef(oid) into v_pk
    from pg_constraint where conname = 'maps_pkey';
  if position('stop_order' in v_pk) = 0 then
    raise exception 'the primary key did not follow: %', v_pk;
  end if;

  -- nothing left naming the old column, in a constraint or in a body
  select count(*) into v_stale from pg_constraint
   where conrelid = 'public.maps'::regclass and conname like '%number%';
  if v_stale <> 0 then
    raise exception '% constraints still say number', v_stale;
  end if;

  if position('stop_number' in pg_get_functiondef('public.tgb_maps_one_name'::regproc)) > 0 then
    raise exception 'tgb_maps_one_name still names stop_number';
  end if;

  -- THE TRIGGER STILL RUNS, and only a WRITE says so: a `create or replace`
  -- that returns without error proves nothing about a body resolved at call
  -- time. Two rows on one map, then a rename on one of them.
  insert into public.maps (map_id, map_name, stop_id, stop_order)
  values ('zzz-probe-map', 'Probe One', null, 0);
  insert into public.maps (map_id, map_name, stop_id, stop_order)
  select 'zzz-probe-map', 'SHOULD BE ADOPTED', stop_id, 1 from public.stops limit 1;

  select map_name into v_name from public.maps
   where map_id = 'zzz-probe-map' and stop_order = 1;
  if v_name <> 'Probe One' then
    raise exception 'the INSERT branch did not adopt the map name: %', v_name;
  end if;

  update public.maps set map_name = 'Renamed'
   where map_id = 'zzz-probe-map' and stop_order = 0;
  select map_name into v_name from public.maps
   where map_id = 'zzz-probe-map' and stop_order = 1;
  if v_name <> 'Renamed' then
    raise exception 'the rename did not reach the other row: %', v_name;
  end if;

  delete from public.maps where map_id = 'zzz-probe-map';

  raise notice 'maps: %; pkey follows; trigger adopts and renames on stop_order', v_cols;
end $$;

commit;
