-- 2026072403_fill_foreign_city_states.sql
--
-- Fill state_name / state_code for the 36 foreign cities that had them blank,
-- using each city's first-level administrative division (region / province /
-- state / emirate) and a short code (ISO 3166-2 suffix or the common
-- abbreviation, <= 3 chars to match the editor's St. abbr field).
--
-- These are informational for non-US/CA rows: composeGeo only puts the state in
-- the `city` key for US cities, so this does NOT change any city key,
-- /shop/?city= link, or the canonical string — it just completes the metadata.
-- Idempotent (sets fixed values by slug).

update public.cities c set
  state_name = v.state_name,
  state_code = v.state_code
from (values
  ('dubai',             'Dubai',            'DU'),
  ('melbourne',         'Victoria',         'VIC'),
  ('vienna',            'Vienna',           'VIE'),
  ('rio-de-janeiro',    'Rio de Janeiro',   'RJ'),
  ('toronto',           'Ontario',          'ON'),
  ('prague',            'Prague',           'PRG'),
  ('berlin',            'Berlin',           'BE'),
  ('munich',            'Bavaria',          'BY'),
  ('barcelona',         'Catalonia',        'CT'),
  ('madrid',            'Madrid',           'MD'),
  ('palma-de-mallorca', 'Balearic Islands', 'IB'),
  ('paris',             'Île-de-France',    'IDF'),
  ('saint-denis',       'Île-de-France',    'IDF'),
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
where c.slug = v.slug;
