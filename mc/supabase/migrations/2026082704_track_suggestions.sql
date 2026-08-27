-- A VISITOR SUGGESTS A TRACK, AND IT LANDS IN public.issues.
--
-- ── WHAT THIS REPLACES ──────────────────────────────────────────────────────
--
-- The cassette on `/soundtracks/` had a "suggest a track" control that opened a
-- `mailto:soundtrack@thegamebureau.com` with a template in the body, and the
-- Tape Room had an EMAILED SUGGESTIONS door to that inbox in Gmail. So every
-- suggestion depended on the visitor having a mail client configured, arrived
-- as free prose in whatever shape they typed it, and lived somewhere nothing
-- else on this site can read. **A prompt whose output is an email is a prompt
-- whose output is lost**, which is the same lesson this repo learned four times
-- over with research pages writing to files.
--
-- ── NO NEW TABLE, AND THAT IS A DELIBERATE READING OF THE ASK ───────────────
--
-- "Create an issues table to hold them" -- there is one, `public.issues`, built
-- three days ago for exactly this shape: one row per thing that needs somebody
-- to look at it, across every area of the site, with `area` as the
-- discriminator. A suggestion is `area = 'suggestion'`. A second table would
-- mean a second room, a second read, and a second set of grants to keep in step.
--
-- ── THE CONSTANTS ARE THE SECURITY ──────────────────────────────────────────
--
-- This is the first write path on this project open to a member of the PUBLIC
-- rather than to a cloud routine, so it is the tightest of them:
--
--   * `area` is always 'suggestion' and `kind` is always 'suggestion'
--   * `severity` is always 'info' and `scope` always 'group'
--   * `source` is always 'public suggestion'
--   * a title is required; everything else is optional
--   * every field is trimmed and LENGTH-CAPPED, so a submission cannot be used
--     to store bulk text in our database
--   * the city must be one this catalogue actually holds a tape for, which is
--     what stops the form being an open write channel with a free-text key
--
-- **Never turn one of those into a parameter.**
--
-- ── WHAT IT DOES NOT COLLECT ────────────────────────────────────────────────
--
-- No name, no email, no address of any kind. A suggestion is a track and a
-- reason. Collecting a contact would mean a privacy policy, a retention rule
-- and somewhere to honour a deletion request, for a field nobody would read.
-- **If a reply is ever wanted, that is a decision with consequences, not a
-- column.**
--
-- APPLY BY HAND.

create or replace function public.tgb_submit_suggestion(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_city text; v_title text; v_artist text; v_why text;
  v_tape text; v_who text; v_fp text; v_hit int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Expected an object.');
  end if;

  -- TRIMMED AND CAPPED ON THE WAY IN. A form on a public page is a text field
  -- pointed at our database; the caps are what make it a suggestion box rather
  -- than one.
  v_city   := nullif(btrim(coalesce(payload->>'city_slug', '')), '');
  v_title  := left(nullif(btrim(coalesce(payload->>'title', '')), ''), 200);
  v_artist := left(nullif(btrim(coalesce(payload->>'artist', '')), ''), 200);
  v_why    := left(nullif(btrim(coalesce(payload->>'why', '')), ''), 1000);

  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'A track title is needed.');
  end if;

  -- THE CITY MUST BE ONE WE HOLD A TAPE FOR. Without this the form is a write
  -- channel with a key the caller chooses, and the issues room would fill with
  -- rows naming places that do not exist.
  if v_city is null or not exists (
       select 1 from public.soundtrack s where s.city_slug = v_city) then
    return jsonb_build_object('ok', false, 'error', 'Unknown city.');
  end if;

  select tape into v_tape from public.soundtrack
   where city_slug = v_city order by position nulls last, id limit 1;

  v_who := v_title || case when v_artist is null then '' else ' by ' || v_artist end;

  -- ONE SUGGESTION PER TRACK PER CITY. Two people suggesting the same song is
  -- one thing to decide, not two, and it is also what stops the form being
  -- refreshed into a hundred rows.
  v_fp := md5(v_city || ':suggestion:' || lower(v_title) || ':' || lower(coalesce(v_artist, '')));

  insert into public.issues
    (area, kind, severity, scope, subject_id, subject_label,
     group_key, group_label, detail, suggestion, fingerprint, source)
  values
    ('suggestion', 'suggestion', 'info', 'group', null, v_who,
     v_city, v_tape,
     v_who || ' was suggested for this tape by a visitor.',
     v_why, v_fp, 'public suggestion')
  on conflict (area, fingerprint) do nothing;

  get diagnostics v_hit = row_count;

  -- A REPEAT IS REPORTED AS A SUCCESS, DELIBERATELY. Telling a visitor that
  -- somebody else already suggested their song turns the form into a way of
  -- asking what is in our queue. It also makes them feel they failed at
  -- something that worked.
  return jsonb_build_object('ok', true, 'filed', v_hit > 0);
end $function$;

-- ANON MAY CALL IT AND STILL CANNOT READ THE TABLE. `public.issues` has no
-- select policy for anon at all, so a suggestion goes in and nothing comes back
-- out: the form cannot be used to read the queue.
grant execute on function public.tgb_submit_suggestion(jsonb) to anon, authenticated;

comment on function public.tgb_submit_suggestion(jsonb) is
  'A visitor suggests a track from /soundtracks/. Insert-only into public.issues with area = suggestion; every other field is a constant or a capped copy of what was typed. Anon-callable by design; anon cannot read the table.';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- AN EMPTY PAYLOAD PROVES NOTHING. Send a real one:
--   select public.tgb_submit_suggestion(
--     '{"city_slug":"<a real slug>","title":"Probe","artist":"Probe Band",
--       "why":"probe"}'::jsonb);
--   -> {"ok": true, "filed": true}, and the same call again -> filed false.
-- Then: a title-less call, and an unknown city, both -> ok false with a reason.
-- Then: delete from public.issues where source = 'public suggestion';
