-- THE SPOTIFY ID CHECK, CARRIED ACROSS.
--
-- `soundtrack_songs_spotify_id_check` was lost in the flatten: the new table
-- declared `spotify_id text` and nothing else. That matters more than it looks.
-- **A fabricated 22-character id passes every eye and silently plays nothing**,
-- which is the exact failure the verify-or-omit rule in all four prompts exists
-- to prevent, and the Tape Room still translates this constraint's name into a
-- sentence -- so without it the box could store a guess and report success.
--
-- BLANK IS STILL ALWAYS ALLOWED and still better than a guess. That is why the
-- check is `null or 22 characters` rather than NOT NULL.
--
-- APPLIED 2026-08-25.

alter table public.soundtrack
  add constraint soundtrack_spotify_id_check
  check (spotify_id is null or spotify_id ~ '^[A-Za-z0-9]{22}$');

-- ── Verify ───────────────────────────────────────────────────────────────────
--   update public.soundtrack set spotify_id = 'nope' where id = (select min(id) from public.soundtrack);
--     -- expect 23514, naming soundtrack_spotify_id_check
