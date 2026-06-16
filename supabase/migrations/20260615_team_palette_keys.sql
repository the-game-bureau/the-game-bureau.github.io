-- Make public.teams the canonical identity and palette source for sports teams.
--
-- Stable keys use LEAGUE:CODE (for example NFL:NO or MLB:CHC). City, mascot,
-- and conference remain editable display metadata and may change without
-- changing the key.

-- One exact duplicate currently exists for NCAAF:DEL. Prefer the conference
-- row when two rows have the same league/code and identical identity/palette.
delete from public.teams as duplicate
using public.teams as preferred
where upper(duplicate.league) = upper(preferred.league)
  and upper(duplicate.code) = upper(preferred.code)
  and duplicate.conference = ''
  and preferred.conference <> ''
  and duplicate.full_name = preferred.full_name
  and duplicate.fanbase = preferred.fanbase
  and duplicate.mascot = preferred.mascot
  and duplicate.shell = preferred.shell
  and duplicate.stripe = preferred.stripe
  and duplicate.mask = preferred.mask;

alter table public.teams
  add column if not exists team_key text generated always as (
    upper(btrim(league)) || ':' || upper(btrim(code))
  ) stored,
  add column if not exists text_color text not null default '#FFFFFF';

create unique index if not exists teams_team_key_uidx
  on public.teams (team_key);

comment on column public.teams.team_key is
  'Stable public team identity in LEAGUE:CODE form. Conference and city are deliberately excluded.';
comment on column public.teams.shell is
  'Canonical team primary color. Synonymous with primary at rendering boundaries.';
comment on column public.teams.stripe is
  'Canonical team secondary color. Synonymous with secondary at rendering boundaries.';
comment on column public.teams.mask is
  'Canonical team tertiary color. Synonymous with tertiary at rendering boundaries.';
comment on column public.teams.text_color is
  'Canonical fourth/text color used by team-themed game interfaces.';

alter table public.games
  add column if not exists away_team_key text,
  add column if not exists home_team_key text;

create index if not exists games_away_team_key_idx on public.games (away_team_key);
create index if not exists games_home_team_key_idx on public.games (home_team_key);

