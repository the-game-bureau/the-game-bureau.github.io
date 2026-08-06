-- One of a game's tags can be designated as its "primary tag" — the label
-- that appears in the registry-card header where "TITLE DEED" used to sit.
-- Stored as plain text (not a foreign key into a tags table) because the
-- builder treats tags as a free-form list.

alter table public.games
  add column if not exists primary_tag text;

comment on column public.games.primary_tag is
  'Tag chosen by the builder to display as the game card header label. Must also appear in tags[].';
