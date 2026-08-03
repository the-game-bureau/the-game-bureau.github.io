# the-game-bureau — project notes

Durable project knowledge for Claude Code (and any teammate working in this repo). Auto-loaded by Claude Code every session. **Do not put secrets in this file** — it's committed to git and the site is published via GitHub Pages, so anything here is technically reachable on the public web.

---

## Sound / city playlists

The public page [soundtracks/index.html](soundtracks/index.html) renders city cassette cards at runtime from **two Supabase tables**: `public.soundtracks` (one row per city tape — `city_slug` PK, `spine_tag`, `spine_tag_position`, `archived`) and `public.soundtrack_songs` (one row per track — `city_slug`, `position`, `title`, `artist`, `blurb`, `spotify_id`, `explicit`, `archived`), plus the `public.soundtrack_stats` view for per-tape counts. Schema: [supabase/migrations/2026072904_soundtracks_tables.sql](supabase/migrations/2026072904_soundtracks_tables.sql); the 69-tape / 929-song lift out of the old JSON file is [2026072905_soundtracks_seed.sql](supabase/migrations/2026072905_soundtracks_seed.sql).

- **[soundtracks/soundtracks.json](soundtracks/soundtracks.json) is now only an offline fallback**, read solely when the Supabase fetch fails (moved 2026-07-29). It is still committed and still shipped. **Never edit it to change a tape** — it is generated. [_dev/scripts/soundtracks-export.mjs](_dev/scripts/soundtracks-export.mjs) rewrites it from the tables (read-only, publishable key, `Range`-paginated) and the daily routine runs it and commits the result, so it stays at most a day behind; the Tape Room's **Download JSON** produces the same bytes for a manual refresh. The output is deliberately byte-stable — key order, omitted-when-false flags, 2-space indent, one trailing newline — so an unchanged database gives a zero-line diff instead of a 6000-line one.
- **Both reads paginate.** PostgREST caps a response at 1000 rows and truncates silently; `soundtrack_songs` is already past 900. The page and the admin each carry a `Range`-paging `fetchAllRows`.
- It reads `public.cities` with **`select=*`** only for nicer city display names + geo badges, filtering out rows flagged `hide_from_soundtracks` (falling back to the retired `ignored` column). This is optional: if the cities fetch fails, `fallbackCityRowsFromSoundtracks` renders from the tape slugs alone. **The page depends on no specific `cities` column** — don't reintroduce one.
- The old per-city `cities` sound columns (`sound_playlist_id` / `sound_accent` / `sound_secondary`) were **dropped 2026-07-24**; soundtracks are handled separately now and cassette colors come from the CSS `nth-child` scheme. Don't re-add them.
- **`archived` on a song is a do-not-rescrape tombstone**, not a delete: the row stays on its city so the same title+artist is never picked again there, while `/soundtracks/` hides it and active counts ignore it. A **unique index on `(city_slug, lower(title), lower(artist))`** is what enforces that — an INSERT of a retired song hits the index and does nothing. **The tombstone is scoped to the city, never to the song**: because `city_slug` leads that index, a track hidden on one tape can be added to another and stay active there, which is what makes the Tape Room's **Copy** work (it inserts with `archived = false`). Don't "fix" this by making the index global — a song can genuinely belong to two cities.
- **A tape over 15 active tracks is trimmed by hiding the most recently added**, newest `created_at` first, until 15 remain — never by hiding an older track to keep a newer one, since the earlier fifteen are the considered set. The agent cannot hide, so it files an over-full tape as a `facts` issue naming the surplus and a human presses Hide.
- The footer's soundtrack stat ([assets/site-footer.js](assets/site-footer.js)) counts `soundtrack_stats` rows with `active_songs > 0` via `Prefer: count=exact`, falling back to the JSON file.

Do not reintroduce per-city generated card HTML, `city-playlists.json`, `song-playlists.json`, or CSV-driven build scripts under `soundtracks/`. To add a soundtrack, insert rows (and add the city to `public.cities` first — `city_slug` is a FK to `cities.slug`).

### Two write paths, deliberately asymmetric

