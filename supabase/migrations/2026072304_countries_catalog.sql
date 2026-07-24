-- 2026072304_countries_catalog.sql
--
-- Single source of truth for countries: public.countries. Replaces the hardcoded
-- country dictionaries that were duplicated in assets/geo.js (two maps) and in
-- the SQL geo functions (ct_n2c / ct_c2n). After this migration a country is
-- added by inserting ONE row here — geo.js fetches this table at runtime, and
-- the geo SQL functions read it directly.
--
-- What this does:
--   1. Create public.countries (code, name, aliases) + RLS mirroring cities.
--   2. Seed it from the 49 countries the site currently knows, with the parse
--      aliases (england/uk -> GBR, czechia -> CZE, uae -> ARE, us -> USA, ...).
--   3. Point cities.country_code at it via a NOT VALID FK (enforces new writes;
--      skips the historical check so a stray legacy value can't block deploy).
--   4. Rewrite tgb_parse_geo / tgb_compose_geo / tgb_canonical_gift_shop_city to
--      read countries instead of an inline map. They become STABLE (they read a
--      table) — US states / CA provinces stay inline (governmental, stable, and
--      they drive the map icons synchronously).
--
-- Additive + idempotent-ish (create if not exists / on conflict / or replace).

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.countries (
  code       text primary key,                    -- ISO 3166-1 alpha-3, e.g. 'FRA'
  name       text not null,                        -- canonical display name
  aliases    text[] not null default '{}',         -- lowercased alternate spellings for parsing
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists countries_name_lower_uidx on public.countries (lower(name));

alter table public.countries enable row level security;

drop policy if exists "Countries are publicly readable" on public.countries;
create policy "Countries are publicly readable"
  on public.countries
  for select
  to public
  using (true);

drop policy if exists "Authenticated users can manage countries" on public.countries;
create policy "Authenticated users can manage countries"
  on public.countries
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.countries to anon, authenticated;
grant insert, update, delete on public.countries to authenticated;

-- ── 2. Seed ─────────────────────────────────────────────────────────────────
insert into public.countries (code, name, aliases) values
  ('USA', 'United States',        array['united states of america','usa','us']),
  ('GBR', 'United Kingdom',       array['england','scotland','wales','northern ireland','great britain','uk']),
  ('FRA', 'France',               '{}'),
  ('DEU', 'Germany',              '{}'),
  ('ESP', 'Spain',                '{}'),
  ('ITA', 'Italy',                '{}'),
  ('PRT', 'Portugal',             '{}'),
  ('NLD', 'Netherlands',          '{}'),
  ('BEL', 'Belgium',              '{}'),
  ('IRL', 'Ireland',              '{}'),
  ('SWE', 'Sweden',               '{}'),
  ('NOR', 'Norway',               '{}'),
  ('DNK', 'Denmark',              '{}'),
  ('FIN', 'Finland',              '{}'),
  ('AUT', 'Austria',              '{}'),
  ('CHE', 'Switzerland',          '{}'),
  ('POL', 'Poland',               '{}'),
  ('CZE', 'Czech Republic',       array['czechia']),
  ('ROU', 'Romania',              '{}'),
  ('GRC', 'Greece',               '{}'),
  ('TUR', 'Turkey',               '{}'),
  ('RUS', 'Russia',               '{}'),
  ('UKR', 'Ukraine',              '{}'),
  ('MEX', 'Mexico',               '{}'),
  ('CAN', 'Canada',               '{}'),
  ('BRA', 'Brazil',               '{}'),
  ('ARG', 'Argentina',            '{}'),
  ('CHL', 'Chile',                '{}'),
  ('COL', 'Colombia',             '{}'),
  ('PER', 'Peru',                 '{}'),
  ('URY', 'Uruguay',              '{}'),
  ('AUS', 'Australia',            '{}'),
  ('NZL', 'New Zealand',          '{}'),
  ('JPN', 'Japan',                '{}'),
  ('CHN', 'China',                '{}'),
  ('HKG', 'Hong Kong',            '{}'),
  ('TWN', 'Taiwan',               '{}'),
  ('KOR', 'South Korea',          '{}'),
  ('IND', 'India',                '{}'),
  ('MYS', 'Malaysia',             '{}'),
  ('SGP', 'Singapore',            '{}'),
  ('THA', 'Thailand',             '{}'),
  ('IDN', 'Indonesia',            '{}'),
  ('PHL', 'Philippines',          '{}'),
  ('ZAF', 'South Africa',         '{}'),
  ('EGY', 'Egypt',                '{}'),
  ('ISR', 'Israel',               '{}'),
  ('SAU', 'Saudi Arabia',         '{}'),
  ('ARE', 'United Arab Emirates', array['uae'])
on conflict (code) do update
  set name = excluded.name,
      aliases = excluded.aliases,
      updated_at = now();

-- ── 3. Reference from cities ────────────────────────────────────────────────
-- Normalize first: blank -> null, trim + uppercase, so the FK has clean values.
update public.cities
   set country_code = nullif(upper(btrim(country_code)), '')
 where country_code is distinct from nullif(upper(btrim(country_code)), '');

-- NOT VALID: enforces every future insert/update, but does not re-check existing
-- rows (so an unexpected legacy value can't block this migration). Run
-- `alter table public.cities validate constraint cities_country_code_fkey;`
-- later once the historical data is confirmed clean.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cities_country_code_fkey'
  ) then
    alter table public.cities
      add constraint cities_country_code_fkey
      foreign key (country_code) references public.countries (code)
      not valid;
  end if;
end $$;

-- ── 4. Geo functions now read public.countries ──────────────────────────────
-- Parser: "City, Region[, Country]" -> structured parts. STABLE (reads a table).
create or replace function public.tgb_parse_geo(value text)
returns public.tgb_geo
language plpgsql
stable
as $$
declare
  us_c2n jsonb := '{"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."}'::jsonb;
  ca_c2n jsonb := '{"AB":"Alberta","BC":"British Columbia","MB":"Manitoba","NB":"New Brunswick","NL":"Newfoundland and Labrador","NS":"Nova Scotia","NT":"Northwest Territories","NU":"Nunavut","ON":"Ontario","PE":"Prince Edward Island","QC":"Quebec","SK":"Saskatchewan","YT":"Yukon"}'::jsonb;
  v text;
  parts text[];
  i int;
  part text;
  lp text;   -- lowercased part
  up text;   -- uppercased part (code candidate)
  kp text;   -- alpha-only token (for punctuated country aliases)
  city text;
  code text;
  ct_code text;
  ct_name text;
  res public.tgb_geo;
begin
  res.city_name := ''; res.state_code := ''; res.state_name := '';
  res.country_code := ''; res.country_name := ''; res.matched := false;

  v := nullif(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')), '');
  if v is null then
    return res;
  end if;

  -- Washington, D.C. (and comma-less "Washington DC")
  if v ~* '[, ]d\.?\s*c\.?$' or v ~* '^d\.?\s*c\.?$' then
    city := btrim(regexp_replace(v, '[, ]*d\.?\s*c\.?$', '', 'i'));
    if city = '' then city := 'Washington'; end if;
    res.city_name := city; res.state_code := 'DC'; res.state_name := 'D.C.';
    res.country_code := 'USA'; res.country_name := 'United States'; res.matched := true;
    return res;
  end if;

  parts := string_to_array(v, ',');
  for i in reverse array_length(parts, 1) .. 2 loop
    part := btrim(parts[i]);
    lp := lower(part);
    up := upper(part);
    kp := regexp_replace(lp, '[^a-z]', '', 'g');
    city := btrim(array_to_string(parts[1:i-1], ','));

    -- US state by 2-letter code or full name
    if us_c2n ? up then
      res.city_name := city; res.state_code := up; res.state_name := us_c2n->>up;
      res.country_code := 'USA'; res.country_name := 'United States'; res.matched := true;
      return res;
    end if;
    code := (select k from jsonb_each_text(us_c2n) t(k, val) where lower(val) = lp limit 1);
    if code is not null then
      res.city_name := city; res.state_code := code; res.state_name := us_c2n->>code;
      res.country_code := 'USA'; res.country_name := 'United States'; res.matched := true;
      return res;
    end if;

    -- Canadian province by code or name
    if ca_c2n ? up then
      res.city_name := city; res.state_code := up; res.state_name := ca_c2n->>up;
      res.country_code := 'CAN'; res.country_name := 'Canada'; res.matched := true;
      return res;
    end if;
    code := (select k from jsonb_each_text(ca_c2n) t(k, val) where lower(val) = lp limit 1);
    if code is not null then
      res.city_name := city; res.state_code := code; res.state_name := ca_c2n->>code;
      res.country_code := 'CAN'; res.country_name := 'Canada'; res.matched := true;
      return res;
    end if;

    -- Country by name/alias or alpha-3 code — from public.countries.
    select c.code, c.name into ct_code, ct_name
      from public.countries c
     where lower(c.name) = lp
        or lp = any (c.aliases)
        or kp = any (c.aliases)
        or c.code = up
     limit 1;
    if ct_code is not null then
      res.city_name := city; res.country_code := ct_code;
      res.country_name := coalesce(ct_name, part); res.matched := true;
      return res;
    end if;
  end loop;

  -- Nothing recognized: keep the first comma-part as the city.
  res.city_name := btrim(parts[1]);
  return res;
end;
$$;

-- Composer: structured parts -> canonical display/key string. STABLE.
create or replace function public.tgb_compose_geo(g public.tgb_geo)
returns text
language plpgsql
stable
as $$
declare
  us_c2n jsonb := '{"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."}'::jsonb;
  ca_c2n jsonb := '{"AB":"Alberta","BC":"British Columbia","MB":"Manitoba","NB":"New Brunswick","NL":"Newfoundland and Labrador","NS":"Nova Scotia","NT":"Northwest Territories","NU":"Nunavut","ON":"Ontario","PE":"Prince Edward Island","QC":"Quebec","SK":"Saskatchewan","YT":"Yukon"}'::jsonb;
  city text;
  sc text;
  cc text;
  cn text;
begin
  city := btrim(coalesce(g.city_name, ''));
  if city = '' then
    return '';
  end if;
  sc := upper(coalesce(g.state_code, ''));
  cc := upper(coalesce(g.country_code, ''));
  if cc = '' and us_c2n ? sc then cc := 'USA'; end if;
  if cc = '' and ca_c2n ? sc then cc := 'CAN'; end if;

  if (cc = 'USA' or (cc = '' and us_c2n ? sc)) and sc <> '' then
    if sc = 'DC' then
      return city || ', D.C.';
    end if;
    return city || ', ' || coalesce(us_c2n->>sc, nullif(btrim(coalesce(g.state_name, '')), ''), sc);
  end if;

  if cc <> '' and cc <> 'USA' then
    select name into cn from public.countries where code = cc;
    return city || ', ' || coalesce(cn, nullif(btrim(coalesce(g.country_name, '')), ''), cc);
  end if;

  return city;
end;
$$;

-- Canonicalizer calls the two above, so it becomes STABLE too. Body unchanged.
create or replace function public.tgb_canonical_gift_shop_city(value text)
returns text
language plpgsql
stable
as $$
declare
  v text;
  g public.tgb_geo;
  composed text;
begin
  v := nullif(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')), '');
  if v is null then
    return null;
  end if;
  g := public.tgb_parse_geo(v);
  if not g.matched then
    return v;   -- unknown format: pass through verbatim
  end if;
  composed := public.tgb_compose_geo(g);
  return coalesce(nullif(composed, ''), v);
end;
$$;
