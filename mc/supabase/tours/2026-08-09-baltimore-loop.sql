-- TGB NFL Tour Builder
-- City: Baltimore, MD (fanbase city of the Ravens); had zero rows in public.routes
-- Date: 2026-08-09
-- Shape: loop, 10 stops
-- Distance / time: roughly 2.1 miles round trip, about 1 hour 45 minutes including
--   time standing at each stop.
-- Sports stop: stop 2, the Babe Ruth statue "Babe's Dream" at Camden Yards's Eutaw
--   Street gate (333 W Camden St).
-- Music stop: stop 4, the Hippodrome Theatre at the France-Merrick Performing Arts
--   Center (12 N Eutaw St).
-- Commercial ends: stop 1, Pickles Pub (start, 520 Washington Blvd) and stop 10,
--   Pratt Street Ale House (end, 206 W Pratt St) -- both a block or two off Camden
--   Yards and about a five-minute walk apart.
-- Drawn from: walkntours.com's "Baltimore Best, Poe, Ruth and History" self-guided
--   walking tour (same footprint -- Babe Ruth/Camden Yards, Bromo Seltzer Tower,
--   Westminster Hall, Poe's grave, Lexington Market), Visit Baltimore's "A Tour of
--   Bromo Tower Arts & Entertainment District" (Bromo Tower, Everyman Theatre,
--   Hippodrome, Westminster Hall, Lexington Market), and individual venue/history
--   pages for every address and fact below.
-- Note: this loop runs past the usual 5-8 minutes between stops in two places --
--   the walk north from Camden Yards up Eutaw Street to the Bromo Arts District
--   (about 9 minutes) and the walk back south from the Fayette/Greene cluster down
--   to Otterbein (about 9 minutes) -- because the required sports stop (the
--   ballpark) and the required music stop (the Hippodrome) sit in genuinely
--   different pockets of Baltimore's west side, and no closer verified, distinct
--   stop bridges them. Total walking distance runs over the shape's 1.5-mile
--   guideline as a result; every address below is still real and independently
--   verified. Outbound follows Eutaw Street north from the ballpark; the return
--   comes back via Fayette and Greene Streets and south to Conway/Pratt, so the
--   outbound pavement is never retraced.
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
  "city": "Baltimore",
  "state": "MD",
  "title": "The Babe, the Bromo and the Bricks",
  "shape": "loop",
  "blurb": "A two-hour loop through Baltimore's west side, from the ballpark where the Babe once played hooky to the churchyard where Poe finally got a headstone, by way of a clock tower that used to wear a giant blue bottle.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Pickles Pub",
      "address": "520 Washington Blvd",
      "zip": "21230",
      "description": "This rowhouse bar a block from Camden Yards has been game-day headquarters since 1988, its walls shingled floor to ceiling in pickle-labeled dollar bills; grab a Natty Boh, find your group, and start the walk here.",
      "source_url": "https://baltimore.org/listings/pickles-pub/"
    },
    {
      "name": "Babe Ruth Statue at Camden Yards",
      "address": "333 W Camden St",
      "zip": "21201",
      "description": "This bronze Babe Ruth, unveiled on his 100th birthday in 1995, stands at the Eutaw Street gate just yards from the saloon his father ran on this same ground before baseball ever heard of the kid.",
      "source_url": "https://en.wikipedia.org/wiki/Babe%27s_Dream"
    },
    {
      "name": "Bromo Seltzer Arts Tower",
      "address": "21 S Eutaw St",
      "zip": "21201",
      "description": "This 1911 clock tower, modeled on Florence's Palazzo Vecchio, once wore a 51-foot rotating Bromo-Seltzer bottle that came down in 1936; look up at its four glass faces, which spell out B-R-O-M-O S-E-L-T-Z-E-R instead of numbers.",
      "source_url": "https://www.bromoseltzertower.com/about"
    },
    {
      "name": "Hippodrome Theatre",
      "address": "12 N Eutaw St",
      "zip": "21201",
      "description": "Opened in 1914 as a vaudeville and movie palace, the Hippodrome still brings touring Broadway shows and concerts back under its restored gilded arch; check the marquee for what is playing tonight.",
      "source_url": "https://www.france-merrickpac.com/"
    },
    {
      "name": "Lexington Market",
      "address": "400 W Lexington St",
      "zip": "21201",
      "description": "Trading continuously since 1782, this is one of the oldest public markets in the country and still packed stall to stall under one roof; grab something to eat here, you are about halfway through the walk.",
      "source_url": "https://en.wikipedia.org/wiki/Lexington_Market"
    },
    {
      "name": "Westminster Hall and Burying Ground",
      "address": "519 W Fayette St",
      "zip": "21201",
      "description": "Edgar Allan Poe was buried in an unmarked grave in the back of this churchyard in 1849, and was not moved to the marble monument at this corner until Baltimore schoolchildren raised the money for it 26 years later.",
      "source_url": "https://www.westminsterhall.org/about"
    },
    {
      "name": "National Museum of Dentistry",
      "address": "31 S Greene St",
      "zip": "21201",
      "description": "The world's first dental college opened classes on this corner in 1840, and its small museum next door still displays a set of George Washington's real dentures - ivory, gold and lead, never wood.",
      "source_url": "https://www.dentalmuseum.com/visit/"
    },
    {
      "name": "Everyman Theatre",
      "address": "315 W Fayette St",
      "zip": "21201",
      "description": "This Beaux-Arts hall opened in 1910 as the vaudeville-era Empire Theatre, spent a stretch gutted as a parking garage, and became a movie house before Everyman Theatre bought it for one dollar in 2010 and reopened it as their stage.",
      "source_url": "https://en.wikipedia.org/wiki/Everyman_Theatre,_Baltimore"
    },
    {
      "name": "Old Otterbein Church",
      "address": "112 W Conway St",
      "zip": "21201",
      "description": "Raised in 1785 by a German congregation under Philip William Otterbein, this is the oldest church building still standing in Baltimore, and the room where the United Brethren denomination was organized four years later.",
      "source_url": "https://en.wikipedia.org/wiki/Otterbein_Church_(Baltimore)"
    },
    {
      "name": "Pratt Street Ale House",
      "address": "206 W Pratt St",
      "zip": "21201",
      "description": "Housed in an 1888 storefront two blocks from the ballpark, this is Baltimore's oldest still-running brewpub, pouring its own Oliver Ales since 1993; settle in, order something dark, and call the walk finished.",
      "source_url": "https://www.prattstreetalehouse.com/"
    }
  ]
}
$tgb$::jsonb);
