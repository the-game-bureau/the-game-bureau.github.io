-- A TRACK CAN BE MARKED AS SPORTS.
--
-- `public.soundtrack.sports`, a plain boolean, false by default.
--
-- ── WHY PER TRACK AND NOT PER TAPE ──────────────────────────────────────────
--
-- A tape is not a sports tape; it is a city's tape with two or three sports
-- tracks on it. The brief has asked for that ratio since the beginning: fight
-- songs, victory anthems, stadium walk-up and goal songs, what fans sing outside
-- the ground, **2 or 3 of the 15** where the city has a real sports identity.
-- So the fact belongs on the track that IS one.
--
-- ── WHAT IT IS FOR ──────────────────────────────────────────────────────────
--
-- Filtering by it at PLAY time, in a game. Nothing reads it yet. That is worth
-- writing down because an unread boolean invites somebody to repurpose it: this
-- one means "this recording is sports music", not "this track is good for a
-- game", and those will diverge the moment anybody wants the second.
--
-- ── THE GRANT HAS TO BE RE-ISSUED, AND THIS IS THE TRAP ─────────────────────
--
-- `anon`'s SELECT on this table is a PER-COLUMN grant, because `findings` is an
-- internal editorial note and has to stay out of it. **A column added later is
-- not covered by that grant.** The public cassette page names its columns, so a
-- column it names and cannot read answers 42501 for the whole request and the
-- page goes blank. Every migration that adds a column here must end with this
-- block.
--
-- APPLIED 2026-08-26.

alter table public.soundtrack
  add column if not exists sports boolean not null default false;

comment on column public.soundtrack.sports is
  'This recording is sports music: a fight song, a victory anthem, a stadium walk-up or goal song, something a crowd sings outside the ground. Set per TRACK, not per tape. Intended for filtering at play time in a game; nothing reads it yet.';

do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema='public' and table_name='soundtrack' and column_name <> 'findings';
  execute 'revoke select on public.soundtrack from anon';
  execute 'grant select (' || cols || ') on public.soundtrack to anon';
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The column is there and nothing is marked yet:
--      select count(*) filter (where sports) as sports, count(*) from public.soundtrack;
-- 2. anon can read it, and still cannot read findings:
--      /soundtrack?select=id,sports  -> 200
--      /soundtrack?select=*          -> 42501
