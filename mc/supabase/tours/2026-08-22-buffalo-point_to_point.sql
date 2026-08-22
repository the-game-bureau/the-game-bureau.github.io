-- NFL walking tour: Buffalo (Buffalo Bills fanbase city)
-- Date: 2026-08-22
-- Shape: point_to_point, 6 stops
-- Walk: about 1.1 miles, roughly 55 to 70 minutes including time standing at each stop
-- Spine: south down Main Street from the Chippewa Street entertainment district through
--   the historic office core, a short jog west to Niagara Square, then south again to the
--   ballpark district on Washington Street. Genuinely one way; the wine bar on Chippewa and
--   the bank vault beside Sahlen Field are close to half a mile apart, not a loop.
-- Sports stop: Sahlen Field, home of the Triple A Buffalo Bisons since 1988 and the
--   Toronto Blue Jays' adopted home during the 2020 and 2021 border closure
-- Music stop: Shea's Buffalo Theatre, the 1926 movie palace that still plays its original
--   Mighty Wurlitzer pipe organ
-- Commercial ends: START at Bacchus Wine Bar & Restaurant on Chippewa Street, END at
--   Vault@237, the Prohibition themed bar in the old Marine Trust building's basement vault
--   a few doors from the ballpark
-- Drawn from: the VoiceMap audio walking tour "Shuffle Off to Buffalo" (its published stop
--   list runs Lafayette Square and the Theater District down Main Street past the Ellicott
--   Square Building and Buffalo City Hall to Sahlen Field, the same spine this walk follows
--   in a shorter, six stop form), plus each stop's own history page, all cited per stop below
-- ai_model: Anthropic Claude Sonnet 5
--
-- Buffalo held zero applied paths, tied with Cincinnati, Cleveland, Denver, Houston,
-- Indianapolis, Jacksonville, Kansas City, Las Vegas, Pittsburgh, San Francisco and Seattle.
-- Unlike Seattle, which this routine built for on an earlier run today, every one of the
-- other eleven already has an unapplied tour file sitting in this folder waiting on a human
-- to run it in the SQL editor, so the applied-route count in public.paths understates what
-- has actually been built for each of them. Buffalo's own file (2026-08-09) is the oldest of
-- that backlog, so it wins the tie break on git history over the other ten still-pending
-- cities. Worth a human's attention: eleven NFL cities now have a tour authored and
-- committed but not yet run, which is exactly the kind of gap this project's own notes warn
-- about, and this run adds Buffalo's second file to that pile rather than shrinking it.

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
  "title": "Curtain Call to First Pitch",
  "shape": "point_to_point",
  "blurb": "Six stops down Main Street: a wine bar in a Chippewa Street landmark, a 1926 movie palace with its original pipe organ, the marble atrium of what was briefly the world's largest office building, a free view from the top of Buffalo's Art Deco City Hall, the ballpark that once hosted the Blue Jays, and a Prohibition era bank vault turned bar next door to it.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Bacchus Wine Bar & Restaurant",
      "address": "56 W Chippewa St",
      "zip": "14202",
      "description": "This wine bar fills the ground floor of the historic Calumet Building right where Buffalo's Chippewa Street entertainment district begins; find your group, order a glass, and start the walk here.",
      "source_url": "https://bacchuswinebarrestaurant.restaurants-us.com/"
    },
    {
      "name": "Shea's Buffalo Theatre",
      "address": "646 Main St",
      "zip": "14202",
      "description": "Michael Shea opened this movie palace in 1926 around a Mighty Wurlitzer pipe organ that still plays today, the same stage that later hosted Frank Sinatra and the Marx Brothers; look up at the gilded ceiling on your way past.",
      "source_url": "https://www.sheas.org/plan-your-visit-buffalo/"
    },
    {
      "name": "Ellicott Square Building",
      "address": "295 Main St",
      "zip": "14203",
      "description": "Finished in 1896, this ten story block was for a moment the largest office building on earth, and its glass roofed atrium still runs the length of the block in colored marble and mosaic tile; step inside off Main Street and look up.",
      "source_url": "https://en.wikipedia.org/wiki/Ellicott_Square_Building"
    },
    {
      "name": "Buffalo City Hall",
      "address": "65 Niagara Square",
      "zip": "14202",
      "description": "This 1931 Art Deco tower rises 378 feet over the square, and its 28th floor observation deck is free and open most weekday afternoons, with a view that reaches the mist of Niagara Falls on a clear day.",
      "source_url": "https://visitbuffalo.com/businesses/buffalo-city-hall-observation-deck/"
    },
    {
      "name": "Sahlen Field",
      "address": "275 Washington St",
      "zip": "14203",
      "description": "The Buffalo Bisons have played Triple A baseball on this diamond since 1988, and when the Canadian border closed in 2020 the Toronto Blue Jays moved their home games here for the better part of two seasons.",
      "source_url": "https://www.milb.com/buffalo/ballpark/sahlen-field"
    },
    {
      "name": "Vault@237",
      "address": "237 Main St",
      "zip": "14203",
      "description": "Finish underground in the actual bank vault of the 1912 Marine Trust building, now a Prohibition themed bar a few doors from where the Bisons play; order something and stay a while.",
      "source_url": "https://vault237buffalo.com/"
    }
  ]
}
$tgb$::jsonb);
