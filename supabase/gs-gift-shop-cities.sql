-- Gift shop city source of truth.
--
-- Public /shop/ and Mission Control /shop/admin/ both read
-- public.gift_shop_cities instead of deriving city choices from games or
-- current gift listings. Admins can add cities from Mission Control.

create or replace function public.tgb_canonical_gift_shop_city(value text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
  m text[];
  code text;
  state_name text;
begin
  v := nullif(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')), '');
  if v is null then
    return null;
  end if;

  if v ~* '^Washington\s+D\.?\s*C\.?$'
     or v ~* '^Washington,\s*D\.?\s*C\.?$' then
    return 'Washington, D.C.';
  end if;

  m := regexp_match(v, '^(.+?)(?:,\s*|\s+)([A-Za-z]{2})$');
  if m is not null then
    code := upper(m[2]);
    state_name := case code
      when 'AL' then 'Alabama'
      when 'AK' then 'Alaska'
      when 'AZ' then 'Arizona'
      when 'AR' then 'Arkansas'
      when 'CA' then 'California'
      when 'CO' then 'Colorado'
      when 'CT' then 'Connecticut'
      when 'DE' then 'Delaware'
      when 'FL' then 'Florida'
      when 'GA' then 'Georgia'
      when 'HI' then 'Hawaii'
      when 'ID' then 'Idaho'
      when 'IL' then 'Illinois'
      when 'IN' then 'Indiana'
      when 'IA' then 'Iowa'
      when 'KS' then 'Kansas'
      when 'KY' then 'Kentucky'
      when 'LA' then 'Louisiana'
      when 'ME' then 'Maine'
      when 'MD' then 'Maryland'
      when 'MA' then 'Massachusetts'
      when 'MI' then 'Michigan'
      when 'MN' then 'Minnesota'
      when 'MS' then 'Mississippi'
      when 'MO' then 'Missouri'
      when 'MT' then 'Montana'
      when 'NE' then 'Nebraska'
      when 'NV' then 'Nevada'
      when 'NH' then 'New Hampshire'
      when 'NJ' then 'New Jersey'
      when 'NM' then 'New Mexico'
      when 'NY' then 'New York'
      when 'NC' then 'North Carolina'
      when 'ND' then 'North Dakota'
      when 'OH' then 'Ohio'
      when 'OK' then 'Oklahoma'
      when 'OR' then 'Oregon'
      when 'PA' then 'Pennsylvania'
      when 'RI' then 'Rhode Island'
      when 'SC' then 'South Carolina'
      when 'SD' then 'South Dakota'
      when 'TN' then 'Tennessee'
      when 'TX' then 'Texas'
      when 'UT' then 'Utah'
      when 'VT' then 'Vermont'
      when 'VA' then 'Virginia'
      when 'WA' then 'Washington'
      when 'WV' then 'West Virginia'
      when 'WI' then 'Wisconsin'
      when 'WY' then 'Wyoming'
      when 'DC' then 'D.C.'
      else null
    end;
    if state_name is not null then
      if code = 'DC' and m[1] ~* '^Washington$' then
        return 'Washington, D.C.';
      end if;
      return btrim(m[1]) || ', ' || state_name;
    end if;
  end if;

  return v;
end;
$$;

create table if not exists public.gift_shop_cities (
  city text primary key,
  label text,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gift_shop_cities is
  'Source-of-truth list of cities available in the gift shop city picker and public city rail.';
comment on column public.gift_shop_cities.city is
  'Canonical "City, State" label used in gift_shop_listings.city.';
comment on column public.gift_shop_cities.label is
  'Optional short display label. Public shop falls back to the city name.';

create index if not exists gift_shop_cities_active_sort_idx
  on public.gift_shop_cities (archived, sort_order, city);

create or replace function public.tgb_touch_gift_shop_cities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gift_shop_cities_touch_updated_at on public.gift_shop_cities;
create trigger gift_shop_cities_touch_updated_at
before update on public.gift_shop_cities
for each row execute function public.tgb_touch_gift_shop_cities_updated_at();

alter table public.gift_shop_cities enable row level security;

drop policy if exists "Gift shop cities are publicly readable" on public.gift_shop_cities;
create policy "Gift shop cities are publicly readable"
  on public.gift_shop_cities
  for select
  to public
  using (archived = false);

drop policy if exists "Authenticated users can manage gift shop cities" on public.gift_shop_cities;
create policy "Authenticated users can manage gift shop cities"
  on public.gift_shop_cities
  for all
  to authenticated
  using (true)
  with check (true);

grant select on public.gift_shop_cities to anon, authenticated;
grant insert, update, delete on public.gift_shop_cities to authenticated;

update public.gift_shop_listings
   set city = public.tgb_canonical_gift_shop_city(city),
       updated_at = now()
 where city is not null
   and city <> public.tgb_canonical_gift_shop_city(city);

insert into public.gift_shop_cities (city)
select distinct city
from (
  select public.tgb_canonical_gift_shop_city(city) as city
    from public.gift_shop_listings
   where city is not null
  union
  select public.tgb_canonical_gift_shop_city(city) as city
    from public.games
   where city is not null
  union
  select public.tgb_canonical_gift_shop_city(away_team_city) as city
    from public.games
   where away_team_city is not null
  union
  select public.tgb_canonical_gift_shop_city(home_team_city) as city
    from public.games
   where home_team_city is not null
) source
where city is not null
on conflict (city) do update
  set archived = false,
      updated_at = now();

select count(*) as gift_shop_city_count
  from public.gift_shop_cities
 where archived = false;
