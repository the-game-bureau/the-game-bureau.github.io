-- `aliases` IS `audience_aliases`. 2026-09-01.
--
-- The column is the words a FAN would type that are not the audience's name --
-- `bama`, `roll tide`, `the six`, and now `bills mafia`. `aliases` alone said
-- nothing about whose, on a table that also holds places, keys and team names.
--
-- MATCHED, NEVER PRINTED. That is the standing rule and it is unchanged: a
-- mascot or a fan nickname is somebody else's mark, so it reaches a matcher and
-- never a reader. Typing what a fan types must find the game; printing it is
-- using it as a name.
--
-- ONE READER TO MOVE. `destinations` selects it and nothing else does -- checked
-- against the catalogue rather than assumed.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences rename column aliases to audience_aliases;

comment on column public.audiences.audience_aliases is
  'What a fan calls this fandom, lowercased: bama, roll tide, bills mafia. '
  'MATCHED, NEVER PRINTED -- these are other people''s marks, and matching on a '
  'word is not using it as a name. Five clubs are known by a region rather than '
  'a city and are unreachable without one.';

-- THE VIEW FOLLOWS IN THE SAME TRANSACTION, or `destinations` selects a column
-- that no longer exists and every read of it fails.
drop view if exists public.destinations;

create view public.destinations
  with (security_invoker = true)
as
 SELECT (((a.home_place_id || '-'::text) || lower(split_part(a.team_key, ':'::text, 1))) || '-'::text)
          || lower(regexp_replace(a.nickname, '[^a-zA-Z0-9]+'::text, '-'::text, 'g')) AS id,
    p.city,
    p.state,
    upper(split_part(a.team_key, ':'::text, 1)) AS league,
    a.nickname,
    a.audience_aliases AS aliases,
    a.audience_aliases
   FROM audiences a
     JOIN places p ON p.id = a.home_place_id
  WHERE a.type = 'fandom'::text AND a.nickname IS NOT NULL AND a.team_key IS NOT NULL;

grant select, insert, update, delete, truncate, references, trigger
  on public.destinations to postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bills Mafia.
-- ---------------------------------------------------------------------------
-- STORED LOWERCASE, which is what the room does on the way in and what a
-- matcher wants: a value nothing renders has no business carrying capitals.
-- APPENDED, NEVER ASSIGNED -- Buffalo may already carry an alias, and replacing
-- the array would throw it away.
update public.audiences
   set audience_aliases = (
     select array_agg(distinct x order by x)
       from unnest(coalesce(audience_aliases, '{}'::text[]) || array['bills mafia']) x)
 where id = 'nfl-buffalo'
   and not (coalesce(audience_aliases, '{}'::text[]) @> array['bills mafia']);

commit;

-- ---------------------------------------------------------------------------
-- Verify.
-- ---------------------------------------------------------------------------
-- select id, full_name, audience_aliases from public.audiences where id = 'nfl-buffalo';
-- select count(*) from public.destinations;
