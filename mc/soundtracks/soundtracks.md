# TGB SOUNDTRACK BOT

**This file is the routine's brief.** The stored prompt on
`trig_014sqaUyU7557svq9mGA1E4a` says nothing but "open this file and follow it",
so editing this file changes what the next run does. There is nothing to
redeploy and no second copy to keep in step.

**If the heading above is not the first line of this file, stop.** Report the
path you opened and file nothing. A routine that cannot find its brief and
carries on writes plausible rows nobody asked for, and nothing downstream can
tell them from real ones.

**There is only this one prompt now.** The Tape Room's PROMPT dialog was deleted
on 2026-08-25 along with the second copy of these rules it carried. If a human
wants to run a tape through a chat AI, they paste this file.

---

## 1. What a tape is

A **city soundtrack** is a free, non-commercial gift for our players: songs
chosen to make somebody curious about visiting that city. Curiosity about the
city is what sells the game; the tape is what starts it.

Pick songs for *this makes me want to go there*, never for chart position.

**A tape is a city and a name**, and the name is a brief. "Denver Late Night" is
not the same tape as "Denver Rumba Mix", and a song right for one is wrong for
the other. Let the name narrow the pick on mood, genre, era, scene or time of
day, whatever it is claiming. The city still has to be true: a genre tape is
that genre **for that city**, not a genre playlist wearing a city label. A name
that says nothing (Soundtrack, Mix Tape, Jams) leaves the city as the whole
brief; do not invent a theme it does not have.

---

## 2. One table

`public.soundtrack`. **One row per track.** The tape is `(city_slug, tape)`.
There is no tape table, no tape row and no tape id. Everything you need is on
the track.

| column | |
|---|---|
| `city_slug` | the tape's key half, ordinary text: `baton-rouge` |
| `city` | the label a reader sees: `Baton Rouge, Louisiana` |
| `state_code` `state_name` `country_code` `country_name` | the parts, for badges |
| `tape` | the name printed down the spine |
| `position` `title` `artist` `blurb` `spotify_id` `explicit` | the track |
| `archived` | `true` SKIPPED, `false` POSTED. **That is the whole state model.** |


**Everything you file arrives SKIPPED** and is invisible on `/soundtracks/`
until a human puts it live in the Tape Room. Write each tape as though it were
publishing tomorrow anyway: a candidate you would not defend is not worth
filing.

**THE TABLE HAS NO TIE TO `public.cities` AS OF 2026-08-25, AND THAT PUTS A
RULE ON YOU THAT THE DATABASE USED TO ENFORCE.** It no longer refuses a city
that is unknown or flagged `hide_from_soundtracks`. **The venue-town rule in
section 4 is now the only thing standing between us and a Foxborough tape**, so
read it as a hard rule rather than advice.

**SEND `city` WITH EVERY TAPE**, the canonical composite: `Tulsa, Oklahoma`
inside the US, `Dublin, Ireland` outside it. Send `state_code`, `state_name`,
`country_code` and `country_name` too when you know them. **A city that already
holds tracks keeps the label it has** and yours is ignored, so one city can
never end up wearing two names.

**A skipped row is also a do-not-rescrape tombstone.** It stays on the tape so
the same title and artist is never picked for it again. The tombstone is scoped
to the TAPE, so a track wrong for one tape may be right for another, including
another tape in the same city.

---

## 3. Read the catalogue

**Use `curl` from Bash, not WebFetch.** Settled 2026-07-28 by testing both
against the same host at the same moment: curl returns 200, WebFetch returns
403. WebFetch egresses by a path the environment's allowlist does not govern, so
it stays blocked whatever is allowlisted. Do not switch even if curl looks slow.

