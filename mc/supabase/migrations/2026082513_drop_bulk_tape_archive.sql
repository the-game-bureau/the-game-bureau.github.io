-- `tgb_set_all_tapes_archived` IS UNREACHABLE AND GOES.
--
-- The Shelved / Live switch in the tape header was the only caller. It is a
-- FILTER now, not a status changer: it used to rewrite every tape it
-- summarised, which put the most destructive act in the room in its quietest
-- control, one press away from a confirm dialog nobody reads.
--
-- Dropped rather than left, for the reason 2026082512 dropped five others: a
-- function nothing calls is what makes somebody wire it to something later
-- without reading what it does. Putting every tape the same way is still one
-- statement in the SQL editor if it is ever genuinely wanted.
--
-- `tgb_set_tape_archived` STAYS and is untouched. The per-tape switch on each
-- row is still a status changer, and that one carries the shelve cascade.
--
-- APPLIED 2026-08-25.

drop function if exists public.tgb_set_all_tapes_archived(boolean);

-- ── Verify ───────────────────────────────────────────────────────────────────
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname like 'tgb_set%';
--     -- expect only tgb_set_tape_archived
