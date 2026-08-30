-- TEN FOR NEW ORLEANS. Applied 2026-08-30.
--
-- EIGHT ARE KEYED TO THE CITY AND TWO TO A CLUB, which is the split the id
-- shapes exist for: a city row is asked of anybody walking there, whichever
-- fandom brought them, so it serves a Saints game and a Pelicans game alike.
--
-- EVERY ONE IS A FACT THAT DOES NOT MOVE: a street, a cafe, a word locals use, a
-- club that changed its name. Nothing phrased as "currently" or "the record
-- for", per trivia.prompt.md, because nothing here re-checks them.
--
-- AND NOTHING ABOUT THE STORM. A city's disaster is not a quiz question, which
-- is the rule the spec carries and which New Orleans is the obvious place to
-- break.
--
-- TWO ARE TYPED AND BOTH ASK FOR A SINGLE WORD IN THEIR OWN WORDS -- "which
-- third colour", "a single organisation is called a what" -- since no question
-- may open with the old "One word:" label any more, and a CHECK refuses it.

insert into public.trivia (id, question, answer, choices) values

  -- ── THE CITY ─────────────────────────────────────────────────────────────
  ('new-orleans-la',
   'Which French Quarter street is the one lined end to end with bars?',
   'Bourbon Street',
   array['Royal Street','Bourbon Street','Chartres Street','Decatur Street']),

  ('new-orleans-la',
   'Beignets and chicory coffee have been served beside the French Market since 1862 at which cafe?',
   'Cafe du Monde',
   array['Antoine''s','Cafe du Monde','Brennan''s','Commander''s Palace']),

  -- The one a visitor gets wrong out loud, which is what makes it worth asking.
  ('new-orleans-la',
   'What do locals call the grassy strip running down the middle of a wide street?',
   'The neutral ground',
   array['The median','The neutral ground','The parkway','The boulevard']),

  ('new-orleans-la',
   'The oldest continuously running streetcar line rolls under the oaks down which avenue?',
   'St. Charles Avenue',
   array['Esplanade Avenue','Canal Street','St. Charles Avenue','Magazine Street']),

  ('new-orleans-la',
   'A single Mardi Gras parading organisation is called a what?',
   'krewe', null),

  ('new-orleans-la',
   'Purple and green are two of the three Mardi Gras colours. Which is the third?',
   'gold', null),

  ('new-orleans-la',
   'Which NBA team began life in New Orleans before moving to Utah in 1979?',
   'Jazz',
   array['Kings','Clippers','Jazz','Grizzlies']),

  ('new-orleans-la',
   'The music clubs of Frenchmen Street sit in which neighbourhood, just downriver from the French Quarter?',
   'Faubourg Marigny',
   array['Bywater','Faubourg Marigny','Treme','Irish Channel']),

  -- ── THE CLUBS ────────────────────────────────────────────────────────────
  ('new-orleans-la-nfl-saints',
   'Who was the Saints quarterback the year they won the Super Bowl?',
   'Drew Brees',
   array['Aaron Brooks','Archie Manning','Drew Brees','Bobby Hebert']),

  ('new-orleans-la-nba-pelicans',
   'What were the Pelicans called before they took the bird in 2013?',
   'Hornets',
   array['Zephyrs','Hornets','Buccaneers','Jazz']);
