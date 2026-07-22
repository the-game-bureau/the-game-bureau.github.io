-- ===========================================================================
-- RUN-ME — Gift shop / cities setup, 2026-07-22
-- ===========================================================================
-- Paste this whole file into the Supabase SQL Editor and run it once. It is
-- the four migrations below concatenated, in dependency order. Every part is
-- idempotent, so a re-run is safe.
--
-- NOT included: 2026072204_drop_gift_shop_cities.sql (destructive — run that
-- one on its own, after you have confirmed the shop works on public.cities).
-- ===========================================================================



-- ###########################################################################
-- 1. Create + seed public.cities
-- source: supabase/migrations/2026071501_cities_soundtracks.sql
-- ###########################################################################

-- Canonical public city catalog for site surfaces that need city identity.
-- /sound/ reads this table for city names, labels, ordering, badges, and tape colors;
-- local JSON only stores song data keyed by city slug.

create table if not exists public.cities (
  slug text primary key,
  city text not null unique,
  label text,
  sort_order integer not null default 0,
  city_name text,
  state_code text,
  state_name text,
  country_code text,
  country_name text,
  sound_playlist_id text,
  sound_accent text,
  sound_secondary text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.cities is
  'Canonical city catalog for public site city pickers and soundtrack cards.';
comment on column public.cities.slug is
  'Stable lowercase slug used by local city-specific assets/data such as /sound/soundtracks.json.';
comment on column public.cities.city is
  'Canonical display/key string such as "Denver, Colorado" or "Paris, France".';
comment on column public.cities.label is
  'Short display label; public UI falls back to city_name or city.';

create index if not exists cities_active_sort_idx
  on public.cities (archived, sort_order, city);

create or replace function public.tgb_touch_cities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cities_touch_updated_at on public.cities;
create trigger cities_touch_updated_at
before update on public.cities
for each row execute function public.tgb_touch_cities_updated_at();

alter table public.cities enable row level security;

drop policy if exists "Cities are publicly readable" on public.cities;
create policy "Cities are publicly readable"
  on public.cities
  for select
  to public
  using (archived = false);

drop policy if exists "Authenticated users can manage cities" on public.cities;
create policy "Authenticated users can manage cities"
  on public.cities
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.cities to anon, authenticated;
grant insert, update, delete on public.cities to authenticated;

insert into public.cities (
  slug, city, label, sort_order, city_name, state_code, state_name, country_code, country_name,
  sound_playlist_id, sound_accent, sound_secondary
) values
  ('atlanta', 'Atlanta, Georgia', 'Atlanta', 1, 'Atlanta', 'GA', 'Georgia', 'USA', 'United States', null, null, null),
  ('austin', 'Austin, Texas', 'Austin', 2, 'Austin', 'TX', 'Texas', 'USA', 'United States', null, null, null),
  ('baltimore', 'Baltimore, Maryland', 'Baltimore', 3, 'Baltimore', 'MD', 'Maryland', 'USA', 'United States', null, null, null),
  ('baton-rouge', 'Baton Rouge, Louisiana', 'Baton Rouge', 4, 'Baton Rouge', 'LA', 'Louisiana', 'USA', 'United States', null, null, null),
  ('biloxi', 'Biloxi, Mississippi', 'Biloxi', 5, 'Biloxi', 'MS', 'Mississippi', 'USA', 'United States', null, null, null),
  ('boston', 'Boston, Massachusetts', 'Boston', 6, 'Boston', 'MA', 'Massachusetts', 'USA', 'United States', null, null, null),
  ('buffalo', 'Buffalo, New York', 'Buffalo', 7, 'Buffalo', 'NY', 'New York', 'USA', 'United States', null, null, null),
  ('charlotte', 'Charlotte, North Carolina', 'Charlotte', 8, 'Charlotte', 'NC', 'North Carolina', 'USA', 'United States', null, null, null),
  ('chicago', 'Chicago, Illinois', 'Chicago', 9, 'Chicago', 'IL', 'Illinois', 'USA', 'United States', null, null, null),
  ('cincinnati', 'Cincinnati, Ohio', 'Cincinnati', 10, 'Cincinnati', 'OH', 'Ohio', 'USA', 'United States', null, null, null),
  ('cleveland', 'Cleveland, Ohio', 'Cleveland', 11, 'Cleveland', 'OH', 'Ohio', 'USA', 'United States', null, null, null),
  ('corpus-christi', 'Corpus Christi, Texas', 'Corpus Christi', 12, 'Corpus Christi', 'TX', 'Texas', 'USA', 'United States', null, null, null),
  ('dallas', 'Dallas, Texas', 'Dallas', 13, 'Dallas', 'TX', 'Texas', 'USA', 'United States', '2sH2k1p1RB9OZAFh9VLtrX', '#b7a05a', '#1f5d8f'),
  ('dearborn', 'Dearborn, Michigan', 'Dearborn', 14, 'Dearborn', 'MI', 'Michigan', 'USA', 'United States', null, null, null),
  ('denver', 'Denver, Colorado', 'Denver', 15, 'Denver', 'CO', 'Colorado', 'USA', 'United States', null, null, null),
  ('detroit', 'Detroit, Michigan', 'Detroit', 16, 'Detroit', 'MI', 'Michigan', 'USA', 'United States', null, null, null),
  ('glendale', 'Glendale, Arizona', 'Glendale', 17, 'Glendale', 'AZ', 'Arizona', 'USA', 'United States', null, null, null),
  ('green-bay', 'Green Bay, Wisconsin', 'Green Bay', 18, 'Green Bay', 'WI', 'Wisconsin', 'USA', 'United States', null, null, null),
  ('houston', 'Houston, Texas', 'Houston', 19, 'Houston', 'TX', 'Texas', 'USA', 'United States', null, null, null),
  ('indianapolis', 'Indianapolis, Indiana', 'Indianapolis', 20, 'Indianapolis', 'IN', 'Indiana', 'USA', 'United States', null, null, null),
  ('jacksonville', 'Jacksonville, Florida', 'Jacksonville', 21, 'Jacksonville', 'FL', 'Florida', 'USA', 'United States', null, null, null),
  ('kansas-city', 'Kansas City, Missouri', 'Kansas City', 22, 'Kansas City', 'MO', 'Missouri', 'USA', 'United States', null, null, null),
  ('las-vegas', 'Las Vegas, Nevada', 'Las Vegas', 23, 'Las Vegas', 'NV', 'Nevada', 'USA', 'United States', null, null, null),
  ('london', 'London, England', 'London', 24, 'London', null, null, 'GBR', 'England', null, null, null),
  ('los-angeles', 'Los Angeles, California', 'Los Angeles', 25, 'Los Angeles', 'CA', 'California', 'USA', 'United States', null, null, null),
  ('madrid', 'Madrid, Spain', 'Madrid', 26, 'Madrid', null, null, 'ESP', 'Spain', null, null, null),
  ('melbourne', 'Melbourne, Victoria', 'Melbourne', 27, 'Melbourne', null, 'Victoria', 'AUS', 'Australia', null, null, null),
  ('mexico-city', 'Mexico City, Mexico', 'Mexico City', 28, 'Mexico City', null, null, 'MEX', 'Mexico', null, null, null),
  ('miami', 'Miami, Florida', 'Miami', 29, 'Miami', 'FL', 'Florida', 'USA', 'United States', null, null, null),
  ('miami-gardens', 'Miami Gardens, Florida', 'Miami Gardens', 30, 'Miami Gardens', 'FL', 'Florida', 'USA', 'United States', null, null, null),
  ('milwaukee', 'Milwaukee, Wisconsin', 'Milwaukee', 31, 'Milwaukee', 'WI', 'Wisconsin', 'USA', 'United States', null, null, null),
  ('minneapolis', 'Minneapolis, Minnesota', 'Minneapolis', 32, 'Minneapolis', 'MN', 'Minnesota', 'USA', 'United States', null, null, null),
  ('mobile', 'Mobile, Alabama', 'Mobile', 33, 'Mobile', 'AL', 'Alabama', 'USA', 'United States', null, null, null),
  ('munich', 'Munich, Germany', 'Munich', 34, 'Munich', null, null, 'DEU', 'Germany', null, null, null),
  ('nashville', 'Nashville, Tennessee', 'Nashville', 35, 'Nashville', 'TN', 'Tennessee', 'USA', 'United States', null, null, null),
  ('new-orleans', 'New Orleans, Louisiana', 'New Orleans', 36, 'New Orleans', 'LA', 'Louisiana', 'USA', 'United States', '1jeexdy2NOKvxdvFFCIRmY', '#d8a13a', '#147b77'),
  ('new-york', 'New York, New York', 'New York', 37, 'New York', 'NY', 'New York', 'USA', 'United States', null, null, null),
  ('orchard-park', 'Orchard Park, New York', 'Orchard Park', 38, 'Orchard Park', 'NY', 'New York', 'USA', 'United States', null, null, null),
  ('paris', 'Paris, France', 'Paris', 39, 'Paris', null, null, 'FRA', 'France', null, null, null),
  ('philadelphia', 'Philadelphia, Pennsylvania', 'Philadelphia', 40, 'Philadelphia', 'PA', 'Pennsylvania', 'USA', 'United States', null, null, null),
  ('phoenix', 'Phoenix, Arizona', 'Phoenix', 41, 'Phoenix', 'AZ', 'Arizona', 'USA', 'United States', null, null, null),
  ('pittsburgh', 'Pittsburgh, Pennsylvania', 'Pittsburgh', 42, 'Pittsburgh', 'PA', 'Pennsylvania', 'USA', 'United States', '0ws20uBk7rQQd91HAgc8Xk', '#f5c542', '#2f5e8f'),
  ('raleigh', 'Raleigh, North Carolina', 'Raleigh', 43, 'Raleigh', 'NC', 'North Carolina', 'USA', 'United States', null, null, null),
  ('richmond', 'Richmond, Virginia', 'Richmond', 44, 'Richmond', 'VA', 'Virginia', 'USA', 'United States', null, null, null),
  ('rio-de-janeiro', 'Rio de Janeiro, Brazil', 'Rio de Janeiro', 45, 'Rio de Janeiro', null, null, 'BRA', 'Brazil', null, null, null),
  ('sacramento', 'Sacramento, California', 'Sacramento', 46, 'Sacramento', 'CA', 'California', 'USA', 'United States', '2Fc0bIRLb8XzBN2gTVTZKM', null, null),
  ('saint-denis', 'Saint-Denis, France', 'Saint-Denis', 47, 'Saint-Denis', null, null, 'FRA', 'France', null, null, null),
  ('san-antonio', 'San Antonio, Texas', 'San Antonio', 48, 'San Antonio', 'TX', 'Texas', 'USA', 'United States', null, null, null),
  ('san-diego', 'San Diego, California', 'San Diego', 49, 'San Diego', 'CA', 'California', 'USA', 'United States', null, null, null),
  ('san-francisco', 'San Francisco, California', 'San Francisco', 50, 'San Francisco', 'CA', 'California', 'USA', 'United States', null, null, null),
  ('san-jose', 'San Jose, California', 'San Jose', 51, 'San Jose', 'CA', 'California', 'USA', 'United States', null, null, null),
  ('santa-clara', 'Santa Clara, California', 'Santa Clara', 52, 'Santa Clara', 'CA', 'California', 'USA', 'United States', null, null, null),
  ('savannah', 'Savannah, Georgia', 'Savannah', 53, 'Savannah', 'GA', 'Georgia', 'USA', 'United States', null, null, null),
  ('seattle', 'Seattle, Washington', 'Seattle', 54, 'Seattle', 'WA', 'Washington', 'USA', 'United States', null, null, null),
  ('shreveport', 'Shreveport, Louisiana', 'Shreveport', 55, 'Shreveport', 'LA', 'Louisiana', 'USA', 'United States', null, null, null),
  ('st-louis', 'St. Louis, Missouri', 'St. Louis', 56, 'St. Louis', 'MO', 'Missouri', 'USA', 'United States', null, null, null),
  ('tampa', 'Tampa, Florida', 'Tampa', 57, 'Tampa', 'FL', 'Florida', 'USA', 'United States', null, null, null),
  ('toronto', 'Toronto, Ontario', 'Toronto', 58, 'Toronto', 'ON', 'Ontario', 'CAN', 'Canada', null, null, null),
  ('tucson', 'Tucson, Arizona', 'Tucson', 59, 'Tucson', 'AZ', 'Arizona', 'USA', 'United States', null, null, null),
  ('tuscaloosa', 'Tuscaloosa, Alabama', 'Tuscaloosa', 60, 'Tuscaloosa', 'AL', 'Alabama', 'USA', 'United States', null, null, null),
  ('washington-dc', 'Washington, D.C.', 'Washington', 61, 'Washington', 'DC', 'D.C.', 'USA', 'United States', null, null, null),
  ('youngstown', 'Youngstown, Ohio', 'Youngstown', 62, 'Youngstown', 'OH', 'Ohio', 'USA', 'United States', null, null, null)
on conflict (slug) do update set
  city = excluded.city,
  label = excluded.label,
  sort_order = excluded.sort_order,
  city_name = excluded.city_name,
  state_code = excluded.state_code,
  state_name = excluded.state_name,
  country_code = excluded.country_code,
  country_name = excluded.country_name,
  sound_playlist_id = excluded.sound_playlist_id,
  sound_accent = excluded.sound_accent,
  sound_secondary = excluded.sound_secondary,
  archived = false,
  updated_at = now();



-- ###########################################################################
-- 2. Canonicalize London / Toronto / Melbourne
-- source: supabase/migrations/2026072203_fix_non_us_city_strings.sql
-- ###########################################################################

-- Canonicalize the three non-US city strings
-- ---------------------------------------------------------------------------
-- "London, England", "Toronto, Ontario" and "Melbourne, Victoria" were seeded
-- in forms that assets/geo.js does not round-trip: canonicalCity() turns them
-- into "London, United Kingdom" / "Toronto, Canada" / "Melbourne, Australia".
-- Because the city string is the key, the admin writing one of these would
-- create a SECOND row for the same place and split its gifts.
--
-- "Melbourne, Victoria" is the worst of the three: parseGeo() fails on it
-- outright (matched=false), so it renders no country oval and no state icon.
--
-- Run this BEFORE 2026072202_merge_gift_shop_cities_into_cities.sql so the bad
-- strings are never copied forward.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

begin;

-- 1. The catalog rows. The `where not exists` guard makes this a no-op if the
--    canonical row somehow already exists (re-run, or someone added it by hand).
update public.cities
   set city = 'London, United Kingdom',
       country_name = 'United Kingdom'
 where slug = 'london'
   and city <> 'London, United Kingdom'
   and not exists (select 1 from public.cities c where c.city = 'London, United Kingdom');

update public.cities
   set city = 'Toronto, Canada'
 where slug = 'toronto'
   and city <> 'Toronto, Canada'
   and not exists (select 1 from public.cities c where c.city = 'Toronto, Canada');

update public.cities
   set city = 'Melbourne, Australia',
       state_name = null
 where slug = 'melbourne'
   and city <> 'Melbourne, Australia'
   and not exists (select 1 from public.cities c where c.city = 'Melbourne, Australia');

-- 2. Everything that stores the city string. gift_shop_cities is the old table
--    (kept until the merge is proven); updating it keeps the two in step.
update public.gift_shop_listings
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end,
       updated_at = now()
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria');

update public.games
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria');

update public.gift_shop_cities
   set city = case city
        when 'London, England'     then 'London, United Kingdom'
        when 'Toronto, Ontario'    then 'Toronto, Canada'
        when 'Melbourne, Victoria' then 'Melbourne, Australia'
       end,
       updated_at = now()
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria')
   and not exists (
     select 1 from public.gift_shop_cities x
      where x.city in ('London, United Kingdom', 'Toronto, Canada', 'Melbourne, Australia')
        and x.city = case public.gift_shop_cities.city
              when 'London, England'     then 'London, United Kingdom'
              when 'Toronto, Ontario'    then 'Toronto, Canada'
              when 'Melbourne, Victoria' then 'Melbourne, Australia'
            end
   );

-- 3. Re-derive the structured geo columns for the three rows (the cities_sync_geo
--    trigger does this on its own once 2026072202 is applied; this covers the
--    case where this file runs first).
update public.cities t set
  city_name    = (public.tgb_parse_geo(t.city)).city_name,
  state_code   = (public.tgb_parse_geo(t.city)).state_code,
  state_name   = (public.tgb_parse_geo(t.city)).state_name,
  country_code = (public.tgb_parse_geo(t.city)).country_code,
  country_name = (public.tgb_parse_geo(t.city)).country_name
where t.slug in ('london', 'toronto', 'melbourne');

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect the three canonical strings, fully populated geo, and no leftovers.
select slug, city, city_name, state_code, state_name, country_code, country_name
  from public.cities
 where slug in ('london', 'toronto', 'melbourne')
 order by slug;

select 'gift_shop_listings' as src, city, count(*) from public.gift_shop_listings
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria') group by city
union all
select 'games', city, count(*) from public.games
 where city in ('London, England', 'Toronto, Ontario', 'Melbourne, Victoria') group by city;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- update public.cities set city = 'London, England',     country_name = 'England'  where slug = 'london';
-- update public.cities set city = 'Toronto, Ontario'                                where slug = 'toronto';
-- update public.cities set city = 'Melbourne, Victoria', state_name = 'Victoria'   where slug = 'melbourne';



-- ###########################################################################
-- 3. Merge gift_shop_cities into cities
-- source: supabase/migrations/2026072202_merge_gift_shop_cities_into_cities.sql
-- ###########################################################################

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



-- ###########################################################################
-- 4. gift-pics Storage bucket (independent)
-- source: supabase/migrations/2026072201_gift_pics_storage.sql
-- ###########################################################################

-- Gift shop images: a public `gift-pics` Storage bucket
-- ---------------------------------------------------------------------------
-- Some gift sources sit behind Cloudflare bot protection or send
-- Cross-Origin-Resource-Policy: same-origin, so their images can never be
-- hotlinked into the shop or the Stock Room preview (the request comes back as
-- a 403 challenge page, not an image). The fix is to rehost: the admin uploads
-- the picture here and gift_shop_items.image_url points at the public URL.
--
-- Objects are keyed <gift item id>/<timestamp>.jpg, so a gift's images stay
-- grouped and a re-upload never clobbers the previous one.
--
-- Read is public (the shop is a public site). Write is admin-only, gated by the
-- same is_photo_admin() check the rest of the gift-shop admin uses.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-pics',
  'gift-pics',
  true,
  10485760, -- 10 MB; the admin downscales to ~1200px before upload
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read (the bucket is public, but the policy makes it explicit).
drop policy if exists "gift_pics_public_read" on storage.objects;
create policy "gift_pics_public_read"
  on storage.objects for select
  using (bucket_id = 'gift-pics');

-- Only gift-shop admins may add, replace or remove images.
drop policy if exists "gift_pics_admin_insert" on storage.objects;
create policy "gift_pics_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'gift-pics' and public.is_photo_admin());

drop policy if exists "gift_pics_admin_update" on storage.objects;
create policy "gift_pics_admin_update"
  on storage.objects for update
  using (bucket_id = 'gift-pics' and public.is_photo_admin())
  with check (bucket_id = 'gift-pics' and public.is_photo_admin());

drop policy if exists "gift_pics_admin_delete" on storage.objects;
create policy "gift_pics_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'gift-pics' and public.is_photo_admin());

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- drop policy if exists "gift_pics_admin_delete" on storage.objects;
-- drop policy if exists "gift_pics_admin_update" on storage.objects;
-- drop policy if exists "gift_pics_admin_insert" on storage.objects;
-- drop policy if exists "gift_pics_public_read" on storage.objects;
-- delete from storage.objects where bucket_id = 'gift-pics';
-- delete from storage.buckets where id = 'gift-pics';
