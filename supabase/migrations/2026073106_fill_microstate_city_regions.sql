-- Fill state_name / state_code for the microstate + island-territory cities.
--
-- Why this exists:
-- 22 rows in public.cities carried a complete city_name / country_code /
-- country_name and a blank state_name + state_code. They are not corrupt data
-- and they are not a failed import: every one is a microstate, a city-state or
-- a small island territory, where the first-level region either does not exist
-- (Gibraltar, Macau, Aruba, Sint Maarten, Curacao, Guam) or simply IS the city
-- (Luxembourg, San Marino, Monte Carlo, Vaduz, Male, Ulaanbaatar).
--
-- Null is defensible for all of them -- the city-import prompt in
-- data/cities.html explicitly says to leave the pair null when a city "truly
-- has no meaningful first-level region". They are filled anyway because the
-- catalog already answers this question the other way for the same kind of
-- place: Singapore is Singapore/SG, Hong Kong is Hong Kong/HK, Bali is
-- Bali/BA. Repeating the city name in the region is redundant but consistent,
-- and consistency is worth more here than a blank cell that reads as an
-- oversight every time somebody scans the admin list.
--
-- NONE of these are deleted. All 22 are real destinations.
--
-- On the codes: state_code drives the map icons for US states only; outside
-- the US it is a display badge, and the catalog's own convention (per the
-- import prompt) is "the best real local abbreviation / postal abbreviation /
-- widely used short code in uppercase" -- not necessarily ISO 3166-2, whose
-- codes for several of these countries are numeric (ME-05, MT-060, MN-1) and
-- would look wrong beside the letter codes used everywhere else. Where a
-- standard letter code exists it is used and noted below; the rest are the
-- conventional local abbreviation.
--
-- Safe to re-run: only fills rows that are still blank, so a later hand-edit
-- is never overwritten.

begin;

update public.cities c
   set state_name = v.state_name,
       state_code = v.state_code
  from (values
      -- Region genuinely IS the city (city-states, capital districts,
      -- single-commune microstates). ISO 3166-2 has a subdivision for each.
      ('andorra-la-vella', 'Andorra la Vella', 'ALV'),  -- AD-07 parish
      ('budva',            'Budva',            'BD'),   -- ME-05 municipality
      ('kotor',            'Kotor',            'KO'),   -- ME-10 municipality
      ('luxembourg',       'Luxembourg',       'LU'),   -- LU-LU canton
      ('male',             'Male',             'MLE'),  -- MV-MLE
      ('monte-carlo',      'Monte Carlo',      'MC'),   -- MC-MC ward
      ('ohrid',            'Ohrid',            'OH'),   -- MK municipality
      ('san-marino',       'San Marino',       'SM'),   -- SM-07 castello
      ('skopje',           'Skopje',           'SK'),   -- MK-85, City of Skopje
      ('sliema',           'Sliema',           'SLM'),  -- MT-050 local council
      ('ulaanbaatar',      'Ulaanbaatar',      'UB'),   -- MN-1, province-level
      ('vaduz',            'Vaduz',            'VA'),   -- LI-11 commune
      ('valletta',         'Valletta',         'VLT'),  -- MT-060 local council

      -- No subdivision exists at all: the territory is the region. Codes are
      -- the territory's own well-known short form.
      ('gibraltar',        'Gibraltar',        'GI'),   -- ISO alpha-2
      ('macau',            'Macau',            'MO'),   -- ISO alpha-2
      ('oranjestad',       'Oranjestad',       'ORJ'),
      ('philipsburg',      'Philipsburg',      'PHI'),
      ('willemstad',       'Willemstad',       'WIL'),
      ('hagatna',          'Hagatna',          'HAG'),  -- Guam village

      -- Island / district that is a real place distinct from nothing else.
      ('avarua',           'Rarotonga',        'RAR'),  -- the island Avarua is on
      ('george-town',      'George Town',      'GT'),   -- Cayman district
      ('providenciales',   'Providenciales',   'PRV')   -- TCI district / island
  ) as v(slug, state_name, state_code)
 where c.slug = v.slug
   and (nullif(btrim(coalesce(c.state_name, '')), '') is null
     or nullif(btrim(coalesce(c.state_code, '')), '') is null);

-- Report anything still blank rather than aborting. Unlike the earlier
-- structured-geo backfill, a blank region here is LEGAL -- a genuinely
-- region-less city is allowed to keep the pair null, and a future import will
-- add more of them. This is a notice so a re-run stays quiet and informative.
do $$
declare
  v_left text;
begin
  select string_agg(city, ', ' order by city)
    into v_left
    from public.cities
   where nullif(btrim(coalesce(state_name, '')), '') is null
      or nullif(btrim(coalesce(state_code, '')), '') is null;

  if v_left is null then
    raise notice 'Every city now has a state_name and state_code.';
  else
    raise notice 'Still blank (legal -- fill or leave as-is): %', v_left;
  end if;
end $$;

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- select slug, city, state_name, state_code
--   from public.cities
--  where slug in ('valletta','monte-carlo','luxembourg','macau','avarua')
--  order by city;
--
-- Anything still missing either half of the pair:
-- select slug, city, country_name, state_name, state_code
--   from public.cities
--  where nullif(btrim(coalesce(state_name, '')), '') is null
--     or nullif(btrim(coalesce(state_code, '')), '') is null
--  order by city;

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- update public.cities set state_name = null, state_code = null
--  where slug in (
--    'andorra-la-vella','avarua','budva','george-town','gibraltar','hagatna',
--    'kotor','luxembourg','macau','male','monte-carlo','ohrid','oranjestad',
--    'philipsburg','providenciales','san-marino','skopje','sliema',
--    'ulaanbaatar','vaduz','valletta','willemstad');
