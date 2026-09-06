-- START IS ONE FIELD (2026-09-05)
--
-- Asked for outright: "record start date, time and timezone into one field in
-- games table called START". This supersedes 2026090501, which added
-- `start_time` and `timezone` beside `tgb_date` an hour earlier -- and those
-- two are dropped here rather than left, because a second home for a fact is
-- the drift this repo keeps removing. **BOTH WERE EMPTY** (0 of 394 rows
-- carried either), measured before the drop, so nothing is lost with them.
--
-- WHY jsonb AND NOT text OR timestamptz.
--   `timestamptz` CANNOT DO IT. It stores an INSTANT and normalises to UTC, so
--   the ZONE NAME does not survive -- and the whole point of carrying a zone is
--   that `start_time` is the clock OUTSIDE THE VENUE. `Europe/Paris` read back
--   as `+01:00` is wrong on the Sunday the clocks change, which is exactly the
--   fault `public.events` recorded on 2026-09-03.
--   `text` WOULD MEAN PARSING OUR OWN PROSE back out of `2026-11-15T13:30
--   America/Chicago` every time anybody wanted a part of it. This project has
--   been caught by parsing its own strings four times.
--   `jsonb` KEEPS THE THREE PARTS DISTINCT and needs no parser, which is what
--   `games.tags` already is and for the same reason.
--
-- THE SHAPE IS `{"date": "2026-11-15", "time": "13:30", "timezone":
-- "America/Chicago"}`, and a CHECK enforces exactly that: the three keys, no
-- others, each a string or absent. Without it the column is a place to put
-- anything, and the next reader has to guess which shape they are holding.
--
-- `start` IS AN UNRESERVED KEYWORD, checked with `pg_get_keywords()` rather
-- than assumed -- catcode `U` -- so it needs no quoting. That is NOT true of
-- `primary` two columns along, which is reserved and must be written
-- `g."primary"`; do not read one as licence for the other.
--
-- `tgb_date` IS KEPT AND ITS 352 VALUES ARE COPIED IN, not moved. It is read by
-- the room's own recovery guard and by anything outside this page that has not
-- caught up, and dropping a filled column in the same file that introduces its
-- replacement is how a bad afternoon starts. THE ROOM WRITES `start` ONLY; the
-- old column is left where it is and stops being maintained.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026090502_start_is_one_field.sql

begin;

alter table public.games drop column if exists start_time;
alter table public.games drop column if exists timezone;

alter table public.games add column if not exists start jsonb;

alter table public.games drop constraint if exists games_start_shape;
alter table public.games add constraint games_start_shape check (
  start is null
  or (
    jsonb_typeof(start) = 'object'
    and start - array['date', 'time', 'timezone'] = '{}'::jsonb
    and (not start ? 'date'     or jsonb_typeof(start -> 'date') = 'string')
    and (not start ? 'time'     or jsonb_typeof(start -> 'time') = 'string')
    and (not start ? 'timezone' or jsonb_typeof(start -> 'timezone') = 'string')
  )
);

comment on column public.games.start is
  'When a game starts, as one object: {"date","time","timezone"}. The time is '
  'the clock OUTSIDE THE VENUE and the timezone is an IANA name, never an '
  'offset -- an offset is wrong on the day the clocks change. jsonb rather '
  'than timestamptz because that type keeps an instant and loses the zone '
  'name, and rather than text because a string means parsing it back.';

-- THE 352 DATES ALREADY ON FILE COME ACROSS, so the new column is not empty on
-- a table that already knows when its games are. Only the date: there has never
-- been a time or a zone to carry.
update public.games
   set start = jsonb_build_object('date', to_char(tgb_date, 'YYYY-MM-DD'))
 where tgb_date is not null
   and start is null;

-- VERIFY. Not the absence of an error: writes that make the CHECK do its job,
-- then rolled back.
do $$
declare
  v_probe text := 'start-probe-' || floor(random() * 100000)::text;
  v_got   jsonb;
  v_bad   boolean;
begin
  insert into public.games (id, name, start)
  values (v_probe, 'start probe',
          '{"date":"2026-11-15","time":"13:30","timezone":"America/Chicago"}'::jsonb);

  select start into v_got from public.games where id = v_probe;
  if v_got -> 'timezone' is null then
    raise exception 'the object did not survive the write: %', v_got;
  end if;

  -- AND THE ZONE REALLY RESOLVES, which is the whole reason it is a name.
  perform (timestamp '2026-11-01 13:30') at time zone (v_got ->> 'timezone');

  -- A KEY THE SHAPE DOES NOT ALLOW IS REFUSED.
  begin
    v_bad := false;
    update public.games set start = start || '{"clock":"13:30"}'::jsonb
     where id = v_probe;
    v_bad := true;
  exception when check_violation then null;
  end;
  if v_bad then raise exception 'the shape check let a stray key through'; end if;

  -- AND SO IS A NUMBER WHERE A STRING BELONGS.
  begin
    v_bad := false;
    update public.games set start = '{"time":1330}'::jsonb where id = v_probe;
    v_bad := true;
  exception when check_violation then null;
  end;
  if v_bad then raise exception 'the shape check let a number through'; end if;

  raise notice 'start probe wrote and refused correctly: %', v_got;
  delete from public.games where id = v_probe;
end $$;

select count(*)                                         as games,
       count(*) filter (where start is not null)         as with_a_start,
       count(*) filter (where start ? 'date')            as with_a_date,
       count(*) filter (where start ? 'time')            as with_a_time,
       count(*) filter (where start ? 'timezone')        as with_a_zone,
       count(*) filter (where tgb_date is not null
                          and start is null)             as dates_left_behind
  from public.games;

commit;
