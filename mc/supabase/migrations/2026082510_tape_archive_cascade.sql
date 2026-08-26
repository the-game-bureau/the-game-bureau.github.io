-- SHELVING A TAPE, WITH ONE TABLE.
--
-- `soundtracks_cascade_archive` was a trigger on the tape row: it shelved the
-- tape's LIVE songs and stamped `archived_with_tape`, and restoring the tape
-- cleared exactly those. **There is no tape row any more**, so there is nothing
-- to hang a trigger on -- and the rule it enforced is the one rule here that
-- must never be half-applied.
--
-- So it becomes a function rather than moving into the admin page. **Same
-- reason it was a trigger**: psql and the Supabase table editor get it too, and
-- a client that dies between two requests cannot leave a tape shelved with its
-- tracks live.
--
-- **A SONG SHELVED ON ITS OWN STAYS SHELVED THROUGH A RESTORE.** That row is a
-- do-not-rescrape tombstone, the one thing here that must never come back by
-- accident, and `archived_with_tape` is the whole mechanism.
--
-- SECURITY INVOKER, deliberately. Writes to public.soundtrack are
-- `authenticated` only and this must not be a way round that; it is here for
-- the rule, not for the privilege. Contrast the six pulls, which are DEFINER
-- because a cloud routine has no secret store.
--
-- APPLIED 2026-08-25.

create or replace function public.tgb_set_tape_archived(
  p_city text, p_tape text, p_archived boolean)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  if p_archived then
    update public.soundtrack
       set archived = true, archived_with_tape = true
     where city_slug = p_city and tape = p_tape and not archived;
  else
    -- ONLY WHAT THE TAPE TOOK DOWN. A restored tape is live and holds back
    -- every track a human shelved individually.
    update public.soundtrack
       set archived = false, archived_with_tape = false
     where city_slug = p_city and tape = p_tape and archived and archived_with_tape;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.tgb_set_tape_archived(text, text, boolean) to authenticated;

-- The master switch on the tape header, which is the same act over every tape.
create or replace function public.tgb_set_all_tapes_archived(p_archived boolean)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  if p_archived then
    update public.soundtrack set archived = true, archived_with_tape = true where not archived;
  else
    update public.soundtrack set archived = false, archived_with_tape = false
     where archived and archived_with_tape;
  end if;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.tgb_set_all_tapes_archived(boolean) to authenticated;

-- Renaming a tape, and moving one to another city. Both are a write across
-- every row of the tape, which is the price of one table and the reason these
-- are functions rather than a PATCH somebody has to remember to scope.
create or replace function public.tgb_rename_tape(
  p_city text, p_tape text, p_new_city text, p_new_tape text, p_label_position text default null)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  update public.soundtrack
     set city_slug = coalesce(nullif(btrim(p_new_city), ''), city_slug),
         tape      = coalesce(nullif(btrim(p_new_tape), ''), tape),
         tape_label_position = coalesce(p_label_position, tape_label_position)
   where city_slug = p_city and tape = p_tape;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

grant execute on function public.tgb_rename_tape(text, text, text, text, text) to authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Proved by calls that make them do their job:
--   select public.tgb_set_tape_archived('denver', 'Jams', true);   -- shelves the live ones
--   select public.tgb_set_tape_archived('denver', 'Jams', false);  -- restores exactly those
--   and a track shelved on its own before the pair is still shelved after it.
