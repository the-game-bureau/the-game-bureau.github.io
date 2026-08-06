-- A daily audit of the tapes, reported to the Tape Room.
--
-- The daily routine already writes songs. This gives it a second job: look at
-- what is already there and say what looks wrong. Four kinds of wrong, which is
-- what the panel filters on:
--
--   spotify    the id does not resolve, or resolves to a different recording
--              than title+artist claims. The only failure a visitor actually
--              hits, so it outranks the rest.
--   spelling   misspelled title or artist, typos in a blurb.
--   relevance  the song has no real tie to the city. The failure the whole
--              editorial rule exists to prevent.
--   facts      wrong year, wrong album, wrong claim about the artist; also
--              duplicates, missing blurbs, a wrong explicit flag, a thin tape.
--
-- Clearing an issue is a human action with two meanings, and the difference is
-- the whole reason this table has a status column instead of being deleted from:
--
--   fixed      you dealt with it. The row stops being open, and tomorrow's run
--              is free to report the same thing again -- which is the check
--              that you actually fixed it.
--   dismissed  it was never an issue. The finding is silenced permanently.
--
-- That distinction is enforced by an index, not by the client: the partial
-- unique index below covers 'open' and 'dismissed' but not 'fixed', so an
-- insert of an already-open or once-dismissed finding hits the index and does
-- nothing, while a fixed one is allowed back. Same shape as the do-not-rescrape
-- tombstone on soundtrack_songs, and same reason -- the rule has to hold for
-- psql and the Supabase table editor too, not just for the admin page.

