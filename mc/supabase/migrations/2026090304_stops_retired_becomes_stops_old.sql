-- `stops_retired` IS `stops_old`, AND `game_stops` HOLDS NOTHING.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- Asked as "combine stops_retired and game_stops into stops_old", and the two
-- are ALREADY ONE THING, which is worth stating rather than quietly acting on:
--
--     stops_retired   TABLE   41 rows      <- all the data there is
--     game_stops      VIEW    490 rows     <- a projection of those 41
--
-- `game_stops` is `stops_retired` joined to `games` through `cities`, so the 41
-- stops expand to 490 game-and-stop pairs. It stores nothing. So the only thing
-- to rename is the table, and the view follows it.
--
-- A VIEW FOLLOWS ITS TABLE BY OID, NOT BY NAME, so this needs no rebuild -- the
-- same property that carried `game_stops` through the `stops` rebuild on
-- 2026083103 and `anchor_events` through its rename. The verify block reads the
-- definition back rather than trusting it, because a statement that returns
-- without error says nothing about what it left behind.
--
-- THE VIEW KEEPS ITS OWN NAME AND HAS TO. **Both game builders read
-- `game_stops` by name** -- `MAPS_TABLE = 'game_stops'` in mc/games/ and
-- mc/builder/, both called from `loadWaypointStopsForCurrentGame` on every game
-- open -- and those are the editors for the paid product. Renaming it to
-- `stops_old` is impossible anyway (one name, one object) and DROPPING it means
-- teaching both builders to do the games/cities join themselves, which is a
-- change to the paid product and its own decision.
--
-- SO AFTER THIS THERE ARE TWO STOPS TABLES AND ONE VIEW:
--     stops       the live one, three ids, left alone as asked
--     stops_old   the 41 retired rows
--     game_stops  a projection of stops_old, kept because two editors read it

begin;

alter table public.stops_retired rename to stops_old;

comment on table public.stops_old is
  'The pre-2026083103 stops, keyed by city_slug with an ord and an end. Retired '
  'in place -- nothing writes it. `public.game_stops` is a view over it and is '
  'read by both game builders on every game open, so neither may be dropped '
  'without teaching those two the games/cities join themselves.';

-- VERIFY
do $$
declare
  v_kind  "char";
  v_rows  int;
  v_view  int;
  v_def   text;
begin
  select relkind into v_kind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'stops_old';
  if v_kind is null or v_kind <> 'r' then
    raise exception 'public.stops_old is not a table (got %)', coalesce(v_kind::text, '(missing)');
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname = 'stops_retired') then
    raise exception 'stops_retired is still there';
  end if;

  select count(*) into v_rows from public.stops_old;
  if v_rows <> 41 then
    raise exception 'expected 41 retired stops, got %', v_rows;
  end if;

  -- THE VIEW FOLLOWED, AND IT NOW READS THE NEW NAME. Both game builders read
  -- it on every game open, so this is the assertion that matters most here.
  v_def := pg_get_viewdef('public.game_stops'::regclass, true);
  if position('stops_old' in v_def) = 0 then
    raise exception 'game_stops does not read stops_old: %', v_def;
  end if;
  if position('stops_retired' in v_def) > 0 then
    raise exception 'game_stops still names stops_retired';
  end if;

  select count(*) into v_view from public.game_stops;
  if v_view <> 490 then
    raise exception 'game_stops projects % rows, expected 490', v_view;
  end if;

  -- and `public.stops` is untouched, which is the half that was asked for
  if (select count(*) from public.stops) <> 6 then
    raise exception 'public.stops moved';
  end if;

  raise notice 'stops_old: % rows; game_stops: % rows over stops_old; stops untouched', v_rows, v_view;
end $$;

commit;
