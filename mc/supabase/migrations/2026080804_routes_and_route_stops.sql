-- A ROUTE is its own thing now, and a WAYPOINT is a place.
--
--   public.routes       one row per route: the id, what it is called, its shape.
--   public.route_stops  nothing but ids: which waypoints, in what order.
--   public.waypoints    one row per PLACE. No tour columns.
--
-- WHAT THIS REVERSES, and why. On 2026-08-08 tours were put ON public.waypoints
-- as columns (tour_id / tour_title / tour_shape + walk_order), so a place on two
-- walks got TWO ROWS. The argument for that was per-route text: what you say at
-- a jazz stop on a music walk is not what you say about it on a football walk,
-- and editing one must not silently edit the other.
--
-- The cost turned out to be worse than the benefit. The duplicate rows are not
-- marked as being the same place, so the catalogue silently grows a second
-- Freedom Tower every time somebody builds another downtown Miami walk; the map
-- draws two pins on one building; the importers' name+city dedupe fights the
-- design that requires the duplicate; and there is no way to ask "what routes is
-- this place on" at all. One place, one row, is the shape a catalogue wants.
--
-- THE ACCEPTED TRADE: a waypoint's description is now shared by every route it
-- appears on. Edit it once and it changes everywhere. That is a real loss and it
-- is chosen deliberately - see the merge below, which had to pick one sentence
-- out of two for seven Miami places.
--
-- DEDUPE IS ON NAME + ADDRESS, NEVER ADDRESS ALONE. One address is routinely
-- several stops: 100 W 14th Ave Pkwy in Denver is the Denver Art Museum AND the
-- Scottish Angus Cow and Calf AND Big Sweep and Monolith; 206 Washington St in
-- Boston is the Old State House AND the Boston Massacre Site; 43 Monument Sq is
-- the Bunker Hill Monument AND its museum. Collapsing on address would have
-- deleted eleven real stops.

create table if not exists public.routes (
  tour_id    text primary key,
  title      text,
  shape      text,
  city       text,
  created_at timestamptz not null default now()
);

comment on table public.routes is
  'One row per walking route. The stops are in public.route_stops; the places themselves are in public.waypoints.';
comment on column public.routes.tour_id is
  'Readable, not a sequence: city-shape-YYYYMMDD-HH24MISS. Seconds, because to the minute a re-import of the same city and shape silently merges into the first route.';
comment on column public.routes.shape is
  'loop (ends where it began) | out_and_back (same ends, different streets) | point_to_point (finishes elsewhere). Trail vocabulary.';

alter table public.routes drop constraint if exists routes_shape_known;
alter table public.routes add constraint routes_shape_known
  check (shape is null or shape in ('loop', 'out_and_back', 'point_to_point')) not valid;

-- Nothing but ids and a position. Every fact about the place lives on the
-- waypoint; every fact about the route lives on the route.
create table if not exists public.route_stops (
  tour_id text   not null references public.routes(tour_id) on delete cascade,
  wpid    bigint not null references public.waypoints(wpid) on delete cascade,
  ord     integer not null,
  primary key (tour_id, wpid)
);

comment on table public.route_stops is
  'Membership and order only. A place appears at most once per route (the primary key), which is what stops a loop from listing its first stop again at the end instead of finishing near it.';

-- on delete cascade on BOTH sides is deliberate: deleting a route should not
-- leave orphan stops, and deleting a waypoint should not leave a route pointing
-- at a place that no longer exists. The waypoint is the thing worth protecting,
-- and it is protected by being hard to delete in the UI, not by an orphan row.

create index if not exists route_stops_order_idx on public.route_stops (tour_id, ord);
create index if not exists route_stops_wpid_idx  on public.route_stops (wpid);

alter table public.routes      enable row level security;
alter table public.route_stops enable row level security;

-- Same shape as public.waypoints: anyone may read, only a signed-in admin may
-- write. A route is not a secret; it is the product.
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


-- ---------------------------------------------------------------------------
-- Migrate the three existing tours off the waypoint columns.
-- ---------------------------------------------------------------------------

