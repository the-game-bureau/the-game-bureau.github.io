-- Game play tracking: instances, responses, and events.
--
-- Purpose: record every playthrough of a game, link it to the team leader's
-- email (folded in from the Stripe / gift_codes pipeline) and their chosen team
-- name, and capture each response the team gives — so we can build stats about
-- people playing the games.
--
-- Vocabulary ("team" is overloaded — keep these straight):
--   * SPORTS team   — a pro team a game is based on (public.teams). "Team
--                     colors" (shell/stripe/mask) belong to sports teams. A
--                     game's sports team is reachable via game_id -> games.
--   * GAME BUREAU team — a group of our players, led by a "team leader" and
--                     identified by a chosen team NAME, never a color.
--   * team leader   — the person who buys/leads a play (was loosely "player").
--   * game instance — one playthrough by one Game Bureau team.
--   * route_color   — the engine's blue/black/purple/silver/orange route-
--                     rotation slot assigned to a player team. NOT a sports color.
--
-- Design notes:
--   * All three tables are APPEND-ONLY for anon (insert, no update/delete). The
--     game engines run with the public/anon key, so we never give anon the
--     ability to mutate or read rows. Progress/finish is recorded as events,
--     not by patching the instance — this keeps it abuse-resistant and is a
--     clean event log for analytics.
--   * The engine generates the instance `id` (a uuid) client-side and reuses it
--     for the instance row and every response/event, so no read-back round-trip
--     is needed.
--   * team_leader_email is NOT sent by the client. A SECURITY DEFINER trigger
--     looks the play's access_code up in gift_codes and folds in the verified
--     Stripe email — so anon never touches the admin-only gift_codes table.
--   * Admin reads are gated by public.is_photo_admin() (same pattern as survey /
--     photo_submissions / anytime_replies).
-- Safe to re-run.

-- ── Tables ──────────────────────────────────────────────────────────────────

-- One row per playthrough by one team, led by one team leader.
create table if not exists public.game_instances (
  id                uuid primary key default gen_random_uuid(),  -- engine supplies this
  game_id           text not null,                 -- games.id (e.g. "hou2026bal")
  access_code       text,                          -- gift_codes.code that unlocked this play (null for free)
  gift_code_id      uuid,                          -- gift_codes.id (backfilled by trigger; no hard FK)
  team_leader_email text,                          -- folded in from gift_codes by trigger (Stripe email)
  team_leader_name  text,                          -- the leader's name (best-effort, may arrive via a response)
  team_name         text,                          -- the Game Bureau (player) team's chosen name
  route_color       text,                          -- engine route-rotation slot (blue/black/...); NOT a sports-team color
  engine            text,                          -- 'text' | 'map'
  mode              text,                          -- 'solo' | ...
  player_device_id  text,                          -- the engine's localStorage device id (dedupe/debug)
  session           text,                          -- the `session` URL param, if any
  stops_total       integer,                       -- number of stops/waypoints in the route at start
  user_agent        text,
  page_url          text,
  started_at        timestamptz not null default timezone('utc', now()),
  created_at        timestamptz not null default timezone('utc', now())
);

create index if not exists game_instances_game_created_idx on public.game_instances (game_id, created_at desc);
create index if not exists game_instances_access_code_idx  on public.game_instances (access_code);
create index if not exists game_instances_email_idx        on public.game_instances (lower(team_leader_email));

comment on table public.game_instances is
  'One playthrough by one team. Links a game to a team leader email (folded in from gift_codes) and chosen team name.';

-- Every response a team gives during a play (typed answers, photo markers, etc.).
create table if not exists public.game_responses (
  id             uuid primary key default gen_random_uuid(),
  instance_id    uuid not null references public.game_instances (id) on delete cascade,
  game_id        text not null,
  stop_id        text,                         -- node id of the stop (e.g. "st-01")
  stop_title     text,
  stop_index     integer,                      -- position in the played route
  waypoint_id    bigint,                       -- waypoints.wpid if this stop is a waypoint
  var_name       text,                         -- the storesAs key the answer was saved under
  response_kind  text not null default 'text', -- 'text' | 'photo' | 'photo-skipped' | ...
  response_value text,
  is_correct     boolean,                      -- when the engine knows (matched an answer / accept-any)
  route_color    text,                         -- engine route-rotation slot (not a sports-team color)
  created_at     timestamptz not null default timezone('utc', now())
);

create index if not exists game_responses_instance_idx     on public.game_responses (instance_id, created_at);
create index if not exists game_responses_game_created_idx on public.game_responses (game_id, created_at desc);

comment on table public.game_responses is
  'Each response a team gives during a play, tied to its game_instance and the stop/waypoint it answered.';

