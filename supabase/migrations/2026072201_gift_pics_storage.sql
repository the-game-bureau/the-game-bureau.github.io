-- Gift shop images: a public `gift-pics` Storage bucket
-- ---------------------------------------------------------------------------
-- Some gift sources sit behind Cloudflare bot protection or send
-- Cross-Origin-Resource-Policy: same-origin, so their images can never be
-- hotlinked into the shop or the Stock Room preview (the request comes back as
-- a 403 challenge page, not an image). The fix is to rehost: the admin uploads
-- the picture here and gift_shop_items.image_url points at the public URL.
--
-- Objects are keyed <gift item id>/<timestamp>.jpg, so a gift's images stay
-- grouped and a re-upload never clobbers the previous one.
--
-- Read is public (the shop is a public site). Write is admin-only, gated by the
-- same is_photo_admin() check the rest of the gift-shop admin uses.
--
-- Idempotent: safe to re-run. Rollback at the bottom (commented).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gift-pics',
  'gift-pics',
  true,
  10485760, -- 10 MB; the admin downscales to ~1200px before upload
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read (the bucket is public, but the policy makes it explicit).
drop policy if exists "gift_pics_public_read" on storage.objects;
create policy "gift_pics_public_read"
  on storage.objects for select
  using (bucket_id = 'gift-pics');

-- Only gift-shop admins may add, replace or remove images.
drop policy if exists "gift_pics_admin_insert" on storage.objects;
create policy "gift_pics_admin_insert"
  on storage.objects for insert
  with check (bucket_id = 'gift-pics' and public.is_photo_admin());

drop policy if exists "gift_pics_admin_update" on storage.objects;
create policy "gift_pics_admin_update"
  on storage.objects for update
  using (bucket_id = 'gift-pics' and public.is_photo_admin())
  with check (bucket_id = 'gift-pics' and public.is_photo_admin());

drop policy if exists "gift_pics_admin_delete" on storage.objects;
create policy "gift_pics_admin_delete"
  on storage.objects for delete
  using (bucket_id = 'gift-pics' and public.is_photo_admin());

-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- drop policy if exists "gift_pics_admin_delete" on storage.objects;
-- drop policy if exists "gift_pics_admin_update" on storage.objects;
-- drop policy if exists "gift_pics_admin_insert" on storage.objects;
-- drop policy if exists "gift_pics_public_read" on storage.objects;
-- delete from storage.objects where bucket_id = 'gift-pics';
-- delete from storage.buckets where id = 'gift-pics';
