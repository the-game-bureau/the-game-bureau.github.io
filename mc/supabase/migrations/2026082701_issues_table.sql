-- FINDINGS BECOME ROWS IN public.issues, AND CLEARING ONE DELETES IT.
--
-- ── WHAT MOVES ──────────────────────────────────────────────────────────────
--
-- A finding lived in a `findings` jsonb array on the `public.soundtrack` row it
-- was about, with `public.soundtrack_findings` flattening it for reading and
-- `tgb_resolve_soundtrack_finding` setting a `status` inside the array. It is a
-- table now, one row per finding, and CLEARING IS A DELETE.
--
-- ── WHY A DELETE IS SAFE HERE, WHICH IS NOT OBVIOUS ─────────────────────────
--
-- This project normally refuses to destroy a record. The rule that made the
-- old `status` worth keeping was the dedupe: the reporter skipped a fingerprint
-- it already held OPEN, so a finding cleared to `fixed` became reportable again
-- and **that recurrence is the only check that a fix landed**. Deleting the row
-- says exactly the same thing in one less step: the fingerprint is gone, so the
-- next audit files it again if the problem is still there.
--
-- What is genuinely given up is the record that somebody looked. `fixed` was a
-- tombstone saying "a human read this and moved on"; nothing records that now.
-- Said plainly rather than glossed: if that turns out to matter it wants an
-- events table, not a status column coming back.
--
-- ── NOTHING IS CARRIED ACROSS, AND THAT WAS CHECKED RATHER THAN ASSUMED ─────
--
-- 204 findings live in the array today and **not one of them is open**: 202
-- `fixed`, 2 `dismissed`. In a model where clearing deletes, a cleared finding
-- simply does not exist, so there is nothing to migrate. The table starts empty
-- and the next audit fills it.
--
-- ── IT IS NOT A SOUNDTRACK TABLE ────────────────────────────────────────────
--
-- The room's own sentence now reads "things that need correcting, from
-- soundtracks to the Gift Shop", so the columns are named for any area rather
-- than for tracks and tapes. `area` is the discriminator; each area decides
-- what its subject and its group are:
--
--   area          subject_id / subject_label      group_key / group_label
--   soundtrack    the track id / its title        the city slug / the tape
--   gift_shop     the gift id / its name          the city / the city
--
-- ── PRIVACY IS THE REASON FOR EVERY GRANT BELOW ─────────────────────────────
--
-- "This song has no real tie to the city" is an internal editorial note. The
-- old column was kept out of `anon`'s per-column grant on a publicly readable
-- table, which is a thing that has to be re-issued every time a column is
-- added and which leaked for a few minutes in August when the findings were
-- first folded in. A table of its own with no anon policy at all cannot leak
-- that way.
--
-- APPLY BY HAND.

create table if not exists public.issues (
  id            bigint generated always as identity primary key,
  area          text        not null default 'soundtrack',
  kind          text        not null,
  severity      text        not null default 'low',
  -- 'item' means it names one thing; 'group' means it is about the LIST -- a
  -- tape short of 15, an artist appearing twice -- and has no item to act on.
  scope         text        not null default 'item',
  subject_id    text,
  subject_label text,
  group_key     text        not null,
  group_label   text,
  detail        text        not null,
  suggestion    text,
  fingerprint   text        not null,
  -- WHICH ROUTINE FILED IT. A human clearing one wants to know whether the
  -- thing that wrote it is something we can fix.
  source        text,
  created_at    timestamptz not null default now()
);

comment on table public.issues is
  'One row per open finding, across every area of the site. A finding is only ever open: clearing one DELETES it, which is what makes the reporter free to file it again if the problem is still there. Admin-read only -- a finding is an internal editorial note.';

comment on column public.issues.scope is
  'item = it names one thing (a track, a gift). group = it is about the list itself, so there is nothing to act on but the note.';

comment on column public.issues.subject_label is
  'The name AT FILING TIME. It is not kept in step with a rename, deliberately: this table does not know how to join to every area. The keys are what the links are built from.';

-- THE FINGERPRINT IS SCOPED TO THE AREA. Two areas computing the same md5 is
-- not a duplicate, and a global unique index would silently drop the second.
create unique index if not exists issues_area_fingerprint_idx
  on public.issues (area, fingerprint);

create index if not exists issues_area_created_idx
  on public.issues (area, created_at desc);

alter table public.issues enable row level security;

-- NO ANON POLICY AT ALL, and no insert policy for anybody: every write comes
-- through the SECURITY DEFINER reporter below, whose constants are what make it
-- safe to expose to a cloud routine holding only the publishable key.
drop policy if exists issues_admin_read on public.issues;
create policy issues_admin_read on public.issues
  for select to authenticated using (public.is_photo_admin());

drop policy if exists issues_admin_delete on public.issues;
create policy issues_admin_delete on public.issues
  for delete to authenticated using (public.is_photo_admin());

revoke all on public.issues from anon, authenticated;
grant select, delete on public.issues to authenticated;

