-- TRIVIA: WHAT A TEAM IS ASKED WHILE THEY ARE STANDING IN THE CITY.
--
-- Keyed to a PLACE, not to a club and not to a game. `id` here holds the first
-- two parts of a destination's id -- `atlanta-ga`, `buffalo-ny` -- so one row
-- serves every fandom that ever visits that city and every game ever generated
-- there. That is the same argument the generative model rests on: one route
-- through Chicago serves every club that visits it.
--
-- `id` IS NOT THE PRIMARY KEY AND IS NOT UNIQUE, which is the point: a city
-- holds many questions. The key is `trivia_id`, an identity column, so a row can
-- be pointed at without anybody inventing a name for it.
--
-- IT IS NOT A FOREIGN KEY EITHER, and that is worth saying because it looks like
-- one. `destinations.id` is the FOUR-part id, so there is nothing for a
-- city-and-state to reference: New York and Los Angeles each carry two rows and
-- neither `city` nor `city+state` is unique. Same shape as `issues.subject_id`,
-- which is TEXT and generic for the same reason. The verify block below is what
-- catches a typo; nothing in the database will.
--
-- THE ANSWER IS ONE WORD OR ONE OF THE CHOICES, never both and never neither.
-- A CHECK enforces it: an answer that is not among its own choices is the one
-- state no reader could interpret, and it is exactly what a hand-typed row
-- produces.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083006_trivia.sql

begin;

create table if not exists public.trivia (
  trivia_id bigint generated always as identity primary key,

  -- city-and-state, lowercased and hyphenated: the first two parts of a
  -- destination's id. Lowercase so a lookup needs no function around it.
  id       text not null,
  -- What kind of question it is: 'Know Your Enemy', 'Super Fan Check'. Free
  -- text, deliberately -- a CHECK here would mean a migration every time a
  -- writer invents a category, and the Route Builder is where they are picked.
  type     text not null,

  question text not null,
  answer   text not null,
  -- NULL means a one-word answer typed by the team. Otherwise the options, with
  -- the answer among them.
  choices  text[],

  created_at timestamptz not null default now(),

  constraint trivia_id_lower check (id = lower(id) and btrim(id) <> ''),
  constraint trivia_type_not_blank check (btrim(type) <> ''),
  constraint trivia_question_not_blank check (btrim(question) <> ''),
  constraint trivia_answer_not_blank check (btrim(answer) <> ''),
  -- Two or more, or it is not a choice.
  constraint trivia_choices_enough check (choices is null or cardinality(choices) >= 2),
  -- THE ANSWER MUST BE ONE OF THEM. A multiple choice whose answer is not on the
  -- list is unanswerable and looks perfectly fine in a table.
  constraint trivia_answer_is_a_choice check (choices is null or answer = any(choices))
);

comment on table public.trivia is
  'Questions keyed to a PLACE (city-and-state), so one row serves every fandom '
  'that visits it and every game generated there.';
comment on column public.trivia.id is
  'The first two parts of a destinations id: atlanta-ga, buffalo-ny. NOT unique '
  'and NOT a foreign key -- destinations.id is the four-part id and no '
  'city+state is unique in it. A typo is caught by the verify block, not by the '
  'database.';
comment on column public.trivia.choices is
  'NULL means a one-word answer. Otherwise the options, with `answer` among '
  'them, which a CHECK enforces.';

create index if not exists trivia_id_idx on public.trivia (id);
create index if not exists trivia_type_idx on public.trivia (type);

alter table public.trivia enable row level security;

drop policy if exists "trivia is public" on public.trivia;
create policy "trivia is public" on public.trivia for select using (true);

drop policy if exists "trivia admin insert" on public.trivia;
drop policy if exists "trivia admin update" on public.trivia;
drop policy if exists "trivia admin delete" on public.trivia;
create policy "trivia admin insert" on public.trivia
  for insert to authenticated with check (is_photo_admin());
create policy "trivia admin update" on public.trivia
  for update to authenticated using (is_photo_admin()) with check (is_photo_admin());
create policy "trivia admin delete" on public.trivia
  for delete to authenticated using (is_photo_admin());

grant select on public.trivia to anon, authenticated;
grant insert, update, delete on public.trivia to authenticated;

-- ---------------------------------------------------------------------------
-- THREE TO START. One of each shape, so both answer forms are exercised.
--
-- PREFER A QUESTION ANSWERED BY KNOWING SOMETHING A FAN KNOWS, not by reaching
-- for a phone. These three are recall, which is what "Know Your Enemy" and
-- "Super Fan Check" are FOR -- unlike a waypoint challenge, which should reward
-- being there. The two kinds sit side by side in a game on purpose.
-- ---------------------------------------------------------------------------
insert into public.trivia (id, type, question, answer, choices) values
  ('new-orleans-la', 'Know Your Enemy',
   'The Saints sealed Super Bowl XLIV with a pick six off Peyton Manning. Who caught it?',
   'Tracy Porter',
   array['Tracy Porter','Darren Sharper','Jabari Greer','Malcolm Jenkins']),

  ('chicago-il', 'Super Fan Check',
   'One word: the surname of the Bears running back they called Sweetness.',
   'Payton', null),

  ('denver-co', 'Know Your Enemy',
   'Denver is the Mile High City. How many feet above sea level is a mile?',
   '5280',
   array['3200','5280','7500','8400']);

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers rather than the absence of an error.
-- ---------------------------------------------------------------------------
--
--   -- every trivia id names a real place, which nothing else checks:
--   select distinct t.id from public.trivia t
--    where not exists (select 1 from public.destinations d
--                       where d.id like t.id || '-%');
--                                                        -- expect 0 rows
--
--   select count(*) from public.trivia;                  -- expect 3
--   select type, count(*) from public.trivia group by 1;
