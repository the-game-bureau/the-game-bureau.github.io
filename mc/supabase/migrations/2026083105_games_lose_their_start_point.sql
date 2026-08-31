-- 2026-08-31  A GAME IS LOCATED BY ITS CITY, AND BY NOTHING ELSE.
--
-- Asked for outright: take the location fields out of the html and out of the
-- games table, because everything connects to the city on the game's own row.
-- Seven columns go:
--
--   location_based               a question with one answer
--   starting_location            read by nothing
--   starting_location_name       the rendezvous label
--   starting_location_address    the rendezvous address
--   starting_location_lat        the rendezvous point, on 378 of 395 rows
--   starting_location_lon
--   starting_location_plus_code  the long Plus Code, on 11 rows
--
-- THE VALUES ARE KEPT, WHICH IS WHAT MAKES THIS REVERSIBLE. A drop is the one
-- irreversible move available here, so every value is copied into
-- `public.games_location_retired` FIRST, keyed by game id. That is the honest
-- way to satisfy "out of the games table" without destroying anything.
--
-- THREE VIEWS DEPEND ON THESE COLUMNS and a plain drop would have failed;
-- `cascade` would have taken the views with it, including the one the Game
-- Builder reads. So each is dropped and rebuilt around the alter.
--
-- THE REBUILT VIEWS KEEP THEIR EXACT CONTRACT: the same output columns, in the
-- same order, with the same types. Only the seven VALUES become null, because
-- every `<alias>.<column>` reference is replaced by a typed NULL rather than
-- the select lists being rewritten. That matters most for `games_with_graph`,
-- an eleven-thousand-character generated definition that assembles the paid
-- product's game graph: its seven references sit inside
-- `CASE WHEN node_type = 'game' THEN game.<col> ... END AS <alias>` items, and
-- cutting those out would change the node JSON's shape. A typed NULL changes
-- one value and nothing else. 21 references blanked, none left.
--
-- WHAT IT COSTS, MEASURED AND STATED RATHER THAN DISCOVERED:
--
--   * THE LANDING PAGE'S RENDEZVOUS MAP IS NOW CITY-LEVEL. `/mc/game/run/`
--     already geocoded the city as the THIRD fallback behind the address and
--     the stored pair; that is now the only step. A buyer sees the town rather
--     than the corner, which is the intent of the change and not a casualty.
--   * `/mc/game/scan/` HAS NOTHING LEFT TO AIM AT. It is a GPS proximity page,
--     and a city centroid is kilometres from anywhere anybody stands. It says
--     so on screen now instead of failing quietly. Bringing it back needs a
--     per-STOP coordinate, which `public.waypoints` already holds; that is a
--     feature and a decision, not a repair.
--   * NOTHING ELSE BREAKS, checked rather than assumed: only the scanner named
--     these columns in a SELECT. Both engines read `public.games` with
--     `select=*`, which simply returns fewer columns, and every other reference
--     is a property read that becomes undefined.
--
-- THE READERS WERE UPDATED FIRST, IN THE SAME COMMIT. Dropping a column out
-- from under a live select is how a page 400s and blames the connection.

begin;

-- ---- 1. keep the values ----------------------------------------------------
create table if not exists public.games_location_retired as
  select id,
         location_based,
         starting_location,
         starting_location_name,
         starting_location_address,
         starting_location_lat,
         starting_location_lon,
         starting_location_plus_code,
         now() as retired_at
    from public.games;

alter table public.games_location_retired
  add constraint games_location_retired_pkey primary key (id);

comment on table public.games_location_retired is
  'The seven location columns dropped from public.games on 2026-08-31, kept so '
  'the change is reversible. A game is located by its city now. Restore with an '
  'update joined on id after re-adding the columns.';

-- ---- 2. stand the dependent views down, innermost last ---------------------
drop view public.games_with_graph_and_teams;
drop view public.games_with_teams;
drop view public.games_with_graph;

-- ---- 3. drop the columns ---------------------------------------------------
alter table public.games
  drop column location_based,
  drop column starting_location,
  drop column starting_location_name,
  drop column starting_location_address,
  drop column starting_location_lat,
  drop column starting_location_lon,
  drop column starting_location_plus_code;