-- Lifecycle / analytics events for a play (started, arrived at a waypoint,
-- completed, etc.). Flexible `detail` jsonb for anything stat-worthy.
create table if not exists public.game_events (
  id          uuid primary key default gen_random_uuid(),
  instance_id uuid references public.game_instances (id) on delete cascade,
  game_id     text not null,
  event_type  text not null,                   -- 'started' | 'arrived' | 'completed' | 'navigate' | ...
  stop_id     text,
  stop_index  integer,
  waypoint_id bigint,
  detail      jsonb,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists game_events_instance_idx     on public.game_events (instance_id, created_at);
create index if not exists game_events_game_type_idx    on public.game_events (game_id, event_type, created_at desc);

comment on table public.game_events is
  'Lifecycle/analytics events for a play (started, arrived, completed, ...).';

-- ── Team identity captured before Stripe lives on gift_codes ────────────────
-- The buy modal collects the team name + team leader name before checkout;
-- gs-create-checkout stores them on the gift_codes row. These columns hold them.
alter table if exists public.gift_codes add column if not exists team_name        text;
alter table if exists public.gift_codes add column if not exists team_leader_name text;

-- ── Fold the team leader's identity in from the Stripe / gift_codes pipeline ─
-- SECURITY DEFINER so anon inserts can be enriched without granting anon any
-- access to the admin-only gift_codes table. Copies the verified Stripe email
-- and the pre-Stripe team name / leader name onto the instance when the engine
-- didn't already supply them.
create or replace function public.tgb_link_game_instance_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gc record;
begin
  if new.access_code is not null and length(btrim(new.access_code)) > 0 then
    select gift_codes.id as id,
           coalesce(nullif(btrim(gift_codes.stripe_customer_email), ''),
                    nullif(btrim(gift_codes.buyer_email), '')) as email,
           nullif(btrim(gift_codes.team_name), '')        as team_name,
           nullif(btrim(gift_codes.team_leader_name), '') as team_leader_name
      into gc
      from public.gift_codes
      where upper(btrim(gift_codes.code)) = upper(btrim(new.access_code))
      order by gift_codes.created_at desc
      limit 1;
    if found then
      new.gift_code_id := coalesce(new.gift_code_id, gc.id);
      if new.team_leader_email is null or length(btrim(new.team_leader_email)) = 0 then
        new.team_leader_email := gc.email;
      end if;
      if new.team_name is null or length(btrim(new.team_name)) = 0 then
        new.team_name := gc.team_name;
      end if;
      if new.team_leader_name is null or length(btrim(new.team_leader_name)) = 0 then
        new.team_leader_name := gc.team_leader_name;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tgb_link_game_instance_identity on public.game_instances;
create trigger tgb_link_game_instance_identity
  before insert on public.game_instances
  for each row execute function public.tgb_link_game_instance_identity();

-- ── Grants + RLS (anon append-only; admin reads) ────────────────────────────
grant usage on schema public to anon, authenticated;
grant insert on public.game_instances, public.game_responses, public.game_events to anon, authenticated;
grant select, update, delete on public.game_instances, public.game_responses, public.game_events to authenticated;

alter table public.game_instances enable row level security;
alter table public.game_responses enable row level security;
alter table public.game_events    enable row level security;

-- game_instances
drop policy if exists "Anyone can start a game instance" on public.game_instances;
create policy "Anyone can start a game instance"
  on public.game_instances for insert to anon, authenticated
  with check (length(coalesce(game_id, '')) between 1 and 128);

drop policy if exists "Admins can read game instances" on public.game_instances;
create policy "Admins can read game instances"
  on public.game_instances for select to authenticated using (public.is_photo_admin());

drop policy if exists "Admins can update game instances" on public.game_instances;
create policy "Admins can update game instances"
  on public.game_instances for update to authenticated
  using (public.is_photo_admin()) with check (public.is_photo_admin());

drop policy if exists "Admins can delete game instances" on public.game_instances;
create policy "Admins can delete game instances"
  on public.game_instances for delete to authenticated using (public.is_photo_admin());

-- game_responses
drop policy if exists "Anyone can record a response" on public.game_responses;
create policy "Anyone can record a response"
  on public.game_responses for insert to anon, authenticated
  with check (
    length(coalesce(game_id, '')) between 1 and 128
    and length(coalesce(response_value, '')) <= 8000
  );

drop policy if exists "Admins can read responses" on public.game_responses;
create policy "Admins can read responses"
  on public.game_responses for select to authenticated using (public.is_photo_admin());

drop policy if exists "Admins can update responses" on public.game_responses;
create policy "Admins can update responses"
  on public.game_responses for update to authenticated
  using (public.is_photo_admin()) with check (public.is_photo_admin());

drop policy if exists "Admins can delete responses" on public.game_responses;
create policy "Admins can delete responses"
  on public.game_responses for delete to authenticated using (public.is_photo_admin());

-- game_events
drop policy if exists "Anyone can record an event" on public.game_events;
create policy "Anyone can record an event"
  on public.game_events for insert to anon, authenticated
  with check (length(coalesce(game_id, '')) between 1 and 128);

drop policy if exists "Admins can read events" on public.game_events;
create policy "Admins can read events"
  on public.game_events for select to authenticated using (public.is_photo_admin());

drop policy if exists "Admins can update events" on public.game_events;
create policy "Admins can update events"
  on public.game_events for update to authenticated
  using (public.is_photo_admin()) with check (public.is_photo_admin());

drop policy if exists "Admins can delete events" on public.game_events;
create policy "Admins can delete events"
  on public.game_events for delete to authenticated using (public.is_photo_admin());

-- ── Stats convenience view (admin-gated via security_invoker + RLS) ──────────
create or replace view public.game_play_stats
with (security_invoker = true) as
select
  i.game_id,
  count(distinct i.id)                                   as plays,
  count(distinct lower(i.team_leader_email))
    filter (where i.team_leader_email is not null)       as distinct_leaders,
  count(distinct i.id)
    filter (where c.instance_id is not null)             as completed_plays,
  max(i.created_at)                                       as last_played_at,
  count(r.id)                                            as total_responses
from public.game_instances i
left join public.game_responses r on r.instance_id = i.id
left join (
  select distinct instance_id from public.game_events where event_type = 'completed'
) c on c.instance_id = i.id
group by i.game_id;

grant select on public.game_play_stats to authenticated;

comment on view public.game_play_stats is
  'Per-game play stats (admin-only via RLS on the underlying tables).';
