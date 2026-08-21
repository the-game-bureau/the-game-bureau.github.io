-- PARTNERS MOVE ONTO public.waypoints. public.partner_venues IS DROPPED.
--
-- APPLY BY HAND in the Supabase SQL editor, after 2026082001 and 2026082002.
--
-- ── WHY, AND WHAT CHANGED MY MIND ───────────────────────────────────────────
--
-- 2026082001 split this in two: the PLACE on waypoints, the RELATIONSHIP on a
-- private partner_venues. The reason given was that waypoints is anon-readable,
-- so a venue's contact details would be published to anyone holding the
-- publishable key.
--
-- THE OWNER'S ANSWER, ACCEPTED: a business's published contact line is not
-- private. It is a phone number and an enquiries address printed on the venue's
-- own website, gathered from the open internet, and republishing it is not a
-- disclosure. That is right, and it removes the whole basis for the split.
--
-- WHAT IS LEFT, STATED ONCE SO IT IS NOT A SURPRISE LATER. Two of these columns
-- are NOT gathered from the internet: `partner_status`, which records that we
-- telephoned somewhere and were turned down, and `partner_notes`, which is
-- whatever the person on the phone said. Those are our own words about a named
-- business and they are now readable by anyone with the publishable key. That
-- is a deliberate, informed trade for having one table; it is written here so
-- that whoever reads this next knows it was decided rather than overlooked.
--
-- ── WHAT ONE TABLE BUYS ─────────────────────────────────────────────────────
--
--   * One row per place, and a partner IS a place. No embed to read it, no
--     second PATCH to save it, no join to ask "is this venue a partner".
--   * A PARTNER CANDIDATE IS A WAYPOINT WITH `partner_status` SET. The column
--     being null is what "not a partner" means, so there is no second row whose
--     existence could disagree with the flag.
--   * `home_city` is GONE, because waypoints.city already is the city. That
--     column existed only because partner_venues could not see one.
--   * The coverage and dedupe readers no longer need SECURITY DEFINER to see
--     past RLS. They keep their names so the routine's prompt is unchanged.
--
-- ── NAMES ───────────────────────────────────────────────────────────────────
--
-- Every column is prefixed `partner_`. waypoints is a shared catalogue read by
-- the Path Builder, both engines and two routines, and a bare `status` or
-- `notes` on it would read as a property of the PLACE. The prefix says which
-- programme owns them.
--
-- `partner_game_date`, NOT `hunt_date`. The room's vocabulary settled on
-- 2026-08-20: our product is a GAME and the NFL match is the ANCHOR EVENT, so
-- our game runs the day before the anchor event. These are new columns, so they
-- get the right name rather than inheriting a word we have stopped using.

alter table public.waypoints
  add column if not exists partner_status text
    check (partner_status is null or partner_status in ('candidate', 'contacted', 'approved', 'declined')),
  add column if not exists partner_kind text
    check (partner_kind is null or partner_kind in ('game_end', 'game_start', 'watch_party')),
  add column if not exists partner_fandom text,
  add column if not exists partner_teams text[],
  add column if not exists partner_event_date date,
  add column if not exists partner_game_date date,
  add column if not exists partner_contact_name text,
  add column if not exists partner_contact_role text,
  add column if not exists partner_contact_email text,
  add column if not exists partner_contact_phone text,
  add column if not exists partner_contact_url text,
  add column if not exists partner_contact_source text,
  add column if not exists partner_why text,
  add column if not exists partner_notes text,
  add column if not exists partner_contacted_at timestamptz,
  add column if not exists partner_decided_at timestamptz;

comment on column public.waypoints.partner_status is
  'candidate -> contacted -> approved | declined. NULL means this place is not a '
  'partner candidate at all, which is what makes the column the flag as well as '
  'the state. One column rather than two booleans: approved-but-never-contacted '
  'is not a reachable state and a row in it could not be interpreted.';