-- ---- 4. put the views back, with the seven values as typed nulls -----------
create view public.games_with_graph as
SELECT id,
    name,
    primary_color,
    secondary_color,
    created_at,
    updated_at,
    archived,
    erased,
    city,
    tagline,
    body,
    kind,
    price,
    tags,
    default_emoji,
    featured,
    guide_name,
    guide_bio,
    guide_image_url,
    teams,
    team01,
    team02,
    team03,
    team04,
    team05,
    team06,
    team07,
    team08,
    NULL::boolean AS location_based,
    var_name,
    anytime_pair_id,
    accept_any,
    anytime,
    logo_url,
    link_url,
    button_url,
    tertiary_color,
    quaternary_color,
    stop_group,
    NULL::text AS starting_location,
    NULL::double precision AS starting_location_lat,
    NULL::double precision AS starting_location_lon,
    engine,
    game_date,
    start_time,
    end_time,
    checkout_url,
    NULL::text AS starting_location_name,
    NULL::text AS starting_location_address,
    home_team_city,
    home_team_mascot,
    away_team_city,
    away_team_mascot,
    fandom_game,
    primary_tag,
    category_icon,
    guide_background,
    NULL::text AS starting_location_plus_code,
    timezone,
    venue_name,
    venue_city,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls((jsonb_build_object('id', node.node_id, 'type', node.node_type, 'x', node.position_x, 'y', node.position_y, 'width', node.width, 'height', node.height, 'orderIndex', node.sort_order, 'rotation', node.rotation, 'title',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.name
                    ELSE node.title
                END, 'body',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.body
                    ELSE node.body
                END, 'kind',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.kind
                    ELSE node.content_kind
                END, 'tags',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN to_jsonb(game.tags)
                    ELSE to_jsonb(node.tags)
                END, 'primaryTag',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.primary_tag
                    ELSE node.primary_tag
                END, 'stopGroup',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.stop_group
                    ELSE node.stop_group
                END, 'varName',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.var_name
                    ELSE node.variable_name
                END, 'acceptAny',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.accept_any
                    ELSE node.accepts_any_answer
                END, 'anytime',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.anytime
                    ELSE node.is_anytime
                END, 'anytimePairId',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.anytime_pair_id
                    ELSE node.anytime_pair_id
                END, 'answerResponses', node.answer_responses, 'linkUrl',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.link_url
                    ELSE node.link_url
                END, 'buttonUrl',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.button_url
                    ELSE node.button_url
                END, 'minigame', node.minigame, 'gameQuestion', node.game_question, 'gameAnswer', node.game_answer, 'tagline',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.tagline
                    ELSE NULL::text
                END, 'city',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.city
                    ELSE NULL::text
                END, 'featured',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.featured
                    ELSE NULL::boolean
                END, 'locationBased',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::boolean
                    ELSE NULL::boolean
                END, 'fandomGame',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.fandom_game
                    ELSE NULL::boolean
                END) || jsonb_build_object('startingLocation',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::text
                    ELSE NULL::text
                END, 'startingLocationName',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::text
                    ELSE NULL::text
                END, 'startingLocationAddress',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::text
                    ELSE NULL::text
                END, 'startingLocationPlusCode',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::text
                    ELSE NULL::text
                END, 'startingLocationLat',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::double precision
                    ELSE NULL::double precision
                END, 'startingLocationLon',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN NULL::double precision
                    ELSE NULL::double precision
                END, 'guideName',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.guide_name
                    ELSE NULL::text
                END, 'guideBio',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.guide_bio
                    ELSE NULL::text
                END, 'guideBackground',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.guide_background
                    ELSE NULL::text
                END, 'guideImageUrl',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.guide_image_url
                    ELSE NULL::text
                END, 'logoUrl',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.logo_url
                    ELSE NULL::text
                END, 'price',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.price
                    ELSE NULL::text
                END, 'checkoutUrl',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.checkout_url
                    ELSE NULL::text
                END, 'tertiaryColor',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.tertiary_color
                    ELSE node.tertiary_color
                END, 'quaternaryColor',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.quaternary_color
                    ELSE node.quaternary_color
                END, 'defaultEmoji',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.default_emoji
                    ELSE NULL::text
                END, 'categoryIcon',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.category_icon
                    ELSE NULL::text
                END, 'teams',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.teams
                    ELSE NULL::jsonb
                END, 'team01',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team01
                    ELSE NULL::text
                END, 'team02',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team02
                    ELSE NULL::text
                END, 'team03',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team03
                    ELSE NULL::text
                END, 'team04',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team04
                    ELSE NULL::text
                END, 'team05',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team05
                    ELSE NULL::text
                END, 'team06',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team06
                    ELSE NULL::text
                END, 'team07',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team07
                    ELSE NULL::text
                END, 'team08',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.team08
                    ELSE NULL::text
                END, 'engine',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.engine
                    ELSE NULL::text
                END, 'gameDate',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.game_date
                    ELSE NULL::date
                END, 'startTime',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.start_time
                    ELSE NULL::time without time zone
                END, 'endTime',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.end_time
                    ELSE NULL::time without time zone
                END, 'homeTeamCity',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.home_team_city
                    ELSE NULL::text
                END, 'homeTeamMascot',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.home_team_mascot
                    ELSE NULL::text
                END, 'awayTeamCity',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.away_team_city
                    ELSE NULL::text
                END, 'awayTeamMascot',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.away_team_mascot
                    ELSE NULL::text
                END, 'venueName',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.venue_name
                    ELSE NULL::text
                END, 'venueCity',
                CASE
                    WHEN (node.node_type = 'game'::text) THEN game.venue_city
                    ELSE NULL::text
                END))) ORDER BY node.sort_order, node.node_id) AS jsonb_agg
           FROM game_nodes node
          WHERE (node.game_id = game.id)), '[]'::jsonb) AS nodes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', link.link_id, 'from', link.from_node_id, 'to', link.to_node_id, 'fromPort', link.from_port) ORDER BY link.sort_order, link.link_id) AS jsonb_agg
           FROM game_node_links link
          WHERE (link.game_id = game.id)), '[]'::jsonb) AS links
   FROM games game;

