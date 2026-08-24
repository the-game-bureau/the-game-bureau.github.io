-- tgb_pull_concert_tours(jsonb) -- the write path for TGB CONCERT BOT.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHY THIS EXISTS AT ALL. A Claude Code cloud routine has no secret store, so it
-- authenticates with the ordinary PUBLIC publishable key, and writes to
-- public.anchor_events are granted to `authenticated` only. Without a doorway
-- like this one the routine can read the table and not write it -- which is the
-- state that produced four deleted "research assistant" pages in this repo,
-- each of them writing a file nobody imported. This is the sixth SECURITY
-- DEFINER pull, built to the same shape as the other five: INSERT-ONLY, tiny,
-- and safe because of the constants it refuses to take as parameters.
--
-- THE CONSTANTS. These are what make it safe to expose to anon. DO NOT ADD
-- PARAMETERS FOR ANY OF THEM.
--
--   * `kind` IS ALWAYS 'concert'. The routine's whole brief is concert tours,
--     and a caller that could name its own kind could write anything into the
--     table a game is built from.
--   * `status` IS ALWAYS 'scheduled'. A tour date being announced is the only
--     thing this files; a result is a human's to record.
--   * `end_date` IS ALWAYS `event_date`. A concert is one evening. The column's
--     own rule since 2026082301 is that a single-day event ends the day it
--     starts, and this makes that true at the point of writing rather than
--     leaning on the trigger.
--   * `source` IS ALWAYS 'SeatGeek'. It is a statement about where the row came
--     from, so the caller does not get to claim a provenance it does not have.
--   * At most 10 events a call. That is the routine's per-run count, and the
--     cap is what stops a single call filling the table.
--
-- WHAT IT REFUSES, and why each refusal is here rather than left to the caller:
--
--   * A row with no title, no date or no city. All three are what makes an
--     anchor event usable -- a game is played the day before it, in that city --
--     and a row missing any of them is one somebody has to come back and fix.
--   * A date in the past. This files ANNOUNCED tours; a date already gone is a
--     scrape of an archive page, which is the likeliest way this goes wrong.
--   * A city that is not in public.cities. THIS ONE IS DELIBERATELY A REFUSAL
--     RATHER THAN A SILENT INSERT: the catalogue is the one city list the whole
--     site reads, and a tour date in a town nothing else knows about is a row
--     that cannot be shopped, soundtracked or built on. The reply names the
--     city so the routine can report it, and a human adds it on the Cities page.
--
-- IT REPORTS PER ROW AND RAISES ON NOTHING. One bad date in ten must not throw
-- away the nine good ones -- the lesson tgb_pull_socials_candidates learned when
-- a row missing a blurb read as a duplicate story and sent a run off to find a
-- replacement it did not need.

