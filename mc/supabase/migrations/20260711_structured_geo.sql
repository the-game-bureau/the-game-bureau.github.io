-- Structured city / state / country model (additive + reversible).
--
-- Adds five nullable structured columns to games, gift_shop_cities and teams:
--   city_name, state_code, state_name, country_code, country_name
-- The existing string columns (games.city, gift_shop_cities.city PK,
-- gift_shop_listings.city, teams.game_city/…) are LEFT as the canonical
-- display/key so /shop/?city= URLs and the gift_shop_cities primary key are
-- unchanged. The 2-letter state_code drives the map icons; the full name is
-- kept for display.
--
-- SQL parse/compose here is the twin of assets/geo.js (parseGeo / composeGeo /
-- canonicalCity). Keep the two in lock-step — the test cases must agree:
--   'Denver, CO'      -> Denver / CO / Colorado / USA
--   'Washington, D.C.'-> Washington / DC / D.C. / USA
--   'Paris, France'   -> Paris / '' / '' / FRA
--   'Toronto, ON'     -> Toronto / ON / Ontario / CAN

begin;

-- ── Composite result type for the parser ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'tgb_geo' and n.nspname = 'public'
  ) then
    create type public.tgb_geo as (
      city_name text, state_code text, state_name text,
      country_code text, country_name text, matched boolean
    );
  end if;
end $$;

-- ── Parser: "City, Region[, Country]" -> structured parts ────────────────────
create or replace function public.tgb_parse_geo(value text)
returns public.tgb_geo
language plpgsql
immutable
as $$
declare
  us_c2n jsonb := '{"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."}'::jsonb;
  ca_c2n jsonb := '{"AB":"Alberta","BC":"British Columbia","MB":"Manitoba","NB":"New Brunswick","NL":"Newfoundland and Labrador","NS":"Nova Scotia","NT":"Northwest Territories","NU":"Nunavut","ON":"Ontario","PE":"Prince Edward Island","QC":"Quebec","SK":"Saskatchewan","YT":"Yukon"}'::jsonb;
  ct_n2c jsonb := '{"united kingdom":"GBR","england":"GBR","scotland":"GBR","wales":"GBR","northern ireland":"GBR","great britain":"GBR","uk":"GBR","france":"FRA","germany":"DEU","spain":"ESP","italy":"ITA","portugal":"PRT","netherlands":"NLD","belgium":"BEL","ireland":"IRL","sweden":"SWE","norway":"NOR","denmark":"DNK","finland":"FIN","austria":"AUT","switzerland":"CHE","poland":"POL","czech republic":"CZE","czechia":"CZE","greece":"GRC","turkey":"TUR","russia":"RUS","ukraine":"UKR","mexico":"MEX","canada":"CAN","brazil":"BRA","argentina":"ARG","chile":"CHL","colombia":"COL","peru":"PER","uruguay":"URY","australia":"AUS","new zealand":"NZL","japan":"JPN","china":"CHN","south korea":"KOR","india":"IND","singapore":"SGP","thailand":"THA","indonesia":"IDN","philippines":"PHL","south africa":"ZAF","egypt":"EGY","israel":"ISR","united arab emirates":"ARE","uae":"ARE","united states":"USA","united states of america":"USA","usa":"USA","us":"USA"}'::jsonb;
  ct_c2n jsonb := '{"USA":"United States","GBR":"United Kingdom","FRA":"France","DEU":"Germany","ESP":"Spain","ITA":"Italy","PRT":"Portugal","NLD":"Netherlands","BEL":"Belgium","IRL":"Ireland","SWE":"Sweden","NOR":"Norway","DNK":"Denmark","FIN":"Finland","AUT":"Austria","CHE":"Switzerland","POL":"Poland","CZE":"Czech Republic","GRC":"Greece","TUR":"Turkey","RUS":"Russia","UKR":"Ukraine","MEX":"Mexico","CAN":"Canada","BRA":"Brazil","ARG":"Argentina","CHL":"Chile","COL":"Colombia","PER":"Peru","URY":"Uruguay","AUS":"Australia","NZL":"New Zealand","JPN":"Japan","CHN":"China","KOR":"South Korea","IND":"India","SGP":"Singapore","THA":"Thailand","IDN":"Indonesia","PHL":"Philippines","ZAF":"South Africa","EGY":"Egypt","ISR":"Israel","ARE":"United Arab Emirates"}'::jsonb;
  v text;
  parts text[];
  i int;
  part text;
  lp text;   -- lowercased part
  up text;   -- uppercased part (code candidate)
  kp text;   -- alpha-only token (for punctuated country aliases)
  city text;
  code text;
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

    -- Country by name/alias or alpha-3 code
    if ct_n2c ? lp or ct_n2c ? kp then
      code := coalesce(ct_n2c->>lp, ct_n2c->>kp);
      res.city_name := city; res.country_code := code;
      res.country_name := coalesce(ct_c2n->>code, part); res.matched := true;
      return res;
    end if;
    if ct_c2n ? up then
      res.city_name := city; res.country_code := up; res.country_name := ct_c2n->>up;
      res.matched := true;
      return res;
    end if;
  end loop;

  -- Nothing recognized: keep the first comma-part as the city.
  res.city_name := btrim(parts[1]);
  return res;
