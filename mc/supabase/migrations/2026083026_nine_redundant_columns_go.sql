-- NINE COLUMNS GO. THE VIEW KEEPS ITS CONTRACT BY COMPUTING FOUR OF THEM.
--
-- Every one was measured against the live 640 before it was touched, and each
-- line below is the measurement rather than an opinion:
--
--   code         639 of 639 are split_part(team_key, ':', 2)
--   sport        one value per family, 0 families disagreeing
--   league_sort  one value per family: nfl 0, mlb 1, nba 2, ncaaf 3, nhl 4
--   game_city    equals `fanbase` on 120 of the 124 that have one, **and the
--                four exceptions are the four rows that are WRONG**: Brooklyn,
--                Anaheim, Newark and San Francisco, each stored as the big city
--                next door. Deriving it from the PLACE fixes all four.
--   city_name, state_code, state_name, country_code, country_name
--                derivable from `home_place_id`, **and 21 rows disagree with
--                it** -- the same four plus the seventeen college towns. Worse
--                than redundant: stored wrong.
--
-- ── FOUR ARE STILL ON THE VIEW, BECAUSE THINGS READ THEM ──────────────────
--
-- `code`, `sport` and `game_city` are in `TEAM_SELECT` in team-palette.js, which
-- is what BOTH ENGINES resolve a club through, and `league_sort` is in the
-- `order=` of five different callers. They are COMPUTED in the view, so every
-- reader keeps working and **the value can never drift from what it is derived
-- from again**, which is the whole point of removing the storage.
--
-- ── THE FIVE GEO COLUMNS LEAVE THE VIEW TOO, AND THAT WAS CHECKED ─────────
--
-- **No teams query anywhere asks for one.** Not `TEAM_SELECT`, not
-- games-prefetch's own list; the jersey minigame reads `select=*` and uses none
-- of them. `places` is where a club's town lives.
--
-- ── WHAT IS KEPT, AND WHY, SINCE IT WAS ASKED IN THE SAME BREATH ──────────
--
--   full_name    **NOT redundant. 149 of 639 are NOT `fanbase + nickname`**, so
--                deriving it would quietly rewrite a fifth of the table.
--   team_sort    515 distinct values over 639 rows. Real ordering data.
--   first_name   matches city_name on only 92.
--   fanbase      the school for college, the city for pro.
--   venue_city   **differs from the city on 123 rows** -- it is the venue town,
--                which is the whole Foxborough problem, and the one column here
--                that says something no other column does.
--   espn_id, timezone   sparse, and external facts nothing else holds.
--   text_color   **kept and set to white everywhere**, as asked. It was already
--                #FFFFFF on all 639; one row was null.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083026_nine_redundant_columns_go.sql

begin;

-- WHITE EVERYWHERE, INCLUDING THE ONE NULL. Nothing reads it -- `teamPalette`
-- derives readable ink from `shell` by luminance on purpose, because a club's
-- own text colour is a brand colour that can be white on its own white helmet.
update public.audiences set text_color = '#FFFFFF'
 where text_color is distinct from '#FFFFFF';

drop view if exists public.teams;

alter table public.audiences
  drop column if exists code,
  drop column if exists sport,
  drop column if exists league_sort,
  drop column if exists game_city,
  drop column if exists city_name,
  drop column if exists state_code,
  drop column if exists state_name,
  drop column if exists country_code,
  drop column if exists country_name;

create view public.teams with (security_invoker = true) as
select
  upper(a.family)  as league,
  a.conference,
  -- COMPUTED, NOT STORED. `team_key` is `LEAGUE:CODE`, so the code was always
  -- half of a column beside it.
  split_part(a.team_key, ':', 2) as code,
  a.full_name,
  a.first_name,
  a.fanbase,
  a.nickname       as mascot,
  case a.family
    when 'nfl'   then 'football'
    when 'ncaaf' then 'football'
    when 'nba'   then 'basketball'
    when 'mlb'   then 'baseball'
    when 'nhl'   then 'hockey'
  end as sport,
  a.shell,
  a.stripe,
  a.mask,
  case a.family
    when 'nfl' then 0 when 'mlb' then 1 when 'nba' then 2
    when 'ncaaf' then 3 when 'nhl' then 4
  end as league_sort,
  a.team_sort,
  a.updated_at,
  -- FROM THE PLACE, which is what fixes San Jose, Newark, Anaheim and New York.
  case when p.id is null then null else p.city || ', ' || p.state end as game_city,
  a.venue_city,
  a.timezone,
  a.team_key,
  a.text_color,
  a.espn_id,
  a.division
  from public.audiences a
  left join public.places p on p.id = a.home_place_id
 where a.kind = 'fandom'
   and a.team_key is not null;

comment on view public.teams is
  'A club, computed from public.audiences. `code`, `sport`, `league_sort` and '
  '`game_city` are DERIVED here rather than stored, so they cannot drift from '
  'what they are derived from. The five geo columns are gone: no teams query '
  'ever asked for one, and a club''s town lives in public.places.';

grant select on public.teams to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, against what the pages actually ask for.
--   select count(*) from public.teams;                          -- expect 639
--   select code, sport, league_sort, game_city from public.teams
--    where team_key = 'NFL:SF';        -- SF / football / 0 / San Francisco, CA
--   select game_city from public.teams where team_key in ('NBA:BKN','NHL:NJ','NHL:ANA');
--                                      -- Brooklyn / Newark / Anaheim, all fixed
--   -- every column TEAM_SELECT names is still there:
--   select count(*) from information_schema.columns
--    where table_name = 'teams' and column_name in
--      ('team_key','espn_id','league','conference','division','code','full_name',
--       'first_name','fanbase','mascot','sport','shell','stripe','mask',
--       'text_color','game_city','venue_city','timezone');       -- expect 18
--   -- and ordering still works, which five callers rely on:
--   select team_key from public.teams order by league_sort, team_sort limit 3;
-- ---------------------------------------------------------------------------
