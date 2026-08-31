-- 2026-08-31  A STOP IS THREE FIELDS AND NOTHING ELSE.
--
-- Asked for outright: the stops table is the waypoint id, the challenge id and
-- the city name. So `id`, `created_at` and `updated_at` go, and the pair that
-- was already unique becomes the primary key.
--
-- ALTERED IN PLACE, NOT REBUILT. `create table as` would have been shorter and
-- would have thrown away the two rows already filed, which are real: Baton
-- Rouge / 57 Wall Street and Cincinnati / Arnold's Bar and Grill. Both survive.
--
-- `(city, waypoint_id)` IS THE KEY, AND IT WAS ALREADY THE RULE. It has been a
-- unique index since the table was built, for the reason written there: the
-- same waypoint listed twice in one city with two challenges is two stops in
-- one doorway, and nothing downstream could choose between them. Promoting it
-- to the primary key changes no behaviour; it states the same fact once instead
-- of twice.
--
-- SO THE ROOM DELETES BY (city, waypoint_id), never by an id. There is no id to
-- delete by, which is the point of the shape.
--
-- THE TOUCH TRIGGER GOES WITH `updated_at`. Dropping the column alone would
-- leave a trigger writing a field that is not there, and NOTHING WOULD SAY SO
-- until the next update raised at run time -- the same shape of fault as a
-- SECURITY DEFINER function still inserting a dropped column, which this
-- project has already paid for twice.
--
-- WHAT IS GIVEN UP, plainly: nothing records WHEN a stop was made. If that is
-- ever wanted it is a column, and it would make this four fields.

begin;

drop trigger if exists stops_touch_updated_at on public.stops;

alter table public.stops
  drop constraint stops_pkey,
  drop column id,
  drop column created_at,
  drop column updated_at;

-- The unique index becomes the key. Dropped first: a primary key builds its own
-- index, and leaving the old one would write the same pair twice on every
-- insert forever in exchange for nothing -- exactly the argument that made
-- 2026082803 drop an index it had just built.
drop index if exists public.stops_one_per_place_idx;

alter table public.stops
  add constraint stops_pkey primary key (city, waypoint_id);

comment on table public.stops is
  'A stop is a waypoint plus a challenge, in a city. Three fields, keyed by '
  '(city, waypoint_id): one place is one stop in a city. A null challenge_id '
  'means RANDOM, not undecided.';

commit;

-- Verify. Each is a call that makes the table do its job.
--
--   -- exactly three columns, and the two rows survived
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='stops' order by ordinal_position;
--   select count(*) from public.stops;                          -- expect 2
--
--   -- the pair is the key (expect 23505 on the second)
--   insert into public.stops (city, waypoint_id) values ('Cincinnati, OH', 167);
--
--   -- and a RANDOM stop is still an ordinary row
--   insert into public.stops (city, waypoint_id) values ('Chicago, IL', 1);
--   delete from public.stops where city = 'Chicago, IL';
