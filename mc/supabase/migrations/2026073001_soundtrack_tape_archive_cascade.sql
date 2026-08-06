-- Archiving a tape archives its tracks, and restoring it puts back exactly the
-- ones it took.
--
-- Archiving a whole tape used to flip soundtracks.archived alone. /sound/ hides
-- such a tape either way, so the page looked right — but the songs stayed
-- `archived = false`, which is wrong in two places that matter:
--
--   * `soundtrack_stats.active_songs` still counted them, so a hidden city kept
--     reporting 15 active tracks and the Tape Room's fullness buckets lied.
--   * `tgb_pull_soundtrack_songs` dedupes on the (city_slug, title, artist) index
--     regardless of the flag, so that part held — but any future rule that reads
--     `archived` to decide what may be re-suggested would have been wrong.
--
-- The hard part is restoring. If restoring a tape simply cleared `archived` on
-- every song, it would resurrect the songs a human had retired one at a time —
-- and those rows are do-not-rescrape tombstones, the one thing in this schema
-- that must never come back by accident. So the cascade records what it did:
--
--   archived_with_tape = true   this song was archived BY the tape, and a restore
--                               of the tape should undo it
--   archived_with_tape = false  this song was archived on its own; a tape restore
--                               must leave it archived
--
-- Doing it in a trigger rather than in the admin page means the rule holds for
-- every writer — the page, the Supabase table editor, a psql session — and cannot
-- be half-applied by a client that fails between two requests.

alter table public.soundtrack_songs
  add column if not exists archived_with_tape boolean not null default false;

comment on column public.soundtrack_songs.archived_with_tape is
  'True when this song was archived as a side effect of its tape being archived. '
  'Restoring the tape clears exactly these; a song archived on its own stays '
  'archived, because that row is a do-not-rescrape tombstone.';

create or replace function public.tgb_cascade_soundtrack_tape_archive()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.archived and not old.archived then
    -- Only the songs that are live right now. An already-archived song is left
    -- alone, so its tombstone survives the tape being hidden and restored.
    update public.soundtrack_songs
       set archived = true,
           archived_with_tape = true
     where city_slug = new.city_slug
       and archived = false;
  elsif old.archived and not new.archived then
    update public.soundtrack_songs
       set archived = false,
           archived_with_tape = false
     where city_slug = new.city_slug
       and archived_with_tape = true;
  end if;
  return new;
end;
$$;

comment on function public.tgb_cascade_soundtrack_tape_archive() is
  'AFTER UPDATE OF archived on public.soundtracks: archives a tape''s live songs '
  'with it and restores exactly those on un-archive, leaving individually '
  'archived tombstones untouched.';

drop trigger if exists soundtracks_cascade_archive on public.soundtracks;
create trigger soundtracks_cascade_archive
after update of archived on public.soundtracks
for each row
when (old.archived is distinct from new.archived)
execute function public.tgb_cascade_soundtrack_tape_archive();

-- Any tape archived before this migration has live songs underneath it. Bring
-- them in line, marking them as the tape's doing so a later restore releases
-- them. No-op today (no tape is archived), but correct if one ever was.
update public.soundtrack_songs g
   set archived = true,
       archived_with_tape = true
  from public.soundtracks s
 where s.city_slug = g.city_slug
   and s.archived = true
   and g.archived = false;
