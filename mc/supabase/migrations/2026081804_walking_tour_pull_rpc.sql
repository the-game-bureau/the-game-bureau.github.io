-- tgb_pull_walking_tours(jsonb) -- the write path for PATH BOT.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHY THIS EXISTS AT ALL. A Claude Code cloud routine has no secret store, so it
-- authenticates with the ordinary PUBLIC publishable key. Writes to paths,
-- path_stops and waypoints are all granted to `authenticated` only, so a routine
-- cannot insert into any of them -- which is why the NFL Tour Builder commits
-- SQL to mc/supabase/tours/ for a human to run instead. PATH BOT is asked to
-- file its walks directly, so it needs the same SECURITY DEFINER doorway that
-- tgb_pull_book_candidates, tgb_pull_soundtrack_songs and
-- tgb_pull_socials_candidates already are, and it is built to the same shape:
-- INSERT-ONLY, tiny, and safe because of the constants it refuses to take as
-- parameters.
--
-- THE CONSTANTS. These are what make it safe to expose to anon. Do not add
-- parameters for any of them.
--
--   * There is NO arrival state. `archived` was dropped by 2026081806; every
--     waypoint this files goes straight into the library, ready to be walked.
--     It arrived SHELVED for a day, when a review room existed to approve it;
--     that room lasted an afternoon. What the column was really still doing was
--     acting as a do-not-rescrape tombstone, and PATH BOT's prompt does that job
--     now by reading the library before it searches.
--   * The city must be the CITY_NAME OF A MAJOR-LEAGUE CLUB -- NFL, NBA, MLB or
--     NHL. Not decoration: it is the whole scope of the routine's brief, and it
--     is the one check that stops an anon caller writing an arbitrary path into
--     this table. FOUR LEAGUES RATHER THAN ONE because PATH BOT works the NFL
--     first and then moves on to the other three, and a guard that only knew
--     about the NFL would refuse every tour it filed after the eighth division.
--     `public.teams` holds all four (32 + 30 + 30 + 32) plus 515 NCAAF
--     programs; college is deliberately NOT in this list, because an NCAAF
--     `fanbase` is a SCHOOL rather than a city and `city_name` on those rows is
--     not the same kind of answer.
--   * At most 4 tours a call, 4..15 stops each. The routine is asked for four.
--   * A COORDINATE PAIR IS KEPT ONLY AS A PAIR, and a nonsense one is dropped
--     rather than raised. See the stop loop.
--   * It never UPDATEs a description and never un-shelves a row.
--
-- WHAT IT IS NOT. It is not tgb_import_walking_tour, which stays exactly as it
-- is: SECURITY INVOKER, one tour, run by a human under their own admin session
-- from the Path Builder's paste box. The two write the same three tables and
-- share the reuse rule below; they differ in who is allowed to call them and how
-- much they will accept in one go.
--
-- MATCHING IS ON NAME + ADDRESS, NEVER ADDRESS ALONE -- the rule the importer
-- already carries and the reason it carries it: one address is routinely several
-- stops. 100 W 14th Ave Pkwy in Denver is the Denver Art Museum AND the Scottish
-- Angus Cow and Calf AND Big Sweep; 206 Washington St in Boston is the Old State
-- House AND the Boston Massacre Site. Address alone would silently merge places
-- that are genuinely different.
--
-- A REUSED PLACE KEEPS ITS DESCRIPTION. The incoming sentence is discarded and
-- the count says so. That is the accepted cost of one row per place: a stop
-- reads the same on every path it is on, and a path cannot quietly rewrite a
-- sentence another path depends on.

