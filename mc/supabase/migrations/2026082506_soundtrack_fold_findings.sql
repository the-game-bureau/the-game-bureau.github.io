-- THREE SOUNDTRACK TABLES BECOME TWO, and the tape table is renamed.
--
--   soundtracks        -> soundtrack        (113 tapes)
--   soundtrack_songs   -> unchanged in name (1,643 tracks)
--   soundtrack_issues  -> folded onto the row each finding is ABOUT
--
-- ── WHY THE FINDINGS ARE jsonb AND NOT COLUMNS ───────────────────────────────
--
-- Because a row can carry more than one. Checked against the live table rather
-- than assumed: **one track holds two open findings today**, and the four kinds
-- (spotify / spelling / relevance / facts) are independent, so two is a normal
-- state and not an accident. Flat `issue_kind` / `issue_detail` columns would
-- have silently dropped the second one.
--
-- ── AND WHY THE TAPE GETS THEM TOO ───────────────────────────────────────────
--
-- **66 of the 285 findings have no `song_id`.** They are statements about the
-- LIST rather than about a track -- short of 15, over 15 -- and the Tape Room
-- already draws them on the tape, above its tracks. Folding everything onto
-- tracks would have lost all 66.
--
-- ── THE FINGERPRINT DEDUPE MOVES INTO THE FUNCTION ───────────────────────────
--
-- `soundtrack_issues_live_fingerprint_idx` was a PARTIAL UNIQUE index on
-- `fingerprint where status in ('open','dismissed')`, and it is what stops the
-- audit re-reporting the same finding every run while it is still open. **A
-- jsonb array cannot carry a unique index**, so that guarantee moves into
-- `tgb_report_soundtrack_issues`, which now checks the array before appending.
--
-- **The behaviour it protects must not change**: a finding cleared to `fixed`
-- becomes reportable again, and that recurrence is the ONLY check that a fix
-- landed. So the check is on open findings only, exactly as the index was.
--
-- ── soundtrack_issues IS LEFT IN PLACE, NOT DROPPED ──────────────────────────
--
-- The same bargain `public.maps` and `waypoints.tour_id` got. It is 285 rows of
-- history, nothing will read it after this, and dropping is the one irreversible
-- act available on a change this size. **The drop is at the bottom, commented.**
-- Run it once the Tape Room has been on the new shape for a while.
--
-- APPLIED 2026-08-25 via `supabase db query --linked --file`.

begin;

-- ── 1. soundtracks -> soundtrack ─────────────────────────────────────────────
do $$
begin
  if to_regclass('public.soundtracks') is not null
     and to_regclass('public.soundtrack') is null then
    alter table public.soundtracks rename to soundtrack;
  end if;
end $$;

-- Indexes, constraints and policies still read `soundtracks_*`. Scanned from the
-- catalog rather than listed, so anything added by hand in the dashboard moves
-- too and nothing this file has never heard of is left behind.
do $$
declare r record; n text;
begin
  for r in
    select c.relname as name from pg_class c
      join pg_index i on i.indexrelid = c.oid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname='public' and t.relname='soundtrack' and c.relname like 'soundtracks\_%'
  loop
    n := 'soundtrack_' || substr(r.name, length('soundtracks_') + 1);
    execute format('alter index public.%I rename to %I', r.name, n);
  end loop;

  for r in
    select con.conname as name from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname='public' and t.relname='soundtrack' and con.conname like 'soundtracks\_%'
  loop
    n := 'soundtrack_' || substr(r.name, length('soundtracks_') + 1);
    execute format('alter table public.soundtrack rename constraint %I to %I', r.name, n);
  end loop;

  for r in
    select pol.polname as name from pg_policy pol
      join pg_class t on t.oid = pol.polrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname='public' and t.relname='soundtrack' and pol.polname like 'soundtracks%'
  loop
    n := 'soundtrack' || substr(r.name, length('soundtracks') + 1);
    execute format('alter policy %I on public.soundtrack rename to %I', r.name, n);
  end loop;

  for r in
    select tg.tgname as name from pg_trigger tg
      join pg_class t on t.oid = tg.tgrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname='public' and t.relname='soundtrack'
       and not tg.tgisinternal and tg.tgname like 'soundtracks\_%'
  loop
    n := 'soundtrack_' || substr(r.name, length('soundtracks_') + 1);
    execute format('alter trigger %I on public.soundtrack rename to %I', r.name, n);
  end loop;
