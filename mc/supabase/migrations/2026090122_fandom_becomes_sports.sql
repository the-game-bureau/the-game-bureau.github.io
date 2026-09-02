-- THE TYPE `fandom` IS `sports`. 2026-09-01.
--
-- `audiences.type` is fandom / artist / interest / historical. The first becomes
-- **sports**: it is what the four values are actually distinguishing -- a club
-- you follow, as against a musician, a subject or an event -- and `fandom` is
-- the word for the FOLLOWING rather than for the kind of thing followed. An
-- artist has a fandom too.
--
-- ---------------------------------------------------------------------------
-- NINE OBJECTS MATCH THE WORD AND ONLY FOUR MEAN THIS VALUE
-- ---------------------------------------------------------------------------
-- **`games.fandom_game` AND `waypoints.partner_fandom` ARE DIFFERENT COLUMNS**,
-- and a sweep that counted matches rather than reading them would have rewritten
-- five objects that have nothing to do with `audiences.type`:
--
--   REAL    destinations          WHERE type = 'fandom'
--   REAL    teams                 WHERE type = 'fandom'
--   REAL    game_possibilities    WHERE a.type = 'fandom'
--   REAL    tgb_anti_audience     twice
--   ---
--   NOT     games_with_graph            game.fandom_game
--   NOT     games_with_teams            game.fandom_game
--   NOT     games_with_graph_and_teams  graph.fandom_game
--   NOT     tgb_pull_partner_candidates partner_fandom, v_fandom
--   NOT     tgb_content_keys            a comment, corrected below
--
-- **Reading the line rather than counting the match** is the same rule that kept
-- `game_possibilities` out of the places sever and `games_with_teams` out of the
-- team_key rewrite. It is the third time in two days.
--
-- ---------------------------------------------------------------------------
-- THE ORDER, AND WHY IT IS NOT NEGOTIABLE
-- ---------------------------------------------------------------------------
-- The CHECK has to admit BOTH words before the rows move and admit only the new
-- one after, or the update is refused by the constraint it is passing through.
-- Three steps in one transaction: widen, move, narrow.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- 1. widen, so the rows can move through it
alter table public.audiences drop constraint audiences_type;
alter table public.audiences add constraint audiences_type
  check (type is null or type in ('sports', 'fandom', 'artist', 'interest', 'historical'));

-- 2. move the rows
update public.audiences set type = 'sports' where type = 'fandom';

-- 3. narrow, so nothing can write the old word again
alter table public.audiences drop constraint audiences_type;
alter table public.audiences add constraint audiences_type
  check (type is null or type in ('sports', 'artist', 'interest', 'historical'));

comment on column public.audiences.type is
  'sports | artist | interest | historical, or NULL on a row nobody has typed '
  'yet. `sports` was `fandom` until 2026090122: a fandom is the FOLLOWING '
  'rather than the kind of thing followed, and an artist has one too.';

-- ---------------------------------------------------------------------------
-- 4. THE THREE VIEWS. `create or replace` keeps their column names, types and
--    order, which is what every reader depends on -- only the predicate moves.
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
  WHERE a.type = 'sports'::text
    AND a.last IS NOT NULL
    AND a.league IS NOT NULL
    AND a.city IS NOT NULL AND btrim(a.city) <> ''::text;

-- `teams` and `game_possibilities` are patched from their LIVE definitions, one
-- named expression at a time, each asserting how many times it should match.
-- **A rewrite from memory rewrites the whole view**, and this project has lost a
-- column that way; a replacement that declares its own count cannot.
do $$
declare
  src text;
  hits int;
  v record;
begin
  for v in select table_name, view_definition from information_schema.views
            where table_schema = 'public'
              and table_name in ('teams', 'game_possibilities')
  loop
    src := v.view_definition;
    hits := (length(src) - length(replace(src, '''fandom''::text', '')))
            / length('''fandom''::text');
    if hits <> 1 then
      raise exception '% : expected 1 fandom predicate, found %', v.table_name, hits;
    end if;
    src := replace(src, '''fandom''::text', '''sports''::text');
    execute 'create or replace view public.' || quote_ident(v.table_name)
            || ' with (security_invoker = true) as ' || src;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. `tgb_anti_audience`, patched in place. It tests the type TWICE -- once on
--    the audience being asked about and once on the one that would be its rival
--    -- and the count is asserted, so a body that has changed shape is refused
--    rather than half-patched.
-- ---------------------------------------------------------------------------
do $$
declare
  src text;
  hits int;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_anti_audience' and prokind = 'f'
     and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no tgb_anti_audience'; end if;

  hits := (length(src) - length(replace(src, '.type = ''fandom''', '')))
          / length('.type = ''fandom''');
  if hits <> 2 then raise exception 'anti_audience: expected 2, found %', hits; end if;

  src := replace(src, '.type = ''fandom''', '.type = ''sports''');
  execute src;
end $$;

-- ---------------------------------------------------------------------------
-- 6. AND THE ONE COMMENT. `tgb_content_keys` explains that a non-fandom audience
--    gets no rival rungs -- **a comment naming a value the table no longer has
--    is the same fault as a finding naming a dropped column**, which this room
--    has now been caught by twice.
-- ---------------------------------------------------------------------------
do $$
declare
  src text;
  hits int;
begin
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_content_keys' and prokind = 'f'
     and pronamespace = 'public'::regnamespace;
  if src is null then raise exception 'no tgb_content_keys'; end if;

  hits := (length(src) - length(replace(src, 'non-fandom audience', '')))
          / length('non-fandom audience');
  if hits <> 1 then raise exception 'content_keys: expected 1 comment, found %', hits; end if;

  src := replace(src, 'non-fandom audience', 'non-sports audience');
  execute src;
end $$;

-- ---------------------------------------------------------------------------
-- NOTHING MAY STILL TEST THE OLD WORD.
-- ---------------------------------------------------------------------------
do $$
declare n text;
begin
  select string_agg(proname, ', ') into n from pg_proc
   where prokind = 'f' and pronamespace = 'public'::regnamespace
     and strpos(pg_get_functiondef(oid), 'type = ''fandom''') > 0;
  if n is not null then raise exception 'still testing fandom: %', n; end if;

  select string_agg(table_name, ', ') into n from information_schema.views
   where table_schema = 'public' and strpos(view_definition, '''fandom''') > 0;
  if n is not null then raise exception 'view still testing fandom: %', n; end if;

  if exists (select 1 from public.audiences where type = 'fandom') then
    raise exception 'rows still typed fandom';
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The counts must not move: this renames a value, so every row that was
-- a fandom is a sports and every view returns exactly what it did.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences where type = 'sports') as sports_rows,
--   (select count(*) from public.audiences where type = 'fandom') as fandom_rows,
--   (select count(*) from public.destinations) as destinations,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.game_possibilities) as possibilities,
--   public.tgb_anti_audience('new-orleans-la', 'chicago-bears') as rival;
