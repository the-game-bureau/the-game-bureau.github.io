-- PLACES: ONE KEY FOR "WHERE", AND EVERYTHING ELSE POINTS AT IT.
--
-- MEASURED BEFORE IT WAS WRITTEN: five tables spell where five different ways
-- and none of them shares a key with any other.
--
--   waypoints.city      70 distinct   "Denver"
--   routes.city         19            "Denver"
--   events.venue_city   55            "Denver, Colorado"
--   games.city          54            "Denver, Colorado"
--   destinations        67 pairs      Denver / CO
--   cities.city      1,468            "Denver, Colorado"
--
-- **52 of the 70 waypoint cities match a destination.** The other eighteen hold
-- real waypoints that no game can find, silently, because the strings do not
-- line up. That is the cost this table removes.
--
-- `id` IS `city-state`, GENERATED, and that is the property the whole model
-- turns on: **destinations.id is already places.id plus the audience.**
--   chicago-il  +  nfl-bears  =  chicago-il-nfl-bears
-- Every trivia key written so far keeps working, unchanged.
--
-- THE EIGHTEEN ARE TWO DIFFERENT THINGS, and the wireframe called them one:
--
--   TWELVE REAL PLACES WITH NO CLUB -- Biloxi (20 waypoints), San Diego,
--     Stillwater, Elmira, Yale, Saratoga Springs, Fort Lauderdale, Itta Bena,
--     London, Munich, Madrid, Mexico City. **They become rows.**
--   SIX VENUE TOWNS -- East Rutherford, Foxborough, Orchard Park, Glendale,
--     Paradise, Miami Gardens. **They become rows too, carrying `venue_for`**,
--     which names the fanbase city whose games they belong to.
--
-- WHY NOT FOLD A VENUE TOWN INTO ITS CITY AS AN ALIAS, which was the first
-- thought: **Foxborough is thirty miles from Boston.** An alias says "these are
-- the same place", and a walk cannot cross that. `venue_for` says the true thing
-- instead: the games are Boston's, the ground is not.
--
-- `aliases` IS FOR SPELLINGS ONLY. Match only, never printed, lowercase, the
-- same contract `destinations.aliases` keeps.
--
-- NOTHING IS REWRITTEN BY THIS FILE. No other table is touched; every text
-- column everywhere else keeps working exactly as it does today.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083016_places.sql

begin;

create table if not exists public.places (
  id text generated always as (
    lower(
      regexp_replace(city,  '[^a-zA-Z0-9]+', '-', 'g') || '-' ||
      regexp_replace(state, '[^a-zA-Z0-9]+', '-', 'g')
    )
  ) stored primary key,

  city  text not null,
  -- A two letter code in the US and Canada, the COUNTRY NAME elsewhere. That is
  -- what `waypoints.state` already holds, and matching it is what lets a
  -- waypoint resolve without a translation table.
  state text not null,
  country text,

  -- REFERENCE, NOT SPINE. public.cities keeps driving the soundtrack, gift and
  -- games rails; a place points into it so those joins survive.
  city_slug text,

  -- A TOWN THAT EXISTS BECAUSE A STADIUM IS IN IT. Its games belong to the place
  -- named here; you cannot walk from one to the other.
  venue_for text references public.places (id) on delete set null,

  aliases text[] not null default '{}',

  -- THE CENTRE OF THE PLACES WE ACTUALLY SEND PEOPLE TO, averaged from our own
  -- waypoints. /games/ derives this at runtime today; storing it is the same
  -- number, computed once.
  lat double precision,
  lon double precision,

  created_at timestamptz not null default now(),

  constraint places_city_not_blank  check (btrim(city)  <> ''),
  constraint places_state_not_blank check (btrim(state) <> ''),
  constraint places_aliases_lower   check (aliases::text = lower(aliases::text)),
  constraint places_aliases_not_blank check (not (aliases && array['']::text[])),
  constraint places_not_its_own_venue check (venue_for is null or venue_for <> id)
);

comment on table public.places is
  'One key for WHERE. id is city-state, generated, so destinations.id is exactly '
  'places.id plus the audience id: chicago-il + nfl-bears. Everything that says '
  'where points here instead of spelling it again.';
comment on column public.places.venue_for is
  'A stadium town whose GAMES belong to another place. Foxborough serves Boston. '
  'Not an alias: an alias says two names are one place, and a walk cannot cross '
  'thirty miles.';
comment on column public.places.aliases is
  'Alternative SPELLINGS, lowercase, match only and never printed. Not other '
  'places, which get rows of their own.';

create index if not exists places_city_idx on public.places (lower(city));
create index if not exists places_aliases_idx on public.places using gin (aliases);
create index if not exists places_venue_for_idx on public.places (venue_for);

alter table public.places enable row level security;
drop policy if exists "places are public" on public.places;
create policy "places are public" on public.places for select using (true);
drop policy if exists "places admin insert" on public.places;
drop policy if exists "places admin update" on public.places;
drop policy if exists "places admin delete" on public.places;
create policy "places admin insert" on public.places
  for insert to authenticated with check (is_photo_admin());
create policy "places admin update" on public.places
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "places admin delete" on public.places
  for delete to authenticated using (is_photo_admin());
