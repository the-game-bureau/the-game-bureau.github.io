-- SCORES: WHAT SOMEBODY ANSWERED, AND WHAT IT WAS WORTH.
--
-- One row per settled question. **Trivia writes here from the admin room today,
-- and challenges will write here from the engine**, which is why the subject is
-- generic rather than a foreign key to `trivia`: `area` is the discriminator and
-- `subject_id` is TEXT, exactly the shape `public.issues` already uses for the
-- same reason. A challenge id and a trivia id are different types in different
-- tables and there is no one table to reference.
--
-- THE SCORING IS A CHECK, NOT A CONVENTION:
--
--   wrong          0
--   right, 1st try 7
--   right, 2nd try 3
--   anything else  0
--
-- **A points column a client computes is a points column a client can get
-- wrong**, and a wrong score looks exactly like a right one. The constraint
-- means the only way to store 7 is to have earned it.
--
-- TWO TRIES IS THE WHOLE REASON THE SECOND BAND EXISTS. A question that locks on
-- the first press cannot ever pay 3, so the room had to learn to let somebody
-- try again before this table was worth writing.
--
-- APPEND ONLY. `anon` may INSERT and may not read: the engine will write these
-- from a phone with the publishable key, and a table it could also SELECT would
-- hand every player everybody else's answers.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083015_scores.sql

begin;

create table if not exists public.scores (
  score_id   bigint generated always as identity primary key,

  -- NEVER NULL AND NEVER BLANK. A trigger folds both to 'anon', so the column
  -- can be read without a coalesce everywhere and a nameless player is a fact
  -- rather than a hole.
  player     text not null default 'anon',

  area       text not null default 'trivia',
  subject_id text not null,

  answer_given text,
  correct    boolean not null,
  tries      smallint not null,
  points     smallint not null,

  created_at timestamptz not null default now(),

  constraint scores_player_not_blank check (btrim(player) <> ''),
  constraint scores_area check (area in ('trivia', 'challenge')),
  constraint scores_subject_not_blank check (btrim(subject_id) <> ''),
  constraint scores_tries check (tries >= 1),
  -- THE SCORING, ENFORCED. Change the bands here and in the room together.
  constraint scores_points_match_the_rules check (
    points = case
      when not correct then 0
      when tries = 1 then 7
      when tries = 2 then 3
      else 0
    end
  )
);

comment on table public.scores is
  'One row per settled question: what was answered, on which try, and what it '
  'was worth. Trivia writes from the admin room; challenges write from the '
  'engine. Append only, and the points are enforced by CHECK rather than '
  'trusted from the client.';
comment on column public.scores.subject_id is
  'trivia.trivia_id as text, or a challenge id. NOT a foreign key: two areas '
  'point at two tables and there is no one target, the same shape issues.subject_id uses.';
comment on column public.scores.points is
  '0 wrong, 7 right first try, 3 right second try, 0 otherwise. A CHECK enforces it.';

create index if not exists scores_player_idx on public.scores (lower(player));
create index if not exists scores_subject_idx on public.scores (area, subject_id);
create index if not exists scores_created_idx on public.scores (created_at desc);

-- A BLANK NAME IS 'anon', AND IT IS A TRIGGER SO THE RULE ALSO HOLDS for psql
-- and the Supabase table editor, not only for whichever client remembered.
create or replace function public.tgb_scores_default_player()
returns trigger language plpgsql as $$
begin
  if new.player is null or btrim(new.player) = '' then
    new.player := 'anon';
  else
    new.player := btrim(new.player);
  end if;
  return new;
end;
$$;

drop trigger if exists scores_default_player on public.scores;
create trigger scores_default_player
  before insert or update on public.scores
  for each row execute function public.tgb_scores_default_player();

alter table public.scores enable row level security;

-- ANON MAY WRITE AND MAY NOT READ. The engine posts from a phone with the
-- publishable key; a readable table would hand every player everybody else's
-- answers, and there is no reason a client needs to read this at all.
drop policy if exists "scores anon insert" on public.scores;
create policy "scores anon insert" on public.scores for insert to anon with check (true);
drop policy if exists "scores admin insert" on public.scores;
create policy "scores admin insert" on public.scores for insert to authenticated with check (true);
drop policy if exists "scores admin read" on public.scores;
create policy "scores admin read" on public.scores for select to authenticated using (is_photo_admin());

grant insert on public.scores to anon, authenticated;
grant select on public.scores to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by making it refuse rather than by the absence of an error.
--   insert into public.scores (subject_id, correct, tries, points)
--     values ('1', true, 1, 3);      -- expect scores_points_match_the_rules
--   insert into public.scores (subject_id, correct, tries, points)
--     values ('1', false, 1, 7);     -- expect scores_points_match_the_rules
--   insert into public.scores (player, subject_id, correct, tries, points)
--     values ('   ', '1', true, 1, 7);  -- expect player = 'anon'
-- ---------------------------------------------------------------------------
