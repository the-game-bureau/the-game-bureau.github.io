-- 2026-09-04  THE SWEEP CLEARS A FINDING THAT HAS STOPPED BEING TRUE
--
-- Applied by hand, like everything here.
--
-- `tgb_sweep_missing_spotify_ids` FILES AND HAS NEVER CLEARED. So a track that
-- gains an id afterwards -- from the Tape Room's own Spotify box, from a human
-- pasting a share link, from the Issues room's Find id -- keeps a finding
-- saying it has none, for ever, and nothing in the system will ever take it
-- back off the queue.
--
-- MEASURED BEFORE THIS WAS WRITTEN: 185 open findings against 185 gaps, which
-- agree today ONLY because they were reconciled by hand an hour ago. Every id
-- filled from now on would put them back out of step.
--
-- WHY IT IS SAFE TO DELETE RATHER THAN MARK. That is this project's standing
-- answer for a finding and the reasoning is unchanged: clearing frees the
-- fingerprint, and RECURRENCE ON THE NEXT SWEEP IS THE ONLY CHECK THAT A FIX
-- LANDED. Here the check still holds -- the sweep refuses a track that has an
-- id, so a cleared finding comes back if and only if the id goes away again.
--
-- IT MATCHES ON `subject_id`, NOT ON THE FINGERPRINT. The fingerprint carries
-- `city_slug`, and a track can be MOVED to another city (`tgb_rename_tape`,
-- and the room's own move), which changes it -- so a fingerprint match would
-- silently miss exactly the rows that had been tidied. The id never moves.
--
-- AND BOTH SIDES ARE COMPARED AS TEXT. `issues.subject_id` is TEXT and generic
-- (a track today, a gift tomorrow), so casting it to bigint would raise 22P02
-- on the first row of another area that is not a number. Scoped to
-- area/kind it is always a track id; comparing as text needs no such trust.

begin;

create or replace function public.tgb_sweep_missing_spotify_ids(p_limit integer default 40)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record; v_fp text; v_hit int;
  v_added int := 0; v_seen int := 0; v_left int; v_cleared int := 0;
begin
  -- CLEAR FIRST, THEN FILE. A track filled in since the last run has an open
  -- finding saying otherwise; leaving it would make the queue overstate the
  -- work by exactly the number of ids anybody has added.
  delete from public.issues i
   using public.soundtrack s
   where i.area = 'soundtrack'
     and i.kind = 'spotify'
     and i.processed_at is null
     and i.subject_id = s.id::text
     and s.spotify_id is not null;
  get diagnostics v_cleared = row_count;

  for v_row in
    select s.id, s.city_slug, s.tape, s.title, s.artist
      from public.soundtrack s
     where s.spotify_id is null
       -- NOT ALREADY ON FILE. The fingerprint would refuse the insert anyway;
       -- checking first is what makes the cap count NEW findings rather than
       -- being spent on ones that already exist.
       and not exists (
         select 1 from public.issues i
          where i.area = 'soundtrack'
            and i.fingerprint = md5(s.city_slug || ':' || s.id::text || ':spotify'))
     -- OLDEST LOOK FIRST, so the sweep works round the catalogue rather than
     -- returning to the same corner of it every run.
     order by s.last_audit_at nulls first, s.city_slug, s.position nulls last, s.id
     limit greatest(1, least(coalesce(p_limit, 40), 200))
  loop
    v_seen := v_seen + 1;
    v_fp := md5(v_row.city_slug || ':' || v_row.id::text || ':spotify');
    insert into public.issues
      (area, kind, severity, scope, subject_id, subject_label,
       group_key, group_label, detail, suggestion, fingerprint, source)
    values
      ('soundtrack', 'spotify', 'warn', 'item', v_row.id::text, v_row.title,
       v_row.city_slug, v_row.tape,
       v_row.title || coalesce(' by ' || v_row.artist, '')
         || ' has no Spotify id, so it cannot be previewed from the room and '
         || 'falls back to a Spotify search.',
       'Find the track on Spotify, press Share, and paste the link into the '
         || 'Spotify box on the row.',
       v_fp, 'TGB SOUNDTRACK BOT')
    on conflict (area, fingerprint) do nothing;
    get diagnostics v_hit = row_count;
    if v_hit > 0 then v_added := v_added + 1; end if;
  end loop;

  select count(*) into v_left
    from public.soundtrack s
   where s.spotify_id is null
     and not exists (
       select 1 from public.issues i
        where i.area = 'soundtrack'
          and i.fingerprint = md5(s.city_slug || ':' || s.id::text || ':spotify'));

  -- `cleared` IS REPORTED, so a run can say it took work OFF the queue as well
  -- as putting work on. A number that only ever grows reads as a queue nobody
  -- is emptying.
  return jsonb_build_object('filed', v_added, 'cleared', v_cleared,
                            'considered', v_seen, 'still_unfiled', v_left);
end $function$;

commit;

-- ── VERIFY, BY MAKING IT DO ITS JOB ─────────────────────────────────────────
--
-- AN EMPTY REPLY PROVES NOTHING, which this project has been caught by twice.
-- Give a gap an id, sweep, and check the finding went:
--
--   begin;
--     update public.soundtrack set spotify_id = '4cOdK2wGLETKBW3PvgPWqT'
--      where id = (select subject_id::bigint from public.issues
--                   where area='soundtrack' and kind='spotify'
--                     and processed_at is null limit 1);
--     select public.tgb_sweep_missing_spotify_ids(0);   -- clears, files ~1
--     select count(*) from public.issues
--      where area='soundtrack' and kind='spotify' and processed_at is null;
--   rollback;
