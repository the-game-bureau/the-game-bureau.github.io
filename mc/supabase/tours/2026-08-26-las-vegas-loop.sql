-- ============================================================================
-- NFL walking tour: Las Vegas, NV
-- Filed by TGB ANCHOR EVENTS (Anthropic Claude Sonnet 5) on 2026-08-26.
--
-- City:      Las Vegas (fanbase city of LV, per public.teams)
-- Shape:     loop, 10 stops
-- Distance:  roughly 1.3 miles total, about 30 minutes of walking; well
--            under the two hour cap once time at each stop is added.
-- Sports:    Circa Resort & Casino at 8 Fremont St, the world's largest
--            sportsbook, a three story wall of screens (stop 7)
-- Music:     Fremont Country Club at 601 Fremont St, an 800 capacity room
--            built by musicians for musicians in the Fremont East district
--            (stop 3)
-- Ends:      Atomic Liquors, the oldest freestanding bar in Las Vegas, at
--            917 E Fremont St (start, commercial, food and drink) and
--            Downtown Container Park at 707 E Fremont St, an open air beer
--            garden about three minutes' walk from the start (finish,
--            commercial, food and drink).
--
-- Las Vegas held zero rows in public.paths at the time this was picked,
-- tied with eleven other NFL fanbase cities at zero (Buffalo, Cincinnati,
-- Cleveland, Denver, Houston, Indianapolis, Jacksonville, Kansas City,
-- Pittsburgh, San Francisco, Seattle). It was the tie break, having gone the
-- longest of that group without a build recorded under mc/supabase/tours/
-- (2026-08-20, one build, oldest of the twelve).
--
-- Route goes out from Atomic Liquors west along Fremont Street through the
-- Fremont East district and under the Fremont Street Experience canopy,
-- past El Cortez, Fremont Country Club, The D, the Golden Nugget and
-- Binion's, to Circa and the Golden Gate at the west end. It then turns
-- north and returns east along Carson Avenue, a different street one block
-- over, past the Gold Spike, before dropping back down to Fremont Street to
-- close the loop at Downtown Container Park, two blocks from the start.
--
-- Drawn from Big Boy Travel's and Free Tours By Foot's published Downtown
-- Las Vegas / Fremont Street walking tour material for the casino row (the
-- oldest-casino angle on the Golden Gate, El Cortez's 1941 opening, the
-- Golden Nugget's Hand of Faith nugget, Binion's and the World Series of
-- Poker, and Downtown Container Park as an established stop on the guided
-- version of this same walk), plus the operators' own pages for Circa
-- Sports, Fremont Country Club / Backstage Bar & Billiards, The D Las
-- Vegas and the Gold Spike. Every address above was checked against the
-- venue's own site or a current business listing before it went into a
-- stop. Circa, Fremont Country Club and the Gold Spike are not on the older
-- published tour lists (Circa opened in 2020, after most of those lists
-- were written) but sit directly on the line of the walk and are current
-- and open; the Mob Museum and the Neon Museum were left out on purpose,
-- both being ticketed, guided, hour-plus museum visits that would eat the
-- two hour cap rather than a stop a group can take in while walking past.
--
-- This block is idempotent: the create/add-if-not-exists statements are
-- safe to run against a database that already has them.
-- ============================================================================

create table if not exists public.waypoints (
  wpid        bigint primary key,
  city        text,
  state       text,
  address     text,
  name        text,
  description text
);

alter table public.waypoints add column if not exists zip         text;
alter table public.waypoints add column if not exists source_url  text;
alter table public.waypoints add column if not exists lat         double precision;
alter table public.waypoints add column if not exists lon         double precision;
alter table public.waypoints add column if not exists walk_order  integer;
alter table public.waypoints add column if not exists tour_id     text;
alter table public.waypoints add column if not exists tour_title  text;
alter table public.waypoints add column if not exists tour_shape  text;
alter table public.waypoints add column if not exists ai_model    text;

