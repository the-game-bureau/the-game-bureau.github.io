-- AFC South jersey number arithmetic seed data.
-- This batch mixes same-city pro teams where the project has useful team data.
-- It also normalizes earlier jersey seed names to first-initial display names.

drop table if exists pg_temp.jersey_name_map;
create temporary table jersey_name_map (
  team text not null,
  last_name text not null,
  num integer not null,
  display_name text not null
) on commit drop;

insert into jersey_name_map (team, last_name, num, display_name) values
  ('New Orleans Saints', 'HEBERT', 3, 'B. Hebert'),
  ('New Orleans Saints', 'ANDERSEN', 7, 'M. Andersen'),
  ('New Orleans Saints', 'DANIEL', 10, 'C. Daniel'),
  ('New Orleans Saints', 'MILLS', 51, 'S. Mills'),
  ('New Orleans Saints', 'GAJAN', 46, 'H. Gajan'),
  ('New Orleans Saints', 'HARTLEY', 5, 'G. Hartley'),
  ('New Orleans Saints', 'BREES', 9, 'D. Brees'),
  ('New Orleans Saints', 'COLSTON', 12, 'M. Colston'),
  ('New Orleans Saints', 'HILLIARD', 21, 'D. Hilliard'),
  ('New Orleans Saints', 'JORDAN', 94, 'C. Jordan'),
  ('New Orleans Saints', 'HORN', 87, 'J. Horn'),
  ('New Orleans Saints', 'THOMAS', 13, 'M. Thomas'),
  ('New Orleans Saints', 'INGRAM', 22, 'M. Ingram'),
  ('New Orleans Saints', 'GRAHAM', 80, 'J. Graham'),
  ('New Orleans Saints', 'KAMARA', 41, 'A. Kamara'),
  ('New Orleans Saints', 'BUSH', 25, 'R. Bush'),
  ('New Orleans Saints', 'MOORE', 16, 'L. Moore'),
  ('New Orleans Saints', 'ROAF', 77, 'W. Roaf'),
  ('New Orleans Saints', 'TURLEY', 68, 'K. Turley'),
  ('Atlanta Falcons', 'BARTKOWSKI', 10, 'S. Bartkowski'),
  ('Atlanta Falcons', 'JONES', 11, 'J. Jones'),
  ('Atlanta Falcons', 'SANDERS', 21, 'D. Sanders'),
  ('Atlanta Falcons', 'ANDERSEN', 5, 'M. Andersen'),
  ('Atlanta Falcons', 'VICK', 7, 'M. Vick'),
  ('Atlanta Falcons', 'CHANDLER', 12, 'C. Chandler'),
  ('Atlanta Falcons', 'DUNN', 28, 'W. Dunn'),
  ('Atlanta Falcons', 'TURNER', 33, 'M. Turner'),
  ('Atlanta Falcons', 'NOBIS', 60, 'T. Nobis'),
  ('Atlanta Falcons', 'RYAN', 2, 'M. Ryan'),
  ('Atlanta Falcons', 'TUGGLE', 58, 'J. Tuggle'),
  ('Atlanta Falcons', 'GONZALEZ', 88, 'T. Gonzalez'),
  ('Atlanta Falcons', 'CRUMPLER', 83, 'A. Crumpler'),
  ('Atlanta Falcons', 'RIGGS', 42, 'G. Riggs'),
  ('Atlanta Falcons', 'ANDERSON', 32, 'J. Anderson'),
  ('Carolina Panthers', 'KUECHLY', 59, 'L. Kuechly'),
  ('Carolina Panthers', 'NEWTON', 1, 'C. Newton'),
  ('Carolina Panthers', 'DAVIS', 58, 'T. Davis'),
  ('Carolina Panthers', 'PEPPERS', 90, 'J. Peppers'),
  ('Carolina Panthers', 'SMITH', 89, 'S. Smith'),
  ('Carolina Panthers', 'OLSEN', 88, 'G. Olsen'),
  ('Carolina Panthers', 'MUHAMMAD', 87, 'M. Muhammad'),
  ('Carolina Panthers', 'GROSS', 69, 'J. Gross'),
  ('Carolina Panthers', 'DELHOMME', 17, 'J. Delhomme'),
  ('Carolina Panthers', 'BEASON', 52, 'J. Beason'),
  ('Carolina Panthers', 'WILLIAMS', 34, 'D. Williams'),
  ('Carolina Panthers', 'MILLS', 51, 'S. Mills'),
  ('Carolina Panthers', 'MCCAFFREY', 22, 'C. McCaffrey'),
  ('Carolina Panthers', 'MOORE', 12, 'D. Moore'),
  ('Tampa Bay Buccaneers', 'DUNN', 28, 'W. Dunn'),
  ('Tampa Bay Buccaneers', 'BRADY', 12, 'T. Brady'),
  ('Tampa Bay Buccaneers', 'ALSTOTT', 40, 'M. Alstott'),
  ('Tampa Bay Buccaneers', 'GRAMATICA', 7, 'M. Gramatica'),
  ('Tampa Bay Buccaneers', 'JOHNSON', 19, 'K. Johnson'),
  ('Tampa Bay Buccaneers', 'LYNCH', 47, 'J. Lynch'),
  ('Tampa Bay Buccaneers', 'DAVID', 54, 'L. David'),
  ('Tampa Bay Buccaneers', 'SELMON', 63, 'L. Selmon'),
  ('Tampa Bay Buccaneers', 'NICKERSON', 56, 'H. Nickerson'),
  ('Tampa Bay Buccaneers', 'RICE', 97, 'S. Rice'),
  ('Tampa Bay Buccaneers', 'GODWIN', 14, 'C. Godwin'),
  ('Tampa Bay Buccaneers', 'JACKSON', 83, 'V. Jackson'),
  ('Tampa Bay Buccaneers', 'MAYFIELD', 6, 'B. Mayfield'),
  ('Tampa Bay Buccaneers', 'EVANS', 13, 'M. Evans'),
  ('Tampa Bay Buccaneers', 'BARBER', 20, 'R. Barber'),
  ('Tampa Bay Buccaneers', 'SAPP', 99, 'W. Sapp'),
  ('Tampa Bay Buccaneers', 'GRONKOWSKI', 87, 'R. Gronkowski');

