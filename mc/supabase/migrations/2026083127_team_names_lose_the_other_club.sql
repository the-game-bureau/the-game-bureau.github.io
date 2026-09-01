-- 2026083127  A FANDOM'S NAME LIST MAY NOT HOLD ANOTHER FANDOM'S NAMES
-- ===========================================================================
-- 2026083126 merged `games.team01..team08` onto the audience each game is
-- pitched at. It inherited a fault from the source rows: the INTERNATIONAL,
-- NEUTRAL-SITE games carry the OTHER club's audience.
--
--   det2026nwe   "Detroit Fans Takeover ..."   target_audience_id = nfl-boston
--   dal2026bal1  "Dallas Fans Takeover Rio"    target_audience_id = nfl-baltimore
--
-- WHY: 2026083027 backfilled the target from `away_team_key`, and on a neutral
-- site game that key is the OTHER club rather than the travelling one. So the
-- names are right and the target is wrong -- which is the opposite of what the
-- id shape suggests, and would have been diagnosed backwards.
--
-- THE RESULT ON THE NEW COLUMN: `nfl-boston` holds seven correct
-- `New England ...` names AND seven `Detroit ...` ones. 52 names across 8
-- audiences.
--
-- WHAT THIS REMOVES, AND WHAT IT WILL NOT TOUCH
-- ---------------------------------------------------------------------------
-- ONLY A FORMULAIC NAME WHOSE LEADING CITY IS SOME OTHER AUDIENCE'S HOME CITY.
-- Three conditions, all required, because each one alone is too blunt:
--
--   1. it ends in one of the seven authored suffixes -- so no HAND-WRITTEN name
--      is ever considered. "Dome Patrol", "Gleason Groupies", "Breesus Take the
--      Wheel" and the other 118 are untouchable by construction, and they are
--      the best names in the table.
--   2. it does NOT name this audience's own city -- so `New England Road Crew`
--      under Boston survives, which is the case that makes a bare city test
--      wrong: five clubs are known by a region rather than a city, and this
--      file's own alias rule says so.
--   3. its FIRST characters are another audience's city -- so a name merely
--      mentioning a place somewhere in the middle is left alone.
--
-- IT DOES NOT TOUCH `games`, and it does not repoint the mis-targeted games.
-- Which of `target_audience_id` and `away_team_key` is wrong on a neutral-site
-- row is an editorial call on the paid product, and it is not this file's.
--
-- APPLY BY HAND, and read the Verify block rather than the absence of an error.

begin;

with cities as (
  select distinct p.city
    from public.places p
    join public.audiences a on a.home_place_id = p.id
   where coalesce(btrim(p.city), '') <> ''
),
kept as (
  select a.id as aid, n.ord, n.nm
    from public.audiences a
    join public.places p on p.id = a.home_place_id
    cross join lateral unnest(string_to_array(a.team_name_suggestions, ', '))
      with ordinality as n(nm, ord)
   where a.team_name_suggestions is not null
     and not (
           n.nm ~* '(Road Crew|Road Krewe|Takeover Squad|First String|Night Shift|Final Drive|Loudhouse|Clue Club)$'
       and position(lower(p.city) in lower(n.nm)) = 0
       and exists (
             select 1 from cities c
              where c.city <> p.city
                and position(lower(c.city) in lower(n.nm)) = 1
           )
     )
)
update public.audiences a
   set team_name_suggestions = j.list
  from (select aid, string_agg(nm, ', ' order by ord) as list from kept group by aid) j
 where a.id = j.aid
   and a.team_name_suggestions is distinct from j.list;

commit;

-- ===========================================================================
-- VERIFY. Expect 0 for the first, and Boston to read New England only.
--
--   with cities as (select distinct p.city from public.places p
--                     join public.audiences a on a.home_place_id = p.id)
--   select count(*) as foreign_city_names_left
--     from public.audiences a
--     join public.places p on p.id = a.home_place_id
--     cross join lateral unnest(string_to_array(a.team_name_suggestions, ', ')) as n(nm)
--    where a.team_name_suggestions is not null
--      and n.nm ~* '(Road Crew|Road Krewe|Takeover Squad|First String|Night Shift|Final Drive|Loudhouse|Clue Club)$'
--      and position(lower(p.city) in lower(n.nm)) = 0
--      and exists (select 1 from cities c where c.city <> p.city
--                    and position(lower(c.city) in lower(n.nm)) = 1);
--
--   select id, team_name_suggestions from public.audiences
--    where id in ('nfl-boston', 'nfl-new-orleans') order by id;
--
-- AND THE HAND-WRITTEN NAMES MUST BE UNCHANGED -- 118 of them across the
-- catalogue, which is the count this file may never reduce:
--
--   select count(*) from public.audiences a
--     cross join lateral unnest(string_to_array(a.team_name_suggestions, ', ')) as n(nm)
--    where n.nm !~* '(Road Crew|Road Krewe|Takeover Squad|First String|Night Shift|Final Drive|Loudhouse|Clue Club)$';