- **Agents insert; only humans retire.** The routine calls **`tgb_pull_soundtrack_songs(jsonb)`** ([supabase/migrations/2026072906_soundtrack_pull_rpc.sql](supabase/migrations/2026072906_soundtrack_pull_rpc.sql)) with the ordinary public publishable key — a cloud routine has no secret store, exactly the constraint that produced `tgb_pull_book_candidates`. It is `SECURITY DEFINER` and tiny: insert-only, creates the tape row if missing, refuses a `city_slug` that is unknown or `hide_from_soundtracks`, ignores `spine_tag` on an existing tape, drops a malformed `spotify_id`, always writes `archived = false`, caps a call at 60 songs across 4 tapes. **Don't add parameters for `archived`** — that constant is what makes it safe to expose to `anon`. Unlike the book pull there is **no review queue**: what it writes is live, which matches the behaviour it replaced (committing straight to `main`).
- **Archive / Restore is a human action** in the Tape Room, PATCHing `soundtrack_songs.archived` (one track) or `soundtracks.archived` (a whole tape) under an admin session; RLS grants writes to `authenticated` only.
- **Every track field is editable in the Tape Room** as of 2026-07-30 — press **Edit** on a row for title, artist, blurb, `spotify_id`, `explicit` and `position`, plus **Move** / **Copy** to another tape. Move is a PATCH of `city_slug`; Copy is an INSERT on the target tape with `archived = false`. Two rules the UI enforces and any future editor must keep: a blank `spotify_id` is always allowed and always better than a guess (the player falls back to a Spotify search, and a fabricated 22-char ID passes the CHECK and silently plays nothing); and **moving a hidden track carries its tombstone to the new city**, freeing the routine to re-pick that song for the old one — which is why Copy, not Move, is the right verb for a song that belongs to two cities. A rename or move that collides with the `(city_slug, lower(title), lower(artist))` unique index surfaces as a plain-English "that tape already has it, it may be hidden" message rather than a raw 23505.
- **The UI says HIDE / HIDDEN; the column stays `archived`.** Renamed in the Tape Room on 2026-07-30 — "archive" read as filed-away or deleted, when the effect is simply that the track leaves `/soundtracks/` and stops counting. Buttons are **Hide / Show** and **Hide tape / Show tape**; chips are **Hidden / Active**. Don't rename the column or the functions to match, and don't reintroduce "Archive" in visible copy.
- **The routine also audits, and reports to `public.soundtrack_issues`** (added 2026-07-30, [supabase/migrations/2026073002_soundtrack_issues.sql](supabase/migrations/2026073002_soundtrack_issues.sql)). Four kinds — `spotify` / `spelling` / `relevance` / `facts` — at three severities, shown in the Tape Room's **Issues** panel plus a ⚠ chip on the affected track row. Scope per run is the two tapes it just wrote plus the **3 least-recently-audited**, ordered by the new `soundtracks.last_audit_at` (null first), so the catalogue is swept every couple of weeks at flat cost. **The agent reports and never edits** — same human-in-the-loop split as everything else here.
  - Writes go through **`tgb_report_soundtrack_issues(jsonb)`**, `SECURITY DEFINER`, publishable-key callable, insert-only, always `status = 'open'`, ≤40 findings a call, and it drops a `song_id` that isn't on the named tape. **Don't add a `status` parameter** — that constant is what makes it safe to expose, exactly as with the two pull RPCs.
  - **Clearing has two meanings and the difference is load-bearing.** `fixed` = dealt with, and the finding **may be reported again** — that re-report is the only check that a fix landed. `dismissed` = never an issue, silenced permanently. Enforced by a **partial unique index on `fingerprint` where `status in ('open','dismissed')`**, so re-reporting an open or dismissed finding is a no-op at the database, not in the client. The fingerprint is `md5(city_slug:song_id:kind)` — deliberately **not** the detail text, which the agent rewords every run and which would defeat the dedupe entirely.
  - **These rows are not publicly readable**, unlike `soundtracks` / `soundtrack_songs`: "this song has no real tie to the city" is an internal editorial note. SELECT is `authenticated` only, which is why the admin's `fetchAllRows` grew a `useAuth` flag. The agent needs no SELECT — dedupe is server-side.
  - The admin tolerates the table being absent (the issues fetch `.catch`es to `[]`), so the page still works against a database that hasn't run the migration.
- **Archiving a tape cascades to its tracks**, via the `soundtracks_cascade_archive` trigger ([supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql](supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql)). It archives the tape's *live* songs and stamps them `archived_with_tape = true`; restoring the tape clears exactly those. **A song archived on its own stays archived through a tape restore** — that row is a do-not-rescrape tombstone, the one thing here that must never come back by accident. It lives in a trigger, not the admin page, so the rule holds for the Supabase table editor and psql too, and can't be half-applied by a client that dies between two requests. Anything reading `active_songs` depends on this: before the cascade a hidden city still reported 15 active tracks.

### Daily generation — a Claude Code cloud routine, not CI

