# WRITING TRIVIA

The rules for adding rows to `public.trivia`. Written for a person and for any
AI asked to produce trivia, and it is the file a future trivia routine opens and
follows, the way TGB PATH BOT opens `path-bot.prompt.md`.

**If you are an AI and this file is missing or does not open with this heading,
STOP and say so. Do not write trivia from memory.**

---

## 1. WHAT A TRIVIA ROW IS FOR

A team is standing somewhere in a city that is not theirs, or is being tested on
their own club. The question is asked, they answer, points are scored.

**Trivia rewards KNOWING. That is the opposite of a waypoint challenge and it is
deliberate.** The challenge library's standing rule is to prefer a challenge
answered by LOOKING over one answered by KNOWING, because recall rewards whoever
reaches for a phone fastest. Trivia is the other thing on purpose: it is fandom
knowledge, asked of fans, and the two sit side by side in one game. **Do not
"improve" a trivia question by making it observational. Write a challenge
instead.**

---

## 2. THE ID: WHO OR WHERE THE QUESTION IS ABOUT

`trivia.id` takes one of exactly two shapes, and choosing between them is the
editorial call that makes the whole table work.

| shape | the id | use it when |
|---|---|---|
| **team** | a full `destinations.id`, e.g. `new-orleans-la-nfl-saints` | the question is about that club |
| **city** | its city and state prefix, e.g. `denver-co` | the question is about the place, and any club there could be asked it |

- **THE ID IS NOT UNIQUE.** A place holds many questions. Several rows sharing
  one id is the normal state, not a mistake.
- **IT IS NOT A FOREIGN KEY EITHER**, and the city form references nothing that
  exists as a row, because `destinations.id` is the four part form. **So nothing
  in the database will catch a typo.** Check it yourself:

```sql
select t.id from public.trivia t
 where not exists (select 1 from public.destinations d
                    where d.id = t.id or d.id like t.id || '-%');
-- must return no rows
```

- **NEVER INVENT AN ID.** Read it from `public.destinations`. A club you cannot
  find there is a club we do not carry yet, and a question about it has nowhere
  to live.
- **NEVER USE A VENUE TOWN.** There is no `foxborough-ma` and there must not be.
  The Patriots are `boston-ma-nfl-patriots`.

**SHAPE IS DERIVED AND IS NOT A COLUMN.** It is read off the id. Do not add one,
and do not ask for one: a stored shape is a stored copy of what the id already
says, which is exactly the fault that got `type` dropped.

---

## 3. THE ANSWER: MULTIPLE CHOICE, OR ONE WORD. NOTHING ELSE.

This is enforced by two CHECK constraints and a row that breaks it is refused
outright, by name.

**MULTIPLE CHOICE** means `choices` holds the options and `answer` is one of
them, spelled identically. **Four options.** Fewer than two is refused; three is
thin; five is a wall of text on a phone.

**ONE WORD** means `choices` is null and `answer` is a single word with no space
in it. **A multi-word free text answer is refused**, because it grades spelling,
spacing and punctuation as well as knowledge, and a team that knew the answer
loses the points to a hyphen.

**SO: IF THE ONLY GOOD ANSWER IS TWO WORDS, THE QUESTION WANTS CHOICES.** That is
the whole decision. `Tracy Porter`, `John Elway` and `The Freedom Trail` are all
multiple choice for this reason and could not be anything else.

### Writing the wrong three

The distractors are most of the work and are where a lazy question shows.

- **SAME CATEGORY AS THE ANSWER.** Three other cornerbacks, three other rivers,
  three other years. A list where one option is a person and three are places
  answers itself.
- **PLAUSIBLE TO SOMEBODY WHO ALMOST KNOWS.** The best wrong answer is the one a
  fan would give if they were a year out or thinking of the wrong game.
- **NO JOKE OPTIONS.** A funny fourth option is a free elimination and turns it
  into a three way guess.
