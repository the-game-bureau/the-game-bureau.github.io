-- FAMILY PLUS KIND IS `type`, AND THE KEY IS FROZEN. 2026-09-01.
--
-- `audiences.type` replaces `family` and `kind`. Kind wins, so:
--
--     fandom  639        artist  1        interest  1
--
-- THE BLOCKER WAS THE KEY, AND FREEZING IT IS THE WHOLE ANSWER. `id` was a
-- GENERATED column, `family || '-' || name`, so removing family would have
-- recomputed all 641 ids -- and `type || '-' || name` COLLIDES 76 times:
-- `fandom-boston` would have to be the Bruins, Celtics, Red Sox, Patriots and
-- Boston College at once. The primary key refuses it.
--
-- `alter column id drop expression` converts a stored generated column into an
-- ordinary one AND KEEPS EVERY VALUE. So `nfl-chicago` stays `nfl-chicago`,
-- the three foreign keys pointing at it never move, and every trivia ladder
-- rung keeps resolving. The key is enough; no surrogate is needed.
--
-- AND THE FAMILY IS NOT LOST, IT IS RECOVERABLE FROM THE KEY. Measured before
-- this file was written: `split_part(id, '-', 1) = family` on 641 of 641, with
-- 0 mismatches. So everything that needed the family reads the key instead --
-- the view's league and sport, the ladder rungs, and the same-family rule that
-- decides a game's rival.
--
-- WHAT IT COSTS, AND IT IS REAL: the key stops maintaining itself. Renaming an
-- audience no longer changes its id. That is arguably the better behaviour --
-- three foreign keys point at it, and this project has recorded that a
-- generated key which moves under its references is a trap -- but it is a
-- change, and the room's rename warning is no longer true.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

-- ---------------------------------------------------------------------------
-- 1. Freeze the key. Values are kept exactly as they are.
-- ---------------------------------------------------------------------------
alter table public.audiences alter column id drop expression;

comment on column public.audiences.id is
  'The permanent key, e.g. nfl-chicago. It WAS generated from family + name and '
  'is now an ordinary column: family is gone, and regenerating from type would '
  'collide 76 ways. It no longer changes when a row is renamed, which is what '
  'three foreign keys pointing at it want. Its first segment is still the old '
  'family and several readers recover it that way.';

-- ---------------------------------------------------------------------------
-- 2. The new column.
-- ---------------------------------------------------------------------------
alter table public.audiences add column if not exists type text;

update public.audiences set type = kind where type is distinct from kind;

alter table public.audiences alter column type set not null;

alter table public.audiences drop constraint if exists audiences_type;
alter table public.audiences
  add constraint audiences_type
  check (type in ('fandom', 'artist', 'interest', 'historical'));

comment on column public.audiences.type is
  'What sort of audience this is: fandom, artist, interest, historical. It '
  'replaces family AND kind -- an audience is a fandom of anything, and a band''s '
  'or an interest''s is as real as a club''s. The league the old family held is '
  'the first segment of the id.';

-- ---------------------------------------------------------------------------
-- 3. Every reader moves off family and kind, in this same transaction.
-- ---------------------------------------------------------------------------
-- THE LEAGUE IS `split_part(id, '-', 1)` NOW. Verified 641 of 641 before this
-- file was written; it is the same string family held, recovered rather than
-- stored twice.
drop view if exists public.teams;
drop view if exists public.destinations;
drop view if exists public.game_possibilities;

create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(split_part(a.id, '-'::text, 1)) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.nickname AS mascot,
        CASE split_part(a.id, '-'::text, 1)
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    a.shell,
    a.stripe,
    a.mask,
        CASE split_part(a.id, '-'::text, 1)
            WHEN 'nfl'::text THEN 0
            WHEN 'mlb'::text THEN 1
            WHEN 'nba'::text THEN 2
            WHEN 'ncaaf'::text THEN 3
            WHEN 'nhl'::text THEN 4
            ELSE NULL::integer
        END AS league_sort,
    a.updated_at,
        CASE
            WHEN p.id IS NULL THEN NULL::text
            ELSE (p.city || ', '::text) || p.state
        END AS game_city,
    a.team_key,
    a.text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

-- DESTINATIONS: same rows, same id shape. The league half of that id was
-- `family` and is the key's first segment now, so the 140 ids do not move --
-- which matters, because every club-keyed trivia row references one.
create view public.destinations
  with (security_invoker = true)
as
 SELECT (((a.home_place_id || '-'::text) || lower(regexp_replace(split_part(a.id, '-'::text, 1), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text))) || '-'::text) || lower(regexp_replace(a.nickname, '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS id,
    p.city,
    p.state,
    upper(split_part(a.id, '-'::text, 1)) AS league,
    a.nickname,
    a.aliases
   FROM audiences a
     JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.nickname IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.destinations to postgres, anon, authenticated, service_role;

-- GAME_POSSIBILITIES: only its `kind` test on audiences moves. `t.kind` is the
-- TEMPLATE's own column and is untouched -- two different `kind`s in one view,
-- which is exactly the sort of thing a blind rename would have got wrong.
create view public.game_possibilities
  with (security_invoker = true)
as
 SELECT t.template_id,
    t.place_id,
    (pl.city || ', '::text) || pl.state AS place,
    t.kind,
    t.route_id IS NOT NULL AS walkable,
        CASE
            WHEN t.audience_id IS NOT NULL THEN 1
            ELSE ( SELECT count(*)::integer AS count
               FROM audiences a
              WHERE a.type = 'fandom'::text AND a.home_place_id IS DISTINCT FROM t.place_id)
        END AS audiences
   FROM game_templates t
     JOIN places pl ON pl.id = t.place_id
  WHERE t.active;

grant select, insert, update, delete, truncate, references, trigger
  on public.game_possibilities to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify. Read the numbers; do not trust the absence of an error.
-- ---------------------------------------------------------------------------
-- Expect: 641 rows, type filled on all of them, id still generated=NEVER and
-- still holding nfl-chicago, teams 639, destinations 140.
--
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from public.audiences where type is not null) as typed,
--   (select id from public.audiences where full_name = 'Chicago Bears') as bears_key,
--   (select is_generated from information_schema.columns
--     where table_schema='public' and table_name='audiences' and column_name='id') as id_generated,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations;
