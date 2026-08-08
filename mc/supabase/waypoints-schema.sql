-- waypoints-schema.sql — the WHOLE shape of public.waypoints, idempotent.
--
-- (No backticks in this file. mc/data/waypoints.html pastes it verbatim into a
--  String.raw template literal, and one backtick would end the template.)
--
-- WHY THIS FILE EXISTS. The table was built over a dozen migrations and its
-- current shape is not written down in any one of them - you would have to read
-- 20260617 plus zip plus source_url plus archived plus latlon plus walk_order
-- plus the tour columns, and know which of the dropped ones (w3w) are gone. That
-- is fine for a human with the repo and useless for the two audiences that
-- actually need it:
--
--   1. An AI given a pasted prompt. It has no checkout and no database. If the
--      prompt does not carry the schema, the model guesses column names.
--   2. A Supabase SQL editor pointed at a database that has not run every
--      migration. Every statement here is create/add-if-not-exists, so pasting
--      it is always safe and never destructive.
--
-- Keep it in step with the migrations. The migrations remain the record of WHEN
-- and WHY each column arrived; this file is the answer to WHAT THE TABLE IS NOW.

create table if not exists public.waypoints (
  wpid        bigint primary key,
  city        text,
  state       text,
  address     text,
  name        text,
  description text
);

-- Every column added after the original create. Order is historical.
alter table public.waypoints add column if not exists zip         text;
alter table public.waypoints add column if not exists source_url  text;
alter table public.waypoints add column if not exists archived    boolean not null default false;
alter table public.waypoints add column if not exists lat         double precision;
alter table public.waypoints add column if not exists lon         double precision;
alter table public.waypoints add column if not exists walk_order  integer;
alter table public.waypoints add column if not exists tour_id     text;
alter table public.waypoints add column if not exists tour_title  text;
alter table public.waypoints add column if not exists tour_shape  text;

-- wpid gap-fills rather than counting up: a deleted id becomes free again, and a
-- BEFORE INSERT trigger claims the lowest unused one. NEVER supply a wpid.
create or replace function public.waypoints_assign_wpid()
returns trigger language plpgsql as $wp$
begin
  if new.wpid is null then
    perform pg_advisory_xact_lock(hashtext('public.waypoints.wpid'));
    select coalesce(min(s), 1) into new.wpid
      from generate_series(1, coalesce((select max(wpid) from public.waypoints), 0) + 1) s
     where not exists (select 1 from public.waypoints w where w.wpid = s);
  end if;
  return new;
end;
$wp$;

drop trigger if exists waypoints_assign_wpid_trg on public.waypoints;
create trigger waypoints_assign_wpid_trg
  before insert on public.waypoints
  for each row execute function public.waypoints_assign_wpid();

alter table public.waypoints drop constraint if exists waypoints_tour_shape_known;
alter table public.waypoints add constraint waypoints_tour_shape_known
  check (tour_shape is null or tour_shape in ('loop', 'out_and_back', 'point_to_point')) not valid;

alter table public.waypoints drop constraint if exists waypoints_walk_order_sane;
alter table public.waypoints add constraint waypoints_walk_order_sane
  check (walk_order is null or (walk_order >= 1 and walk_order <= 999)) not valid;

create index if not exists waypoints_tour_idx
  on public.waypoints (tour_id, walk_order) where tour_id is not null;
