-- Put `confidence` back into tgb_pull_socials_candidates.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHAT HAPPENED. 2026080701 added public.socials.confidence and taught the pull
-- RPC to carry it. 2026081302 rewrote that same function to add the per-row
-- `results` reply, and rebuilt the INSERT column list WITHOUT confidence: the
-- word does not appear in that file once. `create or replace` means the later
-- definition simply won, so every candidate filed from 2026-08-13 onwards
-- arrived unscored and the Socializer drew no percentage on any of them.
--
-- Nothing errored and nothing looked wrong. The bot kept scoring its picks in
-- the prose of `why` ("Strongest of the four"), which is what made the loss
-- survivable to look at and invisible to notice.
--
-- THE LESSON, and it is the reason this file exists rather than a quiet edit:
-- when a `create or replace` rewrites a function, the new body is the WHOLE
-- function. A column another migration taught it about is not inherited; it has
-- to be carried forward by hand, and there is nothing in Postgres that will
-- tell you it was dropped.
--
-- This is the 2026081302 body, unchanged except for the three confidence lines,
-- which are marked.

create or replace function public.tgb_pull_socials_candidates(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_items jsonb;
  v_item jsonb;
  v_id text;
  v_url text;
  v_topics text[];
  v_confidence smallint;          -- restored
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  if payload is null then
    raise exception 'Expected { "posts": [...] }.';
  elsif jsonb_typeof(payload -> 'posts') = 'array' then
    v_items := payload -> 'posts';
  elsif jsonb_typeof(payload) = 'array' then
    v_items := payload;
  else
    raise exception 'Expected { "posts": [...] }.';
  end if;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'results', '[]'::jsonb);
  end if;
  if jsonb_array_length(v_items) > 25 then
    raise exception 'At most 25 candidates a call (got %).', jsonb_array_length(v_items);
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_id  := nullif(btrim(v_item ->> 'id'), '');
    v_url := nullif(btrim(v_item ->> 'url'), '');

    -- A malformed entry is skipped, not raised: one bad row must not cost the
    -- run its other four. 'invalid' names it so the bot stops reading a
    -- missing blurb as a duplicate story and going off to find a replacement
    -- it did not need.
    if v_id is null or v_url is null
       or nullif(btrim(v_item ->> 'headline'), '') is null
       or nullif(btrim(v_item ->> 'blurb'), '') is null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object(
        'id', coalesce(v_id, '(missing id)'),
        'url', v_url,
        'outcome', 'invalid'
      );
      continue;
    end if;

    if jsonb_typeof(v_item -> 'topics') = 'array' then
      select array_agg(lower(btrim(t)))
        into v_topics
        from jsonb_array_elements_text(v_item -> 'topics') t
       where nullif(btrim(t), '') is not null;
    else
      v_topics := null;
    end if;

    -- RESTORED, and clamped rather than refused: an out-of-range or
    -- non-numeric score is stored as null, which reads as "not scored", rather
    -- than costing the run a candidate over a number.
    v_confidence := null;
    if (v_item ->> 'confidence') ~ '^[0-9]{1,3}$' then
      v_confidence := least(100, greatest(1, (v_item ->> 'confidence')::integer));
    end if;

    insert into public.socials (
      id, headline, url, source, published, blurb, why, topics, media, image,
      platforms, confidence, status                                  -- restored
    )
    values (
      v_id,
      btrim(v_item ->> 'headline'),
      v_url,
      nullif(btrim(v_item ->> 'source'), ''),
      nullif(btrim(v_item ->> 'published'), ''),
      btrim(v_item ->> 'blurb'),
      nullif(btrim(v_item ->> 'why'), ''),
      v_topics,
      nullif(btrim(v_item ->> 'media'), ''),
      -- A fabricated or relative image path is dropped rather than stored.
      case when (v_item ->> 'image') ~* '^https?://' then btrim(v_item ->> 'image') else null end,
      case when jsonb_typeof(v_item -> 'platforms') = 'array' then v_item -> 'platforms' else null end,
      v_confidence,                                                  -- restored
      'review'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'url', v_url, 'outcome', 'inserted');
    else
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'url', v_url, 'outcome', 'duplicate');
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'results', v_results);
end;
$$;

comment on function public.tgb_pull_socials_candidates(jsonb) is
  'SOCIALIZER BOT''s write path. SECURITY DEFINER, insert-only, always status = review, at most 25 a call, a url already present is skipped rather than raised. Carries an optional 1-100 confidence, which 2026081302 dropped by rewriting the function without it and 2026081808 put back. Callable with the publishable key.';

revoke all on function public.tgb_pull_socials_candidates(jsonb) from public;
grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;
