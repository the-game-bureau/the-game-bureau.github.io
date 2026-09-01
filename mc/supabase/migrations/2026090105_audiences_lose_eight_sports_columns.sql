-- EIGHT SPORTS-ONLY COLUMNS LEAVE `audiences`. 2026-09-01.
--
--   conference, division, first_name, fanbase, venue_city, timezone,
--   espn_id, team_sort
--
-- WHY: an audience is a FANDOM, and it can be a band's or an interest's as
-- easily as a club's. A conference, a division and a venue city are facts about
-- a sports franchise -- meaningless on the row for a band, and eight fields to
-- read past on the 639 where they do apply.
--
-- NOTHING IN THE PRODUCT READ ANY OF THEM, and that was measured rather than
-- assumed. All eight reached the outside world through ONE reader, the `teams`
-- view, and nothing depends on that view in turn (checked in pg_depend).
--
-- THE VIEW IS DROPPED AND REBUILT, NOT REPLACED. `create or replace view`
-- refuses to remove a column -- the existing ones must keep their name, type AND
-- order -- so the only way is to drop it first. It carries `security_invoker`
-- and its grants, and both are restored below: a view that silently ran as its
-- owner would hand `anon` what the grants took away, which is a leak this
-- project has already had once through `soundtrack.findings`.
--
-- TEAM_SELECT GOES WITH IT, IN THE SAME COMMIT. `mc/assets/team-palette.js`
-- names seven of these eight, and PostgREST 400s the WHOLE request on one
-- unknown column -- so leaving that list alone would break club resolution at
-- play time in BOTH engines. `team_sort` is the eighth and was never in it.
--
-- WHAT IS LOST, PLAINLY: `conference` was the only thing separating the 119 FBS
-- programmes from the 380 small colleges -- the tier that scoped this morning's
-- city fill. After this, Michigan and Adrian look alike.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

drop view if exists public.teams;

alter table public.audiences
  drop column if exists conference,
  drop column if exists division,
  drop column if exists first_name,
  drop column if exists fanbase,
  drop column if exists venue_city,
  drop column if exists timezone,
  drop column if exists espn_id,
  drop column if exists team_sort;

-- THE SAME VIEW, MINUS THE EIGHT. `league`, `sport`, `league_sort`, `code` and
-- `game_city` are all still DERIVED here rather than stored, which is the point
-- of the view -- they cannot drift from what they are derived from.
create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(a.family) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.nickname AS mascot,
        CASE a.family
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    a.shell,
    a.stripe,
    a.mask,
        CASE a.family
            WHEN 'nfl'::text THEN 0
            WHEN 'mlb'::text THEN 1
            WHEN 'nba'::text THEN 2
            WHEN 'ncaaf'::text THEN 3
            WHEN 'nhl'::text THEN 4
            ELSE NULL::integer
        END AS league_sort,
    a.updated_at,
        CASE
            WHEN p.id IS NULL THEN NULL::text
            ELSE (p.city || ', '::text) || p.state
        END AS game_city,
    a.team_key,
    a.text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.kind = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify. Read the numbers; do not trust the absence of an error.
-- ---------------------------------------------------------------------------
-- Expect: 639 rows, 14 columns, security_invoker true, and none of the eight
-- names surviving on the table or the view.
--
-- select
--   (select count(*) from public.teams) as team_rows,
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='teams') as view_cols,
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences'
--       and column_name in ('conference','division','first_name','fanbase',
--                           'venue_city','timezone','espn_id','team_sort')) as survivors,
--   (select reloptions::text from pg_class
--     where relname='teams' and relnamespace='public'::regnamespace) as opts;
--
-- AND PROVE THE ENGINES' OWN READ STILL RESOLVES -- the list in TEAM_SELECT
-- after this commit:
--   select audience_id,team_key,league,code,full_name,mascot,sport,
--          shell,stripe,mask,text_color,game_city
--     from public.teams limit 1;
