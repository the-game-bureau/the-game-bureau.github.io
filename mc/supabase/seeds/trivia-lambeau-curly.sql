-- THE LAMBEAU QUESTION GAVE ITS OWN ANSWER AWAY. APPLIED 2026-08-30.
--
-- It read "One word: Lambeau Field is named for the man who founded the club.
-- What was his surname?" with the answer `Lambeau`. **The stadium is in the
-- question**, so the answer was too: anybody who could read it could answer it,
-- which is the one thing a question must not be.
--
-- It asks for the NICKNAME now, and gives both real first names so the answer
-- is not derivable from the question either.
--
-- IT BECOMES MULTIPLE CHOICE, so the "One word:" opener goes with it. That
-- prefix exists to tell somebody a box will only take one word, and there is no
-- box any more.
--
-- THE DISTRACTORS BREAK THE NO-JOKE-OPTIONS RULE ON PURPOSE, which is why it is
-- written down rather than left for somebody to "fix". trivia.prompt.md says a
-- funny option is a free elimination and turns four into a three way guess.
-- **Here ALL THREE are the joke and they are one category**: Curly Lambeau
-- shares a name with a Stooge, so Larry, Moe and Groucho are internally
-- consistent, and a fan who does not know really could pick Moe. It makes the
-- question easy, which is the right weight for a Super Fan Check gimme.
--
-- CURLY IS SECOND, not first. The house rule is not to put the answer at the
-- top every time, and Larry / Curly / Moe is the order those three are always
-- said in anyway.

update public.trivia
   set question = 'Lambeau Field is named for Earl Louis Lambeau, who founded the Packers in 1919. What did everybody call him?',
       answer   = 'Curly',
       choices  = array['Larry','Curly','Moe','Groucho']
 where id = 'green-bay-wi-nfl-packers'
   and question like '%Lambeau Field is named%';
