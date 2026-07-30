-- Daily soundtrack generator: a narrow, anon-callable entry point for the
-- scheduled Claude Code routine.
--
-- Background. Until 2026-07-29 the routine wrote sound/soundtracks.json and
-- committed it to main; git was its authentication. With the tapes in Supabase
-- it needs a write path, and a cloud routine has no secret store — a
-- service-role key would have to sit in the routine's stored prompt in
-- plaintext, visible in the routine UI and re-sent to the model every run.
--
-- Same answer as the gift-shop book pull (2026072802): one SECURITY DEFINER
-- wrapper granted to anon, called with the publishable key the website already
-- ships. Unlike the book pull, what this writes goes live immediately, matching
-- the behaviour it replaces — the routine used to commit straight to main and
-- new tapes appeared on /sound/ with nobody pressing anything. What keeps that
-- acceptable is how little the function can do:
--
--   * INSERT only. It cannot update or delete a song, cannot retire one, and
--     cannot touch any table other than these two.
--   * It cannot invent a city. city_slug must already exist in public.cities
--     and must not be hidden from /sound/, so the worst case is junk on a real
--     tape, not a tape for a town we do not sell into.
--   * It cannot rewrite existing copy. spine_tag is only applied when the tape
--     row is created; on an existing tape it is ignored.
--   * Every song lands archived = false. Tombstones stay an admin action —
--     that asymmetry is the point, since archiving is the destructive half.
--   * The (city_slug, title, artist) unique index still dedupes, so it cannot
--     flood a tape with copies of one track, and it can never resurrect a
--     retired song: the tombstone row wins the conflict.
--   * A malformed spotify_id is dropped rather than stored, and one call is
--     capped at 60 songs across at most 4 tapes.
--
-- Worst case for an abusive caller is a handful of junk songs on real tapes,
-- which an admin archives from the Tape Room. That is a much smaller blast
-- radius than a service-role key, which reads and writes every table and
-- bypasses all RLS.

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
-- Pin the schema: a SECURITY DEFINER function without this can be hijacked by a
-- caller-controlled search_path.
set search_path = public, pg_temp
as $$
#variable_conflict use_column
-- ^ Must be the first line of the body — the scanner reads these directives
-- before anything else. The RETURNS TABLE column names (action, city_slug,
-- title, artist, note) are also real column names on these tables, and PL/pgSQL
-- treats an OUT parameter as a variable everywhere in the body, so `on conflict
-- (city_slug)` otherwise raises 42702 "column reference city_slug is ambiguous".
-- It parses fine either way, so nothing catches that until the first real call.
-- Every genuine local here is v_-prefixed, so preferring the column is always
-- what we mean.
declare
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
  v_song_total integer := 0;
  v_city_ok boolean;
  v_rows integer;
