-- Remove draws from public Highlights / Scoreboard dummy data.
-- Safe to re-run.

update public.game_results
set
  opponentscore = 30,
  winnername = 'Gotham Trail Unit'
where instanceid = 'demo-clenyj-007';

with seed as (
  select
    gs as n,
    (array[
      'atl2026nor',
      'chc2026atl',
      'billswagonmaster',
      'nfl2026-20261231-bal-cin-bal-cincinnati',
      'nfl2026-20260913-atl-pit-atl-pittsburgh',
      'nfl2026-20260920-gb-nyj-gb-new-york',
      'nfl2026-20261011-cle-nyj-cle-new-york',
      'nfl2026-20261108-cle-no-cle-new-orleans'
    ])[((gs - 1) % 8) + 1] as gameid,
    (array[
      'Peachtree Bureau',
      'Wrigley Sleuths',
      'Table Smashers',
      'Charm City Crew',
      'Peachtree Detectives',
      'Cheesehead Cartographers',
      'Lakefront Bureau',
      'Brownie Road Office'
    ])[((gs - 1) % 8) + 1] as tgbteamname,
    (array[
      'Bayou Riddlers',
      'Peach State Puzzlers',
      'Wagon Masters',
      'Queen City Crew',
      'Steel City Solvers',
      'Broadway Clue Club',
      'Gotham Trail Unit',
      'French Quarter Files'
    ])[((gs - 1) % 8) + 1] as opponentname,
    19 + ((gs * 5) % 29) as base_score,
    3 + (gs % 8) as point_swing
  from generate_series(9, 72) as gs
),
scored as (
  select
    gameid,
    n,
    tgbteamname,
    opponentname,
    case
      when n % 3 = 0 then base_score
      else base_score + point_swing
    end as tgbteamscore,
    case
      when n % 3 = 0 then base_score + point_swing
      else base_score
    end as opponentscore
  from seed
)
insert into public.game_results (
  gameid,
  instanceid,
  tgbteamname,
  tgbteamscore,
  opponentname,
  opponentscore,
  winnername,
  created_at
)
select
  gameid,
  'demo-scroll-' || lpad(n::text, 3, '0') as instanceid,
  tgbteamname,
  tgbteamscore,
  opponentname,
  opponentscore,
  case
    when tgbteamscore > opponentscore then tgbteamname
    else opponentname
  end as winnername,
  '2026-06-25 12:00:00+00'::timestamptz + (n * interval '1 hour') as created_at
from scored
on conflict (instanceid) do update
set
  gameid = excluded.gameid,
  tgbteamname = excluded.tgbteamname,
  tgbteamscore = excluded.tgbteamscore,
  opponentname = excluded.opponentname,
  opponentscore = excluded.opponentscore,
  winnername = excluded.winnername,
  created_at = excluded.created_at;
