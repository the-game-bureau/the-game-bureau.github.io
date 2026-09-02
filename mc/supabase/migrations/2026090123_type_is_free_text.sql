-- `type` IS FREE TEXT. 2026-09-01.
--
-- `audiences_type` restricted the column to four words, so a fifth was refused
-- by the database -- and the room could not offer a fifth either without a
-- migration. **Typing `history` where the CHECK wanted `historical` came back as
-- a 23514 naming a constraint**, which is a statement about our schema rather
-- than something the person typing can act on.
--
-- THE CONSTRAINT IS DROPPED. The column takes any text, or nothing.
--
-- ---------------------------------------------------------------------------
-- WHAT IT COSTS, AND IT IS THE SAME TRADE THE CITY ALREADY MAKES
-- ---------------------------------------------------------------------------
-- Three readers filter on `type = 'sports'`, so a typo silently drops a club out
-- of all three and nothing says so:
--
--   VIEW destinations         a game cannot find it as a rival
--   VIEW teams                the engines cannot resolve it as a club
--   VIEW game_possibilities   it generates no games
--
-- **That is exactly what `waypoints.city` and `events.venue_city` already do**,
-- and the reasoning is the same: nothing stops two spellings of one word, and no
-- screen will tell you. What softens it here is that the room draws the type on
-- every badge and colours the four it knows -- a fifth spelling renders in the
-- `bad` chip, which is the one thing on screen that would say so.
--
-- NOTHING IS BACKFILLED AND NOTHING MOVES. Every row keeps the value it has:
-- 639 sports, and the artist and the interest. This removes a refusal, not a
-- meaning.
--
-- REVERSIBLE, and the statement is at the foot -- but putting it back needs
-- every row to hold one of the listed values first, which is the point of the
-- distinct-values query in the verify block.
--
-- apply by hand: supabase db query --linked --file <this file>

begin;

alter table public.audiences drop constraint audiences_type;

comment on column public.audiences.type is
  'Free text. sports | artist | interest | historical are the four the room '
  'knows and colours; anything else is allowed and renders in the bad chip. '
  'NULL on a row nobody has typed yet. The CHECK was dropped by 2026090123 so '
  'a fifth kind needs no migration -- the cost is that a typo drops the row out '
  'of destinations, teams and game_possibilities in silence.';

commit;

-- ---------------------------------------------------------------------------
-- Verify. PROVED BY A WRITE THAT WOULD HAVE BEEN REFUSED, rolled back -- and by
-- the distinct values, which is what says nothing moved.
-- ---------------------------------------------------------------------------
-- begin;
--   insert into public.audiences (id, full_name, first, last, type)
--        values ('probe-freetype', 'Probe Freetype', 'Probe', 'Freetype', 'history');
--   select type from public.audiences where id = 'probe-freetype';   -- history
-- rollback;
--
-- select type, count(*) from public.audiences group by type order by 2 desc;
--
-- To put it back once every row holds one of the four:
--   alter table public.audiences add constraint audiences_type
--     check (type is null or type in ('sports', 'artist', 'interest', 'historical'));