end $$;

comment on table public.soundtrack is
  'One row per TAPE. Renamed from soundtracks on 2026-08-25. `findings` carries the audit findings about the LIST itself (short of 15, over 15); a finding about a track lives on the track.';

-- ── 2. findings become an array on the row they are about ────────────────────
alter table public.soundtrack       add column if not exists findings jsonb not null default '[]'::jsonb;
alter table public.soundtrack_songs add column if not exists findings jsonb not null default '[]'::jsonb;

comment on column public.soundtrack.findings is
  'Audit findings about the TAPE, as a jsonb array. Each: {id, kind, severity, detail, suggestion, status, fingerprint, created_at, resolved_at}. An array, not columns, because a row can carry more than one.';
comment on column public.soundtrack_songs.findings is
  'Audit findings about this TRACK, same shape as soundtrack.findings. Written by tgb_report_soundtrack_issues, which dedupes on fingerprint across OPEN findings only, exactly as the retired partial unique index did.';

-- ── 3. Backfill, tracks first then tapes ─────────────────────────────────────
-- Ordered by created_at so the array reads oldest first, which is the order the
-- Tape Room drew the old list in.
update public.soundtrack_songs s
   set findings = coalesce(f.arr, '[]'::jsonb)
  from (
    select i.song_id,
           jsonb_agg(jsonb_build_object(
             'id', i.id, 'kind', i.kind, 'severity', i.severity,
             'detail', i.detail, 'suggestion', i.suggestion, 'status', i.status,
             'fingerprint', i.fingerprint, 'created_at', i.created_at,
             'resolved_at', i.resolved_at
           ) order by i.created_at) as arr
      from public.soundtrack_issues i
     where i.song_id is not null
     group by i.song_id
  ) f
 where f.song_id = s.id;

update public.soundtrack t
   set findings = coalesce(f.arr, '[]'::jsonb)
  from (
    select i.tape_id,
           jsonb_agg(jsonb_build_object(
             'id', i.id, 'kind', i.kind, 'severity', i.severity,
             'detail', i.detail, 'suggestion', i.suggestion, 'status', i.status,
             'fingerprint', i.fingerprint, 'created_at', i.created_at,
             'resolved_at', i.resolved_at
           ) order by i.created_at) as arr
      from public.soundtrack_issues i
     where i.song_id is null and i.tape_id is not null
     group by i.tape_id
  ) f
 where f.tape_id = t.id;

-- Finding an open finding is the common read, so index it. `jsonb_path_exists`
-- is not indexable directly; a plain GIN over the array serves the containment
-- query the pages actually make.
create index if not exists soundtrack_songs_findings_idx on public.soundtrack_songs using gin (findings);
create index if not exists soundtrack_findings_idx       on public.soundtrack       using gin (findings);

-- ── 4. The two views ─────────────────────────────────────────────────────────
drop view if exists public.soundtrack_issue_stats;
drop view if exists public.soundtrack_stats;

create view public.soundtrack_stats as
select t.id as tape_id, t.city_slug, t.spine_tag, t.spine_tag_position, t.archived,
       count(s.id) filter (where not s.archived) as active_songs,
       count(s.id) filter (where s.archived)     as archived_songs,
       max(s.created_at)                          as last_song_at
  from public.soundtrack t
  left join public.soundtrack_songs s on s.tape_id = t.id
 group by t.id, t.city_slug, t.spine_tag, t.spine_tag_position, t.archived;

-- OPEN findings per tape, counting BOTH the tape's own and its tracks', which
-- is the number the Tape Room's FLAGGED filter and the hub both want.
create view public.soundtrack_issue_stats as
select t.id as tape_id, t.city_slug,
       (select count(*) from jsonb_array_elements(t.findings) e
         where e ->> 'status' = 'open')
     + coalesce((select count(*) from public.soundtrack_songs s,
                      jsonb_array_elements(s.findings) e
                  where s.tape_id = t.id and e ->> 'status' = 'open'), 0) as open_issues
  from public.soundtrack t;

commit;

