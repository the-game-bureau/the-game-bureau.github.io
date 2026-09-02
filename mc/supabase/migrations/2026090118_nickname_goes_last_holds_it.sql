-- `nickname` IS DROPPED. `last` HOLDS IT. 2026-09-01.
--
-- 2026090117 split `full_name` into `first` and `last`, and `last` IS the
-- mascot -- it was derived from `nickname` as a suffix of the name for 636 of
-- the 640 rows, and written by hand for the rest. So the column is a second
-- copy of a fact the row already carries, which is the drift this whole rebuild
-- has been removing: the club list, the destinations, `trivia.type`.
--
-- ---------------------------------------------------------------------------
-- IT IS PROVED SAFE BY COMPUTING `destinations` BOTH WAYS, not by argument.
-- ---------------------------------------------------------------------------
-- That view is the sharpest reader: `destinations.id` is built from the mascot,
-- and seven trivia rows are keyed to those ids. Computed from `last` instead of
-- `nickname` it comes out **259 rows, 0 lost, 0 gained** -- byte for byte the
-- same set. Measured before this file was written.
--
-- **ONLY THREE ROWS DISAGREE AT ALL and none of them is in that view**, which
-- is why the totals hold:
--
--   Eastern Oregon     nickname `Eastern Oregon`  last `Mountaineers`
--                      -- the nickname DUPLICATED the whole name, which is the
--                      bad data 2026090117 corrected. No home place, so it was
--                      never in destinations.
--   Taylor Swift       nickname NULL              last `Swift`
--   JFK Assassination  nickname NULL              last `Assassination`
--                      -- an artist and an interest: no team_key, so neither
--                      has ever been in destinations.
--
-- **`last` IS NEVER NULL** (640 of 640) where `nickname` was null on two, so
-- every reader gets a value where it used to get nothing.
--
-- ---------------------------------------------------------------------------
-- NINE REFERENCES ACROSS FIVE OBJECTS, FOUND WITH `strpos` AND NOT `like`.
-- ---------------------------------------------------------------------------
--   VIEW destinations   3 lines  (the id, the output column, the WHERE)
--   VIEW teams          1 line   (`a.nickname AS mascot`)
--   tgb_audience_label  2 lines
--   tgb_content_keys    2 lines
--   tgb_trivia_for      2 lines
--
-- `tgb_events_sync_team_names` AND `tgb_pull_anchor_events` ARE NOT ON THAT
-- LIST and it is worth saying why: they name `away_team_nickname` and
-- `home_team_nickname`, which are columns of `public.events` and have nothing
-- to do with this table. A search that did not also require `audiences` would
-- have sent somebody to rewrite two functions that need no change.
--
-- **THE OUTPUT NAMES DO NOT MOVE.** `destinations.nickname` and `teams.mascot`
-- keep their names and now read `a.last`; `create or replace view` refuses to
-- rename a column, which is the guard rather than a courtesy. Both engines
-- resolve a club through `teams.mascot`, so renaming it here would be a change
-- to the paid product on a day nobody asked for one.
--
-- **A PLPGSQL BODY IS STORED AS TEXT AND RESOLVED AT RUNTIME**, so the three
-- functions would NOT have blocked the drop -- they would have failed on their
-- next call, unattended, which is how this project lost `tgb_pull_walking_tours`
-- for eleven days. The views WOULD have blocked it. That asymmetry is exactly
-- why the functions are patched from their LIVE definitions below, one named
-- expression at a time, each asserting how many times it should match.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. `tgb_audience_label` -- and it gets SIMPLER, not just repointed.
-- ---------------------------------------------------------------------------
-- It computed the label as "the whole name less the mascot at the end of it".
-- That value is now stored: it is `first`. So the arithmetic goes and a column
-- read takes its place.
--   `coalesce(a.first, a.full_name)` COVERS THE ATHLETICS, whose `first` is
-- NULL because the name is entirely the mascot. They are a pro club with a
-- place, so they take the city branch above it anyway -- the coalesce is what
-- makes the fallback honest rather than a NULL label.
create or replace function public.tgb_audience_label(p_audience text)
 returns text language sql stable
as $function$
  select case
    when lower(split_part(a.team_key, ':', 1)) in ('nfl','nba','mlb','nhl')
         and p.city is not null
      then p.city
    else coalesce(a.first, a.full_name)
  end
    from public.audiences a
    left join public.places p on p.id = a.home_place_id
   where a.id = p_audience;
$function$;

-- ---------------------------------------------------------------------------
-- 2. The two functions that build a ladder rung, patched in place.
-- ---------------------------------------------------------------------------
do $$
declare
  src text;
  hits int;
