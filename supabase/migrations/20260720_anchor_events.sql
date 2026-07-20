-- Anchor events (real-world sporting matchups)
-- ---------------------------------------------------------------------------
-- Promotes the "anchor event" of a fandom game from fields copied onto each
-- games row to a first-class, shared catalog. A TGB game may reference one row
-- here via games.anchor_event_id; the builder still fills the existing
-- denormalized away/home team columns from the chosen event, so the public
-- engines / landing / shop keep working unchanged (backward compatible).
--
-- Teams are referenced by teams.tgbid (the permanent team identity). The row
-- shape mirrors the mc/get_games.html / mc/mlb.html research output so those
-- generators can feed the bulk importer directly.
--
-- Idempotent: safe to re-run.

create table if not exists public.anchor_events (
  id              text primary key,        -- e.g. NFL-2026-09-07-<home_tgbid>-<away_tgbid>
  league          text,                    -- NFL / NBA / NHL / MLB
  sport           text,
  event_date      date,                    -- the REAL matchup date (not the TGB "takeover" date)
  start_time      time,                    -- real local start / kickoff
  away_team_tgbid integer references public.teams(tgbid),
  home_team_tgbid integer references public.teams(tgbid),
  away_label      text,                    -- optional free-text display fallback
  home_label      text,
  venue_name      text,
  city            text,
  status          text,                    -- scheduled / final / postponed / ...
  away_score      integer,
  home_score      integer,
  source          text,                    -- where the row came from (research tool, ESPN, manual)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists anchor_events_date_idx        on public.anchor_events (event_date);
create index if not exists anchor_events_away_tgbid_idx  on public.anchor_events (away_team_tgbid);
create index if not exists anchor_events_home_tgbid_idx  on public.anchor_events (home_team_tgbid);

-- Link column on games (nullable — most games are not anchored).
alter table public.games
  add column if not exists anchor_event_id text references public.anchor_events(id);
create index if not exists games_anchor_event_id_idx on public.games (anchor_event_id);

-- keep updated_at fresh
create or replace function public.tgb_touch_anchor_events_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tgb_anchor_events_touch on public.anchor_events;
create trigger tgb_anchor_events_touch
  before update on public.anchor_events
  for each row execute function public.tgb_touch_anchor_events_updated_at();

-- RLS: public read (schedule data is not sensitive and mirrors the teams/games
-- convention); writes restricted to photo admins (the Mission Control gate).
alter table public.anchor_events enable row level security;

drop policy if exists "anchor_events public read"  on public.anchor_events;
drop policy if exists "anchor_events admin insert"  on public.anchor_events;
drop policy if exists "anchor_events admin update"  on public.anchor_events;
drop policy if exists "anchor_events admin delete"  on public.anchor_events;

create policy "anchor_events public read"
  on public.anchor_events for select
  using (true);

create policy "anchor_events admin insert"
  on public.anchor_events for insert
  with check (public.is_photo_admin());

create policy "anchor_events admin update"
  on public.anchor_events for update
  using (public.is_photo_admin())
  with check (public.is_photo_admin());

create policy "anchor_events admin delete"
  on public.anchor_events for delete
  using (public.is_photo_admin());