create or replace function public.waypoints_assign_wpid()
returns trigger language plpgsql as $wp$
begin
  if new.wpid is null then
    perform pg_advisory_xact_lock(hashtext('public.waypoints.wpid'));
    select coalesce(min(s), 1) into new.wpid
      from generate_series(1, coalesce((select max(wpid) from public.waypoints), 0) + 1) s
     where not exists (select 1 from public.waypoints w where w.wpid = s);
  end if;
  return new;
end;
$wp$;

drop trigger if exists waypoints_assign_wpid_trg on public.waypoints;
create trigger waypoints_assign_wpid_trg
  before insert on public.waypoints
  for each row execute function public.waypoints_assign_wpid();

alter table public.waypoints drop constraint if exists waypoints_tour_shape_known;
alter table public.waypoints add constraint waypoints_tour_shape_known
  check (tour_shape is null or tour_shape in ('loop', 'out_and_back', 'point_to_point')) not valid;

alter table public.waypoints drop constraint if exists waypoints_walk_order_sane;
alter table public.waypoints add constraint waypoints_walk_order_sane
  check (walk_order is null or (walk_order >= 1 and walk_order <= 999)) not valid;

create index if not exists waypoints_tour_idx
  on public.waypoints (tour_id, walk_order) where tour_id is not null;

create table if not exists public.paths (
  tour_id    text primary key,
  title      text,
  shape      text,
  city       text,
  created_at timestamptz not null default now()
);

-- Seven shapes since 2026080805. This block DROPS and re-adds the constraint,
-- so a stale copy here would quietly narrow it again the next time somebody
-- pastes this helper - keep it in step with the migration.
alter table public.paths drop constraint if exists paths_shape_known;
alter table public.paths add constraint paths_shape_known
  check (shape is null or shape in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  )) not valid;

create table if not exists public.path_stops (
  tour_id text   not null references public.paths(tour_id) on delete cascade,
  wpid    bigint not null references public.waypoints(wpid) on delete cascade,
  ord     integer not null,
  primary key (tour_id, wpid)
);

create index if not exists path_stops_order_idx on public.path_stops (tour_id, ord);
create index if not exists path_stops_wpid_idx  on public.path_stops (wpid);

alter table public.paths      enable row level security;
alter table public.path_stops enable row level security;

drop policy if exists "paths readable by anyone" on public.paths;
create policy "paths readable by anyone" on public.paths for select using (true);
drop policy if exists "paths write by authenticated" on public.paths;
create policy "paths write by authenticated" on public.paths for all
  to authenticated using (true) with check (true);

drop policy if exists "path_stops readable by anyone" on public.path_stops;
create policy "path_stops readable by anyone" on public.path_stops for select using (true);
drop policy if exists "path_stops write by authenticated" on public.path_stops;
create policy "path_stops write by authenticated" on public.path_stops for all
  to authenticated using (true) with check (true);

grant select on public.paths, public.path_stops to anon, authenticated;
grant insert, update, delete on public.paths, public.path_stops to authenticated;

