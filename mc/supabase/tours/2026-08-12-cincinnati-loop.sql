-- TGB NFL Tour Builder
-- City: Cincinnati, OH (Bengals fanbase city) -- had ZERO rows in public.routes
--   at run time (Buffalo and Charlotte had already been built and committed as
--   files but not yet run, so this routine passed over them per its git-log
--   tiebreak and picked the first fanbase city with no prior tour at all).
-- Date: 2026-08-12
-- Shape: LOOP, rolled at random
-- Stops: 10
-- Total walking distance / time: roughly 1.3 miles, about 25-30 minutes of
--   walking plus stop time -- well under the two-hour budget.
-- Sports stop: stop 2, the Findlay Market Opening Day Parade historical
--   marker (116 W Elder St) -- the corner the Findlay Market "rooters" have
--   marched from every Reds Opening Day since 1920.
-- Music stop: stop 4, Cincinnati Music Hall (1241 Elm St) -- resident home of
--   the Cincinnati Symphony, Opera, Ballet and Pops since 1878.
-- Commercial ends: stop 1 Findlay Market (1801 Race St, start) and stop 10
--   Rhinegeist Brewery (1910 Elm St, end) -- both a few short blocks apart at
--   the north end of Over-the-Rhine, so the loop closes inside a five-minute
--   walk.
-- Drawn from: the published "Over-the-Rhine District Walking Tour" on
--   GPSmyCity (Washington Park, Music Hall, Memorial Hall, Findlay Market,
--   Rhinegeist Brewery, Graeter's Ice Cream all appear on that route) plus
--   the Ohio History Connection historical marker database for the Findlay
--   Market Opening Day Parade marker. Old St. Mary's Church, Cincinnati
--   Shakespeare Company and Ensemble Theatre Cincinnati were added from their
--   own venue/Wikipedia pages to round out the loop within the same few
--   blocks and to keep every stop a real, currently open, standable place.
-- Stretched: none of the ten addresses were guessed -- every stop below is a
--   real street address, verified against its own Wikipedia article, venue
--   page, or (for the marker) the Ohio History Connection / HMDB listing.

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
  "title": "Brick, Brass and Ballpark Roots",
  "shape": "loop",
  "blurb": "A two-hour loop through Findlay Market and the Over-the-Rhine arts blocks, from the corner where Reds Opening Day fandom began to the hall where the Symphony still tunes up.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Findlay Market",
      "address": "1801 Race St",
      "zip": "45202",
      "description": "Ohio's oldest continuously operated public market, trading here since 1852 under one of the country's earliest cast-iron market houses; grab a coffee or a pastry from one of the stalls before the walk begins.",
      "source_url": "https://en.wikipedia.org/wiki/Findlay_Market"
    },
    {
      "name": "Findlay Market Opening Day Parade Marker",
      "address": "116 W Elder St",
      "zip": "45202",
      "description": "This marker remembers the market 'rooters' who first paraded from these stalls to celebrate the Reds' 1920 season opener, a tradition that still starts here every Opening Day more than a century later.",
      "source_url": "https://www.hmdb.org/m.asp?m=239174"
    },
    {
      "name": "Memorial Hall",
      "address": "1225 Elm St",
      "zip": "45202",
      "description": "Built in 1908 by the Grand Army of the Republic as a memorial to Hamilton County's soldiers, this Beaux-Arts hall now hosts the American Classical Music Hall of Fame inside its 556-seat theater.",
      "source_url": "https://en.wikipedia.org/wiki/Hamilton_County_Memorial_Building"
    },
    {
      "name": "Cincinnati Music Hall",
      "address": "1241 Elm St",
      "zip": "45202",
      "description": "Completed in 1878 in soaring Venetian Gothic brick, this National Historic Landmark has been the year-round home of the Cincinnati Symphony, Opera, Ballet and Pops ever since.",
      "source_url": "https://en.wikipedia.org/wiki/Cincinnati_Music_Hall"
    },
    {
      "name": "Washington Park",
      "address": "1230 Elm St",
      "zip": "45202",
      "description": "Laid out in 1855 on ground that began as a pioneer burial ground, this is Cincinnati's second-oldest park and now Over-the-Rhine's front lawn, with a fountain and a bandstand in view of Music Hall.",
      "source_url": "https://en.wikipedia.org/wiki/Washington_Park_(Cincinnati,_Ohio)"
    },
    {
      "name": "Cincinnati Shakespeare Company",
      "address": "1195 Elm St",
      "zip": "45202",
      "description": "The city's resident professional Shakespeare troupe performs in the Otto M. Budig Theater here, its lobby windows looking straight out over Washington Park.",
      "source_url": "https://en.wikipedia.org/wiki/Cincinnati_Shakespeare_Company"
    },
    {
      "name": "Old St. Mary's Church",
      "address": "123 E 13th St",
      "zip": "45202",
      "description": "German immigrants hand-made the bricks and raised this Greek Revival church themselves in 1841 and 1842, and it still stands as the oldest church building in Cincinnati.",
      "source_url": "https://en.wikipedia.org/wiki/Old_St._Mary%27s_Church_(Cincinnati,_Ohio)"
    },
    {
      "name": "Ensemble Theatre Cincinnati",
      "address": "1127 Vine St",
      "zip": "45202",
      "description": "Founded in 1986 and now Greater Cincinnati's second-largest professional theatre, this stage has built its reputation on world and regional premieres of new work.",
      "source_url": "https://en.wikipedia.org/wiki/Ensemble_Theatre_Cincinnati"
    },
    {
      "name": "Graeter's Ice Cream",
      "address": "1401 Vine St",
      "zip": "45202",
      "description": "Cincinnati has made French Pot ice cream in small two-and-a-half-gallon batches since 1870, and this Vine Street scoop shop is where locals still argue over the flavor.",
      "source_url": "https://www.graeters.com/pages/retail-stores/over-the-rhine"
    },
    {
      "name": "Rhinegeist Brewery",
      "address": "1910 Elm St",
      "zip": "45202",
      "description": "This 1895 bottling hall built for the pre-Prohibition Christian Moerlein brewery reopened as Rhinegeist's taproom in 2013, with rooftop views back toward Findlay Market to end the walk.",
      "source_url": "https://en.wikipedia.org/wiki/Rhinegeist"
    }
  ]
}
$tgb$::jsonb);
