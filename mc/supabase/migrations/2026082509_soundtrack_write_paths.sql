-- THE TWO WRITE PATHS, AGAINST THE ONE TABLE.
--
-- Both keep the constants that make them safe to hand to `anon`, and none of
-- them became a parameter: everything a pull files arrives SHELVED, the city
-- must exist and must not be hidden from soundtracks, a malformed spotify id is
-- dropped rather than guessed, and a call is capped.
--
-- `tgb_pull_soundtrack_songs` RETURNED A `TABLE(...)` -- the only pull in this
-- project that did -- so it is dropped and rebuilt to answer `{added, skipped}`
-- like the other six. The routine prompt is rewritten to match in the same
-- commit.
--
-- APPLIED 2026-08-25.

drop function if exists public.tgb_pull_soundtrack_songs(jsonb);

create function public.tgb_pull_soundtrack_songs(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tapes jsonb; v_tape jsonb; v_song jsonb;
  v_city text; v_name text; v_pos text;
  v_added int := 0; v_skipped int := 0; v_songs int := 0;
begin
  if jsonb_typeof(payload) = 'array' then v_tapes := payload;
  elsif jsonb_typeof(payload) = 'object' then v_tapes := coalesce(payload->'tapes', payload->'payload');
  end if;
  if v_tapes is null or jsonb_typeof(v_tapes) <> 'array' then
    return jsonb_build_object('error', 'Expected a JSON array of tape objects.');
  end if;
  if jsonb_array_length(v_tapes) > 4 then
    return jsonb_build_object('error', 'At most 4 tapes a call.');
  end if;

  for v_tape in select * from jsonb_array_elements(v_tapes) loop
    v_city := nullif(btrim(coalesce(v_tape->>'city_slug', '')), '');
    v_name := nullif(btrim(coalesce(v_tape->>'tape', v_tape->>'spine_tag', '')), '');
    v_pos  := nullif(btrim(coalesce(v_tape->>'tape_label_position', '')), '');
    if v_city is null then v_skipped := v_skipped + 1; continue; end if;

    -- The city must exist AND not be hidden from soundtracks. Both constants.
    if not exists (select 1 from public.cities c
                    where c.slug = v_city
                      and not coalesce(c.hide_from_soundtracks, c.ignored, false)) then
      v_skipped := v_skipped + 1; continue;
    end if;

    -- AN ABSENT TAPE NAME MEANS THIS CITY'S EXISTING TAPE, not a new one. A new
    -- tape is created only when the call names one; that rule exists because a
    -- routine run once split Jacksonville across two tapes.
    if v_name is null then
      select tape into v_name from public.soundtrack where city_slug = v_city order by id limit 1;
      if v_name is null then v_skipped := v_skipped + 1; continue; end if;
    end if;

    for v_song in select * from jsonb_array_elements(coalesce(v_tape->'songs', '[]'::jsonb)) loop
      exit when v_songs >= 60;
      v_songs := v_songs + 1;
      if nullif(btrim(coalesce(v_song->>'title', '')), '') is null then
        v_skipped := v_skipped + 1; continue;
      end if;
      insert into public.soundtrack
        (city_slug, tape, tape_label_position, position, title, artist, blurb,
         spotify_id, explicit, archived)
      values (v_city, v_name, v_pos,
              nullif(btrim(coalesce(v_song->>'position', '')), '')::int,
              btrim(v_song->>'title'),
              nullif(btrim(coalesce(v_song->>'artist', '')), ''),
              nullif(btrim(coalesce(v_song->>'blurb', '')), ''),
              -- A MALFORMED SPOTIFY ID IS DROPPED, NEVER GUESSED. A fabricated
              -- 22-character id passes every check and silently plays nothing.
              case when coalesce(v_song->>'spotify_id', '') ~ '^[A-Za-z0-9]{22}$'
                   then v_song->>'spotify_id' else null end,
              coalesce((v_song->>'explicit')::boolean, false),
              -- ALWAYS SHELVED. Everything arrives off the public page and a
              -- human decides. This constant is the security.
              true)
      on conflict do nothing;
      if found then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end $$;

grant execute on function public.tgb_pull_soundtrack_songs(jsonb) to anon, authenticated;

-- ── The audit's write path ───────────────────────────────────────────────────
create or replace function public.tgb_report_soundtrack_issues(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rows jsonb; v_row jsonb;
  v_added int := 0; v_skipped int := 0;
  v_city text; v_kind text; v_sev text; v_detail text; v_sugg text; v_fp text;
  v_song bigint; v_target bigint; v_scope text; v_obj jsonb;
  v_kinds constant text[] := array['spotify','spelling','relevance','facts'];
begin
  if jsonb_typeof(payload) = 'array' then v_rows := payload;
  elsif jsonb_typeof(payload) = 'object' then v_rows := coalesce(payload->'issues', payload->'payload');
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

    -- A song_id that is not in this city is dropped, exactly as before.
    if v_song is not null and not exists (
         select 1 from public.soundtrack s where s.id = v_song and s.city_slug = v_city) then
      v_song := null;
    end if;

    if v_song is not null then
      v_target := v_song; v_scope := 'track';
    else
      -- A FINDING ABOUT THE TAPE goes on its lowest-position track, marked, so
      -- the Tape Room can draw it above the tracks where it always was.
      select id into v_target from public.soundtrack
       where city_slug = v_city order by position nulls last, id limit 1;
      v_scope := 'tape';
    end if;
    if v_target is null then v_skipped := v_skipped + 1; continue; end if;

    -- THE SAME md5 IT ALWAYS WAS, deliberately not the detail text, which the
    -- agent rewords every run and which would defeat the dedupe entirely.
    v_fp := md5(v_city || ':' || coalesce(v_song::text, '') || ':' || v_kind);

    -- THE DEDUPE THE PARTIAL UNIQUE INDEX USED TO DO. Open only: a finding
    -- cleared to `fixed` becomes reportable again, and that recurrence is the
    -- only check a fix landed.
    if exists (select 1 from public.soundtrack s, jsonb_array_elements(s.findings) e
                where s.id = v_target and e->>'fingerprint' = v_fp and e->>'status' = 'open') then
      v_skipped := v_skipped + 1; continue;
    end if;

    v_obj := jsonb_build_object(
      'id', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      'scope', v_scope, 'kind', v_kind, 'severity', coalesce(v_sev, 'low'),
      'detail', v_detail, 'suggestion', v_sugg,
      'status', 'open', 'fingerprint', v_fp,
      'created_at', now(), 'resolved_at', null);

    update public.soundtrack set findings = findings || jsonb_build_array(v_obj)
     where id = v_target;
    v_added := v_added + 1;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end $$;

grant execute on function public.tgb_report_soundtrack_issues(jsonb) to anon, authenticated;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Proved by calls that make them do their job, not by an empty payload:
--   select public.tgb_pull_soundtrack_songs('[{"city_slug":"denver","songs":[
--     {"title":"PROBE","artist":"PROBE","blurb":"probe row, delete me"}]}]'::jsonb);
--     -- expect {"added": 1, "skipped": 0}, and the row arrives archived = true
--   select public.tgb_pull_soundtrack_songs(... the same ...);
--     -- expect {"added": 0, "skipped": 1} -- the tombstone index holds
--   delete from public.soundtrack where title = 'PROBE';
