-- 12:01 AM MEANS THE KICKOFF HAS NOT BEEN ANNOUNCED.
--
-- The ESPN importer reads a fixture's start from a UTC timestamp and converts it
-- to venue-local time. On a fixture whose kickoff has NOT been published, ESPN
-- still sends a placeholder timestamp and says so separately, in `shortDetail`,
-- which the importer copies into the description as "ESPN listing: TBD."
--
-- It then zoned the placeholder anyway. So 43 rows imported on 2026-08-24 hold a
-- real-looking time that means nothing -- 26 at 00:00, 11 at 23:00, 5 at 21:00
-- and 1 at 22:00, which is one placeholder seen through four timezones. That is
-- the worst shape this failure can take: the `no-start-time` rule cannot see them, because
-- the field IS populated. A blank would have been better than a wrong one.
--
-- 00:01 is the listings convention for "to be announced". It sorts to the top of
-- its own day rather than sitting among the evening games, and it is one minute
-- off a midnight that might be genuine.
--
-- THE COST, PLAINLY: 00:01 is a real time, so the field alone cannot be told
-- from a genuine 12:01 AM event. What stops that being lost is that the TBD
-- stays in the description and the `tbd` rule in mc/events/index.html keeps the
-- row in review until somebody replaces it with the real kickoff. Do not "tidy"
-- the description afterwards: it is the only evidence of what 00:01 means.
--
-- The page writes 00:01 itself for anything imported from now on, so this is a
-- one-off backfill of what is already filed rather than the mechanism.
--
-- APPLY BY HAND in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

begin;

-- MATCHED ON THE DESCRIPTION, NOT ON THE TIME. The times are 21:00 and 00:00,
-- both of which are perfectly ordinary values that real fixtures also hold, so
-- matching on them would rewrite genuine kickoffs. The TBD is the only thing
-- that actually distinguishes these rows.
--
-- WORD BOUNDARY, never a bare substring: `~*` with \m and \M, so a description
-- mentioning Tbilisi is untouched. Same rule the page's TBD_RE follows.
update public.anchor_events
   set start_time = time '00:01'
 where description ~* '\m(tbd|tba|to be determined|to be announced)\M'
   and start_time is distinct from time '00:01';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run these AFTER the commit. An empty payload proves nothing; these ask the
-- table to show its work.
--
-- 1. Every TBD row now reads 00:01, and nothing else does by accident:
--
--    select start_time, count(*)
--      from public.anchor_events
--     where description ~* '\m(tbd|tba|to be determined|to be announced)\M'
--     group by 1 order by 1;
--    -- expect exactly one row: 00:01:00 | 43
--
-- 2. No row holding 00:01 is WITHOUT a TBD, which would mean the marker had
--    been applied to something it does not describe:
--
--    select id, title, description
--      from public.anchor_events
--     where start_time = time '00:01'
--       and description !~* '\m(tbd|tba|to be determined|to be announced)\M';
--    -- expect 0 rows
--
-- 3. Nothing outside the TBD set moved. All 603 rows currently hold a
--    start_time and none is 00:01, so afterwards 603 - 43 = 560 must remain:
--
--    select count(*) from public.anchor_events
--     where start_time is not null and start_time <> time '00:01';
--    -- expect 560
