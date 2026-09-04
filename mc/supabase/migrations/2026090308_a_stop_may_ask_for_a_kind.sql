-- A STOP MAY NAME A CHALLENGE, OR ASK FOR A KIND.
-- 2026-09-03. Apply by hand: cd mc && supabase db query --linked --file <this>
--
-- `challenge_id` NULL has meant RANDOM since the table was rebuilt: whatever
-- fits at play time. That is one answer where there are three, and the two it
-- was missing are the ones actually wanted:
--
--     challenge_id set                      -> this exact challenge
--     null, random_kind null                -> any challenge
--     null, random_kind 'trivia'            -> a trivia question, picked then
--     null, 'trivia' + random_word 'Saints' -> one whose PROMPT says Saints
--
-- THE WORD IS MATCHED AGAINST THE PROMPT AND NOTHING ELSE, because that is what
-- "the question must have that word in it" means. Matching the ANSWER would
-- select on the thing the team is supposed to work out, and matching the name
-- would select on an admin label no player ever sees.
--
-- WHOLE WORDS, so `Saints` does not match `Saintsville`. `[[:<:]]` and `[[:>:]]`
-- are POSIX word boundaries and need NO BACKSLASH -- this repo has lost
-- nineteen things to an escape eaten between a heredoc and a file, and
-- `[[:space:]]` is already in `trivia_free_answer_is_one_word` for the same
-- reason.
--
-- `random_kind` CARRIES A CHECK, AND IT IS A SECOND COPY OF A LIST. It has to
-- agree with `challenges_kind_check`, and the verify block below asserts they
-- do at apply time -- **but nothing will catch a SEVENTH kind added to
-- challenges later.** The alternative was no CHECK at all, which lets a typo
-- store a kind that matches nothing and leaves a team standing in the street
-- with no challenge. A stop that resolves to nothing is the worse failure, so
-- the second list is the accepted cost. **Add a kind to both.**

begin;

alter table public.stops add column random_kind text;
alter table public.stops add column random_word text;

comment on column public.stops.random_kind is
  'With challenge_id null: pick a challenge of this kind at play time. Null '
  'means any kind. Must agree with challenges_kind_check.';
comment on column public.stops.random_word is
  'With challenge_id null: the picked challenge''s PROMPT must contain this '
  'word, matched whole and case-insensitively.';

-- A FIXED CHALLENGE CARRIES NO SPECIFICATION. Both at once is the one state no
-- reader could interpret -- it names a challenge and describes a different one.
alter table public.stops add constraint stops_fixed_or_random
  check (challenge_id is null or (random_kind is null and random_word is null));

alter table public.stops add constraint stops_random_kind_known
  check (random_kind is null or random_kind in
         ('question', 'minigame', 'photo', 'freeform', 'consent', 'trivia'));

alter table public.stops add constraint stops_random_word_not_blank
  check (random_word is null or btrim(random_word) <> '');

-- ---- THE PICK IS DEFINED ONCE ------------------------------------------
-- Whatever plays a stop reads this rather than reimplementing the rule. It is
-- called by NOTHING today, which is said plainly rather than left to be
-- discovered: both engines read `public.games` with `select=*` at play time and
-- neither has been taught to run a generated stop.
create or replace function public.tgb_pick_challenge(p_stop_id bigint)
returns bigint
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  with s as (
    select stop_id, waypoint_id, challenge_id, random_kind, random_word
      from public.stops where stop_id = p_stop_id
  )
  select coalesce(
    (select challenge_id from s where challenge_id is not null),
    (select c.id
       from public.challenges c, s
      where s.challenge_id is null
        -- the kind, if one was asked for
        and (s.random_kind is null or c.kind = s.random_kind)
        -- THE WAIVER IS NEVER PICKED BY ACCIDENT. It gates the route and cannot
        -- be skipped, so an unspecified pick must not return it; asking for
        -- `consent` by name still does.
        and (s.random_kind is not null or c.kind <> 'consent')
        -- the word, matched whole against the PROMPT
        and (s.random_word is null
             or c.prompt ~* ('[[:<:]]' || s.random_word || '[[:>:]]'))
        -- A PLACE-BOUND CHALLENGE BELONGS AT ITS OWN WAYPOINT. Picking one for
        -- a different stop asks "whose house is this?" outside a stadium.
        and (c.scope_wpid is null or c.scope_wpid = s.waypoint_id)
      order by random()
      limit 1)
  );
