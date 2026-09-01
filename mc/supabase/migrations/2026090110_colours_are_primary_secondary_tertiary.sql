-- THE COLOUR COLUMNS TAKE THE PRODUCT'S OWN WORDS. 2026-09-01.
--
--   shell -> primary        stripe -> secondary        mask -> tertiary
--   text_color -> text
--
-- `shell`, `stripe` and `mask` describe a HELMET, which is where the fandom
-- palette came from rather than what it is for. Everything downstream already
-- says primary / secondary / tertiary; only the storage disagreed.
--
-- THIS IS NOT A VISIBLE-COPY RENAME. The room was relabelled on 2026-08-31 and
-- the columns deliberately did not follow, because `team-palette.js` reads all
-- three BY NAME at play time. That module moves in this same commit -- it must,
-- since PostgREST 400s the whole request on one unknown column and both engines
-- resolve a club through the view.
--
-- FOUR READERS, ALL MOVED HERE
--   public.teams              the view both engines select from
--   team-palette.js           TEAM_SELECT and the palette it builds
--   mc/audiences/index.html   the room's COLUMNS and the badge's border
--   mc/assets/states/index.html   Team Colors -- ALREADY BROKEN before this and
--                             left alone; see the note at the foot.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences rename column shell      to primary_color;
alter table public.audiences rename column stripe     to secondary_color;
alter table public.audiences rename column mask       to tertiary_color;
alter table public.audiences rename column text_color to text_color_tmp;
alter table public.audiences rename column text_color_tmp to text;

comment on column public.audiences.primary_color is
  'The fandom''s first colour. Every game pitched at this audience takes its '
  'palette from it, and the readable ink is derived FROM it by luminance -- '
  'which is why `text` is stored and not used.';
comment on column public.audiences.text is
  'Retired in place. One value (#FFFFFF) across the whole table, and nothing '
  'reads it: a club''s own brand text colour can be white on its own white '
  'helmet, so teamPalette computes readable ink from the primary instead.';

-- THE VIEW FOLLOWS IN THE SAME TRANSACTION, or every read of `teams` fails.
drop view if exists public.teams;

create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.nickname AS mascot,
        CASE lower(split_part(a.team_key, ':'::text, 1))
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    -- THE VIEW KEEPS THE OLD OUTPUT NAMES, and that is deliberate: `shell`,
    -- `stripe` and `mask` are what `teamPalette` maps to primary/secondary/
    -- tertiary, and renaming the view's columns as well would mean changing the
    -- mapping AND the storage in one step. The storage is what was asked for.
    a.primary_color AS shell,
    a.secondary_color AS stripe,
    a.tertiary_color AS mask,
        CASE lower(split_part(a.team_key, ':'::text, 1))
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
    a.text AS text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------
-- Expect: the four new names present, the four old ones absent, 639 teams, and
-- the engines' own select still resolving with a real colour on it.
--
-- select
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences'
--       and column_name in ('primary_color','secondary_color','tertiary_color','text')) as new_names,
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences'
--       and column_name in ('shell','stripe','mask','text_color')) as old_names,
--   (select count(*) from public.teams) as teams,
--   (select shell from public.teams where audience_id='nfl-chicago') as bears_primary;
--
-- ALREADY BROKEN BEFORE THIS AND NOT MADE WORSE: mc/assets/states/index.html
-- (Team Colors) UPSERTS into `teams`, which has been a VIEW since 2026-08-30 and
-- is not auto-updatable. It reads `select=*`, so this rename does not change
-- what it gets back; its writes were failing already.
