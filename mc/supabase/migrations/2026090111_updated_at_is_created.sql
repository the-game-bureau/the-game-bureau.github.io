-- `updated_at` IS `created`, AND IT IS SET WHEN A ROW IS ADDED. 2026-09-01.
--
-- IT WAS NEVER AN UPDATE STAMP. There is no trigger on `audiences` -- checked
-- against the catalogue, not assumed -- and the column had NO DEFAULT and was
-- nullable, so nothing has written it since the club rows were merged in. It
-- holds June and July 2026: the dates the old `teams` rows carried, untouched.
--
-- WHICH IS WHY 639 OF 641 SHOWED AN `updated_at` EARLIER THAN THEIR
-- `created_at`. Drawn as Added and Changed that reads as a fault; it was the
-- labels describing something the column had stopped being.
--
-- SO IT BECOMES WHAT IT ACTUALLY HOLDS: when the audience was first filed.
-- `default now()` and no trigger, so a new row stamps itself on insert and
-- nothing moves it afterwards.
--
-- EXISTING VALUES ARE KEPT. They are the real dates those clubs were first
-- recorded, which is better information than the day they were migrated.
--
-- **`created_at` NOW DUPLICATES IT, and this file does NOT resolve that.**
-- `created_at` holds 2026-08-30 to 2026-09-01 -- the day each row entered THIS
-- table -- and `created` holds when the club was first recorded anywhere. Two
-- columns, both true, both called created. Which one to keep is an editorial
-- call and it is left open deliberately rather than guessed at.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences rename column updated_at to created;
alter table public.audiences alter column created set default now();

-- BACKFILLED ONLY WHERE IT IS NULL, so no real date is overwritten.
update public.audiences set created = created_at where created is null;

comment on column public.audiences.created is
  'When this audience was first filed. Set on insert and never moved -- there is '
  'no trigger and nothing updates it. It was called `updated_at` and had not '
  'been written since the club rows were merged in on 2026-08-30, which is why '
  'it reads EARLIER than created_at on 639 rows: these are the dates the old '
  'teams table carried.';

-- THE VIEW FOLLOWS IN THE SAME TRANSACTION, and keeps its OUTPUT name: nothing
-- reads `teams.updated_at` today, but renaming a view column is a separate
-- decision from renaming a stored one, and doing both at once would make a
-- mistake in either indistinguishable from the other.
drop view if exists public.teams;

create view public.teams
  with (security_invoker = true)
as
 SELECT a.id AS audience_id,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    split_part(a.team_key, ':'::text, 2) AS code,
    a.full_name,
    a.nickname AS mascot,
        CASE lower(split_part(a.team_key, ':'::text, 1))
            WHEN 'nfl'::text THEN 'football'::text
            WHEN 'ncaaf'::text THEN 'football'::text
            WHEN 'nba'::text THEN 'basketball'::text
            WHEN 'mlb'::text THEN 'baseball'::text
            WHEN 'nhl'::text THEN 'hockey'::text
            ELSE NULL::text
        END AS sport,
    a.primary_color AS shell,
    a.secondary_color AS stripe,
    a.tertiary_color AS mask,
        CASE lower(split_part(a.team_key, ':'::text, 1))
            WHEN 'nfl'::text THEN 0
            WHEN 'mlb'::text THEN 1
            WHEN 'nba'::text THEN 2
            WHEN 'ncaaf'::text THEN 3
            WHEN 'nhl'::text THEN 4
            ELSE NULL::integer
        END AS league_sort,
    a.created AS updated_at,
        CASE
            WHEN p.id IS NULL THEN NULL::text
            ELSE (p.city || ', '::text) || p.state
        END AS game_city,
    a.team_key,
    a.text AS text_color
   FROM audiences a
     LEFT JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.teams to postgres, anon, authenticated, service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verify. Prove the default by INSERTING, not by reading the catalogue: a
-- default that is declared and a default that fires are two different claims.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.columns where table_schema='public'
--     and table_name='audiences' and column_name='created') as renamed,
--   (select count(*) from public.audiences where created is null) as unstamped,
--   (select count(*) from public.teams) as teams;
--
-- begin;
--   insert into public.audiences (id, name, type, full_name)
--        values ('probe-zzz', 'Probe', 'interest', 'Probe Zzz');
--   select id, created::date = current_date as stamped_today from public.audiences where id='probe-zzz';
-- rollback;