end;
$$;

-- ── Composer: structured parts -> canonical display/key string ──────────────
create or replace function public.tgb_compose_geo(g public.tgb_geo)
returns text
language plpgsql
immutable
as $$
declare
  us_c2n jsonb := '{"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."}'::jsonb;
  ca_c2n jsonb := '{"AB":"Alberta","BC":"British Columbia","MB":"Manitoba","NB":"New Brunswick","NL":"Newfoundland and Labrador","NS":"Nova Scotia","NT":"Northwest Territories","NU":"Nunavut","ON":"Ontario","PE":"Prince Edward Island","QC":"Quebec","SK":"Saskatchewan","YT":"Yukon"}'::jsonb;
  ct_c2n jsonb := '{"USA":"United States","GBR":"United Kingdom","FRA":"France","DEU":"Germany","ESP":"Spain","ITA":"Italy","PRT":"Portugal","NLD":"Netherlands","BEL":"Belgium","IRL":"Ireland","SWE":"Sweden","NOR":"Norway","DNK":"Denmark","FIN":"Finland","AUT":"Austria","CHE":"Switzerland","POL":"Poland","CZE":"Czech Republic","GRC":"Greece","TUR":"Turkey","RUS":"Russia","UKR":"Ukraine","MEX":"Mexico","CAN":"Canada","BRA":"Brazil","ARG":"Argentina","CHL":"Chile","COL":"Colombia","PER":"Peru","URY":"Uruguay","AUS":"Australia","NZL":"New Zealand","JPN":"Japan","CHN":"China","KOR":"South Korea","IND":"India","SGP":"Singapore","THA":"Thailand","IDN":"Indonesia","PHL":"Philippines","ZAF":"South Africa","EGY":"Egypt","ISR":"Israel","ARE":"United Arab Emirates"}'::jsonb;
  city text;
  sc text;
  cc text;
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
    return city || ', ' || coalesce(ct_c2n->>cc, nullif(btrim(coalesce(g.country_name, '')), ''), cc);
  end if;

  return city;
end;
$$;

-- ── Canonicalizer (now country/province-aware; same contract as before) ─────
create or replace function public.tgb_canonical_gift_shop_city(value text)
returns text
language plpgsql
immutable
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

-- ── Structured columns ──────────────────────────────────────────────────────
alter table public.games            add column if not exists city_name    text;
alter table public.games            add column if not exists state_code    text;
alter table public.games            add column if not exists state_name    text;
alter table public.games            add column if not exists country_code  text;
alter table public.games            add column if not exists country_name  text;

alter table public.gift_shop_cities add column if not exists city_name    text;
alter table public.gift_shop_cities add column if not exists state_code    text;
alter table public.gift_shop_cities add column if not exists state_name    text;
alter table public.gift_shop_cities add column if not exists country_code  text;
alter table public.gift_shop_cities add column if not exists country_name  text;

alter table public.teams            add column if not exists city_name    text;
alter table public.teams            add column if not exists state_code    text;
alter table public.teams            add column if not exists state_name    text;
alter table public.teams            add column if not exists country_code  text;
alter table public.teams            add column if not exists country_name  text;

-- ── Sync triggers: fill EMPTY structured columns from the source string ──────
-- coalesce(existing, parsed) so explicit values written by the builder / admin
-- win; SQL-only inserts (e.g. the paste-in importers) get derived values.
create or replace function public.tgb_sync_games_geo()
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

create or replace function public.tgb_sync_gift_shop_cities_geo()
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

