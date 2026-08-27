-- A NEW TRACK NEEDS A SPOTIFY ID, AND NO TAPE MAY CARRY THE SAME ONE TWICE.
--
-- ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
--
-- TGB SOUNDTRACK BOT was told to read every track already on a tape, shelved
-- rows included, before proposing anything, so that it did not offer a song
-- that was already there. That is a burden on the routine for a rule the
-- database can simply hold, and a routine that has to enumerate before it can
-- act is one that spends its run on bookkeeping.
--
-- The rule moves here. The routine proposes; the database refuses a repeat.
--
-- ── THE UNIQUE IS PER TAPE, NOT GLOBAL, AND THAT WAS MEASURED ───────────────
--
-- Counted against the live table before choosing:
--
--   same id, on any tape   17 groups, 35 rows
--   same id, on ONE tape    0 groups,  0 rows
--
-- So a global unique index **cannot be created** without deleting 35 real rows,
-- and a per-tape one applies to the catalogue exactly as it stands. That is not
-- a coincidence: a song can genuinely belong to two cities, which is the same
-- argument that has always kept the title+artist tombstone scoped to the tape
-- rather than made global, and the reason the Tape Room has a Copy at all.
--
-- **If a global rule is ever wanted it is a product decision**, not a tidy-up:
-- it would mean no recording can appear on two cities' tapes, and 17 of them do
-- today.
--
-- ── NULL IS STILL ALLOWED, AND HAS TO BE ────────────────────────────────────
--
-- 202 of the 1,594 tracks carry no id. They are real rows a human may have
-- typed, and the public page falls back to a Spotify search for them. The index
-- is therefore PARTIAL: several nulls on one tape are not a duplicate, and
-- Postgres would treat them as distinct anyway.
--
-- What changes is only what may ARRIVE: the pull refuses a new track with no
-- id and files a finding saying so.
--
-- ── WHY REFUSE RATHER THAN FILE IT AND FLAG IT ──────────────────────────────
--
-- A fabricated 22-character id passes every eye and silently plays nothing,
-- which is why the brief has always said to omit an id rather than guess one.
-- The cost of that honesty was a track on the tape that cannot be played. A
-- refusal plus a finding keeps the honesty and moves the dead track off the
-- tape: the finding names the title and artist, so a human can find the id and
-- add the track by hand, and the tape stays short by one rather than carrying
-- something a visitor cannot hear.
--
-- APPLY BY HAND.

-- ── THE INDEX ───────────────────────────────────────────────────────────────

create unique index if not exists soundtrack_tape_spotify_key
  on public.soundtrack (city_slug, tape, spotify_id)
  where spotify_id is not null;

comment on index public.soundtrack_tape_spotify_key is
  'One recording once per tape. PARTIAL, so a tape may hold any number of tracks with no id at all. Deliberately NOT global: 17 spotify ids sit on more than one tape today and a song can genuinely belong to two cities.';

-- ── THE PULL ────────────────────────────────────────────────────────────────
--
-- SAME NAME AND SAME PAYLOAD. Only what it refuses has changed, so the brief's
-- worked example still stands and a run in flight cannot land on a function of
-- a different shape.
--
-- ITS CONSTANTS ARE STILL THE SECURITY and must not become parameters:
-- `archived` is always true, at most 4 tapes and 60 songs a call, and a
-- malformed id is dropped rather than stored.

