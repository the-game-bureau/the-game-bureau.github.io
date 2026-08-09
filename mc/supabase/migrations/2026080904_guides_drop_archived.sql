-- 2026080904_guides_drop_archived.sql
--
-- NO ARCHIVED GUIDES. Every row in public.guides is active, and the column is
-- dropped along with the toggle, the button and the filter that served it.
--
-- It was never used: all 34 rows were archived = false, and the flag had been
-- in the table for one day. It was carried over by reflex from the tables
-- around it - waypoints, soundtrack_songs and gift_shop_items each have a
-- reason to keep a row while hiding it, and for the first two that reason is
-- specific and load-bearing (a do-not-rescrape tombstone, so an agent cannot
-- re-add something a human rejected). Nothing scrapes guides. Nothing invents
-- them on a schedule. There is no tombstone to keep.
--
-- WHAT THIS COSTS: delete is now the only way to remove a guide, and it is
-- irreversible. The Green Room's confirmation used to offer archive as the
-- reversible alternative; it now says plainly that there is none, and still
-- warns that games.guide_id is ON DELETE SET NULL, so every game using the
-- guide is left without one.

alter table public.guides drop column if exists archived;

comment on table public.guides is
  'The narrator characters. ONE ROW PER CHARACTER, never per game - a guide fronts as many games as point at it. games.guide_id is the pointer; guide_name / guide_bio / guide_background on games are a denormalised copy kept in step by trigger, for the engines. Every row here is active: there is no archived flag, because nothing writes guides on a schedule and so there is no tombstone to keep.';
