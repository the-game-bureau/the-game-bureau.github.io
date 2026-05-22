-- Public read access for the Winners Wall (site/winnerswall.html).
--
-- Adds:
--   1. An anon SELECT policy on photo_submissions filtered to status='approved',
--      so the public page can list approved photos but never sees pending,
--      rejected, or hidden ones.
--   2. Flips the game-photo-submissions bucket to public so <img> tags can
--      load files directly (browsers can't send an apikey header on <img>).
--
-- Privacy trade-off: a public bucket means anyone who guesses a storage path
-- can read the file, even for pending/rejected submissions. Paths follow
--   {game_id}/{player_id}/{stop_id}/{filename}
-- which is obscure but not secret. If stricter privacy is needed for
-- non-approved photos, move approved ones to a separate public bucket on
-- approval or switch to short-lived signed URLs.

update storage.buckets
set public = true
where id = 'game-photo-submissions';

drop policy if exists "Public can read approved game photo metadata" on public.photo_submissions;
create policy "Public can read approved game photo metadata"
on public.photo_submissions
for select
to anon, authenticated
using (status = 'approved');

grant select on public.photo_submissions to anon;