create or replace function public.tgb_pull_soundtrack_songs(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tapes jsonb; v_tape jsonb; v_song jsonb;
  v_slug text; v_city text; v_name text; v_pos text;
  v_state_code text; v_state_name text; v_country_code text; v_country_name text;
  v_added int := 0; v_skipped int := 0; v_songs int := 0;
  v_no_id int := 0; v_dup int := 0; v_hit int;
  v_title text; v_artist text; v_spotify text; v_who text; v_fp text;
begin
  if jsonb_typeof(payload) = 'array' then v_tapes := payload;
  elsif jsonb_typeof(payload) = 'object' then v_tapes := coalesce(payload->'tapes', payload->'payload');
  end if;
  if v_tapes is null or jsonb_typeof(v_tapes) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of tape objects.');
  end if;
  if jsonb_array_length(v_tapes) > 4 then
    return jsonb_build_object('error', 'At most 4 tapes a call.');
  end if;

  for v_tape in select * from jsonb_array_elements(v_tapes) loop
    v_slug := nullif(btrim(coalesce(v_tape->>'city_slug', '')), '');
    v_city := nullif(btrim(coalesce(v_tape->>'city', '')), '');
    v_name := nullif(btrim(coalesce(v_tape->>'tape', v_tape->>'spine_tag', '')), '');
    v_pos  := nullif(btrim(coalesce(v_tape->>'tape_label_position', '')), '');
    v_state_code   := nullif(btrim(coalesce(v_tape->>'state_code', '')), '');
    v_state_name   := nullif(btrim(coalesce(v_tape->>'state_name', '')), '');
    v_country_code := nullif(btrim(coalesce(v_tape->>'country_code', '')), '');
    v_country_name := nullif(btrim(coalesce(v_tape->>'country_name', '')), '');
    if v_slug is null then v_skipped := v_skipped + 1; continue; end if;

    -- IF THE CITY ALREADY HOLDS TRACKS, ITS LABEL WINS. A run that sends a
    -- different spelling must not rewrite what is already filed, and it must
    -- not leave one city carrying two labels.
    select s.city, s.state_code, s.state_name, s.country_code, s.country_name
      into v_city, v_state_code, v_state_name, v_country_code, v_country_name
      from public.soundtrack s where s.city_slug = v_slug limit 1;
    if v_city is null then
      v_city := coalesce(nullif(btrim(coalesce(v_tape->>'city', '')), ''),
                         initcap(replace(v_slug, '-', ' ')));
      v_state_code   := nullif(btrim(coalesce(v_tape->>'state_code', '')), '');
      v_state_name   := nullif(btrim(coalesce(v_tape->>'state_name', '')), '');
      v_country_code := nullif(btrim(coalesce(v_tape->>'country_code', '')), '');
      v_country_name := nullif(btrim(coalesce(v_tape->>'country_name', '')), '');
    end if;

    -- AN ABSENT TAPE NAME MEANS THIS CITY'S EXISTING TAPE, not a new one.
    if v_name is null then
      select tape into v_name from public.soundtrack where city_slug = v_slug order by id limit 1;
      if v_name is null then v_skipped := v_skipped + 1; continue; end if;
    end if;

    for v_song in select * from jsonb_array_elements(coalesce(v_tape->'songs', '[]'::jsonb)) loop
      exit when v_songs >= 60;
      v_songs := v_songs + 1;

      v_title  := nullif(btrim(coalesce(v_song->>'title', '')), '');
      v_artist := nullif(btrim(coalesce(v_song->>'artist', '')), '');
      if v_title is null then
        v_skipped := v_skipped + 1; continue;
      end if;

      -- A MALFORMED ID IS THE SAME AS NO ID. It is never stored and never
      -- repaired into something plausible: a fabricated 22-character id passes
      -- every eye and silently plays nothing.
      v_spotify := case when coalesce(v_song->>'spotify_id', '') ~ '^[A-Za-z0-9]{22}$'
                        then v_song->>'spotify_id' else null end;

      v_who := v_title || case when v_artist is null then '' else ' by ' || v_artist end;

      -- ── NO ID, NO TRACK ────────────────────────────────────────────────
      -- Refused, and the refusal is FILED rather than merely counted: a number
      -- in a reply nobody reads afterwards is not something a human can act on.
      if v_spotify is null then
        v_no_id := v_no_id + 1;
        v_skipped := v_skipped + 1;
        -- PER SONG, not per tape, or five refusals on one tape would collapse
        -- into a single finding and four of them would be lost.
        v_fp := md5(v_slug || ':nospotify:' || lower(v_title) || ':' || lower(coalesce(v_artist, '')));
        insert into public.issues
          (area, kind, severity, scope, subject_id, subject_label,
           group_key, group_label, detail, suggestion, fingerprint, source)
        values
          ('soundtrack', 'spotify', 'warn', 'group', null, v_who,
           v_slug, v_name,
           v_who || ' was not filed: no Spotify id could be established for it, '
             || 'so the track would have been on the tape with nothing to play.',
           'Find the track on Spotify, press Share, and add it by hand in the '
             || 'Tape Room. If it genuinely is not on Spotify, there is nothing '
             || 'to do here and clearing this is the right answer.',
           v_fp, 'TGB SOUNDTRACK BOT')
        on conflict (area, fingerprint) do nothing;
        continue;
      end if;

      -- ── ONE RECORDING ONCE PER TAPE ────────────────────────────────────
      -- Tested before the insert rather than left to the index, so a repeat can
      -- be REPORTED as a repeat. The index is still what enforces it, for psql
      -- and the table editor and anything else that writes this table.
      if exists (select 1 from public.soundtrack s
                  where s.city_slug = v_slug and s.tape = v_name
                    and s.spotify_id = v_spotify) then
        v_dup := v_dup + 1;
        v_skipped := v_skipped + 1;
        continue;
      end if;

      insert into public.soundtrack
        (city_slug, city, state_code, state_name, country_code, country_name,
         tape, tape_label_position, position, title, artist, blurb,
         spotify_id, explicit, archived)
      values (v_slug, v_city, v_state_code, v_state_name, v_country_code, v_country_name,
              v_name, v_pos,
              nullif(btrim(coalesce(v_song->>'position', '')), '')::int,
              v_title, v_artist,
              nullif(btrim(coalesce(v_song->>'blurb', '')), ''),
              v_spotify,
              coalesce((v_song->>'explicit')::boolean, false),
              -- ALWAYS SHELVED. This constant is the security.
              true)
      on conflict do nothing;

      -- `found` AFTER `on conflict do nothing` IS NOT RELIABLE for this. The
      -- old version used it, so a row the title+artist tombstone refused was
      -- counted as added.
      get diagnostics v_hit = row_count;
      if v_hit > 0 then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
    end loop;
  end loop;

  -- `added` AND `skipped` ARE UNCHANGED, so nothing reading them broke. The two
  -- new figures say WHY a song was skipped, which is the thing the run needs in
  -- order to go and find a replacement.
  return jsonb_build_object('added', v_added, 'skipped', v_skipped,
                            'no_spotify_id', v_no_id, 'duplicate_spotify_id', v_dup);
end $function$;

grant execute on function public.tgb_pull_soundtrack_songs(jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The index took, which means no tape holds a repeat today:
--      select indexname from pg_indexes
--       where tablename = 'soundtrack' and indexname = 'soundtrack_tape_spotify_key';
-- 2. AN EMPTY PAYLOAD PROVES NOTHING. Send three songs against a real tape:
--    one with a good id, one with none, one repeating an id already on it.
--      -> {"added": 1, "skipped": 2, "no_spotify_id": 1, "duplicate_spotify_id": 1}
--    and a row in public.issues naming the one that had no id.
-- 3. Then remove the probe row and its finding.
