-- Drop public.waypoints.w3w — the what3words account was cancelled
-- ---------------------------------------------------------------------------
-- what3words was removed from the product on 2026-07-27: the account is gone,
-- so every convert-to-3wa / convert-to-coordinates / grid-section call now
-- fails. The column is dropped along with the UI that fed it.
--
-- This completes the waypoints slimming started the same day:
--   lat, lon  — dropped earlier (coordinates are derived at runtime by geocoding)
--   w3w       — dropped here
-- The remaining columns are: wpid, name, city, state, zip, address, description.
--
-- Code already updated to match (nothing selects or writes w3w any more):
--   mc/waypoints/index.html   field, map grid/hover/right-click, API helpers
--   mc/mapper.html            select list + row mapping
--   game/run/navigator.html   select list
--   mc/content.html           API client, grid overlay, lookup buttons
--   supabase/waypoints-prompt-import.sql  and its inlined copy in the page
--   mc/js/add-w3w.mjs         deleted
--
-- Idempotent: `if exists` makes a re-run a no-op. Rollback at the bottom.

alter table public.waypoints
  drop column if exists w3w;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect exactly: wpid, name, city, state, zip, address, description
--   select column_name
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'waypoints'
--    order by ordinal_position;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Re-adds the column, empty. The stored addresses are NOT recoverable from
-- here — restore them from a backup taken before this ran, and note the API
-- account has to be reinstated before anything can populate or resolve them.
--
-- alter table public.waypoints add column if not exists w3w text;
