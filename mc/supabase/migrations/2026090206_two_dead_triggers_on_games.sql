-- 2026090206  two triggers on public.games read columns that are gone
--
-- EVERY WRITE TO public.games WAS FAILING, and not only the one that found it.
-- `tgb_games_sync_status` fires on EVERY insert and update, and its first
-- comparison is `new.archived is distinct from old.archived` -- a column that
-- went when the table was cut from 71 columns to 31. So:
--
--     ERROR: 42703 record "new" has no field "archived"
--     CONTEXT: PL/pgSQL function tgb_games_sync_status() line 15 at IF
--
-- A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT RUNTIME, so dropping a
-- column out from under a trigger raises nothing at drop time and waits for a
-- caller. **This project has now been bitten by that property five times** --
-- tgb_resolve_soundtrack_finding after a table rename, tgb_pull_walking_tours
-- after waypoints.archived was dropped, tgb_pull_concert_tours after the
-- anchor_events rename, infer_game_team_keys after teams.tgbid, and this.
-- The standing rule is the cure and it was not followed: when you drop a
-- column, sweep pg_proc for its name BEFORE you run the drop.
--
--   select p.proname from pg_proc p
--    where p.prokind = 'f' and p.pronamespace = 'public'::regnamespace
--      and strpos(pg_get_functiondef(p.oid), 'new.' || '<column>') > 0;
--
-- THE TRIGGERS GO; THE FUNCTIONS STAY. Detaching is what unblocks writing, and
-- a dropped function cannot be read later to see how the thing used to work.
-- Both bodies are commented below so nobody re-attaches one blindly.

begin;

-- 1. tgb_games_sync_status -------------------------------------------------
-- It existed to keep `status` and `archived` in step in BOTH directions: a
-- caller that knew about status set it and archived followed; the Archive
-- button, which did not, set archived and the status followed.
--   THERE IS NOTHING LEFT TO SYNC. `archived` is gone and `status` is the only
-- flag, so every branch of the function touches a column that does not exist.
-- Nothing is lost on INSERT either: status is NOT NULL with a default of
-- 'building', which is what the function used to supply.
drop trigger if exists tgb_games_sync_status_trg on public.games;

comment on function public.tgb_games_sync_status() is
  'DETACHED 2026-09-02. Kept `status` and `archived` in step; games.archived '
  'no longer exists, so every branch reads a missing column and the trigger '
  'failed on every write. Do not re-attach unless archived comes back.';

-- 2. tgb_games_pull_guide --------------------------------------------------
-- It copied a guide's name, bio and background onto the game whenever
-- `guide_id` changed, so the engines could read them off public.games with
-- select=*. All three of those columns are gone.
--   IT FIRED LESS OFTEN, which is why the other one was found first: it returns
-- early unless guide_id actually changes. So it broke a smaller set of writes,
-- silently, and would have surfaced the first time somebody changed a guide.
--   THIS ONE IS WORTH RE-ATTACHING ONE DAY. Both engines still read
-- games.guide_* at play time, so if those columns come back the pull comes back
-- with them -- which is why the function is kept rather than dropped.
drop trigger if exists games_pull_guide on public.games;

comment on function public.tgb_games_pull_guide() is
  'DETACHED 2026-09-02. Pushed guides.name/bio/background onto games.guide_* '
  'when guide_id changed; all three game columns are gone. Re-attach only when '
  'they return -- the engines still read them at play time.';

commit;

-- Verify. A create-or-drop that returns without error proves nothing here;
-- only a WRITE does, because that is the only thing that runs a trigger.
--
--   -- what is left on the table, and none of it names a dropped column
--   select t.tgname, p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--    where t.tgrelid = 'public.games'::regclass and not t.tgisinternal;
--   -- expect tgb_sync_game_price_cents_trigger and touch_games, and no others
--
--   -- the write that was failing
--   begin;
--     update public.games set updated_at = now() where id = 'oswald';  -- 1 row
--   rollback;
