-- Two small holes in what the bot can know about its own work.
--
-- WHY
--
-- tgb_pull_socials_candidates already decides, per row, which of three things
-- happened -- inserted, url already present, or the row was malformed -- and
-- then throws that away, returning two counters. So a run that sends five and
-- gets back {"inserted": 3, "skipped": 2} cannot tell WHICH two died, or
-- whether they died because the story was a repeat or because the payload was
-- wrong. On 2026-08-13 that ambiguity cost a run three wasted gift picks and
-- left it unable to say in its own summary which candidates had actually been
-- filed.
--
-- The fix is not more access. The function knows the answer already; it just
-- has to say it. `results` reports the fate of rows the caller itself just
-- sent, so it exposes nothing the caller did not already have.
--
-- Separately, the bot re-pitches yesterday's stories because it cannot see
-- what it filed yesterday. public.socials is admin-read only and stays that
-- way -- `why` is an internal editorial note and `status` is a judgement we do
-- not publish. But a plain list of article urls we have already looked at is
-- not sensitive, and it is the whole of what dedupe needs.

-- A ---------------------------------------------------------------------------
-- Same function, same guarantees -- insert-only, status always 'review', capped
-- at 25, a duplicate skipped rather than raised. `inserted` and `skipped` are
-- unchanged and still returned, so every existing caller keeps working; this
-- only ADDS a `results` array.
--
-- DO NOT add a `status` parameter. That constant is what makes this safe to
-- expose to anon, exactly as with the book and soundtrack pulls.

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
  v_inserted integer := 0;
  v_skipped integer := 0;
  -- One entry per row the caller sent, in the order they sent it.
  v_results jsonb := '[]'::jsonb;
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

    insert into public.socials (
      id, headline, url, source, published, blurb, why, topics, media, image,
      platforms, status
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
      'review'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
      v_results := v_results || jsonb_build_object('id', v_id, 'url', v_url, 'outcome', 'inserted');
    else
      v_skipped := v_skipped + 1;
      -- Either the url is already filed or the id is. Both mean "we already
      -- have this one", which is the only thing the caller can act on.
      v_results := v_results || jsonb_build_object('id', v_id, 'url', v_url, 'outcome', 'duplicate');
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'results', v_results
  );
end;
$fn$;

comment on function public.tgb_pull_socials_candidates(jsonb) is
  'Insert-only candidate pull for TGB SOCIAL BOT. Always status review; skips a '
  'url already present. Callable with the publishable key. Returns '
  '{inserted, skipped, results[]} where each result is {id, url, outcome} and '
  'outcome is inserted | duplicate | invalid -- the fate of rows the caller '
  'just sent, so it reveals nothing the caller did not already hold.';

grant execute on function public.tgb_pull_socials_candidates(jsonb) to anon, authenticated;

-- B ---------------------------------------------------------------------------
-- Article urls already filed, so the bot stops re-pitching them.
--
-- DELIBERATELY NARROW. It returns the url and when it was filed and NOTHING
-- else -- no headline, no caption, no `why`, and above all no `status`.
-- "We considered this story and skipped it" is an editorial judgement, and via
-- the publishable key anything returned here is effectively public. A list of
-- public article urls we have looked at is not.
--
-- Gift urls are excluded: they are allowed to repeat, they have their own
-- reader in tgb_socials_used_gift_urls(), and including them here would invite
-- a caller to treat them as do-not-repeat.
--
-- STABLE so PostgREST answers a GET as well as a POST, same as the gift
-- reader, so anything that can fetch a url can use it.
create or replace function public.tgb_socials_filed_urls(days integer default 90)
returns table (
  url text,
  filed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select s.url, s.created_at
  from public.socials s
  where s.created_at >= now() - (greatest(least(coalesce(days, 90), 365), 1) || ' days')::interval
    and lower(s.url) not like '%/gifts/?item=%'
  order by s.created_at desc;
$fn$;

comment on function public.tgb_socials_filed_urls(integer) is
  'Story urls already filed in the last N days (default 90, capped at 365), so '
  'TGB SOCIAL BOT can stop re-pitching them. Returns url and timestamp ONLY -- '
  'never headline, caption, why or status, which are why public.socials is '
  'admin-read only. Gift urls are excluded; they may repeat and have their own '
  'reader in tgb_socials_used_gift_urls().';

revoke all on function public.tgb_socials_filed_urls(integer) from public;
grant execute on function public.tgb_socials_filed_urls(integer) to anon, authenticated;
