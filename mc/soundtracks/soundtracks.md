# City Soundtracks

> **Prompts and routines:** this room has two, and they are not the same text.
> The **TGB SOUNDTRACK BOT** routine (`trig_014sqaUyU7557svq9mGA1E4a`, cron `30 11`)
> holds the publishable key and calls the RPCs itself. The **PROMPT dialog** in
> [the Tape Room](/mc/soundtracks/admin/index.html) is for pasting into a chat AI
> that has no key, so its deliverable is SQL. Editorial rules must be kept in step
> across both by hand. The full map is
> [mc/_dev/prompt-tools/PROMPTS.md](/mc/_dev/prompt-tools/PROMPTS.md).

**If you are an AI agent working on soundtracks, read this first.** It is also
the plain-English explanation for anyone else. The dashboard at
[`/mc/soundtracks/admin/`](/mc/soundtracks/admin/index.html) is the human view of the same system; this
file is the source of truth.

---

## What a soundtrack is, and why it exists

Every city we run games in gets a **cassette tape** on [/soundtracks/](https://thegamebureau.com/soundtracks/):
15 active songs that sound like that place. Hometown artists, songs that name the
streets, the fight song the whole stadium knows, the record cut in a studio down
the road.

**It makes us no money, and that is the point.** A soundtrack is a gift. Someone
who plays a Game Bureau game in New Orleans — or is only thinking about it — can
put the New Orleans tape on and get a feel for the city before they ever arrive.
Curiosity about a city is the thing we are really selling; the game is how
somebody acts on it. The tapes are the cheapest, most generous way we have to
start that.

So when picking songs, optimise for **"this makes me want to go there"**, not for
chart positions. A deep cut that names a neighbourhood beats a famous song by
someone who merely happens to have been born nearby.

### The explainer videos

There are none right now. `soundtracks-explainer-landscape.mp4` (16:9) and
`soundtracks-explainer-vertical.mp4` (9:16) were committed beside the tapes and
served straight off the site, and both were **deleted on 2026-08-06**, so those
two URLs are dead — unlink them anywhere they were shared.

The renderer that built them is still here:
[mc/_dev/scripts/render-soundtracks-video.ps1](/mc/_dev/scripts/render-soundtracks-video.ps1).
Its paths were corrected on 2026-08-06 — it now resolves the repo root properly and
reads the hero image from `soundtracks/soundtracks.jpg`. The one thing still missing
is the ffmpeg binary it expects under `.tmp/video-tools/`, which was deleted with the
rest of that scratch folder, so supply ffmpeg before running it.

---

## Where the data lives

Tapes moved out of `soundtracks/soundtracks.json` and into Supabase on **2026-07-29**;
the file lingered as an offline fallback until **2026-08-06**, when it was deleted.
The file is still committed and still read — but only as a lifeboat.

| Thing | Where | Notes |
|---|---|---|
| The tapes | `public.soundtracks` | One row per city: `city_slug` (pk), `spine_tag`, `spine_tag_position`, `archived`. |
| The songs | `public.soundtrack_songs` | One row per track: `city_slug`, `position`, `title`, `artist`, `blurb`, `spotify_id`, `explicit`, `archived`. |
| How full each tape is | `public.soundtrack_stats` (view) | `active_songs`, `archived_songs`, `last_song_at` per tape. Read this instead of counting songs yourself. |
| Audit findings | `public.soundtrack_issues` | One row per open finding: `city_slug`, `song_id` (null = whole tape), `kind`, `severity`, `detail`, `suggestion`, `status`. Not publicly readable. |
| The write path for agents | `public.tgb_pull_soundtrack_songs(jsonb)` | Insert-only RPC callable with the publishable key. The routine's only way in. |
| City names + geo badges | `public.cities` | Joined on `city_slug` = `cities.slug`. Also the gate: no tape for a city with `hide_from_soundtracks = true`. |
| The public page | `soundtracks/index.html` | Reads both tables (paged, because PostgREST caps at 1000 rows). Supabase is the only source; a failed fetch shows "Could not load soundtracks." |
| The audit write path | `public.tgb_report_soundtrack_issues(jsonb)` | Insert-only RPC, publishable key. Files findings; cannot clear them. |
| The dashboard | `mc/soundtracks/admin/index.html` | An **Issues** panel (open findings, Fixed / Not an issue) above **Tapes & Tracks** — every tape collapsed by city, Hide/Show on both a tape and a track, **Edit** for every field on a track plus Move/Copy to another tape, a red ⚠ chip on any flagged track, each track stamped with when it was added, sortable by city / tape added / track added. Plus last run, viewer stats links, and the manual fallback prompt. |

A tape and its songs:

```jsonc
// public.soundtracks
{ "city_slug": "new-orleans", "spine_tag": "Soul Mix", "spine_tag_position": null, "archived": false }

// public.soundtrack_songs
{
  "city_slug": "new-orleans",
  "position": 0,
  "title": "Do Whatcha Wanna",
  "artist": "Rebirth Brass Band",
  "spotify_id": "4PTG3Z6ehGkBFwjybzWkR8",
  "blurb": "Second-line brass that runs the whole city",
  "explicit": false,
  "archived": false
}
```

- `city_slug` is a foreign key to `public.cities.slug`. A tape cannot exist for a
  city that is not in the catalog.
- `spine_tag` is the short phrase printed down the cassette spine. The house
  options are `Soundtrack`, `Soul Mix`, `Street Sounds`, `Local Mix` and `Jams`,
  but something better and city-specific beats all of them. Set
  `spine_tag_position = 'before'` only for phrases that read ahead of the city
  name, like `Sounds of`.
- `position` is play order within the tape; ties fall back to `id`.
- `spotify_id` is a 22-character Spotify track id. **Nullable on purpose** — omit
  it rather than guess; the player falls back to a Spotify search for
  `artist title`. A CHECK constraint rejects anything that is not 22
  alphanumerics, so a malformed id fails loudly instead of quietly not playing.
- `archived = true` is a track-level tombstone. The row stays on the city so the
  same title+artist is never picked again there, but `/soundtracks/` hides it and active
  counts ignore it.
- **A tombstone is scoped to one city, never to the song.** The unique index is
  `(city_slug, lower(btrim(title)), lower(btrim(artist)))`, so hiding *Basin
  Street Blues* on Denver says nothing about New Orleans — the same title+artist
  can be added there, stay active there, and be topped up there, all while the
  Denver row stays hidden. This is deliberate: a song can genuinely belong to two
  cities, and being wrong for one is not evidence about the other. The Tape
  Room's **Copy** relies on it, inserting the copy with `archived = false`.
  **Move** is the one action that does carry the tombstone across, because it
  takes the row itself rather than making a new one.
- **The Tape Room says KEEP and SKIP for this, not archive.** The column keeps
  the name `archived`, the code keeps its `LIVE` / `SHELVED` / `REVIEW` status
  strings, and only the words a person reads have ever changed — four times now:
  ARCHIVE → HIDE (2026-07-30) → SHELVE (2026-08-01) → **SKIP** (2026-08-14).
  Each rename fixed the same complaint, that the word implied more than the
  effect: nothing is filed away or deleted, the track simply comes off
  `/soundtracks/` and stops counting. If you add UI here, match the visible
  vocabulary: buttons **Keep / Skip / Review**, chips **Kept / Skipped /
  Review**. A **TAPE is SHELVED, a TRACK is SKIPPED** — different columns doing
  different jobs (`soundtracks.archived` takes a whole city off the site,
  `soundtrack_songs.rejected_at` turns down one song), and you skip a track on a
  player but a whole tape goes on a shelf. So the tape level is **Shelve tape /
  Restore tape**. *Restore*, not *Keep tape* — restoring brings back only the
  tracks the tape took down with it, never one skipped on its own.
- A **unique index on `(city_slug, lower(title), lower(artist))`** enforces the
  no-duplicates rule in the database. This is what makes tombstones work: an
  INSERT of a retired song hits the index and does nothing.

### Reading and writing

Reads are public — the publishable key in `soundtracks/index.html` is enough:

```bash
curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/soundtrack_stats?select=city_slug,active_songs,archived&order=city_slug.asc&apikey=<publishable key>"
```

Writes split by who is doing them:

- **An agent adds songs** through `tgb_pull_soundtrack_songs`, with the same
  publishable key. It is `SECURITY DEFINER` and deliberately tiny: insert-only,
  creates the tape row if needed, refuses a `city_slug` that is unknown or hidden
  from `/soundtracks/`, ignores `spine_tag` on a tape that already exists, drops a
  malformed `spotify_id`, always writes `archived = false`, and caps a call at 60
  songs across 4 tapes. **Do not add parameters for `archived`** — that constant
  is part of what makes the function safe to expose to `anon`. Same pattern, and
  same reason, as the gift shop's `tgb_pull_book_candidates`: a cloud routine has
  no secret store, so a service-role key would have to sit in its stored prompt
  in plaintext.
- **A human retires or restores a song** in the Tape Room, which PATCHes
  `soundtrack_songs.archived` under an admin session. RLS allows writes to
  `authenticated` only. The asymmetry is the design: adding is automatable,
  destroying is not.
- **The agent audits and reports; it never fixes.** Each run checks the two tapes
  it just wrote plus the 3 with the oldest `soundtracks.last_audit_at` (null
  first), and files findings through `tgb_report_soundtrack_issues` — insert-only,
  always `status = 'open'`, max 40 a call, publishable key. Four kinds:
  `spotify` (the id resolves to nothing, or to a different recording — the only
  failure a visitor actually hits, so it outranks the rest), `spelling`,
  `relevance` (no genuine tie to the city, including a sports track the team does
  not really use), `facts`. Send `audited` with **every** tape you looked at,
  clean ones included: that is what advances the rotation, and an unstamped tape
  is re-audited forever.
- **Re-reporting is a silent no-op, by design.** A partial unique index on
  `fingerprint` covering `open` and `dismissed` — but *not* `fixed` — means you
  never have to check what is already known, and a finding a human marked "not an
  issue" can never come back. Do not treat the RPC's `skipped` count as a failure.
  Because the fingerprint is `md5(city_slug:song_id:kind)` and ignores your
  wording, rephrasing a finding does not sneak it past the dedupe.
- **A human clears a finding**, in the Issues panel, and the two buttons mean
  different things. **Fixed** = dealt with; the row leaves `open` and the same
  finding *may be raised again tomorrow*, which is the only real check that the
  fix landed. **Not an issue** = the agent was wrong; that exact finding is
  silenced permanently. Neither is available to the agent — `status` is not a
  parameter of the reporting RPC.
- **A human edits a song's fields** there too — title, artist, blurb,
  `spotify_id`, `explicit`, `position` — and can **Move** a track to another tape
  (PATCH of `city_slug`) or **Copy** it onto one (INSERT with `archived = false`).
  Two things to know before you do either. A blank `spotify_id` is always a valid
  answer and a better one than a guess: the player falls back to a Spotify search
  for artist + title, whereas a fabricated 22-character ID satisfies the CHECK and
  silently plays nothing. And because `archived` is a tombstone scoped to one
  city, **moving a hidden track carries the tombstone with it** and frees the
  routine to pick that song for the old city again — Copy is the right verb for a
  song that genuinely belongs to two cities.
- **A human can archive a whole tape**, from its city header in the same panel.
  That PATCHes `soundtracks.archived`, and a trigger archives every live song on
  the tape with it, marking each `archived_with_tape = true`. Restoring the tape
  clears exactly those marks. **A song you retired by hand stays retired** through
  a tape archive and restore, because it is a do-not-rescrape tombstone. Use a
  tape archive for a city that should not be published at all — it is one click
  instead of fifteen, and `active_songs` drops to zero the way the counts assume.

---

## The rules

These must hold. The daily agent follows them; so should you.

1. **Exactly 15 active songs** per city. Active means `archived` is not true.
   A tape **over** 15 is corrected by skipping, not deleting, and the ones to skip
   are the **most recently added** — highest `created_at` first, ties broken by
   highest `id` — until 15 active remain. Newest-first is the rule because the
   earlier fifteen were the considered set; anything past them arrived from a
   double-run, a manual add, or a top-up that miscounted, and is the surplus by
   definition. Hiding leaves the row on the city as a tombstone, so the same
   title+artist is not picked for that city again.
2. **Max 2 active songs per artist** within a city.
3. **No duplicate title + artist** pair within a city, including archived songs.
4. Every active song has a **title, an artist, and a blurb** of **10 words or
   fewer**. The blurb is **required** — a missing one is a `facts` finding —
   but there is **no minimum LENGTH** once it exists. Four words that say
   something true are better than eight padded out to reach a count, and **no
   blurb is ever too short**: shortness alone is never worth reporting, at any
   length above nothing.
5. `spotify_id`, when present, is **exactly 22 alphanumeric characters**, verified
   against a real `open.spotify.com/track` page. **Never invent one** — a
   fabricated ID is 22 characters like any other, passes every format check, and
   silently plays nothing. IDs are **case-sensitive** and search snippets
   sometimes disagree on capitalisation, so copy the ID off the page you opened.
6. `explicit = true` only when Spotify marks the track explicit.
7. `archived = true` only for a retired song that should be off the site and
   excluded from active counts while blocking reuse in that same city. **Only a
   human sets it** — the agent write path cannot keep or skip anything.
8. `position` runs 0-upward within a tape and carries play order.
9. **No tapes for venue-only cities** — rows in `public.cities` with
   `hide_from_soundtracks = true` (Orchard Park, Santa Clara) are stadium towns,
   not places we sell into. The write RPC refuses them outright.
10. Real, commercially available recordings only. No karaoke, tribute, sped-up,
   slowed, or re-recorded versions. A **remaster** of the original master is
   fine; a **re-recording** is not.
11. Blurbs carry **no trailing period**.

### What belongs on a tape

Aim for a mix across eras and genres, weighted toward:

- **Songs that name the place** — the city, its streets, its neighbourhoods.
- **Hometown artists** — people from there, and records made there.
- **Sports and game-day music.** This matters: our games are built around teams
  and stadiums, so a tape should carry what that city's crowd actually hears —
  fight songs, the team's victory anthem, the walk-up or goal song a stadium is
  known for, the track that plays when the home side scores, and the songs fans
  sing in the parking lot. Two or three of the fifteen is a good target for a
  city with a strong sports identity.

  > **Confirm the team actually uses the song.** Stadium-song lore is the most
  > error-prone thing on these tapes, because a generic arena anthem sounds
  > right on any city. An audit on 2026-07-28 found **twelve** of Buffalo's 25
  > tracks were generic arena music with Bills-flavoured blurbs written over
  > them, none of it Bills tradition: Thunderstruck is the Cowboys, Crazy Train
  > is the Patriots, Enter Sandman is the Yankees, Bro Hymn is the Ducks. They
  > were redistributed to the cities whose teams actually play them. Search the
  > specific team-song pairing before writing the blurb; if you cannot confirm
  > it, use a hometown-artist track instead.
- **Local scenes and labels** — the sound a city is known for making.

---

## What happens every morning

A **scheduled Claude Code cloud agent** runs at **11:30 UTC** — 6:30 AM Central
in summer, 5:30 AM in winter. Cloud cron is UTC and has no daylight-saving
shift, so a single expression cannot hold one local time year-round; 11:30 was
picked to be exactly 6:30 AM during CDT. To keep 6:30 through the winter,
change the cron to `30 12 * * *` when Central falls back in November, and back
to `30 11 * * *` in March. Leaving it alone is fine too — an hour early in
winter costs nothing.

1. Reads `public.cities` and `public.soundtrack_stats`.

   > **Read the catalog with `curl`, not WebFetch.** Settled 2026-07-28 by
   > testing both against the same host:
   >
   > ```bash
   > curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/cities?select=slug,city,hide_from_soundtracks&order=city.asc&apikey=<publishable key>"
   > curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/soundtrack_stats?select=city_slug,active_songs,archived&order=city_slug.asc&apikey=<publishable key>"
   > ```
   >
   > The publishable key rides in the query string — PostgREST accepts that,
   > and it is the only option for a tool that cannot send headers. Three
   > columns only, so the response comes back whole; the public `/soundtracks/` page
   > still uses `select=*`.
   >
   > **WebFetch returns 403 for this host and curl returns 200**, on the same
   > URL, at the same moment, with a cache-busting query to rule out its
   > 15-minute response cache. WebFetch egresses through a different path that
   > the environment's allowlist does not govern, so allowlisting the host
   > fixes curl and does nothing for WebFetch. Two earlier versions of this
   > file had this backwards and told the agent to prefer WebFetch; that is
   > what cost the 2026-07-28 run its new-city half.
   >
   > **If curl fails with `403 to CONNECT`**, the host has fallen off the
   > environment's network allowlist. That is an egress-policy denial — do not
   > route around it (no CORS shims, no third-party JSON proxies, never
   > disable TLS verification) and do not retry in a loop. Re-add
   > `qmaafbncpzrdmqapkkgr.supabase.co` under **Custom → Allowed domains** in
   > the environment settings, reached from the cloud icon above the message
   > box at [claude.ai/code](https://claude.ai/code) — there is no
   > environments page and no direct URL. Keep **"Also include default list of
   > common package managers"** checked.
   >
   > **While it is unreachable:** skip the new-city half — never guess which
   > city is next, and never hand-write a city list, because a wrong pick
   > writes a tape for a city we do not sell into. Still do the top-up, and
   > say plainly in the summary that the catalog was unreachable.
2. Picks the **alphabetically first city with no active tape**, plus the
   **emptiest existing tape by active song count**.
3. Researches songs and verifies every Spotify ID by web search.
4. Runs the housekeeping pass below.
5. Writes the songs through `tgb_pull_soundtrack_songs`, which puts them live on
   `/soundtracks/` immediately. **The newest song row is the run receipt** — that is
   what the dashboard's "Last run" reads, not a commit.
6. Commits nothing. The routine has no git write at all as of 2026-08-06, when the
   fallback file it used to refresh was deleted — same shape as the gift shop and
   socials bots.

### The daily audit

Added 2026-07-28 as a report-only housekeeping pass, after a manual audit turned
up eleven tapes breaking the artist cap and twelve misplaced songs on one tape.
Since **2026-07-30** its findings go to `public.soundtrack_issues` through
`tgb_report_soundtrack_issues` instead of only into the run summary, so they
survive the run and a human can clear them one at a time in the Tape Room.

**Which tapes.** The two the run just wrote to — errors are cheapest to catch the
morning they are introduced — plus the **3 that have gone longest without a
look**. `soundtracks.last_audit_at` is the clock; null means never and sorts
first, so an unaudited tape is always next:

```bash
curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/soundtracks?select=city_slug,last_audit_at&order=last_audit_at.asc.nullsfirst&limit=3&apikey=<publishable key>"
```

Five tapes a day sweeps the whole catalogue every couple of weeks at flat cost.
Send `audited` with **every** tape you looked at, clean ones included — that is
what advances the rotation, and a tape you never stamp is re-audited forever.

**The four kinds**, and the string matters because it drives the panel's filter:

| kind | what it means |
|---|---|
| `spotify` | The id resolves to nothing, or to a **different recording** than title+artist claims. Check it first and report it `high` — it is the only failure a visitor actually hits. A *wrong* id is far worse than a *missing* one: missing falls back to a search and still works. |
| `spelling` | Misspelled title or artist, typos in a blurb, a mis-capitalised proper noun. Check against the real release, not against your expectation — stylised titles are often correct as written. |
| `relevance` | No genuine tie to the city, including a sports track the team does not actually use. The failure the whole editorial rule exists to prevent, so be specific about why. |
| `facts` | Wrong year, wrong album, wrong claim about the artist. Also duplicates on the same tape, a missing blurb, a blurb over 10 words (never a blurb merely judged *short* — there is no minimum length), an `explicit` flag that disagrees with Spotify, or a tape **short of 15 or over 15**. For an over-full tape, name the surplus tracks to skip — the most recently added, newest `created_at` first — and file it against the tape (omit `song_id`). |

**Severity.** `high` = a visitor sees or hears something broken. `warn` = wrong
but not visibly broken. `info` = a nitpick. Use `high` sparingly; if everything
is high, nothing is.

**Reporting discipline:**

- **Report only what you actually checked.** Do not infer a broken id from a
  title you do not recognise — open the track page. An unverified guess costs a
  human more time than saying nothing.
- **One finding per song per kind.** Two spelling problems in one blurb are one
  spelling finding. This is not a style preference; it is what the fingerprint
  allows, and a second one is dropped.
- Put the problem in `detail`, in one sentence someone can act on. Put a concrete
  fix in `suggestion` **only when you have verified it**.
- Say nothing about **skipped** songs. They are already off `/soundtracks/` and
  can never be re-picked for that city, so there is nothing left to ask.
- **Do not fix what you find.** Noticing is automatable; deciding is not. The one
  exception is a song you added yourself this run — fix that before you report it.
- At most 40 findings a call. If a sweep produces more, report the most severe and
  say so in your summary.
- Finish by saying which tapes you audited, how many findings you filed, and how
  many were skipped as already-known. **A clean tape is a result** — say so.

The checks themselves, unchanged since 2026-07-28:

1. Any artist appearing **more than twice among active songs** on a tape —
   including one act spelled two ways (`Los Tigres del Norte` /
   `Los Tigres Del Norte` is one artist, and the count has to treat it that
   way).
2. Duplicate **title + artist** pairs within a tape, including archived songs,
   because archived entries are the do-not-rescrape list for that city.
3. Active songs with a missing `spotify_id` (the column's CHECK constraint means
   a malformed one can no longer be stored at all).
4. Active songs with missing titles, artists, or blurbs; blurbs longer than 10
   words or ending in a period. **A blurb is never reported for being short** —
   only for being absent, over the ten, or punctuated.
5. Tapes with no songs, and tapes for cities that have since been hidden from
   `/soundtracks/`.
6. Tapes short of 15 active songs, shortest first — the backlog, expected to be
   long.
7. Tapes **over** 15 active songs. Report how many surplus there are and name the
   most recently added that many tracks, newest `created_at` first — those are
   the ones to hide. Never propose hiding an older track to make room for a newer
   one; the earlier fifteen are the considered set.
8. Active songs with **no plausible connection to their city**.

Two rules that have not changed and must not:

- **The agent cannot archive anything** — `tgb_pull_soundtrack_songs` is
  insert-only. So a cap violation, a wrong-city song, an unplayable track, or a
  tape over 15 is *reported*, with the city and the exact songs named, for a human
  to hide in the Tape Room. Where the fix is purely additive (a short tape), the
  agent just adds the verified songs. **Trimming an over-full tape is therefore a
  human action**: press **Hide** on the named tracks, working from the newest
  `Added` stamp backwards until the tape reads 15 active.
- **Never silently delete.** Deleting is not available to the agent at all, and a
  human hides rather than deletes: the tombstone row is what blocks that same
  title + artist from being picked again for the city.

### The routine itself

- Routine `trig_014sqaUyU7557svq9mGA1E4a` —
  [open it](https://claude.ai/code/routines/trig_014sqaUyU7557svq9mGA1E4a)
- Model: Claude Opus 5
- From that page you can watch a run, trigger one early, change the schedule, or
  pause it.
- The routine's stored prompt was **rewritten on 2026-07-29** for the Supabase
  path: it reads `soundtrack_stats` instead of the JSON file, writes through
  `tgb_pull_soundtrack_songs`, and its last section is now "do not commit". It
  also keeps the 2026-07-28 fix telling the agent to use `curl` and never switch
  to WebFetch (two earlier versions said the opposite). If the prompt and this
  file ever disagree, **this file wins**, which the prompt itself says.
- **The routine reads this file from `main` on GitHub**, not from your working
  copy. A change to the rules only reaches tomorrow's run once it is pushed.

It replaced a GitHub Actions workflow on 2026-07-27. That version needed a
funded Anthropic or OpenAI API key and neither account had credit, so every run
failed on a billing error. The routine bills against the Claude subscription
instead. **Do not recreate the workflow** — and if you ever do, do not leave both
running or you will get two tapes a day.

---

## Who is listening (and why we cannot tell you)

Visits to `/soundtracks/` are counted by **Cloudflare Web Analytics**, live since
2026-07-30 via [`assets/site-analytics.js`](/mc/assets/site-analytics.js). It is
free at any volume and cookieless with no per-visitor identifier, so there is **no
consent banner and nothing to disclose in a privacy policy**.

- **The numbers are in Cloudflare's dashboard, not on our page, and cannot be.**
  Reading them means Cloudflare's GraphQL API with a *secret* API token, and every
  admin page here is public HTML on GitHub Pages. The Tape Room's Viewer
  Statistics card therefore carries deep links and a live *beacon-installed* check
  instead of counts. Putting real figures on the page would need a Supabase Edge
  Function holding the token behind `is_photo_admin()`.
- **Read the numbers as a floor, not a headcount.** Cookieless means no visitor
  identity, so "visits" are estimated from page views rather than counted people,
  and someone returning tomorrow is indistinguishable from a stranger. Ad and
  tracker blockers drop the beacon entirely, so real traffic is always somewhat
  **higher** than what you see — never lower.
- **It measures arriving, not listening.** A page view cannot tell you which
  cassette anyone played, or whether they pressed play at all. That would need our
  own append-only event table writing a row per play, the same shape as
  `game_events` — deliberately not built. **Do not read a listening story into a
  traffic chart**, and do not try to squeeze play counts out of a page-view tool.
- It is a hand-placed snippet rather than Cloudflare's automatic injection because
  `thegamebureau.com` is **DNS-only** on Cloudflare — the apex resolves to GitHub
  Pages and no request passes through the proxy that would inject it.
  Auto-injection would silently collect nothing.
- The script **refuses admin surfaces itself** (`/mc/`, `/account/`, any `/admin/`
  path, `gifts/giftcards.html`) plus localhost and LAN hosts, so our own sessions
  do not swamp real visitor numbers on a site this size.

---

## Doing it by hand

The dashboard carries a paste-ready prompt for running a tape out of band. It
targets the same RPC the routine uses, so nothing about the data path changes.

To retire a song without letting the scraper bring it back, open the Tape Room's
**Tapes & Tracks** panel, find the song, and press **Hide**. That writes
`archived = true` to its row under your admin session: off `/soundtracks/` immediately,
still on the city as a do-not-rescrape tombstone. **Show** puts it back. Add a
replacement if the tape would otherwise have fewer than 15 active songs.

To change a song rather than retire it, press **Edit** on its row. Title, artist,
blurb, `spotify_id`, `explicit` and `position` are all editable in place, and the
same editor can **Move** the track to another tape or **Copy** it onto one. Two
things to know:

- A song that will not play usually has a bad `spotify_id`. **Clear the box** —
  blank is always a valid answer and a better one than a guess, because the player
  falls back to a Spotify search for artist + title while a fabricated 22-character
  id satisfies the CHECK and silently plays nothing.
- **Move** carries a hidden track's tombstone to the new city, which frees the
  routine to pick that song for the old one again. **Copy** never does, so Copy is
  the right verb for a song that genuinely belongs to two cities.

A rename or a move that collides with the `(city_slug, lower(title),
lower(artist))` unique index is refused. The offending row is often a *hidden*
one, so tick **Show hidden** before concluding the tape does not already have it.

There is no JSON file to edit. `soundtracks/soundtracks.json` and its exporter were
deleted on 2026-08-06: the tables are the only source, so a change is live the moment
you save it in the Tape Room.
It is read-only against Supabase and rewrites the file in its exact historical
shape, so an unchanged database produces a zero-line diff. **Never hand-edit the
file.** The Tape Room has a **download a fresh copy** link under the track list
that produces the same bytes, deliberately tucked away: the daily run regenerates
and commits this file for you, so a human needs it only when the routine is down.

After any edit, load `/soundtracks/` and play the tape you touched.

---

## When something looks wrong

| Symptom | Likely cause |
|---|---|
| A song will not play | The `spotify_id` is wrong or the track was pulled. Null the column (keep title and artist) and the player falls back to search. |
| A city is missing from `/soundtracks/` | No row in `public.soundtracks`, its tape is `archived`, it has zero active songs, or the city is `hide_from_soundtracks` in `public.cities`. |
| A city shows a slug instead of a name | It is not in `public.cities`. Add it there for the display name and geo badge. |
| Runs keep topping up but never add a new city | The agent could not read `public.cities`. Either it used WebFetch (which 403s for this host — use curl) or the host fell off the environment's network allowlist (`403 to CONNECT`). See step 1 above. |
| A tape is full of songs with no tie to the city | Generic arena anthems dressed up with local blurbs. Check the team-song pairing; archive wrong-city songs in this city, then add replacements or move the active song to the city whose team actually plays it. |
| A tape got shorter after a run | Someone archived without replacing. The run itself cannot shorten a tape — it can only insert. |
| A run reported 15 songs but the tape has fewer | The RPC skipped duplicates. Its result rows say which and why; a song already on the tape, active or archived, is silently not re-added. |
| `/soundtracks/` says "Could not load soundtracks." | The Supabase fetch failed. Check the browser console and the project status. Since 2026-08-06 there is no fallback file, so an outage shows plainly instead of quietly serving a stale catalogue. |
| "Last run" on the dashboard is over a day old | A run failed, or the routine is paused. Open the routine and read the transcript. |
| A finding you cleared as **Fixed** is back tomorrow | Working as designed — the fix did not take, or did not address what was flagged. Only **Not an issue** silences a finding permanently. |
| A finding you dismissed never comes back even though it is real | Also by design. `dismissed` is caught by a partial unique index, so re-reporting is a database-level no-op. Set that row's `status` back to `open` in the Supabase table editor to un-silence it. |
| The Issues panel is empty and stays empty | Either nothing is wrong, or the migration is not applied — the page tolerates a missing `soundtrack_issues` table by showing no findings. Check the browser console. |
| Two tapes appeared in one day | Something else is writing too — check the old GitHub workflow was not recreated. |

---

## Notes for agents

- `public.tgb_pull_soundtrack_songs` and `public.tgb_report_soundtrack_issues` are
  the **only** two write paths you need — one to add songs, one to file findings.
  Do not write the tables directly, do not use a service-role key, do not
  reintroduce a committed JSON snapshot, and do not create a third table, per-city HTML,
  `city-playlists.json`, `song-playlists.json`, or a build script — all of those
  existed once and were deliberately removed.
- Song suggestions arrive at `soundtrack@thegamebureau.com`. **Check them before
  choosing tracks**, if Gmail access is available — useful searches are
  `to:soundtrack@thegamebureau.com`, `subject:(Song suggestion)`, and
  `subject:"Song suggestion for {City}"`. Treat them as leads, never as verified
  facts: the Spotify id still has to be checked like any other.
- Verify after writing, by re-reading `soundtrack_stats`: 15 active songs on both
  tapes you touched, artist cap intact, every added song accounted for in the
  RPC's result rows.
- Refresh the fallback with the export script and commit only that one file. If
  the push is rejected, `git pull --rebase` and push again — three other routines
  commit here every morning. Never force-push.
- You cannot remove or archive a song, and that is deliberate. Archived rows are
  city-specific do-not-rescrape tombstones: hidden from `/soundtracks/`, ignored by
  counts, and still blocking future title + artist reuse in that city. Name what
  needs retiring in your summary, file it as an issue, and a human does it.
- You cannot clear a finding either. `status` is not a parameter of the reporting
  RPC, so **Fixed** and **Not an issue** stay human actions. If you believe a
  finding is wrong, say so in your summary rather than trying to route around it.
- If you cannot verify a Spotify ID, **omit it**. Omitting is always correct;
  guessing never is.
- Say plainly in your summary which songs you could not verify. A quiet gap is
  worse than a flagged one.