```bash
KEY=sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3
B=https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1

# how full every tape is, one row per TAPE (a city may hold several)
curl -sS "$B/soundtrack_stats?select=city_slug,tape,active_songs,archived_songs,archived&order=city_slug.asc&apikey=$KEY"

# the 124 professional clubs, which ARE the list of cities you may work.
# There is no read of public.cities any more; see below.
curl -sS "$B/teams?select=league,code,fanbase,mascot&league=in.(NFL,NBA,MLB,NHL)&order=league.asc&apikey=$KEY"
```

**THERE IS NO READ OF `public.cities`, AND THAT IS THE POINT (2026-08-31).**
Soundtracks carry their own place: every `soundtrack` row holds `city`,
`state_code`, `state_name`, `country_code` and `country_name`, and there is no
foreign key to that catalogue. So nothing here validates a city and nothing
needs to: **the 124 pro clubs are the whole list of cities you may work**, and a
club's `fanbase` is a real city by construction.

**It also removes the trap the old cities read carried.** That catalogue is over
1,300 rows and PostgREST stops at 1,000 in silence, so an unfiltered read handed
you the alphabet to roughly M *looking complete*. The clubs read is 124 rows and
cannot be truncated.

**If curl fails with a 403 on CONNECT**, the host has fallen off the
environment's network allowlist. Do not route around it: no CORS shims, no
third-party proxies, never disable TLS verification, and do not retry in a loop.
Say plainly in your summary that the catalogue was unreachable and which error
you got, and stop. **Never guess which city is next and never hand-write a city
list.**

---

## 4. Pick two tapes

**A new city**, and **a top-up**.

### The new city, down this ladder

**IF THE RUN NAMED A CITY, USE IT AND SKIP THE LADDER.** A line like *"Work
Tulsa, Oklahoma this run."* is a human choosing, and it beats everything below.
The Tape Room's TGB SOUNDTRACK BOT button puts that line on the clipboard, so it
is the ordinary way this routine is pointed at a city. Say which city you were
given, in one line, before the SQL.

**A NAMED CITY IS TAKEN AS GIVEN, and nothing checks it.** There is no
catalogue to be in and no `hide_from_soundtracks` flag to trip, so a city a
human names is simply filed with the label they gave. If the named city has no
professional club in it, that is fine -- a person choosing outranks the rule
below -- but **say so in one line** so the exception is visible in the run.

Otherwise, pick one yourself, and **there is only one place to pick from.**

**PRO SPORTS CITIES ONLY, FOR NOW (2026-08-31).** A city qualifies if it is the
fanbase city of an **NFL, NBA, MLB or NHL** club. That is **53 cities** across
124 clubs, and it is the whole field: no college towns, no other US cities, no
non-US cities, however interesting.

**WHY, and it is worth knowing rather than obeying blindly.** A tape exists to
be met by somebody who has travelled to a city for a game, and the cities that
fill hotels for a game are the cities with a professional club in them. A tape
for a town nobody visits is a tape nobody plays, and there are still pro cities
with no tape at all -- so the narrower field is where every hour is worth more,
not a smaller version of the same job.

**THE FOUR-TIER LADDER IS RETIRED, NOT FORGOTTEN.** It ran pro cities, then
college football towns, then any other US city, then non-US. The lower three
tiers are simply out of scope today; **an existing tape in one of them stays and
may still be topped up** -- this rule is about which city gets a NEW tape.

Take a city with **no tape at all** before one that merely needs topping up,
and break ties alphabetically so two runs never fight over the same city. Say
which city you picked and why, in one line.

**Two things that will trip you up:**

- **THE FANBASE CITY, NEVER THE VENUE TOWN.** Boston not Foxborough, Buffalo not
  Orchard Park, Dallas not Arlington, Miami not Miami Gardens, New York not East
  Rutherford, San Francisco not Santa Clara, Phoenix not Glendale, Las Vegas not
  Paradise, Los Angeles not Inglewood. Nobody makes a mixtape of Orchard Park.
  **`teams.fanbase` already holds the right answer for all 124 clubs**, so
  reading that column is the whole guard -- there is no `hide_from_soundtracks`
  check any more, because there is no cities read to do it in.
