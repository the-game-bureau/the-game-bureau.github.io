-- Jersey number arithmetic minigame.
-- Public pages read this table directly through PostgREST with the anon key.

create table if not exists public.jersey_game (
  id bigserial primary key,
  city text not null default '',
  player1name text not null,
  player1num integer not null,
  player1sport text not null default '',
  player1team text not null default '',
  player2name text not null,
  player2num integer not null,
  player2sport text not null default '',
  player2team text not null default '',
  player3name text not null,
  player3num integer not null,
  player3sport text not null default '',
  player3team text not null default '',
  "operator" text not null default '+',
  created_at timestamptz not null default now(),
  constraint jersey_game_operator_check check ("operator" in ('+', '-'))
);

alter table public.jersey_game
  add column if not exists id bigserial,
  add column if not exists city text not null default '',
  add column if not exists player1name text not null default '',
  add column if not exists player1num integer not null default 0,
  add column if not exists player1sport text not null default '',
  add column if not exists player1team text not null default '',
  add column if not exists player2name text not null default '',
  add column if not exists player2num integer not null default 0,
  add column if not exists player2sport text not null default '',
  add column if not exists player2team text not null default '',
  add column if not exists player3name text not null default '',
  add column if not exists player3num integer not null default 0,
  add column if not exists player3sport text not null default '',
  add column if not exists player3team text not null default '',
  add column if not exists "operator" text not null default '+',
  add column if not exists created_at timestamptz not null default now();

alter table public.jersey_game
  drop constraint if exists jersey_game_operator_check;

alter table public.jersey_game
  add constraint jersey_game_operator_check check ("operator" in ('+', '-'));

create unique index if not exists jersey_game_equation_uidx
  on public.jersey_game (
    lower(city),
    lower(player1name),
    player1num,
    lower(player2name),
    player2num,
    lower(player3name),
    player3num,
    "operator"
  );

create index if not exists jersey_game_city_idx
  on public.jersey_game (lower(city));

alter table public.jersey_game enable row level security;

drop policy if exists "jersey_game readable by anyone" on public.jersey_game;
create policy "jersey_game readable by anyone"
  on public.jersey_game for select
  using (true);

drop policy if exists "jersey_game write by authenticated" on public.jersey_game;
create policy "jersey_game write by authenticated"
  on public.jersey_game for all
  to authenticated
  using (true)
  with check (true);

grant select on public.jersey_game to anon, authenticated;
grant insert, update, delete on public.jersey_game to authenticated;

do $$
begin
  if to_regclass('public.jersey_game_id_seq') is not null then
    execute 'grant usage, select on sequence public.jersey_game_id_seq to authenticated';
  end if;
end
$$;

insert into public.jersey_game (
  city,
  player1name, player1num, player1sport, player1team,
  player2name, player2num, player2sport, player2team,
  player3name, player3num, player3sport, player3team,
  "operator"
) values
  (
    'New Orleans',
    'HEBERT', 3, 'football', 'New Orleans Saints',
    'ANDERSEN', 7, 'football', 'New Orleans Saints',
    'DANIEL', 10, 'football', 'New Orleans Saints',
    '+'
  ),
  (
    'New Orleans',
    'MILLS', 51, 'football', 'New Orleans Saints',
    'GAJAN', 46, 'football', 'New Orleans Saints',
    'HARTLEY', 5, 'football', 'New Orleans Saints',
    '-'
  )
on conflict do nothing;
