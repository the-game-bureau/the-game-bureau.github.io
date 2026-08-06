-- Backfill missing structured city metadata on public.cities.
--
-- Why this exists:
-- Some city rows carry a canonical `city` string but are missing one or more of
-- the structured metadata fields that the admin/editor surfaces expect:
--   city_name, state_name, state_code, country_name, country_code.
--
-- The general rule is:
--   1. Fill what can be derived automatically from public.tgb_parse_geo(city).
--   2. Then patch the known non-US rows whose first-level region is real but
--      not inferable from the canonical "City, Country" string.
--
-- Safe to re-run: every assignment is coalescing or idempotent.

begin;

-- 0. Merge legacy duplicate city rows that can collide when normalizing city
--    strings (for example "Sacramento, CA" -> "Sacramento, California").
--
--    Keep the canonical slug (`sacramento`), preserve any metadata/flags from
--    the legacy alias slug (`sacramento-ca`), repoint dependent slug FKs, then
--    delete the alias row. Safe to re-run.
do $$
begin
   if exists (select 1 from public.cities where slug = 'sacramento')
       and exists (select 1 from public.cities where slug = 'sacramento-ca') then

      update public.cities c
          set label = coalesce(nullif(c.label, ''), nullif(a.label, '')),
                sort_order = coalesce(c.sort_order, a.sort_order),
                city_name = coalesce(nullif(c.city_name, ''), nullif(a.city_name, '')),
                state_name = coalesce(nullif(c.state_name, ''), nullif(a.state_name, '')),
                state_code = coalesce(nullif(c.state_code, ''), nullif(a.state_code, '')),
                country_name = coalesce(nullif(c.country_name, ''), nullif(a.country_name, '')),
                country_code = coalesce(nullif(c.country_code, ''), nullif(a.country_code, '')),
                sound_playlist_id = coalesce(c.sound_playlist_id, a.sound_playlist_id),
                sound_accent = coalesce(c.sound_accent, a.sound_accent),
                sound_secondary = coalesce(c.sound_secondary, a.sound_secondary),
                hide_from_games = coalesce(c.hide_from_games, false) or coalesce(a.hide_from_games, false),
                hide_from_soundtracks = coalesce(c.hide_from_soundtracks, false) or coalesce(a.hide_from_soundtracks, false),
                hide_from_gift_shop = coalesce(c.hide_from_gift_shop, false) or coalesce(a.hide_from_gift_shop, false),
                ignored = coalesce(c.ignored, false) or coalesce(a.ignored, false)
         from public.cities a
       where c.slug = 'sacramento'
          and a.slug = 'sacramento-ca';

      update public.soundtracks
          set city_slug = 'sacramento'
       where city_slug = 'sacramento-ca';

      update public.soundtrack_songs
          set city_slug = 'sacramento'
       where city_slug = 'sacramento-ca';

      delete from public.cities where slug = 'sacramento-ca';
   end if;
end $$;

-- 1. Fill any missing structured fields that the shared geo parser CAN infer
--    directly from the canonical city string.
update public.cities c
   set city_name    = coalesce(nullif(c.city_name, ''),    nullif((public.tgb_parse_geo(c.city)).city_name, '')),
       state_name   = coalesce(nullif(c.state_name, ''),   nullif((public.tgb_parse_geo(c.city)).state_name, '')),
       state_code   = coalesce(nullif(c.state_code, ''),   nullif((public.tgb_parse_geo(c.city)).state_code, '')),
       country_name = coalesce(nullif(c.country_name, ''), nullif((public.tgb_parse_geo(c.city)).country_name, '')),
       country_code = coalesce(nullif(c.country_code, ''), nullif((public.tgb_parse_geo(c.city)).country_code, ''))
 where nullif(c.city_name, '') is null
    or nullif(c.state_name, '') is null
    or nullif(c.state_code, '') is null
    or nullif(c.country_name, '') is null
    or nullif(c.country_code, '') is null;

