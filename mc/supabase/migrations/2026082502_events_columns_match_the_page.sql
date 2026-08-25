-- public.events: the column names become the names on the page, and the one
-- packed column is split.
--
-- The room at /mc/events/ labels every field, and eleven of those labels
-- disagreed with the column behind them. A reader had to hold two vocabularies
-- at once: `Away team geo` on screen, `away_locale` in the table, `Start date`
-- on screen, `event_date` in the table. **A name that has to be translated is a
-- name that gets it wrong eventually**, and the ones here were not arbitrary
-- shorthand, they were a DIFFERENT WORD for the same thing.
--
-- After this the page, the table, the AI prompts and the routine all say the
-- same word.
--
-- ── THE RENAMES ──────────────────────────────────────────────────────────────
--
--   event_date   -> start_date            "Start date", and it pairs with
--                                          end_date, which it did not before
--   venue_name   -> venue                 "Venue"
--   city         -> venue_city            "Venue city". THE VENUE's city, which
--                                          is not always a club's home market:
--                                          the Chargers play in Inglewood, the
--                                          Giants in East Rutherford. The prefix
--                                          is what stops it being read as one of
--                                          the two club geos below.
--   away_locale  -> away_team_geo         "Away team geo"
--   away_mascot  -> away_team_nickname    "Away team nickname"
--   home_locale  -> home_team_geo
--   home_mascot  -> home_team_nickname
--   away_score   -> away_team_score       "Away team score"
--   home_score   -> home_team_score
--   away_label   -> away_team_name        it is the club's full name, and
--   home_label   -> home_team_name        `label` named the format, not the
--                                          thing. Trigger-maintained either way.
--
-- ── THE SPLIT ────────────────────────────────────────────────────────────────
--
-- `venue_city` holds a CANONICAL COMPOSITE: "Seattle, Washington". That is not a
-- mistake to be undone -- it is the key that matches `public.cities.city`, it is
-- what the picker writes, and it is the string every other table on this site
-- stores. **It stays exactly as it is.**
--
-- What it lacks is the parts, and there is already one right answer to that in
-- this database: `games`, `teams` and `cities` all carry city_name / state_code
-- / state_name / country_code / country_name, derived from the canonical string
-- by a trigger through `tgb_parse_geo`. This table simply never got them.
--
-- So the split is ADDITIVE and DERIVED, never a second source of truth. Five
-- columns, prefixed `venue_` because a bare `state_code` next to two club geos
-- would be ambiguous, filled by `tgb_sync_events_geo` using
-- `coalesce(existing, parsed)` -- so an explicit value always wins and a
-- hand-written INSERT still gets the parts.
--
-- **THEY ARE NOT ON THE CARD**, for the same reason they are not on the games or
-- teams editors: they are derived, and a box you can type into that a trigger
-- may overwrite is a box that lies. `venue_city` is the human-readable one and
-- it is the one you edit.
--
-- ── THE FUNCTIONS AND TRIGGERS ARE RENAMED TOO ───────────────────────────────
--
-- `tgb_anchor_events_*` on a table called `events` half-remembers a name nothing
-- else uses. They become `tgb_events_*`. The page's `label-drift` finding names
-- one of them out loud, and that message is changed in the same commit.
--
-- APPLY BY HAND in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.
--
-- IT DEPENDS ON 2026082501 having been applied (the table must already be called
-- `events`); the guard below stops it half-running if it has not.

begin;

do $$
begin
  if to_regclass('public.events') is null then
    raise exception 'public.events does not exist. Run 2026082501_anchor_events_becomes_events.sql first.';
  end if;
end $$;

-- ── 1. The eleven renames ────────────────────────────────────────────────────
-- `if exists` on every one, so a partly-applied run can be finished by running
-- the file again rather than by hand-editing it.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('event_date',  'start_date'),
      ('venue_name',  'venue'),
      ('city',        'venue_city'),
      ('away_locale', 'away_team_geo'),
      ('away_mascot', 'away_team_nickname'),
      ('home_locale', 'home_team_geo'),
      ('home_mascot', 'home_team_nickname'),
      ('away_label',  'away_team_name'),
      ('home_label',  'home_team_name'),
      ('away_score',  'away_team_score'),
      ('home_score',  'home_team_score')
    ) as t(old, new)
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'events' and column_name = r.old
    ) then
      execute format('alter table public.events rename column %I to %I', r.old, r.new);
      raise notice 'column % -> %', r.old, r.new;
    end if;
  end loop;
