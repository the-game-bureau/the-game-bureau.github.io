-- `public.maps` IS `public.atlas`.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- THIS PARTLY REVERSES 2026083112, WHICH IS WORTH SAYING RATHER THAN DOING
-- QUIETLY. That file renamed `atlases` to `maps` on 2026-08-31 precisely so
-- "the room is the ATLAS -- the book -- and the things in it are MAPS", and it
-- moved the identifiers on the argument that the noun was one day old and
-- nothing pointed at it. Asked for directly, so the table takes the room's
-- name; what it costs is that the room and the table are called one thing
-- again, which is the distinction that rename was made to draw.
--
-- **THE TRIGGER FUNCTION NAMES THE TABLE TWICE, WHICH IS THE DANGER.**
-- `tgb_maps_one_name` is BEFORE INSERT OR UPDATE on this table and its body
-- reads `public.maps`. A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT
-- RUNTIME, so a bare rename raises nothing and waits for a caller -- and then
-- every write to the table fails. Sixth time this project has met that
-- property; the expensive one stopped every game save for a day.
--
-- NOTHING ELSE DEPENDS ON IT, measured rather than assumed: no incoming
-- foreign key, no view, and the only functions naming it are that trigger's.
-- In the repo the readers are two -- `mc/atlas/` and the Game Builder's map
-- picker -- every other match for the word being a `google.com/maps` URL.
--
-- `games.map_id` IS NOT RENAMED AND IS NOT A FOREIGN KEY. It never was one:
-- the table is keyed by (map_id, stop_order), so the id alone is not unique
-- and nothing downstream says a game names a map that is not there. The
-- COLUMNS still say `map_id` / `map_name`; whether they follow the table is a
-- separate decision and was not asked for.

begin;

alter table public.maps rename to atlas;

comment on table public.atlas is
  'One row per stop on a map. `map_id` groups them and `stop_order` places '
  'them; the row with stop_order 0 and no stop IS the map. Renamed from '
  'public.maps on 2026090307. The columns still say map_.';

-- ---- the trigger's body, patched from the live definition ---------------
do $$
declare
  v_src  text;
  v_hits int;
begin
  v_src := pg_get_functiondef('public.tgb_maps_one_name'::regproc);
  v_hits := (length(v_src) - length(replace(v_src, 'public.maps', '')))
            / length('public.maps');
  if v_hits <> 2 then
    raise exception 'expected 2 mentions of public.maps in the trigger, found %', v_hits;
  end if;
  execute replace(v_src, 'public.maps', 'public.atlas');
end $$;

-- ---- the names that half-remember --------------------------------------
-- A CONSTRAINT, AN INDEX, A TRIGGER AND A FUNCTION ALL KEEP THEIR OWN NAME
-- through a table rename. `routes` kept `paths_pkey` once and this file has
-- since had to correct `games_target_audience_idx` and four `stops_retired_*`.
alter table public.atlas rename constraint maps_pkey to atlas_pkey;
alter table public.atlas rename constraint maps_id_lower to atlas_id_lower;
alter table public.atlas rename constraint maps_id_not_blank to atlas_id_not_blank;
alter table public.atlas rename constraint maps_name_not_blank to atlas_name_not_blank;
alter table public.atlas rename constraint maps_order_positive to atlas_order_positive;
alter table public.atlas rename constraint maps_placeholder_is_zero to atlas_placeholder_is_zero;
alter table public.atlas rename constraint maps_stop_id_fkey to atlas_stop_id_fkey;

alter index public.maps_stop_idx rename to atlas_stop_idx;

alter trigger maps_one_name on public.atlas rename to atlas_one_name;
alter function public.tgb_maps_one_name() rename to tgb_atlas_one_name;

-- ---- VERIFY -------------------------------------------------------------
do $$
declare
  v_rows  int;
  v_stale int;
  v_name  text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'atlas' and c.relkind = 'r') then
    raise exception 'public.atlas is not a table';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'maps') then
    raise exception 'public.maps is still there';
  end if;

  select count(*) into v_rows from public.atlas;
  if v_rows <> 3 then
    raise exception 'expected 3 rows, got %', v_rows;
  end if;

  -- nothing left half-remembering, in a constraint, an index or a body
  select count(*) into v_stale from pg_constraint
   where conrelid = 'public.atlas'::regclass and conname like 'maps%';
  if v_stale <> 0 then
    raise exception '% constraints still say maps', v_stale;
  end if;
  if exists (select 1 from pg_indexes where schemaname = 'public'
              and tablename = 'atlas' and indexname like 'maps%') then
    raise exception 'an index still says maps';
  end if;
  if position('public.maps' in pg_get_functiondef('public.tgb_atlas_one_name'::regproc)) > 0 then
    raise exception 'the trigger body still names public.maps';
  end if;

  -- THE TRIGGER STILL RUNS. Only a write says so.
  insert into public.atlas (map_id, map_name, stop_id, stop_order)
  values ('zzz-probe-atlas', 'Probe One', null, 0);
  insert into public.atlas (map_id, map_name, stop_id, stop_order)
  select 'zzz-probe-atlas', 'SHOULD BE ADOPTED', stop_id, 1 from public.stops limit 1;

  select map_name into v_name from public.atlas
   where map_id = 'zzz-probe-atlas' and stop_order = 1;
  if v_name <> 'Probe One' then
    raise exception 'the INSERT branch did not adopt the name: %', v_name;
  end if;

  update public.atlas set map_name = 'Renamed'
   where map_id = 'zzz-probe-atlas' and stop_order = 0;
  select map_name into v_name from public.atlas
   where map_id = 'zzz-probe-atlas' and stop_order = 1;
  if v_name <> 'Renamed' then
    raise exception 'the rename did not reach the other row: %', v_name;
  end if;

  delete from public.atlas where map_id = 'zzz-probe-atlas';

  raise notice 'public.atlas: % rows, every name follows, trigger adopts and renames', v_rows;
end $$;

commit;

-- NOT TOUCHED, and worth knowing rather than discovering: `maps_id_seq`,
-- `maps_retired`, `maps_retired_pkey` and `maps_retired_game_id_idx` all still
-- exist and belong to the OLD dead maps table, retired on 2026-08-31. A
-- sequence does not follow a table rename either, so `maps_id_seq` is that
-- table's and is named for what it used to be called.
