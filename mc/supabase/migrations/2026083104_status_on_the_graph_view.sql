-- 2026-08-31  ONE STATUS FIELD, and the view has to carry it.
--
-- THE ROOM WAS SHOWING A STALE LOCAL COPY AND NOBODY COULD TELL. The Game
-- Builder reads its header list from `games_with_graph_and_teams`, and
-- 2026083028 added `games.status` to the TABLE without adding it to that VIEW.
-- So the select named a column the view does not have, PostgREST answered
-- 42703, `loadHeaderGameStoreFromSupabase` caught it and returned null, and the
-- picker fell back to the browser's own snapshot.
--
-- WHAT THAT LOOKED LIKE ON SCREEN: `GAME STATS: 2 posted + 0 building + 394
-- skipped = 396 games` over a table holding 395 rows, every one of them
-- BUILDING. Three tells, all quiet: a count one too many, a `building` of zero,
-- and a split that could only have come from `archived`, which is what the room
-- falls back to when `status` is absent.
--
-- A FAILED READ THAT RENDERS A PLAUSIBLE PAGE IS THE WORST SHAPE A BUG TAKES
-- HERE. This file records the same lesson about the soundtracks JSON fallback:
-- a stale thing that draws perfectly tells nobody it is stale.
--
-- APPENDED, NEVER REWRITTEN. The definition below is the LIVE one with one line
-- added, because `create or replace view` requires the existing columns to keep
-- their names, types AND ORDER -- and a hand-written replacement would have
-- dropped the two `to_jsonb(...) AS away_team / home_team` columns the room
-- reads. `status` goes LAST, so every existing reader is untouched.
--
-- `archived` AND `erased` ARE UNTOUCHED and both stay on the view. A trigger
-- keeps `archived` in step with `status` in both directions, so the two cannot
-- disagree; this is what makes `status` the ONE field to read.
--
-- NOTE, NOT FIXED HERE: the two joins below are against `teams_retired` on
-- `game.away_team_tgbid` / `home_team_tgbid`, and 2026083025 retired those
-- columns in place. They are null on every row, so `away_team` and `home_team`
-- come back null throughout. That is pre-existing and is a separate decision.

begin;

create or replace view public.games_with_graph_and_teams as
SELECT graph.id,
    graph.name,
    graph.primary_color,
    graph.secondary_color,
    graph.created_at,
    graph.updated_at,
    graph.archived,
    graph.erased,
    graph.city,
    graph.tagline,
    graph.body,
    graph.kind,
    graph.price,
    graph.tags,
    graph.default_emoji,
    graph.featured,
    graph.guide_name,
    graph.guide_bio,
    graph.guide_image_url,
    graph.teams,
    graph.team01,
    graph.team02,
    graph.team03,
    graph.team04,
    graph.team05,
    graph.team06,
    graph.team07,
    graph.team08,
    graph.location_based,
    graph.var_name,
    graph.anytime_pair_id,
    graph.accept_any,
    graph.anytime,
    graph.logo_url,
    graph.link_url,
    graph.button_url,
    graph.tertiary_color,
    graph.quaternary_color,
    graph.stop_group,
    graph.starting_location,
    graph.starting_location_lat,
    graph.starting_location_lon,
    graph.engine,
    graph.game_date,
    graph.start_time,
    graph.end_time,
    graph.checkout_url,
    graph.starting_location_name,
    graph.starting_location_address,
    graph.home_team_city,
    graph.home_team_mascot,
    graph.away_team_city,
    graph.away_team_mascot,
    graph.fandom_game,
    graph.primary_tag,
    graph.category_icon,
    graph.guide_background,
    graph.starting_location_plus_code,
    graph.timezone,
    graph.venue_name,
    graph.venue_city,
    graph.nodes,
    graph.links,
    game.away_team_key,
    game.home_team_key,
    game.away_team_tgbid,
    game.home_team_tgbid,
    to_jsonb(away_team.*) AS away_team,
    to_jsonb(home_team.*) AS home_team,
    game.status
   FROM (((games_with_graph graph
     JOIN games game USING (id))
     LEFT JOIN teams_retired away_team ON ((away_team.tgbid = game.away_team_tgbid)))
     LEFT JOIN teams_retired home_team ON ((home_team.tgbid = game.home_team_tgbid)));

commit;

-- Verify.
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name='status';                                   -- expect 1
--   select status, count(*) from public.games_with_graph_and_teams
--    group by status;                                 -- expect 395 building
--   -- and the two team columns must still be there:
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('away_team','home_team');               -- expect 2
