-- A WAYPOINT ARRIVES SHELVED.
--
-- public.waypoints.archived already holds exactly the two states this needs -
-- boolean, NOT NULL, no third value - so nothing is added here. What changes is
-- which one a new row starts in: the default was false, so anything inserted
-- without naming the column went straight into the live library and onto the
-- Path Builder's shelf beside places a human had actually approved.
--
-- SHELVED is `true`, LIVE is `false`. The same two states the Tape Room settled
-- on for a soundtrack, and for the same reason: `archived` is the flag every
-- existing reader already filters on, so making it the status meant no reader
-- had to change.
--
-- WHAT THIS TOUCHES: the SQL import helpers, which insert a waypoint without
-- naming `archived`. Their rows now land shelved and wait for a human in the
-- Waypoint Finder, which is the whole point.
-- The Path Builder and the Finder both send the column explicitly, so their own
-- writes are unaffected either way.
--
-- EXISTING ROWS ARE NOT TOUCHED. A default applies to future inserts only, and
-- re-shelving 300 places that have been live for weeks - several of them already
-- on paths - would empty the catalogue to make a point about consistency.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

alter table public.waypoints
  alter column archived set default true;

comment on column public.waypoints.archived is
  'The waypoint''s only status. true = SHELVED (off the live library, and a do-not-rescrape tombstone the importers match against), false = LIVE. Arrivals default to shelved since 2026-08-18; a human takes them live in the Waypoint Finder.';
