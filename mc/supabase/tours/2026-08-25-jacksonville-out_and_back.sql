/*
 * NFL Tour Builder route
 *
 * City: Jacksonville, FL
 * Date: 2026-08-25
 * Shape: out_and_back, 10 stops
 * Distance and time: roughly 1.1 miles round trip, about 70 to 90 minutes including time spent at each stop
 * Sports stop: Bay Street Sports Grille, the Jaguars game day bar two blocks from the finish (stop 9)
 * Music stop: Jacoby Symphony Hall inside the Jacksonville Center for the Performing Arts, home of the Jacksonville Symphony (stop 7)
 * Commercial ends: Jacksonville Coffee Co on Bay Street (start, stop 1) and Ocean Street Tacos and Tequila in the Elbow district (end, stop 10)
 * Sourced from: Downtown Jacksonville's own venue pages (dtjax.com), Wikipedia for the Bank of America Tower, the Museum of Contemporary Art Jacksonville, Riverfront Plaza and the CSX Transportation Building, the Jacksonville Public Library's own site, and the James Weldon Johnson Park Conservancy, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * Jacksonville already carried zero routes in public.paths, the same reading
 * that made it the strongest candidate for TGB WAYPOINT BOT's walk on
 * 2026-08-19 (see 2026-08-19-jacksonville-out_and_back.sql, in this same
 * folder, still unapplied as of this run). That file and this one are both
 * real, both verified and both waiting on a human to run one of them; a
 * quick check of public.paths this run confirmed Jacksonville still has
 * nothing applied, so a second candidate costs nothing and gives a choice.
 * Rather than retrace Laura Street's fire-rebuilt bank and church row, this
 * walk uses Jacksonville's OTHER historic thread: the river. It heads north
 * from Bay Street up Laura Street past the city's tallest tower, the main
 * library and the art museum, out to the new Riverfront Plaza and the
 * symphony hall on the St. Johns River, turns at the CSX headquarters
 * tower, and comes back one block over on Bay Street into the Elbow
 * entertainment district. Two stops repeat the other file's picks on
 * purpose: James Weldon Johnson Park and Bay Street Sports Grille are
 * simply the correct answer for "the city's oldest park" and "the Jaguars
 * bar downtown," and a place belongs on more than one walk. Checked and
 * ruled out along the way: European Street Cafe's new Riverfront Plaza
 * location has not opened yet (expected late fall 2026); Intuition Ale
 * Works' downtown taproom closed in April 2026; the Main Street Bridge
 * pedestrian walkway to the Southbank has been closed for construction
 * since August 24, 2026; and the Karpeles Manuscript Library Museum closed
 * in 2023 and is a private event venue now. None of the four made it in.
 */

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
  "city": "Jacksonville",
  "state": "FL",
  "title": "Towers to the Riverfront: A Downtown Jacksonville Walk",
  "shape": "out_and_back",
  "blurb": "An hour and a half through downtown Jacksonville's rebuilt skyline, from a Bay Street coffee counter up Laura Street's towers to the new Riverfront Plaza and the symphony hall on the St. Johns River, then back by way of a Jaguars game day bar and a taco counter in the Elbow.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Jacksonville Coffee Co",
      "address": "6 E Bay St",
      "zip": "32202",
      "description": "A locally owned coffee counter three blocks from the river, opened in 2023 and now one of three Jacksonville Coffee Co locations in town; get something to drink here and give the rest of the group a few minutes to arrive before the walk starts.",
      "source_url": "https://dtjax.com/blog/favorite-local-coffee-shops-in-dtjax/"
    },
    {
      "name": "Jax Tower at 50 North",
      "address": "50 N Laura St",
      "zip": "32202",
      "description": "Built in 1990 as Barnett Center for the headquarters of Barnett Banks and renamed twice since, most recently in 2026, this 617 foot obelisk on the corner of Bay and Laura is still the tallest building in Jacksonville; look straight up from the sidewalk to take in the whole spike.",
      "source_url": "https://en.wikipedia.org/wiki/Bank_of_America_Tower_(Jacksonville)"
    },
    {
      "name": "Jacksonville Public Library Main Library",
      "address": "303 N Laura St",
      "zip": "32202",
      "description": "A four story, 300,000 square foot central library that sits across Laura Street from City Hall and the art museum, its lobby open to anyone who wants a minute out of the Florida heat.",
      "source_url": "https://jaxpubliclibrary.org/locations/main-library"
    },
    {
      "name": "Museum of Contemporary Art Jacksonville",
      "address": "333 N Laura St",
      "zip": "32202",
      "description": "The University of North Florida runs this contemporary art museum inside a 1931 former department store, a plain grid of windows on the outside that gives away nothing about the galleries inside; the ground floor lobby is free to step into even if you are not stopping for the exhibits.",
      "source_url": "https://en.wikipedia.org/wiki/Museum_of_Contemporary_Art_Jacksonville"
    },
    {
      "name": "James Weldon Johnson Park",
      "address": "135 W Monroe St",
      "zip": "32202",
      "description": "Jacksonville's oldest park, laid out in 1866 and renamed in 2020 for the local writer who set Lift Every Voice and Sing to his brother John Rosamond's music; find a bench in the shade before the walk turns toward the river.",
      "source_url": "https://jamesweldonjohnsonpark.org/"
    },
    {
      "name": "Riverfront Plaza",
      "address": "2 W Independent Dr",
      "zip": "32202",
      "description": "A city park that opened its first phase in December 2025 on the exact footprint of the old Jacksonville Landing festival marketplace, torn down in 2019 after more than thirty years of decline; walk out onto the new riverwalk here for the widest open view of the St. Johns River that downtown offers.",
      "source_url": "https://en.wikipedia.org/wiki/Riverfront_Plaza_(Jacksonville)"
    },
    {
      "name": "Jacoby Symphony Hall",
      "address": "300 W Water St",
      "zip": "32202",
      "description": "Modeled after Vienna's Musikverein and opened in 1997 inside what is now called the Jacksonville Center for the Performing Arts, this 1,800 seat concert hall is still home to the Jacksonville Symphony; check the marquee for what is playing this week.",
      "source_url": "https://en.wikipedia.org/wiki/Times-Union_Center_for_the_Performing_Arts"
    },
    {
      "name": "CSX Transportation Building",
      "address": "500 Water St",
      "zip": "32202",
      "description": "A 17 story mid century modern tower finished in 1960 that has served as the headquarters of a major American freight railroad ever since, its low wide silhouette a deliberate contrast to the glass towers back up the street; this is the far point of the walk, so turn here and head south for Bay Street on a different block than the one you came up on.",
      "source_url": "https://en.wikipedia.org/wiki/CSX_Transportation_Building"
    },
    {
      "name": "Bay Street Sports Grille",
      "address": "119 E Bay St",
      "zip": "32202",
      "description": "A sports bar on Bay Street that fills up with black and teal on Jaguars game days and keeps a full bar and kitchen running the rest of the week; take a seat, order something and let the score on the nearest screen decide how long you stay.",
      "source_url": "https://dtjax.com/poi/bay-street-sports-grille/"
    },
    {
      "name": "Ocean Street Tacos and Tequila",
      "address": "15 N Ocean St",
      "zip": "32202",
      "description": "A taco and margarita bar in the Elbow entertainment district, open until 1 in the morning with a back patio and a full tequila list, opened by the same team behind 1904 Music Hall next door; end the walk here with a plate of tacos and a margarita.",
      "source_url": "https://dtjax.com/poi/ocean-street-tacos-and-tequila/"
    }
  ]
}
$tgb$::jsonb);
