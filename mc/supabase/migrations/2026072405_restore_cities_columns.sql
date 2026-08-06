-- 2026072405_restore_cities_columns.sql
--
-- Restore two columns accidentally dropped from public.cities:
--   ignored     (Venue only)     — 2026072205
--   sort_order  (display order)  — 2026071501
--
-- These are queried by /shop/ and the city pickers (order=sort_order…), so their
-- absence 400s those reads. (archived + label were retired on purpose —
-- 2026072401/2026072402 — and stay gone. The sound_* columns are also staying
-- gone: soundtracks are handled by a separate mechanism now.)
--
-- Structure is restored here; the values those columns held were lost with the
-- drop. ignored is re-flagged for the documented venue-only cities; sort_order
-- comes back as 0 for every row (curated order lost — readers fall back to
-- alphabetical by city).

alter table public.cities add column if not exists ignored    boolean not null default false;
alter table public.cities add column if not exists sort_order integer not null default 0;

update public.cities set ignored = true where slug in ('orchard-park', 'santa-clara');

create index if not exists cities_sort_idx on public.cities (sort_order, city);
