-- DELETE MEANS ARCHIVE, and archived still counts.
--
-- The room needs a way to take an event off the list. It must NOT be a real
-- delete, for two reasons that pull the same way:
--
--   * A GAME MAY POINT AT IT. `games.anchor_event_id` is a foreign key with no
--     `on delete` clause, so it is NO ACTION: deleting a referenced event fails
--     outright. That is a good safety net and this change keeps it.
--   * A DELETED EVENT COMES STRAIGHT BACK. Both pull RPCs dedupe against this
--     table, so removing a row tells TGB ANCHOR BOT nothing except that it has
--     never seen the thing. The next run files it again, and the run after that.
--     **The row IS the tombstone.**
--
-- So: `archived_at`. Null means live. A timestamp means somebody took it off the
-- list, and the row stays where every reference and every dedupe can still find
-- it.
--
-- ── WHY NOT A `status` OF 'archived' ─────────────────────────────────────────
--
-- Because `status` says where the event stands IN THE WORLD -- scheduled,
-- postponed, cancelled, final -- and archiving says what WE think of the record.
-- One column holding both is the cost this file already records for `review`,
-- which overwrites the previous status and loses it. A cancelled event you have
-- also archived is two true facts, and they need two columns.
--
-- ── NOTHING NEEDED FOR "NOT PULLED AGAIN" ────────────────────────────────────
--
-- Checked rather than assumed: `tgb_pull_anchor_events` dedupes on the id and on
-- (start_date, venue_city, title-or-both-nicknames) with **no filter on the
-- rows it looks at**, and `tgb_pull_concert_tours` uses `on conflict (id)`.
-- An archived row is still a row, so both already refuse to re-file it.
-- **If either dedupe ever grows a `where archived_at is null`, that is the bug
-- this paragraph exists to prevent.**
--
-- ── PURGING PAST ARCHIVED EVENTS ─────────────────────────────────────────────
--
-- An archived event that has already happened is the one case where the row has
-- no job left: nothing will re-file a date in the past, because the pulls refuse
-- a past date anyway. So it can go, and `tgb_purge_archived_events()` is what
-- goes and gets them.
--
-- **IT SKIPS ANYTHING A GAME POINTS AT.** Not because the FK would stop it --
-- it would, loudly, and take the whole statement down with it -- but because a
-- game built on an event is exactly the reference this design exists to keep.
--
-- APPLY BY HAND in the SQL editor.

begin;

alter table public.events add column if not exists archived_at timestamptz;

comment on column public.events.archived_at is
  'Null means live. A timestamp means somebody took it off the list. The row STAYS: games.anchor_event_id may point at it, and both pull RPCs dedupe against this table, so the row is what stops a bot re-filing the event.';

-- Partial, because the question asked of this column is almost always "show me
-- the live ones" and an index over 4,000 nulls earns nothing.
create index if not exists events_archived_at_idx
  on public.events (archived_at) where archived_at is not null;

-- ── The purge ────────────────────────────────────────────────────────────────
create or replace function public.tgb_purge_archived_events()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted  int := 0;
  v_kept     int := 0;
  v_ids      jsonb := '[]'::jsonb;
begin
  -- KEPT: archived, past, and a game points at it. Counted and reported rather
  -- than skipped in silence, because "why is this still here" is the obvious
  -- next question and the answer is one a person can act on.
  select count(*) into v_kept
    from public.events e
   where e.archived_at is not null
     and coalesce(e.end_date, e.start_date) < current_date
     and exists (select 1 from public.games g where g.anchor_event_id = e.id);

  with gone as (
    delete from public.events e
     where e.archived_at is not null
       -- END DATE, NOT START. A festival archived mid-run has not happened yet.
       and coalesce(e.end_date, e.start_date) < current_date
       and not exists (select 1 from public.games g where g.anchor_event_id = e.id)
    returning e.id
  )
  select count(*), coalesce(jsonb_agg(id), '[]'::jsonb) into v_deleted, v_ids from gone;

  return jsonb_build_object('deleted', v_deleted, 'kept_referenced', v_kept, 'ids', v_ids);
end;
$$;

-- AUTHENTICATED ONLY, and this one is not like the pulls. Every other function
-- here is INSERT-only and exposed to `anon` because a cloud routine has no
-- secret store. This one DELETES. Its constants are tight -- archived, past,
-- unreferenced -- but "tightly bounded" is not the standard for handing a delete
-- to an anonymous caller, and no routine needs it: the room runs it under an
-- admin session, with a person there.
revoke all on function public.tgb_purge_archived_events() from public, anon;
grant execute on function public.tgb_purge_archived_events() to authenticated;

comment on function public.tgb_purge_archived_events() is
  'Delete archived events whose last day has passed and that no game references. Returns {deleted, kept_referenced, ids}. authenticated only: it is the one function here that deletes.';

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- An empty answer proves nothing, so make each half do its job.
--
-- 1. The column is there and everything is live:
--
--    select count(*) filter (where archived_at is null) as live,
--           count(*) filter (where archived_at is not null) as archived
--      from public.events;
--    -- expect all live, 0 archived
--
-- 2. AN ARCHIVED ROW STILL BLOCKS A RE-FILE. This is the whole point, and it is
--    the one thing worth proving with a real call. Take a real future row,
--    archive it, and try to file it again as a bot would:
--
--    -- note the id, date, city and title of a row first:
--    select id, start_date, venue_city, title from public.events
--     where kind = 'concert' and archived_at is null limit 1;
--
--    update public.events set archived_at = now() where id = '<that id>';
--
--    select public.tgb_pull_anchor_events(jsonb_build_array(jsonb_build_object(
--      'id', 'ARCHIVE-PROBE', 'kind', 'concert', 'title', '<that title>',
--      'venue_city', '<that city>', 'start_date', '<that date>')));
--    -- expect outcome "duplicate": the archived row still guards the slot
--
--    update public.events set archived_at = null where id = '<that id>';
--
-- 3. The purge deletes a past archived row and keeps a referenced one:
--
--    select public.tgb_purge_archived_events();
--    -- expect {"deleted": 0, "kept_referenced": 0, "ids": []} on a clean table,
--    -- because nothing is archived yet and nothing here is in the past
--
-- 4. It is not callable anonymously. From a shell with the PUBLISHABLE key:
--
--    curl -s -X POST "$API/rpc/tgb_purge_archived_events" \
--      -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
--    -- expect a permission error, NOT a result
