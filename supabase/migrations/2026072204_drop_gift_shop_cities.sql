-- Drop public.gift_shop_cities
-- ---------------------------------------------------------------------------
-- The gift shop's city catalog was merged into public.cities. This removes the
-- old table and the two functions that only served it.
--
-- RUN LAST. Prerequisites, in order:
--   1. 2026071501_cities_soundtracks.sql   — public.cities exists and is seeded
--   2. 2026072203_fix_non_us_city_strings.sql — canonical strings
--   3. 2026072202_merge_gift_shop_cities_into_cities.sql — rows copied over
--   4. The updated /shop/ and /shop/admin/ code is DEPLOYED (the live site
--      reads this table until then).
--
-- The guard below aborts if public.cities is missing, or if any gift_shop_cities
-- row or any gift_shop_listings city has no home in public.cities — so a
-- premature run fails loudly instead of destroying the catalog.
--
-- NOT reversible: the rollback at the bottom rebuilds an empty table only.

do $$
declare
  missing_cities integer;
  orphan_listings integer;
begin
  if to_regclass('public.gift_shop_cities') is null then
    raise notice 'public.gift_shop_cities already gone — nothing to do.';
    return;
  end if;

  if to_regclass('public.cities') is null then
    raise exception 'ABORT: public.cities does not exist. Run 2026071501_cities_soundtracks.sql and the merge first.';
  end if;

  select count(*) into missing_cities
    from public.gift_shop_cities g
   where not exists (select 1 from public.cities c where c.city = g.city);

  if missing_cities > 0 then
    raise exception 'ABORT: % gift_shop_cities row(s) are not in public.cities. Run 2026072202_merge_gift_shop_cities_into_cities.sql first.', missing_cities;
  end if;

  select count(distinct l.city) into orphan_listings
    from public.gift_shop_listings l
   where l.city is not null
     and not exists (select 1 from public.cities c where c.city = l.city);

  if orphan_listings > 0 then
    raise exception 'ABORT: % gift city string(s) have no row in public.cities. Fix those before dropping.', orphan_listings;
  end if;

  drop table public.gift_shop_cities;
  raise notice 'Dropped public.gift_shop_cities.';
end;
$$;

-- Only ever used by that table.
drop function if exists public.tgb_sync_gift_shop_cities_geo();
drop function if exists public.tgb_touch_gift_shop_cities_updated_at();

-- Kept on purpose: public.tgb_canonical_gift_shop_city() is still the SQL twin
-- of assets/geo.js canonicalCity(), despite the name.

-- ── Verify ──────────────────────────────────────────────────────────────────
select to_regclass('public.gift_shop_cities') as should_be_null,
       (select count(*) from public.cities where archived = false) as active_cities;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- The data is gone; this only recreates the shell. Re-seed from public.cities:
-- create table if not exists public.gift_shop_cities (
--   city text primary key, label text, sort_order integer not null default 0,
--   archived boolean not null default false,
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now()
-- );
-- insert into public.gift_shop_cities (city, label, sort_order, archived)
--   select city, label, sort_order, archived from public.cities
--   on conflict (city) do nothing;
