-- TEAMS MERGES INTO AUDIENCES, AND `teams` BECOMES A VIEW.
--
-- **THE TABLE CANNOT SIMPLY BE DROPPED AND THAT WAS CHECKED, NOT ASSUMED.**
-- Six foreign keys point into it -- four from `games` and two from `events` --
-- and **sixteen files read it, two of them the game engines at play time.**
-- Deleting it outright would take the paid product with it.
--
-- **AND MERELY COPYING IT INTO `audiences` WOULD BE WORSE**, because then the
-- club list exists twice again and drifts, which is the exact fault this whole
-- rebuild has been removing. So it takes the shape `destinations` already took:
-- **one table underneath, a view wearing the old name**, and every reader keeps
-- working with no idea anything moved.
--
-- ── WHAT COMES ACROSS ─────────────────────────────────────────────────────
--
-- Every column `teams` had that is a fact about the club: the colours, the
-- codes, the conference and division, the sort orders, the venue town, the
-- timezone, the espn id. `audiences` was already carrying `family`, `name`,
-- `nickname`, `home_place_id` and `team_key`.
--
-- ── THE 528 CLUBS AUDIENCES DID NOT HAVE ──────────────────────────────────
--
--   MLB 30, complete: city, fanbase, mascot and colours all present, so they
--     arrive with a home place like every other pro club.
--   NCAAF 499, incomplete: **`city_name` is NULL on all 515 college rows**, so
--     they arrive with NO home place. That is honest rather than lossy -- we
--     carry the fandom and do not know its town -- and a club with no home
--     simply never appears in `destinations` and can never be an anti-audience.
--
-- ── `fanbase` IS NOT RELIABLY THE SCHOOL, WHICH IS THE TRAP HERE ──────────
--
-- 515 college rows hold only **512 distinct** fanbase values, because three of
-- them are a city or a state rather than a school:
--
--   Los Angeles  -> UCLA and USC
--   Louisiana    -> LSU and UL
--   Miami        -> FIU and Miami
--
-- So the name is the fanbase where that is unique within the family, and the
-- CODE where it is not. Codes are what fans say for exactly these cases anyway:
-- UCLA, USC, LSU, FIU.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083022_teams_merge_into_audiences.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. THE COLUMNS THAT ARE FACTS ABOUT A CLUB.
-- ---------------------------------------------------------------------------
alter table public.audiences
  add column if not exists code         text,
  add column if not exists full_name    text,
  add column if not exists first_name   text,
  add column if not exists fanbase      text,
  add column if not exists sport        text,
  add column if not exists conference   text,
  add column if not exists division     text,
  add column if not exists shell        text,
  add column if not exists stripe       text,
  add column if not exists mask         text,
  add column if not exists text_color   text,
  add column if not exists league_sort  int,
  add column if not exists team_sort    int,
  add column if not exists game_city    text,
  add column if not exists venue_city   text,
  add column if not exists timezone     text,
  add column if not exists tgbid        text,
  add column if not exists espn_id      text,
  add column if not exists city_name    text,
  add column if not exists state_code   text,
  add column if not exists state_name   text,
  add column if not exists country_code text,
  add column if not exists country_name text;

comment on column public.audiences.shell is
  'The helmet colour, and the primary of the fandom palette. Moved from '
  'public.teams, which is now a view over this table.';
comment on column public.audiences.fanbase is
  'What public.teams held. For a college it is sometimes a CITY rather than a '
  'school -- Los Angeles for both UCLA and USC -- which is why `name` is keyed '
  'off the code where the fanbase collides.';

