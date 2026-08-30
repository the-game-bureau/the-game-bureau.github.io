-- A PATH IS A ROUTE, AND A STOP IS A WAYPOINT PLUS A CHALLENGE PLUS A DIRECTION.
--
-- Two changes in one transaction, because the second is the reason for the
-- first and doing them apart would mean renaming a table nobody had finished
-- with.
--
-- 1. `paths` becomes `routes` and `path_stops` becomes `route_stops`. The word
--    has been Route before: 2026081702 renamed routes -> paths and left
--    compatibility views behind, which have since been dropped, so nothing but
--    this repo carries the old name. Kevin calls it a route; the vocabulary
--    should be the one the person using it speaks.
--
-- 2. `tour_id` becomes `route_id`. CLAUDE.md records why it was kept: "Path"
--    was taken by the canonical hierarchy, and stored `?tour=` links pointed at
--    the Path Builder. BOTH REASONS ARE GONE. Route is the name now, and the
--    Waypoints rebuild on 2026-08-29 removed the `?tour=` handling outright, so
--    there is no link shape left to protect.
--
-- 3. `route_stops` gains `challenge_id` and `direction`.
--    A STOP IS THE UNIT A PLAYER EXPERIENCES: a real place, something to do
--    there, and the words that send them to the next one. The first two were
--    two tables that could not be joined; the third has never had a home at all
--    and has been living inside each game's conversation flow, authored per
--    game rather than per stop and reusable by nobody.
--
--    The direction sits HERE rather than on the waypoint or the challenge
--    because it belongs to the LEG between two stops, and the stop is the only
--    row that knows both ends. That is the placement CLAUDE.md predicted on
--    2026-08-20 when it named the vocabulary and refused to invent a table.
--
-- WHAT THIS ARMS IF IT IS DONE CARELESSLY, and the reason the function is
-- patched in the same transaction: a plpgsql body is stored as TEXT and
-- resolved at RUN time, so renaming a table it names does not fail here, it
-- fails at the next call. `tgb_pull_walking_tours` is called unattended by TGB
-- PATH BOT twice a day, so a rename without this would break path filing
-- silently, at 08:17 UTC, with nobody watching. Same trap 2026082501 handled
-- for `tgb_pull_concert_tours` and the same fix: re-create the function from
-- its LIVE definition with identifiers substituted, never from the repo's copy
-- and never by hand. A `create or replace` written out afresh rewrites the
-- whole body, and this project has already lost a column that way.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083001_paths_become_routes_and_a_stop_gains_its_challenge.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. THE RENAME
-- ---------------------------------------------------------------------------
alter table public.paths       rename to routes;
alter table public.path_stops  rename to route_stops;

alter table public.routes      rename column tour_id to route_id;
alter table public.route_stops rename column tour_id to route_id;

-- A table called `routes` whose key is `paths_pkey` half-remembers its old
-- name. Renaming a table does NOT rename its constraints or indexes, so they
-- are swept from the catalog rather than from a list of the five this repo
-- happens to know about: anything added by hand in the dashboard moves too.
do $$
declare r record; want text;
begin
  for r in
    select c.conname, t.relname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname in ('routes', 'route_stops')
       and c.conname like 'path%'
  loop
    want := replace(replace(r.conname, 'path_stops', 'route_stops'), 'paths', 'routes');
    if want <> r.conname then
      execute format('alter table public.%I rename constraint %I to %I', r.relname, r.conname, want);
    end if;
  end loop;

  for r in
    select i.relname as iname, t.relname
      from pg_index x
      join pg_class i on i.oid = x.indexrelid
      join pg_class t on t.oid = x.indrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname in ('routes', 'route_stops')
       and i.relname like 'path%'
  loop
    want := replace(replace(r.iname, 'path_stops', 'route_stops'), 'paths', 'routes');
    if want <> r.iname then
      execute format('alter index public.%I rename to %I', r.iname, want);
    end if;
  end loop;

  for r in
    select p.polname, t.relname
      from pg_policy p
      join pg_class t on t.oid = p.polrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname in ('routes', 'route_stops')
       and p.polname ilike '%path%'
  loop
    want := replace(replace(replace(replace(r.polname,
              'path_stops', 'route_stops'), 'paths', 'routes'),
              'path stops', 'route stops'), 'path', 'route');
    if want <> r.polname then
      execute format('alter policy %I on public.%I rename to %I', r.polname, r.relname, want);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. THE JOIN THAT MAKES A STOP A STOP
-- ---------------------------------------------------------------------------

-- NULLABLE, DELIBERATELY. A stop is worth recording the moment you know where
-- it is; requiring a challenge up front would mean inventing filler to save a
-- route. The Route Builder draws an unattached stop as needing one.
alter table public.route_stops
  add column if not exists challenge_id bigint,
  add column if not exists direction text;