New soundtracks are added by a **scheduled Claude Code cloud agent** ("Daily soundtrack generator", `trig_014sqaUyU7557svq9mGA1E4a`, cron `30 11 * * *` UTC), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the alphabetically-first city with no soundtrack plus the most underfilled existing one, verifies Spotify IDs by web search, and writes them through the RPC above; it then audits those two tapes plus the 3 least-recently-audited and reports findings through `tgb_report_soundtrack_issues`. Its **only** git write is re-exporting the fallback file (added 2026-07-30) — songs never travel through a commit — so the last-run signal in [soundtracks/admin/index.html](soundtracks/admin/index.html) is the **newest `soundtrack_songs` row**, not the GitHub commits API (same call as the gift shop's freshest Review candidate). That commit is allowed to be a no-op and must contain nothing but `soundtracks/soundtracks.json`. The routine's stored prompt must be updated to match the paste-ready prompt in the Tape Room; both changed on 2026-07-29 when the tables landed.

**Why not GitHub Actions:** it used to be `.github/workflows/soundtrack-daily.yml` + `_dev/scripts/soundtrack-daily.mjs`, both **deleted 2026-07-27**. That path needed a funded Anthropic or OpenAI API key; neither account had credit, so every run failed on a billing error. The routine bills against the Claude subscription instead. Don't recreate the workflow unless an API key gets funded — and if you do, don't leave both running or you'll get two soundtracks a day.

**DST:** cloud cron is UTC with no DST and can't use the two-cron-plus-hour-guard trick, so **no single cron holds one Central time year-round**. `30 11` is exactly 6:30 AM CDT and 5:30 AM CST. Set to 6:30 AM Central on 2026-07-28; to hold 6:30 through winter, flip to `30 12 * * *` at the November fall-back and back to `30 11 * * *` in March. Drifting an hour is accepted, not a bug.

---
## Socials daily scout — a third Claude Code routine

[socials/admin/index.html](socials/admin/index.html) shows five stories the socials accounts might want to post, found each morning by a **scheduled Claude Code cloud agent**. It commits [socials/queue.json](socials/queue.json) to `main`; the page is a read-only render of that file.

- **This is the one routine that holds 5:55 AM Central year-round, using a seasonal pair of triggers** (2026-07-31). The other three accept an hour of winter drift; this one doesn't, at the cost of two triggers to keep in sync:

  | trigger | cron (UTC) | months | Central |
  |---|---|---|---|
  | `trig_01KDYndJhZ9ymgUgX5Xx6LsL` | `55 10 * 3-10 *` | Mar–Oct | 5:55 AM CDT |
  | `trig_0127HaXCYGoCwdb9789ocrvW` | `55 11 * 11,12,1,2 *` | Nov–Feb | 5:55 AM CST |

  The month split is deliberately approximate — US DST turns over mid-March and early November, so the first days of March run an hour early and the first days of November an hour late. That's accepted, same bargain as the single-cron routines make all winter. **The original single trigger `trig_01VGJLzRyxWuvgrP4hv8ZMM5` (`15 11 * * *`) is disabled, not deleted** — don't re-enable it or you'll get two queues a day, and the second wholesale-replaces the first.
- **Both crons must name the same minute.** They drifted to `0 8,20` / `0 9,21` — 3 AM *and* 3 PM Central, twice a day — and were put back on 2026-08-03. A multi-hour cron here is always a mistake: the queue is replaced wholesale, so an afternoon run throws away the morning's picks before anyone has acted on them.
- **The agent posts nothing and holds no account credentials.** It writes one file; a human clicks POST (copies blurb + link to the clipboard) or TRASH. Don't ever wire this to a social API — the human-in-the-loop is the design, not a missing feature.
- **The list is replaced wholesale each run**, not appended. An unposted pick is gone tomorrow, which is intended: it keeps the page to one day's decisions.
- **TRASH is client-side**, remembered in `localStorage['tgb_socials_trashed_v1']` keyed by the date-stamped post id, so a dismissal survives a reload without needing a write path. A "Restore N Trashed" button in the panel header clears it.
- The clipboard gets **blurb + blank line + URL** — deliberately not the headline (that's the outlet's words) and never the `why` field, which is an internal note for the admin page.
- Last-run status reads the **GitHub commits API** for `socials/queue.json`: a run that errored pushes nothing, so a stale timestamp is the failure signal. (The soundtrack admin used to work this way too; since 2026-07-29 it reads its newest row instead, because that routine no longer commits.)

---

## Nightly waypoints run — a fourth Claude Code routine

Walking-tour candidates are found each morning by a **scheduled Claude Code cloud agent** ("TGB Waypoint Tour Scout", `trig_01Q5uCittJ3dT3M2xj8sKD3j`, cron `45 11 * * *` UTC = 6:45 AM Central in summer, 5:45 AM in winter). Each run picks the **NFL host city that has gone longest without a run**, sweeps **Wikipedia and Wikimedia** for places there, verifies each stop, and commits [mc/stops/nightly.json](mc/stops/nightly.json) to `main`.

- **A stop must have a Wikipedia article (or Commons category) carrying coordinates or a street address.** That single constraint does most of the quality filtering: a place notable enough for an article and pinned precisely enough to geotag is a place worth standing in front of, and the article URL still resolves years later — a visitor-bureau tour PDF will not. NRHP county listings and National Historic Landmark lists are the richest vein (address *and* coordinates per row); Wikipedia GeoSearch sweeps a downtown core; Commons is the still-standing photo check. Switched from published-walking-tour sourcing on 2026-07-29 — the same rules live in `WIKI_SOURCE_LINES` in [data/waypoints.html](data/waypoints.html), shared by both AI prompts, so page and routine can't drift.
- **Wikipedia decides which stops, never the facts.** Articles routinely lack a street address or give a mailing one, so the address comes from the NRHP row or an independent source and stays `null` otherwise — coordinates are never turned into a street address, and the table has no lat/lon columns to put them in anyway.

- **The agent writes one file and never touches the database.** It has no admin session and no RPC, by design — a human opens [data/waypoints.html](data/waypoints.html), presses **NIGHTLY**, and adds the stops worth keeping under their own session. Don't give it a write path; the review step is the feature, the same call as the socials scout.
- **The city rotation is derived from git history**, not from the table: the routine can't read `waypoints` (RLS gates SELECT behind an admin session), so it reads the last ~40 commits of `nightly.json` and picks the city missing longest. Duplicates are therefore possible and harmless — the admin page checks name + city against the loaded rows and marks an already-present stop "In table".
- **The list is replaced wholesale each run.** An unadded stop is gone tomorrow, which keeps the panel to one morning's decisions.
- **`source_url` is mandatory on every stop** — the stop's own Wikipedia article (or the list article it is a row in), which lands in the waypoint's Source URL field so the claim stays checkable later.
- Last-run status reads the **GitHub commits API** for `mc/stops/nightly.json`, same as the socials admin: a run that errored pushes nothing, so a stale timestamp is the failure signal.
- The schedule sits at `:45` to keep it clear of the other three (`:00` gift shop, `:15` socials, `:30` soundtrack). Same DST caveat as the rest — the cloud cron is UTC, so it drifts an hour in winter.

### With AI (sports) — the one importer that appends instead of skipping

[data/waypoints.html](data/waypoints.html) has a fourth AI pull, **With AI (sports)** (added 2026-07-31), and it inverts the rule the other three share. The other prompts start from a city and ask what is in it; this one starts from the football and asks where it happened, keeping the answer **only when the place sits in a city other than that team's home** — a Seahawk's wedding church in New York, a Cowboys lineman's childhood home in Ohio, a Packers coach's grave in Georgia. A Steelers marker in Pittsburgh is explicitly worthless to it. Those stops are invisible to any city-first sweep, because no walking-tour list in Nashville is organized by which NFL team the groom played for.

- **It writes through `tgb_import_waypoints_sports_items`, not `tgb_import_waypoints_prompt_items`** — a second helper in [supabase/waypoints-prompt-import.sql](supabase/waypoints-prompt-import.sql), inlined into the generated prompt by `buildWaypointSportsImportHelperSql()` on the page (keep the two in sync, same as the original). Identical JSON shape; the difference is what happens on a name + city hit.
- **An existing waypoint gets the new sentence APPENDED to its description** rather than being skipped. That is the point, not a convenience: these places are usually already in the catalog for some unrelated local reason, and the football fact is the only new thing the run produced. Skipping would throw away the entire result.
- Re-paste safety comes from three rules in the function: the append is a no-op when the sentence is already in the description; **an archived row is appended to but never un-archived** (archived is a do-not-rescrape tombstone, and the returned `note` flags when this happened); and a non-null `state` / `zip` / `address` / `source_url` is left alone — only blanks are backfilled, so the AI never overwrites a human.
- It is its **own button, not a mode** of the With AI modal, because it has no place to pick — the search is "wherever the football turns out to be", so the mode's city picker would sit empty. One number, one button.

---

## Gift shop daily book pull — also a Claude Code routine

Candidate books are added by a **scheduled Claude Code cloud agent** ("Daily gift shop book pull", `trig_01H7cKJ4fk5bA1NWSqPZi4ah`, cron `0 11 * * *` UTC = 6 AM Central in summer, 5 AM in winter), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the city with the fewest gifts, web-searches five books, verifies every ISBN against a real listing page, and files them as **Review candidates**. It commits nothing — the write lands in Supabase.

**Auth without a secret.** A cloud routine has no secret store, so it calls **`tgb_pull_book_candidates(jsonb)`** ([supabase/migrations/2026072802_book_candidate_pull_rpc.sql](supabase/migrations/2026072802_book_candidate_pull_rpc.sql)) with the ordinary public publishable key. That function is `SECURITY DEFINER` and deliberately tiny: it can only INSERT rows with `archived = true` / `certified_at = null`, derives the Bookshop URL and cover from the ISBN so a caller can't inject a link, keeps the title/URL dedupe, and caps a call at 25 items. **Don't add parameters for `archived` or `certified_at`** — those constants are what make it safe to expose. The admin-facing `tgb_import_bookshop_prompt_items()` is unchanged and stays SECURITY INVOKER.

**Why not GitHub Actions:** it used to be `.github/workflows/shop-book-pull.yml` + `_dev/scripts/shop-book-pull.mjs`, both **deleted 2026-07-28**. Two reasons. It needed a funded `ANTHROPIC_API_KEY` (the same unfunded key that killed the soundtrack workflow), and its schedule had silently stopped working: crons fired at `:55`, GitHub started scheduled runs up to 30+ minutes late, and the Central-hour guard then skipped every job while the run still reported **success**. Green runs, no books — last real insert was 2026-07-26. If you ever reinstate a cron guard, gate on a *window* of hours, never hour equality against a `:55` trigger.

Last-run status lives in the **NIGHTLY** modal in [gifts/admin/index.html](gifts/admin/index.html). Since the job commits nothing there is no commit feed to read, so the panel treats **the freshest Review candidate as the run receipt** (`archived = true and certified_at is null`, newest first).

---

## Stops and Challenges

The canonical hierarchy finally has tables behind it, as of 2026-07-30 — [supabase/migrations/2026073003_stops_and_challenges.sql](supabase/migrations/2026073003_stops_and_challenges.sql).

- **`public.stops`** is a Stop: `game_id` + `waypoint_id` + `challenge_id`, plus `ord` and `end`. It **supersedes `public.maps`**, which held exactly these rows without the challenge. The migration copies maps across (challenge_id null — those rows never had one), skipping orphans and collapsing duplicate game+waypoint pairs. **`maps` is left in place but unread**, the same way `gift_shop_cities` was retired; the `drop table` sits commented at the bottom of the migration. Don't write `maps` again.
- **`public.challenges`** is the playable content: `name` (admin label), `prompt` (what the player reads), `answer`, and `kind` ∈ question | minigame | photo | freeform. **A challenge is reusable** — `challenge_id` is a plain FK with no unique constraint, so one challenge can sit at many stops and editing it changes all of them. Same bargain the waypoints catalog already makes.
- **`challenge_id` is nullable on purpose.** A stop is worth recording as soon as you know where it is; forcing a challenge up front would mean inventing filler to save a route. The builder shows those as "needs a challenge".
- **A unique index on `(game_id, waypoint_id)`** means one place appears at most once in a route. `maps` never enforced this and the mapper's delete-then-insert save hid it.
- **The editor is [games/admin/stops.html](games/admin/stops.html)** ("Stop Builder"), moved out of `mc/stops/` on 2026-07-31 to sit with the other game tools; its other half, [data/waypoints.html](data/waypoints.html) ("Waypoint Finder"), moved out of `mc/stops/` the same day to sit with the other data catalogs, so the two link to each other across folders by absolute path. `mc/stops/` now holds only `nightly.json`, which the scout routine still commits at that path — the Waypoint Finder reads it as `/mc/stops/nightly.json`. The old route builder `mc/mapper.html` was archived on 2026-07-30.
- **`games/admin/profiles.html` and `mc/builder.html` read `stops` now** (`select=waypoint_id,ord,end`, unchanged — those columns carried over) and remain **read-only on the route**: they synthesize one stop node per waypoint and never write it. The engines never read `maps` and don't read `stops` either.

---

## Game play tracking (instances / responses / events)

**"Team" is two different things:** a **sports team** is a pro team a game is based on (`public.teams`; **team colors** = shell/stripe/mask belong here), reachable via `game_id → games`. A **Game Bureau team** is a group of our players, led by a **team leader** and identified by a chosen **team name**, never a color. The engine's blue/black/purple/silver/orange value is a **route-rotation slot** (`route_color`), not a sports-team color — don't label Game Bureau teams with it.

Playthroughs are recorded for stats. A **team leader** (the buyer/leader — we used to say "player") plays a **game instance** (one playthrough by one Game Bureau team, a client-generated uuid). Tables: `game_instances`, `game_responses`, `game_events`, plus a `game_play_stats` view. Schema: [supabase/migrations/20260625_game_instances_responses.sql](supabase/migrations/20260625_game_instances_responses.sql); client: [game/run/config/instance-tracker.js](game/run/config/instance-tracker.js) (`window.TgbInstance`), wired into both engines. Full write-up: [_dev/docs/supabase/game-instances-responses.md](_dev/docs/supabase/game-instances-responses.md).

- **Append-only for anon** (engines use the anon key): RLS allows `INSERT` only; admin reads gated by `is_photo_admin()`. Don't add anon update/delete — record progress as `game_events`, not by mutating rows.
- **Team leader email is folded in server-side**, never sent by the client: the `tgb_link_game_instance_identity` SECURITY DEFINER trigger looks the play's `access_code` up in `gift_codes` and copies the Stripe email. The link is **Stripe → gift_codes → game_instances → game_responses**.
- Team name + team leader name are collected *before* Stripe in the buy modal (`mc/js/gs-buy-modal.js`) and written to `gift_codes` (`team_name`, `team_leader_name`) by `gs-create-checkout`; the instance trigger folds them onto the play. They're also best-effort on the instance (chosen in-game), and the authoritative team name is recoverable from `game_responses` (the `player_name` var). `route_color` is the engine route slot, not a sports color.
- Admin stats live in [gifts/giftcards.html](gifts/giftcards.html) ("Game Play Stats" panel, reads the `game_play_stats` view).

---

## Visitor analytics

[assets/site-analytics.js](assets/site-analytics.js) is the only analytics on the
site (added 2026-07-30, first used on [soundtracks/index.html](soundtracks/index.html)). It
injects the **Cloudflare Web Analytics** beacon: free at any volume, cookieless
with no per-visitor identifier — so **no consent banner and nothing to disclose in
a privacy policy** — and a single tag that works on plain GitHub Pages with no
build step and without proxying the domain through Cloudflare.

- **The token lives in exactly one place**, the `TOKEN` constant at the top of
  that file. With it empty the script loads and does nothing, so the file is safe
  to ship before the Cloudflare site exists. Get it from dash.cloudflare.com →
  Analytics & Logs → Web Analytics → Add a site.
- **To cover another public page, add the one `<script>` line.** Don't inline the
  beacon or the token anywhere else.
- **It refuses admin surfaces itself** — anything under `/mc/`, `/account/`, any
  `/admin/` path, and `gifts/giftcards.html` — plus localhost and LAN hosts. Our
  own sessions would swamp real visitor numbers on a site this size, and a guard
  in the script is more reliable than remembering which pages to leave it off.
- **It measures traffic, not listening.** It cannot say which cassette anyone
  played; that needs our own append-only event table, which deliberately does not
  exist yet. Don't try to squeeze play counts out of a page-view tool.
- **The numbers are not on our pages, and can't be.** Reading Web Analytics means
  Cloudflare's GraphQL API with a *secret* API token, and every admin page here is
  public HTML on GitHub Pages — so the Tape Room's **Viewer Statistics** card
  carries deep links into the Cloudflare dashboard, the caveats, and a live
  *beacon-installed* check (it fetches `site-analytics.js` and confirms `TOKEN` is
  still filled in) rather than counts. To put real figures on the page, a Supabase
  Edge Function would have to hold the API token and proxy the query behind
  `is_photo_admin()`.

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
- [gifts/index.html](gifts/index.html) — the public shop. The folder has been `/gifts/` → `/shop/` (2026-06-26) → `/gifts/` (2026-07-30); **each move was a hard break with no redirect**, because GitHub Pages cannot serve a 301, so any `/shop/?city=` link shared while that path was live is now dead. Only `gifts/index.html` is a site page; the other files under `gifts/` (`admin/index.html` — the gift-shop admin, formerly `gs-shop.html`; `giftcards.html` — access-codes + Game Play Stats, formerly `gs-codes.html`; `scripts/`; `shop_banner.png`) are moved gift-shop admin/assets that keep Mission Control chrome, not public chrome. The image filenames still read `shop_*`; only the folder was renamed.
- every file matched by `highlights/**/*.html`
- every file matched by `sampler/**/*.html`
- every file matched by `survey/**/*.html`
- every file matched by `assets/**/*.html`

This grouping is the public website surface for shared chrome work such as navigation, shared public CSS, metadata, and broad visual consistency. If a future task says "update the site pages nav," apply it to [index.html](index.html), `/account/**/*.html`, `/birthdayball/**/*.html`, `/how/**/*.html`, `/ww/**/*.html`, `/gifts/index.html`, `/highlights/**/*.html`, `/sampler/**/*.html`, `/survey/**/*.html`, and `/assets/**/*.html` pages together. The site pages nav centers the primary `GAMES` and `GIFTS` links and keeps How It Works and Winner's Wall as utility links. The `GIFTS` nav link points at `/gifts/`, which is where the shop lives again as of 2026-07-30; `/shop/` was removed the same way `/gifts/` had been on 2026-06-26 — hard break, no redirect. As of 2026-05-27 the public nav has no visible Login / Mission Control entry — admins reach `/mc/*` by typing the URL directly. The three admin scripts (`/mc/js/admin-auth.js`, `/assets/admin-bridge.js`, `/assets/site-nav-login.js`) are still included on public pages so an admin who is already signed in still sees the floating EDIT buttons painted by `admin-bridge.js`; only the visible Login UI was stripped. The shared site pages CSS lives at [assets/site-pages.css](assets/site-pages.css).

---

## Canonical game hierarchy

Use this product vocabulary everywhere new UI, code, data, and documentation are created:

- A **Game** contains one or more **Routes**.
- A **Route** contains an ordered list of **Stops**.
- A **Stop** combines one **Place** with one **Challenge**.
- A **Place** is a reusable real-world point with geographic metadata such as city, address, coordinates, or Plus Code.
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

For anchor/fandom games the brand palette is **derived from the away team** (the fan's team), not stored on the game — `serializeGameRow` skips writing `primary_color`/`secondary_color`/`tertiary_color`/`quaternary_color` for fandom games, so the **single source of truth is `teamPalette()` in [assets/team-palette.js](assets/team-palette.js)**, applied both in the builder preview ([games/admin/profiles.html](games/admin/profiles.html) `bindTeamSelect` / `resolveGamePalette`) and in the live engines via `resolveGamePalette(teams, game, 'away').palette`.

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

## One city catalog: `public.cities`

There is exactly **one** city table for the whole site: `public.cities`, keyed by `slug`, with `city` (the canonical string) unique. `/soundtracks/`, `/gifts/`, and `/gifts/admin/` all read it.

`public.gift_shop_cities` was a second, parallel catalog keyed by the city string. It was merged into `cities` on 2026-07-22 by [supabase/migrations/2026072202_merge_gift_shop_cities_into_cities.sql](supabase/migrations/2026072202_merge_gift_shop_cities_into_cities.sql). **Do not create a new per-product city table** — add a column to `cities` instead (that's what `sound_playlist_id` / `sound_accent` / `sound_secondary` are).

- **Writers don't send a slug.** The `cities_fill_slug` BEFORE INSERT trigger derives it from the city string via `tgb_city_slug()` — city name only (`"St. Louis, Missouri"` → `st-louis`), qualified with the state/country code if that base is taken by a different city (two Portlands), then numbered. The shop admin posts `{ city }` with `on_conflict=city` and nothing else.
- `cities_sync_geo` fills the structured geo columns, matching the `tgb_sync_*_geo` triggers on `games` and `teams`.
- The old `gift_shop_cities` table is **left in place but unread**; the drop statement is at the bottom of the migration, commented, for once the deployed site has been on `cities` for a while.
- **Three per-surface hide flags**, added 2026-07-29 by [supabase/migrations/2026072901_cities_hide_flags.sql](supabase/migrations/2026072901_cities_hide_flags.sql):

  | column | hides the city from |
  |---|---|
  | `hide_from_games` | the city finder + default sample on `/games/` |
  | `hide_from_soundtracks` | the cassette rail on `/soundtracks/` |
  | `hide_from_gift_shop` | Shop By City on `/gifts/` |

  These replaced the single `ignored` ("venue only") switch, which hid a city everywhere at once and conflated three separate editorial calls — a stadium town can be a real games destination and a bad gift-shop city. `hide_from_games` is the direct heir of the venue-only idea, which is why the terminology moved with it. Typical venue-only towns: Orchard Park, Santa Clara, Miami Gardens.
  - **`ignored` is deprecated but still present**, still carrying its old values, and still written by the cities admin (true only when all three flags are). Every reader prefers its own per-surface column and falls back to `ignored` **only when that column is absent**, so the site is correct before and after the migration. Don't add new reads of it; the drop statement is at the bottom of the migration, commented.
  - Shown **grey** (`.tgb-city-ignored`) in admin pickers and filters, where grey now means "hidden from at least one surface" — the checkboxes on the row in [data/cities.html](data/cities.html) say which.
  - The older `archived` "hide everywhere" flag was retired 2026-07-24 — [supabase/migrations/2026072402_drop_cities_archived.sql](supabase/migrations/2026072402_drop_cities_archived.sql). To remove a city now, delete it or set the hide flags.
- **A filter alone is not enough.** `/gifts/` filters the catalog *and then* back-fills cities found on gift-shop games; that back-fill has to re-check the flag or a hidden town walks straight back into the rail (fixed 2026-07-28). If you add another path that derives cities from a non-catalog source, re-apply the check there.
- **Every city control goes through [assets/city-picker.js](assets/city-picker.js)** (`window.TgbCities`) — Start City in `games/admin/profiles.html`, City in `mc/anchor-events.html`, and the filter in `mc/anchor-events.html`. (`mc/mapper.html` and `mc/content.html` also used it before they were archived on 2026-07-30.) It fills the control from the catalog and hangs a **+** beside it that adds a city without leaving the page. `attach(el, { includeIgnored: true })` for admin surfaces; omit the flag where only real destinations belong.
- **Queries use `select=*`, never a column list naming a hide flag.** PostgREST 400s on an unknown column, so an explicit list breaks any database that hasn't run the migration yet; readers treat a missing column as `false` and fall back to `ignored`.
- **Never send `slug` from a client.** It stays the NOT NULL primary key; the trigger fills it, which works because row triggers run before constraint checks.

---

## Structured city / state / country model (`assets/geo.js`)

Geography is stored two ways at once, and they must stay consistent:

1. **The canonical string** — `games.city`, `cities.city` (unique), `gift_shop_listings.city`, `teams.game_city` — remains the display/key value and the `/gifts/?city=` URL contract. Standard form: US → `"City, FullStateName"`, DC → `"City, D.C."`, non-US → `"City, CountryName"` (e.g. `"Paris, France"`). Teams keep their legacy `"City, ST"` strings.
2. **Structured columns** (added 2026-07-11, all nullable text) on `games`, `cities`, `teams`: `city_name`, `state_code` (2-letter — **drives the map icons**), `state_name`, `country_code` (alpha-3 — drives the country oval), `country_name`.

**Logic lives in [assets/geo.js](assets/geo.js)** (`window.TgbGeo`). It replaces the old copy-pasted `US_STATES`/`COUNTRY_CODES` maps and `canonicalShopCity()`/`cityGeoBadge()`. API: `parseGeo(str)`, `composeGeo(parts)`, `canonicalCity(str)`, `geoBadge(rowOrStr)`, `usStateOptions()/provinceOptions()/countryOptions()`, plus the country-catalog hooks below. Its **SQL twin** is `tgb_parse_geo` / `tgb_compose_geo` / `tgb_canonical_gift_shop_city` — **keep JS and SQL in lock-step** (same parse cases: `Denver, CO`→`CO/Colorado/USA`, `Paris, France`→`FRA`, `Toronto, ON`→`ON/Ontario/CAN`). US states and CA provinces are still hardcoded in both (governmental, stable, and they drive the map icons synchronously).

**Countries are NOT hardcoded — the single source of truth is the `public.countries` table** (`code` alpha-3 PK, `name`, `aliases text[]`), created + seeded by [supabase/migrations/2026072304_countries_catalog.sql](supabase/migrations/2026072304_countries_catalog.sql). **Add a country by inserting ONE row there** — do not re-add a country map to `geo.js` or the SQL functions.
  - `geo.js` **fetches `countries` at runtime** and fills its two live country maps (`COUNTRY_CODE_TO_NAME` / `COUNTRY_NAME_TO_CODE`, mutated in place so captured refs stay fresh). It caches the last fetch in `localStorage['tgb_countries_v1']` and replays it synchronously on load so the public country oval never blanks; the network copy refreshes in the background. **Admin surfaces that build a country dropdown must `await TgbGeo.countriesReady`** before filling (data/cities, games/admin/profile, gifts/admin add-city, the city-picker add dialog all do). Before the migration is applied, `geo.js` falls back to the distinct countries in `public.cities` (no aliases) so nothing goes blank in the deploy window.
  - The SQL `tgb_parse_geo` / `tgb_compose_geo` / `tgb_canonical_gift_shop_city` are **`STABLE` and read `public.countries`** (2026072304 supersedes the inline-map versions in `20260711_structured_geo.sql`). `cities.country_code` has a `NOT VALID` FK to `countries.code`.
  - So the lock-step rule now applies only to **US states / CA provinces**; countries are edited once, in the table.

- The **game editor is [mc/overview.html](mc/overview.html)** (editgames.html and builder.html both point here). Its Start City is now **City textbox + State/Province dropdown + Country dropdown** (`#nodeCityInput` / `#nodeStateInput` / `#nodeCountryInput`); on change it composes `meta.city` and fills `meta.cityName/stateCode/stateName/countryCode/countryName`, serialized via `GAME_COLUMN_TO_NODE_FIELD`. `builder.html` has no Start City inspector markup (its `nodeCityInput` JS is dead/guarded) — only its data-path was updated. `mc/challenges.html` was a stale, unreferenced twin and was archived to `_dev/archive/mc/` on 2026-07-30, along with `mapper.html` (the route builder, the only writer of `public.maps`) and `content.html`.
- **BEFORE INSERT/UPDATE triggers** (`tgb_sync_*_geo`) fill the structured columns from the string via `coalesce(existing, parsed)`, so **explicit values win** and SQL-only inserts (the shop's paste-in importers) still get them. This is why the shop admin didn't need to send structured columns — the trigger derives them.
- **Icons** (`cityGeoBadge` in [games/index.html](games/index.html) + [gifts/index.html](gifts/index.html)) delegate to `TgbGeo.geoBadge`, which resolves 2-letter codes / provinces / countries the old name-only map couldn't. New `games` columns are probed by `serializeGameRow` (auto-disabled if the migration isn't applied yet), so the writer degrades gracefully.
- The migration is **additive**: it normalizes existing **US** `games.city` strings to full-name form but never rewrites city keys or `/gifts/?city=` links.

**How to apply:** add new geo fields via `TgbGeo` — never re-introduce a local state map, and never re-introduce a country map (insert a `public.countries` row instead). When adding a `games` meta field, follow the `initGameMeta` snake_case ?? camelCase ?? node fallback rule. If you change the **state/province** maps, update both `assets/geo.js` and the SQL twin.

---

## Supabase `games` table conventions

Columns on the `games` table that read like booleans — `featured`, `archived` — are actually **TEXT columns**. The canonical "true" value is the string `'YES'`; the canonical "false" value is `null` (or empty string).

**Why:** This is the existing storage convention. See `FEATURED_GAME_VALUE = 'YES'` and the `archived: normalizedGame.archived || null` write in `serializeGameRow`, both in [mc/builder.html](mc/builder.html). Writing a JS boolean (`true`/`false`) gets coerced by PostgREST to the literal string `'true'`/`'false'` — and `'false'` is a *non-empty string*, which the shared `isGameFeatured` / `isFilledArchiveValue` helpers read as **truthy**. The UI then never clears the flag (e.g. an "Unfeature" button that won't stop showing "Unfeature").

**How to apply:** When patching these columns via PostgREST, always use `'YES'` / `null` — never `true` / `false`. Same convention extends to any future flag column on the games table unless explicitly typed as BOOLEAN. If in doubt, mirror how `archived` is written nearby — it's the load-bearing example. The reader-side helpers tolerate both shapes; **don't "fix" the readers — fix the writer.**

---

## Supabase reads cap at 1000 rows — always paginate

PostgREST (Supabase's REST layer) returns **at most 1000 rows** per query by default (`db-max-rows`). An unbounded "load the whole table" fetch **silently truncates at 1000** — no error, the JSON just stops. This bug is invisible until the table crosses 1000 rows, then the tail vanishes (hit on 2026-06-20: `waypoints` page wasn't showing WPID 1073 because it loaded only the first 1000 by `wpid` asc).

**How to apply:** Any read that expects an entire table MUST paginate. Use the shared helper **`TgbRest.fetchAll(url, headers)`** in [mc/js/supabase-rest.js](mc/js/supabase-rest.js) — it loops with the `Range: from-(from+999)` header until a page returns < 1000 rows, then concatenates. Include `<script src="js/supabase-rest.js"></script>` on the page, build the URL with the page's `restUrl(...)`, and pass `authHeaders(...)`. Examples: `refresh()` in [data/waypoints.html](data/waypoints.html) and `loadWaypoints()` in the archived `_dev/archive/mc/mapper.html`.

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
