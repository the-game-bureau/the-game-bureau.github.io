-- 2026072402_drop_cities_archived.sql
--
-- Retire public.cities.archived. It was a reversible "hide everywhere" soft
-- delete, enforced by the public-read RLS policy (using archived = false). We're
-- dropping it in favour of just Delete + Venue-only (ignored); nothing else
-- depended on the reversibility.
--
-- NOTE: this un-hides any currently-archived city (they become normal catalog
-- rows). Review/delete those first if any should stay gone. Run AFTER the code
-- that stops sending/filtering `archived` has deployed. Idempotent.

-- 1. Public-read policy no longer references archived — every catalog row is
--    readable (venue-only is filtered client-side, same as before).
drop policy if exists "Cities are publicly readable" on public.cities;
create policy "Cities are publicly readable"
  on public.cities
  for select
  to public
  using (true);

-- 2. Ordering index without the archived leading column.
create index if not exists cities_sort_idx on public.cities (sort_order, city);
drop index if exists public.cities_active_sort_idx;

-- 3. Drop the column.
alter table public.cities drop column if exists archived;
