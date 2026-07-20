-- Generalize anchor events beyond sports matchups
-- ---------------------------------------------------------------------------
-- An anchor event can be ANY real-world happening a game is built around — a
-- concert, a convention, a festival, an expo, etc. — not only a sports matchup.
-- This adds a generic core (kind + title + description + url + end_date) on top
-- of the existing schema; the sports fields (league, away/home team tgbids,
-- scores) stay as an OPTIONAL specialization used only when kind = sports.
--
-- Additive + idempotent: the table already exists (20260720_anchor_events.sql),
-- so we only add columns. Nothing is dropped or rewritten.

alter table public.anchor_events
  add column if not exists kind        text,   -- free-form: sports | concert | convention | festival | expo | other
  add column if not exists title       text,   -- event name (sports rows may leave this blank and show the matchup)
  add column if not exists description text,
  add column if not exists url         text,
  add column if not exists end_date    date;    -- for multi-day events (conventions, festivals)

create index if not exists anchor_events_kind_idx on public.anchor_events (kind);
