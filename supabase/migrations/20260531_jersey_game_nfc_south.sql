-- NFC South jersey number arithmetic seed data.
-- Names are rendered on the jersey backs; last names are used where practical.

insert into public.jersey_game (
  city,
  player1name, player1num, player1sport, player1team,
  player2name, player2num, player2sport, player2team,
  player3name, player3num, player3sport, player3team,
  "operator"
) values
  -- Atlanta Falcons
  (
    'Atlanta',
    'BARTKOWSKI', 10, 'football', 'Atlanta Falcons',
    'JONES', 11, 'football', 'Atlanta Falcons',
    'SANDERS', 21, 'football', 'Atlanta Falcons',
    '+'
  ),
  (
    'Atlanta',
    'ANDERSEN', 5, 'football', 'Atlanta Falcons',
    'VICK', 7, 'football', 'Atlanta Falcons',
    'CHANDLER', 12, 'football', 'Atlanta Falcons',
    '+'
  ),
  (
    'Atlanta',
    'DUNN', 28, 'football', 'Atlanta Falcons',
    'ANDERSEN', 5, 'football', 'Atlanta Falcons',
    'TURNER', 33, 'football', 'Atlanta Falcons',
    '+'
  ),
  (
    'Atlanta',
    'NOBIS', 60, 'football', 'Atlanta Falcons',
    'RYAN', 2, 'football', 'Atlanta Falcons',
    'TUGGLE', 58, 'football', 'Atlanta Falcons',
    '-'
  ),
  (
    'Atlanta',
    'GONZALEZ', 88, 'football', 'Atlanta Falcons',
    'ANDERSEN', 5, 'football', 'Atlanta Falcons',
    'CRUMPLER', 83, 'football', 'Atlanta Falcons',
    '-'
  ),
  (
    'Atlanta',
    'RIGGS', 42, 'football', 'Atlanta Falcons',
    'BARTKOWSKI', 10, 'football', 'Atlanta Falcons',
    'ANDERSON', 32, 'football', 'Atlanta Falcons',
    '-'
  ),

  -- Carolina Panthers
  (
    'Carolina',
    'KUECHLY', 59, 'football', 'Carolina Panthers',
    'NEWTON', 1, 'football', 'Carolina Panthers',
    'DAVIS', 58, 'football', 'Carolina Panthers',
    '-'
  ),
  (
    'Carolina',
    'PEPPERS', 90, 'football', 'Carolina Panthers',
    'SMITH', 89, 'football', 'Carolina Panthers',
    'NEWTON', 1, 'football', 'Carolina Panthers',
    '-'
  ),
  (
    'Carolina',
    'OLSEN', 88, 'football', 'Carolina Panthers',
    'NEWTON', 1, 'football', 'Carolina Panthers',
    'MUHAMMAD', 87, 'football', 'Carolina Panthers',
    '-'
  ),
  (
    'Carolina',
    'GROSS', 69, 'football', 'Carolina Panthers',
    'DELHOMME', 17, 'football', 'Carolina Panthers',
    'BEASON', 52, 'football', 'Carolina Panthers',
    '-'
  ),
  (
    'Carolina',
    'WILLIAMS', 34, 'football', 'Carolina Panthers',
    'DELHOMME', 17, 'football', 'Carolina Panthers',
    'MILLS', 51, 'football', 'Carolina Panthers',
    '+'
  ),
  (
    'Carolina',
    'MCCAFFREY', 22, 'football', 'Carolina Panthers',
    'MOORE', 12, 'football', 'Carolina Panthers',
    'WILLIAMS', 34, 'football', 'Carolina Panthers',
    '+'
  ),

  -- New Orleans Saints
  (
    'New Orleans',
    'BREES', 9, 'football', 'New Orleans Saints',
    'COLSTON', 12, 'football', 'New Orleans Saints',
    'HILLIARD', 21, 'football', 'New Orleans Saints',
    '+'
  ),
  (
    'New Orleans',
    'JORDAN', 94, 'football', 'New Orleans Saints',
    'ANDERSEN', 7, 'football', 'New Orleans Saints',
    'HORN', 87, 'football', 'New Orleans Saints',
    '-'
  ),
  (
    'New Orleans',
    'THOMAS', 13, 'football', 'New Orleans Saints',
    'BREES', 9, 'football', 'New Orleans Saints',
    'INGRAM', 22, 'football', 'New Orleans Saints',
    '+'
  ),
  (
    'New Orleans',
    'HORN', 87, 'football', 'New Orleans Saints',
    'GRAHAM', 80, 'football', 'New Orleans Saints',
    'ANDERSEN', 7, 'football', 'New Orleans Saints',
    '-'
  ),
  (
    'New Orleans',
    'KAMARA', 41, 'football', 'New Orleans Saints',
    'BUSH', 25, 'football', 'New Orleans Saints',
    'MOORE', 16, 'football', 'New Orleans Saints',
    '-'
  ),
  (
    'New Orleans',
    'ROAF', 77, 'football', 'New Orleans Saints',
    'BREES', 9, 'football', 'New Orleans Saints',
    'TURLEY', 68, 'football', 'New Orleans Saints',
    '-'
  ),

  -- Tampa Bay Buccaneers
  (
    'Tampa Bay',
    'DUNN', 28, 'football', 'Tampa Bay Buccaneers',
    'BRADY', 12, 'football', 'Tampa Bay Buccaneers',
    'ALSTOTT', 40, 'football', 'Tampa Bay Buccaneers',
    '+'
  ),
  (
    'Tampa Bay',
    'BRADY', 12, 'football', 'Tampa Bay Buccaneers',
    'GRAMATICA', 7, 'football', 'Tampa Bay Buccaneers',
    'JOHNSON', 19, 'football', 'Tampa Bay Buccaneers',
    '+'
  ),
  (
    'Tampa Bay',
    'LYNCH', 47, 'football', 'Tampa Bay Buccaneers',
    'GRAMATICA', 7, 'football', 'Tampa Bay Buccaneers',
    'DAVID', 54, 'football', 'Tampa Bay Buccaneers',
    '+'
  ),
  (
    'Tampa Bay',
    'SELMON', 63, 'football', 'Tampa Bay Buccaneers',
    'GRAMATICA', 7, 'football', 'Tampa Bay Buccaneers',
    'NICKERSON', 56, 'football', 'Tampa Bay Buccaneers',
    '-'
  ),
  (
    'Tampa Bay',
    'RICE', 97, 'football', 'Tampa Bay Buccaneers',
    'GODWIN', 14, 'football', 'Tampa Bay Buccaneers',
    'JACKSON', 83, 'football', 'Tampa Bay Buccaneers',
    '-'
  ),
  (
    'Tampa Bay',
    'MAYFIELD', 6, 'football', 'Tampa Bay Buccaneers',
    'GRAMATICA', 7, 'football', 'Tampa Bay Buccaneers',
    'EVANS', 13, 'football', 'Tampa Bay Buccaneers',
    '+'
  ),
  (
    'Tampa Bay',
    'EVANS', 13, 'football', 'Tampa Bay Buccaneers',
    'GRAMATICA', 7, 'football', 'Tampa Bay Buccaneers',
    'BARBER', 20, 'football', 'Tampa Bay Buccaneers',
    '+'
  ),
  (
    'Tampa Bay',
    'SAPP', 99, 'football', 'Tampa Bay Buccaneers',
    'BRADY', 12, 'football', 'Tampa Bay Buccaneers',
    'GRONKOWSKI', 87, 'football', 'Tampa Bay Buccaneers',
    '-'
  )
on conflict do nothing;
