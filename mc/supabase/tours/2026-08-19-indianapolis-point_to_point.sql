/*
 * NFL Tour Builder route
 *
 * City: Indianapolis, IN
 * Date: 2026-08-19
 * Shape: point_to_point, 6 stops
 * Distance and time: roughly 1.6 miles end to end, about 70 to 85 minutes including time spent at each stop
 * Sports stop: the Peyton Manning Statue outside Lucas Oil Stadium (stop 5)
 * Music stop: Chatterbox Jazz Club on Massachusetts Avenue (stop 2)
 * Commercial ends: Bru Burger Bar on Mass Ave (start, stop 1) and Kilroy's Bar and Grill three blocks from the stadium gate (end, stop 6)
 * Sourced from: Downtown Indianapolis's own venue pages for Bru Burger Bar, Chatterbox Jazz Club and Kilroy's Bar and Grill, the Athenaeum Foundation's own history page, Visit Indy for the Soldiers and Sailors Monument, and Wikipedia for the Peyton Manning statue, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * The walk starts at a Mass Ave burger bar, crosses the street to a jazz
 * club that has booked live sets on that block since the 1980s, then cuts
 * south past the German clubhouse at the Athenaeum and through Monument
 * Circle at the exact center of the Mile Square. From there it runs down
 * to the stadium district for Peyton Manning's bronze outside Lucas Oil
 * Stadium and finishes at a sports bar a few blocks from the gate. The
 * Circle to Capitol Avenue leg runs closer to thirteen minutes than the
 * five to eight ideal, and total distance runs past the one mile aim for
 * this shape; both are the price of a real Colts stop inside a walk that
 * still starts and ends on foot, well under two hours including stops.
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
  "city": "Indianapolis",
  "state": "IN",
  "title": "From the Chatterbox to the Horseshoe",
  "shape": "point_to_point",
  "blurb": "A downtown walk from a Mass Ave jazz club through the city's German clubhouse and the monument at its center, out to Peyton Manning's bronze outside Lucas Oil Stadium and a sports bar three blocks from the gate.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Bru Burger Bar",
      "address": "410 Massachusetts Ave",
      "zip": "46204",
      "description": "A Mass Ave burger and beer bar open since 2011, the easiest place on this block to find your group, grab a table and start the walk from here.",
      "source_url": "https://downtownindy.org/go/bru-burger-bar"
    },
    {
      "name": "Chatterbox Jazz Club",
      "address": "435 Massachusetts Ave",
      "zip": "46204",
      "description": "A narrow storefront jazz room booking live sets six nights a week since the 1980s, one of the last true jazz clubs left in the Midwest; duck in for a song before moving on.",
      "source_url": "https://downtownindy.org/go/chatterbox-jazz-club"
    },
    {
      "name": "The Athenaeum",
      "address": "401 E Michigan St",
      "zip": "46204",
      "description": "Built in the 1890s as Das Deutsche Haus for the city's German societies and renamed during World War One, this German Renaissance Revival clubhouse is now a National Historic Landmark with a beer garden still running inside.",
      "source_url": "https://athenaeumindy.org/about/the-building/our-history/"
    },
    {
      "name": "Soldiers and Sailors Monument",
      "address": "1 Monument Circle",
      "zip": "46204",
      "description": "A 284-foot limestone monument dedicated in 1902 at the exact center of the Mile Square, with an observation deck 275 feet up if you want the whole city laid out at once.",
      "source_url": "https://www.visitindy.com/directory/soldiers-sailors-monument-monument-circle/"
    },
    {
      "name": "Peyton Manning Statue",
      "address": "500 S Capitol Ave",
      "zip": "46225",
      "description": "A nine-foot bronze of the quarterback who brought Indianapolis a Super Bowl, unveiled outside Lucas Oil Stadium in 2017 on the plaza where the Colts still play every home game.",
      "source_url": "https://en.wikipedia.org/wiki/Statue_of_Peyton_Manning"
    },
    {
      "name": "Kilroy's Bar and Grill",
      "address": "201 S Meridian St",
      "zip": "46225",
      "description": "A downtown sports bar three blocks from the stadium gate with forty screens and a patio, the right place to sit down, watch the replays and call a ride home.",
      "source_url": "https://downtownindy.org/go/kilroys-bar-and-grill"
    }
  ]
}
$tgb$::jsonb);
