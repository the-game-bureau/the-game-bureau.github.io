-- public.partner_venues + tgb_pull_partner_candidates(jsonb)
--
-- APPLY BY HAND in the Supabase SQL editor. Remote migration history in this
-- project has drifted and the CLI refuses `db push`.
--
-- WHAT THIS IS FOR. A partner is a bar, brewery or other public food-and-drink
-- room that is willing to host visiting fans of a rival fandom, and the job we
-- want it for is being the LAST STOP of a scavenger hunt run the day before a
-- fixture. TGB PARTNER BOT reads the NFL schedule, works out which fandoms are
-- travelling to which city and when, finds plausible venues, and files them.
-- A human then contacts them; nothing here contacts anybody.
--
-- ── WHY THE CONTACT DETAILS ARE NOT COLUMNS ON public.waypoints ─────────────
--
-- The brief asked for these fields ON the waypoint. They cannot go there, and
-- the reason is not tidiness:
--
--   public.waypoints carries the policy "waypoints readable by anyone", a
--   SELECT granted to anon (20260617_create_waypoints.sql). The publishable key
--   is in the page source of every public page on this site.
--
-- So a manager's name, direct email and phone number written onto a waypoint is
-- published to anybody who views source. These are private businesses who have
-- not been asked yet, and "we have approached them and they said no" is an
-- internal editorial note of exactly the kind public.soundtrack_issues is
-- admin-only for. The place is public; the relationship is not.
--
-- THE SPLIT, THEREFORE:
--
--   public.waypoints        the PLACE. Name, address, city, point, source.
--                           One row per place, ever, exactly as before. No new
--                           columns, so nothing that reads the catalogue or
--                           draws the Path Builder's map changes.
--   public.partner_venues   the RELATIONSHIP. Keyed by wpid, admin-only, and
--                           the row's EXISTENCE is what denotes a partner
--                           candidate -- there is no boolean on the waypoint to
--                           drift out of step with it.
--
-- This also means a venue that becomes a partner is already a waypoint, so it
-- can be dropped onto the end of a path in the Path Builder with no import step.
-- That was the point of asking for it in waypoints, and it survives the split.
--
-- ── ONE STATUS, NOT TWO BOOLEANS ────────────────────────────────────────────
--
-- The brief asked for "a contacted field and an approved/denyed field". Two
-- flags can hold four states and only three of them are real: approved-but-
-- never-contacted is not a thing that can happen, and a row in that state is a
-- bug nobody can interpret later. One column walks the actual path:
--
--   candidate -> contacted -> approved
--                          -> declined
--
-- The two timestamps record WHEN, which is the part you actually want months
-- later ("did we ever hear back?"). A trigger keeps them honest so the stamps
-- cannot disagree with the status.
--
-- ── KIND, NOT A SECOND BOOLEAN ──────────────────────────────────────────────
--
-- The brief asked to denote GAME END CANDIDATE. That is a fact about what the
-- venue is FOR, and it is the first of several we can already name: a start
-- point, a watch party. `kind` holds it, so the next one is a value rather than
-- another boolean column and another migration.