begin
  -- tgb_content_keys: two `nickname` reads on the audience and the anti-audience
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_content_keys' and prokind = 'f'
     and pronamespace = 'public'::regnamespace;

  hits := (length(src) - length(replace(src, 'aud.nickname', ''))) / length('aud.nickname');
  if hits <> 2 then raise exception 'tgb_content_keys: expected 2 aud.nickname, found %', hits; end if;
  hits := (length(src) - length(replace(src, 'anti.nickname', ''))) / length('anti.nickname');
  if hits <> 2 then raise exception 'tgb_content_keys: expected 2 anti.nickname, found %', hits; end if;

  src := replace(src, 'aud.nickname', 'aud.last');
  src := replace(src, 'anti.nickname', 'anti.last');
  execute src;

  -- tgb_trivia_for: two bare `nickname` reads inside subselects on me/anti
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_trivia_for' and prokind = 'f'
     and pronamespace = 'public'::regnamespace;

  hits := (length(src) - length(replace(src, 'tgb_slug(nickname)', ''))) / length('tgb_slug(nickname)');
  if hits <> 2 then raise exception 'tgb_trivia_for: expected 2 tgb_slug(nickname), found %', hits; end if;

  src := replace(src, 'tgb_slug(nickname)', 'tgb_slug(last)');
  execute src;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The two views. THESE are what would have blocked the drop.
-- ---------------------------------------------------------------------------
create or replace view public.destinations
  with (security_invoker = true)
as
 SELECT (((a.home_place_id || '-'::text) || lower(split_part(a.team_key, ':'::text, 1))) || '-'::text)
        || lower(regexp_replace(a.last, '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS id,
    p.city,
    p.state,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    a.last AS nickname,
    /* BOTH ALIAS COLUMNS, IN THIS ORDER. The live view selects
       `audience_aliases` TWICE -- once as `aliases` and once under its own name
       -- and a `create or replace` that returns six columns where there are
       seven is refused outright with `42P16 cannot drop columns from view`.
       **That refusal is the guard doing its job**, and it is why this rewrite
       was read off `pg_get_viewdef` rather than written from the shape it
       ought to have. Tidying the duplicate away is a separate decision: it
       cannot be done with a replace at all, only a drop and recreate. */
    a.audience_aliases AS aliases,
    a.audience_aliases
   FROM audiences a
     JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.last IS NOT NULL AND a.team_key IS NOT NULL;

commit;

-- ---------------------------------------------------------------------------
-- The `teams` view and the drop go in their own transaction, because the view
-- has to be DROPPED and recreated rather than replaced: `create or replace
-- view` cannot change a column's source when the shape is being kept, and
-- dropping `nickname` while any view still selects it is refused outright.
-- ---------------------------------------------------------------------------
begin;

drop view if exists public.teams;

create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.last AS mascot,
        CASE lower(split_part(a.team_key, ':'::text, 1))
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
        CASE lower(split_part(a.team_key, ':'::text, 1))
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
    a.team_key,
    a.text AS text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- NOTHING IN THE DATABASE MAY STILL NAME IT. The views would have blocked the
-- drop; the three functions would not, so this is what stands in for that.
-- ---------------------------------------------------------------------------
do $$
declare n text;
begin
  select string_agg(proname, ', ') into n from pg_proc
   where prokind = 'f' and pronamespace = 'public'::regnamespace
     and strpos(pg_get_functiondef(oid), 'nickname') > 0
     and strpos(pg_get_functiondef(oid), 'audiences') > 0;
  if n is not null then raise exception 'still naming audiences.nickname: %', n; end if;

  select string_agg(table_name, ', ') into n from information_schema.views
   where table_schema = 'public' and strpos(view_definition, 'a.nickname') > 0;
  if n is not null then raise exception 'view still selecting a.nickname: %', n; end if;
end $$;

alter table public.audiences drop column nickname;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The counts, then CALLS THAT MAKE THE FUNCTIONS DO THEIR JOB -- a
-- `create or replace` that returns without error says nothing about whether a
-- ladder still builds or a rival still resolves.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from information_schema.columns where table_schema='public'
--     and table_name='audiences' and column_name='nickname') as nickname_gone,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations,
--   (select count(*) from public.destinations where id = 'new-orleans-la-nfl-saints') as saints,
--   (select count(*) from public.challenges c where c.kind = 'trivia'
--      and exists (select 1 from public.destinations d where d.id = c.ladder_key)) as trivia_resolving,
--   (select mascot from public.teams where team_key = 'NFL:CHI') as bears_mascot;
--
-- select public.tgb_audience_label('chicago-bears') as pro_label,
--        public.tgb_audience_label('alabama-crimson-tide') as college_label,
--        public.tgb_anti_audience('new-orleans-la', 'chicago-bears') as rival;
-- select array_to_string(public.tgb_content_keys('new-orleans-la','chicago-bears',null), ' | ') as ladder;
