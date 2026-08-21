-- partner_venues.suggested_teams + tgb_partner_coverage() + a rewritten pull RPC
--
-- APPLY BY HAND in the Supabase SQL editor, after 2026082001.
--
-- THREE CHANGES, one reason each:
--
--  1. `suggested_teams text[]` -- WHICH TEAMS' FANS COULD USE THIS ROOM, which
--     is a different question from `visiting_fandom` and the more useful one.
--     `visiting_fandom` is PROVENANCE: the fixture that made us go looking, one
--     club, fixed forever. `suggested_teams` is CAPABILITY: everybody this room
--     could take, which is what you actually want when a different club comes to
--     town in November. A big neutral sports bar has one `visiting_fandom` and
--     eight suggested teams; a Packers supporters' club bar has one of each.
--
--  2. `tgb_partner_coverage()` -- so a run can SKIP a city and team we have
--     already sorted out. Without it the routine re-researches Denver-for-
--     Packers every day forever, and the only thing stopping the write is the
--     duplicate check at the very end, by which point the run is spent.
--
--  3. The pull RPC gains `suggested_teams`. It is a FULL REWRITE of the
--     function, not a patch, because `create or replace` replaces the whole
--     body -- the lesson 2026081302 taught this project when it rebuilt
--     tgb_pull_socials_candidates' INSERT list and silently dropped
--     `confidence`, which then went unwritten for five days with nothing
--     erroring. Every column 2026082001 wrote is carried forward below; check
--     the INSERT list against the table before replacing this again.

alter table public.partner_venues
  add column if not exists suggested_teams text[];

comment on column public.partner_venues.suggested_teams is
  'Mascots of the clubs whose visiting fans this room could take, e.g. '
  '{Packers,Bears}. CAPABILITY, where visiting_fandom is PROVENANCE (the one '
  'fixture that made us look). Empty or null means a general room that would '
  'take anybody, which is the strongest kind of partner and covers its whole '
  'city on its own.';

-- Coverage is asked per city and per team, so index the city and let the array
-- be scanned; these are tens of rows, not millions.
create index if not exists partner_venues_suggested_teams_idx
  on public.partner_venues using gin (suggested_teams);


