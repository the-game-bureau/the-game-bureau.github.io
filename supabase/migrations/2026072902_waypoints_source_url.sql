-- Where a waypoint came from.
--
-- The "With AI" importer on /mc/waypoints/ takes an optional Source URL: give it
-- a page and it extracts that page's walking-tour stops instead of researching
-- from scratch. Until now the page itself was thrown away at import, so a month
-- later there was no way to answer "where did this stop come from, and is that
-- list still up?" — which matters most for exactly the rows you trust least.
--
-- source_url records it. It is the page a stop was SCRAPED FROM, not a link to
-- the place: the tour list, the historical-society page, the article. Null for
-- anything typed in by hand or researched without a source page, and that stays
-- normal — most waypoints will never have one.

alter table public.waypoints
  add column if not exists source_url text;

comment on column public.waypoints.source_url is
  'Page this waypoint was extracted from by the AI importer, if any. The list '
  'it came from, not a link to the place itself. Null for hand-entered rows.';
