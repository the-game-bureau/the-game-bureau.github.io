-- `team_key` AND `home_place_id` ARE BOTH DROPPED. 2026-09-01.
--
--   team_key       NFL:CHI          ->  league NFL   code CHI
--   home_place_id  new-orleans-la   ->  derived from `city`
--
-- ---------------------------------------------------------------------------
-- WHY `team_key` IS SPLIT RATHER THAN SIMPLY DELETED, AND IT IS NOT A HEDGE.
-- ---------------------------------------------------------------------------
-- Deleting the league outright was asked for and accepted, with the losses
-- listed: `teams` loses four columns, `destinations` ids change, the rival
-- loses its same-league guard. **Measuring it turned up a loss that was not on
-- that list and is a different kind of thing: `destinations.id` COLLIDES.**
--
--   259 rows  ->  258 distinct ids
--   miami-fl-panthers = Florida Panthers (NHL:FLA)
--                     + Florida International Panthers (NCAAF:FIU)
--
-- Same city, same mascot, two different clubs -- and the league is the only
-- thing that has ever told them apart. A key that is not unique is not a lesser
-- key, it is a broken one, and every trivia row and every ladder rung is keyed
-- to it. **So the column still goes; the information does not.**
--
-- `league` AND `code` ARE TWO HONEST COLUMNS WHERE ONE PACKED STRING WAS. Every
-- reader already did `split_part(team_key, ':', 1)`; they read a column now.
--
-- **`teams.team_key` KEEPS EXISTING**, recomposed as `league || ':' || code`.
-- Both engines resolve a club by matching `games.away_team_key` against it
-- through `team-palette.js`, so removing that OUTPUT column would be a change
-- to the paid product. `games.away_team_key` and `games.home_team_key` are
-- columns of a different table and are untouched.
--
-- ---------------------------------------------------------------------------
-- `home_place_id` IS DERIVED FROM `city`, AND THAT WAS MEASURED FIRST.
-- ---------------------------------------------------------------------------
-- `public.tgb_slug(a.city)` reproduces it on **all 260** rows that have one:
-- 0 disagree, 0 cities resolve to no place, 0 rows carry a city and no place.
--
-- **WHAT IS LOST IS THE FOREIGN KEY**, not the value. `audiences_home_place_id_fkey`
-- referenced `places(id)` with ON DELETE SET NULL; after this a city that is not
-- in `places` can be typed and nothing will say so. That is the same trade
-- `events.venue_city` and `waypoints.city` already made in this project.
--
-- ---------------------------------------------------------------------------
-- WHAT READS THEM: THREE VIEWS AND FIVE FUNCTIONS, found with `strpos`.
-- ---------------------------------------------------------------------------
--   VIEW destinations           both
--   VIEW teams                  both
--   VIEW game_possibilities     home_place_id
--   tgb_audience_label          both
--   tgb_anti_audience           both
--   tgb_content_keys            team_key
--   tgb_trivia_for              team_key
--   tgb_pull_walking_tours      both
--
-- **`games_with_teams` AND `games_with_graph_and_teams` ARE NOT ON THAT LIST**,
-- and it is worth saying why: their `team_key` lines are `game.away_team_key`
-- and `game.home_team_key`, columns of `public.games`. A sweep that did not
-- read the lines would have rewritten two views that need no change. The same
-- trap as `events.away_team_nickname` an hour ago.
--
-- **`infer_team_key` READS `team.team_key`, THE VIEW COLUMN**, so it survives
-- untouched -- which matters, because `infer_game_team_keys` is a BEFORE
-- trigger on `public.games` and a broken one stopped EVERY game save for a day
-- on 2026-08-31.
--
-- ---------------------------------------------------------------------------
-- THE VALUES ARE KEPT, because this is the one irreversible move here.
-- ---------------------------------------------------------------------------
-- `audiences_keys_retired` holds `id`, `team_key` and `home_place_id` for all
-- 640 rows. The league and the code are recomposable from the two new columns;
-- the retired table is what makes a mistake in this file recoverable at all.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 0. Keep what is about to go.
-- ---------------------------------------------------------------------------
drop table if exists public.audiences_keys_retired;
create table public.audiences_keys_retired as
  select id, team_key, home_place_id from public.audiences;

comment on table public.audiences_keys_retired is
  'What audiences.team_key and audiences.home_place_id held on 2026-09-01, the '
  'day both were dropped. team_key became league + code; home_place_id became '
  'tgb_slug(city). Kept because a drop is the one irreversible move.';

