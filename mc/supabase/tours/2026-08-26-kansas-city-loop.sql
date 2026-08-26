-- TGB NFL Tour Builder
-- City: Kansas City, MO (fanbase city of the Chiefs)
-- Date: 2026-08-26
-- Shape: loop, 10 stops
-- Distance / time: roughly 1.1 miles round trip, about 80 to 90 minutes
--   including time standing at each stop.
-- Sports stop: stop 7, Municipal Auditorium (301 W 13th St), which hosted the
--   Big Eight basketball tournament every winter from 1946 to 1978 and has
--   staged more NCAA Final Fours than any other building in the country.
-- Music stop: stop 6, the Folly Theater (300 W 12th St), Kansas City's oldest
--   surviving theater, opened in 1900 and still running its own Folly Jazz
--   Series today.
-- Commercial ends: stop 1, The Savoy (start, 219 W 9th St, dining room open
--   since 1903 in the old Savoy Hotel) and stop 10, Mildred's (end, 908
--   Baltimore Ave, a coffee counter in the historic La Rue Building), both in
--   the Historic 9th Street / Library District and about a two-minute walk
--   apart.
-- Route: out along 9th and 10th, south through the Library District to the
--   Folly, Municipal Auditorium and the Power and Light Building at 14th and
--   Baltimore, then back north the whole way up Baltimore Avenue to the
--   start, so the outbound and return legs use different streets.
-- Drawn from: the Kansas City Public Library / Jackson County Historical
--   Society's "Change without Direction: A Guide to Downtown Kansas City"
--   VoiceMap tour (Central Library, New York Life Building, Old New England
--   Building, The Savoy); the PocketSights "Library District Walking Tour"
--   of the twenty-two commercial buildings between Main, Baltimore, 9th and
--   10th; and Wikipedia's own entries for the Folly Theater, Municipal
--   Auditorium, the Kansas City Power and Light Building and the Kansas City
--   Club Building, all cited per stop below.
-- Written by: Anthropic Claude Sonnet 5
--
-- Kansas City had zero rows in public.paths. Buffalo, Cincinnati, Cleveland,
-- Denver, Houston, Indianapolis, Jacksonville, Kansas City, Las Vegas,
-- Pittsburgh, San Francisco and Seattle were the only NFL fanbase cities with
-- no route at all; each already carried a committed but unapplied file in
-- this folder, so the tie was broken on the most recently dated file per
-- city, oldest first. Kansas City and Las Vegas were both last built on
-- 2026-08-20, and Kansas City comes first alphabetically.
-- This is Kansas City's second file (see 2026-08-20-kansas-city-point_to_point.sql,
-- a six-stop point-to-point through the 18th and Vine Jazz District). This
-- loop deliberately covers different ground: the Library District, theater
-- row and the Baltimore Avenue corridor between 9th and 14th, so nothing
-- here repeats a stop from that earlier file. The Peanut on Main Street, the
-- only existing waypoint on file for Kansas City, sits well outside this
-- district and was left off rather than forced in.

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

-- Seven shapes since 2026080805. This block DROPS and re-adds the constraint,
-- so a stale copy here would quietly narrow it again the next time somebody
-- pastes this helper - keep it in step with the migration.
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
  "city": "Kansas City",
  "state": "MO",
  "title": "Marble, Jazz and the Big Eight",
  "shape": "loop",
  "blurb": "A mile long loop through Kansas City's Library District and theater row, from a century old dining room to a coffee counter around the corner, taking in a bronze eagle, an Art Deco arena and the Folly's own jazz stage along the way.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "The Savoy",
      "address": "219 W 9th St",
      "zip": "64105",
      "description": "This dining room has served Kansas City since 1903, inside the old Savoy Hotel; get a table, meet your group and start the walk from here.",
      "source_url": "https://www.thesavoykc.com/"
    },
    {
      "name": "Old New England Building",
      "address": "112 W 9th St",
      "zip": "64105",
      "description": "Built in 1886 for the New England Safe Deposit and Trust Company, this bay windowed office block is believed to be Kansas City's first fireproof building; look up at the two story oriel window before moving on.",
      "source_url": "https://en.wikipedia.org/wiki/Old_New_England_Building"
    },
    {
      "name": "New York Life Building",
      "address": "20 W 9th St",
      "zip": "64105",
      "description": "Kansas City's first skyscraper with elevators, finished in 1889, still carries Louis Saint Gaudens' bronze eagle over its door, wings spread to protect two eaglets from a snake; find the eagle above the entrance.",
      "source_url": "https://en.wikipedia.org/wiki/New_York_Life_Building_(Kansas_City,_Missouri)"
    },
    {
      "name": "Kansas City Public Library, Central Branch",
      "address": "14 W 10th St",
      "zip": "64105",
      "description": "The library moved into this 1906 bank building in 2004 and turned its parking garage into a wall of ten foot book spines; read a few of the titles on the Community Bookshelf before heading south.",
      "source_url": "https://kclibrary.org/locations/central"
    },
    {
      "name": "Hotel Phillips",
      "address": "106 W 12th St",
      "zip": "64105",
      "description": "Harry Truman ran a haberdashery on this corner before the 1931 Art Deco tower went up in its place; step into the lobby and find the eleven foot Goddess of Dawn sculpture.",
      "source_url": "https://en.wikipedia.org/wiki/Hotel_Phillips"
    },
    {
      "name": "Folly Theater",
      "address": "300 W 12th St",
      "zip": "64105",
      "description": "Opened in 1900 and known ever since as the Grand Old Lady of Twelfth Street, this is Kansas City's oldest surviving theater and still runs its own Folly Jazz Series; check the marquee for who is playing tonight.",
      "source_url": "https://en.wikipedia.org/wiki/Folly_Theater"
    },
    {
      "name": "Municipal Auditorium",
      "address": "301 W 13th St",
      "zip": "64105",
      "description": "This 1935 arena hosted the Big Eight basketball tournament every winter from 1946 to 1978 and has staged more NCAA Final Fours than any other building in the country; stand under its Art Deco entrance and picture the crowds.",
      "source_url": "https://en.wikipedia.org/wiki/Municipal_Auditorium_(Kansas_City,_Missouri)"
    },
    {
      "name": "Kansas City Power and Light Building",
      "address": "1330 Baltimore Ave",
      "zip": "64105",
      "description": "Missouri's tallest building when it opened in 1931, its Art Deco crown still glows red orange over downtown every night; look straight up at the lantern before turning north.",
      "source_url": "https://en.wikipedia.org/wiki/Kansas_City_Power_and_Light_Building"
    },
    {
      "name": "Hotel Kansas City",
      "address": "1228 Baltimore Ave",
      "zip": "64105",
      "description": "Harry Truman and Dwight Eisenhower both belonged to the private club that built this 1922 clubhouse, complete with a bowling alley and a pool on the thirteenth floor; the old champagne bar is now the hotel's Lobby Bar, worth a look inside.",
      "source_url": "https://en.wikipedia.org/wiki/Kansas_City_Club_Building"
    },
    {
      "name": "Mildred's",
      "address": "908 Baltimore Ave",
      "zip": "64105",
      "description": "This coffee counter in the old La Rue Building anchors the Historic Ninth Street District; get a coffee, sit down and compare notes on the walk you just finished.",
      "source_url": "https://www.mildredskc.com/locations"
    }
  ]
}
$tgb$::jsonb);
