-- 2026-08-31  atlases become maps, and the old maps table finally says it is retired
-- ---------------------------------------------------------------------------
-- ASKED FOR AS A REBRAND: everything called an atlas is called a map. The room
-- keeps ATLAS as its NAME -- it is "TGB Atlas", the book the maps live in --
-- and the thing a game points at is a MAP.
--
-- THE IDENTIFIERS MOVE THIS TIME, WHICH IS NOT THIS PROJECT'S USUAL ANSWER.
-- The standing rule is that visible copy is renamed and the column stays put:
-- the Tape Room's verbs changed four times without `archived` following. That
-- rule protects a name things POINT AT, and it does not apply here:
--   * `public.atlases` is ONE DAY OLD (2026083108).
--   * It holds THREE rows.
--   * Exactly ONE column anywhere references the word -- `games.atlas_id`, and
--     it is null on all 395 games.
-- A one-day-old noun with no readers is the one case where carrying the wrong
-- word forever costs more than moving it.
--
-- `public.maps` WAS IN THE WAY, and it is genuinely dead: superseded by
-- `public.stops` in 2026073003, its editor (`mc/mapper.html`) archived on
-- 2026-07-30, and this file has recorded it as "left in place but unread" ever
-- since. Verified rather than assumed: **0 dependent objects**, and nothing in
-- the repo reads it -- the two `MAPS_TABLE` constants in the builders point at
-- `game_stops`, which is a misleading name and a different table.
--   IT IS RENAMED, NEVER DROPPED. It holds 2,656 real rows, and a drop is the
--   one irreversible move available. `maps_retired` is the same move
--   2026083103 made for the old `stops`, and it makes the name say what this
--   file has only said in prose.
--
-- THE CONSTRAINTS, INDEXES AND THE TRIGGER ARE SWEPT FROM THE CATALOG, not
-- from a list of the ones this repo happens to know about, so anything added by
-- hand in the dashboard moves too. A table called `maps` whose key is
-- `atlases_pkey` half-remembers its old name.
--
-- APPLY BY HAND. Remote migration history has drifted; `supabase db push` is
-- refused. Safe with `supabase db query --linked --file`.

begin;

-- 1. free the name -----------------------------------------------------------
alter table public.maps rename to maps_retired;
comment on table public.maps_retired is
  'RETIRED. Held a city''s ordered waypoints before public.stops (2026073003) '
  'added the challenge. Unread since; its editor was archived 2026-07-30. Kept '
  'for its 2,656 rows, renamed 2026-08-31 so the name says so and so the maps '
  'the product actually uses could take it.';

do $do$
declare r record;
begin
  for r in
    select conname from pg_constraint where conrelid = 'public.maps_retired'::regclass
      and conname like 'maps%' and conname not like 'maps!_retired%' escape '!'
  loop
    execute format('alter table public.maps_retired rename constraint %I to %I',
                   r.conname, replace(r.conname, 'maps', 'maps_retired'));
  end loop;
  for r in
    select indexname from pg_indexes where schemaname = 'public' and tablename = 'maps_retired'
      and indexname like 'maps%' and indexname not like 'maps!_retired%' escape '!'
  loop
    execute format('alter index public.%I rename to %I',
                   r.indexname, replace(r.indexname, 'maps', 'maps_retired'));
  end loop;
end
$do$;

-- 2. atlases become maps -----------------------------------------------------
alter table public.atlases rename to maps;
alter table public.maps rename column atlas_id to map_id;
alter table public.maps rename column atlas_name to map_name;

do $do$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.maps'::regclass
  loop
    execute format('alter table public.maps rename constraint %I to %I',
                   r.conname, replace(r.conname, 'atlases', 'maps'));
  end loop;
  for r in select indexname from pg_indexes
            where schemaname = 'public' and tablename = 'maps' and indexname like 'atlases%'
  loop
    execute format('alter index public.%I rename to %I',
                   r.indexname, replace(r.indexname, 'atlases', 'maps'));
  end loop;
  for r in select tgname from pg_trigger
            where tgrelid = 'public.maps'::regclass and not tgisinternal
  loop
    execute format('alter trigger %I on public.maps rename to %I',
                   r.tgname, replace(r.tgname, 'atlases', 'maps'));
  end loop;