comment on column public.waypoints.partner_teams is
  'Mascots of the clubs whose visiting fans this room could take. CAPABILITY, '
  'where partner_fandom is PROVENANCE (the one anchor event that made us look). '
  'Empty or null on a partner row means a general room that would take anybody, '
  'which covers its whole city on its own.';

comment on column public.waypoints.partner_game_date is
  'The day our GAME runs, which is the day before partner_event_date, the ANCHOR '
  'EVENT. Stored rather than derived so opening hours can be checked against the '
  'right evening.';

comment on column public.waypoints.partner_notes is
  'What a human learned on the phone. NOT gathered from the internet, and public '
  'through the publishable key like every other column here. See the migration.';

-- Partial, because five rows in five hundred are partners and every query this
-- serves filters on the column being set.
create index if not exists waypoints_partner_status_idx
  on public.waypoints (partner_status)
  where partner_status is not null;
create index if not exists waypoints_partner_teams_idx
  on public.waypoints using gin (partner_teams)
  where partner_status is not null;


-- ── CARRY THE EXISTING ROWS ACROSS ──────────────────────────────────────────
-- Guarded, so this migration is safe to run on a database that never had
-- partner_venues (a fresh clone, or one where 2026082001 was skipped).
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'partner_venues'
  ) then
    update public.waypoints w set
      partner_status         = p.status,
      partner_kind           = p.kind,
      partner_fandom         = p.visiting_fandom,
      partner_teams          = p.suggested_teams,
      partner_event_date     = p.event_date,
      partner_game_date      = p.hunt_date,
      partner_contact_name   = p.contact_name,
      partner_contact_role   = p.contact_role,
      partner_contact_email  = p.contact_email,
      partner_contact_phone  = p.contact_phone,
      partner_contact_url    = p.contact_url,
      partner_contact_source = p.contact_source_url,
      partner_why            = p.why,
      partner_notes          = p.notes,
      partner_contacted_at   = p.contacted_at,
      partner_decided_at     = p.decided_at
    from public.partner_venues p
    where p.wpid = w.wpid;
    raise notice 'partner_venues copied onto waypoints.';
  end if;
end $$;


