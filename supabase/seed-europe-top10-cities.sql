-- seed-europe-top10-cities.sql
--
-- Adds the 10 largest European cities by city-proper population to the one city
-- catalog (public.cities). Idempotent: `on conflict (city) do nothing` skips the
-- three already in the catalog (London, Madrid, Paris).
--
-- We send only city + structured geo; the cities_fill_slug trigger derives the
-- slug (never supplied) and cities_sync_geo keeps the rest in sync. Country codes
-- are set explicitly so the map/oval badges are right regardless of the parser.
--
-- Ranking is by city-proper population (Istanbul and European Russia included, as
-- on the standard "largest cities in Europe" lists); spots 9-10 are close, so
-- swap Bucharest for Minsk/Vienna/Hamburg/Warsaw if you prefer a different #10.

insert into public.cities (city, city_name, country_code, country_name, archived)
values
  ('Istanbul, Turkey',         'Istanbul',         'TUR', 'Turkey',         false),
  ('Moscow, Russia',           'Moscow',           'RUS', 'Russia',         false),
  ('London, United Kingdom',   'London',           'GBR', 'United Kingdom', false),
  ('Saint Petersburg, Russia', 'Saint Petersburg', 'RUS', 'Russia',         false),
  ('Berlin, Germany',          'Berlin',           'DEU', 'Germany',        false),
  ('Madrid, Spain',            'Madrid',           'ESP', 'Spain',          false),
  ('Kyiv, Ukraine',            'Kyiv',             'UKR', 'Ukraine',        false),
  ('Rome, Italy',              'Rome',             'ITA', 'Italy',          false),
  ('Paris, France',            'Paris',            'FRA', 'France',         false),
  ('Bucharest, Romania',       'Bucharest',        'ROU', 'Romania',        false)
on conflict (city) do nothing;

-- Confirm what's now in the catalog for these:
-- select city, slug, country_code from public.cities
--  where city in ('Istanbul, Turkey','Moscow, Russia','London, United Kingdom',
--    'Saint Petersburg, Russia','Berlin, Germany','Madrid, Spain','Kyiv, Ukraine',
--    'Rome, Italy','Paris, France','Bucharest, Romania')
--  order by city;
