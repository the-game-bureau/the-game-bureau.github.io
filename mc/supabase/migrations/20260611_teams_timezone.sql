-- Explicit venue timezone for accurate event start-time conversion.
--
-- Game start_time is stored LOCAL TO THE VENUE. The landing page (The Main
-- Event card) converts it to each player's device clock. Previously the venue
-- timezone was approximated client-side from the venue's US state, which is
-- wrong for the handful of multi-timezone states (e.g. Knoxville TN is Eastern,
-- not Central). This stores the exact IANA timezone on the team row, with an
-- optional per-game override on games.
--
-- Runtime precedence (mc/game/run/index.html → eventLocalTime):
--   games.timezone  →  home team teams.timezone  →  state→tz approximation.

alter table public.teams add column if not exists timezone text;
alter table public.games add column if not exists timezone text;

comment on column public.teams.timezone is
  'IANA timezone of the team''s venue (e.g. America/Chicago). Used to interpret game start_time, which is stored local to the venue.';
comment on column public.games.timezone is
  'Optional per-game IANA timezone override for start_time (falls back to the home team''s teams.timezone, then a state approximation).';

-- Baseline: derive from the 2-letter state in game_city (fallback venue_city).
-- Rows with no parseable state keep NULL and fall back to the client-side
-- state→tz map at runtime.
update public.teams
set timezone = case upper(trim(split_part(coalesce(nullif(game_city, ''), venue_city), ',', 2)))
  when 'CT' then 'America/New_York' when 'DE' then 'America/New_York' when 'DC' then 'America/New_York'
  when 'FL' then 'America/New_York' when 'GA' then 'America/New_York' when 'ME' then 'America/New_York'
  when 'MD' then 'America/New_York' when 'MA' then 'America/New_York' when 'NH' then 'America/New_York'
  when 'NJ' then 'America/New_York' when 'NY' then 'America/New_York' when 'NC' then 'America/New_York'
  when 'OH' then 'America/New_York' when 'PA' then 'America/New_York' when 'RI' then 'America/New_York'
  when 'SC' then 'America/New_York' when 'VT' then 'America/New_York' when 'VA' then 'America/New_York'
  when 'WV' then 'America/New_York' when 'KY' then 'America/New_York'
  when 'IN' then 'America/Indiana/Indianapolis' when 'MI' then 'America/Detroit'
  when 'AL' then 'America/Chicago' when 'AR' then 'America/Chicago' when 'IL' then 'America/Chicago'
  when 'IA' then 'America/Chicago' when 'KS' then 'America/Chicago' when 'LA' then 'America/Chicago'
  when 'MN' then 'America/Chicago' when 'MS' then 'America/Chicago' when 'MO' then 'America/Chicago'
  when 'NE' then 'America/Chicago' when 'ND' then 'America/Chicago' when 'OK' then 'America/Chicago'
  when 'SD' then 'America/Chicago' when 'TN' then 'America/Chicago' when 'TX' then 'America/Chicago'
  when 'WI' then 'America/Chicago'
  when 'AZ' then 'America/Phoenix'
  when 'CO' then 'America/Denver' when 'MT' then 'America/Denver' when 'NM' then 'America/Denver'
  when 'UT' then 'America/Denver' when 'WY' then 'America/Denver' when 'ID' then 'America/Boise'
  when 'CA' then 'America/Los_Angeles' when 'NV' then 'America/Los_Angeles'
  when 'OR' then 'America/Los_Angeles' when 'WA' then 'America/Los_Angeles'
  when 'AK' then 'America/Anchorage' when 'HI' then 'Pacific/Honolulu'
  else timezone
end;

-- Corrections: cities whose timezone differs from their state's baseline.
update public.teams set timezone = 'America/New_York'
 where coalesce(game_city, venue_city, '') ~* '(knoxville|johnson city|kingsport|bristol)';
update public.teams set timezone = 'America/Chicago'
 where coalesce(game_city, venue_city, '') ~* '(bowling green|paducah|murray)';
update public.teams set timezone = 'America/Chicago'
 where coalesce(game_city, venue_city, '') ~* 'pensacola';
update public.teams set timezone = 'America/Denver'
 where coalesce(game_city, venue_city, '') ~* 'el paso';
update public.teams set timezone = 'America/Denver'
 where coalesce(game_city, venue_city, '') ~* '(rapid city|spearfish)';
