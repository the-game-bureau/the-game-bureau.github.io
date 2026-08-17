-- TGB NFL Anchor Route Builder
-- city: Denver, CO (Denver Broncos fanbase city)
-- date: 2026-08-17
-- shape: out_and_back, 10 stops
-- distance/time: about 1.3 miles round trip, roughly 105 minutes including time at each stop
-- sports stop: Jackson's LoDo, 1520 20th St (longtime game day bar across from Coors Field, a Broncos
-- watch party pick named in a local season survival guide)
-- music stop: site of El Chapultepec, 1962 Market St (jazz club that ran from 1933 to 2020, Basie,
-- Fitzgerald and Bennett all played its stage)
-- commercial ends: START Osteria Marco, 1453 Larimer St; END Huckleberry Roasters, 1406 Larimer St
-- (same block of Larimer Square)
-- published tours drawn from: the Drives and Detours LoDo Historic Audio Tour and the GPSmyCity Denver
-- Downtown Walking Tour, cross checked against each stop's own history page.
-- route: out from Larimer Square along Wazee and Wynkoop past Rockmount, Union Station and Dairy Block
-- to the ballpark end at El Chapultepec and Jackson's LoDo, back along 17th and 16th past the Oxford
-- Hotel, the Daniels and Fisher Tower and the Sugar Building to a coffee shop two doors from the start.
--
-- Ahead of tgb_import_walking_tour is buildWaypointsSchemaSql() then buildWalkingTourSchemaSql(), both
-- idempotent, from mc/assets/waypoint-prompts.js.

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
  "city": "Denver",
  "state": "CO",
  "title": "Snap Shirts and the Great Hall",
  "shape": "out_and_back",
  "blurb": "Two hours out from a Larimer Square trattoria past a jazz room's ghost and a game day bar by the ballpark, back through a 1906 sugar warehouse and a Beaux Arts train hall to a coffee shop two doors from where you started.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Osteria Marco",
      "address": "1453 Larimer St",
      "zip": "80202",
      "description": "Chef Frank Bonanno opened this wood fired Italian counter in 2007 inside one of Larimer Square's oldest storefronts, the place to gather, order a plate of salumi and start the walk late without ruining anything.",
      "source_url": "https://www.osteriamarco.com/"
    },
    {
      "name": "Rockmount Ranch Wear",
      "address": "1626 Wazee St, Denver, CO 80202",
      "zip": "80202",
      "description": "Jack Weil opened this Wazee Street shop in 1946 and put the first snap buttons on a western shirt so a cowboy's collar would tear free of a steer's horn instead of the cowboy, a design still stitched here today.",
      "source_url": "https://rockmount.com/pages/about-us"
    },
    {
      "name": "Denver Union Station",
      "address": "1701 Wynkoop St, Denver, CO 80202",
      "zip": "80202",
      "description": "The 1914 Beaux Arts hall replaced an 1881 depot that lost its own 180 foot clock tower to an electrical fire, and the restored Great Hall now seats travelers under the original chandeliers.",
      "source_url": "https://www.denverunionstation.com/about/our-history/"
    },
    {
      "name": "Dairy Block",
      "address": "1800 Wazee St, Denver, CO 80202",
      "zip": "80202",
      "description": "This alley of restaurants and shops takes its name from the 1916 Windsor Dairy building on the corner, which once delivered milk by horse drawn truck to more than half of Denver's households.",
      "source_url": "https://dairyblock.com/about/"
    },
    {
      "name": "El Chapultepec",
      "address": "1962 Market St",
      "zip": "80202",
      "description": "Count Basie, Ella Fitzgerald and Tony Bennett all played the postage stamp stage inside this corner club, open from the day after Prohibition ended in 1933 until it closed in 2020 as Denver's longest running jazz room.",
      "source_url": "https://www.rmpbs.org/news/rocky-mountain-pbs/denvers-oldest-jazz-club-el-chapultepec-closes-after-nearly-90-years-in-business"
    },
    {
      "name": "Jackson's LoDo",
      "address": "1520 20th St",
      "zip": "80202",
      "description": "Denver's long running game day bar sits across the street from Coors Field, and a local Broncos season guide names it the spot where visiting fan bases claim their own floor on a Sunday.",
      "source_url": "https://therooster.com/articles/broncos-season-survival-guide-watch-parties-munchies-and-smart-money/"
    },
    {
      "name": "The Oxford Hotel",
      "address": "1600 17th St, Denver, CO 80202",
      "zip": "80202",
      "description": "Frank Edbrooke's 1891 hotel hid its Cruise Room bar through Prohibition, and the art deco room opened in full the day the law lifted in 1933, still pouring behind the same curved bar.",
      "source_url": "https://www.theoxfordhotel.com/our-hotel/history"
    },
    {
      "name": "Daniels and Fisher Tower",
      "address": "1601 Arapahoe St, Denver, CO 80202",
      "zip": "80202",
      "description": "Modeled on the bell tower over Venice's Piazza San Marco, this 1911 clock tower was the tallest building between the Mississippi and California until the department store around it came down in the 1970s and left it standing alone.",
      "source_url": "https://en.wikipedia.org/wiki/Daniels_%26_Fisher_Tower"
    },
    {
      "name": "Sugar Building",
      "address": "1530 16th St, Denver, CO 80202",
      "zip": "80202",
      "description": "Charles Boettcher raised this 1906 warehouse for the Great Western Sugar Company after merging six Colorado sugar beet producers, and its elevator, the oldest working one west of the Mississippi, still runs today.",
      "source_url": "https://www.historycolorado.org/location/sugar-building"
    },
    {
      "name": "Huckleberry Roasters",
      "address": "1406 Larimer St",
      "zip": "80202",
      "description": "This Larimer Square cafe took over a former Starbucks storefront as the sixth shop for the homegrown Denver roaster, two doors from where the walk began and a good place to sit down and let it settle.",
      "source_url": "https://www.westword.com/food-drink/denver-coffee-company-huckleberry-roasters-opening-in-larimer-square-20526851/"
    }
  ]
}
$tgb$::jsonb);
