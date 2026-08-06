-- One Jersey Game puzzle for every NFL team (32 total).
-- Each row stores player1 (operator) player2 = player3, so every triple's
-- arithmetic resolves with real jersey numbers (all 0-99).
--
-- We still search/pull puzzles by the city the TGB game is set in, but the
-- player card displays the team's locale (Arizona, Tennessee, ...) which the
-- engine derives from the teams catalog, so the city column here is only
-- search metadata.

-- 1) Fix any legacy rows that were seeded with "F. Lastname" initials so the
--    full-name display has real first names to split onto two lines.
update public.jersey_game j set player1name = m.full
from (values
  ('D. Brees', 'Drew Brees'),
  ('M. Thomas', 'Michael Thomas'),
  ('M. Ingram', 'Mark Ingram'),
  ('H. Grant', 'Horace Grant'),
  ('S. Pippen', 'Scottie Pippen'),
  ('J. Butler', 'Jimmy Butler'),
  ('S. Sosa', 'Sammy Sosa'),
  ('R. Sandberg', 'Ryne Sandberg'),
  ('A. Rizzo', 'Anthony Rizzo'),
  ('R. Suter', 'Ryan Suter'),
  ('F. Forsberg', 'Filip Forsberg'),
  ('D. Legwand', 'David Legwand')
) as m(abbrev, full)
where j.player1name = m.abbrev;

update public.jersey_game j set player2name = m.full
from (values
  ('D. Brees', 'Drew Brees'),
  ('M. Thomas', 'Michael Thomas'),
  ('M. Ingram', 'Mark Ingram'),
  ('H. Grant', 'Horace Grant'),
  ('S. Pippen', 'Scottie Pippen'),
  ('J. Butler', 'Jimmy Butler'),
  ('S. Sosa', 'Sammy Sosa'),
  ('R. Sandberg', 'Ryne Sandberg'),
  ('A. Rizzo', 'Anthony Rizzo'),
  ('R. Suter', 'Ryan Suter'),
  ('F. Forsberg', 'Filip Forsberg'),
  ('D. Legwand', 'David Legwand')
) as m(abbrev, full)
where j.player2name = m.abbrev;

update public.jersey_game j set player3name = m.full
from (values
  ('D. Brees', 'Drew Brees'),
  ('M. Thomas', 'Michael Thomas'),
  ('M. Ingram', 'Mark Ingram'),
  ('H. Grant', 'Horace Grant'),
  ('S. Pippen', 'Scottie Pippen'),
  ('J. Butler', 'Jimmy Butler'),
  ('S. Sosa', 'Sammy Sosa'),
  ('R. Sandberg', 'Ryne Sandberg'),
  ('A. Rizzo', 'Anthony Rizzo'),
  ('R. Suter', 'Ryan Suter'),
  ('F. Forsberg', 'Filip Forsberg'),
  ('D. Legwand', 'David Legwand')
) as m(abbrev, full)
where j.player3name = m.abbrev;

