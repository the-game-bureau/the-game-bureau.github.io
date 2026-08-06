-- Five more mixed-pro-city jersey number arithmetic seed data.
-- Records use teams already present in the shared team catalog.

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
  -- New York: Jets/Giants plus Knicks/Yankees/Mets
  (
    'New York',
    'D. Jeter', 2, 'baseball', 'New York Yankees',
    'J. Brunson', 11, 'basketball', 'New York Knicks',
    'D. Maynard', 13, 'football', 'New York Jets',
    '+'
  ),
  (
    'New York',
    'J. Namath', 12, 'football', 'New York Jets',
    'W. Frazier', 10, 'basketball', 'New York Knicks',
    'R. Clemens', 22, 'baseball', 'New York Yankees',
    '+'
  ),
  (
    'New York',
    'P. Ewing', 33, 'basketball', 'New York Knicks',
    'W. Frazier', 10, 'basketball', 'New York Knicks',
    'D. Mattingly', 23, 'baseball', 'New York Yankees',
    '-'
  ),
  (
    'New York',
    'M. Rivera', 42, 'baseball', 'New York Yankees',
    'J. Brunson', 11, 'basketball', 'New York Knicks',
    'M. Piazza', 31, 'baseball', 'New York Mets',
    '-'
  ),
  (
    'New York',
    'L. Taylor', 56, 'football', 'New York Giants',
    'M. Rivera', 42, 'baseball', 'New York Yankees',
    'G. Hodges', 14, 'baseball', 'New York Mets',
    '-'
  ),
  (
    'New York',
    'A. Judge', 99, 'baseball', 'New York Yankees',
    'M. Strahan', 92, 'football', 'New York Giants',
    'C. Anthony', 7, 'basketball', 'New York Knicks',
    '-'
  ),

  -- Los Angeles: Lakers/Dodgers/Rams/Angels
  (
    'Los Angeles',
    'K. Bryant', 24, 'basketball', 'Los Angeles Lakers',
    'C. Kupp', 10, 'football', 'Los Angeles Rams',
    'F. Valenzuela', 34, 'baseball', 'Los Angeles Dodgers',
    '+'
  ),
  (
    'Los Angeles',
    'M. Johnson', 32, 'basketball', 'Los Angeles Lakers',
    'C. Kupp', 10, 'football', 'Los Angeles Rams',
    'J. Robinson', 42, 'baseball', 'Los Angeles Dodgers',
    '+'
  ),
  (
    'Los Angeles',
    'C. Kershaw', 22, 'baseball', 'Los Angeles Dodgers',
    'K. Bryant', 8, 'basketball', 'Los Angeles Lakers',
    'N. Ryan', 30, 'baseball', 'Los Angeles Angels',
    '+'
  ),
  (
    'Los Angeles',
    'M. Trout', 27, 'baseball', 'Los Angeles Angels',
    'L. James', 23, 'basketball', 'Los Angeles Lakers',
    'M. Betts', 50, 'baseball', 'Los Angeles Dodgers',
    '+'
  ),
  (
    'Los Angeles',
    'K. Abdul-Jabbar', 33, 'basketball', 'Los Angeles Lakers',
    'C. Kupp', 10, 'football', 'Los Angeles Rams',
    'L. James', 23, 'basketball', 'Los Angeles Lakers',
    '-'
  ),
  (
    'Los Angeles',
    'F. Valenzuela', 34, 'baseball', 'Los Angeles Dodgers',
    'C. Kupp', 10, 'football', 'Los Angeles Rams',
    'K. Bryant', 24, 'basketball', 'Los Angeles Lakers',
    '-'
  ),

  -- Chicago: Bears/Bulls/Cubs/White Sox
  (
    'Chicago',
    'S. Pippen', 33, 'basketball', 'Chicago Bulls',
    'D. Rose', 1, 'basketball', 'Chicago Bulls',
    'W. Payton', 34, 'football', 'Chicago Bears',
    '+'
  ),
  (
    'Chicago',
    'D. Butkus', 51, 'football', 'Chicago Bears',
    'M. Singletary', 50, 'football', 'Chicago Bears',
    'D. Rose', 1, 'basketball', 'Chicago Bulls',
    '-'
  ),
  (
    'Chicago',
    'F. Thomas', 35, 'baseball', 'Chicago White Sox',
    'E. Banks', 14, 'baseball', 'Chicago Cubs',
    'S. Sosa', 21, 'baseball', 'Chicago Cubs',
    '-'
  ),
  (
    'Chicago',
    'M. Ditka', 89, 'football', 'Chicago Bears',
    'F. Thomas', 35, 'baseball', 'Chicago White Sox',
    'B. Urlacher', 54, 'football', 'Chicago Bears',
    '-'
  ),
  (
    'Chicago',
    'B. Urlacher', 54, 'football', 'Chicago Bears',
    'R. Sandberg', 23, 'baseball', 'Chicago Cubs',
    'G. Maddux', 31, 'baseball', 'Chicago Cubs',
    '-'
  ),
  (
    'Chicago',
    'D. Hester', 23, 'football', 'Chicago Bears',
    'S. Sosa', 21, 'baseball', 'Chicago Cubs',
    'A. Rizzo', 44, 'baseball', 'Chicago Cubs',
    '+'
  ),

  -- Boston: Celtics/Red Sox plus New England Patriots
  (
    'Boston',
    'J. Tatum', 0, 'basketball', 'Boston Celtics',
    'P. Pierce', 34, 'basketball', 'Boston Celtics',
    'D. Ortiz', 34, 'baseball', 'Boston Red Sox',
    '+'
  ),
  (
    'Boston',
    'T. Williams', 9, 'baseball', 'Boston Red Sox',
    'K. Garnett', 5, 'basketball', 'Boston Celtics',
    'B. Cousy', 14, 'basketball', 'Boston Celtics',
    '+'
  ),
  (
    'Boston',
    'A. Tippett', 56, 'football', 'New England Patriots',
    'P. Martinez', 45, 'baseball', 'Boston Red Sox',
    'J. Edelman', 11, 'football', 'New England Patriots',
    '-'
  ),
  (
    'Boston',
    'A. Vinatieri', 4, 'football', 'New England Patriots',
    'K. Garnett', 5, 'basketball', 'Boston Celtics',
    'T. Williams', 9, 'baseball', 'Boston Red Sox',
    '+'
  ),
  (
    'Boston',
    'L. Bird', 33, 'basketball', 'Boston Celtics',
    'T. Williams', 9, 'baseball', 'Boston Red Sox',
    'M. Ramirez', 24, 'baseball', 'Boston Red Sox',
    '-'
  ),
  (
    'Boston',
    'D. Ortiz', 34, 'baseball', 'Boston Red Sox',
    'J. Edelman', 11, 'football', 'New England Patriots',
    'P. Martinez', 45, 'baseball', 'Boston Red Sox',
    '+'
  ),

  -- Philadelphia: Eagles/76ers/Phillies
  (
    'Philadelphia',
    'J. Embiid', 21, 'basketball', 'Philadelphia 76ers',
    'J. Hurts', 1, 'football', 'Philadelphia Eagles',
    'B. Dawkins', 20, 'football', 'Philadelphia Eagles',
    '-'
  ),
  (
    'Philadelphia',
    'B. Harper', 3, 'baseball', 'Philadelphia Phillies',
    'R. Howard', 6, 'baseball', 'Philadelphia Phillies',
    'N. Foles', 9, 'football', 'Philadelphia Eagles',
    '+'
  ),
  (
    'Philadelphia',
    'R. Howard', 6, 'baseball', 'Philadelphia Phillies',
    'J. Erving', 6, 'basketball', 'Philadelphia 76ers',
    'R. Cunningham', 12, 'football', 'Philadelphia Eagles',
    '+'
  ),
  (
    'Philadelphia',
    'S. Carlton', 32, 'baseball', 'Philadelphia Phillies',
    'B. Dawkins', 20, 'football', 'Philadelphia Eagles',
    'R. Cunningham', 12, 'football', 'Philadelphia Eagles',
    '-'
  ),
  (
    'Philadelphia',
    'J. Kelce', 62, 'football', 'Philadelphia Eagles',
    'C. Utley', 26, 'baseball', 'Philadelphia Phillies',
    'B. Westbrook', 36, 'football', 'Philadelphia Eagles',
    '-'
  ),
  (
    'Philadelphia',
    'D. McNabb', 5, 'football', 'Philadelphia Eagles',
    'D. Jackson', 10, 'football', 'Philadelphia Eagles',
    'H. Greer', 15, 'basketball', 'Philadelphia 76ers',
    '+'
  )
on conflict do nothing;
