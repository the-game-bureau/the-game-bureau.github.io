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
