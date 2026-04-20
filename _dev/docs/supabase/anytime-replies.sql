-- Anytime player replies (SPECIFIC ANYTIME): globally triggered reply + response
-- pairs that fire whenever the player types a matching trigger, regardless of
-- where they are in the game.
--
-- Run this in the Supabase SQL editor for the same project used by the
-- games table. Assumes public.admin_users and public.is_photo_admin() from
-- photo-submissions.sql already exist (re-used as the admin guard).

create table if not exists public.anytime_replies (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  trigger_text text not null,
  response_text text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists anytime_replies_game_order_idx
  on public.anytime_replies (game_id, order_index);

-- Keep updated_at fresh on every UPDATE.
create or replace function public.touch_anytime_replies_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists anytime_replies_touch_updated_at on public.anytime_replies;
create trigger anytime_replies_touch_updated_at
before update on public.anytime_replies
for each row
execute function public.touch_anytime_replies_updated_at();

alter table public.anytime_replies enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.anytime_replies to anon, authenticated;
grant insert, update, delete on public.anytime_replies to authenticated;

-- Anyone (player page) can read the triggers + responses.
drop policy if exists "Anyone can read anytime replies" on public.anytime_replies;
create policy "Anyone can read anytime replies"
on public.anytime_replies
for select
to anon, authenticated
using (true);

-- Only admin users can edit them (same guard used by photo review).
drop policy if exists "Admins can insert anytime replies" on public.anytime_replies;
create policy "Admins can insert anytime replies"
on public.anytime_replies
for insert
to authenticated
with check (public.is_photo_admin());

drop policy if exists "Admins can update anytime replies" on public.anytime_replies;
create policy "Admins can update anytime replies"
on public.anytime_replies
for update
to authenticated
using (public.is_photo_admin())
with check (public.is_photo_admin());

drop policy if exists "Admins can delete anytime replies" on public.anytime_replies;
create policy "Admins can delete anytime replies"
on public.anytime_replies
for delete
to authenticated
using (public.is_photo_admin());
