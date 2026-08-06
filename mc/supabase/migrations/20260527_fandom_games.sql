-- Adds an explicit flag for games written for traveling sports fans.
-- The public games directory uses this to decide which games appear under
-- "By Fandom"; the builder exposes it as the FANDOM GAME checkbox.

alter table public.games
  add column if not exists fandom_game boolean not null default false;

comment on column public.games.fandom_game is
  'True when this game is a fandom/traveling-fan game and should appear in the By Fandom directory.';

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'games'
       and column_name = 'away_team_city'
  ) and exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'games'
       and column_name = 'away_team_mascot'
  ) then
    execute $sql$
      update public.games
         set fandom_game = true
       where fandom_game = false
         and nullif(btrim(coalesce(away_team_city, '')), '') is not null
         and nullif(btrim(coalesce(away_team_mascot, '')), '') is not null
    $sql$;
  end if;
end
$$;
