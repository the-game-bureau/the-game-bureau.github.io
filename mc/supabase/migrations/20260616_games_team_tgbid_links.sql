-- Link games to teams by teams.tgbid while preserving the existing
-- teams.team_key compatibility columns.
--
-- The tgbid is the permanent team identity. team_key remains useful for
-- readable imports and older writers, but the views below expose joined team
-- rows so clients can pull palette, sport, city, timezone, and identity fields
-- directly from public.teams.

do $$
begin
  if exists (select 1 from public.teams where tgbid is null) then
    raise exception 'Cannot link games to teams.tgbid while teams.tgbid has NULL values';
  end if;
end
$$;

alter table public.teams alter column tgbid set not null;

drop index if exists teams_tgbid_uidx;
create unique index teams_tgbid_uidx on public.teams (tgbid);

comment on column public.teams.tgbid is
  'Permanent unique The Game Bureau team id. Referenced by games.away_team_tgbid/home_team_tgbid.';

alter table public.games
  add column if not exists away_team_tgbid int,
  add column if not exists home_team_tgbid int;

create index if not exists games_away_team_tgbid_idx on public.games (away_team_tgbid);
create index if not exists games_home_team_tgbid_idx on public.games (home_team_tgbid);

-- Backfill tgbids from the existing stable team_key references.
update public.games as game
set away_team_tgbid = team.tgbid
from public.teams as team
where game.away_team_key = team.team_key
  and game.away_team_tgbid is distinct from team.tgbid;

update public.games as game
set home_team_tgbid = team.tgbid
from public.teams as team
where game.home_team_key = team.team_key
  and game.home_team_tgbid is distinct from team.tgbid;

-- Backfill keys from any tgbids already written by external import tools.
update public.games as game
set away_team_key = team.team_key
from public.teams as team
where game.away_team_tgbid = team.tgbid
  and game.away_team_key is distinct from team.team_key;

update public.games as game
set home_team_key = team.team_key
from public.teams as team
where game.home_team_tgbid = team.tgbid
  and game.home_team_key is distinct from team.team_key;

alter table public.games
  drop constraint if exists games_away_team_tgbid_fkey,
  drop constraint if exists games_home_team_tgbid_fkey;

alter table public.games
  add constraint games_away_team_tgbid_fkey
    foreign key (away_team_tgbid) references public.teams(tgbid)
    on update cascade on delete set null,
  add constraint games_home_team_tgbid_fkey
    foreign key (home_team_tgbid) references public.teams(tgbid)
    on update cascade on delete set null;

comment on column public.games.away_team_tgbid is
  'Permanent teams.tgbid reference for the matchup away/fan team. Preferred over legacy display labels.';
comment on column public.games.home_team_tgbid is
  'Permanent teams.tgbid reference for the matchup home/opponent team. Preferred over legacy display labels.';

create or replace function public.infer_game_team_keys()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inferred_league text;
  matchup_codes text[];
  away_key_tgbid int;
  home_key_tgbid int;
  away_tgbid_key text;
  home_tgbid_key text;