update public.jersey_game g
set player1name = m.display_name
from jersey_name_map m
where lower(g.player1team) = lower(m.team)
  and g.player1num = m.num
  and lower(g.player1name) = lower(m.last_name);

update public.jersey_game g
set player2name = m.display_name
from jersey_name_map m
where lower(g.player2team) = lower(m.team)
  and g.player2num = m.num
  and lower(g.player2name) = lower(m.last_name);

update public.jersey_game g
set player3name = m.display_name
from jersey_name_map m
where lower(g.player3team) = lower(m.team)
  and g.player3num = m.num
  and lower(g.player3name) = lower(m.last_name);

with ranked as (
  select
    ctid,
    row_number() over (
      partition by
        lower(city),
        lower(player1name), player1num, lower(player1sport), lower(player1team),
        lower(player2name), player2num, lower(player2sport), lower(player2team),
        lower(player3name), player3num, lower(player3sport), lower(player3team),
        lower("operator")
      order by id
    ) as row_number
  from public.jersey_game
)
delete from public.jersey_game g
using ranked r
where g.ctid = r.ctid
  and r.row_number > 1;

create unique index if not exists jersey_game_equation_uidx
  on public.jersey_game (
    lower(city),
    lower(player1name),
    player1num,
    lower(player1sport),
    lower(player1team),
    lower(player2name),
    player2num,
    lower(player2sport),
    lower(player2team),
    lower(player3name),
    player3num,
    lower(player3sport),
    lower(player3team),
    lower("operator")
  );

