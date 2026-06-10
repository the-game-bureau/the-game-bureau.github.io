-- Store team cities as geographic "City, State/Province" values.
-- Team identity remains represented separately by the mascot column.

create temporary table team_city_normalization (
  identity_name text not null,
  mascot text not null,
  canonical_city text not null,
  primary key (identity_name, mascot)
) on commit drop;

insert into team_city_normalization (identity_name, mascot, canonical_city) values
  ('Alabama', 'Crimson Tide', 'Tuscaloosa, Alabama'),
  ('Arizona', 'Cardinals', 'Phoenix, Arizona'),
  ('Atlanta', 'Falcons', 'Atlanta, Georgia'),
  ('Baltimore', 'Ravens', 'Baltimore, Maryland'),
  ('Buffalo', 'Bills', 'Buffalo, New York'),
  ('Carolina', 'Panthers', 'Charlotte, North Carolina'),
  ('Chicago', 'Bears', 'Chicago, Illinois'),
  ('Cincinnati', 'Bengals', 'Cincinnati, Ohio'),
  ('Cleveland', 'Browns', 'Cleveland, Ohio'),
  ('Dallas', 'Cowboys', 'Dallas, Texas'),
  ('Denver', 'Broncos', 'Denver, Colorado'),
  ('Detroit', 'Lions', 'Detroit, Michigan'),
  ('Green Bay', 'Packers', 'Green Bay, Wisconsin'),
  ('Houston', 'Texans', 'Houston, Texas'),
  ('Indianapolis', 'Colts', 'Indianapolis, Indiana'),
  ('Jacksonville', 'Jaguars', 'Jacksonville, Florida'),
  ('Kansas City', 'Chiefs', 'Kansas City, Missouri'),
  ('Las Vegas', 'Raiders', 'Las Vegas, Nevada'),
  ('Los Angeles', 'Chargers', 'Los Angeles, California'),
  ('Los Angeles', 'Rams', 'Los Angeles, California'),
  ('Louisiana', 'Tigers', 'Baton Rouge, Louisiana'),
  ('Miami', 'Dolphins', 'Miami, Florida'),
  ('Minnesota', 'Vikings', 'Minneapolis, Minnesota'),
  ('New England', 'Patriots', 'Boston, Massachusetts'),
  ('New Orleans', 'Pelicans', 'New Orleans, Louisiana'),
  ('New Orleans', 'Saints', 'New Orleans, Louisiana'),
  ('New York', 'Giants', 'New York, New York'),
  ('New York', 'Jets', 'New York, New York'),
  ('New York', 'Knicks', 'New York, New York'),
  ('Philadelphia', 'Eagles', 'Philadelphia, Pennsylvania'),
  ('Pittsburgh', 'Steelers', 'Pittsburgh, Pennsylvania'),
  ('San Antonio', 'Roadrunners', 'San Antonio, Texas'),
  ('San Francisco', '49ers', 'San Jose, California'),
  ('Seattle', 'Seahawks', 'Seattle, Washington'),
  ('Tampa Bay', 'Buccaneers', 'Tampa, Florida'),
  ('Tennessee', 'Titans', 'Nashville, Tennessee'),
  ('Tulane', 'Green Wave', 'New Orleans, Louisiana'),
  ('Washington', 'Commanders', 'Washington, District of Columbia');

update public.games
set home_team_city = nullif(btrim(home_team_city), ''),
    away_team_city = nullif(btrim(away_team_city), '');

update public.games as game
set home_team_city = mapping.canonical_city
from team_city_normalization as mapping
where lower(split_part(game.home_team_city, ',', 1)) = lower(mapping.identity_name)
  and lower(game.home_team_mascot) = lower(mapping.mascot);

update public.games as game
set away_team_city = mapping.canonical_city
from team_city_normalization as mapping
where lower(split_part(game.away_team_city, ',', 1)) = lower(mapping.identity_name)
  and lower(game.away_team_mascot) = lower(mapping.mascot);

update public.games as game
set nodes = (
  select jsonb_agg(
    case
      when node->>'type' = 'game' then
        case
          when game.away_team_city is not null then
            jsonb_set(
              case
                when game.home_team_city is not null
                  then jsonb_set(node, '{homeTeamCity}', to_jsonb(game.home_team_city), true)
                else node
              end,
              '{awayTeamCity}',
              to_jsonb(game.away_team_city),
              true
            )
          when game.home_team_city is not null
            then jsonb_set(node, '{homeTeamCity}', to_jsonb(game.home_team_city), true)
          else node
        end
      else node
    end
    order by ordinal
  )
  from jsonb_array_elements(game.nodes) with ordinality as entries(node, ordinal)
)
where jsonb_typeof(game.nodes) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(game.nodes) as node
    where node->>'type' = 'game'
  );

alter table public.games
  drop constraint if exists games_home_team_city_format_check,
  drop constraint if exists games_away_team_city_format_check;

alter table public.games
  add constraint games_home_team_city_format_check
    check (
      home_team_city is null
      or (
        home_team_city ~ '^[^,]+, [^,]+$'
        and home_team_city !~ ', [A-Z]{2}$'
      )
    ) not valid,
  add constraint games_away_team_city_format_check
    check (
      away_team_city is null
      or (
        away_team_city ~ '^[^,]+, [^,]+$'
        and away_team_city !~ ', [A-Z]{2}$'
      )
    ) not valid;

alter table public.games validate constraint games_home_team_city_format_check;
alter table public.games validate constraint games_away_team_city_format_check;

comment on column public.games.home_team_city is
  'Home team geographic city in City, full State/Province format.';

comment on column public.games.away_team_city is
  'Away team geographic city in City, full State/Province format.';
