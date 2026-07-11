-- Apply the public Highlights scoreboard schema WITHOUT dummy data.
--
-- Equivalent end-state to running migrations 2026070101 + 2026070201, but built
-- directly as public.highlights (skipping the game_results->highlights rename
-- dance) and omitting the demo scoreline seed rows. Idempotent / safe to re-run.
--
-- Produces: table public.highlights + compatibility view public.game_results.
-- Depends on public.is_photo_admin() (already present via game_instances RLS).

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.highlights (
  gameid         text not null,
  instanceid     text primary key,
  tgbteamname    text not null,
  tgbteamscore   integer not null default 0,
  opponentname   text not null,
  opponentscore  integer not null default 0,
  winnername     text not null,
  created_at     timestamptz not null default timezone('utc', now()),
  constraint highlights_tgb_score_nonnegative      check (tgbteamscore >= 0),
  constraint highlights_opponent_score_nonnegative check (opponentscore >= 0),
  constraint highlights_gameid_filled       check (length(btrim(gameid)) > 0),
  constraint highlights_instanceid_filled   check (length(btrim(instanceid)) > 0),
  constraint highlights_tgbteamname_filled  check (length(btrim(tgbteamname)) > 0),
  constraint highlights_opponentname_filled check (length(btrim(opponentname)) > 0),
  constraint highlights_winnername_filled   check (length(btrim(winnername)) > 0)
);

create index if not exists highlights_game_created_idx
  on public.highlights (gameid, created_at desc);
create index if not exists highlights_created_idx
  on public.highlights (created_at desc);

comment on table public.highlights is
  'Public Highlights scoreline rows for TGB-vs-opponent game instances.';

-- ── Grants + RLS ─────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;
grant select on public.highlights to anon, authenticated;
grant insert, update, delete on public.highlights to authenticated;

alter table public.highlights enable row level security;

drop policy if exists "Public can read highlights" on public.highlights;
create policy "Public can read highlights"
  on public.highlights for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can insert highlights" on public.highlights;
create policy "Admins can insert highlights"
  on public.highlights for insert
  to authenticated
  with check (public.is_photo_admin());

drop policy if exists "Admins can update highlights" on public.highlights;
create policy "Admins can update highlights"
  on public.highlights for update
  to authenticated
  using (public.is_photo_admin())
  with check (public.is_photo_admin());

drop policy if exists "Admins can delete highlights" on public.highlights;
create policy "Admins can delete highlights"
  on public.highlights for delete
  to authenticated
  using (public.is_photo_admin());

-- ── Compatibility view (older clients that still read game_results) ──────────
create or replace view public.game_results
  with (security_invoker = true)
  as
  select gameid, instanceid, tgbteamname, tgbteamscore,
         opponentname, opponentscore, winnername, created_at
  from public.highlights;

grant select on public.game_results to anon, authenticated;
grant insert, update, delete on public.game_results to authenticated;

comment on view public.game_results is
  'Compatibility view for clients deployed before public.game_results was renamed to public.highlights.';

notify pgrst, 'reload schema';
