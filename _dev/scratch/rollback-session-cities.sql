-- Rollback: remove the 2026-07-11 session's normalized-cities experiment.
--
-- The live DB had these objects applied during a session that predated pulling
-- the remote's own (string-canonicalization) city system. They are redundant
-- and unreferenced by anything on origin/main -- verified: nothing in the repo
-- touches public.cities, *.city_id, or gift_shop_items.city.
--
-- This does NOT touch the remote's city system: public.gift_shop_cities,
-- gift_shop_listings.city, or tgb_canonical_gift_shop_city() are left intact.
-- It also leaves the original games.city / games.away_team_city / etc. columns
-- alone -- only the session-added city_id links and the cities table are removed.
--
-- Idempotent: every drop is IF EXISTS, safe to run once or re-run.

begin;

-- 1. Triggers first (they depend on the functions below).
drop trigger if exists trg_games_set_city_id      on public.games;
drop trigger if exists trg_gift_items_set_city_id on public.gift_shop_items;

-- 2. Trigger functions. games_set_city_id() only exists if the trigger
--    migration was run but the gift migration (which renamed it) was not.
drop function if exists public.set_city_id_from_text();
drop function if exists public.games_set_city_id();

-- 3. Session-added FK columns (their indexes drop automatically).
--    Only *_id links + the gift item city text are session-created; the
--    pre-existing games.city / *_team_city columns are left untouched.
alter table public.games           drop column if exists city_id;
alter table public.teams           drop column if exists city_id;
alter table public.gift_shop_items drop column if exists city_id;
alter table public.gift_shop_items drop column if exists city;

-- 4. The cities table (drops its own updated_at trigger + indexes with it).
drop table if exists public.cities;

-- 5. Remaining helper functions.
drop function if exists public.set_cities_updated_at();
drop function if exists public.city_slug(text, text);

commit;

-- Verify (should all return 0 / no rows):
--   select count(*) from information_schema.tables  where table_name = 'cities';
--   select count(*) from information_schema.columns where column_name = 'city_id'
--     and table_name in ('games','teams','gift_shop_items');
--   select count(*) from pg_proc where proname in
--     ('set_city_id_from_text','games_set_city_id','set_cities_updated_at','city_slug');