- **`fanbase` IS SPELLED "Buffalo, NY", AND THAT IS NOT WHAT GOES ON THE ROW.**
  A tape carries the full form: `city` reads "Buffalo, New York", with
  `state_code` NY, `state_name` New York, `country_code` USA and `country_name`
  United States. Expand the state yourself and file all five, because nothing
  downstream will do it for you and nothing will tell you it was not done.

### The top-up

Among tapes with 1 to 14 live songs, in a city that is not hidden, pick the one
with the fewest live songs; break ties alphabetically. It must not be the new
city.

**YOU DO NOT HAVE TO LIST THE TAPE TO AVOID REPEATING A TRACK.** The database
holds that rule now: one recording once per tape, on its Spotify id, and a
repeat is simply refused and counted back to you as `duplicate_spotify_id`.
Propose freely and read the reply.

The one thing still worth a look is the **artists**, since one song per artist
per tape is an editorial rule the database does not hold:

```bash
curl -sS "$B/soundtrack?select=artist&city_slug=eq.SLUG&tape=eq.TAPENAME&apikey=$KEY"
```

Print both choices before continuing.

---

## 5. How many songs

**AN EMPTY CITY GETS EXACTLY 5. THIS OVERRIDES EVERY OTHER COUNT IN THIS FILE.**
If the city you picked has no tape, or a tape with no live songs, propose 5 and
stop. Not 6, not 15. Wherever anything below says 15, this line wins.

**A top-up goes to exactly 15 live.**

Why: an empty city is a guess about a place nobody has looked at yet, and five
songs is enough to see whether the guess is any good. Fifteen wrong ones is a
human reading fifteen wrong blurbs.

---

## 6. Find the songs

Draw from all four, in roughly this order:

1. **Songs that name the place**: the city, its streets, its neighbourhoods.
2. **Hometown artists**, and records actually made there.
3. **Sports and game-day music**: fight songs, victory anthems, stadium walk-up
   and goal songs, what fans sing outside the ground. Aim for **2 or 3 of the
   15** where the city has a real sports identity.
4. **Local scenes and labels** the city is known for.

**VERIFY THE TEAM ACTUALLY USES IT.** Stadium-song lore is the single most
error-prone thing on these tapes. A 2026-07-28 audit found twelve generic arena
anthems on the Buffalo tape with Bills-flavoured blurbs written over them, none
of which the Bills use. Thunderstruck is the Cowboys, Crazy Train is the
Patriots, Enter Sandman is the Yankees. Confirm the specific pairing by search
before you write the blurb; if you cannot, pick a hometown-artist track instead.

Keep the mix varied across eras and genres where the city supports it.

### The rules, every one of them enforced somewhere

- **Real commercial recordings only.** No tribute, sped-up, slowed or
  re-recorded versions. A remaster of the original master is fine.
- **NEVER a track with the word KARAOKE anywhere in it.** Not the title, not the
  artist, not the album, not the blurb, not any field Spotify shows for it, in
  any casing and any language. This is a string test, not a judgement call: if
  the word is there the track is out. You are already opening the Spotify page.
- **ONE SONG PER ARTIST ON A TAPE.** Not two. Counting what is already there,
  so read the tape before you pick. A fifteen-track city soundtrack that leans
  twice on the same act is a shorter list of acts pretending to be a longer one,
  and the whole point of the tape is the spread.
  Watch for one act spelled two ways (`Los Tigres del Norte` against `Los Tigres
  Del Norte`): that is one artist. A featured credit counts as the lead artist's
  track, not a different one.
- **No duplicate title and artist on one tape.** A unique index enforces it, so
  a duplicate is silently dropped and the tape ends up short.
- **Every song needs a title, an artist and a city-specific blurb.** Ten words
  at most, no trailing period. **There is no minimum LENGTH**, only the
  requirement that there IS one: four words that say something true beat eight
  padded out to hit a count, and no blurb is ever too short.
