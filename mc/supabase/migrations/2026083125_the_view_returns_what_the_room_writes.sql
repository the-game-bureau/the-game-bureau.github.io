-- 2026-08-31  THE VIEW RETURNS EVERY COLUMN THE GAME BUILDER WRITES.
--
-- 2026083124 put `anchor_event_id` on `games_with_graph_and_teams` because the
-- room ASKS for it and PostgREST 400s a read on one unknown column. That was
-- the right fix and the wrong question by half: **a column the room WRITES but
-- the view cannot RETURN is a quieter fault** -- it saves, and then reads back
-- blank, with no error anywhere.
--
-- SIX MORE ARE IN THAT STATE, found by comparing what the page writes
-- (`GAME_COLUMN_TO_NODE_FIELD`, every `payload.x =`, every `emitColumn('x')`,
-- and everything `stageCurrentGameIntoStore` puts on the row) against the view:
--
--   target_audience_id   rival_audience_id   guide_id
--   city_name            state_code          state_name
--
-- `target_audience_id` AND `rival_audience_id` ARE THE ONES THAT BITE. They are
-- written on every save and are NOT in any select list, so they never 400 and
-- never come home: a game whose audiences were set BY HAND reads back blank,
-- and the only reason the room looks right today is that picking an anchor
-- event re-derives them from the fixture.
--
-- THE THREE GEO COLUMNS ARE FILLED BY A TRIGGER from `games.city`, so the room
-- can always recompute them -- but a column the room writes and cannot read is
-- the same shape of fault whether or not it currently costs anything.
--
-- APPENDED, NEVER REWRITTEN, for the reason 2026083104 and 2026083124 both
-- record: `create or replace view` requires the existing columns to keep their
-- names, types AND ORDER, and a hand-written replacement would drop the two
-- `to_jsonb(...) AS away_team / home_team` columns the room reads. These six go
-- after `anchor_event_id`, so every existing position is untouched.
--
-- Apply:  cd mc && supabase db query --linked --file supabase/migrations/2026083125_the_view_returns_what_the_room_writes.sql

begin;

do $patch$
declare
  v_src  text;
  v_hits int;
  v_add  text;
begin
  select pg_get_viewdef('public.games_with_graph_and_teams'::regclass, true) into v_src;
  if v_src is null then
    raise exception 'games_with_graph_and_teams is not installed';
  end if;

  -- ANCHORED ON THE COLUMN 2026083124 ADDED, which is the last in the select
  -- list and must appear exactly once. A named anchor with a count, never an
  -- offset computed from a reversed string: that is what spliced a column into
  -- the middle of `game.home_team_tgbid` on the first attempt at this view.
  v_hits := (length(v_src) - length(replace(v_src, 'game.anchor_event_id', '')))
            / length('game.anchor_event_id');
  if v_hits <> 1 then
    raise exception 'expected game.anchor_event_id once, found % -- run 2026083124 first', v_hits;
  end if;

  v_add := 'game.anchor_event_id,'      || chr(10)
        || '    game.target_audience_id,' || chr(10)
        || '    game.rival_audience_id,'  || chr(10)
        || '    game.guide_id,'           || chr(10)
        || '    game.city_name,'          || chr(10)
        || '    game.state_code,'         || chr(10)
        || '    game.state_name';

  execute 'create or replace view public.games_with_graph_and_teams as '
       || replace(v_src, 'game.anchor_event_id', v_add);
end
$patch$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY. NOT the absence of an error -- a view that replaces cleanly says
-- nothing about what it returns.
--
--   -- 78 columns, and every one the room writes is among them.
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams';
--
--   -- The two that survive only as expressions must still be there.
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('away_team','home_team','status','map_id');
--
-- AND THEN A REAL SAVE. Open a game, pick an anchor event, press Save, reload,
-- and read `games.anchor_event_id` back -- that is the only thing that proves
-- the room can write through the view, and it needs an admin session.
