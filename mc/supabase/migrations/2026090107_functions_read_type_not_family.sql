-- THE FIVE FUNCTIONS MOVE OFF `family` AND `kind`, THEN THE COLUMNS GO.
-- 2026-09-01.
--
-- `type` replaced both on the table in 2026090106 and the views followed. These
-- are the last readers, and until they move the columns cannot be dropped: a
-- plpgsql body is stored as TEXT and resolved at RUNTIME, so dropping a column
-- out from under one raises nothing at drop time and waits for a caller. This
-- project has been bitten by that property four times -- most recently when
-- `infer_game_team_keys` broke EVERY game save for a day.
--
-- EACH FUNCTION IS PATCHED FROM ITS LIVE DEFINITION, ONE NAMED EXPRESSION AT A
-- TIME, AND EVERY REPLACEMENT DECLARES HOW MANY TIMES IT SHOULD MATCH. A
-- `create or replace` written afresh rewrites the WHOLE body, and this project
-- has silently lost a column that way -- the socials pull stopped writing
-- `confidence` for five days. A patch cannot drop what it does not touch.
--
-- WHAT REPLACES WHAT
--   a.kind = 'fandom'      ->  a.type = 'fandom'
--   a.family               ->  split_part(a.id, '-', 1)
--
-- The second is not a guess: `split_part(id, '-', 1) = family` was measured at
-- 641 of 641 with 0 mismatches before 2026090106 froze the key, and the key
-- cannot move now that it is an ordinary column.
--
-- TWO THINGS THAT LOOK LIKE FAMILY OR KIND AND ARE NOT, left alone deliberately:
--   tgb_trivia_for   `t.kind = 'trivia'`  -- that is CHALLENGES.kind
--   tgb_trivia_for   `else 'family'`      -- a returned LABEL, not a column
-- A blind rename would have taken both.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

do $$
declare
  src text;
  out text;
  n int;
  -- REPLACE ONE NAMED EXPRESSION AND ASSERT THE COUNT. Anything else is a
  -- rewrite, and a rewrite is what loses a column.
  procedure_note text;
begin
  -- ------------------------------------------------------------------ 1 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_anti_audience' and pronamespace = 'public'::regnamespace;

  out := src;
  n := (length(out) - length(replace(out, 'a.kind = ''fandom''', ''))) / length('a.kind = ''fandom''');
  if n <> 1 then raise exception 'tgb_anti_audience: a.kind matched % times', n; end if;
  out := replace(out, 'a.kind = ''fandom''', 'a.type = ''fandom''');

  n := (length(out) - length(replace(out, 'me.kind = ''fandom''', ''))) / length('me.kind = ''fandom''');
  if n <> 1 then raise exception 'tgb_anti_audience: me.kind matched % times', n; end if;
  out := replace(out, 'me.kind = ''fandom''', 'me.type = ''fandom''');

  -- THE SAME-FAMILY RULE IS THE WHOLE POINT OF THIS FUNCTION and it survives
  -- intact: an enemy must be in the same family, so a college football fan is
  -- not up against a basketball team. The family is the key's first segment.
  n := (length(out) - length(replace(out, 'a.family = me.family', ''))) / length('a.family = me.family');
  if n <> 1 then raise exception 'tgb_anti_audience: same-family matched % times', n; end if;
  out := replace(out, 'a.family = me.family',
                      'split_part(a.id, ''-'', 1) = split_part(me.id, ''-'', 1)');
  execute out;

  -- ------------------------------------------------------------------ 2 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_content_keys' and pronamespace = 'public'::regnamespace;

  out := src;
  n := (length(out) - length(replace(out, 'aud.family', ''))) / length('aud.family');
  if n <> 3 then raise exception 'tgb_content_keys: aud.family matched % times, expected 3', n; end if;
  out := replace(out, 'aud.family', 'split_part(aud.id, ''-'', 1)');

  n := (length(out) - length(replace(out, 'anti.family', ''))) / length('anti.family');
  if n <> 1 then raise exception 'tgb_content_keys: anti.family matched % times', n; end if;
  out := replace(out, 'anti.family', 'split_part(anti.id, ''-'', 1)');
  execute out;

  -- ------------------------------------------------------------------ 3 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_trivia_for' and pronamespace = 'public'::regnamespace;

  out := src;
  -- ONLY THE TWO KEY-BUILDING SUBQUERIES. `t.kind = 'trivia'` is the CHALLENGES
  -- table's own column and `else 'family'` is a label, so the pattern is the
  -- concatenation rather than the bare word.
  n := (length(out) - length(replace(out, 'p_place || ''-'' || family || ''-''', '')))
       / length('p_place || ''-'' || family || ''-''');
  if n <> 2 then raise exception 'tgb_trivia_for: key builder matched % times, expected 2', n; end if;
  out := replace(out, 'p_place || ''-'' || family || ''-''',
                      'p_place || ''-'' || split_part(id, ''-'', 1) || ''-''');
  execute out;

  -- ------------------------------------------------------------------ 4 of 4
  select pg_get_functiondef(oid) into src from pg_proc
   where proname = 'tgb_pull_walking_tours' and pronamespace = 'public'::regnamespace;

  out := src;
  -- THE MAJOR-LEAGUE GUARD. It refuses a walking tour in a town no big-league
  -- club calls home -- which is what keeps Foxborough out.
  n := (length(out) - length(replace(out, 'upper(a.family)', ''))) / length('upper(a.family)');
  if n <> 1 then raise exception 'tgb_pull_walking_tours: guard matched % times', n; end if;
  out := replace(out, 'upper(a.family)', 'upper(split_part(a.id, ''-'', 1))');
  execute out;

  -- tgb_audience_label names neither column: it reads name, nickname and
  -- home_place_id. Checked rather than assumed.
end $$;

-- ---------------------------------------------------------------------------
-- Nothing may still name them before the drop.
-- ---------------------------------------------------------------------------
do $$
declare bad text;
begin
  select string_agg(proname, ', ') into bad from pg_proc
   where pronamespace = 'public'::regnamespace and prokind = 'f'
     and pg_get_functiondef(oid) ~ '\ma\.(family|kind)\M';
  if bad is not null then raise exception 'still naming a.family or a.kind: %', bad; end if;

  select string_agg(table_name, ', ') into bad from information_schema.views
   where table_schema = 'public' and view_definition ~ '\ma\.(family|kind)\M';
  if bad is not null then raise exception 'a view still names a.family or a.kind: %', bad; end if;
end $$;

alter table public.audiences drop column family;
alter table public.audiences drop column kind;

commit;

-- ---------------------------------------------------------------------------
-- Verify. A `create or replace` that returns without error proves NOTHING about
-- a function body -- only a call that makes it do its job does.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences') as aud_cols,
--   -- the rival: a Bears fan in New Orleans is up against the Saints
--   public.tgb_anti_audience('new-orleans-la', 'nfl-chicago') as rival,
--   -- and a college fan is NOT up against a basketball club
--   public.tgb_anti_audience('new-orleans-la', 'ncaaf-alabama') as cross_family,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations;
--
-- select public.tgb_content_keys('new-orleans-la', 'nfl-chicago', null) as ladder;