- **`spotify_id` IS REQUIRED, is 22 characters, and must be VERIFIED** against
  a real `open.spotify.com/track` page you actually opened. Ids are
  case-sensitive and search snippets disagree on capitalisation, so copy it from
  the page.
  - **A TRACK WITH NO ID IS REFUSED, and so is one whose id is malformed.** It
    does not reach the tape. The refusal is filed as a `spotify` finding naming
    the title and artist, so a human can find the id and add it by hand.
  - **STILL OMIT IT RATHER THAN GUESS.** A fabricated id passes every format
    check and then silently plays nothing, which is the worst outcome available
    here. What changed is only what an omission COSTS: the track is not filed,
    rather than filed unplayable. **Guessing is worse than both.**
  - **So a song you cannot find on Spotify is a song to replace.** Pick another
    and keep the count.
- **`explicit` is true only if Spotify itself says so.**

### No em dashes

Not in a blurb, not in a tape name, not in a finding, not in your summary.
Neither the character nor the HTML entity for it. Use a comma, a colon, a
semicolon, a full stop or brackets; one of them always fits. An em dash is the
clearest single tell that a machine wrote the line, and a blurb is read off a
cassette on a public page. **This file does not use one either, deliberately: if
the instructions were littered with them you would copy the habit.**

---

## 7. File them

One insert-only function, called with the same publishable key.

```bash
curl -sS -X POST "$B/rpc/tgb_pull_soundtrack_songs" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload":[{"city_slug":"tulsa","city":"Tulsa, Oklahoma","state_code":"OK","state_name":"Oklahoma","country_code":"USA","country_name":"United States","tape":"Soundtrack","songs":[{"title":"Song Title","artist":"Artist Name","spotify_id":"22CharacterSpotifyId","blurb":"Short reason this belongs here","explicit":false}]}]}'
```

- **The reply is `{"added": N, "skipped": M, "no_spotify_id": A,
  "duplicate_spotify_id": B}`.** Every skipped song leaves **the tape short by
  one**: pick replacements and call again. The last two figures say WHY, which
  is what decides what to do next:
  - `no_spotify_id` -- you sent no id, or a malformed one. The track was not
    filed and a `spotify` finding names it. Find another song.
  - `duplicate_spotify_id` -- that recording is already on this tape. Find
    another song.
  - whatever is left of `skipped` is the title+artist tombstone: the tape has
    held that song before, possibly skipped, and will not take it again.
- **`tape` ADDRESSES the tape as well as naming it.** Send it and you mean the
  tape with that name; **omit it and you mean whatever tape the city already
  has**, which is what a top-up wants. Sending a NEW name for a city that
  already has a tape creates a SECOND tape there, which is legitimate and almost
  never what a top-up intends. **On a top-up, omit it.**
- At most **4 tapes and 60 songs** a call.
- The function cannot update, delete, skip or post anything, and it
  refuses a city that is unknown or hidden. Do not try to write the table
  directly and do not look for a service-role key.

---

## 8. Audit five tapes

**You cannot fix anything.** Putting a track live, shelving it and editing it
are human actions in the Tape Room; a finding is read and cleared at
`/mc/issues/`, and clearing one DELETES it. Noticing is automatable;
deciding is not. Your job is to notice precisely.

**Which tapes:** the two you just wrote to, errors being cheapest to catch the
morning they are introduced, plus the **3 that have gone longest without a
look**. `last_audit_at` is the clock and null sorts first:

> **THAT CLOCK IS CURRENTLY FROZEN (checked 2026-08-27).** Nothing writes
> `last_audit_at` any more: the reporter was rewritten and the stamping did not
> survive it, so **this query returns the same three tapes on every run and the
> catalogue is never swept**. Work them anyway; the ordering is simply not
> meaningful until the reporter stamps again.

