-- anchor_events: the columns that make it a general EVENT catalog, not just a
-- sports-matchup table.
-- ---------------------------------------------------------------------------
-- 20260720_anchor_events.sql created the table around a single use case: a real
-- NFL/NBA/NHL/MLB matchup a fandom game is built on top of. Every column there
-- assumes two teams. The catalog has since been widened to "any real-world event
-- a game can be anchored to" — a concert, a convention, a festival, an expo —
-- and both mc/anchor-events.html and the builder's Choose Event picker in
-- games/admin/profiles.html already read and write the columns below.
--
-- They were never committed as a migration. That means a database rebuilt from
-- supabase/migrations alone gets a table those pages 400 against, on an unknown
-- column, with no clue in the repo as to what is missing. This closes that gap.
-- If the live database already has them, every statement here is a no-op.
--
-- Why a `kind` column rather than a separate table per event type: the thing a
-- game anchors to is one row with a date, a place and a name. A concert and a
-- kickoff differ only in which of the sports columns are filled, and splitting
-- them would fork games.anchor_event_id into two nullable FKs.

alter table public.anchor_events
  add column if not exists kind        text,   -- sports | concert | convention | festival | expo | other
  add column if not exists title       text,   -- display name; REQUIRED for non-sports rows
  add column if not exists description text,
  add column if not exists url         text,   -- tickets / official page
  add column if not exists end_date    date;   -- multi-day runs (a convention, a festival)

comment on column public.anchor_events.kind is
  'What sort of event this is: sports, concert, convention, festival, expo, other. '
  'Defaults to sports on import when both team columns are filled.';
comment on column public.anchor_events.title is
  'Display name. A sports row can leave it null and fall back to "<away> at <home>"; '
  'every other kind needs it, because the team columns are empty.';
comment on column public.anchor_events.end_date is
  'Last day, for events that run more than one. Null for a single-day event.';

-- The list pages filter and sort on these two.
create index if not exists anchor_events_kind_idx on public.anchor_events (kind);

-- ── Teams, split into locale + mascot ───────────────────────────────────────
-- A sports row used to carry the two clubs as one string each ("Chicago Bears")
-- plus an optional FK into public.teams. The string is the wrong shape: half of
-- what a game does with a team is address the two halves separately — the city
-- is the place the game is played in, the mascot is what the copy calls the
-- opponent — and the FK made the useful form conditional on a join.
--
-- These four columns make an event self-describing: the split lives on the row,
-- so an event needs no teams row to be fully usable. public.teams keeps its own
-- job (colors, the fandom palette) and away_team_tgbid / home_team_tgbid stay
-- as an optional link for the builder's palette auto-fill — but nothing here
-- requires them any more.
--
-- Same vocabulary as public.teams, deliberately: that table already stores
-- first_name / fanbase + mascot rather than one full_name.

alter table public.anchor_events
  add column if not exists away_locale text,   -- 'Chicago', 'New England'
  add column if not exists away_mascot text,   -- 'Bears', 'Patriots'
  add column if not exists home_locale text,
  add column if not exists home_mascot text;

-- ── Neutral site ────────────────────────────────────────────────────────────
-- On an ordinary sports row the home club's city IS the venue city, and a game
-- built there belongs to the home fanbase. At a neutral site neither club is at
-- home: the NFL's international series, a Super Bowl, a bowl game, a neutral
-- kickoff game. That changes what a game built on the event can assume — the
-- host city has no home team in it, and both fanbases are travelling — so it
-- needs to be a column rather than something inferred by comparing city strings,
-- which would misfire on every club whose venue is in a suburb (the Bills'
-- "Buffalo" home game is played in Orchard Park).
--
-- Eventually a neutral-site event is expected to spawn TWO Game Bureau games,
-- one per travelling fanbase. Nothing reads the flag that way yet; for now it
-- only records the fact.

alter table public.anchor_events
  add column if not exists neutral_site boolean not null default false;

comment on column public.anchor_events.neutral_site is
  'True when neither club is at home — international series, Super Bowl, bowl '
  'game, neutral kickoff. Not derivable from the city columns: a normal home '
  'game is often played in a suburb with a different city name.';

create index if not exists anchor_events_neutral_site_idx
  on public.anchor_events (neutral_site) where neutral_site;

comment on column public.anchor_events.away_locale is
  'Where the away club is from — usually a city, sometimes a region ("New England"). Paired with away_mascot.';
comment on column public.anchor_events.away_mascot is
  'The away club''s nickname ("Bears"). Can be two words ("Red Sox").';

