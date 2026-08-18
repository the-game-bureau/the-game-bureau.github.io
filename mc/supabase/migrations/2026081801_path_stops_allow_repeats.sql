-- A PATH MAY VISIT THE SAME PLACE TWICE.
--
-- public.path_stops was keyed (tour_id, wpid), which made a place appear at most
-- once per path. The comment on the table argued for it: "a loop finishes NEAR
-- its first stop, it does not list it again."
--
-- That is one way to draw a loop and not the only one. An out-and-back returns
-- along the street it came down; a loop that starts and ends at the same square
-- is a real walk and the obvious way to describe it is to name that square
-- twice. The key was deciding an editorial question, and it decided it wrong.
--
-- THE NEW KEY IS (tour_id, ord). A POSITION on a path is unique -- there is no
-- such thing as two third stops -- and it is the column the order already lives
-- in, so nothing gains a surrogate id it did not need.
--
-- WHAT THIS DOES NOT LOOSEN: ord stays NOT NULL and the two foreign keys are
-- untouched, so a stop still points at a real path and a real waypoint, and
-- deleting either still cascades.
--
-- Apply by hand in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

-- The old key by whatever name it currently carries: it was created as
-- route_stops_pkey and renamed to path_stops_pkey by 2026081702, and a database
-- that ran the rename before that migration existed may still hold either.
do $$
declare
  v_name text;
begin
  select conname into v_name
  from pg_constraint
  where conrelid = 'public.path_stops'::regclass
    and contype = 'p';
  if v_name is not null then
    execute format('alter table public.path_stops drop constraint %I', v_name);
  end if;
end $$;

-- Nothing to clean up first: two rows sharing (tour_id, ord) could not exist
-- under the old key either, since a repeated wpid was what it forbade.
alter table public.path_stops
  add constraint path_stops_pkey primary key (tour_id, ord);

-- Was the primary key's own index and is now worth having on its own: the
-- Path Builder asks "what paths is this place on" and nothing else indexes wpid.
create index if not exists path_stops_wpid_idx on public.path_stops (wpid);

comment on table public.path_stops is
  'Which waypoints a path visits, in what order. Keyed (tour_id, ord): a POSITION is unique, a PLACE is not, so a loop may list the same square as its first and last stop. Renamed from public.route_stops 2026-08-17; re-keyed 2026-08-18.';