create table if not exists public.partner_venues (
  wpid              integer primary key
                      references public.waypoints(wpid) on delete cascade,

  -- What we want the venue for. 'game_end' is the whole brief today.
  kind              text not null default 'game_end'
                      check (kind in ('game_end', 'game_start', 'watch_party')),

  status            text not null default 'candidate'
                      check (status in ('candidate', 'contacted', 'approved', 'declined')),

  -- WHY THIS VENUE, IN THIS CITY, FOR THESE FANS. A partner candidate is not a
  -- general recommendation: it is filed against a real fixture, because "who is
  -- visiting Denver in November" is the question that produced it.
  --
  -- visiting_fandom is the AWAY club whose travelling fans it is meant to hold,
  -- and it is nullable on purpose: one big sports room that will take anybody is
  -- a better partner than five single-club bars, and that row has no one fandom.
  visiting_fandom   text,
  home_city         text not null,
  -- The fixture, and the day the hunt would actually run, which is the day
  -- BEFORE it. Stored rather than derived so a venue's opening hours can be
  -- checked against the right evening.
  event_date        date,
  hunt_date         date,

  -- Contact. Every one of these is optional, and a blank is always better than
  -- a guess: a fabricated address at a real business puts our name on mail to a
  -- stranger. contact_source_url is where the details were read, which is what
  -- makes them checkable a month later when they have changed.
  contact_name      text,
  contact_role      text,
  contact_email     text,
  contact_phone     text,
  contact_url       text,
  contact_source_url text,

  -- The agent's own sentence on why this room suits away fans: size, screens,
  -- groups, a history of hosting supporters' clubs. Read by a human deciding
  -- whether to spend a phone call on it.
  why               text,
  -- Anything a human learns on the call. Never written by the routine.
  notes             text,

  ai_model          text,
  contacted_at      timestamptz,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.partner_venues is
  'Bars and similar rooms we might partner with to end a scavenger hunt the day '
  'before a fixture. One row per waypoint. ADMIN-ONLY: it holds named contacts '
  'at private businesses and our own record of who turned us down, which is why '
  'this is not columns on public.waypoints (that table is anon-readable).';

comment on column public.partner_venues.status is
  'candidate -> contacted -> approved | declined. One column rather than two '
  'booleans: approved-but-never-contacted is not a reachable state and a row in '
  'it could not be interpreted.';

create index if not exists partner_venues_city_idx
  on public.partner_venues (lower(home_city), status);
create index if not exists partner_venues_status_idx
  on public.partner_venues (status, created_at desc);

-- THE STAMPS FOLLOW THE STATUS, so the two can never disagree. Moving a row
-- forward stamps it; moving it back to candidate clears both, because "we have
-- not contacted them" and "we contacted them on the 4th" cannot both be true.
create or replace function public.tgb_partner_venues_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.status = 'candidate' then
    new.contacted_at := null;
    new.decided_at := null;
  elsif new.status = 'contacted' then
    new.contacted_at := coalesce(new.contacted_at, now());
    new.decided_at := null;
  else
    -- approved or declined: both imply the conversation happened.
    new.contacted_at := coalesce(new.contacted_at, now());
    new.decided_at := coalesce(new.decided_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_partner_venues_touch on public.partner_venues;
create trigger trg_partner_venues_touch
  before insert or update on public.partner_venues
  for each row execute function public.tgb_partner_venues_touch();

alter table public.partner_venues enable row level security;

-- NO ANON POLICY AT ALL, in either direction. Reads are admin-only because of
-- the contacts; writes are admin-only because the routine goes through the
-- SECURITY DEFINER function below, exactly as every other TGB routine does.
drop policy if exists "partner_venues read by authenticated" on public.partner_venues;
create policy "partner_venues read by authenticated"
  on public.partner_venues for select
  to authenticated using (true);

drop policy if exists "partner_venues write by authenticated" on public.partner_venues;
create policy "partner_venues write by authenticated"
  on public.partner_venues for all
  to authenticated using (true) with check (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- tgb_pull_partner_candidates(jsonb) -- the write path for TGB PARTNER BOT.
--
-- The sixth SECURITY DEFINER doorway of its kind, built to the shape the other
-- five already have. A Claude Code cloud routine has no secret store, so it
-- authenticates with the ordinary PUBLIC publishable key; writes to waypoints
-- and partner_venues are `authenticated` only, so without this it cannot file
-- anything at all.
--
-- THE CONSTANTS, which are what make it safe to expose to anon. DO NOT ADD
-- PARAMETERS FOR ANY OF THEM:
--
--   * status is ALWAYS 'candidate', and contacted_at / decided_at are always
--     null. A ROUTINE CANNOT KNOW A VENUE IS WILLING -- willingness is
--     established by a human picking up a phone, and a function that let its
--     caller write 'approved' would let an unattended agent invent consent.
--     This is the strongest reason of the six for the pattern.
--   * home_city must be the city_name of an NFL club. The brief is the NFL
--     season; this is also the check that stops an anon caller writing
--     arbitrary rows into an admin table.
--   * At most 12 venues a call.
--   * kind is clamped to the known list.
--   * It never UPDATEs an existing partner row, so a human's notes, status and
--     corrected contact details cannot be overwritten by a later run. A venue
--     already on file comes back as 'duplicate' and the routine is told to go
--     and find another.
--
-- MATCHING IS ON NAME + ADDRESS, never address alone -- the rule every importer
-- here carries, because one address is routinely several places.
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
  -- A BARE ARRAY OR AN OBJECT WITH `venues`. Over HTTP PostgREST matches a
  -- top-level key to a PARAMETER NAME, so the routine posts {"payload": [...]};
  -- called positionally in the SQL editor the argument is the array itself.
  -- That mismatch cost this project a fortnight of silently failing statements
  -- in the Tape Room's PROMPT dialog, so this one takes both.
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

    -- A REFUSED ROW IS REPORTED, NOT RAISED. One bad venue must not throw away
    -- the eleven good ones; that is the lesson tgb_pull_socials_candidates
    -- learned when a malformed row read as a duplicate and sent the run off to
    -- find a replacement it did not need.
    if v_name is null or v_city is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'outcome', 'invalid',
        'reason', 'a venue needs both a name and a city'));
      continue;
    end if;

    -- AN ADDRESS IS REQUIRED HERE, unlike a tour stop. A partner is somewhere a
    -- human has to telephone and a group of visitors has to find; a row without
    -- a street address is not actionable by either of them, and it is also the
    -- only half of the dedupe key we can rely on.
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

    -- AN EMAIL THAT IS NOT AN EMAIL IS DROPPED rather than raised, the same way
    -- the soundtrack pull drops a malformed spotify_id. The check is shape only:
    -- whether the address exists is not knowable from here, which is exactly why
    -- the prompt forbids guessing one.
    if v_contact_email is not null and v_contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_contact_email := null;
    end if;

    begin
      v_event_date := nullif(btrim(v_row->>'event_date'), '')::date;
    exception when others then v_event_date := null;
    end;
    begin
      v_hunt_date := nullif(btrim(v_row->>'hunt_date'), '')::date;
    exception when others then v_hunt_date := null;
    end;
    -- THE HUNT IS THE DAY BEFORE THE FIXTURE. Derived when the caller gave a
    -- fixture and no hunt date, so the one that matters for opening hours is
    -- always present.
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

    -- The PLACE: reuse the row if we already hold it, exactly as every other
    -- importer here does.
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

    -- ALREADY ON FILE MEANS LEAVE IT ALONE. `on conflict do nothing`, never an
    -- update: a human may have telephoned this venue, corrected the manager's
    -- name and marked it declined, and a later run must not walk over any of
    -- that. The routine is told to read the city first and to treat a duplicate
    -- as a sign to go and find a different room.
    insert into public.partner_venues as p
      (wpid, kind, status, visiting_fandom, home_city, event_date, hunt_date,
       contact_name, contact_role, contact_email, contact_phone, contact_url,
       contact_source_url, why, ai_model)
    values
      (v_wpid, v_kind, 'candidate', v_fandom, v_city, v_event_date, v_hunt_date,
       v_contact_name, v_contact_role, v_contact_email, v_contact_phone, v_contact_url,
       v_contact_source, v_why, v_ai_model)
    on conflict (wpid) do nothing;

    if found then
      v_filed := v_filed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'name', v_name, 'city', v_city, 'wpid', v_wpid, 'outcome', 'filed',
        'has_contact', (v_contact_email is not null or v_contact_phone is not null),
        'located', (v_lat is not null)));
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

