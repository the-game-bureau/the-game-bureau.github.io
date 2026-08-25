-- tgb_pull_anchor_events(jsonb) -- the write path for TGB ANCHOR BOT.
--
-- The seventh SECURITY DEFINER pull, and it exists for the reason all six
-- others do: `public.events` is writable by `authenticated` only, and a cloud
-- routine has no secret store. Without a doorway the routine could read the
-- table and not write it, which is the "prompt whose output is a file" pattern
-- this repo has deleted four times.
--
-- ── WHY NOT REUSE tgb_pull_concert_tours ─────────────────────────────────────
--
-- That one hardcodes `kind = 'concert'` and `source = 'SeatGeek'`, and those
-- constants are its security: they are what makes it safe to hand to `anon`. It
-- physically cannot file a football game, and widening it would mean turning its
-- two safest constants into parameters. **Never do that.** A second function
-- with its own, wider-but-still-closed set of constants is the right shape.
--
-- ── WHAT IS STILL CONSTANT HERE, AND IT IS STILL THE SECURITY ────────────────
--
--   * `status` is always 'scheduled'. A caller cannot file something as final.
--   * `end_date` defaults to `start_date` (the trigger does it; this passes null
--     and lets it).
--   * The city must already be in `public.cities`.
--   * The date must be in the future.
--   * `kind` must be one of the six the page knows.
--   * At most 60 rows a call.
--
-- 60 RATHER THAN 10, because the brief is "as many as it can". That is a bigger
-- number than any other pull here and it is still a CAP: an anon caller cannot
-- write the table in one request, and a routine that wants more makes more
-- calls and reads the reply each time.
--
-- ── NO DUPLICATES, AND THE ID IS NOT ENOUGH ──────────────────────────────────
--
-- `on conflict (id) do nothing` catches a re-run of the same call. It does NOT
-- catch the same fixture filed under two different ids, which is exactly what
-- happens when one run reads it from SeatGeek and the next reads it from a
-- league site. So this also refuses a row that matches an existing one on
-- **(start_date, venue_city, and either the title or both club nicknames)**.
--
-- THAT NATURAL KEY IS DELIBERATELY NOT (date, city) ALONE. Two different
-- concerts in one city on one night is ordinary, and so is a doubleheader.
--
-- ── CAPACITY IS NOT ENFORCED HERE, AND CANNOT BE ─────────────────────────────
--
-- The brief is venues seating 10,000 or more. **The database does not know how
-- big a venue is**, and inventing a capacity column that only a routine ever
-- writes would be a fact nobody could check. It is a rule in the prompt, where
-- the run can actually verify it against the venue's own page. If capacity ever
-- needs to be queryable it should be a column on a VENUES table, which does not
-- exist yet.
--
-- APPLY BY HAND in the SQL editor.
--
-- IT DEPENDS ON 2026082502 having been applied: it writes start_date, venue and
-- venue_city, which do not exist under those names before it.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'events' and column_name = 'start_date'
  ) then
    raise exception 'public.events has no start_date. Run 2026082502_events_columns_match_the_page.sql first.';
  end if;
end $$;

