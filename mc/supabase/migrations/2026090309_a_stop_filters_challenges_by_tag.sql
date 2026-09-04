-- A STOP FILTERS CHALLENGES BY TAG, AND A GAME NEVER REPEATS ONE.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- THIS SUPERSEDES 2026090308, WHICH IS TWENTY MINUTES OLD. That file gave a
-- stop a `random_kind` and a `random_word` -- two mechanisms, one of which
-- duplicated something the data already carries. `challenges.tags` has existed
-- since 2026082902 and already holds exactly what was wanted:
--
--     sports 9   observation 7   quiz 7   minigame 6   opponent 6
--     chicago 5  silly 4         trivia 4  photo 3     landmark 2  JFK 1
--
-- **A TEAM, A CITY AND A TYPE ARE ALL JUST TAGS**, so one filter says all three
-- and `kind` stops being a second axis a stop has to know about. 2026090308's
-- file stays as the record of what was run on the day; nothing it added
-- survives.
--
-- ZERO, ONE OR MORE, AND MORE MEANS NARROWER. `challenge_tags` is an array and
-- the match is CONTAINS-ALL, so `{sports,chicago}` is the intersection rather
-- than the union: a filter that widened as you added to it would be the
-- opposite of what the word means. Empty or null is every challenge.
--
-- MATCHED CASE-INSENSITIVELY RATHER THAN NORMALISING ANYBODY'S DATA. The tags
-- on file are mostly lowercase and two are not (`History`, `JFK`), and
-- lowercasing on write silently rewrites what somebody typed -- which is what
-- 2026090124 took OUT of the audiences room. Both sides are lowered for the
-- comparison and neither row is touched.
--
-- **39 OF THE 63 CHALLENGES CARRY NO TAGS AT ALL**, which is worth knowing
-- before relying on this: a tag filter reaches the 24 that are tagged, and
-- tagging the rest is editorial work in the Challenge Bank.

begin;

-- ---- 2026090308 is undone ----------------------------------------------
alter table public.stops drop constraint stops_fixed_or_random;
alter table public.stops drop constraint stops_random_kind_known;
alter table public.stops drop constraint stops_random_word_not_blank;
alter table public.stops drop column random_kind;
alter table public.stops drop column random_word;

-- ---- the one filter -----------------------------------------------------
alter table public.stops add column challenge_tags text[];

comment on column public.stops.challenge_tags is
  'With challenge_id null: pick from challenges carrying ALL of these tags, '
  'matched case-insensitively. Null or empty means any challenge. A team, a '
  'city and a type are all just tags.';

-- A FIXED CHALLENGE CARRIES NO FILTER. Both at once is the one state no reader
-- could interpret: it names a challenge and describes a different one.
alter table public.stops add constraint stops_fixed_or_filtered
  check (challenge_id is null or challenge_tags is null or cardinality(challenge_tags) = 0);

-- A BLANK MEMBER IS A TAG NO CHALLENGE CAN CARRY, so it would silently make the
-- filter match nothing. Same guard `audiences_aliases_not_blank` keeps.
alter table public.stops add constraint stops_challenge_tags_not_blank
  check (challenge_tags is null or not (challenge_tags && array['']));

-- ---- THE PICK IS DEFINED ONCE ------------------------------------------
-- DROPPED, NOT OVERLOADED. `create or replace` with a new signature makes a
-- SECOND function, and PostgREST refuses to choose between two that accept the
-- same arguments -- it answers 300, which reads as the function being missing.
drop function if exists public.tgb_pick_challenge(bigint);

create function public.tgb_pick_challenge(p_stop_id bigint, p_used bigint[] default '{}')
returns bigint
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with s as (
    select stop_id, waypoint_id, challenge_id, challenge_tags
      from public.stops where stop_id = p_stop_id
  ),
  want as (
    select coalesce((select array_agg(lower(t)) from unnest(s.challenge_tags) t), '{}')::text[] as tags
      from s
  )
  select coalesce(
    -- A NAMED CHALLENGE IS A DELIBERATE CHOICE and is returned even if it has
    -- been used. The no-repeat rule is about the RANDOM pick; refusing a named
    -- one would leave the stop with nothing at all.
    (select challenge_id from s where challenge_id is not null),
    (select c.id
       from public.challenges c, s, want
      where s.challenge_id is null
        -- NOT AGAIN IN THIS GAME. The caller passes what it has already used,
        -- because only the caller knows what a play has met.
        and not (c.id = any(coalesce(p_used, '{}')::bigint[]))
        -- every tag asked for, case-insensitively
        and (cardinality(want.tags) = 0
             or coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[] @> want.tags)
        -- THE WAIVER IS NEVER PICKED BY ACCIDENT. It gates the route and cannot
        -- be skipped; asking for it by its own tag still reaches it.
        and (cardinality(want.tags) > 0 or c.kind <> 'consent')
        -- A PLACE-BOUND CHALLENGE BELONGS AT ITS OWN WAYPOINT. Picking one for
        -- another stop asks "whose house is this?" outside a stadium.
        and (c.scope_wpid is null or c.scope_wpid = s.waypoint_id)
      order by random()
      limit 1)
  );
