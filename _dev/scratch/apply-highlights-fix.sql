-- FIX-UP: promote the existing game_results TABLE to highlights (no dummy data).
--
-- State this handles (confirmed): public.game_results exists as a TABLE with
-- demo rows (migration 2026070101 ran); the rename migration 2026070201 did not;
-- public.highlights does NOT exist (the earlier clean-script attempt ran in one
-- transaction and rolled back fully on error, leaving nothing behind).
--
-- End-state:
--   * public.highlights   = the real data table (renamed from game_results)
--   * public.game_results = a compatibility view over it
--   * demo/seed rows removed
--
-- Guards use catalog lookups (no ::regclass casts, no queries against a table
-- that may not exist yet), so plpgsql can plan every block safely. Transactional
-- and idempotent.

begin;

-- 1. Rename the game_results base table to highlights.
--    Fires only when highlights is absent AND game_results is a real table.
do $$
begin
  if to_regclass('public.highlights') is null
     and exists (
       select 1 from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'game_results' and c.relkind = 'r'
     ) then
    alter table public.game_results rename to highlights;
  end if;
end $$;

-- 2. Remove the seeded demo scorelines (highlights exists after step 1).
delete from public.highlights where instanceid like 'demo-%';

-- 3. (Re)create the compatibility view now that the game_results name is free.
create or replace view public.game_results
  with (security_invoker = true)
  as
  select gameid, instanceid, tgbteamname, tgbteamscore,
         opponentname, opponentscore, winnername, created_at
  from public.highlights;

grant select on public.game_results to anon, authenticated;
grant insert, update, delete on public.game_results to authenticated;

comment on view public.game_results is
  'Compatibility view for clients deployed before public.game_results was renamed to public.highlights.';

commit;

notify pgrst, 'reload schema';

-- Verify (expect highlights='r', game_results='v', and 0 demo rows):
--   select relname, relkind from pg_class
--   where relnamespace = 'public'::regnamespace and relname in ('highlights','game_results');
--   select count(*) from public.highlights where instanceid like 'demo-%';
