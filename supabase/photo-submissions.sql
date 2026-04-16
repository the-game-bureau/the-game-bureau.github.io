-- Photo proof uploads for the public play page.
--
-- Run this in the Supabase SQL editor for the same project used by the
-- games table. The bucket stays private: public players can upload, but
-- they cannot browse or read uploaded photos.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'game-photo-submissions',
  'game-photo-submissions',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.photo_submissions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  player_id text not null,
  storage_bucket text not null default 'game-photo-submissions',
  storage_path text not null unique,
  file_name text,
  mime_type text,
  file_size bigint,
  stop_id text,
  stop_title text,
  stop_index integer,
  flow_kind text,
  player_vars jsonb not null default '{}'::jsonb,
  page_url text,
  user_agent text,
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'hidden')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists photo_submissions_game_created_idx
on public.photo_submissions (game_id, created_at desc);

create index if not exists photo_submissions_status_created_idx
on public.photo_submissions (status, created_at desc);

alter table public.photo_submissions enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on public.photo_submissions to anon, authenticated;
grant select, update, delete on public.photo_submissions to authenticated;

drop policy if exists "Anyone can submit game photo metadata" on public.photo_submissions;
create policy "Anyone can submit game photo metadata"
on public.photo_submissions
for insert
to anon, authenticated
with check (
  storage_bucket = 'game-photo-submissions'
  and length(btrim(game_id)) > 0
  and length(btrim(player_id)) > 0
  and length(btrim(storage_path)) > 0
);

drop policy if exists "Authenticated can review game photo metadata" on public.photo_submissions;
create policy "Authenticated can review game photo metadata"
on public.photo_submissions
for select
to authenticated
using (true);

drop policy if exists "Authenticated can update game photo reviews" on public.photo_submissions;
create policy "Authenticated can update game photo reviews"
on public.photo_submissions
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete game photo metadata" on public.photo_submissions;
create policy "Authenticated can delete game photo metadata"
on public.photo_submissions
for delete
to authenticated
using (true);

drop policy if exists "Anyone can upload game photos" on storage.objects;
create policy "Anyone can upload game photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'game-photo-submissions'
  and name ~* '^[a-z0-9_-]+/[a-z0-9_-]+/[a-z0-9_-]+/[a-z0-9][a-z0-9_-]*\.(jpe?g|png|webp|gif|heic|heif)$'
);

drop policy if exists "Authenticated can view game photos" on storage.objects;
create policy "Authenticated can view game photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'game-photo-submissions');

drop policy if exists "Authenticated can remove game photos" on storage.objects;
create policy "Authenticated can remove game photos"
on storage.objects
for delete
to authenticated
using (bucket_id = 'game-photo-submissions');
