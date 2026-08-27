-- A SUGGESTION IS PROCESSED, NOT DELETED, AND IT MAY CARRY AN EMAIL.
--
-- ── WHY THIS IS NOT A CONTRADICTION OF 2026082701 ───────────────────────────
--
-- That migration said, in as many words, that a finding is only ever open and
-- that clearing one DELETES it. The reason was the dedupe: the reporter skips a
-- fingerprint it already holds, so **deleting a finding is what makes the next
-- audit free to file it again**, and that recurrence is the only check a fix
-- landed.
--
-- A SUGGESTION IS THE OPPOSITE CASE ON EVERY POINT. Nothing re-files it: a
-- visitor typed it once. There is no fix to check for. And **the fingerprint
-- SHOULD stay claimed**, because the reason we would keep the row at all is so
-- the same song is not offered to us a second time and read as new.
--
-- So findings still delete and suggestions still keep their row. One column
-- carries the difference.
--
-- ── `processed_at` RATHER THAN A `status` ───────────────────────────────────
--
-- Null is open; a timestamp is dealt with. A `status` text column would invite
-- a third value and then a fourth, and this project has already spent a week
-- taking exactly that column back out of the soundtrack tables. A timestamp
-- also records WHEN, which a status cannot, and the question "how long has this
-- been sitting here" is the one anybody asks of a suggestion queue.
--
-- ── THE EMAIL REVERSES A DECISION MADE YESTERDAY, DELIBERATELY ──────────────
--
-- 2026082704 collected no contact of any kind, and said why: a contact field
-- means personal data, which means a retention rule and somewhere to honour a
-- deletion request. **That cost has not gone away**; it has been accepted. What
-- follows from it, and is not optional:
--
--   * the field is OPTIONAL, and the form says so. A suggestion without one is
--     as welcome as a suggestion with one.
--   * it is the ONLY personal datum here and there is nowhere else to put one.
--     Do not add a name, and do not start writing one into `detail`.
--   * `public.issues` is admin-read only with no anon policy, so an address is
--     never readable by anyone but an admin. **Check that again if a public
--     read of this table is ever added.**
--   * deleting the row is the deletion request, and the Issues room can do it.
--
-- APPLY BY HAND.

alter table public.issues
  add column if not exists processed_at   timestamptz,
  add column if not exists contact_email  text;

comment on column public.issues.processed_at is
  'Null is open. A timestamp means somebody dealt with it. Only suggestions use it: a FINDING is deleted when it is cleared, because deleting is what frees its fingerprint for the next audit. Nothing re-files a suggestion, so its row is kept and its fingerprint stays claimed.';

comment on column public.issues.contact_email is
  'Optional, given by a visitor suggesting a track. The only personal datum in this table. Admin-read only; deleting the row is how a deletion request is honoured. Do not add further contact fields.';

create index if not exists issues_open_idx
  on public.issues (area, created_at desc)
  where processed_at is null;

-- THE ROOM HAS TO BE ABLE TO WRITE IT. `select` and `delete` were enough while
-- clearing meant deleting; marking one processed is an UPDATE.
--
-- IT IS NARROWED TO ONE COLUMN. A blanket update grant would let the room
-- rewrite a finding's own words, which nothing should do: what the audit said
-- is a record of what the audit said.
drop policy if exists issues_admin_update on public.issues;
create policy issues_admin_update on public.issues
  for update to authenticated using (public.is_photo_admin())
  with check (public.is_photo_admin());

grant update (processed_at) on public.issues to authenticated;

-- ── THE FORM'S WRITE PATH ───────────────────────────────────────────────────
--
-- Same name, same shape, one more optional field. The constants are unchanged
-- and are still what make it safe to expose to `anon`.

create or replace function public.tgb_submit_suggestion(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_city text; v_title text; v_artist text; v_why text; v_email text;
  v_tape text; v_who text; v_fp text; v_hit int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Expected an object.');
  end if;

  v_city   := nullif(btrim(coalesce(payload->>'city_slug', '')), '');
  v_title  := left(nullif(btrim(coalesce(payload->>'title', '')), ''), 200);
  v_artist := left(nullif(btrim(coalesce(payload->>'artist', '')), ''), 200);
  v_why    := left(nullif(btrim(coalesce(payload->>'why', '')), ''), 1000);
  v_email  := left(lower(nullif(btrim(coalesce(payload->>'email', '')), '')), 200);

  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'A track title is needed.');
  end if;

  -- AN ADDRESS THAT IS NOT ONE IS REFUSED RATHER THAN STORED. A blank is fine
  -- and always was; something typed into that box is meant to be an address, so
  -- keeping a broken one would be keeping personal data that cannot even do the
  -- job it was collected for.
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  if v_city is null or not exists (
       select 1 from public.soundtrack s where s.city_slug = v_city) then
    return jsonb_build_object('ok', false, 'error', 'Unknown city.');
  end if;

  select tape into v_tape from public.soundtrack
   where city_slug = v_city order by position nulls last, id limit 1;

  v_who := v_title || case when v_artist is null then '' else ' by ' || v_artist end;
  v_fp := md5(v_city || ':suggestion:' || lower(v_title) || ':' || lower(coalesce(v_artist, '')));

  insert into public.issues
    (area, kind, severity, scope, subject_id, subject_label,
     group_key, group_label, detail, suggestion, fingerprint, source, contact_email)
  values
    ('suggestion', 'suggestion', 'info', 'group', null, v_who,
     v_city, v_tape,
     v_who || ' was suggested for this tape by a visitor.',
     v_why, v_fp, 'public suggestion', v_email)
  on conflict (area, fingerprint) do nothing;

  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', true, 'filed', v_hit > 0);
end $function$;

grant execute on function public.tgb_submit_suggestion(jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. A suggestion with an address, and one without, both file.
-- 2. A malformed address is refused BY NAME and files nothing.
-- 3. As an admin: update issues set processed_at = now() where id = <one> -> 1 row.
-- 4. As an admin: update issues set detail = 'x' where id = <one> -> refused,
--    because the grant is on `processed_at` alone.
-- 5. As anon: /issues?select=contact_email -> 401. It must never be readable.
