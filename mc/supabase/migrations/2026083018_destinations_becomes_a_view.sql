-- `destinations` BECOMES A VIEW OVER places AND audiences.
--
-- Step three of the wireframe, and the one that buys the time for everything
-- after it: **nothing that reads a destination has to change.** Every id it
-- serves today is spelled the same way tomorrow, so every trivia key, every
-- page and every stored link keeps working while the real spine is built.
--
-- ── WHY THIS IS WORTH DOING AT ALL ────────────────────────────────────────
--
-- Right now the club list exists TWICE: 110 rows in `destinations` and the same
-- 110 in `audiences`. **Two copies of one fact drift**, and nothing would say
-- so: rename a club in one and the other goes on answering with the old name
-- forever. A view cannot drift from what it is computed from.
--
-- ── WHAT HAD TO MOVE FIRST ────────────────────────────────────────────────
--
-- 1. `audiences.nickname`. The view needs the MASCOT, and an audience is named
--    by what its members call themselves, which for a college club is the
--    SCHOOL. Alabama and Crimson Tide are both true and they are different
--    columns. Backfilled from the table before it is retired.
--
-- 2. `audiences.destination_id` IS DROPPED, and that is the point rather than a
--    casualty. With the nickname present the destination id is
--    `home_place_id + family + slug(nickname)` -- **derivable, so storing it is
--    storing a second copy of a computable fact**, which is the exact fault
--    being removed here. Verified before dropping: the derived id matched the
--    stored one for all 110, with no exceptions.
--
-- ── THE TABLE IS RETIRED IN PLACE, NOT DROPPED ────────────────────────────
--
-- Renamed to `destinations_retired`, keeping its 110 rows. The standing rule
-- here is that a drop is the one irreversible move, and this is the first step
-- of the rebuild that touches live data. **If the view is ever wrong, the table
-- is still sitting there to compare against.** The drop sits commented at the
-- bottom.
--
-- ── ONE NEW GUARD ─────────────────────────────────────────────────────────
--
-- A fandom that is at home somewhere MUST have a nickname, because that pairing
-- is exactly what a destination is. Without the CHECK, clearing a nickname
-- would make a club **silently vanish from `destinations`** -- no error, no
-- empty row, just one fewer club than there was.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083018_destinations_becomes_a_view.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. THE NICKNAME, which is not the name.
-- ---------------------------------------------------------------------------
alter table public.audiences add column if not exists nickname text;

comment on column public.audiences.nickname is
  'The mascot. NOT `name`, which is what members call themselves: Alabama and '
  'Crimson Tide are both true and they are different columns. Only a fandom has '
  'one, and a fandom with a home must have one or it vanishes from destinations.';

update public.audiences a
   set nickname = d.nickname
  from public.destinations d
 where a.destination_id = d.id
   and a.nickname is null;

-- ---------------------------------------------------------------------------
-- 2. THE GUARD. A club at home with no nickname would silently leave the view.
-- ---------------------------------------------------------------------------
alter table public.audiences drop constraint if exists audiences_home_needs_nickname;
alter table public.audiences
  add constraint audiences_home_needs_nickname
  check (not (kind = 'fandom' and home_place_id is not null and nickname is null));

-- Only a club has a mascot. An artist with one is a state nobody could read.
alter table public.audiences drop constraint if exists audiences_nickname_is_a_club;
alter table public.audiences
  add constraint audiences_nickname_is_a_club
  check (nickname is null or kind = 'fandom');

-- ---------------------------------------------------------------------------
-- 3. THE STORED COPY GOES. The destination id is derivable now.
-- ---------------------------------------------------------------------------
alter table public.audiences drop constraint if exists audiences_destination_needs_home;
alter table public.audiences drop column if exists destination_id;

-- ---------------------------------------------------------------------------
-- 4. THE TABLE IS RETIRED IN PLACE and the view takes its name.
-- ---------------------------------------------------------------------------
alter table if exists public.destinations rename to destinations_retired;

comment on table public.destinations_retired is
  'RETIRED 2026-08-30. Its 110 rows are now computed by the `destinations` VIEW '
  'from places and audiences. Kept so the view can be compared against what it '
  'replaced; nothing reads it. The drop is commented at the foot of '
  '2026083018_destinations_becomes_a_view.sql.';

create or replace view public.destinations
-- SECURITY INVOKER, or the view runs as its owner and hands `anon` whatever the
-- underlying grants were meant to withhold. Both tables under it are public
-- anyway, so this changes nothing today and is the difference between that
-- being true by design and true by luck.
with (security_invoker = true) as
select
  a.home_place_id || '-' ||
  lower(regexp_replace(a.family,   '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
  lower(regexp_replace(a.nickname, '[^a-zA-Z0-9]+', '-', 'g')) as id,
  p.city,
  p.state,
  upper(a.family) as league,
  a.nickname,
  a.aliases
  from public.audiences a
  join public.places p on p.id = a.home_place_id
 where a.kind = 'fandom'
   and a.nickname is not null;

comment on view public.destinations is
  'A place plus the club at home in it, computed rather than stored. Every id it '
  'serves is spelled exactly as the table spelled it, so every trivia key and '
  'every page keeps working. Edit a club in `audiences`; this follows.';

grant select on public.destinations to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers rather than the absence of an error.
--
--   -- the view returns exactly what the table held, id for id:
--   select count(*) from public.destinations;                    -- expect 110
--   select count(*) from public.destinations_retired;            -- expect 110
--   select count(*) from public.destinations_retired r
--    where not exists (select 1 from public.destinations v where v.id = r.id);
--                                                                -- expect 0
--   select count(*) from public.destinations v
--    where not exists (select 1 from public.destinations_retired r where r.id = v.id);
--                                                                -- expect 0
--
--   -- and every column agrees, not only the key:
--   select count(*) from public.destinations v
--     join public.destinations_retired r on r.id = v.id
--    where v.city <> r.city or v.state <> r.state or v.league <> r.league
--       or v.nickname <> r.nickname
--       or coalesce(v.aliases, '{}') <> coalesce(r.aliases, '{}');
--                                                                -- expect 0
--
--   -- the guard bites:
--   update public.audiences set nickname = null where id = 'nfl-bears';
--                                     -- expect audiences_home_needs_nickname
--
-- ---------------------------------------------------------------------------
-- ONCE THE VIEW HAS BEEN LIVE FOR A WHILE AND NOTHING HAS MISSED THE TABLE:
--   -- drop table public.destinations_retired;
-- ---------------------------------------------------------------------------