end $$;

comment on column public.events.start_date  is 'The day it happens. Pairs with end_date; a single-day event ends the day it starts.';
comment on column public.events.venue_city  is 'CANONICAL "City, StateOrCountry", matching public.cities.city. The VENUE city, not a club home market: the Chargers play in Inglewood, the Giants in East Rutherford.';
comment on column public.events.away_team_name is 'Rebuilt from away_team_geo + away_team_nickname by tgb_events_sync_team_names on every write. Do not write it by hand.';
comment on column public.events.home_team_name is 'Rebuilt from home_team_geo + home_team_nickname by tgb_events_sync_team_names on every write. Do not write it by hand.';

-- ── 2. The split: the parts of venue_city, derived ───────────────────────────
alter table public.events add column if not exists venue_city_name    text;
alter table public.events add column if not exists venue_state_code   text;
alter table public.events add column if not exists venue_state_name   text;
alter table public.events add column if not exists venue_country_code text;
alter table public.events add column if not exists venue_country_name text;

comment on column public.events.venue_city_name    is 'DERIVED from venue_city by tgb_sync_events_geo. The bare city name.';
comment on column public.events.venue_state_code   is 'DERIVED from venue_city. Two letters; this is what drives the map icons elsewhere on the site.';
comment on column public.events.venue_state_name   is 'DERIVED from venue_city.';
comment on column public.events.venue_country_code is 'DERIVED from venue_city. Alpha-3; drives the country oval elsewhere on the site.';
comment on column public.events.venue_country_name is 'DERIVED from venue_city.';

-- coalesce(existing, parsed), exactly as tgb_sync_games_geo does: an explicit
-- value written by an admin or an importer always wins, and a SQL-only insert
-- still gets the parts.
create or replace function public.tgb_sync_events_geo()
returns trigger language plpgsql as $$
declare g public.tgb_geo;
begin
  g := public.tgb_parse_geo(new.venue_city);
  new.venue_city_name    := coalesce(nullif(new.venue_city_name, ''),    nullif(g.city_name, ''));
  new.venue_state_code   := coalesce(nullif(new.venue_state_code, ''),   nullif(g.state_code, ''));
  new.venue_state_name   := coalesce(nullif(new.venue_state_name, ''),   nullif(g.state_name, ''));
  new.venue_country_code := coalesce(nullif(new.venue_country_code, ''), nullif(g.country_code, ''));
  new.venue_country_name := coalesce(nullif(new.venue_country_name, ''), nullif(g.country_name, ''));
  return new;
end;
$$;

drop trigger if exists tgb_events_sync_geo on public.events;
create trigger tgb_events_sync_geo
  before insert or update on public.events
  for each row execute function public.tgb_sync_events_geo();

-- ── 3. The two trigger functions that name the renamed columns ───────────────
-- Written out rather than patched, because both are four lines and the column
-- names ARE the function. `tgb_touch_anchor_events_updated_at` is not here: it
-- touches only updated_at and never named a renamed column.
create or replace function public.tgb_events_sync_team_names()
returns trigger language plpgsql as $$
begin
  if new.away_team_geo is not null or new.away_team_nickname is not null then
    new.away_team_name := nullif(btrim(concat_ws(' ', nullif(btrim(new.away_team_geo), ''),
                                                      nullif(btrim(new.away_team_nickname), ''))), '');
  end if;
  if new.home_team_geo is not null or new.home_team_nickname is not null then
    new.home_team_name := nullif(btrim(concat_ws(' ', nullif(btrim(new.home_team_geo), ''),
                                                      nullif(btrim(new.home_team_nickname), ''))), '');
  end if;
  return new;
end;
$$;

create or replace function public.tgb_events_default_end_date()
returns trigger language plpgsql as $$
begin
  if new.end_date is null and new.start_date is not null then
    new.end_date := new.start_date;
  end if;
  return new;
end;
$$;

-- The old triggers point at the old functions. Drop both, create both.
drop trigger if exists tgb_anchor_events_sync_labels on public.events;
drop trigger if exists tgb_anchor_events_end_date    on public.events;
drop trigger if exists tgb_events_sync_team_names    on public.events;
drop trigger if exists tgb_events_end_date           on public.events;

create trigger tgb_events_sync_team_names
  before insert or update on public.events
  for each row execute function public.tgb_events_sync_team_names();

create trigger tgb_events_end_date
  before insert or update on public.events
  for each row execute function public.tgb_events_default_end_date();

