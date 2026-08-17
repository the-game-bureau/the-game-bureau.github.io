/*
 * NFL Tour Builder route
 *
 * City: Detroit, MI
 * Date: 2026-08-17
 * Shape: out_and_back, 10 stops
 * Distance and time: roughly 1.2 miles round trip, about 75 to 90 minutes including time spent at each stop
 * Sports stop: Ford Field (stop 5), home of the Detroit Lions
 * Music stop: Fox Theatre (stop 4), the 1928 movie palace that put Motown stars on its stage
 * Commercial ends: Union Assembly (start, stop 1) and WXYZ Bar in the David Whitney Building (end, stop 10)
 * Sourced from: the Visit Detroit venue directory, Historic Detroit, the Fox Theatre, Fillmore Detroit, Cliff Bell's and Detroit Opera House histories, and the Grand Circus Park Historic District entry, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * The whole walk stays inside the Grand Circus Park Historic District, the
 * theater and stadium cluster Detroit itself calls Foxtown. The out leg runs
 * up Woodward Avenue past the Fillmore, Comerica Park and the Fox Theatre to
 * Ford Field; the return comes back down Park Avenue and Broadway, a
 * different set of streets, past Cliff Bell's and the Detroit Opera House to
 * Grand Circus Park itself before finishing a few doors from where it began.
 */

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
  "city": "Detroit",
  "state": "MI",
  "title": "Foxtown Nights and Sunday Lights",
  "shape": "out_and_back",
  "blurb": "An hour and a half around Grand Circus Park, from a Motown marquee to the Lions front door and back through a hundred year old jazz room.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Union Assembly",
      "address": "2131 Woodward Ave",
      "zip": "48201",
      "description": "This two story restaurant and rooftop terrace sits right on Woodward, so find your group at the bar and get something in your hands before you start walking.",
      "source_url": "https://visitdetroit.com/directory/union-assembly/"
    },
    {
      "name": "The Fillmore Detroit",
      "address": "2115 Woodward Ave",
      "zip": "48201",
      "description": "Opened in 1925 as the State Theatre and now a Live Nation stage, this Beaux Arts hall has put on everything from Motown revues to Nirvana under its restored lobby chandeliers.",
      "source_url": "https://en.wikipedia.org/wiki/The_Fillmore_Detroit"
    },
    {
      "name": "Comerica Park",
      "address": "2100 Woodward Ave",
      "zip": "48201",
      "description": "Five tiger sculptures guard the Tigers home field here, one of them fifteen feet tall at the shoulder, and you do not need a ticket to walk up and look them in the eye from the sidewalk.",
      "source_url": "https://www.keropiansculpture.com/north_gate_tigers.html"
    },
    {
      "name": "Fox Theatre",
      "address": "2211 Woodward Ave",
      "zip": "48201",
      "description": "Built in 1928 as the largest movie palace of its era, this National Historic Landmark put Motown stars like Smokey Robinson on its stage and still fills its six story lobby before a show.",
      "source_url": "https://en.wikipedia.org/wiki/Fox_Theatre_(Detroit)"
    },
    {
      "name": "Ford Field",
      "address": "2000 Brush St",
      "zip": "48226",
      "description": "The Detroit Lions have played inside this converted 1920s Hudson's warehouse since 2002, and the atrium built into the old warehouse walls is the loudest room downtown on a Sunday.",
      "source_url": "https://en.wikipedia.org/wiki/Ford_Field"
    },
    {
      "name": "Cliff Bell's",
      "address": "2030 Park Ave",
      "zip": "48226",
      "description": "Cliff Bell ran a bar out of this 1935 Albert Kahn building until 1958, and after decades sitting dark it reopened as a jazz club in 2006 with the same mahogany and green velvet he left behind.",
      "source_url": "https://en.wikipedia.org/wiki/Cliff_Bell's"
    },
    {
      "name": "The Old Park Bar",
      "address": "2040 Park Ave",
      "zip": "48226",
      "description": "This neighborhood bar has poured drinks on Park Avenue since 2006 and still fills up before whatever is playing next door at the Fillmore.",
      "source_url": "https://visitdetroit.com/directory/the-old-park-bar-night-entertainment/"
    },
    {
      "name": "Detroit Opera House",
      "address": "1526 Broadway",
      "zip": "48226",
      "description": "This 1922 movie palace reopened as the Detroit Opera House in 1996 with a gala starring Luciano Pavarotti and now anchors the block right around the corner from Grand Circus Park.",
      "source_url": "https://en.wikipedia.org/wiki/Detroit_Opera_House"
    },
    {
      "name": "Grand Circus Park",
      "address": "40 E Adams Ave",
      "zip": "48226",
      "description": "Laid out in 1850, this park is split clean in half by Woodward Avenue, and its fountains and statues mark the exact line where downtown gives way to the theater district you just walked through.",
      "source_url": "https://en.wikipedia.org/wiki/Grand_Circus_Park_Historic_District"
    },
    {
      "name": "WXYZ Bar",
      "address": "1 Park Ave",
      "zip": "48226",
      "description": "Detroit lumber baron David Whitney Jr's 1915 tower sat empty for a decade before a renovation turned it into the Aloft hotel, so end the walk with a drink here and look back out at Grand Circus Park through the lobby windows.",
      "source_url": "https://www.tripadvisor.com/ShowUserReviews-g42139-d7263062-r828821420-Aloft_Detroit_at_The_David_Whitney-Detroit_Michigan.html"
    }
  ]
}
$tgb$::jsonb);