$$;

comment on function public.tgb_pick_challenge(bigint, bigint[]) is
  'The challenge a stop resolves to: its own if it names one, otherwise a '
  'random one carrying every tag the stop asks for and not in p_used. Returns '
  'null when nothing is left, which is honest -- falling back to an untagged '
  'or already-used challenge would ignore what was asked for. Called by '
  'nothing yet: neither engine runs a generated stop.';

grant execute on function public.tgb_pick_challenge(bigint, bigint[]) to anon, authenticated;

-- ---- VERIFY ------------------------------------------------------------
do $$
declare
  v_id   bigint;
  v_wp   bigint;
  v_stop bigint;
  v_seen bigint[] := '{}';
  v_n    int;
  v_tags text[];
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'stops'
                and column_name in ('random_kind', 'random_word')) then
    raise exception '2026090308 columns are still there';
  end if;

  select wpid into v_wp from public.waypoints
   where wpid not in (select waypoint_id from public.stops where waypoint_id is not null)
   limit 1;
  insert into public.stops (waypoint_id, challenge_id) values (v_wp, null)
  returning stop_id into v_stop;

  -- 1. no tags: any challenge, never the waiver
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id is null then raise exception 'an unfiltered pick found nothing'; end if;
  if (select kind from public.challenges where id = v_id) = 'consent' then
    raise exception 'an unfiltered pick returned the waiver';
  end if;

  -- 2. one tag, ten times, every one carrying it
  update public.stops set challenge_tags = array['sports'] where stop_id = v_stop;
  for v_n in 1..10 loop
    select public.tgb_pick_challenge(v_stop) into v_id;
    if v_id is null then raise exception 'the sports tag found nothing on pass %', v_n; end if;
    select tags into v_tags from public.challenges where id = v_id;
    if not (coalesce((select array_agg(lower(x)) from unnest(v_tags) x), '{}')::text[] @> array['sports']) then
      raise exception 'pick % does not carry the sports tag: %', v_id, v_tags;
    end if;
  end loop;

  -- 3. MORE TAGS IS NARROWER, not wider
  update public.stops set challenge_tags = array['sports', 'chicago'] where stop_id = v_stop;
  select count(*) into v_n from public.challenges c
   where coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[]
         @> array['sports', 'chicago'];
  if v_n >= (select count(*) from public.challenges c
              where coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[]
                    @> array['sports']) then
    raise exception 'two tags did not narrow the set';
  end if;

  -- 4. CASE DOES NOT MATTER
  update public.stops set challenge_tags = array['SPORTS'] where stop_id = v_stop;
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id is null then raise exception 'an uppercase tag matched nothing'; end if;

  -- 5. NO REPEATS. Walk the whole sports set, excluding what has been seen,
  --    and it must run out rather than hand one back twice.
  update public.stops set challenge_tags = array['sports'] where stop_id = v_stop;
  loop
    select public.tgb_pick_challenge(v_stop, v_seen) into v_id;
    exit when v_id is null;
    if v_id = any(v_seen) then
      raise exception 'challenge % came back twice', v_id;
    end if;
    v_seen := v_seen || v_id;
    if cardinality(v_seen) > 200 then raise exception 'the no-repeat loop did not end'; end if;
  end loop;
  if cardinality(v_seen) < 2 then
    raise exception 'expected several sports challenges, walked %', cardinality(v_seen);
  end if;

  -- 6. a tag nothing carries returns NULL rather than falling back
  update public.stops set challenge_tags = array['zzznotatag'] where stop_id = v_stop;
  if public.tgb_pick_challenge(v_stop) is not null then
    raise exception 'an unknown tag fell back instead of returning null';
  end if;

  -- 7. a named challenge wins, and is returned even when already used
  update public.stops set challenge_tags = null,
         challenge_id = (select id from public.challenges where kind = 'photo' limit 1)
   where stop_id = v_stop;
  select challenge_id into v_id from public.stops where stop_id = v_stop;
  if public.tgb_pick_challenge(v_stop, array[v_id]) <> v_id then
    raise exception 'a named challenge was not returned';
  end if;

  delete from public.stops where stop_id = v_stop;
  raise notice 'tags: unfiltered avoids consent, one tag 10/10, two narrow, case ignored, % walked with no repeat, unknown tag null, named wins', cardinality(v_seen);
end $$;

commit;
