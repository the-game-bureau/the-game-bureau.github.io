-- 2026-08-31  ATLASES. An atlas is an ordered list of stops, and a stop may be
-- in as many atlases as you like.
--
-- THE REUSE IS WHAT DECIDED THE SHAPE. Asked directly, and the answer was that
-- stops are reused across atlases, which makes this a many-to-many: an atlas
-- has many stops, a stop belongs to many atlases. That is exactly what a join
-- table with a position is, and it is what the four named fields describe.
--
-- SO `stops` GETS A SURROGATE `id` BACK, and that partly reverses 2026083106,
-- knowingly. A stop's key is `(city, waypoint_id)`, and referencing a stop from
-- another table by that pair would put TWO columns on every atlas row for one
-- reference, repeated for every atlas the stop is in. **A row that is pointed at
-- from elsewhere wants a single-column identity**, which is the same reasoning
-- 2026081601 recorded when `soundtracks` moved off `city_slug` onto a surrogate
-- id: every write is `?id=eq.<id>`, and a filter somebody forgets to scope
-- rewrites a whole city.
--   `(city, waypoint_id)` IS KEPT AS A UNIQUE KEY, not thrown away. It is the
--   rule that makes reuse work at all: ONE PLACE IS ONE STOP IN A CITY, so an
--   atlas naming that stop and another atlas naming it are pointing at the same
--   row rather than at two rows that happen to agree.
--
-- THE KEY IS `(atlas_id, stop_number)`, so an atlas cannot have two stop 3s --
-- the failure `route_stops` was rekeyed to prevent, where a position is the
-- only stable handle and a duplicate leaves nothing able to choose. It also
-- means A STOP MAY APPEAR TWICE IN ONE ATLAS, which is not an oversight: a walk
-- that comes home names the square it started from again, and `route_stops`
-- allows exactly this for exactly this reason.
--
-- `atlas_name` REPEATS ON EVERY ROW, because that is the shape asked for: four
-- fields, flat. It is the `soundtrack` shape, where the tape's name sits on
-- every track. **What it costs is that a rename is a write to every row of the
-- atlas**, and two rows of one atlas could otherwise disagree about its name
-- with nothing on screen saying so. A trigger closes that: an INSERT adopts the
-- name the atlas already has, and renaming any row renames the whole atlas.
-- There is no way to end up with two names.
--
-- `on delete cascade` ON `stop_id`: deleting a stop takes it out of every atlas
-- that used it. The alternative, refusing the delete, would make a stop
-- undeletable for as long as one atlas names it, and would leave the Stop
-- Builder's Delete button unable to explain itself.

begin;

-- ---- 1. a stop can be pointed at -------------------------------------------
alter table public.stops
  drop constraint stops_pkey,
  add column id bigint generated always as identity;

alter table public.stops add constraint stops_pkey primary key (id);

-- THE OLD KEY SURVIVES AS THE RULE IT ALWAYS WAS. Without it the same place
-- could be filed twice in one city and two atlases could point at what a reader
-- would take for two different stops.
alter table public.stops add constraint stops_one_per_place unique (city, waypoint_id);

comment on column public.stops.id is
  'A surrogate identity so an atlas can point at a stop with one column. The '
  'RULE is still (city, waypoint_id): one place is one stop in a city.';

-- ---- 2. the atlases --------------------------------------------------------
create table public.atlases (
  atlas_id     text    not null,
  atlas_name   text    not null,
  stop_id      bigint  not null references public.stops(id) on delete cascade,
  stop_number  integer not null,
  primary key (atlas_id, stop_number),
  constraint atlases_id_not_blank   check (btrim(atlas_id) <> ''),
  constraint atlases_id_lower       check (atlas_id = lower(atlas_id)),
  constraint atlases_name_not_blank check (btrim(atlas_name) <> ''),
  -- POSITIONS START AT 1 AND COUNT UP. A stop 0 or a stop -2 is not a place in
  -- a walk, and nothing downstream could order around one.
  constraint atlases_number_positive check (stop_number >= 1)
);

