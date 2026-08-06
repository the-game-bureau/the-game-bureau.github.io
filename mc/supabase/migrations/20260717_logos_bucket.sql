-- Logos storage bucket
-- ---------------------------------------------------------------------------
-- Backing store for game logo images. The mc/overview.html editor's "Game Logo"
-- section uploads an image URL to this bucket via the `upload-guide-image` Edge
-- Function (bucket: 'logos'), then records the resulting public URL in
-- games.logo_url so the landing page, engines, and shop render it.
--
-- Mirrors 20260717_guides_bucket.sql exactly, just a separate bucket so guide
-- portraits and logos (both keyed by game id) never collide on path.
--
-- PUBLIC read (logos are shown to every visitor); writes restricted to photo
-- admins. In practice the Edge Function writes with the service role (which
-- bypasses RLS); these policies are defense in depth.
--
-- Idempotent: safe to re-run.

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "logos public read"  on storage.objects;
drop policy if exists "logos admin insert"  on storage.objects;
drop policy if exists "logos admin update"  on storage.objects;
drop policy if exists "logos admin delete"  on storage.objects;

create policy "logos public read"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "logos admin insert"
  on storage.objects for insert
  with check (bucket_id = 'logos' and public.is_photo_admin());

create policy "logos admin update"
  on storage.objects for update
  using (bucket_id = 'logos' and public.is_photo_admin())
  with check (bucket_id = 'logos' and public.is_photo_admin());

create policy "logos admin delete"
  on storage.objects for delete
  using (bucket_id = 'logos' and public.is_photo_admin());
