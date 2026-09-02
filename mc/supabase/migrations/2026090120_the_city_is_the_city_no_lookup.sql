-- THE CITY IS THE CITY. NOTHING LOOKS IT UP. 2026-09-01.
--
-- `audiences.city` has been plain text on the row since 2026090119 dropped
-- `home_place_id`. **The VALUE was severed then and the READS were not**: four
-- objects still joined `public.places` on `tgb_slug(city)` to get the town back
-- out in pieces, so a club whose city we did not happen to hold in that
-- catalogue fell out of `destinations` entirely and could never be a rival.
--
-- **THAT IS 128 CLUBS.** `destinations` goes from **287 to 415**, and every one
-- of the new rows is a club that has had a city all along.
--
--   distinct ids  415 of 415  -- checked before this file was written
--
-- ---------------------------------------------------------------------------
-- THE TOWN COMES OFF THE STRING, WHICH IS SAFE AND WAS MEASURED.
-- ---------------------------------------------------------------------------
-- `audiences.city` is the canonical `City, ST` form on every row that has one:
-- **0 of 640 carry no comma, and 0 have an empty state half.** So the city is
-- `split_part(city, ', ', 1)` and the state is `split_part(city, ', ', 2)`, and
-- neither needs a table to resolve.
--
-- WHAT IS GIVEN UP, plainly: nothing checks that a city exists any more, at any
-- level. It was already true of the VALUE -- the foreign key went with
-- `home_place_id` -- and it is now true of every READER too, so a typo in a
-- city makes its own destination rather than silently making none. **A wrong
-- town is invisible and a missing one is not**, which is why the room's own red
-- pen and its `Nowhere` filter are what this leans on.
--
-- `public.places` IS NOT DROPPED and is not being retired: `game_templates`
-- keys on it, `game_possibilities` joins it for the TEMPLATE's place, and
-- `waypoints` and `events` resolve through it. **This severs the AUDIENCE's
-- link to it and nothing else.**
--
-- ---------------------------------------------------------------------------
-- FOUR READERS. `game_possibilities` LOOKS LIKE A FIFTH AND IS NOT.
-- ---------------------------------------------------------------------------
--   VIEW destinations           JOIN places, and p.city / p.state as columns
--   VIEW teams                  LEFT JOIN places, for game_city
--   tgb_audience_label          LEFT JOIN places, for the pro-club city
--   tgb_pull_walking_tours      JOIN places, for the major-league guard
--
-- **`game_possibilities` JOINS `places` ON `t.place_id`**, the TEMPLATE's place,
-- which has nothing to do with an audience. Reading the line rather than
-- counting the match is what keeps it out of a rewrite it does not need -- the
-- same trap as `game.away_team_key` and `events.away_team_nickname`.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. `tgb_audience_label` -- the join goes and the function gets shorter.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_audience_label(p_audience text)
 returns text language sql stable
as $function$
  select case
    when lower(a.league) in ('nfl','nba','mlb','nhl')
         and nullif(btrim(split_part(a.city, ', ', 1)), '') is not null
      then btrim(split_part(a.city, ', ', 1))
    else coalesce(a.first, a.full_name)
  end
    from public.audiences a
   where a.id = p_audience;
$function$;

