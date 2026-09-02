-- ABILENE CHRISTIAN GETS ITS CITY. 2026-09-01.
--
-- `abilene-christian-wildcats` carried no city. Abilene Christian University is
-- in Abilene, Texas, and `audiences.city` holds the canonical `City, ST` form
-- that every other row uses.
--
-- **`abilene-tx` IS NOT IN `public.places`, and that is said rather than fixed
-- here.** The city is stored and is real: the badge draws it, the search finds
-- it, and the city lists in TGB Atlas and the Stop Builder pick it up, because
-- all three read `audiences.city` directly.
--
-- WHAT IT DOES NOT DO until the place exists: `destinations` joins
-- `places ON p.id = tgb_slug(a.city)`, so this club still does not appear
-- there, and `tgb_anti_audience` still cannot make it anybody's rival. That is
-- exactly the state the room warns about in its own words when a city is typed
-- that we do not hold -- **the warning is the only thing that says so**, since
-- 2026090119 dropped the foreign key.
--
-- ADDING THE PLACE IS ONE ROW AND IS A SEPARATE DECISION:
--   insert into public.places (city, state) values ('Abilene', 'TX');
-- `places.id` is generated as `city-state`, so it needs no key.
--
-- apply by hand: supabase db query --linked --file <this file>

update public.audiences
   set city = 'Abilene, TX'
 where id = 'abilene-christian-wildcats';

-- ---------------------------------------------------------------------------
-- Verify. The value, and the thing it does NOT yet reach.
-- ---------------------------------------------------------------------------
-- select id, full_name, first, last, city,
--        (select count(*) from public.places p where p.id = public.tgb_slug(a.city)) as place_exists,
--        (select count(*) from public.destinations d where d.id like 'abilene%') as in_destinations
--   from public.audiences a where id = 'abilene-christian-wildcats';