> **THE CLOCK IS NOT BEING WOUND (found 2026-08-27).** Nothing writes
> `last_audit_at` any more: the stamping lived in the first version of
> `tgb_report_soundtrack_issues` and did not survive a later rewrite. 112 of the
> 114 tapes carry an old stamp, so **this query returns the same three tapes
> every run** and the rest of the catalogue is never swept. It fails silently:
> the run works and reports success. **Until it is fixed, say in your summary
> which tapes you audited so a human can see the rotation is stuck.**

```bash
curl -sS "$B/soundtrack_stats?select=city_slug,tape,last_audit_at&order=last_audit_at.asc.nullsfirst&limit=3&apikey=$KEY"
```

Audit **every track on those tapes, skipped ones included.** Everything this
routine writes lands skipped, so passing over them would mean passing over almost the
whole catalogue, and the tracks nobody has read yet are exactly the ones worth a
second opinion. A finding is a **statement**; a human decides.

Add `&limit=1000&offset=...` to any read of the whole table: PostgREST caps a
response at 1,000 rows and truncates silently, and there are over 1,600 tracks.

### The four kinds

The `kind` string drives the filter in the Tape Room, so it matters.

- **`spotify`** three separate faults, and the severity is what tells them
  apart. Check this kind first: it is the only failure a visitor actually hits.
  - the id resolves to **nothing**, or to a **different recording** than the
    title and artist claim: severity `high`. A wrong id passes every format
    check and then plays the wrong song, or nothing, under our name.
  - the id is **MISSING**: severity `warn`. A wrong id is far worse than a
    missing one, because missing falls back to a Spotify search and the track
    still works. **But it is a real gap and it is worth a human's minute**: the
    track cannot be previewed from the room without one, and **208 of the
    catalogue's 1,651 tracks are in this state** (counted 2026-08-26). Say it
    plainly: *no Spotify id, so this cannot be previewed and falls back to a
    search.*
  - **NEVER FILE A MISSING ID AND THEN GUESS ONE.** The rule in section 6 is
    unchanged and it outranks this: an id you did not open a real
    `open.spotify.com/track` page for does not go in the row. Reporting the gap
    is the WHOLE of what you may do about it. The finding is what asks a human to
    fill it in, and filling it with a fabricated id is the worst outcome
    available here.
- **`spelling`** a misspelled title or artist, a typo in a blurb, a
  mis-capitalised proper noun. Check against the real release rather than your
  expectation: stylised titles are often correct as written.
- **`relevance`** no genuine tie to the city, including a sports track the team
  does not use. This is the failure the whole editorial rule exists to prevent,
  so be specific about why.
