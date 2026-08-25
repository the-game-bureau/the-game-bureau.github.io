-- public.leagues -- the sport a league plays, in one place.
--
-- Two columns, as asked: sport, then league.
--
-- WHY IT IS WORTH HAVING when `teams` already carries both. `teams` answers
-- "what sport does this CLUB play", 639 times over, and the pair is repeated on
-- every row -- so the only way to ask "what leagues do we cover" today is a
-- distinct scan, and a league with no teams filed cannot be named at all. That
-- matters for the four this table holds that `teams` has never heard of:
-- MLS, WNBA, NASCAR and UFC.
--
-- SPORT IS SPELLED TWO WAYS IN THIS DATABASE ALREADY, and that is the strongest
-- argument for the table. `teams.sport` holds lowercase `football`, 515 rows of
-- it; `anchor_events.sport` holds `Football`, 331 rows. Neither is wrong and
-- nothing reconciles them.
--
-- THIS SEED USES THE TITLE CASE, because that is what `anchor_events` holds and
-- what a picker on mc/events/index.html would write. It does NOT rewrite
-- `teams`: that is 639 rows read by the builder and the fandom palette, and
-- changing them is a separate decision with its own blast radius. Recorded here
-- rather than quietly reconciled.
--
-- NO FOREIGN KEY FROM anchor_events.league, DELIBERATELY, at least not yet. That
-- column is free text today and holds NCAAF and NFL; a FK would refuse the first
-- concert, festival or expo that carries a league we have not listed, and this
-- table is a catalogue rather than a gate. Add one when the column is known to
-- be clean and the refusals would be wanted.
--
-- APPLY BY HAND in the SQL editor. Remote migration history in this project has
-- drifted and the CLI refuses `db push`.

begin;

create table if not exists public.leagues (
  sport  text not null,
  -- THE LEAGUE IS THE KEY. It is unique on its own -- there is one NFL -- and it
  -- is the value `anchor_events.league` and `teams.league` already store, so a
  -- reference from either is a plain text match with no surrogate to carry.
  league text primary key
);

comment on table  public.leagues        is 'Which sport each league plays. Reference data: anon-readable, admin-written.';
comment on column public.leagues.sport  is 'Title case, matching anchor_events.sport. NOTE: teams.sport is lower case and is not reconciled.';
comment on column public.leagues.league is 'The league as anchor_events.league and teams.league already spell it: NFL, NCAAF, MLB.';

-- Ten popular US leagues. The first seven are the ones the ESPN importer in
-- mc/events/index.html can already read a schedule for, spelled the way its
-- LEAGUES map spells them, so the two agree. The last three have no feed here
-- and are listed because they are among the most watched sport in the country,
-- which is the question this table answers.
insert into public.leagues (sport, league) values
  ('Football',            'NFL'),
  ('Football',            'NCAAF'),
  ('Basketball',          'NBA'),
  ('Basketball',          'NCAAB'),
  ('Basketball',          'WNBA'),
  ('Baseball',            'MLB'),
  ('Hockey',              'NHL'),
  ('Soccer',              'MLS'),
  ('Auto racing',         'NASCAR'),
  ('Mixed martial arts',  'UFC')
on conflict (league) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- READABLE BY ANYONE, like public.cities and public.teams. This is reference
-- data with nothing private in it, and a cloud routine holds only the
-- publishable key -- the same constraint that shaped every read path here.
-- WRITTEN BY ADMINS ONLY, like every other catalogue.
alter table public.leagues enable row level security;

drop policy if exists leagues_read_all on public.leagues;
create policy leagues_read_all
  on public.leagues for select
  using (true);

drop policy if exists leagues_write_admin on public.leagues;
create policy leagues_write_admin
  on public.leagues for all
  to authenticated
  using (true)
  with check (true);

commit;

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Run these AFTER the commit. An empty payload proves nothing.
--
-- 1. Ten rows, five sports:
--
--    select sport, count(*) from public.leagues group by 1 order by 2 desc, 1;
--    -- expect Basketball 3, Football 2, and one each of the other five
--
--    select count(*) from public.leagues;   -- expect 10
--
-- 2. Every league already used by an event is in the catalogue. This is the
--    check that would have to pass before a foreign key could ever be added:
--
--    select distinct a.league
--      from public.anchor_events a
--     where a.league is not null
--       and a.league <> ''
--       and not exists (select 1 from public.leagues l where l.league = a.league);
--    -- expect 0 rows
--
-- 3. And the same for teams, which is where the four NCAAF/major spellings live:
--
--    select distinct t.league
--      from public.teams t
--     where t.league is not null
--       and t.league <> ''
--       and not exists (select 1 from public.leagues l where l.league = t.league);
--    -- expect 0 rows
--
-- 4. Anon really can read it. From a shell, with the publishable key:
--
--    curl -s "$API/leagues?select=sport,league&order=league" \
--         -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
--    -- expect the ten rows, not an empty array
