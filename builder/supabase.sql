create or replace function public.touch_builder_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.builder_games') is not null and to_regclass('public.games') is null then
    execute 'alter table public.builder_games rename to games';
  end if;
end;
$$;

create table if not exists public.games (
  id text primary key,
  name text not null default 'Untitled Game',
  primary_color text,
  secondary_color text,
  archived text,
  nodes jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.games
  add column if not exists name text not null default 'Untitled Game',
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists archived text,
  add column if not exists nodes jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop trigger if exists touch_builder_games on public.games;
drop trigger if exists touch_games on public.games;
create trigger touch_games
before update on public.games
for each row
execute function public.touch_builder_updated_at();

alter table public.games enable row level security;

drop policy if exists "Public can read builder games" on public.games;
drop policy if exists "Public can read games" on public.games;
create policy "Public can read games"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "Public can insert builder games" on public.games;
drop policy if exists "Public can insert games" on public.games;
create policy "Public can insert games"
on public.games
for insert
to anon, authenticated
with check (true);

drop policy if exists "Public can update builder games" on public.games;
drop policy if exists "Public can update games" on public.games;
create policy "Public can update games"
on public.games
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public can delete builder games" on public.games;
drop policy if exists "Public can delete games" on public.games;
create policy "Public can delete games"
on public.games
for delete
to anon, authenticated
using (true);
