-- 2026-08-31  A STOP IS A WAYPOINT, A CHALLENGE AND A CITY. Rebuilt.
--
-- THE NAME WAS TAKEN, AND BY THE THING THIS REPLACES. `public.stops` has been
-- keyed by CITY since it was written: `city_slug` + `waypoint_id` +
-- `challenge_id` + `ord` + `end`, joined to a game through `public.game_stops`.
-- That key is the fault this file's own notes have called parked since
-- 2026-08-09: every game in a city shares one list, so **a city cannot have two
-- different walks**, and 1 of its 41 rows carries a challenge at all.
--
-- SO THE OLD ONE IS RETIRED IN PLACE AS `stops_retired`, NOT DROPPED. It is
-- read by `game_stops`, which the Game Builder and the Flow Builder both use
-- (`MAPS_TABLE = 'game_stops'` in each), and those two are the paid product's
-- editors. **A view follows its table by OID, not by name**, so the rename
-- carries `game_stops` with it and NEITHER BUILDER NEEDS A LINE CHANGED --
-- the same property the anchor_events rename turned on.
--   Its constraints and indexes are renamed from the catalog rather than from a
--   list of the ones this repo happens to know about, so anything added by hand
--   in the dashboard moves too. A table called `stops_retired` whose key is
--   `stops_pkey` half-remembers its old name, and the next reader cannot tell
--   which table it belongs to.
--
-- WHAT THE NEW ONE IS, and it is deliberately three columns and no more:
--   city          where the stop is, the canonical "City, ST"
--   waypoint_id   the place
--   challenge_id  what a team does there, and NULL MEANS RANDOM (see below)
--
-- NO `ord`, AND THAT IS NOT AN OVERSIGHT. An order belongs to a ROUTE -- that
-- is what `route_stops.ord` is, 234 rows of it -- and a stop that carried its
-- own position would be a second idea of the walk, free to disagree with the
-- first. A stop is a place and a thing to do there; the order in which a team
-- meets them is the route's business.
--
-- NULL `challenge_id` MEANS **RANDOM**, and the room's picker is what makes
-- that unambiguous: RANDOM is its FIRST option and there is no blank one, so
-- NULL cannot also mean "not decided yet". Nothing generates the random pick
-- yet; that is the code the request said would come later, and this column is
-- the shape it will read.
--   THE COST IS REAL AND IS NAMED RATHER THAN HIDDEN: `on delete set null`
--   means deleting a challenge turns every stop that used it into a RANDOM
--   stop. That is a change of MEANING, not a gap, which is why the room draws
--   the word RANDOM rather than an empty cell -- an empty cell would let it
--   pass for an unfinished row. The alternative, `on delete restrict`, would
--   make a challenge undeletable for as long as one stop names it, and
--   `route_stops` already made the opposite call for the same reason: deleting
--   a challenge must not delete the stops that used it.
--
-- THE CITY IS TEXT, CHOSEN FROM `audiences`, AND IS NOT A FOREIGN KEY. The room
-- offers the 68 cities the audiences table holds a home place for, which is the
-- list asked for; storing the string rather than a key is what every other
-- table here now does (`waypoints.city`, `events.venue_city`,
-- `gift_shop_listings.city`, `soundtrack.city`). **What it costs is unchanged
-- and still true: nothing stops two spellings of one town, and no screen will
-- tell you.**

begin;

-- ---- 1. retire the old one, catalog-swept ---------------------------------
alter table public.stops rename to stops_retired;

do $do$
declare r record;
begin
  for r in
    select conname from pg_constraint
     where conrelid = 'public.stops_retired'::regclass and conname like 'stops%'
  loop
    execute format('alter table public.stops_retired rename constraint %I to %I',
                   r.conname, replace(r.conname, 'stops', 'stops_retired'));
  end loop;

  for r in
    select indexrelid::regclass::text as iname from pg_index
     where indrelid = 'public.stops_retired'::regclass
       and indexrelid::regclass::text like '%stops%'
       and indexrelid::regclass::text not like '%stops_retired%'
  loop
    execute format('alter index public.%I rename to %I',
                   r.iname, replace(r.iname, 'stops', 'stops_retired'));
  end loop;
end $do$;

comment on table public.stops_retired is
  'RETIRED 2026-08-31. Keyed by city, so a city could hold only one walk. Read '
  'only through the game_stops view, which both game editors still use. The new '
  'public.stops is a waypoint plus a challenge plus a city.';

-- ---- 2. the new one -------------------------------------------------------
create table public.stops (
  id            bigint generated always as identity primary key,
  city          text   not null,
  waypoint_id   bigint not null references public.waypoints(wpid) on delete cascade,
  challenge_id  bigint          references public.challenges(id)  on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint stops_city_not_blank check (btrim(city) <> '')
);

comment on column public.stops.city is
  'Canonical "City, ST", chosen in the room from the cities public.audiences '
  'holds a home place for. Text, not a key: nothing stops two spellings.';
comment on column public.stops.challenge_id is
  'NULL MEANS RANDOM, not undecided. The room picker offers RANDOM first and '
  'has no blank option. Deleting a challenge therefore turns its stops random.';

create index stops_city_idx     on public.stops (city);
create index stops_waypoint_idx on public.stops (waypoint_id);

-- ONE PLACE APPEARS AT MOST ONCE IN A CITY. The same waypoint listed twice with
-- two challenges is two stops in one doorway, and nothing downstream could
-- choose between them. A loop that comes home is a ROUTE naming a stop twice,
-- which route_stops already allows by keying on (route, position).
create unique index stops_one_per_place_idx on public.stops (city, waypoint_id);

create trigger stops_touch_updated_at
  before update on public.stops
  for each row execute function public.tgb_touch_stops_updated_at();

alter table public.stops enable row level security;

-- Read is public, exactly as waypoints and challenges are: a stop is made of
-- two publicly readable rows and says nothing either of them does not.
create policy "Stops are publicly readable"
  on public.stops for select to public using (true);

create policy "Admins can manage stops"
  on public.stops for all to authenticated using (true) with check (true);

commit;

-- Verify. Each is a call that makes the table do its job; an insert that raises
-- nothing proves nothing.
--
--   -- the old data is intact and still reachable through the view
--   select count(*) from public.stops_retired;            -- expect 41
--   select count(*) from public.game_stops;               -- unchanged
--   select count(*) from pg_constraint
--    where conrelid='public.stops_retired'::regclass and conname like 'stops_retired%';
--
--   -- a blank city is refused (expect 23514)
--   insert into public.stops (city, waypoint_id) values ('  ', 1);
--
--   -- a waypoint that does not exist is refused (expect 23503)
--   insert into public.stops (city, waypoint_id) values ('Chicago, IL', -1);
--
--   -- the same place twice in one city is refused the second time (23505)
--   -- a RANDOM stop is an ordinary row with a null challenge
