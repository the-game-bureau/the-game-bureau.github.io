-- public.anchor_events BECOMES public.events.
--
-- The table holds anchor events and nothing else calls itself an event, so the
-- qualifier was distinguishing it from a thing that does not exist. GAMES will
-- be built on top of these rows and will be their own table; `events` is what
-- the room at /mc/events/ has been called since 2026-08-24, so after this the
-- path, the room and the table finally agree.
--
-- THIS RESOLVES A DISAGREEMENT THIS FILE HAS BEEN CARRYING FOR TWO DAYS. The
-- room moved to /mc/data/events.html, then to /mc/anchor_events.html to name the
-- table, then to /mc/events/ to follow the folder convention -- and each move
-- traded one rule against the other because the table was called one thing and
-- the room another. Renaming the table is the move that stops the trade.
--
-- ── WHAT ACTUALLY BREAKS ON A TABLE RENAME, AND WHAT DOES NOT ────────────────
--
-- SAFE, because they follow the table by OID rather than by name:
--   * `games.anchor_event_id` -- the foreign key still points here.
--   * `tgb_anchor_events_touch`, `tgb_anchor_events_sync_labels` and
--     `tgb_anchor_events_end_date`. A trigger belongs to the table.
--   * All three trigger FUNCTIONS, which read `new.*` and never name the table.
--
-- BROKEN, and repaired below:
--   * `tgb_pull_concert_tours`. A plpgsql body is stored as TEXT and resolved at
--     runtime, so `insert into public.anchor_events` would raise 42P01 on the
--     next run of TGB CONCERT BOT -- at noon, unattended, with nobody watching.
--     **This is the one thing on this page that a rename silently arms.**
--
-- ── NO COMPATIBILITY VIEW, DELIBERATELY ──────────────────────────────────────
--
-- The routes -> paths rename left read-only views behind at the old names, and
-- that was right there: the consumers were spread across two engines and could
-- not all be enumerated. Here they can, and there are five, all in this repo:
-- the room, mc/marquee.html, the Data Warehouse card, TGB CONCERT BOT's prompt
-- file, and the function repaired below. All five are changed in the same
-- commit.
--
-- So a view would protect against nothing except my own oversight, and it would
-- HIDE that oversight rather than surface it -- the same failure that got the
-- soundtracks JSON fallback deleted, where a stale file rendered perfectly and
-- told nobody the tables were unreachable. A missing table raises PGRST205 and
-- names itself. Let it.
--
-- ── `games.anchor_event_id` IS NOT RENAMED, AND THAT IS A DECISION ───────────
--
-- The column still describes what it holds: the id of an anchor event. Renaming
-- it would touch `public.games`, which BOTH ENGINES read with `select=*` at play
-- time, and which is the paid product. That is a separate change with its own
-- blast radius, and nothing is wrong today: `games.anchor_event_id -> events.id`
-- reads perfectly well. Do it on its own day if it is ever wanted.
--
-- APPLY BY HAND in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

begin;

-- 1. The table.
alter table if exists public.anchor_events rename to events;

comment on table public.events is
  'The real-world thing a game is built around: a match, a concert, a convention, a festival. Renamed from anchor_events on 2026-08-25. A Game Bureau game is played the DAY BEFORE its event.';

-- 2. Indexes, the primary key and the policies still read `anchor_events_*`.
--    A rename does not carry them, and a table called `events` whose primary key
--    is `anchor_events_pkey` is a table that half-remembers its old name.
--
--    DONE BY SCANNING THE CATALOG rather than by listing the five index names
--    this repo happens to know about. Anything created in the dashboard by hand
--    is renamed too, and a name this migration has never heard of does not get
--    left behind.
do $$
declare
  r record;
  n text;
