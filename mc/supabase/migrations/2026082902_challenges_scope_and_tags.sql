-- A CHALLENGE IS EITHER BOUND TO ONE PLACE OR PORTABLE ACROSS ALL OF THEM.
--
-- The one row on file is "Whose house is this? / Jefferson Davis", which works
-- at exactly one address. Singing the away team's fight song in the home team's
-- city works at hundreds of places, in hundreds of games, and is written once.
-- Those are different species and the table treated them identically, which is
-- why reuse was aspirational rather than real.
--
-- `scope` is what tells them apart, and it is the column the library is
-- searched by: a game builder asking "what can I put at this stop" wants the
-- portable ones plus the one place-bound challenge written for that waypoint.
--
-- WHY NOT DERIVE IT from whether the prompt carries a variable? Because a
-- portable challenge need not use one. "Take a photograph of the ugliest thing
-- you can see from here" is portable and mentions nothing. The distinction is
-- editorial, so it is stored rather than guessed.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026082902_challenges_scope_and_tags.sql

begin;

alter table public.challenges
  add column if not exists scope text not null default 'portable',
  add column if not exists tags  text[] not null default '{}';

-- TWO VALUES AND A CHECK, the way `events.issues` is constrained. A third value
-- is a product decision, not a typo, so the constraint is what makes somebody
-- come and think about it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.challenges'::regclass and conname = 'challenges_scope_check'
  ) then
    alter table public.challenges
      add constraint challenges_scope_check check (scope in ('portable', 'place'));
  end if;
end $$;

comment on column public.challenges.scope is
  'portable = works at any waypoint, usually parameterised by the game''s teams. '
  'place = the answer is a fact about one specific waypoint, so it travels nowhere.';

comment on column public.challenges.tags is
  'Free-text labels a writer searches by: sports, combative, photo, quiet, night. '
  'Not a taxonomy and not validated: the library is found by reading, not by joining.';

-- THE ONE EXISTING ROW IS PLACE BOUND, and saying so is the whole point of the
-- column. Its answer is "Jefferson Davis", which is true at one address.
update public.challenges
   set scope = 'place'
 where id = 1
   and name = 'Jefferson Davis'' House'
   and scope <> 'place';

commit;

-- VERIFY
--   select id, name, kind, scope, tags from public.challenges order by id;
--   -- expect: row 1 scope = 'place'
--   insert into public.challenges (name, kind, scope) values ('x','question','nope');
--   -- expect: 23514, violates challenges_scope_check
