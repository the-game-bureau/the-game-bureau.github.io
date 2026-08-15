-- TGB NFL Tour Builder
-- City: Cincinnati, OH (fanbase city of the Bengals); had zero rows in public.routes,
--   and no tour file for it appears anywhere in this folder's git history --
--   alphabetically first among the never-built cities once the tie-break was applied.
-- Date: 2026-08-15
-- Shape: point_to_point, 6 stops (rolled at random; did not have to be re-rolled,
--   since Cincinnati held no existing route of any shape)
-- Distance / time: roughly 0.8 miles point to point, about 75-90 minutes including
--   time standing at each stop.
-- Sports stop: stop 1, Findlay Market (1801 Race St) -- also the commercial start,
--   see below.
-- Music stop: stop 4, Cincinnati Music Hall (1241 Elm St).
-- Commercial ends: stop 1, Findlay Market (start, 1801 Race St, a public market with
--   food stalls) and stop 6, Krueger's Tavern (end, 1313 Vine St) -- about 0.8 miles
--   apart, well outside a five-minute walk of each other.
-- Drawn from: GPSmyCity's "Over-the-Rhine District Walking Tour" (same footprint --
--   Findlay Market, Music Hall, Memorial Hall, Washington Park, Rhinegeist), WVXU's
--   and findlaymarketparade.com's history of the Findlay Market Opening Day Parade,
--   and individual venue/history pages (Wikipedia, official sites) for every address
--   and fact below.
-- Note: Findlay Market does double duty as both the sports stop and the commercial
--   start -- it is genuinely both, a working public market that has also been the
--   starting line of the Reds' Opening Day Parade since 1920, so no second, weaker
--   "sports" address had to be invented nearby. Two earlier candidate end stops --
--   Taft's Ale House (closed late 2023) and the Taste of Belgium OTR flagship
--   (closed September 2025) -- were dropped once research showed they no longer
--   operate; Taft's space is now Mellotone Beer Project, used here instead as stop 2,
--   and Krueger's Tavern (relocated to 1313 Vine St after its original location
--   closed in 2020) was verified open and used as the end. Memorial Hall, Music Hall
--   and Washington Park sit within a block of one another, so the middle three stops
--   run well under the usual five-to-eight-minute gap -- that reflects how tightly
--   this civic core actually clusters, not padding.

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
  "city": "Cincinnati",
  "state": "OH",
  "title": "Parade Route to Last Call: An Over-the-Rhine Walk",
  "shape": "point_to_point",
  "blurb": "Six stops from the market where Reds fans have kicked off Opening Day since 1920, past a church turned brewery and the hall where the Symphony still plays, to a beer-hall tavern for last call.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Findlay Market",
      "address": "1801 Race St",
      "zip": "45202",
      "description": "Ohio's oldest continuously operating public market, open since 1852 and the starting point of the Findlay Market Opening Day Parade that has sent Cincinnati Reds fans marching downtown every spring since 1920; grab something from a stall and find your group before setting off.",
      "source_url": "https://en.wikipedia.org/wiki/Findlay_Market"
    },
    {
      "name": "Mellotone Beer Project",
      "address": "1429 Race St",
      "zip": "45202",
      "description": "A brewpub built inside St. Paul's, an 1850 German Evangelical church left abandoned for decades on Race Street until a restoration saved its Gothic Revival tower and turned the nave into a beer hall.",
      "source_url": "https://www.mellotonebeer.com/"
    },
    {
      "name": "Memorial Hall",
      "address": "1225 Elm St",
      "zip": "45202",
      "description": "Built in 1908 by the Grand Army of the Republic to honor Hamilton County's Civil War and Spanish-American War veterans, this Beaux-Arts hall still hosts concerts under its restored coffered ceiling.",
      "source_url": "https://en.wikipedia.org/wiki/Hamilton_County_Memorial_Building"
    },
    {
      "name": "Cincinnati Music Hall",
      "address": "1241 Elm St",
      "zip": "45202",
      "description": "A Venetian Gothic concert hall completed in 1878 and named a National Historic Landmark in 1975, still home to the Cincinnati Symphony, Pops, Opera and May Festival Chorus.",
      "source_url": "https://en.wikipedia.org/wiki/Cincinnati_Music_Hall"
    },
    {
      "name": "Washington Park",
      "address": "1230 Elm St",
      "zip": "45202",
      "description": "An 8-acre park redesigned in 2012 with a splash pad and bandstand, the historic front lawn of Music Hall across the street and the site of free summer concerts.",
      "source_url": "https://en.wikipedia.org/wiki/Washington_Park_(Cincinnati,_Ohio)"
    },
    {
      "name": "Krueger's Tavern",
      "address": "1313 Vine St",
      "zip": "45202",
      "description": "A hand-ground burger and sausage tavern styled after a European beer hall, the last stop for sitting down, splitting a plate and calling it a night.",
      "source_url": "https://www.kruegerstavern.com/"
    }
  ]
}
$tgb$::jsonb);
