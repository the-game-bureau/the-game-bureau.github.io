-- 2026-08-31  TRIVIA IS A KIND OF CHALLENGE. One table, called challenges.
--
-- Asked for outright. `public.trivia` held 38 questions and `public.challenges`
-- 24 tasks, and they were always the same shape of thing: something a team is
-- given, and something they give back. The two tables differed in three ways
-- and each is handled below rather than papered over.
--
-- WHAT TRIVIA BROUGHT THAT CHALLENGES LACKED:
--
--   choices     a multiple choice. 31 of the 38 have one; a null means the
--               answer is typed. A challenge has never had options.
--   the key     `trivia.id` was TEXT and was a KEY-LADDER RUNG -- a destination
--               id like `new-orleans-la-nfl-saints`, or its city-and-state
--               prefix. Challenges address themselves completely differently,
--               through `scope` plus `scope_team` / `scope_city` / `scope_wpid`.
--
-- THE TWO ADDRESSING SCHEMES ARE NOT MERGED, AND THAT IS DELIBERATE. Mapping a
-- ladder key onto a scope would have been inventing a correspondence that does
-- not exist: `scope_team` is a `teams.team_key` (`NFL:CHI`), not a destination
-- id, and `scope_city` is a plain city name (`Chicago`), not `chicago-il`. A
-- mapping that is right by luck for some rows and wrong for others is worse
-- than two honest columns.
--   So the rung arrives as `ladder_key`, NAMED FOR WHAT IT IS. `trivia.id` was
--   a bad name for it: a TEXT column called `id` that is not the row's identity
--   and is shared by many rows.
--   AND A CHECK MAKES THE UNION EXCLUSIVE, so no row can carry both schemes and
--   have them disagree: a trivia row has a ladder key and no scope of its own;
--   everything else has a scope and no ladder key.
--
-- EVERY TRIVIA CONSTRAINT IS RE-CREATED SCOPED TO `kind = 'trivia'`, because a
-- challenge legitimately breaks most of them:
--   * a photo challenge has NO ANSWER at all, so `answer not blank` cannot be
--     general;
--   * "Jefferson Davis" is a perfectly good challenge answer and TWO WORDS, so
--     `free_answer_is_one_word` cannot be general -- that rule exists because a
--     team outdoors on a phone cannot be asked to type two words exactly right,
--     which is a fact about trivia and not about standing in front of a house.
--   `answer_is_a_choice` and `choices_enough` are left GENERAL: they say
--   nothing about a row with no choices, which every challenge is.
--
-- `trivia_answer_not_in_question` COMES ACROSS STILL `NOT VALID`, so the one
-- row that breaks it (trivia_id 8, answer Chicago in a question naming Chicago)
-- comes across untouched, exactly as it was this morning -- BUT ONLY BECAUSE
-- IT IS ADDED AFTER THE INSERT. See section 5b: NOT VALID exempts existing
-- rows, never new ones, and the first run of this file was refused by it.
--
-- `challenges.id` IS NOT RENUMBERED. Three foreign keys point at it --
-- route_stops, stops and stops_retired -- so the 38 arrivals take new ids after
-- the existing 24 and nothing that points at a challenge moves.
--
-- `trivia_id` IS DROPPED WITH THE TABLE. Nothing references it: no foreign key,
-- and the only reader was the Trivia room, which is repointed in this commit.
--
-- NO COMPATIBILITY VIEW AT THE OLD NAME, deliberately, and this departs from
-- what `destinations` did. There the consumers were spread across two engines
-- and could not all be enumerated. Here they are two: `tgb_trivia_for` and the
-- Trivia room, both changed in this commit. A view would guard against nothing
-- but our own oversight and would HIDE it -- the same reasoning the
-- anchor_events rename recorded, and the same reason the soundtracks JSON
-- fallback was deleted.

begin;

-- ---- 1. what trivia brings -------------------------------------------------
alter table public.challenges
  add column if not exists choices    text[],
  add column if not exists ladder_key text;

comment on column public.challenges.choices is
  'The options a team picks between. NULL means the answer is typed. A '
  'challenge has none; 31 of the 38 trivia rows do.';
comment on column public.challenges.ladder_key is
  'THE KEY-LADDER RUNG this row answers to: a destinations.id, or its '
  'city-and-state prefix, or wp-<wpid>, or *. Read by tgb_trivia_for. It is '
  'NOT a scope and must never be mapped onto one: scope_team is a teams.team_key '
  'and scope_city is a plain city name, neither of which a rung is.';