insert into public.routes (tour_id, title, shape, city)
select w.tour_id,
       (array_agg(w.tour_title order by w.wpid) filter (where w.tour_title is not null))[1],
       (array_agg(w.tour_shape order by w.wpid) filter (where w.tour_shape is not null))[1],
       (array_agg(w.city       order by w.wpid) filter (where w.city       is not null))[1]
  from public.waypoints w
 where w.tour_id is not null
 group by w.tour_id
on conflict (tour_id) do nothing;

-- The same place recorded twice. Lowest wpid wins - it was there first, and the
-- routes that reference the later copy are remapped onto it below.
create temporary table wp_merge on commit drop as
with keyed as (
  select wpid,
         lower(btrim(name)) as n,
         lower(btrim(address)) as a
    from public.waypoints
   where coalesce(btrim(address), '') <> ''
     and coalesce(btrim(name), '') <> ''
)
select k.wpid as dupe_wpid, m.keep_wpid
  from keyed k
  join (select n, a, min(wpid) as keep_wpid from keyed group by n, a) m
    on m.n = k.n and m.a = k.a
 where k.wpid <> m.keep_wpid;

-- Two pairs the name+address rule cannot catch, because the two rows spell the
-- place differently. Verified by hand rather than by loosening the rule, which
-- would start merging the Bunker Hill Monument into the Bunker Hill Museum.
insert into wp_merge (dupe_wpid, keep_wpid)
select d, k from (values
  (294::bigint, 287::bigint),  -- "Gesu Catholic Church" -> "Gesu Church", 118 NE 2nd St, Miami
  (70::bigint,  59::bigint)    -- "Baltimore World Trade Center" -> "World Trade Center Baltimore"
) as v(d, k)
where exists (select 1 from public.waypoints w where w.wpid = v.d)
  and exists (select 1 from public.waypoints w where w.wpid = v.k)
  and not exists (select 1 from wp_merge m where m.dupe_wpid = v.d);

-- Anything the survivor is missing, take from the copy being removed. Only
-- blanks - never overwrite a value somebody entered.
update public.waypoints keep set
  zip         = coalesce(keep.zip,         d.zip),
  state       = coalesce(keep.state,       d.state),
  source_url  = coalesce(keep.source_url,  d.source_url),
  lat         = coalesce(keep.lat,         d.lat),
  lon         = coalesce(keep.lon,         d.lon),
  ai_model    = coalesce(keep.ai_model,    d.ai_model),
  description = coalesce(nullif(btrim(keep.description), ''), d.description)
from wp_merge m
join public.waypoints d on d.wpid = m.dupe_wpid
where keep.wpid = m.keep_wpid;

-- The route membership, with every duplicate pointed at its survivor. distinct
-- on (tour_id, wpid) because a merge can put the same place in one route twice -
-- keep its earliest position.
insert into public.route_stops (tour_id, wpid, ord)
select distinct on (w.tour_id, coalesce(m.keep_wpid, w.wpid))
       w.tour_id,
       coalesce(m.keep_wpid, w.wpid),
       coalesce(w.walk_order, 999)
  from public.waypoints w
  left join wp_merge m on m.dupe_wpid = w.wpid
 where w.tour_id is not null
 order by w.tour_id, coalesce(m.keep_wpid, w.wpid), coalesce(w.walk_order, 999)
on conflict (tour_id, wpid) do nothing;

delete from public.waypoints w using wp_merge m where w.wpid = m.dupe_wpid;

-- The tour columns are now UNREAD. They are left in place rather than dropped,
-- the same way public.maps and gift_shop_cities were retired, so a deploy that
-- has not caught up does not 400. Drop them once the Route Builder has been the
-- only editor for a while:
--
--   alter table public.waypoints
--     drop column tour_id, drop column tour_title, drop column tour_shape;
--
-- walk_order STAYS. It is not a route position - it is the per-city advisory
-- order the Suggest order button computes, and it predates tours entirely.
