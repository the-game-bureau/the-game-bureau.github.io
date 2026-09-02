-- `full_name` SPLITS INTO `first` AND `last`. 2026-09-01.
--
--   Air Force Falcons     ->  first: Air Force     last: Falcons
--   Boston Red Sox        ->  first: Boston        last: Red Sox
--   Alabama A&M Bulldogs  ->  first: Alabama A&M   last: Bulldogs
--
-- `full_name` IS KEPT AND IS STILL THE NAME. It is what the key is generated
-- from, what every label prints, and what the badge draws; these two are the
-- halves of it, stored so nothing has to work them out again. **The display
-- does not change** -- the badge already broke the heading at this boundary and
-- now reads the boundary off the row instead of recomputing it.
--
-- ---------------------------------------------------------------------------
-- THE SPLIT IS `nickname`, AND IT RESOLVES 636 OF 641 WITH NO GUESSING.
-- ---------------------------------------------------------------------------
-- Measured before any of this was written, by word count:
--
--     words   rows   resolved by nickname
--       1        1        0
--       2      273      269
--       3      284      284      <- every one
--       4       71       71
--       5       10       10
--       6        2        2
--
-- **A THREE-WORD NAME IS THE AMBIGUOUS SHAPE and the nickname settles all 284
-- of them**: 227 take the last word (`Air Force` / `Falcons`) and 57 take the
-- last two (`Boston` / `Red Sox`). Neither a first-word rule nor a last-word
-- rule can produce both, which is why this is not a word count.
--
-- IT IS ALSO THE RULE `tgb_audience_label` ALREADY USES to derive the label a
-- game prints -- the whole name less the mascot at the end of it -- so the
-- halves and the copy cannot disagree about where one stops and the other
-- starts.
--
-- ---------------------------------------------------------------------------
-- THE FIVE THE NICKNAME COULD NOT SPLIT WERE DECIDED ONE BY ONE.
-- ---------------------------------------------------------------------------
-- Three of them carry a `nickname` that DUPLICATES the whole name, which is bad
-- data rather than a two-word mascot; two are not clubs at all.
--
--   Athletics          MLB:ATH     first NULL, last Athletics
--                      The name is entirely the mascot -- the A's carry no
--                      place in their name -- so it goes where every other
--                      club's mascot goes rather than into `first`.
--   Eastern Oregon     NCAAF:EORE  first Eastern Oregon, last Mountaineers
--                      The real mascot, WRITTEN rather than derived. Splitting
--                      at the space would have cut the school's own name in
--                      half and called Oregon a mascot.
--   Taylor Swift       artist      first Taylor, last Swift
--                      The one row that is a literal first and last name.
--   JFK Assassination  interest    first JFK, last Assassination
--   Bethany (Ks)       NCAAF:BETHA **DELETED** -- see below.
--
-- ---------------------------------------------------------------------------
-- `first` AND `last` ARE UNRESERVED IN POSTGRES, checked rather than assumed.
-- ---------------------------------------------------------------------------
-- `pg_get_keywords()` reports both as `unreserved`, so neither needs quoting in
-- hand-written SQL. **That is NOT true of `primary` beside them**, which is
-- reserved and must be written `a."primary"` -- so do not read this file as
-- licence to skip the quotes on that one.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences add column first text;
alter table public.audiences add column last  text;

comment on column public.audiences.first is
  'The place or school half of full_name: everything before the mascot. '
  'Derived from `nickname` as a suffix of `full_name`, which resolved 636 of '
  '641 rows; the rest were decided by hand in 2026090117. NULL where the whole '
  'name is the mascot -- the Athletics carry no place in their name.';
comment on column public.audiences.last is
  'The mascot half of full_name. `full_name` is still the name and is what the '
  'key is generated from; these two are its halves, stored so nothing has to '
  'work them out again.';

-- ---------------------------------------------------------------------------
-- 1. The 636 the nickname resolves.
-- ---------------------------------------------------------------------------
-- `like '% ' || nickname` REQUIRES A SPACE BEFORE IT, so a row whose nickname
-- IS its whole name does not match and is left for section 2. Without the
-- space, `Athletics` would split into an empty first and itself, which is the
-- right answer for that one row and the wrong one for the two beside it.
update public.audiences a
   set first = btrim(left(a.full_name, length(a.full_name) - length(btrim(a.nickname)))),
       last  = right(a.full_name, length(btrim(a.nickname)))
 where a.nickname is not null
   and btrim(a.nickname) <> ''
   and lower(a.full_name) like '% ' || lower(btrim(a.nickname));

-- ---------------------------------------------------------------------------
-- 2. The four decided by hand.
-- ---------------------------------------------------------------------------
update public.audiences set first = null,             last = 'Athletics'    where id = 'athletics';
update public.audiences set first = 'Eastern Oregon', last = 'Mountaineers' where id = 'eastern-oregon';
update public.audiences set first = 'Taylor',         last = 'Swift'        where id = 'taylor-swift';
update public.audiences set first = 'JFK',            last = 'Assassination' where id = 'jfk-assassination';

-- ---------------------------------------------------------------------------
-- 3. `Bethany (Ks)` is deleted.
-- ---------------------------------------------------------------------------
-- **NOTHING POINTED AT IT, checked rather than assumed**: 0 games, 0 game
-- templates, 0 destinations, 0 trivia keys. The three incoming foreign keys
-- would have done something either way -- `game_templates` CASCADES and both
-- `games` columns SET NULL -- so knowing the count is what makes the delete a
-- decision rather than a hope.
--
-- IT IS THE ONE ROW IN THIS FILE THAT IS NOT RECOVERABLE, so its values are
-- written out here rather than only in a diff:
--   id `bethany-ks`, full_name `Bethany (Ks)`, nickname `Bethany (Ks)`,
--   type `fandom`, team_key `NCAAF:BETHA`, no city, no description,
--   no aliases, no colours.
delete from public.audiences where id = 'bethany-ks';

-- ---------------------------------------------------------------------------
-- 4. Nothing may be left unsplit.
-- ---------------------------------------------------------------------------
-- A row with neither half is a name nobody decided, and it would be invisible:
-- the badge still draws `full_name`, so an unsplit row looks exactly like a
-- split one. The count is the only thing that would ever say so.
do $$
declare n int;
begin
  select count(*) into n from public.audiences
   where coalesce(first, '') = '' and coalesce(last, '') = '';
  if n > 0 then raise exception '% audiences have neither a first nor a last', n; end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verify. The counts, then the shapes that decided the rule -- a three-word
-- name of each kind, and each of the four decided by hand.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from public.audiences where last is not null) as with_a_last,
--   (select count(*) from public.audiences where first is null) as no_first,
--   (select count(*) from public.audiences
--     where coalesce(first,'') = '' and coalesce(last,'') = '') as unsplit,
--   (select count(*) from public.audiences where btrim(coalesce(first,'') || ' ' ||
--      coalesce(last,'')) <> full_name) as disagrees_with_full_name,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations;
--
-- select full_name, first, last from public.audiences
--  where full_name in ('Air Force Falcons', 'Boston Red Sox', 'Alabama A&M Bulldogs',
--                      'Tulane Green Wave', 'Athletics', 'Eastern Oregon',
--                      'Taylor Swift', 'JFK Assassination')
--  order by full_name;