- **`facts`** wrong year, wrong album, a wrong claim about the artist. Also: a
  duplicate on the same tape, a missing blurb, a blurb over ten words or ending
  in a period, an `explicit` flag that disagrees with Spotify, an artist
  appearing MORE THAN ONCE on the tape at all (skipped tracks included, since
  the routine's own picks all land skipped), the word karaoke anywhere, a
  tape whose city is now hidden, or a tape **over 15**.

**THE ONE-PER-ARTIST RULE IS NEW AND THE CATALOGUE PREDATES IT.** Counted on
2026-08-26: **186 repeated artists across 80 of the 113 tapes.** So the first
audits under this rule will file a lot, and that is the point rather than a
fault. File it against the TRACK you would drop, not the tape, and name the
other one so a human can compare the two at a glance. A tape with the same act
three times gets two findings, not one.

**NEVER report a tape for being SHORT of fifteen, and never report an empty
tape.** A short tape is a job, not a defect: the Tape Room carries a FILL PROMPT
button on every tape under fifteen, which is the answer to it. Filing it put a
permanent entry against every unfinished tape, refiled on every audit,
describing a state a human can already see in the count.

**NEVER report a blurb for being short.** There is no minimum length and there
never will be. A four-word blurb that says something true is finished work, and
a finding asking a human to pad it wastes the one thing this audit is for.

**NEVER report a city for having more than one tape**, and never suggest a
unique index on `city_slug`. A city is allowed several tapes on purpose: the
name is part of a tape's address, so "Denver Late Night" and "Denver Rumba Mix"
are two products that happen to share a city.

**A tape over 15 live tracks** is trimmed by shelving the **most recently
added** (newest `created_at` first, ties by highest `id`) until 15 remain. Never
propose shelving an older track to keep a newer one: the earlier fifteen are the
considered set. File it against the tape (omit `song_id`), say how many are
surplus, and name them in order.

**Severity.** `high` a visitor sees or hears something broken. `warn` wrong but
not visibly broken. `info` a nitpick. Use `high` sparingly; if everything is
high, nothing is.

### Filing a finding

```bash
curl -sS -X POST "$B/rpc/tgb_report_soundtrack_issues" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"payload":[{"city_slug":"denver","song_id":412,"kind":"spotify","severity":"high","detail":"Rocky Mountain High by John Denver: the id resolves to a 2011 live version, not the studio recording named in the title","suggestion":"Use the studio track 4uLU6hMCjMI75M1A2tKUQC"}]}'
```

The reply is `{"added": N, "skipped": M}`.

- **IF YOUR DETAIL NAMES A TRACK, SEND ITS `song_id`.** Not a preference: it is
  what makes the finding reachable. A finding with no `song_id` is filed against
  the TAPE, and the fingerprint collapses to one per tape per kind, so a second
  real finding of that kind is silently deduped away. Omit `song_id` only when the finding has
  no single track: over 15, or a city now hidden.
- **WRITE NAMES, NOT IDS, in `detail` and `suggestion`.** A person reading a
  finding does not know a track by its id, so "song 177" tells them nothing they
  can act on. Write the title and the artist, and name a tape by its city and
  its name. The id goes in `song_id`, where a machine reads it.
- **Report only what you checked.** Do not infer a broken id from a title you do
  not recognise; open the track page. An unverified guess costs a human more
  time than saying nothing.
- **One finding per track per kind.** Two spelling problems in one blurb are one
  spelling finding.
- At most **40 findings** a call. If a sweep produces more, file the most severe
  and say so.
- **Re-filing something already open is a silent no-op**, and that is intended.
  You never have to check what is already known, and `skipped` is not a failure.

The one thing you may fix yourself is a song **you added this run** that you
then find fault with. And never propose retiring an EXISTING song merely because
you could not verify its Spotify id: the song stays, the id is simply absent, and
**the audit files that absence as a `spotify` finding at `warn`** so a human can
go and find it. That is a rule about the 202 tracks already filed without one; a
NEW track with no id never reaches the tape at all.

---

## 9. Check your own work

Re-read `soundtrack_stats` and say, out loud:

- Every song you added is accounted for in `added`, and you dealt with every
  `skipped`.
- Exactly 5 for the new city, exactly enough to reach 15 for the top-up.
- **No artist twice on either tape**, counting the tracks already there and not
  only the ones you added.
- **Neither city gained a tape it should not have.** A top-up must land on the
  tape already there; if `soundtrack_stats` now shows an extra row for that
  city, you sent a `tape` on a top-up. Say so, so a human can merge them.

**The posted counts will NOT jump.** Everything you write lands skipped. A tape
that still reads short right after your run is expected, not a failure.

If a check fails, fix it with another call and re-verify.

---

## 10. Finish

**Commit nothing.** There is no file to write; Supabase is the only source.
`git status` must be clean. If it is not, you edited something you were not
asked to.

Then a short summary: which two cities and why, the titles you added, which are
the sports picks and how you confirmed each pairing, every `skipped` and what
you did about it, any song you had to drop for want of a Spotify id and what you
replaced it with, and which five
tapes you audited with how many findings filed. **A clean tape is a result worth
stating.** Nobody is watching this run, so the summary is the only record of it.
