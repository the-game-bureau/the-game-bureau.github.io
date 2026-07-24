-- seed-top25-tourist-cities.sql
--
-- Adds the 25 most-visited tourist-destination cities in the world to the one
-- city catalog (public.cities), by international overnight arrivals (the
-- Mastercard Global Destination Cities Index, rounded out with a few staples).
-- Idempotent: `on conflict (city) do nothing` skips any already present (e.g.
-- Paris, London, New York, and Istanbul/Rome if the Europe seed was run).
--
-- We send city + structured geo; cities_fill_slug derives the slug (never
-- supplied) and cities_sync_geo fills the rest. Country/state codes are explicit
-- so the map/oval badges are correct regardless of the parser.

insert into public.cities (city, city_name, state_code, state_name, country_code, country_name, archived)
values
  ('Bangkok, Thailand',              'Bangkok',           null, null,       'THA', 'Thailand',             false),
  ('Paris, France',                  'Paris',             null, null,       'FRA', 'France',               false),
  ('London, United Kingdom',         'London',            null, null,       'GBR', 'United Kingdom',        false),
  ('Dubai, United Arab Emirates',    'Dubai',             null, null,       'ARE', 'United Arab Emirates',  false),
  ('Singapore, Singapore',           'Singapore',         null, null,       'SGP', 'Singapore',            false),
  ('Kuala Lumpur, Malaysia',         'Kuala Lumpur',      null, null,       'MYS', 'Malaysia',             false),
  ('New York, New York',             'New York',          'NY', 'New York', 'USA', 'United States',        false),
  ('Istanbul, Turkey',               'Istanbul',          null, null,       'TUR', 'Turkey',               false),
  ('Tokyo, Japan',                   'Tokyo',             null, null,       'JPN', 'Japan',                false),
  ('Antalya, Turkey',                'Antalya',           null, null,       'TUR', 'Turkey',               false),
  ('Seoul, South Korea',             'Seoul',             null, null,       'KOR', 'South Korea',          false),
  ('Osaka, Japan',                   'Osaka',             null, null,       'JPN', 'Japan',                false),
  ('Makkah, Saudi Arabia',           'Makkah',            null, null,       'SAU', 'Saudi Arabia',         false),
  ('Phuket, Thailand',               'Phuket',            null, null,       'THA', 'Thailand',             false),
  ('Pattaya, Thailand',              'Pattaya',           null, null,       'THA', 'Thailand',             false),
  ('Milan, Italy',                   'Milan',             null, null,       'ITA', 'Italy',                false),
  ('Barcelona, Spain',               'Barcelona',         null, null,       'ESP', 'Spain',                false),
  ('Palma de Mallorca, Spain',       'Palma de Mallorca', null, null,       'ESP', 'Spain',                false),
  ('Bali, Indonesia',                'Bali',              null, null,       'IDN', 'Indonesia',            false),
  ('Hong Kong, Hong Kong',           'Hong Kong',         null, null,       'HKG', 'Hong Kong',            false),
  ('Rome, Italy',                    'Rome',              null, null,       'ITA', 'Italy',                false),
  ('Amsterdam, Netherlands',         'Amsterdam',         null, null,       'NLD', 'Netherlands',          false),
  ('Vienna, Austria',                'Vienna',            null, null,       'AUT', 'Austria',              false),
  ('Prague, Czech Republic',         'Prague',            null, null,       'CZE', 'Czech Republic',       false),
  ('Taipei, Taiwan',                 'Taipei',            null, null,       'TWN', 'Taiwan',               false)
on conflict (city) do nothing;

-- select city, slug, country_code from public.cities order by city;