-- ---------------------------------------------------------------------------
-- 1. The two new columns.
-- ---------------------------------------------------------------------------
alter table public.audiences add column league text;
alter table public.audiences add column code   text;

update public.audiences
   set league = nullif(split_part(team_key, ':', 1), ''),
       code   = nullif(split_part(team_key, ':', 2), '')
 where team_key is not null;

comment on column public.audiences.league is
  'NFL, NBA, MLB, NHL, NCAAF. The first half of what was team_key until '
  '2026090119. It is what tells two clubs apart that share a city AND a mascot '
  '-- the Florida Panthers and the Florida International Panthers are both '
  'Miami and both Panthers, and without this destinations.id collides.';
comment on column public.audiences.code is
  'The club code: CHI, NO, M-OH. The second half of what was team_key. '
  'teams.team_key is recomposed as league || '':'' || code, because both game '
  'engines match games.away_team_key against it.';

-- BOTH HALVES OR NEITHER. A row with a code and no league would produce a
-- destination id with an empty segment, which is a key nobody could resolve.
do $$
declare n int;
begin
  select count(*) into n from public.audiences
   where (league is null) <> (code is null);
  if n > 0 then raise exception '% rows have one half of the key and not the other', n; end if;

  select count(*) into n from public.audiences
   where team_key is not null and team_key <> league || ':' || code;
  if n > 0 then raise exception '% rows do not recompose their team_key', n; end if;

  select count(*) into n from public.audiences
   where city is not null and btrim(city) <> ''
     and public.tgb_slug(city) is distinct from home_place_id;
  if n > 0 then raise exception '% rows: tgb_slug(city) does not equal home_place_id', n; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The five functions, PATCHED FROM THEIR LIVE DEFINITIONS.
