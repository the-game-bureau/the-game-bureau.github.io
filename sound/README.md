# City Soundtracks

**If you are an AI agent working on soundtracks, read this first.** It is also
the plain-English explanation for anyone else. The dashboard at
[`/sound/admin/`](admin/index.html) is the human view of the same system; this
file is the source of truth.

---

## What a soundtrack is, and why it exists

Every city we run games in gets a **cassette tape** on [/sound/](https://thegamebureau.com/sound/):
15 songs that sound like that place. Hometown artists, songs that name the
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

| Thing | Where | Notes |
|---|---|---|
| The songs | `sound/soundtracks.json` | The only file the public page reads for tracks. Edit this to change a tape. |
| City names + geo badges | `public.cities` (Supabase) | Optional polish. If the fetch fails the page still renders from the JSON alone. |
| The public page | `sound/index.html` | Builds the cassette cards at runtime. |
| The dashboard | `sound/admin/index.html` | Last run, links to the routine, manual fallback prompt. |

One entry per city:

```json
{
  "city_slug": "new-orleans",
  "spine_tag": "Soul Mix",
  "songs": [
    {
      "title": "Do Whatcha Wanna",
      "artist": "Rebirth Brass Band",
      "spotifyId": "4PTG3Z6ehGkBFwjybzWkR8",
      "blurb": "Second-line brass that runs the whole city"
    }
  ]
}
```

- `city_slug` matches a slug in `public.cities`.
- `spine_tag` is the short phrase printed down the cassette spine (`Soundtrack`,
  `Jams`, `Soul Mix`…). Set `spine_tag_position: "before"` only for phrases that
  read ahead of the city name, like `Sounds of`.
- `spotifyId` is a 22-character Spotify track ID. **Optional** — omit it rather
  than guess; the player falls back to a Spotify search for `artist title`.
- `blurb` is 6–10 words, specific to that city.

---

## The rules

These must hold. The daily agent follows them; so should you.

1. **Exactly 15 songs** per city.
2. **Max 2 songs per artist** within a city.
3. **No duplicate title + artist** pair within a city.
4. Every song has a **title, an artist, and a 6–10 word blurb**.
5. `spotifyId`, when present, is **exactly 22 alphanumeric characters**, verified
   against a real `open.spotify.com/track` page. **Never invent one** — a
   fabricated ID is 22 characters like any other, passes every format check, and
   silently plays nothing.
6. `"explicit": true` only when Spotify marks the track explicit; otherwise omit
   the field.
7. Entries stay **sorted by `city_slug`**.
8. **No tapes for venue-only cities** — rows in `public.cities` with
   `ignored = true` (Orchard Park, Santa Clara) are stadium towns, not places we
   sell into.
9. Real, commercially available recordings only. No karaoke, tribute, sped-up,
   slowed, or re-recorded versions.

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
- **Local scenes and labels** — the sound a city is known for making.

---

## What happens every morning

A **scheduled Claude Code cloud agent** runs at 15:00 UTC — 10 AM Central in
summer, 9 AM in winter, because cloud cron has no daylight-saving shift.

1. Reads `public.cities` and `sound/soundtracks.json`.

   > **Read the catalog with `curl`, not WebFetch.** Settled 2026-07-28 by
   > testing both against the same host:
   >
   > ```bash
   > curl -sS "https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/cities?select=slug,city,ignored&order=city.asc&apikey=<publishable key>"
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
   > say plainly in the summary and the commit message that the catalog was
   > unreachable.
2. Picks the **alphabetically first city with no tape**, plus the **emptiest
   existing tape**.
3. Researches songs and verifies every Spotify ID by web search.
4. Writes `sound/soundtracks.json` and commits straight to `main`.

- Routine `trig_014sqaUyU7557svq9mGA1E4a` —
  [open it](https://claude.ai/code/routines/trig_014sqaUyU7557svq9mGA1E4a)
- Model: Claude Opus 5
- From that page you can watch a run, trigger one early, change the schedule, or
  pause it.
- **The routine's stored prompt still tells the agent to reach the catalog with
  WebFetch "not curl", and an agent cannot edit it** — the routine was created
  through the HTTP API, so `update_trigger` refuses. That instruction is
  backwards (see step 1). The prompt does carry a curl fallback, so a run still
  gets there on the second try, but a human should open the routine and flip
  that paragraph. Until someone does, the prompt and this file disagree on that
  point; **this file wins**, which the prompt itself says.

It replaced a GitHub Actions workflow on 2026-07-27. That version needed a
funded Anthropic or OpenAI API key and neither account had credit, so every run
failed on a billing error. The routine bills against the Claude subscription
instead. **Do not recreate the workflow** — and if you ever do, do not leave both
running or you will get two tapes a day.

---

## Doing it by hand

The dashboard carries a paste-ready prompt for running a tape out of band. You
can also just edit `sound/soundtracks.json` directly — it is plain JSON and the
page reads it as-is.

After a hand edit:

```bash
node -e "JSON.parse(require('fs').readFileSync('sound/soundtracks.json','utf8'))"
```

then load `/sound/` and play the tape you touched.

---

## When something looks wrong

| Symptom | Likely cause |
|---|---|
| A song will not play | The `spotifyId` is wrong or the track was pulled. Delete the ID (keep title and artist) and the player falls back to search. |
| A city is missing from `/sound/` | No entry in `soundtracks.json`, or its entry has zero songs. |
| A city shows a slug instead of a name | It is not in `public.cities`. Add it there for the display name and geo badge. |
| Runs keep topping up but never add a new city | The agent could not read `public.cities`. Either it used WebFetch (which 403s for this host — use curl) or the host fell off the environment's network allowlist (`403 to CONNECT`). See step 1 above. |
| "Last run" on the dashboard is over a day old | A run failed, or the routine is paused. Open the routine and read the transcript. |
| Two tapes appeared in one day | Something else is writing too — check the old GitHub workflow was not recreated. |

---

## Notes for agents

- `sound/soundtracks.json` is the **only** file you need to write. Do not create a
  Supabase soundtracks table, per-city HTML, `city-playlists.json`,
  `song-playlists.json`, or a build script — all of those existed once and were
  deliberately removed.
- Song suggestions arrive at `soundtrack@thegamebureau.com`. Treat them as leads,
  never as verified facts.
- Verify before committing: valid JSON, 15 songs, artist cap, no duplicates,
  well-formed IDs, alphabetical order.
- If you cannot verify a Spotify ID, **omit it**. Omitting is always correct;
  guessing never is.
- Say plainly in your summary which songs you could not verify. A quiet gap is
  worse than a flagged one.
