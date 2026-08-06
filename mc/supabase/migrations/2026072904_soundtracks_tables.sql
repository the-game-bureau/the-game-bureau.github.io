-- City soundtracks move out of sound/soundtracks.json and into Supabase.
--
-- Until 2026-07-29 the tapes on /sound/ were a committed JSON file: one object
-- per city, songs nested inside it. That was fine while the only writer was a
-- routine that could commit to main, but it made every other job awkward —
-- retiring one song from the admin page meant downloading a rewritten 212 KB
-- file and committing it by hand, and the "last run" signal had to be inferred
-- from the GitHub commits API.
--
-- Two tables, matching how the page already thinks about the data:
--
--   soundtracks       one row per city tape (spine copy, hidden flag)
--   soundtrack_songs  one row per track, ordered by position within a tape
--
-- The JSON file stays in the repo as an offline fallback — /sound/ reads it only
-- when the Supabase fetch fails — but it is no longer the source of truth. The
-- admin page can regenerate it from these tables.
--
-- `archived` on a song keeps its old meaning exactly: a do-not-rescrape
-- tombstone. The song stays on its city so the same title+artist is never picked
-- again there, but /sound/ hides it and active counts ignore it.

create table if not exists public.soundtracks (
  city_slug text primary key
    references public.cities (slug) on update cascade,
  spine_tag text,
  -- 'before' for spine copy that reads ahead of the city name ("Sounds of"),
  -- 'after' (the default) for everything else ("Soundtrack", "Soul Mix").
  spine_tag_position text
    check (spine_tag_position is null or spine_tag_position in ('before', 'after')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.soundtracks is
  'One city cassette tape per row. Songs live in public.soundtrack_songs. '
  'Source of truth for /sound/; sound/soundtracks.json is only an offline fallback.';
comment on column public.soundtracks.spine_tag is
  'Short phrase printed down the cassette spine: Soundtrack, Soul Mix, Jams.';
comment on column public.soundtracks.spine_tag_position is
  'before | after — whether the spine phrase reads ahead of the city name.';
comment on column public.soundtracks.archived is
  'Hide the whole tape from /sound/ without deleting its songs.';

create table if not exists public.soundtrack_songs (
  id bigint generated always as identity primary key,
  city_slug text not null
    references public.soundtracks (city_slug) on delete cascade on update cascade,
  position integer not null default 0,
  title text not null,
  artist text not null,
  blurb text,
  -- 22-char Spotify track id. Nullable on purpose: omitting it is always
  -- correct, guessing never is — the player falls back to a Spotify search for
  -- "artist title".
  spotify_id text
    check (spotify_id is null or spotify_id ~ '^[A-Za-z0-9]{22}$'),
  explicit boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.soundtrack_songs is
  'Tracks on a city tape. archived = true is a do-not-rescrape tombstone: kept '
  'on the city to block reuse of the same title+artist, hidden from /sound/, '
  'excluded from active counts.';
comment on column public.soundtrack_songs.position is
  'Play order within the tape. Ties fall back to id.';
comment on column public.soundtrack_songs.spotify_id is
  'Verified 22-char Spotify track id, or null. Never fabricate one — a made-up '
  'id passes every format check and silently plays nothing.';

create index if not exists soundtrack_songs_city_idx
  on public.soundtrack_songs (city_slug, position, id);

-- One title+artist per city, archived rows included. This is what makes the
-- tombstones work: an INSERT of a retired song hits this index and does nothing.
create unique index if not exists soundtrack_songs_city_track_idx
  on public.soundtrack_songs (city_slug, lower(btrim(title)), lower(btrim(artist)));

create or replace function public.tgb_touch_soundtracks_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists soundtracks_touch_updated_at on public.soundtracks;
create trigger soundtracks_touch_updated_at
before update on public.soundtracks
for each row execute function public.tgb_touch_soundtracks_updated_at();

drop trigger if exists soundtrack_songs_touch_updated_at on public.soundtrack_songs;
create trigger soundtrack_songs_touch_updated_at
before update on public.soundtrack_songs
for each row execute function public.tgb_touch_soundtracks_updated_at();

-- Counts per tape, so a caller never has to pull 900+ song rows just to learn
-- how full a tape is. The footer stat, the admin tape summary, and the nightly
-- routine's "emptiest tape" pick all read this.
create or replace view public.soundtrack_stats as
select
  s.city_slug,
  s.spine_tag,
  s.spine_tag_position,
  s.archived,
  count(g.id) filter (where not g.archived) as active_songs,
  count(g.id) filter (where g.archived) as archived_songs,
  max(g.created_at) as last_song_at
from public.soundtracks s
left join public.soundtrack_songs g on g.city_slug = s.city_slug
group by s.city_slug, s.spine_tag, s.spine_tag_position, s.archived;

comment on view public.soundtrack_stats is
  'Per-tape active/archived song counts and the newest song timestamp. '
  'last_song_at doubles as the daily routine''s run receipt — the routine '
  'commits nothing, so a stale timestamp is the failure signal.';

alter table public.soundtracks enable row level security;
alter table public.soundtrack_songs enable row level security;

-- Public read is the whole point: /sound/ is an unauthenticated page. Archived
-- rows are readable too — they were public in the committed JSON as well, and
-- the page filters them out. Writes need an admin session.
drop policy if exists "Soundtracks are publicly readable" on public.soundtracks;
create policy "Soundtracks are publicly readable"
  on public.soundtracks for select to public using (true);

drop policy if exists "Authenticated users can manage soundtracks" on public.soundtracks;
create policy "Authenticated users can manage soundtracks"
  on public.soundtracks for all to authenticated using (true) with check (true);

drop policy if exists "Soundtrack songs are publicly readable" on public.soundtrack_songs;
create policy "Soundtrack songs are publicly readable"
  on public.soundtrack_songs for select to public using (true);

drop policy if exists "Authenticated users can manage soundtrack songs" on public.soundtrack_songs;
create policy "Authenticated users can manage soundtrack songs"
  on public.soundtrack_songs for all to authenticated using (true) with check (true);

grant select on public.soundtracks to anon, authenticated;
grant select on public.soundtrack_songs to anon, authenticated;
grant select on public.soundtrack_stats to anon, authenticated;
grant insert, update, delete on public.soundtracks to authenticated;
grant insert, update, delete on public.soundtrack_songs to authenticated;
