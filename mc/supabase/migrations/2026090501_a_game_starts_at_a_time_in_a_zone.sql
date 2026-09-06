-- A GAME STARTS AT A TIME, IN A ZONE (2026-09-05)
--
-- `games.tgb_date` has been the only thing on this table saying WHEN a game is
-- played. A date with no clock is a game whose start time nobody can say, and
-- a clock with no zone is the fault `public.events` already paid for: this
-- project's own rule is that `start_time` is the clock OUTSIDE THE VENUE, and
-- without a zone beside it that claim cannot be checked or converted.
--
-- THE SHAPE IS `public.events`'s OWN, deliberately. That table settled this on
-- 2026-09-03: `start_time time` plus `timezone text` holding an IANA NAME --
-- never an offset and never an abbreviation. `Europe/Paris` reads a kickoff
-- correctly on the Sunday the clocks go back where a stored `+02:00` is an
-- hour out, and `CST` means two different things depending on the hemisphere.
-- Two tables answering one question two ways is the drift this repo keeps
-- removing, so the names are the same and the rule is the same.
--
-- BOTH ARE NULLABLE AND NEITHER HAS A DEFAULT. A default would make every
-- unfilled row claim a clock it was never told, which is the shape of fault
-- this project keeps paying for: a value that looks answered and is invented.
-- `start_time` and `timezone` are true together or not at all.
--
-- NO CHECK ON THE ZONE, and that is a decision rather than an omission. The
-- room offers a list of the zones the catalogue actually uses, which is where
-- the guard is worth having; a CHECK here would mean a migration every time a
-- game is played somewhere new, and `pg_timezone_names` is 600-odd rows that
-- move with the tzdata the server happens to carry.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026090501_a_game_starts_at_a_time_in_a_zone.sql

begin;

alter table public.games add column if not exists start_time time;
alter table public.games add column if not exists timezone text;

comment on column public.games.start_time is
  'The clock OUTSIDE THE VENUE, not UTC. True only alongside timezone; a time '
  'with no zone cannot be converted or checked. Nullable: a game whose start '
  'has not been decided says nothing rather than claiming midnight.';

comment on column public.games.timezone is
  'An IANA name (America/Chicago), never an offset and never an abbreviation. '
  'An offset is wrong on the day the clocks change and CST means two different '
  'things depending on the hemisphere.';

-- VERIFY. Not the absence of an error: a write that makes the columns do their
-- job, then rolled back.
do $$
declare
  v_probe text := 'start-probe-' || floor(random() * 100000)::text;
  v_time  time;
  v_zone  text;
begin
  insert into public.games (id, name, start_time, timezone)
  values (v_probe, 'start probe', '13:30', 'America/Chicago');

  select start_time, timezone into v_time, v_zone
    from public.games where id = v_probe;

  if v_time is null or v_zone is null then
    raise exception 'the columns did not take a value: % / %', v_time, v_zone;
  end if;

  -- AND THE ZONE REALLY RESOLVES, which is the whole reason it is a name
  -- rather than an offset: this raises on a zone Postgres does not hold.
  perform (timestamp '2026-11-01 13:30') at time zone v_zone;

  raise notice 'start_time % in % on the probe row', v_time, v_zone;
  delete from public.games where id = v_probe;
end $$;

select count(*) filter (where start_time is not null) as with_a_time,
       count(*) filter (where timezone is not null)   as with_a_zone,
       count(*) filter (where start_time is not null and timezone is null)
         as a_clock_with_no_zone,
       count(*) as games
  from public.games;

commit;