-- ── 5. The reporting RPC, rewritten for the new shape ────────────────────────
-- Its constants are still the security and none of them became a parameter:
-- insert-only, always status='open', at most 40 a call, and a song_id that is
-- not on the named tape is dropped.
create or replace function public.tgb_report_soundtrack_issues(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
  v_row  jsonb;
  v_added int := 0;
  v_skipped int := 0;
  v_tape bigint;
  v_song bigint;
  v_city text;
  v_kind text;
  v_sev  text;
  v_detail text;
  v_sugg text;
  v_fp   text;
  v_obj  jsonb;
  v_kinds constant text[] := array['spotify','spelling','relevance','facts'];
begin
  if jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' then
    v_rows := coalesce(payload -> 'issues', payload -> 'payload', payload -> 'rows');
  end if;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of finding objects.');
  end if;
  if jsonb_array_length(v_rows) > 40 then
    return jsonb_build_object('error', 'At most 40 findings a call.');
  end if;

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_city := nullif(btrim(coalesce(v_row ->> 'city_slug', '')), '');
    v_kind := lower(nullif(btrim(coalesce(v_row ->> 'kind', '')), ''));
    v_sev  := lower(nullif(btrim(coalesce(v_row ->> 'severity', '')), ''));
    v_detail := nullif(btrim(coalesce(v_row ->> 'detail', '')), '');
    v_sugg := nullif(btrim(coalesce(v_row ->> 'suggestion', '')), '');
    begin v_song := nullif(btrim(coalesce(v_row ->> 'song_id', '')), '')::bigint;
    exception when others then v_song := null; end;

    if v_city is null or v_kind is null or v_detail is null
       or not (v_kind = any(v_kinds)) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_tape from public.soundtrack where city_slug = v_city order by id limit 1;
    if v_tape is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- A song_id that is not on the named tape is dropped, exactly as before.
    if v_song is not null and not exists (
         select 1 from public.soundtrack_songs s where s.id = v_song and s.tape_id = v_tape) then
      v_song := null;
    end if;

    -- THE FINGERPRINT IS THE SAME md5 IT ALWAYS WAS, deliberately NOT the detail
    -- text: the agent rewords that every run, which would defeat the dedupe
    -- entirely.
    v_fp := md5(v_city || ':' || coalesce(v_song::text, '') || ':' || v_kind);

    v_obj := jsonb_build_object(
      'id', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      'kind', v_kind, 'severity', coalesce(v_sev, 'low'),
      'detail', v_detail, 'suggestion', v_sugg,
      'status', 'open', 'fingerprint', v_fp,
      'created_at', now(), 'resolved_at', null);

    if v_song is not null then
      -- THE DEDUPE THE PARTIAL UNIQUE INDEX USED TO DO. Open only: a finding
      -- cleared to `fixed` becomes reportable again, and that recurrence is the
      -- only check that a fix landed.
      if exists (select 1 from public.soundtrack_songs s, jsonb_array_elements(s.findings) e
                  where s.id = v_song and e ->> 'fingerprint' = v_fp and e ->> 'status' = 'open') then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      update public.soundtrack_songs set findings = findings || jsonb_build_array(v_obj)
       where id = v_song;
    else
      if exists (select 1 from public.soundtrack t, jsonb_array_elements(t.findings) e
                  where t.id = v_tape and e ->> 'fingerprint' = v_fp and e ->> 'status' = 'open') then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      update public.soundtrack set findings = findings || jsonb_build_array(v_obj)
       where id = v_tape;
    end if;
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end;
$$;

grant execute on function public.tgb_report_soundtrack_issues(jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. Nothing was lost in the fold. 285 findings in, 285 across the two arrays:
--
--    select (select count(*) from public.soundtrack_issues) as was,
--           (select coalesce(sum(jsonb_array_length(findings)),0) from public.soundtrack_songs)
--         + (select coalesce(sum(jsonb_array_length(findings)),0) from public.soundtrack) as now;
--
-- 2. The 66 tape-level findings landed on tapes, not tracks:
--
--    select coalesce(sum(jsonb_array_length(findings)),0) from public.soundtrack;   -- 66
--
-- 3. The track with two open findings still has two:
--
--    select id, jsonb_array_length(findings) from public.soundtrack_songs
--     where jsonb_array_length(findings) > 1 order by 2 desc limit 3;
--
-- 4. The RPC still refuses a repeat while the finding is open, and accepts it
--    once cleared. PROVED BY A CALL, not by an empty payload.
--
-- ── Once the Tape Room has run on this for a while ───────────────────────────
--    drop table public.soundtrack_issues;