create or replace function public.tgb_pull_concert_tours(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows      jsonb;
  v_row       jsonb;
  v_id        text;
  v_title     text;
  v_city      text;
  v_venue     text;
  v_date      date;
  v_time      time;
  v_url       text;
  v_desc      text;
  v_results   jsonb := '[]'::jsonb;
  v_inserted  integer := 0;
  v_skipped   integer := 0;
  v_outcome   text;
  v_reason    text;
  v_hit       integer;
begin
  -- A BARE ARRAY OR AN OBJECT WITH `events`, both accepted, because the two
  -- callers spell it differently and neither spelling is wrong. Over HTTP
  -- PostgREST matches a top-level key to a PARAMETER NAME, so a routine posts
  -- {"payload": [...]}; called positionally in the SQL editor the argument is
  -- the array itself. That mismatch has already cost this project a fortnight
  -- of silently failing statements in the Tape Room's PROMPT dialog.
  if payload is null then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'results', '[]'::jsonb,
                              'error', 'No payload.');
  end if;

  if jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' and payload ? 'events' then
    v_rows := payload -> 'events';
  else
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'results', '[]'::jsonb,
                              'error', 'Expected a JSON array of event objects, or an object with an "events" array.');
  end if;

  if jsonb_typeof(v_rows) <> 'array' then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'results', '[]'::jsonb,
                              'error', 'Expected a JSON array of event objects.');
  end if;

  if jsonb_array_length(v_rows) > 10 then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'results', '[]'::jsonb,
                              'error', 'At most 10 events a call.');
  end if;

  for v_row in select * from jsonb_array_elements(v_rows)
  loop
    v_outcome := null;
    v_reason  := null;

    v_id    := nullif(btrim(coalesce(v_row ->> 'id', '')), '');
    v_title := nullif(btrim(coalesce(v_row ->> 'title', '')), '');
    v_city  := nullif(btrim(coalesce(v_row ->> 'city', '')), '');
    v_venue := nullif(btrim(coalesce(v_row ->> 'venue_name', '')), '');
    v_url   := nullif(btrim(coalesce(v_row ->> 'url', '')), '');
    v_desc  := nullif(btrim(coalesce(v_row ->> 'description', '')), '');

    -- A malformed date is DROPPED rather than raised, the way the soundtrack
    -- pull drops a malformed spotify_id: one bad row must not take the call.
    begin
      v_date := nullif(btrim(coalesce(v_row ->> 'event_date', '')), '')::date;
    exception when others then
      v_date := null;
    end;

    begin
      v_time := nullif(btrim(coalesce(v_row ->> 'start_time', '')), '')::time;
    exception when others then
      v_time := null;
    end;

    if v_id is null then
      v_outcome := 'invalid'; v_reason := 'No id.';
    elsif v_title is null then
      v_outcome := 'invalid'; v_reason := 'No title. A concert row has no clubs to be named from.';
    elsif v_date is null then
      v_outcome := 'invalid'; v_reason := 'No usable event_date.';
    elsif v_date < current_date then
      v_outcome := 'invalid'; v_reason := 'event_date ' || v_date || ' has already passed.';
    elsif v_city is null then
      v_outcome := 'invalid'; v_reason := 'No city.';
    else
      -- THE CITY MUST BE ONE THE SITE ALREADY KNOWS. Compared trimmed and
      -- lowercased, the same comparison the Anchor Events page and the Cities
      -- page both use -- they disagreed once, exactly-vs-lowercased, and a
      -- finding said UNKNOWN on one page while the other said ALREADY THERE.
      select count(*) into v_hit
        from public.cities c
       where lower(btrim(c.city)) = lower(v_city);

      if v_hit = 0 then
        v_outcome := 'unknown_city';
        v_reason  := v_city || ' is not in public.cities. Add it on the Cities page, then this date can be filed.';
      end if;
    end if;

    if v_outcome is null then
      insert into public.anchor_events as ae (
        id, kind, title, description,
        event_date, end_date, start_time,
        venue_name, city,
        status, url, source
      ) values (
        v_id, 'concert', v_title, v_desc,
        v_date, v_date, v_time,
        v_venue, v_city,
        'scheduled', v_url, 'SeatGeek'
      )
      on conflict (id) do nothing;

      if found then
        v_outcome := 'inserted';
        v_inserted := v_inserted + 1;
      else
        -- Already filed. Not an error: a tour announced last week is still
        -- announced this week, and the routine is told to expect these.
        v_outcome := 'duplicate';
        v_skipped := v_skipped + 1;
      end if;
    else
      v_skipped := v_skipped + 1;
    end if;

    v_results := v_results || jsonb_build_object(
      'id', v_id,
      'outcome', v_outcome,
      'reason', v_reason
    );
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'results', v_results
  );
end;
$$;

grant execute on function public.tgb_pull_concert_tours(jsonb) to anon, authenticated;

comment on function public.tgb_pull_concert_tours(jsonb) is
  'Insert-only doorway for TGB CONCERT BOT. Always kind=concert, status=scheduled, '
  'source=SeatGeek, end_date=event_date; at most 10 a call; refuses a past date '
  'and a city not in public.cities. Reports per row and raises on nothing.';

-- ── Verify ──────────────────────────────────────────────────────────────────
-- IT IS ONLY PROVED BY A CALL THAT MAKES IT DO ITS JOB. An empty payload
-- answers {"inserted": 0} and looks perfectly healthy while the body is broken;
-- this project has been caught by exactly that twice. Send a real row.
--
--   select public.tgb_pull_concert_tours(jsonb_build_array(jsonb_build_object(
--     'id', 'CONCERT-TEST-PROBE',
--     'title', 'Probe Tour',
--     'city', (select city from public.cities limit 1),
--     'venue_name', 'Somewhere',
--     'event_date', (current_date + 30)::text,
--     'start_time', '20:00',
--     'url', 'https://seatgeek.com/',
--     'description', 'A probe row.'
--   )));
--   -- expect {"inserted": 1, ...} and outcome "inserted"
--   select id, kind, status, source, event_date, end_date
--     from public.anchor_events where id = 'CONCERT-TEST-PROBE';
--   -- expect concert / scheduled / SeatGeek / end_date = event_date
--   delete from public.anchor_events where id = 'CONCERT-TEST-PROBE';
--
-- And prove the two refusals, which are the whole safety argument:
--   select public.tgb_pull_concert_tours(jsonb_build_array(jsonb_build_object(
--     'id', 'X', 'title', 'T', 'city', 'Nowhereville, Nowhere',
--     'event_date', (current_date + 1)::text)));
--   -- expect outcome "unknown_city"
--   select public.tgb_pull_concert_tours(jsonb_build_array(jsonb_build_object(
--     'id', 'Y', 'title', 'T', 'city', (select city from public.cities limit 1),
--     'event_date', (current_date - 1)::text)));
--   -- expect outcome "invalid", reason naming the passed date

-- ── Rollback ────────────────────────────────────────────────────────────────
--   drop function if exists public.tgb_pull_concert_tours(jsonb);
-- Nothing else reads it; rows it has already written are ordinary anchor events
-- and stay.
