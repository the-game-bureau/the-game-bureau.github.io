-- Adds a thumbnail path for photo submissions so the Winners Wall can serve a
-- small JPEG instead of the original multi-megabyte phone upload. Thumbnails
-- are generated client-side at upload time and stored in the same bucket as
-- the original, alongside it, with a `-thumb.jpg` suffix.
--
-- Existing rows are left with thumb_storage_path = null; the reader falls back
-- to storage_path. Backfill (if desired) is a separate one-off job that needs
-- the service role key, since the bucket is read-restricted for anon users.

alter table public.photo_submissions
  add column if not exists thumb_storage_path text;

comment on column public.photo_submissions.thumb_storage_path is
  'Optional path (within storage_bucket) to a small JPEG thumbnail of storage_path. When null, readers fall back to storage_path.';
