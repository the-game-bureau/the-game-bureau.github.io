-- FINDINGS STAY ADMIN-ONLY AFTER THE FOLD, and this file is the fix for a leak
-- 2026082506 opened.
--
-- ── WHAT WENT WRONG, WRITTEN DOWN BECAUSE IT IS THE WHOLE LESSON ─────────────
--
-- `soundtrack_issues` was admin-read only: RLS answered `anon` with `[]`. The
-- fold moved every finding into `soundtrack_songs.findings` and
-- `soundtrack.findings` -- and **both of those tables are PUBLICLY READABLE**,
-- because the cassette page needs them. So for the minutes between the fold and
-- this file, anyone holding the publishable key (which is in the public HTML of
-- the site) could read every internal editorial note: *"this song has no real
-- tie to the city"*, *"blurb is five words, below the required range"*.
--
-- **MOVING A COLUMN MOVES IT UNDER A DIFFERENT RLS POLICY.** A table's privacy
-- is a property of the TABLE, not of the data, and folding a private table into
-- a public one publishes it. Nothing warns you; the rows simply appear.
--
-- ── HOW IT IS SHUT ───────────────────────────────────────────────────────────
--
-- Per-column grants. **A column-level REVOKE cannot override a table-level
-- grant** -- `select` on a table means every column, present and future -- so
-- the table grant is revoked and re-issued column by column, omitting
-- `findings`.
--
-- The visible consequence: **`select=*` as `anon` now answers 42501** for both
-- tables, because PostgREST expands `*` to columns the caller cannot read. The
-- public cassette page names its columns instead. **Do not put `*` back.**

begin;

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='soundtrack_songs' and column_name <> 'findings';
  execute 'revoke select on public.soundtrack_songs from anon';
  execute 'grant select (' || cols || ') on public.soundtrack_songs to anon';

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='soundtrack' and column_name <> 'findings';
  execute 'revoke select on public.soundtrack from anon';
  execute 'grant select (' || cols || ') on public.soundtrack to anon';
end $$;

-- ── One row per finding, for the rooms that want a list ──────────────────────
--
-- The Tape Room draws a finding on the row it is about and needs no list. The
-- HUB does: its review table counts open findings and its worklist shows them,
-- and neither can be done against a jsonb array through PostgREST.
--
-- `security_invoker` SO RLS AND GRANTS APPLY AS THE CALLER. Without it a view
-- runs as its owner and would hand `anon` exactly what the grants above just
-- took away -- the same leak again, through a different door.
create or replace view public.soundtrack_findings
with (security_invoker = true) as
select (e ->> 'id')::bigint            as id,
       s.id                            as song_id,
       s.tape_id                       as tape_id,
       s.city_slug                     as city_slug,
       s.title                         as song_title,
       e ->> 'kind'                    as kind,
       e ->> 'severity'                as severity,
       e ->> 'detail'                  as detail,
       e ->> 'suggestion'              as suggestion,
       e ->> 'status'                  as status,
       e ->> 'fingerprint'             as fingerprint,
       (e ->> 'created_at')::timestamptz as created_at
  from public.soundtrack_songs s, jsonb_array_elements(s.findings) e
union all
select (e ->> 'id')::bigint, null::bigint, t.id, t.city_slug, null::text,
       e ->> 'kind', e ->> 'severity', e ->> 'detail', e ->> 'suggestion',
       e ->> 'status', e ->> 'fingerprint', (e ->> 'created_at')::timestamptz
  from public.soundtrack t, jsonb_array_elements(t.findings) e;

revoke all on public.soundtrack_findings from anon, public;
grant select on public.soundtrack_findings to authenticated;

comment on view public.soundtrack_findings is
  'One row per audit finding, flattened out of soundtrack_songs.findings and soundtrack.findings. security_invoker so the callers grants apply: authenticated only, because a finding is an internal editorial note.';

-- ── Clearing one, by id ──────────────────────────────────────────────────────
-- A view is not updatable through PostgREST, and the hub needs to clear a
-- finding without knowing which row carries it.
create or replace function public.tgb_resolve_soundtrack_finding(p_id bigint, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_hit boolean := false;
begin
  -- ADMINS ONLY. This is the first soundtrack function that is not insert-only,
  -- and the grant alone would let any authenticated Supabase user call it.
  if not public.is_photo_admin() then
    raise exception 'not authorized';
  end if;

  -- `fixed`, NEVER `dismissed`. The partial unique index that used to guard
  -- this is gone, but the rule it protected is not: a cleared finding comes
  -- straight back on the next audit if the problem is still there, and that
  -- recurrence is the only check a fix landed. `dismissed` silences it forever.
  v_status := case when coalesce(p_status, 'fixed') = 'open' then 'open' else 'fixed' end;

  update public.soundtrack_songs s
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

  update public.soundtrack t
     set findings = (
       select coalesce(jsonb_agg(
         case when (e ->> 'id')::bigint = p_id
           then e || jsonb_build_object('status', v_status,
                  'resolved_at', case when v_status = 'open' then null else to_jsonb(now()) end)
           else e end), '[]'::jsonb)
         from jsonb_array_elements(t.findings) e)
   where exists (select 1 from jsonb_array_elements(t.findings) e2
                  where (e2 ->> 'id')::bigint = p_id);
  if found then v_hit := true; end if;

  return v_hit;
end;
$$;

revoke all on function public.tgb_resolve_soundtrack_finding(bigint, text) from public, anon;
grant execute on function public.tgb_resolve_soundtrack_finding(bigint, text) to authenticated;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. THE LEAK IS SHUT. With the PUBLISHABLE key:
--      /soundtrack_songs?select=id,findings   -> 42501
--      /soundtrack_songs?select=*             -> 42501
--      /soundtrack_findings?select=*          -> permission denied
--    and the public page's own named-column read still answers 200.
--
-- 2. The view carries every finding:
--      select count(*) from public.soundtrack_findings;              -- 285
--      select count(*) from public.soundtrack_findings where status='open';  -- 62
--
-- 3. Clearing one works and is reversible:
--      select public.tgb_resolve_soundtrack_finding(<id>, 'fixed');  -- true
--      select public.tgb_resolve_soundtrack_finding(<id>, 'open');   -- true