end
$do$;

-- 3. the trigger function, rewritten from the live definition ----------------
-- A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT RUNTIME, so this one names
-- `public.atlases` and `atlas_name` in strings that nothing checks until
-- something calls it. This project was bitten by exactly that FOUR times before
-- today, most recently this morning: `infer_game_team_keys` read a column that
-- had been dropped and every game save failed for a day with nothing saying so.
-- Renamed here, in the same transaction as the table.
create or replace function public.tgb_maps_one_name()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare existing text;
begin
  -- `pg_trigger_depth()` IS THE ONLY RELIABLE GUARD IN A BEFORE TRIGGER. A
  -- data-shaped one cannot tell the update somebody typed from the update this
  -- trigger just made -- the rows it is looking at have not been written yet --
  -- and the first version recursed until `54001: stack depth limit exceeded`.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  select m.map_name into existing
    from public.maps m
   where m.map_id = new.map_id
     and (tg_op = 'INSERT' or m.map_number is distinct from old.map_number)
   limit 1;

  if tg_op = 'INSERT' and existing is not null then
    -- A NEW ROW ADOPTS THE NAME THE MAP ALREADY HAS, so two rows of one map can
    -- never disagree.
    new.map_name := existing;
  elsif tg_op = 'UPDATE' and new.map_name is distinct from old.map_name then
    -- AND RENAMING ANY ROW RENAMES THE WHOLE MAP. The name repeats on every
    -- row, so this is what keeps it one name rather than several.
    update public.maps set map_name = new.map_name
     where map_id = new.map_id and map_number is distinct from new.map_number;
  end if;

  return new;
end;
$function$;

-- THE TRIGGER STILL POINTS AT THE OLD FUNCTION, so it is repointed before the
-- drop rather than dropped with `cascade` -- cascade would silently take
-- anything else that happened to depend on it, which is precisely the thing you
-- cannot see from inside a migration.
drop trigger if exists maps_one_name on public.maps;
create trigger maps_one_name
  before insert or update on public.maps
  for each row execute function public.tgb_maps_one_name();

drop function if exists public.tgb_atlases_one_name();

-- 4. a game names a map ------------------------------------------------------
alter table public.games rename column atlas_id to map_id;
comment on column public.games.map_id is
  'The map this game walks: public.maps.map_id. NOT a foreign key and cannot '
  'be one -- maps is keyed by (map_id, map_number), so the id alone is not '
  'unique and has nothing for a key to reference. The room only offers maps '
  'that exist, which is where the guard actually lives.';

-- THE VIEW KEEPS ITS OWN OUTPUT NAME THROUGH A COLUMN RENAME. It follows the
-- table by OID, so it did not break -- but it would go on serving a column
-- called `atlas_id`, and the page now asks for `map_id`, which is a 42703
-- nobody would connect to this file.
alter view public.games_with_graph_and_teams rename column atlas_id to map_id;

commit;

-- Verify -------------------------------------------------------------------
-- APPLY IT, THEN PROVE IT.
--
--   -- 1. the three rows came across, named as maps
--   select map_id, map_name, map_number, stop_id from public.maps order by map_id, map_number;
--
--   -- 2. nothing is half-renamed
--   select conname from pg_constraint where conrelid = 'public.maps'::regclass;
--   select indexname from pg_indexes where schemaname='public' and tablename='maps';
--   select tgname from pg_trigger where tgrelid='public.maps'::regclass and not tgisinternal;
--   -- expect: every name starts `maps`
--
--   -- 3. no function anywhere still names the old table
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prokind='f'
--      and pg_get_functiondef(p.oid) ilike '%atlas%';
--   -- expect: 0 rows
--
--   -- 4. the rename still holds, which only a write proves
--   update public.maps set map_name = map_name where map_id = (select map_id from public.maps limit 1);
--
--   -- 5. the page's own reads
--   select map_id from public.games limit 1;
--   select map_id from public.games_with_graph_and_teams limit 1;
--
--   -- 6. and the old table kept its rows
--   select count(*) from public.maps_retired;   -- expect 2656
