-- TEN NFL CHALLENGES, one multiple choice question each across ten clubs.
--
-- APPLIED 2026-09-04 through the Management API (see CLAUDE.md section 1b);
-- the verify block read exactly what it expects. The apply-by-hand note below
-- is kept as the record of why the file was written that way.
--
-- APPLY BY HAND. The publishable key cannot write public.challenges (RLS grants
-- writes to authenticated only) and this session has no supabase CLI, so it
-- goes in through the SQL editor:
--   https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/sql/new?skip=true
-- or, from a machine with the CLI:
--   cd mc && supabase db query --linked --file supabase/seeds/ten-nfl-challenges.sql
--
-- WHAT THIS IS. Every NFL club already carries one multiple_choice question
-- (the room's own NFL prompt filed them on 2026-09-03), so these are SECOND
-- questions for ten clubs, written to the same rules that prompt states:
--   four options with the answer among them, spelled identically;
--   the answer never appears in the question (challenges_mc_answer_not_in_prompt,
--     which is NOT VALID for old rows and checked on every new one);
--   never open with "One word" (challenges_mc_no_one_word_prefix);
--   the ladder_key is a real destinations.id, copied exactly, lowercase;
--   four tags: the league, the city, the club, and positive or negative;
--   a fact that does not move; combative never cruel; no em dash anywhere.
--
-- POSITIVE AND NEGATIVE say which side the question is written for. Five of
-- each: a positive one rewards a fan for knowing their own club, a negative one
-- is a taunt asked ABOUT the club of somebody visiting it. The joke is on the
-- club, never on a person and never on a town.
--
-- CHECKED BEFORE IT WAS WRITTEN: every key below resolves in
-- public.destinations, no question repeats an existing row's words (the
-- Challenge Bank's own duplicate rule), and every constraint on the table was
-- run over these rows locally. See mc/_dev/browser-checks/nfl-seed-shape.js.

begin;

insert into public.challenges (type, ladder_key, name, prompt, answer, choices, tags) values

  ('multiple_choice',
   'green-bay-wi-nfl-packers',
   'Packers: Super Bowl I',
   'Which club did Green Bay beat in the first ever Super Bowl, in January 1967?',
   'Kansas City Chiefs',
   array['Kansas City Chiefs', 'Oakland Raiders', 'New York Jets', 'Baltimore Colts'],
   array['nfl', 'green-bay', 'packers', 'positive']),

  ('multiple_choice',
   'chicago-il-nfl-bears',
   'Bears: Super Bowl XX',
   'Chicago won its only Super Bowl by 46 to 10 in January 1986. Which club lost?',
   'New England Patriots',
   array['New England Patriots', 'Miami Dolphins', 'Los Angeles Rams', 'New York Giants'],
   array['nfl', 'chicago', 'bears', 'positive']),

  ('multiple_choice',
   'dallas-tx-nfl-cowboys',
   'Cowboys: Rushing King',
   'Which Dallas running back retired with the most rushing yards in NFL history?',
   'Emmitt Smith',
   array['Emmitt Smith', 'Tony Dorsett', 'Calvin Hill', 'Herschel Walker'],
   array['nfl', 'dallas', 'cowboys', 'positive']),

  ('multiple_choice',
   'pittsburgh-pa-nfl-steelers',
   'Steelers: Four in the Seventies',
   'How many Super Bowls did Pittsburgh win during the 1970s?',
   '4',
   array['2', '3', '4', '5'],
   array['nfl', 'pittsburgh', 'steelers', 'positive']),

  ('multiple_choice',
   'san-francisco-ca-nfl-49ers',
   '49ers: The Catch',
   'The Catch, the NFC Championship touchdown to Dwight Clark in January 1982, was thrown by which San Francisco quarterback?',
   'Joe Montana',
   array['Joe Montana', 'Steve Young', 'John Brodie', 'Steve DeBerg'],
   array['nfl', 'san-francisco', '49ers', 'positive']),

  ('multiple_choice',
   'atlanta-ga-nfl-falcons',
   'Falcons: 28 to 3',
   'Atlanta led Super Bowl LI by how many points before New England came back to win it in overtime?',
   '25',
   array['17', '21', '25', '28'],
   array['nfl', 'atlanta', 'falcons', 'negative']),

  ('multiple_choice',
   'new-orleans-la-nfl-saints',
   'Saints: Paper Bags',
   'The 1980 Saints went 1 and 15 and fans wore paper bags over their heads at the Superdome. What did they call the club that year?',
   'Aints',
   array['Aints', 'Faints', 'Taints', 'Haints'],
   array['nfl', 'new-orleans', 'saints', 'negative']),

  ('multiple_choice',
   'detroit-mi-nfl-lions',
   'Lions: One Win',
   'Between the 1957 championship and the 2023 season, how many playoff games did Detroit win?',
   '1',
   array['0', '1', '2', '3'],
   array['nfl', 'detroit', 'lions', 'negative']),

  ('multiple_choice',
   'cleveland-oh-nfl-browns',
   'Browns: Never Been',
   'Cleveland is one of how many current NFL clubs that have never played in a Super Bowl?',
   '4',
   array['2', '3', '4', '6'],
   array['nfl', 'cleveland', 'browns', 'negative']),

  ('multiple_choice',
   'seattle-wa-nfl-seahawks',
   'Seahawks: One Yard Line',
   'In the final minute of Super Bowl XLIX, Seattle threw an interception at the goal line instead of handing the ball to which running back?',
   'Marshawn Lynch',
   array['Marshawn Lynch', 'Robert Turbin', 'Christine Michael', 'Derrick Coleman'],
   array['nfl', 'seattle', 'seahawks', 'negative']);

-- ---- VERIFY. Read the numbers; an insert that returns without error says
-- nothing about whether the rows are the ones you meant. ---------------------

-- 1. Ten rows landed, every key resolves, five positive and five negative.
select count(*)                                              as filed,
       count(*) filter (where d.id is not null)               as keys_resolving,
       count(*) filter (where c.tags @> array['positive'])    as positive,
       count(*) filter (where c.tags @> array['negative'])    as negative
  from public.challenges c
  left join public.destinations d on d.id = c.ladder_key
 where c.name in ('Packers: Super Bowl I', 'Bears: Super Bowl XX',
                  'Cowboys: Rushing King', 'Steelers: Four in the Seventies',
                  '49ers: The Catch', 'Falcons: 28 to 3', 'Saints: Paper Bags',
                  'Lions: One Win', 'Browns: Never Been', 'Seahawks: One Yard Line');
-- expect: filed 10, keys_resolving 10, positive 5, negative 5

-- 2. The table went up by exactly ten (103 multiple_choice and other rows
--    before this was written on 2026-09-04; read your own before count).
select count(*) as challenges_now from public.challenges;

commit;
