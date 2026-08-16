-- Address a TAPE, not a city: the pull RPC after 2026081601.
--
-- WHY THIS CANNOT WAIT. Two things in the old body stop working the moment a
-- city can hold several tapes, and both fail at RUN TIME rather than when the
-- migration is applied, so the first sign of either would have been a routine
-- run that inserted nothing:
--
--   1. `on conflict (city_slug) do nothing` raises "no unique or exclusion
--      constraint matching the ON CONFLICT specification" once city_slug is not
--      unique. Every call would abort on its first tape.
--   2. the next play position was read per CITY, which would start a city's
--      second tape at position 16.
--
-- Everything that bounds an anon caller is UNCHANGED and deliberately so:
-- SECURITY DEFINER, insert-only, always archived = true / certified_at = null /
-- rejected_at = null with no parameter for any of the three, the unknown-or-
-- hidden city refusal, the malformed spotify_id drop, and the 60-songs-across-
-- 4-tapes cap. Do not add a parameter for the three constants.
--
-- The CALLING SHAPE IS UNCHANGED: {city_slug, spine_tag, songs[]}. spine_tag
-- stopped being decoration and became part of the address, which is why the
-- prompts were changed the same day to pick songs for the tape's name.

create or replace function public.tgb_pull_soundtrack_songs(tapes jsonb)
returns table (
  action text,
  city_slug text,
  title text,
  artist text,
  note text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tape_id bigint;
  v_tape jsonb;
  v_song jsonb;
  v_slug text;
  v_spine text;
  v_spine_pos text;
  v_title text;
  v_artist text;
  v_blurb text;
  v_spotify text;
  v_explicit boolean;
  v_next_position integer;
  v_rows integer;
  v_tape_count integer := 0;
  v_song_count integer := 0;
begin
  if tapes is null or jsonb_typeof(tapes) <> 'array' then
    raise exception 'Expected a JSON array of tape objects.';
  end if;

  for v_tape in select value from jsonb_array_elements(tapes)
  loop
    v_tape_count := v_tape_count + 1;
    if v_tape_count > 4 then
      return query select 'skipped'::text, null::text, null::text, null::text,
        'more than 4 tapes in one call'::text;
      exit;
    end if;

    v_slug := nullif(btrim(v_tape->>'city_slug'), '');
    v_spine := nullif(btrim(v_tape->>'spine_tag'), '');
    v_spine_pos := nullif(btrim(v_tape->>'spine_tag_position'), '');

    if v_slug is null then
      return query select 'skipped'::text, null::text, null::text, null::text,
        'missing city_slug'::text;
      continue;
    end if;

    -- The city must exist and must not be hidden from /soundtracks/.
    if not exists (
      select 1 from public.cities c
       where c.slug = v_slug
         and coalesce(c.hide_from_soundtracks, c.ignored, false) is not true
    ) then
      return query select 'skipped'::text, v_slug, null::text, null::text,
        'unknown or hidden city_slug'::text;
      continue;
    end if;

    -- Find the tape, or create it. A city may now hold several, so "missing"
    -- means THIS CITY HAS NO TAPE BY THAT NAME rather than this city has no
    -- tape. An existing tape keeps its spine tag and its archived flag exactly
    -- as a human left them.
    --
    -- Matched case-insensitively, with a blank phrase and no phrase treated as
    -- the same tape: a caller that sends "" and a caller that sends nothing both
    -- mean the city's untitled tape, and letting those be two tapes would give
    -- every city a silent duplicate on the first run after this shipped.
    select s.id into v_tape_id
      from public.soundtracks s
     where s.city_slug = v_slug
       and lower(coalesce(btrim(s.spine_tag), '')) = lower(coalesce(v_spine, ''))
     order by s.created_at, s.id
     limit 1;

    if v_tape_id is null then
      insert into public.soundtracks (city_slug, spine_tag, spine_tag_position)
      values (v_slug, v_spine, v_spine_pos)
      returning id into v_tape_id;
    end if;

    -- Play order is per tape, not per city. Reading it per city would start a
    -- second Denver tape at position 16.
    select coalesce(max(s.position), 0) + 1 into v_next_position
      from public.soundtrack_songs s
     where s.tape_id = v_tape_id;

    for v_song in select value from jsonb_array_elements(coalesce(v_tape->'songs', '[]'::jsonb))
    loop
      v_song_count := v_song_count + 1;
      if v_song_count > 60 then
        return query select 'skipped'::text, v_slug, null::text, null::text,
          'more than 60 songs in one call'::text;
        exit;
      end if;

      v_title := nullif(btrim(v_song->>'title'), '');
      v_artist := nullif(btrim(v_song->>'artist'), '');
      v_blurb := nullif(btrim(v_song->>'blurb'), '');
      v_spotify := nullif(btrim(v_song->>'spotify_id'), '');
      -- A malformed id is dropped rather than stored: a fabricated 22-char id
      -- passes the CHECK and silently plays nothing, so no id is better.
      if v_spotify is not null and v_spotify !~ '^[A-Za-z0-9]{22}$' then
        v_spotify := null;
      end if;
      v_explicit := coalesce((v_song->>'explicit')::boolean, false);

      if v_title is null or v_artist is null then
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'title and artist are both required'::text;
        continue;
      end if;

      -- archived = true, certified_at = null, rejected_at = null: a REVIEW
      -- candidate. All three are written explicitly, never defaulted, and none
      -- of them takes a parameter. That is what bounds an anon caller.
      insert into public.soundtrack_songs
        (tape_id, position, title, artist, blurb, spotify_id, explicit,
         archived, certified_at, rejected_at)
      values
        (v_tape_id, v_next_position, v_title, v_artist, v_blurb, v_spotify, v_explicit,
         true, null, null)
      on conflict do nothing;

      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'already on this tape (live, in review, or shelved)'::text;
        continue;
      end if;

      v_next_position := v_next_position + 1;
      return query select 'queued'::text, v_slug, v_title, v_artist,
        coalesce(v_spotify, 'no spotify id');
    end loop;
  end loop;
end;
$$;
