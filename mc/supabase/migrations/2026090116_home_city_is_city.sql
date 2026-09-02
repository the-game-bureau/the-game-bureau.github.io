-- `home_city` IS `city`. 2026-09-01.
--
-- The badge draws the REAL COLUMN NAME as each field's label -- deliberately,
-- because on a page whose whole job is editing this table the database's own
-- word is the useful one: it is what an SQL query, a migration and an error
-- message all say. So renaming the field and renaming the column are the same
-- act here, and doing only the first would have put a friendly label on a page
-- built to refuse them.
--
-- `home_` WAS THE OTHER HALF OF A PAIR THAT NO LONGER EXISTS. It read
-- `home_city` / `home_place_id` when the city WAS the place key and the prefix
-- told them apart. The city became plain text (a town we do not already hold
-- can be typed, the same trade `events.venue_city` and `waypoints.city` both
-- made), and `home_place_id` is now a derived key nobody reads and nothing
-- draws -- so the qualifier distinguishes this column from nothing.
--
-- NOTHING IN THE DATABASE READS IT, checked with `strpos` rather than `like`:
-- no function, no view, no constraint. **`like '%home_city%'` IS THE WRONG
-- TEST AND IT ANSWERED WRONG** -- `_` is a single-character wildcard, so it
-- matched the words "home city" inside a sentence in `tgb_pull_walking_tours`
-- and reported a dependency that is not one. A column name is a literal;
-- search for it with `strpos`.
--
-- `home_place_id` IS NOT RENAMED. It is the key, `place_id` is what it is, and
-- moving a second column in the same file would make a mistake in either
-- indistinguishable from a mistake in the other.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences rename column home_city to city;

comment on column public.audiences.city is
  'The town this audience is at home in, as plain text. It was `home_city` '
  'until 2026-09-01, when the `home_` qualifier stopped distinguishing it from '
  'anything: `home_place_id` beside it is a derived key nobody reads. A club '
  'with no city can never be anybody rival -- the anti-audience is reached '
  'through this row -- and the room reports that on every load.';

commit;

-- ---------------------------------------------------------------------------
-- Verify. The rename, then that nothing lost a value and nothing else moved.
-- ---------------------------------------------------------------------------
-- select
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences' and column_name='city') as renamed,
--   (select count(*) from information_schema.columns
--     where table_schema='public' and table_name='audiences' and column_name='home_city') as gone,
--   (select count(*) from public.audiences where city is not null) as with_a_city,
--   (select count(*) from public.audiences) as rows,
--   (select count(*) from public.teams) as teams,
--   (select count(*) from public.destinations) as destinations;