comment on function public.tgb_pull_partner_candidates(jsonb) is
  'Insert-only doorway for TGB PARTNER BOT. Always files status=candidate with '
  'no timestamps: a routine cannot know a venue is willing, so it may not say '
  'so. Never updates an existing partner row. NFL host cities only, 12 a call.';


-- ─────────────────────────────────────────────────────────────────────────────
-- tgb_partner_cities() -- the narrow reader TGB PARTNER BOT uses to avoid
-- retracing itself.
--
-- WHY IT EXISTS. The routine cannot read partner_venues: that table is
-- admin-only, and it is admin-only precisely because it holds named contacts and
-- our own record of who declined. But a scout with no memory files the same bar
-- every twelve hours forever, and it would only find out at the insert, having
-- already spent the run researching it.
--
-- SO THIS RETURNS THE LEAST IT CAN: the city, the venue NAME and its address,
-- and nothing else. Name and address are exactly the dedupe key, so this is the
-- minimum that makes the check possible. NO contact_name, NO email, NO phone,
-- NO notes, and deliberately NO STATUS -- "we approached them and they said no"
-- is an editorial judgement, and anything this returns is effectively public
-- through the publishable key. Same shape and same reasoning as
-- tgb_socials_filed_urls.
--
-- STABLE, so PostgREST answers a plain GET as well as a POST.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tgb_partner_cities()
returns table (city text, venue text, address text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.home_city, w.name, w.address
    from public.partner_venues p
    join public.waypoints w on w.wpid = p.wpid
   order by p.home_city, w.name;
$$;

revoke all on function public.tgb_partner_cities() from public;
grant execute on function public.tgb_partner_cities() to anon, authenticated;

comment on function public.tgb_partner_cities() is
  'City, venue name and address of every partner candidate. The dedupe key and '
  'nothing more: no contacts, no notes and no status, because anything this '
  'returns is effectively public through the publishable key.';
