-- THE NHL JOINS THE DESTINATIONS, 32 ROWS.
--
-- `teams.fanbase` again, and it is right for 31 of 32 with one call to make.
--
-- NEWARK, NOT NEW JERSEY AND NOT NEW YORK. `city_name` says New York for the
-- Devils, which is simply wrong: the Prudential Center is in downtown Newark and
-- New Jersey is not a city. `fanbase` says Newark, so Newark is the row, with
-- `new jersey`, `nj` and `jersey` as aliases -- **which is the Brooklyn shape**:
-- file the real, walkable place and let the familiar name reach it.
--
-- WHAT IS NOT A VENUE TOWN HERE, since three look like one and are not:
--   ANAHEIM is the club's own name and a real city with its own downtown.
--   SAN JOSE is a real city, and is the answer `teams.city_name` wrongly gave
--     the 49ers, which is why this seed reads `fanbase`.
--   MIAMI is right for the Florida Panthers: they play in Sunrise, and Sunrise
--     is exactly the kind of town nobody takes over. The fanbase rule already
--     did this correctly.
--
-- SEVEN CANADIAN ROWS. Their provinces are two letters, so they pass the state
-- CHECK the way Toronto did: **by luck rather than by design.** There is still
-- no `country` column, and this is now 8 rows depending on that coincidence.
--
-- AN ALIAS MAY BE SHARED, and two here are on purpose: `carolina` now reaches
-- the Panthers and the Hurricanes, `tennessee` the Titans and the Predators.
-- Both clubs really are called that, and a fan typing it means either.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083012_destinations_nhl.sql

begin;

insert into public.destinations (city, state, league, nickname)
select
  btrim(split_part(t.fanbase, ',', 1)),
  upper(btrim(split_part(t.fanbase, ',', 2))),
  t.league,
  btrim(t.mascot)
  from public.teams t
 where t.league = 'NHL'
   and coalesce(btrim(t.fanbase), '') <> ''
   and coalesce(btrim(t.mascot), '') <> ''
on conflict (id) do nothing;

update public.destinations d set aliases = v.a
  from (values
    -- The club's familiar name is not its city.
    ('newark-nj-nhl-devils',            array['new jersey','nj','jersey']),
    ('salt-lake-city-ut-nhl-mammoth',   array['utah','slc']),
    ('miami-fl-nhl-panthers',           array['florida']),
    ('raleigh-nc-nhl-hurricanes',       array['carolina','canes']),
    ('minneapolis-mn-nhl-wild',         array['minnesota','twin cities']),
    ('nashville-tn-nhl-predators',      array['tennessee','preds']),
    ('anaheim-ca-nhl-ducks',            array['orange county','oc']),
    ('san-jose-ca-nhl-sharks',          array['bay area']),

    -- Shorthand people actually use.
    ('new-york-ny-nhl-islanders',       array['nyc','new york city','long island','isles']),
    ('new-york-ny-nhl-rangers',         array['nyc','new york city']),
    ('los-angeles-ca-nhl-kings',        array['la','l.a.']),
    ('washington-dc-nhl-capitals',      array['dc','d.c.','washington dc','caps']),
    ('las-vegas-nv-nhl-golden-knights', array['vegas','vgk']),
    ('toronto-on-nhl-maple-leafs',      array['the six','leafs']),
    ('montreal-qc-nhl-canadiens',       array['habs','mtl']),
    ('ottawa-on-nhl-senators',          array['sens']),
    ('st-louis-mo-nhl-blues',           array['stl']),
    ('tampa-fl-nhl-lightning',          array['tampa bay','bolts']),
    ('philadelphia-pa-nhl-flyers',      array['philly']),
    ('pittsburgh-pa-nhl-penguins',      array['pens']),
    ('detroit-mi-nhl-red-wings',        array['wings']),
    ('columbus-oh-nhl-blue-jackets',    array['cbj']),
    ('chicago-il-nhl-blackhawks',       array['hawks']),
    ('denver-co-nhl-avalanche',         array['avs']),
    ('dallas-tx-nhl-stars',             array['dfw'])
  ) as v(id, a)
 where d.id = v.id;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY.
--   select league, count(*) from public.destinations group by 1 order by 1;
--                                              -- NBA 30, NFL 32, NHL 32 = 94
--   -- no alias names ANOTHER destination's city:
--   select distinct a from public.destinations d, unnest(d.aliases) a
--    where exists (select 1 from public.destinations x
--                   where lower(x.city) = a and lower(x.city) <> lower(d.city));
--                                                            -- expect 0 rows
--   -- the venue-town rule held:
--   select city from public.destinations where city in
--     ('Sunrise','Elmont','Uniondale','East Rutherford','Glendale');
--                                                            -- expect 0 rows
-- ---------------------------------------------------------------------------
