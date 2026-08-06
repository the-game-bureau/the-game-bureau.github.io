-- Remove the How to Play field from games.
--
-- The "How to Play" section was ripped out of the game landing page
-- (mc/game/run/index.html) and the Mission Control builder (mc/builder.html).
-- This drops the backing column so the schema matches the product.

alter table public.games
  drop column if exists how_to_play;
