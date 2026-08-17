-- NO SPINE PHRASE MEANS "THIS CITY'S TAPE", NOT "THE UNTITLED TAPE".
--
-- WHAT WENT WRONG. 2026081602 made the pull RPC address a tape by city PLUS
-- spine phrase, and treated an absent phrase and a blank one as the same thing:
-- both matched the tape whose spine_tag is null. That is right for a caller
-- creating a tape and wrong for every caller topping one up, because the
-- routine only ever sends spine_tag when it believes it is making a NEW tape.
--
-- So a top-up of Jacksonville looked for Jacksonville's UNTITLED tape, found
-- none (its tape is called "Jams"), and dutifully created one. On 2026-08-16 it
-- produced a second Jacksonville row holding three tracks, one of which reached
-- /soundtracks/ because 2026081603 and 2026081604 had not been applied yet.
--
-- THE FIX IS TO DISTINGUISH ABSENT FROM BLANK, which jsonb can do and
-- `->>` cannot: `payload ? 'spine_tag'` asks whether the key is there at all.
--
--   key absent          -> address this city's EXISTING tape, oldest first,
--                          and create one only if the city has none
--   key present, named  -> address the tape with that phrase, create if missing
--   key present, blank  -> same as absent: a caller that sent "" has not named
--                          anything, and the alternative is a nameless second
--                          tape appearing beside a named one
--
-- WHAT THIS IS NOT. It is not a reason to restore the unique index on
-- city_slug. A city holding several tapes is deliberate (see 2026081601), and
-- the index would only have turned this into an error rather than a duplicate:
-- the RPC would still have been asking for the wrong tape. Naming a second tape
-- is now the ONLY way to get one, which is the property that was wanted.

begin;

-- ------------------------------------------------ merge the tape it created --
-- Tape 93's three tracks move to tape 71 rather than being deleted with it: two
-- are shelved tombstones worth keeping and one is live. Positions continue from
-- 71's highest, and the pair (title, artist) was checked against 71 first, so
-- nothing collides with soundtrack_songs_tape_title_artist_key.
--
-- Guarded on both ids still looking the way they did, so re-running this file
-- after a manual clean-up is a no-op rather than a surprise.
do $$
declare v_next integer;
begin
  if exists (select 1 from public.soundtracks where id = 93 and city_slug = 'jacksonville')
     and exists (select 1 from public.soundtracks where id = 71 and city_slug = 'jacksonville')
  then
    select coalesce(max(position), 0) into v_next
      from public.soundtrack_songs where tape_id = 71;

    update public.soundtrack_songs s
       set tape_id = 71,
           position = v_next + t.rn
      from (select id, row_number() over (order by position, id) as rn
              from public.soundtrack_songs where tape_id = 93) t
     where s.id = t.id;

    delete from public.soundtracks where id = 93;
    raise notice 'merged tape 93 into 71';
  end if;
end $$;

commit;

-- ============================================================================
-- The RPC itself. Everything that bounds an anon caller is unchanged:
-- SECURITY DEFINER, insert-only, archived = true written explicitly with no
-- parameter, the unknown-or-hidden city refusal, the malformed spotify_id drop,
-- and the 60-songs-across-4-tapes cap.

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

    -- FIND THE TAPE. A named phrase addresses that tape; no phrase addresses
    -- whatever tape the city already has. See the header: conflating the two is
    -- what produced a second Jacksonville.
    if v_spine is not null then
      select s.id into v_tape_id
        from public.soundtracks s
       where s.city_slug = v_slug
         and lower(coalesce(btrim(s.spine_tag), '')) = lower(v_spine)
       order by s.created_at, s.id
       limit 1;
    else
      select s.id into v_tape_id
        from public.soundtracks s
       where s.city_slug = v_slug
       order by s.created_at, s.id
       limit 1;
    end if;

    -- Create only when the city genuinely has nothing to top up, or when a NEW
    -- name was given. A tape is born SHELVED, like the songs about to land on
    -- it: nothing reaches /soundtracks/ because a routine ran.
    if v_tape_id is null then
      insert into public.soundtracks (city_slug, spine_tag, spine_tag_position, archived)
      values (v_slug, v_spine, v_spine_pos, true)
      returning id into v_tape_id;
    end if;

    -- Play order is per tape. Reading it per city would start a city's second
    -- tape at position 16.
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

      -- archived = true: SHELVED, off /soundtracks/ until a human puts it live.
      -- Written explicitly, never defaulted, and it takes no parameter. That
      -- single constant is the whole of what bounds an anon caller.
      insert into public.soundtrack_songs
        (tape_id, position, title, artist, blurb, spotify_id, explicit, archived)
      values
        (v_tape_id, v_next_position, v_title, v_artist, v_blurb, v_spotify, v_explicit,
         true)
      on conflict do nothing;

      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        return query select 'skipped'::text, v_slug, v_title, v_artist,
          'already on this tape (live or shelved)'::text;
        continue;
      end if;

      v_next_position := v_next_position + 1;
      return query select 'queued'::text, v_slug, v_title, v_artist,
        coalesce(v_spotify, 'no spotify id');
    end loop;
  end loop;
end;
$$;
