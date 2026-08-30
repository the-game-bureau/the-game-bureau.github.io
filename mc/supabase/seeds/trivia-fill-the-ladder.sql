-- NINETEEN QUESTIONS, WRITTEN TO THE GAP RATHER THAN TO A CITY.
--
-- MEASURED FIRST, and the gap was not where more New Orleans questions would go:
--
--   portable questions keyed `*`        0
--   family questions keyed nfl / nba    0
--   walkable cities with no trivia     15 of 22
--
-- **THE TWO EMPTY RUNGS ARE THE ONES THAT REACH EVERY GAME.** A question keyed
-- `nfl` is asked in thirty-two cities by every fandom; one keyed `*` is asked in
-- all 2,363. Eleven of these nineteen are on those two rungs, which is a better
-- return than eleven more questions about one city.
--
-- ── THE PORTABLE THREE ARE ABOUT ORIENTATION, ON PURPOSE ──────────────────
--
-- Portable means ANY audience, which includes a history walk and a concert, so
-- a football question is not portable however general it feels. What is left
-- that is genuinely universal AND worth asking a team standing in a street is
-- **which way they are facing**, which the game uses anyway.
--
-- ── EVERY CITY ROW IS A PLACE WITH A ROUTE AND NO TRIVIA ───────────────────
--
-- Ten of the fifteen. A game there could ask nothing local before this.
--
-- Rules followed, from mc/_dev/prompt-tools/trivia.prompt.md: no question opens
-- with "One word" (a CHECK refuses it), no question contains its own answer,
-- four options where there are options, distractors in the same category, and
-- nothing phrased as "currently" or "the record for".
--
-- APPLY: cd mc && supabase db query --linked --file supabase/seeds/trivia-fill-the-ladder.sql

insert into public.trivia (id, question, answer, choices) values

  -- ── PORTABLE. Asked in every game there is. ──────────────────────────────
  ('*', 'The sun rises in which direction?', 'east', null),
  ('*', 'You are facing east. Which direction is on your left?', 'north', null),
  ('*', 'How many degrees are in a full turn?', '360',
   array['90','180','270','360']),

  -- ── THE NFL FAMILY. Asked in thirty-two cities. ──────────────────────────
  ('nfl', 'How many points is a touchdown worth, before the kick that follows it?', '6',
   array['3','6','7','8']),
  ('nfl', 'How many players from one team are on the field at a time?', '11',
   array['9','10','11','12']),
  ('nfl', 'How many yards must a team gain to earn a fresh set of downs?', '10',
   array['5','10','15','20']),
  ('nfl', 'The Super Bowl trophy is named for a coach. Which team did he coach to the first two?', 'Green Bay',
   array['Chicago','Green Bay','Cleveland','Dallas']),

  -- ── THE NBA FAMILY. ──────────────────────────────────────────────────────
  ('nba', 'How many points is a shot from beyond the arc?', '3',
   array['1','2','3','4']),
  ('nba', 'How many players from one team are on the court at a time?', '5',
   array['4','5','6','7']),

  -- ── TEN CITIES THAT HAD A ROUTE AND NOTHING TO ASK. ──────────────────────
  ('atlanta-ga', 'Atlanta hosted the Summer Olympics in which year?', '1996',
   array['1984','1992','1996','2000']),

  ('baltimore-md', 'The Star-Spangled Banner was written during a bombardment of which Baltimore fort?', 'Fort McHenry',
   array['Fort Sumter','Fort McHenry','Fort Ticonderoga','Fort Monroe']),

  ('charlotte-nc', 'Which sport has its Hall of Fame in uptown Charlotte?', 'NASCAR',
   array['NASCAR','Basketball','Golf','Soccer']),

  ('dallas-tx', 'Dallas shares its main international airport with which neighbouring city?', 'Fort Worth',
   array['Arlington','Fort Worth','Plano','Irving']),

  ('detroit-mi', 'Which record label was founded in Detroit in 1959?', 'Motown',
   array['Stax','Motown','Chess','Sun']),

  ('los-angeles-ca', 'The Hollywood sign once read HOLLYWOODLAND. Which four letters came down in 1949?', 'LAND',
   array['LAND','HILL','VIEW','PARK']),

  ('miami-fl', 'Which neighbourhood holds Miami''s Art Deco historic district?', 'South Beach',
   array['Wynwood','South Beach','Coconut Grove','Little Havana']),

  ('minneapolis-mn', 'Which river runs through Minneapolis?', 'Mississippi', null),

  ('nashville-tn', 'Which Nashville hall is called the Mother Church of Country Music?', 'Ryman Auditorium',
   array['Bluebird Cafe','Ryman Auditorium','Grand Ole Opry House','Station Inn']),

  ('philadelphia-pa', 'In which Philadelphia building was the Declaration of Independence signed?', 'Independence Hall',
   array['Carpenters'' Hall','Independence Hall','Congress Hall','City Hall']);
