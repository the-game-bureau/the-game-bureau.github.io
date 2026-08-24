-- NFL walking tour: Cleveland (Cleveland Browns fanbase city)
-- Date: 2026-08-23
-- Shape: loop, 10 stops
-- Walk: about 1.5 to 1.6 miles, roughly 100 to 110 minutes including time standing at
--   each stop. The two longest legs, Flannery's to the ballpark and the arena back up to
--   Public Square, each run about 7 to 8 minutes; every other leg is 2 to 5 minutes. That
--   is a touch over the loop's 1.5 mile target, stretched deliberately to reach a genuine
--   downtown sports stop rather than dropping one; every leg still holds inside the 8
--   minute per-stop ceiling.
-- Route: out along East 4th/Ontario to the Gateway sports complex, back up Ontario to
--   Public Square, then east along Euclid Avenue to the Arcade and back down East 4th.
--   The outbound and return legs use different streets on purpose.
-- Sports stops: Progressive Field's Heritage Park statue plaza, and Rocket Arena next
--   door (where the Cavaliers won Cleveland's first major title in 52 years in 2016)
-- Music stop: House of Blues Cleveland, carrying the story of Alan Freed coining "rock
--   and roll" on Cleveland radio in 1951
-- Commercial ends: Flannery's Pub (Irish pub across from the ballpark and arena) at the
--   start, The Corner Alley (bowling and bar in the 1922 Kresge Building on Euclid) at
--   the end, about two minutes' walk apart across Prospect Avenue
-- Drawn from: Cleveland Historical's "Downtown Architecture" walking tour (the source
--   for Society for Savings Building, Terminal Tower and The Arcade), and the Downtown
--   Cleveland Alliance's Take a Hike historic walking tour, whose published route starts
--   outside Flannery's Pub on Prospect Avenue; each stop's own history page is cited below
-- ai_model: Anthropic Claude Sonnet 5
--
-- Cleveland held zero applied paths in public.paths. It was not the only NFL fanbase city
-- at zero: Buffalo, Cincinnati, Denver, Houston, Indianapolis, Jacksonville, Kansas City,
-- Las Vegas, Pittsburgh, San Francisco and Seattle were too, but every one of those already
-- had a tour file sitting in this folder from a run in the last day or two, and Cincinnati's
-- was filed by this same routine earlier today. Cleveland's own file here was the oldest,
-- dated 2026-08-16, so it had gone the longest of any zero-coverage city without a fresh
-- attempt, and it won the alphabetical tiebreak among the cities tied at that same date besides.

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
  "city": "Cleveland",
  "state": "OH",
  "title": "Ballparks, Bells and the Birthplace of Rock",
  "shape": "loop",
  "blurb": "A two-hour loop from Gateway's ballpark statues through Public Square's landmark skyline to the club carrying on Cleveland's rock and roll story, closing two minutes from where it began.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Flannery's Pub",
      "address": "323 Prospect Ave E",
      "zip": "44115",
      "description": "Grab a pint at this Irish pub, which has poured Guinness across the street from Cleveland's ballpark and arena since 1997, with local bands playing most weekends and no cover. Look toward East 4th Street to get your bearings before heading south into Gateway.",
      "source_url": "https://www.flannerys.com/"
    },
    {
      "name": "Progressive Field, Heritage Park",
      "address": "2401 Ontario St",
      "zip": "44115",
      "description": "Step up to the ballpark's outfield plaza, where bronze statues of Bob Feller, Larry Doby, Jim Thome and Lou Boudreau stand frozen mid motion; Feller's has greeted fans here since the park opened in 1994. Find Doby's statue, the first Black player in the American League, then look at the street sign behind him: it has been renamed Larry Doby Way.",
      "source_url": "https://www.mlb.com/news/background-of-statues-at-progressive-field"
    },
    {
      "name": "Rocket Arena",
      "address": "1 Center Court",
      "zip": "44115",
      "description": "This building is where LeBron James delivered Cleveland its first major pro title in 52 years, erasing a 3-1 Finals deficit to beat Golden State in 2016. It has worn three other names since opening in 1994, Gund Arena, Quicken Loans Arena and Rocket Mortgage FieldHouse, before this one. Peek through the lobby glass for the retired jersey banners if the doors are open.",
      "source_url": "https://en.wikipedia.org/wiki/Rocket_Arena"
    },
    {
      "name": "Soldiers' and Sailors' Monument",
      "address": "3 Public Square",
      "zip": "44114",
      "description": "Walk inside this 125 foot column, free of charge, and find a small memorial room lined with Civil War relics and the names of over 9,000 Cuyahoga County soldiers who served the Union. Step back outside and look up: a 15 foot Statue of Liberty crowns the top, installed here decades before the more famous one went up in New York Harbor.",
      "source_url": "https://clevelandhistorical.org/items/show/332"
    },
    {
      "name": "Old Stone Church",
      "address": "91 Public Square",
      "zip": "44113",
      "description": "This 1855 sandstone church is the oldest building still standing on Public Square, having outlasted two fires and every other structure that once shared the square with it. Look up at its two towers, deliberately built to unequal heights in the Romanesque style, still an active congregation after 170 plus years.",
      "source_url": "https://clevelandhistorical.org/items/show/165"
    },
    {
      "name": "Society for Savings Building",
      "address": "127 Public Square",
      "zip": "44114",
      "description": "Widely credited as Cleveland's first skyscraper, this 1890 tower was designed by Chicago architect John Wellborn Root. A century later Key Tower rose beside it, and the two buildings' lobbies were fused together during restoration; notice how modest ten stories looks now, sharing a front door with the tallest building in Ohio.",
      "source_url": "https://clevelandhistorical.org/items/show/305"
    },
    {
      "name": "Terminal Tower",
      "address": "50 Public Square",
      "zip": "44113",
      "description": "For 60 years after it opened in 1930, this 52 story tower was the tallest building outside New York City, and Clevelanders once dropped baseballs off its roof just to see if a catcher below could survive the fall. Step through the doors and you are standing above a working train and rapid transit station that has never stopped running underneath it.",
      "source_url": "https://clevelandhistorical.org/items/show/21"
    },
    {
      "name": "The Arcade",
      "address": "401 Euclid Ave",
      "zip": "44114",
      "description": "Push through the doors and look straight up at this 1890 glass and iron atrium, financed partly by John D. Rockefeller and one of the first indoor shopping arcades built in the country. Walk to the skybridge in the middle for the best angle on the ironwork, then exit toward Euclid Avenue.",
      "source_url": "https://clevelandhistorical.org/items/show/24"
    },
    {
      "name": "House of Blues Cleveland",
      "address": "308 Euclid Ave",
      "zip": "44114",
      "description": "Cleveland gave rock and roll its name: in 1951, disc jockey Alan Freed used the phrase on WJW radio to describe the rhythm and blues records he was spinning for a mixed race Cleveland audience. This club carries that lineage forward most weekends; check the marquee for who is on before moving along Euclid.",
      "source_url": "https://case.edu/ech/articles/f/freed-alan"
    },
    {
      "name": "The Corner Alley",
      "address": "402 Euclid Ave",
      "zip": "44114",
      "description": "A bowling alley and bar tucked into the ground floor of the 1922 Kresge Building, once an Art Deco five and dime store. Roll a frame or order a drink here, just two minutes from Flannery's back across Prospect Avenue.",
      "source_url": "https://www.yelp.com/biz/the-corner-alley-cleveland-10"
    }
  ]
}
$tgb$::jsonb);