-- 2. Fill the known foreign first-level regions that are intentionally NOT part
--    of the canonical city key (e.g. "Toronto, Canada" instead of
--    "Toronto, Ontario").
update public.cities c
   set state_name = v.state_name,
       state_code = v.state_code
  from (values
      ('abu-dhabi',         'Abu Dhabi',        'AZ'),
      ('athens-grc',        'Attica',           'I'),
      ('auckland',          'Auckland',         'AUK'),
      ('beijing',           'Beijing',          'BJ'),
      ('bogota',            'Bogota',           'DC'),
      ('brisbane',          'Queensland',       'QLD'),
      ('brussels',          'Brussels-Capital', 'BRU'),
      ('budapest',          'Budapest',         'BU'),
      ('buenos-aires',      'Buenos Aires',     'C'),
      ('busan',             'Busan',            'BS'),
      ('cairo',             'Cairo',            'C'),
      ('calgary',           'Alberta',          'AB'),
      ('cancun',            'Quintana Roo',     'ROO'),
      ('cape-town',         'Western Cape',     'WC'),
      ('cartagena',         'Bolivar',          'BOL'),
      ('copenhagen',        'Capital Region',   '84'),
      ('cusco',             'Cusco',            'CUS'),
    ('dubai',             'Dubai',            'DU'),
      ('doha',              'Doha',             'DA'),
      ('dublin',            'Leinster',         'L'),
      ('dubrovnik',         'Dubrovnik-Neretva','19'),
      ('edinburgh',         'Scotland',         'SCT'),
      ('edmonton',          'Alberta',          'AB'),
      ('florence',          'Tuscany',          'TOS'),
      ('guadalajara',       'Jalisco',          'JAL'),
      ('hamburg',           'Hamburg',          'HH'),
      ('hanoi',             'Hanoi',            'HN'),
      ('havana',            'La Habana',        '23'),
      ('helsinki',          'Uusimaa',          '18'),
      ('ho-chi-minh-city',  'Ho Chi Minh City', 'SG'),
      ('jakarta',           'Jakarta',          'JK'),
      ('krakow',            'Lesser Poland',    'MA'),
      ('kyoto',             'Kyoto',            '26'),
      ('lima',              'Lima',             'LMA'),
      ('lisbon',            'Lisbon',           'LIS'),
      ('lyon',              'Auvergne-Rhone-Alpes', 'ARA'),
      ('manila',            'Metro Manila',     'NCR'),
      ('marrakech',         'Marrakesh-Safi',   'MSF'),
      ('marseille',         'Provence-Alpes-Cote d''Azur', 'PAC'),
    ('melbourne',         'Victoria',         'VIC'),
      ('montreal',          'Quebec',           'QC'),
      ('mumbai',            'Maharashtra',      'MH'),
      ('naples',            'Campania',         'CAM'),
      ('nassau',            'New Providence',   'NP'),
      ('new-delhi',         'Delhi',            'DL'),
      ('nice',              'Provence-Alpes-Cote d''Azur', 'PAC'),
      ('oslo',              'Oslo',             '03'),
      ('ottawa',            'Ontario',          'ON'),
      ('perth',             'Western Australia','WA'),
      ('porto',             'Porto',            '13'),
      ('quebec-city',       'Quebec',           'QC'),
      ('queenstown',        'Otago',            'OTA'),
      ('reykjavik',         'Capital Region',   '1'),
      ('san-juan',          'Puerto Rico',      'PR'),
      ('santiago',          'Santiago Metropolitan', 'RM'),
      ('santorini',         'South Aegean',     'L'),
      ('sao-paulo',         'Sao Paulo',        'SP'),
      ('seville',           'Andalusia',        'AN'),
      ('shanghai',          'Shanghai',         'SH'),
      ('siem-reap',         'Siem Reap',        '17'),
      ('sofia',             'Sofia City Province', '22'),
      ('stockholm',         'Stockholm County', 'AB'),
      ('sydney',            'New South Wales',  'NSW'),
      ('tallinn',           'Harju',            '37'),
      ('tel-aviv',          'Tel Aviv',         'TA'),
      ('valencia',          'Valencian Community', 'VC'),
      ('vancouver',         'British Columbia', 'BC'),
      ('venice',            'Veneto',           'VEN'),
      ('warsaw',            'Masovian',         'MZ'),
      ('winnipeg',          'Manitoba',         'MB'),
    ('vienna',            'Vienna',           'VIE'),
      ('zurich',            'Zurich',           'ZH'),
    ('rio-de-janeiro',    'Rio de Janeiro',   'RJ'),
    ('toronto',           'Ontario',          'ON'),
    ('prague',            'Prague',           'PRG'),
    ('berlin',            'Berlin',           'BE'),
    ('munich',            'Bavaria',          'BY'),
    ('barcelona',         'Catalonia',        'CT'),
    ('madrid',            'Madrid',           'MD'),
    ('palma-de-mallorca', 'Balearic Islands', 'IB'),
    ('paris',             'Ile-de-France',    'IDF'),
    ('saint-denis',       'Ile-de-France',    'IDF'),
    ('london',            'England',          'ENG'),
    ('hong-kong',         'Hong Kong',        'HK'),
    ('bali',              'Bali',             'BA'),
    ('milan',             'Lombardy',         'LOM'),
    ('rome',              'Lazio',            'LAZ'),
    ('osaka',             'Osaka',            'OSA'),
    ('tokyo',             'Tokyo',            'TYO'),
    ('seoul',             'Seoul',            'SEO'),
    ('mexico-city',       'Mexico City',      'CMX'),
    ('kuala-lumpur',      'Kuala Lumpur',     'KL'),
    ('amsterdam',         'North Holland',    'NH'),
    ('bucharest',         'Bucharest',        'B'),
    ('moscow',            'Moscow',           'MOW'),
    ('saint-petersburg',  'Saint Petersburg', 'SPE'),
    ('makkah',            'Makkah',           'MK'),
    ('singapore',         'Singapore',        'SG'),
    ('bangkok',           'Bangkok',          'BKK'),
    ('pattaya',           'Chonburi',         'CBI'),
    ('phuket',            'Phuket',           'PKT'),
    ('antalya',           'Antalya',          'ANT'),
    ('istanbul',          'Istanbul',         'IST'),
    ('taipei',            'Taipei',           'TPE'),
    ('kyiv',              'Kyiv',             'KV')
  ) as v(slug, state_name, state_code)
 where c.slug = v.slug
   and (
     nullif(c.state_name, '') is null
     or nullif(c.state_code, '') is null
   );

