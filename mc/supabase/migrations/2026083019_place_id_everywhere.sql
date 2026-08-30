-- STEP FOUR: `place_id` ONTO waypoints, routes AND events.
--
-- **ADDED BESIDE THE TEXT, NEVER INSTEAD OF IT.** Every `city` and
-- `venue_city` column keeps its value and keeps working, so a page that has not
-- caught up carries on reading the string it always read. **Nothing in this file
-- is a hard break**, which is the opposite of every rebuild before it.
--
-- WHAT IT BUYS ON ITS OWN: the first reliable "what is in this city" query.
-- Today that question needs a string comparison across four tables that spell a
-- city four different ways, and 18 of the 70 waypoint cities matched nothing.
--
-- ── HOW EACH ONE RESOLVES, AND WHY THEY DIFFER ────────────────────────────
--
--   waypoints  city + state, which is exactly how `places` was keyed, so this
--              is an exact match and not a guess.
--   events     venue_city_name + venue_state_code, falling back to the country
--              outside the US, which is the same rule the places seed used.
--   routes     A BARE CITY WITH NO STATE. So it is matched on the city name
--              alone, and **only where exactly one place answers**. Two
--              Portlands and two Columbias are in this catalogue; a route naming
--              one of those is left null and REPORTED rather than sent to
--              whichever row came first.
--
-- ── WHAT IS DELIBERATELY NOT DONE ─────────────────────────────────────────
--
-- `public.games` gets nothing. All 395 rows are legacy and archived, new games
-- will be minted from templates rather than stored, and adding a key to a table
-- being replaced is work that gets thrown away.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083019_place_id_everywhere.sql

begin;

alter table public.waypoints add column if not exists place_id text
  references public.places (id) on delete set null;
alter table public.routes     add column if not exists place_id text
  references public.places (id) on delete set null;
alter table public.events     add column if not exists place_id text
  references public.places (id) on delete set null;

comment on column public.waypoints.place_id is
  'The one key for WHERE. Added beside `city` and `state`, which keep working; '
  'nothing had to catch up.';
comment on column public.routes.place_id is
  'The one key for WHERE. `routes.city` is a bare city with no state, so this is '
  'matched on the name alone and left NULL where two places answer to it.';
comment on column public.events.place_id is
  'The one key for WHERE, resolved from venue_city_name plus the state code, or '
  'the country outside the US.';

create index if not exists waypoints_place_idx on public.waypoints (place_id);
create index if not exists routes_place_idx    on public.routes (place_id);
create index if not exists events_place_idx    on public.events (place_id);

-- ---------------------------------------------------------------------------
-- WAYPOINTS. An exact match: `places` was keyed from these very columns.
-- ---------------------------------------------------------------------------
update public.waypoints w
   set place_id = p.id
  from public.places p
 where w.place_id is null
   and p.id = lower(regexp_replace(w.city,  '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
              lower(regexp_replace(w.state, '[^a-zA-Z0-9]+', '-', 'g'));

-- ---------------------------------------------------------------------------
-- EVENTS. The same rule the places seed used, so the two cannot disagree.
-- ---------------------------------------------------------------------------
update public.events e
   set place_id = p.id
  from public.places p
 where e.place_id is null
   and p.id = lower(regexp_replace(e.venue_city_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
              lower(regexp_replace(
                coalesce(nullif(btrim(e.venue_state_code), ''), e.venue_country_name),
                '[^a-zA-Z0-9]+', '-', 'g'));

-- ---------------------------------------------------------------------------
-- ROUTES. A bare city, so ONLY where exactly one place answers to it.
--
-- **THE `= 1` IS THE WHOLE POINT.** Sending an ambiguous city to whichever row
-- came first would put a route in the wrong Columbia and nothing would ever say
-- so; a null is visible and the verify block names it.
-- ---------------------------------------------------------------------------
update public.routes r
   set place_id = m.id
  from (
    select lower(x.city) as city, min(p.id) as id, count(*) as n
      from (select distinct city from public.routes) x
      join public.places p on lower(p.city) = lower(x.city)
     group by 1
  ) m
 where r.place_id is null
   and lower(r.city) = m.city
   and m.n = 1;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers rather than the absence of an error.
--
--   select 'waypoints' t,
--          count(*) filter (where place_id is not null) as keyed, count(*) from public.waypoints
--   union all select 'routes', count(*) filter (where place_id is not null), count(*) from public.routes
--   union all select 'events', count(*) filter (where place_id is not null), count(*) from public.events;
--
--   -- what did not resolve, named rather than counted:
--   select distinct city, state from public.waypoints where place_id is null;
--   select distinct city from public.routes where place_id is null;
--   select distinct venue_city_name, venue_state_code from public.events where place_id is null;
--
--   -- and the first reliable question this makes askable:
--   select p.city, p.state,
--          (select count(*) from public.waypoints w where w.place_id = p.id) as waypoints,
--          (select count(*) from public.routes   r where r.place_id = p.id) as routes,
--          (select count(*) from public.events   e where e.place_id = p.id) as occasions
--     from public.places p
--    order by 3 desc nulls last limit 12;
-- ---------------------------------------------------------------------------
