-- Fake Highlights scoreboard data for demo / testing.
--
-- Populates public.highlights with varied TGB-vs-opponent scorelines so the
-- public Highlights page has content. Uses real games.id values so cards link
-- correctly, 'demo-' instance ids so they're easy to remove later, and no ties
-- (the scoreboard hides draws). Re-runnable via ON CONFLICT.
--
-- To remove all of these afterward:
--   delete from public.highlights where instanceid like 'demo-%';

insert into public.highlights (
  gameid, instanceid, tgbteamname, tgbteamscore, opponentname, opponentscore, winnername, created_at
) values
  ('atl2026nor',                                'demo-001', 'Peachtree Bureau',        42, 'Bayou Riddlers',        35, 'Peachtree Bureau',        '2026-07-10 21:10:00+00'),
  ('chc2026atl',                                'demo-002', 'Wrigley Sleuths',         28, 'Peach State Puzzlers',  31, 'Peach State Puzzlers',    '2026-07-10 19:45:00+00'),
  ('billswagonmaster',                          'demo-003', 'Table Smashers',          55, 'Wagon Masters',         49, 'Table Smashers',          '2026-07-09 22:15:00+00'),
  ('nfl2026-20261231-bal-cin-bal-cincinnati',   'demo-004', 'Charm City Crew',         24, 'Queen City Clue Club',  21, 'Charm City Crew',         '2026-07-09 18:30:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh',   'demo-005', 'Peachtree Detectives',    38, 'Steel City Solvers',    44, 'Steel City Solvers',      '2026-07-08 20:20:00+00'),
  ('nfl2026-20260920-gb-nyj-gb-new-york',       'demo-006', 'Cheesehead Cartographers',47, 'Broadway Clue Club',    32, 'Cheesehead Cartographers','2026-07-08 17:05:00+00'),
  ('nfl2026-20261011-cle-nyj-cle-new-york',     'demo-007', 'Lakefront Bureau',        26, 'Gotham Trail Unit',     30, 'Gotham Trail Unit',       '2026-07-07 23:00:00+00'),
  ('nfl2026-20261108-cle-no-cle-new-orleans',   'demo-008', 'Brownie Road Office',     33, 'French Quarter Files',  29, 'Brownie Road Office',     '2026-07-07 18:40:00+00'),
  ('atl2026nor',                                'demo-009', 'Dogwood Division',        51, 'Crescent City Cyphers', 40, 'Dogwood Division',        '2026-07-06 20:55:00+00'),
  ('chc2026atl',                                'demo-010', 'North Side Nomads',       36, 'Hotlanta Hunters',      45, 'Hotlanta Hunters',        '2026-07-06 16:10:00+00'),
  ('billswagonmaster',                          'demo-011', 'Mafia Trail Crew',        62, 'Rimrock Ramblers',      58, 'Mafia Trail Crew',        '2026-07-05 21:30:00+00'),
  ('nfl2026-20261231-bal-cin-bal-cincinnati',   'demo-012', 'Inner Harbor Irregulars', 19, 'Jungle Riddle Squad',   27, 'Jungle Riddle Squad',     '2026-07-05 15:25:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh',   'demo-013', 'ATL Alley Cats',          41, 'Three Rivers Rovers',   34, 'ATL Alley Cats',          '2026-07-04 22:45:00+00'),
  ('nfl2026-20260920-gb-nyj-gb-new-york',       'demo-014', 'Titletown Trackers',      48, 'Empire State Enigmas',  53, 'Empire State Enigmas',    '2026-07-04 18:00:00+00'),
  ('nfl2026-20261011-cle-nyj-cle-new-york',     'demo-015', 'Cuyahoga Crew',           30, 'Jet Set Jotters',       22, 'Cuyahoga Crew',           '2026-07-03 20:15:00+00'),
  ('nfl2026-20261108-cle-no-cle-new-orleans',   'demo-016', 'Rock Hall Rangers',       37, 'Voodoo Vanguards',      44, 'Voodoo Vanguards',        '2026-07-03 17:35:00+00'),
  ('atl2026nor',                                'demo-017', 'Sweet Auburn Squad',      45, 'Bourbon Street Brains', 39, 'Sweet Auburn Squad',      '2026-07-02 21:50:00+00'),
  ('billswagonmaster',                          'demo-018', 'Buffalo Bureau',          33, 'Queen City Questers',   50, 'Queen City Questers',     '2026-07-02 16:20:00+00')
on conflict (instanceid) do update
set
  gameid        = excluded.gameid,
  tgbteamname   = excluded.tgbteamname,
  tgbteamscore  = excluded.tgbteamscore,
  opponentname  = excluded.opponentname,
  opponentscore = excluded.opponentscore,
  winnername    = excluded.winnername,
  created_at    = excluded.created_at;

-- Sanity check:
--   select count(*) as total,
--          count(*) filter (where tgbteamscore > opponentscore) as tgb_wins
--   from public.highlights;
