-- 2026-08-31  A GAME NAMES ITS ATLAS.
--
-- `games.atlas_id`, and the Game Builder gets an ATLAS box under the anchor.
--
-- IT IS NOT A FOREIGN KEY, AND IT CANNOT BE. `public.atlases` is keyed by
-- `(atlas_id, stop_number)` because an atlas IS its rows -- the id repeats once
-- per stop -- so `atlas_id` alone is not unique and has nothing for a key to
-- reference. Making it unique would mean an atlas could hold one stop.
--   WHAT THAT COSTS, said rather than discovered: **nothing stops a game naming
--   an atlas that does not exist, and no screen will tell you.** It is the same
--   trade `events.venue_city`, `waypoints.city` and `gift_shop_listings.city`
--   all make. The room only offers atlases that exist, which is where the guard
--   actually lives; a value typed or pasted around it is on its own.
--   IF IT EVER NEEDS ENFORCING, the answer is an `atlas` header table with one
--   row per atlas that `atlases` and `games` both point at -- which is a real
--   change to the shape that was asked for, not a tidy-up.
--
-- AND IT GOES ON THE VIEW IN THE SAME BREATH. 2026083028 added `status` to the
-- games TABLE and not to `games_with_graph_and_teams`, which is the view the
-- Game Builder reads: the select named a column the view lacked, PostgREST
-- answered 42703, the fetch was swallowed by a catch, and the room showed a
-- STALE LOCAL COPY for a day with three quiet tells and nobody able to see any
-- of them. That was fixed this morning in 2026083104 and the lesson is applied
-- here before it can happen again.
--
-- APPENDED, NEVER REWRITTEN. `create or replace view` requires the existing
-- columns to keep their names, types AND ORDER, and a hand-written replacement
-- would drop the two `to_jsonb(...) AS away_team / home_team` columns the room
-- reads. `atlas_id` goes LAST, so every existing reader is untouched.

begin;

alter table public.games add column if not exists atlas_id text;

comment on column public.games.atlas_id is
  'The atlas this game walks. NOT a foreign key: atlases is keyed by '
  '(atlas_id, stop_number), so the id alone is not unique. Nothing enforces '
  'that the atlas exists; the Game Builder only offers ones that do.';

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
    NULL::boolean AS location_based,
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
    NULL::text AS starting_location,
    NULL::double precision AS starting_location_lat,
    NULL::double precision AS starting_location_lon,
    graph.engine,
    graph.game_date,
    graph.start_time,
    graph.end_time,
    graph.checkout_url,
    NULL::text AS starting_location_name,
    NULL::text AS starting_location_address,
    graph.home_team_city,
    graph.home_team_mascot,
    graph.away_team_city,
    graph.away_team_mascot,
    graph.fandom_game,
    graph.primary_tag,
    graph.category_icon,
    graph.guide_background,
    NULL::text AS starting_location_plus_code,
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
    game.status,
    game.atlas_id
   FROM (((games_with_graph graph
     JOIN games game USING (id))
     LEFT JOIN teams_retired away_team ON ((away_team.tgbid = game.away_team_tgbid)))
     LEFT JOIN teams_retired home_team ON ((home_team.tgbid = game.home_team_tgbid)));

commit;

-- Verify.
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games' and column_name='atlas_id';
--                                                                    -- expect 1
--   -- ON THE VIEW TOO, which is the half that has already been forgotten once
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('atlas_id','status','away_team','home_team');
--                                                                    -- expect 4
--   -- and the room's own read still answers
--   select count(*) from public.games_with_graph_and_teams;
