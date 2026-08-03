-- Soundtrack songs get a REVIEW queue, the same three states as the gift shop.
-- ---------------------------------------------------------------------------
-- Until now the daily soundtrack routine wrote LIVE. That was inherited from
-- the behaviour it replaced — the routine used to commit sound/soundtracks.json
-- straight to main, so new tracks appeared on /soundtracks/ with nobody
-- pressing anything — and it is the one place in the codebase where an agent's
-- output reaches the public site unreviewed. The gift-shop book pull has always
-- filed its candidates for review instead. This brings the two into line.
--
-- THE THREE STATES, derived from two timestamps, exactly as gift_shop_items
-- does it (20260610_gift_shop_item_certified_at + 2026072001_gift_shop_rejected):
--
--   REVIEW   certified_at is null and rejected_at is null   <- the default
--   LIVE     certified_at is not null                       <- a human said yes
--   SHELVED  rejected_at is not null                        <- a human said no
--
-- Review is the AUTOMATIC state: a row that nobody has touched is a candidate.
-- That is what makes the queue trustworthy — a new column, a new import path, or
-- a bug that forgets to stamp anything lands in Review rather than on the site.
--
-- HOW THIS SITS ON TOP OF `archived`, which is not replaced:
--   * `archived` stays exactly what it was: the flag /soundtracks/ filters on,
--     what the active counts ignore, and the do-not-rescrape tombstone that the
--     (city_slug, lower(title), lower(artist)) unique index enforces.
--   * A REVIEW candidate is archived = true, so it is invisible to the public
--     page and to the routine's own dedupe while it waits. Nothing on the public
--     side needed changing for this migration.
--   * Going LIVE clears archived and stamps certified_at.
--   * SHELVING keeps archived = true and stamps rejected_at. The row stays, so
--     the song is never re-suggested for that city — which is the same reason
--     the gift shop keeps rejected rows.
--
-- Idempotent: safe to re-run.

alter table public.soundtrack_songs
  add column if not exists certified_at timestamptz,
  add column if not exists rejected_at  timestamptz;

comment on column public.soundtrack_songs.certified_at is
  'When a human approved this track for /soundtracks/. NULL and not rejected = '
  'still in the Review queue. Set alongside archived = false.';

comment on column public.soundtrack_songs.rejected_at is
  'When a human rejected this track. The row is KEPT so the unique index stops '
  'the routine ever re-picking that title+artist for this city. NULL = not '
  'rejected. Set alongside archived = true.';

create index if not exists soundtrack_songs_review_idx
  on public.soundtrack_songs (city_slug)
  where certified_at is null and rejected_at is null;

create index if not exists soundtrack_songs_rejected_at_idx
  on public.soundtrack_songs (rejected_at)
  where rejected_at is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Every row that exists today predates the queue and has already been through a
-- human in some form, so nothing should land in Review — an empty queue on day
-- one is the correct starting point. Three cases:
--
--   visible on the site (archived = false)        -> LIVE
--   hidden along with its whole tape              -> LIVE, because the cascade
--     (archived = true, archived_with_tape)          hid it; restoring the tape
--                                                    brings it back, and it was
--                                                    never individually judged
--   hidden on its own (archived = true)           -> SHELVED, since hiding a
--                                                    single track is precisely
--                                                    the reject action
--
-- created_at is used rather than now() so the stamps stay honest about when the
-- track actually arrived; only the genuinely-rejected rows get a now() marker,
-- because we do not know when they were hidden.
update public.soundtrack_songs
   set certified_at = coalesce(certified_at, created_at, now())
 where certified_at is null
   and rejected_at is null
   and (archived is not true or archived_with_tape is true);

update public.soundtrack_songs
   set rejected_at = coalesce(rejected_at, now())
 where rejected_at is null
   and certified_at is null
   and archived is true
   and archived_with_tape is not true;

-- ── The routine now files candidates instead of publishing ──────────────────
-- Only two things change in the function: the archived constant flips false ->
-- true, and the two new timestamps are written NULL explicitly. Everything that
-- made it safe to expose to anon is untouched — still insert-only, still no
-- parameter for any of the three, still capped, still unable to invent a city.
--
-- Writing certified_at / rejected_at as explicit NULLs rather than letting them
-- default is the same reasoning that already applies to `archived`: these are
-- the constants that bound what an anon caller can do, so they must not follow
-- a column default that a later migration could change out from under them.
-- DO NOT add parameters for them.
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

-- ── No findings against a shelved track ─────────────────────────────────────
-- A shelved track is already off /soundtracks/ and can never be re-picked for
-- that city, so a finding about it has nothing left to ask of anyone. Shelving
-- is the strongest fix available; the audit should not keep raising a hand about
-- something already dealt with.
--
-- A BEFORE INSERT trigger rather than a condition inside
-- tgb_report_soundtrack_issues, for the same reason the tape-archive cascade is
-- a trigger: the rule then holds for the Supabase table editor and psql too, and
-- cannot be half-applied by a caller that does its own INSERT. Returning null
-- from a BEFORE INSERT trigger drops the row silently, which is exactly the
-- behaviour the RPC already has for a song_id that is not on the named tape.
--
-- Note this only stops NEW findings. Existing open rows against a track that
-- gets shelved later are left alone and filtered in the Tape Room instead, so
-- that un-shelving the track brings its findings back with it.
create or replace function public.tgb_soundtrack_issues_skip_shelved()
returns trigger language plpgsql as $$
begin
  if new.song_id is not null and exists (
    select 1 from public.soundtrack_songs s
     where s.id = new.song_id and s.rejected_at is not null
  ) then
    return null;   -- drop it: the track is shelved, there is nothing to fix
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_soundtrack_issues_skip_shelved on public.soundtrack_issues;
create trigger tgb_soundtrack_issues_skip_shelved
  before insert on public.soundtrack_issues
  for each row execute function public.tgb_soundtrack_issues_skip_shelved();

-- ── Verify ──────────────────────────────────────────────────────────────────
-- No open finding should point at a shelved track after a fresh audit run:
--   select i.id, i.city_slug, i.kind
--     from public.soundtrack_issues i
--     join public.soundtrack_songs s on s.id = i.song_id
--    where i.status = 'open' and s.rejected_at is not null;
--
-- The queue should be empty immediately after this runs, and every existing
-- song should have landed in exactly one state:
--   select case
--            when rejected_at  is not null then 'SHELVED'
--            when certified_at is not null then 'LIVE'
--            else 'REVIEW'
--          end as status,
--          count(*)
--     from public.soundtrack_songs
--    group by 1 order by 1;
--
-- And nothing live should still be hidden on its own:
--   select id, city_slug, title from public.soundtrack_songs
--    where certified_at is not null and rejected_at is null
--      and archived is true and archived_with_tape is not true;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Restores the publish-on-write behaviour. Re-run 2026072906 to put the old
-- function back, then:
--   alter table public.soundtrack_songs
--     drop column if exists certified_at,
--     drop column if exists rejected_at;
