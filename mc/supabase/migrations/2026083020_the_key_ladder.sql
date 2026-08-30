-- STEP FIVE: THE KEY LADDER.
--
-- **CONTENT IS NOT ATTACHED TO A GAME. A GAME ASKS FOR KEYS, BROADEST LAST.**
-- That one sentence is the whole generative model, and half of it was already
-- built without being named: trivia keys are already `wp-475`,
-- `new-orleans-la-nfl-saints` and `new-orleans-la`.
--
-- `tgb_content_keys(place, audience, waypoint)` returns the array. Standing at
-- waypoint 475 in New Orleans with Bears fans in town:
--
--   wp-475                       this exact spot
--   new-orleans-la-nfl-bears     your fandom, here
--   nfl-bears                    your fandom, anywhere it travels
--   new-orleans-la-nfl-saints    the enemy, here            <- ANTI-AUDIENCE
--   nfl-saints                   the enemy, anywhere        <- ANTI-AUDIENCE
--   new-orleans-la               this city, whoever is visiting
--   nfl                          the league
--   *                            portable
--
-- ── THE ANTI-AUDIENCE IS DERIVED, NEVER STORED ────────────────────────────
--
-- **Every game has an audience and an anti-audience**: your club, and the one
-- you are surrounded by. The second is simply THE AUDIENCE AT HOME IN THE PLACE
-- YOU ARE VISITING, which `audiences.home_place_id` already says. There is no
-- column for it and there must not be: two records of one fact drift.
--
-- It also settles an older argument. `trivia.type` held 'Know Your Enemy' and
-- 'Super Fan Check' and was dropped for being one fact seen from two sides.
-- **The side is WHICH RUNG the question came from**, which this function
-- returns, so it is derived at play time and can never disagree with the key.
--
-- ── WHY A LADDER BEATS A JOIN TABLE ───────────────────────────────────────
--
-- A join table supports the pairings somebody wrote down. **A ladder supports
-- pairings nobody has thought of**: write one question keyed `nfl` and it is
-- asked in thirty-two cities, by every fandom, forever.
--
-- ── THE ORDER IS NOT SYMMETRIC, DELIBERATELY ──────────────────────────────
--
-- Your own club outranks theirs, because a game is pitched at the travelling
-- fandom. And **a game with no anti-audience is ordinary** -- Oswald's New
-- Orleans has no enemy, a concert has none -- so those rungs are simply absent,
-- which is what lets one function serve all four kinds of game.
--
-- ── THE MASCOT FORM IS EMITTED TOO ────────────────────────────────────────
--
-- An audience id uses the NAME (`ncaaf-alabama`) and a destination id uses the
-- MASCOT (`tuscaloosa-al-ncaaf-crimson-tide`). For a pro club those coincide and
-- for a college one they do not, so **both forms go on the ladder** rather than
-- leaving a key somebody has already written unreachable.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083020_the_key_ladder.sql

begin;

-- The same slug the generated ids use. One definition, so a key computed here
-- and a key computed by a column cannot drift.
create or replace function public.tgb_slug(v text)
returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(v, ''), '[^a-zA-Z0-9]+', '-', 'g'));
$$;

create or replace function public.tgb_anti_audience(
  p_place text, p_audience text
) returns text
language sql stable as $$
  select a.id
    from public.audiences a
    join public.audiences me on me.id = p_audience
   where a.home_place_id = p_place
     and a.kind = 'fandom'
     and me.kind = 'fandom'
     and a.family = me.family
   order by a.id
   limit 1;
$$;

comment on function public.tgb_anti_audience(text, text) is
  'The club you are surrounded by: at home in this place, in the same family. '
  'Derived, never stored. NULL for a history walk or a concert, and null when '
  'no club of your sport is at home here, which is the correct answer rather '
  'than a gap: a guessed enemy reads as a bug.';

create or replace function public.tgb_content_keys(
  p_place    text,
  p_audience text default null,
  p_wpid     bigint default null
) returns text[]
language plpgsql stable as $$
declare
  keys text[] := '{}';
  aud  public.audiences%rowtype;
  anti public.audiences%rowtype;
