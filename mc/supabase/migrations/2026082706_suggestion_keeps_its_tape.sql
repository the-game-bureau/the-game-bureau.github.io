-- A SUGGESTION REMEMBERS WHICH TAPE IT CAME FROM.
--
-- ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
--
-- `tgb_submit_suggestion` derived `group_label` server-side as the city's FIRST
-- tape:
--
--     select tape into v_tape from public.soundtrack
--      where city_slug = v_city order by position nulls last, id limit 1;
--
-- **A CITY MAY HOLD MORE THAN ONE TAPE.** This catalogue has 114 tapes across
-- fewer cities, and the visitor is looking at ONE of them when they suggest a
-- track. Filing against whichever sorted first is right by luck on a
-- single-tape city and quietly wrong everywhere else -- and quietly is the
-- problem: the row looks perfectly correct, naming a real tape in the right
-- city, and the only person who could tell is the visitor, who never sees it.
--
-- ── THE TAPE IS SENT AND THEN CHECKED ───────────────────────────────────────
--
-- The page carries the tape's own name on the card and sends it. The function
-- **verifies the pair exists** rather than trusting it: this is a public write
-- path, so `tape` is a caller-supplied string like every other field and must
-- not become a way to write an arbitrary label into our table.
--
-- **AN UNKNOWN OR ABSENT TAPE FALLS BACK to the old behaviour** rather than
-- refusing the suggestion. A visitor who has typed a track and a reason should
-- not lose it because a tape was renamed between the page loading and Send.
--
-- ── THE FINGERPRINT IS UNCHANGED, DELIBERATELY ──────────────────────────────
--
-- It is `(city_slug, title, artist)` and does not include the tape. Two people
-- suggesting the same song for two tapes of one city are suggesting the same
-- song, and one row is the right answer. Adding the tape would make that two,
-- which is the duplicate this dedupe exists to prevent.
--
-- APPLY BY HAND.

create or replace function public.tgb_submit_suggestion(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_city text; v_title text; v_artist text; v_why text; v_email text;
  v_tape text; v_sent text; v_who text; v_fp text; v_hit int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Expected an object.');
  end if;

  v_city   := nullif(btrim(coalesce(payload->>'city_slug', '')), '');
  v_title  := left(nullif(btrim(coalesce(payload->>'title', '')), ''), 200);
  v_artist := left(nullif(btrim(coalesce(payload->>'artist', '')), ''), 200);
  v_why    := left(nullif(btrim(coalesce(payload->>'why', '')), ''), 1000);
  v_email  := left(lower(nullif(btrim(coalesce(payload->>'email', '')), '')), 200);
  v_sent   := left(nullif(btrim(coalesce(payload->>'tape', '')), ''), 200);

  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'A track title is needed.');
  end if;

  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'That email address does not look right.');
  end if;

  if v_city is null or not exists (
       select 1 from public.soundtrack s where s.city_slug = v_city) then
    return jsonb_build_object('ok', false, 'error', 'Unknown city.');
  end if;

  -- THE TAPE THE VISITOR WAS LOOKING AT, CHECKED AGAINST THE CATALOGUE. A
  -- caller-supplied string never reaches the row unverified.
  select s.tape into v_tape from public.soundtrack s
   where s.city_slug = v_city and s.tape = v_sent limit 1;

  -- FALLING BACK RATHER THAN REFUSING. A renamed tape must not cost somebody
  -- the track and the reason they just typed.
  if v_tape is null then
    select tape into v_tape from public.soundtrack
     where city_slug = v_city order by position nulls last, id limit 1;
  end if;

  v_who := v_title || case when v_artist is null then '' else ' by ' || v_artist end;
  v_fp := md5(v_city || ':suggestion:' || lower(v_title) || ':' || lower(coalesce(v_artist, '')));

  insert into public.issues
    (area, kind, severity, scope, subject_id, subject_label,
     group_key, group_label, detail, suggestion, fingerprint, source, contact_email)
  values
    ('suggestion', 'suggestion', 'info', 'group', null, v_who,
     v_city, v_tape,
     v_who || ' was suggested for ' || coalesce(v_tape, 'this tape') || ' by a visitor.',
     v_why, v_fp, 'public suggestion', v_email)
  on conflict (area, fingerprint) do nothing;

  get diagnostics v_hit = row_count;
  return jsonb_build_object('ok', true, 'filed', v_hit > 0);
end $function$;

grant execute on function public.tgb_submit_suggestion(jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- On a city with TWO tapes, send each name in turn and read `group_label` back:
-- it must differ. Then send a tape that does not exist and confirm it falls back
-- rather than refusing, and that the label is a real tape of that city.
