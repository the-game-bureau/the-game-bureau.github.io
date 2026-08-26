-- SOUNDTRACK CLEANUP: one broken function, five dead ones, three dead tables.
--
-- ── THE BUG THIS FIXES ──────────────────────────────────────────────────────
--
-- `tgb_resolve_soundtrack_finding` still writes `public.soundtrack_songs` and
-- the old `public.soundtrack` tapes table, both of which the flatten renamed
-- away. **The hub's Clear button on a finding therefore raises 42P01 the moment
-- an admin presses it**, and nothing else on the site calls it, so nothing had
-- said so. A plpgsql body is stored as TEXT and resolved at runtime: a rename
-- breaks it silently until something calls it. That is the third time this
-- project has been bitten by exactly that.
--
-- It is rewritten from scratch here rather than patched, because the one-table
-- version is a single statement and the two-table version was two.
--
-- ── WHAT IS DROPPED, AND WHY IT IS SAFE ─────────────────────────────────────
--
-- Normally this project retires in place rather than dropping, because an
-- unread table costs nothing and a drop is the one irreversible act. **These
-- three are different: every row in them is already in `public.soundtrack`**,
-- verified rather than assumed before this file was written:
--
--   songs missing from soundtrack ............ 0
--   songs differing on title/artist/city ..... 0
--   tapes not represented .................... 0
--   soundtrack_issues vs soundtrack_findings .. 285 vs 285
--
-- So they are duplicates, not history, and a duplicate that nothing reads is
-- the thing that makes the next reader ask which copy is true.
--
-- ── WHAT IS DELIBERATELY KEPT ───────────────────────────────────────────────
--
-- **`certified_at` (1,026 rows) and `rejected_at` (44 rows) stay.** They are
-- unread: the state model is `archived` alone, two states. But `rejected_at` is
-- the only record of which tracks a HUMAN personally turned down, as against
-- the ones a routine filed and nobody reached, and that distinction cannot be
-- recovered once it is gone. Their comments say they are retired.
--
-- APPLIED 2026-08-25.

begin;

-- ── 1. The finding resolver, against the one table ──────────────────────────
create or replace function public.tgb_resolve_soundtrack_finding(p_id bigint, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_status text; v_hit boolean := false;
begin
  -- ADMINS ONLY. This is the one soundtrack function that is not insert-only,
  -- and the grant alone would let any authenticated Supabase user call it.
  if not public.is_photo_admin() then
    raise exception 'not authorized';
  end if;

  -- `fixed`, NEVER `dismissed`. A cleared finding becomes reportable again, and
  -- that recurrence is the only check a fix landed. `dismissed` silences it
  -- forever, which is a decision nobody can see afterwards.
  v_status := case when coalesce(p_status, 'fixed') = 'open' then 'open' else 'fixed' end;

  update public.soundtrack s
     set findings = (
       select coalesce(jsonb_agg(
         case when (e ->> 'id')::bigint = p_id
           then e || jsonb_build_object('status', v_status,
                  'resolved_at', case when v_status = 'open' then null else to_jsonb(now()) end)
           else e end), '[]'::jsonb)
         from jsonb_array_elements(s.findings) e)
   where exists (select 1 from jsonb_array_elements(s.findings) e2
                  where (e2 ->> 'id')::bigint = p_id);
  if found then v_hit := true; end if;

  return v_hit;
end $$;

revoke all on function public.tgb_resolve_soundtrack_finding(bigint, text) from public, anon;
grant execute on function public.tgb_resolve_soundtrack_finding(bigint, text) to authenticated;

-- ── 2. The dead trigger functions ───────────────────────────────────────────
-- Every one of these fired on a table that no longer exists. They are dropped
-- rather than left, because a trigger function with no trigger is the thing
-- that makes somebody re-attach it to the wrong table.
drop function if exists public.tgb_cascade_soundtrack_tape_archive() cascade;   -- the old tape cascade
drop function if exists public.tgb_soundtrack_songs_sync_city() cascade;        -- kept city_slug with tape_id
drop function if exists public.tgb_soundtracks_sync_song_cities() cascade;      -- the other half of that pair
drop function if exists public.tgb_stamp_soundtrack_issue_resolved() cascade;   -- on soundtrack_issues
drop function if exists public.tgb_touch_soundtracks_updated_at() cascade;      -- the retired table's touch

-- ── 3. The dead tables ──────────────────────────────────────────────────────
-- THE ORDER IS THE DEPENDENCY ORDER, and the first run of this file failed on
-- it: `soundtrack_issues.song_id` is a foreign key into the songs table, and
-- the songs table's `tape_id` is one into the tapes table. Dropped innermost
-- first, so no `cascade` is needed -- and not using `cascade` is the point,
-- since it would silently take anything else that happened to depend on them.
drop table if exists public.soundtrack_issues;
drop table if exists public.soundtrack_songs_retired;
drop table if exists public.soundtrack_tapes_retired;

-- ── 4. Say what the two kept columns are ────────────────────────────────────
comment on column public.soundtrack.certified_at is
  'RETIRED. Nothing reads or writes it. The state model is `archived` alone: false LIVE, true SHELVED. Kept because it records that a track was once approved.';
comment on column public.soundtrack.rejected_at is
  'RETIRED. Nothing reads or writes it. Kept because it is the only record of which tracks a HUMAN personally turned down, as against the ones a routine filed and nobody reached. Dropping it is the one irreversible act available here.';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. Only the live objects are left:
--      select tablename from pg_tables where schemaname='public' and tablename like 'soundtrack%';
--        -- expect exactly: soundtrack
--      select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and (p.proname like '%soundtrack%' or p.proname like '%tape%');
--        -- expect 7: the two pulls, the three tape writers, the touch, the resolver
--
-- 2. Nothing was lost: 1643 rows, 113 tapes, 285 findings, 62 open.
--
-- 3. The resolver works, which is what this file is really for. It is
--    is_photo_admin() gated, so prove it from the hub's Clear button or with a
--    session, not from the SQL editor.