-- ---------------------------------------------------------------------------
-- One named expression at a time, each asserting how many times it should
-- match. A `create or replace` written afresh rewrites the whole body, and this
-- project has silently lost a column that way.
do $$
declare
  src text;
  hits int;
  fn text;
  pair text[];
  pairs text[][] := array[
    ['tgb_audience_label',     'lower(split_part(a.team_key, '':'', 1))', 'lower(a.league)'],
    ['tgb_audience_label',     'a.home_place_id',                        'public.tgb_slug(a.city)'],
    ['tgb_anti_audience',      'split_part(a.team_key, '':'', 1)',       'a.league'],
    ['tgb_anti_audience',      'split_part(me.team_key, '':'', 1)',      'me.league'],
    ['tgb_anti_audience',      'a.home_place_id',                        'public.tgb_slug(a.city)'],
    ['tgb_content_keys',       'split_part(aud.team_key, '':'', 1)',     'aud.league'],
    ['tgb_content_keys',       'split_part(anti.team_key, '':'', 1)',    'anti.league'],
    ['tgb_trivia_for',         'split_part(team_key, '':'', 1)',         'league'],
    ['tgb_pull_walking_tours', 'split_part(a.team_key, '':'', 1)',       'a.league'],
    ['tgb_pull_walking_tours', 'a.home_place_id',                        'public.tgb_slug(a.city)']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    fn := pairs[i][1];
    select pg_get_functiondef(oid) into src from pg_proc
     where proname = fn and prokind = 'f' and pronamespace = 'public'::regnamespace;
    if src is null then raise exception 'no such function: %', fn; end if;

    hits := (length(src) - length(replace(src, pairs[i][2], ''))) / length(pairs[i][2]);
    if hits < 1 then
      raise exception '%: expected at least one "%", found none', fn, pairs[i][2];
    end if;
    src := replace(src, pairs[i][2], pairs[i][3]);
    execute src;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The three views.
-- ---------------------------------------------------------------------------
-- `destinations` KEEPS ITS LEAGUE SEGMENT, which is the whole point of the
-- split: `new-orleans-la-nfl-saints` is unchanged, so every trivia key still
-- resolves and the two Miami Panthers stay apart.
create or replace view public.destinations
  with (security_invoker = true)
as
 SELECT ((public.tgb_slug(a.city) || '-'::text) || lower(a.league) || '-'::text)
        || lower(regexp_replace(a.last, '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS id,
    p.city,
    p.state,
    upper(a.league) AS league,
    a.last AS nickname,
    a.audience_aliases AS aliases,
    a.audience_aliases
   FROM audiences a
     JOIN places p ON p.id = public.tgb_slug(a.city)
  WHERE a.type = 'fandom'::text AND a.last IS NOT NULL AND a.league IS NOT NULL;

create or replace view public.game_possibilities
  with (security_invoker = true)
as
 SELECT t.template_id,
    t.place_id,
    (pl.city || ', '::text) || pl.state AS place,
    t.kind,
    t.route_id IS NOT NULL AS walkable,
        CASE
            WHEN t.audience_id IS NOT NULL THEN 1
            ELSE ( SELECT count(*)::integer AS count
               FROM audiences a
              WHERE a.type = 'fandom'::text
                AND public.tgb_slug(a.city) IS DISTINCT FROM t.place_id)
        END AS audiences
   FROM game_templates t
     JOIN places pl ON pl.id = t.place_id
  WHERE t.active;

commit;

-- ---------------------------------------------------------------------------
-- `teams` is dropped and recreated in its own transaction: `create or replace
-- view` cannot change a column's source, and dropping a column any view still
-- selects is refused outright.
-- ---------------------------------------------------------------------------
begin;

drop view if exists public.teams;

create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(a.league) AS league,
    a.code,
    a.full_name,
    a.last AS mascot,
        CASE lower(a.league)
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    a."primary" AS shell,
    a.secondary AS stripe,
    a.tertiary AS mask,
        CASE lower(a.league)
            WHEN 'nfl'::text THEN 0
            WHEN 'mlb'::text THEN 1
            WHEN 'nba'::text THEN 2
            WHEN 'ncaaf'::text THEN 3
            WHEN 'nhl'::text THEN 4
            ELSE NULL::integer
        END AS league_sort,
    a.created AS updated_at,
        CASE
            WHEN p.id IS NULL THEN NULL::text
            ELSE (p.city || ', '::text) || p.state
        END AS game_city,
    /* RECOMPOSED, AND IT MUST KEEP THIS NAME. `team-palette.js` matches
       `games.away_team_key` against it, and both engines resolve a club that
       way at play time. */
    a.league || ':'::text || a.code AS team_key,
    a.text AS text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = public.tgb_slug(a.city)
  WHERE a.type = 'fandom'::text AND a.league IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nothing may still name either column. The views would have blocked the drop;
-- the functions would not -- a plpgsql body is text and fails on its next call.
-- ---------------------------------------------------------------------------
do $$
declare n text;
begin
  select string_agg(proname, ', ') into n from pg_proc
   where prokind = 'f' and pronamespace = 'public'::regnamespace
     and strpos(pg_get_functiondef(oid), 'audiences') > 0
     and (strpos(pg_get_functiondef(oid), 'a.team_key') > 0
       or strpos(pg_get_functiondef(oid), 'aud.team_key') > 0
       or strpos(pg_get_functiondef(oid), 'anti.team_key') > 0
       or strpos(pg_get_functiondef(oid), 'me.team_key') > 0
       or strpos(pg_get_functiondef(oid), 'home_place_id') > 0);
  if n is not null then raise exception 'still naming a dropped column: %', n; end if;
end $$;

alter table public.audiences drop constraint audiences_home_place_id_fkey;
alter table public.audiences drop column team_key;
alter table public.audiences drop column home_place_id;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The counts, then CALLS THAT MAKE THE CODE DO ITS JOB -- and the
-- collision that decided the shape of this file.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from information_schema.columns where table_schema='public'
--     and table_name='audiences' and column_name in ('team_key','home_place_id')) as both_gone,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select count(distinct id) from public.destinations) as distinct_dest_ids,
--   (select count(*) from public.destinations where id='new-orleans-la-nfl-saints') as saints,
--   (select count(*) from public.destinations where id like 'miami-fl-%panthers') as both_panthers,
--   (select count(*) from public.challenges c where c.kind='trivia'
--      and exists (select 1 from public.destinations d where d.id=c.ladder_key)) as trivia_resolving,
--   (select team_key from public.teams where audience_id='chicago-bears') as bears_key,
--   (select game_city from public.teams where audience_id='chicago-bears') as bears_city,
--   (select count(*) from public.game_possibilities) as possibilities;
--
-- select public.tgb_audience_label('chicago-bears') as pro_label,
--        public.tgb_anti_audience('new-orleans-la','chicago-bears') as rival;
-- select array_to_string(public.tgb_content_keys('new-orleans-la','chicago-bears',null),' | ') as ladder;