-- 3. Normalize codes: trim + uppercase for consistent comparisons and the
--    countries FK.
update public.cities
   set state_code = nullif(upper(btrim(state_code)), ''),
       country_code = nullif(upper(btrim(country_code)), '')
 where state_code is distinct from nullif(upper(btrim(state_code)), '')
    or country_code is distinct from nullif(upper(btrim(country_code)), '');

-- 4. Prove it. If anything is still incomplete, abort so we do not silently
--    claim success while leaving partial rows behind.
do $$
declare
   v_missing_count integer;
begin
   select count(*)
      into v_missing_count
      from public.cities
    where nullif(city_name, '') is null
         or nullif(state_name, '') is null
         or nullif(state_code, '') is null
         or nullif(country_name, '') is null
         or nullif(country_code, '') is null;

   if v_missing_count > 0 then
      raise exception
         'City metadata backfill incomplete: % row(s) in public.cities still have one or more missing structured fields. Run the verification query at the bottom of this migration, patch the missing rows, then re-run.',
         v_missing_count;
   end if;
end $$;

commit;

-- Verify: expect zero rows.
-- select
--   slug,
--   city,
--   array_remove(array[
--     case when nullif(city_name, '') is null then 'city_name' end,
--     case when nullif(state_name, '') is null then 'state_name' end,
--     case when nullif(state_code, '') is null then 'state_code' end,
--     case when nullif(country_name, '') is null then 'country_name' end,
--     case when nullif(country_code, '') is null then 'country_code' end
--   ], null) as missing_fields,
--   city_name,
--   state_name,
--   state_code,
--   country_name,
--   country_code
--   from public.cities
--  where nullif(city_name, '') is null
--     or nullif(state_name, '') is null
--     or nullif(state_code, '') is null
--     or nullif(country_name, '') is null
--     or nullif(country_code, '') is null
--  order by city;