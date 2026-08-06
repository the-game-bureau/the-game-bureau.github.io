-- Guides storage bucket
-- ---------------------------------------------------------------------------
-- Backing store for guide (game host) portrait images. The mc/overview.html
-- editor's "Guide Image" section uploads an image URL to this bucket via the
-- `upload-guide-image` Edge Function, then records the resulting public URL in
-- games.guide_image_url so the play-time engines render it.
--
-- The bucket is PUBLIC (read): guide portraits are shown to every player, so
-- the `/storage/v1/object/public/guides/<file>` URL must resolve without auth.
-- Writes are restricted to photo admins; in practice the Edge Function writes
-- with the service role (which bypasses RLS), and these policies are defense in
-- depth for any future authenticated client-side write.
--
-- Idempotent: safe to re-run.

-- 1. The bucket ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('guides', 'guides', true)
on conflict (id) do update set public = excluded.public;

-- 2. Policies on storage.objects for this bucket ---------------------------
-- storage.objects already has RLS enabled by Supabase; we just add the
-- guides-bucket rules. Drop-then-create keeps this migration re-runnable.

drop policy if exists "guides public read"   on storage.objects;
drop policy if exists "guides admin insert"   on storage.objects;
drop policy if exists "guides admin update"   on storage.objects;
drop policy if exists "guides admin delete"   on storage.objects;

-- Anyone may read guide images (public portraits).
create policy "guides public read"
  on storage.objects for select
  using (bucket_id = 'guides');

-- Only photo admins may add / replace / remove them.
create policy "guides admin insert"
  on storage.objects for insert
  with check (bucket_id = 'guides' and public.is_photo_admin());

create policy "guides admin update"
  on storage.objects for update
  using (bucket_id = 'guides' and public.is_photo_admin())
  with check (bucket_id = 'guides' and public.is_photo_admin());

create policy "guides admin delete"
  on storage.objects for delete
  using (bucket_id = 'guides' and public.is_photo_admin());