-- away_label / home_label stay, and stay correct: the trigger below rebuilds
-- them from the two halves on every write. They are what the builder's event
-- picker falls back to (anchorEventLabel in games/admin/profiles.html), and
-- rewriting that reader is not worth making it depend on this migration.
create or replace function public.tgb_anchor_events_sync_team_labels()
returns trigger language plpgsql as $$
begin
  if new.away_locale is not null or new.away_mascot is not null then
    new.away_label := nullif(btrim(concat_ws(' ', nullif(btrim(new.away_locale), ''),
                                                  nullif(btrim(new.away_mascot), ''))), '');
  end if;
  if new.home_locale is not null or new.home_mascot is not null then
    new.home_label := nullif(btrim(concat_ws(' ', nullif(btrim(new.home_locale), ''),
                                                  nullif(btrim(new.home_mascot), ''))), '');
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_anchor_events_sync_labels on public.anchor_events;
create trigger tgb_anchor_events_sync_labels
  before insert or update on public.anchor_events
  for each row execute function public.tgb_anchor_events_sync_team_labels();

-- Backfill the split out of the labels already in the table.
--
-- The rule is "everything before the last word is the locale", which is right
-- for all 32 NFL clubs and wrong for the handful of two-word mascots in other
-- leagues, so those are named explicitly. A label that is a single word (an
-- unusual row, or junk) is left alone rather than guessed at.
with two_word(mascot) as (
  values ('Red Sox'), ('White Sox'), ('Blue Jays'), ('Maple Leafs'), ('Golden Knights'),
         ('Trail Blazers'), ('Red Wings'), ('Blue Jackets'), ('Golden State'), ('Sky Blue')
),
split as (
  select e.id,
         e.away_label,
         e.home_label,
         (select t.mascot from two_word t where e.away_label like '% ' || t.mascot) as away_two,
         (select t.mascot from two_word t where e.home_label like '% ' || t.mascot) as home_two
    from public.anchor_events e
   where (e.away_locale is null and e.away_mascot is null and e.away_label is not null)
      or (e.home_locale is null and e.home_mascot is null and e.home_label is not null)
)
update public.anchor_events e
   set away_locale = coalesce(e.away_locale, case
         when s.away_label is null then null
         when s.away_two is not null then nullif(btrim(left(s.away_label, length(s.away_label) - length(s.away_two))), '')
         when position(' ' in s.away_label) = 0 then null
         else nullif(btrim(regexp_replace(s.away_label, '\s+\S+$', '')), '')
       end),
       away_mascot = coalesce(e.away_mascot, case
         when s.away_label is null then null
         when s.away_two is not null then s.away_two
         when position(' ' in s.away_label) = 0 then null
         else nullif(btrim(regexp_replace(s.away_label, '^.*\s', '')), '')
       end),
       home_locale = coalesce(e.home_locale, case
         when s.home_label is null then null
         when s.home_two is not null then nullif(btrim(left(s.home_label, length(s.home_label) - length(s.home_two))), '')
         when position(' ' in s.home_label) = 0 then null
         else nullif(btrim(regexp_replace(s.home_label, '\s+\S+$', '')), '')
       end),
       home_mascot = coalesce(e.home_mascot, case
         when s.home_label is null then null
         when s.home_two is not null then s.home_two
         when position(' ' in s.home_label) = 0 then null
         else nullif(btrim(regexp_replace(s.home_label, '^.*\s', '')), '')
       end)
  from split s
 where s.id = e.id;

-- ── Verify ──────────────────────────────────────────────────────────────────
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'anchor_events'
--    order by ordinal_position;
-- Expect: id, league, sport, event_date, start_time, away_team_tgbid,
-- home_team_tgbid, away_label, home_label, venue_name, city, status,
-- away_score, home_score, source, created_at, updated_at, kind, title,
-- description, url, end_date, away_locale, away_mascot, home_locale,
-- home_mascot.
--
-- And that the split came out right — any row where the two halves do not
-- rebuild the label is a backfill miss worth looking at by hand:
--   select id, away_label, away_locale, away_mascot, home_label, home_locale, home_mascot
--     from public.anchor_events
--    where (away_label is not null and away_mascot is null)
--       or (home_label is not null and home_mascot is null);

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Dropping these breaks /data/events.html, mc/anchor-events.html, and the
-- builder's event picker. Only do it if you are also reverting those.
--   alter table public.anchor_events
--     drop column if exists kind,
--     drop column if exists title,
--     drop column if exists description,
--     drop column if exists url,
--     drop column if exists end_date;
