-- Add `continent` to public.countries.
--
-- Why this exists:
-- The cities admin (data/cities.html) filters the catalog by continent. The
-- continent of a country is a property OF THE COUNTRY, so it belongs on the
-- country row -- not in a lookup table pasted into the one page that needed it
-- first. public.countries is already the single source of truth for the country
-- catalog (see 2026072304_countries_catalog.sql); a page-local map would go
-- stale the moment somebody adds a country through the normal insert-one-row
-- path and nobody remembered to also edit the page.
--
-- Values are the seven-continent model, matching the UN M49 geoscheme where it
-- and common usage disagree. The judgement calls worth knowing about:
--   * Russia and Turkey -> Europe (both transcontinental; filed where the
--     population and the destination cities are).
--   * Cyprus -> Asia, per M49, though it is politically European.
--   * Christmas Island, Cocos and the US Minor Outlying Islands -> Oceania,
--     per M49, despite being Indian-Ocean or scattered.
--   * Greenland -> North America; Hawaii is not separate (it is part of USA).
--   * Antarctica is a real value with five territories, so the CHECK allows it.
--     No city will ever carry it, which is fine -- the filter just never offers
--     it (data/cities.html only lists continents that have cities).
--
-- All 249 ISO 3166-1 alpha-3 rows in the table are covered; verified against
-- the live catalog on 2026-07-31 (249 mapped, 0 missing, 0 duplicated).
--
-- Safe to re-run: the seed is an upsert-by-code and the column add is IF NOT EXISTS.

begin;

alter table public.countries
  add column if not exists continent text;

-- Dropped and re-added so a re-run with an edited value list cannot leave the
-- old constraint behind.
alter table public.countries
  drop constraint if exists countries_continent_check;
alter table public.countries
  add constraint countries_continent_check check (
    continent is null or continent in (
      'Africa', 'Antarctica', 'Asia', 'Europe',
      'North America', 'Oceania', 'South America'
    )
  );

comment on column public.countries.continent is
  'Seven-continent model, UN M49 where usage differs. Source of truth for the continent filter in data/cities.html -- see supabase/migrations/2026073105_countries_continent.sql.';

