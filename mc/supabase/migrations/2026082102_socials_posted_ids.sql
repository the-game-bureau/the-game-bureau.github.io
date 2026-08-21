-- public.socials.posted_ids -- the platform's own id for each post we made
--
-- APPLY BY HAND in the Supabase SQL editor.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
-- socials-post ALREADY RETURNS THESE AND THE PAGE THREW THEM AWAY. Every
-- successful post answers `{platform, ok: true, id}` -- Facebook's post_id,
-- Instagram's media id, the Threads post id -- and `markPosted` recorded only
-- the platform NAMES in `posted_platforms`.
--
-- The id is the only handle by which a post can ever be asked about again:
-- Meta and Threads both serve engagement figures for a post you own, BY ID, and
-- there is no way to recover it afterwards from a row that did not keep it. So
-- this is not an analytics feature, it is the thing that has to exist BEFORE
-- one is possible. It costs nothing to keep and cannot be backfilled.
--
-- ── WHAT IT HOLDS ───────────────────────────────────────────────────────────
--
-- An object keyed by platform: {"facebook": "123_456", "threads": "789"}.
--
-- KEYED, NOT AN ARRAY, because an id is meaningless without knowing whose it
-- is, and `posted_platforms` beside it is an ordered list that a later edit
-- could fall out of step with.
--
-- BY-HAND ACCOUNTS ARE SIMPLY ABSENT. X and YouTube are posted by a human in
-- the platform's own composer, so nothing here ever learns their ids. A missing
-- key means "we did not make this post through the API", which is true and
-- useful; a null or an empty string would look like a failure.
--
-- `posted_platforms` IS UNCHANGED and remains the receipt a human reads. This
-- is the machine-readable half beside it.

alter table public.socials
  add column if not exists posted_ids jsonb;

comment on column public.socials.posted_ids is
  'The platform''s own id for each post we made through the API, keyed by '
  'platform: {"facebook": "123_456"}. By-hand accounts (X, YouTube) are absent '
  'because we never see their ids. The only handle by which a post can later be '
  'asked about, and not recoverable after the fact. posted_platforms stays the '
  'human-readable receipt.';
