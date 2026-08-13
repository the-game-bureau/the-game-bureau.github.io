-- Gifts are allowed to repeat. News stories are not. The unique index did not
-- know the difference, and that is what stopped TGB SOCIAL BOT filing a gift.
--
-- WHAT WENT WRONG
--
-- socials_url_idx is a unique index on lower(url) covering every row. For a
-- story that is exactly right: a re-pitch of yesterday's article is noise and
-- the index silently drops it, which is the whole dedupe design.
--
-- For a gift it is fatal. A gift's url is https://thegamebureau.com/gifts/?item=<id>
-- and that string never changes, so once an item has been filed it can never be
-- filed again -- ever. The shop holds 87 live listings; the routine runs twice a
-- day and is required to file a gift every run. Under the old index the gift
-- slot was guaranteed to fail, permanently, after at most 87 runs, and it had
-- already started failing: on 2026-08-13 the bot burned three picks (Sonics
-- snapback, beignet mix, Chiefs Transformer) to duplicates before one landed.
--
-- The bot could not even see it happening. tgb_pull_socials_candidates returns
-- {inserted, skipped} for the whole batch and does not say WHICH row was
-- skipped, and public.socials is admin-read only -- so a run of five with a
-- dead gift reports "inserted 4, skipped 1" and looks like an ordinary
-- duplicate story.
--
-- TWO CHANGES, AND THEY GO TOGETHER
--
--   1. The unique index becomes PARTIAL: it no longer covers gift urls. A gift
--      may be filed as many times as we like, because the shop is a fixed
--      catalogue we post from forever and repeating is the intended behaviour.
--      Stories keep the constraint unchanged.
--
--   2. tgb_socials_used_gift_urls() lets the bot see which gifts it has already
--      filed and when, so "may repeat" does not become "posts the same hat every
--      night". The bot picks the least-recently-filed gift instead of guessing.
--
-- Without (1) the gift slot breaks. Without (2) it works but goes stale. The
-- pair is what makes "at least one gift, every run" actually true.

-- 1 ---------------------------------------------------------------------------

drop index if exists public.socials_url_idx;

-- Same rule as before for everything that is not one of our own gift links.
-- The predicate has to be IMMUTABLE, so it is a plain lower()/like on the
-- column rather than anything cleverer.
create unique index if not exists socials_url_idx
  on public.socials (lower(url))
  where lower(url) not like '%/gifts/?item=%';

comment on index public.socials_url_idx is
  'One candidate per story url. Deliberately EXCLUDES gift urls '
  '(/gifts/?item=...): the gift shop is a fixed catalogue the bot posts from '
  'twice a day, so a gift must be allowed to come round again. Use '
  'tgb_socials_used_gift_urls() to pick the least-recently-filed one.';

-- 2 ---------------------------------------------------------------------------

-- What the bot has already filed from our own shop, oldest first.
--
-- public.socials is admin-read only because `why` is an internal editorial
-- note -- but that blanket rule also hid the one fact the bot legitimately
-- needs about its own past output. This returns nothing editorial: no
-- headline, no caption, no note, no status. Just our own public shop urls and
-- when they were last used. Same bargain as the pull RPCs -- a tiny SECURITY
-- DEFINER surface with no parameters, so there is nothing to inject.
--
-- STABLE so PostgREST will also answer a GET, which means anything that can
-- fetch a url can read it -- including a chat AI running the PROMPT button's
-- instructions, which has no key and cannot POST.
create or replace function public.tgb_socials_used_gift_urls()
returns table (
  item_id text,
  url text,
  times_filed bigint,
  last_filed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select
    split_part(s.url, '?item=', 2) as item_id,
    min(s.url)                     as url,
    count(*)                       as times_filed,
    max(s.created_at)              as last_filed_at
  from public.socials s
  where lower(s.url) like '%/gifts/?item=%'
  group by split_part(s.url, '?item=', 2)
  order by max(s.created_at) asc;
$fn$;

comment on function public.tgb_socials_used_gift_urls() is
  'Gift shop items TGB SOCIAL BOT has already filed, oldest use first, so it '
  'can pick one it has not posted lately. Returns only our own public shop '
  'urls and timestamps -- never headline, caption, why or status, which are '
  'the reason public.socials is admin-read only.';

revoke all on function public.tgb_socials_used_gift_urls() from public;
grant execute on function public.tgb_socials_used_gift_urls() to anon, authenticated;