-- ── THE STAMPS FOLLOW THE STATUS ────────────────────────────────────────────
-- Unchanged in behaviour from the partner_venues trigger, but it must now keep
-- its hands off every waypoint that is NOT a partner: this fires on all 470
-- rows and on every save the Path Builder makes.
create or replace function public.tgb_waypoints_partner_stamps()
returns trigger
language plpgsql
as $$
begin
  if new.partner_status is null then
    -- Not a partner row, or one being un-marked. Either way the stamps are
    -- meaningless, and leaving them would make a plain waypoint look like a
    -- venue somebody once rang.
    new.partner_contacted_at := null;
    new.partner_decided_at := null;
    return new;
  end if;

  if new.partner_status = 'candidate' then
    new.partner_contacted_at := null;
    new.partner_decided_at := null;
  elsif new.partner_status = 'contacted' then
    new.partner_contacted_at := coalesce(new.partner_contacted_at, now());
    new.partner_decided_at := null;
  else
    new.partner_contacted_at := coalesce(new.partner_contacted_at, now());
    new.partner_decided_at := coalesce(new.partner_decided_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_waypoints_partner_stamps on public.waypoints;
create trigger trg_waypoints_partner_stamps
  before insert or update on public.waypoints
  for each row execute function public.tgb_waypoints_partner_stamps();


-- ── THE TWO READERS, NOW READING waypoints ──────────────────────────────────
--
-- They keep their names and their reply shapes, so TGB PARTNER BOT's stored
-- prompt needs no edit. They are also no longer SECURITY DEFINER: waypoints is
-- anon-readable, so there is nothing to see past. A function that does not need
-- to elevate should not.

drop function if exists public.tgb_partner_cities();
create or replace function public.tgb_partner_cities()
returns table (city text, venue text, address text)
language sql
stable
as $$
  select w.city, w.name, w.address
    from public.waypoints w
   where w.partner_status is not null
   order by w.city, w.name;
$$;

revoke all on function public.tgb_partner_cities() from public;
grant execute on function public.tgb_partner_cities() to anon, authenticated;

drop function if exists public.tgb_partner_coverage();
create or replace function public.tgb_partner_coverage()
returns table (city text, team text, venues integer)
language sql
stable
as $$
  select w.city, t.team, count(*)::integer
    from public.waypoints w
    cross join lateral unnest(coalesce(w.partner_teams, '{}'::text[])) as t(team)
   where w.partner_status = 'approved'
     and w.partner_kind = 'game_end'
   group by w.city, t.team

  union all

  -- A general room names no teams, so it covers its whole city. team is null,
  -- and the routine reads that as "this city is done".
  select w.city, null::text, count(*)::integer
    from public.waypoints w
   where w.partner_status = 'approved'
     and w.partner_kind = 'game_end'
     and coalesce(array_length(w.partner_teams, 1), 0) = 0
   group by w.city

  order by 1, 2 nulls first;
$$;

revoke all on function public.tgb_partner_coverage() from public;
grant execute on function public.tgb_partner_coverage() to anon, authenticated;


-- ── THE WRITE PATH ──────────────────────────────────────────────────────────
--
-- STILL SECURITY DEFINER, and this is the one thing the merge does not change.
-- waypoints INSERT and UPDATE are granted to `authenticated` only, and a cloud
-- routine has no secret store: it authenticates with the publishable key, which
-- is `anon`. Without this doorway TGB PARTNER BOT cannot file anything at all.
--
-- THE CONSTANTS ARE UNCHANGED AND MUST STAY THAT WAY:
--   * partner_status is ALWAYS 'candidate' with no stamps. A ROUTINE CANNOT KNOW
--     A VENUE IS WILLING; willingness is a human on a telephone. A function that
--     let its caller write 'approved' would let an unattended agent invent
--     consent on behalf of a business nobody has spoken to.
--   * NFL host cities only. At most 12 a call.
--   * IT NEVER OVERWRITES AN EXISTING PARTNER. A place already carrying a
--     partner_status keeps every one of its partner columns, so a human's notes,
--     status and corrected contact details survive every later run.
--
-- ONE MORE THING THE MERGE CHANGES, and it needs care: a partner may land on a
-- waypoint THAT ALREADY EXISTS for an unrelated reason, a bar that is already a
-- stop on somebody's walk. That is now an UPDATE of a live catalogue row rather
-- than an insert into a side table, so it fills BLANKS ONLY on the place's own
-- columns and never touches name or description.

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
  v_canon text;
  v_event_date date;
  v_game_date date;
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
  v_was_partner boolean;
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

    -- Shape only. Whether the address exists is not knowable from here, which is
    -- exactly why the prompt forbids constructing one.
    if v_contact_email is not null and v_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_contact_email := null;
    end if;

    -- Matched against teams.mascot, canonical spelling taken from the table, and
    -- anything unmatched DROPPED and reported. "Packers", "Green Bay Packers"
    -- and "Packers fans" are three spellings of one club, and a coverage check
    -- comparing them by equality would call the city uncovered forever.
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
        v_canon := null;
      end loop;
    end if;
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
      v_game_date := nullif(btrim(coalesce(v_row->>'game_date', v_row->>'hunt_date')), '')::date;
    exception when others then v_game_date := null;
    end;
    -- OUR GAME RUNS THE DAY BEFORE THE ANCHOR EVENT. `hunt_date` is still
    -- accepted above, because the routine's stored prompt sends that key and a
    -- payload should not start failing over a word we changed on our own side.
    if v_game_date is null and v_event_date is not null then
      v_game_date := v_event_date - 1;
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

    select w.wpid, (w.partner_status is not null) into v_existing, v_was_partner
      from public.waypoints w
     where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
       and lower(btrim(coalesce(w.address, ''))) = lower(v_address)
     order by w.wpid
     limit 1;

    if v_existing is not null then
      v_wpid := v_existing;

      if v_was_partner then
        -- ALREADY A PARTNER: leave every partner column exactly as it is. A
        -- human may have telephoned this venue, corrected the manager's name and
        -- marked it declined, and a later run must not walk over any of that.
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'name', v_name, 'city', v_city, 'wpid', v_wpid, 'outcome', 'duplicate',
          'reason', 'this venue is already on file as a partner candidate'));
        continue;
      end if;

      -- A PLACE WE ALREADY HOLD, becoming a partner for the first time. Its own
      -- columns are filled BLANKS ONLY, because this is a live catalogue row
      -- that a path may already point at; the partner columns are all new.
      update public.waypoints w set
        city       = coalesce(w.city, v_city),
        state      = coalesce(w.state, v_state),
        zip        = coalesce(w.zip, v_zip),
        source_url = coalesce(w.source_url, v_source_url),
        ai_model   = coalesce(w.ai_model, v_ai_model),
        lat        = case when w.lat is null and w.lon is null then v_lat else w.lat end,
        lon        = case when w.lat is null and w.lon is null then v_lon else w.lon end,
        partner_status         = 'candidate',
        partner_kind           = v_kind,
        partner_fandom         = v_fandom,
        partner_teams          = v_teams,
        partner_event_date     = v_event_date,
        partner_game_date      = v_game_date,
        partner_contact_name   = v_contact_name,
        partner_contact_role   = v_contact_role,
        partner_contact_email  = v_contact_email,
        partner_contact_phone  = v_contact_phone,
        partner_contact_url    = v_contact_url,
        partner_contact_source = v_contact_source,
        partner_why            = v_why,
        partner_contacted_at   = null,
        partner_decided_at     = null
      where w.wpid = v_wpid;
    else
      insert into public.waypoints as w
        (name, city, state, zip, address, description, source_url, ai_model, lat, lon,
         partner_status, partner_kind, partner_fandom, partner_teams,
         partner_event_date, partner_game_date,
         partner_contact_name, partner_contact_role, partner_contact_email,
         partner_contact_phone, partner_contact_url, partner_contact_source, partner_why)
      values
        (v_name, v_city, v_state, v_zip, v_address, v_why, v_source_url, v_ai_model, v_lat, v_lon,
         'candidate', v_kind, v_fandom, v_teams,
         v_event_date, v_game_date,
         v_contact_name, v_contact_role, v_contact_email,
         v_contact_phone, v_contact_url, v_contact_source, v_why)
      returning w.wpid into v_wpid;
    end if;

    v_filed := v_filed + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'name', v_name, 'city', v_city, 'wpid', v_wpid, 'outcome', 'filed',
      'has_contact', (v_contact_email is not null or v_contact_phone is not null),
      'located', (v_lat is not null),
      'has_zip', (v_zip is not null),
      'suggested_teams', coalesce(to_jsonb(v_teams), 'null'::jsonb),
      'suggested_teams_dropped', coalesce(to_jsonb(nullif(v_dropped, '{}'::text[])), 'null'::jsonb)));
  end loop;

  return jsonb_build_object('filed', v_filed, 'results', v_results);
end;
$$;

revoke all on function public.tgb_pull_partner_candidates(jsonb) from public;
grant execute on function public.tgb_pull_partner_candidates(jsonb) to anon, authenticated;


-- ── AND THE OLD TABLE GOES ──────────────────────────────────────────────────
--
-- DROPPED, not retired in place, which is the opposite of what this project
-- usually does. The reason is that leaving it would leave a SECOND COPY of live
-- contact details and of our own notes, drifting from the moment the page stops
-- writing to it. An unread column costs nothing; an unread copy of the same
-- facts is the thing that eventually gets read by mistake.
--
-- It is a day old and nothing else references it. THE COPY ABOVE RUNS FIRST, so
-- check it landed before you run this line:
--
--   select wpid, name, partner_status, partner_contact_email
--     from public.waypoints where partner_status is not null order by wpid;

drop table if exists public.partner_venues;
drop function if exists public.tgb_partner_venues_touch();