create or replace function public.tgb_sync_teams_geo()
returns trigger language plpgsql as $$
declare g public.tgb_geo;
begin
  g := public.tgb_parse_geo(new.game_city);
  new.city_name    := coalesce(nullif(new.city_name, ''),    nullif(g.city_name, ''));
  new.state_code   := coalesce(nullif(new.state_code, ''),   nullif(g.state_code, ''));
  new.state_name   := coalesce(nullif(new.state_name, ''),   nullif(g.state_name, ''));
  new.country_code := coalesce(nullif(new.country_code, ''), nullif(g.country_code, ''));
  new.country_name := coalesce(nullif(new.country_name, ''), nullif(g.country_name, ''));
  return new;
end;
$$;

drop trigger if exists games_sync_geo on public.games;
create trigger games_sync_geo
before insert or update of city, city_name, state_code, state_name, country_code, country_name
on public.games
for each row execute function public.tgb_sync_games_geo();

drop trigger if exists gift_shop_cities_sync_geo on public.gift_shop_cities;
create trigger gift_shop_cities_sync_geo
before insert or update of city, city_name, state_code, state_name, country_code, country_name
on public.gift_shop_cities
for each row execute function public.tgb_sync_gift_shop_cities_geo();

drop trigger if exists teams_sync_geo on public.teams;
create trigger teams_sync_geo
before insert or update of game_city, city_name, state_code, state_name, country_code, country_name
on public.teams
for each row execute function public.tgb_sync_teams_geo();

-- ── Backfill existing rows (fill only where empty) ──────────────────────────
-- Inline (public.tgb_parse_geo(col)).field form: unambiguous and avoids the
-- non-portable "UPDATE ... FROM func(target.col)" lateral construct.
update public.games t set
  city_name    = coalesce(nullif(t.city_name, ''),    nullif((public.tgb_parse_geo(t.city)).city_name, '')),
  state_code   = coalesce(nullif(t.state_code, ''),   nullif((public.tgb_parse_geo(t.city)).state_code, '')),
  state_name   = coalesce(nullif(t.state_name, ''),   nullif((public.tgb_parse_geo(t.city)).state_name, '')),
  country_code = coalesce(nullif(t.country_code, ''), nullif((public.tgb_parse_geo(t.city)).country_code, '')),
  country_name = coalesce(nullif(t.country_name, ''), nullif((public.tgb_parse_geo(t.city)).country_name, ''))
where t.city is not null;

update public.gift_shop_cities t set
  city_name    = coalesce(nullif(t.city_name, ''),    nullif((public.tgb_parse_geo(t.city)).city_name, '')),
  state_code   = coalesce(nullif(t.state_code, ''),   nullif((public.tgb_parse_geo(t.city)).state_code, '')),
  state_name   = coalesce(nullif(t.state_name, ''),   nullif((public.tgb_parse_geo(t.city)).state_name, '')),
  country_code = coalesce(nullif(t.country_code, ''), nullif((public.tgb_parse_geo(t.city)).country_code, '')),
  country_name = coalesce(nullif(t.country_name, ''), nullif((public.tgb_parse_geo(t.city)).country_name, ''))
where t.city is not null;

update public.teams t set
  city_name    = coalesce(nullif(t.city_name, ''),    nullif((public.tgb_parse_geo(t.game_city)).city_name, '')),
  state_code   = coalesce(nullif(t.state_code, ''),   nullif((public.tgb_parse_geo(t.game_city)).state_code, '')),
  state_name   = coalesce(nullif(t.state_name, ''),   nullif((public.tgb_parse_geo(t.game_city)).state_name, '')),
  country_code = coalesce(nullif(t.country_code, ''), nullif((public.tgb_parse_geo(t.game_city)).country_code, '')),
  country_name = coalesce(nullif(t.country_name, ''), nullif((public.tgb_parse_geo(t.game_city)).country_name, ''))
where t.game_city is not null;

-- Normalize existing US start-city strings to the canonical full-name form so
-- icons resolve (e.g. 'Houston, TX' -> 'Houston, Texas'). US rows only —
-- intl/unknown strings and the gift_shop_cities PK are left untouched.
update public.games t set
  city = public.tgb_canonical_gift_shop_city(t.city)
where t.city is not null
  and (public.tgb_parse_geo(t.city)).country_code = 'USA'
  and public.tgb_canonical_gift_shop_city(t.city) is not null
  and public.tgb_canonical_gift_shop_city(t.city) <> t.city;

commit;
