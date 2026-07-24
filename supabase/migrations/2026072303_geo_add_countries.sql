-- 2026072303_geo_add_countries.sql
--
-- Adds 5 countries to the SQL geo twin so `tgb_parse_geo` recognizes them from a
-- "City, Country" string and `tgb_compose_geo` renders their canonical name:
--   Romania (ROU), Malaysia (MYS), Saudi Arabia (SAU), Hong Kong (HKG),
--   Taiwan (TWN).
--
-- Keeps the SQL in lock-step with assets/geo.js (COUNTRY_CODE_TO_NAME), which
-- gained the same 5 so they appear in the country dropdowns. These are the
-- countries used by the Europe/top-25 city seeds but missing from the original
-- 44-country map. Additive; safe to re-run (CREATE OR REPLACE). The only change
-- vs 20260711_structured_geo.sql is the two country jsonb literals (ct_n2c /
-- ct_c2n); everything else is copied verbatim.

-- ── Parser: "City, Region[, Country]" -> structured parts ────────────────────
create or replace function public.tgb_parse_geo(value text)
returns public.tgb_geo
language plpgsql
immutable
as $$
declare
  us_c2n jsonb := '{"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas","KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina","SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming","DC":"D.C."}'::jsonb;
  ca_c2n jsonb := '{"AB":"Alberta","BC":"British Columbia","MB":"Manitoba","NB":"New Brunswick","NL":"Newfoundland and Labrador","NS":"Nova Scotia","NT":"Northwest Territories","NU":"Nunavut","ON":"Ontario","PE":"Prince Edward Island","QC":"Quebec","SK":"Saskatchewan","YT":"Yukon"}'::jsonb;
  ct_n2c jsonb := '{"united kingdom":"GBR","england":"GBR","scotland":"GBR","wales":"GBR","northern ireland":"GBR","great britain":"GBR","uk":"GBR","france":"FRA","germany":"DEU","spain":"ESP","italy":"ITA","portugal":"PRT","netherlands":"NLD","belgium":"BEL","ireland":"IRL","sweden":"SWE","norway":"NOR","denmark":"DNK","finland":"FIN","austria":"AUT","switzerland":"CHE","poland":"POL","czech republic":"CZE","czechia":"CZE","romania":"ROU","greece":"GRC","turkey":"TUR","russia":"RUS","ukraine":"UKR","mexico":"MEX","canada":"CAN","brazil":"BRA","argentina":"ARG","chile":"CHL","colombia":"COL","peru":"PER","uruguay":"URY","australia":"AUS","new zealand":"NZL","japan":"JPN","china":"CHN","hong kong":"HKG","taiwan":"TWN","south korea":"KOR","india":"IND","malaysia":"MYS","singapore":"SGP","thailand":"THA","indonesia":"IDN","philippines":"PHL","south africa":"ZAF","egypt":"EGY","israel":"ISR","saudi arabia":"SAU","united arab emirates":"ARE","uae":"ARE","united states":"USA","united states of america":"USA","usa":"USA","us":"USA"}'::jsonb;
  ct_c2n jsonb := '{"USA":"United States","GBR":"United Kingdom","FRA":"France","DEU":"Germany","ESP":"Spain","ITA":"Italy","PRT":"Portugal","NLD":"Netherlands","BEL":"Belgium","IRL":"Ireland","SWE":"Sweden","NOR":"Norway","DNK":"Denmark","FIN":"Finland","AUT":"Austria","CHE":"Switzerland","POL":"Poland","CZE":"Czech Republic","ROU":"Romania","GRC":"Greece","TUR":"Turkey","RUS":"Russia","UKR":"Ukraine","MEX":"Mexico","CAN":"Canada","BRA":"Brazil","ARG":"Argentina","CHL":"Chile","COL":"Colombia","PER":"Peru","URY":"Uruguay","AUS":"Australia","NZL":"New Zealand","JPN":"Japan","CHN":"China","HKG":"Hong Kong","TWN":"Taiwan","KOR":"South Korea","IND":"India","MYS":"Malaysia","SGP":"Singapore","THA":"Thailand","IDN":"Indonesia","PHL":"Philippines","ZAF":"South Africa","EGY":"Egypt","ISR":"Israel","SAU":"Saudi Arabia","ARE":"United Arab Emirates"}'::jsonb;
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
  ct_c2n jsonb := '{"USA":"United States","GBR":"United Kingdom","FRA":"France","DEU":"Germany","ESP":"Spain","ITA":"Italy","PRT":"Portugal","NLD":"Netherlands","BEL":"Belgium","IRL":"Ireland","SWE":"Sweden","NOR":"Norway","DNK":"Denmark","FIN":"Finland","AUT":"Austria","CHE":"Switzerland","POL":"Poland","CZE":"Czech Republic","ROU":"Romania","GRC":"Greece","TUR":"Turkey","RUS":"Russia","UKR":"Ukraine","MEX":"Mexico","CAN":"Canada","BRA":"Brazil","ARG":"Argentina","CHL":"Chile","COL":"Colombia","PER":"Peru","URY":"Uruguay","AUS":"Australia","NZL":"New Zealand","JPN":"Japan","CHN":"China","HKG":"Hong Kong","TWN":"Taiwan","KOR":"South Korea","IND":"India","MYS":"Malaysia","SGP":"Singapore","THA":"Thailand","IDN":"Indonesia","PHL":"Philippines","ZAF":"South Africa","EGY":"Egypt","ISR":"Israel","SAU":"Saudi Arabia","ARE":"United Arab Emirates"}'::jsonb;
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
