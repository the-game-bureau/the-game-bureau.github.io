-- TGB NFL Tour Builder
-- City: Cincinnati, OH (fanbase city of the Bengals)
-- Date: 2026-08-23
-- Shape: out_and_back, 10 stops
-- Cincinnati had zero rows in public.paths, tied with Buffalo, Cleveland, Denver,
--   Houston, Indianapolis, Jacksonville, Kansas City, Las Vegas, Pittsburgh, San
--   Francisco and Seattle. Broken by longest since last built (git log on
--   mc/supabase/tours/): Cincinnati's only prior file here is dated 2026-08-15,
--   the oldest of that group; Buffalo and Seattle were both rebuilt as recently
--   as 2026-08-22. A prior Cincinnati file already sits in this folder unrun;
--   this is an independently researched route, not a copy of it, though it
--   confirms the same Banks district and shares two commercial anchors with it.
-- Distance / time: about 1 mile round trip, roughly 70 to 85 minutes including
--   time standing at each stop.
-- Sports stop: stop 2, the Cincinnati Reds Hall of Fame and Museum, built into
--   the west gate of Great American Ball Park (100 Joe Nuxhall Way).
-- Music stop: stop 5, the Cincinnati Black Music Walk of Fame (190 W Mehring
--   Way), a free riverfront walk of fame for the city's Black recording artists
--   and producers; also the tour's turnaround point.
-- Commercial ends: stop 1, Cincinnati Lager House (start, 115 Joe Nuxhall Way),
--   the riverfront brewery reviving the 1853 Christian Moerlein name, and
--   stop 10, Holy Grail Tavern & Grille (end, 161 Joe Nuxhall Way), built into
--   the ballpark's edge; the two sit a few minutes apart on the same stretch of
--   Joe Nuxhall Way.
-- Spine: the outbound leg follows the riverfront promenade (Mehring Way) west
--   from the ballpark to the Black Music Walk of Fame; the return follows
--   Freedom Way, one block inland, so the outbound pavement is never retraced.
--   The whole walk stays inside the Banks district between the city's two
--   stadiums and never leaves it.
-- Drawn from: each stop's own venue, museum, or city page, all cited per stop
--   below; the cluster itself (both stadiums, Smale Riverfront Park, the
--   Freedom Center, and the Banks restaurant row between Joe Nuxhall Way and
--   Freedom Way) is the same compact district every published Cincinnati
--   riverfront walking guide (visitcincy.com, thebankscincy.com) covers.
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
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The path needs a city.'; end if;
  if v_title is null then raise exception 'The path needs a title.'; end if;
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The path needs a non-empty stops array.';
  end if;

  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.paths (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'path'::text, null::integer, v_title, v_tour_id, v_shape;

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
  "city": "Cincinnati",
  "state": "OH",
  "title": "Two Stadiums and the River Between Them",
  "shape": "out_and_back",
  "blurb": "A loop along Cincinnati's riverfront from the Reds' ballpark almost to the Bengals' stadium and back, by way of a landmark suspension bridge, a walk of fame for the city's Black music legends, and the story the river itself tells.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Cincinnati Lager House",
      "address": "115 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Start at the Cincinnati Lager House, the riverfront brewery reviving the 1853 Christian Moerlein name, and gather your group before heading out along the water.",
      "source_url": "https://cincylagerhouse.com/"
    },
    {
      "name": "Cincinnati Reds Hall of Fame and Museum",
      "address": "100 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Step into the Cincinnati Reds Hall of Fame and Museum, built into the ballpark's west gate, to see what the oldest franchise in professional baseball has kept since 1869.",
      "source_url": "https://www.mlb.com/reds/ballpark/reds-hall-of-fame-and-museum"
    },
    {
      "name": "John A. Roebling Suspension Bridge",
      "address": "100 W Mehring Way",
      "zip": "45202",
      "description": "Walk out onto the John A. Roebling Suspension Bridge, the 1866 span that was the longest in the world at the time and the design John Roebling later scaled up for the Brooklyn Bridge.",
      "source_url": "https://en.wikipedia.org/wiki/John_A._Roebling_Suspension_Bridge"
    },
    {
      "name": "Black Brigade Monument",
      "address": "166 W Mehring Way",
      "zip": "45202",
      "description": "Pause at the Black Brigade Monument, three bronze figures in Smale Riverfront Park honoring the seven hundred and eighteen Black Cincinnatians who volunteered to dig the earthworks that defended the city in 1862.",
      "source_url": "https://cincinnatiparksfoundation.org/art-in-your-parks-black-brigade-monument/"
    },
    {
      "name": "Cincinnati Black Music Walk of Fame",
      "address": "190 W Mehring Way",
      "zip": "45202",
      "description": "Walk the Cincinnati Black Music Walk of Fame, a free riverfront walk honoring the city's Black recording artists and producers, and turn back here.",
      "source_url": "https://www.cincyblackmusicwalkoffame.org/"
    },
    {
      "name": "Taste of Belgium, The Banks",
      "address": "16 W Freedom Way",
      "zip": "45202",
      "description": "Duck into Taste of Belgium for a Liege waffle and fried chicken, set between the two stadiums a few steps from where you turned around.",
      "source_url": "https://tasteofbelgium.com/locations/the-banks/"
    },
    {
      "name": "National Underground Railroad Freedom Center",
      "address": "50 E Freedom Way",
      "zip": "45202",
      "description": "Stand at the National Underground Railroad Freedom Center, built on the riverbank the Ohio River itself once marked as the last line between slavery and freedom.",
      "source_url": "https://en.wikipedia.org/wiki/National_Underground_Railroad_Freedom_Center"
    },
    {
      "name": "Carol Ann's Carousel",
      "address": "120 E Mehring Way",
      "zip": "45202",
      "description": "Watch the forty four hand carved, Cincinnati themed animals turn inside the glass pavilion of Carol Ann's Carousel.",
      "source_url": "https://www.cincinnati-oh.gov/cincyparks/visit-a-park/find-a-parkfacility/carol-anns-carousel/"
    },
    {
      "name": "Yard House, The Banks",
      "address": "95 E Freedom Way",
      "zip": "45202",
      "description": "Cut through Yard House for a look at its wall of taps before the last stretch back to home plate.",
      "source_url": "https://www.yardhouse.com/locations/oh/cincinnati/cincinnati-the-banks/8344"
    },
    {
      "name": "Holy Grail Tavern & Grille",
      "address": "161 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Finish at the Holy Grail, the sports bar built into the ballpark's edge, and let the group compare notes over what you just walked.",
      "source_url": "https://www.holygrailbanks.com/"
    }
  ]
}
$tgb$::jsonb);
