/*
  City: San Francisco, CA (NFL fanbase city of the San Francisco 49ers)
  Date: 2026-08-27
  Shape: loop, 10 stops
  Neighborhood: Haight-Ashbury, not North Beach. San Francisco's fewest-routes
    count still points at this city (0 rows in public.paths), but a loop this
    routine built for it on 2026-08-21 is still sitting in this same folder
    unapplied, and nine of its ten stops are the same North Beach landmarks
    this run would otherwise have reached for again. Building a near-duplicate
    of an already-written, already-pending tour serves nobody, so this run
    covers a different, equally well-documented walkable district of the same
    city instead: Haight-Ashbury, which also gives a sports stop tied directly
    to the fanbase team rather than to the city in general.
  Distance and time: roughly 1.3 to 1.5 miles of walking, the outbound leg
    along Haight Street and the return leg through Buena Vista Park rather than
    back down the same pavement; call it 30 to 35 minutes of walking plus time
    at each of the ten stops, under two hours all in. The widest single leg is
    stop 3 to stop 4 (up to the Grateful Dead house on Ashbury Street and back
    toward Haight), at the upper end of the five to eight minute rule rather
    than the middle of it; noted here rather than smoothed over.
  Sports stop: stop 7, Kezar Stadium (755 Stanyan St), the original home of the
    San Francisco 49ers from 1946 to 1970, standing at the eastern edge of
    Golden Gate Park.
  Music stop: stop 4, the Grateful Dead House (710 Ashbury St), where the band
    lived and rehearsed from 1966 to 1968; stop 6, Amoeba Music (1855 Haight
    St), the world's largest independent record store, is a second music stop
    on the same walk.
  Commercial start and end: stop 1, Magnolia Brewing (1398 Haight St), and
    stop 10, Coffee to the People (1206 Masonic Ave), both open to the public
    with normal daily hours and roughly two blocks apart.
  Drawn from: musicinsf.com's self-guided San Francisco rock history tour and
    a Haight-Ashbury self-guided walking tour summarized via web search, for
    the general route and the choice of Grateful Dead House, Amoeba Music and
    the Haight and Ashbury intersection as stops. Kezar Stadium, Buena Vista
    Park and Hippie Hill were added from the San Francisco 49ers' own team site
    and Wikipedia respectively, once the sports and park-history angle was
    chosen. Piedmont Boutique, Zam Zam and Coffee to the People are drawn from
    San Francisco Heritage's legacy-business pages and each business's own
    site, not from a published tour, because none of the walking tours found
    named a specific commercial anchor for the eastern end of this route; each
    address was still verified against its own listing or history page before
    being included.
  Everything not stretched: every address below was checked against a real
    listing, official site, or history page, and one candidate stop, a house
    at 1524 Haight Street sometimes marketed as a former Jimi Hendrix
    residence, was deliberately left out after multiple sources disputed that
    he ever lived there. Washington Square and Buena Vista Park have no street
    number of their own; Buena Vista Park's address here is the Haight Street
    entrance the park's own history page names, since a public park has no
    door to number.
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
  "city": "San Francisco",
  "state": "CA",
  "title": "The Haight Loop: Kezar's Old Turf and the Dead's Front Porch",
  "shape": "loop",
  "blurb": "Two hours through the Haight-Ashbury: the corner where the Summer of Love happened, the porch the Grateful Dead lived on, the field where the 49ers were born, and the record store that outlasted all of it.",
  "ai_model": "Anthropic Claude Sonnet 5",
  "stops": [
    {
      "name": "Magnolia Brewing",
      "address": "1398 Haight St",
      "zip": "94117",
      "description": "A neighborhood brewpub on the corner of Haight and Masonic, reopened under new owners in 2024 after a brief closure and still pouring its own beer on the corner it has held since the 1990s; find your group here and start walking west.",
      "source_url": "https://magnoliabrewing.com/"
    },
    {
      "name": "Piedmont Boutique",
      "address": "1452 Haight St",
      "zip": "94117",
      "description": "A costume and lingerie shop open since 1972, marked from the sidewalk by a pair of giant fishnet legs and red high heels kicking out over the storefront; look up before you look in the window.",
      "source_url": "http://www.sfheritage.org/heritage-in-the-neighborhoods/piedmont-boutique/"
    },
    {
      "name": "Haight and Ashbury",
      "address": "Haight St at Ashbury St",
      "zip": "94117",
      "description": "The intersection that gave the neighborhood its name and the Summer of Love its postcard, where the street signs are mounted high on the pole now because souvenir hunters kept climbing up to take the old ones; stand under them and picture fifty thousand people filling this corner in the summer of 1967.",
      "source_url": "https://en.wikipedia.org/wiki/Haight-Ashbury"
    },
    {
      "name": "Grateful Dead House",
      "address": "710 Ashbury St",
      "zip": "94117",
      "description": "The purple-trimmed Victorian where Jerry Garcia, Bob Weir and the rest of the Grateful Dead lived and rehearsed from 1966 to 1968, raided by narcotics agents on a marijuana charge in October 1967 with the cameras out front; you cannot go in, but the house looks almost exactly as it did then.",
      "source_url": "https://theclio.com/entry/15969"
    },
    {
      "name": "Zam Zam",
      "address": "1633 Haight St",
      "zip": "94117",
      "description": "A Persian-themed martini bar pouring drinks under the same red lights and painted oasis mural since 1941, cash only, once run by an owner famous for throwing out anyone who ordered a drink wrong; step in for a martini before the walk turns toward the park.",
      "source_url": "http://www.sfheritage.org/heritage-in-the-neighborhoods/zam-zam/"
    },
    {
      "name": "Amoeba Music",
      "address": "1855 Haight St",
      "zip": "94117",
      "description": "The world's largest independent record store, stacked floor to ceiling inside a converted 1930s bowling alley at the edge of Golden Gate Park since 1997; flip through the bins for whatever this city was listening to the year you were born.",
      "source_url": "https://www.amoeba.com/our-stores/"
    },
    {
      "name": "Kezar Stadium",
      "address": "755 Stanyan St",
      "zip": "94117",
      "description": "The original home of the San Francisco 49ers from 1946 to 1970, where the team went 95 and 61 before moving on to Candlestick Park; the stadium standing here now is a smaller rebuild, but it sits on the same ground where the franchise learned how to win.",
      "source_url": "https://en.wikipedia.org/wiki/Kezar_Stadium"
    },
    {
      "name": "Hippie Hill",
      "address": "Kezar Dr, Golden Gate Park",
      "zip": "94117",
      "description": "A sloping lawn just inside the park's Haight Street entrance where a drum circle has gathered on weekends since the Summer of Love, an open-air stage nobody built and nobody owns; sit on the grass a minute before heading back east.",
      "source_url": "https://en.wikipedia.org/wiki/Hippie_Hill"
    },
    {
      "name": "Buena Vista Park",
      "address": "Haight St at Buena Vista Ave E",
      "zip": "94117",
      "description": "San Francisco's oldest official park, set aside as Hill Park in 1867 and climbing 575 feet over the neighborhood on wooded switchback trails; take the Haight Street stairs partway up for a view back over the roofs you just walked under.",
      "source_url": "https://en.wikipedia.org/wiki/Buena_Vista_Park"
    },
    {
      "name": "Coffee to the People",
      "address": "1206 Masonic Ave",
      "zip": "94117",
      "description": "A family-run coffeehouse a block off Haight, serving organic and fair-trade coffee under a name that borrows the neighborhood's own slogans, power to the people, coffee to the people; end here, order something, and rest before you go.",
      "source_url": "https://www.coffeetothepeople.com/location"
    }
  ]
}
$tgb$::jsonb);
