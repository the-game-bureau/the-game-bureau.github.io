-- 2026090202  audiences.more -- one url per audience
--
-- APPLIED 2026-09-01 with `cd mc && supabase db query --linked --file ...`.
--
-- WHAT IT IS: somewhere to send somebody who wants more about this fandom --
-- the club's own site, an artist's page, an article about the thing. One url,
-- nullable, and nothing depends on it.
--
-- PLAIN TEXT, NO CHECK, AND THE SCHEME IS OPTIONAL. It is stored exactly as it
-- is typed: `thegamebureau.com` and `https://thegamebureau.com` are both kept
-- as written, and the SCHEME IS ADDED AT RENDER TIME by whatever draws the
-- link. That is deliberate rather than lazy -- rewriting a value on the way in
-- means the room shows something other than what was typed, which is the
-- silent-rewrite fault this table already fixed once with `audience_aliases`
-- and a lowercase CHECK.
--
-- SO ANYTHING READING IT MUST NORMALISE. `href` is `value` when it already
-- carries a scheme and `https://` + value otherwise. The Audience Queue's
-- `moreHref()` is the one implementation today; a second reader copies that
-- rule or gets a dead link on every scheme-less row.
--
-- NOT A FOREIGN KEY AND NOT VALIDATED. A url we cannot reach and a url that is
-- simply wrong look identical from here, and refusing a value nobody can check
-- would only move the problem into a constraint name.

alter table public.audiences
  add column if not exists more text;

comment on column public.audiences.more is
  'Optional url with more about this audience. Stored as typed: the scheme is '
  'optional and is added by the reader. See 2026090202.';

-- Verify. 640 rows, every one null, and the column takes both shapes.
--
--   select count(*) as rows, count(more) as filled from public.audiences;
--
--   begin;
--     update public.audiences set more = 'thegamebureau.com'
--      where id = (select id from public.audiences order by id limit 1);
--     select id, more from public.audiences where more is not null;
--   rollback;
