-- TWO STATES. `archived` is both of them.
--
-- SHELVED is archived = true, LIVE is archived = false, and there is nothing
-- else. That column is the only status any public surface has ever read:
-- /soundtracks/ filters on it and the site footer counts it. So the states now
-- mean exactly what the site does with them, and nothing can drift out of step
-- because there is only one thing left to keep in step.
--
-- WHAT WENT. REVIEW was a third state derived from two timestamps being null,
-- and it distinguished "nobody has looked at this yet" from "a human said no".
-- That distinction is now TIME rather than state: everything arrives shelved,
-- so shelved AND recently added is the queue, which the Tape Room shows as its
-- NEW filter (72 hours). A time-based queue empties itself; the state-based one
-- had to be emptied by hand, and 246 candidates had accumulated in it.
--
-- ============================================================================
-- certified_at AND rejected_at ARE NOT DROPPED, DELIBERATELY.
--
-- Nothing reads or writes them after this migration. They are retired in place,
-- the same way public.maps, gift_shop_cities and waypoints.tour_id were, and
-- for the same reason: a deploy that has not caught up still works, and the
-- data is still there.
--
-- Dropping rejected_at is the ONE IRREVERSIBLE ACT available here. It is the
-- only record of which tracks a human personally turned down, as against the
-- ones the routine filed and nobody ever reached. Once both are "shelved" that
-- is unrecoverable. Leaving two unread nullable columns costs nothing.
-- ============================================================================

begin;

-- --------------------------------------------------- the audit speaks again --
-- tgb_soundtrack_issues_skip_shelved silently dropped any finding whose track
-- had rejected_at set, on the reasoning that shelving is the strongest fix
-- available so there is nothing left to ask.
--
-- THAT REASONING INVERTS UNDER TWO STATES. Everything the routine files is
-- shelved, so the trigger would have silenced the audit across the entire
-- catalogue: the tracks most in need of a second opinion are precisely the ones
-- nobody has read yet. A finding is a STATEMENT and a human decides what to do
-- with it, which is the whole reason it can now be reported at all.
drop trigger if exists tgb_soundtrack_issues_skip_shelved on public.soundtrack_issues;
drop function if exists public.tgb_soundtrack_issues_skip_shelved();

-- The partial index that made "both stamps null" a fast lookup has no reader
-- left; the states are a boolean now.
drop index if exists public.soundtrack_songs_review_idx;

comment on column public.soundtrack_songs.archived is
  'THE status. true = SHELVED (off /soundtracks/, and a do-not-rescrape tombstone the unique index enforces), false = LIVE. Everything written by tgb_pull_soundtrack_songs starts true; only a human sets it false.';

comment on column public.soundtrack_songs.certified_at is
  'RETIRED 2026-08-16, unread and unwritten. Kept as the record of which tracks were approved under the three-state scheme. Do not read this: archived is the status.';

comment on column public.soundtrack_songs.rejected_at is
  'RETIRED 2026-08-16, unread and unwritten. Kept because it is the only record of which tracks a HUMAN turned down, as against the ones the routine filed and nobody reached. Do not read this: archived is the status.';

commit;

-- ============================================================================
-- The pull RPC stops writing the two stamps: see 2026081604, which must be run
-- with this file. Its old body sets certified_at and rejected_at explicitly on
-- every insert, which would keep writing to retired columns forever.