-- ON DELETE SET NULL, never cascade. Deleting a challenge must not silently
-- delete the stops that used it: the place and its position are still true, and
-- the route is still walkable while somebody writes a replacement.
alter table public.route_stops
  drop constraint if exists route_stops_challenge_id_fkey;
alter table public.route_stops
  add constraint route_stops_challenge_id_fkey
  foreign key (challenge_id) references public.challenges(id) on delete set null;

create index if not exists route_stops_challenge_idx
  on public.route_stops (challenge_id) where challenge_id is not null;

comment on column public.route_stops.challenge_id is
  'The challenge a team does at this stop. Waypoint + Challenge = Stop. '
  'Nullable: a stop is worth recording before its challenge is written. '
  'A challenge is REUSABLE, so this is a plain FK with no unique constraint '
  'and one challenge sits at many stops.';

comment on column public.route_stops.direction is
  'What a team is given AFTER solving this stop: what they just did, and what '
  'leads them to the next waypoint. It belongs to the LEG between two stops, '
  'which is why it sits on the stop and not on the waypoint or the challenge. '
  'Null on the last stop of a route, which leads nowhere.';

-- ---------------------------------------------------------------------------
-- 3. THE FUNCTION, PATCHED FROM WHAT IS ACTUALLY INSTALLED
-- ---------------------------------------------------------------------------
-- Identifier substitution only. `v_tour_id` -> `v_route_id` falls out of the
-- same replace and is wanted; the reply key `tour_id` becomes `route_id` with
-- it, which is a CHANGE TO THE PAYLOAD TGB PATH BOT READS BACK. Its prompt
-- reports the id in prose and nothing branches on the key, so this is a rename
-- the routine survives; if a future reader ever branches on it, that reader is
-- what has to be updated, not this.
--
-- The function takes NO tour_id on input, checked before writing this: its
-- payload keys are city, state, title, shape, ai_model, source_url, tours,
-- stops and the per-stop fields. So a global substitution cannot silently
-- change the contract the bot writes to.
do $$
declare src text; oid_ oid;
begin
  select p.oid into oid_
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tgb_pull_walking_tours'
     and p.prokind = 'f'
   limit 1;

  if oid_ is null then
    raise notice 'tgb_pull_walking_tours is not installed; nothing to patch.';
    return;
  end if;

  src := pg_get_functiondef(oid_);

  -- Assert each substitution reaches something. A replace that matches nothing
  -- returns the string unchanged and says nothing, which is how this project
  -- has shipped a page with no CSS and a function with a dropped column.
  if position('public.path_stops' in src) = 0 then
    raise exception 'expected public.path_stops in the live body; refusing to patch blind';
  end if;
  if position('tour_id' in src) = 0 then
    raise exception 'expected tour_id in the live body; refusing to patch blind';
  end if;

  src := replace(src, 'public.path_stops',  'public.route_stops');
  src := replace(src, 'public.paths',       'public.routes');
  src := replace(src, 'path_stops_pkey',    'route_stops_pkey');
  src := replace(src, 'tour_id',            'route_id');
  -- Prose in its own refusal messages, so a run reads back in the new word.
  src := replace(src, 'already has a path with this title', 'already has a route with this title');
  src := replace(src, 'a path already holds the id',        'a route already holds the id');
  src := replace(src, 'a path ends up with two stop 4s',    'a route ends up with two stop 4s');

  if position('public.path_stops' in src) > 0 or position('public.paths' in src) > 0 then
    raise exception 'a reference to the old tables survived the patch';
  end if;

  execute src;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY. Run these and read the numbers; an empty payload proves nothing.
-- ---------------------------------------------------------------------------
--
--   -- the tables moved, with their rows
--   select 'routes' t, count(*) from public.routes
--   union all select 'route_stops', count(*) from public.route_stops;
--   -- expect 22 and 234
--
--   -- nothing still names the old ones
--   select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.prokind='f'
--      and pg_get_functiondef(p.oid) ~* '(path_stops|public[.]paths)';
--   -- expect zero rows
--
--   -- the constraint the function names by name still exists
--   select conname from pg_constraint
--    where conrelid = 'public.route_stops'::regclass;
--   -- expect route_stops_pkey
--
--   -- and the new columns are there and empty
--   select count(*) filter (where challenge_id is not null) with_challenge,
--          count(*) filter (where direction   is not null) with_direction
--     from public.route_stops;
--   -- expect 0 and 0
--
-- AND PROVE THE FUNCTION WITH A CALL THAT MAKES IT DO ITS JOB. An empty
-- payload answers {"filed": 0} and looks perfectly healthy, because nothing
-- reaches the code that would fail. File one real four-stop tour in a
-- major-league city, read the reply, then delete the route and its stops.
