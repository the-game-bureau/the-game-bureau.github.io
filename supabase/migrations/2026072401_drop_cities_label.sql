-- 2026072401_drop_cities_label.sql
--
-- Retire public.cities.label. It was the pre-structured short display name for a
-- city; the structured `city_name` stem (added 2026-07-11) fully replaces it —
-- across all 91 live rows, label is either equal to city_name or empty, never a
-- distinct value. Every reader now uses city_name (composeGeo for the full
-- string), and no query names `label` in a column list anymore.
--
-- Run this AFTER the code that stops selecting `label` has deployed. Idempotent.

alter table public.cities drop column if exists label;