-- ---------------------------------------------------------------------------
-- 2. THE 16 SEC AUDIENCES GET THEIR team_key, WRITTEN OUT.
--
-- They cannot be matched on the mascot (three Tigers, two Bulldogs) and they
-- cannot be matched on the fanbase (`Oxford` and `Starkville` are towns, and
-- the audiences are named `Ole Miss` and `Mississippi State`). **Without this
-- step the insert below would create a SECOND Ole Miss.**
-- ---------------------------------------------------------------------------
update public.audiences a set team_key = v.tk
  from (values
    ('ncaaf-alabama','NCAAF:ALA'), ('ncaaf-arkansas','NCAAF:ARK'),
    ('ncaaf-auburn','NCAAF:AUB'),  ('ncaaf-florida','NCAAF:FLA'),
    ('ncaaf-georgia','NCAAF:UGA'), ('ncaaf-kentucky','NCAAF:UK'),
    ('ncaaf-lsu','NCAAF:LSU'),     ('ncaaf-missouri','NCAAF:MIZ'),
    ('ncaaf-oklahoma','NCAAF:OU'), ('ncaaf-ole-miss','NCAAF:MISS'),
    ('ncaaf-south-carolina','NCAAF:SC'), ('ncaaf-mississippi-state','NCAAF:MSST'),
    ('ncaaf-tennessee','NCAAF:TENN'), ('ncaaf-texas','NCAAF:TEX'),
    ('ncaaf-texas-a-m','NCAAF:TA&M'), ('ncaaf-vanderbilt','NCAAF:VAN')
  ) as v(id, tk)
 where a.id = v.id and a.team_key is null;

-- ---------------------------------------------------------------------------
-- 3. MLB CITIES BECOME PLACES, so those 30 clubs can have a home like the rest.
-- ---------------------------------------------------------------------------
insert into public.places (city, state)
select distinct btrim(t.city_name), btrim(t.state_code)
  from public.teams t
 where t.league = 'MLB'
   and coalesce(btrim(t.city_name), '') <> ''
   and coalesce(btrim(t.state_code), '') <> ''
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. THE 528 CLUBS AUDIENCES DID NOT HAVE.
-- ---------------------------------------------------------------------------
insert into public.audiences (family, name, kind, nickname, home_place_id, team_key)
select
  lower(t.league),
  -- THE FANBASE WHERE IT IS UNIQUE IN THE FAMILY, THE CODE WHERE IT IS NOT.
  case when dup.n > 1 then t.code else btrim(t.fanbase) end,
  'fandom',
  btrim(t.mascot),
  -- A COLLEGE HAS NO CITY IN THIS TABLE, so it gets no home. Honest, not lossy.
  case when coalesce(btrim(t.city_name), '') = '' then null
       else public.tgb_slug(t.city_name) || '-' || public.tgb_slug(t.state_code) end,
  t.team_key
  from public.teams t
  join (select league, lower(fanbase) as fb, count(*) as n
          from public.teams group by 1, 2) dup
    on dup.league = t.league and dup.fb = lower(t.fanbase)
 where not exists (select 1 from public.audiences a where a.team_key = t.team_key)
   and coalesce(btrim(t.mascot), '') <> ''
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. EVERY OTHER COLUMN, ONTO EVERY MATCHED ROW.
-- ---------------------------------------------------------------------------
update public.audiences a set
  code = t.code, full_name = t.full_name, first_name = t.first_name,
  fanbase = t.fanbase, sport = t.sport, conference = t.conference,
  division = t.division, shell = t.shell, stripe = t.stripe, mask = t.mask,
  text_color = t.text_color, league_sort = t.league_sort, team_sort = t.team_sort,
  game_city = t.game_city, venue_city = t.venue_city, timezone = t.timezone,
  tgbid = t.tgbid, espn_id = t.espn_id, city_name = t.city_name,
  state_code = t.state_code, state_name = t.state_name,
  country_code = t.country_code, country_name = t.country_name
  from public.teams t
 where a.team_key = t.team_key;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY BEFORE THE VIEW IS MADE. **The view replaces a table both engines read
-- at play time, so it is only worth making if every row and every column comes
-- back identical.** That comparison is 2026083023; this file stops here on
-- purpose, so the merge can be checked while `teams` is still the real table.
--
--   select count(*) from public.audiences;            -- expect 639 + 1 interest
--   select count(*) from public.teams t
--    where not exists (select 1 from public.audiences a where a.team_key = t.team_key);
--                                                     -- expect 0
--   select count(*) from public.audiences where kind='fandom' and shell is null;
--                                                     -- expect 0
--   select count(*) from public.audiences where family='ncaaf' and home_place_id is null;
--                                                     -- expect 499
-- ---------------------------------------------------------------------------
