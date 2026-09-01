-- 2026-08-31  a map has a city, and a map can exist before its first stop
-- ---------------------------------------------------------------------------
-- TGB ATLAS GAINS AN `ADD MAP` DIALOG that asks for a NAME and a CITY and
-- generates the key. Two things had to move for that to be possible.
--
-- 1. `stop_id` WAS NOT NULL, so a map could not exist until it had a stop --
--    and the dialog asks for neither. A map is now a row with a null `stop_id`
--    until the first real stop lands on it.
--      THE ALTERNATIVE WAS A HEADER TABLE, `map_headers(map_id pk, name, city)`
--      with these rows as membership. It is the tidier shape and it was not
--      taken: it puts `map_name` in two places, which is the drift this project
--      has removed from the club list, the destinations and the trivia type.
--      One table, one name, one city.
--
-- 2. THE CITY IS THE MAP'S OWN AND IS NOT DERIVED FROM ITS STOPS. Measured
--    before deciding: `new-orleans-murder-map` holds stops in **Cincinnati and
--    New Orleans**, so a map's stops are not all in one place. The city says
--    where the WALK is; a stop says where that stop is.
--
-- THE KEY IS `slug(city) + '-' + slug(name)`, which is the shape the one
-- existing row already has: New Orleans + Murder Map is `new-orleans-murder-map`
-- exactly. It is generated in the room rather than by the database, because the
-- room is the only writer and a generated column here would have to parse a
-- free-text city.
--
-- APPLY BY HAND. Safe with `supabase db query --linked --file`.

begin;

alter table public.maps alter column stop_id drop not null;
comment on column public.maps.stop_id is
  'The stop, or NULL for a map that exists and has no stops yet. A null row is '
  'the map itself: TGB Atlas creates one when a map is added, and it is deleted '
  'the moment a real stop lands on that map.';

alter table public.maps add column if not exists city text;
comment on column public.maps.city is
  'Where the walk is. NOT derived from the stops -- a map''s stops are not all '
  'in one place. Part of the key: map_id is slug(city) + ''-'' + slug(map_name).';

-- A ROW THAT IS A STOP STILL HAS TO BE A STOP. Without this, `stop_number`
-- would go on carrying a position for a row that names no stop, and two null
-- rows on one map would be two "the map exists" claims that could disagree.
alter table public.maps
  add constraint maps_placeholder_is_numbered
  check (stop_id is not null or stop_number = 0);

-- THE PLACEHOLDER IS ALWAYS STOP 0, so it sorts above every real stop and can
-- never collide with one: `maps_number_positive` already requires >= 1 of a real
-- row, so 0 is a number no stop can hold.
alter table public.maps drop constraint maps_number_positive;
alter table public.maps
  add constraint maps_number_positive
  check ((stop_id is not null and stop_number >= 1) or (stop_id is null and stop_number = 0));

-- the one map on file walks New Orleans
update public.maps set city = 'New Orleans, LA' where map_id = 'new-orleans-murder-map';

commit;

-- Verify -------------------------------------------------------------------
--   -- 1. a map can now exist with no stop, and only at number 0
--   insert into public.maps (map_id, map_name, city, stop_id, stop_number)
--   values ('probe-map', 'Probe Map', 'Denver, CO', null, 0);          -- ok
--   insert into public.maps (map_id, map_name, city, stop_id, stop_number)
--   values ('probe-map2', 'Probe Two', 'Denver, CO', null, 3);         -- REFUSED
--
--   -- 2. a real stop still needs a real number
--   insert into public.maps (map_id, map_name, city, stop_id, stop_number)
--   values ('probe-map', 'Probe Map', 4, 0);                            -- REFUSED
--
--   -- 3. and the name still propagates
--   select map_id, map_name, city, stop_number, stop_id from public.maps order by map_id, stop_number;
--
--   delete from public.maps where map_id like 'probe%';
