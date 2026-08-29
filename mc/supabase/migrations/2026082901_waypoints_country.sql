-- 2026-08-29  waypoints.country
--
-- APPLY BY HAND, in the Supabase SQL editor. Remote migration history in this
-- project has drifted and the CLI refuses `db push`, so nothing in this folder
-- runs itself.
--
-- WHY. The Waypoints room was stripped down on 2026-08-29 and no longer joins
-- public.cities for anything: a waypoint now CARRIES its own place. It already
-- had `city` and `state` and there was nowhere to put the third part, so a
-- non-US waypoint could say Aachen and could not say Germany.
--
-- IT IS PLAIN TEXT AND IT IS NOT A FOREIGN KEY, deliberately. The whole point
-- of the strip is that this table stops depending on a catalogue: what is typed
-- is what is stored. That is the same trade `events.venue_city` made on
-- 2026-08-28, and it costs the same thing -- nothing stops two spellings of one
-- country, and no screen will tell you.
--
-- NULLABLE, WITH NO BACKFILL AND NO DEFAULT. 516 rows predate the column and
-- most of them are American, but "most" is not a fact about any given row, and
-- writing USA across the table would be inventing 516 answers to make a column
-- look finished. A blank means nobody has said yet, which is true.
--
-- THE PAGE PROBES FOR IT AND DEGRADES. Naming a column PostgREST does not have
-- 400s the whole request, so the room asks a loaded row whether `country` is
-- there and simply hides the field when it is not -- the same guard `source_url`
-- and `lat`/`lon` already carry. So the page works before this file is run and
-- gains the field the moment it is.

alter table public.waypoints
  add column if not exists country text;

comment on column public.waypoints.country is
  'Free text, the country this waypoint is in. Not a foreign key: the Waypoints '
  'room stopped joining public.cities on 2026-08-29 and a waypoint carries its '
  'own place. Null means nobody has said, not USA.';

-- Verify -------------------------------------------------------------------
-- Expect: one row, data_type text, is_nullable YES.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'waypoints'
--      and column_name = 'country';
--
-- And the read the page makes, which must answer 200 rather than 42703:
--
--   select wpid, name, city, state, country from public.waypoints limit 1;
