/*
  City: Buffalo, NY (NFL fanbase city of the Buffalo Bills)
  Date: 2026-08-28
  Shape: out and back, 10 stops
  Axis: Main Street outbound, from the Theatre District down through the
    downtown architecture core to the Canalside waterfront, then back one
    block over on Pearl Street. Buffalo carries zero rows in public.paths,
    tied at the bottom of the NFL fanbase rotation with Seattle; between the
    two, Buffalo was last built for on 2026-08-22, six days further back than
    any other zero-count city, so it comes first alphabetically over Seattle
    on the same date.
  Distance and time: roughly 1.4 to 1.6 miles of walking round trip, call it
    35 to 45 minutes of walking plus time standing at each stop, comfortably
    under two hours. Legs are short throughout except stop 5 to stop 6
    (Niagara Square down to the KeyBank Center waterfront) and stop 6 to
    stop 8 (KeyBank Center back up to Pearl and Church), both toward the
    upper end of the five to eight minute rule rather than the middle of it;
    noted here rather than smoothed over.
  Sports stop: stop 6, KeyBank Center (1 Seymour H. Knox III Plaza), home ice
    of the Buffalo Sabres since 1996 and the turning point of the walk.
  Music stop: stop 2, Shea's Performing Arts Center (646 Main St), a 1926
    movie palace that is now the home stage of the Buffalo Philharmonic
    Orchestra.
  Commercial start and end: stop 1, Founding Fathers Pub (75 Edward St), and
    stop 10, Pearl Street Grill and Brewery (76 Pearl St), both in the
    Theatre District and roughly a five minute walk apart.
  Drawn from: the GPSmyCity Buffalo Downtown Walking Tour (gpsmycity.com),
    which supplied the order and choice of Buffalo City Hall, Old County
    Hall, the Naval and Military Park, Ellicott Square Building and St.
    Paul's Cathedral, and the Explore Buffalo downtown architecture tours
    (explorebuffalo.org), which cover the same core on foot. Shea's
    Performing Arts Center, KeyBank Center, and the two commercial ends were
    added once the music, sports and start/end angles were chosen, each
    verified against its own site or a real listing rather than a search
    results page.
  Everything not stretched: every address below was checked against a real
    listing, official site, or history page. The Colored Musicians Club on
    Broadway, a genuine Buffalo jazz landmark, was considered for the music
    stop and left out: it sits far enough east of the Main and Pearl Street
    axis that including it would have pulled the whole return leg off the
    parallel-street shape this route needs, and Shea's already carries the
    music stop honestly by being home to the city's philharmonic orchestra.
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
  "city": "Buffalo",
  "state": "NY",
  "title": "Gold Dome to the Ice: A Downtown Buffalo Double Back",
  "shape": "out_and_back",
  "blurb": "Two hours through Buffalo's architecture core, out to the Sabres' front door on the water and back again by way of Pearl Street.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Founding Fathers Pub",
      "address": "75 Edward St",
      "zip": "14202",
      "description": "A cluttered, campaign-poster-covered tavern that has been Buffalo's living room since 1993, tucked into the Theatre District: gather your group here, then step out onto Edward Street.",
      "source_url": "https://www.yelp.com/biz/founding-fathers-pub-buffalo"
    },
    {
      "name": "Shea's Performing Arts Center",
      "address": "646 Main St",
      "zip": "14202",
      "description": "A 1926 movie palace, gold leaf and all, now home to the Buffalo Philharmonic Orchestra and the city's touring Broadway shows: look up at the marquee before continuing down Main Street.",
      "source_url": "https://www.sheas.org/buffalo-theatre/"
    },
    {
      "name": "Ellicott Square Building",
      "address": "295 Main St",
      "zip": "14203",
      "description": "Once the largest office building on earth, its marble rotunda still ringed by shops under a glass skylight: step inside for a look before moving on.",
      "source_url": "https://en.wikipedia.org/wiki/Ellicott_Square_Building"
    },
    {
      "name": "Old County Hall",
      "address": "92 Franklin St",
      "zip": "14202",
      "description": "An 1876 Victorian Gothic courthouse of pink Maine granite, its clock tower still keeping time over Franklin Street, a short block from the newer City Hall next door.",
      "source_url": "https://buffaloah.com/a/franklin/92/index.html"
    },
    {
      "name": "Buffalo City Hall",
      "address": "65 Niagara Square",
      "zip": "14202",
      "description": "A 1931 Art Deco tower carved with pioneer and Native American imagery, with an observation deck 28 floors up on a clear day: the walk turns toward the water from here.",
      "source_url": "https://en.wikipedia.org/wiki/Buffalo_City_Hall"
    },
    {
      "name": "KeyBank Center",
      "address": "1 Seymour H. Knox III Plaza",
      "zip": "14203",
      "description": "Home ice for the Buffalo Sabres since 1996, its glass front lit up on game nights along the Canalside waterfront: this is the far point of the walk before doubling back.",
      "source_url": "https://en.wikipedia.org/wiki/KeyBank_Center"
    },
    {
      "name": "Buffalo and Erie County Naval and Military Park",
      "address": "1 Naval Park Cove",
      "zip": "14202",
      "description": "Three decommissioned Navy ships, including the cruiser USS Little Rock, sit open for boarding right on the water: walk the deck before heading back uptown.",
      "source_url": "https://en.wikipedia.org/wiki/Buffalo_and_Erie_County_Naval_%26_Military_Park"
    },
    {
      "name": "St. Paul's Episcopal Cathedral",
      "address": "128 Pearl St",
      "zip": "14202",
      "description": "An 1851 Gothic Revival cathedral of Medina sandstone that survived the fire which took the rest of the block in 1888: its bell still marks the hour on Pearl Street.",
      "source_url": "https://en.wikipedia.org/wiki/St._Paul%27s_Cathedral_(Buffalo,_New_York)"
    },
    {
      "name": "Guaranty Building",
      "address": "140 Pearl St",
      "zip": "14202",
      "description": "Louis Sullivan's 1896 terra cotta skyscraper, every inch of its facade patterned like woven fabric: look straight up at the cornice from the sidewalk.",
      "source_url": "https://en.wikipedia.org/wiki/Prudential_(Guaranty)_Building"
    },
    {
      "name": "Pearl Street Grill and Brewery",
      "address": "76 Pearl St",
      "zip": "14202",
      "description": "A downtown brewpub pouring its own beer in a converted storefront a block from where you started: sit down, order something local, and let the group catch up.",
      "source_url": "https://pearlstreetgrill.com/homepage/"
    }
  ]
}
$tgb$::jsonb);