-- ─────────────────────────────────────────────────────────────────────────────
-- tgb_partner_coverage() -- what is already SORTED, so a run can skip it.
--
-- Returns one row per (city, team) that already has an APPROVED game_end
-- partner, plus one row with team = null per city that has an approved GENERAL
-- room. A general room takes anybody, so it covers its whole city on its own,
-- and the routine is told to read a null team that way.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN, and why this is not the same decision as
-- tgb_partner_cities():
--
--   * ONLY 'approved'. Not contacted, not declined. "We rang this bar and they
--     said no" is the single most sensitive thing in the table and it is an
--     editorial judgement about a named business; anything an anon-callable
--     function returns is effectively public through the publishable key. A
--     DECLINED venue must therefore still be re-findable by the routine, and it
--     is: tgb_partner_cities() carries it as a name and address with no status,
--     so the bot will not refile it without learning why.
--   * No venue name, no address, no contacts. The routine needs to know that a
--     pair is COVERED, not who covers it.
--
-- So the worst an outsider learns is "somewhere in Denver will host Packers
-- fans", which is a thing we would happily put on the website.
--
-- STABLE, so PostgREST answers a plain GET as well as a POST.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tgb_partner_coverage()
returns table (city text, team text, venues integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Named rooms: one row per (city, team) the approved venue names.
  select p.home_city, t.team, count(*)::integer
    from public.partner_venues p
    cross join lateral unnest(coalesce(p.suggested_teams, '{}'::text[])) as t(team)
   where p.status = 'approved'
     and p.kind = 'game_end'
   group by p.home_city, t.team

  union all

  -- General rooms: no suggested teams at all, so they cover the whole city.
  -- team is null, and the routine reads that as "this city is done".
  select p.home_city, null::text, count(*)::integer
    from public.partner_venues p
   where p.status = 'approved'
     and p.kind = 'game_end'
     and coalesce(array_length(p.suggested_teams, 1), 0) = 0
   group by p.home_city

  order by 1, 2 nulls first;
$$;

revoke all on function public.tgb_partner_coverage() from public;
grant execute on function public.tgb_partner_coverage() to anon, authenticated;

comment on function public.tgb_partner_coverage() is
  'City and team pairs that already have an APPROVED game-end partner, so a run '
  'can skip them. A null team is a general room, which covers its whole city. '
  'Approved only: contacted and declined are never exposed.';


-- ─────────────────────────────────────────────────────────────────────────────
-- tgb_pull_partner_candidates(jsonb) -- FULL REWRITE, carrying every column
-- 2026082001 wrote, plus suggested_teams. See the header note.
--
-- THE CONSTANTS ARE UNCHANGED and must stay that way. status is always
-- 'candidate' with no timestamps, because A ROUTINE CANNOT KNOW A VENUE IS
-- WILLING; NFL host cities only; at most 12 a call; never updates a row already
-- on file.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tgb_pull_partner_candidates(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
  v_row jsonb;
  v_name text;
  v_city text;
  v_state text;
  v_zip text;
  v_address text;
  v_lat double precision;
  v_lon double precision;
  v_kind text;
  v_fandom text;
  v_teams text[];
  v_teams_in text[];
  v_dropped text[];
  v_team text;
  v_event_date date;
  v_hunt_date date;
  v_why text;
  v_contact_name text;
  v_contact_role text;
  v_contact_email text;
  v_contact_phone text;
  v_contact_url text;
  v_contact_source text;
  v_source_url text;
  v_ai_model text;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
  v_results jsonb := '[]'::jsonb;
  v_filed integer := 0;
begin
  if payload is null then
    raise exception 'Expected a JSON array of venue objects.';
  elsif jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' and jsonb_typeof(payload->'venues') = 'array' then
    v_rows := payload->'venues';
  else
    raise exception 'Expected a JSON array of venue objects (or an object with a venues array).';
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return jsonb_build_object('filed', 0, 'results', '[]'::jsonb);
  end if;
  if jsonb_array_length(v_rows) > 12 then
    raise exception 'At most 12 venues a call (got %).', jsonb_array_length(v_rows);
  end if;

  for v_row in select value from jsonb_array_elements(v_rows)
  loop
    v_name    := nullif(left(btrim(coalesce(v_row->>'name', '')), 200), '');
    v_city    := nullif(btrim(v_row->>'city'), '');
    v_address := nullif(btrim(v_row->>'address'), '');

    if v_name is null or v_city is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'outcome', 'invalid',
        'reason', 'a venue needs both a name and a city'));
      continue;
    end if;

    if v_address is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'outcome', 'invalid',
        'reason', 'a partner venue needs a street address'));
      continue;
    end if;

    if not exists (
      select 1 from public.teams t
       where t.league = 'NFL'
         and lower(btrim(coalesce(t.city_name, ''))) = lower(v_city)
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'outcome', 'invalid',
        'reason', 'not the home city of an NFL club; this function files NFL host-city venues only'));
      continue;
    end if;

    v_kind := lower(coalesce(nullif(btrim(v_row->>'kind'), ''), 'game_end'));
    if v_kind not in ('game_end', 'game_start', 'watch_party') then
      v_kind := 'game_end';
    end if;

    v_state          := nullif(btrim(v_row->>'state'), '');
    v_zip            := nullif(btrim(v_row->>'zip'), '');
    v_fandom         := nullif(left(btrim(coalesce(v_row->>'visiting_fandom', '')), 120), '');
    v_why            := nullif(left(btrim(coalesce(v_row->>'why', '')), 700), '');
    v_contact_name   := nullif(left(btrim(coalesce(v_row->>'contact_name', '')), 160), '');
    v_contact_role   := nullif(left(btrim(coalesce(v_row->>'contact_role', '')), 120), '');
    v_contact_email  := nullif(left(btrim(coalesce(v_row->>'contact_email', '')), 200), '');
    v_contact_phone  := nullif(left(btrim(coalesce(v_row->>'contact_phone', '')), 60), '');
    v_contact_url    := nullif(btrim(v_row->>'contact_url'), '');
    v_contact_source := nullif(btrim(v_row->>'contact_source_url'), '');
    v_source_url     := nullif(btrim(v_row->>'source_url'), '');
    v_ai_model       := nullif(left(btrim(coalesce(v_row->>'ai_model', '')), 120), '');

    if v_contact_email is not null and v_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_contact_email := null;
    end if;

    -- SUGGESTED TEAMS ARE MATCHED AGAINST public.teams.mascot AND ANYTHING ELSE
    -- IS DROPPED, with the drops REPORTED rather than swallowed. The value is
    -- only useful if it is the same string every time: "Packers", "Green Bay
    -- Packers" and "Packers fans" are three spellings of one club, and a
    -- coverage check that compares them by equality would call the city
    -- uncovered forever. Reporting the drops is what stops that being invisible
    -- -- the routine is told to check the count and fix its spelling.
    v_teams := '{}'::text[];
    v_dropped := '{}'::text[];
    if jsonb_typeof(v_row->'suggested_teams') = 'array' then
      select array_agg(x) into v_teams_in
        from (
          select distinct btrim(value) as x
            from jsonb_array_elements_text(v_row->'suggested_teams')
           where btrim(value) <> ''
        ) s;
      foreach v_team in array coalesce(v_teams_in, '{}'::text[])
      loop
        -- Take the CANONICAL spelling out of the table rather than the caller's,
        -- so the array is uniform however it arrived.
        declare v_canon text;
        begin
          select t.mascot into v_canon
            from public.teams t
           where t.league = 'NFL'
             and lower(btrim(t.mascot)) = lower(v_team)
           limit 1;
          if v_canon is null then
            v_dropped := v_dropped || v_team;
          elsif not (v_canon = any (v_teams)) then
            v_teams := v_teams || v_canon;
          end if;
        end;
      end loop;
    end if;
    -- A general room is an EMPTY array, stored as null, and that is a real
    -- answer rather than a missing one: it is what tgb_partner_coverage() reads
    -- as "covers the whole city".
    if coalesce(array_length(v_teams, 1), 0) = 0 then
      v_teams := null;
    elsif array_length(v_teams, 1) > 8 then
      v_teams := v_teams[1:8];
    end if;

    begin
      v_event_date := nullif(btrim(v_row->>'event_date'), '')::date;
    exception when others then v_event_date := null;
    end;
    begin
      v_hunt_date := nullif(btrim(v_row->>'hunt_date'), '')::date;
    exception when others then v_hunt_date := null;
    end;
    if v_hunt_date is null and v_event_date is not null then
      v_hunt_date := v_event_date - 1;
    end if;

    begin
      v_lat := nullif(btrim(v_row->>'lat'), '')::double precision;
      v_lon := nullif(btrim(v_row->>'lon'), '')::double precision;
    exception when others then
      v_lat := null; v_lon := null;
    end;
    if v_lat is null or v_lon is null
       or v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180
       or (v_lat = 0 and v_lon = 0) then
      v_lat := null; v_lon := null;
    end if;

    select w.wpid into v_existing
      from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.address, ''))) = lower(v_address)
     order by w.wpid
     limit 1;

    if v_existing is not null then
      v_wpid := v_existing;
      update public.waypoints w set
        city       = coalesce(w.city, v_city),
        state      = coalesce(w.state, v_state),
        zip        = coalesce(w.zip, v_zip),
        source_url = coalesce(w.source_url, v_source_url),
        ai_model   = coalesce(w.ai_model, v_ai_model),
        lat        = case when w.lat is null and w.lon is null then v_lat else w.lat end,
        lon        = case when w.lat is null and w.lon is null then v_lon else w.lon end
      where w.wpid = v_wpid;
    else
      insert into public.waypoints as w
        (name, city, state, zip, address, description, source_url, ai_model, lat, lon)
      values
        (v_name, v_city, v_state, v_zip, v_address, v_why, v_source_url, v_ai_model, v_lat, v_lon)
      returning w.wpid into v_wpid;
    end if;

    insert into public.partner_venues as p
      (wpid, kind, status, visiting_fandom, suggested_teams, home_city, event_date, hunt_date,
       contact_name, contact_role, contact_email, contact_phone, contact_url,
       contact_source_url, why, ai_model)
    values
      (v_wpid, v_kind, 'candidate', v_fandom, v_teams, v_city, v_event_date, v_hunt_date,
       v_contact_name, v_contact_role, v_contact_email, v_contact_phone, v_contact_url,
       v_contact_source, v_why, v_ai_model)
    on conflict (wpid) do nothing;

    if found then
      v_filed := v_filed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'wpid', v_wpid, 'outcome', 'filed',
        'has_contact', (v_contact_email is not null or v_contact_phone is not null),
        'located', (v_lat is not null),
        'suggested_teams', coalesce(to_jsonb(v_teams), 'null'::jsonb),
        'suggested_teams_dropped', coalesce(to_jsonb(nullif(v_dropped, '{}'::text[])), 'null'::jsonb)));
    else
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'wpid', v_wpid, 'outcome', 'duplicate',
        'reason', 'this venue is already on file as a partner candidate'));
    end if;
  end loop;

  return jsonb_build_object('filed', v_filed, 'results', v_results);
end;
$$;

revoke all on function public.tgb_pull_partner_candidates(jsonb) from public;
grant execute on function public.tgb_pull_partner_candidates(jsonb) to anon, authenticated;
