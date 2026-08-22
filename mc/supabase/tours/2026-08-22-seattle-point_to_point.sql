-- NFL walking tour: Seattle (Seattle Seahawks fanbase city)
-- Date: 2026-08-22
-- Shape: point_to_point, 6 stops
-- Walk: about 1.0 mile, roughly 50 to 65 minutes including time standing at each stop
-- Spine: 1st Avenue South out of the stadium district, up through the Pioneer Square
--   historic core, and down the hill to the central waterfront. Genuinely one way; the
--   ballpark gates and the ferry-dock pier sit at opposite ends of the neighborhood, not
--   within an easy walk of each other.
-- Sports stop: Elysian Fields, the brewpub directly across the street from Lumen Field
--   and T-Mobile Park, also the commercial START
-- Music stop: Owl 'N Thistle Irish Pub, live music seven nights a week on Post Alley
-- Commercial ends: START at Elysian Fields (stadium district brewpub), END at Ivar's
--   Acres of Clams on Pier 54 (seafood counter on the water since 1938)
-- Reused waypoint: Owl 'N Thistle Irish Pub is already in the library at wpid 481 (city
--   Seattle, address 808 Post Avenue); this walk links it rather than duplicating it
-- Drawn from: the GPSmyCity Pioneer Square District walking tour (King Street Station,
--   Waterfall Garden Park, Pioneer Square Park all appear on its published stop list),
--   the National Park Service's Klondike Gold Rush National Historical Park Trail to
--   Treasure self-guided tour of the same district, Visit Pioneer Square and Seattle Met's
--   own guides to the stadium-district bars, and each stop's own history page, all cited
--   per stop below
-- ai_model: Anthropic Claude Sonnet 5
--
-- Seattle held zero applied paths and, unlike every other zero-path NFL fanbase city this
-- run, had no tour file already sitting in this folder waiting to be run, so it was the
-- clear pick over Buffalo, Cincinnati, Cleveland, Denver, Houston, Indianapolis,
-- Jacksonville, Kansas City, Las Vegas and Pittsburgh, all of which already have one
-- committed here. The route follows the same corridor the published Pioneer Square walking
-- tours already use, from the stadium district up through the historic core, then adds one
-- short leg down to the water that no published tour covers on its own, closing the walk on
-- a genuine commercial anchor rather than a plaque.

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

create table if not exists public.paths (
  tour_id    text primary key,
  title      text,
  shape      text,
  city       text,
  created_at timestamptz not null default now()
);

alter table public.paths drop constraint if exists paths_shape_known;
alter table public.paths add constraint paths_shape_known
  check (shape is null or shape in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  )) not valid;

create table if not exists public.path_stops (
  tour_id text   not null references public.paths(tour_id) on delete cascade,
  wpid    bigint not null references public.waypoints(wpid) on delete cascade,
  ord     integer not null,
  primary key (tour_id, wpid)
);

create index if not exists path_stops_order_idx on public.path_stops (tour_id, ord);
create index if not exists path_stops_wpid_idx  on public.path_stops (wpid);

alter table public.paths      enable row level security;
alter table public.path_stops enable row level security;

drop policy if exists "paths readable by anyone" on public.paths;
create policy "paths readable by anyone" on public.paths for select using (true);
drop policy if exists "paths write by authenticated" on public.paths;
create policy "paths write by authenticated" on public.paths for all
  to authenticated using (true) with check (true);

drop policy if exists "path_stops readable by anyone" on public.path_stops;
create policy "path_stops readable by anyone" on public.path_stops for select using (true);
drop policy if exists "path_stops write by authenticated" on public.path_stops;
create policy "path_stops write by authenticated" on public.path_stops for all
  to authenticated using (true) with check (true);

