-- tgb_public_socials_feed(integer) -- what we have actually posted, for /mc/follow/
--
-- APPLY BY HAND in the Supabase SQL editor.
--
-- WHY THIS EXISTS. The Follow page used to CLAIM what the feed is like: a
-- paragraph saying we post scavenger hunts and roadside oddities and one gift in
-- five. Every word of it was true and none of it was evidence. This function
-- lets the page show the last several things that actually went out instead,
-- which is the one argument for following that cannot be written by a copywriter.
--
-- WHY IT NEEDS A FUNCTION AT ALL. `public.socials` is admin-only in both
-- directions, and correctly so: the table holds the REVIEW QUEUE, which is our
-- editorial judgement about stories we have not run, plus `why`, an internal
-- note written for one person. A public page cannot read the table, so it reads
-- this instead.
--
-- ── WHAT IT RETURNS, AND WHAT IT REFUSES TO ─────────────────────────────────
--
-- POSTED ROWS ONLY. `status = 'posted'` with a `posted_at`, which means the item
-- is on our public accounts already. Nothing here is a disclosure: it is the
-- same headline, picture and caption a stranger can see on Instagram.
--
-- IT REFUSES, and each one is deliberate:
--
--   * `why`. The internal note. It is the stated reason the whole table is
--     admin-only, and the bot now writes it in the FIRST PERSON as an aside to
--     us ("I could not find a second source for the closure date"). Publishing
--     that would publish our doubts about our own posts.
--   * `confidence`. The bot's own 1-100 score for its pick. A number saying we
--     rated this post 34 is nobody's business but ours, and it is the field that
--     would most invite a reader to sneer.
--   * every REVIEW row. What we considered and have not run is an editorial
--     judgement. A story sitting in the queue is not a story we have published.
--   * every SKIPPED row. Louder still: that is what we considered and TURNED
--     DOWN, and some of those are turned down for being off-brand or grim.
--   * `platforms`, the bot's SUGGESTION of where a post should go. The reply
--     carries `posted_platforms` instead, which is the receipt of where it
--     actually went. Suggestion and fact must not be confused, and only the fact
--     is true.
--
-- CAPPED AT 24, defaulting to 8. A public endpoint that will hand over the whole
-- table on request is a scraping target; the page shows a handful.
--
-- STABLE, so PostgREST answers a plain GET as well as a POST, which is what lets
-- a static page on GitHub Pages read it with the publishable key.

create or replace function public.tgb_public_socials_feed(feed_limit integer default 8)
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
   order by s.posted_at desc
   limit least(greatest(coalesce(feed_limit, 8), 1), 24);
$$;

revoke all on function public.tgb_public_socials_feed(integer) from public;
grant execute on function public.tgb_public_socials_feed(integer) to anon, authenticated;

comment on function public.tgb_public_socials_feed(integer) is
  'The last few things actually POSTED, for the public Follow page. Posted rows '
  'only, and never `why`, `confidence`, `platforms`, or any review or skipped '
  'row: the queue and our notes about it are the reason public.socials is '
  'admin-only. Max 24.';
