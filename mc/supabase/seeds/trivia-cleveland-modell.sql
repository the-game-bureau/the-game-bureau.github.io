-- ONE TRIVIA ROW: Art Modell, 1996. APPLIED 2026-08-30.
--
-- Kept in the repo because a row inserted from a scratch file leaves no record
-- of what was asked or why the wording is what it is.
--
-- IT WAS ASKED FOR AS "moved his team from which city to Baltimore", with the
-- answer Browns. **Those do not agree**: the answer to "which city" is
-- Cleveland. The question is reworded so the answer answers it, which is the
-- one-fact-per-question rule in trivia.prompt.md. Flip it back to a city
-- question with the answer Cleveland if that was the intent.
--
-- THE CITY ID, NOT THE CLUB'S, WAS ASKED FOR AND IS RIGHT: `cleveland-oh`
-- covers the Browns AND the Cavaliers, so a fandom visiting Cleveland for the
-- basketball still gets asked about the worst day in the city's sporting
-- history. A `cleveland-oh-nfl-browns` id would have hidden it from them.
--
-- THE DISTRACTORS ARE ALL NFL CLUBS and the answer is not the longest of them,
-- which is the oldest tell there is. Oilers is the plausible one: Houston to
-- Tennessee in 1997, a year later and the same kind of move.

insert into public.trivia (id, question, answer, choices) values
  ('cleveland-oh',
   'In 1996, Art Modell moved which team to Baltimore, where they became the Ravens?',
   'Browns',
   array['Bengals','Browns','Oilers','Steelers']);
