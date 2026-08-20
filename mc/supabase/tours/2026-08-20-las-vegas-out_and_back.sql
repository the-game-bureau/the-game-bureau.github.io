-- NFL walking tour: Las Vegas (Las Vegas Raiders fanbase city)
-- Date: 2026-08-20
-- Shape: out_and_back, 10 stops
-- Walk: about 1.5 miles, roughly 2 hours including time standing at each stop
-- Spine: Fremont Street, out west from Fremont East into the downtown casino core and back
-- Sports stop: Circa Resort (world's largest sportsbook); Binion's is the gaming-heritage stop (World Series of Poker, 1970)
-- Music stop: 11th Street Records (working record shop and studio)
-- Commercial ends: START at PublicUs (Fremont East coffee and bakery), END at Atomic Liquors (the oldest freestanding bar in town); the two are about two blocks apart
-- Reused waypoint: Atomic Liquors (already wpid 180) is linked to this path rather than duplicated
-- Drawn from published downtown and Fremont East walking guides plus each venue's own page (Fremont Street Experience, the Mob Museum, Golden Gate, Binion's, Circa, Golden Nugget)
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
  "city": "Las Vegas",
  "state": "NV",
  "title": "Gold, Games and Vinyl on Fremont Street",
  "shape": "out_and_back",
  "blurb": "Ninety minutes down old Fremont Street and back, from a downtown coffee counter to the oldest bar in town, past the world's largest sportsbook, a fire-breathing mantis and the corner where the World Series of Poker was born.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "PublicUs",
      "address": "1126 Fremont St",
      "zip": "89101",
      "description": "Meet up over pour-over coffee and house-made sourdough at this beloved Fremont East bakery cafe, then step out west along Fremont Street to begin the walk.",
      "source_url": "http://publicuslv.com/"
    },
    {
      "name": "Downtown Container Park",
      "address": "707 Fremont St",
      "zip": "89101",
      "description": "A shopping plaza built from stacked shipping containers, guarded out front by a forty-foot praying mantis that breathes fire after dark; wander the courtyard before carrying on toward the casino core.",
      "source_url": "https://en.wikipedia.org/wiki/Downtown_Container_Park"
    },
    {
      "name": "Golden Nugget",
      "address": "129 Fremont St",
      "zip": "89101",
      "description": "Step into the 1946 casino to find the Hand of Faith, the largest gold nugget ever pulled from the ground by metal detector, sitting in a case near the hotel lobby.",
      "source_url": "https://www.goldennugget.com/las-vegas/casino/hand-of-faith/"
    },
    {
      "name": "Binion's Gambling Hall",
      "address": "128 Fremont St",
      "zip": "89101",
      "description": "Benny Binion opened this Horseshoe in 1951 and hosted the very first World Series of Poker here in 1970, ten friends around one table, at the address that made the game famous.",
      "source_url": "https://www.binions.com/history.php"
    },
    {
      "name": "Golden Gate Hotel and Casino",
      "address": "1 Fremont St",
      "zip": "89101",
      "description": "The oldest hotel and casino in Las Vegas, open since 1906, where you can still order the deli's classic shrimp cocktail before you turn back east.",
      "source_url": "https://www.goldengatecasino.com/our-story/"
    },
    {
      "name": "Circa Resort and Casino",
      "address": "8 E Fremont St",
      "zip": "89101",
      "description": "The first ground-up resort built downtown since 1980, home to the world's largest sportsbook, a three-story wall of screens where the whole city seems to watch the game at once.",
      "source_url": "https://www.circalasvegas.com/sportsbook/"
    },
    {
      "name": "The Mob Museum",
      "address": "300 E Stewart Ave",
      "zip": "89101",
      "description": "Stand outside the 1933 former federal courthouse and post office, now the Mob Museum, where a 1950 Senate hearing on organized crime was gaveled to order in the courtroom upstairs.",
      "source_url": "https://en.wikipedia.org/wiki/Mob_Museum"
    },
    {
      "name": "Carson Kitchen",
      "address": "124 S 6th St",
      "zip": "89101",
      "description": "A corner restaurant that helped spark downtown's food revival, tucked on Carson Avenue; grab a plate of its famous crispy chicken skins before the last blocks back to Fremont.",
      "source_url": "https://www.carsonkitchen.com/"
    },
    {
      "name": "11th Street Records",
      "address": "1023 Fremont St",
      "zip": "89101",
      "description": "A working record shop and studio at the corner of Fremont and 11th, crate after crate of vinyl with a recording room in back where local bands cut tracks.",
      "source_url": "https://www.11thstreetrecords.net/"
    },
    {
      "name": "Atomic Liquors",
      "address": "917 E Fremont St",
      "zip": "89101",
      "description": "The oldest freestanding bar in Las Vegas, serving since 1952 on the first tavern liquor license in town; sit down, settle in, and end the walk where the neon has been on longest.",
      "source_url": "https://atomic.vegas/about/"
    }
  ]
}
$tgb$::jsonb);
