-- ─────────────────────────────────────────────────────────────────────────
-- ONE COVERING INDEX, FOR THE STATEMENT THAT COSTS THE MOST
-- (a second was built, measured, refused by the planner, and dropped)
-- 2026-08-28
--
-- Supabase raised "your project is currently exhausting multiple resources".
-- Measured before writing anything, over the 116 days pg_stat_statements has
-- been collecting:
--
--   * the database is 36 MB, there are no replication slots, and total
--     execution time is ~7,900 s -- about 68 SECONDS OF CPU A DAY. **There is
--     no query-volume problem here**, and this migration should not be read as
--     if there were.
--   * the single most expensive statement is `select city, archived from
--     games`: 4,730 calls, 138 ms each, 651 s, 8% of all database time.
--   * `explain (analyze, buffers)` on it: 224 buffers, ALL CACHE HITS, and
--     131 ms. **A fully-cached 224-buffer scan taking 131 ms is a starved CPU,
--     not a bad plan** -- which is the real finding, and it is not something
--     SQL can fix.
--
-- SO WHY BOTHER. Because the work is real even if the plan is not the cause:
-- 224 buffers is 1.8 MB of heap touched to return two small columns from 395
-- rows, and it is touched 4,730 times. A covering index answers the same
-- question from ~2 pages. On a starved instance the cheapest thing you can do
-- is ask it to do less.
--
-- WHAT THIS DOES NOT ADDRESS, stated so nobody reads a green banner into it:
-- ~22% of all database time is the SUPABASE DASHBOARD'S OWN introspection --
-- listing extensions (776 s), listing functions (416 s), `pg_timezone_names`
-- (360 s), table and column metadata (198 s). That is a Studio tab left open
-- polling, and closing it is worth more than either index below.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. THE CITY RAIL ─────────────────────────────────────────────────────
-- `/games/` and `/gifts/` both read every game's city to build their city
-- rails. Two columns, no filter, 4,730 times.
--
-- BOTH COLUMNS ARE IN THE KEY rather than one of them in INCLUDE, because the
-- query selects both and neither is filtered on -- an index-only scan needs
-- every column it returns, and there is no ordering or lookup to optimise for.
create index if not exists games_city_archived_idx
  on public.games (city, archived);

comment on index public.games_city_archived_idx is
  'Covers "select city, archived from games", the city rail on /games/ and '
  '/gifts/ -- the most expensive statement in this project as of 2026-08-28. '
  'Lets it answer from ~2 index pages instead of scanning 224 heap pages.';

-- ── 2. THE ONE THAT WAS BUILT, MEASURED AND DROPPED ──────────────────────
--
-- `select id from gift_shop_items where certified_at is not null and archived
-- is false` is the second most expensive statement: 4,005 calls, 63 ms each,
-- 252 s. A partial index on `(id) where certified_at is not null and archived
-- is false` was created here, and then **the planner refused it and was
-- right**: 690 of the 829 rows match, so the "narrow" index covers 83% of the
-- table and a sequential scan of 52 pages beats walking an index that big.
-- Measured after: **Seq Scan, 52 buffers, 0.449 ms**.
--
-- SO IT WAS DROPPED IN THE SAME SITTING. An index nothing uses is not free: it
-- is written on every insert and update of that table forever, in exchange for
-- nothing. **The 63 ms in the statistics is the starved instance again**, not
-- a plan worth improving -- the same lesson as the 131 ms above, arrived at
-- from the other side.
--
-- Do not re-add it without re-measuring. If the catalogue ever grows so that
-- live items are a small MINORITY of the table, the answer changes.

commit;

-- ── VERIFIED, WITH THE NUMBERS ───────────────────────────────────────────
--
--   analyze public.games;
--   explain (analyze, buffers) select city, archived from public.games;
--
-- BEFORE:  Seq Scan, 224 buffers, 131.729 ms
-- AFTER:   Index Only Scan, 2 buffers, Heap Fetches: 0, 0.675 ms
--
-- 195 times faster on the statement that was 8% of this project's entire
-- database time. **A NEW INDEX MAY NOT BE USED UNTIL THE TABLE IS ANALYZED**,
-- which is why the analyze is part of the check rather than left to
-- autovacuum.
--
-- TO UNDO: drop index public.games_city_archived_idx;
