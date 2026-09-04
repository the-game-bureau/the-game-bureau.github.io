-- SCOPE GOES. TAGS DO THAT JOB NOW.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- `scope` was portable / team / city / place, each of the three narrow ones
-- carrying a key -- `scope_team`, `scope_city`, `scope_wpid`. All four go, and
-- what replaces them is `challenges.tags`, applied by hand.
--
-- **WHAT IT COSTS, PLAINLY, BECAUSE NONE OF IT COMES BACK BY ACCIDENT:**
--
--   * THE ROUTE BUILDER'S PICKER STOPS BEING SCOPE-FILTERED. That room offered
--     a stop only the challenges its scope allowed -- 17 of 24 on a real
--     Atlanta route -- and offered a team-bound one with the cost said on the
--     option. It offers everything now.
--   * A PLACE-BOUND CHALLENGE IS NO LONGER BOUND. `scope_wpid` was a real
--     foreign key, so "whose house is this?" could only ever be offered at its
--     own waypoint; nothing enforces that any more, and `tgb_pick_challenge`
--     loses the clause that kept a random draw from reaching across.
--   * THE `unbound-scope` FINDING IN THE CHALLENGE BANK has nothing left to
--     report.
--
-- THE VALUES ARE KEPT IN `challenges_scope_retired`, because a drop is the one
-- irreversible move and this is the only record of which challenge belonged
-- where. 7 rows carry a scope other than portable.
--
-- `issues.scope` IS A DIFFERENT COLUMN AND IS NOT TOUCHED. Six functions and
-- the `soundtrack_findings` view name it; every one of them is about a finding
-- rather than a challenge, and a sweep counting the word rather than reading
-- the line would have rewritten all six.

begin;

create table if not exists public.challenges_scope_retired as
  select id, scope, scope_team, scope_city, scope_wpid
    from public.challenges
   where scope is distinct from 'portable'
      or scope_team is not null or scope_city is not null or scope_wpid is not null;

comment on table public.challenges_scope_retired is
  'What each challenge''s scope was before 2026090311 dropped it. Kept because '
  'a drop is irreversible and this is the only record of which challenge was '
  'bound to which team, city or waypoint. Read by nothing.';

-- ---- the one constraint that MIXES scope with a live rule ---------------
-- `challenges_ladder_key_belongs_to_trivia` says a trivia row carries a lower
-- case ladder key AND is portable with no scope keys. Only the first half
-- survives, so it is REWRITTEN rather than dropped -- dropping it would take
-- the ladder-key rule with it, and that is what keys every trivia question to
-- a destination.
alter table public.challenges drop constraint challenges_ladder_key_belongs_to_trivia;
alter table public.challenges add constraint challenges_ladder_key_belongs_to_trivia
  check (
    (kind = 'trivia' and ladder_key is not null
      and ladder_key = lower(ladder_key) and btrim(ladder_key) <> '')
    or (kind <> 'trivia' and ladder_key is null)
  );

-- ---- and the rest goes --------------------------------------------------
alter table public.challenges drop constraint challenges_scope_check;
alter table public.challenges drop constraint challenges_scope_key_check;
alter table public.challenges drop constraint challenges_scope_wpid_fkey;
drop index if exists public.challenges_scope_team_idx;
drop index if exists public.challenges_scope_city_idx;

alter table public.challenges drop column scope;
alter table public.challenges drop column scope_team;
alter table public.challenges drop column scope_city;
alter table public.challenges drop column scope_wpid;

-- ---- the resolver loses the clause it can no longer ask -----------------
-- A PLPGSQL-FREE `sql` BODY IS STILL RESOLVED AT RUNTIME, so leaving
-- `c.scope_wpid` in here would break every draw the moment something called
-- it. Rewritten whole, which is safe only because this function was written
-- today and its full text is in 2026090309.
create or replace function public.tgb_pick_challenge(p_stop_id bigint, p_used bigint[] default '{}')
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
    (select challenge_id from s where challenge_id is not null),
    (select c.id
       from public.challenges c, s, want,
            lateral (select coalesce((select array_agg(lower(x)) from unnest(c.tags) x), '{}')::text[] as t) ct
      where s.challenge_id is null
        -- NOT AGAIN IN THIS GAME. A game is one instance of one team playing,
        -- so the caller passes what THAT instance has already met -- only it
        -- knows. Nothing calls this yet.
        and not (c.id = any(coalesce(p_used, '{}')::bigint[]))
        and (cardinality(want.tags) = 0 or ct.t @> want.tags)
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
  v_rows int;
  v_id   bigint;
  v_wp   bigint;
  v_stop bigint;
  v_n    int;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'challenges'
                and column_name in ('scope', 'scope_team', 'scope_city', 'scope_wpid')) then
    raise exception 'a scope column survived';
  end if;

  select count(*) into v_rows from public.challenges_scope_retired;
  if v_rows < 1 then raise exception 'nothing was kept'; end if;

  -- THE LADDER RULE STILL BITES, which is what rewriting rather than dropping
  -- that constraint was for. Only a write says so.
  begin
    insert into public.challenges (name, prompt, answer, kind, ladder_key)
    values ('zzz probe', 'p', 'a', 'trivia', null);
    raise exception 'a trivia row with no ladder key was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.challenges (name, prompt, answer, kind, ladder_key)
    values ('zzz probe', 'p', 'a', 'question', 'chicago-il');
    raise exception 'a non-trivia row with a ladder key was accepted';
  exception when check_violation then null;
  end;

  -- and the draw still works, now that nothing is place-bound
  select wpid into v_wp from public.waypoints
   where wpid not in (select waypoint_id from public.stops where waypoint_id is not null) limit 1;
  insert into public.stops (waypoint_id, challenge_id) values (v_wp, null) returning stop_id into v_stop;
  update public.stops set challenge_tags = array['sports','chicago'] where stop_id = v_stop;
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id is null then
    raise exception 'the sports+chicago draw still finds nothing';
  end if;
  select count(*) into v_n from public.challenges
   where id = v_id
     and coalesce((select array_agg(lower(x)) from unnest(tags) x), '{}')::text[] @> array['sports','chicago'];
  if v_n <> 1 then raise exception 'the draw does not carry both tags'; end if;
  delete from public.stops where stop_id = v_stop;

  raise notice 'scope gone, % rows kept in challenges_scope_retired, ladder rule still refuses both ways, draw works', v_rows;
end $$;

commit;
