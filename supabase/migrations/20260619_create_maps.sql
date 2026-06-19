-- maps — a game's ordered route of waypoints. One row per (game, waypoint):
-- the map for a game is all its rows, ordered by `ord`. Saving a game map
-- replaces that game's rows. `end` (YES/NO) marks the route's end waypoint.
-- Safe to re-run.

create table if not exists public.maps (
  id          bigint generated always as identity primary key,
  game_id     text    not null,        -- games.id (TEXT, e.g. "dal2026ari")
  waypoint_id bigint  not null,        -- waypoints.wpid
  ord         integer not null default 0,  -- 1-based order within the route
  "end"       text                     -- 'YES' marks the end stop, else 'NO'/null
);

create index if not exists maps_game_id_idx on public.maps (game_id);

comment on table public.maps is
  'A game''s ordered route of waypoints. Rows for one game_id = that game''s map.';
comment on column public.maps.game_id is 'games.id this route belongs to.';
comment on column public.maps.waypoint_id is 'waypoints.wpid for this stop.';
comment on column public.maps.ord is '1-based order of the stop within the route.';
comment on column public.maps."end" is 'YES if this is the route''s end stop, else NO/null.';

alter table public.maps enable row level security;

-- READ: public (mirrors waypoints/teams). WRITE: any signed-in admin.
drop policy if exists "maps readable by anyone" on public.maps;
create policy "maps readable by anyone" on public.maps for select using (true);

drop policy if exists "maps insert by authenticated" on public.maps;
create policy "maps insert by authenticated" on public.maps for insert to authenticated with check (true);

drop policy if exists "maps update by authenticated" on public.maps;
create policy "maps update by authenticated" on public.maps for update to authenticated using (true) with check (true);

drop policy if exists "maps delete by authenticated" on public.maps;
create policy "maps delete by authenticated" on public.maps for delete to authenticated using (true);
