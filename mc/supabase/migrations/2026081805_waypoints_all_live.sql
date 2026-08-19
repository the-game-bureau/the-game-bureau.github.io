-- EVERY WAYPOINT IS LIVE. public.waypoints.archived stops being a state.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHAT THIS UNDOES. 2026081803 flipped this column's default to `true` so that
-- everything a routine found arrived SHELVED and waited for a human to approve
-- it in a review room. That room (mc/waypoint-finder.html) lasted a day and was
-- deleted, and with it the place where the approving happened. What was left was
-- a state nothing could clear: places arriving invisible to the room that builds
-- paths, with no screen that turned them on.
--
-- The call is that the library holds every place it knows about, all of them are
-- eligible for a path, and a place that turns out to be wrong is EDITED or
-- DELETED rather than parked in a second list.
--
-- WHAT IS LOST, and it is worth being honest about it rather than discovering it
-- later. `archived` was doing TWO jobs, and only one of them was the review
-- queue:
--
--   1. the review state, which is what this removes;
--   2. a DO-NOT-RESCRAPE TOMBSTONE. An importer matches a place by name and
--      skips one it already holds, so a row that stayed archived kept the next
--      sweep from filing it again. Deleting a place has always invited it
--      straight back; shelving was the way to say "we looked at this and it is
--      not wanted".
--
-- With every row live there is no way left to say that. Nothing breaks today,
-- because the importers match on name + address and will still find the row, so
-- an unwanted place is simply an unwanted place that stays in the library. If a
-- "we decided against this" mark is ever wanted again, it needs its OWN column
-- with its own name (`rejected_at`, say) rather than borrowing this one back:
-- one column doing two jobs is what made the last two months of this confusing.
--
-- THE COLUMN IS NOT DROPPED. Dropping is the one irreversible act available, the
-- same reasoning that left public.maps, waypoints.tour_id and the soundtrack
-- timestamp columns in place. It stays NOT NULL with a false default so nothing
-- that still writes it can write a true.

alter table public.waypoints alter column archived set default false;

update public.waypoints set archived = false where archived is distinct from false;

comment on column public.waypoints.archived is
  'RETIRED 2026-08-18. Every waypoint is live: the library holds all of them and every one is eligible for a path. Kept at false for every row and defaulted to false; nothing reads it as a state. Do not reuse this column for a new meaning - give the new meaning its own column.';
