/*
 * NFL Tour Builder route
 *
 * City: Kansas City, MO
 * Date: 2026-08-20
 * Shape: point_to_point, 6 stops
 * Distance and time: roughly 0.7 miles point to point, about 75 to 100 minutes including time spent at each stop
 * Sports stop: Negro Leagues Baseball Museum, home of the Field of Legends bronze diamond (stop 3)
 * Music stop: Mutual Musicians Foundation, the National Historic Landmark where the after hours jam session began (stop 5)
 * Commercial ends: Arthur Bryant's Barbecue on Brooklyn Avenue (start, stop 1) and Vine Street Brewing Co on Vine Street (end, stop 6)
 * Sourced from: Visit KC's own 18th and Vine neighborhood guide, the African American Heritage Trail of Kansas City's entries for the Gem Theater, the Mutual Musicians Foundation and the Black Archives of Mid-America, the Negro Leagues Baseball Museum's and American Jazz Museum's own visitor pages, Arthur Bryant's own history page, and Wikipedia for the Mutual Musicians Foundation Building's National Historic Landmark listing, all cited per stop below
 * Written by: Anthropic Claude Sonnet 5
 *
 * Kansas City had zero rows in public.paths and no committed file in this
 * folder, so it was this run's strongest candidate; Kansas City, Las Vegas,
 * Nashville, Pittsburgh, San Francisco and Seattle were the only NFL fanbase
 * cities with no route at all, and Kansas City is first of those alphabetically.
 * The walk follows East 18th Street west from Brooklyn Avenue into the 18th
 * and Vine Historic Jazz District, then jogs north on Highland and Vine.
 * The American Jazz Museum shares its building with the Negro Leagues
 * Baseball Museum at 1616 East 18th Street; only the baseball museum is a
 * stop here so no two stops describe one door. The Charlie Parker Memorial
 * plaza at the Paseo and 17th Terrace was considered and left out, since it
 * carries no street number of its own to drop a pin on. No waypoint existed
 * for Kansas City in the library except The Peanut on Main Street, which
 * sits well outside this district and was left off rather than forced in.
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
  "city": "Kansas City",
  "state": "MO",
  "title": "Burnt Ends, Bases and Bebop",
  "shape": "point_to_point",
  "blurb": "A six stop walk from Kansas City's most famous barbecue pit into the 18th and Vine Jazz District, from a bronze diamond of Negro Leagues legends to the union hall where the after hours jam session was born.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Arthur Bryant's Barbecue",
      "address": "1727 Brooklyn Ave",
      "zip": "64127",
      "description": "Order burnt ends at the pit Calvin Trillin once called the single best restaurant in the world, then start walking west on 18th Street toward Vine.",
      "source_url": "https://arthurbryantsbbq.com/"
    },
    {
      "name": "Black Archives of Mid-America",
      "address": "1722 E 17th Terrace",
      "zip": "64108",
      "description": "Step into the region's leading collection of Black Midwestern history, housed in a converted early 1900s firehouse a block off 18th Street.",
      "source_url": "https://blackarchives.org/plan-a-visit/"
    },
    {
      "name": "Negro Leagues Baseball Museum",
      "address": "1616 E 18th St",
      "zip": "64108",
      "description": "Earn your way onto the Field of Legends, where bronze statues of Satchel Paige, Buck O'Neil and a dozen more take the diamond forever.",
      "source_url": "https://www.nlbm.com/visit/plan-your-visit/"
    },
    {
      "name": "Gem Theater",
      "address": "1615 E 18th St",
      "zip": "64108",
      "description": "Look up at the restored 1912 marquee that let Black Kansas City watch movies and vaudeville under segregation, and still books live jazz tonight.",
      "source_url": "https://americanjazzmuseum.org/gem-theater/"
    },
    {
      "name": "Mutual Musicians Foundation",
      "address": "1823 Highland Ave",
      "zip": "64108",
      "description": "Stand in the plain brick union hall where musicians invented the after hours jam session, a National Historic Landmark that still swings past midnight on weekends.",
      "source_url": "https://en.wikipedia.org/wiki/Mutual_Musicians%27_Foundation_Building"
    },
    {
      "name": "Vine Street Brewing Co",
      "address": "2010 Vine St",
      "zip": "64108",
      "description": "Finish with a pint at Missouri's first Black-owned brewery, a few blocks and a few generations from where the sound started.",
      "source_url": "https://vinestbrewing.com/contact"
    }
  ]
}
$tgb$::jsonb);
