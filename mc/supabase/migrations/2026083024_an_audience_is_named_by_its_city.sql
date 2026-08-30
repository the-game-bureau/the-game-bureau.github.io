-- AN AUDIENCE IS NAMED BY ITS CITY, NOT BY ITS MASCOT.
--
-- **THE RULE THIS ENFORCES IS ALREADY WRITTEN DOWN: a mascot is a search term,
-- never a label.** A nickname is somebody else's trademark and every public page
-- is a shop window, so the copy has always been meant to say Tampa rather than
-- Buccaneers. Until now that was true only at DISPLAY time, through
-- `tgb_audience_label`; the stored name still said Buccaneers, and every screen
-- that printed `audiences.name` raw printed a trademark.
--
-- ── WHAT MOVES, AND WHAT DELIBERATELY DOES NOT ────────────────────────────
--
--   110 pro clubs take their city.        Buccaneers -> Tampa
--    14 keep the mascot, because the city is shared inside their own league and
--       two clubs cannot answer to one name: Giants and Jets are both New York.
--   499 college clubs are NOT TOUCHED, and that is the important exclusion.
--
-- **RENAMING THE COLLEGES WOULD REPRODUCE A FAILURE THIS PROJECT HAS ALREADY
-- HAD.** 2026083021 records it: the first cut of the copy rule returned the city
-- for everybody and produced **"Tuscaloosa Fans Takeover New Orleans"**, which
-- nobody has ever said. It is not a trademark case either -- `Alabama` is a
-- state and `Georgia` is a state, while their MASCOTS are Crimson Tide and
-- Bulldogs. The trademark rule and the fan-speech rule agree here; only the
-- pro leagues need the change.
--
-- ── THE CITY COMES FROM THE PLACE, NEVER FROM `city_name` ─────────────────
--
-- **`city_name` is wrong for four clubs and blank for every college one.** It
-- says San Jose for the 49ers, Los Angeles for the Ducks, and New York for both
-- the Nets and the Devils. `home_place_id` was built from `fanbase`, which is
-- right in all four cases, so the join through `places` is the source. Using the
-- column would have named a San Francisco club San Jose.
--
-- ── `id` IS GENERATED, SO 115 OF THEM CHANGE ──────────────────────────────
--
-- `id` is `family-slug(name)`, so `nfl-buccaneers` becomes `nfl-tampa`. Checked
-- before writing, not after: **no two rows collide, nothing outside the scope
-- collides, and NO TRIVIA KEY IS AN AUDIENCE ID** -- trivia keys are the family
-- (`nfl`), a place (`new-orleans-la`) or a DESTINATION id, and a destination id
-- is built from the MASCOT plus the place, so it does not move. The one template
-- pinned to an audience is `history-jfk`, which is out of scope.
--
-- ── AND THE SIX MLB ROWS NAMED FOR A CODE ARE FIXED ON THE WAY PAST ───────
--
-- 2026083022 named a club by its CODE where its fanbase collided, so MLB carried
-- `CHC`, `CHW`, `LAA`, `LAD`, `NYM`, `NYY`. Those are the shared-city rows, and
-- they now take the mascot instead: Cubs, White Sox, Angels, Dodgers, Mets,
-- Yankees. A code is not a word any fan says.
--
-- APPLY: cd mc && supabase db query --linked --file supabase/migrations/2026083024_an_audience_is_named_by_its_city.sql

begin;

update public.audiences a
   set name = m.new_name
  from (
    select x.id,
           case when x.sharing = 1 then x.city else x.nickname end as new_name
      from (
        select a2.id, a2.nickname, p.city,
               count(*) over (partition by a2.family, lower(p.city)) as sharing
          from public.audiences a2
          join public.places p on p.id = a2.home_place_id
         -- THE FOUR PRO LEAGUES ONLY. See the header for why college is out.
         where a2.kind = 'fandom'
           and a2.family in ('nfl', 'nba', 'nhl', 'mlb')
      ) x
  ) m
 where a.id = m.id
   and a.name is distinct from m.new_name;

comment on column public.audiences.name is
  'What the audience is CALLED, and it is what a fan says. For a pro club that '
  'is the CITY, because the mascot is somebody else''s trademark and this string '
  'reaches visible copy. For a college club it is the school -- Alabama, LSU -- '
  'because nobody says Tuscaloosa. Where two clubs share a city inside one '
  'league the mascot stays, since one name cannot answer for both. The mascot '
  'itself lives in `nickname` and is for MATCHING, never for printing.';

commit;

-- ---------------------------------------------------------------------------
-- VERIFY, by asking what a reader would see rather than by counting rows.
--
--   select name, nickname from public.audiences where id = 'nfl-tampa';
--                                          -- expect Tampa / Buccaneers
--   select name from public.audiences where team_key = 'NFL:SF';
--                                          -- expect San Francisco, NOT San Jose
--   select name from public.audiences where team_key = 'NBA:BKN';
--                                          -- expect Brooklyn, NOT New York
--   select name from public.audiences where family='ncaaf' and nickname='Crimson Tide';
--                                          -- expect Alabama, NOT Tuscaloosa
--
--   -- the label function needs no change and this is the check that proves it:
--   select public.tgb_audience_label('nfl-tampa'),      -- Tampa
--          public.tgb_audience_label('nfl-giants'),     -- New York
--          public.tgb_audience_label('ncaaf-alabama');  -- Alabama
--
--   -- and nothing lost its key:
--   select count(*) from public.destinations;                   -- expect 140
--   select count(*) from public.trivia t where t.id <> '*'
--     and not exists (select 1 from public.destinations d where d.id = t.id)
--     and not exists (select 1 from public.places p where p.id = t.id)
--     and t.id not in (select lower(league) from public.destinations)
--     and t.id not like 'wp-%';                                 -- expect 0
-- ---------------------------------------------------------------------------
