/*
 * NFL Tour Builder route
 *
 * City: Jacksonville, FL
 * Date: 2026-08-19
 * Shape: out_and_back, 10 stops
 * Distance and time: roughly 1.0 mile round trip, about 60 to 75 minutes including time spent at each stop
 * Sports stop: Bay Street Bar and Grill, the Jaguars game day bar that doubles as the last stop (stop 10)
 * Music stop: the Florida Theatre, the 1927 movie palace that still books jazz and touring acts (stop 3)
 * Commercial ends: Urban Grind Coffee Company on Bay Street (start, stop 1) and Bay Street Bar and Grill two blocks away (end, stop 10)
 * Sourced from: Downtown Jacksonville's own venue and landmark pages (dtjax.com), the James Weldon Johnson Park Conservancy's site, the Florida Theatre's own history page, Wikipedia for the Laura Street Trio, the Basilica, the St. James Building and the Carling, and Cowford Chophouse's own history page, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * Jacksonville has no path yet in public.paths, so it was the strongest
 * candidate this run: zero routes applied, and no committed file for it in
 * this folder either. The walk uses Laura Street as its spine, heading
 * north from the river through the Laura Street Trio and the Forsyth and
 * Duval Street church and civic buildings to James Weldon Johnson Park,
 * then returns one block over on Adams Street past the old Carling Hotel
 * and back down to Bay Street. Every stop here rebuilt on the same footprint
 * the 1901 Great Fire cleared, which is the thread running through the
 * walk: a bank turned steakhouse, a department store turned City Hall, a
 * church still waiting on its next life. The one existing Jacksonville
 * waypoint in the library, Pete's Bar on 1st Street, sits in Jacksonville
 * Beach several miles from this downtown core and was left off rather than
 * forced onto a walk it does not belong on.
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
  "title": "Terra Cotta and Teal: A Downtown Jacksonville Walk",
  "shape": "out_and_back",
  "blurb": "Ten blocks of downtown Jacksonville rebuilt in marble and terra cotta after the 1901 fire, with a jazz palace, a shuttered church and a Jaguars bar along the way.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Urban Grind Coffee Company",
      "address": "45 W Bay St",
      "zip": "32202",
      "description": "A corner coffee shop with a shaded courtyard just off Bay Street, order something here and give the rest of the group a few minutes to arrive before the walk starts.",
      "source_url": "https://dtjax.com/poi/urban-grind-coffee-co-bay-street/"
    },
    {
      "name": "Bisbee Building",
      "address": "47 W Forsyth St",
      "zip": "32202",
      "description": "Ten stories of pale terra cotta raised in 1908 on the corner of Laura and Forsyth, one year after the Great Fire cleared this whole block, and still called Florida's first true skyscraper; look up at the cornice from across the street.",
      "source_url": "https://en.wikipedia.org/wiki/Laura_Street_Trio"
    },
    {
      "name": "Florida Theatre",
      "address": "128 E Forsyth St",
      "zip": "32202",
      "description": "A 1927 movie palace with 1,900 seats that still hosts jazz, blues and touring acts most weeks of the year; check the marquee for what is playing tonight.",
      "source_url": "https://www.floridatheatre.com/about/history"
    },
    {
      "name": "Basilica of the Immaculate Conception",
      "address": "121 E Duval St",
      "zip": "32202",
      "description": "Jacksonville's oldest Catholic parish, rebuilt in Late Gothic Revival stone after the 1901 fire, its single steeple topped with a gold plated cross that was the tallest point in the city when it was finished in 1910; step back across Duval Street to see the whole facade.",
      "source_url": "https://en.wikipedia.org/wiki/Basilica_of_the_Immaculate_Conception_(Jacksonville)"
    },
    {
      "name": "St. James Building",
      "address": "117 W Duval St",
      "zip": "32202",
      "description": "Architect Henry Klutho's 1912 masterpiece, once Cohen Brothers Department Store and one of the largest department stores in the country, now holds Jacksonville's City Hall behind its terra cotta ornament; the lobby is open on weekdays.",
      "source_url": "https://en.wikipedia.org/wiki/St._James_Building"
    },
    {
      "name": "Snyder Memorial Methodist Church",
      "address": "226 N Laura St",
      "zip": "32202",
      "description": "A Gothic Revival church rebuilt in 1903 after the Great Fire took the one before it, deconsecrated since the 1970s and standing empty on the corner of Laura and Monroe while the city works out what comes next.",
      "source_url": "https://jamesweldonjohnsonpark.org/snyder-memorial/"
    },
    {
      "name": "James Weldon Johnson Park",
      "address": "135 W Monroe St",
      "zip": "32202",
      "description": "Jacksonville's oldest park, named for the local writer who set Lift Every Voice and Sing to his brother Rosamond's music; this is the far point of the walk, so rest on a bench and then head south on Adams Street for the way back.",
      "source_url": "https://jamesweldonjohnsonpark.org/"
    },
    {
      "name": "Carling Apartments",
      "address": "31 W Adams St",
      "zip": "32202",
      "description": "A 335 room hotel that opened in 1926 as the Carling, was renamed the Roosevelt in 1936 and closed in 1964, its Italian Renaissance facade now fronting apartments set in the middle of the block instead of on a corner.",
      "source_url": "https://en.wikipedia.org/wiki/The_Carling"
    },
    {
      "name": "Cowford Chophouse",
      "address": "101 E Bay St",
      "zip": "32202",
      "description": "Rebuilt in 1902 as the First National Bank of Florida, one of the first buildings to rise after the Great Fire, its arched windows and heart pine beams restored a century later behind a steakhouse; peer through the windows even if you are not stopping to eat.",
      "source_url": "https://cowfordchophouse.com/about/"
    },
    {
      "name": "Bay Street Bar and Grill",
      "address": "119 E Bay St",
      "zip": "32202",
      "description": "A Bay Street sports bar with a wall of screens tuned to the Jaguars on game day and a full bar the rest of the week; sit down, order something and let the walk end here.",
      "source_url": "https://dtjax.com/poi/bay-street-sports-grille/"
    }
  ]
}
$tgb$::jsonb);
