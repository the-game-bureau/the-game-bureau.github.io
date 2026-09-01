-- 2026083126  TGB TEAM NAMES BELONG TO AN AUDIENCE, NOT TO A GAME
-- ===========================================================================
-- `games.team01..team08` held suggested TGB team names -- what a group calls
-- itself when it plays. Measured before this was written: 374 of 395 games
-- carry them, and they resolve to only 48 DISTINCT AUDIENCES, about eight
-- games each, with names that are plainly audience-shaped: `Buffalo Road
-- Crew`, `Buffalo Loudhouse`, `Buffalo Clue Club`. That is audience data
-- sitting on games, repeated eight times over.
--
-- ONE FIELD, COMMA SEPARATED, as asked: `audiences.team_name_suggestions`.
--
-- WHAT IS EXCLUDED, AND WHY IT IS THE ONE INTERESTING EXCLUSION
-- ---------------------------------------------------------------------------
-- Slot 7 is not an audience name. It is `<host city> Bound` -- `Denver Bound`,
-- `Green Bay Bound`, `Inglewood Bound` -- and it is the ONLY name that differs
-- between the games of one audience. 111 of them. Merged in, Buffalo's list
-- would read "Denver Bound, Green Bay Bound, Houston Bound..." which is noise
-- in a list of names for Buffalo fans, and every one of them is DERIVABLE from
-- `games.city` anyway. They are left out and left on `games`.
--
-- WHAT IS NOT TOUCHED
-- ---------------------------------------------------------------------------
-- `games.team01..team08` IS LEFT IN PLACE. Dropping is the one irreversible
-- move, this is the first pass, and nothing reads the new column yet. The 11
-- games that carry names and have NO target audience -- Oswald, DealerTire,
-- Jazz Fest, the standalone New Orleans walks -- keep theirs there and are
-- deliberately not migrated: those games have no fandom by design.
--
-- APPLY BY HAND, then read the Verify block's numbers rather than the absence
-- of an error.

begin;

alter table public.audiences
  add column if not exists team_name_suggestions text;

comment on column public.audiences.team_name_suggestions is
  'Suggested TGB team names for this fandom, comma separated. Migrated from '
  'games.team01..team08 on 2026-08-31 as the UNION across every game whose '
  'target_audience_id is this row. Per-game "<host city> Bound" names are '
  'deliberately excluded: they belong to the game, not the fandom, and are '
  'derivable from games.city.';

-- THE UNION, IN SLOT ORDER. A name is kept once, case-insensitively, and the
-- order is the lowest slot it was ever written in -- so the authored sequence
-- (Road Crew, Takeover Squad, First String, ...) survives the merge rather
-- than being alphabetised into something nobody chose.
with named as (
  select g.target_audience_id as aid, s.ord, btrim(s.nm) as nm
    from public.games g
    cross join lateral (values
      (1, g.team01), (2, g.team02), (3, g.team03), (4, g.team04),
      (5, g.team05), (6, g.team06), (7, g.team07), (8, g.team08)
    ) as s(ord, nm)
   where g.target_audience_id is not null
     and coalesce(btrim(s.nm), '') <> ''
     -- THE PER-GAME NAME. Anchored to the END, so a name that merely contains
     -- the word survives.
     and btrim(s.nm) !~* ' Bound$'
),
ranked as (
  select aid, lower(nm) as key, min(ord) as ord, min(nm) as nm
    from named
   group by aid, lower(nm)
)
update public.audiences a
   set team_name_suggestions = j.list
  from (
    select aid, string_agg(nm, ', ' order by ord, nm) as list
      from ranked group by aid
  ) j
 where a.id = j.aid;

commit;

-- ===========================================================================
-- VERIFY. Run this and read the numbers.
--
--   select count(*) filter (where team_name_suggestions is not null) as audiences_with_names,
--          sum(array_length(string_to_array(team_name_suggestions, ', '), 1)) as names_total,
--          max(array_length(string_to_array(team_name_suggestions, ', '), 1)) as most_for_one
--     from public.audiences;
--
-- AND THE ONE THING TO LOOK AT AFTERWARDS. The international neutral-site
-- games carry the OTHER club's audience: `dal2026bal1` is "Dallas Fans
-- Takeover Rio de Janeiro" with target_audience_id = nfl-baltimore, because
-- 2026083027 backfilled the target from away_team_key and on a neutral-site
-- game that is the other club. So a handful of audiences have inherited a name
-- for a city that is not theirs. This names them rather than guessing:
--
--   select a.id, p.city, x.nm
--     from public.audiences a
--     join public.places p on p.id = a.home_place_id
--     cross join lateral unnest(string_to_array(a.team_name_suggestions, ', ')) as x(nm)
--    where a.team_name_suggestions is not null
--      and position(lower(p.city) in lower(x.nm)) = 0
--    order by a.id, x.nm;
--
-- A row there is either a hand-written name that simply does not say the city
-- (which is fine and is most of them) or a name that belongs to another
-- fandom. Only a reader can tell those apart, which is why nothing here tries.
