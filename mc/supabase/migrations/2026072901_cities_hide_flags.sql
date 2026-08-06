-- Per-surface city visibility: one flag becomes three.
--
-- Until now `public.cities.ignored` meant "venue only" — a stadium town a team
-- plays in that we neither sell gifts for nor make a soundtrack for (Orchard
-- Park, Santa Clara, Miami Gardens). It was a single switch that hid a city
-- from every public surface at once.
--
-- That conflates three separate editorial decisions. A city can be a real
-- destination for games and a bad fit for the gift shop; a city can deserve a
-- soundtrack without our running a game there. So the one flag is replaced by
-- three, one per surface:
--
--   hide_from_games        -> /games/     (the city finder + the default sample)
--   hide_from_soundtracks  -> /sound/     (the cassette rail)
--   hide_from_gift_shop    -> /shop/      (the Shop By City rail)
--
-- `hide_from_games` is the direct heir of the old "venue only" idea, which is
-- why the terminology moved with it.
--
-- MIGRATION SAFETY. `ignored` is deliberately LEFT IN PLACE and still carries
-- its old values. Readers written for this migration prefer the new column and
-- fall back to `ignored` only when the new column is absent, so the site works
-- whether or not this file has been applied — the same additive pattern used
-- when gift_shop_cities merged into cities. Once every deployed reader is on
-- the new columns, run the commented DROP at the bottom.

alter table public.cities
  add column if not exists hide_from_games       boolean not null default false,
  add column if not exists hide_from_soundtracks boolean not null default false,
  add column if not exists hide_from_gift_shop   boolean not null default false;

comment on column public.cities.hide_from_games is
  'Hide this city from the public games finder at /games/. The heir of the old '
  '"venue only" flag: a stadium town we do not sell into.';

comment on column public.cities.hide_from_soundtracks is
  'Hide this city from the public soundtracks page at /sound/.';

comment on column public.cities.hide_from_gift_shop is
  'Hide this city from the public gift shop at /shop/.';

-- Backfill: "venue only" meant hidden everywhere, so every previously-ignored
-- city gets all three flags. Guarded on the column still existing so this file
-- stays re-runnable after the DROP below is eventually uncommented.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'cities'
       and column_name  = 'ignored'
  ) then
    update public.cities
       set hide_from_games       = true,
           hide_from_soundtracks = true,
           hide_from_gift_shop   = true
     where ignored is true
       and not (hide_from_games and hide_from_soundtracks and hide_from_gift_shop);
  end if;
end
$$;

comment on column public.cities.ignored is
  'DEPRECATED 2026-07-29. Superseded by hide_from_games / hide_from_soundtracks '
  '/ hide_from_gift_shop. Still written by older clients and still read as a '
  'fallback; do not add new reads. Drop once no deployed reader needs it.';

-- Once every deployed reader uses the three columns above:
--
--   alter table public.cities drop column ignored;
