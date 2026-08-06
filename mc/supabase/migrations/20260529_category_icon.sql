-- CATEGORY_ICON: game-level control for the public sports-mark icon.
-- Values map directly to the generated mark families used by the public
-- games page: football helmet, basketball, baseball, and pixel music notes.

alter table public.games
  add column if not exists category_icon text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'games_category_icon_check'
       and conrelid = 'public.games'::regclass
  ) then
    alter table public.games
      add constraint games_category_icon_check
      check (
        category_icon is null
        or category_icon in ('football', 'basketball', 'baseball', 'music')
      );
  end if;
end
$$;

comment on column public.games.category_icon is
  'CATEGORY_ICON chosen per game for public card marks: football, basketball, baseball, or music. Null preserves non-sports/default emoji behavior.';

-- Backfill from the old behavior: public pages chose the mark from the
-- matched away team sport. Rows without an away team had no sport mark, so
-- they intentionally remain null.
update public.games as g
   set category_icon = case lower(coalesce(t.sport, ''))
     when 'basketball' then 'basketball'
     when 'baseball' then 'baseball'
     else 'football'
   end
  from public.teams as t
 where nullif(btrim(coalesce(g.category_icon, '')), '') is null
   and nullif(btrim(coalesce(g.away_team_city, '')), '') is not null
   and nullif(btrim(coalesce(g.away_team_mascot, '')), '') is not null
   and lower(t.fanbase) = lower(g.away_team_city)
   and lower(t.mascot) = lower(g.away_team_mascot);

-- If a row had away-team text but no catalog match, the previous renderer
-- still fell back to the football helmet generator.
update public.games
   set category_icon = 'football'
 where nullif(btrim(coalesce(category_icon, '')), '') is null
   and nullif(btrim(coalesce(away_team_city, '')), '') is not null
   and nullif(btrim(coalesce(away_team_mascot, '')), '') is not null;
