-- A CITY NAMED BY ANY WRITER IS ADDED TO public.cities.
--
-- Until now the two pull RPCs REFUSED an event whose city the catalogue did not
-- hold. The event was dropped, named in the run's summary, and came back only
-- once somebody added the city by hand. That is a real gap: TGB ANCHOR BOT
-- could find a good fixture in a town nobody had entered and simply lose it.
--
-- Asked for outright, and it reverses the advice in this file's own comment on
-- 2026082503 that the catalogue should not be writable by an anon-callable
-- function. **The concern was raised and overruled, which is a decision, not an
-- oversight.** What follows is the narrowest version of it that still does what
-- was asked, and the guards below are the whole of the argument.
--
-- ── WHAT MAKES THIS SAFE ENOUGH TO HAND TO `anon` ────────────────────────────
--
-- `tgb_ensure_city` is SECURITY DEFINER and INSERT-ONLY. It can create a row
-- and can never update or delete one, so an existing city cannot be renamed,
-- hidden, unhidden or removed through it.
--
--   * IT REFUSES A STRING THAT IS NOT A CITY. `tgb_parse_geo` must yield a
--     city_name AND either a state or a country. So "Chicago, Illinois" and
--     "Dublin, Ireland" pass; "Chicago", "TBD", "New England" and "" do not.
--     **That single rule is what stops a club market becoming a catalogue row**
--     -- the thing the room's own ensureCitiesExist refuses to invent.
--   * IT WRITES ONLY `city`. Slug and every structured column are filled by the
--     table's own triggers, exactly as they are for a hand-added city, so a row
--     that arrives this way is the same row as one added on the Cities page.
--   * `on conflict (city) do nothing`, so it is idempotent and cannot disturb
--     an existing row.
--   * The callers cap themselves: 60 rows a call for the anchor pull, 10 for the
--     concert pull, so a single request cannot flood the catalogue.
--
-- ── THE VISIBILITY FLAGS ARE LEFT AT THEIR DEFAULTS, DELIBERATELY ────────────
--
-- A new city arrives visible, like any other. It does not need hiding to be
-- harmless: the three public rails are driven by what a city HAS -- games,
-- tapes, gift listings -- and a city that has just been created has none of
-- them, so it shows nothing anywhere until somebody gives it something.
-- Pre-hiding it would instead mean every genuinely good city arrived switched
-- off and had to be found and switched on.
--
-- ── HOW TO FIND WHAT THE BOTS ADDED ──────────────────────────────────────────
--
--   select city, created_at from public.cities
--    where created_at > now() - interval '7 days' order by created_at desc;
--
-- `cities.created_at` already existed, so nothing new was needed to make these
-- reviewable.

begin;

