# the-game-bureau — project notes

Durable project knowledge for Claude Code (and any teammate working in this repo). Auto-loaded by Claude Code every session. **Do not put secrets in this file** — it's committed to git and the site is published via GitHub Pages, so anything here is technically reachable on the public web.

---

## Game play tracking (instances / responses / events)

**"Team" is two different things:** a **sports team** is a pro team a game is based on (`public.teams`; **team colors** = shell/stripe/mask belong here), reachable via `game_id → games`. A **Game Bureau team** is a group of our players, led by a **team leader** and identified by a chosen **team name**, never a color. The engine's blue/black/purple/silver/orange value is a **route-rotation slot** (`route_color`), not a sports-team color — don't label Game Bureau teams with it.

Playthroughs are recorded for stats. A **team leader** (the buyer/leader — we used to say "player") plays a **game instance** (one playthrough by one Game Bureau team, a client-generated uuid). Tables: `game_instances`, `game_responses`, `game_events`, plus a `game_play_stats` view. Schema: [supabase/migrations/20260625_game_instances_responses.sql](supabase/migrations/20260625_game_instances_responses.sql); client: [game/run/config/instance-tracker.js](game/run/config/instance-tracker.js) (`window.TgbInstance`), wired into both engines. Full write-up: [_dev/docs/supabase/game-instances-responses.md](_dev/docs/supabase/game-instances-responses.md).

- **Append-only for anon** (engines use the anon key): RLS allows `INSERT` only; admin reads gated by `is_photo_admin()`. Don't add anon update/delete — record progress as `game_events`, not by mutating rows.
- **Team leader email is folded in server-side**, never sent by the client: the `tgb_link_game_instance_identity` SECURITY DEFINER trigger looks the play's `access_code` up in `gift_codes` and copies the Stripe email. The link is **Stripe → gift_codes → game_instances → game_responses**.
- Team name + team leader name are collected *before* Stripe in the buy modal (`mc/js/gs-buy-modal.js`) and written to `gift_codes` (`team_name`, `team_leader_name`) by `gs-create-checkout`; the instance trigger folds them onto the play. They're also best-effort on the instance (chosen in-game), and the authoritative team name is recoverable from `game_responses` (the `player_name` var). `route_color` is the engine route slot, not a sports color.
- Admin stats live in [shop/giftcards.html](shop/giftcards.html) ("Game Play Stats" panel, reads the `game_play_stats` view).

---

## Site layout & deployment

- Published as a GitHub Pages site with `.nojekyll`, so files are served as-is (no Jekyll processing).
- The GitHub remote `the-game-bureau/the-game-bureau` is a **redirect** — the repo was renamed to `the-game-bureau/the-game-bureau.github.io` (the GitHub Pages convention). Both slugs resolve to the same content. Prefer the custom domain `https://thegamebureau.com/...` for in-product references — it's stable regardless of the repo's rename state.

---

### Site pages

Use **"site pages"** to mean the public-site pages that share the same navigation and public chrome:

- [index.html](index.html)
- every file matched by `account/**/*.html`
- every file matched by `birthdayball/**/*.html`
- every file matched by `how/**/*.html`
- every file matched by `ww/**/*.html`
- [shop/index.html](shop/index.html) — the public shop (formerly `/gifts/`; renamed 2026-06-26). Only `shop/index.html` is a site page; the other files under `shop/` (`admin/index.html` — the gift-shop admin, formerly `gs-shop.html`; `giftcards.html` — access-codes + Game Play Stats, formerly `gs-codes.html`; `scripts/`; `shop_banner.png`) are moved gift-shop admin/assets that keep Mission Control chrome, not public chrome.
- every file matched by `sampler/**/*.html`
- every file matched by `survey/**/*.html`
- every file matched by `assets/**/*.html`

This grouping is the public website surface for shared chrome work such as navigation, shared public CSS, metadata, and broad visual consistency. If a future task says "update the site pages nav," apply it to [index.html](index.html), `/account/**/*.html`, `/birthdayball/**/*.html`, `/how/**/*.html`, `/ww/**/*.html`, `/shop/index.html`, `/sampler/**/*.html`, `/survey/**/*.html`, and `/assets/**/*.html` pages together. The site pages nav centers the primary `GAMES` and `GIFTS` links and keeps How It Works and Winner's Wall as utility links. The `GIFTS` nav link keeps its label but points at `/shop/`; the old `/gifts/` path was removed (hard break, no redirect) on 2026-06-26. As of 2026-05-27 the public nav has no visible Login / Mission Control entry — admins reach `/mc/*` by typing the URL directly. The three admin scripts (`/mc/js/admin-auth.js`, `/assets/admin-bridge.js`, `/assets/site-nav-login.js`) are still included on public pages so an admin who is already signed in still sees the floating EDIT buttons painted by `admin-bridge.js`; only the visible Login UI was stripped. The shared site pages CSS lives at [assets/site-pages.css](assets/site-pages.css).