begin
  inferred_league := case
    when new.id ~* '^nfl' then 'NFL'
    when new.id ~* '^mlb' then 'MLB'
    when new.id ~* '^nba' then 'NBA'
    when new.id ~* '^nhl' then 'NHL'
    when new.tags @> '["NFL"]'::jsonb then 'NFL'
    when new.tags @> '["NCAAF"]'::jsonb then 'NCAAF'
    when new.tags @> '["MLB"]'::jsonb then 'MLB'
    when new.tags @> '["NBA"]'::jsonb then 'NBA'
    when new.tags @> '["NHL"]'::jsonb then 'NHL'
    when lower(coalesce(new.category_icon, '')) = 'baseball' then 'MLB'
    when lower(coalesce(new.category_icon, '')) = 'basketball' then 'NBA'
    when lower(coalesce(new.category_icon, '')) = 'hockey' then 'NHL'
    else null
  end;

  matchup_codes := regexp_match(
    lower(new.id),
    '^(?:nfl|mlb|nba|nhl)[0-9]*-[0-9]{8}-([a-z0-9]+)-([a-z0-9]+)-'
  );

  if new.away_team_key is null and new.away_team_tgbid is null then
    new.away_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[1],
      new.away_team_city,
      new.away_team_mascot
    );
  end if;

  if new.home_team_key is null and new.home_team_tgbid is null then
    new.home_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[2],
      new.home_team_city,
      new.home_team_mascot
    );
  end if;

  select team.tgbid into away_key_tgbid
  from public.teams as team
  where team.team_key = new.away_team_key;

  select team.tgbid into home_key_tgbid
  from public.teams as team
  where team.team_key = new.home_team_key;

  select team.team_key into away_tgbid_key
  from public.teams as team
  where team.tgbid = new.away_team_tgbid;

  select team.team_key into home_tgbid_key
  from public.teams as team
  where team.tgbid = new.home_team_tgbid;

  -- Keep key and tgbid paired. If one side was just changed in an update,
  -- prefer that changed value; otherwise prefer tgbid because it is the
  -- permanent identity.
  if new.away_team_tgbid is null then
    new.away_team_tgbid := away_key_tgbid;
  elsif new.away_team_key is null then
    new.away_team_key := away_tgbid_key;
  elsif away_key_tgbid is distinct from new.away_team_tgbid then
    if TG_OP = 'UPDATE'
      and new.away_team_key is distinct from old.away_team_key
      and new.away_team_tgbid is not distinct from old.away_team_tgbid then
      new.away_team_tgbid := away_key_tgbid;
    else
      new.away_team_key := away_tgbid_key;
    end if;
  end if;

  if new.home_team_tgbid is null then
    new.home_team_tgbid := home_key_tgbid;
  elsif new.home_team_key is null then
    new.home_team_key := home_tgbid_key;
  elsif home_key_tgbid is distinct from new.home_team_tgbid then
    if TG_OP = 'UPDATE'
      and new.home_team_key is distinct from old.home_team_key
      and new.home_team_tgbid is not distinct from old.home_team_tgbid then
      new.home_team_tgbid := home_key_tgbid;
    else
      new.home_team_key := home_tgbid_key;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_games_infer_team_keys on public.games;
create trigger trg_games_infer_team_keys
  before insert or update of id, tags, category_icon, away_team_city, away_team_mascot,
    home_team_city, home_team_mascot, away_team_key, home_team_key,
    away_team_tgbid, home_team_tgbid
  on public.games
  for each row execute function public.infer_game_team_keys();

-- Lightweight public read view: game columns plus full away/home team records.
create or replace view public.games_with_teams as
select
  game.*,
  to_jsonb(away_team) as away_team,
  to_jsonb(home_team) as home_team
from public.games as game
left join public.teams as away_team
  on away_team.tgbid = game.away_team_tgbid
left join public.teams as home_team
  on home_team.tgbid = game.home_team_tgbid;

comment on view public.games_with_teams is
  'Public games rows enriched with full away_team/home_team JSON objects from public.teams via teams.tgbid.';

grant select on public.games_with_teams to anon, authenticated;

-- Graph compatibility view plus full team records. Preserve existing columns
-- first, then append tgbid refs and team JSON.
create or replace view public.games_with_graph_and_teams as
select
  graph.*,
  game.away_team_key,
  game.home_team_key,
  game.away_team_tgbid,
  game.home_team_tgbid,
  to_jsonb(away_team) as away_team,
  to_jsonb(home_team) as home_team
from public.games_with_graph as graph
join public.games as game using (id)
left join public.teams as away_team
  on away_team.tgbid = game.away_team_tgbid
left join public.teams as home_team
  on home_team.tgbid = game.home_team_tgbid;

comment on view public.games_with_graph_and_teams is
  'Graph compatibility view plus away/home teams.tgbid references and full teams-table JSON records.';

grant select on public.games_with_graph_and_teams to anon, authenticated;
