-- 2026080903_guides_drop_image_url.sql
--
-- ONE PLACE FOR THE PORTRAIT. public.guides.image_url is dropped; guides.image
-- - the picture in the row - is the only copy.
--
-- image_url was a pointer at a file somewhere else, and that is precisely the
-- thing that had already failed once: 390 of the 395 guide image URLs were 404
-- by the time this table was built, because the files they named had never
-- been committed or had moved. Keeping a pointer alongside the picture meant
-- two answers to "what does this guide look like" and a way for them to
-- disagree. Existing values are NOT migrated - four rows had one, and the
-- picture is re-uploaded in a press.
--
-- WHAT THIS COSTS, stated plainly rather than discovered later:
--
-- games.guide_image_url is what BOTH ENGINES read at play time, and until now
-- the two triggers below kept it in step with guides.image_url. With the
-- source column gone they stop maintaining it, so:
--
--   * The column stays exactly as it is. It is not dropped and not cleared -
--     it belongs to the engines, and this migration has no business emptying
--     a column the paid product reads.
--   * It simply freezes. Whatever a game holds today is what it will keep
--     showing, which for almost every game is a URL that already 404s.
--   * A NEW portrait uploaded in the Green Room will therefore not reach the
--     engines. That is the accepted trade: the picture now lives in the row as
--     a data URI, and pushing a data URI down this path would copy ~65 KB onto
--     every game pointing at the guide - 296 of them for Mission Control -
--     inside a table the engines read with select=* on a page a buyer has
--     already opened.
--
-- When the engines are next touched, the fix is for them to read
-- guides.image via games.guide_id and stop reading guide_image_url at all.
-- Until then a guide portrait is an admin-side thing.

alter table public.guides drop constraint if exists guides_image_url_check;
alter table public.guides drop column if exists image_url;

-- The trigger loses the column it copied, and nothing replaces it. Name, bio
-- and background still push down: those are text, they are small, and the
-- engines genuinely use them.
create or replace function public.tgb_guides_sync_games()
returns trigger language plpgsql as $fn$
begin
  update public.games
     set guide_name       = new.name,
         guide_bio        = new.bio,
         guide_background = new.background
   where guide_id = new.id;
  return new;
end;
$fn$;

create or replace function public.tgb_games_pull_guide()
returns trigger language plpgsql as $fn$
declare g public.guides%rowtype;
begin
  if new.guide_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.guide_id is not distinct from old.guide_id then
    return new;
  end if;
  select * into g from public.guides where id = new.guide_id;
  if found then
    new.guide_name       := g.name;
    new.guide_bio        := g.bio;
    new.guide_background := g.background;
    -- guide_image_url is deliberately left alone: pointing a game at a
    -- different guide no longer changes the portrait the engines show,
    -- because guides no longer holds a URL to give it.
  end if;
  return new;
end;
$fn$;

comment on column public.guides.image is
  'The portrait, and the only copy of it - a base64 data URI downscaled to 512px on upload (~60-90 KB). image_url was dropped by 2026080903; nothing points at a file elsewhere any more.';