---

## Canonical game hierarchy

Use this product vocabulary everywhere new UI, code, data, and documentation are created:

- A **Game** contains one or more **Routes**.
- A **Route** contains an ordered list of **Stops**.
- A **Stop** combines one **Place** with one **Challenge**.
- A **Place** is a reusable real-world point with geographic metadata such as city, address, coordinates, Plus Code, or what3words.
- A **Challenge** is the playable content at a Stop: prompts, clues, media, mini-games, and player replies.

Use `location` only for technical geographic fields and browser APIs. `waypoint`, `waypointGroup`, `waypoint_group`, and route `waypoints` are legacy compatibility vocabulary only; do not create new writes or UI with those names.

---

## Game player URLs & engines

Canonical public URL for a game:

```
https://thegamebureau.com/game/run/?id={game-id}
https://thegamebureau.com/game/run/?game={game-name}
```

`/game/run/index.html` is the **landing page** (hero, intro, price, Start button). The Start button forwards to the chosen engine. Engines live as sibling folders under [/game/run/](game/run/):

- **`text`** (default — used when `e` is absent or unknown) → [game/run/text/](game/run/text/) — iMessage-style chat engine.
- **`map`** → [game/run/map/](game/run/map/) — parchment map / pin engine; tapping the pin starts the message flow.

Legacy numeric values are aliased: `e=1` → text, `e=2` → map. Both `?id=` and `?game=` are accepted by the engines themselves.

The Supabase `games` record carries an `engine` column (string, nullable; values like `text` or `map`). Precedence on the landing page: **URL `?e=` → DB `engine` column → default (`text`)**.

Shared, non-engine-specific assets (e.g. `config/lemon-config.js`) live at [game/run/config/](game/run/config/).

**Adding an engine:** drop a new folder under `/game/run/` and add a key/value to the `ENGINES` map in the Start-button code inside [game/run/index.html](game/run/index.html).

**History:** Until 2026-05-17 engines lived under `/game/play/` and `/game/play/index.html` was a thin router. That folder was merged into `/game/run/` and the router was deleted. Old `/game/play/...` URLs no longer resolve.

---

## Start locations & rendezvous maps — long Google Plus Codes

Start locations are **stored as long/global Google Plus Codes** in the `games` table (`starting_location_plus_code`). That column is the source of truth for the rendezvous point. `starting_location_lat` / `starting_location_lon` stay populated only as decoded compatibility fields for local maps, weather, reverse-geocoding, and older surfaces.

