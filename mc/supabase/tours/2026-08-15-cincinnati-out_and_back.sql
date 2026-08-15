-- TGB NFL Tour Builder
-- City: Cincinnati, OH (fanbase city of the Bengals); had zero rows in public.routes
--   and no prior tour file in this folder, ahead of Buffalo/Charlotte on the tie
--   break since those two already have a committed .sql waiting to be run.
-- Date: 2026-08-15
-- Shape: out_and_back, 10 stops
-- Distance / time: roughly 1.3 miles round trip, about 1 hour 45 minutes including
--   time standing at each stop.
-- Sports stop: stop 2, the Pete Rose statue on Crosley Terrace at Great American
--   Ball Park (100 Joe Nuxhall Way), a 2017 bronze by Cincinnati sculptor Tom
--   Tsuchiya at the ballpark's main gate.
-- Music stop: stop 5, the Cincinnati Black Music Walk of Fame (190 W Mehring Way),
--   a free riverfront walk of fame honoring Black artists and producers from
--   Cincinnati and the wider region; also the tour's turnaround point.
-- Commercial ends: stop 1, Cincinnati Lager House (start, 115 Joe Nuxhall Way), a
--   working riverfront brewery reviving the 1853 Christian Moerlein name, and
--   stop 10, Holy Grail Tavern & Grille (end, 161 Joe Nuxhall Way), about a
--   hundred yards from home plate; the two sit roughly four minutes apart on the
--   same stretch of Joe Nuxhall Way.
-- Drawn from: Marriott's published "Self Guided Walking Tour of Cincinnati,"
--   which anchors the outbound leg on the National Underground Railroad Freedom
--   Center, Smale Riverfront Park and Great American Ball Park; the return leg
--   is filled from the Banks neighborhood's own visitor directory
--   (thebankscincy.com), which lists every restaurant, bar and attraction between
--   the two stadiums, plus the Cincinnati Black Music Walk of Fame's and the
--   Andrew J. Brady Music Center's own pages. Every address and fact below was
--   independently checked against a venue, city, or press page.
-- Note: the outbound leg follows the riverfront promenade (Mehring Way) west
--   from Great American Ball Park to Paycor Stadium; the return follows Freedom
--   Way and Race Street, one block inland, so the outbound pavement is never
--   retraced. The whole walk stays inside the Banks district between the city's
--   two stadiums and never leaves it.
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
  v_ai_model := nullif(left(btrim(coalesce(payload->>'ai_model', '')), 120), '');

  if v_city is null then raise exception 'The route needs a city.'; end if;
  if v_title is null then raise exception 'The route needs a title.'; end if;
  if v_shape is null or v_shape not in (
    'loop', 'out_and_back', 'point_to_point',
    'lollipop', 'figure_eight', 'horseshoe', 'network'
  ) then
    raise exception 'shape must be one of loop, out_and_back, point_to_point, lollipop, figure_eight, horseshoe, network (got %).', coalesce(v_shape, 'null');
  end if;
  if jsonb_typeof(payload->'stops') <> 'array' or jsonb_array_length(payload->'stops') = 0 then
    raise exception 'The route needs a non-empty stops array.';
  end if;

  v_tour_id := lower(regexp_replace(v_city, '[^a-zA-Z0-9]+', '-', 'g'))
               || '-' || v_shape
               || '-' || to_char(now() at time zone 'utc', 'YYYYMMDD-HH24MISS');

  insert into public.routes (tour_id, title, shape, city)
  values (v_tour_id, v_title, v_shape, v_city);

  return query select 'route'::text, null::integer, v_title, v_tour_id, v_shape;

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
  "city": "Cincinnati",
  "state": "OH",
  "title": "Bases, Beats and the Banks",
  "shape": "out_and_back",
  "blurb": "A flat riverfront walk between Cincinnati's two stadiums, threading a carousel, a civil rights museum and a walk of fame for Black music into an hour and forty five minutes that starts and ends with a local pour.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Cincinnati Lager House",
      "address": "115 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Grab a pour of Moerlein here, a brewery founded in 1853 and revived on this spot in 1981 after Prohibition closed the original, and start the walk once your whole group has one in hand.",
      "source_url": "https://thebankscincy.com/attractions/moerlein-lager-house/"
    },
    {
      "name": "Pete Rose Statue, Crosley Terrace",
      "address": "100 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Cincinnati sculptor Tom Tsuchiya cast Pete Rose mid headfirst slide for this 2017 bronze at the ballpark gate, set among statues of Reds greats Joe Nuxhall, Ernie Lombardi, Ted Kluszewski and Frank Robinson.",
      "source_url": "https://www.mlb.com/press-release/pete-rose-statue-dedication-235981056"
    },
    {
      "name": "Carol Ann's Carousel",
      "address": "8 E Mehring Way",
      "zip": "45202",
      "description": "Forty four characters turn inside this glass riverfront pavilion, each one illustrated with a piece of Cincinnati, from steamboats to the bridge you can see through the windows.",
      "source_url": "https://www.cincinnati-oh.gov/cincyparks/visit-a-park/find-a-parkfacility/carol-anns-carousel/"
    },
    {
      "name": "National Underground Railroad Freedom Center",
      "address": "50 E Freedom Way",
      "zip": "45202",
      "description": "The Ohio River in front of this museum was the line between freedom and slavery, and its exhibits trace the routes that carried people across it toward Cincinnati and the free North.",
      "source_url": "https://activities.marriott.com/north-america/usa/ohio/cincinnati/activities/self_guided_walking_tour_of_cincinnati-X0SGVO"
    },
    {
      "name": "Cincinnati Black Music Walk of Fame",
      "address": "190 W Mehring Way",
      "zip": "45202",
      "description": "Scan the plaques set into the pavement here, a free walk of fame that Hamilton County commissioner Alicia Reece opened to honor the Black artists and producers who shaped Cincinnati and Dayton music.",
      "source_url": "https://www.cincyblackmusicwalkoffame.org/about"
    },
    {
      "name": "Andrew J. Brady Music Center",
      "address": "25 Race St",
      "zip": "45202",
      "description": "This riverfront venue opened in July 2021 with a 4,500 seat indoor theater and an 8,000 capacity outdoor stage built into the bank of the Ohio.",
      "source_url": "https://en.wikipedia.org/wiki/Andrew_J._Brady_Music_Center"
    },
    {
      "name": "Taste of Belgium, The Banks",
      "address": "16 W Freedom Way",
      "zip": "45202",
      "description": "This outpost of Cincinnati's Belgian waffle chain sits exactly between the two stadiums, a fair stop for anyone in your group still deciding which team they came to see.",
      "source_url": "https://thebankscincy.com/attractions/taste-of-belgium/"
    },
    {
      "name": "Yard House",
      "address": "95 E Freedom Way",
      "zip": "45202",
      "description": "This link in the Yard House chain keeps one of downtown's longest draft lists on tap, looking out over the plaza where you started the walk.",
      "source_url": "https://thebankscincy.com/directory/"
    },
    {
      "name": "Tom's Watch Bar",
      "address": "175 Joe Nuxhall Way",
      "zip": "45202",
      "description": "The Reds themselves partnered to open this 8,000 square foot sports bar two doors from the ballpark gate, built for exactly the kind of watching this walk has been circling all along.",
      "source_url": "https://www.mlb.com/press-release/tom-s-watch-bar-partners-with-cincinnati-reds"
    },
    {
      "name": "Holy Grail Tavern & Grille",
      "address": "161 Joe Nuxhall Way",
      "zip": "45202",
      "description": "Finish about a hundred yards from home plate on the patio here, thirty one screens behind you and the ballpark close enough to hear if the Reds are playing tonight.",
      "source_url": "https://www.yelp.com/biz/holy-grail-tavern-and-grille-cincinnati-3"
    }
  ]
}
$tgb$::jsonb);
