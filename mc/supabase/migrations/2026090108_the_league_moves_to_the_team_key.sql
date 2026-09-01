-- THE LEAGUE MOVES FROM THE KEY TO `team_key`. 2026-09-01.
--
-- `family` was dropped in 2026090107 and everything that needed the league read
-- it off the key's first segment instead -- `split_part(id, '-', 1)` = `nfl`.
-- That was right while the key was `family-name`. THE KEY IS ABOUT TO BECOME
-- `slug(full_name)`, so that segment becomes `chicago`, and every reader would
-- silently start saying the league was CHICAGO.
--
-- `team_key` ALREADY CARRIES IT: `NFL:CHI`. Measured before this file was
-- written -- `upper(split_part(team_key, ':', 1))` equals the current league on
-- 639 of 639 rows that have one, with 0 differing. The two without a team_key
-- are the non-fandom rows, which both views already exclude.
--
-- WHY THIS IS A SEPARATE MIGRATION FROM THE KEY CHANGE. Done together, a
-- mistake in either half would be indistinguishable from a mistake in the
-- other. Done first, the league is provably off the key BEFORE the key moves,
-- and `destinations.id` -- which embeds the league and is what seven trivia
-- rows are keyed to -- does not move at all.
--
-- EACH FUNCTION IS PATCHED FROM ITS LIVE DEFINITION, ONE EXPRESSION AT A TIME,
-- AND EVERY REPLACEMENT DECLARES ITS COUNT. A `create or replace` written
-- afresh rewrites the whole body.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

do $$
declare src text; out text; n int;
begin
  -- ------------------------------------------------------------------ 1 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_anti_audience' and pronamespace = 'public'::regnamespace;
  out := src;
  n := (length(out) - length(replace(out, 'split_part(a.id, ''-'', 1) = split_part(me.id, ''-'', 1)', '')))
       / length('split_part(a.id, ''-'', 1) = split_part(me.id, ''-'', 1)');
  if n <> 1 then raise exception 'anti_audience: same-league matched %', n; end if;
  out := replace(out, 'split_part(a.id, ''-'', 1) = split_part(me.id, ''-'', 1)',
                      'split_part(a.team_key, '':'', 1) = split_part(me.team_key, '':'', 1)');
  execute out;

  -- ------------------------------------------------------------------ 2 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_content_keys' and pronamespace = 'public'::regnamespace;
  out := src;
  -- LOWERCASE, because a ladder rung is `new-orleans-la-nfl-bears` and the
  -- team_key holds `NFL`. Getting the case wrong would build a rung nothing
  -- matches -- and a key that resolves to nothing looks exactly like a key that
  -- resolves.
  n := (length(out) - length(replace(out, 'split_part(aud.id, ''-'', 1)', '')))
       / length('split_part(aud.id, ''-'', 1)');
  if n <> 3 then raise exception 'content_keys: aud matched %, expected 3', n; end if;
  out := replace(out, 'split_part(aud.id, ''-'', 1)', 'lower(split_part(aud.team_key, '':'', 1))');

  n := (length(out) - length(replace(out, 'split_part(anti.id, ''-'', 1)', '')))
       / length('split_part(anti.id, ''-'', 1)');
  if n <> 1 then raise exception 'content_keys: anti matched %', n; end if;
  out := replace(out, 'split_part(anti.id, ''-'', 1)', 'lower(split_part(anti.team_key, '':'', 1))');
  execute out;

  -- ------------------------------------------------------------------ 3 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_trivia_for' and pronamespace = 'public'::regnamespace;
  out := src;
  n := (length(out) - length(replace(out, 'split_part(id, ''-'', 1)', '')))
       / length('split_part(id, ''-'', 1)');
  if n <> 2 then raise exception 'trivia_for: matched %, expected 2', n; end if;
  out := replace(out, 'split_part(id, ''-'', 1)', 'lower(split_part(team_key, '':'', 1))');
  execute out;

  -- ------------------------------------------------------------------ 4 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_pull_walking_tours' and pronamespace = 'public'::regnamespace;
  out := src;
  n := (length(out) - length(replace(out, 'upper(split_part(a.id, ''-'', 1))', '')))
       / length('upper(split_part(a.id, ''-'', 1))');
  if n <> 1 then raise exception 'walking_tours: guard matched %', n; end if;
  out := replace(out, 'upper(split_part(a.id, ''-'', 1))', 'upper(split_part(a.team_key, '':'', 1))');
  execute out;
end $$;

-- ---------------------------------------------------------------------------
-- The two views. Same rows, same ids -- destinations.id keeps `nfl` in it.
-- ---------------------------------------------------------------------------
drop view if exists public.teams;
drop view if exists public.destinations;

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
    a.shell,
    a.stripe,
    a.mask,
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
    a.text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

create view public.destinations
  with (security_invoker = true)
as
 SELECT (((a.home_place_id || '-'::text) || lower(split_part(a.team_key, ':'::text, 1))) || '-'::text)
          || lower(regexp_replace(a.nickname, '[^a-zA-Z0-9]+'::text, '-'::text, 'g')) AS id,
    p.city,
    p.state,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    a.nickname,
    a.aliases
   FROM audiences a
     JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.nickname IS NOT NULL AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.destinations to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify BY CALLS THAT MAKE THEM DO THEIR JOB. A create that returns without
-- error proves nothing about a function body.
-- ---------------------------------------------------------------------------
-- select
--   public.tgb_anti_audience('new-orleans-la','nfl-chicago') as rival,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select league from public.teams where audience_id='nfl-chicago') as bears_league,
--   (select count(*) from public.challenges t where t.kind='trivia'
--      and exists (select 1 from public.destinations d where d.id=t.ladder_key)) as trivia_resolving;
--
-- select array_to_string(public.tgb_content_keys('new-orleans-la','nfl-chicago',null),' | ');