-- ---- 2. a fifth kind -------------------------------------------------------
alter table public.challenges drop constraint challenges_kind_check;
alter table public.challenges add constraint challenges_kind_check
  check (kind = any (array['question','minigame','photo','freeform','consent','trivia']));

-- ---- 3. one addressing scheme per row, and only one ------------------------
alter table public.challenges add constraint challenges_ladder_key_belongs_to_trivia
  check (
    (kind = 'trivia'
       and ladder_key is not null
       and ladder_key = lower(ladder_key)
       and btrim(ladder_key) <> ''
       and scope = 'portable'
       and scope_team is null and scope_city is null and scope_wpid is null)
    or
    (kind <> 'trivia' and ladder_key is null)
  );

-- ---- 4. trivia's own rules, scoped to trivia -------------------------------
alter table public.challenges add constraint challenges_trivia_has_a_prompt
  check (kind <> 'trivia' or (prompt is not null and btrim(prompt) <> ''));

alter table public.challenges add constraint challenges_trivia_has_an_answer
  check (kind <> 'trivia' or (answer is not null and btrim(answer) <> ''));

-- A TYPED TRIVIA ANSWER IS ONE WORD. A team outdoors on a phone cannot be asked
-- to type two words exactly right, spelling and spacing included; if the only
-- good answer is two words, the question wants choices.
alter table public.challenges add constraint challenges_trivia_free_answer_is_one_word
  check (kind <> 'trivia' or choices is not null or btrim(answer) !~ '[[:space:]]');

alter table public.challenges add constraint challenges_trivia_no_one_word_prefix
  check (kind <> 'trivia' or lower(btrim(prompt)) not like 'one word%');

-- GENERAL, BOTH OF THEM, because they say nothing about a row with no choices.
alter table public.challenges add constraint challenges_answer_is_a_choice
  check (choices is null or answer = any (choices));

alter table public.challenges add constraint challenges_choices_enough
  check (choices is null or cardinality(choices) >= 2);

-- ---- 5. bring the 38 across ------------------------------------------------
-- THE NAME IS THE QUESTION, TRUNCATED. `challenges.name` is NOT NULL and the
-- room lists by it, and a question is its own best name -- inventing a label
-- would be a second thing to keep in step with the words underneath. Cut at a
-- word boundary so it does not end mid-syllable.
insert into public.challenges (name, prompt, answer, kind, choices, ladder_key, scope, created_at)
select
  case when length(t.question) <= 64 then t.question
       else regexp_replace(left(t.question, 61), '\s+\S*$', '') || '...'
  end,
  t.question,
  t.answer,
  'trivia',
  t.choices,
  t.id,
  'portable',
  t.created_at
from public.trivia t
order by t.trivia_id;