create or replace function public.normalize_team_identity(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.infer_team_key(
  p_team_key text default null,
  p_league text default null,
  p_code text default null,
  p_city text default null,
  p_mascot text default null
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  with scored as (
    select
      team.team_key,
      (
        case
          when nullif(btrim(coalesce(p_team_key, '')), '') is not null
            and upper(btrim(p_team_key)) = team.team_key then 10000
          else 0
        end
        + case
          when nullif(btrim(coalesce(p_league, '')), '') is not null
            and upper(btrim(p_league)) = upper(team.league) then 100
          when nullif(btrim(coalesce(p_league, '')), '') is not null then -30
          else 0
        end
        + case
          when nullif(btrim(coalesce(p_code, '')), '') is not null
            and upper(btrim(p_code)) = upper(team.code) then 300
          else 0
        end
        + case
          when nullif(public.normalize_team_identity(p_mascot), '') is not null
            and public.normalize_team_identity(p_mascot) in (
              public.normalize_team_identity(team.mascot),
              public.normalize_team_identity(team.full_name)
            ) then 160
          else 0
        end
        + case
          when nullif(public.normalize_team_identity(p_city), '') is not null
            and public.normalize_team_identity(p_city) in (
              public.normalize_team_identity(team.fanbase),
              public.normalize_team_identity(team.first_name),
              public.normalize_team_identity(team.game_city),
              public.normalize_team_identity(team.venue_city),
              public.normalize_team_identity(team.full_name)
            ) then 120
          when nullif(public.normalize_team_identity(split_part(coalesce(p_city, ''), ',', 1)), '') is not null
            and public.normalize_team_identity(split_part(coalesce(p_city, ''), ',', 1)) in (
              public.normalize_team_identity(split_part(coalesce(team.fanbase, ''), ',', 1)),
              public.normalize_team_identity(split_part(coalesce(team.first_name, ''), ',', 1)),
              public.normalize_team_identity(split_part(coalesce(team.game_city, ''), ',', 1)),
              public.normalize_team_identity(split_part(coalesce(team.venue_city, ''), ',', 1))
            ) then 70
          else 0
        end
      ) as score
    from public.teams as team
  ),
  best as (
    select team_key, score, dense_rank() over (order by score desc) as score_rank
    from scored
  )
  select case
    when max(score) filter (where score_rank = 1) >= 100
      and count(*) filter (where score_rank = 1) = 1
    then max(team_key) filter (where score_rank = 1)
    else null
  end
  from best;
$$;

comment on function public.infer_team_key(text, text, text, text, text) is
  'Infers one stable LEAGUE:CODE team key from an explicit key, league/code, or legacy city/mascot labels.';

with parsed as (
  select
    game.id,
    case
      when game.id ~* '^nfl' then 'NFL'
      when game.id ~* '^mlb' then 'MLB'
      when game.id ~* '^nba' then 'NBA'
      when game.id ~* '^nhl' then 'NHL'
      when game.tags @> '["NFL"]'::jsonb then 'NFL'
      when game.tags @> '["NCAAF"]'::jsonb then 'NCAAF'
      when game.tags @> '["MLB"]'::jsonb then 'MLB'
      when game.tags @> '["NBA"]'::jsonb then 'NBA'
      when game.tags @> '["NHL"]'::jsonb then 'NHL'
      when lower(coalesce(game.category_icon, '')) = 'baseball' then 'MLB'
      when lower(coalesce(game.category_icon, '')) = 'basketball' then 'NBA'
      when lower(coalesce(game.category_icon, '')) = 'hockey' then 'NHL'
      else null
    end as inferred_league,
    regexp_match(
      lower(game.id),
      '^(?:nfl|mlb|nba|nhl)[0-9]*-[0-9]{8}-([a-z0-9]+)-([a-z0-9]+)-'
    ) as matchup_codes
  from public.games as game
)
update public.games as game
set
  away_team_key = public.infer_team_key(
    game.away_team_key,
    parsed.inferred_league,
    parsed.matchup_codes[1],
    game.away_team_city,
    game.away_team_mascot
  ),
  home_team_key = public.infer_team_key(
    game.home_team_key,
    parsed.inferred_league,
    parsed.matchup_codes[2],
    game.home_team_city,
    game.home_team_mascot
  )
from parsed
where parsed.id = game.id
  and game.fandom_game = true;

do $$
declare
  missing_away bigint;
begin
  select count(*)
  into missing_away
  from public.games
  where fandom_game = true
    and away_team_key is null;

  if missing_away > 0 then
    raise exception 'Team-key backfill left % fandom games without away_team_key', missing_away;
  end if;
end
$$;

alter table public.games
  drop constraint if exists games_away_team_key_fkey,
  drop constraint if exists games_home_team_key_fkey;

alter table public.games
  add constraint games_away_team_key_fkey
    foreign key (away_team_key) references public.teams(team_key)
    on update cascade on delete set null,
  add constraint games_home_team_key_fkey
    foreign key (home_team_key) references public.teams(team_key)
    on update cascade on delete set null;

comment on column public.games.away_team_key is
  'Stable teams.team_key reference for the matchup away team. Fandom palettes use this before legacy labels.';
comment on column public.games.home_team_key is
  'Stable teams.team_key reference for the matchup home team. Fandom palettes use this before legacy labels.';

create or replace function public.infer_game_team_keys()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  inferred_league text;
  matchup_codes text[];
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

  if new.away_team_key is null then
    new.away_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[1],
      new.away_team_city,
      new.away_team_mascot
    );
  end if;
  if new.home_team_key is null then
    new.home_team_key := public.infer_team_key(
      null,
      inferred_league,
      matchup_codes[2],
      new.home_team_city,
      new.home_team_mascot
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_games_infer_team_keys on public.games;
create trigger trg_games_infer_team_keys
  before insert or update of id, tags, category_icon, away_team_city, away_team_mascot,
    home_team_city, home_team_mascot, away_team_key, home_team_key
  on public.games
  for each row execute function public.infer_game_team_keys();

-- games_with_graph was created before these columns existed. This lightweight
-- wrapper appends stable team keys without duplicating the graph reconstruction.
create or replace view public.games_with_graph_and_teams as
select
  graph.*,
  game.away_team_key,
  game.home_team_key
from public.games_with_graph as graph
join public.games as game using (id);

comment on view public.games_with_graph_and_teams is
  'Graph compatibility view plus stable away/home teams.team_key references.';

grant select on public.games_with_graph_and_teams to anon, authenticated;