-- The touch trigger only needs its NAME brought into line.
do $$
begin
  if exists (select 1 from pg_trigger
              where tgrelid = 'public.events'::regclass
                and tgname = 'tgb_anchor_events_touch') then
    execute 'alter trigger tgb_anchor_events_touch on public.events rename to tgb_events_touch';
  end if;
end $$;

-- The old function bodies are now unreferenced. Dropped rather than left lying
-- about: a function that no longer runs but still reads plausibly is exactly
-- what makes somebody think a flag is wired when it is not.
drop function if exists public.tgb_anchor_events_sync_team_labels();
drop function if exists public.tgb_anchor_events_default_end_date();

-- ── 3b. Backfill the split. IT HAS TO BE HERE, NOT BEFORE SECTION 3 ─────────
--
-- The five geo columns are filled by tgb_sync_events_geo, which fires on write
-- and does NOT run over rows already in the table, so without this every one of
-- the 603 existing rows keeps a null in all five and the split looks broken.
--
-- IT SAT AT THE END OF SECTION 2 AND THAT WAS WRONG, WHICH ONLY A REAL RUN
-- SHOWED. A no-op update fires EVERY before-update trigger on the table, not
-- just the one you have in mind -- and at that point the OLD
-- `tgb_anchor_events_sync_labels` was still attached, still pointing at a
-- function whose body reads `new.away_locale`, a column section 1 had renamed
-- away four statements earlier. The whole migration died with:
--
--     42703: record "new" has no field "away_locale"
--
-- **A BACKFILL THAT WRITES ROWS MUST COME AFTER EVERY TRIGGER ON THE TABLE IS
-- CONSISTENT WITH THE NEW SHAPE.** Nothing was lost when it failed, because the
-- file is one transaction and the error rolled it back.
--
-- It also re-fires tgb_events_sync_team_names over every row, which is harmless
-- and mildly useful: it rebuilds away_team_name and home_team_name from the
-- halves, so any row whose stored name had drifted comes out agreeing with them.
update public.events set venue_city = venue_city;

-- ── 4. The RPC, which names the renamed columns in its INSERT ───────────────
--
-- SCOPED TO THE INSERT COLUMN LIST, AND THAT IS THE WHOLE POINT OF THIS BLOCK.
-- A blind identifier replace over the function body was the first cut and it was
-- WRONG in two ways that would both have failed silently:
--
--   * The routine's JSON KEYS collide with the column names. The body reads
--     `v_row ->> 'city'`, `->> 'venue_name'`, `->> 'event_date'`. Rewriting
--     those changes TGB CONCERT BOT's payload contract, so every row it sends
--     would arrive with no city and no date and be refused as invalid -- from a
--     function that still compiles, on a run nobody watches.
--   * `select city from public.cities` names the CITIES column, which is not
--     being renamed and must not move.
--
-- So only the text between `insert into public.events as ae (` and `) values (`
-- is touched. Everything else in the body is left exactly as installed.
do $$
declare
  src text;
  fixed text;
  head text;
  mid text;
  tail text;
  open_at int;
  close_at int;
  marker constant text := 'insert into public.events as ae (';
  r record;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tgb_pull_concert_tours'
   limit 1;

  if src is null then
    raise notice 'tgb_pull_concert_tours is not installed; nothing to repair.';
    return;
  end if;

  open_at := position(marker in src);
  if open_at = 0 then
    raise exception 'tgb_pull_concert_tours does not contain the expected INSERT. Repair it by hand rather than letting this guess.';
  end if;

  head := substr(src, 1, open_at + length(marker) - 1);
  tail := substr(src, open_at + length(marker));
  close_at := position(') values (' in tail);
  if close_at = 0 then
    raise exception 'Could not find the end of the INSERT column list in tgb_pull_concert_tours.';
  end if;

  mid  := substr(tail, 1, close_at - 1);
  tail := substr(tail, close_at);

  for r in
    select * from (values
      ('event_date',  'start_date'),
      ('venue_name',  'venue'),
      ('city',        'venue_city'),
      ('away_locale', 'away_team_geo'),
      ('away_mascot', 'away_team_nickname'),
      ('home_locale', 'home_team_geo'),
      ('home_mascot', 'home_team_nickname'),
      ('away_label',  'away_team_name'),
      ('home_label',  'home_team_name'),
      ('away_score',  'away_team_score'),
      ('home_score',  'home_team_score')
    ) as t(old, new)
  loop
    mid := regexp_replace(mid, '\m' || r.old || '\M', r.new, 'g');
  end loop;

  fixed := head || mid || tail;

  if fixed = src then
    raise notice 'tgb_pull_concert_tours named none of the renamed columns.';
    return;
  end if;

  execute fixed;
  raise notice 'tgb_pull_concert_tours re-created; only its INSERT column list changed.';
