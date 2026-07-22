-- public.cities.ignored — venue cities that aren't shopping/listening cities
-- ---------------------------------------------------------------------------
-- Some cities exist only because a pro team plays there: Orchard Park, Santa
-- Clara, Glendale, Miami Gardens. We still need them for venues and team data,
-- but they should never appear as a gift-shop city or a soundtrack city.
--
--   ignored = false  (default) — a full city: games, gifts, soundtracks
--   ignored = true             — venue only: hidden from /shop/ and /sound/,
--                                shown grey in the admin pickers
--
-- This is NOT the same as `archived`. Archived means "retired, stop showing it
-- anywhere". Ignored means "real and current, just not a destination for us".
--
-- Ignored rows stay publicly READABLE (the RLS policy still keys off archived)
-- so an admin picker can grey them out; the public pages filter on ignored.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

alter table public.cities
  add column if not exists ignored boolean not null default false;

comment on column public.cities.ignored is
  'true = venue-only city: never offered as a gift-shop or soundtrack city, shown grey in admin pickers. Distinct from archived (retired everywhere).';

-- Active, selectable cities are the common lookup; index for it.
drop index if exists cities_active_sort_idx;
create index if not exists cities_active_sort_idx
  on public.cities (archived, ignored, sort_order, city);

-- ── Which cities look venue-only? ───────────────────────────────────────────
-- Run this and eyeball the result BEFORE marking anything. A candidate is a
-- city that a team plays in but which has no gifts and no soundtrack — the
-- shape of a stadium town. Nothing is changed automatically: "no gifts yet"
-- and "venue only" look identical from here, and only you know which is which.
select c.slug,
       c.city,
       exists (select 1 from public.teams t where t.venue_city = c.city)          as is_venue_city,
       exists (select 1 from public.games g where g.city = c.city)                as has_game,
       (select count(*) from public.gift_shop_listings l where l.city = c.city)   as gifts,
       c.sound_playlist_id is not null                                            as has_playlist
  from public.cities c
 where c.archived = false
   and c.ignored = false
   and exists (select 1 from public.teams t where t.venue_city = c.city)
   and not exists (select 1 from public.games g where g.city = c.city)
   and not exists (select 1 from public.gift_shop_listings l where l.city = c.city)
 order by c.city;

-- ── Marking them ────────────────────────────────────────────────────────────
-- Edit the list and run. The admin pickers also toggle this per city, so this
-- is just the bulk way in.
--
-- update public.cities set ignored = true
--  where slug in ('orchard-park', 'santa-clara', 'glendale', 'miami-gardens');
--
-- And back out again:
-- update public.cities set ignored = false where slug in ('...');

-- ── Verify ──────────────────────────────────────────────────────────────────
select count(*) filter (where ignored = false and archived = false) as selectable_cities,
       count(*) filter (where ignored = true)                        as ignored_cities,
       count(*) filter (where archived = true)                       as archived_cities
  from public.cities;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- drop index if exists cities_active_sort_idx;
-- create index if not exists cities_active_sort_idx on public.cities (archived, sort_order, city);
-- alter table public.cities drop column if exists ignored;