create or replace function public.tgb_ensure_city(p_city text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text;
  g public.tgb_geo;
begin
  v_city := nullif(btrim(coalesce(p_city, '')), '');
  if v_city is null then
    return false;
  end if;

  -- Already there: nothing to do, and the common case is not news.
  if exists (select 1 from public.cities c where lower(btrim(c.city)) = lower(v_city)) then
    return false;
  end if;

  -- IT MUST PARSE AS A PLACE. A bare "Chicago" carries no state and would sit
  -- beside the real "Chicago, Illinois" as a near-duplicate nobody can tell
  -- apart later; "New England" is a market and not a city at all.
  g := public.tgb_parse_geo(v_city);
  if coalesce(nullif(btrim(g.city_name), ''), '') = '' then
    return false;
  end if;
  if coalesce(nullif(btrim(g.state_code), ''), '') = ''
     and coalesce(nullif(btrim(g.country_code), ''), '') = '' then
    return false;
  end if;

  -- ONLY `city`. cities_fill_slug and cities_sync_geo do the rest, which is
  -- what makes this the same row a human would have created.
  insert into public.cities (city) values (v_city)
  on conflict (city) do nothing;

  return true;
end;
$$;

revoke all on function public.tgb_ensure_city(text) from public;
grant execute on function public.tgb_ensure_city(text) to anon, authenticated;

comment on function public.tgb_ensure_city(text) is
  'Insert-only: adds a city to public.cities if the string parses as "City, StateOrCountry" and is not already there. Writes only `city`; the table triggers fill the slug and the structured geo. Cannot update or delete. Returns true when a row was created.';

-- ── The two pull RPCs stop refusing an unknown city ──────────────────────────
--
-- REWRITTEN IN PLACE FROM THE LIVE DEFINITION, one branch at a time, rather
-- than re-pasting either function. `create or replace` rewrites the WHOLE body
-- and this project has already lost a column that way: 2026081302 rebuilt the
-- socials pull's INSERT list and silently dropped `confidence` for five days.
do $$
declare
  r record;
  src text;
  fixed text;
  old_block text;
  new_block text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('tgb_pull_anchor_events', 'tgb_pull_concert_tours')
  loop
    src := pg_get_functiondef(r.oid);

    -- The refusal, in both functions, is the `not exists (... public.cities ...)`
    -- arm that sets outcome to 'unknown_city'. Replace the CONDITION with a call
    -- that creates the city, so the arm can never be taken.
    old_block := 'not exists (select 1 from public.cities c where lower(btrim(c.city)) = lower(v_city))';
    new_block := 'not public.tgb_ensure_city(v_city) and not exists '
              || '(select 1 from public.cities c where lower(btrim(c.city)) = lower(v_city))';

    if position(old_block in src) = 0 then
      raise notice '% does not carry the expected unknown-city test; left alone.', r.proname;
      continue;
    end if;

    fixed := replace(src, old_block, new_block);
    execute fixed;
    raise notice '% now adds an unknown city instead of refusing the event.', r.proname;
  end loop;
end $$;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- An empty payload proves nothing. Make each guard do its job.
--
-- 1. The helper refuses what is not a city, and accepts what is:
--
--    select public.tgb_ensure_city('Chicago, Illinois')  as already_there,  -- false
--           public.tgb_ensure_city('New England')        as a_market,       -- false
--           public.tgb_ensure_city('Chicago')            as no_state,       -- false
--           public.tgb_ensure_city('TBD')                as nonsense,       -- false
--           public.tgb_ensure_city('')                   as blank;          -- false
--
-- 2. A real new city IS created, with its slug and geo filled by the triggers:
--
--    select public.tgb_ensure_city('Nowheresville, Nebraska');   -- expect true
--    select city, slug, city_name, state_code, country_code, ignored
--      from public.cities where city = 'Nowheresville, Nebraska';
--    -- expect nowheresville / Nowheresville / NE / USA / false
--
--    select public.tgb_ensure_city('Nowheresville, Nebraska');   -- expect false
--
-- 3. THE POINT OF THE WHOLE CHANGE: an event in a town nobody has entered is
--    now FILED rather than dropped.
--
--    delete from public.cities where city = 'Nowheresville, Nebraska';
--    select public.tgb_pull_anchor_events('[{
--      "id": "CITY-AUTO-PROBE", "kind": "concert", "title": "Probe",
--      "venue_city": "Nowheresville, Nebraska", "venue": "A Hall",
--      "start_date": "2027-08-01"
--    }]'::jsonb);
--    -- expect outcome "inserted", NOT "unknown_city"
--
--    select (select count(*) from public.cities where city = 'Nowheresville, Nebraska') as city_made,
--           (select count(*) from public.events where id = 'CITY-AUTO-PROBE') as event_filed;
--    -- expect 1 and 1
--
-- 4. And a market still cannot become a city, so the event is still refused:
--
--    select public.tgb_pull_anchor_events('[{
--      "id": "CITY-MARKET-PROBE", "kind": "concert", "title": "Probe",
--      "venue_city": "New England", "start_date": "2027-08-01"
--    }]'::jsonb);
--    -- expect outcome "unknown_city"
--
-- 5. Tidy up:
--
--    delete from public.events where id in ('CITY-AUTO-PROBE','CITY-MARKET-PROBE');
--    delete from public.cities where city = 'Nowheresville, Nebraska';
--
-- 6. What the bots have added lately:
--
--    select city, created_at from public.cities
--     where created_at > now() - interval '7 days' order by created_at desc;
