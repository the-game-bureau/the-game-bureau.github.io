insert into public.jersey_game (
  city,
  player1name, player1num, player1sport, player1team,
  player2name, player2num, player2sport, player2team,
  player3name, player3num, player3sport, player3team,
  "operator"
) values
  (
    'New Orleans',
    'Drew Brees', 9, 'football', 'New Orleans Saints',
    'Michael Thomas', 13, 'football', 'New Orleans Saints',
    'Mark Ingram', 22, 'football', 'New Orleans Saints',
    '+'
  ),
  (
    'Chicago',
    'Horace Grant', 54, 'basketball', 'Chicago Bulls',
    'Scottie Pippen', 33, 'basketball', 'Chicago Bulls',
    'Jimmy Butler', 21, 'basketball', 'Chicago Bulls',
    '-'
  ),
  (
    'Chicago',
    'Sammy Sosa', 21, 'baseball', 'Chicago Cubs',
    'Ryne Sandberg', 23, 'baseball', 'Chicago Cubs',
    'Anthony Rizzo', 44, 'baseball', 'Chicago Cubs',
    '+'
  ),
  (
    'Nashville',
    'Ryan Suter', 20, 'hockey', 'Nashville Predators',
    'Filip Forsberg', 9, 'hockey', 'Nashville Predators',
    'David Legwand', 11, 'hockey', 'Nashville Predators',
    '-'
  )
on conflict do nothing;
