-- WHAT A FAN CALLS THE PLACE, WHICH IS OFTEN NOT THE PLACE.
--
-- `destinations` stores the FANBASE CITY, and that rule is right: a fandom takes
-- over a city, and nobody takes over "Carolina". But five of the 32 clubs are
-- known by a state or a region rather than by their city, so a Panthers fan who
-- types the only word they would ever use -- Carolina -- matches nothing at all.
--
--   Arizona     -> Phoenix          Minnesota    -> Minneapolis
--   Carolina    -> Charlotte        New England  -> Boston
--   Tennessee   -> Nashville
--
-- That is a LOOKUP gap, not a missing row, and the fix is the same shape the
-- games page already uses for nicknames: match on a word without ever printing
-- it as the city's name.
--
-- ALIASES ARE MATCH-ONLY AND ARE NEVER DISPLAYED. `city` is what a page prints;
-- this column is only ever read on the way IN. That is why they are stored
-- lowercase and why a CHECK enforces it: a value nothing renders has no business
-- carrying capitals, and lowercasing on write means a lookup needs no function.
--
-- WHAT IS DELIBERATELY NOT IN HERE:
--   * VENUE TOWNS. Foxborough, Orchard Park, East Rutherford, Arlington. The
--     table exists to keep those out; letting them back in through a side door
--     would put a fan in a town we have written nothing for.
--   * FORMER CITIES. A Raiders fan may say Oakland, and Oakland is a real place
--     that is not Las Vegas. An alias naming a DIFFERENT real city is worse than
--     no alias: it silently sends somebody to the wrong game.
--   * The city and the nickname. Those are columns; a resolver reads all three.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083005_destination_aliases.sql

begin;

alter table public.destinations
  add column if not exists aliases text[] not null default '{}';

comment on column public.destinations.aliases is
  'What a fan says for this fandom or city, lowercased. MATCH ONLY, never '
  'printed: `city` is what a page displays. Excludes venue towns and former '
  'cities, since either would resolve a fan to a place we do not play in.';

alter table public.destinations drop constraint if exists destinations_aliases_lower;
alter table public.destinations drop constraint if exists destinations_aliases_not_blank;

-- No subquery is legal in a CHECK, so both of these are written without one.
-- Casting the array to text gives its literal, and an array holding no capital
-- is a literal holding no capital.
alter table public.destinations
  add constraint destinations_aliases_lower
  check (aliases::text = lower(aliases::text));
-- `&&` is "overlaps", so this refuses an empty string as a member.
alter table public.destinations
  add constraint destinations_aliases_not_blank
  check (not (aliases && array['']::text[]));

create index if not exists destinations_aliases_idx
  on public.destinations using gin (aliases);

-- ---------------------------------------------------------------------------
-- THE ALIASES. Every one is a word somebody actually says.
-- ---------------------------------------------------------------------------
update public.destinations d set aliases = v.a
  from (values
    -- The five that made this necessary: the club's own familiar name.
    ('phoenix-az-nfl-cardinals',      array['arizona','phx']),
    ('charlotte-nc-nfl-panthers',     array['carolina']),
    ('minneapolis-mn-nfl-vikings',    array['minnesota','twin cities','saint paul','st paul']),
    ('boston-ma-nfl-patriots',        array['new england']),
    ('nashville-tn-nfl-titans',       array['tennessee']),

    -- The club carries a wider name than its city.
    ('tampa-fl-nfl-buccaneers',       array['tampa bay']),
    ('san-francisco-ca-nfl-49ers',    array['bay area','sf','niners']),
    ('washington-dc-nfl-commanders',  array['dc','d.c.','washington dc']),

    -- What people say instead of the full city name.
    ('new-york-ny-nfl-giants',        array['nyc','new york city']),
    ('new-york-ny-nfl-jets',          array['nyc','new york city']),
    ('los-angeles-ca-nfl-rams',       array['la','l.a.']),
    ('los-angeles-ca-nfl-chargers',   array['la','l.a.']),
    ('new-orleans-la-nfl-saints',     array['nola']),
    ('philadelphia-pa-nfl-eagles',    array['philly']),
    ('kansas-city-mo-nfl-chiefs',     array['kc']),
    ('las-vegas-nv-nfl-raiders',      array['vegas']),
    ('jacksonville-fl-nfl-jaguars',   array['jax']),
    ('indianapolis-in-nfl-colts',     array['indy']),
    ('cincinnati-oh-nfl-bengals',     array['cincy']),
    ('green-bay-wi-nfl-packers',      array['titletown'])
  ) as v(id, a)
 where d.id = v.id;

commit;
