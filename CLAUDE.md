# the-game-bureau — project notes

Durable project knowledge for Claude Code (and any teammate working in this repo). Auto-loaded by Claude Code every session. **Do not put secrets in this file** — it's committed to git and the site is published via GitHub Pages, so anything here is technically reachable on the public web.

---

## Sound / city playlists

The public page [soundtracks/index.html](soundtracks/index.html) renders city cassette cards at runtime from **two Supabase tables**: `public.soundtracks` (one row per city tape — `city_slug` PK, `spine_tag`, `spine_tag_position`, `archived`) and `public.soundtrack_songs` (one row per track — `city_slug`, `position`, `title`, `artist`, `blurb`, `spotify_id`, `explicit`, `archived`), plus the `public.soundtrack_stats` view for per-tape counts. Schema: [mc/supabase/migrations/2026072904_soundtracks_tables.sql](mc/supabase/migrations/2026072904_soundtracks_tables.sql); the 69-tape / 929-song lift out of the old JSON file is [2026072905_soundtracks_seed.sql](mc/supabase/migrations/2026072905_soundtracks_seed.sql).

- **There is no JSON file.** `soundtracks/soundtracks.json` and its exporter `_dev/scripts/soundtracks-export.mjs` were **deleted 2026-08-06**. Between 2026-07-29 and then the file survived as an offline fallback that `/soundtracks/` read when the Supabase fetch failed, regenerated and committed by the daily routine. It was removed because the fallback made an outage *invisible*: the page rendered a stale catalogue that looked correct, so nobody learned the tables were unreachable, and the file had to be regenerated forever to stay honest about a state it was only meant to cover for. **Supabase is now the only source** — a failed fetch shows "Could not load soundtracks." and the footer stat simply goes unset. Don't reintroduce a committed snapshot, an exporter, `city-playlists.json`, `song-playlists.json`, or a CSV-driven build script; every one of those existed and was deliberately removed. **The routine now commits nothing at all**, matching the gift shop and socials bots.
- **Both reads paginate.** PostgREST caps a response at 1000 rows and truncates silently; `soundtrack_songs` is already past 900. The page and the admin each carry a `Range`-paging `fetchAllRows`.
- It reads `public.cities` with **`select=*`** only for nicer city display names + geo badges, filtering out rows flagged `hide_from_soundtracks` (falling back to the retired `ignored` column). This is optional: if the cities fetch fails, `fallbackCityRowsFromSoundtracks` renders from the tape slugs alone. **The page depends on no specific `cities` column** — don't reintroduce one.
- The old per-city `cities` sound columns (`sound_playlist_id` / `sound_accent` / `sound_secondary`) were **dropped 2026-07-24**; soundtracks are handled separately now and cassette colors come from the CSS `nth-child` scheme. Don't re-add them.
- **`archived` on a song is a do-not-rescrape tombstone**, not a delete: the row stays on its city so the same title+artist is never picked again there, while `/soundtracks/` hides it and active counts ignore it. A **unique index on `(city_slug, lower(title), lower(artist))`** is what enforces that — an INSERT of a retired song hits the index and does nothing. **The tombstone is scoped to the city, never to the song**: because `city_slug` leads that index, a track hidden on one tape can be added to another and stay active there, which is what makes the Tape Room's **Copy** work (it inserts with `archived = false`). Don't "fix" this by making the index global — a song can genuinely belong to two cities.
- **A tape over 15 active tracks is trimmed by hiding the most recently added**, newest `created_at` first, until 15 remain — never by hiding an older track to keep a newer one, since the earlier fifteen are the considered set. The agent cannot hide, so it files an over-full tape as a `facts` issue naming the surplus and a human presses Hide.
- The footer's soundtrack stat ([footer/site-footer.js](footer/site-footer.js)) counts `soundtrack_stats` rows with `active_songs > 0` via `Prefer: count=exact`, falling back to the JSON file.

Do not reintroduce per-city generated card HTML, `city-playlists.json`, `song-playlists.json`, or CSV-driven build scripts under `soundtracks/`. To add a soundtrack, insert rows (and add the city to `public.cities` first — `city_slug` is a FK to `cities.slug`).

### Two write paths, deliberately asymmetric

- **Agents insert; only humans publish or retire.** The routine calls **`tgb_pull_soundtrack_songs(jsonb)`** ([mc/supabase/migrations/2026072906_soundtrack_pull_rpc.sql](mc/supabase/migrations/2026072906_soundtrack_pull_rpc.sql), rewritten by [2026080104](mc/supabase/migrations/2026080104_soundtrack_song_review.sql)) with the ordinary public publishable key — a cloud routine has no secret store, exactly the constraint that produced `tgb_pull_book_candidates`. It is `SECURITY DEFINER` and tiny: insert-only, creates the tape row if missing, refuses a `city_slug` that is unknown or `hide_from_soundtracks`, ignores `spine_tag` on an existing tape, drops a malformed `spotify_id`, caps a call at 60 songs across 4 tapes, and **always writes `archived = true` / `certified_at = null` / `rejected_at = null`**. **Don't add parameters for those three** — those constants are what make it safe to expose to `anon`.
- **Songs land in a REVIEW queue** (added 2026-08-01), the same three states as `gift_shop_items` and derived the same way: **REVIEW** = both stamps null and it's the automatic state, **LIVE** = `certified_at` set, **SHELVED** = `rejected_at` set. Until 2026-08-01 the pull published straight to `/soundtracks/` — inherited from the era when the routine committed `soundtracks.json` to `main` — which made it the only place an agent's output reached the public site unreviewed. A human presses **Live** or **Shelve** on the track in the Tape Room.
  - **`archived` was not replaced and still means exactly what it did**: the flag `/soundtracks/` filters on, the one active counts ignore, and the do-not-rescrape tombstone the unique index enforces. Review candidates are `archived = true`, so **the public page needed no change** — an unreviewed track is invisible for the same reason a hidden one is.
  - **Hide was merged into Shelve** (2026-08-01, a day after the queue landed). They were the same effect described two ways — off `/soundtracks/`, row kept on the city as a tombstone — and having both meant three buttons for two outcomes. The UI vocabulary is now **Live / Shelve / Review** everywhere, including the tape-level buttons (**Shelve tape** / **Restore tape**) and the tallies. `setTrackArchived` is gone; **every track write goes through `setTrackStatus`**, so `archived` can't drift out of step with the two stamps.
  - **Shelving leaves `certified_at` alone**, so shelving a live track and later restoring it doesn't lose the fact that it was once approved.
  - The backfill in 2026080104 puts the whole existing catalogue in a decided state so **the queue starts empty**: visible rows and tape-cascade-hidden rows become LIVE (cascade hiding was never a judgement on the track), individually-hidden rows become SHELVED.
- **Archive / Restore is a human action** in the Tape Room, PATCHing `soundtrack_songs.archived` (one track) or `soundtracks.archived` (a whole tape) under an admin session; RLS grants writes to `authenticated` only.
- **Every track field is editable in the Tape Room** as of 2026-07-30 — press **Edit** on a row for title, artist, blurb, `spotify_id`, `explicit` and `position`, plus **Move** / **Copy** to another tape. Move is a PATCH of `city_slug`; Copy is an INSERT on the target tape with `archived = false`. Two rules the UI enforces and any future editor must keep: a blank `spotify_id` is always allowed and always better than a guess (the player falls back to a Spotify search, and a fabricated 22-char ID passes the CHECK and silently plays nothing); and **moving a hidden track carries its tombstone to the new city**, freeing the routine to re-pick that song for the old one — which is why Copy, not Move, is the right verb for a song that belongs to two cities. A rename or move that collides with the `(city_slug, lower(title), lower(artist))` unique index surfaces as a plain-English "that tape already has it, it may be hidden" message rather than a raw 23505.
- **The UI says HIDE / HIDDEN; the column stays `archived`.** Renamed in the Tape Room on 2026-07-30 — "archive" read as filed-away or deleted, when the effect is simply that the track leaves `/soundtracks/` and stops counting. Buttons are **Hide / Show** and **Hide tape / Show tape**; chips are **Hidden / Active**. Don't rename the column or the functions to match, and don't reintroduce "Archive" in visible copy.
- **The routine also audits, and reports to `public.soundtrack_issues`** (added 2026-07-30, [mc/supabase/migrations/2026073002_soundtrack_issues.sql](mc/supabase/migrations/2026073002_soundtrack_issues.sql)). Four kinds — `spotify` / `spelling` / `relevance` / `facts` — at three severities, shown in the Tape Room's **Issues** panel plus a ⚠ chip on the affected track row. Scope per run is the two tapes it just wrote plus the **3 least-recently-audited**, ordered by the new `soundtracks.last_audit_at` (null first), so the catalogue is swept every couple of weeks at flat cost. **The agent reports and never edits** — same human-in-the-loop split as everything else here.
  - Writes go through **`tgb_report_soundtrack_issues(jsonb)`**, `SECURITY DEFINER`, publishable-key callable, insert-only, always `status = 'open'`, ≤40 findings a call, and it drops a `song_id` that isn't on the named tape. **Don't add a `status` parameter** — that constant is what makes it safe to expose, exactly as with the two pull RPCs.
  - **Clearing only empties the queue; it never silences a finding.** The single **Clear issue** button writes `fixed`, and the partial unique index on `fingerprint` only blocks a re-report while a row is `open` or `dismissed` — so a cleared finding comes straight back on the next audit if the problem is still there. **That recurrence is the only check that a fix landed.** The fingerprint is `md5(city_slug:song_id:kind)` — deliberately **not** the detail text, which the agent rewords every run and which would defeat the dedupe entirely.
  - **The "Not an issue" button was removed 2026-08-01** and the page no longer writes `dismissed` at all. A permanent silence was a decision nobody could see afterwards, and it made a wrong dismissal unrecoverable without SQL. The `dismissed` status still exists in the index's `where` clause, so **any rows dismissed before that date still suppress their finding forever** — `update public.soundtrack_issues set status = 'fixed' where status = 'dismissed';` releases them if you want a clean slate. Don't reintroduce the button.
  - **A shelved track gets no findings.** A `before insert` trigger (`tgb_soundtrack_issues_skip_shelved`, [2026080104](mc/supabase/migrations/2026080104_soundtrack_song_review.sql)) silently drops a report whose `song_id` has `rejected_at` set — shelving is the strongest fix available, so there's nothing left to ask. It's a trigger, not a condition inside the RPC, so the rule also holds for psql and the table editor. **Existing** findings against a track shelved later are left in the table and filtered in the Tape Room instead, so un-shelving brings them back rather than losing them.
  - **The Issues panel rolls up by tape** — one collapsible block per city, opened automatically when it holds something `high`. A tape is the unit you act on; flat, five findings on one tape were five rows repeating the city name.
  - Each finding has **Edit**, which jumps to the track and opens its editor in place, then **Clear issue** (`fixed`, may be re-reported) and **Not an issue** (`dismissed`, silenced for good).
  - **These rows are not publicly readable**, unlike `soundtracks` / `soundtrack_songs`: "this song has no real tie to the city" is an internal editorial note. SELECT is `authenticated` only, which is why the admin's `fetchAllRows` grew a `useAuth` flag. The agent needs no SELECT — dedupe is server-side.
  - The admin tolerates the table being absent (the issues fetch `.catch`es to `[]`), so the page still works against a database that hasn't run the migration.
- **Archiving a tape cascades to its tracks**, via the `soundtracks_cascade_archive` trigger ([mc/supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql](mc/supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql)). It archives the tape's *live* songs and stamps them `archived_with_tape = true`; restoring the tape clears exactly those. **A song archived on its own stays archived through a tape restore** — that row is a do-not-rescrape tombstone, the one thing here that must never come back by accident. It lives in a trigger, not the admin page, so the rule holds for the Supabase table editor and psql too, and can't be half-applied by a client that dies between two requests. Anything reading `active_songs` depends on this: before the cascade a hidden city still reported 15 active tracks.

### Daily generation — a Claude Code cloud routine, not CI