begin
  if tapes is null or jsonb_typeof(tapes) <> 'array' then
    raise exception 'Expected a JSON array of tape objects.';
  end if;

  if jsonb_array_length(tapes) > 4 then
    raise exception 'Too many tapes in one call (% > 4).', jsonb_array_length(tapes);
  end if;

  -- Bound the whole call before writing anything. A run adds one 15-song tape
  -- plus a top-up; 60 is generous headroom and still nowhere near "flood the
  -- table".
  for v_tape in select value from jsonb_array_elements(tapes)
  loop
    if jsonb_typeof(v_tape->'songs') = 'array' then
      v_song_total := v_song_total + jsonb_array_length(v_tape->'songs');
    end if;
  end loop;
  if v_song_total > 60 then
    raise exception 'Too many songs in one call (% > 60).', v_song_total;
  end if;

  for v_tape in select value from jsonb_array_elements(tapes)
  loop
    v_slug := lower(nullif(btrim(v_tape->>'city_slug'), ''));

    if v_slug is null then
      return query select 'skipped'::text, null::text, null::text, null::text,
        'missing city_slug'::text;
      continue;
    end if;

    -- The city has to be a real, non-hidden destination. hide_from_soundtracks
    -- is the per-surface flag from 2026072901; the deprecated `ignored` column
    -- is deliberately not read here — a SQL reader, unlike the JS ones, can rely
    -- on the column existing, and naming `ignored` would break this function on
    -- the day it is finally dropped.
    select true
      into v_city_ok
      from public.cities c
     where c.slug = v_slug
       and coalesce(c.hide_from_soundtracks, false) = false
     limit 1;

    if not coalesce(v_city_ok, false) then
      return query select 'skipped'::text, v_slug, null::text, null::text,
        'unknown or hidden city_slug'::text;
      continue;
    end if;

    v_spine := nullif(left(btrim(coalesce(v_tape->>'spine_tag', '')), 40), '');
    v_spine_pos := lower(nullif(btrim(coalesce(v_tape->>'spine_tag_position', '')), ''));
    if v_spine_pos not in ('before', 'after') then
      v_spine_pos := null;
    end if;

    -- Creates the tape when it is new; leaves an existing tape's spine copy and
    -- archived flag exactly as a human left them.
    insert into public.soundtracks (city_slug, spine_tag, spine_tag_position)
    values (v_slug, v_spine, v_spine_pos)
    on conflict (city_slug) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      return query select 'tape_created'::text, v_slug, null::text, null::text, v_spine;
    end if;

    if jsonb_typeof(v_tape->'songs') <> 'array' then
      continue;
    end if;

    select coalesce(max(g.position), -1) + 1
      into v_next_position
      from public.soundtrack_songs g
     where g.city_slug = v_slug;

    for v_song in select value from jsonb_array_elements(v_tape->'songs')
    loop
      v_title := nullif(left(btrim(coalesce(v_song->>'title', '')), 200), '');
      v_artist := nullif(left(btrim(coalesce(v_song->>'artist', '')), 200), '');
      v_blurb := nullif(left(btrim(coalesce(v_song->>'blurb', '')), 200), '');
      -- Accept either casing of the key: the JSON file used spotifyId.
      v_spotify := btrim(coalesce(v_song->>'spotify_id', v_song->>'spotifyId', ''));
      if v_spotify !~ '^[A-Za-z0-9]{22}$' then
        v_spotify := null;
      end if;
      -- Compared as text rather than cast: a caller sending "yes" should get
      -- false, not a raised exception that loses the whole call.
      v_explicit := lower(btrim(coalesce(v_song->>'explicit', ''))) in ('true', 't', '1');

      if v_title is null or v_artist is null then
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'title and artist are both required'::text;
        continue;
      end if;

      -- archived is written false explicitly rather than left to the column
      -- default: it is one of the things that makes this safe to expose, so it
      -- must not follow a default a later migration could change. Do not add a
      -- parameter for it.
      insert into public.soundtrack_songs
        (city_slug, position, title, artist, blurb, spotify_id, explicit, archived)
      values
        (v_slug, v_next_position, v_title, v_artist, v_blurb, v_spotify, v_explicit, false)
      on conflict do nothing;

      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        -- Either already on the tape or sitting there as a tombstone. Both mean
        -- "do not add this song to this city", which is exactly the dedupe rule.
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'already on this tape (active or archived)'::text;
        continue;
      end if;

      v_next_position := v_next_position + 1;
      return query select 'inserted'::text, v_slug, v_title, v_artist,
        coalesce(v_spotify, 'no spotify id');
    end loop;
  end loop;
end;
$$;

comment on function public.tgb_pull_soundtrack_songs(jsonb) is
  'Anon-callable, SECURITY DEFINER. Insert-only: adds live songs (archived = '
  'false) to tapes for real, non-hidden public.cities slugs, creating the tape '
  'row if needed. Cannot update, delete, retire, or un-retire anything. Max 60 '
  'songs across 4 tapes per call. Called by the daily soundtrack Claude Code '
  'routine, which has no secret store.';

revoke all on function public.tgb_pull_soundtrack_songs(jsonb) from public;
grant execute on function public.tgb_pull_soundtrack_songs(jsonb) to anon, authenticated;
