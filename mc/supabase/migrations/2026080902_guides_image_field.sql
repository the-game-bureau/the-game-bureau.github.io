-- 2026080902_guides_image_field.sql
--
-- THE PORTRAIT ITSELF, IN THE ROW. public.guides.image_url points at a file
-- somewhere else - a repo path or a Storage object - and "somewhere else" is
-- exactly what went wrong with the old scheme: 390 of 395 guide image URLs
-- were 404 by the time the guides table was built, because the files they
-- named had never been committed or had moved. A row that carries its own
-- picture cannot rot that way.
--
-- It is TEXT holding a data URI ("data:image/jpeg;base64,...."), not bytea.
-- Two reasons, both practical rather than principled:
--
--   * A data URI drops straight into <img src>, so the page renders it with no
--     fetch, no Storage round trip and no signed-URL machinery.
--   * PostgREST hands bytea back as a hex string that the browser then has to
--     decode by hand. Base64 is what an <img> already speaks.
--
-- THE SIZE RULE IS THE WHOLE DESIGN. The four portraits that existed when this
-- was written were 0.7-2.4 MB each, which is 1.0-3.2 MB once base64'd. The
-- Green Room reads every guide with select=*, so at full size 34 guides would
-- be a ~100 MB page load to draw 34 cards that are 132 pixels wide. The
-- uploader therefore downscales to 512 px and re-encodes as JPEG before it
-- ever reaches this column - about 60-90 KB a portrait, ~3 MB for the whole
-- table. The CHECK below is the backstop for anything that skips the uploader.
--
-- image_url STAYS, and is not the same thing. It is what the guides_sync_games
-- trigger pushes onto games.guide_image_url, which is what both ENGINES read
-- at play time. A data URI must never go down that path: it would be copied
-- onto every game pointing at the guide, and the engines read games with
-- select=* on a page a buyer has already opened. So:
--
--   guides.image      the portrait, in the row, for this room to render.
--   guides.image_url  a hosted copy, for the engines, via the trigger.
--
-- The uploader writes both from one press.

alter table public.guides add column if not exists image text;

comment on column public.guides.image is
  'The portrait as a base64 data URI, downscaled to 512px on upload (~60-90 KB). Rendered directly by the Green Room. NOT synced to games - guide_image_url carries the hosted copy for the engines.';

-- A quarter of a megabyte of base64 is roughly a 700x700 JPEG at decent
-- quality: far past what any card here shows, and a clear sign something
-- bypassed the uploader. Rejecting it is kinder than a 100 MB page load
-- appearing weeks later with no obvious cause.
alter table public.guides drop constraint if exists guides_image_sane;
alter table public.guides add constraint guides_image_sane
  check (
    image is null
    or (image like 'data:image/%;base64,%' and length(image) <= 262144)
  );
