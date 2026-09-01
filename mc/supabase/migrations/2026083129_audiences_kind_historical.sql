-- 2026083129  A FOURTH AUDIENCE KIND: `historical`
-- ===========================================================================
-- `audiences.kind` was fandom | artist | interest, and it carries a CHECK -- so
-- unlike `events.kind`, which is free text, a new value here is a migration
-- rather than a constant. That is the same distinction `challenges.kind`
-- already makes, and it is worth checking before assuming either way.
--
-- WHAT IT IS FOR. A history walk is pitched at people who came for the HISTORY
-- -- Oswald's New Orleans is the row this project already holds as an
-- `interest` -- and `interest` is the catch-all. `historical` says the thing
-- that is actually true of that audience, which is what lets a game be built
-- for it without a reader having to know that "interest" meant history here.
--
-- NOTHING IS RECLASSIFIED. The one `interest` row stays an interest; moving it
-- is an editorial call and this file does not make it.
--
-- THE OTHER TWO CHECKS ON THIS COLUMN ARE UNCHANGED AND STILL APPLY:
--
--   audiences_nickname_needs_fandom   a nickname only on a fandom, so a
--                                     historical audience has none -- right,
--                                     since a nickname is a club's mascot.
--   audiences_fandom_home_needs_...   a fandom at home must have a mascot;
--                                     silent on every other kind.
--
-- APPLY BY HAND, then read the Verify block rather than the absence of an
-- error: a `create` that returns without complaint proves nothing about a
-- CHECK.

begin;

alter table public.audiences drop constraint if exists audiences_kind_check;
alter table public.audiences add constraint audiences_kind_check
  check (kind = any (array['fandom'::text, 'artist'::text, 'interest'::text, 'historical'::text]));

comment on column public.audiences.kind is
  'fandom (a club and its supporters), artist, interest, or historical (people '
  'who came for the history). A nickname belongs to a fandom only.';

commit;

-- ===========================================================================
-- VERIFY. The first must SUCCEED and the second must FAIL, and both probes
-- must be rolled back -- an accepted insert alone proves only half of it.
--
--   begin;
--     insert into public.audiences (id, family, name, kind)
--          values ('history-probe', 'history', 'Probe', 'historical');
--   rollback;
--
--   -- still refused:
--   insert into public.audiences (id, family, name, kind)
--        values ('x-probe', 'x', 'Probe', 'nonsense');   -- expect 23514
--
--   select kind, count(*) from public.audiences group by 1 order by 2 desc;
