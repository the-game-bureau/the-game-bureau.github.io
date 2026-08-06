# Game play tracking — instances, responses, events

Groundwork for recording who plays the games and what they answer, so we can
build stats. Introduced 2026-06-25.

Migration: [`mc/supabase/migrations/20260625_game_instances_responses.sql`](../../../supabase/migrations/20260625_game_instances_responses.sql)
Client: [`game/run/config/instance-tracker.js`](../../../game/run/config/instance-tracker.js) (`window.TgbInstance`)

## Vocabulary

"Team" is overloaded — keep these straight:

- **Sports team** — a pro team (NFL/MLB/…) some games are *based on*. Lives in
  `public.teams`; **team colors** (shell/stripe/mask) belong to sports teams. A
  game's sports team is reachable via `game_id → games`.
- **Game Bureau team** — a group of *our players*, led by a **team leader** and
  identified by a chosen **team name**, never a color.
- **Team leader** — the person who buys/leads a play. (We used to loosely say
  "player".) Their email comes from Stripe; their name/team are chosen in-game.
- **Game instance** — one playthrough by one Game Bureau team. Has a
  client-generated uuid carried for the life of the play.
- **route_color** — the engine's blue/black/purple/silver/orange route-rotation
  slot assigned to a player team. **Not** a sports-team color.

## Tables

| table | one row per | key columns |
|---|---|---|
| `game_instances` | playthrough | `id` (uuid, engine-supplied), `game_id`, `access_code`, `team_leader_email`, `team_leader_name`, `team_name`, `route_color`, `engine`, `mode`, `stops_total` |
| `game_responses` | answer given | `instance_id`→instances, `game_id`, `stop_id`, `stop_title`, `stop_index`, `waypoint_id`, `var_name`, `response_kind`, `response_value`, `is_correct`, `route_color` |
| `game_events` | lifecycle event | `instance_id`, `game_id`, `event_type` (`started`/`arrived`/`completed`/…), `stop_index`, `waypoint_id`, `detail` jsonb |

Plus a `game_play_stats` view (per-game: plays, distinct leaders, completed
plays, total responses) for quick dashboards.

## Security model

- **Append-only for anon.** The engines use the public/anon key. RLS lets anon
  `INSERT` only — no select/update/delete. Progress/finish are recorded as
  *events*, never by mutating a row, so the log is tamper-resistant.
- **Admin reads** are gated by `public.is_photo_admin()` (same pattern as
  `survey` / `photo_submissions`).
- **Email is folded in server-side.** The client never sends the leader email.
  A `SECURITY DEFINER` trigger (`tgb_link_game_instance_identity`) looks the
  play's `access_code` up in `gift_codes` and copies the verified Stripe email
  (`stripe_customer_email`, falling back to `buyer_email`) plus `gift_code_id`.
  This is the link: **Stripe → gift_codes → game_instances → game_responses**.

## How it's wired in the engines

Both `game/run/text/index.html` and `game/run/map/index.html`:

1. Include `../config/instance-tracker.js`.
2. After the route/stops load, call `TgbInstance.start({...})` — ensures an
   instance id (reused per game+code via localStorage), inserts the
   `game_instances` row once, and records a `started` event.
3. On each typed reply (in `_submitHandler`), call `TgbInstance.recordResponse({...})`
   with the stop/waypoint context, the answer, and `is_correct`.
4. On returning from navigator.html (`arrived_wpid`), record an `arrived` event.
5. On finishing the route, record a `completed` event.

Photos already land in `photo_submissions` (with `player_vars`); they are not
duplicated into `game_responses` yet.

## How to apply

This project keeps SQL in `mc/supabase/migrations/`. Apply the new file either via
the Supabase CLI (`supabase db push`) or by pasting it into the Supabase SQL
editor for the project. It is safe to re-run (idempotent).

## Team identity captured before Stripe (done)

The buy modal ([mc/js/gs-buy-modal.js](../../../mc/js/gs-buy-modal.js)) now
collects **team name** + **team leader name** on the intro step (before
checkout). `handleContinue` posts them to `gs-create-checkout`, which stores them
on the `gift_codes` row (columns `team_name`, `team_leader_name`) and in the
Stripe session metadata. When the engine later starts an instance with that
play's `access_code`, the `tgb_link_game_instance_identity` trigger folds the
team name + leader name (and the Stripe email) onto `game_instances` when the
engine didn't already supply them. Both fields are optional (gift purchases may
leave them blank; the in-game `player_name` reply is still recorded as a
fallback).

## Admin stats page (done)

[gifts/giftcards.html](../../../gifts/giftcards.html) has a **Game Play Stats** panel that
reads `game_play_stats` (admin-gated) and shows per-game plays / distinct team
leaders / completed plays / total responses / last played, with game names
resolved from `games`.

## Next steps

- **Record photo responses** into `game_responses` (kind `photo`) alongside the
  existing `photo_submissions` write, if a single response log is wanted.
- Consider migrating existing `player_*` naming toward `team_leader_*` across
  older surfaces (kept as-is for now to avoid churn).
