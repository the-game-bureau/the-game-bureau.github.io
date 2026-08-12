-- TGB NFL Tour Builder
-- City: Cincinnati, OH (fanbase city of the Bengals); had zero rows in public.routes
-- Date: 2026-08-12
-- Shape: out_and_back, 10 stops
-- Distance / time: roughly 1.4 miles round trip, about 60 minutes including time
--   standing at each stop.
-- Sports stop: stop 2, Great American Ball Park (100 Joe Nuxhall Way), home of the
--   Cincinnati Reds.
-- Music stop: stop 7, the Taft Theatre (317 E 5th St).
-- Commercial ends: stop 1, Cincinnati Lager House (start, 115 Joe Nuxhall Way) and
--   stop 10, Holy Grail Tavern & Grille (end, 161 Joe Nuxhall Way) -- both at The
--   Banks, across the street from the ballpark and a two-minute walk apart.
-- Drawn from: GPSmyCity's "Cincinnati Introduction Walking Tour" (Fountain Square,
--   Smale Riverfront Park, Great American Ball Park footprint), and individual
--   venue/history pages for every address and fact below -- the Ingalls Building,
--   Carew Tower, the Cincinnatian Hotel, Great American Tower at Queen City Square
--   and the Roebling Bridge/Smale Riverfront Park are each independently documented
--   downtown landmarks rather than pulled from one single published itinerary.
-- Note: the walk runs out from the riverfront up Vine Street to its 6th Street
--   turnaround (stops 1-5), then returns south one block over via Sycamore Street
--   past Queen City Square before closing back out along the riverfront to The
--   Banks (stops 6-10), so the return covers different pavement from the outbound
--   leg except for the short pivot between Fountain Square and the Cincinnatian
--   Hotel at the top of the walk.
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
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The route needs a city.'; end if;
  if v_title is null then raise exception 'The route needs a title.'; end if;
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The route needs a non-empty stops array.';
  end if;

  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.routes (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'route'::text, null::integer, v_title, v_tour_id, v_shape;

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
  "title": "From the Diamond to the Tiara",
  "shape": "out_and_back",
  "blurb": "An hour along Cincinnati's riverfront and up into downtown, from a Reds-day pregame brewpub past the world's first concrete skyscraper to the city's Art Deco crown and back for a drink at The Banks.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Cincinnati Lager House",
      "address": "115 Joe Nuxhall Way",
      "zip": "45202",
      "description": "A riverfront brewpub built on the site of the old Christian Moerlein brewery; get a house lager, find your group, and start here before the walk turns uphill into downtown.",
      "source_url": "https://cincylagerhouse.com/"
    },
    {
      "name": "Great American Ball Park",
      "address": "100 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Home of the Cincinnati Reds, baseball's oldest professional franchise, dating to 1869; watch for the two rotating riverboat smokestacks that mark a Reds home run.",
      "source_url": "https://en.wikipedia.org/wiki/Great_American_Ball_Park"
    },
    {
      "name": "Ingalls Building",
      "address": "6 E 4th St",
      "zip": "45202",
      "description": "Completed in 1903, this is the world's first reinforced-concrete skyscraper, and engineers were so unsure it would stand that a reporter was stationed outside to watch it fall.",
      "source_url": "https://en.wikipedia.org/wiki/Ingalls_Building"
    },
    {
      "name": "Fountain Square",
      "address": "520 Vine St",
      "zip": "45202",
      "description": "Cincinnati's civic gathering spot since 1871, centered on the bronze Tyler Davidson Fountain, The Genius of Water, still the city's best-known symbol.",
      "source_url": "https://en.wikipedia.org/wiki/Tyler_Davidson_Fountain"
    },
    {
      "name": "Cincinnatian Hotel",
      "address": "601 Vine St",
      "zip": "45202",
      "description": "Opened in 1882 as The Palace, this Second Empire hotel was once Cincinnati's tallest building and shares an architect with Music Hall and City Hall; this is the turn, head back south from here.",
      "source_url": "https://en.wikipedia.org/wiki/Cincinnatian_Hotel"
    },
    {
      "name": "Carew Tower",
      "address": "441 Vine St",
      "zip": "45202",
      "description": "This 1930 Art Deco tower was Cincinnati's tallest building for eighty years and still frames Fountain Square with its stepped, gilded crown.",
      "source_url": "https://en.wikipedia.org/wiki/Carew_Tower"
    },
    {
      "name": "Taft Theatre",
      "address": "317 E 5th St",
      "zip": "45202",
      "description": "A 1928 Art Deco theater built into the Masonic Temple Building, still booking touring musicians and comedians on the same stage it has hosted for nearly a century.",
      "source_url": "https://en.wikipedia.org/wiki/Taft_Theatre"
    },
    {
      "name": "Great American Tower at Queen City Square",
      "address": "301 E 4th St",
      "zip": "45202",
      "description": "Cincinnati's tallest building, topped in 2011 by a lit glass tiara meant to nod at the city's Queen City nickname and visible from nearly every other stop on this walk.",
      "source_url": "https://en.wikipedia.org/wiki/Great_American_Tower_at_Queen_City_Square"
    },
    {
      "name": "Smale Riverfront Park",
      "address": "100 W Mehring Way",
      "zip": "45202",
      "description": "A riverfront park built where rail yards once stood, with a clear view of the 1866 John A. Roebling Suspension Bridge, the design proving ground for the Brooklyn Bridge.",
      "source_url": "https://www.cincinnati-oh.gov/cincyparks/visit-a-park/find-a-parkfacility/smale-riverfront-park/"
    },
    {
      "name": "Holy Grail Tavern & Grille",
      "address": "161 Joe Nuxhall Way",
      "zip": "45202",
      "description": "A sports bar built into a converted rail viaduct at The Banks, directly across from the ballpark; end the walk here with a table and a drink.",
      "source_url": "https://www.holygrailbanks.com/"
    }
  ]
}
$tgb$::jsonb);