-- Seed. Keyed on code, so a country added later without a continent is simply
-- left null (and shows as Unassigned in the admin filter) rather than
-- blocking anything.
update public.countries c
   set continent = v.continent
  from (values
    -- Africa (58)
    ('AGO','Africa'), ('BDI','Africa'), ('BEN','Africa'), ('BFA','Africa'),
    ('BWA','Africa'), ('CAF','Africa'), ('CIV','Africa'), ('CMR','Africa'),
    ('COD','Africa'), ('COG','Africa'), ('COM','Africa'), ('CPV','Africa'),
    ('DJI','Africa'), ('DZA','Africa'), ('EGY','Africa'), ('ERI','Africa'),
    ('ESH','Africa'), ('ETH','Africa'), ('GAB','Africa'), ('GHA','Africa'),
    ('GIN','Africa'), ('GMB','Africa'), ('GNB','Africa'), ('GNQ','Africa'),
    ('KEN','Africa'), ('LBR','Africa'), ('LBY','Africa'), ('LSO','Africa'),
    ('MAR','Africa'), ('MDG','Africa'), ('MLI','Africa'), ('MOZ','Africa'),
    ('MRT','Africa'), ('MUS','Africa'), ('MWI','Africa'), ('MYT','Africa'),
    ('NAM','Africa'), ('NER','Africa'), ('NGA','Africa'), ('REU','Africa'),
    ('RWA','Africa'), ('SDN','Africa'), ('SEN','Africa'), ('SHN','Africa'),
    ('SLE','Africa'), ('SOM','Africa'), ('SSD','Africa'), ('STP','Africa'),
    ('SWZ','Africa'), ('SYC','Africa'), ('TCD','Africa'), ('TGO','Africa'),
    ('TUN','Africa'), ('TZA','Africa'), ('UGA','Africa'), ('ZAF','Africa'),
    ('ZMB','Africa'), ('ZWE','Africa'),
    -- Antarctica (5)
    ('ATA','Antarctica'), ('ATF','Antarctica'), ('BVT','Antarctica'), ('HMD','Antarctica'),
    ('SGS','Antarctica'),
    -- Asia (52)
    ('AFG','Asia'), ('ARE','Asia'), ('ARM','Asia'), ('AZE','Asia'),
    ('BGD','Asia'), ('BHR','Asia'), ('BRN','Asia'), ('BTN','Asia'),
    ('CHN','Asia'), ('CYP','Asia'), ('GEO','Asia'), ('HKG','Asia'),
    ('IDN','Asia'), ('IND','Asia'), ('IOT','Asia'), ('IRN','Asia'),
    ('IRQ','Asia'), ('ISR','Asia'), ('JOR','Asia'), ('JPN','Asia'),
    ('KAZ','Asia'), ('KGZ','Asia'), ('KHM','Asia'), ('KOR','Asia'),
    ('KWT','Asia'), ('LAO','Asia'), ('LBN','Asia'), ('LKA','Asia'),
    ('MAC','Asia'), ('MDV','Asia'), ('MMR','Asia'), ('MNG','Asia'),
    ('MYS','Asia'), ('NPL','Asia'), ('OMN','Asia'), ('PAK','Asia'),
    ('PHL','Asia'), ('PRK','Asia'), ('PSE','Asia'), ('QAT','Asia'),
    ('SAU','Asia'), ('SGP','Asia'), ('SYR','Asia'), ('THA','Asia'),
    ('TJK','Asia'), ('TKM','Asia'), ('TLS','Asia'), ('TUR','Asia'),
    ('TWN','Asia'), ('UZB','Asia'), ('VNM','Asia'), ('YEM','Asia'),
    -- Europe (51)
    ('ALA','Europe'), ('ALB','Europe'), ('AND','Europe'), ('AUT','Europe'),
    ('BEL','Europe'), ('BGR','Europe'), ('BIH','Europe'), ('BLR','Europe'),
    ('CHE','Europe'), ('CZE','Europe'), ('DEU','Europe'), ('DNK','Europe'),
    ('ESP','Europe'), ('EST','Europe'), ('FIN','Europe'), ('FRA','Europe'),
    ('FRO','Europe'), ('GBR','Europe'), ('GGY','Europe'), ('GIB','Europe'),
    ('GRC','Europe'), ('HRV','Europe'), ('HUN','Europe'), ('IMN','Europe'),
    ('IRL','Europe'), ('ISL','Europe'), ('ITA','Europe'), ('JEY','Europe'),
    ('LIE','Europe'), ('LTU','Europe'), ('LUX','Europe'), ('LVA','Europe'),
    ('MCO','Europe'), ('MDA','Europe'), ('MKD','Europe'), ('MLT','Europe'),
    ('MNE','Europe'), ('NLD','Europe'), ('NOR','Europe'), ('POL','Europe'),
    ('PRT','Europe'), ('ROU','Europe'), ('RUS','Europe'), ('SJM','Europe'),
    ('SMR','Europe'), ('SRB','Europe'), ('SVK','Europe'), ('SVN','Europe'),
    ('SWE','Europe'), ('UKR','Europe'), ('VAT','Europe'),
    -- North America (41)
    ('ABW','North America'), ('AIA','North America'), ('ATG','North America'), ('BES','North America'),
    ('BHS','North America'), ('BLM','North America'), ('BLZ','North America'), ('BMU','North America'),
    ('BRB','North America'), ('CAN','North America'), ('CRI','North America'), ('CUB','North America'),
    ('CUW','North America'), ('CYM','North America'), ('DMA','North America'), ('DOM','North America'),
    ('GLP','North America'), ('GRD','North America'), ('GRL','North America'), ('GTM','North America'),
    ('HND','North America'), ('HTI','North America'), ('JAM','North America'), ('KNA','North America'),
    ('LCA','North America'), ('MAF','North America'), ('MEX','North America'), ('MSR','North America'),
    ('MTQ','North America'), ('NIC','North America'), ('PAN','North America'), ('PRI','North America'),
    ('SLV','North America'), ('SPM','North America'), ('SXM','North America'), ('TCA','North America'),
    ('TTO','North America'), ('USA','North America'), ('VCT','North America'), ('VGB','North America'),
    ('VIR','North America'),
    -- Oceania (28)
    ('ASM','Oceania'), ('AUS','Oceania'), ('CCK','Oceania'), ('COK','Oceania'),
    ('CXR','Oceania'), ('FJI','Oceania'), ('FSM','Oceania'), ('GUM','Oceania'),
    ('KIR','Oceania'), ('MHL','Oceania'), ('MNP','Oceania'), ('NCL','Oceania'),
    ('NFK','Oceania'), ('NIU','Oceania'), ('NRU','Oceania'), ('NZL','Oceania'),
    ('PCN','Oceania'), ('PLW','Oceania'), ('PNG','Oceania'), ('PYF','Oceania'),
    ('SLB','Oceania'), ('TKL','Oceania'), ('TON','Oceania'), ('TUV','Oceania'),
    ('UMI','Oceania'), ('VUT','Oceania'), ('WLF','Oceania'), ('WSM','Oceania'),
    -- South America (14)
    ('ARG','South America'), ('BOL','South America'), ('BRA','South America'), ('CHL','South America'),
    ('COL','South America'), ('ECU','South America'), ('FLK','South America'), ('GUF','South America'),
    ('GUY','South America'), ('PER','South America'), ('PRY','South America'), ('SUR','South America'),
    ('URY','South America'), ('VEN','South America')
  ) as v(code, continent)
 where c.code = v.code
   and c.continent is distinct from v.continent;

-- Prove every country got one. This is a seed of a closed, known set -- if a
-- row is missing it means the ISO list changed and the values above need a new
-- entry, which should be loud.
do $$
declare
  v_missing text;
begin
  select string_agg(code || ' (' || name || ')', ', ' order by code)
    into v_missing
    from public.countries
   where continent is null;

  if v_missing is not null then
    raise exception
      'public.countries rows with no continent: %. Add them to the values list in this migration and re-run.',
      v_missing;
  end if;
end $$;

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select continent, count(*) from public.countries group by continent order by continent;
--
-- Continents actually represented in the city catalog:
-- select co.continent, count(*) as cities
--   from public.cities ci
--   join public.countries co on co.code = ci.country_code
--  group by co.continent
--  order by co.continent;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- alter table public.countries drop constraint if exists countries_continent_check;
-- alter table public.countries drop column if exists continent;
