/* THE MAP COLUMN IS `map_id` (2026-09-05)
   ============================================================================
   REPORTED AS: every field in the Game Builder should save an id or a raw
   value to `public.games`. The MAP bar saved nothing at all, and the reason is
   a name.

   THE ROOM HAS ALWAYS WRITTEN `map_id`. `commitMapField` resolves the typed
   label against `public.atlas` -- which is keyed by `(map_id, stop_order)` --
   and puts the atlas's own id on `meta.mapId`, and `GAME_COLUMN_TO_NODE_FIELD`
   maps it to a column called `map_id`. `public.games` has no such column: it
   has `map`, text.

   SO THE COLUMN WAS SWITCHED OFF RATHER THAN FIXED. `SUPABASE_GAMES_SCHEMA`
   carries `map_id: false`, which takes it out of every select AND out of every
   PATCH -- so the box accepted a map, the note said which, and the value went
   nowhere. That flag is the stopgap for a database that is behind; here the
   database was not behind, it was named differently.

   A RENAME RATHER THAN A NEW COLUMN, AND IT COSTS NOTHING, MEASURED FIRST:

       games            393 rows
       map IS NOT NULL AND map <> ''      0        <- nothing to migrate
       readers of games.map anywhere      0        <- grepped, not assumed

   The four files in this repo that match `'map'` all mean the ENGINE value or a
   DOM id -- `ENGINES = { text: 'text', map: 'map' }` in both engines, the
   navigator's aliases, and `<div id="map">` on the public games page. None of
   them reads this column.

   AND `map` WAS THE WORSE NAME OF THE TWO. It says nothing about what it holds;
   `map_id` says it is the key of a row in `public.atlas`.

   NOT A FOREIGN KEY, AND IT CANNOT BE ONE. `public.atlas` is keyed by
   `(map_id, stop_order)`, so the id alone is not unique and has nothing for a
   key to reference -- the same trade `stops.city` and `waypoints.city` already
   make. The room only offers maps that exist, which is where the guard lives.

   APPLY: supabase db query --linked --file mc/supabase/migrations/2026090503_the_map_column_is_map_id.sql
   ============================================================================ */

begin;

/* 1. THE RENAME. An index or a constraint keeps its OWN name through a column
      rename, so both are checked below rather than assumed -- `routes` once
      kept `paths_pkey` and `games_target_audience_idx` half-remembered its
      column for a day. */
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'games' and column_name = 'map')
  and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'games' and column_name = 'map_id')
  then
    execute 'alter table public.games rename column map to map_id';
  end if;
end $$;

/* 2. AND IT SAYS WHAT IT HOLDS. A column comment is the one place a reader who
      has never seen this file will look. */
comment on column public.games.map_id is
  'The map this game walks: public.atlas.map_id. Not a foreign key -- atlas is '
  'keyed by (map_id, stop_order), so the id alone is not unique. Written by the '
  'MAP bar in mc/games/. Renamed from `map` on 2026-09-05, which was text, '
  'empty on all 393 rows and read by nothing.';

commit;

/* ---- VERIFY -----------------------------------------------------------
   Run these and read the numbers rather than the absence of an error.

   select column_name, data_type
     from information_schema.columns
    where table_schema = 'public' and table_name = 'games'
      and column_name in ('map', 'map_id');
   -- expect exactly one row: map_id, text

   select count(*) as games,
          count(*) filter (where map_id is not null and map_id <> '') as with_a_map
     from public.games;
   -- expect 393 / 0 immediately after this file, and the second to grow as
   -- maps are attached in the room.

   -- AND NOTHING HALF-REMEMBERS THE OLD NAME:
   select indexname from pg_indexes
    where schemaname = 'public' and tablename = 'games' and indexdef ilike '%map%';
   select conname from pg_constraint
    where conrelid = 'public.games'::regclass and pg_get_constraintdef(oid) ilike '%map%';
   -- expect no rows from either.
   ---------------------------------------------------------------------- */
