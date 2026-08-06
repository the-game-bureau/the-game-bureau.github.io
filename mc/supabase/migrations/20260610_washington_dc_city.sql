-- Normalize the Washington, D.C. city across team/game city columns.
-- Matches any value whose city is Washington-DC — bare "Washington", or
-- "Washington" followed by a DC form (DC, D.C., District of Columbia, with or
-- without a comma) — and rewrites it to the canonical "Washington, D.C.".
-- Deliberately does NOT touch "<City>, Washington" (Washington the state, e.g.
-- "Seattle, Washington") or team names/fanbase ("Washington Wizards"). Safe to
-- re-run; idempotent (re-applying matches "Washington, D.C." and re-sets it).

-- City regex (case-insensitive, on the trimmed value):
--   ^washington( [,/space]+ (dc | d.c. | district of columbia) )? $

update public.games
   set away_team_city = 'Washington, D.C.'
 where btrim(away_team_city) ~* '^washington([ ,]+(d\.?c\.?|district of columbia))?$';

update public.games
   set city = 'Washington, D.C.'
 where btrim(city) ~* '^washington([ ,]+(d\.?c\.?|district of columbia))?$';

update public.teams
   set game_city = 'Washington, D.C.'
 where btrim(game_city) ~* '^washington([ ,]+(d\.?c\.?|district of columbia))?$';

update public.teams
   set venue_city = 'Washington, D.C.'
 where btrim(venue_city) ~* '^washington([ ,]+(d\.?c\.?|district of columbia))?$';
