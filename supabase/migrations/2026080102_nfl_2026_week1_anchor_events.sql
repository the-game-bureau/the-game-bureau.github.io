-- Seed: NFL 2026 regular season, Week 1 -> public.anchor_events
-- ---------------------------------------------------------------------------
-- The first real slate in the anchor catalog: 16 games, all 32 clubs, the week
-- TGB games get built around. Source is the league's own schedule release
-- (nfl.com/news/2026-nfl-schedule-release-complete-slate-of-week-1-games),
-- not memory.
--
-- TIMES ARE VENUE-LOCAL, which is what anchor_events.start_time documents and
-- what a player standing outside the stadium needs. The league publishes Week 1
-- in Eastern, so every row was converted; the Eastern broadcast time is kept in
-- the description so the two are reconcilable. Two rows to be careful with:
--   * Patriots at Seahawks is a Wednesday opener (Sept 9), not the usual
--     Thursday — the Super Bowl champion hosts.
--   * 49ers at Rams is played at the Melbourne Cricket Ground. Kickoff is
--     8:35 p.m. ET Thursday Sept 10, which in Melbourne is 10:35 a.m. on
--     FRIDAY SEPT 11 — so this row's event_date is deliberately a day later
--     than the US listing, and its city is Melbourne, not Los Angeles.
--
-- Each club is stored SPLIT — away_locale + away_mascot ('Chicago' + 'Bears'),
-- not one string — so a row says everything a game needs without joining to
-- public.teams. away_label / home_label are not written here at all; the
-- tgb_anchor_events_sync_labels trigger from 2026080101 rebuilds them from the
-- two halves, which is what keeps the builder's event picker reading correctly.
--
-- away_team_tgbid / home_team_tgbid are left NULL, and that is fine: the link
-- to public.teams is now optional, worth filling only if you want the builder
-- to auto-fill a game's teams and pull the fandom color palette off the away
-- club. The UPDATE ... FROM at the bottom does it when you want it.
--
-- Idempotent: on conflict (id) do nothing, so a re-run adds nothing and never
-- overwrites an edit made in the admin.

insert into public.anchor_events
  (id, kind, title, description, league, sport, event_date, start_time,
   away_locale, away_mascot, home_locale, home_mascot, venue_name, city, status, neutral_site, source)
