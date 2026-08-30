-- THE NBA JOINS THE DESTINATIONS, 30 ROWS.
--
-- Same rule as the NFL seed and the same source: `teams.fanbase`, never
-- `city_name`. It is right for all 30 here, including GOLDEN STATE, which the
-- row already resolves to San Francisco -- correct since the club left Oakland
-- for Chase Center, and the reason this reads the fanbase rather than the club's
-- own name.
--
-- TWO CALLS WERE MADE HERE RATHER THAN LEFT TO THE SEED:
--
--   1. BROOKLYN IS ITS OWN DESTINATION, not New York. Brooklyn is a borough
--      rather than a city, so this bends the "city" rule -- and it is what the
--      fandom IS: the jersey says Brooklyn, Barclays Center is in Brooklyn, and
--      a Nets fan says Brooklyn. That is the opposite of Orchard Park, which
--      nobody claims. The lookup is kept whole by aliases: `new york`, `nyc` and
--      `new york city` all reach it, so a visitor headed to New York is not
--      quietly shown three clubs and told about two.
--   2. TORONTO IS THE FIRST NON-US ROW. `state` holds ON, which passes the
--      two-character CHECK by luck rather than by design -- that column is a
--      postal abbreviation and there is no `country`. **A league with countries
--      whose subdivisions are not two letters needs a column, not a workaround.**
--
-- LOS ANGELES NOW HOLDS FOUR CLUBS across two leagues and NEW YORK three. The
-- nickname is in the key, which is what makes that cost nothing.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083007_destinations_nba.sql

begin;

insert into public.destinations (city, state, league, nickname)
select
  btrim(split_part(t.fanbase, ',', 1)),
  upper(btrim(split_part(t.fanbase, ',', 2))),
  t.league,
  btrim(t.mascot)
  from public.teams t
 where t.league = 'NBA'
   and coalesce(btrim(t.fanbase), '') <> ''
   and coalesce(btrim(t.mascot), '') <> ''
on conflict (id) do nothing;

-- What a fan says. Match only, never printed, lowercase. Nothing here names a
-- venue town or a different real city, which is the standing rule.
update public.destinations d set aliases = v.a
  from (values
    -- The clubs whose familiar name is not their city.
    ('san-francisco-ca-nba-warriors',    array['golden state','bay area','sf','dubs']),
    ('salt-lake-city-ut-nba-jazz',       array['utah','slc']),
    ('indianapolis-in-nba-pacers',       array['indiana','indy']),
    ('minneapolis-mn-nba-timberwolves',  array['minnesota','twin cities','wolves','t-wolves']),

    -- Brooklyn has to stay reachable from New York, since that is where a
    -- visitor thinks they are going.
    ('brooklyn-ny-nba-nets',             array['new york','nyc','new york city','bk']),

    -- Shorthand people actually use.
    ('new-york-ny-nba-knicks',           array['nyc','new york city']),
    ('los-angeles-ca-nba-lakers',        array['la','l.a.']),
    ('los-angeles-ca-nba-clippers',      array['la','l.a.','clips']),
    ('washington-dc-nba-wizards',        array['dc','d.c.','washington dc']),
    ('new-orleans-la-nba-pelicans',      array['nola','pels']),
    ('philadelphia-pa-nba-76ers',        array['philly','sixers']),
    ('oklahoma-city-ok-nba-thunder',     array['okc']),
    ('san-antonio-tx-nba-spurs',         array['sa']),
    ('portland-or-nba-trail-blazers',    array['blazers','pdx']),
    ('toronto-on-nba-raptors',           array['the six','raps']),
    ('memphis-tn-nba-grizzlies',         array['grizz']),
    ('phoenix-az-nba-suns',              array['phx']),
    ('milwaukee-wi-nba-bucks',           array['mke']),
    ('cleveland-oh-nba-cavaliers',       array['cavs']),
    ('dallas-tx-nba-mavericks',          array['mavs','dfw'])
  ) as v(id, a)
 where d.id = v.id;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, and read the numbers.
--
--   select league, count(*) from public.destinations group by 1;  -- NBA 30, NFL 32
--   select count(*) from public.destinations;                     -- 62
--   -- the venue-town rule held:
--   select city from public.destinations where city in
--     ('Oakland','Auburn Hills','East Rutherford','Arlington','Inglewood');
--                                                                 -- 0 rows
--   -- no alias names a different destination's city:
--   select distinct a from public.destinations d, unnest(d.aliases) a
--    where exists (select 1 from public.destinations x where lower(x.city) = a
--                    and lower(x.city) <> lower(d.city));
-- ---------------------------------------------------------------------------
