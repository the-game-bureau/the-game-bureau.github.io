-- The pull RPC under two states. Run with 2026081603.
--
-- Two changes, both about the same thing: nothing reaches /soundtracks/ because
-- a routine ran.
--
--   1. A song is inserted with archived = true and NOTHING ELSE about status.
--      certified_at and rejected_at were retired by 2026081603; the old body
--      wrote both explicitly on every insert, so it would have kept filling
--      columns nobody reads.
--   2. A NEW TAPE is created shelved as well. It used to be created live, which
--      was harmless while it was always empty on arrival, and stops being
--      harmless the moment a human keeps one track on it.
--
-- Everything else is unchanged and deliberately so: SECURITY DEFINER,
-- insert-only, the unknown-or-hidden city refusal, the malformed spotify_id
-- drop, the 60-songs-across-4-tapes cap, and the per-tape addressing added in
-- 2026081602. THE ONE REMAINING CONSTANT, archived = true, is now the whole of
-- what makes this safe to expose to anon. Do not give it a parameter.

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
      -- A NEW TAPE STARTS SHELVED TOO, matching MANUAL in the Tape Room and the
      -- songs about to land on it: nothing reaches /soundtracks/ because a
      -- routine ran. The insert cannot cascade, because
      -- soundtracks_cascade_archive fires on UPDATE of archived, so a tape born
      -- shelved never stamps anything archived_with_tape and restoring it later
      -- brings back only what it genuinely took down.
      insert into public.soundtracks (city_slug, spine_tag, spine_tag_position, archived)
      values (v_slug, v_spine, v_spine_pos, true)
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

      -- archived = true: SHELVED, off /soundtracks/ until a human presses Keep.
      -- It is written EXPLICITLY rather than left to the column default, and it
      -- takes no parameter. That single constant is now the whole of what bounds
      -- an anon caller, where it used to be three: certified_at and rejected_at
      -- were retired by 2026081603 and are no longer written by anything.
      insert into public.soundtrack_songs
        (tape_id, position, title, artist, blurb, spotify_id, explicit, archived)
      values
        (v_tape_id, v_next_position, v_title, v_artist, v_blurb, v_spotify, v_explicit,
         true)
      on conflict do nothing;

      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'already on this tape (kept or shelved)'::text;
        continue;
      end if;

      v_next_position := v_next_position + 1;
      return query select 'queued'::text, v_slug, v_title, v_artist,
        coalesce(v_spotify, 'no spotify id');
    end loop;
  end loop;
end;
$$;
