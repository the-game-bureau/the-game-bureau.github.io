-- TGB NFL Tour Builder
-- City: Chicago, IL (fanbase city of the Bears); had zero rows in public.routes
-- Date: 2026-08-10
-- Shape: loop, 10 stops
-- Distance / time: roughly 1.3 miles round trip, about 1 hour 25 minutes including
--   time standing at each stop.
-- Sports stop: stop 8, Harry Caray's Italian Steakhouse (33 W Kinzie St), the
--   broadcaster's namesake restaurant and de facto Cubs/Sox museum.
-- Music stop: stop 6, House of Blues Chicago (329 N Dearborn St), the blues hall
--   built into the base of Marina City.
-- Commercial ends: stop 1, Billy Goat Tavern (start, 430 N Michigan Ave Lower
--   Level) and stop 10, Eataly Chicago (end, 43 E Ohio St) -- about a five-minute
--   walk apart.
-- Drawn from: the published Magnificent Mile self-guided walking tour on
--   GPSmyCity (DuSable Bridge, Tribune Tower, Billy Goat Tavern), Choose Chicago's
--   River North / Riverwalk guides (Marina City, House of Blues, Merchandise
--   Mart), and individual venue/landmark pages for every address and fact below.
-- Note: Harry Caray's on Kinzie is also on published pub-crawl and food-tour
--   itineraries of this same pocket, alongside the Billy Goat -- this loop
--   borrows that footprint rather than inventing a new one.
-- Outbound runs south from Michigan Avenue to the river, then west along the
--   riverfront to Wells Street and north to Kinzie; the return climbs back north
--   and east via Wabash and Ohio, so no stretch of pavement is walked twice.
-- ai_model: Anthropic Claude Sonnet 5

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
alter table public.waypoints add column if not exists archived    boolean not null default false;
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

create table if not exists public.routes (
  tour_id    text primary key,
  title      text,
  shape      text,
  city       text,
  created_at timestamptz not null default now()
);

-- Seven shapes since 2026080805. This block DROPS and re-adds the constraint,
-- so a stale copy here would quietly narrow it again the next time somebody
-- pastes this helper - keep it in step with the migration.
alter table public.routes drop constraint if exists routes_shape_known;
alter table public.routes add constraint routes_shape_known
  check (shape is null or shape in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  )) not valid;

create table if not exists public.route_stops (
  tour_id text   not null references public.routes(tour_id) on delete cascade,
  wpid    bigint not null references public.waypoints(wpid) on delete cascade,
  ord     integer not null,
  primary key (tour_id, wpid)
);

create index if not exists route_stops_order_idx on public.route_stops (tour_id, ord);
create index if not exists route_stops_wpid_idx  on public.route_stops (wpid);

alter table public.routes      enable row level security;
alter table public.route_stops enable row level security;

drop policy if exists "routes readable by anyone" on public.routes;
create policy "routes readable by anyone" on public.routes for select using (true);
drop policy if exists "routes write by authenticated" on public.routes;
create policy "routes write by authenticated" on public.routes for all
  to authenticated using (true) with check (true);

drop policy if exists "route_stops readable by anyone" on public.route_stops;
create policy "route_stops readable by anyone" on public.route_stops for select using (true);
drop policy if exists "route_stops write by authenticated" on public.route_stops;
create policy "route_stops write by authenticated" on public.route_stops for all
  to authenticated using (true) with check (true);

