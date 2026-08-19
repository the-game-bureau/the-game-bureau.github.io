-- Let a HUMAN repost anything, while the BOT still cannot file a story twice.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- WHAT THIS CHANGES, AND WHY IT IS SAFE
--
-- socials_url_idx has been a UNIQUE index on lower(url) since the table
-- existed, skipping our own /gifts/?item= urls (2026081301, because a fixed
-- catalogue posted from twice a day HAS to repeat) and the blank url
-- (2026081501, because a note with no destination is not a duplicate of another
-- note). Its job was always the same one: stop SOCIALIZER BOT filing a story it
-- has already filed, because a run that rediscovers last week's article has
-- wasted a pick.
--
-- That job is real and it stays. What was wrong was WHERE it was enforced. An
-- index cannot tell the difference between the routine finding the same url for
-- the second time, which is a mistake, and a person deciding on purpose to run
-- a post again, which is not. So the Socializer's "Copy to Review" on a posted
-- candidate worked for gifts and was refused with a 23505 for everything else,
-- and the only answer we could give was "a story url can be filed once", which
-- is a statement about our schema rather than about anything a person wanted.
--
-- THE DEDUPE MOVES INTO THE RPC. tgb_pull_socials_candidates is the bot's only
-- write path, so a check there catches exactly the case the index was for and
-- nothing else. The reply is unchanged: a url already present still comes back
-- with outcome 'duplicate', and inserted/skipped still count the same way, so
-- the routine's step 7 needs no edit.
--
-- The page keeps its own client-side check on MANUAL ADD, which warns before
-- you file a link the queue already holds. That was always a courtesy rather
-- than the enforcement, and it is unaffected.
--
-- WHAT YOU GIVE UP, stated plainly: nothing now stops a duplicate story url
-- arriving by some future path that does not go through the RPC. Today there is
-- no such path -- writes are `authenticated` and the two that exist are this
-- function and the admin page. If a third ever appears, it inherits the
-- responsibility, and this comment is the reason why.

-- ---------------------------------------------------------------------------
-- 1. The index stops being unique, and stays for lookup speed.
-- ---------------------------------------------------------------------------

drop index if exists public.socials_url_idx;

create index socials_url_idx on public.socials (lower(url));

comment on index public.socials_url_idx is
  'Lookup only, NOT unique since 2026-08-19. Story de-duplication moved into tgb_pull_socials_candidates so a human can deliberately repost a candidate from the Socializer while the bot still cannot file the same story twice.';

-- ---------------------------------------------------------------------------
-- 2. The pull RPC does the de-duplication itself.
--
-- This is the 2026081808 body (which restored `confidence` after 2026081302
-- silently dropped it) with the on-conflict insert replaced by an explicit
-- existence check. REMEMBER THE LESSON FROM 2026081808: a `create or replace`
-- rewrites the WHOLE function, so a column another migration taught it about
-- has to be carried forward by hand. Check the INSERT column list against the
-- table before replacing this again.
-- ---------------------------------------------------------------------------

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
  v_confidence smallint;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_dupe boolean;
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
    -- run its other four. 'invalid' names it so the bot stops reading a missing
    -- blurb as a duplicate story and going off to find a replacement it did not
    -- need.
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

    -- THE DE-DUPLICATION, formerly a unique index. Same two exemptions it
    -- always carried: our own gift urls repeat by design, and a blank url is a
    -- note rather than a destination. (A blank cannot reach here anyway, since
    -- an empty url is already 'invalid' above; the clause is kept so the rule
    -- reads completely in one place.)
    v_dupe := false;
    if v_url <> '' and lower(v_url) not like '%/gifts/?item=%' then
      select exists (
        select 1 from public.socials s where lower(s.url) = lower(v_url)
      ) into v_dupe;
    end if;

    if v_dupe then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'url', v_url, 'outcome', 'duplicate');
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

    -- Clamped rather than refused: an out-of-range or non-numeric score is
    -- stored as null, which reads as "not scored", rather than costing the run
    -- a candidate over a number.
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
    -- Still guards the PRIMARY KEY: two runs in one second, or a retry of a
    -- call that already landed, must not raise.
    on conflict (id) do nothing;

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
  'SOCIALIZER BOT''s write path. SECURITY DEFINER, insert-only, always status = review, at most 25 a call. De-duplicates story urls ITSELF as of 2026-08-19 (the unique index was dropped so a human can deliberately repost from the Socializer); our own gift urls are exempt and may repeat. Carries an optional 1-100 confidence, which 2026081302 dropped by rewriting the function without it and 2026081808 put back. Callable with the publishable key.';

revoke all on function public.tgb_pull_socials_candidates(jsonb) from public;
grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;
