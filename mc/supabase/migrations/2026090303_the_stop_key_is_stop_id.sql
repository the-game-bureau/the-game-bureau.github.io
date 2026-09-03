-- THE STOP'S OWN KEY IS `stop_id`.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- `public.stops` is three ids and one of them was called `id`, so the table
-- read `id, waypoint_id, challenge_id` -- two columns saying what they point at
-- and one saying nothing. `stop_id` is what the other two are named for.
--
-- AND `public.maps` ALREADY CALLED IT THAT. `maps_stop_id_fkey` is
-- `FOREIGN KEY (stop_id) REFERENCES stops(id)`, so the two halves of one key
-- had two names; they share one now.
--
-- A FOREIGN KEY FOLLOWS THE COLUMN BY attnum, NOT BY NAME, so the constraint
-- carries the rename by itself -- but a statement that returns without error
-- says nothing about what it left behind, so the verify block reads it back.
--
-- BOTH CONSTRAINT NAMES STAY CORRECT, which is not automatic and is why they
-- are checked rather than assumed. An index or a constraint keeps its OWN name
-- through a column rename -- `games_target_audience_idx` half-remembered its
-- old column on 2026-09-02 for exactly this reason. Here `stops_pkey` is named
-- for the TABLE and `maps_stop_id_fkey` for the REFERENCING column, so neither
-- names the column that is moving.
--
-- THE IDENTITY FOLLOWS TOO. `id` is `generated ... as identity`, so the
-- sequence is attached to the column rather than to its name; the verify block
-- inserts a row and reads the assigned key back, then rolls it away.

begin;

alter table public.stops rename column id to stop_id;

comment on column public.stops.stop_id is
  'The stop''s own key. Generated -- never supplied by a writer. public.maps '
  'references it as maps.stop_id, which is the name it now shares.';

-- VERIFY. A rename that raises nothing proves nothing about the key that
-- pointed at it, so this asks the catalogue and then makes the column do its
-- job.
do $$
declare
  v_cols text;
  v_fk   text;
  v_id   bigint;
begin
  select string_agg(column_name, ',' order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stops';
  if v_cols <> 'challenge_id,stop_id,waypoint_id' then
    raise exception 'expected challenge_id,stop_id,waypoint_id -- got %', v_cols;
  end if;

  -- the incoming key followed the column
  select pg_get_constraintdef(oid) into v_fk
    from pg_constraint where conname = 'maps_stop_id_fkey';
  if v_fk is null or position('REFERENCES stops(stop_id)' in v_fk) = 0 then
    raise exception 'maps_stop_id_fkey does not point at stops(stop_id): %', coalesce(v_fk, '(gone)');
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'stops_pkey' and conrelid = 'public.stops'::regclass) then
    raise exception 'stops_pkey is gone';
  end if;

  -- THE IDENTITY STILL ASSIGNS. Only a write says so.
  insert into public.stops (waypoint_id, challenge_id)
  select wpid, null from public.waypoints
   where wpid not in (select waypoint_id from public.stops where waypoint_id is not null)
   limit 1
  returning stop_id into v_id;
  if v_id is null then
    raise exception 'the identity did not assign a stop_id';
  end if;
  delete from public.stops where stop_id = v_id;

  raise notice 'stops: %, maps_stop_id_fkey follows, identity assigned % and was removed', v_cols, v_id;
end $$;

commit;
