-- THE TAGS ARE AND-ED OR OR-ED, AND THE STOP SAYS WHICH.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- 2026090309 matched CONTAINS-ALL and nothing else, so `{sports, chicago}`
-- could only ever mean the intersection. Both readings are wanted:
--
--     all   a challenge carrying sports AND chicago   -- narrower per tag
--     any   one carrying sports OR chicago            -- wider per tag
--
-- `all` / `any` RATHER THAN `and` / `or`, because those are the names the two
-- array operators already have -- `@>` contains all, `&&` overlaps -- so the
-- column and the SQL that reads it say one word. **The ROOM says AND and OR**,
-- which is what a person building a stop is thinking.
--
-- NOT NULL WITH A DEFAULT, so there is ONE representation of "all" rather than
-- a null that has to be read as one. It is meaningless on a stop with no tags
-- and on a stop that names a challenge, which costs nothing: an unread value
-- is not a wrong one.

begin;

alter table public.stops
  add column challenge_tags_match text not null default 'all';

alter table public.stops add constraint stops_tags_match_known
  check (challenge_tags_match in ('all', 'any'));

comment on column public.stops.challenge_tags_match is
  'How challenge_tags combine: all (every tag, the intersection) or any (at '
  'least one, the union). The Stop Builder says AND and OR. Meaningless with '
  'no tags, which costs nothing.';

-- ---- the resolver honours it -------------------------------------------
-- PATCHED BY REPLACING THE WHOLE BODY, which is safe HERE and only here: this
-- function was written twenty minutes ago in 2026090309 and its full text is
-- in that file, so there is no accumulated definition to lose. Anything older
-- gets patched one named expression at a time.
create or replace function public.tgb_pick_challenge(p_stop_id bigint, p_used bigint[] default '{}')
returns bigint
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with s as (
    select stop_id, waypoint_id, challenge_id, challenge_tags, challenge_tags_match
      from public.stops where stop_id = p_stop_id
  ),
  want as (
    select coalesce((select array_agg(lower(t)) from unnest(s.challenge_tags) t), '{}')::text[] as tags,
           s.challenge_tags_match as mode
      from s
  )
  select coalesce(
    -- A NAMED CHALLENGE IS A DELIBERATE CHOICE and is returned even if it has
    -- been used. The no-repeat rule is about the RANDOM pick; refusing a named
    -- one would leave the stop with nothing at all.
    (select challenge_id from s where challenge_id is not null),
    (select c.id
       from public.challenges c, s, want,
            lateral (select coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[] as t) ct
      where s.challenge_id is null
        -- NOT AGAIN IN THIS GAME. A game is one instance of one team playing,
        -- so the caller passes what THAT instance has already met -- only it
        -- knows. Nothing calls this yet.
        and not (c.id = any(coalesce(p_used, '{}')::bigint[]))
        and (cardinality(want.tags) = 0
             or (want.mode = 'all' and ct.t @> want.tags)
             or (want.mode = 'any' and ct.t && want.tags))
        -- THE WAIVER IS NEVER PICKED BY ACCIDENT. It gates the route and cannot
        -- be skipped; asking for it by its own tag still reaches it.
        and (cardinality(want.tags) > 0 or c.kind <> 'consent')
      order by random()
      limit 1)
  );
$$;

-- ---- VERIFY ------------------------------------------------------------
do $$
declare
  v_id    bigint;
  v_wp    bigint;
  v_stop  bigint;
  v_all   int;
  v_any   int;
  v_seen  bigint[] := '{}';
  v_tags  text[];
  v_n     int;
begin
  select wpid into v_wp from public.waypoints
   where wpid not in (select waypoint_id from public.stops where waypoint_id is not null)
   limit 1;
  insert into public.stops (waypoint_id, challenge_id) values (v_wp, null)
  returning stop_id into v_stop;

  -- THE TWO READINGS ARE GENUINELY DIFFERENT ON THE REAL ROWS. This probe
  -- failed the first time it ran, correctly: the one sports+chicago challenge
  -- was place-bound to another waypoint, so the resolver refused it and
  -- all-mode found nothing. 2026090311 removed scope, so it is reachable.
  select count(*) into v_all from public.challenges c
   where coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[] @> array['sports','chicago'];
  select count(*) into v_any from public.challenges c
   where coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[] && array['sports','chicago'];
  if v_any <= v_all then
    raise exception 'any (%) is not wider than all (%) -- the probe tags are a bad test', v_any, v_all;
  end if;

  -- ALL: every draw carries BOTH
  update public.stops set challenge_tags = array['sports','chicago'],
                          challenge_tags_match = 'all' where stop_id = v_stop;
  for v_n in 1..10 loop
    select public.tgb_pick_challenge(v_stop) into v_id;
    if v_id is null then raise exception 'all-mode found nothing on pass %', v_n; end if;
    select tags into v_tags from public.challenges where id = v_id;
    if not (coalesce((select array_agg(lower(x)) from unnest(v_tags) x), '{}')::text[]
            @> array['sports','chicago']) then
      raise exception 'all-mode returned % which carries only %', v_id, v_tags;
    end if;
  end loop;

  -- ANY: every draw carries AT LEAST ONE, and the set is bigger
  update public.stops set challenge_tags_match = 'any' where stop_id = v_stop;
  v_seen := '{}';
  loop
    select public.tgb_pick_challenge(v_stop, v_seen) into v_id;
    exit when v_id is null;
    if v_id = any(v_seen) then raise exception 'challenge % came back twice', v_id; end if;
    select tags into v_tags from public.challenges where id = v_id;
    if not (coalesce((select array_agg(lower(x)) from unnest(v_tags) x), '{}')::text[]
            && array['sports','chicago']) then
      raise exception 'any-mode returned % which carries neither: %', v_id, v_tags;
    end if;
    v_seen := v_seen || v_id;
    if cardinality(v_seen) > 200 then raise exception 'the walk did not end'; end if;
  end loop;
  if cardinality(v_seen) <> v_any then
    raise exception 'any-mode walked % of % challenges', cardinality(v_seen), v_any;
  end if;

  -- and the mode is refused if it is neither
  begin
    update public.stops set challenge_tags_match = 'either' where stop_id = v_stop;
    raise exception 'an unknown match mode was accepted';
  exception when check_violation then null;
  end;

  delete from public.stops where stop_id = v_stop;
  raise notice 'all matched 10/10 (% rows); any walked all % with no repeat; a third mode is refused', v_all, v_any;
end $$;

commit;
