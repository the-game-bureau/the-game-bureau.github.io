# City Soundtracks

**If you are an AI agent working on soundtracks, read this first.** It is also
the plain-English explanation for anyone else. The dashboard at
[`/sound/admin/`](admin/index.html) is the human view of the same system; this
file is the source of truth.

---

## What a soundtrack is, and why it exists

Every city we run games in gets a **cassette tape** on [/sound/](https://thegamebureau.com/sound/):
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

---

## Where the data lives

Tapes moved out of `sound/soundtracks.json` and into Supabase on **2026-07-29**.
The file is still committed and still read — but only as a lifeboat.

| Thing | Where | Notes |
|---|---|---|
| The tapes | `public.soundtracks` | One row per city: `city_slug` (pk), `spine_tag`, `spine_tag_position`, `archived`. |
| The songs | `public.soundtrack_songs` | One row per track: `city_slug`, `position`, `title`, `artist`, `blurb`, `spotify_id`, `explicit`, `archived`. |
| How full each tape is | `public.soundtrack_stats` (view) | `active_songs`, `archived_songs`, `last_song_at` per tape. Read this instead of counting songs yourself. |
| The write path for agents | `public.tgb_pull_soundtrack_songs(jsonb)` | Insert-only RPC callable with the publishable key. The routine's only way in. |
| City names + geo badges | `public.cities` | Joined on `city_slug` = `cities.slug`. Also the gate: no tape for a city with `hide_from_soundtracks = true`. |
| Offline fallback | `sound/soundtracks.json` | What `/sound/` renders when Supabase is unreachable. **Not the source of truth.** Regenerate it with **Download JSON** in the Tape Room; never hand-edit it and never treat it as current. |
| The public page | `sound/index.html` | Reads both tables (paged, because PostgREST caps at 1000 rows), falls back to the JSON file on any error. |
| The dashboard | `sound/admin/index.html` | Fresh-track review, the Track Archive editor, last run, links to the routine, manual fallback prompt. |

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
- `spine_tag` is the short phrase printed down the cassette spine (`Soundtrack`,
  `Jams`, `Soul Mix`…). Set `spine_tag_position = 'before'` only for phrases that
  read ahead of the city name, like `Sounds of`.
- `position` is play order within the tape; ties fall back to `id`.
- `spotify_id` is a 22-character Spotify track id. **Nullable on purpose** — omit
  it rather than guess; the player falls back to a Spotify search for
  `artist title`. A CHECK constraint rejects anything that is not 22
  alphanumerics, so a malformed id fails loudly instead of quietly not playing.
- `archived = true` is a track-level tombstone. The row stays on the city so the
  same title+artist is never picked again there, but `/sound/` hides it and active
  counts ignore it.
- A **unique index on `(city_slug, lower(title), lower(artist))`** enforces the
  no-duplicates rule in the database. This is what makes tombstones work: an
  INSERT of a retired song hits the index and does nothing.

### Reading and writing

Reads are public — the publishable key in `sound/index.html` is enough:

```bash
curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/soundtrack_stats?select=city_slug,active_songs,archived&order=city_slug.asc&apikey=<publishable key>"
```

Writes split by who is doing them:

- **An agent adds songs** through `tgb_pull_soundtrack_songs`, with the same
  publishable key. It is `SECURITY DEFINER` and deliberately tiny: insert-only,
  creates the tape row if needed, refuses a `city_slug` that is unknown or hidden
  from `/sound/`, ignores `spine_tag` on a tape that already exists, drops a
  malformed `spotify_id`, always writes `archived = false`, and caps a call at 60
  songs across 4 tapes. **Do not add parameters for `archived`** — that constant
  is part of what makes the function safe to expose to `anon`. Same pattern, and
  same reason, as the gift shop's `tgb_pull_book_candidates`: a cloud routine has
  no secret store, so a service-role key would have to sit in its stored prompt
  in plaintext.
- **A human retires or restores a song** in the Tape Room's Track Archive panel,
  which PATCHes `soundtrack_songs.archived` under an admin session. RLS allows
  writes to `authenticated` only. The asymmetry is the design: adding is
  automatable, destroying is not.

---

## The rules

These must hold. The daily agent follows them; so should you.

1. **Exactly 15 active songs** per city. Active means `archived` is not true.
2. **Max 2 active songs per artist** within a city.
3. **No duplicate title + artist** pair within a city, including archived songs.
4. Every active song has a **title, an artist, and a 6–10 word blurb**.
5. `spotify_id`, when present, is **exactly 22 alphanumeric characters**, verified
   against a real `open.spotify.com/track` page. **Never invent one** — a
   fabricated ID is 22 characters like any other, passes every format check, and
   silently plays nothing. IDs are **case-sensitive** and search snippets
   sometimes disagree on capitalisation, so copy the ID off the page you opened.
6. `explicit = true` only when Spotify marks the track explicit.
7. `archived = true` only for a retired song that should be hidden and excluded
   from active counts while blocking reuse in that same city. **Only a human sets
   it** — the agent write path cannot archive or un-archive anything.
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
   > columns only, so the response comes back whole; the public `/sound/` page
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
   `/sound/` immediately. It commits nothing — **the newest song row is the run
   receipt**, which is what the dashboard's "Last run" reads.

### The daily housekeeping pass

Added 2026-07-28, after a manual audit turned up eleven tapes breaking the
artist cap and twelve misplaced songs on one tape. The run now scans every tape
each day and reports:

1. Any artist appearing **more than twice among active songs** on a tape —
   including one act spelled two ways (`Los Tigres del Norte` /
   `Los Tigres Del Norte` is one artist, and the count has to treat it that
   way).
2. Duplicate **title + artist** pairs within a tape, including archived songs,
   because archived entries are the do-not-rescrape list for that city.
3. Active songs with a missing `spotify_id` (the column's CHECK constraint means
   a malformed one can no longer be stored at all).
4. Active songs with missing titles, artists, or blurbs; blurbs outside 6–10
   words or ending in a period.
5. Tapes with no songs, and tapes for cities that have since been hidden from
   `/sound/`.
6. Tapes short of 15 active songs, shortest first — the backlog, expected to be
   long.
7. Active songs with **no plausible connection to their city**.

It then fixes **at most three**, preferring malformed IDs → artist-cap →
blurb format → everything else, and reports the rest. The ceiling is
deliberate: it keeps each day's diff small enough to actually read.

Two rules for the fixing:

- **The agent cannot archive anything** — `tgb_pull_soundtrack_songs` is
  insert-only. So a cap violation, a wrong-city song, or an unplayable track is
  *reported*, with the city and the exact song named, for a human to archive in
  the Tape Room. Where the fix is additive (a short tape), the agent just adds the
  verified songs.
- **Never silently delete.** Deleting is not available to the agent at all, and a
  human archives rather than deletes: the tombstone row is what blocks that same
  title + artist from being picked again for the city.

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

## Doing it by hand

The dashboard carries a paste-ready prompt for running a tape out of band. It
targets the same RPC the routine uses, so nothing about the data path changes.

To retire a song without letting the scraper bring it back, open the Tape Room's
**Track Archive** panel, find the song, and press **Archive**. That writes
`archived = true` to its row under your admin session: hidden from `/sound/`
immediately, still on the city as a do-not-rescrape tombstone. **Restore** puts it
back. Add a replacement if the tape would otherwise have fewer than 15 active
songs.

Editing a song's text (a bad blurb, a wrong `spotify_id`) means a direct UPDATE on
`public.soundtrack_songs` — the Supabase table editor, or PostgREST with an admin
token. There is no field editor on the dashboard yet.

`sound/soundtracks.json` is **not** where you make a change. It is the offline
fallback `/sound/` reads when Supabase is unreachable, and it goes stale the
moment anything is written to the tables. Refresh it with **Download JSON** in the
Tape Room and commit the result; that is its only maintenance.

After any edit, load `/sound/` and play the tape you touched.

---

## When something looks wrong

| Symptom | Likely cause |
|---|---|
| A song will not play | The `spotify_id` is wrong or the track was pulled. Null the column (keep title and artist) and the player falls back to search. |
| A city is missing from `/sound/` | No row in `public.soundtracks`, its tape is `archived`, it has zero active songs, or the city is `hide_from_soundtracks` in `public.cities`. |
| A city shows a slug instead of a name | It is not in `public.cities`. Add it there for the display name and geo badge. |
| Runs keep topping up but never add a new city | The agent could not read `public.cities`. Either it used WebFetch (which 403s for this host — use curl) or the host fell off the environment's network allowlist (`403 to CONNECT`). See step 1 above. |
| A tape is full of songs with no tie to the city | Generic arena anthems dressed up with local blurbs. Check the team-song pairing; archive wrong-city songs in this city, then add replacements or move the active song to the city whose team actually plays it. |
| A tape got shorter after a run | Someone archived without replacing. The run itself cannot shorten a tape — it can only insert. |
| A run reported 15 songs but the tape has fewer | The RPC skipped duplicates. Its result rows say which and why; a song already on the tape, active or archived, is silently not re-added. |
| `/sound/` shows old tapes and new ones are missing | The Supabase fetch failed and the page fell back to `sound/soundtracks.json`. Check the browser console and the Supabase project; the file is expected to be stale. |
| "Last run" on the dashboard is over a day old | A run failed, or the routine is paused. Open the routine and read the transcript. |
| Two tapes appeared in one day | Something else is writing too — check the old GitHub workflow was not recreated. |

---

## Notes for agents

- `public.tgb_pull_soundtrack_songs` is the **only** write path you need. Do not
  write the tables directly, do not use a service-role key, do not edit
  `sound/soundtracks.json`, and do not create a third table, per-city HTML,
  `city-playlists.json`, `song-playlists.json`, or a build script — all of those
  existed once and were deliberately removed.
- Song suggestions arrive at `soundtrack@thegamebureau.com`. Treat them as leads,
  never as verified facts.
- Verify after writing, by re-reading `soundtrack_stats`: 15 active songs on both
  tapes you touched, artist cap intact, every added song accounted for in the
  RPC's result rows.
- You cannot remove or archive a song, and that is deliberate. Archived rows are
  city-specific do-not-rescrape tombstones: hidden from `/sound/`, ignored by
  counts, and still blocking future title + artist reuse in that city. Name what
  needs retiring in your summary and a human does it.
- If you cannot verify a Spotify ID, **omit it**. Omitting is always correct;
  guessing never is.
- Say plainly in your summary which songs you could not verify. A quiet gap is
  worse than a flagged one.