-- ---- 5b. and the one rule that has to be added AFTER the rows -------------
-- `NOT VALID` EXEMPTS EXISTING ROWS, NOT NEW INSERTS, and the first run of this
-- file proved it: with the constraint added in section 4 the insert was refused
-- with 23514 on trivia_id 8, the row whose answer is `Chicago` in a question
-- naming Chicago -- the very row NOT VALID exists to spare.
--
-- SO THE ORDER OF `add constraint` AND `insert` IS WHAT DECIDES whether a
-- legacy row survives a migration, and it is invisible until the database
-- refuses. Added here, the 38 arrive unvalidated exactly as they sat in the old
-- table, and everything written from now on is checked.
--
-- Anchored to the START, so the phrase is free mid-sentence.
alter table public.challenges add constraint challenges_trivia_answer_not_in_prompt
  check (
    kind <> 'trivia'
    or strpos(
         ' ' || lower(regexp_replace(prompt, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ',
         ' ' || lower(regexp_replace(btrim(answer), '[^a-zA-Z0-9]+', ' ', 'g')) || ' '
       ) = 0
  ) not valid;

-- ---- 6. the one function that read it --------------------------------------
-- THE SIGNATURE AND THE OUTPUT NAMES ARE UNCHANGED, on purpose. Renaming
-- `trivia_id` to `challenge_id` would read better and would be a change to a
-- contract for no gain today: nothing in the repo calls this yet, so a rename
-- can only cost. What changed is one FROM and three column names inside.
create or replace function public.tgb_trivia_for(
  p_place text, p_audience text default null, p_wpid bigint default null, p_limit integer default 10)
returns table(trivia_id bigint, id text, question text, answer text, choices text[],
              matched_on text, rung integer, side text)
language sql
stable
as $function$
  with ladder as (
    select k, n from unnest(public.tgb_content_keys(p_place, p_audience, p_wpid))
      with ordinality as u(k, n)
  ),
  me as (select * from public.audiences where id = p_audience),
  anti as (select * from public.audiences
            where id = public.tgb_anti_audience(p_place, p_audience))
  -- COMPARED EXACTLY, never with a LIKE. `l.k like '%' || anti.id` was the first
  -- cut and it is wrong in both directions: it matches a longer key that merely
  -- ends the same way, and it misses the mascot form entirely.
  select t.id, t.ladder_key, t.prompt, t.answer, t.choices,
         l.k as matched_on, l.n::int as rung,
         case
           when l.k like 'wp-%' then 'place'
           when l.k in (select id from me)
             or l.k in (select p_place || '-' || id from me)
             or l.k in (select p_place || '-' || family || '-' || public.tgb_slug(nickname) from me)
             then 'yours'
           when l.k in (select id from anti)
             or l.k in (select p_place || '-' || id from anti)
             or l.k in (select p_place || '-' || family || '-' || public.tgb_slug(nickname) from anti)
             then 'theirs'
           when l.k = p_place then 'city'
           when l.k = '*' then 'portable'
           else 'family'
         end as side
    from public.challenges t
    join ladder l on l.k = t.ladder_key
   where t.kind = 'trivia'
   order by l.n, t.id
   limit greatest(p_limit, 0);
$function$;

-- ---- 7. retire the table ---------------------------------------------------
-- IN PLACE, NOT DROPPED. It still holds its 38 rows and its own trivia_id, so
-- the merge can be compared against what it replaced -- which is the only check
-- worth running here. The drop sits commented at the foot.
alter table public.trivia rename to trivia_retired;

do $do$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.trivia_retired'::regclass and conname like 'trivia%'
              and conname not like 'trivia_retired%'
  loop
    execute format('alter table public.trivia_retired rename constraint %I to %I',
                   r.conname, replace(r.conname, 'trivia', 'trivia_retired'));
  end loop;
end $do$;

comment on table public.trivia_retired is
  'RETIRED 2026-08-31. Its 38 rows are in public.challenges as kind = trivia, '
  'with trivia.id carried across as challenges.ladder_key. Kept so the merge '
  'can be compared against what it replaced.';

commit;

-- drop table public.trivia_retired;   -- once the merge has been read for a while

-- Verify. Compare the merge against the table it replaced, which is the only
-- check worth running; an insert that raises nothing proves nothing.
--
--   -- 38 in, 38 out, and the 24 challenges untouched
--   select count(*) filter (where kind = 'trivia') as trivia,
--          count(*) filter (where kind <> 'trivia') as challenges,
--          count(*) as total
--     from public.challenges;                            -- expect 38 / 24 / 62
--
--   -- not one question, answer or option changed on the way
--   select count(*) from public.trivia_retired t
--     join public.challenges c on c.ladder_key = t.id and c.prompt = t.question
--    where c.kind = 'trivia'
--      and c.answer is not distinct from t.answer
--      and c.choices is not distinct from t.choices;     -- expect 38
--
--   -- the ladder still answers, and the union is exclusive
--   select count(*) from public.tgb_trivia_for('chicago-il', 'nfl-chicago', null, 50);
--   select count(*) from public.challenges
--    where (kind = 'trivia') <> (ladder_key is not null);          -- expect 0
--
--   -- and the rules refuse (each expects 23514)
--   insert into public.challenges (name, prompt, answer, kind, ladder_key)
--   values ('probe', 'Which river runs through Chicago?', 'Chicago', 'trivia', 'chicago-il');
--   insert into public.challenges (name, prompt, answer, kind, ladder_key)
--   values ('probe', 'Who is it?', 'Tracy Porter', 'trivia', 'chicago-il');
--   insert into public.challenges (name, prompt, answer, kind, ladder_key)
--   values ('probe', 'A question', 'Yes', 'question', 'chicago-il');
