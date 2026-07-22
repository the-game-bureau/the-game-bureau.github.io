-- Merge public.gift_shop_cities into public.cities
-- ---------------------------------------------------------------------------
-- There were two city catalogs: public.cities (created 2026-07-15 for /sound/,
-- keyed by slug) and public.gift_shop_cities (keyed by the canonical city
-- string, read by /shop/ and /shop/admin/). Both hold the same canonical
-- strings and the same structured geo columns, so this collapses them into one:
-- public.cities becomes the single city catalog for the whole site.
--
-- What this does:
--   1. tgb_city_slug()  — derive a stable slug from a canonical city string.
--   2. cities_fill_slug — BEFORE INSERT trigger so a client can insert a city
--      without knowing about slugs (the shop admin posts {city, archived}).
--   3. tgb_sync_cities_geo — the same structured-geo BEFORE trigger the other
--      geo tables already have (cities was created after that migration and
--      never got one).
--   4. Copies every gift_shop_cities row missing from cities.
--
-- gift_shop_cities is intentionally LEFT IN PLACE. Nothing reads it after this
-- migration; drop it once the deployed site has been on cities for a while
-- (statement at the very bottom, commented).
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

-- ── 1. Slug derivation ──────────────────────────────────────────────────────
-- Slug comes from the city NAME only ("St. Louis, Missouri" -> "st-louis"),
-- matching how the seeded slugs were written. If that base is already taken by
-- a different city (two Portlands), the state/country code is appended.
create or replace function public.tgb_city_slug(p_city text)
returns text
language plpgsql
stable
as $$
declare
  base text;
  candidate text;
  suffix text;
  n integer := 2;
  g public.tgb_geo;
begin
  if nullif(btrim(coalesce(p_city, '')), '') is null then
    return null;
  end if;

  g := public.tgb_parse_geo(p_city);
  base := lower(coalesce(nullif(g.city_name, ''), split_part(p_city, ',', 1)));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := btrim(base, '-');
  if base = '' then
    base := 'city';
  end if;

  -- Free, or already this exact city? Use it.
  candidate := base;
  if not exists (select 1 from public.cities c where c.slug = candidate and c.city is distinct from p_city) then
    return candidate;
  end if;

  -- Taken by a different city — qualify with the state or country.
  suffix := lower(coalesce(nullif(g.state_code, ''), nullif(g.country_code, ''), ''));
  suffix := regexp_replace(suffix, '[^a-z0-9]+', '-', 'g');
  if suffix <> '' then
    candidate := base || '-' || suffix;
    if not exists (select 1 from public.cities c where c.slug = candidate and c.city is distinct from p_city) then
      return candidate;
    end if;
  end if;

  -- Still taken: number it.
  loop
    candidate := base || '-' || n;
    exit when not exists (select 1 from public.cities c where c.slug = candidate and c.city is distinct from p_city);
    n := n + 1;
  end loop;
  return candidate;
end;
$$;

-- ── 2. Auto-fill slug on insert ─────────────────────────────────────────────
-- Lets the gift-shop admin keep posting {city, archived} with no slug.
create or replace function public.tgb_cities_fill_slug()
returns trigger
language plpgsql
as $$
begin
  if nullif(btrim(coalesce(new.slug, '')), '') is null then
    new.slug := public.tgb_city_slug(new.city);
  end if;
  return new;
end;
$$;

-- No "alter column slug drop not null" here: slug is the primary key, so that
-- is illegal -- and unnecessary. BEFORE ROW triggers fire before constraint
-- checks, so this trigger fills a null slug and the insert still passes.

drop trigger if exists cities_fill_slug on public.cities;
create trigger cities_fill_slug
before insert on public.cities
for each row execute function public.tgb_cities_fill_slug();

-- ── 3. Structured geo, same as games / teams / gift_shop_cities ─────────────
create or replace function public.tgb_sync_cities_geo()
returns trigger language plpgsql as $$
declare g public.tgb_geo;
begin
  g := public.tgb_parse_geo(new.city);
  new.city_name    := coalesce(nullif(new.city_name, ''),    nullif(g.city_name, ''));
  new.state_code   := coalesce(nullif(new.state_code, ''),   nullif(g.state_code, ''));
  new.state_name   := coalesce(nullif(new.state_name, ''),   nullif(g.state_name, ''));
  new.country_code := coalesce(nullif(new.country_code, ''), nullif(g.country_code, ''));
  new.country_name := coalesce(nullif(new.country_name, ''), nullif(g.country_name, ''));
  return new;
end;
$$;

drop trigger if exists cities_sync_geo on public.cities;
create trigger cities_sync_geo
before insert or update of city, city_name, state_code, state_name, country_code, country_name
on public.cities
for each row execute function public.tgb_sync_cities_geo();

-- ── 4. Copy over anything cities doesn't already have ───────────────────────
-- New rows sort after the seeded ones; the slug + geo triggers fill the rest.
insert into public.cities (slug, city, label, sort_order, archived)
select
  public.tgb_city_slug(g.city),
  g.city,
  g.label,
  1000 + row_number() over (order by g.city),
  g.archived
from public.gift_shop_cities g
where not exists (select 1 from public.cities c where c.city = g.city)
on conflict (city) do nothing;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect: missing_from_cities = 0.
select
  (select count(*) from public.cities where archived = false)            as active_cities,
  (select count(*) from public.gift_shop_cities where archived = false)  as active_gift_shop_cities,
  (select count(*)
     from public.gift_shop_cities g
    where not exists (select 1 from public.cities c where c.city = g.city)) as missing_from_cities;

-- Gift listings whose city has no catalog row (should be empty).
select distinct l.city
  from public.gift_shop_listings l
 where l.city is not null
   and not exists (select 1 from public.cities c where c.city = l.city);

-- ── Dropping the old table ──────────────────────────────────────────────────
-- Once the updated /shop/ and /shop/admin/ code is deployed, run
-- supabase/migrations/2026072204_drop_gift_shop_cities.sql — it re-checks that
-- nothing would be orphaned before it drops anything.

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- Removes only what this migration added; the copied rows are left alone
-- (delete them by slug if you truly need the old split back).
-- drop trigger if exists cities_sync_geo on public.cities;
-- drop trigger if exists cities_fill_slug on public.cities;
-- drop function if exists public.tgb_sync_cities_geo();
-- drop function if exists public.tgb_cities_fill_slug();
-- drop function if exists public.tgb_city_slug(text);