create or replace function public.tgb_pull_anchor_events(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows      jsonb;
  v_row       jsonb;
  v_results   jsonb := '[]'::jsonb;
  v_inserted  int := 0;
  v_skipped   int := 0;
  v_id        text;
  v_kind      text;
  v_title     text;
  v_desc      text;
  v_league    text;
  v_sport     text;
  v_venue     text;
  v_city      text;
  v_url       text;
  v_source    text;
  v_away_geo  text;
  v_away_nick text;
  v_home_geo  text;
  v_home_nick text;
  v_neutral   boolean;
  v_date      date;
  v_end       date;
  v_time      time;
  v_outcome   text;
  v_reason    text;
  v_kinds constant text[] := array['sports','concert','convention','festival','expo','other'];
begin
  -- A BARE ARRAY OR A WRAPPER. Over HTTP PostgREST matches a top-level key to a
  -- PARAMETER NAME, so the routine posts {"payload": [...]}; called positionally
  -- in the SQL editor the argument is the array itself. That mismatch already
  -- cost this project a fortnight of silently failing statements in the Tape
  -- Room's PROMPT dialog, so this accepts both rather than being right in one
  -- place and wrong in the other.
  if jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' then
    v_rows := coalesce(payload -> 'events', payload -> 'payload', payload -> 'rows');
  end if;

  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of event objects.');
  end if;

  if jsonb_array_length(v_rows) > 60 then
    return jsonb_build_object('error', 'At most 60 events a call. Send them in batches and read each reply.');
  end if;

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_outcome := null;
    v_reason  := null;

    v_id        := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
    v_kind      := lower(nullif(btrim(coalesce(v_row ->> 'kind', '')), ''));
    v_title     := nullif(btrim(coalesce(v_row ->> 'title', '')), '');
    v_desc      := nullif(btrim(coalesce(v_row ->> 'description', '')), '');
    v_league    := nullif(btrim(coalesce(v_row ->> 'league', '')), '');
    v_sport     := nullif(btrim(coalesce(v_row ->> 'sport', '')), '');
    v_venue     := nullif(btrim(coalesce(v_row ->> 'venue', '')), '');
    v_city      := nullif(btrim(coalesce(v_row ->> 'venue_city', '')), '');
    v_url       := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_source    := nullif(btrim(coalesce(v_row ->> 'source', '')), '');
    v_away_geo  := nullif(btrim(coalesce(v_row ->> 'away_team_geo', '')), '');
    v_away_nick := nullif(btrim(coalesce(v_row ->> 'away_team_nickname', '')), '');
    v_home_geo  := nullif(btrim(coalesce(v_row ->> 'home_team_geo', '')), '');
    v_home_nick := nullif(btrim(coalesce(v_row ->> 'home_team_nickname', '')), '');
    v_neutral   := coalesce((v_row ->> 'neutral_site')::boolean, false);

    begin
      v_date := nullif(btrim(coalesce(v_row ->> 'start_date', '')), '')::date;
    exception when others then
      v_date := null;
    end;
    begin
      v_end := nullif(btrim(coalesce(v_row ->> 'end_date', '')), '')::date;
    exception when others then
      v_end := null;
    end;
    begin
      v_time := nullif(btrim(coalesce(v_row ->> 'start_time', '')), '')::time;
    exception when others then
      v_time := null;
    end;

    -- ── Refusals, each one saying what to do about it ──────────────────────
    if v_id is null or v_title is null then
      v_outcome := 'invalid'; v_reason := 'Every row needs an id and a title.';
    elsif v_date is null then
      v_outcome := 'invalid'; v_reason := 'Missing or unreadable start_date. Use YYYY-MM-DD.';
    elsif v_date < current_date then
      -- The likeliest way a scrape goes wrong: an archive page reads exactly
      -- like a listings page.
      v_outcome := 'invalid'; v_reason := 'That date has already passed. Check you are not reading an archive page.';
    elsif v_end is not null and v_end < v_date then
      v_outcome := 'invalid'; v_reason := 'end_date is before start_date.';
    elsif v_kind is null or not (v_kind = any(v_kinds)) then
      v_outcome := 'invalid'; v_reason := 'kind must be one of: ' || array_to_string(v_kinds, ', ') || '.';
    elsif v_city is null then
      v_outcome := 'invalid'; v_reason := 'Every row needs a venue_city.';
    elsif not exists (select 1 from public.cities c where lower(btrim(c.city)) = lower(v_city)) then
      -- NOT A BUG TO WORK AROUND. The catalogue is the one city list the whole
      -- site reads, and an event in a town nothing else knows about cannot be
      -- shopped, soundtracked or built on. Named so a human can add it.
      v_outcome := 'unknown_city';
      v_reason  := v_city || ' is not in public.cities. Add it on the Cities page, then this event can be filed.';
    end if;

    -- ── The natural-key duplicate check ────────────────────────────────────
    if v_outcome is null then
      if exists (
        select 1 from public.events e
         where e.start_date = v_date
           and lower(btrim(coalesce(e.venue_city, ''))) = lower(v_city)
           and (
                 lower(btrim(coalesce(e.title, ''))) = lower(v_title)
              or (v_away_nick is not null and v_home_nick is not null
                  and lower(btrim(coalesce(e.away_team_nickname, ''))) = lower(v_away_nick)
                  and lower(btrim(coalesce(e.home_team_nickname, ''))) = lower(v_home_nick))
               )
      ) then
        v_outcome := 'duplicate';
        v_reason  := 'Already filed for that date and city, possibly under a different id.';
        v_skipped := v_skipped + 1;
      end if;
    end if;

    if v_outcome is null then
      insert into public.events as e (
        id, kind, title, description,
        league, sport,
        start_date, end_date, start_time,
        venue, venue_city, neutral_site,
        away_team_geo, away_team_nickname, home_team_geo, home_team_nickname,
        status, url, source
      ) values (
        v_id, v_kind, v_title, v_desc,
        v_league, v_sport,
        v_date, v_end, v_time,
        v_venue, v_city, v_neutral,
        v_away_geo, v_away_nick, v_home_geo, v_home_nick,
        'scheduled', v_url, coalesce(v_source, 'TGB ANCHOR BOT')
      )
      on conflict (id) do nothing;

      if found then
        v_outcome := 'inserted';
        v_inserted := v_inserted + 1;
      else
        v_outcome := 'duplicate';
        v_reason  := 'That id is already in the table.';
        v_skipped := v_skipped + 1;
      end if;
    elsif v_outcome <> 'duplicate' then
      v_skipped := v_skipped + 1;
    end if;

    -- ONE BAD ROW MUST NOT THROW AWAY THE GOOD ONES. Reported per row and
    -- raising on nothing, the lesson tgb_pull_socials_candidates learned when a
    -- row missing a blurb read as a duplicate story and sent the run off to
    -- find a replacement it did not need.
    v_results := v_results || jsonb_build_object(
      'id', v_id, 'outcome', v_outcome, 'reason', v_reason
    );
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'results', v_results
  );