create table if not exists public.soundtrack_issues (
  id bigint generated always as identity primary key,
  city_slug text not null
    references public.soundtracks (city_slug) on delete cascade on update cascade,
  -- null for a finding about the tape as a whole ("only 9 active songs").
  song_id bigint
    references public.soundtrack_songs (id) on delete cascade,
  kind text not null
    check (kind in ('spotify', 'spelling', 'relevance', 'facts')),
  severity text not null default 'warn'
    check (severity in ('info', 'warn', 'high')),
  -- What is wrong, in a sentence a person can act on.
  detail text not null,
  -- What to do about it, when the agent has a concrete suggestion. Advisory
  -- only: nothing applies it automatically.
  suggestion text,
  status text not null default 'open'
    check (status in ('open', 'fixed', 'dismissed')),
  -- Deliberately (city, song, kind) and NOT the detail text: the agent rewords
  -- the same finding differently every run, so hashing the prose would defeat
  -- the dedupe entirely. One open finding per song per kind is also the right
  -- granularity for "not an issue" -- it silences relevance on that one song,
  -- not relevance everywhere.
  fingerprint text generated always as (
    md5(city_slug || ':' || coalesce(song_id::text, '-') || ':' || kind)
  ) stored,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.soundtrack_issues is
  'Findings from the daily soundtrack audit, cleared by a human in the Tape Room. '
  'status fixed = dealt with, may be reported again; dismissed = never an issue, '
  'silenced permanently.';
comment on column public.soundtrack_issues.song_id is
  'Null means the finding is about the tape rather than one track.';
comment on column public.soundtrack_issues.fingerprint is
  'md5(city_slug:song_id:kind). Dedupes open findings and enforces a dismissal.';

create index if not exists soundtrack_issues_open_idx
  on public.soundtrack_issues (status, severity, created_at desc);
create index if not exists soundtrack_issues_city_idx
  on public.soundtrack_issues (city_slug, status);
create index if not exists soundtrack_issues_song_idx
  on public.soundtrack_issues (song_id) where song_id is not null;

-- The load-bearing one. 'fixed' is excluded so a still-broken thing can be
-- raised again after you claim to have fixed it.
create unique index if not exists soundtrack_issues_live_fingerprint_idx
  on public.soundtrack_issues (fingerprint)
  where status in ('open', 'dismissed');

drop trigger if exists soundtrack_issues_touch_updated_at on public.soundtrack_issues;
create trigger soundtrack_issues_touch_updated_at
before update on public.soundtrack_issues
for each row execute function public.tgb_touch_soundtracks_updated_at();

-- Stamp resolved_at whenever a row leaves 'open', and clear it on the way back.
create or replace function public.tgb_stamp_soundtrack_issue_resolved()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'open' then
      new.resolved_at := null;
    else
      new.resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists soundtrack_issues_stamp_resolved on public.soundtrack_issues;
create trigger soundtrack_issues_stamp_resolved
before update on public.soundtrack_issues
for each row execute function public.tgb_stamp_soundtrack_issue_resolved();

-- Which tapes the audit has looked at, and when. The routine picks the tapes
-- that have gone longest without a look, the same rotation the waypoint scout
-- uses for cities. Null sorts first, so an unaudited tape is always next.
alter table public.soundtracks
  add column if not exists last_audit_at timestamptz;

comment on column public.soundtracks.last_audit_at is
  'When the daily audit last examined this tape. Null = never. Drives the '
  'least-recently-audited rotation; stamped by tgb_report_soundtrack_issues.';

-- Open findings per tape, so the admin can show a count without pulling rows.
create or replace view public.soundtrack_issue_stats as
select
  city_slug,
  count(*) filter (where status = 'open') as open_issues,
  count(*) filter (where status = 'open' and severity = 'high') as high_issues,
  max(created_at) filter (where status = 'open') as newest_open_at
from public.soundtrack_issues
group by city_slug;

alter table public.soundtrack_issues enable row level security;

-- Unlike soundtracks/soundtrack_songs, these are NOT publicly readable. They are
-- internal editorial notes -- "this song has no real tie to the city" is not
-- something to serve to anyone who asks. The agent never reads them either: the
-- RPC dedupes server-side, so reporting needs no SELECT.
drop policy if exists "Admins can read soundtrack issues" on public.soundtrack_issues;
create policy "Admins can read soundtrack issues"
  on public.soundtrack_issues for select to authenticated using (true);

drop policy if exists "Admins can manage soundtrack issues" on public.soundtrack_issues;
create policy "Admins can manage soundtrack issues"
  on public.soundtrack_issues for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.soundtrack_issues to authenticated;
grant select on public.soundtrack_issue_stats to authenticated;

-- ---------------------------------------------------------------------------
-- The agent's write path.
--
-- Same constraint and same answer as tgb_pull_soundtrack_songs and
-- tgb_pull_book_candidates: a cloud routine has no secret store, so this is
-- SECURITY DEFINER and callable with the ordinary publishable key, and stays
-- safe by being unable to express anything dangerous.
--
-- It can only INSERT, only with status 'open', and only against a song that
-- actually sits on the city it names. It cannot resolve, reopen, delete, or
-- dismiss anything -- clearing is a human action under an admin session. Do not
-- add a `status` parameter; that constant is what makes this safe to expose.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_report_soundtrack_issues(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reports jsonb;
  v_report jsonb;
  v_slug text;
  v_song_id bigint;
  v_kind text;
  v_severity text;
  v_detail text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_slugs text[] := '{}';
begin
  v_reports := payload -> 'issues';
  if v_reports is null or jsonb_typeof(v_reports) <> 'array' then
    raise exception 'Expected { "issues": [ ... ] }.';
  end if;

  -- A day's audit, not a bulk rewrite. Well above what one honest run produces
  -- and far below "flood the table".
  if jsonb_array_length(v_reports) > 40 then
    raise exception 'Too many issues in one call (% > 40).', jsonb_array_length(v_reports);
  end if;

  for v_report in select * from jsonb_array_elements(v_reports)
  loop
    v_slug := nullif(btrim(v_report ->> 'city_slug'), '');
    v_kind := lower(nullif(btrim(v_report ->> 'kind'), ''));
    v_detail := nullif(btrim(v_report ->> 'detail'), '');
    v_severity := lower(coalesce(nullif(btrim(v_report ->> 'severity'), ''), 'warn'));

    -- A malformed entry is skipped, not raised: one bad row must not throw away
    -- the rest of the morning's findings.
    if v_slug is null or v_detail is null
       or v_kind not in ('spotify', 'spelling', 'relevance', 'facts')
       or v_severity not in ('info', 'warn', 'high')
    then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    if not exists (select 1 from public.soundtracks s where s.city_slug = v_slug) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    -- song_id is optional, but if given it has to be a real track on that tape.
    -- Otherwise a typo would hang a Denver finding off a Boston song.
    -- jsonb_typeof of a missing key is null, so this covers "absent" and
    -- "present but not a number" at once. Cast through numeric because a model
    -- that writes 412.0 instead of 412 would otherwise raise.
    v_song_id := null;
    if jsonb_typeof(v_report -> 'song_id') = 'number' then
      select g.id into v_song_id
        from public.soundtrack_songs g
       where g.id = ((v_report ->> 'song_id')::numeric)::bigint
         and g.city_slug = v_slug;
      if v_song_id is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    insert into public.soundtrack_issues (city_slug, song_id, kind, severity, detail, suggestion, status)
    values (
      v_slug,
      v_song_id,
      v_kind,
      v_severity,
      left(v_detail, 600),
      left(nullif(btrim(v_report ->> 'suggestion'), ''), 600),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      -- Already open, or dismissed once and never coming back.
      v_skipped := v_skipped + 1;
    end if;

    if not (v_slug = any(v_slugs)) then
      v_slugs := array_append(v_slugs, v_slug);
    end if;
  end loop;

  -- Tapes the run says it audited, whether or not they produced a finding --
  -- a clean tape still counts as looked at, or the rotation would jam on it.
  if jsonb_typeof(payload -> 'audited') = 'array' then
    update public.soundtracks
       set last_audit_at = now()
     where city_slug in (
       select btrim(value) from jsonb_array_elements_text(payload -> 'audited')
     );
  else
    update public.soundtracks
       set last_audit_at = now()
     where city_slug = any(v_slugs);
  end if;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

comment on function public.tgb_report_soundtrack_issues(jsonb) is
  'Insert-only audit reporting for the daily routine, callable with the '
  'publishable key. Always writes status = open; cannot resolve or dismiss. '
  'Re-reporting an open or dismissed finding is a no-op. Max 40 per call.';

revoke all on function public.tgb_report_soundtrack_issues(jsonb) from public;
grant execute on function public.tgb_report_soundtrack_issues(jsonb) to anon, authenticated;
