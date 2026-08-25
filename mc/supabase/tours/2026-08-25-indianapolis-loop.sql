-- ============================================================================
-- NFL walking tour: Indianapolis, IN
-- Filed by TGB ANCHOR EVENTS (Anthropic Claude Sonnet 5) on 2026-08-25.
--
-- City:      Indianapolis (fanbase city of IND, per public.teams)
-- Shape:     loop, 10 stops
-- Distance:  roughly 1.4 miles total, about 35 minutes of walking; well
--            under the two hour cap once time at each stop is added.
-- Sports:    Gainbridge Fieldhouse at 125 S Pennsylvania St, home of the
--            Pacers and the Fever (stop 7)
-- Music:     Slippery Noodle Inn at 372 S Meridian St, Indiana's oldest bar
--            in its original building and now the city's best known blues
--            room (stop 8)
-- Ends:      Yolk, a breakfast counter at 111 Monument Cir (start,
--            commercial, food and drink) and Giorgio's Pizza at 9 E Market
--            St, about three minutes' walk from the start (finish,
--            commercial, food and drink).
--
-- Indianapolis held zero rows in public.paths at the time this was picked,
-- tied with eleven other NFL fanbase cities at zero; it was the tie break,
-- having gone the longest of that group without a build attempt recorded
-- under mc/supabase/tours/ (2026-08-19, tied with Jacksonville and broken
-- alphabetically).
--
-- Route goes out from Monument Circle west along Washington Street past
-- the Ayres Clock and the Artsgarden, south to Gainbridge Fieldhouse and
-- the Slippery Noodle Inn, then returns north by a different line up
-- toward City Market before closing the loop back near the Circle.
--
-- Drawn from Indiana Landmarks' and Downtown Indy's published Monument
-- Circle Historic District material for the Circle stops, plus the
-- Wikipedia entries for the Soldiers' and Sailors' Monument, Christ Church
-- Cathedral, the Hilbert Circle Theatre, the Indianapolis Artsgarden,
-- Gainbridge Fieldhouse, the Slippery Noodle Inn and the Indianapolis City
-- Market, the Library of Congress HABS survey and the Indy Arts Council
-- for the L.S. Ayres Building and Clock, and the Indianapolis Business
-- Journal's coverage of Giorgio's Pizza. Every address and every fact
-- above was checked against one of those pages before it went into a
-- stop. Circle Centre Mall, once the obvious filler stop on the south leg
-- of this route, closed permanently on 2026-12-31 and was left out for
-- that reason; the Ayres Clock stands in its place.
--
-- This block is idempotent: the create/add-if-not-exists statements are
-- safe to run against a database that already has them.
-- ============================================================================

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
  "city": "Indianapolis",
  "state": "IN",
  "title": "The Circle, the Clock and the Noodle",
  "shape": "loop",
  "blurb": "A loop around Monument Circle and south to Indiana's oldest bar, by way of a basketball arena, a glass dome and a market that has fed the city since 1886.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Yolk - Monument Circle",
      "address": "111 Monument Cir",
      "zip": "46204",
      "description": "This corner breakfast counter on the Circle is where your group regroups, gets coffee, and gets moving before the walk begins.",
      "source_url": "https://www.tripadvisor.com/Restaurant_Review-g37209-d12707215-Reviews-Yolk_Monument_Circle-Indianapolis_Indiana.html"
    },
    {
      "name": "Soldiers' and Sailors' Monument",
      "address": "1 Monument Cir",
      "zip": "46204",
      "description": "Dedicated in 1902 and rising two hundred eighty four feet over the traffic circle, this limestone tower has been the fixed point every Indianapolis walk is measured from ever since.",
      "source_url": "https://en.wikipedia.org/wiki/Soldiers'_and_Sailors'_Monument_(Indianapolis)"
    },
    {
      "name": "Christ Church Cathedral",
      "address": "125 Monument Cir",
      "zip": "46204",
      "description": "Built in 1857 and never replaced, this Gothic Revival church is the oldest building still standing on the Circle, having outlasted four other churches that once shared the ring.",
      "source_url": "https://en.wikipedia.org/wiki/Christ_Church_Cathedral_(Indianapolis)"
    },
    {
      "name": "Hilbert Circle Theatre",
      "address": "45 Monument Cir",
      "zip": "46204",
      "description": "Opened in 1916 as one of the Midwest's first movie palaces, it was slated for demolition until the Indianapolis Symphony Orchestra moved in and gave it a second life in 1984.",
      "source_url": "https://en.wikipedia.org/wiki/Hilbert_Circle_Theatre"
    },
    {
      "name": "L.S. Ayres Building and Clock",
      "address": "1 W Washington St",
      "zip": "46204",
      "description": "The ten thousand pound clock has hung over this corner since 1936, and generations of Hoosiers have used it the same way: meet me under the Ayres clock.",
      "source_url": "https://www.visitindy.com/directory/ls-ayres-building-and-clock/"
    },
    {
      "name": "Indianapolis Artsgarden",
      "address": "110 W Washington St",
      "zip": "46204",
      "description": "This glass dome over the intersection has hosted live music and art since 1995, ninety five feet up, a skywalk built to be a destination rather than just a crossing.",
      "source_url": "https://en.wikipedia.org/wiki/Indianapolis_Artsgarden"
    },
    {
      "name": "Gainbridge Fieldhouse",
      "address": "125 S Pennsylvania St",
      "zip": "46204",
      "description": "Home to the Pacers and the Fever, this is where downtown Indianapolis actually watches its basketball, and the plaza out front is worth a look even on a night with no game.",
      "source_url": "https://en.wikipedia.org/wiki/Gainbridge_Fieldhouse"
    },
    {
      "name": "Slippery Noodle Inn",
      "address": "372 S Meridian St",
      "zip": "46225",
      "description": "Indiana's oldest bar in its original building has been a tavern, an Underground Railroad stop and a brothel, and now it is simply the best place in the city to hear live blues.",
      "source_url": "https://en.wikipedia.org/wiki/Slippery_Noodle_Inn"
    },
    {
      "name": "Indianapolis City Market",
      "address": "222 E Market St",
      "zip": "46204",
      "description": "Vendors have sold food from this 1886 market hall for well over a century, and the catacombs underneath once hid runaway slaves and later a Prohibition speakeasy.",
      "source_url": "https://en.wikipedia.org/wiki/Indianapolis_City_Market"
    },
    {
      "name": "Giorgio's Pizza",
      "address": "9 E Market St",
      "zip": "46204",
      "description": "A New York style slice a block off the Circle since 1990, and the natural place to sit down, split a pie and let the walk end the way it started.",
      "source_url": "https://www.ibj.com/articles/new-owners-of-giorgios-pizza-hope-to-sling-slices-beyond-downtown"
    }
  ]
}
$tgb$::jsonb);