create view public.games_with_teams as
SELECT game.id,
    game.name,
    game.primary_color,
    game.secondary_color,
    game.created_at,
    game.updated_at,
    game.archived,
    game.erased,
    game.city,
    game.tagline,
    game.body,
    game.kind,
    game.price,
    game.tags,
    game.default_emoji,
    game.featured,
    game.guide_name,
    game.guide_bio,
    game.guide_image_url,
    game.teams,
    game.team01,
    game.team02,
    game.team03,
    game.team04,
    game.team05,
    game.team06,
    game.team07,
    game.team08,
    NULL::boolean AS location_based,
    game.var_name,
    game.anytime_pair_id,
    game.accept_any,
    game.anytime,
    game.logo_url,
    game.link_url,
    game.button_url,
    game.tertiary_color,
    game.quaternary_color,
    game.stop_group,
    NULL::text AS starting_location,
    NULL::double precision AS starting_location_lat,
    NULL::double precision AS starting_location_lon,
    game.engine,
    game.game_date,
    game.start_time,
    game.end_time,
    game.checkout_url,
    NULL::text AS starting_location_name,
    NULL::text AS starting_location_address,
    game.home_team_city,
    game.home_team_mascot,
    game.away_team_city,
    game.away_team_mascot,
    game.fandom_game,
    game.primary_tag,
    game.category_icon,
    game.guide_background,
    NULL::text AS starting_location_plus_code,
    game.timezone,
    game.venue_name,
    game.venue_city,
    game.away_team_key,
    game.home_team_key,
    game.tagline_approved,
    game.away_team_tgbid,
    game.home_team_tgbid,
    to_jsonb(away_team.*) AS away_team,
    to_jsonb(home_team.*) AS home_team
   FROM ((games game
     LEFT JOIN teams_retired away_team ON ((away_team.tgbid = game.away_team_tgbid)))
     LEFT JOIN teams_retired home_team ON ((home_team.tgbid = game.home_team_tgbid)));

create view public.games_with_graph_and_teams as
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
    game.status
   FROM (((games_with_graph graph
     JOIN games game USING (id))
     LEFT JOIN teams_retired away_team ON ((away_team.tgbid = game.away_team_tgbid)))
     LEFT JOIN teams_retired home_team ON ((home_team.tgbid = game.home_team_tgbid)));

commit;

-- Verify.
--   -- none of the seven is left on the table
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games'
--      and (column_name = 'location_based' or column_name like 'starting_location%');
--                                                                    -- expect 0
--   -- every value survived
--   select count(*) as kept,
--          count(starting_location_lat) as with_lat,
--          count(starting_location_plus_code) as with_plus_code
--     from public.games_location_retired;              -- expect 395 / 378 / 11
--   -- all three views are back and answer
--   select count(*) from public.games_with_graph;
--   select count(*) from public.games_with_teams;
--   select count(*) from public.games_with_graph_and_teams;
--   -- and the one the Game Builder reads still carries what it needs
--   select count(*) from information_schema.columns
--    where table_schema='public' and table_name='games_with_graph_and_teams'
--      and column_name in ('status','away_team','home_team');        -- expect 3