create or replace function public.tgb_import_walking_tour(payload jsonb)
returns table (
  action text,
  ord integer,
  name text,
  wpid text,
  note text
)
language plpgsql
as $$
declare
  v_city text;
  v_state text;
  v_title text;
  v_shape text;
  v_ai_model text;
  v_tour_id text;
  v_entry jsonb;
  v_ord integer := 0;
  v_name text;
  v_stop_city text;
  v_stop_state text;
  v_zip text;
  v_address text;
  v_description text;
  v_source_url text;
  v_wpid public.waypoints.wpid%type;
  v_existing public.waypoints.wpid%type;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Expected a JSON object: { city, state, title, shape, ai_model, stops: [...] }';
  end if;

  v_city  := nullif(btrim(payload->>'city'), '');
  v_state := nullif(btrim(payload->>'state'), '');
  v_title := nullif(btrim(payload->>'title'), '');
  v_shape := nullif(btrim(lower(payload->>'shape')), '');
  -- One path is the work of ONE model, so this belongs to the path, not a stop.
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The path needs a city.'; end if;
  if v_title is null then raise exception 'The path needs a title.'; end if;
  -- The seven of paths_shape_known (2026080805). Checked here so a bad shape
  -- comes back as a sentence rather than as a constraint name.
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The path needs a non-empty stops array.';
  end if;

  -- Readable and unique without a sequence: the city, the shape and the second.
  -- SECONDS, not minutes. To the minute, two imports of the same city and shape
  -- inside one minute produce the SAME id - so the second path does not fail,
  -- it silently merges into the first and you get one twenty-stop walk. That has
  -- already happened once in this table.
  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.paths (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'path'::text, null::integer, v_title, v_tour_id, v_shape;

  -- Stops are taken IN ARRAY ORDER. Any walk_order supplied on a stop is
  -- ignored: the array is the sequence, and trusting one over the other when
  -- they disagree is how a path ends up with two stop 4s.
  for v_entry in select value from jsonb_array_elements(payload->'stops')
  loop
    v_name        := nullif(btrim(v_entry->>'name'), '');
    v_stop_city   := coalesce(nullif(btrim(v_entry->>'city'), ''), v_city);
    v_stop_state  := coalesce(nullif(btrim(v_entry->>'state'), ''), v_state);
    v_zip         := nullif(btrim(v_entry->>'zip'), '');
    v_address     := nullif(btrim(v_entry->>'address'), '');
    v_description := nullif(left(btrim(coalesce(v_entry->>'description', '')), 700), '');
    v_source_url  := nullif(btrim(v_entry->>'source_url'), '');

    if v_name is null then
      return query select 'skipped'::text, null::integer, null::text, null::text, 'missing name'::text;
      continue;
    end if;

    v_ord := v_ord + 1;
    v_existing := null;

    -- Do we already hold this place? Name AND address, both lowercased.
    if v_address is not null then
      select w.wpid into v_existing
        from public.waypoints w
       where lower(btrim(coalesce(w.name, ''))) = lower(v_name)
         and lower(btrim(coalesce(w.address, ''))) = lower(v_address)
       order by w.wpid
       limit 1;
    end if;

    if v_existing is not null then
      v_wpid := v_existing;
      -- Fill blanks only. Never overwrite a value somebody entered, and never
      -- touch the description - see the header.
      update public.waypoints w set
        city       = coalesce(w.city, v_stop_city),
        state      = coalesce(w.state, v_stop_state),
        zip        = coalesce(w.zip, v_zip),
        source_url = coalesce(w.source_url, v_source_url),
        ai_model   = coalesce(w.ai_model, v_ai_model)
      where w.wpid = v_wpid;
    else
      insert into public.waypoints as w
        (name, city, state, zip, address, description, source_url, ai_model)
      values
        (v_name, v_stop_city, v_stop_state, v_zip, v_address, v_description, v_source_url, v_ai_model)
      returning w.wpid into v_wpid;
    end if;

    -- A place appears at most once per path. A loop FINISHES NEAR its first
    -- stop, it does not list it again, so a repeat is a mistake in the payload
    -- rather than something to store - and the primary key would reject it.
    -- on conflict ON CONSTRAINT, not on (tour_id, wpid): this function's
    -- RETURNS TABLE declares output columns called wpid and ord, and inside an
    -- index-inference clause plpgsql cannot tell those from the table's own
    -- columns - it raises "column reference wpid is ambiguous". Naming the
    -- primary key sidesteps the resolution entirely.
    insert into public.path_stops (tour_id, wpid, ord)
    values (v_tour_id, v_wpid, v_ord)
    on conflict on constraint path_stops_pkey do nothing;

    return query select 'waypoint'::text, v_ord, v_name, v_wpid::text,
      case when v_existing is not null
           then 'reused an existing waypoint; its description was left alone'
           else null end;
  end loop;
end;
$$;

select *
from public.tgb_import_walking_tour($tgb$
{
  "city": "Las Vegas",
  "state": "NV",
  "title": "Fremont Street: From the First Casino to the Biggest Sportsbook",
  "shape": "loop",
  "blurb": "A two hour loop through Downtown Las Vegas, from the oldest freestanding bar in the city to the world's biggest sportsbook, a poker legend's gambling hall and a beer garden built out of shipping containers.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Atomic Liquors",
      "address": "917 E Fremont St",
      "zip": "89101",
      "description": "The oldest freestanding bar in Las Vegas, poured since 1952 and once famous for rooftop parties watching the mushroom clouds from the atomic tests; get a drink, find your group, and head west down Fremont.",
      "source_url": "https://atomic.vegas/about/"
    },
    {
      "name": "El Cortez Hotel & Casino",
      "address": "600 E Fremont St",
      "zip": "89101",
      "description": "Open on this corner since 1941 and never remodeled to look like anywhere else, this is the one downtown property that still plays like Vegas before the Strip existed.",
      "source_url": "https://elcortezhotelcasino.com/about-us/map/"
    },
    {
      "name": "Fremont Country Club",
      "address": "601 Fremont St",
      "zip": "89101",
      "description": "An eight hundred capacity room built by musicians for musicians, running blues, punk and indie shows most nights of the week right across the street from El Cortez.",
      "source_url": "https://www.yelp.com/biz/fremont-country-club-las-vegas"
    },
    {
      "name": "The D Las Vegas",
      "address": "301 Fremont St",
      "zip": "89101",
      "description": "A retro casino floor under the canopy with the VUE Bar up top, where the rooftop view is the whole Fremont Street Experience laid out below.",
      "source_url": "https://en.wikipedia.org/wiki/The_D_Las_Vegas"
    },
    {
      "name": "Golden Nugget",
      "address": "129 E Fremont St",
      "zip": "89101",
      "description": "Home to the Hand of Faith, the largest gold nugget ever found with a metal detector, on display under glass near the north tower elevators.",
      "source_url": "https://www.goldennugget.com/las-vegas/entertainment/attractions/hand-of-faith/"
    },
    {
      "name": "Binion's Gambling Hall",
      "address": "128 Fremont St",
      "zip": "89101",
      "description": "The 1951 hall where Benny Binion invented the World Series of Poker, sitting directly across Fremont Street from the Golden Nugget.",
      "source_url": "https://en.wikipedia.org/wiki/Binion%27s_Gambling_Hall_and_Hotel"
    },
    {
      "name": "Circa Resort & Casino",
      "address": "8 Fremont St",
      "zip": "89101",
      "description": "The world's largest sportsbook, a three story wall of screens built for people who came downtown to watch the game as much as play one.",
      "source_url": "https://www.circalasvegas.com/sportsbook/"
    },
    {
      "name": "Golden Gate Hotel & Casino",
      "address": "1 Fremont St",
      "zip": "89101",
      "description": "Vegas's very first hotel, standing on this corner since 1906 and still serving the shrimp cocktail that made it famous; turn north here and pick up Carson Avenue for the walk back.",
      "source_url": "https://www.goldengatecasino.com/our-story/"
    },
    {
      "name": "Gold Spike",
      "address": "217 Las Vegas Blvd N",
      "zip": "89101",
      "description": "A former casino turned backyard of oversized Jenga, cornhole and ping pong on Carson Avenue, proof that downtown has kept a sense of humor.",
      "source_url": "https://goldspike.com/about/"
    },
    {
      "name": "Downtown Container Park",
      "address": "707 E Fremont St",
      "zip": "89101",
      "description": "A stack of shipping containers turned open air bar and beer garden under string lights, the easiest place downtown to sit down and compare notes on the walk.",
      "source_url": "https://downtowncontainerpark.com/visit/"
    }
  ]
}
$tgb$::jsonb);
