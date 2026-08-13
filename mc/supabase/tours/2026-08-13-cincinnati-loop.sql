-- TGB NFL Tour Builder
--
-- city:        Cincinnati, OH (fanbase city of the Cincinnati Bengals)
-- date:        2026-08-13
-- shape:       loop (10 stops, ends within a 5-minute walk of the start)
-- stop count:  10
-- distance:    ~1.5 miles of walking, ~30 min moving time; ~75-90 min total
--              with time spent at each stop, well under the 2-hour cap
-- sports stop: stop 3, Rhinehaus (119 E 12th St) - Over-the-Rhine's original
--              sports bar and a CityBeat pick for watching the Bengals
-- music stop:  stop 7, Cincinnati Music Hall (1241 Elm St) - a National
--              Historic Landmark and home to the Cincinnati Symphony, Pops,
--              Opera and Ballet. Stops 4 and 5 (Woodward Theater, MOTR Pub)
--              are working live-music venues on the same block and back it up.
-- commercial
-- ends:        start = stop 1, 1215 Wine Bar & Coffee Lab (1215 Vine St);
--              end = stop 10, The Lackman (1237 Vine St), one block and a
--              one-minute walk from the start, closing the loop.
--
-- The whole route sits inside the Music Hall / Washington Park / Vine Street
-- Business District pocket of Over-the-Rhine, the same cluster the GPSmyCity
-- "Over-the-Rhine District" and "Cincinnati Introduction" self-guided walks
-- already treat as one continuous tour. Paycor Stadium, the Reds Hall of
-- Fame, Findlay Market, Fountain Square and the riverfront landmarks were
-- all considered and dropped - each sits half a mile or more from this
-- cluster, which would have broken the 1.5-mile / 5-to-8-minute-leg budget
-- on a single stop. Every address below was checked against the venue's own
-- site or a business-listing page, and the full ten-stop order was verified
-- with a geocoder against the loop and leg-length limits before being
-- written here (longest single leg ~5.4 minutes; total loop ~1.48 miles).
--
-- Two places considered and rejected as stale during research: Taft's Ale
-- House at 1429 Race St closed permanently in November 2023 (that building
-- now houses Mellotone Beer Project, which sits slightly outside this
-- cluster); Know Theatre (1120 Jackson St) is still open but roughly half a
-- mile east of Vine Street, too far to fit this loop's budget.

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
  "title": "Bengals, Brass and Bar Stools: An Over-the-Rhine Loop",
  "shape": "loop",
  "blurb": "A tight loop through Over-the-Rhine's Music Hall and Vine Street blocks: a wine bar start, a Bengals sports bar, a National Historic Landmark concert hall and a 600-seat live-music house, finishing one block from where you began.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "1215 Wine Bar and Coffee Lab",
      "address": "1215 Vine St",
      "zip": "45202",
      "description": "A wine-and-coffee counter at the top of the Vine Street strip; get a drink, find your group, and start the walk here.",
      "source_url": "https://www.1215vine.com/"
    },
    {
      "name": "Ensemble Theatre Cincinnati",
      "address": "1127 Vine St",
      "zip": "45202",
      "description": "A professional Actors' Equity company staging contemporary work in its Otto M. Budig Theater, a block off Vine Street.",
      "source_url": "https://ensemblecincinnati.org/visit/"
    },
    {
      "name": "Rhinehaus",
      "address": "119 E 12th St",
      "zip": "45202",
      "description": "Billed as Over-the-Rhine's original sports bar, Rhinehaus is where the neighborhood packs in to watch the Bengals.",
      "source_url": "https://www.rhinehausbar.com/"
    },
    {
      "name": "Woodward Theater",
      "address": "1404 Main St",
      "zip": "45202",
      "description": "Opened in 1913 as a silent-movie house, the Woodward Theater is now a restored 600-capacity room that still brings touring bands to Main Street.",
      "source_url": "https://www.woodwardtheater.com/about-us"
    },
    {
      "name": "MOTR Pub",
      "address": "1345 Main St",
      "zip": "45202",
      "description": "Short for Music in Over-the-Rhine, MOTR has booked live, original music seven nights a week with no cover charge since it opened in 2010.",
      "source_url": "https://www.motrpub.com/about-us"
    },
    {
      "name": "Krueger's Tavern",
      "address": "1313 Vine St",
      "zip": "45202",
      "description": "An Over-the-Rhine gastropub known for hand-ground burgers and house-made sausage, reopened on this stretch of Vine Street in 2022.",
      "source_url": "https://www.kruegerstavern.com/location/"
    },
    {
      "name": "Cincinnati Music Hall",
      "address": "1241 Elm St",
      "zip": "45202",
      "description": "Built in 1878 and now a National Historic Landmark, Music Hall is home to the Cincinnati Symphony Orchestra, Pops, Opera and Ballet.",
      "source_url": "https://www.cincinnatiarts.org/music-hall"
    },
    {
      "name": "Memorial Hall",
      "address": "1225 Elm St",
      "zip": "45202",
      "description": "Raised in 1908 by Civil War veterans of the Grand Army of the Republic, Memorial Hall was restored top to bottom in an 11 million dollar campaign completed in 2016.",
      "source_url": "https://www.memorialhallotr.com/plan-your-visit/"
    },
    {
      "name": "Washington Park",
      "address": "1230 Elm St",
      "zip": "45202",
      "description": "The historic green anchoring Over-the-Rhine's arts district, bounded by 12th, 14th, Elm and Race, and the front lawn for Music Hall next door.",
      "source_url": "https://en.wikipedia.org/wiki/Washington_Park_(Cincinnati,_Ohio)"
    },
    {
      "name": "The Lackman",
      "address": "1237 Vine St",
      "zip": "45202",
      "description": "A neighborhood bar inside the century-old Lackman building, raised by a turn-of-the-century Cincinnati brewer - a good place to close out the walk and stay a while.",
      "source_url": "https://www.lackmanbar.com/about"
    }
  ]
}
$tgb$::jsonb);
