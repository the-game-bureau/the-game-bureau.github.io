/*
 * NFL Tour Builder route
 *
 * City: Houston, TX
 * Date: 2026-08-18
 * Shape: point_to_point, 6 stops
 * Distance and time: roughly 0.9 miles end to end, about 45 to 60 minutes including time spent at each stop
 * Sports stop: Union Station at Daikin Park (stop 2), the 1911 train depot folded whole into the Astros' home plate gate; the Hakeem Olajuwon jersey monument outside Toyota Center (stop 4) carries the theme a second time
 * Music stop: House of Blues Houston (stop 3), the chain's Caroline Street room and the stadium district's steadiest stage for live music
 * Commercial ends: Home Plate Bar & Grill directly across Texas Street from the ballpark gate (start, stop 1) and The Grove overlooking Discovery Green's lake (end, stop 6)
 * Sourced from: Downtown Houston's own venue pages for House of Blues, Toyota Center and Discovery Green, Foursquare for the Olajuwon jersey monument, Wikipedia for Daikin Park and its Union Station history, and Tripadvisor and The Grove's own site for the two commercial ends, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * The walk starts at a sports bar across Texas Street from Daikin Park's
 * home plate gate, crosses into the ballpark's old Union Station lobby,
 * then runs south down Caroline and Polk through the stadium district's
 * music room and arena block before finishing east at Discovery Green, a
 * few short blocks from the first stop but a different world from a
 * ballpark gate.
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
  "city": "Houston",
  "state": "TX",
  "title": "Home Plate to the Green",
  "shape": "point_to_point",
  "blurb": "A stadium-district walk from a ballpark sports bar past Houston's old Union Station, a Hall of Famer's bronze jersey and a blues stage, ending at a window table over Discovery Green's lake.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Home Plate Bar & Grill",
      "address": "1800 Texas St",
      "zip": "77002",
      "description": "This three-story sports bar sits directly across Texas Street from Daikin Park's home plate gate; grab a table on the rooftop deck and wait here for your group before the walk begins.",
      "source_url": "https://www.tripadvisor.com/Restaurant_Review-g56003-d486484-Reviews-Home_Plate_Bar_Grill-Houston_Texas.html"
    },
    {
      "name": "Union Station at Daikin Park",
      "address": "501 Crawford St",
      "zip": "77002",
      "description": "Houston's 1911 Union Station survives whole inside the ballpark's home plate entrance; the columned lobby and vaulted ceiling that once greeted arriving trains are now simply the gate the Astros play behind.",
      "source_url": "https://en.wikipedia.org/wiki/Daikin_Park"
    },
    {
      "name": "House of Blues Houston",
      "address": "1204 Caroline St",
      "zip": "77002",
      "description": "The blues chain's Houston room anchors Caroline Street with folk-art-covered walls and a Sunday gospel brunch, the steadiest stage for live music in the stadium district; check who is booked tonight before you move on.",
      "source_url": "https://downtownhouston.org/go/house-of-blues"
    },
    {
      "name": "Hakeem Olajuwon Jersey Monument",
      "address": "1510 Polk St",
      "zip": "77002",
      "description": "A twelve-foot bronze at the corner of LaBranch and Polk casts Hakeem Olajuwon's number 34 jersey over a list of his honors, marking the door of the arena where the Rockets hung two championship banners.",
      "source_url": "https://foursquare.com/v/hakeem-olajuwons-jersey-monument/5048e00ee4b01b47ba1f8258"
    },
    {
      "name": "Discovery Green",
      "address": "1500 McKinney St",
      "zip": "77010",
      "description": "Eleven acres of lawn and lake wedged between the ballpark, the arena and the convention center, its Gateway Fountain and public art make this the stadium district's one green pause between stops.",
      "source_url": "https://downtownhouston.org/go/discovery-green"
    },
    {
      "name": "The Grove",
      "address": "1611 Lamar St",
      "zip": "77010",
      "description": "A two-story dining room on the park's south edge with a wall of glass looking over Discovery Green's lake; take the table by the window and let the walk end here.",
      "source_url": "https://www.thegrovehouston.com/"
    }
  ]
}
$tgb$::jsonb);
