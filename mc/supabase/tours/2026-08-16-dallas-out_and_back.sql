-- TGB NFL Anchor Route Builder
-- city: Dallas, TX (Dallas Cowboys fanbase city; venue is Arlington, never used)
-- date: 2026-08-16
-- shape: out_and_back, 10 stops
-- distance/time: about 1.4 miles round trip, roughly 100 minutes including time at each stop
-- sports stop: Frankie's Downtown, 1303 Main St (self-declared Dallas Cowboys watching headquarters)
-- music stop: Majestic Theatre, 1925 Elm St (1921 vaudeville palace, still hosts concerts)
-- commercial ends: START Frankie's Downtown, 1303 Main St; END Commissary, 1217 Main St (one block away)
-- published tours drawn from: DallasADEX.org Main Street District Walking Tour, Downtown Dallas Parks
-- Conservancy's iconic-building write-ups on the Adolphus and the Majestic, and Hello Little Home's
-- Downtown Dallas walking tour, cross-checked against each stop's own history page.
-- route: out along Main Street from Frankie's to Main Street Garden Park, a short jog to the Majestic
-- on Elm, then back west along Commerce Street past the Statler, the Magnolia and the Adolphus to
-- Commissary, a block from the start.
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
  "city": "Dallas",
  "state": "TX",
  "title": "The Pegasus Mile",
  "shape": "out_and_back",
  "blurb": "Two hours from a sports bar under forty-four screens to a bakery a block away, past a giant eyeball, a vaudeville stage and the neon horse that gave the walk its name.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Frankie's Downtown",
      "address": "1303 Main St",
      "zip": "75202",
      "description": "USA Today once called this corner bar nirvana for Texas sports fans, and its own sign still claims Dallas Cowboys Watching Headquarters, forty-four screens and all.",
      "source_url": "https://www.visitdallas.com/blog/14-spots-to-watch-the-dallas-cowboys/"
    },
    {
      "name": "Pegasus Plaza",
      "address": "1500 Main St",
      "zip": "75201",
      "description": "This 1994 plaza takes its name and its fountain from the neon Flying Red Horse that has spun atop a rooftop two blocks east since 1934.",
      "source_url": "https://en.wikipedia.org/wiki/Pegasus_Plaza"
    },
    {
      "name": "The Eye",
      "address": "1601 Main St",
      "zip": "75201",
      "description": "Chicago artist Tony Tasset's thirty foot fiberglass eyeball has stared down Main Street from the Joule's garden since 2013, his own eye blown up past all reason.",
      "source_url": "https://en.wikipedia.org/wiki/Eye_(sculpture)"
    },
    {
      "name": "Wilson Building",
      "address": "1623 Main St",
      "zip": "75201",
      "description": "Modeled on the Paris Opera and finished in 1904, this was Dallas's tallest building for five years and later housed the department store lunch counter that desegregated first.",
      "source_url": "https://en.wikipedia.org/wiki/Wilson_Building_(Dallas)"
    },
    {
      "name": "Main Street Garden Park",
      "address": "1900 Main St",
      "zip": "75201",
      "description": "A parking garage stood here until 2009, when the city traded it for a lawn, fountains and a small cafe, downtown's first real patch of green in decades.",
      "source_url": "https://en.wikipedia.org/wiki/Main_Street_Garden_Park"
    },
    {
      "name": "Majestic Theatre",
      "address": "1925 Elm St",
      "zip": "75201",
      "description": "Duke Ellington, Cab Calloway, Harry Houdini and Bob Hope all worked this stage after it opened in 1921, and the restored vaudeville palace still books concerts today.",
      "source_url": "https://en.wikipedia.org/wiki/Majestic_Theatre_(Dallas)"
    },
    {
      "name": "The Statler",
      "address": "1914 Commerce St",
      "zip": "75201",
      "description": "Opened in 1956 as the first fully air conditioned hotel in the Southwest, its cantilevered glass front sat dark for sixteen years before a 2017 restoration brought it back.",
      "source_url": "https://en.wikipedia.org/wiki/The_Statler_Hotel_%26_Residences"
    },
    {
      "name": "Flying Horse Cafe",
      "address": "1401 Commerce St",
      "zip": "75201",
      "description": "Order a coffee at the foot of the old Magnolia Petroleum Building, whose rooftop neon Pegasus has turned above downtown since 1934, once the tallest sign west of the Mississippi.",
      "source_url": "https://en.wikipedia.org/wiki/Magnolia_Hotel_(Dallas,_Texas)"
    },
    {
      "name": "Adolphus Hotel",
      "address": "1321 Commerce St",
      "zip": "75202",
      "description": "Beer baron Adolphus Busch built this Beaux Arts tower in 1912 to outshine the hotel he already owned across the street, and it was the tallest building in Texas for years.",
      "source_url": "https://en.wikipedia.org/wiki/Adolphus_Hotel"
    },
    {
      "name": "Commissary",
      "address": "1217 Main St",
      "zip": "75202",
      "description": "Headington Companies bakes its bread here daily behind a butcher counter and an espresso bar, a block from where you started and open early for whatever the walk left you wanting.",
      "source_url": "https://www.dallasobserver.com/restaurants/first-look-commissary-in-downtown-dallas-10060119"
    }
  ]
}
$tgb$::jsonb);
