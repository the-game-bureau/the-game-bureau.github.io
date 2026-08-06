-- Repair: finish the stops rekey, and re-assert the audit RPC.
--
-- What happened. An earlier draft of 2026073003 was run first, creating
-- public.stops keyed by GAME (game_id -> waypoint_id, challenge_id, ord, end)
-- and carrying 483 rows over from maps. The final version of that migration is
-- keyed by CITY, but its "create table if not exists" found the table already
-- there, skipped it, and every later statement that named city_slug failed:
--
--   ERROR: 42703: column "city_slug" of relation "public.stops" does not exist
--
-- So the table is the wrong shape and everything after that point -- the
-- carry-over, the policies, the game_stops view -- never ran.
--
-- The fix drops and rebuilds rather than ALTERing, because there is nothing to
-- preserve: all 483 rows were derived from public.maps by that same migration,
-- maps is untouched with 2656 rows, and public.challenges is empty, so no stop
-- carries a hand-authored challenge yet. Re-deriving reproduces them exactly.
--
-- Safe to re-run, and safe on a database where 2026073003 applied cleanly.

begin;

drop view if exists public.game_stops;
drop table if exists public.stops;

create table public.stops (
  id bigint generated always as identity primary key,
  city_slug text not null
    references public.cities (slug) on update cascade on delete cascade,
  waypoint_id bigint not null
    references public.waypoints (wpid) on update cascade,
  -- 1-based order within the city, carried over from maps.ord.
  ord integer not null default 0,
  -- Reusable, so a plain FK with no unique constraint. Nullable: the rows
  -- carried over below predate challenges entirely.
  challenge_id bigint
    references public.challenges (id) on update cascade on delete set null,
  -- TEXT 'YES'/'NO', matching what maps used and what the readers parse.
  "end" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stops is
  'One place plus one challenge, in a city. Every game in that city shares it. '
  'Supersedes public.maps, which keyed the same rows to a single game.';
comment on column public.stops.city_slug is
  'public.cities.slug. A stop is authored once per city, not once per game.';

create index if not exists stops_city_idx on public.stops (city_slug, ord);
create index if not exists stops_waypoint_idx on public.stops (waypoint_id);
create index if not exists stops_challenge_idx on public.stops (challenge_id)
  where challenge_id is not null;

-- One waypoint appears at most once in a city.
create unique index if not exists stops_city_waypoint_idx
  on public.stops (city_slug, waypoint_id);

drop trigger if exists stops_touch_updated_at on public.stops;
create trigger stops_touch_updated_at
before update on public.stops
for each row execute function public.tgb_touch_stops_updated_at();

-- Carry the routes over again, collapsing per-game rows onto one row per city.
-- Skips orphans (maps has no foreign keys) and games whose city is not in the
-- catalog; the lowest ord of a duplicated pair wins.
insert into public.stops (city_slug, waypoint_id, ord, "end")
select c.slug, m.waypoint_id, min(m.ord), max(m."end")
  from public.maps m
  join public.games g on g.id = m.game_id
  join public.cities c on c.city = g.city
  join public.waypoints w on w.wpid = m.waypoint_id
 group by c.slug, m.waypoint_id
on conflict do nothing;

alter table public.stops enable row level security;

drop policy if exists "Stops are publicly readable" on public.stops;
create policy "Stops are publicly readable"
  on public.stops for select using (true);

drop policy if exists "Admins can manage stops" on public.stops;
create policy "Admins can manage stops"
  on public.stops for all to authenticated using (true) with check (true);

grant select on public.stops to anon, authenticated;
grant insert, update, delete on public.stops to authenticated;

-- Stops projected per game, for everything that thinks in games.
create or replace view public.game_stops as
select
  g.id as game_id,
  s.id as stop_id,
  s.city_slug,
  s.waypoint_id,
  s.challenge_id,
  s.ord,
  s."end"
from public.games g
join public.cities c on c.city = g.city
join public.stops s on s.city_slug = c.slug;

comment on view public.game_stops is
  'public.stops projected per game via the game''s city. Read-only; write to '
  'public.stops, which is keyed by city_slug.';

grant select on public.game_stops to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2026073002 left public.soundtrack_issues, its stats view and every column in
-- place, but PostgREST answers the reporting RPC with PGRST202 -- either the
-- function never got created or its schema cache is stale. Re-asserting it is
-- idempotent and settles both cases; the reload at the end covers the cache.
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

commit;

-- PostgREST caches the schema; a new function or view is invisible until it
-- reloads. This is what makes the two above callable without waiting.
notify pgrst, 'reload schema';
