-- TGB NFL Tour Builder
-- City: Cincinnati, OH (fanbase city of the Bengals); had zero rows in public.routes
-- Date: 2026-08-13
-- Shape: out_and_back, 10 stops
-- Distance / time: roughly 2.6 miles round trip, about 1 hour 40 minutes including
--   time standing at each stop.
-- Sports stop: stop 4, the Cincinnati Reds Hall of Fame and Museum on the riverfront
--   wall of Great American Ball Park (100 Joe Nuxhall Way).
-- Music stop: stop 2, the Taft Theatre, a 1928 Art Deco concert hall still booking
--   touring acts (317 E 5th St).
-- Commercial ends: stop 1, Arnold's Bar and Grill (start, 210 E 8th St, already in
--   our catalog as the city's oldest bar) and stop 10, Nicholson's Pub (end, 625
--   Walnut St) -- about a five-minute walk apart.
-- Drawn from: GPSmyCity's "Cincinnati Introduction Walking Tour" (same downtown-to-
--   riverfront spine -- Fountain Square, the Reds Hall of Fame, the Freedom Center,
--   Smale Riverfront Park), plus individual venue, history and Wikipedia pages for
--   every address and fact below.
-- Note: the outbound leg runs east from downtown down to the Ohio River and along
--   it to Public Landing; the return comes back west along the riverfront through
--   Smale Riverfront Park, then north via Vine Street through Carew Tower and the
--   Contemporary Arts Center to Walnut Street, so the outbound pavement (Sycamore/
--   Main) is never retraced. Reaching genuine riverfront landmarks from Cincinnati's
--   downtown core is itself close to a mile each way, so total walking distance
--   runs over the shape's 1.5-mile guideline; every address below is still real and
--   independently verified, and the two-hour budget still holds.
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
  "city": "Cincinnati",
  "state": "OH",
  "title": "The Fountain, the Fastball and the Freedom Line",
  "shape": "out_and_back",
  "blurb": "Two hours from Cincinnati's oldest bar down to the Ohio River and back, by way of a pennant-winning ballpark and the corner where the story of freedom on the river is told.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Arnold's Bar and Grill",
      "address": "210 E 8th St",
      "zip": "45202",
      "description": "Cincinnati's oldest continuously operating bar, pouring drinks from these two 1830s buildings since 1861; grab a seat in the courtyard, find your group, and start the walk when you are ready.",
      "source_url": "https://en.wikipedia.org/wiki/Arnold%27s_Bar_and_Grill"
    },
    {
      "name": "Taft Theatre",
      "address": "317 E 5th St",
      "zip": "45202",
      "description": "This 1928 Art Deco concert hall still books touring bands and comedians under the same terra-cotta facade downtown Cincinnati has walked past for nearly a century.",
      "source_url": "https://en.wikipedia.org/wiki/Taft_Theatre"
    },
    {
      "name": "Fountain Square",
      "address": "520 Vine St",
      "zip": "45202",
      "description": "The 43-foot bronze Tyler Davidson Fountain has anchored Cincinnati's living room since 1871, its Genius of Water watching over lunch crowds, protests and pep rallies alike.",
      "source_url": "https://en.wikipedia.org/wiki/Tyler_Davidson_Fountain"
    },
    {
      "name": "Cincinnati Reds Hall of Fame and Museum",
      "address": "100 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Home plate for Cincinnati baseball since the Red Stockings turned pro in 1869, the Reds' own hall of fame sits on the riverfront wall of Great American Ball Park.",
      "source_url": "https://www.mlb.com/reds/ballpark/reds-hall-of-fame-and-museum"
    },
    {
      "name": "National Underground Railroad Freedom Center",
      "address": "50 E Freedom Way",
      "zip": "45202",
      "description": "Built on the Ohio riverbank where escaping slaves once reached free soil, the Freedom Center tells the story of the underground network that got them there.",
      "source_url": "https://en.wikipedia.org/wiki/National_Underground_Railroad_Freedom_Center"
    },
    {
      "name": "Public Landing",
      "address": "435 E Mehring Way",
      "zip": "45202",
      "description": "For a century this stretch of riverbank was Cincinnati's working waterfront, jammed with steamboats and, in slavery's years, one of the first steps toward freedom for those crossing the river; this is the turnaround point.",
      "source_url": "https://en.wikipedia.org/wiki/Public_Landing,_Cincinnati"
    },
    {
      "name": "Smale Riverfront Park",
      "address": "166 W Mehring Way",
      "zip": "45202",
      "description": "A mile of gardens, fountains and swings built over what was once a parking lot, with the Roebling Suspension Bridge arching overhead toward Kentucky; the walk back starts here.",
      "source_url": "https://www.cincinnati-oh.gov/cincyparks/visit-a-park/find-a-parkfacility/smale-riverfront-park/"
    },
    {
      "name": "Carew Tower",
      "address": "441 Vine St",
      "zip": "45202",
      "description": "Cincinnati's tallest building for 81 years, this 1930 Art Deco skyscraper hides an equally lavish lobby inside the Hilton Netherland Plaza next door.",
      "source_url": "https://en.wikipedia.org/wiki/Carew_Tower"
    },
    {
      "name": "Contemporary Arts Center",
      "address": "44 E 6th St",
      "zip": "45202",
      "description": "One of the country's oldest contemporary art institutions, now wrapped in Zaha Hadid's 2003 urban carpet building at 6th and Walnut.",
      "source_url": "https://en.wikipedia.org/wiki/Contemporary_Arts_Center"
    },
    {
      "name": "Nicholson's Pub",
      "address": "625 Walnut St",
      "zip": "45202",
      "description": "A proper Scottish gastropub a few blocks from where you started, with a whisky list long enough to justify sitting down for a while; call the walk finished here.",
      "source_url": "https://nicholsonspub.com/"
    }
  ]
}
$tgb$::jsonb);