end;
$$;

grant execute on function public.tgb_pull_anchor_events(jsonb) to anon, authenticated;

comment on function public.tgb_pull_anchor_events(jsonb) is
  'Insert-only doorway for TGB ANCHOR BOT. Always status=scheduled; kind limited to the six the page knows; city must exist in public.cities; date must be future; at most 60 a call; refuses a duplicate on id AND on (start_date, venue_city, title or both club nicknames). Those constants are what make it safe to expose to anon: never turn one into a parameter.';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- An empty payload answers {"inserted": 0} whether or not the body works, and
-- this project has been caught by exactly that twice. Make it do its job.
--
-- 1. A real row, filed:
--
--    select public.tgb_pull_anchor_events('[{
--      "id": "ANCHOR-PROBE-1", "kind": "concert", "title": "Probe Tour",
--      "venue_city": "Chicago, Illinois", "venue": "United Center",
--      "start_date": "2027-07-04", "start_time": "20:00",
--      "source": "probe"
--    }]'::jsonb);
--    -- expect {"inserted": 1, "skipped": 0, ...}
--
--    select id, kind, status, start_date, end_date, venue, venue_city,
--           venue_state_code
--      from public.events where id = 'ANCHOR-PROBE-1';
--    -- expect concert / scheduled / 2027-07-04 / 2027-07-04 (the trigger) /
--    --        United Center / Chicago, Illinois / IL (the geo trigger)
--
-- 2. THE NATURAL KEY, which is the half `on conflict (id)` cannot do. Same
--    event, DIFFERENT id, as a second source would report it:
--
--    select public.tgb_pull_anchor_events('[{
--      "id": "ANCHOR-PROBE-2", "kind": "concert", "title": "Probe Tour",
--      "venue_city": "Chicago, Illinois", "venue": "United Center",
--      "start_date": "2027-07-04"
--    }]'::jsonb);
--    -- expect outcome "duplicate", inserted 0
--
-- 3. Two different concerts in one city on one night are NOT duplicates:
--
--    select public.tgb_pull_anchor_events('[{
--      "id": "ANCHOR-PROBE-3", "kind": "concert", "title": "A Different Act",
--      "venue_city": "Chicago, Illinois", "venue": "Aragon Ballroom",
--      "start_date": "2027-07-04"
--    }]'::jsonb);
--    -- expect inserted 1
--
-- 4. Each refusal, by name:
--
--    select public.tgb_pull_anchor_events('[
--      {"id":"P4","kind":"concert","title":"Past","venue_city":"Chicago, Illinois","start_date":"2020-01-01"},
--      {"id":"P5","kind":"opera","title":"Bad kind","venue_city":"Chicago, Illinois","start_date":"2027-07-04"},
--      {"id":"P6","kind":"concert","title":"Nowhere","venue_city":"Atlantis, Ocean","start_date":"2027-07-04"},
--      {"id":"P7","kind":"concert","venue_city":"Chicago, Illinois","start_date":"2027-07-04"}
--    ]'::jsonb);
--    -- expect invalid / invalid / unknown_city / invalid, inserted 0
--
-- 5. The cap:
--
--    select public.tgb_pull_anchor_events(
--      (select jsonb_agg(jsonb_build_object('id','X'||g,'kind','other','title','X',
--         'venue_city','Chicago, Illinois','start_date','2027-07-04'))
--         from generate_series(1,61) g));
--    -- expect {"error": "At most 60 events a call. ..."}
--
-- 6. Tidy up:
--
--    delete from public.events where id in
--      ('ANCHOR-PROBE-1','ANCHOR-PROBE-2','ANCHOR-PROBE-3');
