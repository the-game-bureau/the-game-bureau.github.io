-- A STOP IS A WAYPOINT AND A CHALLENGE. THE CITY GOES.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- `public.stops` held `city`, `waypoint_id` and `challenge_id`. The city was a
-- SECOND COPY of a fact the waypoint already carries -- a waypoint is in
-- exactly one place -- so the table could disagree with itself, and it did:
--
--     id  stops.city         the waypoint's own city
--     1   Baton Rouge, LA    New York, NY        <- DISAGREED
--     2   Cincinnati, OH     Cincinnati, OH
--     3   Cincinnati, OH     Cincinnati, OH
--     4   New Orleans, LA    New Orleans, LA
--     6   Boston, MA         Boston, MA
--     7   New Orleans, LA    New Orleans, LA
--
-- THAT ROW IS THE ARGUMENT FOR THE CHANGE AND THE ONE THING IT DISCARDS. Stop 1
-- claimed Baton Rouge for a waypoint standing in New York; one of the two was
-- wrong and only the waypoint is the physical place, so the claim goes. The six
-- values are written out above because the column does not survive this file.
--
-- NOTHING IN THE DATABASE READS IT, checked rather than assumed. `game_stops`
-- is a view over `stops_retired` and selects `s.city_slug` from THAT table; no
-- function names `public.stops` at all -- every match for the word is
-- `route_stops`, a JSON key, or prose. The only reader is the Stop Builder.
--
-- THE UNIQUE IS THE SAME RULE WITH THE REDUNDANT HALF REMOVED. `(city,
-- waypoint_id)` was exactly `waypoint_id` whenever the city was right, because
-- a waypoint has one city -- so ONE PLACE IS ONE STOP is preserved rather than
-- loosened. `(waypoint_id, challenge_id)` would let one waypoint be several
-- stops, which is a different product decision and was not asked for.
--
-- A NULL WAYPOINT IS STILL ALLOWED AND STILL NOT A COLLISION. 2026083117 made
-- the column nullable so a stop survives its waypoint, and Postgres reads two
-- NULLs in a unique index as distinct -- the property `(city, waypoint_id)`
-- already relied on.

begin;

-- 1. the rule, restated on the column that actually carries it
alter table public.stops drop constraint stops_one_per_place;
alter table public.stops add constraint stops_one_per_waypoint unique (waypoint_id);

-- 2. the column, and everything that existed only for it
alter table public.stops drop constraint stops_city_not_blank;
drop index if exists public.stops_city_idx;
alter table public.stops drop column city;

comment on table public.stops is
  'A stop is a waypoint and a challenge. The city is the WAYPOINT''s and is not '
  'stored here: 2026090302 dropped it after stop 1 was found claiming Baton '
  'Rouge for a New York waypoint. One waypoint is one stop.';

-- 3. VERIFY. An empty payload proves nothing, so this reads the real rows.
do $$
declare
  v_cols int;
  v_rows int;
  v_dupe int;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'stops';
  -- THREE COLUMNS AND NO MORE, which is the ask stated as an assertion:
  -- waypoint_id, challenge_id and the row's own id.
  if v_cols <> 3 then
    raise exception 'expected 3 columns (id, waypoint_id, challenge_id), got %', v_cols;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'stops' and column_name = 'city') then
    raise exception 'city is still there';
  end if;

  select count(*) into v_rows from public.stops;
  if v_rows <> 6 then
    raise exception 'expected 6 stops, got %', v_rows;
  end if;

  -- the rule still holds on the column that now carries it
  select count(*) into v_dupe from (
    select waypoint_id from public.stops
     where waypoint_id is not null
     group by waypoint_id having count(*) > 1) d;
  if v_dupe <> 0 then
    raise exception '% waypoints are a stop more than once', v_dupe;
  end if;

  raise notice 'stops: % columns, % rows, 0 repeated waypoints', v_cols, v_rows;
end $$;

commit;

-- Run afterwards, because a create that returns without error proves nothing
-- about a constraint:
--   insert into public.stops (waypoint_id, challenge_id)
--   values ((select waypoint_id from public.stops limit 1), null);
--   -- expect 23505 stops_one_per_waypoint