- **NEVER "ALL OF THE ABOVE" OR "NONE OF THE ABOVE".**
- **DO NOT LET LENGTH GIVE IT AWAY.** The correct answer being the longest or the
  most specific option is the oldest tell there is.
- **THE ORDER IS NOT MEANINGFUL** and nothing shuffles it for you today. Do not
  always put the answer first.

---

## 4. WHAT MAKES A QUESTION WORTH ASKING

- **IT MUST BE CHECKABLE.** A fact you cannot point at is a fact we cannot defend
  when somebody says we got it wrong.
- **VERIFY OR OMIT. NEVER GUESS.** The same rule the Spotify id carries, for the
  same reason: **a wrong trivia answer passes every check we have and then tells
  a paying team they are wrong when they are right.** If you are not certain,
  write a different question. Filing fewer good rows beats filing one bad one.
- **PREFER A FACT THAT DOES NOT MOVE.** A championship, a nickname, a building, a
  founding, a thing that happened. **Avoid anything phrased as "currently",
  "most", "the record for" or "the only"**, all of which quietly become false and
  nothing here re-checks them.
- **ONE FACT PER QUESTION.** A question with two clauses has two ways to be
  wrong.
- **COMBATIVE, NEVER CRUEL.** The joke is on the team answering, never on the
  town they are visiting or the people who live there. Same rule the challenge
  library keeps.
- **NO POLITICS, NO TRAGEDY, NO DEATHS AS A PUNCHLINE.** A city's disaster is not
  a quiz question, even when it is the most famous thing about a year.
- **WRITE IT TO BE READ ALOUD.** One sentence where possible. A team is reading
  this on a phone, outdoors, standing up.
- **START A ONE WORD QUESTION WITH "One word:"** so nobody types a sentence into
  a box that will only accept one.

---

## 5. HOUSE RULES THAT APPLY HERE TOO

- **NO EM DASH**, in a question, an answer, an option or this file. It is the
  clearest single tell that a machine wrote the line, and this text carries none
  either so nothing copies the habit back.
- **NO SMART QUOTES.** A straight apostrophe, doubled inside SQL.
- **DO NOT WRITE `trivia_id`.** It is an identity column and the database
  assigns it. **A gap in the sequence is not a deleted row**, it is a refused
  insert consuming its value.

---

## 6. WHAT TO HAND BACK

One `insert` statement, in a fenced sql block, and nothing else around it.

```sql
insert into public.trivia (id, question, answer, choices) values
  ('pittsburgh-pa-nfl-steelers',
   'How many Super Bowl titles have the Steelers won?',
   '6',
   array['4','5','6','7']),

  ('pittsburgh-pa',
   'One word: which river joins the Allegheny at the Point to form the Ohio?',
   'Monongahela', null);
```

- **`choices` IS `null` FOR A ONE WORD ANSWER**, written out, not omitted.
- **RUN IT IN THE SQL EDITOR**:
  https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/sql/new?skip=true
  `new` opens a blank query rather than whatever was last run, and `skip=true`
  stops it asking. Pasting over somebody's half written query is the accident
  that avoids.

---

## 7. AFTER IT LANDS, PROVE IT

Read the numbers rather than the absence of an error.

```sql
-- every id resolves as a team or as a city
select t.id from public.trivia t
 where not exists (select 1 from public.destinations d
                    where d.id = t.id or d.id like t.id || '-%');

-- what shape each row came out as
select t.trivia_id, t.id,
       case when exists (select 1 from public.destinations d where d.id = t.id)
              then 'team'
            when exists (select 1 from public.destinations d where d.id like t.id || '-%')
              then 'city'
       end as shape
  from public.trivia t order by t.trivia_id desc limit 20;

select count(*) from public.trivia;
```

**If a row was refused, the constraint names itself.** `trivia_answer_is_a_choice`
means the answer is not among its own options. `trivia_free_answer_is_one_word`
means a multi word answer was sent with no choices. `trivia_choices_enough` means
fewer than two options. Fix the row; do not remove the constraint.
