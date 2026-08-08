-- TGB NFL Tour Builder
-- City: Atlanta, GA (fanbase city of the Falcons; had zero rows in public.routes)
-- Date: 2026-08-08
-- Shape: out_and_back, 10 stops
-- Distance / time: roughly 1.3 miles round trip, about 1 hour 45 minutes including
--   time standing at each stop -- every stop sits within a few blocks of Centennial
--   Olympic Park.
-- Sports stop: stop 8, the College Football Hall of Fame (250 Marietta St NW).
-- Music stop: stop 7, the Tabernacle (152 Luckie St NW).
-- Commercial ends: stop 1, Jimmy Buffett's Margaritaville (start), and stop 10,
--   Hudson Grille Downtown (end) -- both sit at Marietta St and Centennial Olympic
--   Park Dr, a two-to-three-minute walk apart.
-- Drawn from: the published Centennial Olympic Park self-guided walking tour
--   (gpsmycity.com/tours/centennial-olympic-park-2337.html), Downtown Atlanta Inc's
--   self-guided walking tour of the Andrew Young International Blvd corridor
--   (downtownatlantainc.com/blog/self-guided-walking-tour-downtown-atlanta), and
--   individual venue listing pages for every address below.
-- Note: this out-and-back does not run down one single straight street. The "out"
--   leg follows Baker St / International Blvd along the park's north side to the
--   Pemberton Place cluster (Coca-Cola, Aquarium, Civil and Human Rights); the
--   "return" leg comes back one block south via Luckie St / Marietta St. Said so
--   here per the shape's own instruction to report the geometry actually built.
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
  check (shape is null or shape in ('loop', 'out_and_back', 'point_to_point')) not valid;

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
  if v_shape is null or v_shape not in ('loop', 'out_and_back', 'point_to_point') then
    raise exception 'shape must be loop, out_and_back or point_to_point (got %).', coalesce(v_shape, 'null');
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
  "city": "Atlanta",
  "state": "GA",
  "title": "Rings, Rock and a Really Big Helmet",
  "shape": "out_and_back",
  "blurb": "Ten stops along Centennial Olympic Park's edge, from a Jimmy Buffett bar to a 45-foot football helmet and the church-turned-concert-hall where Prince played, out past the aquarium and back a block over to a sports bar at the finish.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Jimmy Buffett's Margaritaville",
      "address": "155 Centennial Olympic Park Dr NW",
      "zip": "30303",
      "description": "A tiki-themed grill and bar anchoring the park's east side; grab a Landshark, find your group, and start whenever everyone has arrived.",
      "source_url": "https://www.margaritavilleatlanta.com/"
    },
    {
      "name": "Fountain of Rings",
      "address": "265 Park Ave W NW",
      "zip": "30313",
      "description": "The five interlocking rings built for the 1996 Olympics still run a choreographed water-and-music show every hour on the hour; catch a cycle before crossing the park's north lawn.",
      "source_url": "https://www.centennialpark.com/"
    },
    {
      "name": "World of Coca-Cola",
      "address": "121 Baker St NW",
      "zip": "30313",
      "description": "The eight-story red bottle marks the company's flagship museum, standing where its Atlanta story began in 1886; snap a photo at the entrance plaza and keep moving.",
      "source_url": "https://www.worldofcoca-cola.com/"
    },
    {
      "name": "Georgia Aquarium",
      "address": "225 Baker St NW",
      "zip": "30313",
      "description": "One of the largest aquariums on earth, its glass front wall painted with a whale shark mural you can see for free from the plaza; pause at the fountain out front.",
      "source_url": "https://www.georgiaaquarium.org/"
    },
    {
      "name": "National Center for Civil and Human Rights",
      "address": "100 Ivan Allen Jr Blvd NW",
      "zip": "30313",
      "description": "A copper-clad building holding the story of the American civil rights movement and the human rights fight it inspired worldwide; read the etched sidewalk wall, then turn back toward the park.",
      "source_url": "https://www.civilandhumanrights.org/"
    },
    {
      "name": "SkyView Atlanta",
      "address": "168 Luckie St NW",
      "zip": "30303",
      "description": "A 20-story Ferris wheel circles the downtown skyline in climate-controlled gondolas; look up for the view even if you do not ride.",
      "source_url": "https://www.skyviewatlanta.com/"
    },
    {
      "name": "The Tabernacle",
      "address": "152 Luckie St NW",
      "zip": "30303",
      "description": "A 1911 Baptist church turned 2,600-capacity concert hall that has hosted everyone from the Rolling Stones to Prince; check the marquee to see who is playing tonight.",
      "source_url": "https://www.tabernacleatl.com/"
    },
    {
      "name": "College Football Hall of Fame",
      "address": "250 Marietta St NW",
      "zip": "30313",
      "description": "A 45-foot helmet wall and a full-size playing field mark the sport's shrine to its greatest players and coaches; the lobby and gift shop are free to step into without a ticket.",
      "source_url": "https://www.cfbhall.com/"
    },
    {
      "name": "CNN Center",
      "address": "190 Marietta St NW",
      "zip": "30303",
      "description": "The glass atrium where Ted Turner's cable news network has broadcast since 1987 rises eight stories around a bank of escalators; step into the lobby for a look at the newsroom set.",
      "source_url": "https://discoveratlanta.com/things-to-do/attractions/cnn-center/"
    },
    {
      "name": "Hudson Grille Downtown",
      "address": "120 Marietta St",
      "zip": "30303",
      "description": "A sports bar built for exactly this walk's ending, wall-to-wall TVs and a menu of wings and burgers a couple of minutes from where you started; order something and put your feet up.",
      "source_url": "https://hudsongrille.com/downtown"
    }
  ]
}
$tgb$::jsonb);
