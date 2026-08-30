-- A TRIVIA ID IS A DESTINATION, OR THE CITY THAT DESTINATION IS IN.
--
-- It held the city-and-state alone, which could not say WHOSE question it was:
-- `new-orleans-la` carried a Saints question and a Pelicans question with
-- nothing to tell them apart, and a game against the Pelicans would have asked
-- about the Saints.
--
-- SO THERE ARE TWO SHAPES, AND WHICH ONE A ROW USES IS THE EDITORIAL CALL:
--
--   new-orleans-la-nfl-saints   a question about a CLUB. Full destinations.id.
--   denver-co                   a question about the CITY. Any club there.
--
-- STILL NOT UNIQUE AND STILL NOT A FOREIGN KEY. Many questions share an id, and
-- a city id references nothing that exists as a row -- `destinations.id` is the
-- four-part form, so the two-part city key has no target. The verify block is
-- what catches a typo; nothing in the database will.
--
-- WHY THIS IS WORTH THE PRECISION: it is what makes the two types mean
-- something. **Know Your Enemy** is the HOME club's id, asked of the fandom that
-- travelled; **Super Fan Check** is the VISITING club's own id, asked of its own
-- fans. A city row is asked in either direction. A resolver for one game reads
-- three keys: the host city, the host club, and the visiting club.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083008_trivia_id_is_a_destination.sql

begin;

comment on column public.trivia.id is
  'EITHER a full destinations.id (a question about that club) OR the '
  'city-and-state prefix of one (a question about the city, asked of anybody '
  'there). NOT unique -- a place holds many questions -- and NOT a foreign key: '
  'the city form has no row to reference. A typo is caught by the migration''s '
  'verify block, not by the database.';

-- The two club questions get their club. The Denver one is about the city and
-- stays as it is, which is the whole point of keeping both shapes.
update public.trivia set id = 'new-orleans-la-nfl-saints'
 where id = 'new-orleans-la' and question like '%Super Bowl XLIV%';
update public.trivia set id = 'chicago-il-nfl-bears'
 where id = 'chicago-il' and question like '%Sweetness%';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY. An id must resolve one way or the other, and reading the numbers is
-- the only thing that says so.
--
--   select t.id, t.type,
--          case when exists (select 1 from public.destinations d where d.id = t.id)
--                 then 'club' end as club,
--          case when exists (select 1 from public.destinations d where d.id like t.id || '-%')
--                 then 'city' end as city
--     from public.trivia t order by t.id;
--                                    -- every row must carry at least one
-- ---------------------------------------------------------------------------
