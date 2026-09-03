-- 2026090209  status is POST or SKIP, and everything is SKIP
--
-- THREE STATES BECOME TWO. `building` goes: a game is either on sale or it is
-- not, and the middle value was carrying a distinction nobody was reading --
-- 393 of the 394 rows sat in it, which is a bucket that has stopped sorting
-- anything.
--
-- AND EVERY GAME IS SET TO SKIP, asked for outright. The shop window is
-- deliberately empty for now.
--   IT COSTS NOTHING TODAY THAT IS NOT ALREADY LOST: /games/ has been dead
-- since the table was cut -- it orders by `game_date`, which is gone, and its
-- own isLive() reads `archived`, which is gone too -- so nothing has been
-- reading these flags anyway. When that page is repaired it must read `status`.
--
-- THE ORDER OF THE THREE STATEMENTS IS NOT NEGOTIABLE.
--   1. move the rows, or the narrowed CHECK has 393 rows to refuse;
--   2. move the DEFAULT, which is the one that would have bitten -- it is
--      'building', so narrowing the CHECK first would make EVERY INSERT FAIL
--      on a value the caller never supplied;
--   3. then narrow the CHECK.
-- A constraint added before its default is moved is a table nobody can write.

begin;

-- 1. everything is skipped --------------------------------------------------
update public.games set status = 'archived' where status is distinct from 'archived';

-- 2. and a NEW game arrives skipped rather than on sale ----------------------
-- Skip is the safe default in a way Post is not: a game nobody has finished
-- must never arrive in the shop window.
alter table public.games alter column status set default 'archived';

-- 3. two values, enforced ----------------------------------------------------
alter table public.games drop constraint if exists games_status_check;
alter table public.games add constraint games_status_check
  check (status = any (array['live'::text, 'archived'::text]));

comment on column public.games.status is
  'live = on sale, archived = skipped. Two values since 2026090209; `building` '
  'was dropped as a state nothing read. Default is archived, so a new game is '
  'never on sale by accident.';

commit;

-- Verify. Run these; the absence of an error proves nothing.
--
--   select status, count(*) from public.games group by status;   -- archived 394
--
--   select column_default from information_schema.columns
--    where table_schema='public' and table_name='games' and column_name='status';
--   -- expect 'archived'::text  -- if this still says building, INSERTS ARE BROKEN
--
--   -- the constraint refuses the value that went, and takes the two that stay
--   begin;
--     insert into public.games (id, name, status) values ('probe','p','building');
--   rollback;   -- expect 23514
