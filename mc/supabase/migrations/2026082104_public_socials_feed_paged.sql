-- tgb_public_socials_feed(integer, integer) -- the same feed, deep enough for an archive
--
-- APPLY BY HAND in the Supabase SQL editor.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
-- /linkinbio/ shows the newest 25 and offers an archive of everything behind
-- them. The function as written could serve neither:
--
--   * IT CLAMPED AT 24, so 25 was not a number it could return. That cap was
--     right when the only caller was a Follow page showing "a handful"; it is
--     wrong for a page whose second view is the whole history.
--   * IT HAD NO OFFSET, so there was no way to ask for anything except the
--     newest N. An archive of 300 posts cannot be one response, and a single
--     enormous limit is how you get a silent truncation later -- the exact trap
--     PostgREST's own 1000-row cap sets everywhere else in this project.
--
-- ── WHAT CHANGED ────────────────────────────────────────────────────────────
--
-- A second parameter, and the ceiling raised from 24 to 100 A PAGE. The
-- scraping argument that produced the original cap is untouched: a caller still
-- cannot ask for the whole table in one request. It can now walk it, which is
-- the same thing spread over several requests, and that is fine -- everything
-- here is already public on our own accounts.
--
-- THE OLD SIGNATURE IS DROPPED, NOT LEFT BESIDE THIS ONE. Two overloads of one
-- name is how PostgREST starts answering "could not choose the best candidate
-- function" to a call that names only feed_limit, which is precisely the call
-- the front view makes. Nothing else in the repo calls this function.
--
-- WHAT IT RETURNS AND REFUSES IS UNCHANGED, and the reasoning in
-- 2026082004_public_socials_feed.sql still governs: posted rows only, never
-- `why`, never `confidence`, never a Review or Skipped row, never `platforms`
-- (the bot's suggestion) in place of `posted_platforms` (the fact).

drop function if exists public.tgb_public_socials_feed(integer);

create or replace function public.tgb_public_socials_feed(
  feed_limit integer default 8,
  feed_offset integer default 0
)
returns table (
  id text,
  headline text,
  url text,
  source text,
  image text,
  caption text,
  posted_at timestamptz,
  posted_platforms text[]
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id,
         s.headline,
         s.url,
         s.source,
         s.image,
         -- The column is `blurb` and every piece of visible copy says caption;
         -- the page is visible copy, so it is named caption here.
         s.blurb,
         s.posted_at,
         s.posted_platforms
    from public.socials s
   where s.status = 'posted'
     and s.posted_at is not null
     -- A post with no destination recorded is a row whose receipt is missing,
     -- and this feed is the receipt. Excluded rather than shown as posted
     -- nowhere, which is what it would look like.
     and coalesce(array_length(s.posted_platforms, 1), 0) > 0
   -- A STABLE ORDER, NOT JUST A DESCENDING ONE. Paging over an order with ties
   -- can show one row twice and skip another, and two posts filed in the same
   -- second is an ordinary morning here. `id` breaks the tie.
   order by s.posted_at desc, s.id desc
   limit least(greatest(coalesce(feed_limit, 8), 1), 100)
  offset greatest(coalesce(feed_offset, 0), 0);
$$;

revoke all on function public.tgb_public_socials_feed(integer, integer) from public;
grant execute on function public.tgb_public_socials_feed(integer, integer) to anon, authenticated;

comment on function public.tgb_public_socials_feed(integer, integer) is
  'The things actually POSTED, newest first, for /linkinbio/. Posted rows only, '
  'and never `why`, `confidence`, `platforms`, or any review or skipped row: '
  'the queue and our notes about it are why public.socials is admin-only. '
  'Max 100 a page; walk it with feed_offset. Ordered by (posted_at, id) so '
  'paging cannot repeat or skip a row.';
