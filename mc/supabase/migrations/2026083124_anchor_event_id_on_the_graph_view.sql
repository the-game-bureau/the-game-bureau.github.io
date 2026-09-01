-- 2026-08-31  THE ANCHOR EVENT NEVER SAVED, BECAUSE THE VIEW COULD NOT READ IT.
--
-- Reported as `anchor event ids still not saving to games table from game
-- builder`, after the nodeless-game save was fixed earlier the same day.
-- **0 of 395 games carried one.**
--
-- `games.anchor_event_id` IS ON THE TABLE AND WAS NOT ON THE VIEW. The Game
-- Builder reads through `games_with_graph_and_teams` with an EXPLICIT column
-- list that names it, and **PostgREST 400s the WHOLE request on one unknown
-- column** -- it does not drop the field and carry on. So the read-back after
-- every write, and the read when a game is opened, both failed outright and the
-- page fell back to its own local snapshot.
--
-- THIS IS THE SAME FAULT AS `status` THIS MORNING, IN THE SAME VIEW, and that
-- is the part worth writing down: 2026083104 added one missing column and I did
-- not check whether anything ELSE the selects name was also absent. **One
-- statement answers it for every column at once**, and it is now in the verify
-- block below -- run it after ANY column is added to `public.games`.
--
-- THE DATABASE WAS RULED OUT FIRST, rather than assumed: the column is
-- `text nullable`, its foreign key points at `public.events`, **no trigger on
-- `games` touches it**, and a direct UPDATE of a real event id onto `oswald`
-- lands and reads back. The write path was never the fault.
--
-- APPENDED, NEVER REWRITTEN. `create or replace view` requires the existing
-- columns to keep their names, types AND ORDER, and a hand-written replacement
-- would drop the two `to_jsonb(...) AS away_team / home_team` columns the room
-- reads. This takes the LIVE definition and inserts one line before the FROM, so
-- `anchor_event_id` lands last and every existing reader is untouched.
--
-- Apply:  cd mc && supabase db query --linked --file supabase/migrations/2026083124_anchor_event_id_on_the_graph_view.sql

begin;

do $patch$
declare
  v_src text;
  v_out text;
  v_at  int;
begin
  select pg_get_viewdef('public.games_with_graph_and_teams'::regclass, true) into v_src;
  if v_src is null then
    raise exception 'games_with_graph_and_teams is not installed';
  end if;

  if position('anchor_event_id' in v_src) > 0 then
    raise notice 'the view already carries anchor_event_id; nothing to do';
    return;
  end if;

  -- APPENDED AFTER THE LAST COLUMN, BY NAME. `game.map_id` is the final entry
  -- in the select list and appears EXACTLY ONCE in the definition, which is
  -- asserted before anything is written.
  --
  -- THE FIRST ATTEMPT HUNTED THE OUTER `FROM` BY REVERSING THE STRING AND DOING
  -- ARITHMETIC ON THE OFFSET, and its arithmetic was wrong: it spliced the new
  -- column into the MIDDLE of `game.home_team_tgbid`, producing
  -- `game.home_team_tgb, game.anchor_event_id id`. Postgres refused it and the
  -- transaction rolled back, which is the good outcome -- but an offset computed
  -- from a reversed string is unreadable and untestable, and a named anchor with
  -- a count is neither.
  v_at := (length(v_src) - length(replace(v_src, 'game.map_id', '')))
          / length('game.map_id');
  if v_at <> 1 then
    raise exception 'expected game.map_id once, found %; read the live definition before editing', v_at;
  end if;

  v_out := 'create or replace view public.games_with_graph_and_teams as '
        || replace(v_src, 'game.map_id',
                   'game.map_id,' || chr(10) || '    game.anchor_event_id');

  execute v_out;
end
$patch$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, AND THE SECOND QUERY IS THE ONE THAT MATTERS. The first proves this
-- column landed; the second proves NOTHING ELSE the page asks for is missing,
-- which is the check that was not run after 2026083104 and is why this fault
-- got a second day.
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('status','anchor_event_id','target_audience_id','rival_audience_id');
--
--   -- EVERY COLUMN THE GAME BUILDER'S SELECTS NAME, against the view. The list
--   -- comes from `buildGamesSelectColumns([...])` in mc/games/index.html:
--   --   awk "/buildGamesSelectColumns\(\[/,/\]\)/" mc/games/index.html \
--   --     | grep -o "'[a-z_0-9]*'" | tr -d "'" | sort -u
--   -- Feed those names into a VALUES list and ask which the view lacks. It
--   -- answered `anchor_event_id` and nothing else on 2026-08-31.
--
-- AND THEN A REAL SAVE. A view that returns without error says nothing about
-- whether the room can write through it: open a game, pick an anchor event,
-- press Save, and read `games.anchor_event_id` back.
