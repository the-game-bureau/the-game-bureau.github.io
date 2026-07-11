-- Fake Highlights scoreboard data — batch 2 (20 more rows, demo-019..demo-038).
--
-- Continues _dev/scratch/seed-highlights-fake.sql. Real games.id values,
-- 'demo-' instance ids, no ties, staggered older dates (Jun 20 – Jul 1, 2026)
-- so they sort beneath batch 1. Re-runnable via ON CONFLICT.
--
-- Remove every fake row (both batches) with:
--   delete from public.highlights where instanceid like 'demo-%';

insert into public.highlights (
  gameid, instanceid, tgbteamname, tgbteamscore, opponentname, opponentscore, winnername, created_at
) values
  ('atl2026nor',                                'demo-019', 'Piedmont Pathfinders',    39, 'Gulf Coast Gumshoes',   46, 'Gulf Coast Gumshoes',     '2026-07-01 21:05:00+00'),
  ('chc2026atl',                                'demo-020', 'Lakeview Legends',        52, 'Buckhead Brainiacs',    41, 'Lakeview Legends',        '2026-07-01 17:20:00+00'),
  ('billswagonmaster',                          'demo-021', 'Nickel City Navigators',  34, 'Escarpment Explorers',  29, 'Nickel City Navigators',  '2026-06-30 22:40:00+00'),
  ('nfl2026-20261231-bal-cin-bal-cincinnati',   'demo-022', 'Monument City Mob',       27, 'Riverfront Rascals',    35, 'Riverfront Rascals',      '2026-06-30 18:55:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh',   'demo-023', 'Georgia Clay Crew',       44, 'Golden Triangle Gang',  38, 'Georgia Clay Crew',       '2026-06-29 20:10:00+00'),
  ('nfl2026-20260920-gb-nyj-gb-new-york',       'demo-024', 'Frozen Tundra Team',      31, 'Metro Maze Masters',    48, 'Metro Maze Masters',      '2026-06-29 16:35:00+00'),
  ('nfl2026-20261011-cle-nyj-cle-new-york',     'demo-025', 'Erie Explorers',          40, 'Turnpike Trackers',     33, 'Erie Explorers',          '2026-06-28 23:15:00+00'),
  ('nfl2026-20261108-cle-no-cle-new-orleans',   'demo-026', 'Flats District Force',    22, 'Bayou Bandits',         28, 'Bayou Bandits',           '2026-06-28 19:00:00+00'),
  ('atl2026nor',                                'demo-027', 'Stone Mountain Squad',    57, 'Delta Detectives',      45, 'Stone Mountain Squad',    '2026-06-27 21:25:00+00'),
  ('chc2026atl',                                'demo-028', 'Windy City Wanderers',    36, 'Peachy Keen Pursuers',  43, 'Peachy Keen Pursuers',    '2026-06-27 15:50:00+00'),
  ('billswagonmaster',                          'demo-029', 'Anchor Bar Analysts',     49, 'Southtown Seekers',     42, 'Anchor Bar Analysts',     '2026-06-26 22:05:00+00'),
  ('nfl2026-20261231-bal-cin-bal-cincinnati',   'demo-030', 'Fort McHenry Finders',    30, 'Skyline Chili Chasers', 24, 'Fort McHenry Finders',    '2026-06-26 17:40:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh',   'demo-031', 'Buckhead Bloodhounds',    41, 'Point State Patrol',    47, 'Point State Patrol',      '2026-06-25 20:30:00+00'),
  ('nfl2026-20260920-gb-nyj-gb-new-york',       'demo-032', 'Lambeau Leapers',         53, 'Gridlock Gumshoes',     38, 'Lambeau Leapers',         '2026-06-25 16:15:00+00'),
  ('nfl2026-20261011-cle-nyj-cle-new-york',     'demo-033', 'Rock and Roll Rovers',    25, 'Jetway Jugglers',       32, 'Jetway Jugglers',         '2026-06-24 21:45:00+00'),
  ('nfl2026-20261108-cle-no-cle-new-orleans',   'demo-034', 'West Side Wayfinders',    46, 'Jazz Alley Jury',       39, 'West Side Wayfinders',    '2026-06-24 18:20:00+00'),
  ('atl2026nor',                                'demo-035', 'Marietta Marauders',      33, 'Pelican State Posse',   50, 'Pelican State Posse',     '2026-06-23 20:00:00+00'),
  ('billswagonmaster',                          'demo-036', 'Queen City Cartel',       61, 'Snowbelt Scouts',       54, 'Queen City Cartel',       '2026-06-23 15:30:00+00'),
  ('chc2026atl',                                'demo-037', 'Deep Dish Division',      44, 'Sweet Tea Trackers',    37, 'Deep Dish Division',      '2026-06-22 21:10:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh',   'demo-038', 'Fulton County Force',     29, 'Steel Curtain Squad',   45, 'Steel Curtain Squad',     '2026-06-20 19:35:00+00')
on conflict (instanceid) do update
set
  gameid        = excluded.gameid,
  tgbteamname   = excluded.tgbteamname,
  tgbteamscore  = excluded.tgbteamscore,
  opponentname  = excluded.opponentname,
  opponentscore = excluded.opponentscore,
  winnername    = excluded.winnername,
  created_at    = excluded.created_at;
