-- public.socials.returned_from -- a candidate in Review that has been here before
--
-- APPLY BY HAND in the Supabase SQL editor. Remote migration history in this
-- project has drifted and the CLI refuses `db push`.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
--
-- A row in Review looks identical whether it arrived from the routine an hour
-- ago or came back out of Posted, and those are not the same thing to decide
-- about. Four ways in, and NONE of them left a trace:
--
--   * MOVE from Posted. `savePost(id, {status:'review'})`, and the trigger
--     clears `posted_at` -- so the receipt, which was the only evidence it had
--     ever gone out, is deliberately destroyed. Correct, since the whole point
--     of Move is that it never really went out; but it means the row is then
--     indistinguishable from a fresh one.
--   * COPY from Posted. A brand new row with a fresh id. The original keeps its
--     receipt and the copy carries nothing pointing back at it.
--   * MOVE from Skipped. Same PATCH, same absence.
--   * COPY from Skipped. No button offers this today (see the note below).
--
-- ── WHAT IT HOLDS ───────────────────────────────────────────────────────────
--
-- Four values, the two questions crossed: which side it came back from, and
-- whether the original survived. One column rather than two, because a
-- `returned_how` with no `returned_from` is meaningless and the pair would have
-- to be constrained to agree anyway.
--
-- IT IS OVERWRITTEN ON EVERY RETURN, never cleared. A row that goes out and
-- comes back twice describes its LAST return, which is the one you are looking
-- at. Nothing reads it outside Review, so a stale value on a posted row costs
-- nothing and clearing it would be a second write for no reader.
--
-- IT IS NOT A HISTORY. If a real audit trail is ever wanted, that is an events
-- table, not a wider column.

alter table public.socials
  add column if not exists returned_from text;

alter table public.socials
  drop constraint if exists socials_returned_from_check;

alter table public.socials
  add constraint socials_returned_from_check
  check (returned_from is null or returned_from in
    ('posted-move', 'posted-copy', 'skipped-move', 'skipped-copy'));

comment on column public.socials.returned_from is
  'For a candidate in Review that has been decided before: which side it came '
  'back from and whether the original survived. posted-move | posted-copy | '
  'skipped-move | skipped-copy. Overwritten on every return, never cleared, and '
  'read only while status = review. Not a history.';
