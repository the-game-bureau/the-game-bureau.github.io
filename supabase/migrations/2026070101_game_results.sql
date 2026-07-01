-- Public TGB game results scoreboard.
--
-- Stores one scoreline per game instance and seeds a handful of dummy rows so
-- the public results page has content immediately after this migration runs.
-- Safe to re-run.

create table if not exists public.game_results (
  gameid         text not null,
  instanceid     text primary key,
  tgbteamname    text not null,
  tgbteamscore   integer not null default 0,
  opponentname   text not null,
  opponentscore  integer not null default 0,
  winnername     text not null,
  created_at     timestamptz not null default timezone('utc', now()),
  constraint game_results_tgb_score_nonnegative check (tgbteamscore >= 0),
  constraint game_results_opponent_score_nonnegative check (opponentscore >= 0),
  constraint game_results_gameid_filled check (length(btrim(gameid)) > 0),
  constraint game_results_instanceid_filled check (length(btrim(instanceid)) > 0),
  constraint game_results_tgbteamname_filled check (length(btrim(tgbteamname)) > 0),
  constraint game_results_opponentname_filled check (length(btrim(opponentname)) > 0),
  constraint game_results_winnername_filled check (length(btrim(winnername)) > 0)
);

create index if not exists game_results_game_created_idx
  on public.game_results (gameid, created_at desc);

create index if not exists game_results_created_idx
  on public.game_results (created_at desc);

comment on table public.game_results is
  'Public scoreboard rows for TGB-vs-opponent game results.';
comment on column public.game_results.gameid is
  'The public games.id value this result belongs to.';
comment on column public.game_results.instanceid is
  'The playthrough or matchup instance identifier. One result row per instance.';
comment on column public.game_results.tgbteamname is
  'The Game Bureau team name shown on the scoreboard.';
comment on column public.game_results.tgbteamscore is
  'The Game Bureau team score.';
comment on column public.game_results.opponentname is
  'Opponent name shown on the scoreboard.';
comment on column public.game_results.opponentscore is
  'Opponent score.';
comment on column public.game_results.winnername is
  'Winning team name for this result.';

grant usage on schema public to anon, authenticated;
grant select on public.game_results to anon, authenticated;
grant insert, update, delete on public.game_results to authenticated;

alter table public.game_results enable row level security;

drop policy if exists "Public can read game results" on public.game_results;
create policy "Public can read game results"
  on public.game_results for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert game results" on public.game_results;
create policy "Admins can insert game results"
  on public.game_results for insert
  to authenticated
  with check (public.is_photo_admin());

drop policy if exists "Admins can update game results" on public.game_results;
create policy "Admins can update game results"
  on public.game_results for update
  to authenticated
  using (public.is_photo_admin())
  with check (public.is_photo_admin());

drop policy if exists "Admins can delete game results" on public.game_results;
create policy "Admins can delete game results"
  on public.game_results for delete
  to authenticated
  using (public.is_photo_admin());

insert into public.game_results (
  gameid,
  instanceid,
  tgbteamname,
  tgbteamscore,
  opponentname,
  opponentscore,
  winnername,
  created_at
) values
  ('atl2026nor', 'demo-atl-001', 'Peachtree Bureau', 42, 'Bayou Riddlers', 35, 'Peachtree Bureau', '2026-06-30 21:10:00+00'),
  ('chc2026atl', 'demo-chc-002', 'Wrigley Sleuths', 28, 'Peach State Puzzlers', 31, 'Peach State Puzzlers', '2026-06-30 19:45:00+00'),
  ('billswagonmaster', 'demo-buf-003', 'Table Smashers', 55, 'Wagon Masters', 49, 'Table Smashers', '2026-06-29 22:15:00+00'),
  ('nfl2026-20261231-bal-cin-bal-cincinnati', 'demo-balcin-004', 'Charm City Crew', 24, 'Queen City Crew', 21, 'Charm City Crew', '2026-06-29 18:30:00+00'),
  ('nfl2026-20260913-atl-pit-atl-pittsburgh', 'demo-atlpit-005', 'Peachtree Detectives', 38, 'Steel City Solvers', 44, 'Steel City Solvers', '2026-06-28 20:20:00+00'),
  ('nfl2026-20260920-gb-nyj-gb-new-york', 'demo-gbnyj-006', 'Cheesehead Cartographers', 47, 'Broadway Clue Club', 32, 'Cheesehead Cartographers', '2026-06-28 17:05:00+00'),
  ('nfl2026-20261011-cle-nyj-cle-new-york', 'demo-clenyj-007', 'Lakefront Bureau', 26, 'Gotham Trail Unit', 30, 'Gotham Trail Unit', '2026-06-27 23:00:00+00'),
  ('nfl2026-20261108-cle-no-cle-new-orleans', 'demo-cleno-008', 'Brownie Road Office', 33, 'French Quarter Files', 29, 'Brownie Road Office', '2026-06-27 18:40:00+00')
on conflict (instanceid) do update
set
  gameid = excluded.gameid,
  tgbteamname = excluded.tgbteamname,
  tgbteamscore = excluded.tgbteamscore,
  opponentname = excluded.opponentname,
  opponentscore = excluded.opponentscore,
  winnername = excluded.winnername,
  created_at = excluded.created_at;
