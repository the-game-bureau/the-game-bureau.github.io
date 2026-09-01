-- ============================================================================
-- A GAME IS PLACED BY ITS CITY. THE COUNTRY GOES WITH THE START POINT.
-- ============================================================================
--
-- Applied 2026-08-31 with `supabase db query --linked --file`.
--
-- WHAT THIS DROPS: `games.country_code` and `games.country_name`.
--
-- IT FINISHES 2026083105, which dropped the seven start-location columns on the
-- same day -- `location_based`, `starting_location` and the five
-- `starting_location_*` fields. The country picker and the Start Name and Start
-- Address boxes were left on the page beside them, and the last two had been
-- writing to columns that no longer existed: **inputs that look like they save
-- and do not**, which is worse than no field at all.
--
-- THE COUNTRY IS DERIVED, NOT STORED, and it always was. `games.city` is the
-- canonical "City, State" string and `TgbGeo.parseGeo` reads a country code out
-- of it; the picker existed to set one that DISAGREED with the city, which is
-- the same field-with-one-right-answer the STATE picker was deleted for on
-- 2026-08-31. A second place to say one thing is a second place for the two to
-- disagree, and nothing on any screen would have said which was right.
--
-- MEASURED BEFORE ANYTHING WAS TOUCHED, not assumed:
--   * 395 games, 390 with a country code, 9 distinct: AUS BRA CAN DEU ESP FRA
--     GBR MEX USA. All nine derive from the city string.
--   * NOTHING OUTSIDE THE GAME BUILDER READS EITHER COLUMN. Both engines read
--     `public.games` with `select=*`, so a dropped column is simply absent
--     rather than a 400 -- and neither names `country` anywhere. The country
--     BADGE on the public pages reads `cities.country_code`, a different table.
--
-- THE VALUES ARE KEPT, which is what makes the drop safe to run. A drop is the
-- one irreversible move available, so all 395 rows go into
-- `public.games_country_retired` first, keyed by game id, exactly as
-- 2026083105 kept the start point in `games_location_retired`.
--
-- ----------------------------------------------------------------------------
-- HOW TO PUT IT BACK, if the derivation ever turns out not to be enough:
--
--   alter table public.games add column country_code text;
--   alter table public.games add column country_name text;
--   update public.games g set country_code = r.country_code,
--                             country_name = r.country_name
--     from public.games_country_retired r where r.id = g.id;
--
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. KEEP THE VALUES FIRST. Nothing is dropped until they are somewhere.
-- ---------------------------------------------------------------------------
create table if not exists public.games_country_retired as
select id, country_code, country_name
  from public.games;

comment on table public.games_country_retired is
  'Every value public.games.country_code / country_name held on 2026-08-31, '
  'kept because a drop is irreversible. The country is derived from games.city '
  'through TgbGeo.parseGeo now. Restore with an update joined on id.';

-- ---------------------------------------------------------------------------
-- 2. THE TRIGGER THAT WRITES THEM COMES FIRST, OR EVERY GAME SAVE BREAKS.
--
--    `tgb_sync_games_geo` is a BEFORE trigger on public.games that fills the
--    five geo columns from `games.city`. Two of the five are being dropped, and
--    A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT RUNTIME -- so dropping a
--    column out from under it raises nothing at drop time and nothing at deploy
--    time. IT WAITS FOR A CALLER, and then every write to public.games dies
--    with 42703.
--
--    THIS PROJECT HAS BEEN BITTEN BY THAT PROPERTY FIVE TIMES NOW, once earlier
--    the same day: 2026083025 dropped `teams.tgbid` and left this very table's
--    `infer_game_team_keys` reading it, which broke EVERY game save for a day
--    with nothing saying so. The standing rule is to grep the functions for a
--    column before dropping it, and this is what that grep found.
--
--    REWRITTEN FROM THE LIVE DEFINITION, two lines removed, never re-typed from
--    memory: a `create or replace` written afresh rewrites the WHOLE body, and
--    this project has silently lost a column that way before.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_sync_games_geo()
 returns trigger
 language plpgsql
as $function$
declare g public.tgb_geo;
begin
  g := public.tgb_parse_geo(new.city);
  new.city_name    := coalesce(nullif(new.city_name, ''),    nullif(g.city_name, ''));
  new.state_code   := coalesce(nullif(new.state_code, ''),   nullif(g.state_code, ''));
  new.state_name   := coalesce(nullif(new.state_name, ''),   nullif(g.state_name, ''));
  -- country_code and country_name were set here until 2026-08-31. They are
  -- derived from the city on the page instead, and the columns are gone.
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. THE TRIGGER ITSELF NAMES THE COLUMNS, so replacing the FUNCTION is only
--    half of it. `games_sync_geo` is scoped `UPDATE OF city, city_name,
--    state_code, state_name, country_code, country_name` -- a column list is a
--    real dependency, and Postgres refuses the drop outright:
--
--      2BP01: cannot drop column country_code of table games because other
--             objects depend on it
--
--    WHICH IS THE GOOD OUTCOME. That refusal is louder and earlier than the
--    runtime 42703 a function body would have given, and the whole migration is
--    one transaction so the first attempt rolled back with nothing changed.
--
--    NOT `DROP ... CASCADE`, which the hint suggests: cascade would take the
--    trigger silently and leave games with no geo sync at all. It is dropped
--    and re-created by name, from its own definition minus two columns.
-- ---------------------------------------------------------------------------
drop trigger if exists games_sync_geo on public.games;

create trigger games_sync_geo
  before insert or update of city, city_name, state_code, state_name
  on public.games
  for each row execute function public.tgb_sync_games_geo();

-- ---------------------------------------------------------------------------
-- 4. AND THEN THE COLUMNS GO.
-- ---------------------------------------------------------------------------
alter table public.games drop column if exists country_code;
alter table public.games drop column if exists country_name;

commit;

-- ----------------------------------------------------------------------------
-- VERIFY. Read the numbers rather than the absence of an error.
-- ----------------------------------------------------------------------------
-- Expect: gone = 0, kept = 395, with_code = 390.
--
-- select
--   (select count(*) from information_schema.columns
--     where table_schema = 'public' and table_name = 'games'
--       and column_name in ('country_code', 'country_name')) as gone,
--   (select count(*) from public.games_country_retired) as kept,
--   (select count(country_code) from public.games_country_retired) as with_code;
--
-- AND THAT NO FUNCTION STILL NAMES THEM. A plpgsql body is stored as TEXT and
-- resolves at RUNTIME, so a function naming a dropped column does not fail
-- until something calls it -- which has bitten this project four times.
-- `prokind = 'f'` is not optional: pg_get_functiondef raises on an aggregate.
--
-- select proname from pg_proc
--  where prokind = 'f' and pronamespace = 'public'::regnamespace
--    and pg_get_functiondef(oid) ilike '%country_code%';
--
-- AND THE TRIGGER MUST BE PROVED BY A WRITE, rolled back. A create-or-replace
-- that returns without error says nothing about whether the trigger runs; only
-- an update does, because that is when the body is resolved.
--
-- begin;
--   update public.games set city = city where id = (select id from public.games limit 1);
--   select city, city_name, state_code from public.games limit 1;
-- rollback;
--
-- AND THAT IT IS STILL ATTACHED, naming four columns rather than six. Dropping
-- it is the step that could leave public.games with no geo sync at all.
--
-- select pg_get_triggerdef(oid) from pg_trigger where tgname = 'games_sync_geo';
