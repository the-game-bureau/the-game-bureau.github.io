-- "One word:" IS GONE FROM EVERY QUESTION. APPLIED 2026-08-30.
--
-- It was the convention for a typed answer and it was a PREFIX: an instruction
-- to the form bolted onto the front of a sentence somebody reads aloud in the
-- street. **A question should ask for one word in its own words**, which is what
-- the Sweetness question already does with "The last name of", and what "which
-- river" does here without any help.
--
-- THE RULE THIS DOES NOT REPEAL: a typed question still has to make clear that
-- one word is wanted. What changes is HOW -- by naming a thing that IS one word,
-- never by a label in front. See trivia.prompt.md.

update public.trivia
   set question = 'Which river is dyed bright green through downtown Chicago every St Patrick''s Day?'
 where trivia_id = 8;
