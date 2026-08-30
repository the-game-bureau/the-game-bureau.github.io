-- BROOKLYN IS ITS OWN PLACE, AND FIVE MORE QUESTIONS.
--
-- ── 1. BROOKLYN NO LONGER ANSWERS TO NEW YORK ──────────────────────────────
--
-- It carried `new york`, `nyc` and `new york city` as aliases so a visitor
-- headed to New York would still be shown the Nets. Those are gone: Brooklyn is
-- a destination in its own right, and a walk through Brooklyn is not a walk
-- through Manhattan.
--
-- WHAT IT COSTS, PLAINLY: somebody who types "New York" in the headed-to box
-- will NOT be offered a Brooklyn game. That is the intended reading now -- they
-- are different places -- but it is a real narrowing and nothing on screen says
-- Brooklyn exists unless you type it.
--
-- WHAT IT BUYS: the rule that **no alias may name another destination's city**
-- goes back to being absolute, with no declared exception, so the check that
-- enforces it can be trusted again rather than carrying a permanent exemption
-- somebody has to remember.
--
-- ── 2. FIVE MORE TRIVIA, IN BOTH ID SHAPES ─────────────────────────────────
--
-- Two city rows and three club rows, so both halves of yesterday's split are
-- exercised by real content rather than by one example each.
--
-- THE TYPE IS NOT DECORATION AND THESE ARE ASSIGNED, NOT GUESSED:
--   Know Your Enemy  -- asked of the fandom that TRAVELLED, about where they are
--   Super Fan Check  -- asked of a fandom about ITSELF
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083009_brooklyn_stands_alone_and_five_more.sql

begin;

update public.destinations
   set aliases = array['bk','bklyn']
 where id = 'brooklyn-ny-nba-nets';

insert into public.trivia (id, type, question, answer, choices) values
  -- CITY. The answer being the city's own name is the joke, and it is the
  -- actual answer rather than a trick.
  ('chicago-il', 'Know Your Enemy',
   'One word: which river is dyed bright green through downtown Chicago every St Patrick''s Day?',
   'Chicago', null),

  -- CITY, and on brand: the thing it names is a WALK.
  ('boston-ma', 'Know Your Enemy',
   'A red brick line in the pavement links sixteen historic sites across Boston. What is it called?',
   'The Freedom Trail',
   array['The Freedom Trail','The Liberty Path','The Patriot Way','The Revolution Road']),

  -- CLUB. A Warriors fan should know this, which is what makes it a Super Fan
  -- Check rather than a question for visitors.
  ('san-francisco-ca-nba-warriors', 'Super Fan Check',
   'Before Chase Center, the Warriors spent decades playing across the bay in which city?',
   'Oakland',
   array['Oakland','San Jose','Sacramento','Berkeley']),

  -- CLUB, one word.
  ('green-bay-wi-nfl-packers', 'Super Fan Check',
   'One word: Lambeau Field is named for the man who founded the club. What was his surname?',
   'Lambeau', null),

  -- CLUB, asked of whoever is visiting Denver.
  ('denver-co-nfl-broncos', 'Know Your Enemy',
   'Which Broncos quarterback went out on back to back Super Bowl wins in the 1997 and 1998 seasons?',
   'John Elway',
   array['John Elway','Peyton Manning','Jake Plummer','Craig Morton']);

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   -- the rule is absolute again, with no exemption clause:
--   select distinct a from public.destinations d, unnest(d.aliases) a
--    where exists (select 1 from public.destinations x
--                   where lower(x.city) = a and lower(x.city) <> lower(d.city));
--                                                            -- expect 0 rows
--   -- and every trivia id still resolves as a club or as a city:
--   select count(*) from public.trivia;                       -- expect 8
-- ---------------------------------------------------------------------------