grant select on public.places to anon, authenticated;
grant insert, update, delete on public.places to authenticated;

-- ---------------------------------------------------------------------------
-- SEEDED FROM EVERY SOURCE, MOST AUTHORITATIVE FIRST.
--
-- `on conflict do nothing` throughout, so the first spelling of a place wins and
-- every later source only ADDS places nobody had.
-- ---------------------------------------------------------------------------

-- 1. destinations. The spelling already agreed on, 67 pairs.
insert into public.places (city, state)
select distinct btrim(d.city), btrim(d.state) from public.destinations d
on conflict (id) do nothing;

-- 2. waypoints. Where we actually hold content, including the eighteen.
insert into public.places (city, state)
select distinct btrim(w.city), btrim(w.state)
  from public.waypoints w
 where coalesce(btrim(w.city), '') <> '' and coalesce(btrim(w.state), '') <> ''
on conflict (id) do nothing;

-- 3. events. Already carries structured geo, which is why it needs no parsing:
--    outside the US the state code is empty, so the country stands in, matching
--    what waypoints already does.
insert into public.places (city, state, country)
select distinct
  btrim(e.venue_city_name),
  coalesce(nullif(btrim(e.venue_state_code), ''), btrim(e.venue_country_name)),
  nullif(btrim(e.venue_country_name), '')
  from public.events e
 where coalesce(btrim(e.venue_city_name), '') <> ''
   and coalesce(nullif(btrim(e.venue_state_code), ''), nullif(btrim(e.venue_country_name), '')) is not null
on conflict (id) do nothing;

-- 4. routes carry a bare city with no state, so they are RESOLVED against what
--    is already here rather than inserted. All 19 match today; a route naming a
--    city nobody else knows is reported by the verify block, not invented.

-- ---------------------------------------------------------------------------
-- THE VENUE TOWNS, named rather than guessed at. A row is only stamped if both
-- ends exist, so this is safe to re-run and safe on a partial catalogue.
-- ---------------------------------------------------------------------------
update public.places
   set venue_for = v.serves
  from (values
    ('east-rutherford-nj', 'new-york-ny'),
    ('foxborough-ma',      'boston-ma'),
    ('orchard-park-ny',    'buffalo-ny'),
    ('glendale-az',        'phoenix-az'),
    ('paradise-nv',        'las-vegas-nv'),
    ('miami-gardens-fl',   'miami-fl'),
    ('santa-clara-ca',     'san-francisco-ca'),
    ('arlington-tx',       'dallas-tx'),
    ('inglewood-ca',       'los-angeles-ca'),
    ('sunrise-fl',         'miami-fl'),
    ('landover-md',        'washington-dc')
  ) as v(id, serves)
 where public.places.id = v.id
   and exists (select 1 from public.places p2 where p2.id = v.serves);

-- ---------------------------------------------------------------------------
-- THE CENTRE OF EACH PLACE, from our own waypoints.
--
-- **A CIVIC CENTROID IS NOT THIS.** It is the middle of the places we actually
-- send people to, which is a better point for a map of walks, and it is the same
-- number /games/ computes at runtime today.
-- ---------------------------------------------------------------------------
update public.places p
   set lat = c.lat, lon = c.lon
  from (
    select lower(regexp_replace(w.city,  '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
           lower(regexp_replace(w.state, '[^a-zA-Z0-9]+', '-', 'g')) as id,
           avg(w.lat) as lat, avg(w.lon) as lon
      from public.waypoints w
     where w.lat is not null and w.lon is not null
       and coalesce(btrim(w.city), '') <> '' and coalesce(btrim(w.state), '') <> ''
     group by 1
  ) c
 where p.id = c.id;

-- ---------------------------------------------------------------------------
-- THE LINK INTO public.cities, so the rails keep working.
-- Matched on the city NAME plus the state, never on the name alone: that
-- catalogue holds two Portlands and two Columbias.
-- ---------------------------------------------------------------------------
update public.places p
   set city_slug = c.slug
  from public.cities c
 where p.city_slug is null
   and lower(c.city_name) = lower(p.city)
   and (lower(coalesce(c.state_code, '')) = lower(p.state)
     or lower(coalesce(c.country_name, '')) = lower(p.state));

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers rather than the absence of an error.
--
--   select count(*) from public.places;
--
--   -- every destination has a place, which is the property the model turns on:
--   select count(*) from public.destinations d
--    where not exists (select 1 from public.places p
--                       where d.id like p.id || '-%');            -- expect 0
--
--   -- every waypoint city resolves, which is what the eighteen were about:
--   select count(distinct w.city) from public.waypoints w
--    where coalesce(btrim(w.city), '') <> ''
--      and not exists (select 1 from public.places p
--                       where lower(p.city) = lower(w.city));     -- expect 0
--
--   -- the venue towns know who they serve:
--   select id, venue_for from public.places where venue_for is not null order by id;
--
--   -- a route naming a city nobody knows, which is a content fault not a bug:
--   select distinct r.city from public.routes r
--    where not exists (select 1 from public.places p where lower(p.city) = lower(r.city));
--
--   -- how many places we can actually put on a map:
--   select count(*) filter (where lat is not null) as located, count(*) from public.places;
-- ---------------------------------------------------------------------------
