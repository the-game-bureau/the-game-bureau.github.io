-- 2026072405_restore_cities_columns.sql
--
-- Restore five columns accidentally dropped from public.cities:
--   ignored           (Venue only)     — 2026072205
--   sort_order        (display order)  — 2026071501
--   sound_playlist_id / sound_accent / sound_secondary  (soundtrack config) — 2026071501
--
-- These are queried by /sound/, /shop/, and the city pickers (order=sort_order…
-- and the sound CITY_SELECT name sound_*), so their absence 400s those reads.
-- (archived and label were retired on purpose — 2026072401/2026072402 — and stay
-- gone.) Structure is restored here; the VALUES that were in those columns were
-- lost with the drop and can't be auto-recovered — see the notes below.

alter table public.cities add column if not exists ignored           boolean not null default false;
alter table public.cities add column if not exists sort_order        integer not null default 0;
alter table public.cities add column if not exists sound_playlist_id text;
alter table public.cities add column if not exists sound_accent      text;
alter table public.cities add column if not exists sound_secondary   text;

-- Re-mark the documented venue-only cities (the boolean was lost with the column).
-- If you had marked others venue-only, re-flag them in the mc/cities editor.
update public.cities set ignored = true where slug in ('orchard-park', 'santa-clara');

-- Ordering index (archived was retired, so key off sort_order + city).
create index if not exists cities_sort_idx on public.cities (sort_order, city);

-- NOTE: sound_playlist_id / sound_accent / sound_secondary come back EMPTY. Any
-- Spotify playlist ids / cassette colors that had been set are gone and must be
-- re-entered (sound admin). sort_order comes back as 0 for every row, so the
-- curated ordering is lost — readers now fall back to alphabetical (city).
