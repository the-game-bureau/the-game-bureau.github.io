-- One row per real place in public.cities.
--
-- Why this exists:
-- `cities.city` is unique, but it is a *string* key -- so two spellings of the
-- same place are two legal rows. That is exactly how 'Sacramento, California'
-- and 'Sacramento, CA' both got in (see 2026073102). Worse, the second insert
-- does not fail loudly: tgb_city_slug() sees the base slug taken by a different
-- city string and qualifies it to 'sacramento-ca', so the split catalog is
-- created silently and only detonates later, when something canonicalizes the
-- string and finally trips cities_city_key with a bare 23505.
--
-- The structured columns are the honest identity of a place, so key on them:
-- city_name + state_code + country_code, case- and whitespace-insensitive. The
-- cities_sync_geo BEFORE trigger fills all three from the city string before
-- this index is checked, so a client still posts nothing but { city } and the
-- duplicate is now rejected at insert time instead of weeks later.
--
-- Verified against the live database on 2026-07-31, after 2026073102 runs: 250
-- rows, all three columns populated on every one, and zero duplicate triples.
-- So this creates clean with nothing to merge by hand first.

begin;

-- 1. Fail with a readable list rather than a raw 23505 if the catalog drifted
--    between writing this and running it.
do $$
declare
  v_dupes text;
begin
  -- The grouped expressions must be spelled EXACTLY as the index spells them,
  -- and the select list must reuse those same expressions verbatim -- a display
  -- tweak in the select (say, coalescing to '-' instead of '') makes it a
  -- different expression that Postgres cannot match to the group, and the whole
  -- block fails with a 42803 instead of listing the duplicates. Prettify the
  -- empty string in the outer query, where it is no longer a grouping key.
  select string_agg(d.detail, E'\n' order by d.detail)
    into v_dupes
    from (
      select
        format(
          '  %s / %s / %s -> %s',
          d0.city_key,
          coalesce(nullif(d0.state_key, ''), '-'),
          coalesce(nullif(d0.country_key, ''), '-'),
          d0.slugs
        ) as detail
        from (
          select
            lower(btrim(city_name))                        as city_key,
            coalesce(upper(btrim(state_code)), '')         as state_key,
            coalesce(upper(btrim(country_code)), '')       as country_key,
            string_agg(slug, ', ' order by slug)           as slugs
            from public.cities
           where nullif(btrim(coalesce(city_name, '')), '') is not null
           group by
             lower(btrim(city_name)),
             coalesce(upper(btrim(state_code)), ''),
             coalesce(upper(btrim(country_code)), '')
          having count(*) > 1
        ) d0
    ) d;

  if v_dupes is not null then
    raise exception
      E'public.cities has rows that resolve to the same place, so cities_place_key cannot be created. Merge each group onto one slug (repoint soundtracks.city_slug and any city strings first), then re-run:\n%',
      v_dupes;
  end if;
end $$;

-- 2. The index. Expression-based rather than a plain column tuple for two
--    reasons: it folds case/whitespace the same way the geo helpers do, and
--    coalescing the codes means a null state_code cannot be used as a loophole
--    to insert the same city twice (in a plain unique index nulls are always
--    distinct, so 'Springfield/null/USA' would be insertable without limit).
create unique index if not exists cities_place_key
  on public.cities (
    lower(btrim(city_name)),
    coalesce(upper(btrim(state_code)), ''),
    coalesce(upper(btrim(country_code)), '')
  )
  -- Partial on purpose. A row whose city string the parser cannot read gets a
  -- null city_name, and every such row would collapse to the same key and
  -- collide with the others. Those rows are already visible as broken (no oval,
  -- no state icon); blocking their insert would just turn a bad display into a
  -- failed write. The index guards real, parsed places.
  where nullif(btrim(coalesce(city_name, '')), '') is not null;

comment on index public.cities_place_key is
  'One row per real place: city_name + state_code + country_code, case/whitespace folded. Complements the cities_city_key string uniqueness -- see supabase/migrations/2026073103_cities_unique_place.sql.';

commit;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect the index to exist:
-- select indexdef from pg_indexes where indexname = 'cities_place_key';
--
-- Expect a duplicate insert to be rejected (rolls itself back):
-- begin;
--   insert into public.cities (city) values ('Sacramento, CA');  -- 23505
-- rollback;
--
-- ── Rollback (down) ─────────────────────────────────────────────────────────
-- drop index if exists public.cities_place_key;