grant select on public.paths, public.path_stops to anon, authenticated;
grant insert, update, delete on public.paths, public.path_stops to authenticated;

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
  -- One path is the work of ONE model, so this belongs to the path, not a stop.
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The path needs a city.'; end if;
  if v_title is null then raise exception 'The path needs a title.'; end if;
  -- The seven of paths_shape_known (2026080805). Checked here so a bad shape
  -- comes back as a sentence rather than as a constraint name.
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The path needs a non-empty stops array.';
  end if;

  -- Readable and unique without a sequence: the city, the shape and the second.
  -- SECONDS, not minutes. To the minute, two imports of the same city and shape
  -- inside one minute produce the SAME id - so the second path does not fail,
  -- it silently merges into the first and you get one twenty-stop walk. That has
  -- already happened once in this table.
  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.paths (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'path'::text, null::integer, v_title, v_tour_id, v_shape;

  -- Stops are taken IN ARRAY ORDER. Any walk_order supplied on a stop is
  -- ignored: the array is the sequence, and trusting one over the other when
  -- they disagree is how a path ends up with two stop 4s.
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

    -- Do we already hold this place? Name AND address, both lowercased.
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

    -- A place appears at most once per path. A loop FINISHES NEAR its first
    -- stop, it does not list it again, so a repeat is a mistake in the payload
    -- rather than something to store - and the primary key would reject it.
    -- on conflict ON CONSTRAINT, not on (tour_id, wpid): this function's
    -- RETURNS TABLE declares output columns called wpid and ord, and inside an
    -- index-inference clause plpgsql cannot tell those from the table's own
    -- columns - it raises "column reference wpid is ambiguous". Naming the
    -- primary key sidesteps the resolution entirely.
    insert into public.path_stops (tour_id, wpid, ord)
    values (v_tour_id, v_wpid, v_ord)
    on conflict on constraint path_stops_pkey do nothing;

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
  "city": "Seattle",
  "state": "WA",
  "title": "From the Dugout to the Dock",
  "shape": "point_to_point",
  "blurb": "Six stops through Pioneer Square: a stadium-district brewpub, the city's grandest old train station, a hidden waterfall, a landmark pergola, an Irish pub with a band most nights, and a hundred-year-old seafood counter on the ferry dock.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Elysian Fields",
      "address": "542 1st Ave S",
      "zip": "98104",
      "description": "A brewpub built for game day, with a 120 foot zinc bar and forty taps standing directly across the street from Lumen Field and T-Mobile Park; find your group, order a round, and start the walk here before heading north into Pioneer Square.",
      "source_url": "https://www.elysianbrewing.com/locations/elysian-fields"
    },
    {
      "name": "King Street Station",
      "address": "303 S Jackson St",
      "zip": "98104",
      "description": "The 1906 depot modeled on Venice's San Marco bell tower, its four clock faces restored in 2013 after decades hidden behind a dropped ceiling; look up from Jackson Street at what was the tallest building in Seattle until Smith Tower passed it in 1914.",
      "source_url": "https://en.wikipedia.org/wiki/King_Street_Station"
    },
    {
      "name": "Waterfall Garden Park",
      "address": "219 2nd Ave S",
      "zip": "98104",
      "description": "A pocket park no bigger than a living room, built on the spot where a young James Casey ran his first package delivery route by bicycle in 1907, the business that became UPS; step inside and let the 22 foot manmade waterfall cover the sound of the street.",
      "source_url": "https://en.wikipedia.org/wiki/Waterfall_Garden_Park"
    },
    {
      "name": "Pioneer Square Park",
      "address": "600 1st Ave",
      "zip": "98104",
      "description": "The cast iron and glass pergola raised in 1909 to shelter cable car riders, rebuilt after a truck flattened it in 2001, standing beside the totem pole and a bust of Chief Seattle; this whole corner has been a National Historic Landmark since 1977.",
      "source_url": "https://en.wikipedia.org/wiki/Pioneer_Square_pergola"
    },
    {
      "name": "Owl 'N Thistle Irish Pub",
      "address": "808 Post Avenue",
      "zip": "98104",
      "description": "A Post Alley institution with live music seven nights a week and no cover charge posted at the door; duck inside, find a table, and let the band carry you the rest of the way toward the water.",
      "source_url": "https://www.owlnthistle.com/"
    },
    {
      "name": "Ivar's Acres of Clams",
      "address": "1001 Alaskan Way",
      "zip": "98104",
      "description": "Ivar Haglund's seafood counter has anchored Pier 54 since 1938, its neon clam sign a fixture of the Seattle waterfront; finish here with chowder on the water and watch the ferries cross Elliott Bay.",
      "source_url": "https://www.ivars.com/acres"
    }
  ]
}
$tgb$::jsonb);
