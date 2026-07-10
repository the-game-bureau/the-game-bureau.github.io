-- ─────────────────────────────────────────────────────────────────────────
-- City parity: make the live-GAME city set and the GIFT city set identical.
--
-- Snapshot when written: 43 game cities, 51 gift cities, 40 shared.
--   • 3 cities have a game but no gift  → add a gift listing to each
--   • 11 cities have a gift but no game → add a (placeholder) game to each
-- Result: both lists become the same 54 cities.
--
-- Run in the Supabase SQL editor (service role). This script COMMITS and is
-- idempotent: the gift insert has a NOT EXISTS guard and the games insert is
-- ON CONFLICT DO NOTHING, so it's safe to run once or many times.
--
-- ⚠ The 11 games are LIVE PLACEHOLDERS: they clone an existing game's colors/
--   engine/price but have NO tagline, body, teams, coordinates, or dates.
--   Flesh them out in Builder (/mc/builder.html) or archive any you don't want
--   public yet (set games.archived = 'YES', which also drops it from the count).
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- 1) GIFTS ── give the 3 game-only cities a gift by listing existing certified
--    items there (distinct item per city, newest first). No new products.
with new_cities as (
  select city, row_number() over () as rn
  from (values
    ('Miami Gardens, Florida'),
    ('Saint-Denis, France'),
    ('St. Louis, Missouri')
  ) as t(city)
),
picks as (
  select id, row_number() over (order by created_at desc) as rn
  from public.gift_shop_items
  where certified_at is not null
    and coalesce(archived, false) = false
)
insert into public.gift_shop_listings (item_id, city, position, archived, live)
select p.id, nc.city, 0, false, true
from new_cities nc
join picks p on p.rn = nc.rn
-- idempotent: skip any city that already has an active, certified gift listing
where not exists (
  select 1
  from public.gift_shop_listings l2
  join public.gift_shop_items i2 on i2.id = l2.item_id
  where lower(trim(l2.city)) = lower(trim(nc.city))
    and coalesce(l2.archived, false) = false
    and i2.certified_at is not null
    and coalesce(i2.archived, false) = false
);

-- 2) GAMES ── give the 11 gift-only cities a live game by cloning a valid game
--    row and overriding id/name/city, blanking content + location fields so
--    nothing misleading is copied. Uses jsonb so every NOT NULL column inherits
--    a valid value from the template.
with tmpl as (
  select to_jsonb(g) as j
  from public.games g
  where g.id = 'chc2026atl'          -- template: any valid live game
),
newrows as (
  select * from (values
    ('batonrouge2026','Baton Rouge (placeholder)','Baton Rouge, Louisiana'),
    ('biloxi2026',    'Biloxi (placeholder)',     'Biloxi, Mississippi'),
    ('paris2026',     'Paris (placeholder)',      'Paris, France'),
    ('raleigh2026',   'Raleigh (placeholder)',    'Raleigh, North Carolina'),
    ('richmond2026',  'Richmond (placeholder)',   'Richmond, Virginia'),
    ('sanantonio2026','San Antonio (placeholder)','San Antonio, Texas'),
    ('sanjose2026',   'San Jose (placeholder)',   'San Jose, California'),
    ('savannah2026',  'Savannah (placeholder)',   'Savannah, Georgia'),
    ('shreveport2026','Shreveport (placeholder)', 'Shreveport, Louisiana'),
    ('toronto2026',   'Toronto (placeholder)',    'Toronto, Ontario'),
    ('tuscaloosa2026','Tuscaloosa (placeholder)', 'Tuscaloosa, Alabama')
  ) as v(id, name, city)
)
insert into public.games
select (jsonb_populate_record(
  null::public.games,
  (select j from tmpl) || jsonb_build_object(
    'id',   n.id,
    'name', n.name,
    'city', n.city,
    -- keep it live + not featured/erased
    'archived', null, 'featured', null, 'erased', null,
    -- blank the copied content so nothing misleading shows
    'tagline', null, 'body', null, 'guide_bio', null,
    'teams', null, 'team01', null, 'team02', null, 'team03', null, 'team04', null,
    'team05', null, 'team06', null, 'team07', null, 'team08', null,
    'starting_location', null, 'starting_location_lat', null, 'starting_location_lon', null,
    'starting_location_plus_code', null, 'starting_location_name', null, 'starting_location_address', null,
    'venue_name', null, 'venue_city', null,
    'home_team_city', null, 'home_team_mascot', null, 'away_team_city', null, 'away_team_mascot', null,
    'home_team_key', null, 'away_team_key', null, 'home_team_tgbid', null, 'away_team_tgbid', null,
    'game_date', null, 'start_time', null, 'end_time', null,
    'logo_url', null, 'link_url', null, 'button_url', null, 'checkout_url', null,
    'created_at', now(), 'updated_at', now()
  )
)).*
from newrows n
on conflict (id) do nothing;

-- 3) VERIFY ── both should return the same 54 cities (0 rows in the diff).
--    Comment out the ROLLBACK / swap to COMMIT once the numbers look right.
with game_cities as (
  select distinct lower(trim(city)) as c
  from public.games
  where nullif(trim(city),'') is not null
    and coalesce(lower(trim(archived::text)) in ('yes','true','1'), false) = false
),
gift_cities as (
  select distinct lower(trim(l.city)) as c
  from public.gift_shop_listings l
  join public.gift_shop_items i on i.id = l.item_id
  where nullif(trim(l.city),'') is not null
    and coalesce(l.archived, false) = false
    and i.certified_at is not null
    and coalesce(i.archived, false) = false
)
select
  (select count(*) from game_cities) as game_cities,
  (select count(*) from gift_cities) as gift_cities,
  (select count(*) from (select c from game_cities except select c from gift_cities) x) as games_without_gifts,
  (select count(*) from (select c from gift_cities except select c from game_cities) y) as gifts_without_games;

-- The verify SELECT above reflects the state INSIDE this transaction. Because
-- both inserts are now idempotent (gift = NOT EXISTS guard, games = ON CONFLICT
-- DO NOTHING), this whole script is safe to run once or many times.
commit;