-- ── THE REPORTER ────────────────────────────────────────────────────────────
--
-- SAME NAME AND SAME PAYLOAD AS BEFORE, so TGB SOUNDTRACK BOT's brief needs no
-- edit and a run in flight cannot land on a function that has changed shape
-- under it. Only the destination moved.
--
-- ITS CONSTANTS ARE THE SECURITY and must not become parameters: `area` is
-- always 'soundtrack', the kind must be one of four, the city must hold at
-- least one track, and a call is capped at 40.

create or replace function public.tgb_report_soundtrack_issues(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows jsonb; v_row jsonb;
  v_added int := 0; v_skipped int := 0;
  v_city text; v_kind text; v_sev text; v_detail text; v_sugg text; v_fp text;
  v_song bigint; v_scope text; v_title text; v_tape text; v_hit int;
  v_kinds constant text[] := array['spotify','spelling','relevance','facts'];
begin
  if jsonb_typeof(payload) = 'array' then v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' then v_rows := coalesce(payload->'issues', payload->'payload');
  end if;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of finding objects.');
  end if;
  if jsonb_array_length(v_rows) > 40 then
    return jsonb_build_object('error', 'At most 40 findings a call.');
  end if;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    v_city   := nullif(btrim(coalesce(v_row->>'city_slug', '')), '');
    v_kind   := lower(nullif(btrim(coalesce(v_row->>'kind', '')), ''));
    v_sev    := lower(nullif(btrim(coalesce(v_row->>'severity', '')), ''));
    v_detail := nullif(btrim(coalesce(v_row->>'detail', '')), '');
    v_sugg   := nullif(btrim(coalesce(v_row->>'suggestion', '')), '');
    begin v_song := nullif(btrim(coalesce(v_row->>'song_id', '')), '')::bigint;
    exception when others then v_song := null; end;

    if v_city is null or v_kind is null or v_detail is null or not (v_kind = any(v_kinds)) then
      v_skipped := v_skipped + 1; continue;
    end if;

    -- A song_id that is not in this city is dropped, exactly as before: the
    -- caller does not get to attach a note to a track on somebody else's tape.
    if v_song is not null and not exists (
         select 1 from public.soundtrack s where s.id = v_song and s.city_slug = v_city) then
      v_song := null;
    end if;

    -- THE CITY MUST HOLD A TRACK. It is the check that used to fall out of
    -- having to find a row to hang the note on, and it is worth keeping: a
    -- finding about a tape nobody has is a finding nobody can act on.
    if not exists (select 1 from public.soundtrack s where s.city_slug = v_city) then
      v_skipped := v_skipped + 1; continue;
    end if;

    if v_song is not null then
      v_scope := 'item';
      select title into v_title from public.soundtrack where id = v_song;
    else
      v_scope := 'group';
      v_title := null;
    end if;
    select tape into v_tape from public.soundtrack
     where city_slug = v_city order by position nulls last, id limit 1;

    -- THE SAME md5 IT ALWAYS WAS, deliberately not the detail text, which the
    -- agent rewords every run and which would defeat the dedupe entirely.
    v_fp := md5(v_city || ':' || coalesce(v_song::text, '') || ':' || v_kind);

    -- A ROW EXISTING IS WHAT "OPEN" MEANS NOW, so the dedupe is simply whether
    -- one is there. Clearing deletes, which is what frees the fingerprint.
    insert into public.issues
      (area, kind, severity, scope, subject_id, subject_label,
       group_key, group_label, detail, suggestion, fingerprint, source)
    values
      ('soundtrack', v_kind, coalesce(v_sev, 'low'), v_scope,
       v_song::text, v_title, v_city, v_tape, v_detail, v_sugg, v_fp,
       'TGB SOUNDTRACK BOT')
    on conflict (area, fingerprint) do nothing;

    -- `found` AFTER AN INSERT ... ON CONFLICT DO NOTHING IS NOT RELIABLE for
    -- this, so the row count is read explicitly.
    get diagnostics v_hit = row_count;
    if v_hit > 0 then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end $function$;

grant execute on function public.tgb_report_soundtrack_issues(jsonb) to anon, authenticated;

-- ── WHAT IS RETIRED IN PLACE ────────────────────────────────────────────────
--
-- `public.soundtrack.findings`, the `soundtrack_findings` view and
-- `tgb_resolve_soundtrack_finding` are all left exactly where they are and
-- read by nothing. Retire-in-place is the standing rule here; the drops sit
-- below, commented, for once this has run for a while.
--
--   drop function if exists public.tgb_resolve_soundtrack_finding(bigint, text);
--   drop view if exists public.soundtrack_findings;
--   alter table public.soundtrack drop column findings;

comment on column public.soundtrack.findings is
  'RETIRED 2026-08-27. Findings live in public.issues now, one row each, and clearing one deletes it. Nothing reads this column. It still holds the 204 cleared findings that predate the move.';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The table is there and empty:
--      select count(*) from public.issues;
-- 2. anon cannot see it at all:
--      /issues?select=id  ->  401/permission denied, never 200 with []
-- 3. The reporter really files a row, which an empty payload cannot prove:
--      select public.tgb_report_soundtrack_issues(
--        '[{"city_slug":"<a real slug>","kind":"facts","severity":"low",
--           "detail":"probe"}]'::jsonb);
--      -> {"added": 1, "skipped": 0}, and the same call again -> added 0.
--      Then: delete from public.issues where detail = 'probe';