-- ---------------------------------------------------------------------------
-- 2. `tgb_pull_walking_tours` -- patched in place, from the LIVE definition.
-- ---------------------------------------------------------------------------
-- Its major-league guard joined `places` only to get the bare city; that is the
-- half of the string before the comma. **One named expression at a time, with
-- the match count asserted** -- a `create or replace` written afresh rewrites
-- the whole body, and this project has silently lost a column that way.
do $$
declare
  src text;
  hits int;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_pull_walking_tours' and prokind = 'f'
     and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no tgb_pull_walking_tours'; end if;

  hits := (length(src) - length(replace(src, 'join public.places p on p.id = public.tgb_slug(a.city)', '')))
          / length('join public.places p on p.id = public.tgb_slug(a.city)');
  if hits <> 1 then raise exception 'walking tours: expected 1 places join, found %', hits; end if;

  hits := (length(src) - length(replace(src, 'coalesce(p.city, '''')', '')))
          / length('coalesce(p.city, '''')');
  if hits <> 2 then raise exception 'walking tours: expected 2 p.city reads, found %', hits; end if;

  src := replace(src, 'join public.places p on p.id = public.tgb_slug(a.city)', '');
  src := replace(src, 'coalesce(p.city, '''')', 'split_part(a.city, '', '', 1)');
  execute src;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The two views.
-- ---------------------------------------------------------------------------
create or replace view public.destinations
  with (security_invoker = true)
as
 SELECT ((public.tgb_slug(a.city) || '-'::text) || lower(a.league) || '-'::text)
        || lower(regexp_replace(a.last, '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS id,
    btrim(split_part(a.city, ', '::text, 1)) AS city,
    btrim(split_part(a.city, ', '::text, 2)) AS state,
    upper(a.league) AS league,
    a.last AS nickname,
    a.audience_aliases AS aliases,
    a.audience_aliases
   FROM audiences a
  WHERE a.type = 'fandom'::text
    AND a.last IS NOT NULL
    AND a.league IS NOT NULL
    AND a.city IS NOT NULL AND btrim(a.city) <> ''::text;

commit;

-- ---------------------------------------------------------------------------
-- `teams` is dropped and recreated: `create or replace view` cannot change a
-- column's source, and `game_city` stops being a join.
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
    /* THE CITY IS THE ROW'S OWN, NOT A JOIN. It was
       `(p.city || ', ') || p.state` off `places`, which is exactly what
       `audiences.city` already holds -- so the join was rebuilding a string it
       had taken apart. `nullif` keeps the NULL a club with no city always gave. */
    nullif(btrim(a.city), '') AS game_city,
    a.league || ':'::text || a.code AS team_key,
    a.text AS text_color
   FROM audiences a
  WHERE a.type = 'fandom'::text AND a.league IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- NOTHING READING `audiences` MAY STILL JOIN `places`.
-- ---------------------------------------------------------------------------
do $$
declare n text;
begin
  select string_agg(proname, ', ') into n from pg_proc
   where prokind = 'f' and pronamespace = 'public'::regnamespace
     and strpos(pg_get_functiondef(oid), 'audiences') > 0
     and strpos(pg_get_functiondef(oid), 'places p') > 0;
  if n is not null then raise exception 'still joining places: %', n; end if;

  select string_agg(table_name, ', ') into n from information_schema.views
   where table_schema = 'public'
     and table_name in ('destinations', 'teams')
     and strpos(view_definition, 'places') > 0;
  if n is not null then raise exception 'view still joining places: %', n; end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The growth, the uniqueness, and CALLS THAT MAKE THE CODE DO ITS JOB.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.destinations) as destinations,
--   (select count(distinct id) from public.destinations) as distinct_ids,
--   (select count(*) from public.destinations where id = 'new-orleans-la-nfl-saints') as saints,
--   (select count(*) from public.destinations where id like 'miami-fl-%panthers') as both_panthers,
--   (select count(*) from public.challenges c where c.kind = 'trivia'
--      and exists (select 1 from public.destinations d where d.id = c.ladder_key)) as trivia_resolving,
--   (select count(*) from public.teams) as teams,
--   (select game_city from public.teams where audience_id = 'chicago-bears') as bears_city,
--   (select city || ' / ' || state from public.destinations
--     where id = 'new-orleans-la-nfl-saints') as saints_place,
--   (select count(*) from public.game_possibilities) as possibilities;
--
-- select public.tgb_audience_label('chicago-bears') as pro_label,
--        public.tgb_audience_label('alabama-crimson-tide') as college_label,
--        public.tgb_anti_audience('new-orleans-la', 'chicago-bears') as rival;
