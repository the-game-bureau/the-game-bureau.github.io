-- Team color / identity catalog.
-- Creates the public team palette table used by the site.
-- index.html and mc/builder.html read public.teams via the REST API.
-- site/assets/teams/index.html (the editor) writes to it directly.

create table if not exists public.teams (
  league       text not null,
  conference   text not null default '',  -- empty string = flat (no nested group)
  code         text not null,             -- short code (e.g. 'ARI'); case-sensitive
  full_name    text not null default '',
  first_name   text not null default '',
  fanbase      text not null default '',
  mascot       text not null default '',
  sport        text not null default '',
  shell        text not null default '',
  stripe       text not null default '',
  mask         text not null default '',
  league_sort  int  not null default 0,   -- sort_order across leagues (NFL pinned first)
  team_sort    int  not null default 0,   -- sort_order within a league/conference
  updated_at   timestamptz not null default now(),
  primary key (league, conference, code)
);

create index if not exists teams_league_sort_idx
  on public.teams (league_sort, league);
create index if not exists teams_fanbase_mascot_idx
  on public.teams (lower(fanbase), lower(mascot));

alter table public.teams enable row level security;

-- READ: public (anon + authenticated). The team palette is not secret.
drop policy if exists "teams readable by anyone" on public.teams;
create policy "teams readable by anyone"
  on public.teams for select
  using (true);

-- WRITE: any signed-in user. The editor sits behind mc/admin-auth.js sign-in.
drop policy if exists "teams insert by authenticated" on public.teams;
create policy "teams insert by authenticated"
  on public.teams for insert
  to authenticated
  with check (true);

drop policy if exists "teams update by authenticated" on public.teams;
create policy "teams update by authenticated"
  on public.teams for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "teams delete by authenticated" on public.teams;
create policy "teams delete by authenticated"
  on public.teams for delete
  to authenticated
  using (true);

create or replace function public.set_teams_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teams_updated_at on public.teams;
create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_teams_updated_at();
