-- `type` IS DROPPED. THE ID ALREADY SAYS IT.
--
-- It held 'Know Your Enemy' and 'Super Fan Check', which read as two kinds of
-- question and are really ONE fact seen from two sides: whether the row is
-- about the team you follow or the team you are visiting. **A game already
-- knows which side each destination is on**, so with the id naming a team the
-- direction is derivable and the column was a second, hand-typed copy of it --
-- free to contradict the id, and nothing would have said so.
--
-- WHAT IS LEFT IS THE SHAPE, WHICH IS DERIVED AND CANNOT DRIFT:
--
--   team   the id is a full destinations.id      -- about that club
--   city   the id is its city-and-state prefix   -- about the place
--
-- THE CANONICAL EXPRESSION, so three readers do not invent three of them:
--
--   case when exists (select 1 from public.destinations d where d.id = t.id)
--          then 'team'
--        when exists (select 1 from public.destinations d where d.id like t.id || '-%')
--          then 'city'
--   end
--
-- **IT IS NOT A COLUMN AND MUST NOT BECOME ONE.** A stored shape is a stored
-- copy of what the id already says, which is exactly the fault being removed
-- here. If it needs to be queryable, it is a VIEW over that expression.
--
-- WHAT IS GIVEN UP, PLAINLY: nothing records that a question was WRITTEN as a
-- taunt rather than as a straight quiz. That was never enforced and was never
-- read; if tone ever has to be a fact, it is a new column with a reason, not
-- this one coming back.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083010_trivia_drops_type.sql

begin;

-- The CHECK and the index on it go with the column.
alter table public.trivia drop column if exists type;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select count(*) from public.trivia;                     -- expect 8, none lost
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='trivia' order by ordinal_position;
--                     -- expect trivia_id, id, question, answer, choices, created_at
-- ---------------------------------------------------------------------------
