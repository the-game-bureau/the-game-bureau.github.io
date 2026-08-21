-- tgb_public_socials_feed -- only what actually went to Instagram
--
-- APPLY BY HAND in the Supabase SQL editor.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
-- /linkinbio/ EXISTS BECAUSE INSTAGRAM'S CAPTION LINK IS NOT CLICKABLE. That is
-- the whole reason for the page: somebody reads a post on Instagram, wants the
-- story, and has nowhere to tap. The address in the bio is the answer.
--
-- So a row that never went to Instagram is a row nobody arriving here is
-- looking for. Worse, it is actively confusing: the list is read as "the things
-- I just saw", and a Facebook-only post is a thing this reader has not seen.
-- Of the newest 24 posts on the day this was written, 18 had gone to Instagram
-- and 6 had not.
--
-- ── HOW ─────────────────────────────────────────────────────────────────────
--
-- `posted_platforms` is the RECEIPT: the accounts a human actually pressed,
-- written by Done from the Edge Function's own reply. It is not `platforms`,
-- which is the bot's SUGGESTION and may name an account that refused the post
-- or was never pressed. Filtering on the suggestion would list stories that are
-- not on Instagram at all.
--
-- MATCHED CASE-INSENSITIVELY. The page writes the display name 'Instagram' from
-- PLATFORM_NAME, and every row in the table today spells it that way, but a
-- receipt written by some earlier version of the room is not worth a bug.
--
-- ── WHAT IS NOT CHANGED ─────────────────────────────────────────────────────
--
-- THE SIGNATURE. Still (integer, integer), so /linkinbio/ needs no edit, no
-- third parameter is sent, and there is no second overload for PostgREST to
-- refuse to choose between. Until this is applied the page simply shows a
-- broader list, which is harmless.
--
-- THE NAME IS NOW NARROWER THAN IT READS, and that is a real cost worth stating
-- rather than hiding: `tgb_public_socials_feed` sounds general and is not. It
-- has exactly one caller and that caller is an Instagram bio link, so the
-- honest description is in the comment below. IF A GENERAL FEED IS EVER WANTED
-- AGAIN it needs a parameter, which means dropping this signature and creating
-- a three-argument one -- do not add an overload beside it.
--
-- Everything it returns and refuses is otherwise unchanged, and the reasoning in
-- 2026082004 and 2026082104 still governs: posted rows only, never `why`, never
-- `confidence`, never a Review or Skipped row.

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
     -- INSTAGRAM ONLY. See the note above: this feed serves a bio link, and a
     -- story that never went to Instagram is one the reader has not seen.
     and exists (
       select 1
         from unnest(s.posted_platforms) as p
        where lower(p) = 'instagram'
     )
   -- A STABLE ORDER, NOT JUST A DESCENDING ONE. Paging over an order with ties
   -- can show one row twice and skip another, and two posts filed in the same
   -- second is an ordinary morning here. `id` breaks the tie.
   order by s.posted_at desc, s.id desc
   limit least(greatest(coalesce(feed_limit, 8), 1), 100)
  offset greatest(coalesce(feed_offset, 0), 0);
$$;

comment on function public.tgb_public_socials_feed(integer, integer) is
  'Posts that actually went to INSTAGRAM, newest first, for the /linkinbio/ bio '
  'link. Narrower than the name suggests, deliberately: the page exists because '
  'an Instagram caption link is not clickable, so a story that never went there '
  'is one its reader has not seen. Matched on posted_platforms (the receipt), '
  'never platforms (the bot''s suggestion). Never `why`, `confidence`, or any '
  'review or skipped row. Max 100 a page; walk it with feed_offset.';
