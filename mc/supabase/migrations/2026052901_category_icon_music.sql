-- Adds the 8-bit musical notes option to CATEGORY_ICON.

alter table public.games
  drop constraint if exists games_category_icon_check;

alter table public.games
  add constraint games_category_icon_check
  check (
    category_icon is null
    or category_icon in ('football', 'basketball', 'baseball', 'music')
  );

comment on column public.games.category_icon is
  'CATEGORY_ICON chosen per game for public card marks: football, basketball, baseball, or music. Null preserves non-sports/default emoji behavior.';
