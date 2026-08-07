-- A confidence score on every candidate, 1-100, written by the bot.
--
-- WHY THIS EXISTS
--
-- TGB SOCIAL BOT used to be allowed to come back short: "you cannot find five
-- that clear the bar -- file four, or three. A short honest run beats a padded
-- one." That was the right call while there was no way to say how good a
-- candidate was, because the alternative was filler indistinguishable from a
-- real find.
--
-- The count is now fixed at five and the editorial rules bend to reach it: the
-- freshness window, the topic mix, one-source-per-story. Confidence is what
-- makes that safe. A stretched pick arrives saying it is stretched, so the
-- human sorts rather than guesses, and a run of five 30s is legible as a thin
-- week rather than passed off as a good one.
--
--   80-100  would post it without thinking
--   60-79   solid, on-beat
--   40-59   fine, nothing special
--   20-39   filed to reach five; a rule was bent
--    1-19   scraping
--
-- It is DELIBERATELY NULLABLE, and null is not zero. Every row written before
-- today has no score and never will, and a hand-added candidate has no score
-- either -- a human typing a story in has already made the judgement the number
-- exists to carry. Treat null as "not scored", never as "bad".
--
-- The scale is 1-100 rather than 1-10 or a three-word enum because it is the
-- one the agent is asked for in prose and hands back unrounded; bucketing it
-- here would throw away detail the reader might want and would have to be
-- re-agreed every time the buckets moved.

alter table public.socials
  add column if not exists confidence smallint;

do $$
begin
  alter table public.socials
    add constraint socials_confidence_range check (confidence between 1 and 100);
exception
  when duplicate_object then null;
end;
$$;

comment on column public.socials.confidence is
  'Agent''s own 1-100 confidence in the pick. Null means not scored (every row '
  'before 2026-08-07, and anything added by hand) -- null is not zero.';

-- ---------------------------------------------------------------------------
-- The pull RPC, unchanged except that it now carries `confidence` through.
--
-- Still insert-only, still always status 'review', still capped, still skips a
-- url already present. Those constants are what make it safe to expose to anon
-- and none of them move.
--
-- An out-of-range or non-numeric confidence is dropped to null rather than
-- raising: the same rule the whole function already follows for `image` and
-- `platforms`, and for the same reason -- a bad score must not cost the run a
-- verified story.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_pull_socials_candidates(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_items jsonb;
  v_item jsonb;
  v_id text;
  v_url text;
  v_topics text[];
  v_confidence smallint;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  v_items := payload -> 'posts';
  if v_items is null or jsonb_typeof(v_items) <> 'array' then
    raise exception 'Expected { "posts": [ ... ] }.';
  end if;

  -- Well above an honest run of five, far below "flood the table".
  if jsonb_array_length(v_items) > 25 then
    raise exception 'Too many candidates in one call (% > 25).', jsonb_array_length(v_items);
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_id  := nullif(btrim(v_item ->> 'id'), '');
    v_url := nullif(btrim(v_item ->> 'url'), '');

    -- A malformed entry is skipped, not raised: one bad row must not cost the
    -- run its other four.
    if v_id is null or v_url is null
       or nullif(btrim(v_item ->> 'headline'), '') is null
       or nullif(btrim(v_item ->> 'blurb'), '') is null then
      v_skipped := v_skipped + 1;
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

    -- Anything that is not a plain integer in 1-100 lands as null: an
    -- unscored candidate is honest, a rejected run is not.
    v_confidence := null;
    if (v_item ->> 'confidence') ~ '^[0-9]{1,3}$' then
      v_confidence := least(100, greatest(1, (v_item ->> 'confidence')::integer));
    end if;

    insert into public.socials (
      id, headline, url, source, published, blurb, why, topics, media, image,
      platforms, confidence, status
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
      v_confidence,
      'review'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$fn$;

comment on function public.tgb_pull_socials_candidates(jsonb) is
  'Insert-only candidate pull for TGB SOCIAL BOT. Always status review; skips a '
  'url already present; carries an optional 1-100 confidence. Callable with the '
  'publishable key.';

grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;
