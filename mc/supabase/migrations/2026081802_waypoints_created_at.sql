-- WHEN A WAYPOINT ARRIVED, so a room can show the new ones.
--
-- public.waypoints has no timestamp at all: wpid ascends, but "the last 30
-- rows" is not the same question as "what turned up this week" and stops being
-- a useful proxy the moment somebody pastes an import of eighty.
--
-- NULLABLE, AND EXISTING ROWS STAY NULL. Backfilling now() would declare 280
-- places new on the morning this runs, which is the one thing the column exists
-- to answer correctly; backfilling a made-up past date would put a number in a
-- record that is meant to be a fact. Null means "arrived before we started
-- counting", the same way a null lat/lon means "not located yet" rather than
-- "has no location". The Waypoint Finder reads it that way and treats a null as
-- old.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

alter table public.waypoints
  add column if not exists created_at timestamptz default now();

comment on column public.waypoints.created_at is
  'When the row was inserted. NULL on every row that predates 2026-08-18, which the Waypoint Finder reads as "not new" rather than as a missing value to guess at.';

-- The Finder asks for recent rows and nothing else asks for this column, so the
-- index is ordered the way that one query reads it.
create index if not exists waypoints_created_at_idx
  on public.waypoints (created_at desc nulls last);
