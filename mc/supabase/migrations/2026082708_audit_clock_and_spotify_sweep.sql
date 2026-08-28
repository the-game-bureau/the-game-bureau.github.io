-- THE AUDIT CLOCK IS WOUND AGAIN, AND THE MISSING IDS ARE SWEPT.
--
-- ── 1. `last_audit_at` HAD STOPPED BEING WRITTEN ────────────────────────────
--
-- soundtracks.md orders "the 3 tapes that have gone longest without a look" by
-- `soundtrack.last_audit_at`. The original reporter stamped it; a later rewrite
-- of that function dropped the stamping and nothing noticed, because a run that
-- files findings and never touches the clock **reports success**.
--
-- Measured before this file: 1,550 rows carried a stamp and the newest was
-- 2026-08-25. So every run since has picked the same three tapes, and the
-- catalogue has not been swept at all.
--
-- ── IT IS ITS OWN PAYLOAD KEY, NOT INFERRED FROM THE FINDINGS ───────────────
--
-- **A CLEAN TAPE FILES NOTHING.** Stamping only the tapes that produced a
-- finding would leave a tape that is in good order looking permanently
-- unaudited, and it would go to the front of the queue forever -- the exact
-- failure this clock exists to prevent, arrived at from the other side.
--
-- So the run says what it LOOKED AT: `{"audited": ["denver", "tulsa"],
-- "issues": [...]}`. The `tgb-agent-context` block in the Tape Room has
-- described this key all along and it was never implemented.
--
-- ── 2. THE 198 TRACKS WITH NO SPOTIFY ID ───────────────────────────────────
--
-- A new track with no id is refused outright (2026082702). The 198 already on
-- file are real rows a human may have typed, they stay, and the audit is
-- supposed to file each absence as a `spotify` finding at `warn`. It only ever
-- reaches the five tapes a run looks at, so at five tapes a run and no working
-- rotation those findings were never going to be filed.
--
-- `tgb_sweep_missing_spotify_ids` does it directly: it walks the catalogue and
-- files what is missing, capped, oldest tapes first.
--
-- **IT IS NOT A ONE-OFF SCRIPT.** New rows arrive without ids from the Tape
-- Room's own hand-add, so this wants running on every bot run rather than once.
-- It is idempotent: the fingerprint is the same one the audit uses, so a
-- finding already on file is not filed twice.
--
-- APPLY BY HAND.

-- ── THE REPORTER, WITH THE CLOCK BACK IN IT ─────────────────────────────────

create or replace function public.tgb_report_soundtrack_issues(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rows jsonb; v_row jsonb; v_audited jsonb;
  v_added int := 0; v_skipped int := 0; v_stamped int := 0;
  v_city text; v_kind text; v_sev text; v_detail text; v_sugg text; v_fp text;
  v_song bigint; v_scope text; v_title text; v_tape text; v_hit int;
  v_kinds constant text[] := array['spotify','spelling','relevance','facts'];
begin
  if jsonb_typeof(payload) = 'array' then
    v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' then
    v_rows := coalesce(payload->'issues', payload->'payload');
    -- WHAT THE RUN LOOKED AT, which is not the same as what it found.
    v_audited := payload->'audited';
  end if;
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of finding objects.');
  end if;
  if jsonb_array_length(v_rows) > 40 then
    return jsonb_build_object('error', 'At most 40 findings a call.');
  end if;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    v_city   := nullif(btrim(coalesce(v_row->>'city_slug', '')), '');
    v_kind   := lower(nullif(btrim(coalesce(v_row->>'kind', '')), ''));
    v_sev    := lower(nullif(btrim(coalesce(v_row->>'severity', '')), ''));
    v_detail := nullif(btrim(coalesce(v_row->>'detail', '')), '');
    v_sugg   := nullif(btrim(coalesce(v_row->>'suggestion', '')), '');
    begin v_song := nullif(btrim(coalesce(v_row->>'song_id', '')), '')::bigint;
    exception when others then v_song := null; end;

    if v_city is null or v_kind is null or v_detail is null or not (v_kind = any(v_kinds)) then
      v_skipped := v_skipped + 1; continue;
    end if;

    if v_song is not null and not exists (
         select 1 from public.soundtrack s where s.id = v_song and s.city_slug = v_city) then
      v_song := null;
    end if;

    if not exists (select 1 from public.soundtrack s where s.city_slug = v_city) then
      v_skipped := v_skipped + 1; continue;
    end if;

    if v_song is not null then
      v_scope := 'item';
      select title into v_title from public.soundtrack where id = v_song;
    else
      v_scope := 'group';
      v_title := null;
    end if;
    select tape into v_tape from public.soundtrack
     where city_slug = v_city order by position nulls last, id limit 1;

    v_fp := md5(v_city || ':' || coalesce(v_song::text, '') || ':' || v_kind);

    insert into public.issues
      (area, kind, severity, scope, subject_id, subject_label,
       group_key, group_label, detail, suggestion, fingerprint, source)
    values
      ('soundtrack', v_kind, coalesce(v_sev, 'low'), v_scope,
       v_song::text, v_title, v_city, v_tape, v_detail, v_sugg, v_fp,
       'TGB SOUNDTRACK BOT')
    on conflict (area, fingerprint) do nothing;

    get diagnostics v_hit = row_count;
    if v_hit > 0 then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
  end loop;

  -- ── THE CLOCK ─────────────────────────────────────────────────────────────
  -- STAMPED WHATEVER THE FINDINGS SAID, including for a tape that produced
  -- none. That is the whole point: a clean tape has been looked at.
  if v_audited is not null and jsonb_typeof(v_audited) = 'array' then
    update public.soundtrack s
       set last_audit_at = now()
     where s.city_slug in (
       select btrim(x.value) from jsonb_array_elements_text(v_audited) x
        where btrim(x.value) <> '');
    get diagnostics v_stamped = row_count;
  end if;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped,
                            'audited_rows_stamped', v_stamped);
end $function$;

grant execute on function public.tgb_report_soundtrack_issues(jsonb) to anon, authenticated;

-- ── THE SWEEP ───────────────────────────────────────────────────────────────
--
-- ITS CONSTANTS ARE THE SECURITY, exactly as with every other pull: `area`,
-- `kind`, `severity` and the wording are all fixed, it can only ever INSERT
-- into `public.issues`, and it takes nothing from the caller but a cap.

create or replace function public.tgb_sweep_missing_spotify_ids(p_limit int default 40)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record; v_fp text; v_hit int;
  v_added int := 0; v_seen int := 0; v_left int;
begin
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

  return jsonb_build_object('filed', v_added, 'considered', v_seen, 'still_unfiled', v_left);
end $function$;

comment on function public.tgb_sweep_missing_spotify_ids(int) is
  'Files a spotify finding for every track carrying no id, capped, oldest-audited first. Idempotent: it uses the same fingerprint the audit does. Run it every bot run -- new rows arrive without ids from the Tape Room hand-add too.';

grant execute on function public.tgb_sweep_missing_spotify_ids(int) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- 1. The clock moves for a tape that filed nothing:
--      select public.tgb_report_soundtrack_issues('{"audited":["denver"],"issues":[]}'::jsonb);
--      -> audited_rows_stamped > 0, and denver's last_audit_at is now().
-- 2. The sweep files, and files nothing the second time:
--      select public.tgb_sweep_missing_spotify_ids(5);   -> filed 5
--      select public.tgb_sweep_missing_spotify_ids(5);   -> filed 5 (the NEXT five)
--    with `still_unfiled` falling by five each time.
