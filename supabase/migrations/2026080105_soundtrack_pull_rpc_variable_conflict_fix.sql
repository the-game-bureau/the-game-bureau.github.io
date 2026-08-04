-- ─────────────────────────────────────────────────────────────────────────────
-- Restore #variable_conflict use_column on tgb_pull_soundtrack_songs
-- 2026-08-05
--
-- 2026080104_soundtrack_song_review.sql rewrote this function to file songs as
-- REVIEW candidates and, in doing so, dropped the `#variable_conflict
-- use_column` directive that 2026072906 carried as the first line of the body.
-- Every call has failed since with
--
--     42702  column reference "city_slug" is ambiguous
--     It could refer to either a PL/pgSQL variable or a table column.
--
-- The RETURNS TABLE OUT columns (action, city_slug, title, artist, note) are
-- also real column names on these tables, and PL/pgSQL treats an OUT parameter
-- as a variable everywhere in the body — so `on conflict (city_slug)` resolves
-- to the OUT parameter and the statement will not plan. The original migration
-- predicted exactly this in the comment above the directive, including the
-- reason it slips through review: "It parses fine either way, so nothing
-- catches that until the first real call." A `create or replace function` is
-- checked for syntax only, so nothing failed until the daily routine ran.
--
-- Every genuine local in the body is v_-prefixed, so preferring the column is
-- always what we mean. This migration re-creates the 2026080104 body verbatim
-- with the directive restored — the REVIEW-queue constants (archived = true,
-- certified_at = null, rejected_at = null), the caps, the hidden-city refusal
-- and the malformed-id drop are all unchanged.
--
-- If you ever rewrite this function again, keep the directive as the first line
-- of the body. The scanner reads these directives before anything else, so it
-- has to sit immediately after `as $$`, ahead of `declare`.
-- ─────────────────────────────────────────────────────────────────────────────
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
#variable_conflict use_column
-- ^ Must be the first line of the body. Without it `on conflict (city_slug)`
-- below raises 42702, because the RETURNS TABLE column city_slug shadows the
-- table column. Do not remove; see the header of this migration.
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

    -- Create the tape if missing. An existing tape keeps its spine tag and its
    -- archived flag exactly as a human left them.
    insert into public.soundtracks (city_slug, spine_tag, spine_tag_position)
    values (v_slug, v_spine, v_spine_pos)
    on conflict (city_slug) do nothing;

    select coalesce(max(s.position), 0) + 1 into v_next_position
      from public.soundtrack_songs s
     where s.city_slug = v_slug;

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
        (city_slug, position, title, artist, blurb, spotify_id, explicit,
         archived, certified_at, rejected_at)
      values
        (v_slug, v_next_position, v_title, v_artist, v_blurb, v_spotify, v_explicit,
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

comment on function public.tgb_pull_soundtrack_songs(jsonb) is
  'Anon-callable, SECURITY DEFINER. Insert-only: files songs as REVIEW '
  'candidates (archived = true, certified_at and rejected_at null) on tapes for '
  'real, non-hidden public.cities slugs, creating the tape row if needed. A '
  'human presses Live in the Tape Room to publish. Cannot update, delete, '
  'retire, un-retire, or publish anything. Max 60 songs across 4 tapes per '
  'call. Called by the daily soundtrack Claude Code routine, which has no '
  'secret store.';

revoke all on function public.tgb_pull_soundtrack_songs(jsonb) from public;
grant execute on function public.tgb_pull_soundtrack_songs(jsonb) to anon, authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Should return one 'tape_created' or 'skipped' row rather than 42702:
--
--   select * from public.tgb_pull_soundtrack_songs(
--     '{"tapes":[{"city_slug":"__nope__","songs":[]}]}'::jsonb);
