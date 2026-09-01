-- THE AUDIENCE'S CITY IS PLAIN TEXT. 2026-09-01.
--
-- `audiences.home_city`, backfilled from the place each club pointed at, in the
-- exact form the room already drew: `City, ST`. 260 of the 641 have one.
--
-- WHY: the City field was a lookup constrained to `public.places`, so a town we
-- did not already hold could not be typed at all. It is the same trade
-- `events.venue_city` made on 2026-08-28 and `waypoints.city` on 2026-08-29:
-- what is entered is what is stored.
--
-- WHAT IT COSTS, PLAINLY, and it is the same cost both of those paid: nothing
-- stops two spellings of one town, and no screen will tell you.
--
-- `home_place_id` IS KEPT, STILL POPULATED, AND THAT IS NOT HEDGING. Six things
-- read it, and one of them decides a game's enemy:
--
--     tgb_anti_audience       the RIVAL audience is the home place's own club
--     tgb_audience_label      the copy rule -- city, not mascot
--     tgb_pull_walking_tours  the major-league guard
--     destinations (view)     110 rows keyed through it
--     teams (view)            what both engines resolve a club through
--     game_possibilities      the generator
--
-- Dropping it would silently take the enemy off every generated game. So the
-- ROOM writes the text and RESOLVES it back to a place when the text names one,
-- leaving the id null when it does not. A city that is a real place keeps
-- everything working; a city that is not is visibly not linked, rather than
-- quietly wrong.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences add column if not exists home_city text;

comment on column public.audiences.home_city is
  'The club''s home city as plain text, in the form "City, ST". What is entered '
  'is what is stored -- nothing constrains it to public.places. `home_place_id` '
  'is the resolved key beside it and is what tgb_anti_audience, the teams and '
  'destinations views and the walking-tour guard all read; it is null when the '
  'text names no place we hold.';

-- THE BACKFILL IS THE LABEL THE ROOM ALREADY DREW, not a new spelling. Anything
-- else would make the text disagree with what people have been reading.
update public.audiences a
   set home_city = p.city || ', ' || p.state
  from public.places p
 where p.id = a.home_place_id
   and a.home_city is distinct from (p.city || ', ' || p.state);

commit;

-- ---------------------------------------------------------------------------
-- Verify. Read the numbers; do not trust the absence of an error.
-- ---------------------------------------------------------------------------
-- Expect: with_city 260, and 0 rows where the text and the key disagree.
--
-- select
--   (select count(*) from public.audiences where coalesce(home_city,'') <> '') as with_city,
--   (select count(*) from public.audiences where home_place_id is not null
--      and coalesce(home_city,'') = '') as key_without_text,
--   (select count(*) from public.audiences a join public.places p on p.id = a.home_place_id
--      where a.home_city is distinct from (p.city || ', ' || p.state)) as disagreeing;
