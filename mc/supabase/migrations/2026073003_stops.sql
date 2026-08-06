-- Stops and Challenges.
--
-- A Stop is a place plus a challenge, and it belongs to a CITY rather than to one
-- game. Every game set in Dallas walks the same Dallas stops, so keying them to a
-- game meant the same waypoint+challenge pair had to be written once per game and
-- kept in step by hand -- which is what the old `maps` table did (game_id ->
-- waypoint_id, ord, end), with no foreign keys and no uniqueness rule.
--
-- Keying on city_slug instead means a stop is authored once. The
-- `public.game_stops` view at the bottom projects them back per game, so
-- anything that thinks in games (mc/overview.html, the engines) keeps working
-- against the shape it already expects.
--
-- `challenge_id` is NULLABLE. The Stop Builder requires one -- step 3 must be
-- answered before Add is enabled -- but the routes carried over from `maps`
-- predate challenges entirely, and a NOT NULL column would either discard every
-- historical route or need a fake placeholder attached to all of them. A stop
-- with a null challenge means "carried over, still needs one":
--
--   select * from public.stops where challenge_id is null;

create table if not exists public.challenges (
  id bigint generated always as identity primary key,
  -- Admin-facing label. Never shown to a player; `prompt` is what they read.
  name text not null,
  -- What the player is asked at the stop.
  prompt text,
  -- The expected reply. Null for kinds that have no single right answer.
  answer text,
  -- Lets an engine branch without parsing the prompt. Deliberately a small,
  -- closed set: add a value when an engine can actually render it, not in
  -- anticipation.
  kind text not null default 'question'
    check (kind in ('question', 'minigame', 'photo', 'freeform')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.challenges is
  'Reusable playable content for a stop. One challenge may be used at many '
  'stops, so editing one changes every stop that references it.';
comment on column public.challenges.name is
  'Admin label, not player-facing. The player reads prompt.';
comment on column public.challenges.kind is
  'question | minigame | photo | freeform - lets an engine branch on shape.';

create index if not exists challenges_kind_idx on public.challenges (kind);

create table if not exists public.stops (
  id bigint generated always as identity primary key,
  city_slug text not null
    references public.cities (slug) on update cascade on delete cascade,
  waypoint_id bigint not null
    references public.waypoints (wpid) on update cascade,
  -- 1-based order within the city, carried over from maps.ord. The Stop Builder
  -- does not expose ordering, but mc/overview.html still reads stops back with
  -- order=ord.asc, so new rows take the next free number rather than all
  -- defaulting to 0 and coming back in arbitrary order.
  ord integer not null default 0,
  -- The challenge played at this place. Reusable, so this is a plain FK with no
  -- unique constraint: "count the columns on the facade" works at any colonnade.
  -- Editing a challenge therefore changes every stop that uses it, the same
  -- bargain the waypoints catalog already makes.
  challenge_id bigint
    references public.challenges (id) on update cascade on delete set null,
  -- Kept as TEXT 'YES'/'NO' rather than boolean: that is what maps used and what
  -- the readers already parse. See the games-table convention in CLAUDE.md.
  "end" text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stops is
  'One place plus one challenge, in a city. Every game in that city shares it. '
  'Supersedes public.maps, which keyed the same rows to a single game.';
comment on column public.stops.city_slug is
  'public.cities.slug. A stop is authored once per city, not once per game.';
comment on column public.stops.ord is
  '1-based order of the stop within the city.';
comment on column public.stops."end" is
  'YES marks the end stop, else NO/null. TEXT, matching maps.';

create index if not exists stops_city_idx on public.stops (city_slug, ord);
create index if not exists stops_waypoint_idx on public.stops (waypoint_id);
create index if not exists stops_challenge_idx on public.stops (challenge_id)
  where challenge_id is not null;

-- One waypoint appears at most once in a city. maps never enforced its equivalent
-- and the mapper's delete-then-insert save hid it; a duplicate here means two
-- stops at the same place, which is a data error rather than a design.
create unique index if not exists stops_city_waypoint_idx
  on public.stops (city_slug, waypoint_id);

create or replace function public.tgb_touch_stops_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stops_touch_updated_at on public.stops;
create trigger stops_touch_updated_at
before update on public.stops
for each row execute function public.tgb_touch_stops_updated_at();

drop trigger if exists challenges_touch_updated_at on public.challenges;
create trigger challenges_touch_updated_at
before update on public.challenges
for each row execute function public.tgb_touch_stops_updated_at();

-- ---------------------------------------------------------------------------
-- Carry the existing routes over, collapsing them from per-game to per-city.
--
-- maps rows name a game; a stop names a city, so this resolves game -> city
-- string -> cities.slug. Rows are skipped when the game, the waypoint, or a
-- matching city row has since gone (maps had no foreign keys, so orphans are
-- possible, and a game whose city is not in the catalog cannot be placed).
--
-- Several games in one city collapse onto the same stop, which is the entire
-- point of the rekey: the lowest ord wins.
-- ---------------------------------------------------------------------------
insert into public.stops (city_slug, waypoint_id, ord, "end")
select c.slug, m.waypoint_id, min(m.ord), max(m."end")
  from public.maps m
  join public.games g on g.id = m.game_id
  join public.cities c on c.city = g.city
  join public.waypoints w on w.wpid = m.waypoint_id
 group by c.slug, m.waypoint_id
on conflict do nothing;

alter table public.challenges enable row level security;
alter table public.stops enable row level security;

drop policy if exists "Challenges are publicly readable" on public.challenges;
create policy "Challenges are publicly readable"
  on public.challenges for select using (true);

drop policy if exists "Admins can manage challenges" on public.challenges;
create policy "Admins can manage challenges"
  on public.challenges for all to authenticated using (true) with check (true);

-- Read is public, matching waypoints and maps: the engines render a game for an
-- unauthenticated player. Writes need an admin session.
drop policy if exists "Stops are publicly readable" on public.stops;
create policy "Stops are publicly readable"
  on public.stops for select using (true);

drop policy if exists "Admins can manage stops" on public.stops;
create policy "Admins can manage stops"
  on public.stops for all to authenticated using (true) with check (true);

grant select on public.stops, public.challenges to anon, authenticated;
grant insert, update, delete on public.stops, public.challenges to authenticated;

-- ---------------------------------------------------------------------------
-- Stops projected per game, for everything that thinks in games: a game gets the
-- stops of the city it is set in. mc/overview.html and mc/builder.html read this
-- instead of the table, so their existing "stops for game X" query shape still
-- works after the rekey.
-- ---------------------------------------------------------------------------
create or replace view public.game_stops as
select
  g.id as game_id,
  s.id as stop_id,
  s.city_slug,
  s.waypoint_id,
  s.challenge_id,
  s.ord,
  s."end"
from public.games g
join public.cities c on c.city = g.city
join public.stops s on s.city_slug = c.slug;

comment on view public.game_stops is
  'public.stops projected per game via the game''s city. Read-only; write to '
  'public.stops, which is keyed by city_slug.';

grant select on public.game_stops to anon, authenticated;

-- ---------------------------------------------------------------------------
-- public.maps is now superseded and no longer read by anything: mc/overview.html
-- and mc/builder.html were repointed to public.stops in the same change, and
-- mc/mapper.html (its only writer) was archived on 2026-07-30.
--
-- It is LEFT IN PLACE rather than dropped here, which is this repo's habit for a
-- retired table -- gift_shop_cities and cities.ignored were both retired the same
-- way. The rows are the only record of every route ever built, the copy above is
-- lossy by design (it drops orphans and collapses duplicate pairs), and a DROP
-- cannot be undone from a browser at 6am. Run this once the stops table has been
-- carrying live traffic long enough to trust:
--
--   drop table if exists public.maps;
-- ---------------------------------------------------------------------------
