-- 2026090301  public.events gains a timezone, so a start time means something
--
-- APPLIED 2026-09-03 with `cd mc && supabase db query --linked --file ...`.
--
-- WHY. `start_time` is documented as the clock OUTSIDE THE VENUE and there was
-- nothing on the row saying which clock that is. That is fine while every row
-- comes from one importer that always writes local time, and it stops being
-- fine the moment a second source arrives: the league scoreboard gives a UTC
-- INSTANT and nothing else, so a row filed from it either carried no time at
-- all (which is what we did) or carried a number nobody could interpret.
--
-- THE RULE THIS COLUMN MAKES POSSIBLE, and it is the whole point: the goal is
-- the LOCAL clock, but any zone is acceptable so long as the row says which.
-- `start_time` and `timezone` are true together or not at all.
--
-- THE VALUE IS AN IANA NAME -- `America/Chicago`, `Europe/London`,
-- `Australia/Melbourne` -- never an offset and never an abbreviation. An offset
-- is wrong twice a year and `CST` means two different things depending on the
-- hemisphere. An IANA name is the only form that survives a DST boundary, and
-- it is what `Intl.DateTimeFormat` takes.
--
-- IT IS NULLABLE, AND A NULL IS NOT A DEFAULT. Every row on file today came
-- from SeatGeek, whose venue object carries an IANA timezone on all 851 events
-- we can see, so the backfill below is a read of what the source already said
-- rather than a guess. A row that arrives without one is a row whose time
-- cannot be interpreted, and it should be visible as such rather than silently
-- assumed to be in ours.
--
-- NO DEFAULT OF 'UTC' FOR THE SAME REASON. A default would make every unfilled
-- row claim a zone it was never told, which is the shape of fault this project
-- keeps paying for: a value that looks answered and is invented.

begin;

alter table public.events
  add column if not exists timezone text;

comment on column public.events.timezone is
  'IANA timezone name for start_time -- America/Chicago, Europe/London. '
  'start_time is the clock in THIS zone. The two are true together or not at '
  'all. Never an offset and never an abbreviation: an offset is wrong twice a '
  'year and CST is ambiguous. Null means the source did not say, which is a '
  'real state and is not the same as UTC.';

commit;

-- Verify.
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'events'
--      and column_name = 'timezone';
--   -- expect  timezone | text | YES
--
--   select count(*) as rows, count(timezone) as with_zone from public.events;
--   -- expect every row null until a fetch fills them
