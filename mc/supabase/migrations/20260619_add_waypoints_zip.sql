-- Add a ZIP / postal code column to waypoints. Safe to re-run.
alter table public.waypoints add column if not exists zip text;
comment on column public.waypoints.zip is 'Postal / ZIP code for the point (used for geocoding and Fill).';
