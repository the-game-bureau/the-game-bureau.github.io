-- THE SWEETNESS QUESTION, REWORDED. APPLIED 2026-08-30.
--
-- It opened "One word:", which is the convention for a typed answer and is not
-- the only way to say it. **"The last name of..." already asks for one word**,
-- and it does it in the sentence rather than in a prefix stuck on the front.
--
-- "Spelling counts!" is the better half of the change. A typed answer is graded
-- on the letters, so a team that knows the man and writes `Peyton` gets nothing,
-- and until now the question gave them no reason to look twice.

update public.trivia
   set question = 'The last name of the Bears running back they called Sweetness. Spelling counts!'
 where id = 'chicago-il-nfl-bears'
   and question like '%Sweetness%';
