-- public.socials.captions -- a caption per account, where one is wanted
--
-- APPLY BY HAND in the Supabase SQL editor.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
-- ONE CAPTION CANNOT BE RIGHT FOR FOUR ACCOUNTS, and the mismatch was being
-- absorbed silently:
--
--   * X allows 280 characters and counts a link as 23 however long it is, so a
--     caption written to the 200-character house rule plus a link is close to
--     the edge. xText() TRIMS with an ellipsis rather than refusing -- the right
--     call, since losing a tail beats a post that never goes out -- but it
--     means a sentence can be cut in half with nothing on screen saying so.
--   * INSTAGRAM'S CAPTION LINK IS NOT CLICKABLE. "Read it here" is a dead
--     instruction on the one account where it cannot be followed.
--   * FACEBOOK unfurls the destination into a card carrying its own headline,
--     so a caption that repeats that headline says it twice.
--
-- ── WHAT IT HOLDS ───────────────────────────────────────────────────────────
--
-- An object keyed by platform, holding ONLY the accounts somebody has written a
-- different caption for: {"x": "...", "instagram": "..."}.
--
-- `blurb` REMAINS THE CAPTION. This column is overrides and nothing else, so an
-- absent key means "use the shared one" and every row that predates this
-- migration is already correct with a null. Nothing had to be backfilled and
-- nothing has two sources of truth: there is one caption, and some accounts may
-- say something else instead.
--
-- A BLANK OVERRIDE IS NOT AN EMPTY CAPTION. The editor deletes the key rather
-- than storing '', so there is no way to express "post nothing to Instagram" by
-- accident. Emptying a box means go back to the shared caption, which is what
-- clearing an override obviously ought to mean.
--
-- THE BOT DOES NOT WRITE THIS, deliberately, and neither prompt mentions it. A
-- model asked for five captions writes five versions of one sentence, which is
-- four more things to read for a candidate most of which are skipped. An
-- override is a human deciding one account needs different words.

alter table public.socials
  add column if not exists captions jsonb;

comment on column public.socials.captions is
  'Per-account caption OVERRIDES, keyed by platform: {"x": "..."}. `blurb` is '
  'still the caption; an absent key means use it. A cleared override deletes '
  'its key rather than storing an empty string. Not written by the bot.';
