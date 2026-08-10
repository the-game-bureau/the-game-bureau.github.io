-- TGB NFL Tour Builder
-- City: Charlotte, NC (fanbase city of the Panthers; had zero rows in public.routes)
-- Date: 2026-08-10
-- Shape: out_and_back, 10 stops
-- Distance / time: roughly 1.3 miles round trip, about 1 hour 45 minutes including
--   time standing at each stop. The "out" leg runs north up N College St from Trade
--   St to 7th St; the "return" leg comes back south one block over on N Tryon St.
-- Sports stop: stop 2, Spectrum Center (333 E Trade St), home of the Charlotte Hornets.
-- Music stop: stop 8, Belk Theater at Blumenthal Performing Arts Center (130 N Tryon
--   St), year-round home of the Charlotte Symphony Orchestra.
-- Commercial ends: stop 1, Mert's Heart & Soul (start), and stop 10, Caribou Coffee
--   at Founders Hall (end) -- both sit within a couple of blocks of Trade & Tryon,
--   a two-to-three-minute walk apart.
-- Drawn from: the Uptown Charlotte Historic self-guided walking tour on gpsmycity.com
--   (which the existing Independence Square, Discovery Place and Old Settlers'
--   Cemetery waypoints already in our catalog were themselves sourced from) and the
--   Charlotte Liberty Walk's route along Tryon, Church and College Streets, plus
--   individual venue listing pages for every new address below.
-- Note: three stops reuse places already in our Charlotte waypoint catalog
--   (Independence Square, Discovery Place Science, Old Settlers' Cemetery) rather
--   than duplicating them -- the helper links to the existing rows on a name+address
--   match and leaves their descriptions untouched.
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
  "city": "Charlotte",
  "state": "NC",
  "title": "Soul Food, Hornets and a Horseshoe Hall",
  "shape": "out_and_back",
  "blurb": "Ten stops up College Street and back down Tryon, from a soul-food kitchen to a symphony hall by way of the Hornets' arena and Charlotte's oldest graveyard.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Mert's Heart & Soul",
      "address": "214 N College St",
      "zip": "28202",
      "description": "Charlotte's favorite soul-food kitchen for over two decades and a Guy Fieri stop; order the shrimp and grits, find your group, and start whenever everyone's arrived.",
      "source_url": "https://mertscharlotte.com/"
    },
    {
      "name": "Spectrum Center",
      "address": "333 E Trade St",
      "zip": "28202",
      "description": "Home of the Charlotte Hornets since it opened in 2005, this 19,000-seat arena hosted the 2019 NBA All-Star Game under the roof rising in front of you.",
      "source_url": "https://en.wikipedia.org/wiki/Spectrum_Center"
    },
    {
      "name": "Independence Square and Four Corner Sculptures",
      "address": "65G4+VQ Charlotte, North Carolina",
      "zip": "28202",
      "description": "The crossing of Trade and Tryon that the city grew out of, marked at each corner by a bronze allegory of Charlotte: commerce, industry, transportation and the future.",
      "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
    },
    {
      "name": "Spirit Square",
      "address": "345 N College St",
      "zip": "28202",
      "description": "A 1909 church-turned-arts-center whose McGlohon Theater still fills the old First Baptist sanctuary with concerts and cabaret under its restored dome.",
      "source_url": "https://en.wikipedia.org/wiki/Spirit_Square"
    },
    {
      "name": "7th Street Public Market",
      "address": "224 E 7th St",
      "zip": "28202",
      "description": "Charlotte's original food hall, packed with locally owned stalls -- most of them women- or minority-owned -- this is the turnaround point, so grab a bite or just note it and head back.",
      "source_url": "https://www.themarketat7thstreet.com/"
    },
    {
      "name": "Discovery Place Science",
      "address": "301 N Tryon St",
      "zip": "28202",
      "description": "Uptown's hands-on science museum, with an aquarium, a rainforest floor and an IMAX dome.",
      "source_url": "https://www.gpsmycity.com/tours/charlotte-introduction-walking-tour-6792.html"
    },
    {
      "name": "Truist Center",
      "address": "214 N Tryon St",
      "zip": "28202",
      "description": "Opened in 2002 as Hearst Tower, this 47-story Art Deco spire has a ten-foot bronze-and-glass Castellan Figure guarding its Tryon Street plaza, built to feel like a mini Rockefeller Center.",
      "source_url": "https://en.wikipedia.org/wiki/Truist_Center"
    },
    {
      "name": "Belk Theater at Blumenthal Performing Arts Center",
      "address": "130 N Tryon St",
      "zip": "28202",
      "description": "Cesar Pelli's 1992 horseshoe-shaped hall seats over 2,000 across four levels and is the year-round home of the Charlotte Symphony Orchestra.",
      "source_url": "https://www.blumenthalarts.org/visiting/blumenthal-performing-arts-center/belk-theater"
    },
    {
      "name": "Old Settlers' Cemetery",
      "address": "200 W 5th St",
      "zip": "28202",
      "description": "Charlotte's oldest surviving burial ground, in use from the 1770s and holding the graves of the town's founding families.",
      "source_url": "https://en.wikipedia.org/wiki/Old_Settlers%27_Cemetery_(Charlotte,_North_Carolina)"
    },
    {
      "name": "Caribou Coffee at Founders Hall",
      "address": "100 N Tryon St",
      "zip": "28202",
      "description": "A coffeehouse tucked into Founders Hall's marble atrium at the foot of Charlotte's tallest tower -- order something, sit under the vaulted ceiling, and call it a walk.",
      "source_url": "https://uptowncharlotte.com/go/caribou-coffee"
    }
  ]
}
$tgb$::jsonb);
