-- Waypoints: soft-archive rejected/retired places.
--
-- Archived waypoints stay in the catalog as tombstones so future AI imports and
-- nightly reviews can recognize the name + city and avoid suggesting the same
-- stop again. They are hidden from the normal admin working list, but remain
-- readable/editable through the Archived filter.

alter table public.waypoints
  add column if not exists archived boolean not null default false;

create index if not exists waypoints_archived_city_name_idx
  on public.waypoints (archived, lower(btrim(coalesce(city, ''))), lower(btrim(coalesce(name, ''))));

comment on column public.waypoints.archived is
  'Soft archive flag. true = keep as a do-not-rescrape tombstone; hide from the normal waypoint working list.';