begin
  -- Indexes and constraints.
  for r in
    select c.relname as name, 'index' as kind
      from pg_class c
      join pg_index i on i.indexrelid = c.oid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname = 'public' and t.relname = 'events'
       and c.relname like 'anchor\_events\_%'
  loop
    n := 'events_' || substr(r.name, length('anchor_events_') + 1);
    execute format('alter index public.%I rename to %I', r.name, n);
    raise notice 'index % -> %', r.name, n;
  end loop;

  for r in
    select con.conname as name
      from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname = 'public' and t.relname = 'events'
       and con.conname like 'anchor\_events\_%'
  loop
    n := 'events_' || substr(r.name, length('anchor_events_') + 1);
    execute format('alter table public.events rename constraint %I to %I', r.name, n);
    raise notice 'constraint % -> %', r.name, n;
  end loop;

  -- Policies. These carry a human-readable name and are what the dashboard
  -- lists, so a stale one is read by a person rather than by the planner.
  for r in
    select pol.polname as name
      from pg_policy pol
      join pg_class t on t.oid = pol.polrelid
      join pg_namespace ns on ns.oid = t.relnamespace
     where ns.nspname = 'public' and t.relname = 'events'
       and pol.polname like 'anchor_events%'
  loop
    n := 'events' || substr(r.name, length('anchor_events') + 1);
    execute format('alter policy %I on public.events rename to %I', r.name, n);
    raise notice 'policy % -> %', r.name, n;
  end loop;
end $$;

-- 3. THE ONE FUNCTION A RENAME ACTUALLY BREAKS.
--
--    `tgb_pull_concert_tours` inserts into the table by name, in plpgsql, which
--    is text resolved at runtime. Left alone it raises 42P01 on TGB CONCERT
--    BOT's next unattended run.
--
--    RE-CREATED FROM THE LIVE DEFINITION, NOT FROM THIS REPO'S COPY. `create or
--    replace` rewrites the WHOLE function, and this project has already lost a
--    column that way -- 2026081302 rebuilt the socials pull's INSERT list and
--    silently dropped `confidence` for five days. Reading pg_get_functiondef and
--    changing ONE identifier cannot drop anything, and it repairs whatever is
--    actually installed even if that has drifted from the file.
do $$
declare
  src text;
  fixed text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tgb_pull_concert_tours'
   limit 1;

  if src is null then
    raise notice 'tgb_pull_concert_tours is not installed; nothing to repair.';
    return;
  end if;

  fixed := replace(src, 'public.anchor_events', 'public.events');

  if fixed = src then
    raise notice 'tgb_pull_concert_tours does not name the old table; left alone.';
    return;
  end if;

  execute fixed;
  raise notice 'tgb_pull_concert_tours re-created against public.events.';
end $$;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run these AFTER the commit. An empty payload proves nothing, and this project
-- has been caught by exactly that twice.
--
-- 1. The table moved and kept every row:
--
--    select count(*) from public.events;     -- expect 604
--    select to_regclass('public.anchor_events');  -- expect NULL
--
-- 2. Nothing still names the old table anywhere in the schema. THIS IS THE ONE
--    THAT MATTERS -- a function body naming a table that no longer exists does
--    not fail until something calls it:
--
--    select p.proname
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and pg_get_functiondef(p.oid) ilike '%public.anchor\_events%';
--    -- expect 0 rows
--
-- 3. The foreign key from games survived the rename, by OID:
--
--    select conname, confrelid::regclass
--      from pg_constraint
--     where conrelid = 'public.games'::regclass and contype = 'f'
--       and confrelid = 'public.events'::regclass;
--    -- expect one row, pointing at public.events
--
-- 4. All three triggers are still attached:
--
--    select tgname from pg_trigger
--     where tgrelid = 'public.events'::regclass and not tgisinternal;
--    -- expect tgb_anchor_events_touch, tgb_anchor_events_sync_labels,
--    --        tgb_anchor_events_end_date
--
-- 5. Nothing is still called anchor_events_*:
--
--    select conname from pg_constraint where conrelid = 'public.events'::regclass
--     union all
--    select polname from pg_policy where polrelid = 'public.events'::regclass;
--    -- expect none of them to start with anchor_events
--
-- 6. THE RPC IS PROVED BY A CALL THAT MAKES IT DO ITS JOB, not by an empty
--    payload -- an empty one answers {"inserted": 0} whether or not the body
--    works. File a real row, then delete it:
--
--    select public.tgb_pull_concert_tours('[{
--      "id": "CONCERT-RENAME-PROBE", "title": "Probe Tour",
--      "city": "Chicago, Illinois", "event_date": "2027-06-01",
--      "venue_name": "A Hall", "start_time": "20:00"
--    }]'::jsonb);
--    -- expect {"inserted": 1, ...}
--
--    select id, kind, status, source, end_date from public.events
--     where id = 'CONCERT-RENAME-PROBE';
--    -- expect concert / scheduled / SeatGeek / end_date = 2027-06-01
--
--    delete from public.events where id = 'CONCERT-RENAME-PROBE';
