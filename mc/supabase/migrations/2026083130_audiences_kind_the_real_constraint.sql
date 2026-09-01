-- 2026083130  THE CONSTRAINT 2026083129 MISSED, AND WHY IT MISSED IT
-- ===========================================================================
-- 2026083129 widened `audiences_kind_check` to admit `historical`. The insert
-- was still refused -- by `audiences_kind`, a SECOND check on the same column
-- holding the same three values under a different name.
--
--   audiences_kind        the one the database actually enforced
--   audiences_kind_check  the one the migration guessed at
--
-- Both existed. Widening one and leaving the other is a change that applies
-- cleanly, reports nothing, and does not work -- and it is only found by an
-- insert that makes the constraint do its job. A statement that returns
-- without error proves nothing about a CHECK.
--
-- THE LESSON IS THE ONE THIS FILE ALREADY RECORDS FOR RENAMES: ask the CATALOG
-- which constraints exist rather than assuming Postgres's default name.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = '<table>'::regclass
--      and pg_get_constraintdef(oid) ilike '%<column>%';
--
-- THE DUPLICATE IS COLLAPSED RATHER THAN BOTH BEING WIDENED. Two checks saying
-- one thing is how they end up saying two different things: the next person to
-- add a kind will find one of them and think they are done, which is exactly
-- what happened here. `audiences_kind` is kept -- it is the name the room's own
-- error translation already matches -- and `audiences_kind_check` is dropped.
--
-- APPLY BY HAND, then read the Verify block.

begin;

alter table public.audiences drop constraint if exists audiences_kind_check;

alter table public.audiences drop constraint if exists audiences_kind;
alter table public.audiences add constraint audiences_kind
  check (kind = any (array['fandom'::text, 'artist'::text, 'interest'::text, 'historical'::text]));

commit;

-- ===========================================================================
-- VERIFY. Exactly ONE constraint on `kind`, the first insert accepted and the
-- second refused, and both rolled back.
--
--   select conname from pg_constraint
--    where conrelid = 'public.audiences'::regclass
--      and pg_get_constraintdef(oid) ilike '%kind = any%';
--
--   begin;
--     insert into public.audiences (family, name, kind)
--          values ('history', 'Probe One', 'historical') returning id, kind;
--   rollback;
--
--   begin;
--     insert into public.audiences (family, name, kind)
--          values ('history', 'Probe Two', 'nonsense');   -- expect 23514
--   rollback;
--
-- NOTE: `audiences.id` is a GENERATED column (family + slug(name)), so a probe
-- must NOT supply one -- Postgres refuses that with 428C9, which reads like a
-- different fault entirely and cost a round trip here.