grant select on public.routes, public.route_stops to anon, authenticated;
grant insert, update, delete on public.routes, public.route_stops to authenticated;

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
  -- One route is the work of ONE model, so this belongs to the route, not a stop.
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The route needs a city.'; end if;
  if v_title is null then raise exception 'The route needs a title.'; end if;
  -- The seven of routes_shape_known (2026080805). Checked here so a bad shape
  -- comes back as a sentence rather than as a constraint name.
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The route needs a non-empty stops array.';
  end if;

  -- Readable and unique without a sequence: the city, the shape and the second.
  -- SECONDS, not minutes. To the minute, two imports of the same city and shape
  -- inside one minute produce the SAME id - so the second route does not fail,
  -- it silently merges into the first and you get one twenty-stop walk. That has
  -- already happened once in this table.
  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.routes (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'route'::text, null::integer, v_title, v_tour_id, v_shape;

  -- Stops are taken IN ARRAY ORDER. Any walk_order supplied on a stop is
  -- ignored: the array is the sequence, and trusting one over the other when
  -- they disagree is how a route ends up with two stop 4s.
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

    -- Do we already hold this place? Name AND address, both lowercased. An
    -- archived row counts as held: archived is a do-not-rescrape tombstone, and
    -- re-inserting the place under a new wpid would defeat it entirely.
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

    -- A place appears at most once per route. A loop FINISHES NEAR its first
    -- stop, it does not list it again, so a repeat is a mistake in the payload
    -- rather than something to store - and the primary key would reject it.
    -- on conflict ON CONSTRAINT, not on (tour_id, wpid): this function's
    -- RETURNS TABLE declares output columns called wpid and ord, and inside an
    -- index-inference clause plpgsql cannot tell those from the table's own
    -- columns - it raises "column reference wpid is ambiguous". Naming the
    -- primary key sidesteps the resolution entirely.
    insert into public.route_stops (tour_id, wpid, ord)
    values (v_tour_id, v_wpid, v_ord)
    on conflict on constraint route_stops_pkey do nothing;

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
  "city": "Chicago",
  "state": "IL",
  "title": "Corncobs, Cheezborgers and the Chicago River",
  "shape": "loop",
  "blurb": "A ninety-minute loop through River North, from the underground grill that inspired SNL's cheezborger sketch to the blues hall built into the base of Chicago's corncob towers, by way of the bridge that lifts the whole street.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Billy Goat Tavern",
      "address": "430 N Michigan Ave, Lower Level",
      "zip": "60611",
      "description": "This underground grill fed generations of Chicago newspapermen and inspired Saturday Night Live's cheezborger cheezborger sketch; grab a burger and a beer down the stairs before you start walking.",
      "source_url": "https://www.billygoattavern.com/locations/michigan/"
    },
    {
      "name": "Tribune Tower",
      "address": "435 N Michigan Ave",
      "zip": "60611",
      "description": "This 1925 neo-Gothic tower has more than 150 stones from world landmarks -- the Great Wall, the Parthenon, the Colosseum -- set into its base by Tribune correspondents; see how many you can spot at street level.",
      "source_url": "https://en.wikipedia.org/wiki/Tribune_Tower"
    },
    {
      "name": "Wrigley Building",
      "address": "400 N Michigan Ave",
      "zip": "60611",
      "description": "The gleaming white terra cotta clock tower modeled on Seville's Giralda bell tower has anchored the north bank of the river since 1921; look up at its four dials from the plaza below.",
      "source_url": "https://en.wikipedia.org/wiki/Wrigley_Building"
    },
    {
      "name": "McCormick Bridgehouse and Chicago River Museum",
      "address": "99 Chicago Riverwalk",
      "zip": "60601",
      "description": "Tucked inside the southwest tower of the DuSable Bridge, this small museum explains the counterweighted machinery that still lifts Michigan Avenue; walk down to the Riverwalk to see the bascule and gears from below the roadway.",
      "source_url": "https://www.bridgehousemuseum.org/"
    },
    {
      "name": "Marina City",
      "address": "300 N State St",
      "zip": "60654",
      "description": "Bertrand Goldberg's twin 1964 towers, nicknamed the corncobs for their circular balconies, were the first modern high-rises built to bring residents back downtown; stand on State Street and take in the full curve.",
      "source_url": "https://en.wikipedia.org/wiki/Marina_City"
    },
    {
      "name": "House of Blues Chicago",
      "address": "329 N Dearborn St",
      "zip": "60654",
      "description": "A 55,000-square-foot blues hall built into the base of Marina City, its lobby covered floor to ceiling in folk art; step inside to see it even if there is no show tonight.",
      "source_url": "https://locations.houseofblues.com/restaurant-and-bar/il/chicago/329-n-dearborn-st."
    },
    {
      "name": "Merchandise Mart",
      "address": "222 Merchandise Mart Plaza",
      "zip": "60654",
      "description": "Built for Marshall Field and Co. in 1930 and once the largest commercial building on earth, its Art Deco riverfront facade still runs four blocks along the water; walk its length toward Kinzie Street.",
      "source_url": "https://en.wikipedia.org/wiki/Merchandise_Mart"
    },
    {
      "name": "Harry Caray's Italian Steakhouse",
      "address": "33 W Kinzie St",
      "zip": "60654",
      "description": "Broadcaster Harry Caray's namesake steakhouse fills a former Al Capone-era building with Cubs and White Sox memorabilia, from lineup cards to a wall of his signature glasses; it is still where Chicago goes to talk baseball.",
      "source_url": "https://www.harrycarays.com/harry-carays-italian-steakhouse-river-north.html"
    },
    {
      "name": "Medinah Temple",
      "address": "600 N Wabash Ave",
      "zip": "60611",
      "description": "This 1912 Shriners hall was built for an audience of 4,200 under two 10,000-pound copper onion domes and later hosted Chicago Symphony recordings before becoming a store; look up at the domes from Wabash Avenue.",
      "source_url": "https://en.wikipedia.org/wiki/Medinah_Temple"
    },
    {
      "name": "Eataly Chicago",
      "address": "43 E Ohio St",
      "zip": "60611",
      "description": "Two floors of Italian marketplace, bakery counters and espresso bars close the loop the way Billy Goat's opened it -- standing at a counter with something good in hand.",
      "source_url": "https://www.eataly.com/us_en/stores/chicago"
    }
  ]
}
$tgb$::jsonb);