end $$;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run these AFTER the commit. An empty payload proves nothing, and this project
-- has been caught by exactly that twice.
--
-- 1. The columns are the page's words, and none of the old ones survive:
--
--    select column_name from information_schema.columns
--     where table_schema='public' and table_name='events' order by ordinal_position;
--    -- expect: id, league, sport, start_date, start_time, away_team_tgbid,
--    --   home_team_tgbid, away_team_name, home_team_name, venue, venue_city,
--    --   status, away_team_score, home_team_score, source, created_at,
--    --   updated_at, kind, title, description, url, end_date, away_team_geo,
--    --   away_team_nickname, home_team_geo, home_team_nickname, neutral_site,
--    --   venue_city_name, venue_state_code, venue_state_name,
--    --   venue_country_code, venue_country_name
--
-- 2. NOTHING WAS LOST. 603 rows, and every one still has its date and city:
--
--    select count(*) as rows,
--           count(start_date) as dated,
--           count(venue_city) as placed,
--           count(away_team_name) as named
--      from public.events;
--    -- expect 603 / 603 / 603 / 603
--
-- 3. THE SPLIT IS FILLED ON EVERY ROW. Step 2b above did the backfill inside
--    the transaction, because a trigger fires on write and would otherwise have
--    left all 603 existing rows null in all five columns:
--
--    select count(*) filter (where venue_city_name is not null)  as named,
--           count(*) filter (where venue_state_code is not null) as stated,
--           count(*) filter (where venue_country_code is not null) as countried
--      from public.events;
--    -- expect 603 named, ~600 stated (non-US rows have a country instead),
--    -- and every row to have exactly one of state_code or country_code
--
--    select venue_city, venue_city_name, venue_state_code, venue_country_code
--      from public.events order by random() limit 5;
--    -- eyeball it: "Seattle, Washington" -> Seattle / WA / (null)
--    --             "Dublin, Ireland"     -> Dublin  / (null) / IRL
--
-- 4. The triggers are attached under their new names:
--
--    select tgname from pg_trigger
--     where tgrelid='public.events'::regclass and not tgisinternal order by 1;
--    -- expect tgb_events_end_date, tgb_events_sync_geo,
--    --        tgb_events_sync_team_names, tgb_events_touch
--
-- 5. Nothing anywhere still names a renamed column:
--
--    select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='public'
--       and pg_get_functiondef(p.oid) ~ '\m(event_date|venue_name|away_locale|away_mascot|home_locale|home_mascot|away_label|home_label|away_score|home_score)\M';
--    -- expect 0 rows
--
-- 6. THE NAME TRIGGER STILL REBUILDS, proved by making it do its job:
--
--    update public.events set away_team_nickname = 'Probes'
--     where id = (select id from public.events where kind='sports' limit 1)
--    returning away_team_geo, away_team_nickname, away_team_name;
--    -- expect away_team_name to end in ' Probes'. Then put it back:
--    -- (note the original nickname first, or roll the transaction back)
--
-- 7. THE RPC IS PROVED BY A CALL THAT FILES A REAL ROW, not by an empty payload
--    -- an empty one answers {"inserted": 0} whether or not the body works:
--
--    select public.tgb_pull_concert_tours('[{
--      "id": "CONCERT-COLUMNS-PROBE", "title": "Probe Tour",
--      "city": "Chicago, Illinois", "event_date": "2027-06-01",
--      "venue_name": "A Hall", "start_time": "20:00"
--    }]'::jsonb);
--    -- expect {"inserted": 1, ...}
--    -- NOTE the payload KEYS are unchanged: they are the routine's JSON
--    -- contract, not column names, and renaming them would mean editing the
--    -- prompt for no gain. The function maps them.
--
--    select id, kind, status, source, start_date, end_date, venue, venue_city,
--           venue_city_name, venue_state_code
--      from public.events where id = 'CONCERT-COLUMNS-PROBE';
--    -- expect concert / scheduled / SeatGeek / 2027-06-01 / 2027-06-01 /
--    --        A Hall / Chicago, Illinois / Chicago / IL
--
--    delete from public.events where id = 'CONCERT-COLUMNS-PROBE';