- **Builder** ([mc/builder.html](mc/builder.html)): the "Start Plus Code" field shows/accepts a Plus Code and writes `starting_location_plus_code`. It also decodes the code into `starting_location_lat` / `starting_location_lon` for compatibility. It has a self-contained Open Location Code codec (`encodePlusCode` / `decodePlusCode` / `recoverNearestPlusCode`) near `parseCoordinatePair`. Typed input accepts a full code, a short code (`76VW+59` recovered against the game's existing coords, else its City via Nominatim), or raw lat/lon; all are normalized to the long/global code on save. **Generate** geocodes the Start Name + Start Address + City via Nominatim, then stores the encoded code. There is no standalone Mission Control starting-locations page; edit these values in Builder.
- **Landing page** ([game/run/index.html](game/run/index.html)): every rendezvous map / directions surface (background map, directions lightbox, "open in Maps" link, share link) uses the stored `starting_location_plus_code` first, decodes it for local map/weather UI, and falls back to lat/lon only for legacy rows missing the code.

**Always use the LONG / global code** (e.g. `8FVC9G8F+6XQ`), not a short code (`9G8F+6X`). The long form resolves anywhere with no locality; the maps get only the code, so a short code would fail to resolve. The default code length is 11 chars (≈3.5 m) and **must match between the two files** so the builder's displayed code equals what the map uses.

**Why a Plus Code instead of address/lat,lon for maps:** it pins the exact meeting point and never reverse-resolves the coordinates to a nearby business (the old failure mode, e.g. "Shop Science"). In `getDestinationParam` the precedence is **stored Plus Code -> derived Plus Code from legacy lat/lon -> typed Start Address (only when there are no coordinates)**. The Plus Code's `+` must be `encodeURIComponent`'d (`%2B`) before going into a query string.

**How to apply:** The codec is **duplicated** in the two files (not shared) — like `TEAM_COLOR_ORDER`, keep them in sync. If you extract it to a shared module under `/game/run/config/`, update this section. When adding the new `starting_location_*` meta fields, remember the `initGameMeta` camelCase-fallback rule below.

---

## Team color → stop rotation offset

The game rotates stops within a `stopGroup` (A–E) using a Latin-square offset keyed off `vars['team_color']`. The mapping lives in `TEAM_COLOR_ORDER`, defined **separately in each engine**:

- [game/run/text/index.html](game/run/text/index.html) (~line 1305)
- [game/run/map/index.html](game/run/map/index.html) (~line 1560)

Both files also define `getTeamColorRotationIndex` and `getStopRotationOffset` directly below the array.

| team_color (case-insensitive) | offset |
|---|---|
| BLUE | 0 |
| BLACK | 1 |
| PURPLE | 2 |
| SILVER | 3 |
| ORANGE | 4 |

Fallback: if `team_color` is missing or not one of the five, the older `team1..team8` number logic supplies the offset (`teamN - 1`). The offset is applied modulo the group's length, so shorter groups still rotate cleanly.

**How to apply:** If team colors change, update `TEAM_COLOR_ORDER` **in both engine files** — the array is not shared. The array order *is* the offset, so don't reshuffle casually — existing stop content may be ordered assuming BLUE = the canonical "position 0" view. If this ever gets extracted to a shared module under `/game/run/config/`, update this section to point at the new location.

---

## Anchor (fandom) game brand palette ← away team

For anchor/fandom games the brand palette is **derived from the away team** (the fan's team), not stored on the game — `serializeGameRow` skips writing `primary_color`/`secondary_color`/`tertiary_color`/`quaternary_color` for fandom games, so the **single source of truth is `teamPalette()` in [assets/team-palette.js](assets/team-palette.js)**, applied both in the builder preview ([mc/overview.html](mc/overview.html) `bindTeamSelect` / `resolveGamePalette`) and in the live engines via `resolveGamePalette(teams, game, 'away').palette`.

The mapping from a team row:

| role | team column | meaning |
|---|---|---|
| primary | `shell` | helmet |
| secondary | `stripe` | stripe |
| tertiary | `mask` | facemask |
| quaternary (font) | **auto** | black/white for contrast against `primary` |

**Why the font is auto, not `text_color`:** quaternary's job is the readable interface text color. A team's `text_color` is a brand color that can be e.g. white-on-white against its own helmet, so text vanishes. `teamPalette()` therefore **ignores `text_color`** and calls `readableTextColor(primary)` (perceived BT.601 luminance; light helmet → `#000000`, dark helmet → `#FFFFFF`). Decided 2026-06-16.

**How to apply:** Don't "fix" quaternary back to `team.text_color`. The auto-contrast branch fires only when `teamPalette` is passed a real team; with `team == null` (the generic `gamePalette` path for non-fandom games) it preserves the game's authored quaternary. The module is shared, so a change here lands in the builder and every engine at once.

---

## Country badge — canonical international vehicle-registration oval

The country badge that appears on the public games page (in the hero meta list and on game-card icons) **must always render as a true ellipse** — the white "GBR / FRA / USA" car decal style. It is not a styling choice; it's a brand invariant.

**Where:** `.hero-meta-list-geo--country` in [assets/site-shell.css](assets/site-shell.css). The rule uses `!important` on `width`, `height`, `border-radius`, `background`, `color`, `border`, `font-family`, and `box-shadow` precisely because a `body.home-page .hero-meta-list-geo` rule later in the same stylesheet would otherwise win on specificity and turn the oval into a rounded square. There's a larger `.game-card-icons .hero-meta-list-geo--country` variant that also uses `!important` to override the base width/height while keeping the 1.67:1 ratio.

**Why:** A regression on 2026-05-27 silently turned the country labels into rounded squares because of a page-level skin rule. The `!important`s are the contract that the oval survives any future page-level overrides.

**How to apply:** If you need to skin the oval (resize, restyle for a new page theme), keep the 1.67:1 width:height ratio, keep `border-radius: 50%`, keep the white fill + black border + black Times-serif capitals. Never round the corners to a square-ish shape, never fill it with a non-white background, never strip the `!important`s without putting an equally strong protection in place.

---

## Supabase `games` table conventions

Columns on the `games` table that read like booleans — `featured`, `archived` — are actually **TEXT columns**. The canonical "true" value is the string `'YES'`; the canonical "false" value is `null` (or empty string).

**Why:** This is the existing storage convention. See `FEATURED_GAME_VALUE = 'YES'` and the `archived: normalizedGame.archived || null` write in `serializeGameRow`, both in [mc/builder.html](mc/builder.html). Writing a JS boolean (`true`/`false`) gets coerced by PostgREST to the literal string `'true'`/`'false'` — and `'false'` is a *non-empty string*, which the shared `isGameFeatured` / `isFilledArchiveValue` helpers read as **truthy**. The UI then never clears the flag (e.g. an "Unfeature" button that won't stop showing "Unfeature").

**How to apply:** When patching these columns via PostgREST, always use `'YES'` / `null` — never `true` / `false`. Same convention extends to any future flag column on the games table unless explicitly typed as BOOLEAN. If in doubt, mirror how `archived` is written nearby — it's the load-bearing example. The reader-side helpers tolerate both shapes; **don't "fix" the readers — fix the writer.**

---

## Supabase reads cap at 1000 rows — always paginate

PostgREST (Supabase's REST layer) returns **at most 1000 rows** per query by default (`db-max-rows`). An unbounded "load the whole table" fetch **silently truncates at 1000** — no error, the JSON just stops. This bug is invisible until the table crosses 1000 rows, then the tail vanishes (hit on 2026-06-20: `waypoints` page wasn't showing WPID 1073 because it loaded only the first 1000 by `wpid` asc).

**How to apply:** Any read that expects an entire table MUST paginate. Use the shared helper **`TgbRest.fetchAll(url, headers)`** in [mc/js/supabase-rest.js](mc/js/supabase-rest.js) — it loops with the `Range: from-(from+999)` header until a page returns < 1000 rows, then concatenates. Include `<script src="js/supabase-rest.js"></script>` on the page, build the URL with the page's `restUrl(...)`, and pass `authHeaders(...)`. Examples: `refresh()` in [mc/waypoints.html](mc/waypoints.html) and `loadWaypoints()` in [mc/mapper.html](mc/mapper.html).

The tell-tale symptom is **exactly 1000 rows** coming back. Raising `db-max-rows` in the Supabase dashboard (Settings → API → Max rows) is a global, blunt fallback — prefer client pagination, or filtered/paged queries for tables that will grow large.

---

## Builder: `initGameMeta` camelCase fallback

When adding any new Supabase `games` column that lives on `state.currentGameMeta`, the `initGameMeta(game)` function in [mc/builder.html](mc/builder.html) must accept **both** the snake_case column shape AND the camelCase shape:

```js
fieldName: g.field_name ?? g.fieldName ?? gn.fieldName ?? '',
```

**Why:** `readRecoveryDraft` (in the `loadDoc` path) re-runs `initGameMeta(raw.currentGameMeta)` on the persisted recovery snapshot. `raw.currentGameMeta` only has **camelCase** keys (because `buildRecoverySnapshot` serializes `state.currentGameMeta`, which is camelCase). If `initGameMeta` only reads snake_case (`g.starting_location_name`), the recovery branch returns empty strings and overwrites the user's typed value — so it looks like the field never saved. Hit this on 2026-05-18 with the new `starting_location_name` / `starting_location_address` fields: Supabase had the values, but the recovery-draft load path was silently zeroing them on every page reload.

Fields that escaped the bug historically did so by accident — their snake_case and camelCase names happen to be identical (`city`, `kind`, `engine`, `body`, `price`, `tagline`, `teams`), so `g.city` worked for both shapes.

**How to apply:** When adding a meta field to `initGameMeta`, always write the fallback chain as `g.snake_name ?? g.camelName ?? gn.camelName ?? default`. Same rule applies to numeric/boolean fields — check both casings before falling back to the node-level shape.
