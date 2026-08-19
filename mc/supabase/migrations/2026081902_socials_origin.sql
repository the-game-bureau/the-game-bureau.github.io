-- Record HOW each candidate arrived: manual, prompt, or bot.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- There are exactly three ways a row reaches public.socials, and until now the
-- table could not tell you which one a given candidate came by:
--
--   bot     SOCIALIZER BOT, twice a day, through tgb_pull_socials_candidates.
--   prompt  a human copied the Socializer's PROMPT text into a chat AI and
--           pasted the SQL it handed back into the Supabase SQL editor.
--   manual  a human typed it into the MANUAL ADD box on the page.
--
-- WHY IT IS WORTH A COLUMN. Those three have different failure modes and
-- different quality. A caption the bot wrote follows a prompt we control and
-- can fix; a caption that came out of somebody's ChatGPT session followed
-- whatever that session did with the same text, and is the one to look at twice
-- when the voice drifts. A manual row is a person's own note and answers to
-- nobody. Reading a queue without knowing which is which means judging all
-- three by one standard.
--
-- THE DEFAULT IS 'prompt', AND THAT IS DELIBERATE. Of the three writers, the
-- pasted SQL is the only one that is hand-assembled and therefore the only one
-- that can forget the column. The other two set it explicitly: the RPC hardcodes
-- 'bot' (below) and the admin page sends 'manual'. So the default catches
-- exactly the writer that needs catching. The PROMPT text names the column
-- anyway, so the default is a backstop rather than the mechanism.
--
-- THE BACKFILL CANNOT BE EXACT, and pretending otherwise would be worse than
-- saying so. A manual row is identifiable: the page has always given it a
-- `manual-` id. Bot rows and prompt rows are NOT distinguishable, because the
-- PROMPT text tells the chat AI to use the same <YYYY-MM-DD>-<HHMM>-<n> id shape
-- the routine uses. The routine has filed five candidates twice a day for
-- months and the prompt is used occasionally, so everything date-stamped is
-- backfilled to 'bot' as the overwhelmingly likely answer. Rows filed before
-- today therefore carry a GUESS on this column, and a prompt-pasted row from
-- before today will read as bot. Everything filed from now on is recorded
-- rather than inferred.

alter table public.socials
  add column if not exists origin text not null default 'prompt';

alter table public.socials
  drop constraint if exists socials_origin_check;

alter table public.socials
  add constraint socials_origin_check
  check (origin in ('manual', 'prompt', 'bot'));

comment on column public.socials.origin is
  'How the candidate arrived: bot (tgb_pull_socials_candidates), prompt (SQL pasted from a chat AI), manual (typed into MANUAL ADD). Defaults to prompt because the pasted SQL is the only writer that can forget it; the RPC and the page both set it explicitly. Rows filed before 2026-08-19 carry a backfilled guess: manual- ids are exact, everything else was set to bot, and a prompt-pasted row from before that date is indistinguishable from a bot one.';

-- The backfill. `manual-` is exact; the rest is the likeliest answer, not a
-- known one. See the note above.
update public.socials
   set origin = case when id ilike 'manual-%' then 'manual' else 'bot' end;

-- ---------------------------------------------------------------------------
-- The pull RPC stamps 'bot'.
--
-- This is the 2026081901 body with `origin` added to the INSERT. REMEMBER THE
-- LESSON FROM 2026081808: a `create or replace` rewrites the WHOLE function, so
-- a column another migration taught it about has to be carried forward by hand.
-- Carried forward here: `confidence` (2026080701, dropped by 2026081302,
-- restored by 2026081808), the per-row `results` reply (2026081302), and the
-- in-function story de-duplication (2026081901).
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

    -- THE DE-DUPLICATION, formerly a unique index (2026081901). Same two
    -- exemptions it always carried: our own gift urls repeat by design, and a
    -- blank url is a note rather than a destination.
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
      platforms, confidence, status, origin
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
      'review',
      -- HARDCODED, like `status`. There is no `origin` parameter and there must
      -- not be one: a constant is what makes this function safe to expose to
      -- anon, and a caller that could name its own origin could label itself
      -- anything. Everything this function files came from the routine.
      'bot'
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
  'SOCIALIZER BOT''s write path. SECURITY DEFINER, insert-only, always status = review and origin = bot, at most 25 a call. De-duplicates story urls itself (2026081901); our own gift urls are exempt and may repeat. Carries an optional 1-100 confidence, which 2026081302 dropped by rewriting the function without it and 2026081808 put back. Callable with the publishable key.';

revoke all on function public.tgb_pull_socials_candidates(jsonb) from public;
grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;
