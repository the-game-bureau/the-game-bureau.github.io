-- Audit: which of the remote's schema migrations are actually applied to this DB?
--
-- The project applies migrations by hand in the SQL editor (no CLI tracking
-- table), so this probes for the concrete object each schema migration creates.
-- Run the whole thing; every row reports ✓ (present) or ✗ MISSING.
--
-- SCOPE: only migrations that create a detectable schema object (table / column
-- / function / view) can be checked this way. The ~25 data-only migrations
-- (jersey rosters, waypoint/coord backfills, dummy scoreboard rows, fanbase
-- fixes, terminology renames) leave no probe-able object and are NOT listed --
-- verify those by spot-checking row data if needed. A ✗ here means that
-- migration (and anything depending on it) has not run.

with probes(seq, migration, kind, obj) as (
  values
    ( 1, '20260521_teams',                     'table',    'teams'),
    ( 2, '20260527_fandom_games',              'column',   'games.fandom_game'),
    ( 3, '20260527_primary_tag',               'column',   'games.primary_tag'),
    ( 4, '20260528_photo_thumbnails',          'column',   'photo_submissions.thumb_storage_path'),
    ( 5, '20260529_category_icon',             'column',   'games.category_icon'),
    ( 6, '20260530_jersey_game',               'table',    'jersey_game'),
    ( 7, '20260603_starting_location_plus_code','column',  'games.starting_location_plus_code'),
    ( 8, '20260610_gift_shop_item_category',   'column',   'gift_shop_items.category'),
    ( 9, '20260610_gift_shop_item_certified_at','column',  'gift_shop_items.certified_at'),
    (10, '20260610_teams_game_city',           'column',   'teams.game_city'),
    (11, '20260611_teams_timezone',            'column',   'teams.timezone'),
    (12, '20260615_normalize_game_graph',      'table',    'game_nodes'),
    (13, '20260615_normalize_game_graph',      'table',    'game_node_links'),
    (14, '20260615_normalize_game_graph',      'function', 'replace_game_graph'),
    (15, '20260615_team_palette_keys',         'column',   'teams.team_key'),
    (16, '20260616_games_tagline_approved',    'column',   'games.tagline_approved'),
    (17, '20260616_games_team_tgbid_links',    'column',   'games.away_team_tgbid'),
    (18, '20260616_games_team_tgbid_links',    'function', 'infer_game_team_keys'),
    (19, '20260616_teams_division',            'column',   'teams.division'),
    (20, '20260616_teams_tgbid_espnid',        'column',   'teams.tgbid'),
    (21, '20260617_create_waypoints',          'table',    'waypoints'),
    (22, '20260617_create_waypoints',          'function', 'waypoints_assign_wpid'),
    (23, '20260619_add_waypoints_zip',         'column',   'waypoints.zip'),
    (24, '20260619_create_maps',               'table',    'maps'),
    (25, '20260620_add_waypoints_latlon',      'column',   'waypoints.lat'),
    (26, '20260625_game_instances_responses',  'table',    'game_instances'),
    (27, '20260625_game_instances_responses',  'table',    'game_responses'),
    (28, '20260625_game_instances_responses',  'table',    'game_events'),
    (29, '20260625_game_instances_responses',  'view',     'game_play_stats'),
    (30, '2026070101_game_results',            'table',    'highlights'),
    (31, '2026070201_rename_to_highlights',    'view',     'game_results'),
    (32, '20260701_gift_shop_city_listings',   'column',   'gift_shop_listings.city'),
    (33, '2026070801_gift_shop_error_ignores', 'table',    'gift_shop_error_ignores'),
    -- Not under migrations/ but part of the remote's city system (supabase/gs-*.sql):
    (34, 'gs-gift-shop-cities.sql',            'table',    'gift_shop_cities'),
    (35, 'gs-gift-shop-cities.sql',            'function', 'tgb_canonical_gift_shop_city')
)
select
  p.seq,
  p.migration,
  p.kind,
  p.obj,
  case
    when (case p.kind
      when 'table' then exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = p.obj)
      when 'view' then exists (
        select 1 from information_schema.views
        where table_schema = 'public' and table_name = p.obj)
      when 'function' then exists (
        select 1 from pg_proc pr
        join pg_namespace n on n.oid = pr.pronamespace
        where n.nspname = 'public' and pr.proname = p.obj)
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name  = split_part(p.obj, '.', 1)
          and column_name = split_part(p.obj, '.', 2))
    end) then '✓'
    else '✗ MISSING'
  end as status
from probes p
order by p.seq;
