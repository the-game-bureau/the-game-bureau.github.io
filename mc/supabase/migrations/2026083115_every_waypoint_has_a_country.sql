-- 2026-08-31  a waypoint may have no state, and must always have a country
-- ---------------------------------------------------------------------------
-- 2026082901 added `waypoints.country` and DELIBERATELY did not backfill it:
-- "516 rows predate the column and most of them are American, but `most` is not
-- a fact about any given row, and writing USA across the table would be
-- inventing 516 answers to make a column look finished."
--
-- THAT ARGUMENT IS RIGHT ABOUT INVENTION AND WRONG ABOUT THIS TABLE, because
-- the country is not being invented here -- it is being READ OFF a value every
-- row already holds. `state` is a two-letter subdivision code or a country
-- name, and both of those say which country the row is in.
--
-- THE STATE COLUMN HAS BEEN DOING TWO JOBS, which is why this is worth doing
-- at all. Measured on the live table before anything was written:
--     525 rows  a two-letter code
--       9 rows  a COUNTRY NAME -- Canada, England, Germany, Mexico,
--               New Zealand, Portugal, Slovakia, Spain, United Kingdom
-- Those nine have no state and never did; the country was put in the state box
-- because until 2026082901 there was nowhere else for it to go.
--
-- AND NOT EVERY TWO-LETTER CODE IS AMERICAN. **AB, MB, QC, BC and ON are
-- Canadian provinces**, and they pass a `^[A-Z][A-Z]$` test by luck -- exactly
-- the coincidence this project already recorded when Toronto satisfied the
-- destinations table's two-character CHECK. A blanket `USA` on every two-letter
-- row would have filed five Canadian waypoints as American, silently, and
-- nothing on any screen would ever have said so. The province list is named.
--
-- WHAT IT DOES NOT DO: guess. A row whose state is neither a known code nor a
-- known country name is left with a null country, which is true -- nobody has
-- said yet. There is no CHECK and no NOT NULL: the rule that a waypoint should
-- always have a country is enforced where it can be acted on, which is the
-- Waypoints room's own `no-country` finding, not by refusing writes from a
-- routine that cannot fix them.
--
-- APPLY BY HAND. Remote migration history has drifted; `supabase db push` is
-- refused. Safe with `supabase db query --linked --file`.

begin;

-- 1. THE NINE THAT HELD A COUNTRY IN THE STATE BOX. The country moves and the
--    state goes null, because they genuinely have no subdivision recorded.
update public.waypoints
   set country = state, state = null
 where country is null
   and state in ('Canada', 'England', 'Germany', 'Mexico', 'New Zealand',
                 'Portugal', 'Slovakia', 'Spain', 'United Kingdom');

-- 2. THE CANADIAN PROVINCES KEEP THEIR STATE, which is correct: a province is a
--    subdivision like a state, and the country beside it is what was missing.
update public.waypoints
   set country = 'Canada'
 where country is null
   and state in ('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON',
                 'PE', 'QC', 'SK', 'YT');

-- 3. AND THE US STATES, NAMED RATHER THAN PATTERN-MATCHED, so a two-letter code
--    from anywhere else can never be swept up as American.
update public.waypoints
   set country = 'USA'
 where country is null
   and state in ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
                 'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS',
                 'MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
                 'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
                 'WI','WY','DC');

commit;

-- Verify -------------------------------------------------------------------
-- APPLY IT, THEN PROVE IT. An empty payload proves nothing.
--
--   -- 1. every row has a country, and the nine gave up their state
--   select count(*) total,
--          count(*) filter (where country is null) no_country,
--          count(*) filter (where state is null) no_state
--     from public.waypoints;
--   -- expect: 534 / 0 / 9
--
--   -- 2. the countries, and no province filed as American
--   select country, count(*) from public.waypoints group by country order by 2 desc;
--   -- expect: USA 520, Canada 5, then one each of the eight named above
--
--   select distinct state from public.waypoints
--    where country = 'USA' and state in ('AB','BC','MB','ON','QC');
--   -- expect: 0 rows