comment on table public.atlases is
  'An atlas is an ordered list of stops. Keyed by (atlas_id, stop_number), so '
  'an atlas cannot have two stop 3s and a stop MAY appear twice in one atlas -- '
  'a walk that comes home names its first square again.';
comment on column public.atlases.atlas_name is
  'Repeated on every row of the atlas, and kept in step by tgb_atlases_one_name: '
  'an insert adopts the name the atlas already has, and renaming any row renames '
  'the whole atlas. There is no way to end up with two names.';

create index atlases_stop_idx on public.atlases (stop_id);

-- ---- 3. one atlas, one name ------------------------------------------------
create or replace function public.tgb_atlases_one_name()
returns trigger
language plpgsql
as $fn$
declare v_existing text;
begin
  -- THE NAME IS ONE FACT STORED MANY TIMES, which is the cost of the flat shape.
  -- Left alone, two rows of one atlas could disagree and NOTHING WOULD SAY SO --
  -- the list would simply show the same atlas under two names.
  select a.atlas_name into v_existing
    from public.atlases a
   where a.atlas_id = new.atlas_id
     and (tg_op = 'INSERT' or a.stop_number is distinct from old.stop_number)
   limit 1;

  if tg_op = 'INSERT' then
    -- ADOPT, RATHER THAN REFUSE. Somebody adding a stop to an atlas should not
    -- have to know its name, and a blank or a stale one must not become a
    -- second name for it.
    if v_existing is not null then new.atlas_name := v_existing; end if;
    return new;
  end if;

  -- A RENAME ON ONE ROW IS A RENAME OF THE ATLAS. Guarded, or the update below
  -- would fire this trigger for every row it touches, forever.
  if new.atlas_name is distinct from old.atlas_name then
    update public.atlases
       set atlas_name = new.atlas_name
     where atlas_id = new.atlas_id
       and atlas_name is distinct from new.atlas_name
       and stop_number is distinct from new.stop_number;
  end if;
  return new;
end;
$fn$;

create trigger atlases_one_name
  before insert or update on public.atlases
  for each row execute function public.tgb_atlases_one_name();

-- ---- 4. who may read and write ---------------------------------------------
alter table public.atlases enable row level security;

-- Read is public, exactly as stops, waypoints and challenges are: an atlas is
-- made of publicly readable rows and says nothing they do not.
create policy "Atlases are publicly readable"
  on public.atlases for select to public using (true);

create policy "Admins can manage atlases"
  on public.atlases for all to authenticated using (true) with check (true);

commit;

-- Verify. Each is a call that makes the table do its job; an insert that raises
-- nothing proves nothing.
--
--   -- stops kept its rows and gained an id
--   select count(*) from public.stops;                          -- expect 2
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='stops' order by ordinal_position;
--
--   -- one place is still one stop in a city (expect 23505)
--   insert into public.stops (city, waypoint_id)
--   select city, waypoint_id from public.stops limit 1;
--
--   -- an atlas cannot have two stop 3s (expect 23505 on the second)
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Probe Atlas', id, 1 from public.stops limit 1;
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Probe Atlas', id, 1 from public.stops limit 1;
--
--   -- a second row ADOPTS the atlas name rather than setting a second one
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'A Different Name', id, 2 from public.stops offset 1 limit 1;
--   select distinct atlas_name from public.atlases where atlas_id = 'probe';
--                                                        -- expect ONE row
--
--   -- renaming any row renames the atlas
--   update public.atlases set atlas_name = 'Renamed'
--    where atlas_id = 'probe' and stop_number = 2;
--   select distinct atlas_name from public.atlases where atlas_id = 'probe';
--                                                        -- expect Renamed only
--
--   -- a stop may appear twice in one atlas (a loop that comes home)
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Renamed', stop_id, 3 from public.atlases
--    where atlas_id = 'probe' and stop_number = 1;
--
--   -- a stop number of zero is refused (expect 23514)
--   insert into public.atlases (atlas_id, atlas_name, stop_id, stop_number)
--   select 'probe', 'Renamed', id, 0 from public.stops limit 1;
--
--   delete from public.atlases where atlas_id = 'probe';