values
  ('NFL-2026-W1-SEA-NE',  'sports', 'New England Patriots at Seattle Seahawks',      'Week 1 Wednesday opener; 8:20 p.m. ET.', 'NFL', 'Football', '2026-09-09', '17:20', 'New England', 'Patriots', 'Seattle', 'Seahawks',      'Lumen Field',                      'Seattle, Washington',        'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-LAR-SF',  'sports', 'San Francisco 49ers at Los Angeles Rams',       'Week 1 in Melbourne; 8:35 p.m. ET Thursday Sept 10, which is Friday morning local.', 'NFL', 'Football', '2026-09-11', '10:35', 'San Francisco', '49ers', 'Los Angeles', 'Rams',      'Melbourne Cricket Ground',         'Melbourne, Australia',       'scheduled', true, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-CAR-CHI', 'sports', 'Chicago Bears at Carolina Panthers',            'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'Chicago', 'Bears', 'Carolina', 'Panthers',     'Bank of America Stadium',          'Charlotte, North Carolina',  'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-CIN-TB',  'sports', 'Tampa Bay Buccaneers at Cincinnati Bengals',    'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'Tampa Bay', 'Buccaneers', 'Cincinnati', 'Bengals',    'Paycor Stadium',                   'Cincinnati, Ohio',           'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-DET-NO',  'sports', 'New Orleans Saints at Detroit Lions',           'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'New Orleans', 'Saints', 'Detroit', 'Lions',         'Ford Field',                       'Detroit, Michigan',          'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-HOU-BUF', 'sports', 'Buffalo Bills at Houston Texans',               'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '12:00', 'Buffalo', 'Bills', 'Houston', 'Texans',        'NRG Stadium',                      'Houston, Texas',             'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-IND-BAL', 'sports', 'Baltimore Ravens at Indianapolis Colts',        'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'Baltimore', 'Ravens', 'Indianapolis', 'Colts',    'Lucas Oil Stadium',                'Indianapolis, Indiana',      'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-JAX-CLE', 'sports', 'Cleveland Browns at Jacksonville Jaguars',      'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'Cleveland', 'Browns', 'Jacksonville', 'Jaguars',  'EverBank Stadium',                 'Jacksonville, Florida',      'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-PIT-ATL', 'sports', 'Atlanta Falcons at Pittsburgh Steelers',        'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:00', 'Atlanta', 'Falcons', 'Pittsburgh', 'Steelers',   'Acrisure Stadium',                 'Pittsburgh, Pennsylvania',   'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-TEN-NYJ', 'sports', 'New York Jets at Tennessee Titans',             'Week 1; 1:00 p.m. ET.',  'NFL', 'Football', '2026-09-13', '12:00', 'New York', 'Jets', 'Tennessee', 'Titans',      'Nissan Stadium',                   'Nashville, Tennessee',       'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-LAC-ARI', 'sports', 'Arizona Cardinals at Los Angeles Chargers',     'Week 1; 4:25 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:25', 'Arizona', 'Cardinals', 'Los Angeles', 'Chargers',  'SoFi Stadium',                     'Inglewood, California',      'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-LV-MIA',  'sports', 'Miami Dolphins at Las Vegas Raiders',           'Week 1; 4:25 p.m. ET.',  'NFL', 'Football', '2026-09-13', '13:25', 'Miami', 'Dolphins', 'Las Vegas', 'Raiders',     'Allegiant Stadium',                'Las Vegas, Nevada',          'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-MIN-GB',  'sports', 'Green Bay Packers at Minnesota Vikings',        'Week 1; 4:25 p.m. ET.',  'NFL', 'Football', '2026-09-13', '15:25', 'Green Bay', 'Packers', 'Minnesota', 'Vikings',     'U.S. Bank Stadium',                'Minneapolis, Minnesota',     'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-PHI-WAS', 'sports', 'Washington Commanders at Philadelphia Eagles',  'Week 1; 4:25 p.m. ET.',  'NFL', 'Football', '2026-09-13', '16:25', 'Washington', 'Commanders', 'Philadelphia', 'Eagles',   'Lincoln Financial Field',          'Philadelphia, Pennsylvania', 'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-NYG-DAL', 'sports', 'Dallas Cowboys at New York Giants',             'Week 1 Sunday night; 8:20 p.m. ET.', 'NFL', 'Football', '2026-09-13', '20:20', 'Dallas', 'Cowboys', 'New York', 'Giants',       'MetLife Stadium',                  'East Rutherford, New Jersey', 'scheduled', false, 'NFL.com 2026 schedule release'),
  ('NFL-2026-W1-KC-DEN',  'sports', 'Denver Broncos at Kansas City Chiefs',          'Week 1 Monday night; 8:15 p.m. ET.', 'NFL', 'Football', '2026-09-14', '19:15', 'Denver', 'Broncos', 'Kansas City', 'Chiefs',    'GEHA Field at Arrowhead Stadium',  'Kansas City, Missouri',      'scheduled', false, 'NFL.com 2026 schedule release')
on conflict (id) do nothing;

-- The Melbourne game is the one neutral site in Week 1: it is nominally a Rams
-- home game, but it is played at the Melbourne Cricket Ground and neither club
-- is anywhere near home. Set separately as well as in the insert above, because
-- `on conflict do nothing` will not touch a row from an earlier run of this file.
update public.anchor_events
   set neutral_site = true
 where id = 'NFL-2026-W1-LAR-SF' and neutral_site is distinct from true;

-- ── OPTIONAL: link to public.teams ──────────────────────────────────────────
-- Only needed for the builder's team auto-fill and the fandom color palette.
-- The events themselves are complete without it. Matching on the mascot alone
-- is the reliable half — locales disagree between sources (Carolina vs
-- Charlotte, New England vs Boston) far more often than mascots do — so eyeball
-- the SELECT before running the UPDATEs; anything unmatched just stays null.
--
--   select e.id, e.away_mascot, a.tgbid as away_match, e.home_mascot, h.tgbid as home_match
--     from public.anchor_events e
--     left join public.teams a on a.mascot = e.away_mascot
--     left join public.teams h on h.mascot = e.home_mascot
--    where e.id like 'NFL-2026-W1-%'
--    order by e.event_date, e.id;
--
--   update public.anchor_events e
--      set away_team_tgbid = a.tgbid
--     from public.teams a
--    where e.id like 'NFL-2026-W1-%' and e.away_team_tgbid is null
--      and a.mascot = e.away_mascot;
--
--   update public.anchor_events e
--      set home_team_tgbid = h.tgbid
--     from public.teams h
--    where e.id like 'NFL-2026-W1-%' and e.home_team_tgbid is null
--      and h.mascot = e.home_mascot;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect 16 rows, and 32 distinct clubs across the two label columns:
--   select count(*) from public.anchor_events where id like 'NFL-2026-W1-%';
--   select count(distinct t) from (
--     select away_mascot t from public.anchor_events where id like 'NFL-2026-W1-%'
--     union all
--     select home_mascot   from public.anchor_events where id like 'NFL-2026-W1-%') s;
--
-- And that the trigger rebuilt the one-string form:
--   select id, away_label, home_label from public.anchor_events
--    where id like 'NFL-2026-W1-%' order by id;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Fails if a game already points at one of these; unlink those games first.
--   delete from public.anchor_events where id like 'NFL-2026-W1-%';