New soundtracks are added by a **scheduled Claude Code cloud agent** ("TGB Soundtrack Bot", `trig_014sqaUyU7557svq9mGA1E4a`, cron `0 8,20 * * *` UTC — **twice a day**, 3 AM and 3 PM Central), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the alphabetically-first city with no soundtrack plus the most underfilled existing one, verifies Spotify IDs by web search, and writes them through the RPC above; it then audits those two tapes plus the 3 least-recently-audited and reports findings through `tgb_report_soundtrack_issues`. **It commits nothing.** It briefly had one git write — re-exporting the fallback file, added 2026-07-30 — which ended when that file was deleted on 2026-08-06. Songs have never travelled through a commit, so the last-run signal in [mc/soundtracks/admin/index.html](mc/soundtracks/admin/index.html) is the **newest `soundtrack_songs` row**, not the GitHub commits API (same call as the gift shop's freshest Review candidate) — and that stays correct now that there is no commit feed to read at all. The routine's stored prompt must be updated to match the paste-ready prompt in the Tape Room; both changed on 2026-07-29 when the tables landed.

**Why not GitHub Actions:** it used to be `.github/workflows/soundtrack-daily.yml` + `mc/_dev/scripts/soundtrack-daily.mjs`, both **deleted 2026-07-27**. That path needed a funded Anthropic or OpenAI API key; neither account had credit, so every run failed on a billing error. The routine bills against the Claude subscription instead. Don't recreate the workflow unless an API key gets funded — and if you do, don't leave both running or you'll get two soundtracks a day.

**Twice daily since 2026-08-01** (was `30 11` once a day). The Tape Room's last-run staleness check moved with it — `REVIEW_HOURS` is **14**, not 26, so one missed run shows rather than needing two.

**DST:** cloud cron is UTC with no DST and can't use the two-cron-plus-hour-guard trick, so **no single cron holds one Central time year-round**. `0 8,20` is exactly 3 AM / 3 PM CDT and 2 AM / 2 PM CST. Drifting an hour is accepted, not a bug — see the calendar note below for holding 3 o'clock instead.

### Standing DST note — three routines share `0 8,20 * * *`

The gift shop, soundtrack and socials bots all run on the same cron, so they all drift together and are all fixed together. **Nothing is scheduled to do this automatically; it is a human calendar item.**

| when | set all three to | Central time it lands |
|---|---|---|
| **Sun 2026-11-01** (CDT → CST) | `0 9,21 * * *` | 3 AM / 3 PM |
| **Sun 2027-03-14** (CST → CDT) | `0 8,20 * * *` | 3 AM / 3 PM |

**A FOURTH routine is on its own pair of hours** and needs the same treatment on the same two dates: TGB NFL Tour Builder runs `0 9,21`, which is **4 AM / 4 PM CDT and 3 AM / 3 PM CST**. It was asked for as "4am and 4pm Central year round", which no single cron can hold — `0 9,21` is right today and drifts an hour in winter; `0 10,22` would be right in winter and wrong now. Move it to `0 10,22` on 2026-11-01 and back to `0 9,21` on 2027-03-14 to keep 4 o'clock.

| routine | trigger id |
|---|---|
| TGB Gift Shop Bot | `trig_01H7cKJ4fk5bA1NWSqPZi4ah` |
| TGB Soundtrack Bot | `trig_014sqaUyU7557svq9mGA1E4a` |
| TGB SOCIAL BOT | `trig_01KDYndJhZ9ymgUgX5Xx6LsL` |
| TGB NFL Tour Builder | `trig_01P6fMZjt4ZapaKVoiCUfGxw` |

Edit them at [claude.ai/code/routines](https://claude.ai/code/routines), or ask Claude Code to (`/schedule`). **Do not "fix" a routine by setting the cron to the Central hour you want** — the field is UTC, so `0 3,15` fires at 10 PM / 10 AM Central, not 3 o'clock. The Waypoint Tour Scout (`45 11`) drifts the same way and is left alone deliberately; a 6:45 or 5:45 AM run is fine either way.

---
## TGB SOCIAL BOT — a third Claude Code routine

[mc/socials/index.html](mc/socials/index.html) shows social post candidates, found by a **scheduled Claude Code cloud agent** (**"TGB SOCIAL BOT"**, `trig_01KDYndJhZ9ymgUgX5Xx6LsL`, cron `0 8,20 * * *` UTC — **twice a day**, 3 AM and 3 PM Central in summer, 2 AM and 2 PM in winter unless someone applies the standing DST note above).

**ONE table holds everything: `public.socials`** ([mc/supabase/migrations/2026080502_socials_table.sql](mc/supabase/migrations/2026080502_socials_table.sql)). A row is a candidate — its content *and* its decision (`status` = review | posted | skipped). There is no JSON file and no localStorage.

**How it got here, so nobody rebuilds a discarded shape.** It was `socials/queue.json` committed by the bot, then `mc/socials/socials.json`, then briefly that file **plus** a `socials_post_state` overlay table for the human decisions. All of it is retired. The split was the problem: neither half told you what was true on its own, the file grew forever with no sign that most of it had been dealt with, decisions lived in one browser's localStorage and were invisible everywhere else, and "can we delete the json" had a dangerous answer because the file was the only copy of the content. **Don't reintroduce a file or a second table.**

- **The bot inserts through `tgb_pull_socials_candidates(jsonb)`** and commits nothing. `SECURITY DEFINER`, callable with the publishable key — a cloud routine has no secret store, the same constraint that produced `tgb_pull_book_candidates` and `tgb_pull_soundtrack_songs`. Insert-only, **always `status = 'review'`**, capped at 25 a call, and a url already present is skipped rather than raising. **Don't add a `status` parameter** — that constant is what makes it safe to expose to `anon`.
- **Dedupe is a unique index on `lower(url)`**, server-side. The bot cannot read the table (admin-only) and doesn't need to; the RPC returns `{inserted, skipped}` and the prompt tells it to check that reply.
- **The page reads and writes the table directly** under an admin session: status, the Edit dialog, and MANUAL (which INSERTs a real row, so a hand-added story is the same object as a bot-found one). RLS is `authenticated` both ways — `why` is an internal note and the review queue is not public.
- **The last-run indicator is gone**, and deliberately. It read the GitHub commits API for the JSON on the principle that a failed run pushes nothing; the bot no longer commits, so that signal doesn't exist. If it returns, read the newest `created_at` — **not** the commits API.
- **Each run emails its summary** (added 2026-08-05) — the routine's own `notifications.channel.email` flag, not the Gmail connector, which on this account can only draft. Step 7 of the prompt is the whole spec for that mail: the agent's **final message is an HTML fragment and nothing else** — no markdown, no prose around it, no code fence — carrying a header count, a **Review them** button, one block per candidate with the headline linked to its story, a Not filed list, and Notes. Two links to `https://thegamebureau.com/mc/socials/`, top and bottom.
  - **Email rules, not web rules.** Fragment only (no `<html>`/`<head>`/`<style>`), inline styles only because mail clients strip stylesheets, no images, nothing over 600px — it is read on a phone. Palette is the site's: ink `#1b2438`, muted `#6b7280`, blue `#2d4880`.
  - **The fragment goes out on a failed or empty run too**, with the failure written into Notes. The run you most need to open is the one that went wrong, and an email with no link is a dead end.
- **Five candidates every run, and a `confidence` score is what makes that safe** (2026-08-07). The bot used to be told a short honest run beat a padded one and to file four or three when five would not clear the bar. It now files **five**, bending every editorial rule — the 7-day window, the topic mix, one-source-per-story — before it bends the count, and declares the stretch by scoring each pick **1-100** into `socials.confidence` ([2026080701_socials_confidence.sql](mc/supabase/migrations/2026080701_socials_confidence.sql)). 80+ post it without thinking, 20-39 filed to reach five with a rule bent. **Null is not zero** — every row before that date, and every hand-added candidate, is unscored, and the card renders nothing rather than a 0. The one rule that still outranks the count is the avoid list: file four rather than post something off-brand. The score prints as `72%` in front of the card's REASONING label, red under 40.
- **The PROMPT button and the routine are two different prompts on purpose, and the difference is the write path.** The routine holds the publishable key and inserts through `tgb_pull_socials_candidates` unattended. The PROMPT button is for pasting into *another* AI — ChatGPT, Gemini, whatever is open — which has no key and no session, so its deliverable is **one `insert into public.socials` statement in a ```sql block** that a human runs in the Supabase SQL editor. **Do not "fix" the page prompt to call the RPC** (attempted 2026-08-07 and reverted): a chat AI cannot make the call, and the SQL is the whole point of that button. Editorial rules — the beat, the mix, the caption voice, the confidence bands — have to be kept in step across both by hand; only the last step differs.
  - The prompt lives in a `<textarea>`, which is RCDATA: `<div>` survives as literal text, but `&` must be written `&amp;` or a raw `&middot;` in the email template is entity-decoded and whoever copies it gets a real `·`.
- **The agent posts nothing and holds no account credentials.** A human clicks **Post** (opens the prefilled composers) or **Skip**. Don't ever wire this to a social API — the human-in-the-loop is the design, not a missing feature.

### Posting: three accounts, two credentials, one that expires

**Post** calls the [socials-post](mc/supabase/functions/socials-post/index.ts) Edge Function, which holds every token. The page holds none and never will — it is static HTML in a public repo, so a token in it is a published token. `PLATFORM_AUTOPOST` in [mc/socials/index.html](mc/socials/index.html) is only a flag saying whether the function can genuinely post there; flipping one on without its secret turns Post into a button that reports a failure the page could have predicted.

- **Facebook and Instagram are one credential** — a single Page token, `META_PAGE_ACCESS_TOKEN`. Both ids are **derived from the token** rather than stored, because a mistyped numeric id doesn't error, it posts to the wrong place. A whole day was lost to the app and the Page sitting in different **business portfolios**, which no permission can bridge and which reports nothing: the post succeeds, returns a real id, and lands somewhere else. `tgbDiagnosePost()` in the console answers what the token actually points at; run it after any token change.
- **Threads is a separate API, token and id** on `graph.threads.net` — a Page token cannot reach it. Getting the credential is a four-step errand where three steps are invisible: **Threads Tester** is its own app role (not the generic Tester), the invite is **accepted inside the phone app** with nothing in the dashboard prompting you, the account must be **public**, and `THREADS_USER_ID` is displayed nowhere — read it from `GET graph.threads.net/v1.0/me?fields=id,username`.
- **THE THREADS TOKEN EXPIRES AFTER 60 DAYS and nothing else here does.** The Meta credential is a System User token that lasts forever, so no other secret on this project has ever needed renewing. Since an Edge Function cannot write its own secrets, a refreshed token has nowhere to go — which is why **`public.integration_tokens`** exists ([2026080905](mc/supabase/migrations/2026080905_integration_tokens.sql)): RLS on with **no policies**, so only the service role can touch it. `socials-post` seeds the row from `THREADS_ACCESS_TOKEN` on first use, then refreshes on any post within a week of expiry.
  - **Once the row exists the secret is ignored.** Re-running `supabase secrets set THREADS_ACCESS_TOKEN=...` changes nothing; `delete from public.integration_tokens where key = 'threads';` first.
  - **It refreshes on posting, not on a schedule**, so the token still dies if nobody posts for two months. If that ever happens, the fix is a cron — not more code in the function.
  - Threads refuses to refresh a token under **24 hours old**, so a failed refresh is logged and never fatal; the post goes out on the token it has.
- **`posted_platforms` is a receipt and must name the real account.** Its labels come from a lookup with no default, deliberately: it was a `facebook ? … : 'Instagram'` ternary from the two-platform era, which would have filed every Threads post as Instagram the day Threads went live.
- **ONE CLICK REACHES EVERY ACCOUNT THAT CAN TAKE THE STORY, and `postTargets()` is the only place that is decided.** Which accounts is a *fact about the candidate*, not a preference — Instagram's API refuses a text-only post, so it drops off a candidate with no image; Facebook and Threads take anything. The button therefore states the outcome ("Post to Facebook + Instagram + Threads") rather than asking a question with one sensible answer. **Anything added later goes in `postTargets()` or it is inert.**
  - **The agent's `platforms` tags are ADVICE, NOT ROUTING.** They are still stored, still shown in Edit, and still worth writing — a human reads them when deciding whether to post at all — but nothing routes on them. Both prompts say so.
  - **This is how Threads shipped broken for a morning.** The Edge Function, the secret and `PLATFORM_AUTOPOST.threads` were all correct, and none of it did anything, because the button asked `metaTargets()` — an answer that cannot contain Threads. `PLATFORM_ORDER` had `'threads'` added to it and hadn't been read by anything since the per-card picker was deleted with X and YouTube. **A list that no longer feeds anything answers "is this wired?" with a convincing yes**, which is why `PLATFORM_ORDER`, `PLATFORM_LABELS`, `platformLabel()`, `platformList()` and `autoPostable()` were all deleted rather than left lying about. A flag is not a switch unless something reads it.

---

## Nightly waypoints run — a fourth Claude Code routine

Walking-tour candidates are found each morning by a **scheduled Claude Code cloud agent** ("TGB Waypoint Tour Scout", `trig_01Q5uCittJ3dT3M2xj8sKD3j`, cron `45 11 * * *` UTC = 6:45 AM Central in summer, 5:45 AM in winter). Each run picks the **NFL host city that has gone longest without a run**, sweeps **Wikipedia and Wikimedia** for places there, verifies each stop, and commits [mc/stops/nightly.json](mc/stops/nightly.json) to `main`.

- **A stop must have a Wikipedia article (or Commons category) carrying coordinates or a street address.** That single constraint does most of the quality filtering: a place notable enough for an article and pinned precisely enough to geotag is a place worth standing in front of, and the article URL still resolves years later — a visitor-bureau tour PDF will not. NRHP county listings and National Historic Landmark lists are the richest vein (address *and* coordinates per row); Wikipedia GeoSearch sweeps a downtown core; Commons is the still-standing photo check. Switched from published-walking-tour sourcing on 2026-07-29 — the same rules live in `WIKI_SOURCE_LINES` in [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js), shared by both AI prompts, so page and routine can't drift.
- **Wikipedia decides which stops, never the facts.** Articles routinely lack a street address or give a mailing one, so the address comes from the NRHP row or an independent source and stays `null` otherwise — **coordinates are never turned into a street address**, even though the table has `lat`/`lon` again (see below). A point is not an address; reverse-geocoding one produces a plausible, wrong, uncheckable street line.

### waypoints.lat / waypoints.lon — a performance fix, not a schema nicety

Re-added 2026-08-07 by [2026080704_waypoints_latlon.sql](mc/supabase/migrations/2026080704_waypoints_latlon.sql). They had existed once (`20260620_add_waypoints_latlon.sql`) and were dropped straight in the dashboard with no migration, which is why the repo read as though they were there and only an aside in `2026072703` recorded that they were not.

**Without them the Waypoints page was unusably slow, and the reason was invisible.** Its city map derived every pin from the street address at runtime through Nominatim, which allows **one request per second** — so the loop is necessarily sequential with a 1100 ms gap. On a cold cache that cost **~41s for Denver (37 pins)**, ~30s Baltimore, ~23s Atlanta before the map settled. A `localStorage` cache hid it on whichever machine had already sat through it, so it read as "sometimes slow" — fast for whoever built the city, slow for everyone else, in every new browser, after every cache clear. The data was never the problem: 220 rows is 78 KB in 0.65s.

- **The page writes a point back the moment it geocodes one** (`persistPoint`), so the work is paid once by whoever happens to open that city. It is fire-and-forget: a failed save just leaves the pin local, which is the old behaviour.
- **`SAVED_FIELDS` already listed `lat`/`lon`**, so setting them marks a card unsaved unless the pristine snapshot is retaken — `persistPoint` does that, but **only on a row that is currently clean**, or it would swallow edits in progress. `payloadFromRow` sends `EDITABLE_FIELDS` only, so a later Save can never null the pair back out.
- **Both columns are probed, not assumed** (`hasLatLonColumns`), the same way `source_url` and `archived` are: naming a column PostgREST does not have 400s the entire page load, so a database that has not run the migration still works — it just geocodes the slow way.
- **The backfill is [mc/_dev/scripts/backfill-waypoint-coords.mjs](mc/_dev/scripts/backfill-waypoint-coords.mjs)**, run once on 2026-08-08 over the whole table. **It writes no database and needs no key** — it reads rows as JSON on stdin and prints one `UPDATE ... from (values ...)` on stdout, which you apply however you like. It used to want `SUPABASE_SERVICE_KEY`, a secret that is not in `.env` and should not have to be, which is why it had never actually run. Safe to re-run and safe to interrupt — it only ever looks at the rows you hand it, and its output touches only `where lat is null`. ~5 minutes for 280 rows. **Do not parallelise it**: the 1/sec limit is Nominatim's usage policy, and the identifying User-Agent is part of that policy.
- **`waypoints.address` is a COMPLETE address**, not a street line — `"200 E Colfax Ave, Denver, CO 80203"`. Appending city/state/zip to it produces a string Nominatim cannot resolve, which is exactly how the first cut of the backfill found nothing for three Denver rows in a row. Query it as-is, or split the street segment back out for the structured endpoint. Both work; `street=<the whole address>` does not.
- A row that will not resolve — an intersection like `"E Colfax Ave and Broadway"` — keeps a null point and is geocoded on demand, as before. Null means "not located yet", never "has no location".

- **The agent writes one file and never touches the database.** It has no admin session and no RPC, by design — a human opens [mc/routes.html](mc/routes.html), presses **Nightly**, and adds the stops worth keeping under their own session. Don't give it a write path; the review step is the feature, the same call as the socials scout.
- **The city rotation is derived from git history**, not from the table: the routine can't read `waypoints` (RLS gates SELECT behind an admin session), so it reads the last ~40 commits of `nightly.json` and picks the city missing longest. Duplicates are therefore possible and harmless — the admin page checks name + city against the loaded rows and marks an already-present stop "In table".
- **The list is replaced wholesale each run.** An unadded stop is gone tomorrow, which keeps the panel to one morning's decisions.
- **`source_url` is mandatory on every stop** — the stop's own Wikipedia article (or the list article it is a row in), which lands in the waypoint's Source URL field so the claim stays checkable later.
- Last-run status reads the **GitHub commits API** for `mc/stops/nightly.json`, same as the socials admin: a run that errored pushes nothing, so a stale timestamp is the failure signal.
- The schedule sits at `:45` to keep it clear of the other three (`:00` gift shop, `:15` socials, `:30` soundtrack). Same DST caveat as the rest — the cloud cron is UTC, so it drifts an hour in winter.

### Routes are their OWN tables. A waypoint is a place. (2026-08-08, second pass)

| table | holds |
|---|---|
| `public.waypoints` | the places. **One row per place, ever.** No tour columns. |
| `public.routes` | `tour_id` (PK), `title`, `shape`, `city`. One row per route. |
| `public.route_stops` | `tour_id`, `wpid`, `ord`. **Nothing but ids and a position.** |

Migration: [2026080804_routes_and_route_stops.sql](mc/supabase/migrations/2026080804_routes_and_route_stops.sql). Editor: **[mc/routes.html](mc/routes.html) — "Route Builder"**, under GAME BUILDER in the nav.

**This REVERSES the columns-on-waypoints design from earlier the same day**, which gave a place on two walks two rows so each could carry its own sentence and its own order. The argument was real; the cost was worse. The duplicate rows were not marked as being the same place, so the catalogue grew a second Freedom Tower every time somebody built another downtown Miami walk, the map drew two pins on one building, the importers' name+city dedupe fought the design that required the duplicate, and **"what routes is this place on" could not be asked at all**. One place, one row, is the shape a catalogue wants.

- **The accepted trade, stated plainly:** a waypoint's description is shared by every route it is on. Edit it once, it changes everywhere. The merge had to pick one sentence out of two for seven Miami places.
- **`walk_order` STAYS on `waypoints` and is NOT a route position.** It is the per-city advisory order the Suggest order button computes, and it predates tours entirely. A route's order is `route_stops.ord`.
- **`tour_id` / `tour_title` / `tour_shape` on `waypoints` are retired but NOT dropped** — left in place and unread, the same way `public.maps` and `gift_shop_cities` were, so a deploy that has not caught up does not 400. The `drop` sits commented at the bottom of the migration. Nothing reads them.
- **`on delete cascade` on both sides of `route_stops`.** Deleting a route must not leave orphan stops; deleting a waypoint must not leave a route pointing at nothing. The waypoint is protected by being hard to delete in the UI, not by an orphan row.
- **A place appears at most once per route** — that is the `(tour_id, wpid)` primary key. A loop *finishes near* its first stop, it does not list it again.

**Deduping is on NAME + ADDRESS, never address alone.** One address is routinely several stops: 100 W 14th Ave Pkwy in Denver is the Denver Art Museum *and* the Scottish Angus Cow and Calf *and* Big Sweep and Monolith; 206 Washington St in Boston is the Old State House *and* the Boston Massacre Site; 43 Monument Sq is the Bunker Hill Monument *and* its museum. Collapsing on address would have deleted eleven real stops. The migration merged 9 rows and left 7 places genuinely shared across two routes.

- **[tgb_import_walking_tour](mc/supabase/walking-tour-prompt-import.sql) now REUSES a place it already holds** rather than inserting a second copy, matching on name + address, and **leaves a reused place's description exactly as it was** — the returned note says so. It writes all three tables and returns `action` = `route` then `waypoint` per stop.
  - Its `on conflict` names **`route_stops_pkey`** rather than `(tour_id, wpid)`. The function's `RETURNS TABLE` declares output columns called `wpid` and `ord`, and inside an index-inference clause plpgsql cannot tell those from the table's own columns — it raises `column reference "wpid" is ambiguous`. Naming the constraint sidesteps resolution entirely.
- **`tour_id` is city + shape + UTC timestamp TO THE SECOND.** Minutes were not enough: two imports of one city and shape inside a minute collided on the id and the second silently merged into the first. That produced a real twenty-stop "loop" in this table, which [2026080804](mc/supabase/migrations/2026080804_routes_and_route_stops.sql) split back apart.
- **It is called `tour_id`, not `route_id`, and that is deliberate** even now the table is named `routes`. **Route** is taken: in the canonical hierarchy a Game contains Routes and a Route's real ordering is `public.stops.ord`. Renaming the column would also break every stored `?tour=` link and the routine's stored prompt. (`route_color` is a third unrelated use of the word — the engine's rotation slot.)

### The Route Builder page

- **Two columns: the route, and the city's unused waypoints.** The whole job is moving rows between them, so they sit side by side.
- **Drag by the HANDLE only.** Making the whole row draggable makes its text impossible to select, which you want when copying an address. The drop indicator is a line above or below the target rather than live reordering — aiming at ten rows that move as you go is hard.
- **Save is delete-then-insert for the whole route, not a diff.** A route is a dozen rows, positions shift wholesale when you move one, and a partial failure leaving two stop 3s is worse than redoing the lot. A crash between the two requests empties the route, which is visible and fixable; a silently wrong order is not.
- **Remove takes a stop off the route and keeps the waypoint.** That is the entire reason these are two tables.
- **Route title / shape / city save on change; only the ORDER has a Save button.** Two kinds of save on one screen is confusing, and the order is the one you spend time on and would hate to lose — hence also the `beforeunload` guard.
- **The route id is shown and not editable.** Every `route_stops` row points at it; renaming would orphan them all — the same bargain `anchor_events` makes with its client-supplied primary key.
- **It has a map now** (2026-08-08) and still loads no Leaflet up front: `ensureLeaflet()` injects it the first time a route actually has a point to draw, so the fast first paint the page was built for survives. Numbered pins in route order, green start and red end, a dashed walk line under a white casing — a bare 2px dark line is invisible on satellite tiles — and a toggle for the city's unused waypoints as hollow dots you can click to add. It refits **only when the set of drawn points changes, never on a reorder**; yanking the viewport mid-drag makes the map useless exactly when it is being used.
- **The map reads stored `lat`/`lon` only and never geocodes.** Waypoints pays that 1-request-a-second cost once and writes the point back; this page reads it. An unlocated stop is named in the note rather than drawn.
- **CITY sits left of ROUTE and narrows it.** The catalogue is every walk in every city and a route's title does not say where it is. The city list is built from the routes themselves so it never offers an empty city; picking one opens the first route there, because a filter that hides the selected row while the picker still names it is the list contradicting itself.
- **Deriving beats storing:** there is no stored pool-city filter. The route has a city; the pool is that city's other waypoints. Two city controls on one screen can disagree.
- **`cityNameOf` exists because the two catalogues disagree.** `cities.city` is canonical `"Miami, Florida"`; `waypoints.city` and every `routes.city` hold the bare `"Miami"`. A city is **picked** from the catalogue and **stored** bare — store the canonical string and the pool matches no waypoint.

### The Waypoints page was folded into the Route Builder (2026-08-09)

`mc/data/waypoints.html` — 7,608 lines — **is deleted**. Everything it did is in [mc/routes.html](mc/routes.html), reached by popup off whichever list or pin you found the place in. The reasoning was that the catalogue and the walk built out of it are one job, and two rooms meant two copies of the same city, two maps, and a tab-switch in the middle of every edit.

**It is a hard break with no redirect** (GitHub Pages serves no 301), the same as the `/gifts/` and `/highlights/admin/` moves. Every in-repo link was repointed: the nav menu, the Data Warehouse card, `mc/review/index.html`, and Stop Builder's "new waypoint" button.

**Two shared modules came out of it, and they are the point.** This repo already carried the Plus Code codec twice and the waypoints import helper twice, each with a standing keep-in-sync note and a history of drift, so the merge extracted rather than copied:

| module | holds | notes |
|---|---|---|
| [mc/assets/waypoint-geo.js](mc/assets/waypoint-geo.js) | Plus Code codec, the point cache, Nominatim scoring, Fill, ZIP resolution, Wikipedia descriptions, the walk solver, dedupe, the world search | Pure logic — no DOM, no page state, no Supabase. Hand it a waypoint-shaped object, get points and patches back. |
| [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) | the five AI prompts and the schema / import-helper SQL they embed | **The text is the product.** Every clause was paid for by a bad run. Move it, don't rewrite it. |

- **`buildTourPlacesWaypointPrompt` is a scheduled routine's stored specification** — TGB NFL Tour Builder opens the file, finds the function, and follows it. It now lives in `waypoint-prompts.js`. **Renaming or moving it breaks that routine silently**, with no error anywhere, and the trigger's stored prompt must be updated whenever the path changes.
- **The editor is one waypoint at a time**, which is what the popup buys. The card page needed a dirty *set*, Save all, per-card Save, an Edit lock so a stray click could not silently alter a description, and a paging guard. A dialog holds a working copy: Save writes it, Close asks and discards.
- **Fill and Locate are separate.** Fill completes blank *fields*; Locate only finds coordinates. Wanting a pin is not wanting a Wikipedia sentence.
- **Editing an address clears the stored point** — those coordinates describe where the old address was.
- **Nothing found online is inserted from a results list.** A search result, and a NIGHTLY candidate, opens in the editor as an unsaved draft. The old page inserted your pick and then took you to its card to correct it, which is backwards: the geocoder is usually *nearly* right, and nearly right inserted unreviewed is what fills a catalogue with rows nobody can later tell from real ones.
- **Every search source fails soft.** Overpass is a free endpoint that 504s whenever it is busy; the first cut let that reject the whole search, discarding Nominatim matches already in hand. `search()` reports which sources answered so a partial answer says so.
- **`fillFieldsFromPlace` writes the state CODE.** Nominatim answers `"Florida"`; all 280-odd rows hold `"FL"`. The old page wrote the long form, making rows that look fine alone and sort, group and match differently from every other row in their state.
- **Dedupe warns three times and blocks never** — results list, draft, and Create. One address is routinely several stops (a museum and the sculpture outside it), which is why a conflicting house number vetoes an address match outright while names match on containment and typos.
- **Suggest order rewrites `route_stops.ord`, not `waypoints.walk_order`.** That column is the per-city hint described below and predates routes. Unlocated stops keep their relative order and sink to the end; nothing is written until Save.

### Leaflet was the slow load, not the data

The Waypoints page (deleted 2026-08-09, see the merge note above) loaded Leaflet as a plain synchronous tag in `<head>`: **144 KB from unpkg had to arrive and parse before the page painted anything**, whether or not a map was ever drawn. Once the coordinate backfill removed the runtime geocoding, that was all that was left of "super slow load". `ensureLeaflet()` now injects the CSS and JS the first time a city map is actually built, memoised so ten cards cannot start ten downloads, and resolving even on error — a map that will not load is not a broken page, the cards are the point and they are all still there.

### Suggested stop order — advisory, and NOT a route

Added 2026-08-07: a **Suggest order** button on the Waypoints city view, and `public.waypoints.walk_order` ([2026080705](mc/supabase/migrations/2026080705_waypoints_walk_order.sql)) to store the answer.

**The line that matters:** this is a per-city HINT, not a route. **A game's real ordering is `public.stops.ord`**, because a Stop is game + waypoint + challenge and the same waypoint sits at different positions in different games. Nothing may read a game's route out of `walk_order`, and nothing may write one into it. The page says so on screen — "not saved — set a real order in the Stop Builder" — and the column comment says so in the database.

**Two producers, deliberately, because they answer different questions.**

- **The button solves geometry.** Nearest neighbour then 2-opt over the stored `lat`/`lon`, until it stops improving. Nearest neighbour alone paints itself into a corner and crosses the city to collect what it skipped; 2-opt removes exactly those crossings. It is an **open** walk — you need not end where you started — so the ends are never joined. On real Denver data it turns a 9.4 km wander into **3.9 km, 59% shorter**, and 37 pins solve in ~31 ms. It starts from the northernmost point, an arbitrary but **stable** choice so the same city always gives the same walk.
- **The AI prompts sequence what they return** (`WALK_ORDER_RULE`, shared across all four prompts for the same reason `WIKI_SOURCE_LINES` is). A model that has just researched twelve places in one downtown knows which two share a block and where a visitor plausibly starts — judgement that is free at research time and expensive to recover afterwards. The solver knows only metres.

Either can replace the other; pressing the button recomputes from geometry whenever a stored sequence looks wrong.

- **Positions are 1..n scoped to the CITY** and repeat across cities. Nothing enforces uniqueness on purpose: an import that lands two 3s is untidy, not broken, and a unique index would make a reasonable paste fail outright.
- **Saving writes only the LOCATED rows.** A waypoint with no point keeps whatever it had rather than being nulled — it was never part of the walk being saved, and clearing it would quietly discard an order an AI import supplied for a stop the map has not placed yet.
- **The button's suggestion outranks a saved order** while it is on screen; you pressed it to see something different from what is stored. Unsequenced rows sink to the end in both cases rather than scattering through the middle.
- The order **clears when you change city** — Denver's positions must not order Baltimore's cards — and the button is hidden on **All**, where the set is sixty cities and a walk between them is not a thing anyone does.
- `walk_order` is in **both** copies of the import helper: [mc/supabase/waypoints-prompt-import.sql](mc/supabase/waypoints-prompt-import.sql) and the inlined `buildWaypointImportHelperSql()` on the page. **Keep them in sync**, the standing rule for that pair. A value outside 1..999 is dropped rather than rejected — an unsequenced stop is a small loss, a failed paste of twelve is not. The **sports** helper does not take it: that pull scatters football places across cities other than the team's own, where a per-city walk position means nothing.

### With AI (tour places) — absorbed from the deleted Game Places page

**`mc/places.html` ("Game Places") was deleted 2026-08-07** and its research is now the Waypoints page's **With AI (tour places)** prompt. The research was never the problem; **the delivery was**. Game Places was a `research.js` assistant, so its deliverable was a cousin JSONL file — its 456 places sat in `mc/data/places.jsonl` doing nothing until somebody hand-wrote [2026073102_places_walking_tour_waypoints.sql](mc/supabase/migrations/2026073102_places_walking_tour_waypoints.sql) to lift 406 of them into `public.waypoints`. Asking for the same research as an **import SQL block** — the shape every other prompt on the page already returns — removes the middle file and the hand-written migration with it.

- **Nothing was left to migrate.** `places.jsonl` was deleted once 2026073102 landed, and the 406 rows are in `waypoints`. The 496 places still in `mc/data/atlas.jsonl` are the archived `content.html` map's store, not Game Places output: 436 duplicate the seeded rows, and the remaining 60 are **game start locations**, reverse-imported from `games.starting_location_*` and stamped "Imported from N game rows as a starting-location candidate."
  - **17 of those 60 are real stadiums and were rescued** by [2026080703_stadium_waypoints_from_atlas.sql](mc/supabase/migrations/2026080703_stadium_waypoints_from_atlas.sql) — every field rewritten and verified, not copied, because the source rows carry a Nominatim reverse-geocode dump as the address, a description that says only that they were imported, and a `maps.google.com/?q=lat,lon` "source" that proves nothing. Nine facts were wrong and are corrected there, including a "Boston Stadium" that is Gillette in Foxborough, a "New York New Jersey Stadium" that is MetLife, Allegiant filed under Las Vegas when it sits in Paradise, and Allianz Arena's street, renamed for Franz Beckenbauer in May 2025.
  - **The other 43 are not imported and should not be.** They are street segments dressed as places ("Girod Street Starting Point", "the flagpole"), meeting-point restaurants, and visitor centres, several filed under the wrong city outright — a New Orleans neutral ground recorded as Anchorage, Griffith Park's ranger station as Inglewood. The source data stays in `atlas.jsonl` if that call is ever revisited.
- **What separates it from plain "With AI":** that prompt sweeps a city for anything standable. This one starts from **established published tours** and keeps only what those tours actually stop at — a narrower, better-evidenced set, because somebody already decided the place was worth walking to and wrote it down.
- **The route is a LOOP, and the last stop must be within a five-minute walk of the first.** A walk that ends a mile from where it began is one people have to solve at the end of — they left a car, or came out of a station. Out-and-back is fine; the return leg should use a different street where the grid allows, since retracing identical pavement wastes the second half. This **replaced** an earlier "never send people back the way they came", which said the opposite.
- **Start and end are marked by `walk_order` alone.** Position 1 is the start, the highest position is the end, both must be the commercial food-or-drink stops, and nothing is added to the name or description to say so — the description's only job is to be read aloud at the stop.
- **All six stops must be distinct places**: not one building's two entrances, not "Union Station" and "the Union Station clock", and the last stop is *near* the first, never the same as it.
- **Existing waypoints are a DO-NOT-REPEAT LIST and nothing else** (2026-08-07). They were briefly sent as *anchors* to route around; that was withdrawn because the catalog was accumulated from sources of uneven quality and is not trusted stop-by-stop. The prompt now says so explicitly — if the best six stops in a city sit nowhere near anything we hold, that is the correct answer. `existingWaypointAnchors` still supplies the addresses, which the shared `existingWaypointSample` can't — it returns "Name — City", which is right for a do-not-duplicate list and useless for judging distance.

### TGB NFL Tour Builder — a fifth routine, and the only one that reads a page as its spec

`trig_01P6fMZjt4ZapaKVoiCUfGxw`, cron `0 9,21 * * *` UTC — twice a day, **4 AM / 4 PM Central in summer, 3 AM / 3 PM in winter** (see the standing DST note). Added 2026-08-07.

**It has no prompt of its own, by design.** Step 1 of its stored prompt is *open [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) and find `buildTourPlacesWaypointPrompt` — that function is the specification*. **It said `mc/data/waypoints.html` until 2026-08-09**, when that page was folded into the Route Builder and deleted; the stored prompt was repointed the same day. It now also carries a stop-rather-than-improvise instruction: if the file is missing or the function is not in it, the run reports that the spec has moved again and commits nothing, because the failure it is guarding against is silent — an agent that cannot find its spec will happily write a route from memory. **If these prompts ever move again, update the trigger in the same commit.** Proximity, the address rule, sports-and-music, the commercial start and end, the description voice, `WALK_ORDER_RULE`, the SQL shape: all of it is read fresh each run. The stored prompt only says how the routine **differs**, which is exactly two things — **six stops** instead of 8–12, and it picks its own city. Edit the page and the routine follows; that is the whole point, and it is why nothing here is worth duplicating into the trigger.

- **The city is the FANBASE city, never the venue city** — `teams.fanbase`, so Boston not Foxborough, Buffalo not Orchard Park, Dallas not Arlington, Miami not Miami Gardens. Twelve of the 32 clubs differ, and the venue town is the wrong answer for all of them: nobody sells a walking tour of Orchard Park.
- **It counts rows in `public.routes`, not waypoints, and skips a city at 3 or more.** A city with forty waypoints and no route has *zero* routes and is a strong candidate — a waypoint is a place, and most places are on no route. It picks the fanbase city with the fewest routes and re-rolls the shape if that city already has one of that shape. When every city has three, the run writes nothing and says so — a success, not a failure. (Until 2026-08-08 this counted distinct `waypoints.tour_id`; that column is retired and the routine's stored prompt was updated with it.)
- **It reads Supabase with the publishable key and writes nothing to it.** `tgb_import_waypoints_prompt_items` is SECURITY INVOKER and waypoint writes are `authenticated`-only, so the routine *cannot* insert even if it tried. Its deliverable is a committed `mc/supabase/tours/YYYY-MM-DD-<city>.sql` that a human runs — the same human-in-the-loop split as the waypoint scout, and the reason no new SECURITY DEFINER RPC was added for it.
- **`waypoints` is anon-readable**, which the nightly-scout section of this file denies. That claim is stale: `select` returns all 228 rows with the publishable key, which is what lets this routine count live waypoints per city directly instead of inferring a rotation from git history.

### With AI (sports) — the one importer that appends instead of skipping

[mc/routes.html](mc/routes.html) has a fourth AI pull, **With AI (sports)** (added 2026-07-31), and it inverts the rule the other three share. The other prompts start from a city and ask what is in it; this one starts from the football and asks where it happened, keeping the answer **only when the place sits in a city other than that team's home** — a Seahawk's wedding church in New York, a Cowboys lineman's childhood home in Ohio, a Packers coach's grave in Georgia. A Steelers marker in Pittsburgh is explicitly worthless to it. Those stops are invisible to any city-first sweep, because no walking-tour list in Nashville is organized by which NFL team the groom played for.

- **It writes through `tgb_import_waypoints_sports_items`, not `tgb_import_waypoints_prompt_items`** — a second helper in [mc/supabase/waypoints-prompt-import.sql](mc/supabase/waypoints-prompt-import.sql), inlined into the generated prompt by `buildWaypointSportsImportHelperSql()` on the page (keep the two in sync, same as the original). Identical JSON shape; the difference is what happens on a name + city hit.
- **An existing waypoint gets the new sentence APPENDED to its description** rather than being skipped. That is the point, not a convenience: these places are usually already in the catalog for some unrelated local reason, and the football fact is the only new thing the run produced. Skipping would throw away the entire result.
- Re-paste safety comes from three rules in the function: the append is a no-op when the sentence is already in the description; **an archived row is appended to but never un-archived** (archived is a do-not-rescrape tombstone, and the returned `note` flags when this happened); and a non-null `state` / `zip` / `address` / `source_url` is left alone — only blanks are backfilled, so the AI never overwrites a human.
- It is its **own button, not a mode** of the With AI modal, because it has no place to pick — the search is "wherever the football turns out to be", so the mode's city picker would sit empty. One number, one button.

---

## Gift shop daily book pull — also a Claude Code routine

Candidate books are added by a **scheduled Claude Code cloud agent** ("TGB Gift Shop Bot", `trig_01H7cKJ4fk5bA1NWSqPZi4ah`, cron `0 8,20 * * *` UTC — **twice a day**, 3 AM and 3 PM Central in summer, 2 AM and 2 PM in winter — see the standing DST note in the soundtrack section), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the city with the fewest gifts, web-searches five books, verifies every ISBN against a real listing page, and files them as **Review candidates**. It commits nothing — the write lands in Supabase.

**Auth without a secret.** A cloud routine has no secret store, so it calls **`tgb_pull_book_candidates(jsonb)`** ([mc/supabase/migrations/2026072802_book_candidate_pull_rpc.sql](mc/supabase/migrations/2026072802_book_candidate_pull_rpc.sql)) with the ordinary public publishable key. That function is `SECURITY DEFINER` and deliberately tiny: it can only INSERT rows with `archived = true` / `certified_at = null`, derives the Bookshop URL and cover from the ISBN so a caller can't inject a link, keeps the title/URL dedupe, and caps a call at 25 items. **Don't add parameters for `archived` or `certified_at`** — those constants are what make it safe to expose. The admin-facing `tgb_import_bookshop_prompt_items()` is unchanged and stays SECURITY INVOKER.

**Why not GitHub Actions:** it used to be `.github/workflows/shop-book-pull.yml` + `mc/_dev/scripts/shop-book-pull.mjs`, both **deleted 2026-07-28**. Two reasons. It needed a funded `ANTHROPIC_API_KEY` (the same unfunded key that killed the soundtrack workflow), and its schedule had silently stopped working: crons fired at `:55`, GitHub started scheduled runs up to 30+ minutes late, and the Central-hour guard then skipped every job while the run still reported **success**. Green runs, no books — last real insert was 2026-07-26. If you ever reinstate a cron guard, gate on a *window* of hours, never hour equality against a `:55` trigger.

Last-run status lives in the **TGB GIFT SHOP BOT** modal in [mc/gifts/index.html](mc/gifts/index.html) (called NIGHTLY until 2026-08-01; the ids in the markup are still `nightlyBtn` / `nightlyModal`). Since the job commits nothing there is no commit feed to read, so the panel treats **the freshest book the bot filed as the run receipt**, newest `created_at` first. The bot files every book as REVIEW (`archived = true`, both stamps null), so a bot row is matched by **`or=(archived.eq.true,certified_at.not.is.null)`** — which covers it whether it's still a Review candidate, was Shelved (`archived` stays true), *or* was Published (`certified_at` set, `archived` flipped to false). **Don't narrow this back to `archived = true and certified_at is null`** (the pre-2026-08-10 filter): publishing a whole morning's batch flipped every row to `archived = false` and dropped the run from that filter, so the timestamp fell back to an older Shelved leftover and a healthy pull read as "nothing new in over a day — check the routine." A manual add lands `archived = false` with both stamps null, so it stays excluded and can't masquerade as a bot run. It went twice-daily on 2026-08-01, at which point `BOOK_PULL_STALE_HOURS` dropped from 30 to **14** so one missed run shows rather than needing two.

---

## Stops and Challenges

The canonical hierarchy finally has tables behind it, as of 2026-07-30 — [mc/supabase/migrations/2026073003_stops_and_challenges.sql](mc/supabase/migrations/2026073003_stops_and_challenges.sql).

> **PARKED 2026-08-09.** Stop Builder is **off the Mission Control menu** and its file is renamed **[mc/_stops.html](mc/_stops.html)** — the leading underscore marks a room that is still live but is not offered. It is the only writer of `public.stops`, which the two game editors read through the `game_stops` view, so it cannot simply be deleted. Reach it by typing the URL.
>
> **Why:** `public.stops` is keyed by **city**, so every game in a city shares one list and **a city cannot have two different walks**. That is precisely what `public.routes` + `public.route_stops` were built to fix (2026-08-08), so the product now has two systems ordering the same waypoints — 41 stop rows across 14 cities against 24 route_stops rows across 4 routes, and only **1 of the 41** stops has a challenge attached.
>
> **The end state** matches the canonical hierarchy already written above: `route_stops` gains `challenge_id` and `end`, a game points at a `tour_id` instead of inheriting its city's list, the Route Builder grows a challenge picker, and `public.stops` + `game_stops` + `_stops.html` all retire. That touches **both engines** — the paid product — so it is a deliberate piece of work, not a follow-on.

- **`public.stops`** is a Stop: **`city_slug`** + `waypoint_id` + `challenge_id`, plus `ord` and `end`. **It is keyed by CITY, not by game** — this file said `game_id` until 2026-08-09 and was simply wrong; the column does not exist and PostgREST 400s on it. Every game in a city shares that city's stops, and **`public.game_stops` is the view that projects them back per game**, which is what makes the editors' "stops for game X" query work unchanged. It **supersedes `public.maps`**, which held these rows without the challenge. **`maps` is left in place but unread**, the same way `gift_shop_cities` was retired; the `drop table` sits commented at the bottom of the migration. Don't write `maps` again.
- **`public.challenges`** is the playable content: `name` (admin label), `prompt` (what the player reads), `answer`, and `kind` ∈ question | minigame | photo | freeform. **A challenge is reusable** — `challenge_id` is a plain FK with no unique constraint, so one challenge can sit at many stops and editing it changes all of them. Same bargain the waypoints catalog already makes.
- **`challenge_id` is nullable on purpose.** A stop is worth recording as soon as you know where it is; forcing a challenge up front would mean inventing filler to save a route. The builder shows those as "needs a challenge".
- **A unique index on `(city_slug, waypoint_id)`** means one place appears at most once in a city's list. `maps` never enforced this and the mapper's delete-then-insert save hid it.
- **The editor is [mc/_stops.html](mc/_stops.html)** ("Stop Builder"), off the menu since 2026-08-09 — see the note above. **Fourth address:** it began at `mc/stops/stops.html`, moved to `games/admin/stops.html` on 2026-07-31 "to sit with the other game tools", came back to `mc/stops.html` on 2026-08-07 when those tools moved, and took the underscore when it was parked. **`/mc/_stops.html` and `/mc/stops/` are different live things**: the folder still holds `nightly.json`, which the scout routine commits at that path and the Route Builder's Nightly popup reads as `/mc/stops/nightly.json`. Its other half was `mc/data/waypoints.html` ("**Waypoints**", "Waypoint Finder" until 2026-08-07), which moved out of `mc/stops/` on 2026-07-31 and was **deleted on 2026-08-09** when it was folded into [mc/routes.html](mc/routes.html) — see the merge note above. Stop Builder's "new waypoint" button opens the Route Builder now. The old route builder `mc/mapper.html` was archived on 2026-07-30.
- **`mc/profiles.html` and `mc/builder.html` read `stops` now** (`select=waypoint_id,ord,end`, unchanged — those columns carried over) and remain **read-only on the route**: they synthesize one stop node per waypoint and never write it. The engines never read `maps` and don't read `stops` either.

---

## Guides — the narrator characters (`public.guides`, 2026-08-09)

A **guide** is the voice in the player's ear: name, hometown, bio, background and a portrait. Until 2026-08-09 those were four columns on `public.games`, which made a guide a property of one game. The data disagreed — **395 games carried 34 distinct guides**, Sir Purr fronted eight of them with one bio and one background, Mission Control fronted 296 — so editing a character meant editing it eight times and hoping the copies agreed. It now has its own table and a game points at one: the same bargain `challenges` and `waypoints` already make.

Migrations: [2026080901_guides_table.sql](mc/supabase/migrations/2026080901_guides_table.sql) (table, 34-row seed, `games.guide_id`, triggers), [2026080902](mc/supabase/migrations/2026080902_guides_image_field.sql) (`image`), [2026080903](mc/supabase/migrations/2026080903_guides_drop_image_url.sql) (drops `image_url`), [2026080904](mc/supabase/migrations/2026080904_guides_drop_archived.sql) (drops `archived`). All applied.

**Columns: `id, name, bio, background, hometown, image, created_at, updated_at`.** There is no `archived` and no `image_url`; both were dropped the day they were added, and the reasons are in those migrations.

- **WRITE TO `public.guides`, NEVER HAND-EDIT `games.guide_*`.** This is the rule that breaks silently if it is not known. Both engines read `games.guide_name` / `guide_bio` / `guide_background` at play time, and they are the paid product, so rather than change them **two triggers keep that copy in step**: `tgb_guides_sync_games` pushes a saved guide onto every game pointing at it, and `tgb_games_pull_guide` pulls when a game is repointed. Edit a game column by hand and the next guide save overwrites you.
- **`games.guide_image_url` is FROZEN and that is deliberate.** When `guides.image_url` was dropped the triggers stopped maintaining it. It is not cleared — it belongs to the engines — but nothing writes it any more, so **a new portrait does not reach the engines**. Pushing one would mean copying a ~65 KB data URI onto every game pointing at the guide (296 of them for Mission Control) inside a table the engines read with `select=*` on a page a buyer has already opened. When the engines are next touched, the fix is for them to read `guides.image` via `games.guide_id`.
- **`hometown` is a real FK to `cities(city)`**, not free text — the canonical string, because that is what `games.city`, `waypoints.city` and every `TgbCities` picker already speak. 23 of the 34 were seeded from the away fanbase city of the games each guide fronted; the rest are null rather than guessed.
- **`image` is the portrait itself**, a base64 data URI in the row, because a pointer at a file elsewhere is exactly what had already failed: 390 of the 395 old image URLs were 404. **The uploader downscales to 512 px JPEG first** (~60–90 KB from 2.4 MB originals) and a CHECK caps the column at 256 KB — the page reads every guide with `select=*`, so full-size portraits would be a ~100 MB page load to draw cards 132 px wide. JPEG means no transparency, deliberately.

### The Guide Green Room

**[mc/greenroom.html](mc/greenroom.html)** is where guides are added, written, illustrated and deleted. It replaced `mc/guides.html`, **deleted the same day** — that page was one card per GAME, which is the shape the migration exists to undo. Styled on [mc/socials/index.html](mc/socials/index.html), and it is the **Guide Green Room** card in the Game Elements group of the nav.

- **The card shows no game information at all**, by design. The moment a card lists the games a guide fronts it becomes a report about games instead of a place to write a character.
- Every column is an editable box on the card; **an empty one is bordered pen-red** — no chips, no error text. Roughly half the catalogue has no background, so that wall of red is the honest state of it rather than a fault. (Don't record live counts here; the table is edited daily and a number in this file rots within hours — 34 guides on the morning of 2026-08-09 was 28 by the afternoon.)
- **Nothing autosaves.** Typing edits a per-guide draft; Save writes it. **Both prompts read the draft, not the saved row** — the image prompt used to read the row, so a background typed and not yet saved was silently ignored.
- **FILL is deterministic and does not call an AI.** It fills empty boxes from full ones: `hometown` from the first catalogue city named in the guide's own text (earliest mention wins, case-sensitive — *mobile*, *reading* and *hope* are all real cities), and `bio` from the background's own summary sections, **rewritten into first person** because the bio is the guide speaking. That rewrite is mechanical and imperfect on purpose; it lands in an unsaved box.
- **Delete is the only way out** and it is irreversible. `games.guide_id` is `ON DELETE SET NULL`, so it leaves every game using that guide without one — and this page cannot show how many that is.

### The two prompts

- **The guide brief** (PROMPT, in greenroom.html) describes **a person, not a product**. It says nothing about games, tours, matchups or opponents: a guide is used in many cities, so it must identify with its **hometown** and never with wherever it happens to be guiding. The notes box on that dialog is folded in verbatim and marked *treat as fixed*.
- **The portrait prompt** lives in [mc/picmaker/prompts.js](mc/picmaker/prompts.js), shared with the picmaker page. It demands a **cartoon** — "polished, stylized illustration, not a photograph" was read by image models as permission for a photoreal render, and a guide who looks like a real person implies a real person. It also demands the artwork **fill the square**: "safe to crop to a circle" was being read as an instruction to draw one.

### Every admin popup wears the Socializer's look

Mission Control had grown a dialog vocabulary per room — `.tool-modal-panel` (socials), `.prompt-dialog` (Data Warehouse), `.add-gift-modal` (gift shop), `.dlg-panel` (Route Builder) — each with its own scrim, radius, shadow and header. The socials look now lives in **[mc/js/admin-shell.css](mc/js/admin-shell.css)** with every other vocabulary aliased onto it.

- It overrides **appearance only, never layout**. Each page shows its dialog its own way (a flex overlay toggled by `.is-open` here, `[hidden]` there); restyling that from a shared sheet would break show/hide on pages nobody is touching.
- **`admin-shell.css` must be linked AFTER the page's own `<style>`** — that is how these rules win without `!important`, and it is what the note at the top of that file has always meant. The Green Room had it in `<head>` first and the shared rules silently did nothing there.
- `mc/profiles.html` and `mc/builder.html` were **not** swept (211 dialog references each) and neither was the `highlights` image lightbox, which is a photo viewer rather than a dialog.

---

## Anchor events — the real-world events games are built around

**The table is `public.anchor_events`, not `events`.** [mc/supabase/migrations/20260720_anchor_events.sql](mc/supabase/migrations/20260720_anchor_events.sql) created it and `games.anchor_event_id` is a FK to it, so the name is load-bearing in the builder. [mc/data/events.html](mc/data/events.html) ("Events", added 2026-08-01) is the Data Warehouse editor over those rows, and the only one — it replaced `mc/anchor-events.html`, deleted the same day. **Don't create a second `events` table**, or the builder's Choose Event picker in [mc/profiles.html](mc/profiles.html) will silently ignore half the catalog.

- **It is not a sports table.** `kind` ∈ sports | concert | convention | festival | expo | other. The two `*_team_tgbid` FKs are what a sports row adds, not what defines a row; a concert just needs a title, a date and a place. Splitting the kinds into separate tables would fork `anchor_event_id` into two nullable FKs, which is why it's one table with a discriminator.
- **`kind` / `title` / `description` / `url` / `end_date` were live in the database and in both pages for months without a migration.** [2026080101_anchor_events_general_columns.sql](mc/supabase/migrations/2026080101_anchor_events_general_columns.sql) backfills that gap; before it, a database rebuilt from `mc/supabase/migrations` alone got a table the pages 400 against. Both pages read **`select=*`, never a column list**, for the same reason the cities pages do — an unknown column in a select list is a 400, a missing column read as blank is survivable.
- **A sports row stores each club split into locale + mascot** — `away_locale` `'Chicago'` + `away_mascot` `'Bears'` — not as one string, and not as a join. That's the shape a game actually uses: the locale is a place, the mascot is what the copy calls the opponent. It also makes an event **self-describing**, which is the point: no `public.teams` row is needed for the event to be complete. Same vocabulary as `teams` (`first_name`/`fanbase` + `mascot`), deliberately.
  - **`away_label` / `home_label` still exist and are still correct**, rebuilt from the two halves by the `tgb_anchor_events_sync_labels` trigger on every write. Don't write them by hand and don't drop them — `anchorEventLabel` in the builder falls back to them, and the trigger is what lets that reader stay untouched.
  - **`away_team_tgbid` / `home_team_tgbid` are now optional**, worth filling only for the builder's team auto-fill and the fandom color palette off the away club. They are not what makes a sports event usable.
- **`neutral_site` is a stored flag, never inferred from the city columns.** True means neither club is at home — the international series, a Super Bowl, a bowl game, a relocated game — so the host city has no home team in it and both fanbases travel. It is expected to spawn **two** games eventually, one per travelling fanbase; nothing reads it that way yet. **Don't replace it with a comparison of `home_locale` to `city`**: an ordinary home game is routinely played in a differently-named suburb (Bills → Orchard Park, Giants → East Rutherford, Cowboys → Arlington), so that comparison would call a third of the league neutral. An international game keeps its league-assigned nominal home club in `home_locale`/`home_mascot` *and* carries the flag — both are true at once.
- **`start_time` is venue-local**, per the column's own comment — the time a player standing outside the stadium sees. Leagues publish in Eastern, so a seed has to convert; the NFL Week 1 seed ([2026080102](mc/supabase/migrations/2026080102_nfl_2026_week1_anchor_events.sql), 16 games) keeps the ET broadcast time in `description` so the two stay reconcilable, and its Melbourne game deliberately carries a date one day later than the US listing.
- `id` is a **client-supplied text primary key** (`NFL-2026-W1-CAR-CHI`), not generated. The events page only lets you type it on a row that has never been saved — changing it later would orphan every game pointing at it.

### SCHEDULE — the league importer, and the two pages it replaced

The events page's **SCHEDULE** button reads a real league schedule straight from **ESPN's public scoreboard feed** (`site.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates=YYYYMMDD-YYYYMMDD`) and imports the games you tick into `anchor_events`. The feed answers a whole date range in one request and sends `Access-Control-Allow-Origin: *`, so **the browser reads it directly** — no key, no Edge Function, no build step, and nothing scheduled.

**It absorbed `mc/get_games.html` and `mc/mlb.html`, both deleted 2026-08-07.** All three pages had the same agenda — get real-world matchups into the building — and the two older ones each did it the long way round while **writing the wrong table**:

- `mc/mlb.html` ("MLB Game Generator") needed `node mc/_dev/scripts/mlb_matchup_maker.js` to write a 22 MB `mc/data/mlb.jsonl`, which you then uploaded back into the page by hand, and it POSTed **`public.games`** — finished TGB products, nodes and links and all — not the events those products are anchored to.
- `mc/get_games.html` ("Sports Games Research") asked a chat AI to *recall* schedules into a cousin `mc/data/get_games.jsonl` that **never existed on disk**, and nothing imported it anywhere.

Two things carried over rather than being rebuilt: mlb.html's **preview → filter → tick → bulk-import** flow with its progress bar and per-row error report, and get_games.html's **league + date-range scoping**, which is now a Scope row in the AI prompt dialog. That prompt is still the right tool for concerts, conventions, festivals and expos — no schedule feed carries those — and the dialog says so.

- **`neutralSite` is published per game in the feed**, which settles the field the AI prompt spends its longest passage on: an international or championship fixture arrives already flagged, and an ordinary home game in a suburb stadium arrives `false`. This is the single strongest reason to prefer SCHEDULE over the prompt for the big four leagues.
- **`start_time` is venue-local**, so the UTC timestamp has to be zoned. The zone comes from a **state/province → IANA map** in the page, not from a per-venue table: every major-league venue in a split-zone state sits in the zone named there (Nashville and Memphis Central, every Florida and Indiana venue Eastern, every Texas venue Central). The per-venue tables in `mc/_dev/scripts/*matchup-maker.js` are more precise and need re-editing whenever a stadium is renamed; this map only changes if a state does. **An unresolved venue leaves `start_time` null and badges the row** — a blank time is obviously missing, a plausible wrong one is not.
- The feed applies its date range to **UTC** timestamps, so a late Sunday game comes back dated Monday. The importer re-filters on the **venue-local** date, which is the one stored.
- ESPN's venue `state` is inconsistent (`PA` on one row, `Pennsylvania` on the next) and international rows carry a country name instead — and not the sovereign one, e.g. `England`. Both go through `TgbGeo` so `city` lands on the canonical `public.cities` string; a city the catalog does not know is imported anyway and **badged "new city"** rather than corrected.
- Ids follow the catalog's shape — `LEAGUE-YEAR-Wweek-HOME-AWAY` where the feed reports a week, the date in its place where it does not (a baseball season has no weeks and two clubs meet three nights running). A doubleheader that collides gets a `-2` suffix rather than being dropped.
- Insert is chunked with `Prefer: resolution=ignore-duplicates`; **a chunk that errors is retried one row at a time**, because the useful answer is which row the database refused. Rows already in the catalog are shown, dimmed and unticked, rather than filtered out — seeing that a week is already filed is the answer to "did I import this yet".

**Left in place deliberately:** `mc/_dev/scripts/mlb_matchup_maker.js`, `nfl-schedule-2026-matchup-maker.js` and the venue backfills still generate `public.games` rows, which is a different pipeline. **`mc/data/mlb.jsonl` was deleted 2026-08-08** — 9.9 MB with no reader but that generator, and because `mc/` is deployed it was being published to the public web on every build. Regenerate it with the script if it is ever wanted again. `mc/data/routes.jsonl` went the same day: its only reader was the archived `content.html`.

---

## Game play tracking (instances / responses / events)

**"Team" is two different things:** a **sports team** is a pro team a game is based on (`public.teams`; **team colors** = shell/stripe/mask belong here), reachable via `game_id → games`. A **Game Bureau team** is a group of our players, led by a **team leader** and identified by a chosen **team name**, never a color. The engine's blue/black/purple/silver/orange value is a **route-rotation slot** (`route_color`), not a sports-team color — don't label Game Bureau teams with it.

Playthroughs are recorded for stats. A **team leader** (the buyer/leader — we used to say "player") plays a **game instance** (one playthrough by one Game Bureau team, a client-generated uuid). Tables: `game_instances`, `game_responses`, `game_events`, plus a `game_play_stats` view. Schema: [mc/supabase/migrations/20260625_game_instances_responses.sql](mc/supabase/migrations/20260625_game_instances_responses.sql); client: [mc/game/run/config/instance-tracker.js](mc/game/run/config/instance-tracker.js) (`window.TgbInstance`), wired into both engines. Full write-up: [mc/_dev/docs/supabase/game-instances-responses.md](mc/_dev/docs/supabase/game-instances-responses.md).

- **Append-only for anon** (engines use the anon key): RLS allows `INSERT` only; admin reads gated by `is_photo_admin()`. Don't add anon update/delete — record progress as `game_events`, not by mutating rows.
- **Team leader email is folded in server-side**, never sent by the client: the `tgb_link_game_instance_identity` SECURITY DEFINER trigger looks the play's `access_code` up in `gift_codes` and copies the Stripe email. The link is **Stripe → gift_codes → game_instances → game_responses**.
- Team name + team leader name are collected *before* Stripe in the buy modal (`mc/js/gs-buy-modal.js`) and written to `gift_codes` (`team_name`, `team_leader_name`) by `gs-create-checkout`; the instance trigger folds them onto the play. They're also best-effort on the instance (chosen in-game), and the authoritative team name is recoverable from `game_responses` (the `player_name` var). `route_color` is the engine route slot, not a sports color.
- Admin stats live in [gifts/giftcards.html](gifts/giftcards.html) ("Game Play Stats" panel, reads the `game_play_stats` view).

---

## Visitor analytics

[mc/assets/site-analytics.js](mc/assets/site-analytics.js) is the only analytics on the
site (added 2026-07-30, first used on [soundtracks/index.html](soundtracks/index.html)). It
injects the **Cloudflare Web Analytics** beacon: free at any volume, cookieless
with no per-visitor identifier — so **no consent banner and nothing to disclose in
a privacy policy** — and a single tag that works on plain GitHub Pages with no
build step and without proxying the domain through Cloudflare.

- **The token lives in exactly one place**, the `TOKEN` constant at the top of
  that file, and it **is filled in** — the Cloudflare site exists and the beacon
  is really reporting. With it empty the script loads and does nothing, so the
  file was safe to ship before that was true. Get it from dash.cloudflare.com →
  Analytics & Logs → Web Analytics → Add a site.
- **To cover another public page, add the one `<script>` line.** Don't inline the
  beacon or the token anywhere else. As of 2026-08-07 it is on **all thirteen**
  public pages — `/games/`, `/games/pixel/`, `/gifts/`, `/gifts/aboutshop.html`,
  `/highlights/` (and its two unlinked variants), `/soundtracks/`, `/shell/privacy.html`,
  `/mc/how/`, `/mc/sampler/`, `/mc/survey/` and `/mc/account/`. For its first
  week it was on `/soundtracks/` alone, so **any figures from before 2026-08-07
  cover one page**, not the site.
- **The paid game runtime is excluded, and that is a decision rather than an
  oversight.** `/mc/game/run/` — the URL a buyer's email points at — plus both
  engines, `help.html`, `navigator.html`, `scan/`, `teams/` and `/mc/minigames/`
  are all left out. A play is already recorded in `game_instances` /
  `game_responses` / `game_events` at far better fidelity than a page-view
  beacon gives, and folding it into visitor numbers would inflate "traffic" with
  people who have already bought. They sit under `/mc/` and are not in
  `PUBLIC_MC`, so the guard blocks them even if someone adds the tag by mistake.
- **The root `index.html` is deliberately NOT one of them.** It is a bare iframe
  wrapper around `/games/`, so the beacon on the inner page already fires on
  every visit to the domain; tagging the wrapper too would count one visitor
  twice. Anything that becomes a real page rather than a frame needs the line.
- **It refuses admin surfaces itself** — any `/admin/` path, a bare `/account/`,
  and everything under `/mc/` *except* the four public folders named in
  `PUBLIC_MC` — plus localhost and LAN hosts. There is a second hook,
  `PUBLIC_MC_PAGES`, for exposing a single public page from an otherwise
  internal folder; it is **empty** and should stay that way if it can, since a
  public page under `/mc/` is usually a sign the page is in the wrong folder.
  Our own sessions would swamp real visitor numbers on a site this size,
  and a guard in the script is more reliable than remembering which pages to
  leave it off.
  - **`/mc/` stopped meaning "admin" on 2026-08-06** and the guard did not
    notice until 2026-08-07. The consolidation moved How It Works, the sampler,
    the survey and the account page under `mc/`, all still public and still in
    the public nav, and the blanket `/^\/(mc|account)\//` test silently refused
    to count them — so adding the beacon to those pages was a no-op that looked
    like it had worked. `PUBLIC_MC` allows exactly those four back. **Keep the
    allowlist positive**: a new admin room is then excluded by default, and the
    worst a forgotten public page costs is that it goes uncounted.
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

### Everything back-end lives under `mc/` (2026-08-06)

The repo root used to hold the back end beside the public site. On 2026-08-06 it was consolidated so that **the root contains only what the public site serves**, plus tool-config files that must sit at the root by convention. The rule for anything new: **if it isn't served to a visitor, it goes in `mc/`.**

| moved | to | why it wasn't already obvious |
|---|---|---|
| `data/` | `mc/data/` | The Data Warehouse editors (cities / events / waypoints) plus the `.jsonl` cousin files the research pages read. |
| `docs/` | `mc/docs/` | One dev note, `admin-bridge.md`. |
| `memory/` | `mc/memory/` | Working notes. Nothing reads it in code. |
| `backups/` | `mc/backups/` | Supabase dumps. Gitignored and excluded from the deploy. |
| `_dev/` | `mc/_dev/` | Scripts, dev docs, and `archive/`. Excluded from the deploy. |
| `supabase/` | `mc/supabase/` | Migrations, edge functions, prompt-import SQL. |
| `account/` | `mc/account/` | Still a **public** page wearing public chrome — moved for tidiness, not because it became internal. |
| `game/` | `mc/game/` | The player runtime. See the hard break below. |
| `minigames/` | `mc/minigames/` | Loaded mid-game by both engines and listed in `manifest.json`. |
| `how/` | `mc/how/` | "How It Works" — public marketing copy, still in the public nav. |
| `sampler/` | `mc/sampler/` | Public page plus the JSON its scheduled scraper writes. |
| `survey/` | `mc/survey/` | Public page. Nothing links to it in-repo. |
| `assets/` | `mc/assets/` | Shared CSS/JS/images. Moved 2026-08-06 behind a read-time shim; see below. |

`win/` was **deleted** rather than moved. It was a redirect stub whose only job was catching old `/win/` links and forwarding to `/highlights/ww.html`; moved under `mc/` it would have caught nothing, since nobody holds a `/mc/win/` link. Nothing in the repo linked to it.

**What stays at the root:** `games/`, `gifts/`, `highlights/`, `soundtracks/` — each now a single `index.html`, the entry point for its section — plus `index.html` and **`shell/`**.

**`shell/` is new on 2026-08-07 and holds the public site's CHROME**: the nav (`site-nav.js`, `site-nav-login.js`), the footer (`site-footer.js`, which carries its own CSS), the shared stylesheets (`site-shell.css`, `site-pages.css`, `civic-modernist-pages.css`, `public-theme.css`), and the two documents the footer links — `privacy.html` and `aboutshop.html`. It is named for the concept the codebase already used: `site-shell.css` framed the public pages and `admin-shell.css` does the same for `/mc/`.
  - **Don't call it `site/`.** Hundreds of `public.games` rows still hold `thegamebureau.com/site/assets/games/<file>` URLs from the pre-flatten layout, rewritten at read time by [mc/assets/legacy-asset-url.js](mc/assets/legacy-asset-url.js). A real `site/` at the root would make those dead URLs resolve to live-but-wrong files, which fails silently.
  - **`shell` is an overloaded word here**: `teams.shell` is the helmet colour that drives a fandom game's primary palette. A search for "shell" returns both.
  - **`assets/` is NOT at the root** — it moved to `mc/assets/`, which keeps the shared *logic* (`geo.js`, `city-picker.js`, `team-palette.js`, `site-analytics.js`, `admin-bridge.js`). Those are read by admin pages too, so they are not public chrome and deliberately did not move to `shell/`.

> **`assets/` moved, and stored database URLs are handled by a shim rather than a migration.** Hundreds of `public.games` rows hold absolute asset URLs in two legacy shapes — `thegamebureau.com/assets/guides/<id>.png` (`guide_image_url`) and `thegamebureau.com/site/assets/games/<file>` (`logo_url`, dead since the repo was flattened out of the old `site/` layout). Fixing them properly is an `UPDATE` needing a service-role key, which is not available, so [mc/assets/legacy-asset-url.js](mc/assets/legacy-asset-url.js) rewrites both shapes onto `/mc/assets/` at read time instead. It is loaded by the landing page and both engines, and applied at two chokepoints: the stored `guide_image_url`, and `resolveAssetUrl()` which covers logos. **It deliberately ignores any other host**, so a guide image uploaded through the editor — stored as a Supabase Storage URL — is never touched. Run the `UPDATE` when a key exists and the shim becomes dead code; it is harmless to leave. **Guide portraits moved to `public.guides.image` on 2026-08-09** and `games.guide_image_url` is frozen at these legacy values — see the guides section above — so this shim is now the only thing making them resolve at all. Worth knowing: only five files exist in `mc/assets/guides/`, so 372 of the 395 guide URLs were already 404 before the move.

**Two of those moves broke live URLs, and neither can be redirected** — GitHub Pages serves no 301.

- **`/game/run/?id=…` is now `/mc/game/run/?id=…`.** That URL is the paid product: it is what a buyer receives by email and what a gift code points at. **Every link issued before 2026-08-06 is permanently dead**, and anyone holding one needs a reissue. The two Edge Functions that mint it — [gs-send-code](mc/supabase/functions/gs-send-code/index.ts) and [stripe-webhook](mc/supabase/functions/stripe-webhook/index.ts), both building `siteOrigin() + '/mc/game/run/'` — **must be redeployed for new purchases to send a working link**: `cd mc && supabase functions deploy gs-send-code stripe-webhook`. Until that deploy lands, every new order emails a 404.
- `/account/` is now `/mc/account/`.

**Every reference that escapes a folder is now root-absolute, deliberately.** The engines used to reach the shared front-end with `../assets/…`, which silently resolves to a different place at a different depth — exactly the failure a move like this causes. They are **`/mc/assets/…`** now, so `mc/game/` can be moved again without touching a single one. Write new cross-folder links the same way; never `../`. (This paragraph said `/assets/…` until 2026-08-07, which was the pre-move path and no longer resolves.)

Deleted the same day, all scratch: `.tmp/`, `.tmp_auth_checks/`, `.tmp_auth_checks2/`, `.codex-artifacts/`, `.dev/`. The one piece of real work inside them, the `render-soundtracks-video.ps1` explainer renderer, was kept at [mc/_dev/scripts/render-soundtracks-video.ps1](mc/_dev/scripts/render-soundtracks-video.ps1).

**The Supabase CLI now needs `cd mc` first — and getting it wrong is silent.** From the repo root the CLI finds no `supabase/` directory, so instead of erroring it falls back to whatever project is *globally linked* and carries on. Observed 2026-08-07: `supabase secrets set` run from the root reported `Selected project: jdyjyzakcfmvwdfgzzyz`, which is a different project entirely — a secret set that way lands somewhere real, just not here, and nothing about the output looks wrong. **Always check the project ref echoed back.** From `mc/` it reads `supabase/config.toml`, which pins `project_id = "qmaafbncpzrdmqapkkgr"`. Passing `--project-ref qmaafbncpzrdmqapkkgr` explicitly works from anywhere and is the safer habit.

**The Supabase CLI now needs `cd mc` first.** `supabase db push`, `supabase functions deploy` and `config.toml` discovery all work by finding a `supabase/` directory in the working directory or an ancestor of it — so from the repo root the CLI no longer sees the project at all, and from `mc/` it works exactly as before. This is the one real cost of the move and it has no workaround short of a symlink. Don't "fix" a failing `supabase` command by recreating a folder at the root.

**A root `supabase/` folder existed until 2026-08-07 and was deleted.** It held no `config.toml`, no `functions/` and no `migrations/` — only `.temp/cli-latest` and `.temp/linked-project.json`, both committed. It is very likely what made the mis-targeted `supabase secrets set` above look normal: a stray root-level Supabase state directory is exactly the thing that makes running the CLI from the repo root feel like it found the project. **If one reappears, delete it** — it can only be CLI scratch, because the real project is `mc/supabase/`.

**`.temp/` is gitignored now**, at both locations. The CLI writes the linked project ref plus cached Postgres / GoTrue / storage / CLI version strings there on nearly every command; eleven such files had been tracked for months and churned in every diff. The directory stays on disk (it is live CLI state) — it is simply no longer version-controlled.

**Root-level files stayed put deliberately.** `AGENTS.md`, `.codex`, `.hintrc`, `.env`, `.gitattributes`, `.gitignore`, `.nojekyll`, `CNAME`, `CLAUDE.md` and `index.html` are each read by a tool that only looks at the repo root; moving them breaks that tool silently rather than loudly. `.nojekyll` and `CNAME` are GitHub Pages' (Jekyll processing, custom domain). `.gitignore` and `.gitattributes` are legal in a subdirectory but only govern their own subtree, so moving them is a behaviour change, not an error. The backup scripts read `REPO_ROOT/.env`.

---

## Environment variables

There is no `.env.example` — it was deleted on 2026-08-06 and replaced by this section, because a second copy of this list is a second thing to forget to update. **`.env` is gitignored, so this is the only committed record of what belongs in it.**

**Two separate environments, and mixing them up is the usual mistake.** A key that a browser or an Edge Function needs is *not* set in `.env`, and nothing in `.env` reaches production.

### `.env` at the repo root — local developer scripts only

Read by `mc/_dev/scripts/*`. Nothing here is used by the website, the engines, or any cloud routine.

| variable | read by | notes |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | [backup-supabase.js](mc/_dev/scripts/backup-supabase.js), [mc_backup.py](mc/_dev/scripts/mc_backup.py) | **The only secret here.** Service-role key, required to back up RLS-restricted tables (`admin_users`, `photo_submissions`, `games_bu`). Supabase dashboard → Project Settings → API → `service_role`. Absent as of 2026-08-06, which is why those backups do not run and why the guide-image URL migration described above could not be executed. |
| `SUPABASE_BACKUP_RETENTION_DAYS` | backup-supabase.js | Optional, default `30`. |
| `SUPABASE_BACKUP_PAGE_SIZE` | backup-supabase.js | Optional, default `1000` — the PostgREST row cap. |
| `SUPABASE_URL` / `SUPABASE_KEY` | [shop-error-check.mjs](mc/_dev/scripts/shop-error-check.mjs) | Optional overrides; both fall back to the hardcoded project URL and the **public publishable** key. Not secrets. |
| `SHOP_ERROR_FULL` / `SHOP_ERROR_SEGMENT` / `SHOP_ERROR_RENDER_ONLY` / `SHOP_ERROR_TZ` | shop-error-check.mjs | Test/scope switches. `SHOP_ERROR_TZ` defaults to `America/Chicago`. |

`OPENAI_API_KEY` / `OPENAI_MODEL` / `ANTHROPIC_API_KEY` were listed in the old `.env.example` and may still sit in your `.env`. **Nothing reads them** — the only mention is a placeholder check in `server_start.py`. `ANTHROPIC_API_KEY` in particular is not the key the `anthropic-proxy` function uses; see below. It is the unfunded key that killed the old GitHub Actions soundtrack and book-pull workflows.

### Supabase Edge Function secrets — set in Supabase, never in `.env`

Set with `cd mc && supabase secrets set NAME=value`, or in the dashboard. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform and do not need setting.

| variable | used by |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `stripe-webhook`, `gs-create-checkout`, `create-stripe-session` |
| `RESEND_API_KEY`, `RESEND_FROM` | `gs-send-code` — the access-code email |
| `SITE_ORIGIN` | `stripe-webhook`, `gs-send-code` — the origin the play link is built on. With `/mc/game/run/` appended, this is what a buyer receives. |
| `ANTHROPIC_API_KEY` | `anthropic-proxy` |
| `GOOGLE_BOOKS_API_KEY` | `scrape-amazon` Auto Fill |
| `BOOKSHOP_AFFILIATE_ID` | gift shop link building |
| `LEMON_WEBHOOK_SECRET` | `lemon-webhook` |
| `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID` | Printful integration |

### Cloud routines hold no secrets at all

The four Claude Code routines authenticate with the **public publishable key** and write through `SECURITY DEFINER` RPCs. That is not a shortcut — a cloud routine has no secret store, and it is the constraint that produced `tgb_pull_book_candidates`, `tgb_pull_soundtrack_songs`, `tgb_report_soundtrack_issues` and `tgb_pull_socials_candidates`. Don't try to give a routine a service key.

**The sampler pipeline was repaired in the same pass.** `sampler_scraper.py` computed its output directory as `REPO_ROOT / "site" / "sampler"` and the workflow ran `git add site/sampler/…` — a `site/` folder that has not existed since the repo was flattened out of the old layout. Every scheduled run therefore wrote into a phantom directory and committed nothing, so the published `sampler.json` had been frozen for however long that has been true. It is `REPO_ROOT / "mc" / "sampler"` now, with `REPO_ROOT` taken from `parents[2]` because the script sits at `mc/_dev/scripts/`. The `.vscode/launch.json` debug configs pointed at a `sampler/sampler_scraper.py` that also did not exist, and now point at the real file.

**`.gitignore` and the deploy excludes are now anchored paths, not bare names.** `backups/` used to match a directory of that name at any depth, which quietly covered both the root backups folder and `_dev/backups/` with one line; the entries are `mc/backups/` and `mc/_dev/backups/` now, and the rsync excludes in [.github/workflows/deploy.yml](.github/workflows/deploy.yml) are `mc/_dev` and `mc/backups`. If you add another back-end folder under `mc/`, add its exclude explicitly — it will otherwise ship to the public site, because `mc/` itself is deployed.

---

### Site pages

Use **"site pages"** to mean the public-site pages that share the same navigation and public chrome:

- [index.html](index.html)
- every file matched by `mc/account/**/*.html` — moved under `mc/` on 2026-08-06 but still a public page wearing public chrome, so shared-chrome work still applies to it
- every file matched by `birthdayball/**/*.html`
- every file matched by `mc/how/**/*.html`
- every file matched by `ww/**/*.html`
- [gifts/index.html](gifts/index.html) — the public shop, and **the only file left in `gifts/`** as of 2026-08-07. The folder has been `/gifts/` → `/shop/` (2026-06-26) → `/gifts/` (2026-07-30); **each move was a hard break with no redirect**, because GitHub Pages cannot serve a 301, so any `/shop/?city=` link shared while that path was live is now dead.
  - **Everything else moved to [mc/gifts/](mc/gifts/) on 2026-08-07**, in two passes: first `gifts/admin/` with its three generated `giftshop-errors*` files, then `aboutshop.html`, `operations.html`, `giftcards.css` and the four `shop_*` images. `/gifts/aboutshop.html`, `/gifts/operations.html` and every `/gifts/shop_*` URL are dead — no redirects were left.
  - **`mc/gifts/` is mixed, and that is the one thing to be careful about.** `index.html` and `operations.html` are admin. `aboutshop.html` passed through here for a few hours on 2026-08-07 and went on to [shell/](shell/), which is what let the analytics guard drop its single-page exemption. `shop_banner.png` is the public shop's hero and its `og:image`/`twitter:image`; `shop_hero_items_collage.png` is a background in [shell/civic-modernist-pages.css](shell/civic-modernist-pages.css). So the folder is still not blanket-internal — two public images are served out of it.
  - `shop_hero_shelves.png` and `shop_hero_shelves.svg` moved with the rest and are **referenced by nothing**; they were already dead at the old path.
  - `gifts/giftcards.html` (access codes + Game Play Stats, formerly `gs-codes.html`) **does not exist and is not in git HEAD** — references to it elsewhere in this file are stale.
- every file matched by `highlights/**/*.html` — and as of 2026-08-07 that glob is *purely* public, which it was not before: `highlights/admin/` (the Winner's Wall / photo admin) moved to [mc/highlights/](mc/highlights/), so a page wearing Mission Control chrome no longer sits inside the site-pages glob. `/highlights/admin/` is dead, with no redirect. [mc/photos.html](mc/photos.html), which has been forwarding to that admin since it was renamed, now forwards to the new path — it is the only stub of its kind left standing in this repo.
- every file matched by `mc/sampler/**/*.html`
- every file matched by `mc/survey/**/*.html`
- every file matched by `shell/**/*.html`

This grouping is the public website surface for shared chrome work such as navigation, shared public CSS, metadata, and broad visual consistency. If a future task says "update the site pages nav," apply it to [index.html](index.html), `/mc/account/**/*.html`, `/birthdayball/**/*.html`, `/mc/how/**/*.html`, `/ww/**/*.html`, `/gifts/index.html`, `/highlights/**/*.html`, `/mc/sampler/**/*.html`, `/mc/survey/**/*.html`, and `/shell/**/*.html` pages together. The site pages nav centers the primary `GAMES` and `GIFTS` links and keeps How It Works and Winner's Wall as utility links. The `GIFTS` nav link points at `/gifts/`, which is where the shop lives again as of 2026-07-30; `/shop/` was removed the same way `/gifts/` had been on 2026-06-26 — hard break, no redirect. As of 2026-05-27 the public nav has no visible Login / Mission Control entry — admins reach `/mc/*` by typing the URL directly. The three admin scripts (`/mc/js/admin-auth.js`, `/mc/assets/admin-bridge.js`, `/shell/site-nav-login.js`) are still included on public pages so an admin who is already signed in still sees the floating EDIT buttons painted by `admin-bridge.js`; only the visible Login UI was stripped. The shared site pages CSS lives at [shell/site-pages.css](shell/site-pages.css).

---

## The "research assistant" pattern is gone (2026-08-07)

`mc/research.html`, `mc/get_games.html`, `mc/mlb.html`, `mc/places.html`, `mc/get_teams.html`, `mc/js/research.js`, `mc/research.css`, `mc/js/research-nav.js` and `mc/README.md` were **all deleted on 2026-08-07**. Don't rebuild any of it.

**What the pattern was, and why every instance of it failed the same way.** A research page paired a baked-in AI prompt with a **cousin `.jsonl` file** of the same basename in `mc/data/`: you copied the prompt, ran it in a chat AI, and saved the reply beside the page. The file was the deliverable — and the file was the problem, because nothing consumed it.

| page | its file | how it actually ended |
|---|---|---|
| `get_games.html` | `get_games.jsonl` | **The file never existed on disk.** Every run's output went nowhere. |
| `mlb.html` | `mlb.jsonl` (22 MB) | Written by a Node script, uploaded by hand, and it POSTed `public.games` — finished products, not the events they anchor to. |
| `places.html` | `places.jsonl` | 456 real places sat there until someone hand-wrote a migration to lift 406 into `waypoints`. |
| `get_teams.html` | *(none)* | The only one that already wrote to Supabase — so it was never really a research page at all. |

**Every replacement writes to the database directly**, which is the whole lesson: [mc/data/events.html](mc/data/events.html) reads the ESPN feed in-browser and imports into `anchor_events`; [mc/routes.html](mc/routes.html) returns import SQL from its prompts; [mc/data/teams.html](mc/data/teams.html) upserts `public.teams`. **A prompt whose output is a file is a prompt whose output is lost.**

`mc/research.html` went with them. It was a hand-maintained grid of cards pointing at pages the nav menu already listed, and it had shrunk to two entries — one of which was a link to `events.html`, not a research page.

### mc/data/teams.html — what had to be rebuilt

`get_teams.html` was a 135-line shell; its behaviour lived in `research.js` and had to be ported, not just relinked.

- **`team_key` is a GENERATED column** (`league || ':' || code`), so it is never written — and that is exactly why it is the safe upsert target. Upserting on it means a **conference change updates the team in place** instead of colliding on the `(league, conference, code)` primary key. The page sends `on_conflict=team_key` with `Prefer: resolution=merge-duplicates`.
- **`league`, `code` and `tgbid` are permanent** and render disabled on a saved row. `games` foreign-keys `team_key`; `anchor_events` and the builder point at `tgbid`. The paste path strips all three from an incoming row however insistently the AI restates them.
- **There is no Delete button.** `public.games` foreign-keys `teams.team_key`, so a delete either fails or orphans a game. A club that folds is edited, never removed — the same reason the prompt is forbidden to drop a row.
- **PASTE + REVIEW is the load-bearing feature**, carried over from `research.js`'s merge dialog. The prompt asks for the **complete table**, so one dropped line or one hallucinated hex would land on 124 live rows that paint live games. Nothing is written until a row-by-row diff has been rendered — new / changed-with-before→after / missing-from-the-reply — and **editing the textarea invalidates the review**, so Save can never commit a diff nobody read. Teams missing from a reply are reported and then left alone; nothing is ever deleted.
- The parser takes what an AI actually returns: JSONL, a JSON array, a ```` ```json ```` fence, or lines with trailing commas.
- Blank text fields save as `''`, not `null` — the columns are `NOT NULL DEFAULT ''`.
- Colors are a hex text box plus a native picker. **The text box stays authoritative**: a picker cannot express "no fourth color", and letting it write on load would silently turn `''` into `#000000` on the next save.
- **`text_color` is stored but is NOT the palette's font color.** `teamPalette()` ignores it and derives readable black/white from `shell`; the field label says so. See the fandom-palette section below.

## Two builders, and which name means which (2026-08-07)

**`/games/admin/` is "Game Builder". `/mc/builder.html` is "Flow Builder".** Both pages titled themselves GAME BUILDER until 2026-08-07, and the nav menu carried the name twice pointing at different places.

- **Game Builder** = the ROOM you enter to build a game. It links out to Game Profiles, the flow builder, Game Stops and the waypoint catalog.
- **Flow Builder** = the one tool that edits the playable **conversation flow** — messages, prompts, replies, branches. It never owned the game's identity, pricing, teams or start point; those are next door in [mc/profiles.html](mc/profiles.html). Calling it "Game Builder" overstated it, so the specific name went to the specific tool.

Its filename is still `mc/builder.html` and its CSS class is still `.builder-admin-title` — **only the visible copy was renamed**, the same bargain the Tape Room made when HIDE replaced ARCHIVE in the UI while the column kept its name. Don't rename the file; a lot of stored links and `?id=` handoffs point at it.

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
https://thegamebureau.com/mc/game/run/?id={game-id}
https://thegamebureau.com/mc/game/run/?game={game-name}
```

`/mc/game/run/index.html` is the **landing page** (hero, intro, price, Start button). The Start button forwards to the chosen engine. Engines live as sibling folders under [/game/run/](mc/game/run/):

- **`text`** (default — used when `e` is absent or unknown) → [mc/game/run/text/](mc/game/run/text/) — iMessage-style chat engine.
- **`map`** → [mc/game/run/map/](mc/game/run/map/) — parchment map / pin engine; tapping the pin starts the message flow.

Legacy numeric values are aliased: `e=1` → text, `e=2` → map. Both `?id=` and `?game=` are accepted by the engines themselves.

The Supabase `games` record carries an `engine` column (string, nullable; values like `text` or `map`). Precedence on the landing page: **URL `?e=` → DB `engine` column → default (`text`)**.

Shared, non-engine-specific assets (e.g. `config/lemon-config.js`) live at [mc/game/run/config/](mc/game/run/config/).

**Adding an engine:** drop a new folder under `/mc/game/run/` and add a key/value to the `ENGINES` map in the Start-button code inside [mc/game/run/index.html](mc/game/run/index.html).

**History:** Until 2026-05-17 engines lived under `/mc/game/play/` and `/mc/game/play/index.html` was a thin router. That folder was merged into `/mc/game/run/` and the router was deleted. Old `/mc/game/play/...` URLs no longer resolve.

---

## Start locations & rendezvous maps — long Google Plus Codes

Start locations are **stored as long/global Google Plus Codes** in the `games` table (`starting_location_plus_code`). That column is the source of truth for the rendezvous point. `starting_location_lat` / `starting_location_lon` stay populated only as decoded compatibility fields for local maps, weather, reverse-geocoding, and older surfaces.

- **Builder** ([mc/builder.html](mc/builder.html)): the "Start Plus Code" field shows/accepts a Plus Code and writes `starting_location_plus_code`. It also decodes the code into `starting_location_lat` / `starting_location_lon` for compatibility. It has a self-contained Open Location Code codec (`encodePlusCode` / `decodePlusCode` / `recoverNearestPlusCode`) near `parseCoordinatePair`. Typed input accepts a full code, a short code (`76VW+59` recovered against the game's existing coords, else its City via Nominatim), or raw lat/lon; all are normalized to the long/global code on save. **Generate** geocodes the Start Name + Start Address + City via Nominatim, then stores the encoded code. There is no standalone Mission Control starting-locations page; edit these values in Builder.
- **Landing page** ([mc/game/run/index.html](mc/game/run/index.html)): every rendezvous map / directions surface (background map, directions lightbox, "open in Maps" link, share link) uses the stored `starting_location_plus_code` first, decodes it for local map/weather UI, and falls back to lat/lon only for legacy rows missing the code.

**Always use the LONG / global code** (e.g. `8FVC9G8F+6XQ`), not a short code (`9G8F+6X`). The long form resolves anywhere with no locality; the maps get only the code, so a short code would fail to resolve. The default code length is 11 chars (≈3.5 m) and **must match between the two files** so the builder's displayed code equals what the map uses.

**Why a Plus Code instead of address/lat,lon for maps:** it pins the exact meeting point and never reverse-resolves the coordinates to a nearby business (the old failure mode, e.g. "Shop Science"). In `getDestinationParam` the precedence is **stored Plus Code -> derived Plus Code from legacy lat/lon -> typed Start Address (only when there are no coordinates)**. The Plus Code's `+` must be `encodeURIComponent`'d (`%2B`) before going into a query string.

**How to apply:** The codec is **duplicated** in the two files (not shared) — like `TEAM_COLOR_ORDER`, keep them in sync. If you extract it to a shared module under `/mc/game/run/config/`, update this section. When adding the new `starting_location_*` meta fields, remember the `initGameMeta` camelCase-fallback rule below.

---

## Team color → stop rotation offset

The game rotates stops within a `stopGroup` (A–E) using a Latin-square offset keyed off `vars['team_color']`. The mapping lives in `TEAM_COLOR_ORDER`, defined **separately in each engine**:

- [mc/game/run/text/index.html](mc/game/run/text/index.html) (~line 1305)
- [mc/game/run/map/index.html](mc/game/run/map/index.html) (~line 1560)

Both files also define `getTeamColorRotationIndex` and `getStopRotationOffset` directly below the array.

| team_color (case-insensitive) | offset |
|---|---|
| BLUE | 0 |
| BLACK | 1 |
| PURPLE | 2 |
| SILVER | 3 |
| ORANGE | 4 |

Fallback: if `team_color` is missing or not one of the five, the older `team1..team8` number logic supplies the offset (`teamN - 1`). The offset is applied modulo the group's length, so shorter groups still rotate cleanly.

**How to apply:** If team colors change, update `TEAM_COLOR_ORDER` **in both engine files** — the array is not shared. The array order *is* the offset, so don't reshuffle casually — existing stop content may be ordered assuming BLUE = the canonical "position 0" view. If this ever gets extracted to a shared module under `/mc/game/run/config/`, update this section to point at the new location.

---

## Anchor (fandom) game brand palette ← away team

For anchor/fandom games the brand palette is **derived from the away team** (the fan's team), not stored on the game — `serializeGameRow` skips writing `primary_color`/`secondary_color`/`tertiary_color`/`quaternary_color` for fandom games, so the **single source of truth is `teamPalette()` in [mc/assets/team-palette.js](mc/assets/team-palette.js)**, applied both in the builder preview ([mc/profiles.html](mc/profiles.html) `bindTeamSelect` / `resolveGamePalette`) and in the live engines via `resolveGamePalette(teams, game, 'away').palette`.

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

**Where:** `.hero-meta-list-geo--country` in [shell/site-shell.css](shell/site-shell.css). The rule uses `!important` on `width`, `height`, `border-radius`, `background`, `color`, `border`, `font-family`, and `box-shadow` precisely because a `body.home-page .hero-meta-list-geo` rule later in the same stylesheet would otherwise win on specificity and turn the oval into a rounded square. There's a larger `.game-card-icons .hero-meta-list-geo--country` variant that also uses `!important` to override the base width/height while keeping the 1.67:1 ratio.

**Why:** A regression on 2026-05-27 silently turned the country labels into rounded squares because of a page-level skin rule. The `!important`s are the contract that the oval survives any future page-level overrides.

**How to apply:** If you need to skin the oval (resize, restyle for a new page theme), keep the 1.67:1 width:height ratio, keep `border-radius: 50%`, keep the white fill + black border + black Times-serif capitals. Never round the corners to a square-ish shape, never fill it with a non-white background, never strip the `!important`s without putting an equally strong protection in place.

---

## One city catalog: `public.cities`

There is exactly **one** city table for the whole site: `public.cities`, keyed by `slug`, with `city` (the canonical string) unique. `/soundtracks/`, `/gifts/`, and `/mc/gifts/` all read it.

`public.gift_shop_cities` was a second, parallel catalog keyed by the city string. It was merged into `cities` on 2026-07-22 by [mc/supabase/migrations/2026072202_merge_gift_shop_cities_into_cities.sql](mc/supabase/migrations/2026072202_merge_gift_shop_cities_into_cities.sql). **Do not create a new per-product city table** — add a column to `cities` instead (that's what `sound_playlist_id` / `sound_accent` / `sound_secondary` are).

- **Writers don't send a slug.** The `cities_fill_slug` BEFORE INSERT trigger derives it from the city string via `tgb_city_slug()` — city name only (`"St. Louis, Missouri"` → `st-louis`), qualified with the state/country code if that base is taken by a different city (two Portlands), then numbered. The shop admin posts `{ city }` with `on_conflict=city` and nothing else.
- `cities_sync_geo` fills the structured geo columns, matching the `tgb_sync_*_geo` triggers on `games` and `teams`.
- The old `gift_shop_cities` table is **left in place but unread**; the drop statement is at the bottom of the migration, commented, for once the deployed site has been on `cities` for a while.
- **Three per-surface hide flags**, added 2026-07-29 by [mc/supabase/migrations/2026072901_cities_hide_flags.sql](mc/supabase/migrations/2026072901_cities_hide_flags.sql):

  | column | hides the city from |
  |---|---|
  | `hide_from_games` | the city finder + default sample on `/games/` |
  | `hide_from_soundtracks` | the cassette rail on `/soundtracks/` |
  | `hide_from_gift_shop` | Shop By City on `/gifts/` |

  These replaced the single `ignored` ("venue only") switch, which hid a city everywhere at once and conflated three separate editorial calls — a stadium town can be a real games destination and a bad gift-shop city. `hide_from_games` is the direct heir of the venue-only idea, which is why the terminology moved with it.
  - **"Venue city" means a town that is ONLY a venue, not any town that hosts a game.** The eleven NFL stadium towns whose name is not on the jersey — Orchard Park, Foxborough, East Rutherford, Arlington, Inglewood, Santa Clara, Glendale, Miami Gardens, Paradise, Summerfield, Irving — are catalogued and hidden on all three surfaces by [2026080103_venue_only_cities_hidden.sql](mc/supabase/migrations/2026080103_venue_only_cities_hidden.sql). They have to exist in `cities` because `anchor_events.city` and `waypoints.city` point at them, but nobody shops for an Inglewood gift or a Foxborough soundtrack. **Seattle, Philadelphia, Kansas City and the rest of the host cities are the club's own market and stay visible** — several already have tapes and gift listings, and hiding them would empty real rails. That distinction is the whole reason the flags exist per surface rather than per city.
  - **`ignored` is deprecated but still present**, still carrying its old values, and still written by the cities admin (true only when all three flags are). Every reader prefers its own per-surface column and falls back to `ignored` **only when that column is absent**, so the site is correct before and after the migration. Don't add new reads of it; the drop statement is at the bottom of the migration, commented.
  - Shown **grey** (`.tgb-city-ignored`) in admin pickers and filters, where grey now means "hidden from at least one surface" — the checkboxes on the row in [mc/data/cities.html](mc/data/cities.html) say which.
  - The older `archived` "hide everywhere" flag was retired 2026-07-24 — [mc/supabase/migrations/2026072402_drop_cities_archived.sql](mc/supabase/migrations/2026072402_drop_cities_archived.sql). To remove a city now, delete it or set the hide flags.
- **A filter alone is not enough.** `/gifts/` filters the catalog *and then* back-fills cities found on gift-shop games; that back-fill has to re-check the flag or a hidden town walks straight back into the rail (fixed 2026-07-28). If you add another path that derives cities from a non-catalog source, re-apply the check there.
- **Every city control goes through [mc/assets/city-picker.js](mc/assets/city-picker.js)** (`window.TgbCities`) — Start City in `mc/profiles.html`, and the venue City in [mc/data/events.html](mc/data/events.html). (`mc/anchor-events.html` used it before it was deleted on 2026-08-01; `mc/mapper.html` and `mc/content.html` before they were archived on 2026-07-30.) It fills the control from the catalog and hangs a **+** beside it that adds a city without leaving the page. `attach(el, { includeIgnored: true })` for admin surfaces; omit the flag where only real destinations belong.
  - **`attach()` is for a control that outlives a render.** It pushes a controller onto a module-level array and never releases it, so a page that rebuilds a list of rows on every keystroke must not call it per row — `mc/data/events.html` binds one shared `<datalist>` from `TgbCities.all()` instead and puts the **+ city** button in its command bar. Use `attach()` on a form; use the catalog directly on a list.
- **Queries use `select=*`, never a column list naming a hide flag.** PostgREST 400s on an unknown column, so an explicit list breaks any database that hasn't run the migration yet; readers treat a missing column as `false` and fall back to `ignored`.
- **Never send `slug` from a client.** It stays the NOT NULL primary key; the trigger fills it, which works because row triggers run before constraint checks.

---

## Structured city / state / country model (`mc/assets/geo.js`)

Geography is stored two ways at once, and they must stay consistent:

1. **The canonical string** — `games.city`, `cities.city` (unique), `gift_shop_listings.city`, `teams.game_city` — remains the display/key value and the `/gifts/?city=` URL contract. Standard form: US → `"City, FullStateName"`, DC → `"City, D.C."`, non-US → `"City, CountryName"` (e.g. `"Paris, France"`). Teams keep their legacy `"City, ST"` strings.
2. **Structured columns** (added 2026-07-11, all nullable text) on `games`, `cities`, `teams`: `city_name`, `state_code` (2-letter — **drives the map icons**), `state_name`, `country_code` (alpha-3 — drives the country oval), `country_name`.

**Logic lives in [mc/assets/geo.js](mc/assets/geo.js)** (`window.TgbGeo`). It replaces the old copy-pasted `US_STATES`/`COUNTRY_CODES` maps and `canonicalShopCity()`/`cityGeoBadge()`. API: `parseGeo(str)`, `composeGeo(parts)`, `canonicalCity(str)`, `geoBadge(rowOrStr)`, `usStateOptions()/provinceOptions()/countryOptions()`, plus the country-catalog hooks below. Its **SQL twin** is `tgb_parse_geo` / `tgb_compose_geo` / `tgb_canonical_gift_shop_city` — **keep JS and SQL in lock-step** (same parse cases: `Denver, CO`→`CO/Colorado/USA`, `Paris, France`→`FRA`, `Toronto, ON`→`ON/Ontario/CAN`). US states and CA provinces are still hardcoded in both (governmental, stable, and they drive the map icons synchronously).

**Countries are NOT hardcoded — the single source of truth is the `public.countries` table** (`code` alpha-3 PK, `name`, `aliases text[]`), created + seeded by [mc/supabase/migrations/2026072304_countries_catalog.sql](mc/supabase/migrations/2026072304_countries_catalog.sql). **Add a country by inserting ONE row there** — do not re-add a country map to `geo.js` or the SQL functions.
  - `geo.js` **fetches `countries` at runtime** and fills its two live country maps (`COUNTRY_CODE_TO_NAME` / `COUNTRY_NAME_TO_CODE`, mutated in place so captured refs stay fresh). It caches the last fetch in `localStorage['tgb_countries_v1']` and replays it synchronously on load so the public country oval never blanks; the network copy refreshes in the background. **Admin surfaces that build a country dropdown must `await TgbGeo.countriesReady`** before filling (data/cities, mc/profiles.html, the mc/gifts add-city, the city-picker add dialog all do). Before the migration is applied, `geo.js` falls back to the distinct countries in `public.cities` (no aliases) so nothing goes blank in the deploy window.
  - The SQL `tgb_parse_geo` / `tgb_compose_geo` / `tgb_canonical_gift_shop_city` are **`STABLE` and read `public.countries`** (2026072304 supersedes the inline-map versions in `20260711_structured_geo.sql`). `cities.country_code` has a `NOT VALID` FK to `countries.code`.
  - So the lock-step rule now applies only to **US states / CA provinces**; countries are edited once, in the table.

- The **game editor is [mc/overview.html](mc/overview.html)** (editgames.html and builder.html both point here). Its Start City is now **City textbox + State/Province dropdown + Country dropdown** (`#nodeCityInput` / `#nodeStateInput` / `#nodeCountryInput`); on change it composes `meta.city` and fills `meta.cityName/stateCode/stateName/countryCode/countryName`, serialized via `GAME_COLUMN_TO_NODE_FIELD`. `builder.html` has no Start City inspector markup (its `nodeCityInput` JS is dead/guarded) — only its data-path was updated. `mc/challenges.html` was a stale, unreferenced twin and was archived to `mc/_dev/archive/mc/` on 2026-07-30, along with `mapper.html` (the route builder, the only writer of `public.maps`) and `content.html`.
- **BEFORE INSERT/UPDATE triggers** (`tgb_sync_*_geo`) fill the structured columns from the string via `coalesce(existing, parsed)`, so **explicit values win** and SQL-only inserts (the shop's paste-in importers) still get them. This is why the shop admin didn't need to send structured columns — the trigger derives them.
- **Icons** (`cityGeoBadge` in [games/index.html](games/index.html) + [gifts/index.html](gifts/index.html)) delegate to `TgbGeo.geoBadge`, which resolves 2-letter codes / provinces / countries the old name-only map couldn't. New `games` columns are probed by `serializeGameRow` (auto-disabled if the migration isn't applied yet), so the writer degrades gracefully.
- The migration is **additive**: it normalizes existing **US** `games.city` strings to full-name form but never rewrites city keys or `/gifts/?city=` links.

**How to apply:** add new geo fields via `TgbGeo` — never re-introduce a local state map, and never re-introduce a country map (insert a `public.countries` row instead). When adding a `games` meta field, follow the `initGameMeta` snake_case ?? camelCase ?? node fallback rule. If you change the **state/province** maps, update both `mc/assets/geo.js` and the SQL twin.

---

## Supabase `games` table conventions

Columns on the `games` table that read like booleans — `featured`, `archived` — are actually **TEXT columns**. The canonical "true" value is the string `'YES'`; the canonical "false" value is `null` (or empty string).

**Why:** This is the existing storage convention. See `FEATURED_GAME_VALUE = 'YES'` and the `archived: normalizedGame.archived || null` write in `serializeGameRow`, both in [mc/builder.html](mc/builder.html). Writing a JS boolean (`true`/`false`) gets coerced by PostgREST to the literal string `'true'`/`'false'` — and `'false'` is a *non-empty string*, which the shared `isGameFeatured` / `isFilledArchiveValue` helpers read as **truthy**. The UI then never clears the flag (e.g. an "Unfeature" button that won't stop showing "Unfeature").

**How to apply:** When patching these columns via PostgREST, always use `'YES'` / `null` — never `true` / `false`. Same convention extends to any future flag column on the games table unless explicitly typed as BOOLEAN. If in doubt, mirror how `archived` is written nearby — it's the load-bearing example. The reader-side helpers tolerate both shapes; **don't "fix" the readers — fix the writer.**

---

## Supabase reads cap at 1000 rows — always paginate

PostgREST (Supabase's REST layer) returns **at most 1000 rows** per query by default (`db-max-rows`). An unbounded "load the whole table" fetch **silently truncates at 1000** — no error, the JSON just stops. This bug is invisible until the table crosses 1000 rows, then the tail vanishes (hit on 2026-06-20: `waypoints` page wasn't showing WPID 1073 because it loaded only the first 1000 by `wpid` asc).

**How to apply:** Any read that expects an entire table MUST paginate. Use the shared helper **`TgbRest.fetchAll(url, headers)`** in [mc/js/supabase-rest.js](mc/js/supabase-rest.js) — it loops with the `Range: from-(from+999)` header until a page returns < 1000 rows, then concatenates. Include `<script src="js/supabase-rest.js"></script>` on the page, build the URL with the page's `restUrl(...)`, and pass `authHeaders(...)`. Examples: `refresh()` in [mc/data/waypoints.html](mc/data/waypoints.html) and `loadWaypoints()` in the archived `mc/_dev/archive/mc/mapper.html`.

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