$$;

comment on function public.tgb_pick_challenge(bigint) is
  'The challenge a stop resolves to: its own if it names one, otherwise a '
  'random one matching its kind and word. Returns null when nothing matches, '
  'which is honest -- a silent fallback to any challenge would ignore the '
  'word that was asked for. Called by nothing yet.';

grant execute on function public.tgb_pick_challenge(bigint) to anon, authenticated;

-- ---- VERIFY ------------------------------------------------------------
do $$
declare
  v_kinds text;
  v_mine  text;
  v_id    bigint;
  v_wp    bigint;
  v_stop  bigint;
  v_n     int;
begin
  -- THE TWO LISTS AGREE TODAY, asserted rather than assumed.
  select string_agg(k, ',' order by k) into v_kinds
    from (select distinct kind as k from public.challenges) x;
  select string_agg(k, ',' order by k) into v_mine
    from (select unnest(array['question','minigame','photo','freeform','consent','trivia']) as k) y;
  if position(v_kinds in v_mine) = 0 then
    raise exception 'challenges hold a kind stops_random_kind_known refuses: % vs %', v_kinds, v_mine;
  end if;

  -- A stop to work with, made and removed here.
  select wpid into v_wp from public.waypoints
   where wpid not in (select waypoint_id from public.stops where waypoint_id is not null)
   limit 1;
  insert into public.stops (waypoint_id, challenge_id) values (v_wp, null)
  returning stop_id into v_stop;

  -- 1. any kind: never the waiver
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id is null then raise exception 'an unspecified pick found nothing'; end if;
  if (select kind from public.challenges where id = v_id) = 'consent' then
    raise exception 'an unspecified pick returned the waiver';
  end if;

  -- 2. a kind
  update public.stops set random_kind = 'trivia' where stop_id = v_stop;
  select public.tgb_pick_challenge(v_stop) into v_id;
  if (select kind from public.challenges where id = v_id) <> 'trivia' then
    raise exception 'asking for trivia returned a %',
      (select kind from public.challenges where id = v_id);
  end if;

  -- 3. a kind and a word, ten times, every one matching
  update public.stops set random_word = 'Saints' where stop_id = v_stop;
  for v_n in 1..10 loop
    select public.tgb_pick_challenge(v_stop) into v_id;
    if v_id is null then raise exception 'the word found nothing on pass %', v_n; end if;
    if (select count(*) from public.challenges
         where id = v_id and kind = 'trivia'
           and prompt ~* '[[:<:]]Saints[[:>:]]') <> 1 then
      raise exception 'pick % does not match kind AND word', v_id;
    end if;
  end loop;

  -- 4. a word nothing carries returns NULL rather than falling back
  update public.stops set random_word = 'zzzznotaword' where stop_id = v_stop;
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id is not null then
    raise exception 'a word matching nothing fell back to % instead of null', v_id;
  end if;

  -- 5. a named challenge wins over any specification
  update public.stops set random_kind = null, random_word = null,
         challenge_id = (select id from public.challenges where kind = 'photo' limit 1)
   where stop_id = v_stop;
  select public.tgb_pick_challenge(v_stop) into v_id;
  if v_id <> (select challenge_id from public.stops where stop_id = v_stop) then
    raise exception 'a named challenge was not returned';
  end if;

  delete from public.stops where stop_id = v_stop;
  raise notice 'tgb_pick_challenge: any-kind avoids consent, kind honoured, word honoured 10/10, no match returns null, named wins';
end $$;

commit;
