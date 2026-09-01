-- 2026083131  `logo_id` GOES ON THE GRAPH VIEW, SO THE ROOM CAN READ WHAT IT WRITES
-- ===========================================================================
-- The Game Builder reads `games_with_graph_and_teams` and WRITES `public.games`.
-- A column on the table and not on the view is a column the room writes blind,
-- and this project has now been bitten by that twice in one day:
--
--   status            written, missing from the SELECT -> the dot snapped back
--   anchor_event_id   asked for, missing from the VIEW -> the read 400d, the
--                     column was switched off, and it stopped SAVING ENTIRELY
--
-- `guide_id` has the same shape and was answered differently -- with a
-- per-game, one-column fetch from the base table, because at the time the view
-- was believed unfixable ("create or replace cannot insert a column ahead of
-- nodes and links"). That is true of INSERTING one. APPENDING one works, which
-- is how 2026083124 and 2026083125 added seven columns earlier today.
--
-- So `logo_id` is appended rather than worked around. `guide_id`'s fetch is
-- left alone: it works, and removing it is a change to a path the room already
-- depends on.
--
-- THE APPEND IS ANCHORED ON A NAMED COLUMN AND ASSERTS ITS OWN MATCH COUNT.
-- `create or replace view` requires the existing columns to keep their names,
-- types AND order, so the new one may only go on the END. A blind string
-- replace here spliced into the middle of another column's name once and
-- Postgres refused it -- correctly, and after a rollback.
--
-- APPLY BY HAND, then read the Verify block.

do $$
declare
  def text;
  -- THE LAST COLUMN, NOT A CONVENIENT ONE. The first attempt anchored on
  -- game.map_id, which WAS last when the previous two appends were written
  -- and is now followed by seven more -- so the splice landed mid-list and
  -- Postgres refused it with 42P16 "cannot change name of view column
  -- anchor_event_id to logo_id". That is the good outcome: a rename would
  -- have been silent corruption of every reader. Re-read the definition
  -- before choosing an anchor; do not reuse the one that worked last time.
  anchor text := 'game.state_name';
  hits int;
begin
  select pg_get_viewdef('public.games_with_graph_and_teams'::regclass, true) into def;

  if position('game.logo_id' in def) > 0 then
    raise notice 'logo_id is already on the view; nothing to do.';
    return;
  end if;

  -- HOW MANY TIMES THE ANCHOR APPEARS. Exactly one, or this refuses rather
  -- than guessing which occurrence to splice after.
  select count(*) into hits
    from regexp_matches(def, anchor, 'g');
  if hits <> 1 then
    raise exception 'expected the anchor % once, found % -- refusing to splice', anchor, hits;
  end if;

  def := replace(def, anchor, anchor || ',' || chr(10) || '    game.logo_id');

  execute 'create or replace view public.games_with_graph_and_teams as ' || def;
end $$;

-- ===========================================================================
-- VERIFY. The column is on the view, it is last, and the view still answers.
--
--   select count(*) as cols from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams';
--
--   select column_name, ordinal_position from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('logo_id','map_id','anchor_event_id')
--    order by ordinal_position;
--
--   select count(*) as rows_readable from public.games_with_graph_and_teams;