-- 2) Seed one puzzle per NFL team.
insert into public.jersey_game (
  city,
  player1name, player1num, player1sport, player1team,
  player2name, player2num, player2sport, player2team,
  player3name, player3num, player3sport, player3team,
  "operator"
) values
  ('Phoenix',          'Larry Fitzgerald', 11, 'football', 'Arizona Cardinals',   'Kurt Warner', 13, 'football', 'Arizona Cardinals',   'Adrian Wilson', 24, 'football', 'Arizona Cardinals',   '+'),
  ('Atlanta',          'Deion Sanders', 21, 'football', 'Atlanta Falcons',         'Julio Jones', 11, 'football', 'Atlanta Falcons',     'Steve Bartkowski', 10, 'football', 'Atlanta Falcons',  '-'),
  ('Baltimore',        'Ed Reed', 20, 'football', 'Baltimore Ravens',              'Justin Tucker', 9, 'football', 'Baltimore Ravens',   'Earl Thomas', 29, 'football', 'Baltimore Ravens',     '+'),
  ('Buffalo',          'Thurman Thomas', 34, 'football', 'Buffalo Bills',          'Jim Kelly', 12, 'football', 'Buffalo Bills',        'Fred Jackson', 22, 'football', 'Buffalo Bills',       '-'),
  ('Charlotte',        'Luke Kuechly', 59, 'football', 'Carolina Panthers',        'Thomas Davis', 58, 'football', 'Carolina Panthers', 'Cam Newton', 1, 'football', 'Carolina Panthers',       '-'),
  ('Chicago',          'Gale Sayers', 40, 'football', 'Chicago Bears',             'Walter Payton', 34, 'football', 'Chicago Bears',     'Jay Cutler', 6, 'football', 'Chicago Bears',           '-'),
  ('Cincinnati',       'Chad Johnson', 85, 'football', 'Cincinnati Bengals',       'Tee Higgins', 5, 'football', 'Cincinnati Bengals',   'Cris Collinsworth', 80, 'football', 'Cincinnati Bengals', '-'),
  ('Cleveland',        'Leroy Kelly', 44, 'football', 'Cleveland Browns',          'Jim Brown', 32, 'football', 'Cleveland Browns',      'Lou Groza', 76, 'football', 'Cleveland Browns',       '+'),
  ('Dallas',           'Roger Staubach', 12, 'football', 'Dallas Cowboys',         'Troy Aikman', 8, 'football', 'Dallas Cowboys',       'Dak Prescott', 4, 'football', 'Dallas Cowboys',        '-'),
  ('Denver',           'Karl Mecklenburg', 77, 'football', 'Denver Broncos',       'Randy Gradishar', 53, 'football', 'Denver Broncos', 'Champ Bailey', 24, 'football', 'Denver Broncos',       '-'),
  ('Detroit',          'Ndamukong Suh', 90, 'football', 'Detroit Lions',           'Calvin Johnson', 81, 'football', 'Detroit Lions',   'Matthew Stafford', 9, 'football', 'Detroit Lions',     '-'),
  ('Green Bay',        'Bart Starr', 15, 'football', 'Green Bay Packers',          'Jordan Love', 10, 'football', 'Green Bay Packers',   'Paul Hornung', 5, 'football', 'Green Bay Packers',     '-'),
  ('Houston',          'Jadeveon Clowney', 90, 'football', 'Houston Texans',       'Andre Johnson', 80, 'football', 'Houston Texans',    'DeAndre Hopkins', 10, 'football', 'Houston Texans',    '-'),
  ('Indianapolis',     'Peyton Manning', 18, 'football', 'Indianapolis Colts',     'T.Y. Hilton', 13, 'football', 'Indianapolis Colts', 'Anthony Richardson', 5, 'football', 'Indianapolis Colts', '-'),
  ('Jacksonville',     'Fred Taylor', 28, 'football', 'Jacksonville Jaguars',      'Jalen Ramsey', 20, 'football', 'Jacksonville Jaguars', 'Mark Brunell', 8, 'football', 'Jacksonville Jaguars', '-'),
  ('Kansas City',      'Jamaal Charles', 25, 'football', 'Kansas City Chiefs',     'Tyreek Hill', 10, 'football', 'Kansas City Chiefs',  'Patrick Mahomes', 15, 'football', 'Kansas City Chiefs', '-'),
  ('Las Vegas',        'Jim Plunkett', 16, 'football', 'Las Vegas Raiders',        'Ken Stabler', 12, 'football', 'Las Vegas Raiders',   'Derek Carr', 4, 'football', 'Las Vegas Raiders',     '-'),
  ('Los Angeles',      'Lance Alworth', 19, 'football', 'Los Angeles Chargers',    'Justin Herbert', 10, 'football', 'Los Angeles Chargers', 'Drew Brees', 9, 'football', 'Los Angeles Chargers', '-'),
  ('Los Angeles',      'Jack Youngblood', 85, 'football', 'Los Angeles Rams',      'Deacon Jones', 75, 'football', 'Los Angeles Rams',    'Cooper Kupp', 10, 'football', 'Los Angeles Rams',    '-'),
  ('Miami',            'Dan Marino', 13, 'football', 'Miami Dolphins',             'Bob Griese', 12, 'football', 'Miami Dolphins',        'Tua Tagovailoa', 1, 'football', 'Miami Dolphins',      '-'),
  ('Minneapolis',      'Justin Jefferson', 18, 'football', 'Minnesota Vikings',    'Fran Tarkenton', 10, 'football', 'Minnesota Vikings', 'Kirk Cousins', 8, 'football', 'Minnesota Vikings',   '-'),
  ('Foxborough',       'Wes Welker', 83, 'football', 'New England Patriots',       'Adam Vinatieri', 4, 'football', 'New England Patriots', 'Rob Gronkowski', 87, 'football', 'New England Patriots', '+'),
  ('New Orleans',      'Marques Colston', 12, 'football', 'New Orleans Saints',    'Michael Thomas', 13, 'football', 'New Orleans Saints', 'Reggie Bush', 25, 'football', 'New Orleans Saints',  '+'),
  ('New York',         'Tiki Barber', 21, 'football', 'New York Giants',           'Eli Manning', 10, 'football', 'New York Giants',      'Phil Simms', 11, 'football', 'New York Giants',      '-'),
  ('New York',         'Curtis Martin', 28, 'football', 'New York Jets',           'Darrelle Revis', 24, 'football', 'New York Jets',     'Brett Favre', 4, 'football', 'New York Jets',         '-'),
  ('Philadelphia',     'A.J. Brown', 11, 'football', 'Philadelphia Eagles',        'DeSean Jackson', 10, 'football', 'Philadelphia Eagles', 'Jalen Hurts', 1, 'football', 'Philadelphia Eagles', '-'),
  ('Pittsburgh',       'Troy Polamalu', 43, 'football', 'Pittsburgh Steelers',     'Ben Roethlisberger', 7, 'football', 'Pittsburgh Steelers', 'Jerome Bettis', 36, 'football', 'Pittsburgh Steelers', '-'),
  ('San Francisco',    'Roger Craig', 33, 'football', 'San Francisco 49ers',       'Deebo Samuel', 19, 'football', 'San Francisco 49ers', 'Y.A. Tittle', 14, 'football', 'San Francisco 49ers', '-'),
  ('Seattle',          'Bobby Wagner', 54, 'football', 'Seattle Seahawks',         'Earl Thomas', 29, 'football', 'Seattle Seahawks',    'Richard Sherman', 25, 'football', 'Seattle Seahawks',  '-'),
  ('Tampa',            'Ronde Barber', 20, 'football', 'Tampa Bay Buccaneers',     'Chris Godwin', 14, 'football', 'Tampa Bay Buccaneers', 'Baker Mayfield', 6, 'football', 'Tampa Bay Buccaneers', '-'),
  ('Nashville',        'Chris Johnson', 28, 'football', 'Tennessee Titans',        'Eddie George', 27, 'football', 'Tennessee Titans',    'Warren Moon', 1, 'football', 'Tennessee Titans',      '-'),
  ('Washington',       'Darrell Green', 28, 'football', 'Washington Commanders',   'Sean Taylor', 21, 'football', 'Washington Commanders', 'Joe Theismann', 7, 'football', 'Washington Commanders', '-')
on conflict do nothing;
