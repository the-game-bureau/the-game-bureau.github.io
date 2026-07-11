-- Rollback for supabase/migrations/20260711_structured_geo.sql
--
-- Drops the structured geo columns, the sync triggers, and the new functions.
-- It restores tgb_canonical_gift_shop_city to the US-only version from
-- supabase/gs-gift-shop-cities.sql (re-run that file afterwards if you want the
-- exact original body back — this rollback just removes the country-aware deps).
--
-- It does NOT revert the one-time games.city normalization ('Houston, TX' ->
-- 'Houston, Texas'); those values are already valid canonical strings and are
-- harmless to keep. The gift_shop_cities primary key and gift listings were
-- never rewritten by the migration.

begin;

drop trigger if exists games_sync_geo on public.games;
drop trigger if exists gift_shop_cities_sync_geo on public.gift_shop_cities;
drop trigger if exists teams_sync_geo on public.teams;

drop function if exists public.tgb_sync_games_geo();
drop function if exists public.tgb_sync_gift_shop_cities_geo();
drop function if exists public.tgb_sync_teams_geo();

alter table public.games            drop column if exists city_name;
alter table public.games            drop column if exists state_code;
alter table public.games            drop column if exists state_name;
alter table public.games            drop column if exists country_code;
alter table public.games            drop column if exists country_name;

alter table public.gift_shop_cities drop column if exists city_name;
alter table public.gift_shop_cities drop column if exists state_code;
alter table public.gift_shop_cities drop column if exists state_name;
alter table public.gift_shop_cities drop column if exists country_code;
alter table public.gift_shop_cities drop column if exists country_name;

alter table public.teams            drop column if exists city_name;
alter table public.teams            drop column if exists state_code;
alter table public.teams            drop column if exists state_name;
alter table public.teams            drop column if exists country_code;
alter table public.teams            drop column if exists country_name;

-- canonical function depends on tgb_compose_geo / tgb_parse_geo; drop it first,
-- then the helpers and the type. Re-run supabase/gs-gift-shop-cities.sql to
-- restore the original US-only tgb_canonical_gift_shop_city.
drop function if exists public.tgb_canonical_gift_shop_city(text);
drop function if exists public.tgb_compose_geo(public.tgb_geo);
drop function if exists public.tgb_parse_geo(text);
drop type if exists public.tgb_geo;

commit;
