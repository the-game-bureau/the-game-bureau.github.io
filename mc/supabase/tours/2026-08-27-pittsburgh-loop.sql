-- TGB NFL Tour Builder
-- City: Pittsburgh, PA (fanbase city of the Steelers)
-- Date: 2026-08-27
-- Shape: loop, 10 stops
-- Distance / time: roughly 1.3 miles round trip, about 90 to 100 minutes
--   including time standing at each stop.
-- Sports stop: stop 4, Redbeard's on Sixth Sports Bar and Grill (144 Sixth
--   St), a block off the Cultural District theaters and where downtown
--   watches the Steelers and Pirates on game day.
-- Music stop: stop 5, the Benedum Center for the Performing Arts (237 7th
--   St), opened in 1928 as the movie palace called the Stanley Theater and
--   reborn in 1987 as the Pittsburgh Cultural Trust's first restoration.
-- Commercial ends: stop 1, Primanti Bros. Market Square (start, 2 S Market
--   Sq, the sandwich chain's own downtown counter) and stop 10, the Omni
--   William Penn Hotel (end, 530 William Penn Pl, Henry Clay Frick's 1916
--   grand hotel), about a four minute walk apart.
-- Route: north from Market Square to PPG Place, east through the Cultural
--   District past the August Wilson Center, Redbeard's and the Benedum,
--   south to the Grant Street cluster of the Courthouse, the Frick Building
--   and the Union Trust Building, then west to Mellon Square and the William
--   Penn Hotel, closing the loop a few minutes from the start on streets the
--   outbound leg never used.
-- Drawn from: the Pittsburgh History and Landmarks Foundation's "Exploring
--   Pittsburgh: A Downtown Walking Tour" guidebook of the Golden Triangle;
--   the Office of Public Art's Cultural District and Grant Street Corridor
--   self-guided walking tours; and Wikipedia's own entries for PPG Place,
--   the August Wilson African American Cultural Center, the Benedum Center,
--   the Allegheny County Courthouse, the Frick Building, the Union Trust
--   Building, Mellon Square and the Omni William Penn Hotel, all cited per
--   stop below.
-- Written by: Anthropic Claude Sonnet 5
--
-- Pittsburgh and San Francisco were both the oldest-built of the twelve NFL
-- fanbase cities carrying zero rows in public.paths (Buffalo, Cincinnati,
-- Cleveland, Denver, Houston, Indianapolis, Jacksonville, Kansas City, Las
-- Vegas, Pittsburgh, San Francisco, Seattle), each already holding a
-- committed but unapplied file dated no later than 2026-08-21; the two tied
-- on that date, so the tie broke alphabetically to Pittsburgh. This is
-- Pittsburgh's second file (see 2026-08-21-pittsburgh-point_to_point.sql, a
-- Cultural District to North Shore walk by way of the Clemente Bridge). This
-- loop deliberately covers different ground: Market Square, PPG Place and
-- the Grant Street office towers, so nothing here repeats a stop from that
-- earlier file. The one existing Pittsburgh waypoint on file, the Original
-- Oyster House, is the start of that other tour and was left off this one
-- rather than duplicated across both.

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
  "city": "Pittsburgh",
  "state": "PA",
  "title": "Steel, Stained Glass and Sixth Street",
  "shape": "loop",
  "blurb": "A loop through downtown Pittsburgh's Golden Triangle, from a Market Square sandwich counter through the Cultural District's theaters and sports bars to two Henry Clay Frick skyscrapers, closing at the grand hotel he built to match them.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Primanti Bros. Market Square",
      "address": "2 S Market Sq",
      "zip": "15222",
      "description": "Pittsburgh's own sandwich chain got its start feeding truckers at the old produce terminal in the 1930s and still piles coleslaw and french fries right inside the bread here; order a Pitt-burgher and find a table before setting off.",
      "source_url": "https://en.wikipedia.org/wiki/Primanti_Brothers"
    },
    {
      "name": "PPG Place",
      "address": "1 PPG Pl",
      "zip": "15222",
      "description": "Philip Johnson's six glass towers went up between 1983 and 1984 using more than nineteen thousand pieces of glass, the tallest spire built from Gothic cathedral tracery rendered in steel and reflective glass; stand in the plaza between the towers and look straight up.",
      "source_url": "https://en.wikipedia.org/wiki/PPG_Place"
    },
    {
      "name": "August Wilson African American Cultural Center",
      "address": "980 Liberty Ave",
      "zip": "15222",
      "description": "Named for the Pittsburgh born playwright whose ten play Century Cycle traced Black life in the Hill District decade by decade, the center anchors the far end of the Cultural District; check the marquee for what is playing before continuing on.",
      "source_url": "https://en.wikipedia.org/wiki/August_Wilson_African_American_Cultural_Center"
    },
    {
      "name": "Redbeard's on Sixth Sports Bar and Grill",
      "address": "144 Sixth St",
      "zip": "15222",
      "description": "A block off the theaters, this is where downtown watches the Steelers and the Pirates on game day, screens running the length of the bar; step in and see whether it is a black and gold kind of afternoon.",
      "source_url": "https://www.fanzo.com/en-us/bars-pubs/pittsburgh/9886"
    },
    {
      "name": "Benedum Center for the Performing Arts",
      "address": "237 7th St",
      "zip": "15222",
      "description": "Opened in 1928 as the movie palace called the Stanley Theater and reborn in 1987 as the Pittsburgh Cultural Trust's first restoration, its 2,800 seat hall now hosts the ballet, the opera and touring Broadway; look up at the marquee lights before moving on.",
      "source_url": "https://en.wikipedia.org/wiki/Benedum_Center"
    },
    {
      "name": "Allegheny County Courthouse",
      "address": "436 Grant St",
      "zip": "15219",
      "description": "Henry Hobson Richardson's 1888 fortress of Romanesque granite is reckoned among the finest public buildings in the country and is linked to the old county jail behind it by an enclosed Bridge of Sighs; walk the Grant Street facade and look for the bridge overhead.",
      "source_url": "https://en.wikipedia.org/wiki/Allegheny_County_Courthouse_and_Jail"
    },
    {
      "name": "Frick Building",
      "address": "437 Grant St",
      "zip": "15219",
      "description": "Henry Clay Frick raised this 1902 Beaux Arts tower directly across from the courthouse, the story going that he built it tall enough to block the sun from his rival Andrew Carnegie's building next door; step into the marble lobby and find the bronze griffins.",
      "source_url": "https://en.wikipedia.org/wiki/Frick_Building"
    },
    {
      "name": "Union Trust Building",
      "address": "501 Grant St",
      "zip": "15219",
      "description": "Frick built this one too, a 1917 Flemish Gothic shopping arcade topped with a forty foot Tiffany glass dome over its rotunda, standing on the block where a cathedral once stood; step inside and look straight up into the dome.",
      "source_url": "https://en.wikipedia.org/wiki/Union_Trust_Building_(Pittsburgh)"
    },
    {
      "name": "Mellon Square",
      "address": "534 Smithfield St",
      "zip": "15222",
      "description": "Built in 1955 over a parking garage as one of the first postwar urban plazas in the country, its terrazzo paving and fountains were restored to their midcentury design in 2014; find a bench and sit for a minute before the last stop.",
      "source_url": "https://en.wikipedia.org/wiki/Mellon_Square"
    },
    {
      "name": "Omni William Penn Hotel",
      "address": "530 William Penn Pl",
      "zip": "15219",
      "description": "Henry Clay Frick opened this 1916 grand hotel to give Pittsburgh a hotel equal to its money, and Franklin Roosevelt, the Beatles and generations of Steelers champions have all stayed here since; finish in the lobby bar and compare notes on the walk.",
      "source_url": "https://en.wikipedia.org/wiki/Omni_William_Penn_Hotel"
    }
  ]
}
$tgb$::jsonb);