insert into public.jersey_game (
  city,
  player1name, player1num, player1sport, player1team,
  player2name, player2num, player2sport, player2team,
  player3name, player3num, player3sport, player3team,
  "operator"
) values
  -- Houston Texans plus Houston Rockets/Astros
  (
    'Houston',
    'H. Olajuwon', 34, 'basketball', 'Houston Rockets',
    'J. Altuve', 27, 'baseball', 'Houston Astros',
    'C. Stroud', 7, 'football', 'Houston Texans',
    '-'
  ),
  (
    'Houston',
    'A. Johnson', 80, 'football', 'Houston Texans',
    'D. Hopkins', 10, 'football', 'Houston Texans',
    'J. Clowney', 90, 'football', 'Houston Texans',
    '+'
  ),
  (
    'Houston',
    'N. Ryan', 34, 'baseball', 'Houston Astros',
    'C. Biggio', 7, 'baseball', 'Houston Astros',
    'J. Altuve', 27, 'baseball', 'Houston Astros',
    '-'
  ),
  (
    'Houston',
    'D. Hopkins', 10, 'football', 'Houston Texans',
    'C. Stroud', 7, 'football', 'Houston Texans',
    'L. Berkman', 17, 'baseball', 'Houston Astros',
    '+'
  ),
  (
    'Houston',
    'M. Schaub', 8, 'football', 'Houston Texans',
    'J. Bagwell', 5, 'baseball', 'Houston Astros',
    'J. Harden', 13, 'basketball', 'Houston Rockets',
    '+'
  ),
  (
    'Houston',
    'H. Olajuwon', 34, 'basketball', 'Houston Rockets',
    'Y. Ming', 11, 'basketball', 'Houston Rockets',
    'A. Foster', 23, 'football', 'Houston Texans',
    '-'
  ),

  -- Indianapolis Colts plus Indiana Pacers
  (
    'Indianapolis',
    'R. Wayne', 87, 'football', 'Indianapolis Colts',
    'R. Miller', 31, 'basketball', 'Indiana Pacers',
    'Q. Nelson', 56, 'football', 'Indianapolis Colts',
    '-'
  ),
  (
    'Indianapolis',
    'P. George', 24, 'basketball', 'Indiana Pacers',
    'A. Vinatieri', 4, 'football', 'Indianapolis Colts',
    'J. Taylor', 28, 'football', 'Indianapolis Colts',
    '+'
  ),
  (
    'Indianapolis',
    'P. Manning', 18, 'football', 'Indianapolis Colts',
    'A. Luck', 12, 'football', 'Indianapolis Colts',
    'G. McGinnis', 30, 'basketball', 'Indiana Pacers',
    '+'
  ),
  (
    'Indianapolis',
    'M. Harrison', 88, 'football', 'Indianapolis Colts',
    'E. James', 32, 'football', 'Indianapolis Colts',
    'Q. Nelson', 56, 'football', 'Indianapolis Colts',
    '-'
  ),
  (
    'Indianapolis',
    'R. Mathis', 98, 'football', 'Indianapolis Colts',
    'S. Leonard', 53, 'football', 'Indianapolis Colts',
    'R. Smits', 45, 'basketball', 'Indiana Pacers',
    '-'
  ),
  (
    'Indianapolis',
    'R. Smits', 45, 'basketball', 'Indiana Pacers',
    'P. George', 24, 'basketball', 'Indiana Pacers',
    'B. Sanders', 21, 'football', 'Indianapolis Colts',
    '-'
  ),

  -- Jacksonville Jaguars
  (
    'Jacksonville',
    'J. Ramsey', 20, 'football', 'Jacksonville Jaguars',
    'M. Brunell', 8, 'football', 'Jacksonville Jaguars',
    'F. Taylor', 28, 'football', 'Jacksonville Jaguars',
    '+'
  ),
  (
    'Jacksonville',
    'T. Boselli', 71, 'football', 'Jacksonville Jaguars',
    'J. Ramsey', 20, 'football', 'Jacksonville Jaguars',
    'P. Posluszny', 51, 'football', 'Jacksonville Jaguars',
    '-'
  ),
  (
    'Jacksonville',
    'K. McCardell', 87, 'football', 'Jacksonville Jaguars',
    'T. Lawrence', 16, 'football', 'Jacksonville Jaguars',
    'T. Boselli', 71, 'football', 'Jacksonville Jaguars',
    '-'
  ),
  (
    'Jacksonville',
    'K. McCardell', 87, 'football', 'Jacksonville Jaguars',
    'J. Smith', 82, 'football', 'Jacksonville Jaguars',
    'B. Bortles', 5, 'football', 'Jacksonville Jaguars',
    '-'
  ),
  (
    'Jacksonville',
    'R. Mathis', 27, 'football', 'Jacksonville Jaguars',
    'B. Bortles', 5, 'football', 'Jacksonville Jaguars',
    'M. Jones-Drew', 32, 'football', 'Jacksonville Jaguars',
    '+'
  ),
  (
    'Jacksonville',
    'B. Bortles', 5, 'football', 'Jacksonville Jaguars',
    'T. Lawrence', 16, 'football', 'Jacksonville Jaguars',
    'A. Bouye', 21, 'football', 'Jacksonville Jaguars',
    '+'
  ),

  -- Tennessee Titans plus Nashville Predators
  (
    'Nashville',
    'D. Henry', 22, 'football', 'Tennessee Titans',
    'S. McNair', 9, 'football', 'Tennessee Titans',
    'K. Byard', 31, 'football', 'Tennessee Titans',
    '+'
  ),
  (
    'Nashville',
    'P. Rinne', 35, 'hockey', 'Nashville Predators',
    'E. George', 27, 'football', 'Tennessee Titans',
    'M. Mariota', 8, 'football', 'Tennessee Titans',
    '-'
  ),
  (
    'Nashville',
    'J. Kearse', 90, 'football', 'Tennessee Titans',
    'F. Wycheck', 89, 'football', 'Tennessee Titans',
    'W. Moon', 1, 'football', 'Tennessee Titans',
    '-'
  ),
  (
    'Nashville',
    'E. Campbell', 34, 'football', 'Tennessee Titans',
    'W. Moon', 1, 'football', 'Tennessee Titans',
    'P. Rinne', 35, 'hockey', 'Nashville Predators',
    '+'
  ),
  (
    'Nashville',
    'S. Weber', 6, 'hockey', 'Nashville Predators',
    'D. Legwand', 11, 'hockey', 'Nashville Predators',
    'R. Tannehill', 17, 'football', 'Tennessee Titans',
    '+'
  ),
  (
    'Nashville',
    'F. Forsberg', 9, 'hockey', 'Nashville Predators',
    'D. Legwand', 11, 'hockey', 'Nashville Predators',
    'R. Suter', 20, 'hockey', 'Nashville Predators',
    '+'
  )
on conflict do nothing;