create or replace function public.tgb_pull_walking_tours(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tours jsonb;
  v_tour jsonb;
  v_entry jsonb;
  v_city text;
  v_state text;
  v_title text;
  v_shape text;
  v_ai_model text;
  v_source_url text;
  v_tour_id text;
  v_ord integer;
  v_name text;
  v_stop_city text;
  v_stop_state text;
  v_zip text;
  v_lat double precision;
  v_lon double precision;
  v_address text;
  v_description text;
  v_stop_source text;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
  v_created integer;
  v_reused integer;
  v_skipped integer;
  v_located integer;
  v_zipped integer;
  v_results jsonb := '[]'::jsonb;
  v_filed integer := 0;
begin
  -- A BARE ARRAY OR AN OBJECT WITH `tours`, both accepted, because the two
  -- callers spell it differently and neither spelling is wrong. Over HTTP
  -- PostgREST matches a top-level key to a PARAMETER NAME, so the routine posts
  -- {"payload": [...]}; called positionally in the SQL editor the argument is
  -- the array itself. That mismatch has already cost this project a fortnight of
  -- silently failing statements in the Tape Room's PROMPT dialog, so this one
  -- takes both rather than being right in one place and wrong in the other.
  if payload is null then
    raise exception 'Expected a JSON array of tour objects.';
  elsif jsonb_typeof(payload) = 'array' then
    v_tours := payload;
  elsif jsonb_typeof(payload) = 'object' and jsonb_typeof(payload->'tours') = 'array' then
    v_tours := payload->'tours';
  else
    raise exception 'Expected a JSON array of tour objects (or an object with a tours array).';
  end if;

  if jsonb_array_length(v_tours) = 0 then
    return jsonb_build_object('filed', 0, 'results', '[]'::jsonb);
  end if;
  if jsonb_array_length(v_tours) > 4 then
    raise exception 'At most 4 tours a call (got %).', jsonb_array_length(v_tours);
  end if;

  for v_tour in select value from jsonb_array_elements(v_tours)
  loop
    v_city       := nullif(btrim(v_tour->>'city'), '');
    v_state      := nullif(btrim(v_tour->>'state'), '');
    v_title      := nullif(left(btrim(coalesce(v_tour->>'title', '')), 200), '');
    v_shape      := nullif(btrim(lower(v_tour->>'shape')), '');
    v_ai_model   := nullif(left(btrim(coalesce(v_tour->>'ai_model', '')), 120), '');
    v_source_url := nullif(btrim(v_tour->>'source_url'), '');

    -- A REFUSED TOUR IS REPORTED, NOT RAISED. One bad city in a batch of four
    -- must not throw away the three good ones -- that is the lesson
    -- tgb_pull_socials_candidates learned when a row missing a blurb read as a
    -- duplicate story and sent the run off to find a replacement it did not
    -- need. Every branch below returns a reason the caller can act on.
    if v_city is null or v_title is null then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'invalid',
        'reason', 'a tour needs both a city and a title'));
      continue;
    end if;

    if v_shape is null or v_shape not in (
      'loop', 'out_and_back', 'point_to_point',
      'lollipop', 'figure_eight', 'horseshoe', 'network'
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'invalid',
        'reason', 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network'));
      continue;
    end if;

    -- THE MAJOR-LEAGUE GUARD. teams.city_name is the bare city ("New Orleans"),
    -- which is what paths.city and waypoints.city both hold; teams.fanbase is
    -- the legacy "New Orleans, LA" and must not be matched against.
    if not exists (
      select 1 from public.teams t
       where t.league in ('NFL', 'NBA', 'MLB', 'NHL')
         and lower(btrim(coalesce(t.city_name, ''))) = lower(v_city)
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'invalid',
        'reason', 'not the home city of an NFL, NBA, MLB or NHL club; this function files major-league-city walks only'));
      continue;
    end if;

    if jsonb_typeof(v_tour->'stops') <> 'array'
       or jsonb_array_length(v_tour->'stops') < 4
       or jsonb_array_length(v_tour->'stops') > 15 then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'invalid',
        'reason', 'a tour needs between 4 and 15 stops'));
      continue;
    end if;

    -- ONE WALK PER TITLE PER CITY. The routine reads public.paths before it
    -- searches, so a repeat here means two runs picked the same published tour
    -- -- which is likely, since the good ones are the ones everybody lists.
    -- Reported rather than filed, so the run can go and find another.
    if exists (
      select 1 from public.paths p
       where lower(btrim(coalesce(p.city, ''))) = lower(v_city)
         and lower(btrim(coalesce(p.title, ''))) = lower(v_title)
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'duplicate',
        'reason', 'this city already has a path with this title'));
      continue;
    end if;

    -- Readable and unique without a sequence: city, shape, and the SECOND.
    -- Seconds, not minutes: to the minute, two tours of one city and shape in a
    -- single call collide on the id and the second silently MERGES into the
    -- first, which produced a real twenty-stop "loop" in this table once.
    -- clock_timestamp(), not now(): now() is the transaction start and does not
    -- move between the four tours of one call.
    v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
                 || '-' || v_shape
                 || '-' || to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDD-HH24MISS');

    if exists (select 1 from public.paths p where p.tour_id = v_tour_id) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'city', v_city, 'title', v_title, 'outcome', 'duplicate',
        'reason', 'a path already holds the id ' || v_tour_id));
      continue;
    end if;

    insert into public.paths (tour_id, title, shape, city)
    values (v_tour_id, v_title, v_shape, v_city);

    v_ord := 0;
    v_created := 0;
    v_reused := 0;
    v_skipped := 0;
    v_located := 0;
    v_zipped := 0;

    -- Stops are taken IN ARRAY ORDER. Any walk_order on a stop is ignored: the
    -- array is the sequence, and trusting one over the other when they disagree
    -- is how a path ends up with two stop 4s.
    for v_entry in select value from jsonb_array_elements(v_tour->'stops')
    loop
      v_name        := nullif(left(btrim(coalesce(v_entry->>'name', '')), 200), '');
      if v_name is null then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      v_stop_city   := coalesce(nullif(btrim(v_entry->>'city'), ''), v_city);
      v_stop_state  := coalesce(nullif(btrim(v_entry->>'state'), ''), v_state);
      v_zip         := nullif(btrim(v_entry->>'zip'), '');
      -- COORDINATES ARE READ AS A PAIR AND KEPT AS A PAIR. A lat with no lon is
      -- not half a point, it is no point, and a row carrying one of the two
      -- would read as located everywhere the map looks at it. Out-of-range or
      -- unparseable values are DISCARDED rather than raised, the same way the
      -- soundtrack pull drops a malformed spotify_id: a plausible-but-wrong
      -- point is worse than a null, which the Path Builder already draws as
      -- "not located yet" and the Waypoints page geocodes on demand.
      begin
        v_lat := nullif(btrim(v_entry->>'lat'), '')::double precision;
        v_lon := nullif(btrim(v_entry->>'lon'), '')::double precision;
      exception when others then
        v_lat := null; v_lon := null;
      end;
      if v_lat is null or v_lon is null
         or v_lat < -90 or v_lat > 90 or v_lon < -180 or v_lon > 180
         -- 0,0 is Null Island, which is in the Gulf of Guinea and is never a
         -- walking-tour stop. It is what a failed parse looks like when it
         -- comes back as a number rather than as an error.
         or (v_lat = 0 and v_lon = 0) then
        v_lat := null; v_lon := null;
      end if;
      v_address     := nullif(btrim(v_entry->>'address'), '');
      v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
      v_stop_source := coalesce(nullif(btrim(v_entry->>'source_url'), ''), v_source_url);

      v_ord := v_ord + 1;
      v_existing := null;
      if v_lat is not null then v_located := v_located + 1; end if;
      if v_zip is not null then v_zipped := v_zipped + 1; end if;

      if v_address is not null then
        select w.wpid into v_existing
          from public.waypoints w
         where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
           and lower(btrim(coalesce(w.address, ''))) = lower(v_address)
         order by w.wpid
         limit 1;
      end if;

      if v_existing is not null then
        v_wpid := v_existing;
        v_reused := v_reused + 1;
        -- BLANKS ONLY, and never the description. Filling a blank is a gift;
        -- overwriting a value a human entered is not.
        update public.waypoints w set
          city       = coalesce(w.city, v_stop_city),
          state      = coalesce(w.state, v_stop_state),
          zip        = coalesce(w.zip, v_zip),
          source_url = coalesce(w.source_url, v_stop_source),
          ai_model   = coalesce(w.ai_model, v_ai_model),
          -- BOTH OR NEITHER, and only into a row that has neither. A held place
          -- whose point somebody has already corrected by dragging its pin must
          -- not be moved by an incoming guess, and writing one column of the
          -- pair would split a stored point across two sources.
          lat        = case when w.lat is null and w.lon is null then v_lat else w.lat end,
          lon        = case when w.lat is null and w.lon is null then v_lon else w.lon end
        where w.wpid = v_wpid;
      else
        insert into public.waypoints as w
          (name, city, state, zip, address, description, source_url, ai_model, lat, lon)
        values
          (v_name, v_stop_city, v_stop_state, v_zip, v_address, v_description, v_stop_source, v_ai_model, v_lat, v_lon)
        returning w.wpid into v_wpid;
        v_created := v_created + 1;
      end if;

      -- A PLACE MAY APPEAR TWICE ON A PATH; a POSITION may not. The key is
      -- (tour_id, ord) since 2026081801, so a loop can name the square it
      -- started from as its last stop. Named as a CONSTRAINT rather than as
      -- (tour_id, ord) out of the same habit tgb_import_walking_tour needs it:
      -- inside an index-inference clause plpgsql cannot always tell a function's
      -- own identifiers from the table's.
      insert into public.path_stops (tour_id, wpid, ord)
      values (v_tour_id, v_wpid, v_ord)
      on conflict on constraint path_stops_pkey do nothing;
    end loop;

    v_filed := v_filed + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'city', v_city,
      'title', v_title,
      'outcome', 'filed',
      'tour_id', v_tour_id,
      'stops', v_ord,
      'waypoints_created', v_created,
      'waypoints_reused', v_reused,
      'stops_skipped', v_skipped,
      -- REPORTED BACK so the run can see whether it actually did the geocoding
      -- half of its job. These count what ARRIVED on the payload, not what was
      -- stored: a reused place keeps the point it already had, so a low
      -- stops_located against a high waypoints_reused is fine and a low one
      -- against a high waypoints_created is the routine skipping the work.
      'stops_located', v_located,
      'stops_with_zip', v_zipped));
  end loop;

  return jsonb_build_object('filed', v_filed, 'results', v_results);
end;
$$;

comment on function public.tgb_pull_walking_tours(jsonb) is
  'PATH BOT''s write path. SECURITY DEFINER, insert-only, callable with the publishable key. Files up to 4 published walking tours a call into paths / path_stops / waypoints. The city must be the city_name of an NFL, NBA, MLB or NHL club, and the caps on tours and stops per call are fixed: those constants are what make it safe to expose to anon, so do not add parameters for them.';

revoke all on function public.tgb_pull_walking_tours(jsonb) from public;
grant execute on function public.tgb_pull_walking_tours(jsonb) to anon, authenticated;