begin
  -- THE STOP. Most specific there is: ask about the thing they are looking at.
  if p_wpid is not null then
    keys := keys || ('wp-' || p_wpid::text);
  end if;

  if p_audience is not null then
    select * into aud from public.audiences where id = p_audience;
  end if;

  -- THE ANTI-AUDIENCE: the club at home where the game is walked, **IN THE SAME
  -- FAMILY**. Both halves of that were learned by testing the cases that are not
  -- a fixture, and the first cut got both wrong:
  --
  --   OSWALD'S NEW ORLEANS came back with the Pelicans as its enemy. **A history
  --     walk is not up against anybody.** So a non-fandom audience gets no
  --     anti-audience at all.
  --   AN ALABAMA FAN IN NEW ORLEANS came back with the Pelicans too. **A college
  --     football fan is not up against a basketball team.** Matching the family
  --     means the answer here is correctly NOTHING: no SEC club is at home in
  --     New Orleans, so there is no enemy, and inventing one would put a
  --     question about a sport nobody came for in front of a paying team.
  --
  -- **A GUESSED ENEMY IS WORSE THAN NONE**, because it reads as a bug rather
  -- than as a gap. A place with two clubs in one family resolves to the lowest
  -- id, which is arbitrary but stable; when that starts to matter it wants a
  -- rivalry table, not a tie-break.
  if p_place is not null and aud.id is not null then
    select * into anti from public.audiences
     where id = public.tgb_anti_audience(p_place, aud.id);
  end if;

  -- YOUR FANDOM, HERE. Both forms: the audience id, and the mascot form, which
  -- differ for a college club and coincide for a pro one.
  if aud.id is not null and p_place is not null then
    keys := keys || (p_place || '-' || aud.id);
    if aud.nickname is not null then
      keys := keys || (p_place || '-' || aud.family || '-' || public.tgb_slug(aud.nickname));
    end if;
  end if;

  -- YOUR FANDOM, ANYWHERE IT TRAVELS.
  if aud.id is not null then
    keys := keys || aud.id;
  end if;

  -- THE ENEMY, HERE, then anywhere. Absent when nobody is at home here, which
  -- is the ordinary case for a concert or a history walk.
  if anti.id is not null and anti.id is distinct from aud.id then
    keys := keys || (p_place || '-' || anti.id);
    if anti.nickname is not null then
      keys := keys || (p_place || '-' || anti.family || '-' || public.tgb_slug(anti.nickname));
    end if;
    keys := keys || anti.id;
  end if;

  -- THE CITY, whoever is visiting.
  if p_place is not null then
    keys := keys || p_place;
  end if;

  -- THE FAMILY. One question keyed `nfl` is asked in thirty-two cities.
  if aud.family is not null then
    keys := keys || aud.family;
  end if;

  -- PORTABLE. **`'*'::text` AND NOT A BARE `'*'`**: an untyped literal appended
  -- to a text[] is read as an ARRAY literal, and Postgres answers
  -- `22P02 malformed array literal`. This project has already lost
  -- `tgb_fill_waypoint_gaps` to the same error for months. Every other append
  -- here is a typed column or a concatenation, which is why only this one bit.
  keys := keys || '*'::text;

  -- DEDUPED WITH THE ORDER KEPT, because the order IS the specificity and a
  -- home game makes the audience and the anti-audience the same club.
  return array(
    select k from unnest(keys) with ordinality as u(k, n)
     group by k order by min(n)
  );
end;
$$;

comment on function public.tgb_content_keys(text, text, bigint) is
  'The scope keys a game asks for, most specific first. Content is not attached '
  'to a game: a game asks for keys. The anti-audience rungs are derived from '
  'audiences.home_place_id and are never stored.';

-- ---------------------------------------------------------------------------
-- WHAT IT IS FOR: the trivia a game would actually ask, in ladder order.
--
-- **THE RUNG IS RETURNED WITH THE ROW**, which is the half that matters. It is
-- what tells the engine whether a question is about the team you follow or the
-- team you are visiting, so `Know Your Enemy` and `Super Fan Check` are computed
-- rather than typed and can never disagree with the key.
-- ---------------------------------------------------------------------------
create or replace function public.tgb_trivia_for(
  p_place    text,
  p_audience text default null,
  p_wpid     bigint default null,
  p_limit    int default 10
) returns table (
  trivia_id  bigint,
  id         text,
  question   text,
  answer     text,
  choices    text[],
  matched_on text,
  rung       int,
  side       text
)
language sql stable as $$
  with ladder as (
    select k, n from unnest(public.tgb_content_keys(p_place, p_audience, p_wpid))
      with ordinality as u(k, n)
  ),
  me as (select * from public.audiences where id = p_audience),
  anti as (select * from public.audiences
            where id = public.tgb_anti_audience(p_place, p_audience))
  -- COMPARED EXACTLY, never with a LIKE. `l.k like '%' || anti.id` was the first
  -- cut and it is wrong in both directions: it matches a longer key that merely
  -- ends the same way, and it misses the mascot form entirely.
  select t.trivia_id, t.id, t.question, t.answer, t.choices,
         l.k as matched_on, l.n::int as rung,
         case
           when l.k like 'wp-%' then 'place'
           when l.k in (select id from me)
             or l.k in (select p_place || '-' || id from me)
             or l.k in (select p_place || '-' || family || '-' || public.tgb_slug(nickname) from me)
             then 'yours'
           when l.k in (select id from anti)
             or l.k in (select p_place || '-' || id from anti)
             or l.k in (select p_place || '-' || family || '-' || public.tgb_slug(nickname) from anti)
             then 'theirs'
           when l.k = p_place then 'city'
           when l.k = '*' then 'portable'
           else 'family'
         end as side
    from public.trivia t
    join ladder l on l.k = t.id
   order by l.n, t.trivia_id
   limit greatest(p_limit, 0);
$$;

comment on function public.tgb_trivia_for(text, text, bigint, int) is
  'The trivia a game would ask, in ladder order, WITH THE RUNG IT MATCHED. The '
  'rung is what makes Know Your Enemy and Super Fan Check derived rather than '
  'typed: `yours` is about the club you follow, `theirs` about the one you are '
  'visiting.';

grant execute on function public.tgb_slug(text) to anon, authenticated;
grant execute on function public.tgb_anti_audience(text, text) to anon, authenticated;
grant execute on function public.tgb_content_keys(text, text, bigint) to anon, authenticated;
grant execute on function public.tgb_trivia_for(text, text, bigint, int) to anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by calls that make it do its job rather than by an empty reply.
--
--   -- a fixture: Bears fans in New Orleans, standing at waypoint 475
--   select public.tgb_content_keys('new-orleans-la', 'nfl-bears', 475);
--
--   -- a history walk: no audience, no enemy, so the ladder is three rungs
--   select public.tgb_content_keys('new-orleans-la', 'history-jfk');
--
--   -- a home game: the audience IS the anti-audience, so it dedupes
--   select public.tgb_content_keys('new-orleans-la', 'nfl-saints');
--
--   -- and what a game would actually ask:
--   select * from public.tgb_trivia_for('new-orleans-la', 'nfl-bears');
-- ---------------------------------------------------------------------------
