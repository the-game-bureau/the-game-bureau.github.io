# the-game-bureau — project notes

Durable project knowledge for Claude Code (and any teammate working in this repo). Auto-loaded by Claude Code every session. **Do not put secrets in this file** — it's committed to git and the site is published via GitHub Pages, so anything here is technically reachable on the public web.

---

## READ THIS FIRST

Four short sections, all of them things that have already cost a day. Then a
place for the big picture, then the room-by-room detail that makes up the rest of
this file.

---

## 1. YOU CAN RUN SQL FROM HERE. `supabase db query --linked`.

**This file said for months that every migration goes in by hand, and that was
half right and cost real time.** `supabase db push` IS refused, because remote
migration history has drifted. **`supabase db query` is not, and it executes
arbitrary SQL against production through the Management API**, using a credential
the CLI already has cached. No service-role key, no database password, nothing to
add.

```bash
cd mc                                  # NOT the repo root. See below.
supabase db query --linked --file supabase/migrations/<file>.sql
supabase db query --linked -o table "select count(*) from public.events;"
```

- **`cd mc` FIRST, AND THE FAILURE IS MISLEADING.** From the repo root it says
  *"Cannot find project ref. Have you run supabase link?"*, which reads as a
  missing credential and is really a missing `supabase/` directory.
- **`--linked`, OR IT TRIES localhost:54322** and fails with connection refused,
  which reads as the remote being down.
- **`--file`, NOT AN INLINE STRING, for anything with a function body in it.** A
  `$$ ... $$` block passed as a shell argument comes back echoed and then errors.
  The file form has no quoting layer to lose.
- **It is a real session**, so a `begin; … commit;` file is one transaction and a
  failure rolls the whole thing back, exactly as in the SQL editor.

**SO THE RULE IS: APPLY IT, THEN PROVE IT.** Write the migration, run it, then
run its own Verify block and report the real numbers. **An empty payload proves
nothing**, and this project has been caught by exactly that twice.

**KEEP THE `apply by hand` NOTE IN OLDER MIGRATION HEADERS** rather than sweeping
them: they record how that file was applied on the day, and rewriting them would
be editing history to match a tool that arrived later.

---

## 2. PENDING MIGRATIONS — SQL THAT IS WRITTEN BUT NOT YET APPLIED

**Nothing in `mc/supabase/migrations/` runs itself.** Remote migration history in
this project has drifted, the CLI refuses `db push`, and every migration here is
pasted into the Supabase SQL editor by hand. So a file existing in the repo says
NOTHING about whether the database has it.

**KEEP THIS LIST CURRENT. Add a row when you write a migration; delete the row
the moment it is applied.** A stale entry is worse than none, because the next
person runs something twice or hunts a bug that was fixed hours ago.

| migration | what breaks until it is applied |
|---|---|
| **RE-RUN** [2026081804_walking_tour_pull_rpc.sql](mc/supabase/migrations/2026081804_walking_tour_pull_rpc.sql) | **NO WALKING TOUR CAN BE FILED BY ANYBODY.** The database holds a STALE copy of `tgb_pull_walking_tours` that still writes `waypoints.archived`, a column [2026081806](mc/supabase/migrations/2026081806_waypoints_drop_archived.sql) dropped, so every call dies with `42703`. The repo's file is already correct and is a `create or replace`: running it again simply replaces the stale definition. **TGB PATH BOT has filed no path since 2026-08-20 15:15 because of this.** |
| [2026082106_waypoint_gap_fill_array_fix.sql](mc/supabase/migrations/2026082106_waypoint_gap_fill_array_fix.sql) | **`tgb_fill_waypoint_gaps` throws on every row it would repair** (`22P02 malformed array literal`), so PATH BOT's second job has repaired nothing since it was applied on 2026-08-18. |

**AND IT WAS WRONG AGAIN ON 2026-08-21, IN THE OTHER DIRECTION.** It read
*"none, verified against the database rather than assumed"* while two functions
were broken, because **the probe used was the wrong probe**: calling an RPC with
an EMPTY payload answers `{"filled": 0}` or `{"filed": 0}` and looks perfectly
healthy, since nothing reaches the code that fails. **A function is only proved
by a call that makes it do its job.** Both bugs were found by TGB PATH BOT
hitting them in a real run, not by this table.

**A DROPPED COLUMN DOES NOT UPDATE THE FUNCTIONS THAT WRITE IT.** `2026081806`
dropped `waypoints.archived` and left a `SECURITY DEFINER` function inserting it.
Nothing complains until something calls it. **When you drop a column, grep the
other migrations for its name before you run the drop.**

**THIS TABLE WAS WRONG WITHIN A MINUTE OF BEING WRITTEN**, which is the argument
for it. It listed `2026082003` as pending because that is what the last message
about it had said; the probe below returned 200, `public.partner_venues` was
already gone, and the five partner rows had carried across. **Ask the database,
do not repeat what you were last told.**

**HOW TO TELL, RATHER THAN GUESS.** Ask the database, with the publishable key:

```bash
KEY=sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3
API=https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1
# a column: 200 means applied, 400 with 42703 means not
curl -s -o /dev/null -w "%{http_code}\n" "$API/waypoints?select=partner_status&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
# a function: 200 means applied, 404 with PGRST202 means not
curl -s -o /dev/null -w "%{http_code}\n" "$API/rpc/tgb_partner_coverage" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

**A PAGE THAT NEEDS A MIGRATION MUST NAME IT.** Not a raw `42703` or `PGRST202`:
those are statements about our schema and tell the person at the keyboard
nothing they can act on. Catch it and say which file to run. The Path Builder and
the waypoint editor both do this; copy that pattern.

---

## 2. HOW AN ADMIN PAGE DIES, AND THE TWO CHECKS THAT CATCH IT

**THE FAILURE IS A COMPLETELY BLANK PAGE, WITH THE REASON ONLY IN THE CONSOLE.**
It has happened twice. The mechanism is worth knowing because nothing about it is
obvious from looking at the screen:

1. Every admin room ends with a block of `el('someId').addEventListener(...)`.
2. `el()` is `getElementById`, which returns **null** for an id that is not in
   the markup, and `null.addEventListener` throws.
3. That kills the REST of the block, **including the final `adminAuth.init()`**.
4. `admin-shell.css` hides every child of `body.mc-auth-protected` until
   `init()` adds `.mc-auth-authorized`.

So one dead reference in the wiring takes down the entire room, silently. **A
missing element should cost one button, not the page** — if you touch that block,
consider making it defensive.

**HOW THIS HAPPENS IN PRACTICE:** an edit script inserts the markup, fails a
later assertion, and never writes the file, while a second script adds the
wiring and does write. Half-applied. **After a failed edit, verify what actually
landed before building on top of it.**

**THE TWO CHECKS. Run both after touching any admin page.**

```bash
# 1. Every inline script still parses.
node -e "
const fs=require('fs');const s=fs.readFileSync('mc/pathbuilder.html','utf8');
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
let m;while((m=re.exec(s))){try{new (require('vm').Script)(m[1]);}catch(e){console.log('PARSE FAIL: '+e.message);process.exit(1);}}
console.log('parse OK');"

# 2. Every id the script wires or writes exists in the markup.
node -e "
const fs=require('fs');const s=fs.readFileSync('mc/pathbuilder.html','utf8');
const ids=[...s.matchAll(/el\('([\w]+)'\)\.(addEventListener|textContent|value|disabled|hidden|classList)/g)].map(m=>m[1]);
const missing=[...new Set(ids)].filter(id=>!new RegExp('id=\"'+id+'\"').test(s));
console.log(missing.length?('MISSING FROM MARKUP: '+missing.join(', ')):'all wired ids present');"
```

**Check 1 cannot catch check 2's bug.** The syntax is perfectly valid; the
element simply is not there.

---

## 3. WORKING AGREEMENTS

How to behave in this repo. Every one of these is here because ignoring it cost
something real.

- **NEVER LEAVE AN EMPTY CATCH, AND NEVER A BARE `return` ON A WRITE PATH.** A
  write that fails without saying so is a bug in itself, and it is
  indistinguishable from success. The Tape Room shipped three of these at once.
  Every room has an error channel; use it.
- **TRANSLATE DATABASE ERRORS INTO SENTENCES.** A `23505` becomes "that tape
  already has it, it may be hidden". A `42703` names the migration. A raw
  Postgres code is a statement about our schema, not an instruction to the
  person reading it.
- **PostgREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES A WRITE.** Check
  the returned row, or a refused save reports success and the page shows a value
  the table never took.
- **PROVE THE MATHS BEFORE CLAIMING IT.** Anything with a distance, an order or a
  cost in it gets run against a known geometry first. That is how the loop bug in
  RECALC was found (a duplicate stop is zero metres away, so it was always taken
  as stop 2) and how TUCK IN was shown to beat proximity ranking.
- **`Number(null)` IS 0 AND `isFinite(0)` IS TRUE.** So `isFinite(Number(row.lat))`
  calls an unlocated row located, and a `walkMetres` of 0 means UNMEASURABLE, not
  shortest. Check for null explicitly. This has caused two separate bugs.
- **A SHARED MODULE MAY NOT READ A HOST'S VARIABLE.** It works while there is one
  host and throws on the second. See `WP_FIELDS`.
- **`create or replace` REWRITES THE WHOLE FUNCTION.** A column another migration
  taught it about is not inherited. Check the INSERT list against the table
  before replacing one. The socials pull silently stopped writing `confidence`
  for five days this way.
- **CONSTANTS IN A `SECURITY DEFINER` RPC ARE THE SECURITY.** `status`,
  `archived`, `origin`, `partner_status`: whatever the function hardcodes is what
  makes it safe to expose to `anon`. **Never turn one into a parameter.**
- **THE TRIGGER IS WHAT RUNS; THIS FILE IS A DESCRIPTION OF IT.** Two crons in
  here had silently gone stale. `RemoteTrigger {action: "list"}` before trusting
  any cron written down.
- **A `RemoteTrigger` UPDATE REPLACES `job_config` WHOLE. It does not merge.**
  Exactly the `create or replace` trap, on a different system. Sending
  `job_config` with only `environment_id` and `events` **silently dropped
  `session_context.model` and `session_context.sources`** from TGB SOCIALIZER
  BOT, so the routine lost its model pin and its git repository, and the reply
  came back 200 looking fine. Sending it with only `session_context` then wiped
  the entire prompt. **Always GET first, and send every key back**, and re-GET
  afterwards to confirm what actually survived rather than trusting the 200.
  A cron-only change is safe: `cron_expression` is a top-level field, not part
  of `job_config`.
- **A TRIGGER ID DOES NOT SURVIVE A DELETE.** Anything holding one has to be
  repointed, and a stale one in an `href` 404s silently. Prefer disabling to
  deleting.
- **DELETE A ROOM'S DOORS IN THE SAME COMMIT AS THE ROOM.** GitHub Pages serves
  no 301, so every move here is a hard break: the nav entry, the hub card, the
  `room-blurbs.js` key, and any routine prompt that names the path.
- **WRITE THE REASON, NOT THE CHANGE.** The next reader can see what the code
  does; what they cannot see is what was tried before and why it lost. That is
  what most of this file is.

---

## 4. WHERE EVERYTHING IS

| room | file | tables | routine |
|---|---|---|---|
| **Tape Room** | [mc/soundtracks/index.html](mc/soundtracks/index.html) | `soundtracks`, `soundtrack_songs`, `soundtrack_issues` | TGB SOUNDTRACK BOT |
| **Gift Shop** (the room) | [mc/gifts/index.html](mc/gifts/index.html) | `gift_shop_items`, `gift_shop_listings` | TGB GIFT SHOP BOT |
| **Socializer** | [mc/socializer/index.html](mc/socializer/index.html) | `socials` | TGB SOCIALIZER BOT |
| **Path Builder** | [mc/pathbuilder.html](mc/pathbuilder.html) | `waypoints`, `paths`, `path_stops` | TGB PATH BOT, TGB WAYPOINT BOT |
| **Green Room** | [mc/greenroom.html](mc/greenroom.html) | `guides` | none |
| **Cities** | [mc/data/cities.html](mc/data/cities.html) | `cities`, `countries` | none |
| **Anchor Events** | [mc/events/index.html](mc/events/index.html) | `anchor_events` | TGB ANCHOR EVENTS (name only; see its note) |
| **Teams** | [mc/data/teams.html](mc/data/teams.html) | `teams` | none |
| **Stop Builder** | [mc/_stops.html](mc/_stops.html) — PARKED | `stops`, `challenges` | none |
| **Mission Control** | [mc/index.html](mc/index.html) | `admin_access_requests` | none |

**PUBLIC pages** are at the repo root: `games/`, `gifts/`, `highlights/`,
`soundtracks/`, `index.html`, and the shared chrome in `shell/`. **Everything
else lives under `mc/`**, and the rule for anything new is: if a visitor is not
served it, it goes in `mc/`.

**SHARED MODULES**, which exist because this repo has lost to copy-and-drift
three times:

| file | holds |
|---|---|
| [mc/assets/waypoint-editor.js](mc/assets/waypoint-editor.js) | the waypoint editor dialog, Fill, and `waypointNameEl` |
| [mc/assets/waypoint-geo.js](mc/assets/waypoint-geo.js) | Plus Codes, Nominatim, the walk solver. **No DOM** |
| [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) | the six AI prompts. **The text is the product** |
| [mc/assets/geo.js](mc/assets/geo.js) | city/state/country parsing, `TgbGeo` |
| [mc/js/room-blurbs.js](mc/js/room-blurbs.js) | each room's one standing sentence |
| [mc/js/admin-nav-menu.js](mc/js/admin-nav-menu.js) | the nav, and the hub's directory cards |
| [mc/js/admin-shell.css](mc/js/admin-shell.css) | the shared room header and every dialog's look |

**THE SIX ROUTINES** and their triggers are in the schedule table further down.
`RemoteTrigger` or `/schedule` edits them from here; you never have to open the
website.

---

## 5. THE BIG PICTURE

**We build live action, real world games.** Not an app you play at home. You walk
somewhere, you stand in front of a real thing, and you work something out.

### The shape of the business, in the order it happens

1. **START WITH A CITY.** Every game is somewhere specific. The city comes first
   and everything else is chosen to fit it.
2. **AN ANCHOR EVENT BRINGS PEOPLE THERE.** A match, a concert, a convention, a
   festival. We do not create the reason to travel; we find the reason that
   already exists and put a game next to it. That is what `public.anchor_events`
   holds, and it is why that table is not a sports table: the event is whatever
   filled the hotels.
3. **THE GAME IS PLAYED THE DAY BEFORE THE ANCHOR EVENT.** Visitors are already
   in town, with an afternoon and an evening and nothing booked. That day is the
   product's whole window.
4. **THEY BUY A GAME** and play it whenever they like. **We suggest a start
   time**, and the suggestion is doing real work: it is not scheduling, it is
   what makes several groups finish at roughly the same moment.
5. **SO THAT LIKE-MINDED PLAYERS MEET UP AT THE END.** The end of the game is a
   room with other people in it who have just done the same thing.

**POINT 5 IS WHY THE PARTNER PROGRAMME EXISTS**, and it is worth saying plainly
because the partner work reads as a side quest otherwise. A partner is a bar or
brewery that will host visiting fans; the reason we want one is that the game has
to END somewhere, with a drink and other players. `partner_kind = 'game_end'` is
the default because ending a game is the job. The suggested start time and the
partner venue are two halves of the same idea.

**IT ALSO EXPLAINS THE SUGGESTED-START-TIME RULE ELSEWHERE IN THIS FILE.** Any
feature that lets a group drift off the common schedule quietly costs the thing
in point 5.

### The vocabulary, in the order it nests

**A GAME consists of a PATH.**
**A PATH consists of WAYPOINTS.**
**A WAYPOINT plus a CHALLENGE is a STOP.**
**The text after a solved challenge is a DIRECTION.**

- A **CITY** is where a game happens.
- An **ANCHOR EVENT** is the real-world thing that brought people to that city.
  Ours is played the day before it. `public.anchor_events`.
- A **GAME** is what somebody buys. `public.games`.
- A **PATH** is the route it walks. `public.paths` plus `public.path_stops`.
- A **WAYPOINT** is a real place: name, address, coordinates, a source that says
  it is worth standing in front of. One row per place, ever. `public.waypoints`.
- A **CHALLENGE** is the playable content: a question, a minigame, a photo, a
  freeform answer. Reusable, so one challenge can sit at many stops.
  `public.challenges`.
- A **STOP** is a waypoint plus a challenge. It is the unit a player actually
  experiences. `public.stops` today, keyed by city; see the parked Stop Builder
  note for why that is wrong and what replaces it.
- A **DIRECTION** is what a player is given after solving a challenge: the
  feedback on what they just did, and the information that leads them to the next
  waypoint. **It is the connective tissue of the whole walk** and the only part
  of a game that is about the space BETWEEN two stops.

### THE PERIPHERY: FOUR THINGS THAT HANG OFF THE CORE

The nouns above are the product. **These four are not**, and knowing that is what
keeps them in proportion: they attach to a city or to a game, they support the
thing being sold, and none of them is on the critical path to somebody buying and
walking a game.

| periphery | attached to | tables | public page | room |
|---|---|---|---|---|
| **City soundtracks** | a CITY | `soundtracks`, `soundtrack_songs`, `soundtrack_issues` | [/soundtracks/](soundtracks/index.html) | Tape Room |
| **City gifts** | a CITY | `gift_shop_items`, `gift_shop_listings` | [/gifts/](gifts/index.html) | Gift Shop (the room) |
| **Game highlights** | a GAME that was played | `photo_submissions` | [/highlights/](highlights/) | Winner's Wall |
| **Social media posts** | anything, mostly a story or a gift | `socials` | none, it posts outward | Socializer |

**WHY THIS DISTINCTION IS WORTH WRITING DOWN.** Four of the six rooms in this
project, four of the six routines, and a large share of this file are about the
periphery, because the periphery is where the daily chores are. That is a fair
reflection of where the WORK is and a badly misleading picture of where the
PRODUCT is. A reader who arrives at this file cold would reasonably conclude we
sell playlists.

Two consequences worth holding on to:

- **THE PERIPHERY HANGS OFF THE CORE, NEVER THE OTHER WAY ROUND.** A soundtrack
  is for a city we play in; a gift is for a city we play in; a highlight is proof
  somebody played. If a peripheral feature ever starts deciding which cities we
  build games for, the tail is wagging the dog.
- **THE CORE IS THE PART THAT IS LEAST FINISHED.** Soundtracks, gifts and socials
  each have a room, a routine and a public page. Stops and challenges have a
  PARKED editor and one challenge attached across 41 stop rows, and directions do
  not have a table at all. **The mechanics people pay for are the least built
  thing here**, and that is the single most useful sentence in this section.

### DIRECTION IS NEW VOCABULARY AND HAS NO TABLE YET (2026-08-20)

It is written down here because it is now a named thing, and naming it is what
stops the next person inventing a second word for it. **Nothing in the database
holds a direction today.** The engines carry the between-stop text inside the
conversation flow in `public.games`, which means it is authored per game rather
than per stop, and it cannot be reused the way a challenge can.

**Do not invent a `directions` table on the strength of this paragraph.** When
directions get a home it should almost certainly be alongside the challenge on
`path_stops`, because a direction belongs to the LEG between two stops and the
stop is the only thing that knows both ends. That is the same piece of work the
Stop Builder note describes, and it touches both engines, which are the paid
product.

### TWO PLACES THIS DISAGREES WITH THE REST OF THE FILE

Recorded rather than silently reconciled, because both are load-bearing and only
Kevin can settle them.

1. **"A game consists of A PATH" (singular) vs "A Game contains ONE OR MORE
   Paths"** in the canonical hierarchy below. One path per game is the simpler
   product and matches how a game is sold; one-or-more is what the schema allows,
   since nothing stops several paths naming the same city. **If it is one, the
   hierarchy section should say one**, and a game should point at exactly one
   `tour_id`.
2. **"A path consists of WAYPOINTS" vs "A Path contains an ordered list of
   STOPS."** Both are true at different times, which is exactly the confusion:
   `path_stops` holds ids and a position TODAY, so a path really is waypoints in
   an order; it becomes stops when challenges are attached, which is the work
   that has not happened yet. **The Path Builder builds waypoints in an order.
   The player walks stops.**

---

## THE SPACEBAR DID NOT WORK IN THE SUGGESTION FORM (2026-08-27)

`/soundtracks/` runs its cassette transport off a **document-level** keydown
listener, so it reaches every field on the page. Space was guarded by an
**ALLOWLIST OF THREE TAGS -- BUTTON, A, INPUT -- which does not include
TEXTAREA**, so a space typed into *why it belongs here* was swallowed and played
the tape instead. The words ran together with nothing on screen to explain it.

- **A DENYLIST OF EDITABLE TARGETS, NOT AN ALLOWLIST OF PRESSABLE ONES.** An
  allowlist has to name every element a key may safely reach and is wrong the
  moment a new kind of control appears; `isTypingTarget()` asks the one question
  that matters -- INPUT, TEXTAREA, SELECT or contenteditable -- which is the same
  test the Tape Room's own shortcut handler makes.
- **THE ARROWS HAD THE SAME REACH AND NO GUARD AT ALL.** They do not
  `preventDefault`, so the symptom was different and worse: the caret moved
  through the sentence **and the tape stepped to another track**. One guard now
  covers Escape, both arrows and space.
- **THIS IS THE THIRD TIME THIS REPO HAS EATEN A SPACEBAR.** The Socializer's
  editable spans did it with an Enter/Space handler on the parent, and the fix
  there was the same shape. **Any page-wide key handler needs this test.**

**AND THE FIRST ARROW CHECK WAS VACUOUS.** `defaultPrevented` cannot see a
handler that does not prevent anything, so it read the cassette's SVG title
instead -- matched the wrong node, and passed on the unfixed file too. It is a
STRUCTURAL assertion now (one guard, before every transport branch, and no tag
allowlist), and **the arrow behaviour itself is stated as unverified from here**
rather than covered by a check that proves nothing.

## A SUGGESTION IS PROCESSED, NOT DELETED, AND MAY CARRY AN EMAIL (2026-08-27)

[2026082705_suggestions_are_kept.sql](mc/supabase/migrations/2026082705_suggestions_are_kept.sql), **applied**.
`issues.processed_at` (null is open) and `issues.contact_email`.

- **THIS IS NOT A CONTRADICTION OF "CLEARING DELETES", AND THE REASON IS THE
  DEDUPE.** A finding deletes because **deleting is what frees its fingerprint
  for the next audit**, and that recurrence is the only check a fix landed. **A
  suggestion is the opposite case on every point**: nothing re-files it, there
  is no fix to check for, and **the fingerprint SHOULD stay claimed** so the
  same song is not offered again and read as new. Findings still delete.
- **`processed_at`, NOT A `status`.** A status invites a third value and then a
  fourth, which is the column this project spent a week taking back out of the
  soundtrack tables. A timestamp also records WHEN, which is the question
  anybody asks of a suggestion queue.
- **THE UPDATE GRANT IS ON ONE COLUMN.** `grant update (processed_at)`, so the
  room can file a suggestion and cannot rewrite a finding's own words: what the
  audit said is a record of what the audit said. Verified in
  `information_schema.column_privileges`.
- **PROCESSED IS ITS OWN TAB AND APPEARS IN NO OTHER**, or the queue would never
  look empty. ALL counts the OPEN ones, since it is the tab you land on.
  - **THE "EMPTY KIND" GUARD RESET IT THE INSTANT IT WAS PRESSED.** `processed`
    is not a kind, so it is not in `counts`, and the guard that clears a filter
    whose kind has emptied fired on it: the tab appeared, the press registered,
    and the list came back showing ALL. **Anything added to that strip that is
    not a kind needs naming there.**
- **A PROCESSED CARD IS QUIETER, NOT HIDDEN, and has a Put back.** The whole
  reason to keep a suggestion rather than delete it is so it can be read later.

### THE EMAIL REVERSES YESTERDAY'S DECISION, DELIBERATELY

2026082704 collected no contact of any kind and said why: personal data means a
retention rule and somewhere to honour a deletion request. **That cost has not
gone away, it has been accepted.** What follows from it is not optional:

- **OPTIONAL, AND THE LABEL SAYS SO** rather than fine print underneath. It is
  the only personal datum this site collects from a visitor, so what it is for
  has to be legible in the moment somebody decides whether to type it.
- **IT IS THE ONLY ONE, AND THERE IS NOWHERE ELSE TO PUT ONE.** Do not add a
  name, and do not start writing one into `detail`.
- **A MALFORMED ADDRESS IS REFUSED, NOT STORED.** Something typed into that box
  is meant to be an address; keeping a broken one would be keeping personal data
  that cannot do the job it was collected for.
- **`public.issues` HAS NO ANON POLICY**, so an address is admin-read only.
  **Check that again if a public read of this table is ever added.**
- **DELETING THE ROW IS THE DELETION REQUEST**, and the Issues room can do it.

## THE CASE THAT IS PLAYING IS LIT (2026-08-27)

On `/soundtracks/`, the tape case on the shelf whose tape the deck is playing.

- **`is-playing` USED TO MEAN "OPEN", WHICH ON THIS PAGE IS NEARLY ALWAYS
  WRONG.** The deck is permanent and picks a tape on arrival **without playing
  it**, so a case was marked the moment somebody landed and stayed marked while
  the room was silent. `.is-open` carries that job now; `.is-playing` means
  playing.
- **IT HAD NO LOOK OF ITS OWN EITHER.** It shared the hover and focus rule, so
  the playing case was indistinguishable from whichever one the pointer happened
  to be over.
- **PAINTED INSIDE `updatePlaybackUi`, FROM THE SAME `isPlaying` THE CASSETTE IS
  PAINTED FROM.** That is what stops the shelf and the deck disagreeing about
  what is playing, which is the failure this project has already had twice with
  a control painted in one place and read in another.
- **ITS RULE IS DECLARED AFTER THE HOVER RULE.** Both are one class, so source
  order decides the tie, and a playing case under the pointer must not fall back
  to looking merely hovered.
- **IT SAYS `NOW PLAYING` IN WORDS.** A glow alone is a guess on a shelf of
  ninety-odd cases, and it is drawn in the same stripe colour the hover state
  uses. The word is unambiguous, and it is what a screenshot and a screen reader
  both keep.
- **THE GLOW IS ON THE CASE, NOT ONLY AROUND IT.** A ring around an object still
  as dark as its neighbours reads as an outline; `filter: brightness()` on the
  case is what makes it look lit. Two spreads plus a white core carry it at a
  glance, and it pulses -- **stopped under `prefers-reduced-motion`**, which is
  what that setting is for.
- **THE TRANSITION ITSELF IS UNVERIFIED FROM jsdom**, since starting playback
  needs a real Spotify iframe. What is asserted is the arrival state, that
  opening marks a case OPEN and never PLAYING, and **structurally** that the
  shelf is painted from the cassette's own `isPlaying`.

## A VISITOR SUGGESTS A TRACK, AND IT BECOMES A ROW (2026-08-27)

[2026082704_track_suggestions.sql](mc/supabase/migrations/2026082704_track_suggestions.sql), **applied**. The cassette on
`/soundtracks/` opens a form; it files into `public.issues` with
`area = 'suggestion'`; the Issues room draws it under a **Suggestions** tab.

- **IT WAS A `mailto:`, AND THAT IS WHY IT CHANGED.** The control opened
  whatever mail client the visitor happens to have configured -- on a phone,
  often none -- with a template in the body, so a suggestion arrived as free
  prose in an inbox nothing else on this site can read, and the Tape Room's
  EMAILED SUGGESTIONS button was a door into Gmail. **A prompt whose output is
  an email is a prompt whose output is lost**, which is the lesson this repo
  learned four times with research pages writing to files.
- **NO NEW TABLE, and that is a deliberate reading of the ask.** `public.issues`
  was built three days earlier for exactly this shape: one row per thing that
  needs somebody to look at it, across every area, with `area` as the
  discriminator. A second table would mean a second room, a second read and a
  second set of grants.
- **THE FIRST PUBLIC WRITE PATH ON THIS PROJECT**, so it is the tightest.
  `area`, `kind`, `severity`, `scope` and `source` are all constants; a title is
  required; every field is trimmed and length-capped; and **the city must be one
  the catalogue holds a tape for**, which is what stops the form being an open
  write channel with a free-text key. **Anon may CALL it and still cannot READ
  the table**, so a suggestion goes in and nothing comes back out.
- **A REPEAT IS REPORTED AS A SUCCESS.** The function answers `filed: false`
  when the same track has already been suggested, and the page does not say so:
  telling a visitor that somebody beat them to it turns the form into a way of
  asking what is in our queue, and makes them feel they failed at something that
  worked.
- **NO NAME, NO EMAIL, NO CONTACT OF ANY KIND.** A suggestion is a track and a
  reason. A contact field would mean a privacy policy, a retention rule and
  somewhere to honour a deletion request, for something nobody would read. **If
  a reply is ever wanted that is a decision with consequences, not a column.**
- **THE CITY IS THE ONE ON THE DECK, not something typed.** The visitor is
  looking at a tape; a city field would be a way to get it wrong.
- **AND SO IS THE TAPE** ([2026082706](mc/supabase/migrations/2026082706_suggestion_keeps_its_tape.sql), applied). The function derived
  `group_label` as the city's FIRST tape, which is right by luck on a one-tape
  city and **quietly wrong everywhere else**: New Orleans has four. The row
  looked perfectly correct -- a real tape, in the right city -- and the only
  person who could tell was the visitor, who never sees it.
  - **SENT, THEN CHECKED.** `tape` is a caller-supplied string on a public write
    path like every other field, so the pair is verified against the catalogue
    before it reaches the row.
  - **AN UNKNOWN TAPE FALLS BACK RATHER THAN REFUSING.** A rename between the
    page loading and Send must not cost somebody the track and the reason they
    just typed.
  - **THE FINGERPRINT DOES NOT INCLUDE THE TAPE, deliberately.** Two people
    suggesting one song for two tapes of one city are suggesting one song.
  - **THE CARD CALLS IT `spine_tag`, NOT `tape`.** The column is `tape`;
    `soundtracksFromRows` copies it onto a key that predates the rename, so the
    first cut read `.tape`, got `undefined`, and **the tape travelled as an
    empty string** -- with the form still sending and the row still filing
    against the first tape. Caught by asserting the request body, not the form.
- **A SUGGESTION CARD OFFERS GO TO AND CLEAR, AND NOTHING ELSE.** There is no
  track to delete -- the whole point is that we do not hold it yet. Adding it is
  a decision taken in the Tape Room with a Spotify id in hand.
- **THE TAB IS LAST, whatever the alphabet says.** The others are faults the
  audit found; this one is post from visitors, a different errand rather than a
  more urgent one.

**AND THE FORM WAS APPENDED BELOW THE SCRIPT THAT WIRES IT, so Send did
nothing.** An inline script runs as the parser reaches it; the dialog sat before
`</body>` and the wiring is a thousand lines above, so `getElementById` found
nothing and no listener was attached. **The markup is above the script now** --
the dialog is fixed-position, so its place in the source changes nothing else.

- **jsdom DOES NOT REPRODUCE THIS.** With external resources loading it ran the
  inline script *after* the markup existed, so the button posted, the visitor
  was thanked, and **every assertion passed over a page that could not work in a
  browser**. The order is asserted from the SOURCE now, which is the only thing
  that can catch it from in here. **Any inline wiring on these pages needs the
  same check.**

**AND THE FIRST CUT READ TWO ATTRIBUTES NO CARD HAS.** `data-city` and
`data-key`; the cards carry `dataset.citySlug`. So the slug came back empty, and
`suggestSong` **returned early and the form never opened** -- silently, with the
control looking exactly as it should. Caught only because the check presses the
cassette rather than poking the form: a test that opened the dialog directly
passed every other assertion over a form that could not be reached.

## THE TRACK FILTER DECIDES WHICH TAPES ARE LISTED (2026-08-27)

**ALL and LIVE list only the tapes carrying a live track**, which makes both of
them "the tapes a visitor can actually see": `/soundtracks/` draws a tape when at
least one of its tracks is live, and this is the same test.

- **SO ALL DOES NOT MEAN EVERY TAPE, and the naming tension is real.** **9 of the
  114 qualify today.** It is the right trade because the room is for working on
  tapes that are up; a fully shelved tape reached under ALL is a page of rows
  with nothing at stake.
- **THE OTHER THREE ARE HOW YOU REACH THE REST.** Shelved lists every tape
  holding a shelved track, which is all of them. Explicit and Sports list the
  tapes holding one. **Nothing is unreachable**, and a tape you cannot find under
  ALL is one press away.
- **AND NO FILTER CAN LAND YOU ON AN EMPTY TAPE ANY MORE**, which is the older
  fault this fixes: stepping through Live used to walk you across tapes with
  nothing on them, and the pager counted them.
- **CHOOSING A TRACK FILTER RESETS TO THE TOP**, the same rule the place picker
  keeps. It decides which tapes are listed now, so holding the position would
  land you on whatever happens to be third in a completely different list.
- **CHOOSING ALL TAPES GIVES THE BARE URL.** `?tape=` records which tape you are
  on; going back to ALL TAPES is a return to the catalogue, so the address is
  the catalogue. **A ONE-SHOT FLAG, not a rule about position** -- writing no
  `?tape=` while on the first tape would make the first tape the one page in
  this room nobody can link to, which is worse than the thing it fixes.

**THE SUITE HAD TO LEARN THE RULE, AND THAT EXPOSED THREE BAD CHECKS.** Ten
assertions failed, all of them measuring one tape and then comparing against
another after a filter press. They read the tape they land on now. One was
**vacuous** and is deleted: see the padding note above.

## THE SOUNDTRACK AND ISSUES ROOMS, AUDITED END TO END (2026-08-27)

Asked for after a week of rapid change: is any of this solid. Most of it is,
and three things are not. Everything below was checked against production or by
rendering the page, never by reading the diff.

### WHAT IS SOLID

| checked | result |
|---|---|
| catalogue | 1,572 tracks, 114 tapes, 109 live across 9 tapes |
| orphan findings | **0** (the trigger holds) |
| one recording twice on a tape | **0** (the partial unique index holds) |
| triggers | `soundtrack_touch` and `soundtrack_drop_issues`, both enabled |
| functions naming a dropped object | **none** |
| pages parse | all four, no repeated ids |
| test suites | **284 assertions**, all passing |

**PRIVACY HOLDS, AND IT WAS PROBED AS `anon` RATHER THAN ASSUMED.** `issues`
401, `soundtrack.findings` 401, `soundtrack?select=*` 401, `soundtrack_findings`
401, and the public page's own named-column read 200. A write is refused with
42501 and the row is unchanged.

- **BUT A REFUSED WRITE ANSWERED `204` WITH NO `Prefer` HEADER.** Only when
  `return=representation` was asked for did it say 42501. **A client that does
  not read the row back cannot tell a refusal from a success**, which is the
  house rule about the empty array wearing a different hat. Every write in both
  rooms already asks; anything new must.

### THREE THINGS THAT ARE NOT

**1. THE AUDIT ROTATION CLOCK IS FROZEN, AND NOTHING SAYS SO.**
`soundtrack.last_audit_at` is what [soundtracks.md](mc/soundtracks/soundtracks.md) orders "the 3 tapes that have
gone longest without a look" by. **112 of 114 tapes carry a stamp and nothing
writes it any more.** The stamping lived in the original
`tgb_report_soundtrack_issues` (2026073002) and did not survive a later rewrite
of that function; the version replaced on 2026-08-27 had already lost it. So
**every run picks the same three tapes, forever**, and the catalogue is never
swept. Nothing errors and the run reports success, which is why it has gone
unnoticed. The `tgb-agent-context` block still describes an `audited` payload key
as "what advances the rotation" and that key is not implemented. **The fix is a
few lines in the reporter; it has not been made, because this was an audit.**

**2. THE `tgb-agent-context` BLOCK IS STALE, AND HAS NEVER PARSED.**
`JSON.parse` fails at line 89 on an unescaped quote around *"song 177"* -- a
fault this file already recorded and which is still there, so **an agent that
tries to read the block gets nothing at all.** Its contents are also out of date
in four ways: findings are `public.issues` and not `soundtrack.findings`; the
pull replies with four keys and not two; "always status = open" describes a
column that no longer exists; and it does not mention that a new track with no
Spotify id is now refused outright.

**3. FIVE DEAD IDS IN THE TAPE ROOM.** `trackArchiveStatus`,
`archiveExpandBtn`, `trackStatusTabs`, `keyLegend` and `citySearch` are wired in
JavaScript and absent from the markup. **Nothing crashes**, because every one is
guarded with `if (!x) return` -- but `setArchiveStatus`, `syncArchiveExpandBtn`
and `paintKeyLegend` are all still CALLED and can never do anything. Leftovers
from controls removed without their code. **They predate this week**, and the
standing id check finds them on every run, which is how they were spotted.

### AND THE STANDING PARSE CHECK IN THIS FILE IS WRONG

It excludes `src=` and not `type=`, so it treats the Tape Room's
`tgb-agent-context` JSON block as script and reports a syntax error that is its
own. **Skip any block whose `type` is not javascript**, or the check cries wolf
on the one page it matters most for.

## A BATCH DELETE SETTLED CARDS IT HAD NOT TOUCHED (2026-08-27)

Reported as *"batch edit didn't work, only one deleted"*. Three separate faults,
and the first is the one that outlives this page.

- **DELETING A TRACK STOPPED DELETING ITS FINDINGS, AND NOTHING SAID SO.**
  Findings lived in a jsonb column ON the track, so a delete took them with it
  for free and both pages said so in a comment. [2026082701](mc/supabase/migrations/2026082701_issues_table.sql) moved them to a
  table and **nothing replaced that**. The card went quiet, the row stayed on
  file, and a reload brought the finding back naming a track that no longer
  existed. **2 of the 7 findings on the live table were already orphaned.**
  - **[2026082703](mc/supabase/migrations/2026082703_issues_follow_their_subject.sql) puts it in a TRIGGER, and that is the point.** The
    **Tape Room deletes tracks too and knows nothing about `public.issues`**, so
    a fix in the issues page would have left every Tape Room delete orphaning
    findings silently and forever. Same reasoning that put the soundtrack shelve
    cascade in the database.
  - **NOT A FOREIGN KEY.** `issues.subject_id` is TEXT and generic: a track id
    today, a gift id tomorrow, with no one table to reference. The trigger keys
    on `area` so each area gets its own.
- **`gone` WAS BUILT FROM THE IDS ASKED FOR, NOT THE ROWS RETURNED.** So a
  delete that reached one of three **settled all three cards**, and two of them
  sat there claiming work nobody had done. It reads `rows` now.
  - **AND THE SHORTFALL IS NAMED, NOT COUNTED.** *"2 were refused"* leaves you
    hunting a list where every card looks alike; the ones still there are
    exactly the ones you have to go and deal with.
- **`clearFinding` DID NOT GO THROUGH `markSettled`.** It added the class,
  relabelled the button and wrote `f.status = 'fixed'` where every other path
  writes `'settled'` -- **two implementations of one act, and they had drifted.**
  The inline one repainted neither the selection nor the batch button, so a
  finding cleared by its own button **stayed in the count**: the button offered
  to batch-edit four things that the popup would then act on three of.
- **THE BUTTON COUNTED `pickedIds()` AND THE POPUP ACTED ON `pickedFindings()`.**
  Two ideas of what is selected is how a control ends up describing something it
  cannot do. Both read `pickedFindings()` now, which also excludes anything
  already settled.
- **`markSettled` REPAINTS THE COUNTERS ITSELF, synchronously, at the end.** It
  was a `setTimeout` at the top for one pass and never ran. Its early `return`
  when the card is not on screen went too: a finding settled while another tab
  is showing still has to leave the selection.

**THE TEST HAD TO REFUSE PART OF A WRITE.** A stub that always succeeds cannot
produce this at all, which is why nothing caught it. `shortdel.js` short-changes
the track delete only -- crippling the `issues` delete as well buried the case
under a second failure -- and was run against the unfixed file, where it settled
3 cards on a delete of 1.

## THE ISSUES ROOM HAS TABS, AND THEY ARE THE KINDS (2026-08-27)

`ALL 40` then one per kind on file: `SPOTIFY 16` `FACTS 11` `RELEVANCE 11`
`SPELLING 2`, each carrying its count and, where it has one, a red
high-severity figure.

- **BY KIND, BECAUSE THAT IS WHAT DECIDES THE ERRAND.** A `spotify` finding
  sends you to Spotify to find an id; a `spelling` one is a typo you fix in the
  Tape Room; a `relevance` one is an editorial judgement about whether the song
  belongs to the city at all. Doing twelve of one kind in a row is the work,
  alternating between three is not, and the batch button is right beside it.
- **NOT REVIEW / DONE, which was the pair suggested and no longer maps onto
  anything.** Clearing a finding DELETES it, so there is no settled state for a
  tab to hold. A card that goes quiet is doing so in memory for this session
  only, and **a tab that empties on reload is not a tab.**
- **NOT BY SEVERITY.** The card already says it twice, in its border colour and
  its chip, and the list is sorted by it, so a severity tab would restate the
  order you are looking at. It survives as the red figure ON each tab, which is
  the thing that decides which tab you press first.
- **NOT BY AREA YET, AND THAT IS THE ONE TO ADD NEXT.** `public.issues` is a
  table for every area of the site and area is the axis that will matter, but
  one area files today, so an area strip would be a strip of one. **Add it above
  this strip, not instead of it**, the day a second area files.
- **A SEGMENTED STRIP, NOT A DROPDOWN, AND THE COUNTS ARE THE WHOLE REASON.** A
  closed picker cannot say that sixteen of the forty are about a Spotify id,
  which is the question you ask before deciding what to do with the next ten
  minutes. Same argument as the Tape Room's own filter strip.
- **NO STRIP AT ALL BELOW TWO KINDS.** One tab reading ALL narrows nothing, and
  a strip of one implies there are others.
- **THE COUNTS ARE OVER THE WHOLE FILE, never over what the tab has left**, and
  a test asserts the room's own figures do not move when a tab is pressed. A
  number that shrank as you filtered would read as the filter breaking.
- **THE RED FIGURE IS DRAWN ONLY WHERE THERE IS ONE.** A red 0 on every tab is a
  warning nobody reads.
- **A CHANGE OF TAB DROPS THE SELECTION OUTRIGHT.** Pruning to what is drawn was
  the first cut and it is not enough: a tick stays alive across facts to spotify
  and back, so the batch button returns counting a selection built two tabs ago.
  Same rule the Tape Room keeps when you step to another tape.
- **A KIND THAT NO LONGER HAS ANYTHING CANNOT STAY SELECTED**, or clearing the
  last spotify finding leaves an empty room with a tab lit that explains
  nothing. **The empty state names the tab that emptied it** rather than saying
  the room is clear while the other tabs are full.

## TAGGING A TRACK SPORTS DID NOT STICK, AND THE WRITE WAS ALWAYS FINE (2026-08-27)

The box flicked back to unticked the instant it was ticked.

- **THE PATCH LANDED EVERY TIME.** `commit` put `sports` in `fields`, the
  request carried `"sports":true`, and the database took it. What was missing
  was one line in `saveTrackFields`: after a successful write that function
  copies each field back onto the **in-memory** song, and `sports` was not among
  them. The repaint then rebuilt the row from a song that still said false.
- **SO IT WAS A DISPLAY BUG WEARING A WRITE BUG'S CLOTHES**, and reloading the
  page would have shown the tag was there all along.
- **NO WRITE-PATH TEST COULD HAVE CAUGHT IT.** Asserting the request was sent
  passes. Reading the row back from the database passes. **Only reading the
  CHECKBOX after the repaint fails**, which is what the new check does -- and it
  was run against the unfixed file to prove it fails there.
- **`explicit` WAS HANDLED AND `sports` WAS NOT**, which is the shape to watch:
  the two are drawn side by side and written together, so the missing one looks
  present. **`fields` and that copy-back are two lists that have to agree; add a
  column to both.**
- **THE FILTER IS THE SECOND HALF OF THE PROOF.** `trackPassesFilters` reads the
  same in-memory `song.sports`, so choosing Sports after tagging finds the track
  only if the row really moved. Before the fix it found nothing.

## THE SELECT BOX IS BATCH EDIT, AND IT HOLDS THE BUTTON (2026-08-27)

**BOTH ROOMS, and they are kept the same on purpose.** The Tape Room's second
bar row reads **ADD | VIEW** then **BATCH EDIT | FILTER | NAV**; the issues room
reads **BATCH EDIT | VIEW**. Each box was called Select and held one tick, while
the button it fed floated in the bottom-right corner. **When either changes,
change both.**

- **NAMED FOR THE JOB, NOT THE GESTURE.** Ticking is how you get there; acting
  on the lot is what you came for. Both halves of that job are in one box now.
- **THE BUTTON IS GREYED, NOT REMOVED, UNDER TWO TICKS.** This reverses the
  floating version's rule and the reason is the position: floating, it moved
  nothing when it appeared, and in a bar it sits beside the select-all, so a
  control that vanished would shift the tick and **the thing you are aiming at
  would depend on the state of the selection**.
- **`aria-disabled`, NEVER `disabled`.** A disabled button dispatches no click
  at all, so on a touch screen -- no hover, therefore no tooltip -- the reason it
  is off would be completely unreachable. Pressing it writes *tick two or more
  tracks first* to the scribble. Same rule the track header's x already keeps.
- **THE FACE KEEPS THE NOUN WHEN IT IS OFF** (`Batch edit`, then `Batch edit 30
  tracks`), so the button does not change width the moment a second track is
  ticked and shove the row about.
- **TWO OR MORE IS UNCHANGED.** One selected track has every control it needs on
  its own badge, so a batch button for a selection of one is a second way to do
  what is already in front of you.
- **`.batch-float` / `.issue-batch-float` AND THEIR `[hidden]` RE-ASSERTIONS
  WENT WITH THEM**, per the standing rule that a control and its CSS go in the
  same pass. The hiding rule is not needed now: neither button is ever hidden.
- **THE TESTS HAD TO STOP ASKING `hidden`.** Every assertion about availability
  read `btn.hidden`, which is now always false, so six of them failed the moment
  the button moved into the bar. They read the `aria-disabled` attribute
  instead, plus the computed `position`, which is what would catch a future
  regression to a floating button.

## A NEW TRACK NEEDS A SPOTIFY ID, AND NO TAPE MAY CARRY ONE TWICE (2026-08-27)

[2026082702_soundtrack_spotify_id_required.sql](mc/supabase/migrations/2026082702_soundtrack_spotify_id_required.sql), **applied**.

- **THE ROUTINE NO LONGER ENUMERATES A TAPE TO AVOID REPEATING A TRACK.** It was
  told to read every row of a tape, shelved included, before proposing anything.
  That is a burden on the routine for a rule the database can hold, and a run
  that has to enumerate before it can act spends itself on bookkeeping. It
  proposes; the database refuses a repeat and says so as
  `duplicate_spotify_id`.
  - **THE ARTIST READ SURVIVES, and it is a smaller one.** One song per artist
    per tape is editorial and the database does not hold it, so the brief still
    asks for `select=artist` on the tape. That is the only reason left to look.
- **THE UNIQUE IS PER TAPE, AND THAT WAS MEASURED RATHER THAN ARGUED.** On the
  live table: **17 spotify ids sit on more than one tape (35 rows), and 0 sit
  twice on one tape.** So a global index could not be created without deleting
  35 real rows, and the per-tape one applied to the catalogue as it stood. It is
  the same reasoning that has always kept the title+artist tombstone scoped to
  the tape, and the reason the room has a Copy at all. **A global rule is a
  product decision, not a tidy-up.**
- **THE INDEX IS PARTIAL, `where spotify_id is not null`.** 202 of 1,594 tracks
  carry no id and are real rows a human may have typed; the public page falls
  back to a Spotify search for them. Several nulls on one tape are not a
  duplicate.
- **A NEW TRACK WITH NO ID, OR A MALFORMED ONE, IS REFUSED AND THE REFUSAL IS
  FILED.** A `spotify` finding at `warn` names the title and artist, so a human
  can find the id and add it by hand. **Counted alone it would be a number in a
  reply nobody reads afterwards.**
  - **THE FINGERPRINT IS PER SONG**, `md5(slug:nospotify:title:artist)`, or five
    refusals on one tape would collapse into one finding and four would be lost.
  - **VERIFY-OR-OMIT IS UNCHANGED AND STILL OUTRANKS THIS.** A fabricated
    22-character id passes every check and silently plays nothing. What changed
    is what an omission COSTS: the track is not filed, rather than filed
    unplayable. **Guessing is worse than both.**
  - **IT IS A RULE ABOUT ARRIVALS ONLY.** The 202 existing tracks with no id
    stay, and the audit still files that absence as a finding. Never propose
    retiring one for it.
- **`found` AFTER `insert ... on conflict do nothing` WAS WRONG HERE TOO.** The
  old pull counted a row refused by the title+artist tombstone as **added**. It
  reads `get diagnostics` now. Third instance of this exact trap in two days.
- **`added` AND `skipped` ARE UNCHANGED**, so nothing reading them broke; the
  two new figures only say why.

**PROVED BY A CALL THAT MADE IT DO ITS JOB.** Four songs against a real tape:
one good id filed, one with no id refused and filed as a finding, one with a
malformed id treated the same way, one repeating an id already on the tape
refused as a duplicate -- `{"added":1,"skipped":3,"no_spotify_id":2,
"duplicate_spotify_id":1}`. A direct INSERT of a repeat raised 23505 against the
index, two nulls on one tape were accepted, and the same refusal filed twice
added no second finding. Probes removed.

## FINDINGS ARE `public.issues`, AND CLEARING ONE DELETES IT (2026-08-27)

[2026082701_issues_table.sql](mc/supabase/migrations/2026082701_issues_table.sql), **applied**. A finding was a jsonb
element inside `soundtrack.findings` with a `status` in it; it is a row in
`public.issues` now, and there is no status column at all.

- **DELETING IS SAFE HERE, WHICH IS NOT THIS PROJECT'S USUAL ANSWER.** The rule
  that made `status` worth keeping was the dedupe: the reporter skipped a
  fingerprint it already held OPEN, so a finding cleared to `fixed` became
  reportable again and **that recurrence is the only check a fix landed**. A
  deleted row says the same thing in one less step. **What is given up is the
  record that somebody looked**; if that matters it wants an events table, not
  `status` coming back.
- **NOTHING WAS CARRIED ACROSS, AND THAT WAS COUNTED RATHER THAN ASSUMED.** 204
  findings sat in the array and **not one was open**: 202 `fixed`, 2
  `dismissed`. In a model where clearing deletes, a cleared finding does not
  exist, so there was nothing to migrate.
- **SO THE ROOM IS EMPTY UNTIL THE BOT RUNS.** TGB SOUNDTRACK BOT has no
  schedule and is run by hand, so `/mc/issues.html` shows nothing until somebody
  presses Run. That is a real consequence of the cut, not a fault.
- **IT IS NOT A SOUNDTRACK TABLE.** `area` is the discriminator and the columns
  are named for any of them: `subject_id` / `subject_label` for the thing,
  `group_key` / `group_label` for what it belongs to. The room's own sentence
  now says "from soundtracks to the Gift Shop".
- **THE FINGERPRINT IS UNIQUE PER `(area, fingerprint)`, never globally.** Two
  areas computing the same md5 is not a duplicate, and a global index would
  silently drop the second.
- **A TABLE OF ITS OWN CANNOT LEAK THE WAY THE COLUMN COULD.** `anon` has no
  policy at all, so `select` answers **42501** rather than 200 with `[]`. The
  old arrangement kept `findings` out of a per-column grant on a publicly
  readable table, which had to be re-issued for every new column and did leak
  for a few minutes in August.
- **`tgb_report_soundtrack_issues` KEEPS ITS NAME AND ITS PAYLOAD**, so the
  brief needed no edit and a run in flight could not land on a function that had
  changed shape under it. Only the destination moved. Its constants are still
  the security: `area` is always `soundtrack`, the kind must be one of four, the
  city must hold a track, 40 a call.
  - **`found` AFTER `insert ... on conflict do nothing` IS NOT RELIABLE for
    this.** The row count is read with `get diagnostics`, or a deduped row would
    be counted as added.
- **`subject_label` IS THE NAME AT FILING TIME** and is not kept in step with a
  rename. The table cannot join to every area. The links are built from the
  keys.
- **THE HUB'S CLEAR BUTTON WAS BROKEN AND NOTHING SAID SO.** It carried `rpc:`
  and `args:`, and `decideWork` reads neither -- it only ever PATCHes -- so the
  press ran `Object.keys(undefined)` and threw **before the try block**, leaving
  the buttons disabled with nothing on screen. It is `del: true` now, and the
  runner sends a DELETE with **no body**: some fetch stacks refuse a DELETE that
  carries one.
- **THE HUB'S ISSUES ROW OPENS `/mc/issues.html`**, not the Tape Room. Findings
  left that room in August.
- **`collectFindings` AND `soundtrackIssues` ARE DELETED FROM THE TAPE ROOM.**
  That function was kept deliberately while the column was still filled; with
  findings out of it, it returned an empty array on every load and the delete
  path pruned nothing. The "and its N issues" clause went from the delete notice
  with it.
- **RETIRED IN PLACE, NOT DROPPED:** `soundtrack.findings`, the
  `soundtrack_findings` view and `tgb_resolve_soundtrack_finding`. The drops sit
  commented at the bottom of the migration. The column still holds its 204
  cleared findings.
- **A SLICE KEYED ON A COMMENT BIT AGAIN.** Removing `collectFindings` took a
  neighbouring block with it, because three comment paragraphs had run together
  above it and the anchor matched the last one. Restored and redone with exact
  bounds **plus an assertion on what the slice actually contained** -- the
  function names inside it, and its length.
- **THE STANDING PARSE CHECK REPORTS A FALSE FAILURE ON THE TAPE ROOM.** That
  page carries a `tgb-agent-context` JSON block, and the check in this file
  excludes `src=` but not `type=`. Skip any block whose `type` is not
  javascript, or it reports a syntax error that is the checker's own.

**PROVED BY CALLS THAT MADE IT DO ITS JOB.** An empty payload answers
`{"added": 0}` and looks healthy while the body is broken. Verified live: two
real findings filed with their labels and scopes resolved, a bad kind and an
unknown city refused, a reworded repeat deduped to `added 0`, `anon` refused
both select and delete with 42501, and the probes deleted afterwards.

## THE SOUNDTRACK AND ISSUES ROOMS, AUDITED END TO END (2026-08-27)

Asked for after a week of rapid change: is any of this solid. Most of it is,
and three things are not. Everything below was checked against production or by
rendering the page, never by reading the diff.

### WHAT IS SOLID

| checked | result |
|---|---|
| catalogue | 1,572 tracks, 114 tapes, 119 live across 9 tapes |
| orphan findings | **0** (the trigger holds) |
| one recording twice on a tape | **0** (the partial unique index holds) |
| blurbs missing | **0** |
| triggers | `soundtrack_touch` and `soundtrack_drop_issues`, both enabled |
| functions naming a dropped object | **none** |
| pages parse | all four, no repeated ids |
| test suites | **317 assertions**, all passing |

**PRIVACY HOLDS, AND IT WAS PROBED AS `anon` RATHER THAN ASSUMED.** `issues`
401, `issues.contact_email` 401, `soundtrack.findings` 401, `soundtrack?select=*`
401, and the public page's own named-column read 200.

### THREE THINGS THAT ARE NOT

**1. THE AUDIT ROTATION CLOCK IS FROZEN, AND NOTHING SAYS SO.**
`soundtrack.last_audit_at` is what [soundtracks.md](mc/soundtracks/soundtracks.md) orders "the 3 tapes that have
gone longest without a look" by. **1,550 rows carry a stamp, the newest is
2026-08-25, and `tgb_report_soundtrack_issues` does not mention the column at
all.** So nothing has wound that clock since the reporter was rewritten, and
**every run picks the same three tapes, forever**. Nothing errors and the run
reports success, which is exactly why it has gone unnoticed. **The fix is a few
lines in the reporter; it has not been made, because this was an audit.**

**2. THE `tgb-agent-context` BLOCK IN THE TAPE ROOM STILL DOES NOT PARSE.**
`JSON.parse` fails at line 89 on an unescaped quote around *"song 177"*. This
file has recorded it twice and it is still there. Nothing in the page reads it,
so nothing fails; **an agent that tries to read it gets nothing at all**, which
is the whole reason the block exists.

**3. EIGHTEEN EMPTY CATCHES REMAIN IN `/soundtracks/`.** ~~All of them a
fault~~ -- **that count was too blunt and is corrected below**: most guard
teardown, where there is nothing a listener could act on. Four now report
(load, play, seek, pause) and the rest carry one comment saying why they stay.
**The test is whether somebody pressed something and is owed an answer.**

### AND A TRAP IN THE HARNESS ITSELF, WORTH MORE THAN ANY OF THEM

**A SUITE THAT CANNOT REACH THE SERVER PRINTS `0 ok, 0 FAIL` AND READS AS
GREEN.** Four of the nine suites drive the page over `http://127.0.0.1:8791`,
and when that server was not running they reported nothing and were counted as
passing. **Zero assertions is not success**, and a summary line that only counts
failures cannot tell the two apart. Anything that reports on these suites must
assert a MINIMUM COUNT, not just the absence of failures.

## FIND: THE SPOTIFY ID IS LOOKED UP FROM THE ROW (2026-08-27)

A small **Find** beside the Spotify box on every track badge. It asks
[spotify-lookup](mc/supabase/functions/spotify-lookup/index.ts) for the row's title and artist and fills the box.

- **IT FILLS AND DOES NOT SAVE, AND THAT IS THE WHOLE DESIGN.** The oldest rule
  about this field is verify-or-omit, because **a wrong 22-character id passes
  every check we have and then silently plays the wrong thing**. A lookup that
  saved would be a machine guessing, at scale, into the one field nobody can
  proofread by reading it. The box commits on blur like any other, so the save
  is a second, deliberate press by somebody who has looked.
- **ONE ANSWER FILLS THE BOX; SEVERAL OPEN A PICKER.** The picker carries the
  album and the year AS SPOTIFY HAS THEM, because those are what tell a live
  cut, a re-recording or a cover from the record somebody meant. Without them
  every row of a search for a standard reads identically.
- **THE NOTICE NAMES THE RECORDING, NOT THE ID.** 22 characters of machine text
  cannot be checked by looking at them; "found X by Y on Z (1994)" can.
- **IT NEEDS A SPOTIFY APP, WHICH THIS PROJECT DID NOT HAVE.** Two secrets and a
  deploy: `supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...`
  then `cd mc && supabase functions deploy spotify-lookup`. **Until both are set
  the function answers with a sentence naming what is missing**, the button says
  so, and nothing else changes: the box is still typeable and a pasted share
  link still works.
- **CLIENT CREDENTIALS, NOT A USER TOKEN.** It reads the public catalogue and
  never touches an account, so there is no consent flow and **nothing that
  expires and has to be renewed by hand** -- this project already carries one
  such credential in Threads and does not want a second.
- **THE TOKEN IS CACHED FOR THE LIFE OF THE WORKER**, since a clearing session
  is a run of lookups and a token lasts an hour. Not persisted: there is nothing
  here worth storing.
- **A FIELDED QUERY**, `track:"..." artist:"..."`, so Spotify matches the two
  separately. A bag of words returns forty covers.
- **IT IS THE THIRD EXCEPTION** to the rule that no child of a track row
  declares its own font size, and it is the flag words' exception exactly: a
  CONTROL carrying a three-letter label rather than a field carrying a value.
  The harness names it.

## THE PROMPT SAYS WHERE TO LOOK, AND IT IS SEATGEEK (2026-08-28)

Asked whether SeatGeek can be read without an API key. **It already is, twice**:
TGB CONCERT BOT and TGB ANCHOR BOT both browse its public pages, and neither
holds a key -- a cloud routine has no secret store, which is the constraint that
shaped every write path here. The events room's own prompt is now told the same
thing.

- **THE PROMPT HAD NEVER SAID WHERE TO LOOK.** It said what an event must BE
  and how to format it, and left FINDING one to the model's habits.
- **AND IT ACTIVELY FORBADE THE ANSWER.** *"Verify each event against the
  league, venue, promoter, or organiser page, NOT A LISTINGS AGGREGATOR"* --
  which rules out SeatGeek, and most of what a browsing tool can actually open.
- **FINDING AND VERIFYING ARE TWO STEPS, and that is what resolves it.** A
  listings site is a good way to FIND what is on; where the venue, league or
  promoter has published the same date, verify against that and put THAT page in
  `url`. Where the listing is the only public statement, the listing is an honest
  url and `source` says SeatGeek.
- **READ THE PAGE, NOT A SUMMARY OF IT** -- ask the tool for the page SOURCE if
  it hands back a cleaned-up article. **A summariser will happily invent a
  plausible date**, and the date is the one field nothing here works without.
  This is the same failure that made Grok file imageless socials candidates.
- **PREFER A TOUR OR SEASON PAGE**: one of them gives several cities at once,
  and a game is built per city.
- **A SEATGEEK LISTING MAY BE RESALE** for something announced elsewhere, so it
  is evidence that a date is scheduled, not evidence of who is promoting it.

**NO API KEY, AND THE PROMPT SAYS NOT TO GO LOOKING FOR ONE.** There is no
SeatGeek key in `.env`, none in the Edge Function secrets, and none is needed.

**THE SEARCH BOX SAYS `team`, NOT `club`.** No field on this page is called a
club: the columns are `away_team_geo` / `away_team_nickname` and the form labels
them Away team geo / Away team nickname. `placeholder-club` and the
`club-missing` finding keep the word, being about a club as an entity rather
than about a field.

## THE EVENTS ROOM IS OFF THE CITY CATALOGUE (2026-08-28)

`events.venue_city` is a plain string now. **What is entered or scraped is what
is stored**, and nothing on this page reads, checks against, or writes to
`public.cities`.

**FOUR TIES WENT, AND EACH IS A CAPABILITY:**

| gone | what it did |
|---|---|
| the shared datalist on every card | offered the catalogue's cities as you typed |
| `TgbCities.attach` on the manual form | the same, plus a **+ add-a-city** button |
| the `unknown-city` rule | filed a finding when a venue city was not in the catalogue |
| `ensureCitiesExist` | **added the city to `public.cities` when an event was created** |

**WHAT IT COSTS, PLAINLY, because none of it is recoverable by accident:**

- **NOTHING STOPS TWO SPELLINGS OF ONE TOWN.** "Inglewood, California" and
  "Inglewood, CA" are two different cities as far as anything reading this
  column is concerned, and no screen will tell you.
- **NOTHING SAYS THE VENUE TOWN IS ONE THE REST OF THE SITE HAS NEVER HEARD
  OF.** `/games/`, `/gifts/` and `/soundtracks/` all key off `cities.city`; a
  venue city that does not match one is now silently unjoinable.
- **`no-city` SURVIVES.** A BLANK venue city is still a fault, and still forces
  review. Only the CATALOGUE test went.
- **The prompt was rewritten to match.** It said the city had to match a row in
  `public.cities`; it now describes the FORM to use -- "City, State" spelled out
  for a US city, "City, Country" elsewhere -- and says outright that nothing
  checks it, so the spelling given is the spelling stored.

**`geo.js` AND `city-picker.js` ARE NO LONGER LOADED BY THIS PAGE**, and a test
asserts the room renders with neither module present. **The catalogue itself is
untouched** and every other room still uses it: this is one room leaving, not
`public.cities` being retired.

**`citychk.js` WAS RETIRED**, its whole subject being the picker this removed.
`evcity.js` replaces it and asserts the opposite.

### AND THE VIEW BOX IS ISSUES, THE BUTTON IS CHECK (2026-08-28)

**THE BOX IS THE SUBJECT AND THE BUTTON IS THE VERB**, which is how the other
tabs already read: ADD holds MANUAL and PROMPT, SEARCH & FILTER holds a box you
type in. This was **VIEW / Issues** -- a place-you-go label over a
thing-that-happens control -- and VIEW means DOORS in the Tape Room, the
Socializer and the issues room, which is not what this button does.

- **THE COUNT IS ON THE BUTTON, NOT THE TAB.** `Check (3)`. A heading that
  changed as you worked would read as a control.
- **THE CLASS IS STILL `--check`.** Identifiers do not move with visible copy,
  and this box has now been called CHECK, VIEW and ISSUES.

**`no-venue` NOW READS `Venue name missing.`** It said the venue city was enough
to anchor a game and this was a gap in the record rather than a fault -- true,
and a sentence of reasoning on a row that only needed naming.

## SUPABASE SAID WE WERE EXHAUSTING RESOURCES. THE DATABASE IS NEARLY IDLE. (2026-08-28)

Measured before changing anything, against production, over the 116 days
`pg_stat_statements` has been collecting:

| asked | answer |
|---|---|
| database size | **36 MB** |
| replication slots | **none** (a stale one is the usual cause of disk pressure) |
| connections | 11, one active |
| total execution time | ~7,900 s, which is **68 SECONDS OF CPU A DAY** |

**SO THERE IS NO EXPENSIVE-QUERY PROBLEM TO FIND**, and the advice in the
banner does not fit this project. What the numbers do say is worth more:

- **A FULLY-CACHED SCAN OF 224 PAGES TOOK 131 ms.** `explain (analyze,
  buffers)` on the most expensive statement showed every buffer a cache HIT and
  still 131 ms. **That is a starved CPU, not a bad plan** -- the same query is
  0.675 ms once it stops touching the heap. **If the banner is about anything,
  it is about the size of the compute, or a plan-level quota (egress, function
  invocations, MAUs) that SQL cannot see from in here.**
- **~22% OF ALL DATABASE TIME IS THE SUPABASE DASHBOARD ITSELF.** Listing
  extensions 776 s, listing functions 416 s, `pg_timezone_names` 360 s, table
  and column metadata 198 s -- **1,750 s of 7,900**. That is a Studio tab left
  open polling. **Closing it is worth more than any index in this repo.**

### WHAT WAS ACTUALLY CHANGED

[2026082803_covering_index_for_the_city_rail.sql](mc/supabase/migrations/2026082803_covering_index_for_the_city_rail.sql), **applied**.

- **`games_city_archived_idx`.** `select city, archived from games` is the city
  rail on `/games/` and `/gifts/`: 4,730 calls, 138 ms each, **8% of this
  project's entire database time**. It scanned 224 heap pages to return two
  small columns from 395 rows. **Seq Scan 224 buffers 131.7 ms became Index Only
  Scan, 2 buffers, Heap Fetches 0, 0.675 ms** -- 195x, and on a starved instance
  the cheapest thing available is asking it to do less.
- **A SECOND INDEX WAS BUILT, MEASURED, REFUSED BY THE PLANNER AND DROPPED.**
  The shop's live-items read looked like the same shape at 252 s, but **690 of
  the 829 rows match its predicate**, so the "narrow" partial index covered 83%
  of the table and a 52-page sequential scan beat it. Postgres was right and the
  index was dropped in the same sitting: **an index nothing uses is written on
  every insert forever in exchange for nothing.** Re-measure before re-adding
  it; the answer changes if live items ever become a minority.

**`guides` AVERAGES 68 kB A ROW**, 2.8 MB across 41 rows, because the portraits
are base64 in the column. Nothing was done about it here, but any `select=*` on
that table ships the lot, and it is the biggest single payload in this database.

## THE EVENT ROUTINES ARE ONE, AND THE TOUR BUILDER IS CALLED WHAT IT IS (2026-08-28)

Three routines had event-shaped names and only two filed events.

- **TGB ANCHOR EVENTS IS `NFL ROUTES`.** Its name said anchor events; its prompt
  is, and always was, the NFL Tour Builder, which designs a six-stop walking
  route and commits SQL. **A name-only change** -- `name` is a top-level field,
  so the prompt, the `claude-sonnet-5` pin, the `11 8,20` cron and the git source
  all survived, and the reply was read back to confirm it.
- **TGB ANCHOR BOT + TGB CONCERT BOT = TGB ANCHOR EVENT BOT.** They filed into
  one table by two doorways on two schedules, and the second was the narrower:
  concerts only, ten a call, through a function whose payload keys are a legacy
  contract rather than the column names. The merged spec is
  [anchor-event-bot.prompt.md](mc/_dev/prompt-tools/anchor-event-bot.prompt.md).
- **IT KEPT TGB ANCHOR BOT'S TRIGGER ID**, `trig_01HKMKbnCyH6WLKuw7ZstY5b`, and
  that is the point rather than a convenience: **the new ANCHOR BOT button in the
  events room holds that id in an `href`, and a stale one 404s silently.** This
  project lost `trig_01Q5uCitt...` to a delete on 2026-08-20 and had to repoint
  four places.
- **CONCERT BOT IS DISABLED, NOT DELETED**, and renamed so the routine list says
  why. A trigger id does not survive a delete; disabling keeps the id, the
  prompt and the model pin, and is one flag from running again.
- **`tgb_pull_concert_tours` IS NOW CALLED BY NOTHING.** It is left in the
  database, retired in place, and the merged spec says in as many words not to
  call it. The surviving doorway takes every kind and **its payload keys are the
  column names**, which is why it was the one to keep.
- **THE NINE EM DASHES IN THE OLD SPEC WERE FIXED ON THE WAY THROUGH**, each
  replaced by the punctuation its own sentence wanted rather than by a blanket
  swap. The rule is not decoration: a prompt littered with them teaches the model
  to write them back, and this file had been quietly breaking it since it was
  written.

### THE THIRD ADD BUTTON

`MANUAL | PROMPT | ANCHOR BOT` in the events room.

- **A DOOR, NOT A CONTROL.** Firing a routine is a POST to the claude.ai trigger
  API with an OAuth bearer, and this page is public HTML on GitHub Pages: **a
  token in it is a published token.** It opens the routine where Run is, and the
  tooltip says so rather than leaving somebody pressing it twice.
- **A REAL `<a>`**, so middle-click and ctrl-click work and it survives this
  page's JavaScript failing.

## THE EVENTS ROOM HAS NO STATUS, AND TWO FILTERS (2026-08-28)

### NO STATUS AND NO REVIEW COLUMN

`issues` / `issues_detail` replaced the only job `status = 'review'` was doing.
What was left was one column carrying two unrelated ideas, which this file has
recorded as a cost since the sweep started writing it.

Gone with it: the Status field, `STATUS_VALUES`, the sweep's second write, the
ESPN importer's status mapping, and **five rules that existed only to check a
status against something** -- `bad-status`, `postponed`, `score-without-final`,
`final-without-score` and `past-but-scheduled`.

- **`past-but-scheduled` IS THE ONE WORTH REGRETTING.** It was the staleness
  signal, and nothing sweeps this table. Without a status there is nothing to BE
  stale: a past event is a past event, which the date says.
- **THE COLUMN IS RETIRED IN PLACE, not dropped.**
- **`isInReview` IS NOW ONLY WHAT THE RULES SAY.** There is no hand-flagged row,
  so a row is in review while the rules object and stops the moment they do not.

### SEARCH AND FILTER ARE ONE BOX, ON THEIR OWN ROW

The first row is what CHANGES the table (Add, View); the second only changes
what you are LOOKING at, and it sits directly above the list it narrows.

- **ONE FLEXIBLE BOX PER ROW**, or the free space splits between two and neither
  end stays pinned. `.bar-row .command-bar--check` has to out-specify the
  `margin: 0` reset at (0,2,0) to stay pinned right.

### THE THREE CHECKBOXES ARE GONE, AND TWO PICKERS REPLACE THEM

**A FILTER EARNS ITS PLACE ONLY BY REACHING SOMETHING YOU CANNOT TYPE.** The
search box already matches kind, league, club, venue, city and source, so a
picker for any of those is a second way to do what typing does. **A date RANGE
and a stored FLAG are not text**, which is the whole test.

| picker | options |
|---|---|
| **When** | any date, upcoming, next 30 days, next 90 days, past |
| **Issues** | any, has issues, clean |

- **TWO PICKERS AND NOT ONE, because the axes are independent.** "Upcoming AND
  has issues" is a real question and a single select cannot express it.
- **WHEN IS MEASURED AGAINST `end_date`** where there is one, so a festival
  running across today is upcoming on its first morning rather than past.
- **A ROW WITH NO DATE AT ALL IS SHOWN UNDER EVERY WINDOW.** It is exactly the
  row somebody has to fix, and a date filter that hid it would hide the fault
  with it.
- **`isoPlusDays` IS LOCAL, because `todayIso()` is.** Built from UTC the window
  would be a day out for half of every day.
- **ISSUES READS THE STORED FLAG, not a recomputation.** It is what the last
  audit said, which is what a reader outside this page sees too.

### AND THERE IS NO ARCHIVED / LIVE SPLIT

Every event is on the list, removed or not. **A removed row is told apart by its
own button, which reads Restore instead of Delete** -- and only once the row is
opened, which is the cost of this: on a closed row nothing distinguishes one.

## AN EVENT ROW CARRIES THE AUDIT'S ANSWER (2026-08-28)

`public.events.issues`, `'NO'` by default, `'YES'` on a row the checks object
to. [2026082801_events_issues_column.sql](mc/supabase/migrations/2026082801_events_issues_column.sql), **applied**.

- **NOTHING WRITES `public.issues`, AND THAT IS THE POINT OF THE COLUMN.** The
  two are different shapes of one idea and the difference is worth stating,
  because the obvious tidy-up later is to merge them. `public.issues` holds one
  row per FINDING, in words, filed by a routine that ran hours ago and is not
  here to be asked. `events.issues` is one flag per EVENT, computed by rules
  that live in the page and can be re-run in front of you. **The findings
  themselves are never stored** -- they are recomputed on every render and drawn
  on the row -- so a row in `public.issues` would be a copy that goes stale the
  moment somebody fixes the date.
- **IT IS NOT `status`, AND THE TWO BEHAVE DIFFERENTLY ON PURPOSE.**
  `status = 'review'` is a HUMAN'S flag: the sweep only ever sets it and never
  clears it, because the check cannot know whether the fault was dealt with or
  merely made to stop matching. **`issues` is the MACHINE'S answer and moves
  both ways** -- fix a date, re-run, and it goes back to NO. Keeping them apart
  is what lets a row be `review` with `issues = NO`: somebody flagged it by hand
  and the rules have nothing to say about it.
- **WRITTEN ONLY WHERE IT WOULD CHANGE**, so a second press writes nothing, and
  **read back on every PATCH**: PostgREST answers 200 with an empty array when
  RLS refuses, and a flag nobody checked is worse than no flag.
- **THE FLAG IS WRITTEN BEFORE THE REVIEW SWEEP**, so a run refused partway
  leaves the machine's own answer correct on the rows it reached.
- **IT IS NOT DRAWN ON THE ROW.** The row already carries its findings as
  annotation lines, computed live, so a YES badge beside them would be the same
  fact twice and would go stale the moment somebody fixed something without
  re-running. **What it is FOR is anything reading the table from outside this
  page.** It shows in the run's own message instead, or a column would be
  maintained that nobody ever sees change.
- **`'YES'` / `'NO'` WITH A CHECK**, matching what `public.games` already does
  with `featured` and `archived`, but without the looseness that convention
  usually brings: `'true'`, `''` and `'Y'` are all refused.
- **NOT BACKFILLED.** Every row starts at the default, and `'NO'` has to mean
  "the checks found nothing" rather than "the checks have not run" -- which only
  a run can establish.

### AND WHAT IT FOUND, IN WORDS (2026-08-28)

`public.events.issues_detail`, [2026082802](mc/supabase/migrations/2026082802_events_issues_detail.sql), **applied**. One finding per line, in
the same sentences the row draws on screen.

- **THE FLAG ALONE ANSWERED NOTHING.** `issues = 'YES'` is readable by anything
  and says only THAT something is wrong. The findings live in the page and are
  recomputed on every render, so a person reading this table in the Supabase
  editor could see a row had been objected to and had no way to learn why but to
  open the room and press the button again.
- **NON-EMPTY IF AND ONLY IF `issues` IS 'YES', AND A CHECK CONSTRAINT ENFORCES
  IT.** A flag with no words, or words with no flag, is the one state a reader
  could not interpret -- and it is exactly what a half-applied write leaves
  behind. **They travel in one PATCH**, so sending them separately would fail on
  whichever went first.
- **THE FORCING REASONS ONLY, NEVER THE MUTED NOTES.** `no-time` and `multi-day`
  report without accusing the row, so including them would put text on rows
  whose flag says NO -- which the constraint now refuses outright.
- **THE DETAIL IS PART OF THE COMPARISON, NOT JUST THE FLAG.** A row that is YES
  before and after but for a DIFFERENT fault would be skipped by a flag-only
  check, and its words would go on describing something that is no longer there.
  Asserted with a row built to do exactly that.
- **IT IS A SNAPSHOT AND THE COMMENT SAYS SO.** Fix a date and the row on screen
  stops saying it immediately; the column keeps saying it until the sweep runs
  again, when both are rewritten together.

## THE THREE AUDIT FINDINGS, FIXED, AND THE NFL SHELF FILLED (2026-08-27)

[2026082708_audit_clock_and_spotify_sweep.sql](mc/supabase/migrations/2026082708_audit_clock_and_spotify_sweep.sql), **applied**.

### 1. THE AUDIT CLOCK IS WOUND AGAIN, BY ITS OWN PAYLOAD KEY

`tgb_report_soundtrack_issues` takes `{"audited": [...], "issues": [...]}` and
stamps `last_audit_at` on every tape named in the first.

- **IT CANNOT BE INFERRED FROM THE FINDINGS, and that is the whole design.** A
  clean tape files nothing, so stamping only the tapes that produced a finding
  would leave a tape in good order looking permanently unaudited and send it to
  the front of the queue forever -- **the same failure this clock exists to
  prevent, arrived at from the other side.**
- **THE `tgb-agent-context` BLOCK HAD DESCRIBED THIS KEY ALL ALONG** and it was
  never implemented. It is now, and the reply carries `audited_rows_stamped` so
  a run can see the clock move.
- Proved by a call that filed nothing: `{"audited":["denver"],"issues":[]}` came
  back `audited_rows_stamped: 14`.

### 2. THE 198 TRACKS WITH NO ID ARE ALL FILED

`tgb_sweep_missing_spotify_ids(limit)` walks the catalogue oldest-audited first
and files a `spotify` finding at `warn` for each. **All 198 are on file**, so
`/mc/issues.html` has a real queue for the first time.

- **IT IS NOT A ONE-OFF SCRIPT AND SHOULD RUN EVERY BOT RUN.** New rows arrive
  without ids from the Tape Room's own hand-add, and the audit only ever reaches
  the five tapes a run looks at.
- **IDEMPOTENT BY THE AUDIT'S OWN FINGERPRINT**, so it never files a second copy
  of something already open, and the cap counts NEW findings rather than being
  spent re-checking.

### 3. THE `tgb-agent-context` BLOCK PARSES, AND IT WAS NEVER THE QUOTES

This file has blamed an unescaped quote around *"song 177"* twice. That was real
and it was not the reason. **One entry in `auditPath` was a bare string with no
key at all** -- a value where every sibling is a pair -- which is invalid
whatever the quotes do. It is `writeNamesNotIds` now, the four prose quotes are
single, and `JSON.parse` returns 12 top-level keys.

- **THREE REPAIR SCRIPTS FAILED BEFORE ONE WORKED**, and each failure is a
  lesson: a left-to-right scanner cannot tell a closing quote from a prose one
  inside a value that quotes two words; a parser-guided walk-back destroys the
  structural quote at the END of a key, because that is what the parser objects
  to; and a neighbour-based rule must refuse a quote that is **already escaped**,
  or `\"` followed by a space becomes `\'`, which is not a valid escape at all.
  **Each script refused to write anything that still would not parse**, which is
  the only reason none of them left the block worse.

### THE NFL SHELF IS LIVE, AND TWO NUMBERS COME WITH IT

**487 tracks un-shelved across 29 NFL cities and 34 tapes.** The public page
goes from **9 tapes to 39** and from 119 live tracks to **605**.

- **`archived_with_tape` WAS CLEARED WITH THEM.** That flag means *this track
  was shelved BY its tape* and is what a later tape-wide restore reads; left set
  on a row that is now live, the next restore would think it still owned it.
- **148 OF THE 605 HAVE NO SPOTIFY ID, AND THE DECK SKIPS THEM.** They are drawn
  in the tracklist and cannot be played, which is the documented fallback and is
  why each is now a finding.
- **SIX TAPES ARE ENTIRELY UNPLAYABLE**, every track on them lacking an id:
  Charlotte *Keeps Pounding* (29), New Orleans *Who Dat* (27), Tampa *Fire the
  Cannons* (26), Atlanta *Rise Up Rhythms* (24), New Orleans *Brass* (15) and
  *Trad Jazz* (15). **A visitor opening one gets a cassette that plays nothing.**
  Re-shelving them is one statement if that is wanted:

      update public.soundtrack set archived = true
       where (city_slug, tape) in (
         select city_slug, tape from public.soundtrack where not archived
          group by city_slug, tape
         having count(*) filter (where spotify_id is not null) = 0);

## SOUNDTRACKS — ONE TABLE, ONE PROMPT (2026-08-25)

**`public.soundtrack` is one row per TRACK, and the tape is `(city_slug, tape)`.**
There is no tape table, no `soundtrack_songs`, no `soundtrack_issues`, no tape id
and no cascade trigger. Migrations [2026082508](mc/supabase/migrations/2026082508_soundtrack_one_table.sql),
[2026082509](mc/supabase/migrations/2026082509_soundtrack_write_paths.sql),
[2026082510](mc/supabase/migrations/2026082510_tape_archive_cascade.sql),
[2026082511](mc/supabase/migrations/2026082511_soundtrack_spotify_check.sql). **All applied.**

**WHY THE PAIR COULD GO:** checked before relying on it, **113 tapes and 113
distinct `(city_slug, spine_tag)` pairs, no blank spine tag, and no tape with
zero songs**. That last count is the one that mattered: a track-per-row table
drops an empty tape silently, and 0 is what made the shape safe.

- **A TAPE-WIDE WRITE GOES THROUGH A FUNCTION, NEVER A PATCH.** A tape is every
  row of it, so a filter somebody forgets to scope rewrites the whole city.
  `tgb_set_tape_archived`, `tgb_set_all_tapes_archived` and `tgb_rename_tape` are
  `SECURITY INVOKER` -- they are there for the RULE, not for privilege, which is
  the opposite of the six pulls.
- **THE SHELVE CASCADE HAD TO STAY IN THE DATABASE.** It was a trigger on the
  tape row and there is no tape row now. In a function it still holds for psql
  and the table editor, and a client that dies between two requests cannot leave
  a tape shelved with its tracks live. **`archived_with_tape` is still the whole
  mechanism**: restoring only un-shelves what the tape took down, so a track
  shelved on its own stays shelved, that row being a do-not-rescrape tombstone.
  Proved by a shelve-then-restore round trip that left **0 rows** different.
- **A TAPE IS SHELVED WHEN EVERY TRACK ON IT IS.** `soundtrack_stats.archived`
  is `bool_and(archived)`, and both pages derive it the same way. There is no
  flag to carry.
- **`findings` IS A jsonb COLUMN ON A PUBLICLY READABLE TABLE**, which is a leak
  waiting to happen and was one for a few minutes on 2026-08-25. **A table's
  privacy is a property of the TABLE**, so folding a private table into a public
  one publishes it. Shut with **per-column grants**, because a column-level
  REVOKE cannot override a table-level grant. **`select=*` as `anon` now answers
  42501; both pages name their columns. Do not put `*` back.**
- **A TAPE-SCOPE FINDING SITS ON THE TAPE'S LOWEST-POSITION TRACK**, carrying
  `"scope":"tape"`. It draws above the tracks exactly where it always did. The
  writer keys on `stored_on`, never `song_id`, which is null for those.
- **`soundtrack_findings` is the view** the hub reads: PostgREST cannot count or
  list a jsonb array. `security_invoker`, `authenticated` only.
- **The spotify CHECK was LOST in the flatten and put back** by 2026082511. A
  fabricated 22-character id passes every eye and silently plays nothing.

### THE CLEANUP, AND THE ESCAPING SCAR'S ROOT CAUSE (2026-08-25)

[2026082512](mc/supabase/migrations/2026082512_soundtrack_cleanup.sql), **applied**. The database now holds
**one table, two views, seven functions and one trigger** for soundtracks, and
nothing else.

- **`tgb_resolve_soundtrack_finding` WAS BROKEN AND NOTHING SAID SO.** It still
  wrote `soundtrack_songs` and the old tapes table, so **the hub's Clear button
  on a finding raised `42P01` the moment an admin pressed it**. A plpgsql body
  is stored as TEXT and resolved at runtime, so a rename breaks it silently
  until something calls it. **Third time this project has been bitten by that.**
- **THREE TABLES WERE DROPPED, WHICH THIS PROJECT NORMALLY REFUSES TO DO.**
  `soundtrack_issues`, `soundtrack_songs_retired`, `soundtrack_tapes_retired`.
  The rule is retire-in-place because a drop is irreversible; **these were
  duplicates rather than history**, proved before the file was written: 0 songs
  missing, 0 differing, 0 tapes unrepresented, 285 findings against 285 issues.
  A duplicate nothing reads is what makes the next reader ask which copy is true.
  - **THE DROP ORDER IS THE DEPENDENCY ORDER and the first run failed on it.**
    `soundtrack_issues.song_id` is a FK into the songs table. Dropped innermost
    first so **no `cascade` is needed**, which is the point: cascade would
    silently take anything else that happened to depend on them.
- **FIVE DEAD TRIGGER FUNCTIONS WENT.** A trigger function with no trigger is
  what makes somebody re-attach it to the wrong table.
- **`certified_at` AND `rejected_at` STAY.** Unread, since `archived` is the
  whole state model, but `rejected_at` is the only record of which tracks a
  HUMAN turned down as against the ones a routine filed and nobody reached.
  Their comments say they are retired.
- **The pages lost 12.5KB and 7.7KB** of CSS and JS that referenced nothing:
  the deleted queue view's rules, and on the public page the **scrolling
  cassette shelf's entire stylesheet**, which had outlived its markup. Nine
  uncalled functions in the room and three on the public page went with them.

**THE ESCAPING SCAR HAS A ROOT CAUSE, FOUND ON THE TWELFTH INSTANCE.** **A
quoted heredoc in this environment still eats one level of backslash.** So
a backslash-b written into a `<<'EOF'` block reaches the file as a literal
**backspace byte**, not a word boundary. That is why a NUL, a newline and
several word boundaries have all landed as control characters here, and why a
detector written that way **found nothing and looked like a clean codebase**. **Write tooling with no backslashes at all** -- `split()`
instead of a regex, `String.fromCharCode`, `JSON.stringify` for a compound key.
`cat -A` is what shows it, since these are invisible in a normal diff.

### TGB SOUNDTRACK BOT HAS NO SCHEDULE. IT IS RUN BY HAND. (2026-08-25)

`cron_expression` is cleared on `trig_014sqaUyU7557svq9mGA1E4a`, so
`next_run_at` is the zero value and nothing fires it. **`enabled` stays true**,
which is the point: a disabled routine is a different thing, and this one is
still meant to be run, just by a person pressing Run at claude.ai.

- **NOT DELETED, AND THAT IS THE STANDING RULE HERE.** A trigger id does not
  survive a delete, this project lost `trig_01Q5uCitt...` that way on
  2026-08-20 and had to repoint four places. Clearing the cron changes one
  top-level field and leaves the prompt, the model pin and the git source
  untouched, which was verified by reading the reply back.
- **IT IS THE ONLY TGB ROUTINE OFF THE SHARED SCHEDULE**, so the `:5` slot in
  the twice-daily stagger is now free.
- **TWO STALENESS SIGNALS HAD TO GO WITH IT, OR THEY WOULD BE PERMANENTLY RED.**
  Both existed because a run that errors writes nothing, so a stale last-filed
  WAS the failure notice. **With nothing firing it, a gap is a decision rather
  than a failure**, and a red edge that is always on is a signal nobody reads.
  - The Tape Room's `.btn.is-stale` on the TGB SOUNDTRACK BOT button, and
    `REVIEW_HOURS` / `STALE_AFTER_HOURS` with it. **`stale` survives for the one
    thing still a fault**: not being able to read the table at all.
  - The hub's routine row is `cron: 'by hand'`, `stale: null`. **The guard had
    to learn to test it**: `anything > null` is `anything > 0`, so without
    `Number.isFinite(r.bot.stale)` a hand-run routine would go red the minute
    after it ran. Every other routine's threshold is unchanged.

### SOUNDTRACK HAS NO TIE TO `public.cities` (2026-08-25)

[2026082514](mc/supabase/migrations/2026082514_soundtrack_carries_its_city.sql) and [2026082515](mc/supabase/migrations/2026082515_rename_tape_carries_label.sql), **applied**. Three ties went
together: the foreign key, the pull RPC's catalogue check, and both pages'
`cities` read. **The row carries `city`, `state_code`, `state_name`,
`country_code` and `country_name` now**, backfilled from the catalogue that was
supplying them, so nothing looks different.

- **`city_slug` STAYS. It is the tape's other half** -- the tape is
  `(city_slug, tape)`, it leads the unique index, and `/soundtracks/#denver` is
  a slug. It simply stopped being a foreign key.
- **`hide_from_soundtracks` NO LONGER STOPS ANYTHING, and it cost something the
  same afternoon.** The public page went from **96 cards to 97**: **Glendale,
  Arizona** is a venue town with 14 live tracks that the flag had been hiding,
  and it is now on `/soundtracks/`. **`archived` is the only mechanism left**,
  so shelving that tape is the fix if it is wanted off. The flag still governs
  the gift shop and the games rails; it governs nothing here.
- **THE RULE MOVED INTO THE BRIEF, which is now the whole guard.** Section 4 of
  [soundtracks.md](mc/soundtracks/soundtracks.md) says in as many words that the database will not
  stop you any more. That is a real weakening and is recorded rather than
  glossed.
- **A COLUMN ADDED AFTER A PER-COLUMN GRANT IS NOT COVERED BY IT.** The table's
  SELECT grant to `anon` excludes `findings`, so it is enumerated -- and five
  new columns would have been unreadable, which would 401 the public page,
  because that page names its columns. The migration re-issues the grant.
- **THE LABEL TRAVELS WITH THE SLUG ON A MOVE.** `tgb_rename_tape` gained
  `p_new_label` and the four parts; without it a moved tape would keep the old
  city's NAME on every row, which is the half a human actually reads. **The
  five-argument signature was DROPPED rather than left beside the new one**:
  PostgREST matches an RPC by the names it is sent, and two overloads that both
  accept the same five make it refuse to choose with a 300 that reads like the
  function is missing.
- **THE PICKER CAN ONLY SUGGEST A CITY THAT ALREADY HAS A TAPE**, since the map
  is built from the tracks. The box is free text, so a new city is typed rather
  than offered, and `slugFromLabel` derives its slug the way the catalogue does:
  city name only, lowercased, hyphenated.
- **THE HARNESS NOW REFUSES `public.cities` OUTRIGHT** and fails the run if
  either page asks for it, which is the only way this stays cut.

### THE MAIN LIST IS TRACKS, NOT TAPES (2026-08-25)

Every track is on the room's main list: **113 tape lines and 1,643 track rows**,
the tracks indented under the tape they belong to.

- **IT IS THE POPUP'S ROW, NOT A SECOND ONE.** `renderTrackLine` builds both, so
  there is one track row in this project and not two to keep in step. It is the
  fully editable row: position, title, artist, blurb, spotify id, explicit, the
  status switch and delete, all working from the main list.
- **`--track-cols` HAD TO BE RE-DECLARED ON `.track-line--in-list`.** It was
  scoped to `.track-head, .track-lines`, which are inside the popup, so out here
  it would have resolved to nothing and **collapsed every column to zero width**.
- **`repaintTracks()` EXISTS BECAUSE `renderTracks()` RETURNS EARLY WHEN THE
  POPUP IS SHUT.** Every repaint inside a track row went through it, or saving,
  shelving or deleting a track on the main list would change the database and
  leave the row on screen showing the old value. Ten call sites.
- **THE TAPE LINE STAYS, AS A HEADING.** It is where the tape's own controls
  live: the counts, the findings, the shelve switch and the delete. A flat list
  with the city repeated on every row would have deleted all four. **Say so if
  it should be flat.**
- **EVERY TRACK ROW SAYS WHICH TAPE IT IS ON**, in tiny mono above the title.
  Past 1,643 rows the tape heading scrolls away, so a row reading only
  "Abilene / George Hamilton IV" left you scrolling back to find out where it
  belonged. **It is hidden inside the popup by CSS rather than by a branch in
  the builder** (`.track-lines .track-tapetag { display: none }`), because there
  the tape's name is the dialog's own title and it would be the same thing said
  twice. One builder, no argument to pass.
  - The title cell became a **wrapper** (`.track-titlecell`), since text cannot
    go inside an `<input>`. The wrapper is the grid child now, not the input.
- **THERE ARE TWO HEADERS, ONE PER ROW TYPE, AND THAT IS THE POINT.** The tape
  head carries the sorts, the three figures and the master filter, and aligns
  with the tape lines. The new `.track-head--main` carries **# Title Artist
  Blurb Spotify E Status Del** and aligns with the track rows. **One of it
  serves all 1,643**, because every track row carries the same fixed
  `--track-cols` and the same indent. A test asserts the header's column
  template and its child count both equal the row's.
- **ONE TAPE AT A TIME, WITH BACK AND NEXT.** Showing all of them was **27,672
  nodes and about 10,000 form controls**; one tape is **274**. A hundredfold,
  and it is what makes a fully editable row per track affordable at all.
  - **THIS IS NOT A SILENT CAP, WHICH IS THE RULE IT HAD TO SATISFY.** Nothing
    is truncated and nothing is dropped: the pager says *3 of 113* and every
    tape is two presses away. A top-N that quietly stops at 60 is the thing this
    project has deleted before.
  - **`tapeAt` IS A POSITION IN THE FILTERED, SORTED LIST, NOT A TAPE ID.** So a
    filter that removes the tape you were on lands you on whatever moved into
    its place rather than on nothing. It is **clamped, never wrapped**: running
    off the end onto the first tape makes a long list feel endless, and the
    buttons grey out to say why instead.
  - **A FILTER RESETS TO THE TOP.** Keeping the position would land you on
    whatever happens to be 50th in a completely different list.
  - **THE TAPE'S HEADLINE CARRIES ITS STATE AND COUNTRY**, off the row's own
    `state_name` / `country_name`. With one tape on screen that line is the
    tape's identity, and a city alone is ambiguous often enough to be worth the
    words: this catalogue holds two Alexandrias and two Portlands.
  - **A STATE THAT REPEATS THE CITY IS DROPPED.** Several places genuinely share
    a name with the division around them, and the catalogue is right to hold
    both: Algiers is in Algiers Province, New York is in New York. *Algiers,
    Algiers, Algeria* is still the line saying it twice. Checked across the real
    rows: London reads `England, United Kingdom`, Toronto `Ontario, Canada`,
    Algiers `Algeria`, New York `United States`.

### THE HEADERS, ONCE THE ROOM SHOWED ONE TAPE (2026-08-25)

The room had three bars stacked above a list, and two of them were describing
columns they were nowhere near.

- **`.tape-head` IS A SORT AND FILTER BAR NOW, NOT A COLUMN HEADER.** It was a
  grid on `--tape-cols` with labelled columns, which made sense over a list of
  113 tape lines and stopped making sense the moment one tape showed and the
  pager sat between them. It is `.room-controls`: a flex bar with a **SORT**
  group (Country, State, Tape) and a **SHOW** group (Issues, New, Shelved/Live),
  with the catalogue-wide Tracks figure pushed to the far end by `margin-left:
  auto` **so it does not read as a fourth thing to press**.
- **THE TRACK COLUMN HEADER IS EMITTED PER TAPE, between the tape's line and its
  tracks.** In the static markup it sat above the pager, naming columns three
  bars away from the rows they belonged to. `buildTrackHead()` builds it.
- **THE TAPE LINE WAS RENDERING UNDER ITS OWN TRACKS**, and had been since the
  track rows were added. `trackArchiveList.appendChild(row)` is the LAST
  statement of the tape loop, so the track block appended before it went in
  first. The row goes in before its tracks now. **Order in a loop like this is
  not visible in a diff and is not visible in a `textContent` assertion; the
  check reads the list's children in order.**
- **The issue dots stay on the tape line** and are unaffected: 3 of them on
  Baton Rouge, in the same cell they were always in.
- **THAT REBUILD SHIPPED THE WHOLE ADD / VIEW BAR TWICE, AND A SECOND
  `#roomBody` WITH IT.** The edit inserted the new controls bar and then failed
  to remove the old markup, so the room drew two identical command bars and the
  panel was split in half around them. **Two elements shared an id and nothing
  complained**: `getElementById` returns the first, which happened to be the
  right one, so every control still worked and only the eye caught it.
  - **The duplicate was compared byte for byte before being deleted**, rather
    than assuming which copy was the good one.
  - **The check now looks for repeated ids**, which is the cheap thing that
    would have caught it: `id="roomBody"` twice was the tell, and the standing
    id check only asks the opposite question, whether a wired id is missing.

### SHELVING A TAPE SHELVES ITS TRACKS, ON SCREEN AS WELL (2026-08-26)

The database always did it: `tgb_set_tape_archived` writes every row of the tape
and stamps `archived_with_tape`. **The page did not show it.** The tape row's own
switch flipped `tape.archived` in memory and never reloaded, so the tape read
SHELVED with fifteen LIVE tracks under it until something else forced a refresh.

- **IT WAS INVISIBLE UNTIL THE TRACKS CAME OUT OF THE POPUP.** With the tracks
  behind a dialog you reopened it and saw the truth; with them on the page the
  row and its tracks openly disagreed. **A change of surface turned a harmless
  shortcut into a visible lie.**
- **`setTapeArchived` HAD ALWAYS RELOADED.** Two paths to one act, one of them
  correct, which is the shape this file keeps warning about.
- **A FAILED RELOAD IS SAID OUT LOUD** and names the fix, because the write did
  land: the database is shelved and only the page is behind.
- **The notice now says what else moved** -- "with its live tracks" one way,
  "with the tracks it took down, a track shelved on its own stays shelved" the
  other.
- **PROVED BY A STUB THAT MODELS THE FUNCTION**, not one that answers OK.
  Shelving Aachen shelved all 30 of its tracks on screen and dropped the
  catalogue's live count by exactly 30; restoring brought them back and returned
  the count to where it started.

### EXPLICIT AND SPORTS ARE SPELLED OUT (2026-08-26)

The two checkbox columns read **Explicit** and **Sports** rather than `E` and
`S`, at 0.5rem, and their columns went from 30px to 48px to hold a word.

- **TWO UNLABELLED CHECKBOXES SIDE BY SIDE, ONE LETTER EACH.** You had to hover
  one to learn which was which, every time. A word is unambiguous at any size,
  and these are not something you read, they are something you glance at to tell
  two boxes apart.
- **SET BELOW THE REST OF THE HEADER**, which is 0.62rem. They are the two
  narrowest columns on the row and a word in them at the header's own size would
  be the widest thing in the bar.
- **BOTH HEADERS CHANGED TOGETHER**: the built one on the main list and the
  popup's static markup. **Four places move when this grid changes** -- the two
  `--track-cols` declarations, the built header's cell list, and that markup --
  and the standing warning is that missing one puts every label a column away
  from the field it names.

### THE DELETE QUESTION IS IN PLAIN WORDS (2026-08-26)

Every delete confirmation in this room said the tracks *"take their
do-not-rescrape tombstones with them"*. **That is our schema talking.**
`tombstone` is the name for a shelved row and nobody standing at that screen has
any reason to know it. All three messages now read:

> Delete 2 tracks for good? This cannot be undone, and the bot may find them and
> file them again. Shelving keeps them off /soundtracks/ and stops that.

- **THE CONSEQUENCE, NOT THE MECHANISM.** What a person needs to decide is that
  a deleted track can come back on the next run and a shelved one cannot. How
  that works is the unique index's business.
- **SWEPT ACROSS ALL THREE**: the selection confirmation, the single-row
  confirmation, and the notice after a single delete. **The `tgb-agent-context`
  JSON block keeps the precise term** -- that block is read by an AI, which does
  need the mechanism.
- **SHELVE INSTEAD IS ONLY OFFERED WHEN IT WOULD DO SOMETHING**, and the
  sentence recommending it goes with the button. On a selection that is already
  shelved the button would write `archived = true` over `archived = true` and
  report a success that changed nothing; recommending it while not offering it
  is the page telling you to press something that is not there.
  - **REMOVED RATHER THAN GREYED**, which departs from this room's usual rule
    that a button holds its place so the others do not move. **That rule is for
    a ROW**, where the same verbs sit in the same order on every one and the
    position is what you aim at. This is a question you read before you answer
    it, and an answer that cannot apply is better not offered.
  - **PROVED BOTH WAYS.** Everything but New Orleans is shelved, so the
    "offered" branch is never reached on the first tape and the button could be
    missing everywhere without a test noticing; the check walks to a live track
    and asserts it is there.

### THE HEADER'S X DELETES THE SELECTION, AND THERE IS NO TAPE DELETE (2026-08-26)

The `x` at the end of the track header deleted the whole tape. It now deletes
**the ticked tracks and nothing else**.

- **THAT CAPABILITY IS GONE RATHER THAN RELOCATED, and it must not be described
  as the same thing reached a different way.** Deleting a tape and deleting all
  of a tape's tracks are different acts with different scopes, and the second is
  the only one this room still offers. `tapePendingDelete`, `renderTapeConfirm`
  and `deleteTape` went with it.
- **`tapePath` WENT TOO, AND SHOULD NOT COME BACK FOR CONVENIENCE.** It built a
  filter matching EVERY ROW OF A TAPE, which is precisely the scope nothing in
  this room writes to any more: the x acts on ticked ids and so does the bulk
  bar. A tape-wide filter somebody forgets to scope rewrites a whole city.
- **IT IS OFF, NOT ABSENT, WITH NOTHING TICKED.** A control that vanished would
  move the ones beside it, so the position of the one you want would depend on
  the state of the selection. **`aria-disabled`, not `disabled`** -- a disabled
  button dispatches no click at all, so on a touch screen the reason it is off
  would be unreachable. Pressing it says *tick the tracks you want to delete
  first*.
- **THE BULK BAR LOST ITS OWN DELETE.** Two controls for one act, a few inches
  apart, is the duplication this room keeps removing. The bar sets columns; the
  x deletes.
- **THE QUESTION CARRIES THE CONSEQUENCE NOBODY EXPECTS.** That the rows go is
  obvious; that the tracks take their **do-not-rescrape tombstones** with them is
  not, and it is the reason **Shelve instead** sits on the confirmation as the
  first button.

### A TRACK IS A BADGE, AND THE PLAYER IS A DIALOG (2026-08-26)

Twelve columns became a card. **A grid gave a title, a checkbox and a delete
button the same weight**, and the whole thing was only legible against a header
that no longer exists.

**THREE PARTS, EACH ANSWERING ONE QUESTION:**

| part | question |
|---|---|
| **rail** (92px) | what you DO with it: tick, play, position |
| **body** (1fr) | what it IS: its tape, its title, its artist, its blurb |
| **tail** (330px) | what we KNOW about it: spotify id, the two flags, its state |

- **NOTHING WAS DROPPED AND EVERY FIELD IS STILL EDITABLE IN PLACE.** What
  changed is weight: the title is 1.02rem at 700, the artist and blurb are
  muted, and the spotify id is the quietest thing on the card because it is 22
  characters of machine text nobody reads.
- **THE STATE IS THE LEFT EDGE**, four pixels of colour as an INSET SHADOW rather
  than a border, so the corner stays round. Green live, grey shelved, accent on
  hover. **A shelved badge is quieter, not hidden** -- it is most of the
  catalogue and has to stay readable.
- **THE TWO FLAGS ARE PILLS.** Unticked is a quiet outline; ticked is filled and
  the word takes the accent, so `EXPLICIT` reads from across the list without
  hunting for a checkbox.
- **THE NEW BADGE PINS TO THE CARD'S CORNER**, because it is news about the row
  rather than a column that is empty on 1,600 of 1,643 of them. A TAPE has no NEW
  badge any more; `newBadge` and `isNewTape` went with the tape line.
- **`titleCell` IS GONE.** It existed to stack three things inside one grid
  column; the body IS that stack, so it is one box fewer between the fields and
  the card.

**THE PLAYER IS A DIALOG.** It opened under the row, which pushed every badge
below it down by 152px and **moved the one you were looking at**.

- **THE IFRAME IS TORN DOWN, NOT HIDDEN.** A hidden Spotify embed keeps playing,
  which is a room making a noise with nothing on screen to explain it.
- **REBUILT ONLY WHEN THE TRACK CHANGES**, or every render would restart the
  track under whoever is listening to it.
- **ONE `playingTrackId`, AND THE CARD IS PAINTED FROM IT**, so a badge and the
  dialog cannot disagree about what is playing. A playing badge keeps its button
  filled.
- **THE PLAY MARK IS A DRAWN SVG, NOT A GLYPH.** This project has already found
  that no face it loads carries the four arrows it wanted; a triangle at 20px is
  the same risk, and an SVG takes `currentColor` so hover and pressed need no
  second rule. It swaps to a stop mark while playing.
- **IT IS THE BADGE'S ONE ROUND THING**, 38px, which is what makes it findable at
  a glance in a list of squares.
- **ESCAPE CLOSES THE PLAYER FIRST** when it is open, being the thing on top.

**SWEPT WITH IT**: `.track-play`, `.track-stage`, `.track-titlecell`, the
header's tick-cell rules, `buildTrackHead` and `TRACK_HEAD_CELLS`. `trackPlayer`
still builds `.queue-player` and `.queue-noplayer`; their rules moved into the
dialog and are scoped to `#playerStage`.

### THE TRACK FILTERS ARE ONE LABELLED RADIO GROUP (2026-08-26)

**All · Live · Shelved · Explicit · Sports**, in NAV, exactly one on.

- **A RADIO GROUP IS WHAT "ONE FILTER AT A TIME" MEANS.** It was a tri-state
  switch plus two toggle buttons, and *choosing one clears the others* was a rule
  **three controls enforced on each other**. Here the control says it, and the
  browser keeps it.
- **THE LABEL WRAPS THE INPUT**, so the word is part of the control rather than a
  caption beside it: clicking either picks the option. A test asserts every word
  is inside a label that holds a radio.
- **THE TWO STATE VARIABLES STAY.** `trackAirFilter` is read by the popup's own
  switch and `trackFlagFilter` by the row test, so `currentTrackFilter()` maps
  them to one answer and `chooseTrackFilter()` sets them. Collapsing them into
  one string would mean touching both readers.
- **`setTrackFlag` AND THE AIR SWITCH'S BAR STYLING WENT WITH THE BUTTONS.** The
  popup keeps its own switch, which is why `.tape-air` is still live.

### ALL THREE CHECKBOXES CARRY A WORD (2026-08-26)

- **THE TWO ON A ROW.** The header that named those columns is gone, so an
  unlabelled checkbox beside another unlabelled checkbox was a coin toss you had
  to hover to settle, **on every row**. `Explicit` and `Sports` at 0.5rem, the
  size the header's own labels were: not something you read, something you glance
  at to tell two boxes apart. Their columns went 48px to 82 and 74.
- **THE SELECT-ALL.** One tick in a bar of worded buttons is a control with no
  name; **All** is the shortest true one, and it is inside the `<label>` so it
  toggles the box.
- **THE FLAG WORDS ARE THE SECOND EXCEPTION** to the rule that no child of a
  track row declares its own size, and the test names them: they are labels, not
  fields.

### VIEW COMES BEFORE NAV (2026-08-26)

`ADD | VIEW | NAV`. **The row wraps between boxes**, so the order decides what
shares a line with what: ADD and VIEW are short and stable, NAV is long and is
the one that drops to a second line when the window narrows.

### NO HEADER ROW, AND THREE BOXES: ADD, NAV, VIEW (2026-08-26)

The row above the tracks is gone. The list is track rows and nothing else.

- **WHAT IT CARRIED AND WHERE THAT WENT.** The select-all tick is in **NAV**; the
  Batch edit button **floats**; the twelve column labels are **gone**.
- **WHAT THAT COSTS, PLAINLY: a FILLED field no longer shows its column name
  unless you hover it.** An empty one still does -- every input carries a
  placeholder naming its column, and the checkboxes and the switch carry titles
  -- so the loss is *which column is this VALUE in*, answered by position now.
  **This room has made that trade once before and reversed it**; if the labels
  come back they come back as `buildTrackHead`, which the popup still uses.
- **THE POPUP KEEPS ITS HEADER**, which is why `.track-head` and its label rules
  are still live: that list is inside a dialog with room for a legend.

**THREE BOXES, EACH ANSWERING ONE QUESTION:**

| box | question |
|---|---|
| **ADD** | where tracks come FROM |
| **NAV** | what you are looking at: which tape, and which of its tracks |
| **VIEW** | where you GO |

- **IT WAS TWO BOXES WITH A HAIRLINE INSIDE THE SECOND DOING NAV'S JOB**, and
  that second box was so full that ADD's buttons clipped to nothing.
- **THE SELECT-ALL LEADS NAV.** It is not navigation; it is there because it acts
  on exactly the list the rest of that box decides -- the tape the arrows landed
  on, narrowed by the filters beside it.
- **EACH BOX KEEPS ITS OWN ITEMS ON ONE LINE; THE ROW MAY BREAK BETWEEN BOXES.**
  That was the rule and it still holds. Three boxes of real controls do not fit
  1,368px, and the alternative is clipping ADD to nothing again.
- **A test asserts VIEW holds only anchors** -- if a control ever lands in it,
  that check fails.

**THE BATCH BUTTON FLOATS**, fixed to the bottom-right corner, so it costs
neither bar any width and cannot be scrolled away from. It appears only while
there is a selection. **`[hidden]` had to be re-asserted over `.btn`'s author
`display: inline-flex` -- the SEVENTH time this project has hit that rule.**

### EVERY TRACK FILTER IS IN THE VIEW BAR (2026-08-26)

The Shelved/Live switch and the Explicit and Sports buttons were built into the
track header, one per column. **They are in the VIEW bar now**, next to the place
filter, so every control that decides what you are looking at is in one place.
The header labels its columns and holds the tick and the batch button; **it
narrows nothing and writes nothing.**

- **WHY THEY LOOKED RIGHT ON THE HEADER AND WERE WRONG THERE.** A header labels
  the columns under it; these three narrow the LIST. Reading well is not the same
  as belonging.
- **THE BAR NOW READS: pager, place, status, explicit, sports | doors.**
  Everything left of the separator narrows what you are looking at; everything
  right of it is somewhere to go. A test asserts that order.
- **THE CONTROLS ARE PAINTED FROM STATE, NEVER READ FROM.** `trackAirFilter` and
  `trackFlagFilter` are the truth and `paintViewFilters` draws from them on every
  render, so **the popup's own switch and these cannot disagree** -- which is the
  failure this switch has already had once.
- **THE SWITCH COUNTS THE TAPE ON SCREEN.** The list it narrows is one tape's; a
  catalogue-wide figure beside it would be the bar answering a question nobody
  asked.
- **`buildAirFilter` and `buildFlagFilter` ARE GONE.** The VIEW controls are
  markup plus a painter, because there is one of each and they are not rebuilt
  per tape.
- **THE TAPE HEADER WAS NOT DELETED, and the condition for deleting it is not
  met.** It still carries the select-all tick, the Batch edit button and twelve
  column labels; removing it would take all three. **What left it is every
  control that filtered or wrote.**

### THE ROOM IS 1,400px WIDE, AND THE VIEW BAR STILL DOES NOT FIT (2026-08-26)

`--mc-shell-width` went from 1,180 to 1,400, and `.app` reads that token rather
than carrying its own number.

**MEASURED, NOT FELT.** The VIEW bar needs about **1,117px** for the pager, four
filters and four doors. ADD's two buttons want about **387px**.

| shell | row | ADD gets |
|---|---|---|
| 1,180 | 1,148 | **19px** -- both buttons clipped to nothing |
| 1,400 | 1,368 | 239px -- both partly readable |
| 1,560 | 1,528 | 399px -- everything fits |

**1,400 IS A COMPROMISE AND IS RECORDED AS ONE.** ADD still clips. The options,
none of them mine to choose: shorten `LISTENER STATS` / `ABOUT` / `ISSUES`, drop
a door, let the bar wrap under a width, or go to 1,560 and accept a frame wider
than most laptops.

**THE TABLE IS THE OTHER WINNER.** Twelve columns at 14pt had 1,148px; they have
1,368, which takes the title column from 195px to 290 and the blurb from 146 to
218.

### ONE FILTER AT A TIME: LIVE, EXPLICIT OR SPORTS (2026-08-26)

The Explicit and Sports column headers are buttons that filter on their own
column, and **they are standalone**: choosing one clears the Status switch and
the other flag, so exactly one question is ever narrowing the list.

- **WHY STANDALONE.** With three filters that could combine, a short list has up
  to three reasons and you have to check three controls to find out which. One
  at a time means the answer is always the one control that is lit.
- **`trackPassesFilters(song)` IS THE ONE TEST**, and both `renderTrackArchive`
  and the popup's `renderTracks` call it. **Two readers of "what is visible" is
  exactly how the air switch was silently inert once**: it painted the state and
  then built its list from an unfiltered array a few lines away.
- **TWO VARIABLES, NOT ONE.** `trackAirFilter` is a tri-state with its own
  painter; the flags are plain toggles. The two setters clear each other, which
  is where "standalone" actually lives.
- **THEY ARE REAL BUTTONS with `aria-pressed`**, not labels with a click
  handler: a word that silently does something when you click it is not a
  control. At rest they look like the column labels they replaced, because that
  is still what they are.
- **THE EMPTY STATE NAMES THE FILTER THAT EMPTIED IT**, whichever of the three it
  was, rather than assuming it was the air switch.
- **PROVED ON A TAPE THAT HAS SOME.** The first tape has no explicit tracks, so
  "0 of 5" is the right answer **and is also what an inert filter would give**.
  The test walks to a tape with a mix and checks the count there, and checks the
  press sends no PATCH, POST or DELETE.

### THE BLURB NEVER SCROLLS, AND THE LIST IS AS WIDE AS THE BAR (2026-08-26)

- **EVERY BLURB ON SCREEN HAD A SCROLLBAR, AND A GUARD WAS THE CAUSE.** A
  `ResizeObserver` set a `manual` latch the moment the box's height differed from
  what `grow()` had applied by more than 2px. That is not only a human dragging
  the resize grip -- **it is the column settling**: the grid resolving, a webfont
  arriving. Once latched, `grow()` returned early **forever** and `.is-manual`
  turned `overflow: auto` on. A guard against one thing fired on another,
  permanently, and read as a styling fault.
  - **THE LATCH, THE OBSERVER AND THE GRIP ARE ALL GONE.** `resize: none` means
    there is nothing left for such an observer to watch, and `overflow: hidden`
    is unconditional -- **not even on focus**, which was the other half of it:
    the box you are typing in is the one that most needs to show all of itself.
  - A test asserts the computed `overflow` and `resize`, and that no latch is
    left in the code. **The first cut of that test searched the raw source and
    matched the comment explaining the removal** -- comments are not code.
- **THE BLURB IS THE ONE CHILD OF A TRACK ROW WITH A SIZE OF ITS OWN**, 0.72rem
  against the row's 14pt, and it is earned: its column is about 146px and it is
  **the only field that WRAPS**, so it cannot shrink to fit the way the others do
  and it alone set every row's height. The test that forbids a child declaring a
  size now names this one exception.
- **THE LIST RUNS THE FULL WIDTH OF THE ROOM.** The header and the rows carried
  `margin-left: 22px`, from when they sat under a tape line and were indented to
  read as belonging to it. **There is no tape line**, so that was 22px of nothing
  making the list narrower than the bar above it: **1,126px against 1,148px**.
  Both are 1,148 now.
- **THE DIALOG SAYS GO LIVE, not Put live.**

### TICK TRACKS, THEN BATCH EDIT (2026-08-26)

A twelfth column, first on the row, holding a tick per track and a select-all in
the header. Tick anything and a **Batch edit N** button appears beside that tick;
pressing it opens a dialog with everything a selection can be made to do.

- **A BUTTON AND A DIALOG, NOT A BAR.** It was a row of verbs across the header
  for an hour. **A bar that appears and disappears changes the height of the
  thing you are reading**, and it put a delete permanently in the corner of your
  eye. One button opens one panel.
- **THE BUTTON IS POSITIONED, NOT PLACED.** The tick's column is 30px; the
  button is absolute against that cell and sits OVER the two columns after it,
  which are empty in the header. **So a selection appearing changes no width and
  nothing under it moves.** It reads **BATCH EDIT 30 TRACKS** -- the noun earns
  its width, since "Batch edit 30" leaves you working out 30 of what.
  - **IT SHIPPED INVISIBLE, AND EVERY TEST FOUND IT.** `.track-head-label`
    carries `overflow: hidden`; it is ONE class, `.track-head-label--pick` is one
    class, and the label rule is declared **later in the sheet**, so it won the
    tie and clipped an absolutely positioned child clean out of existence. The
    button was in the DOM, `querySelector` found it, and there was nothing on
    screen. **The rule is `.track-head .track-head-label--pick` now**, (0,2,0), so
    nothing below can take it back -- and a test reads the cell's computed
    `overflow` and `position` rather than trusting the declaration.
- **THE DIALOG HAS TWO STATES, IN ONE PANEL.** First the moves, then -- if you
  press Delete -- the question about deleting, in the same panel. **A second
  dialog over a dialog is worse than a panel that changes its mind**, and the way
  out of the second state is **Back**, not Cancel, because that is what it is.
- **ONLY THE MOVES THAT WOULD CHANGE SOMETHING ARE DRAWN.** An all-shelved
  selection is offered **Put live** and not Shelve; a live one the reverse. A
  button that writes `archived = true` over `archived = true` reports a success
  that changed nothing.
- **THERE IS NO X ON THE HEADER.** It deleted the tape, then the selection, and
  now nothing at all: the Del column's header is a plain label naming the column
  of per-row deletes under it. **Deleting a selection is inside the dialog and
  nowhere else.**
- **IT IS WHAT MAKES A TAPE LIVE IN ONE PRESS.** When tape state went, this file
  recorded the cost: one press per track. Select all, Batch edit, Put live.
- **NO BULK WRITE OF `explicit` OR `sports`.** Those two are a fact about a
  RECORDING, judged one track at a time from its own tick box, and a button
  setting fifteen at once was offering to be wrong fifteen times in a press. They
  are still editable on every row and still filterable from the header.
- **THE SELECTION IS PRUNED TO WHAT IS DRAWN, ON EVERY RENDER.** The filter and
  the pager both change what is on screen, and **a batch press that reached a
  hidden row would be silent and would land on somebody else's work.** Stepping
  to another tape drops the selection, and unticking the last track closes the
  dialog -- it paints from state on every render, so it cannot be open about a
  selection that has since changed.
- **ONE REQUEST FOR THE LOT**, `id=in.(...)`, not a loop, with
  `return=representation`: PostgREST answers 200 with an empty array when RLS
  refuses, and **a short reply is reported rather than rounded up** -- saying "12
  updated" about 9 is the quiet sort of lie this room has been caught by before.
- **THE DELETE QUESTION IS IN PLAIN WORDS.** It said the tracks *"take their
  do-not-rescrape tombstones with them"*, which is our schema talking. It now
  says the bot may find them and file them again, which is the consequence a
  person decides with. **The `tgb-agent-context` block keeps the precise term**,
  being read by an AI that needs the mechanism.
- **ESCAPE CLOSES THIS DIALOG FIRST**, being the one on top when it is open.
- **THE GRID WENT FROM ELEVEN COLUMNS TO TWELVE**, which moved six things at
  once: both `--track-cols` declarations, the built header's cell list, its
  `--mid` and `--tiny` indices, the `fill()` positions, and the popup's static
  markup. **Miss one and every label sits a column from the field it names.**

### A TAPE HAS NO STATE. LIVE AND SHELVED ARE FACTS ABOUT A TRACK. (2026-08-26)

The tape-level Shelved/Live switch is gone, and with it `setTapeArchived` and
the "Shelve instead" button on the tape's delete confirmation. **A tape is
simply the tracks that carry its name**, and `/soundtracks/` draws it when at
least one of them is live.

- **THE PUBLIC PAGE ALREADY DID EXACTLY THIS, and it was verified rather than
  assumed.** It fetches `archived=eq.false`, so a tape with nothing live returns
  no rows at all, and `setCityEntries` skips a tape whose track count is 0.
  **Rendered against the live table it draws 1 card and a hero reading
  "1 Soundtrack"** -- New Orleans, the only tape with a live track.
- **WHAT IT COSTS, PLAINLY: taking a whole city off `/soundtracks/` is now one
  press per track rather than one press.** `tgb_set_tape_archived` is still in
  the database and still carries the shelve cascade, so the one-press version is
  a call away if it turns out to be wanted.
- **`archived_with_tape` STILL MEANS WHAT IT MEANT.** The 1,514 rows shelved
  together on 2026-08-26 carry it, so a future restore of one of those tapes
  would still leave a track shelved on its own down. Nothing on the page writes
  it now.
- **THE CATALOGUE LINE COUNTS TAPES RATHER THAN STATING THEM**: `TAPES 113 | 1
  WITH A LIVE TRACK | TRACKS 15 LIVE / 1628 SHELVED`. "1 with a live track" is a
  fact about tracks; "1 live / 112 shelved" would be the tape state this room no
  longer has, and it is also the exact test `/soundtracks/` applies.
  - **NEVER A COMMA AS A SEPARATOR HERE.** `.room-stats` is a flex row, so the
    space around a bare separator comes from the row's `gap`, and a comma
    renders as `113 , 1`. Pipes.
- **THE TRACKS POPUP SAYS `not on /soundtracks/`** where it said `tape shelved`.
  Same row, honest wording: what is true of a tape with no live track is that
  the public page does not draw it.
- **`setTapeArchived` WAS ALSO ARMED.** Its success path read `issue.tape_id`
  with no `issue` in scope, so shelving a tape from anywhere would have thrown a
  ReferenceError. **Second landmine of exactly this shape in this file this
  week**; both were left by passes that removed the findings UI.

### ONE SIZE, INHERITED, THEN SHRUNK TO FIT (2026-08-26)

`.track-line { --track-text: 14pt; font-size: var(--track-text) }` and **no
blanket rule**. Every child of a track row has had its own `font-size` deleted,
so the row's size is simply inherited.

- **`.track-line *` WAS THE FIRST ANSWER AND IT WAS THE WRONG SHAPE.** A blanket
  rule has to out-specify every child that has an opinion, and **it lost one tie**
  -- `.tape-air-word` is one class, same weight, declared later -- so the two
  status words sat at 0.66rem beside 14pt neighbours until somebody looked. A
  child that declares nothing cannot lose a tie, because there is nothing to tie
  with. **A test now fails on any child of a track row that declares a size.**
- **SIX DECLARATIONS WENT**: `.track-input`'s 0.86rem, `.track-input--id`'s
  0.74rem, `.track-tapetag`'s `font: 700 0.5rem/1` shorthand, `.tape-air-word`'s
  0.66rem, `.track-del`'s 0.9rem and `.track-play`'s 0.6rem.
- **BIG BY DEFAULT, SMALLER WHEN THE CONTENT NEEDS IT.** `shrinkToFit` steps a
  field down half a pixel at a time until it fits its column. A long title is
  readable at 11px where it would otherwise be a readable 14pt with its end cut
  off.
  - **IT CLEARS THE INLINE SIZE FIRST.** A field edited shorter goes back up;
    setting a number and never clearing it is how a column ends up permanently
    small because of a value that is no longer in it.
  - **THERE IS A FLOOR, 10px.** Past it the answer is a shorter value or a wider
    column, not a smaller font.
  - **THE BLURB IS DELIBERATELY OUT OF THE SWEEP.** It is a textarea that wraps,
    so it never overflows its width, and shrinking it would make a paragraph
    smaller for no reason.
  - **`.track-input--artist` HAD TO BE NAMED.** It was the one field on the row
    with no class of its own, which is exactly how a field gets left out of a
    sweep and nobody notices.
- **WHAT THE HARNESS CANNOT CHECK, said plainly: jsdom does no layout**, so
  `scrollWidth` is always 0 and no field ever actually shrinks there. What is
  asserted is that **no one-line field is left out of the sweep** -- the failure
  that would be silent -- and the resting size. **The shrinking itself is
  unverified from here.**

### THE VIEW BAR FILTERS BY PLACE, AND A PLACE IS A CITY (2026-08-26)

One `<select>` between the pager and the doors. **ALL TAPES**, then **108 cities,
each written out on one line**: `New Orleans, Louisiana, United States  (4)`.
Choosing one narrows what the arrows step through; the room still shows one tape
at a time.

- **IT SITS BEFORE THE `.bar-sep`, AND THAT RULE IS THE ARGUMENT.** Everything
  left of it is about the tape you are on; everything right of it is somewhere to
  go. A filter that decides which tapes the arrows walk is the first kind.
- **NO COUNTRY ON ITS OWN AND NO STATE ON ITS OWN.** Both were offered for one
  pass, alongside the cities, and it made the list two things at once -- a place
  to look a city up, and a set of broad buckets -- **with nothing to say which a
  line was**, the group headings having already been removed for being a heading
  you had to read before a name meant anything. Every line names a city now,
  which is what makes the list one kind of thing.
  - **WHAT THAT COSTS, plainly: there is no way to say "show me every tape in
    Texas".** The whole state is on each of its cities' lines, so you can SEE
    which are in Texas; you cannot step through them as a set.
- **IT WAS THREE OPTGROUPS OF BARE NAMES BEFORE THAT.** That version left
  **Georgia the state indistinguishable from Georgia the country**. Writing the
  whole place on the line answers that without a heading.
- **THE VALUE IS THE LABEL.** A city name alone is not unique -- this catalogue
  holds two Portlands and two Alexandrias -- so matching on it would quietly
  select both. The whole place is unique by construction and is already the text
  on screen. A test asserts label and value agree.
- **A COUNT ONLY PAST ONE TAPE.** `(1)` beside a line that already names one
  place is a number that never tells anybody anything. **Three cities carry
  one**: Atlanta 2, Tampa 2, New Orleans 4.
- **THE OPTIONS ARE BUILT FROM THE CATALOGUE**, so the list can only offer a
  choice with tapes behind it: an empty result is not a state this control can
  produce. **A stored value the catalogue no longer holds falls back to ALL.**
- **REBUILT ONLY WHEN THE CATALOGUE CHANGES**, keyed on a signature of the option
  set. Rebuilding on every render would close the list under the pointer while
  somebody is reading it.
- **A FILTER RESETS TO THE TOP.** Keeping `tapeAt` would land you on whatever
  happens to be fiftieth in a completely different list.
- **THE CATALOGUE LINE DOES NOT NARROW WITH IT**, and a test asserts that. It is
  the standing measure of the room, and a figure that shrank as you filtered
  would read as the filter breaking.
- **IT UNDOES WHAT A NATIVE `select` BRINGS** -- `appearance: none` plus two
  gradients for the arrow, and its own font -- or it reads as a different kind of
  thing from the `.btn`s either side. **The open list inherits none of that**,
  the browser drawing it, so `option` sets its own type.
- **CAPPED AT 30ch BECAUSE THE BAR DOES NOT WRAP**, and the closed control must
  not be able to push the doors off the end. **The ADD bar is what gives way**,
  per the one-line rule.

### ONE COLUMN DECLARATION PER LIST, AND THE HEADER IS MEASURED LIKE A ROW (2026-08-26)

`--track-cols` is declared **once on the list**, `.tape-lines` for the main one
and `.tracks-body` for the popup, and the header and the rows both inherit it.

- **IT WAS THREE COPIES OF ONE STRING**, on `.track-head, .track-lines`, on
  `.track-line--in-list` and on `.track-head--main`, and this file already warned
  that missing one puts every label a column away from the field it names.
- **THE MAIN HEADER WAS READING THE POPUP'S COPY.** `.track-head, .track-lines`
  matches `.track-head--main` too, and a DECLARED value beats an inherited one --
  so the header on the main list took its columns from the popup's rule while
  the rows beneath it took theirs from `.tape-lines`. Two copies that had to
  agree by hand, in the one place where disagreeing is invisible until you look
  at a screenshot. **The popup's declaration moved onto `.tracks-body`**, the one
  element that contains both its header and its rows, and now nothing but that
  container declares it.
- **A test asserts the header and the row each declare NOTHING**, and that the
  list declares eleven tracks. That is the check that would have caught it.

**THE HEADER IS INSET LIKE A ROW.** `.track-line` is `padding: 3px 9px` with an
8px column gap; the header was `8px 10px` with a 4px gap, so its eleven columns
started a pixel out and drifted from there. Horizontal padding and column gap now
match; **the vertical padding is still the header's own**, it being a bar rather
than a row.

- **THE GAP CHECK HAD TO READ THE STYLESHEET.** jsdom reports `columnGap` as
  `normal` whenever it came from the `gap` shorthand, so comparing the computed
  value is a check that cannot fail. It parses the declarations instead -- and
  walks **every** block for a selector, since `.track-head` has a one-line
  box-shadow rule before its real one.

**THE STATUS COLUMN IS 196px.** At 14pt `SHELVED` and `LIVE` either side of a
34px switch need it; at 168 the words overflowed their cells and `.track-air`'s
`overflow: hidden` clipped `LIVE` to `LIV`. `.tape-air-word` is `nowrap` so a
narrow cell shrinks the word through the row's fit pass rather than breaking it
across two lines and doubling the row's height.

**WHAT IS STILL TIGHT, said rather than glossed.** Eleven columns at 14pt in
about 1,084px of row is roughly 98px each. The tape name editor and the country
line both clip on a long value -- the country line ellipses and carries a
tooltip, the editor's two inputs scroll. **If that bites, the answer is a wider
shell for this room**, not narrower type.

### WHERE THE TAPE IS, ON EVERY TRACK ROW (2026-08-26)

`.track-tapegeo`, above the tape's name in the title cell:
`COUNTRY / STATE / CITY`.

- **AN EMPTY PART IS DROPPED, NOT LEFT AS AN EMPTY SEGMENT.** Most of the world
  has no state, and `United Kingdom / / London` reads as a fault.
- **IT REPLACED THE ROOM HEAD'S COPY.** That line carried the same geography one
  scroll away; it now carries only what the rows cannot say, which is how much
  of the tape is live.
- **NOT IN THE POPUP**, for the reason the tape tag is not: there the tape's name
  is the dialog's own title.

### THE TAPE'S NAME IS EDITED ON THE TRACK ROW (2026-08-26)

The tape had a bordered card above a bordered column header, two stacked bars
about the same tape. **Both are gone as a place the tape lives.** The name
editor and its swap button are on the TRACK ROW, as the tiny tape tag that has
always sat above each track's title; the header is column labels again, with the
tape's two controls in the cells of the columns they act on.

- **IT WENT ONTO THE HEADER FIRST AND THAT WAS WRONG.** Folding the tape line
  into the track header as its first row is a tape header by another name: one
  bordered object instead of two, saying the same things in the same order.
- **THE TAG WAS ALREADY THE TAPE'S NAME ON THE ROW.** It is `buildTapeNameEditor`
  now, the SAME builder the tracks popup uses as its title, so there is one tape
  name editor in this project and not two.
- **THE COST, PLAINLY: one editor per track row, thirty of them, all the same
  tape.** Editing any changes all, and a rename repaints the lot. That is what
  putting it on the row means, and it is the trade rather than an oversight.
- **EVERYTHING INSIDE THE TAG INHERITS THE TAG'S TYPE.** It is 0.5rem mono;
  left at the input default, thirty rows would each have grown by a line. A test
  asserts the input's computed size equals the tag's.
- **NO BORDER UNTIL YOU REACH FOR IT.** Thirty outlined boxes over thirty titles
  is a form, not a list, so the boxes are transparent until hover or focus.
- **THE TAPE'S TWO CONTROLS SIT AT THE TOP OF THEIR OWN COLUMNS.** The Status
  cell was an empty label and now carries the switch that shelves the whole
  column, directly above the tracks' own switches; the Del cell carries the
  tape's delete above theirs; the leading cell carries its NEW badge. **No extra
  row** -- the header is still eleven cells.
- **WHERE THE TAPE IS AND WHAT IT HOLDS MOVED TO THE ROOM HEAD**, one quiet line
  under the catalogue's own figures. Both are standing readings about what you
  are looking at, which is what that part of the head is for. The other two
  places were worse: the VIEW bar has to stay on one line, and a bar of their
  own is the tape header again.
- **CLICKING THE TAPE NO LONGER OPENS THE TRACKS POPUP**, the row that carried
  that handler being gone. The popup shows the same tracks already on the page
  and is still reached by `#tape=` and from a finding.
- **THE DELETE CONFIRMATION HANGS OFF THE HEADER**, where `grid-column: 1 / -1`
  is live. Inside the flex tape line that declaration was **inert** and needed a
  flex basis; the flex-basis rule went with the line.

**AND IT FOUND A LIVE ReferenceError THAT HAD BEEN ARMED FOR A DAY.**
`renderTapeConfirm` counted a bare **`findings`**, which is defined nowhere -- a
leftover from the pass that moved the findings UI to `/mc/issues.html`. So
**pressing a tape's delete button threw, took `renderTrackArchive` down with it
and blanked the room.** It counts off `soundtrackIssues` now, the flat array
this room still builds and no longer draws. **Found by a test that presses the
button**: nothing renders a confirmation until somebody asks for one, so no
amount of loading the page reaches that line.

### THE TWO COMMAND BARS STAY ON ONE LINE (2026-08-26)

`.bar-row` and both `.command-bar-inner`s are `flex-wrap: nowrap`.

- **VIEW HOLDS ITS WIDTH; ADD GIVES WAY.** VIEW is the bar you aim at -- the
  tape nav and the four doors out of the room -- so it is `flex: 0 0 auto` and
  sized to its contents. ADD is `flex: 1 1 auto; min-width: 0` and its two
  buttons narrow rather than dropping onto a second line, **which would push the
  whole room down by a row.**
- **THE RULES HAVE TO COME AFTER THE SECOND `.command-bar-inner` BLOCK.** This
  page declares that selector twice and the later one wins on source order; a
  `nowrap` written beside the first declaration does nothing at all.
- **THE PHONE IS THE ESCAPE HATCH.** Under 720px both bars go full width and
  wrap as they always did: two bars on one line is not something 390px holds.

### A TRACK CAN BE MARKED SPORTS (2026-08-26)

`public.soundtrack.sports`, a plain boolean, false by default. [2026082601](mc/supabase/migrations/2026082601_soundtrack_sports.sql),
applied. An `S` checkbox beside `E` on every track row.

- **PER TRACK, NOT PER TAPE.** A tape is not a sports tape; it is a city's tape
  with two or three sports tracks on it, which is the ratio the brief has asked
  for from the beginning. The fact belongs on the track that IS one.
- **NOTHING READS IT YET, and that is worth writing down.** It is for filtering
  at play time in a game. An unread boolean invites repurposing: this one means
  *this recording is sports music*, not *this track is good for a game*, and
  those diverge the moment anybody wants the second.
- **THE `anon` GRANT HAD TO BE RE-ISSUED, and every future column here does
  too.** That grant is PER COLUMN so `findings` can stay out of it, and **a
  column added later is not covered by it**. The public page names its columns,
  so one it names and cannot read answers 42501 for the whole request and the
  page goes blank. Verified after: `select=id,sports` 200, `select=*` 401.
- **THE GRID GAINED A COLUMN AND ALL FOUR PLACES MOVED TOGETHER** -- the popup's
  `--track-cols`, the main list's, the main header's, and the popup's static
  header markup -- plus the built header's cell list and its `--mid` indices.
  Miss one and every label sits a column left of the field it names.

### EVERYTHING SHELVED, NO FILTERS, BADGES LEAD THE ROW (2026-08-26)

- **EVERY TAPE AND TRACK IS SHELVED.** `update public.soundtrack set archived =
  true, archived_with_tape = true where not archived` -- 1,514 rows. **The stamp
  is the point**: this is exactly what shelving each tape one at a time would
  have done, so it is undoable a tape at a time rather than 1,514 tombstones
  nothing can lift. The 129 already shelved on their own keep
  `archived_with_tape = false` and stay down through any restore.
  - **`/soundtracks/` IS NOW EMPTY.** 0 live tracks, 0 live tapes.
- **BOTH FILTERS ARE GONE**, and the FILTER folder tab with them: the bar row is
  ADD and VIEW again. The track header's own Shelved/Live went too. **The
  popup's `#trackAirAll` is untouched** -- it is a different control on a
  different surface.
- **THE NEW BADGE LEADS THE ROW**, on tapes and on tracks, in a fixed 42px cell
  so the rows line up down the left edge whether or not they carry one. **A
  track is new on its OWN `created_at`**, not its tape's, which is what makes a
  top-up show five new tracks on an old tape.
- **THE TAPE'S COUNTS SIT IMMEDIATELY AFTER ITS NAME** and read `0 LIVE / 30
  SHELVED`. It read "55 tracks, 10 live", which needed subtracting to learn the
  number you actually act on.
- **THE TRACK GRID GAINED A COLUMN, AND ALL FOUR PLACES HAD TO MOVE TOGETHER**:
  the popup's `--track-cols`, the main list's, the main header's, and the
  popup's static header markup. Miss one and every label sits a column left of
  the field it names.

**AND A CALL SURVIVED ITS FUNCTION.** `paintFilterPills` went with the filters
and `renderTrackArchive` still called it, so **the whole room rendered empty**.
It surfaced as *"public.soundtrack did not load. Check the Supabase project."* --
the fetch and the render share one `try`, so a drawing bug accused the database.
**The message now says which it was**, and sends you to the console rather than
to Supabase.

### `/mc/issues.html` IS THE ROOM FINDINGS MOVED TO (2026-08-26)

A shell, deliberately: the chrome, the sign-in, the error channel and the read
are all real and proved, and **what a finding LOOKS like on this page is still to
be decided**, so each is one honest line rather than a guess at a layout.

- **IT IS THE TAPE ROOM'S SIBLING AND WEARS ITS CHROME.** Same tokens, same
  folder-tab command bars with the `::before` arch, same room head, same red-pen
  scribble as the only error channel. **When either room's chrome changes,
  change both.**
- **IT READS `soundtrack_findings`, THE VIEW, NEVER THE TABLE.** Findings are a
  jsonb array on `public.soundtrack`, which PostgREST cannot count or list. The
  view is `security_invoker` and granted to `authenticated` only, because a
  finding is an internal editorial note.
- **THE READ PAGES.** 285 findings today, which is exactly the size that grows
  past PostgREST's silent 1,000-row cap without anybody noticing.
- **THE DOOR IS A RED `ISSUES` BUTTON after ABOUT in the Tape Room's VIEW bar**,
  the only red button in that room, and outlined rather than filled: it is a
  door, not the action the room is for. There is also a nav entry, so the room
  can be found by name.

### THE ISSUES UI IS OUT OF THE TAPE ROOM (2026-08-26)

Findings are going on a page of their own. Nothing in this room draws one now:
the ISSUES filter button, the pips on the tape line, the tape's own findings
block, the track's findings block, the popup's `#tapeFindings`, and every helper
behind them -- `buildIssueItem`, `issueAsPrompt`, `issueScopeSummary`,
`humaniseIssueText`, `resolveIssue`, `patchFindingStatus`, `openIssues`,
`tapeIssues`, `issuesForTape`, `songIssues` -- 2.5KB of CSS with them.

- **THE DATA IS UNTOUCHED.** `soundtrack.findings` still holds all 285, the two
  RPCs still write and clear them, and the hub still counts and lists them
  through `soundtrack_findings`.
- **`collectFindings` IS KEPT DELIBERATELY.** It still flattens the findings out
  of the rows on every load, because the page they are going to will want the
  same flat shape and it costs one pass over rows already in memory. It is the
  one thing here that is read and not drawn.
- **DELETING A TRACK STILL PRUNES ITS FINDINGS** from that array, so nothing
  goes stale while it sits unused.

### EVERY TAPE ON THE PAGE, AND THE PAGER IS GONE (2026-08-26)

113 tape lines, 113 track headers, 1,643 editable track rows, all at once. The
one-tape-at-a-time pager and everything behind it -- `tapeAt`, `stepTape`,
`buildPagerCell`, the `#tapeHeadRow` bar -- are deleted.

- **THE TAPE LINE IS BACK IN THE LIST**, so the list reads tape, header, tracks,
  repeating. A test asserts exactly that set of child classes and nothing else.
- **THE SHELVED / LIVE FILTER IN THE TRACK HEADER IS NOW GLOBAL.** Every tape's
  header carries one and they all drive `trackAirFilter`, so pressing any of
  them filters the whole page: 1,643 rows to 1,514 live, and 129 shelved, which
  sums. That is a change of meaning from the one-tape view, where it filtered
  the tape in front of you.
- **THE WEIGHT IS BACK AND IS NOT CAPPED.** Around 27,000 nodes and 10,000 form
  controls. **The pager was introduced to fix exactly this and has been removed
  deliberately**, so if it ever needs to be lighter the answer is the Anchor
  Events shape -- build a row's fields only when it is opened -- and **never a
  top-N**, which would hide tapes without saying so.

### ONE TRACK ROW, ONE SIZE, WITH ITS HEADER (2026-08-26)

The main list and the popup draw the same row through `renderTrackLine`, and
they had drifted into two different sizes.

- **`growBlurbs()` SWEPT `trackLines` ONLY, WHICH IS THE POPUP.** So a blurb
  grew to two lines there and stayed clipped at one on the main list: the same
  track, two heights, depending where you looked at it. It sweeps both roots
  now, and `renderTrackArchive` calls it.
- **THE ROW IS TRIMMED AROUND THE BLURB, NOT INSTEAD OF IT.** 3/9 padding, a
  2px row gap, a 26px field floor and 2px on the blurb, with its line-height at
  1.28. **The blurb still grows to its content**, which is what a row's height
  really follows; everything around it is as tight as it goes without the fields
  becoming hard to hit.
  - **BOTH LISTS ARE MEASURED THE SAME.** ~~and a test asserts it~~ -- **that
    test was VACUOUS and is deleted (2026-08-27)**: it compared the first
    `.track-line` in the document with `tr`, which IS the first `.track-line`,
    so it compared an element with itself. Pointed at the popup's own row it
    fails, because the badge and the dialog row now carry different padding. The earlier
    trim applied to the main list alone, which is precisely what made a track
    two heights depending where you looked at it.
- **THE COLUMN HEADER IS BACK ON THE MAIN LIST**, emitted under the tape whose
  tracks it names, cell for cell the popup's own. A test asserts its
  `--track-cols` equals the row's, because that variable is scoped to
  `.track-head, .track-lines` inside the popup and out here would resolve to
  nothing and collapse every column to zero.
- **THE STATUS COLUMN CARRIES A SHELVED / LIVE FILTER**, not a label. It is the
  popup's own control, and both drive `trackAirFilter`: the same question about
  the same tape, asked from two places.
  - **BUILT PER HEADER, SO IT CARRIES NO id.** The popup's is `#trackAirAll`;
    this one is emitted once per tape shown, and a second element with that id
    would make `getElementById` answer for whichever came first.
  - **IT STOPS ITS OWN CLICK.** The tape row beneath opens the tracks popup, so
    without that, filtering would also open a dialog over the list.
  - **THE HEADER IS DRAWN WHENEVER THE TAPE HAS TRACKS AT ALL**, not when the
    filter has left some. It carries the filter, so hiding it on an empty result
    would take away the only way to undo that; the empty state says which word
    to press instead.

**THIS REVERSES THE ROW-HEIGHT TRIM RECORDED BELOW**, and knowingly: shown both,
the popup's proportions were the ones wanted. The note below is kept for the one
thing in it that still holds, which is WHAT sets a track row's height.

### WHAT ACTUALLY SETS A TRACK ROW'S HEIGHT (2026-08-25)

Not the padding. **The blurb textarea.** `grow()` sized it to `scrollHeight`, so
a ten-word blurb wrapping to two or three lines in its column made every row two
or three lines tall, and trimming the row's padding moved almost nothing.

- **ONE LINE AT REST, THE WHOLE THING WHEN YOU ARE IN IT.** On blur the inline
  height is CLEARED rather than set to a number: `rows="1"` plus the CSS
  `min-height` give one line, and clearing it is what lets a grown box shrink
  back. A hardcoded height here would fight any later change to that min-height.
- **NOTHING IS HIDDEN THAT YOU CANNOT GET AT.** The box grows on focus, and its
  **tooltip carries the blurb itself** rather than the standing instruction,
  which is the escape hatch for a clipped line.
- **THAT TOOLTIP IS SET OUTSIDE `grow()`, and it had to be.** `grow()` returns
  early when the box is not in the document, which it never is while the row is
  being built, so a title set in there would only appear after some later
  resize. It was wrong for one commit and the check caught it.
- The rest is genuinely just trimming: row padding 7/10 to 2/8, gaps 4 to 2,
  field `min-height` 30 to 26 (**that 30 was the real floor**, not the padding),
  and the gap in the two-line title cell to 0.
- **jsdom CANNOT CONFIRM THE FOCUSED EXPANSION.** Its `scrollHeight` is always
  0, so the grow path measures 26px there whatever the text. The resting state,
  the uniformity and the tooltip are all checked; the expansion is not.

### STEPPING TO THE NEXT TAPE DOES NOT MOVE THE PAGE (2026-08-26)

`stepTape` called `scrollIntoView` on the list to bring its top back after the
rebuild. **From the top of the page that scrolls DOWN**, past the room's own
head, so pressing Next at rest made the page jump away from you.

- **THERE IS NOTHING TO BRING BACK INTO VIEW.** The arrows live in the sticky
  header, so they are on screen wherever you are reading. Where you were is left
  alone.
- **`focusSong`'s `scrollIntoView` STAYS and is a different thing**: it is
  `block: 'nearest'`, so it moves only when the focused row is actually off
  screen, and it is opt-in through that function's `scroll` argument. Keyboard
  navigation would be unusable without it.
- The check **spies on `Element.prototype.scrollIntoView`, `window.scrollTo` and
  `scrollBy`** and asserts that stepping either way, and changing a filter, make
  no call at all. jsdom does no layout, so counting the calls is the only thing
  that can be asserted headlessly here.

### FILTER IS THE THIRD FOLDER TAB, AND ITS FILTERS ARE BUTTONS (2026-08-26)

`ADD | VIEW | FILTER`, three folder-tab fieldsets on one bar-row. The filters
were a bar of their own below them, which made the room read as two layers of
chrome before you reached a tape.

- **THERE ARE TWO OF THEM, ISSUES AND NEW.** Live and Shelved were removed on
  2026-08-26 and everything behind them went too: `airFilter`, `readAirPills`,
  `onAirPill`, `paintMasterAir` and the tape and track filtering they drove.
  **The line under the room's title already says how many tapes and tracks are
  live and shelved**, and that is the question those two answered.
  - **`airCounts()` STAYS**, because that line is what reads it now.
  - **`airMatches()` STAYS TOO**, and this is the one to be careful with: the
    tracks popup's own Shelved/Live switch still filters the tracks of the open
    tape through it. Deleting it as dead would break that.
- **THEY ARE `.btn`, THE ROOM'S OWN BUTTON.** Everything else in those tabs is
  one, so a rounded badge in there read as a different kind of control. They add
  only what a filter needs on top of it: the count, and a pressed state.
- **PRESSED IS THE ROOM'S PRIMARY FILL**, the same one Save and Add wear.
  `aria-pressed` is not available on a `<label>`, so the state is the class plus
  the checkbox inside it, which is what a screen reader reads.
- **ADD TAKES THE SLACK**; VIEW and FILTER are `flex: 0 0 auto` and keep their
  own width. Under 720px all three go full width, as VIEW already did.
- A test asserts the filters' `min-height` and `border-radius` **equal the ADD
  and VIEW buttons' own**, computed rather than declared, so they cannot drift
  into looking like something else.

### NO SORTS (2026-08-26)

- **THE THREE SORT BUTTONS ARE DELETED**, and so is every trace of them:
  `sortKeys`, `sortEntry`, `cycleSort`, `paintSortHeaders`, the header's click
  handler and 17 CSS rules, 2.4KB.
  - **THEY HAD STOPPED MEANING WHAT THEY LOOKED LIKE.** Column headers that sort
    a list are one thing; with ONE tape on screen they were choosing the order
    you PAGE THROUGH, which is not what pressing a column header suggests.
  - **THE ORDER IS NOW CITY, A TO Z, and nothing else.** It is the order you can
    predict and the one you can find a city in. The first tape is Aachen.
- **THE LABEL READS FILTER**, not Show, and there is one control group left.
- **`paintFilterPills` ONLY KNEW ABOUT TWO OF THE FOUR.** Live and Shelved were
  added later and never given their filled state, so pressing one narrowed the
  list and left the badge looking untouched. All four are painted, and
  `onAirPill` calls the painter.

### TWO BARS, AND EACH MEANS ONE THING (2026-08-26)

Merging the room's controls into the tape's line was tried and reversed the same
day. **Eleven controls of two different kinds on one row** is what it produced,
with the two Shelved/Live toggles side by side meaning different things. The
split is back and this is the settled shape:

| bar | what it is about |
|---|---|
| `.room-controls` | the CATALOGUE: how it is sorted, which of its 113 tapes are shown |
| `.tape-bar` | the TAPE IN FRONT OF YOU: where it is, its name, its counts, its status, and the way to the next one |

- **THE TAPE'S BAR IS THE STICKY ONE, not the room's.** The room's bar is
  reference, set once and read past; the tape's carries the arrows and the
  status switch and is worth having on screen while you work down its tracks.
  It was the other way round, which pinned the half you do not touch.
- **THE ROOM'S BAR IS QUIETER**, a shade smaller and unpinned, so the two do not
  compete for the same attention.
- **THE FILTER STAYING TWO PILLS IS THE PART TO KEEP.** It was made pills to
  stop it being mistaken for the tape's own switch when they shared a row; they
  no longer share one, and it should stay pills anyway, because `Live 97` and
  `Shelved 16` say what they do and carry their counts, which a two-position
  switch cannot.
- **THE ORDER IS `room-controls > tape-bar > tape-lines`**, asserted by a test
  that reads the panel's children in sequence rather than checking each exists.

### THE CATALOGUE COUNT SITS WITH THE ROOM'S NAME (2026-08-26)

`1514/1643` moved out of the controls bar and onto the `TAPE ROOM` heading's own
line, small and quiet in mono.

- **IT IS UNDER THE HEADING AND IT IS THE WHOLE PICTURE**, not one ratio:

      TAPES 97 LIVE / 16 SHELVED  |  TRACKS 1514 LIVE / 129 SHELVED

  Both halves sum to what the catalogue holds, 113 and 1,643, so the line can be
  checked against itself.
- **IT IS THE ONE FIGURE IN THE ROOM THAT IS NOT ABOUT THE TAPE IN FRONT OF
  YOU.** Among the controls a bare number read as one more thing to press, which
  is why it had needed `margin-left: auto` to shove it away from them.
- **COUNTED OVER EVERYTHING, never over what the filters have left**, and a test
  asserts the line does not move when one is pressed. The FILTER tab's own
  figures narrow; this one is the standing measure of the room.
- **SMALL AND QUIET**: 0.72rem mono, uppercase, with only the two LIVE figures in
  ink. A standing figure is not news and must not compete with the room's name.

### ONE HEADER, NOT THREE (2026-08-26)

The room had three bars stacked over the tracks: the sort and filter controls,
the tape's own line, and a column legend for the track fields. There is one.

- **THE TAPE'S LINE IS THE HEADER'S SECOND ROW.** `renderTrackArchive` appends
  it into `#tapeHeadRow` inside `.room-controls` rather than into the list, and
  it sheds its border, radius and white ground there: **a card inside a panel is
  a box within a box.** The controls above are about the CATALOGUE and this line
  is about the tape in front of you, which makes them two rows of one object.
- **THE LIST BELOW IS NOW TRACKS AND NOTHING ELSE.** Checked by reading the
  distinct class names of its children: `track-line`.
- **THE COLUMN LEGEND WENT, AND ITS LABELS MOVED ONTO THE FIELDS.** Every input
  gained a placeholder that names its column (`#`, `Title`, `Artist`, `no
  blurb`, `Spotify id`) plus a `title`. **Title and Artist had NO placeholder
  before**, so deleting the legend without this would have left an empty track
  as a row of unmarked white boxes.
  - **WHAT IS LOST, plainly: a FILLED field no longer shows its column name**
    unless you hover it. That is the trade for one header. The two unlabelled
    cells are the explicit checkbox and delete, which are marked by their own
    glyphs.

### THE PAGER IS THE TAPE LINE (2026-08-25)

They were two bars and **they said the same three things twice**, a few pixels
apart: the tape's name, its state and its country were on both. One row now:

    <  United States  Texas  [The Key City Mix] ⇄ [Abilene]  15 tracks, 15 live  ●●  Shelved|Live  ×  1 of 113  >

- **THE STEP BUTTONS ARE BUILT PER ROW, so they carry no id.** They are `‹` and
  `›` end caps rather than worded buttons, since the tape between them is what
  says where you are.
- **THEY MUST `stopPropagation`.** The row's own click opens the tracks popup,
  so without it stepping would page the list AND open a dialog over it.
- **BOTH ARROWS SIT AT THE FAR LEFT, TOUCHING.** Split to the two ends of the
  row they were a long way apart for one job, and changing direction meant
  crossing the whole row. `.tape-step + .tape-step` pulls the pair together with
  a negative margin rather than a wrapper element, so they read as one control
  with two ends.
- **THE `1 of 113` CELL GOES WITH THEM**, immediately after: it is the pager's
  own reading and reads as orphaned anywhere else on the row.

**REMOVING THE PAGER TOOK `buildTrackHead` WITH IT.** The slice ran from the
pager's doc comment to `stepTape`, and `buildTrackHead` had been inserted
BETWEEN that comment and the function it documented, so it was inside the range.
The call survived, the definition did not, and **every render would have thrown**.
Caught by the uncalled-function check, which found the opposite -- a call with no
definition -- purely because it enumerates both. **A slice keyed on a comment is
keyed on something another edit can move code underneath.**

### THE TAPE LINE IS A FLEX BAR, NOT A GRID (2026-08-25)

Eight fixed columns made sense over 113 tape lines that had to align with each
other. **There is one now**, so the columns bought nothing and cost the name
editor its room: two inputs and a flip button squeezed into `minmax(0, 1fr)`
while `11ch` sat half empty beside it.

- **NOTHING WAS DROPPED.** In order: country, state, the name editor, the
  counts, the issue dots, the NEW badge, the Shelved/Live switch, delete, and
  the findings block. A check reads the children in sequence rather than
  asserting any one of them exists.
- **THE NAME TAKES THE SLACK** (`flex: 1 1 240px`) and everything after it holds
  its own width, so the row does not reflow as a tape name gets longer.
- **`grid-column` MEANS NOTHING IN A FLEX BOX**, which is the fault that made
  the finding line invisible the first time it shipped. The two full-width
  blocks, the findings and the delete confirmation, are `flex: 1 0 100%`.
  - **THE CONFIRMATION'S CLASS IS `track-confirm`, NOT `tape-confirm`.** Written
    from memory it was the second, which matches nothing: the tape's delete
    confirmation reuses the track one. Caught by grepping for the class rather
    than trusting the name.

### THE TAPE NAME IS EDITED ON ITS LINE (2026-08-25)

`buildTapeNameEditor` is the tape line's name cell now, the SAME editor the
tracks popup uses as its title, so there is one of it and not two.

- **THE FLIP CAME WITH IT.** The `⇄` between the two boxes swaps
  `spine_tag_position`, so a tape reads *Abilene The Key City Mix* or *The Key
  City Mix Abilene*. It was already inside that builder, which is why moving the
  builder brought it along rather than needing rebuilding.
- **AND SO DID MOVING A TAPE TO ANOTHER CITY.** The city box carries
  `list="cityOptions"`, and committing it goes through `moveTapeToCity`, which
  since the `cities` tie was cut also accepts a city the room has never held.
- **BOTH BOXES COMMIT ON `blur`, NOT ON `keydown`.** Worth knowing before
  writing a check against them: a test that fires Enter sees nothing happen and
  reads as a broken write path when the path is fine.
- **CLICKING THE NAME NO LONGER OPENS THE POPUP**, because the row's click
  handler bails on anything inside an `input`, and the name is two inputs now.
  The rest of the row still opens it. That is the right trade while the popup
  shows the same tracks the line already has under it, but **if the popup ever
  becomes the only place something lives, this is the thing that will hide it.**

### BOTH KINDS OF FINDING ARE ACTIONABLE ON THE MAIN LIST (2026-08-25)

A finding is about a TRACK or about the TAPE, and both now draw where they
belong, as the same full item the popup builds: kind chip, the words, and
**Copy fix prompt / Delete issue / Keep issue**.

- **A TRACK FINDING WAS ALREADY RIGHT**: `renderTrackLine` draws it in
  `.track-issues`, which carries `grid-column: 1 / -1` and is unscoped, so it
  spanned the row out here without a change.
- **A TAPE FINDING WAS ONLY A SENTENCE**, red text with no buttons, so clearing
  one meant opening the popup. It is `.tape-line-findings` now, built by the
  same `buildIssueItem`. **A finding about the LIST names no track** -- short of
  15, over 15, a city now hidden -- so the tape line is the only place it can
  live.
- **TRACK FINDINGS ARE NOT REPEATED ON THE TAPE LINE.** The line used to show
  the first of ALL of them, which was reasonable when the tracks were behind a
  popup and became the same thing twice a few pixels apart once they were
  expanded underneath. `tapeIssues(tape)`, not `issuesForTape(tape)`.
- **The pips stay**, being the thing you spot while scrolling.

### THE TAPE LINE CARRIES WHAT THE POPUP SAID ABOUT THE TAPE (2026-08-25)

Two of the three things the tracks popup's header told you are on the main list
now, so you can decide whether a tape is worth opening without opening it.

- **THE COUNTS ARE IN WORDS: `55 tracks, 10 live`.** It read `10/55`, which
  needed the column header to be found before it meant anything and then still
  left you working out which number was which. **A live count of zero does not
  wear the green** (`.tape-line-live.is-none`): zero live is not good news.
- **THE FINDING'S OWN WORDS ARE ON THE LINE**, first one, with `(+N more)` when
  there are others. The pips stay as the thing you spot while scrolling, but a
  pip says only THAT something is wrong, so acting on one meant opening the tape
  to find out whether it was worth opening. 29 of the 113 tapes carry one.
- **THE FULL CITY LABEL WAS DELIBERATELY NOT ADDED, and that departs from what
  was asked.** The line already carries the whole geography spelled out, in its
  own sortable columns: `United Kingdom | England | London | Late Night`. Adding
  `London, United Kingdom` beside them would be the row saying the country twice,
  which is the repetition this room has already been cleaned of twice. **Say so
  if it should go on anyway.**
- The counts column widened to `19ch` and the pips column narrowed to `96px` to
  pay for it; the finding line spans the full grid under the name.
- **BOTH SHIPPED INVISIBLE THE FIRST TIME, AND THE TEST DID NOT NOTICE**, which
  is the part worth keeping. **`.tape-line-name` is `display: flex; flex-wrap:
  nowrap`**, so a finding line appended inside it became a flex item squeezed
  onto the same line, and its `grid-column: 1 / -1` was **inert, because its
  parent was a flex container rather than the grid**. It has to be appended to
  the ROW. And **`.tape-line-num` is `display: flex` too**, so the three pieces
  of "55 tracks, 10 live" became separate flex items with the spaces between
  them dropped; the counts cell sets `display: block` to beat it.
  - **A `textContent` ASSERTION PASSES ON A PAGE THAT RENDERS WRONG.** That is
    what the first check did, and it reported success twice. The check now reads
    **`getComputedStyle`** for `display`, `grid-column` and the parent, which is
    the only thing that could have caught either fault.
  - **AND `textContent` CANNOT SEE THE FLEX WHITESPACE FAULT AT ALL**, because
    stripping it is a RENDERING effect and jsdom does no layout: the string
    reads `15 tracks, 15 live` in the DOM while the screen says `15tracks`.
    So the counts cell is no longer built from bare text nodes. **Every piece is
    an element and every space is `String.fromCharCode(160)`**, which survives
    either display mode, and the check asserts the non-breaking space is present
    rather than asserting how it looks.
  - **DO NOT BLAME A CACHE FOR THIS.** It was reported as still wrong, the
    reply was that the page must be stale, and it was not: the deployed CSS was
    correct and the DOM was still built in a way that rendered wrong. **The
    screenshot was evidence and the assumption was not.**

### THE BOT BUTTON ASKS FOR A FOCUS CITY, THEN OPENS THE ROUTINE (2026-08-25)

Pressing TGB SOUNDTRACK BOT in the Tape Room opens a small dialog with one
field, **Focus city**, and then opens the routine in a popup window.

- **THE CITY TRAVELS ON THE CLIPBOARD, because it cannot travel any other way.**
  The routine takes no parameters: it reads its brief out of
  [soundtracks.md](mc/soundtracks/soundtracks.md) every run, and **a static page cannot
  parameterise a cloud trigger.** So GO copies *"Work Tulsa, Oklahoma this
  run."* and a human pastes it into the run. That constraint is stated on the
  dialog rather than left for somebody to discover.
- **THE BRIEF HAD TO LEARN TO OBEY IT, or the whole thing is decoration.**
  Section 4 now opens with *if the run named a city, use it and skip the
  ladder*, with two facts about the catalogue still applying: the city must
  exist and must not be hidden. A named city that fails either is reported and
  the ladder is worked instead.
- **BLANK IS A REAL ANSWER AND IS THE DEFAULT.** It means work the tier ladder,
  which is what the brief does unaided, so **an untouched dialog copies nothing
  at all** and the button reads `Open` rather than `Copy and open`. Same shape
  as the deleted PROMPT dialog's city picker.
- **THE COPY IS STARTED BEFORE THE WINDOW AND NEITHER IS AWAITED.** Both need
  the user gesture the click carries, and awaiting the clipboard would push the
  open into a later task, which is exactly what a popup blocker refuses.
- **A BLOCKED WINDOW LEAVES THE DIALOG OPEN** and says so, so the clipboard is
  not wasted and there is still a way through. Tested.
- **Middle-click and ctrl-click skip the dialog** and go straight to the
  routine, which is the escape hatch for somebody who does not want to name a
  city. The handler returns early on those rather than preventing the default.

### TGB SOUNDTRACK BOT OPENS IN A POPUP WINDOW (2026-08-25)

The button in the Tape Room's ADD bar. **The routine has no schedule any more,
so this button IS how it runs**, and you come straight back here to see what it
filed: a tab buries the room behind it, a window sits over it and closing it
puts you back where you were.

- **IT IS STILL AN `<a>` WITH A REAL `href`.** Middle-click, ctrl-click and a
  browser that refuses the popup all still reach the routine.
- **`preventDefault` HAPPENS ONLY AFTER `window.open` RETURNS A WINDOW.** It
  returns null when a blocker refuses, and preventing the default before
  checking is how a button ends up doing nothing at all. Both paths are tested:
  blocked leaves the default alone, allowed prevents it.
- **`noopener` MUST NOT GO IN THE FEATURES STRING**, and this is the trap. With
  it, `window.open` returns **null even when it succeeded**, which is
  indistinguishable from a blocked popup, so the anchor's default fires too and
  **you get a window AND a tab**. The opener is cut afterwards with
  `win.opener = null`, once the handle has been used. The anchor keeps its
  `rel="noopener noreferrer"` for the fallback path.
- **THE WINDOW IS NAMED**, so pressing the button twice reuses it rather than
  stacking two, and it is focused in case it is already behind this one.
- **THE SIZE IS CLAMPED TO THE SCREEN**, not a flat 1180x900: on a laptop
  narrower than that the window would open with its own controls off the edge.
  Centred on `screen.availWidth/Height` rather than the viewport, so a second
  monitor does not throw it off.

### THE HEADER'S SHELVED / LIVE SWITCH IS A FILTER (2026-08-25)

Both of them: the one in the tape head, and the one in an open tape's track
head. **They used to rewrite every row they summarised.**

- **THAT PUT THE MOST DESTRUCTIVE ACT IN THE ROOM IN ITS QUIETEST CONTROL.** One
  press on a switch that reads like a filter, sitting in a header beside two
  actual filters (FLAGGED and NEW), took all 96 live tapes off `/soundtracks/`
  behind a confirm dialog nobody reads. It looked like a filter because in that
  position it IS one.
- **THREE STATES, AND NEUTRAL IS THE MIDDLE.** `all` is the resting state and
  the knob sits centre on it. **Pressing a WORD picks that state and pressing it
  again clears it**; pressing the knob cycles all, live, shelved. A checkbox
  cannot be put into `indeterminate` by a user click, so the label's own click
  is taken over with `preventDefault` and **the input is painted from the state
  rather than driving it**.
- **PER-ROW SWITCHES ARE UNTOUCHED AND STILL WRITE.** That is the whole
  distinction: a switch on a ROW is a status changer, a switch in a HEADER is a
  filter. Proved by a run that presses all four: the tape row POSTs
  `tgb_set_tape_archived`, the track row PATCHes `soundtrack`, and **neither
  header switch sends anything at all**.
- **THE COUNTS ARE OVER THE WHOLE SET, never over what the filter has left.** A
  count that shrank as you filtered would read as the filter breaking, and the
  question it answers is how many there are. Same rule the Anchor Events filter
  strip already keeps.
- **`renderTracks` BUILDS ITS LIST FROM `allSongs`, NOT FROM
  `visibleTrackSongs`**, which is why the first cut of the track filter did
  nothing at all: the state changed, the switch repainted, and the list was
  built from an unfiltered array a few lines away. **Two readers of "what is
  visible" is how a control ends up silently inert.**
- **`tgb_set_all_tapes_archived` IS DROPPED** ([2026082513](mc/supabase/migrations/2026082513_drop_bulk_tape_archive.sql)), the switch having
  been its only caller. `tgb_set_tape_archived` stays: the per-row switch still
  needs it, and it carries the shelve cascade.

### THE TAPE ROOM HAS NO MANUAL AND NO PROMPT BUTTON (2026-08-25)

- **MANUAL created an EMPTY tape, which cannot exist any more**, a tape being
  its tracks. It could not have worked, so it and its dialog and its CSS went.
- **PROMPT is gone because the prompt data moved into the bot.** There is now
  **one** soundtrack prompt: [mc/soundtracks/soundtracks.md](mc/soundtracks/soundtracks.md).
  The stored trigger says only "open that file and follow it", the pattern TGB
  CONCERT BOT already uses, **so there is no pair to keep in step by hand any
  more** and no second copy of the editorial rules to drift. Editing the file
  changes the next run.
  - **What the bot GAINED from the page prompt**: the four-tier US city ladder,
    the fanbase-not-venue trap, the school-not-city trap, the two-tables-spell-a-
    city-differently trap and the 1000-row cliff. Its old rule was "alphabetically
    first empty city", which was cruder.
  - **What is LOST, plainly:** there is no in-room button that hands a human a
    paste-ready prompt. They open the file. The FILL PROMPT on a short tape and
    the per-finding fix prompt both survive and are unaffected.
- **`renderTracks` handed a tape id to `cityStateLabel`/`cityCountryLabel`,
  which take a SLUG**, so the state and country have never drawn on that
  subtitle. Silently, since an unknown slug returns `''`. Fixed in the same pass.
- **The tenth and eleventh escaping scars landed here.** A NUL escape reached
  the file as a real NUL byte, and a newline escape as a real newline, both
  inside a JS string, in a heredoc through python. **Both keys are
  `JSON.stringify([a, b])` now**, which needs no escape at all. `grep` calling an HTML file binary is the tell.

**PROVED BY RENDERING BOTH PAGES against the live 1,643 rows in jsdom**, not by
reading the diff. The Tape Room builds 113 tape lines, opens a flagged tape to
30 track lines reading "30 tracks, 30 live", and draws its finding. The public
page builds 96 cards, a hero count of 96, and opens a random tape on a real
track. Both write paths were proved by calls that made them do their job.

## SOUNDTRACKS — sound / city playlists

> **MUCH OF THE SECTION BELOW DESCRIBES THE THREE-TABLE SHAPE AND IS HISTORY.**
> It is kept for the reasoning, which mostly still holds: the two states, the
> tombstone, the blurb rule, the four finding kinds, the room's four verbs. Where
> it names `soundtrack_songs`, `soundtrack_issues`, a tape id, `spine_tag` or the
> PROMPT dialog, **the note above wins.**


> **"TAPE ROOM" means [mc/soundtracks/index.html](mc/soundtracks/index.html).** Nothing else. It is the room's name on screen (the `<h1>`), it is what to call it in conversation, and an instruction naming it — *"add a button to the TAPE ROOM"*, *"the TAPE ROOM is showing the wrong counts"* — is an instruction about that one file, with no other page to check first.
>
> **EVERY WAY OF NAMING IT RESOLVES HERE.** *Tape Room*, *soundtrack admin*, *soundtracks admin*, the live URL <https://thegamebureau.com/mc/soundtracks/> or the Live Server one <http://127.0.0.1:5500/mc/soundtracks/> — all of them are that one file, and none needs disambiguating before you start. **Reading and writing are different rules**: understand any of those names, but write only **TAPE ROOM** in new copy, comments and commit messages.
>
> | | |
> |---|---|
> | **file** | `mc/soundtracks/index.html` — one self-contained page: markup, CSS and script in the one file, plus the AI prompt in a `<textarea>` |
> | **live** | <https://thegamebureau.com/mc/soundtracks/> — public HTML on GitHub Pages, gated by the admin sign-in |
> | **local** | <http://127.0.0.1:5500/mc/soundtracks/> under Live Server |
> | **tables** | `public.soundtracks`, `public.soundtrack_songs` (both anon-readable), `public.soundtrack_issues` (admin-read only) |
>
> **Don't confuse it with TGB SOUNDTRACK BOT**, which is the scheduled routine that files candidates *into* it — a trigger at claude.ai, not a page. The Tape Room is where a human decides; the bot only ever inserts. Same distinction the Socializer makes with TGB SOCIALIZER BOT.
>
> **`/mc/soundtracks/` and `/soundtracks/` are different things.** The second is the public cassette page a visitor sees, and only LIVE tracks appear on it. The two paths now differ by one segment, so read carefully: `/mc/` is the room, the bare one is the shop window. Exactly the trap `/mc/gifts/` and `/gifts/` already set.
>
> **IT MOVED OUT OF `/admin/` ON 2026-08-17**, from `mc/soundtracks/admin/index.html`, to match the Stock Room at `/mc/gifts/` and the Socializer at `/mc/socializer/` — every other room is named by its folder and this one carried a segment none of the others did. **A hard break with no redirect**, since GitHub Pages serves no 301: any bookmark on `/mc/soundtracks/admin/` is dead and now 404s. Every in-repo reference was repointed in the same commit — the hub's Ancillary Things card, the shared admin nav's `href` **and its `match`** (that regex is what lights the button up when you are standing in the room, so it has to move with the href), `mc/review/index.html`, `soundtracks.md` and `PROMPTS.md`.

The public page [soundtracks/index.html](soundtracks/index.html) renders city cassette cards at runtime from **two Supabase tables**: `public.soundtracks` (one row per city tape — `city_slug` PK, `spine_tag`, `spine_tag_position`, `archived`) and `public.soundtrack_songs` (one row per track — `city_slug`, `position`, `title`, `artist`, `blurb`, `spotify_id`, `explicit`, `archived`), plus the `public.soundtrack_stats` view for per-tape counts. Schema: [mc/supabase/migrations/2026072904_soundtracks_tables.sql](mc/supabase/migrations/2026072904_soundtracks_tables.sql); the 69-tape / 929-song lift out of the old JSON file is [2026072905_soundtracks_seed.sql](mc/supabase/migrations/2026072905_soundtracks_seed.sql).

- **There is no JSON file.** `soundtracks/soundtracks.json` and its exporter `_dev/scripts/soundtracks-export.mjs` were **deleted 2026-08-06**. Between 2026-07-29 and then the file survived as an offline fallback that `/soundtracks/` read when the Supabase fetch failed, regenerated and committed by the daily routine. It was removed because the fallback made an outage *invisible*: the page rendered a stale catalogue that looked correct, so nobody learned the tables were unreachable, and the file had to be regenerated forever to stay honest about a state it was only meant to cover for. **Supabase is now the only source** — a failed fetch shows "Could not load soundtracks." and the footer stat simply goes unset. Don't reintroduce a committed snapshot, an exporter, `city-playlists.json`, `song-playlists.json`, or a CSV-driven build script; every one of those existed and was deliberately removed. **The routine now commits nothing at all**, matching the gift shop and socials bots.
- **Both reads paginate.** PostgREST caps a response at 1000 rows and truncates silently; `soundtrack_songs` is already past 900. The page and the admin each carry a `Range`-paging `fetchAllRows`.
- It reads `public.cities` with **`select=*`** only for nicer city display names + geo badges, filtering out rows flagged `hide_from_soundtracks` (falling back to the retired `ignored` column). This is optional: if the cities fetch fails, `fallbackCityRowsFromSoundtracks` renders from the tape slugs alone. **The page depends on no specific `cities` column** — don't reintroduce one.
- The old per-city `cities` sound columns (`sound_playlist_id` / `sound_accent` / `sound_secondary`) were **dropped 2026-07-24**; soundtracks are handled separately now and cassette colors come from the CSS `nth-child` scheme. Don't re-add them.
- **`archived` on a song is a do-not-rescrape tombstone**, not a delete: the row stays on its city so the same title+artist is never picked again there, while `/soundtracks/` hides it and active counts ignore it. A **unique index on `(city_slug, lower(title), lower(artist))`** is what enforces that — an INSERT of a retired song hits the index and does nothing. **The tombstone is scoped to the city, never to the song**: because `city_slug` leads that index, a track hidden on one tape can be added to another and stay active there, which is what makes the Tape Room's **Copy** work (it inserts with `archived = false`). Don't "fix" this by making the index global — a song can genuinely belong to two cities.
- **A tape over 15 kept tracks is trimmed by SKIPPING the most recently added**, newest `created_at` first, until 15 remain — never by skipping an older track to keep a newer one, since the earlier fifteen are the considered set. The agent cannot skip, so it files an over-full tape as a `facts` issue naming the surplus and a human presses Skip.
- The footer's soundtrack stat ([footer/site-footer.js](footer/site-footer.js)) counts `soundtrack_stats` rows with `active_songs > 0` via `Prefer: count=exact`, falling back to the JSON file.

Do not reintroduce per-city generated card HTML, `city-playlists.json`, `song-playlists.json`, or CSV-driven build scripts under `soundtracks/`. To add a soundtrack, insert rows (and add the city to `public.cities` first — `city_slug` is a FK to `cities.slug`).

### Two write paths, deliberately asymmetric

- **Agents insert; only humans publish or retire.** The routine calls **`tgb_pull_soundtrack_songs(jsonb)`** ([mc/supabase/migrations/2026072906_soundtrack_pull_rpc.sql](mc/supabase/migrations/2026072906_soundtrack_pull_rpc.sql), rewritten by [2026080104](mc/supabase/migrations/2026080104_soundtrack_song_review.sql)) with the ordinary public publishable key — a cloud routine has no secret store, exactly the constraint that produced `tgb_pull_book_candidates`. It is `SECURITY DEFINER` and tiny: insert-only, creates the tape row if missing, refuses a `city_slug` that is unknown or `hide_from_soundtracks`, ignores `spine_tag` on an existing tape, drops a malformed `spotify_id`, caps a call at 60 songs across 4 tapes, and **always writes `archived = true` / `certified_at = null` / `rejected_at = null`**. **Don't add parameters for those three** — those constants are what make it safe to expose to `anon`.
- **TWO STATES ONLY, AND `archived` IS BOTH OF THEM (2026-08-16).** SHELVED is `archived = true`, LIVE is `archived = false`, and there is nothing else. That column is the only status any public surface has ever read, so the states now mean exactly what the site does with them. **Everything arrives shelved** — the routine's songs, a tape created by MANUAL, a tape created by the RPC.
  - **REVIEW is gone**, along with `certified_at` / `rejected_at` as state. It was a third state derived from two timestamps being null, distinguishing "nobody has looked at this" from "a human said no". **That distinction is TIME now, not state**: shelved AND recently added is the queue, which the room shows as its **NEW filter** (72 hours, `NEW_FOR_HOURS`). A time-based queue empties itself; the state-based one had accumulated 246 candidates.
  - **The two timestamp columns are RETIRED IN PLACE, not dropped** ([2026081603](mc/supabase/migrations/2026081603_soundtracks_two_states.sql)), the same way `public.maps` and `waypoints.tour_id` were. Dropping `rejected_at` is the one irreversible act available: it is the only record of which tracks a human personally turned down, as against the ones the routine filed and nobody reached. Nothing reads or writes them; the column comments say so.
  - **THE AUDIT NOW REPORTS ON SHELVED TRACKS, and the trigger that stopped it is DROPPED.** `tgb_soundtrack_issues_skip_shelved` silently discarded any finding whose track had `rejected_at` set, on the reasoning that shelving is the strongest fix available. **That reasoning inverts under two states**: everything the routine files is shelved, so the trigger would have silenced the audit across the whole catalogue — precisely the tracks nobody has read yet. A finding is a **statement**; a human decides. Don't reintroduce it.
  - **Restoring a tape now brings back almost nothing**, and that is correct. The cascade only un-shelves tracks it shelved itself (`archived_with_tape`), and a tape's tracks now arrive shelved on their own, never stamped. A restored tape is live and empty until you keep tracks individually.
  - **THE WORDS ARE LIVE AND SHELVED, AND THE BUTTON READS THE STATE IT PRODUCES.** KEEP / KEPT was the fifth name this state wore and the last one that disagreed with the control setting it: the switch on every tape row and in the tracks popup has always read **Shelved | Live**, so a chip saying "12 kept" beside it was the room describing one thing two ways. `STATUS_LABEL` and `STATUS_VERB` now hold the **same** words, which is why LIVE is not a verb. Don't reintroduce Keep, Kept, Archive, Hide, Skip or Review for a track. **Keep survives for an ISSUE only** (Delete issue / Keep issue), which is a different object and a different verb.
  - **The shortcut is L, with K kept as an unlabelled alias.** The legend reads `L live · S shelve · E edit · N next`; K was the binding for four months and muscle memory outlives a rename.
  - `STATUS_LABEL` / `STATUS_VERB` hold two entries. `songStatus` reads `archived` alone. **Renew on a finding now writes LIVE**, because with two states un-shelving *is* the judgement.
- **HISTORICAL, superseded by the two-state note above — songs used to land in a REVIEW queue** (added 2026-08-01), the same three states as `gift_shop_items` and derived the same way: **REVIEW** = both stamps null and it's the automatic state, **LIVE** = `certified_at` set, **SHELVED** = `rejected_at` set. Until 2026-08-01 the pull published straight to `/soundtracks/` — inherited from the era when the routine committed `soundtracks.json` to `main` — which made it the only place an agent's output reached the public site unreviewed. A human presses **Keep** or **Shelve** on the track in the Tape Room — those are the button faces for LIVE and SHELVED; see the rename note below.
  - **`archived` was not replaced and still means exactly what it did**: the flag `/soundtracks/` filters on, the one active counts ignore, and the do-not-rescrape tombstone the unique index enforces. Review candidates are `archived = true`, so **the public page needed no change** — an unreviewed track is invisible for the same reason a hidden one is.
  - **Hide was merged into one verb** (2026-08-01, a day after the queue landed). They were the same effect described two ways — off `/soundtracks/`, row kept on the city as a tombstone — and having both meant three buttons for two outcomes. That verb was SHELVE then and is **SKIP** now; see the rename note below for the full chain. `setTrackArchived` is gone; **every track write goes through `setTrackStatus`**, so `archived` can't drift out of step with the two stamps.
  - **Shelving leaves `certified_at` alone**, so shelving a live track and later restoring it doesn't lose the fact that it was once approved.
  - The backfill in 2026080104 puts the whole existing catalogue in a decided state so **the queue starts empty**: visible rows and tape-cascade-hidden rows become LIVE (cascade hiding was never a judgement on the track), individually-hidden rows become SHELVED.
- **Archive / Restore is a human action** in the Tape Room, PATCHing `soundtrack_songs.archived` (one track) or `soundtracks.archived` (a whole tape) under an admin session; RLS grants writes to `authenticated` only.
- **Every track field is editable in the Tape Room** as of 2026-07-30 — press **Edit** on a row for title, artist, blurb, `spotify_id`, `explicit` and `position`, plus **Move** / **Copy** to another tape. Move is a PATCH of `city_slug`; Copy is an INSERT on the target tape with `archived = false`. Two rules the UI enforces and any future editor must keep: a blank `spotify_id` is always allowed and always better than a guess (the player falls back to a Spotify search, and a fabricated 22-char ID passes the CHECK and silently plays nothing); and **moving a hidden track carries its tombstone to the new city**, freeing the routine to re-pick that song for the old one — which is why Copy, not Move, is the right verb for a song that belongs to two cities. A rename or move that collides with the `(city_slug, lower(title), lower(artist))` unique index surfaces as a plain-English "that tape already has it, it may be hidden" message rather than a raw 23505.
- **The UI says KEEP / SKIP / REVIEW; the column stays `archived` and the code stays `LIVE` / `SHELVED` / `REVIEW`.** The visible vocabulary has been renamed **four times** and nothing underneath has ever moved with it: ARCHIVE → **HIDE** (2026-07-30, because "archive" read as filed-away or deleted when the effect is simply that the track leaves `/soundtracks/` and stops counting) → **SHELVE** (2026-08-01, merging Hide into the review queue's verb) → **SKIP** (2026-08-14, pairing it with KEEP, which are the Socializer's own two verbs and native music words besides). SHELVE survived at the **tape** level — see below.
  - Buttons read **Keep / Skip / Review**; chips read **Kept / Skipped / Review**.
  - **A TAPE IS SHELVED, A TRACK IS SKIPPED**, and the two verbs are deliberate rather than a leftover. They are different columns doing different jobs — `soundtracks.archived` takes a whole city off `/soundtracks/` in one move, `soundtrack_songs.rejected_at` turns down one song — and one word for both read as a single action with two scopes. "Skip a tape" is also just wrong: skip is what you do to a track on a player, a shelf is where a whole tape goes. So the tape level is **Shelve tape / Restore tape**, and the whole-tape chip reads **Tape shelved**.
  - **`Restore tape`, never `Keep tape`** — restoring brings back only the tracks the tape took down with it, and a track skipped on its own stays skipped. "Keep tape" would promise otherwise.
  - **The words live in `STATUS_LABEL` and `STATUS_VERB`** in [the Tape Room](mc/soundtracks/index.html), and nowhere else. Put any fifth rename in those two maps. The status strings, the CSS hooks (`.is-live`, `.is-shelved`) and the `data-tab` values are identifiers and stay put — renaming them would leave them agreeing with the buttons and disagreeing with the column, the timestamps and the gift shop's identical scheme.
  - Don't reintroduce "Archive", "Hide" or "Live" in visible copy, and don't collapse the tape/track verbs back into one.
- **The routine also audits, and reports to `public.soundtrack_issues`** (added 2026-07-30, [mc/supabase/migrations/2026073002_soundtrack_issues.sql](mc/supabase/migrations/2026073002_soundtrack_issues.sql)). Four kinds — `spotify` / `spelling` / `relevance` / `facts` — at three severities, drawn on the track each one names (and on the tape, for a finding that names no track) with a ⚠ chip on the row and the **FLAGGED** filter to find them all. Scope per run is the two tapes it just wrote plus the **3 least-recently-audited**, ordered by the new `soundtracks.last_audit_at` (null first), so the catalogue is swept every couple of weeks at flat cost. **The agent reports and never edits** — same human-in-the-loop split as everything else here.
  - Writes go through **`tgb_report_soundtrack_issues(jsonb)`**, `SECURITY DEFINER`, publishable-key callable, insert-only, always `status = 'open'`, ≤40 findings a call, and it drops a `song_id` that isn't on the named tape. **Don't add a `status` parameter** — that constant is what makes it safe to expose, exactly as with the two pull RPCs.
  - **Clearing only empties the queue; it never silences a finding.** The single **Clear issue** button writes `fixed`, and the partial unique index on `fingerprint` only blocks a re-report while a row is `open` or `dismissed` — so a cleared finding comes straight back on the next audit if the problem is still there. **That recurrence is the only check that a fix landed.** The fingerprint is `md5(city_slug:song_id:kind)` — deliberately **not** the detail text, which the agent rewords every run and which would defeat the dedupe entirely.
  - **The "Not an issue" button was removed 2026-08-01** and the page no longer writes `dismissed` at all. A permanent silence was a decision nobody could see afterwards, and it made a wrong dismissal unrecoverable without SQL. The `dismissed` status still exists in the index's `where` clause, so **any rows dismissed before that date still suppress their finding forever** — `update public.soundtrack_issues set status = 'fixed' where status = 'dismissed';` releases them if you want a clean slate. Don't reintroduce the button.
  - **A shelved track gets no findings.** A `before insert` trigger (`tgb_soundtrack_issues_skip_shelved`, [2026080104](mc/supabase/migrations/2026080104_soundtrack_song_review.sql)) silently drops a report whose `song_id` has `rejected_at` set — shelving is the strongest fix available, so there's nothing left to ask. It's a trigger, not a condition inside the RPC, so the rule also holds for psql and the table editor. **Existing** findings against a track shelved later are left in the table and filtered in the Tape Room instead, so un-shelving brings them back rather than losing them.
  - **THERE IS NO ISSUES VIEW. A FINDING IS DRAWN ON THE TRACK IT IS ABOUT** (2026-08-16). It had been a list of its own since the table existed, and every shape that list took had the same flaw underneath: a finding is a fact about a track, so a row in a separate list has to repeat the city and the track name just to say what it is talking about, and then offer a way back to the thing it is talking about. Rendered inside the track's card it inherits both for free. `renderFindings(issues)` returns the block and `renderFindingRow` builds one; the queue card and the catalogue's track rows both call it, so a finding looks the same wherever you meet it. **A finding with no `song_id` is about the tape** and renders on the tape, above its tracks, since several of them (short of 15, over 15) are statements about the list that follows.
  - **What that cost, and the FLAGGED tab that pays for it.** There is no longer one place listing every open finding, so a finding against a track nobody scrolls to is a finding nobody sees. **FLAGGED is the fifth filter in the catalogue** and exists solely for that: it keeps a tape when any of its tracks carries a finding *or* when the tape itself does, so a whole-tape finding cannot become unreachable by having no track to hang on. Don't delete it as redundant with the chips.
  - **Two chips on a finding, not four.** The kind, plus `whole tape` when it names no track. TAPE/TRACK, the city and the track name were all needed by a flat list and are all inherited now. The ⚠ chip on the track row survives as a **marker you can spot while scrolling** and nothing more: it used to carry every finding's text in a tooltip ending "open the Issues view to act on it", which is now three kinds of wrong.
  - **The buttons are unchanged and the reasoning behind each still holds.** A track finding offers **Shelve track · Skip issue**; a tape finding offers **Shelve tape / Restore tape · Skip issue**; a finding against an already-shelved track offers **Renew** alone. Shelving answers the finding, so it skips it in the same press, quietly, since `setTrackStatus` / `setTapeArchived` have already written the outcome to the red pen. **Restoring a tape does not skip it** — that is the opposite move and usually the thing the finding was complaining about. Renew puts the track back to **REVIEW, not LIVE**: un-shelving is a change of mind about the judgement, not a judgement of its own.
  - **A shelved track draws its own findings**, which is why `songIssues()` reads the whole array rather than `openIssues()`. Renew has to have something to sit on, and with the Issues view gone there is nowhere else those findings could appear. `issueSongMap` / `rebuildIssueSongMap` cached the *open* set for the old chip and were deleted with it.
  - **View tape / View track and their dialog are gone**, along with `openDataDialog`, `focusTapeForIssue`, `focusTrackForIssue` and the `.data-body` styles — there is nothing to navigate to when the finding is already inside the thing. The `onDone` argument both editors grew to close that dialog went too. (`pendingFocusSongId` and `.is-flagged-focus` had already gone in an earlier pass, for the same reason: nothing reaches into `renderTrackRow` from outside.)
  - **Skip issue still writes `status = 'fixed'`, never `dismissed`.** The partial unique index blocks a re-report only while a finding is `open`, so a skipped finding comes straight back on the next audit if the problem is still there, and **that recurrence is the only check a fix landed**. `dismissed` remains the status this page refuses to write.
  - `resolveIssue` filters the **whole** loaded set, not `openIssues()`, and repaints **both views** — the finding is drawn in each of them.
  - **These rows are not publicly readable**, unlike `soundtracks` / `soundtrack_songs`: "this song has no real tie to the city" is an internal editorial note. SELECT is `authenticated` only, which is why the admin's `fetchAllRows` grew a `useAuth` flag. The agent needs no SELECT — dedupe is server-side.
  - The admin tolerates the table being absent (the issues fetch `.catch`es to `[]`), so the page still works against a database that hasn't run the migration.
- **Archiving a tape cascades to its tracks**, via the `soundtracks_cascade_archive` trigger ([mc/supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql](mc/supabase/migrations/2026073001_soundtrack_tape_archive_cascade.sql)). It archives the tape's *live* songs and stamps them `archived_with_tape = true`; restoring the tape clears exactly those. **A song archived on its own stays archived through a tape restore** — that row is a do-not-rescrape tombstone, the one thing here that must never come back by accident. It lives in a trigger, not the admin page, so the rule holds for the Supabase table editor and psql too, and can't be half-applied by a client that dies between two requests. Anything reading `active_songs` depends on this: before the cascade a hidden city still reported 15 active tracks.

### THE FINDINGS TABLE IS FOLDED ONTO THE ROW, AND `soundtracks` IS `soundtrack` (2026-08-25)

Three tables became two. [2026082506](mc/supabase/migrations/2026082506_soundtrack_fold_findings.sql) + [2026082507](mc/supabase/migrations/2026082507_soundtrack_findings_access.sql), both **applied**.

| was | now |
|---|---|
| `soundtracks` (113 tapes) | **`soundtrack`** |
| `soundtrack_songs` (1,643) | unchanged |
| `soundtrack_issues` (285) | a **`findings` jsonb array** on the row each is about |

- **jsonb AND NOT COLUMNS, because a row carries more than one.** Checked
  against the live table: three tracks hold three findings each, and the four
  kinds are independent. Flat `issue_kind` / `issue_detail` columns would have
  silently dropped the rest.
- **THE TAPE GETS THEM TOO.** 66 of the 285 name no track — they are statements
  about the LIST (short of 15, over 15) — so folding everything onto tracks
  would have lost all 66.
- **21 OF THOSE 66 HAD A NULL `tape_id`** and were lost by the first backfill:
  they predate that column and carry only `city_slug`. **Caught by counting 285
  in and 264 out**, not by reading the SQL. Placed by resolving `city_slug` to
  the first tape, the same rule the RPC uses; **2 of them are in Tampa, which
  has two tapes, so those two are a guess** — both already `fixed`, so nothing
  live turned on it.
- **THE FINGERPRINT DEDUPE MOVED INTO THE FUNCTION.** A jsonb array cannot carry
  a unique index, so `tgb_report_soundtrack_issues` checks the array before
  appending. **The rule it protects is unchanged**: open findings only, so a
  finding cleared to `fixed` becomes reportable again and that recurrence is the
  only check a fix landed. Proved by a call — a reworded repeat came back
  `{"added": 0, "skipped": 1}`.
- **`soundtrack_issues` IS RETIRED IN PLACE, NOT DROPPED**, like `public.maps`.
  Nothing reads it; the `drop` sits commented at the bottom of 2026082506.
  **It still holds its 285 rows, so anything still reading it sees a count that
  never moves again** — which is exactly what the hub was doing until it was
  repointed.

### THE FOLD LEAKED EVERY EDITORIAL NOTE, FOR A FEW MINUTES

**`soundtrack_issues` was admin-read only** — RLS answered `anon` with `[]`.
`soundtrack_songs` and `soundtrack` are **publicly readable**, because the
cassette page needs them. So the moment the findings moved, anyone holding the
publishable key — **which is in the public HTML of this site** — could read
*"this song has no real tie to the city"*.

- **MOVING A COLUMN MOVES IT UNDER A DIFFERENT RLS POLICY.** A table's privacy is
  a property of the TABLE, not of the data. **Folding a private table into a
  public one publishes it, and nothing warns you** — the rows simply appear.
  Found by asking the live database with the publishable key, which is worth
  doing after any change that moves data between tables.
- **A COLUMN-LEVEL `revoke` CANNOT OVERRIDE A TABLE-LEVEL GRANT.** `select` on a
  table means every column, present and future. The first attempt revoked the
  column and changed nothing. The fix is to revoke the TABLE grant and re-issue
  it column by column, omitting `findings`.
- **SO `select=*` AS `anon` NOW ANSWERS 42501** on both tables, because PostgREST
  expands `*` to columns the caller cannot read. **The public cassette page names
  its columns instead. Do not put `*` back** — that is the privacy boundary, not
  tidiness.
- **`public.soundtrack_findings` is the flattened read**, one row per finding,
  **`security_invoker = true`** so the caller's grants apply. Without that a view
  runs as its owner and would hand `anon` exactly what the grants just took away
  — the same leak through a different door. Granted to `authenticated` only.
- **`tgb_resolve_soundtrack_finding(id, status)` clears one**, because a view is
  not updatable through PostgREST. It is the first soundtrack function that is
  not insert-only, so **its first line is `is_photo_admin()`** — the grant alone
  would let any authenticated Supabase user call it.

**WHAT READS WHAT NOW.** The Tape Room rebuilds its flat `soundtrackIssues`
array from the two reads it already makes, so everything downstream of that
variable is untouched; writing one back reads the owning row, edits the element
and PATCHes the whole array. The hub counts and lists through
`soundtrack_findings` and clears through the RPC. The public page and the footer
were only affected by the rename and the column list.

### ONE VIEW, ONE LIST, FOUR VERBS (2026-08-16)

**The room is a single list of tapes, and there are no view tabs.** It has been two stacked panels (catalogue + findings), then two tabbed views of one panel, then a queue and a catalogue, all inside three weeks. The last of those lasted an afternoon: a separate QUEUE view meant a track had **two homes, two renderings and two sets of buttons**, and you had to know which room you were standing in before you knew what a press would do.

- **A TAPE AND A TRACK GET THE SAME FOUR BUTTONS, IN THE SAME ORDER: KEEP · SHELVE · EDIT · NEXT.** That is the rule the whole room now hangs off. Learn the row once and you can work either scope. **All four are always present**, greyed rather than removed when they do not apply — a track already kept greys KEEP, a shelved tape greys SHELVE. Removing a button instead would move the other three, so the position of the one you want would depend on the state of the row you are looking at.
  - **KEEP ON A TAPE IS RESTORE, and the tooltip has to keep saying so.** This button read `Restore tape` until this pass, deliberately: restoring brings back only the tracks the tape took down with it, and **a track shelved on its own stays shelved** because that row is a do-not-rescrape tombstone. "Keep tape" promises more than it delivers. The four-verb rule won anyway; **the honesty moved into the tooltip**, and it must stay there.
  - **NEXT decides nothing.** On a track it moves the focus to the next one, running off the end of a tape into the next tape rather than stopping dead on the last row of every city. On a tape it closes this one and opens the one after it.
- **THERE IS NO QUEUE, BECAUSE THE REVIEW FILTER IS THE QUEUE.** That is the whole reason the separate view could go. The filter strip is REVIEW / KEPT / SHELVED / FLAGGED / ALL with live counts, and it is **a filter, not a view switch**: every option shows the same list of the same tapes, narrowed.
- **THE FOCUSED TRACK is the room's one piece of state**, `focusSongId`. It is the row the keyboard acts on and the only one that builds a Spotify player, so it is drawn unmistakably (accent border plus a ring) rather than implied by hover, which is gone the moment you reach for a key. Clicking anywhere on a row that is not a control focuses it.
  - **It is an ID, not an object.** Every write reloads the tables, so a remembered object is a stale object.
  - **FOCUS SURVIVES A DECISION, and this is the bit that makes the room usable.** Keeping a REVIEW track while the REVIEW filter is on takes that row out of the list, so the focus would vanish with it and the next keypress would do nothing. `renderTrackArchive` reads the focused row's **screen position** before the DOM goes and, if the id is not in the new list, lands the focus on whatever moved up into its place. That is what makes fifteen decisions fifteen keypresses. One guarded re-render, so the new row gets its player.
  - `visibleSongIds()` reads the DOM on purpose: it is the only thing that knows what the filter, the search and the open/closed tapes have actually left on screen, which is the order NEXT and the arrow keys should move in.
- **Keys: K keep, S shelve, E edit, N or ↓ next, ↑ back.** A full tape is fifteen decisions and a mouse is the slow way. `trackKeydown` bails on any INPUT / TEXTAREA / SELECT / contenteditable target, or the S of "Shelve" typed into a blurb would shelve the track. **The legend is on screen**, in the filter bar, not in a tooltip: a shortcut nobody knows about is a shortcut nobody uses. It also bails when `soundtrackArchiveData` is null; it read `document.body.classList.contains('is-admin')` at first, which is the **Socializer's** flag and one this room does not set, so every shortcut was silently dead.
- **THE PLAYER IS BUILT FOR THE FOCUSED TRACK ONLY.** Judging a track means hearing it, and the room's old Spotify button opened a new tab, so 246 decisions meant 246 round trips out of the room. Fifteen iframes a tape would be fifteen requests to Spotify for tracks nobody has reached. The per-row Spotify link is gone with it. **A missing `spotify_id` is not an error** — the routine is told to omit an id it could not verify rather than guess one, since a fabricated 22-character id passes every check and silently plays nothing — so a blank falls back to a Spotify *search*, exactly as `/soundtracks/` does.
- **NOTHING ON A CARD SAYS WHAT SOMETHING ELSE ON SCREEN ALREADY SAYS.** The room's real fault was never its shapes, it was repetition, and every layer had added its own.
  - **No status chip on a track.** The card states its state three times already: the coloured rail down its left edge, whether it is dimmed, and which of KEEP and SHELVE is greyed. A pill at the top of all 246 cards reading REVIEW, while the REVIEW filter was on, was the loudest repetition in the room.
  - **The `Spotify ID` chip is drawn only when the id is MISSING.** The absence is the news: 1,200 tracks have one and the chip said nothing about any of them, while a missing id is the thing worth acting on and the reason the player falls back to a search.
  - **`added N ago` is on a REVIEW card only.** "Did the last run write this?" is a real question about a candidate and no question at all about a track decided weeks ago, where it was simply the longest thing on the card.
  - **The totals line carries only the tape count.** It used to read "89 tapes (14 shelved) · 1018 kept · 246 in review · 59 shelved" one line under a filter strip saying kept, in review and shelved in the same words and the same figures. Tapes is the one number the strip cannot show.
  - **The KEYS legend moved out of the control row** onto the footnote line beside the tape count. In the bar it read as a fourth control; it is a footnote. **It must not be a child of `#trackArchiveStatus`** — `setArchiveStatus` writes `textContent`, which wipes any element inside, so nested there it was painted once at startup and erased by the first render.
- **A TAPE IS A HEADING, NOT A BOX.** The queue's shape, and the thing the list lost when the queue was folded back into it: a bordered group around a bordered card is two frames for one thing, and with a filter strip and a panel around those it was four. `.tape-group` now draws **no border, no background and no shadow** — the city sits large on the panel with the tracks as cards under it. The dashed frame on a shelved tape went too; the struck-through name already says it. **The tape's counts are quiet mono text, not pills**: they are built as chips by `renderTapeGroup` and stripped to text in CSS, so the markup stays one thing. Outlined chips made the counts louder than the city they belong to.
- **EVERY TRACK ROW IS THE QUEUE CARD.** Not a row wearing the card's colours: **one column**, so the words get the full width and the four buttons sit under them in their own band at full size rather than in a narrow gutter on the right. Four small buttons pinned right read as row furniture; across the card they read as the four things you can do. `.queue-card` and the rest of the queue's CSS were **moved onto `.track-row`, not deleted**.
  - **The card's ORDER is load-bearing: what the track is, what it sounds like, what is wrong with it, then what you can do.** Title as a heading with **the artist on its own line** (they were one string joined with a hyphen, which reads as the join inside a title like *0241 - Null zwo vier eins*), the blurb quoted at reading size because it is the copy that will sit under the track on the public page, then the player, then the findings, then the actions. Appending the actions first put the buttons above the player, which asks for the decision before handing over the evidence.
  - **NEXT sits after a spacer**, on the right, where the queue card put Later: it is the one button of the four that decides nothing.
- **A missing blurb is drawn in the red pen.** A blurb is REQUIRED and what has no minimum is its LENGTH; the audit files a missing one as a `facts` finding. The row used to fall back to printing the `spotify_id`, which is not a blurb and not readable.
- **The catalogue is alphabetical**, which it claimed to be in a comment and was not — rows came back in whatever order PostgREST returned them, so the room opened on Youngstown, Antalya, Barcelona, Amsterdam. It also gained a **city search** (city name and spine phrase only, never track titles: searching "kansas" should not return six other cities' tracks) and **lost the `N shown` chip**, which appeared under every tape whenever a filter was on and restated the length of the list directly below it.


### TGB SOCIALIZER BOT ALSO FINDS ONE YOUTUBE VIDEO A RUN (2026-08-20)

Step **2c** of the routine's prompt: one video worth sharing on our own channel, filed as a **SIXTH row**. The gift and the four stories are untouched and it does not replace any of them.

- **WE SHARE IT AS A POST ON THE CHANNEL**, which is YouTube's own way of pointing at somebody else's video. Nothing is reuploaded and no video is made; the deliverable is a link and a sentence.
- **ONE, NOT FIVE.** A channel that shares somebody else's video twice a day is a channel nobody follows, and one a run already is twice a day. **Filing none is a good answer** and the prompt says so: the five stand on their own, and a weak share costs more than a missing one because it sits on our own channel under our name.
- **A BY-HAND TAG IS A MARKER, NOT A FENCE (2026-08-21).** Naming YouTube says *this also needs doing by hand*; it says nothing about whether the video suits Facebook. **A good video is a good Facebook post**, and until this change the marker was quietly acting as a veto on all three machine accounts.
  - **`suggestedKeys()` NOW COUNTS ONLY ACCOUNTS MACHINE POSTING IS ON FOR**, and returns `null` when none were named. So a row tagged YouTube alone has expressed **no machine opinion** and is offered all three, exactly like an untagged legacy row. The `[]` return that used to mean "named accounts, none postable" is gone; `postTargets`' `if (!wanted)` now catches every no-narrowing case, which is what it always meant.
  - **IT READS `PLATFORM_AUTOPOST` RATHER THAN A HARDCODED LIST, WHICH MAKES IT SELF-CORRECTING.** X is in `WIRE_LABELS` because the Edge Function really can reach it; it is by-hand today only because `PLATFORM_AUTOPOST.x` is false over the price. **Flip that flag and an X-tagged row starts narrowing to X again with no other change** — and `byHandTarget()` reads the same flag, so the Copy button stops saying "for X" about something the machine just posted. **The flag beats `PLATFORM_SUGGEST_ONLY`**: one is a decision, the other a fact.
  - **A CANDIDATE CAN HAVE TWO BY-HAND DESTINATIONS, AND BOTH ARE NAMED (2026-08-21).** `byHandTarget()` returned the FIRST match, so a row tagged X **and** YouTube offered *Copy to clipboard for X* and YouTube vanished with nothing on screen saying it existed. **That is the worst shape a bug can take here: the button looked right, so nobody would go looking.** `byHandTargets()` returns them all and the label reads *Copy to clipboard for X and YouTube*.
  - **ONE BUTTON NAMING BOTH, NOT TWO BUTTONS.** What goes on the clipboard is identical for every by-hand destination — caption and link — so a second button would put the same text on the same clipboard and differ only in its label. The job is **two pastes from one copy**, and that is what it says.
  - **THE COPY DIALOG FOLDS THE WARNING INTO THE QUESTION**: *"Mark this candidate as posted once you have done both?"* Answering yes having pasted into only one is the trap, and *"both still need doing"* as a separate sentence beside *"mark as posted?"* is two things to hold at once. Folded in, the question carries its own condition and cannot be answered without reading it.
- **`isYouTubePost()` MEANS "NAMES YOUTUBE AT ALL"**, not "names it exclusively". A row tagged YouTube, Facebook and Threads is still a video and still has to say so on its card and its Copy button.
  - **THE PROMPT JUDGES THE OTHER THREE ON THEIR OWN TERMS** now: Facebook nearly always (a video link unfurls), Threads usually, **Instagram only when the THUMBNAIL is worth looking at alone** — that is what actually gets posted there, since an IG caption's link is not clickable.
- **THE MARKER IS `platforms: [{name: "YouTube"}]` AND NOTHING ELSE, AND IT IS LOAD-BEARING.** That one array does three jobs: it greys the Post button (correct, since nothing we have posts to YouTube), it puts the row behind the YouTube filter, and it is the only thing telling the queue this is a video. **Adding Facebook or Threads to it turns the row back into an ordinary post that happens to link to YouTube**, which goes out to the wrong accounts.
- **A YOUTUBE-ONLY ROW USED TO OFFER TO POST TO FACEBOOK.** `suggestedKeys()` returned `null` for *both* "no advice" and "named accounts we cannot post to", and null means no narrowing. Null is now silence ONLY (absent, not an array, or empty), which is every legacy row and every MANUAL row and is what keeps those postable; `[]` now means the bot named accounts and none are postable. **`[]` is truthy, so `postTargets`' `if (!wanted)` still catches only null and needed no change.** Side effect, and the right one: a row naming only an unrecognised platform now posts nowhere rather than everywhere, because a named account is a statement.
- **THERE IS NO YOUTUBE FILTER IN THE QUEUE.** One existed for about an hour on 2026-08-20 and was removed: a video is just a candidate in Review like the other five, told apart by **its own Post button**, and a control that narrows a list of a dozen rows to one of them is a control nobody needs. It also put a third question ("what kind?") beside a strip already answering "which ones?".
- **`PLATFORM_SUGGEST_ONLY` IS WHERE YOUTUBE LIVES, and that object was built for exactly this.** It is the difference between "not wired yet", which is a promise, and "cannot be posted by machine", which is a fact; one greyed button for both implies something is coming that is not. It was emptied on 2026-08-07 when YouTube left the page and refilled on 2026-08-20 when the routine started filing videos.
- **The ids end `-y1`**, so six rows from one run do not have to be counted to be told apart.
- **The thumbnail is `https://i.ytimg.com/vi/<id>/maxresdefault.jpg`**, with `hqdefault.jpg` as the fallback the prompt names, because maxres does not exist for every video.

- **THE PAGE PROMPT HAS IT TOO, AS OF THE SAME DAY.** It was routine-only for an hour, on the argument that a chat AI cannot check its own work against the queue. That held for the *count* and not for the *marker*: a human pasting SQL with `platforms` naming Facebook on a video row files a candidate that posts to the wrong accounts, and nothing downstream catches it. Better for the rule to be in front of them. **The dialog's title is now `Six Post Candidates`**, because the number is the one thing a reader checks the returned SQL against.
- **The video is the SIXTH ROW OF THE SAME `insert`**, not a second statement, and the worked example in step 7 now carries it with `-y1` and the YouTube-only `platforms` array spelled out.

### INSTAGRAM CAPTIONS END "See link in bio." AND CARRY NO URL (2026-08-21)

`instagramCaption()` in [socials-post](mc/supabase/functions/socials-post/index.ts). Instagram alone; Facebook, Threads and X are untouched.

- **INSTAGRAM IS THE ONLY ACCOUNT WHERE A CAPTION URL DOES NOTHING.** Not clickable, not selectable in the app, not copyable without a fight. Every story posted there has been a thing you can see and cannot reach; [/linkinbio/](linkinbio/index.html) is the answer and **this sentence is the only signpost to it** — without it the bio link is an address nobody is told about.
- **THE URL IS DROPPED FROM THE INSTAGRAM CAPTION, and that was not asked for.** Appending the line while `captionFor()` still added the link produced a caption with a **dead address sitting directly above "See link in bio."**, which asks the reader which link is meant and answers with the one thing on the post they cannot use. `instagramCaption` calls **`blurbFor`, not `captionFor`**. Put the url back only if you also drop the line.
- **ONLY WHEN THERE IS SOMETHING TO SEE.** A candidate with no url never reaches the bio page — it refuses a row it cannot send anybody to — so the line is omitted rather than promising a link that is not there.
- **AND ONLY ONCE.** A human writing an Instagram override may end it this way themselves; the machine repeating it underneath is the small sloppiness that reads as automated. Matched loosely (`/see\s+link\s+in\s+bio/i`) so odd spacing still counts.

### CREDENTIALS ARE CHECKED BEFORE THEY COST A POST (2026-08-20)

Every credential failure here used to be found the same way: pick a candidate, write a caption, press Post, and **then** learn the token was wrong. The work was already done and the failure arrived at the worst moment. `{diagnose: true}` on [socials-post](mc/supabase/functions/socials-post/index.ts) now answers for **all three** destinations and posts nothing.

- **A DUPLICATE `readStoredThreadsToken()` TOOK THE WHOLE FUNCTION DOWN, AND THE DEPLOY REPORTED SUCCESS.** The first cut of this added a second declaration of a helper that **already existed forty lines above it**. `supabase functions deploy` bundled and said *Deployed*; the function then answered every call with `BOOT_ERROR: Function failed to start`. **Posting was dead site-wide, on a deploy that looked clean.**
  - **The second bug inside the first**: the two returned different shapes (`expiresAt` as a millisecond number against a raw `expires_at` string). Mine shadowed the real one, so `threadsToken()` would have read `undefined` for the expiry and **silently stopped refreshing** — the exact failure the check was written to prevent.
  - **THE ONLY PROOF A DEPLOY WORKED IS A CALL.** `curl` the function with the publishable key: `{"error":"not authorized"}` means it booted and the admin gate ran; `BOOT_ERROR` means it did not. This CLI version has no `functions logs`, so that curl is the whole diagnostic.
- **THREADS IS THE ONE THAT NEEDED THIS.** Its token lasts 60 days and the function **only refreshes it when something is POSTED**, so a quiet fortnight is how it dies: nothing is broken, nobody did anything wrong, and the next post fails. Diagnose reports **days remaining** off the stored `expires_at` and flags it at **14 days or fewer**, while there is still time to act. `readStoredThreadsToken()` was split out of `threadsToken()` so the check can read an expiry **without triggering a refresh as a side effect**.
- **META'S CHECK IS THE OLD ONE, WIDENED.** It still catches the failure with no outward symptom: a USER token instead of a PAGE token posts to somebody's personal feed, returns a real id, and looks exactly like success. **A Page has a category and a user does not** — that is the tell. It now also says when no Instagram account is linked to the Page.
- **X IS SECRETS-ONLY, DELIBERATELY, AND IS NOT AN ALARM WHEN UNSET.** Every other probe is a free read; **an X API call costs money**, so a health check that made one would spend real cash every time somebody opened the room. It reports which of the four secrets are present, which catches the failure that actually happens (a half-finished setup) and costs nothing. And because X is posted by hand on purpose, missing secrets are the **expected** state: `needsAttention` is false.
- **THE PAGE CHECKS ON LOAD AND IS SILENT WHEN HEALTHY.** A notice that appears every time you open the room is one nobody reads, so it writes to the red pen only when something needs attention. **A check that cannot RUN is not reported as an account fault** — the function may simply not be deployed, and crying wolf about Instagram because a fetch failed is worse than saying nothing.
- **`Socializer admin` in the VIEW bar is the same check said out loud**, for the moment after you change a secret and want to know whether it took. **Renamed from `Check accounts` on 2026-08-21**: it sits in VIEW among places you GO, so a name reads better there than a verb. **The face now names the room and the TOOLTIP is the only thing saying what it does** ("ask the Edge Function what each credential actually points at"), which is the wrong way round for most controls here and deliberate for this one — so that line must not be allowed to rot. Behaviour is unchanged; `checkAccounts(true)` is still what it calls.
- **All the bad ones are named at once**, not just the first: two broken credentials is a different morning from one, and finding the second only after fixing the first is what wastes an afternoon.

### A BROKEN IMAGE NO LONGER ADVERTISES INSTAGRAM (2026-08-20)

`hasImage()` was "the column is not empty", which is what the Post button believed. An image url that 404s or 403s is a perfectly non-empty string, so **a dead picture still switched Instagram on** and the post then failed at Meta with Meta's own words about media.

- **THE CARD ALREADY KNEW.** It draws IMAGE FAILED in red when the `<img>` errors, so the page held the answer and the button did not. `noteBrokenImage()` is that knowledge, shared.
- **KEYED BY URL, NOT BY CANDIDATE.** The same address is broken for every row carrying it, and two candidates sharing a gift image should not discover it separately.
- **IT REPAINTS ONLY ON THE FIRST FAILURE PER URL, AND THAT GUARD IS LOAD-BEARING.** `noteBrokenImage()` returns true once and false afterwards; without it the re-render draws the image, it errors, and the page loops.
- **Editing in a working image re-enables Instagram with no extra code**, because saving already calls `renderQueue()` and the button is rebuilt from `postTargets()` each time. That part was always right; only the broken case was wrong.

### X IS A POSTING DESTINATION AGAIN (2026-08-20)

X and YouTube were both dropped on 2026-08-07. **They do not come back together and they are not the same case:** X is an account we can post to by machine, so it is an ordinary fourth destination beside Facebook, Instagram and Threads; YouTube is shared by hand, so it stays a marker rather than a route. The Post button now reads *Post to Facebook + Instagram + Threads + X*.

- **FOUR NEW SECRETS AND A DEPLOY, AND NOTHING WORKS UNTIL BOTH.** `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, then `cd mc && supabase functions deploy socials-post`. The function names the missing ones individually rather than saying "X is not configured", because the pair that is usually missing is the token pair.
- **THE TOKEN PAIR MUST BE READ AND WRITE.** The default is read-only, and a read-only token fails at post time with a **403 that says nothing about permissions**. Changing the app's permission level does not update an already-issued pair: they have to be **regenerated** afterwards. The function's 403 branch says so, because nothing else will.
- **BOTH PROMPTS TAG X, AND THE TAG IS WHAT PUTS IT IN FRONT OF A HUMAN.** The routine went to four accounts on 2026-08-20, after a stretch where the page prompt knew about X and the routine's did not, so **no bot candidate could ever be offered to X** and the Copy button read plain on every one of them.
  - **"WE HAVE FOUR ACCOUNTS", NOT "FOUR WE CAN POST TO."** The first wording was written while machine posting was still on and became a small lie the moment the flag went off. Both prompts now say plainly that three go by machine and X goes by hand, and that **the tag matters exactly as much either way**: leave X off and nobody is offered it.
  - **The email's destination line names it separately**, as `Facebook, Instagram, Threads. X by hand.`, so a reader knows which part is a button and which is an errand.
  - **The 200-character caption cap is now also justified by X**, which allows 280 including a link counted as 23 however long it is.
- **SO X IS POSTED BY HAND, LIKE YOUTUBE, AND `PLATFORM_AUTOPOST.x` IS `false`.** The Edge Function's `postX()` is finished and would work the moment four secrets were set; it is off because of the price, not because it is unwired. **The code stays** because the decision could reasonably go the other way and because rediscovering the OAuth 1.0a signing is the expensive part. Flip the flag and set the secrets if the bill is ever worth it.
- **THE COPY BUTTON NAMES ITS DESTINATION, AND BY-HAND COEXISTS WITH BY-MACHINE.** `Copy to clipboard for X`, `Copy to clipboard for YouTube`, plain `Copy to clipboard` otherwise. **The two buttons together are the whole picture**, and a candidate tagged Facebook and X reads:

  > **Post to Facebook + Threads**  ·  **Copy to clipboard for X**

  Two presses, both real, both wanted.
  - **THIS REVERSED WITHIN THE HOUR.** `byHandTarget()` first answered only when the machine could reach **nothing**, on the reasoning that naming X on a row about to go to Facebook claimed a job it was not doing. **Backwards**: the Post button already states its own destinations, so there is no false claim to avoid, and staying silent about X **hid the half of the job that still needed a human**.
  - It reads names from the bot's own tags rather than `WIRE_LABELS`, because YouTube is deliberately absent from that object and would otherwise be unnameable.
- **`PLATFORM_SUGGEST_ONLY` HOLDS BOTH, FOR TWO DIFFERENT REASONS.** `youtube` **cannot** be posted by machine, which is a fact about the platform; `x` **can** be and deliberately is not, which is a decision about money and is reversible. The button behaves the same either way, so the reason string is what carries the difference to whoever reads it.
- **EVERY POST COSTS 20 CENTS, AND THAT IS THE HEADLINE FACT ABOUT X.** Checked against [X's own pricing page](https://docs.x.com/x-api/getting-started/pricing) on 2026-08-20, after a first draft of this section said "needs a paid tier", which was wrong in a way that mattered. **There is no free tier and no subscription any more**: pay-per-use against prepaid credits, priced **$0.015 a plain post and $0.200 for a post CONTAINING A URL**.
  - **A link costs thirteen times a bare post, and every post we make carries one.** `xText()` is caption, blank line, story url, the same shape as the other three platforms, so the expensive rate is the only rate that ever applies to us. **Roughly $30 a month at five posts a day, $12 at two.**
  - **Dropping the link would save 92% and is not worth it**: a post nobody can follow is not the job. Moving the link to a reply does not help either, since a reply carrying a url is charged the same $0.200.
  - **The other three accounts are free. X is the only one that is not**, and it is the only reason on this page to think twice before pressing Post. Nothing posts automatically; a human presses the button, which is what keeps the bill a decision rather than a subscription.
- **OAUTH 1.0a, NOT OAUTH 2.0, DELIBERATELY.** X's OAuth 2.0 user tokens expire in two hours and their refresh tokens **rotate on every use**, so a failed refresh locks the account out until somebody walks a browser consent flow by hand. OAuth 1.0a tokens do not expire at all. This project already carries one expiring credential (Threads) and says plainly that nothing else needs renewing; a second, shorter-lived one with a manual recovery step is the opposite of what that note wants. The cost is the signing code, which is fiddly and then never moves.
  - **Four things in that signing are load-bearing and every mistake gives the same unhelpful 401:** percent-encoding is RFC 3986 and **not `encodeURIComponent`**, which leaves `! * ' ( )` alone; the JSON **body is not signed**, only the oauth and query parameters; parameters are sorted by encoded key and the joined string is encoded again into the base; and the signing key is both secrets encoded and joined by `&`, **with the trailing `&` even when a secret is empty**.
- **TEXT AND A LINK, NO IMAGE UPLOAD.** Media on X means the v1.1 `media/upload` endpoint, a different host, a chunked protocol and another set of scopes. X unfurls the link into a card from the destination's own `og:image`, so the post is not bare, but the picture is the article's rather than one we sent. **That makes X unconditional like Threads rather than image-gated like Instagram.**
- **280 CHARACTERS INCLUDING THE LINK, WHICH COUNTS AS 23** however long it is. Both prompts cap a caption at 200, so this fits with room spare; `xText()` trims with an ellipsis rather than refusing, because losing the tail of a sentence is a smaller failure than a post that never goes out.
- **`WIRE_LABELS` GAINS `x` AND MUST NEVER GAIN `youtube`.** `suggestedKeys()` maps only what is in that object, and `isYouTubePost()` reads the **empty** result as the marker for a video row. Adding youtube there would return a key `postTargets()` can never satisfy and would break the marker.

### THE ROUTINE WAS WASTING PICKS ON A TRUNCATED READ (2026-08-20)

Step 1 tells the run to read `tgb_socials_filed_urls` before it searches. The run on 2026-08-20 piped that reply through **`head -c 6000`**, saw roughly a third of the 262 urls it held, and filed two stories it had already filed the week before; it then spent ten minutes of a twenty minute run finding replacements. **The prompt now says to save it to a file and `grep -c` that file per candidate**, and names this run as the reason. Nothing errored, and the run reported success: the only trace was two `duplicate` outcomes in a reply nobody reads afterwards.

### A GIFT LINK CANNOT CARRY ITS OWN PICTURE, AND THAT IS NOT FIXABLE IN THE SHOP (2026-08-21)

Every `/gifts/?item=<id>` link unfurls with the **same generic shop banner**, whichever gift it is. `gifts/index.html` hardcodes `og:image` to `shop_banner.png`, and **it cannot be made per-gift there**: the page is static HTML on GitHub Pages that fills itself in from Supabase after it loads, so **a crawler reads the file as committed and never runs the JavaScript**. There is no server to render it per gift. Setting `og:image` from script would satisfy a person reading the source and nothing else.

- **THE THREE MACHINE ACCOUNTS ALREADY DODGE THIS AND NEED NOTHING.** `previewIsOurs()` in [socials-post](mc/supabase/functions/socials-post/index.ts) makes **Facebook post the gift PHOTO to `/photos`** rather than a link card to `/feed` when the url is ours and an image exists; Instagram always uploads `image`; Threads posts `media_type=IMAGE`. **Only the by-hand path is exposed**, because there the link is all X gets.
- **SO THE COPY HANDS OVER THE PICTURE.** On a gift candidate with a by-hand destination, Copy (and a successful Post) opens the gift's own photo in a tab and the dialog says to drag it in. One extra manual step on a path that is already manual.
  - **THE TAB OPENS INSIDE THE SAME GESTURE THAT COPIED**, before the dialog resolves. A `window.open` from a `.then()` after an await is exactly what a popup blocker exists to stop, and a blocked tab would leave the sentence describing something that did not happen.
  - **IT FIRES ONLY FOR OUR SHOP LINKS**, matched on `thegamebureau.com/gifts/?item=`. A story's `og:image` is already what its own link unfurls, so opening it would be a tab for nothing.
- **THE TWO REJECTED FIXES, so nobody re-proposes them cold.** An **Edge Function serving share tags** gives proper cards to everyone but puts a `supabase.co` domain on the post, which reads as less trustworthy than our own. **Generating a static page per gift** keeps the domain and fixes it everywhere, but means 600-odd generated files and a build step, which this repo has deliberately removed twice.

### THE SOCIALIZER'S VIEW BAR IS ONE REEL BUTTON (2026-08-20)

It held three buttons, FACEBOOK / INSTAGRAM / THREADS, built from a `PLATFORM_URLS` object on the page. It is now **one button wearing the scrolling account reel**, opening the same menu the hub card and the public nav open. [mc/js/follow-reel.js](mc/js/follow-reel.js).

- **THE BAR'S JOB IS UNCHANGED**: ADD on the left is where candidates come FROM, VIEW on the right is where a posted one ends UP, and checking a post really appeared is the step after every click.
- **WHAT DID CHANGE, AND IT IS A REAL DIFFERENCE.** Those three were the accounts we can POST to. The menu carries all **five** we have, so X and YouTube are reachable from here and were not before. Nothing here posts to them; this bar is for going and looking, and there is no reason to be able to look at three of five.
- **`PLATFORM_URLS` IS DELETED and the handles are no longer on this page.** They live in the module, which is also where the public nav's twin reads them, so a renamed handle cannot be fixed in one copy and missed in another. **`WIRE_LABELS` stays and is a different thing**: it maps the Edge Function's platform keys to display names and is used all over the posting path.
- **42px SQUARE, matching `.btn`'s `min-height`**, so it lines up with the ADD bar opposite. The width follows the height rather than the content, because the content is one glyph and a 42px-tall button 12px wide reads as a slot rather than a control.
- **IT IS CENTRED IN THE PANEL, because that panel is wider than its contents and always will be.** A fieldset is at least as wide as its legend, and VIEW plus the folder tab's padding is wider than one 42px button, so the bar cannot shrink to fit the way it did holding three word-buttons. Left-aligned it sat against one edge of a box with a hole in the rest of it and read as something that had failed to load. `justify-content: center` goes on the INNER, never the fieldset: the panel's width is the legend's business and this only decides where the content sits inside it.
- **THE SIZING RULE IS SCOPED `.command-bar .btn--reel` AND HAS TO BE.** `.command-bar .btn` sets `padding: 0 12px` at (0,2,0) and beats a bare `.btn--reel` at (0,1,0), so the padding survived: a 42px border-box with 24px of side padding leaves an **18px content box for a 19px reel**, clipping it a pixel each side. Subtle enough to read as a rendering artefact rather than a rule losing a specificity fight, and it was only caught by reading the COMPUTED padding back rather than trusting the declaration.
- **`.command-bar-inner > .tgb-reelpop-wrap` NEEDS `align-self: center`.** `popup()` re-parents the button into that wrap, which becomes the flex child; without it the wrap collapses to its own height and the button stops lining up with the bar. **Third time this wrap has needed a layout property moved onto it** — see the footer's Follow control and the public nav's `order: 5`.
- **No module, no button.** The page does not know the handles any more, so `buildViewLinks` renders nothing rather than a control that opens nothing.
- **Found while doing this: `PLATFORM_COMPOSERS` is read by NOTHING.** Posting goes through the `socials-post` Edge Function, so those composer urls are a record of where a human would go by hand, not a wired path. Left in place (the urls are the expensive part to rediscover) with a comment saying so, and its claim that `PLATFORM_URLS` was its fallback was untrue even before that object was deleted.

### The Tape Room wears the Socializer's look (2026-08-14)

The two rooms had shared a palette since 2026-08-06 — `--cut-panel-bg`, `--cut-panel-line`, `--control-line` were copied across then — but nothing else, so they still read as two products. The Socializer's actual vocabulary was ported wholesale. **When either room's chrome changes, change both**; the Socializer is the reference and this is the copy.

- **The last-run line is the TGB SOUNDTRACK BOT button's TOOLTIP** (2026-08-14), not a line under the room title. The words sit on the control you press to act on them. **Its at-a-glance half survives as `.btn.is-stale`** — a red edge on that button past `REVIEW_HOURS` — because a tooltip nobody hovers is not a signal, and a stale last-run *is* the failure notice: the routine commits nothing, so a run that errored writes nothing at all. A failed read counts as stale too; it is not proof the routine is broken, but it is proof nobody can tell, which prompts the same look. The header now carries the counts line only, and `.run-status` / `.run-dot` / `.run-body` / `.room-substat--row` are gone.
- **THE HEADER IS THE SHARED ONE. Everything above the ADD / VIEW row comes from [mc/js/admin-shell.css](mc/js/admin-shell.css)** and this page defines almost none of it: `.room-head`, `.room-titlecol`, `.room-title`, `.room-blurb` and, since 2026-08-16, `.room-scribble` are all there. The scribble had been written out **three times, once each in the Socializer, the Stock Room and the Tape Room, with identical declarations in all three** — the exact drift the shared sheet exists to stop, and the same mistake that had already given four rooms four different title sizes. It was simply missed when the rest of the header was centralised. **The one local rule left here is `.room-head .room-blurb { max-width: none }`**, which clears the shared 62ch clamp on purpose so this room's sentence sits on one line.
  - **Anything lifted back out of an old version needs the `:root` tokens present.** Learned the hard way while rebuilding: restoring the header rules without them made **KEEP vanish**, because `.btn.primary` keeps its `color: #fff` and takes its background from `--accent`, so an undefined variable renders it white on white.
- **The red-pen scribble is where notices go**, beside the room name, and **the tagline under it is not a status line**. This is the change with teeth. `#trackArchiveStatus` used to be the counts line, the save confirmation and the error channel all at once, so *every write failure erased the only description of the room* and left nothing behind to restore it. It is now the counts line only and is written on every render; `setNotice()` owns the scribble. A success clears itself after six seconds — a stale "saved Denver" an hour later is a lie about what is currently true — an **error stays** until the next action, and there is a third tone, **`hold`**, for a success you still have to read: the one on this page is a move that carried a track's do-not-rescrape tombstone to another city.
- **THERE ARE NO ROOM TABS AND NO SECOND VIEW.** The folder-tab strip and `showView` / `roomViews` / `setRoomTabCount` are gone; see the section above. The `.room-tabs` CSS went with them. Don't reintroduce a tab strip to hold a count — the filter strip already carries one per state, about the same list.
  - The panel is still a `<div>` rather than a `<fieldset>`, which is what the tabs left behind. The `.command-bar` legends keep their `::before` arch.
- **Segmented tabs replaced the filter `<select>`s.** REVIEW / KEPT / SHELVED / FLAGGED / ALL, each with a live count. **The counts are the whole reason**: a closed dropdown cannot say 246 tracks are waiting on you, which is the question the strip exists to answer. ALL stays the default. REVIEW's badge goes red-pen the moment it holds anything.
- **`tapeCounts()` and `archiveSummary()` now return five numbers, not two.** `active`/`archived` are the `archived` column (what `/soundtracks/` filters on, what `setTapeArchived` reports in); `REVIEW`/`LIVE`/`SHELVED` are the review states. **They are not two views of one split** — a REVIEW candidate is `archived = true`, so the old tape chip called three songs awaiting a decision "3 shelved tracks", and the header counts line said "13 shelved" while the Skipped tab said 8 **from the same data**. The header now reads the three states in the tab strip's own words and numbers.
- **Status reads off the card, not only off the chip.** `.track-row` takes `.is-review` / `.is-live` / `.is-shelved` — the internal names, see the rename note: a KEPT track gets a green left edge at 0.85 opacity (done, not turned down), a SKIPPED one goes 0.6 and dashed and clears on hover, REVIEW keeps full contrast and takes the red edge. A tape holding any candidate gets `.has-review` and the same red edge. This replaced a single dashed `.is-archived` treatment that drew a skipped track and a fresh candidate identically.
- **Folder-tab legends.** `legend::before` draws an arch over the top half of the legend box so the panel border runs into the label and back out. Copied verbatim from the Socializer, `isolation: isolate` and all — the note there explains why it cannot be a border on the legend itself.
- **The command bar split into ADD and VIEW** on one `.bar-row`, the Socializer's own two labels: where tracks come from on the left (PROMPT, TGB SOUNDTRACK BOT, EMAILED SUGGESTIONS), where they end up and what you consult on the right (SOUNDTRACKS, LISTENER STATS, ABOUT).
- **The PROMPT dialog is the room's only modal, and it is the Socializer's dialog part for part** — same classes, same foot, same wiring, so the two cannot drift by somebody restyling one of them. It brought `.tool-backdrop` / `.tool-modal-panel--wide` / the ruled-notepad `.prompt` sheet with it. **Only the prompt text differs; keep everything else in step.**
  - **A CITY PICKER sits above the sheet, and blank is a real answer** (2026-08-14) — it means "work the tier ladder", which is what the prompt does unaided. Choosing a city **prepends a directive** rather than editing the ladder section, because that section already opens with *"If I have already named a city, use it"*: a named city is the path the text supports, not a special case bolted on. The authored prompt is captured once as `BASE_PROMPT` and every rebuild starts from it, so clearing the picker restores the text exactly instead of stacking directives. The list loads on **first open**, not page load — most visits never touch the dialog and `public.cities` is 1300-odd rows — reads `select=*` and filters `hide_from_soundtracks` client-side (a column list 400s against a database that has not run the migration), pages because the catalogue is past the 1000-row cap, and **fails soft**: a list that will not load says so and leaves blank, which still works.
  - **THE HEAD SAYS WHAT TO DO WITH THE TEXT** (2026-08-19): eyebrow `AI prompt`, title `Five Post Candidates`, then four sentences under it — **edit**, copy and paste the prompt into your AI, paste the result into Supabase, the two common failures, and `adminhelp@thegamebureau.com`. It opens on *Edit* because the textarea became editable the same day and nothing else on the dialog says so. **The foot's buttons are those steps in order and read as obvious only once you already know the routine**, and **both common failures happen after you leave the page**, so somebody meeting one has nothing on screen connecting it back. The eyebrow was `Paste-ready prompt`, which described the text rather than naming what it is for.
  - The foot is the errand in the order you do it: the fenced **COPY PROMPT TO CLIPBOARD & OPEN** group (ChatGPT / Grok / Claude) → **Insert results** into the Supabase SQL editor.
  - **THE PROMPT IS EDITABLE, AND EDITS SURVIVE A RELOAD** (2026-08-19). It was `readonly`, which was right while it was a fixed recipe and wrong the moment you wanted to run it against one city or drop a rule for a single go. Typing in it saves to `localStorage` under `tgb_socials_prompt_v1`, and the doors copy **what is in the box**, not the authored text.
  - **THE STORED COPY IS FINGERPRINTED AGAINST THE AUTHORED ONE, and that is the part that matters.** The authored prompt lives in this file and is hand-edited whenever the editorial rules change; without a check, a copy saved in somebody's browser months ago would keep winning and they would never see the change — **exactly the failure the soundtracks JSON fallback caused**, a stale thing that renders perfectly and tells nobody it is stale. An edit made against a different authored text is **discarded**, not shown. The hash is cheap on purpose: this is cache-busting, not integrity.
  - **`Reset prompt` appears only once the text differs**, since on an unedited prompt there is nothing to restore and a permanent Reset invites a press that does nothing. It sits **before** `.copy-status`, which carries the `margin-right: auto` that pushes the doors right — anything after it lands on the wrong side of that gap.
  - **A local edit is invisible to the page/routine sync rule.** The two prompts are kept in step by hand, and a prompt edited in a browser is not the prompt in this file. Reset before assuming what you are reading is what is committed.
  - **THE STANDALONE COPY BUTTON WAS DELETED** (2026-08-19). Every one of the three doors already copies before it opens, so Copy was the same action minus the useful half, sitting first and styled as the primary. **What is lost is copying WITHOUT opening anything**, which the textarea still allows by hand and which the failure message names. The fence label was `COPY & OPEN` and now says the whole thing: **COPY PROMPT TO CLIPBOARD & OPEN**, naming what is copied as well as where it goes.
  - **The status line is the confirmation now.** It was kept for failures alone while a button could go green and read *Copied*; with that button gone it is the only place a success can be reported, and a copy that says nothing is one you do twice. It clears after 2.6s and on every open.
  - **The three doors are anchors and the copy is not awaited.** The new tab has to come from the browser's own handling of a click on a link or the popup blocker eats it, so there is no `preventDefault` and no `await` before the navigation — awaiting would push it into a later task, which is exactly what "not user-initiated" means. The clipboard write still happens inside the gesture, so the permission holds. They open **blank**: none of these takes a prompt this long through a query string reliably, and a half-truncated pre-fill is worse than an empty box with the whole thing on the clipboard.
  - **The button is the confirmation** — green, reading *Copied*, reset after 1.8s and on every open, so a dialog closed mid-flash cannot reopen still green. The `copy-status` line is kept for the **failure**, which is the case that needs words because it has to say what to do instead.
  - It is **not gated on sign-in** — the prompt is public text and the human runs the SQL under their own Supabase account, so there is nothing for a session to protect.
  - Two rules that bite: the panel must be a flex column because `admin-shell.css` loads later and re-clamps every dialog to `overflow: hidden`, and `section.tool-modal-panel:not([hidden])` needs that `:not` or `display:flex` beats `[hidden]` and the dialog is open on load.

### Daily generation — a Claude Code cloud routine, not CI

New soundtracks are added by a **Claude Code cloud agent** ("TGB SOUNDTRACK BOT", `trig_014sqaUyU7557svq9mGA1E4a`, **no cron: run by hand**, see the note above), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the alphabetically-first city with no soundtrack plus the most underfilled existing one, verifies Spotify IDs by web search, and writes them through the RPC above; it then audits those two tapes plus the 3 least-recently-audited and reports findings through `tgb_report_soundtrack_issues`. **It commits nothing.** It briefly had one git write — re-exporting the fallback file, added 2026-07-30 — which ended when that file was deleted on 2026-08-06. Songs have never travelled through a commit, so the last-run signal in [mc/soundtracks/index.html](mc/soundtracks/index.html) is the **newest `soundtrack_songs` row**, not the GitHub commits API (same call as the gift shop's freshest Review candidate) — and that stays correct now that there is no commit feed to read at all.

**The routine's stored prompt and the Tape Room's PROMPT button are two different prompts on purpose, and the difference is the write path** — the same split the Socializer makes, for the same reason. The routine holds the publishable key and calls `tgb_pull_soundtrack_songs` unattended. The PROMPT button is for pasting into *another* AI — ChatGPT, Gemini, whatever is open — which has no key and no session, so its deliverable is **one `select public.tgb_pull_soundtrack_songs('…'::jsonb);` statement in a ```sql block** that a human runs in the Supabase SQL editor. **THE ARGUMENT IS A BARE ARRAY, NOT `{"tapes": [...]}`.** That wrapper is how PostgREST names arguments over HTTP, where a top-level key is matched to a *parameter name*; in SQL the call is positional, so the argument is the array itself. Wrapping it makes the argument an object and the function stops with `Expected a JSON array of tape objects`, which reads like malformed JSON when it is only in the wrong container. **Both the PROMPT dialog and the issue "Copy fix prompt" shipped with the wrapper and every statement they produced failed** (found 2026-08-17). The routine is unaffected: it calls over HTTP, where the wrapper is correct. **It calls the RPC and is NOT a raw INSERT**: the function is what guarantees `archived = true` / `certified_at = null` / `rejected_at = null`, refuses a hidden city, caps the call and drops a malformed `spotify_id`. A hand-written INSERT bypasses every one of those and could publish straight to `/soundtracks/`. Editorial rules — the four song sources, the 15, two-per-artist, the blurb rule, the verify-or-omit rule on Spotify IDs — have to be kept in step across both by hand; only the last step differs.

**The PROMPT dialog picks a US city, down a four-tier ladder** (2026-08-14). Tier 1 is a **fanbase city of an NFL, NBA, MLB or NHL club**; tier 2 a **college-football town**; tier 3 any other US city; tier 4 non-US, and only once the first three are exhausted. Within a tier: a city with no tape at all before one that only needs topping up, ties broken alphabetically. The prompt carries three ready-to-open PostgREST URLs (`cities`, `soundtrack_stats`, `teams`) with the publishable key inline, so a chat AI with browsing can derive the whole ladder rather than guess — `public.teams` holds all four majors **and 515 NCAAF programs**, so every tier is real data. Three traps are called out in the prompt itself because each one silently produces a wrong answer:
- **The cities URL is filtered to `country_code=eq.USA` and `hide_from_soundtracks=is.false`.** Not tidiness — the catalogue is **1,351 rows**, PostgREST stops at 1000 and says nothing, so an unfiltered read hands back the alphabet to roughly M *looking complete*. Filtered it is 487. Tier 4 has to page with `limit`/`offset`.
- **`teams.fanbase` is a SCHOOL for NCAAF** — `"Alabama"`, `"Ohio State"` — not a city, so the town has to be resolved (Tuscaloosa, Columbus) and then checked against the catalogue. The four majors give a real city.
- **The two tables spell a city differently.** `teams` holds legacy `"Buffalo, NY"`; `cities` holds canonical `"Buffalo, New York"`. Match on the city name, never the whole string.

Plus the standing rule from TGB ANCHOR EVENTS: **the fanbase city, never the venue town** — Boston not Foxborough, Dallas not Arlington. Those venue towns carry `hide_from_soundtracks`, so the flag catches the mistake, but picking by fanbase means never meeting it.

**The blurb rule reads as a contradiction unless it is stated precisely, and it was written as one for a fortnight.** A blurb is **REQUIRED** — a missing one is a `facts` finding — and what has **no minimum is its LENGTH**, not its existence. So: ten words at most, no trailing period, and **no blurb is ever too short** once it is there. Every source (the routine's stored prompt, the Tape Room's PROMPT text, the page's `tgb-agent-context` block and [soundtracks.md](mc/soundtracks/soundtracks.md)) said "there is NO minimum" flatly beside "every song needs a blurb", which invites an agent to file an empty one and invites an auditor to report a four-word one. Both are wrong. Corrected everywhere 2026-08-14 — **keep the qualifier on the word LENGTH** if you reword it.

**Why not GitHub Actions:** it used to be `.github/workflows/soundtrack-daily.yml` + `mc/_dev/scripts/soundtrack-daily.mjs`, both **deleted 2026-07-27**. That path needed a funded Anthropic or OpenAI API key; neither account had credit, so every run failed on a billing error. The routine bills against the Claude subscription instead. Don't recreate the workflow unless an API key gets funded — and if you do, don't leave both running or you'll get two soundtracks a day.

**Twice daily since 2026-08-01**, and the Tape Room's `REVIEW_HOURS` is **14** rather than 26 to match, so one missed run shows rather than needing two. **It silently reverted to `30 11` once daily at some point and was only caught on 2026-08-15** by reading the live trigger; a once-daily routine against a 14-hour threshold paints the bot button red after every healthy run. If you change the cadence, change `REVIEW_HOURS` in the same commit.

**DST:** cloud cron is UTC with no DST, so **no single cron holds one Central time year-round**. `8,20` is exactly 3 AM / 3 PM CDT and 2 AM / 2 PM CST. Drifting an hour is accepted and nobody adjusts for it; see the schedule note below.

### All five TGB routines run at 3 AM and 3 PM Central, and NOBODY ADJUSTS FOR DST

Set 2026-08-15, and it has been resettled twice since by folding routines together rather than adding them. A sixth, TGB PARTNER BOT, was added on 2026-08-18 and lasted one day before becoming a job inside TGB PATH BOT; TGB WAYPOINT BOT went the same way on 2026-08-20, for the same reason, leaving five. **Both folds are the same lesson**: two routines covering one job from opposite ends, where only one of them reached the database. One schedule, staggered three minutes apart so the cloud sessions do not all provision at the same instant:

| routine | trigger id | cron (UTC) |
|---|---|---|
| TGB GIFT SHOP BOT | `trig_01H7cKJ4fk5bA1NWSqPZi4ah` | `2 8,20 * * *` |
| TGB SOUNDTRACK BOT | `trig_014sqaUyU7557svq9mGA1E4a` | **none, run by hand** |
| **NFL ROUTES** (was TGB ANCHOR EVENTS) | `trig_01P6fMZjt4ZapaKVoiCUfGxw` | `11 8,20 * * *` |
| TGB SOCIALIZER BOT | `trig_01KDYndJhZ9ymgUgX5Xx6LsL` | `14 8,20 * * *` |
| TGB PATH BOT | `trig_01HqDJy6BzpU7n23VXv8D1gW` | `17 8,20 * * *` |
| ~~TGB CONCERT BOT~~ | `trig_01RY2ktLpjXwNUo4mYTncPBe` | **folded into TGB ANCHOR EVENT BOT and retired 2026-08-28. Its spec file is deleted and nothing in this repo names it; the trigger itself is disabled and can be deleted at claude.ai.** |
| **TGB ANCHOR EVENT BOT** | `trig_01HKMKbnCyH6WLKuw7ZstY5b` | `8 8,20 * * *` |

**THE `:8` SLOT IS TGB ANCHOR BOT'S AS OF 2026-08-25.** It was TGB WAYPOINT BOT's and sat empty after that routine was retired; the stagger exists only so cloud sessions do not provision at the same instant, so a freed minute is simply available. **There is no free slot now.**

**EVERY TGB ROUTINE IS `TGB <NAME>` IN CAPITALS, AND THAT NAME IS ITS NAME EVERYWHERE** (2026-08-20). They had been a mixture — *TGB Gift Shop Bot* in title case, *SOCIALIZER BOT* and *PATH BOT* with no prefix at all — and the prefix is what groups them in the routine list at claude.ai, which also holds seven personal routines (the GTD briefs, Coach Steve Bot, the inbox blitzes, the Supabase backup). Renamed on the triggers, then swept through this file, `PROMPTS.md`, and the buttons in the Socializer, the Stock Room and the Path Builder, so the label you press and the routine it opens read the same. **The stored prompts still identify themselves the old way** (*"You are SOCIALIZER BOT"*, *"You are the TGB NFL Tour Builder"*); nothing depends on that string, and it is the one place the new names have not reached.

**TGB ANCHOR EVENTS IS BEING REPURPOSED, AND TODAY ITS NAME AND ITS PROMPT DISAGREE.** The name says anchor events; the prompt it is still running is the NFL Tour Builder, which designs a six-stop walking route and commits `mc/supabase/tours/YYYY-MM-DD-<city>.sql` for a human to run. **So do not read the name as a description of what it currently does** — and do not confuse it with `public.anchor_events` or the Anchor Events editor at [mc/events/index.html](mc/events/index.html), which are the real matchups a game is built around and a different thing entirely. The prompt is the user's to rewrite; until then this file describes the tour builder wherever it names this routine.

**TGB WAYPOINT BOT IS RETIRED, AND ITS TRIGGER IS DISABLED AS OF 2026-08-21.** It was folded into TGB PATH BOT on 2026-08-20, and for a day after that it kept firing twice daily and committing `mc/stops/nightly.json`, a file whose last reader had already been deleted. **The file is gone from the repo and the trigger is off**, which had to happen together: deleting a file a live routine rewrites is a change that undoes itself on the next run.

**DISABLED, NOT DELETED, AND THAT IS THE RULE HERE.** A trigger id does not survive a delete, and this project lost `trig_01Q5uCitt...` that way on 2026-08-20 and had to repoint four places at the new id. `trig_018FbHnaU5DqB4GesPfABV2d` still exists, still holds its prompt, and is one flag from running again if the sweep is ever wanted back.

**THIS FILE SAID IT "MUST BE SWITCHED OFF BY HAND", AND THAT WAS WRONG.** The claim came from `PROMPTS.md`, where the reasoning was that a Claude Code CLOUD session cannot touch a routine created through the website. True of a cloud run and **not true of a local one**: `RemoteTrigger {action: "update", body: {"enabled": false}}` does it in a second. **`enabled` is a top-level field**, so unlike `job_config` it can be changed on its own without resending the prompt.

**The paragraph below is kept because its lesson outlived its subject.** — a trigger id is not stable across a delete, and the things holding one are easy to miss.

**TGB WAYPOINT BOT WAS DELETED BY ACCIDENT ON 2026-08-20 AND REBUILT THE SAME DAY**, which is why its trigger id is `trig_018FbHnaU5DqB4GesPfABV2d` and not the `trig_01Q5uCitt…` recorded here for three weeks. Same cron, same environment, same prompt, same `8 8,20` slot in the stagger. **A trigger id is not stable across a delete**, so anything holding one has to be repointed: the routine table above, the header of [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js), the row in `PROMPTS.md`, and — the one that actually breaks — the **TGB WAYPOINT BOT button's `href` in the Path Builder's ADD bar**, which is a link to `claude.ai/code/routines/<id>` and silently 404s on a stale one.

**The order is deliberate**: the gift shop files books first, and the social bot goes last so the gift catalogue it reads for slot one is as fresh as it can be.

**THE DST CALENDAR ITEM IS GONE.** `8,20` is the CDT mapping, so in winter these land at 2 o'clock instead, and that drift is accepted. This file used to carry a table of two dates a year on which a human had to move four crons by an hour, plus a fifth routine on its own pair of hours because "4am year round" is not something one cron can hold. Nobody was ever going to do that reliably, and nothing downstream depends on the exact hour. If you want 3 o'clock back in January, move them to `9,21`; it is not worth a reminder.

**Do not "fix" a routine by setting the cron to the Central hour you want** — the field is UTC, so `0 3,15` fires at 10 PM / 10 AM Central, not 3 o'clock.

**Edit them from Claude Code** with `/schedule` or the `RemoteTrigger` tool; you do not have to open the website. A cron change is a partial update and does not need the prompt resent. The six personal routines (GTD briefs, inbox blitzes, the nightly Supabase backup) keep their own hours and are not part of this.

**REVIEW_HOURS / BOOK_PULL_STALE_HOURS = 14 is correct again.** Both staleness thresholds assume a 12-hour cadence, and the soundtrack bot had silently drifted to `30 11` once daily, which would have painted its button red after every healthy run.

---
### THE SPOTIFY BOX TAKES A SHARE LINK (2026-08-18)

208 of 1,536 tracks have no `spotify_id`, and the room's only help was a **Search Spotify** link: you found the track, then had to dig the 22-character id out of the URL yourself and paste just that. The box now takes **whatever Spotify hands you** and pulls the id out of it: a share link, a localised one (`/intl-de/track/...`), a `spotify:track:` URI, or the bare id.

- **`spotifyIdFrom(value)` is the one parser** and `commit` runs the box through it before saving. **An ALBUM or PLAYLIST link is refused**, which matters because it is the easy mistake and its id is the same shape as a track's: stored, it would pass the CHECK constraint and silently play nothing, which is the exact failure the whole verify-or-omit rule exists to prevent.
- **Something unparseable is refused with a sentence** rather than sent on to fail against `soundtrack_songs_spotify_id_check`, which reported as a raw constraint name.
- **Blank is still always allowed and still better than a guess.** The tooltip says so, because that is the rule the routine prompts carry and the box is where a human is most tempted to break it.
- The no-player box now says what to actually do: *"Find it, press Share, then paste the link into the Spotify box on the row."*

### THREE SILENT FAILURES IN THE TAPE ROOM, ALL GIVEN A VOICE (2026-08-18)

Reported as "when I try to change the title it doesn't work", with **nothing on screen at all**: no error, no save. Three places could produce exactly that, and all three now say something. **A write that fails without saying so is a bug in itself**, whichever one was firing.

- **`commit()` in `renderTrackLine` returned silently when `indexOf(song)` came back -1.** That happens when the row on screen holds a song object the loaded tape no longer contains, which any reload between render and blur will do. It now says *"that track is out of step with the list, so nothing was saved - press Reload and try again"* and puts the box back to what it held.
- **The LIVE / SHELVED switch had the same early return** and the same silence.
- **`loadSoundtrackArchive().catch(function () { })` was an EMPTY CATCH**, so a failed load left the room blank with no explanation and no way to tell it apart from a room with nothing in it. It reports to the scribble now.

**Do not add a bare `return` to a write path here.** The room's whole error channel is `setNotice`, and a path that skips it is indistinguishable from success.

### THE ISSUES COUNT AND ITS FILTER WERE HIDDEN ON A PHONE (2026-08-20)

`.tape-head-label { display: none }` inside the Tape Room's `@media (max-width: 700px)` block hid **every** label cell in the tape header, and three of those cells are not labels at all: **TRACKS**, **ISSUES** and **NEW** each carry a live figure, and the last two wrap the `#flaggedOnly` and `#newOnly` checkboxes. So under 700px the room could not tell you how many open findings the catalogue held, and **the FLAGGED and NEW filters were unreachable** — the one control you most want on a phone, since the whole point of the count is to press it.

- **The head is a wrapping flex row under 700px**, not a two-column grid. The grid's `var(--tape-cols)` is eight columns wide and cannot survive a 390px viewport, which is why the old rule reached for `display: none` in the first place; flex lets the sort buttons and the three figures wrap onto as many lines as they need. Measured at 390px the head is 86px tall against 76px before, and nothing overflows horizontally.
- **The three figure cells are named individually and re-shown after the blanket hide**, rather than the hide being narrowed. The empty spacer cell in that row still has to go, and naming what stays is what keeps a future cell hidden by default.
- **The TRACKS cell gained `tape-head-label--tracks-cell`** so the rule can name it; it was the one head cell with no class of its own. (`.tape-head-label--tracks` already existed in the CSS, matched nothing, and still matches nothing — don't mistake it for this.)
- **The master air switch takes `margin-left: auto`** on the mobile head. It carries `justify-self: end`, which a flex parent ignores, so without this it sits jammed against the NEW figure instead of at the end of its line.
- **The row layout under 700px was NOT touched.** A tape row's issue pips were always drawn; it was only the header that went silent.

### BOTH SOUNDTRACK PAGES CARRY NO COMMENTS. THIS FILE IS THE ONLY RECORD. (2026-08-17)

`soundtracks/index.html` (3,575 → 2,953 lines) and `mc/soundtracks/index.html` (7,530 → 5,308 lines) were stripped of **every** comment — 550 and 1,550 of them, CSS `/* */`, JS `//` and `/* */`, and HTML `<!-- -->` alike. The rationale that lived in them lives here now, in this section and the ones above it.

**So the usual bargain is inverted for these two files.** Everywhere else in this repo a load-bearing reason sits beside the code it explains and this file carries the summary. Here there is nothing beside the code at all: a rule that is not written down in this section is a rule the next person will delete by accident, because the file gives them no reason not to. **When you change either page, update this section in the same commit** — and when you add code to them, resist adding the comment back; put the sentence here instead.

The prompt `<textarea>` and the `tgb-agent-context` JSON block were deliberately untouched, being content rather than code. Worth knowing while you are in there: **that JSON block does not parse** — an unescaped `"` around line 89 (`... so "song 177" tells them ...`) — and it was already broken before the strip. Nothing in the page reads it, so nothing failed; an agent that tries to will.

---

### /soundtracks/ — the public page

`soundtracks/index.html`. Cassette grid, a search, and one working tape player in the header.

**CARDS ARE KEYED BY TAPE, NOT BY CITY (2026-08-16).** A city may hold several tapes, so the key is the tape's own: a city's **first** tape keeps the bare city slug (`denver`) and later ones take `denver--204`, the surrogate id from `public.soundtracks`. One `cities` row therefore expands to several cards. `cardForTapeKey` is the primary lookup and `cardForCity` is the fallback that keeps `/soundtracks/#denver` deep links working, so the two must both stay. The search and the city rail build **one entry per tape**, labelled with the tape's own name, but they navigate by **city** slug, because a key like `denver--204` is not a city and the hash contract is a city.

**THE HEADER IS TWO EQUAL HALVES.** Words left, tape right, split evenly rather than sized to content, and each half centres its own contents both ways. The whole thing is a `.hero-grid` of `minmax(0, 1fr) auto`.

- **`main.sound-page` is load-bearing in these selectors, and so is `.hero`.** `shell/civic-modernist-pages.css` is linked at the BOTTOM of the document, after the inline `<style>`, so at equal specificity it wins on source order. Anything overriding it needs to be at least one class heavier. This is the single most common way an edit to this page silently does nothing.
- **The title is two authored lines, not a wrap.** `paintHeroTitle` builds two `.hero-headline-line` spans, the count and the word, each `white-space: nowrap`. Left to wrap, the break lands wherever the cell happens to end, which moves with the viewport. The block is sized off the **wider** line, which is always the word; the count is `1.55em` of that, in `em` so it stays in proportion as the parent clamp shrinks, rather than needing a second clamp kept in step by hand.
- **The subtitle is `nowrap` on desktop and wraps on a phone.** A 63-character line cannot hold at ~340px of usable width at any readable size, so `nowrap` there would either overflow the page or shrink the type to nothing.
- **Padding around the tape is `26px 26px 14px`, and 14 IS 26.** The search panel below carries a 12px margin of its own, so a flat 26 puts 38 under the tape against 26 beside it. Phone is `20px 20px 8px` for the same reason. The 6px top rule on `.hero` sits outside the padding box, so it does not count.

**`min-height: 332px` ON `.hero-deck` IS A MEASURED NUMBER, NOT A DERIVED ONE.** The tape is built in JS after the tables resolve, so without a reserve the header is one height for the first second and another once the cassette lands, shoving the grid down as it arrives. The first attempt derived 296 from the stage's min-height plus padding and was **36px short**, so it still jumped. Measure the panel, do not add up its parts. **The reserve must be `0` under the 860px breakpoint** — 332 is the height of a 551px-wide tape, and on a phone it would hold open ~160px of empty header.

**THE PLAYER IS INLINE IN THE HEADER, NOT AN OVERLAY.** Same node the modal always was, mounted into `#heroDeck` with `.sx-modal--inline` when that element exists and onto `<body>` otherwise, so pages without a deck keep the old behaviour untouched. The inline class takes off the fixed positioning, the scrim, the full-viewport box and the scroll lock — locking the page behind an element that is always on screen would make the grid unreachable.

- **`.sx-modal.sx-modal--inline`, two classes, deliberately.** The base `.sx-modal` rule paints the scrim and is declared later in the same sheet, so at equal specificity it won and the deck kept a dark box behind it.
- **`[hidden]` HAS TO BE RE-ASSERTED.** `display: block` on the inline modal is an ordinary declaration and `[hidden]` is only a UA-sheet `display: none`, so the author rule wins and `modal.hidden = true` silently does nothing. `body.home-page .sx-modal.sx-modal--inline[hidden] { display: none }` is what makes hiding work. Same trap the admin dialogs hit with `section.tool-modal-panel:not([hidden])`.
- The width goes on the **modal**, not the panel inside it: without it the modal shrank to its content at 336px and the panel's `width: 100%` then resolved against that instead of against the half it sits in.

**A NEW TAPE EVERY TIME YOU ARRIVE, AND IT DOES NOT PLAY ITSELF.**

- `openRandomCard` picks from tapes that have tracks. `restoreCassetteSession` was **deleted**: a session carried in from another page no longer wins here, because a permanent deck that reopens yesterday's tape is not a page you arrive at, it is a page you resume. The roaming case still picks a tape up on the **other** pages, which is the only place it has a job.
- **`openCard(card, opts)` takes `opts.silent` and `opts.clean`, and only the load-time pick sets either.** A tape you clicked is a request to hear it; a tape the page chose for you is not, and a page that makes a noise on arrival is one people close. So on load the cassette is loaded, labelled, artworked and sitting on Play, and nothing happens until somebody presses it.
- **`opts.clean` skips explicit tracks for the opening track only.** `firstCleanPlayableIndex` finds the first non-explicit playable one; `openRandomCard` also **prefers tapes that have one**, because constraining the index alone would still open an all-explicit tape on its first track. It falls back to the whole shelf if no tape qualifies, since silence is the worse answer. It is a **starting point, not a filter**: explicit tracks stay in the running order and Next reaches them normally.

**MINIMIZE PAUSES AND NOTHING ELSE; STOP EJECTS.** Two keys, two jobs, and both were once Close.

- **Minimize**, on the inline deck, calls `pauseSpotifyPlayer()`, clears `playing`/`wantAutoplay`, repaints the transport and returns. It deliberately does **not** call `destroyActivePlayer` (that drops the position) and does **not** mount the corner case. The corner case exists to carry a tape onto *another* page; on the one page with a permanent deck it took the cassette out of the header, put a smaller copy of it in the corner and left a hole — two players for one tape, and the shrunken one is the worse of them. The overlay path below that branch is unchanged and still stands down to the case, for pages with no `#heroDeck`.
- **Stop** clears the preload, destroys the active player and goes quiet, leaving the tape in the deck. It does not close anything, because there is nothing to dismiss.

**THE SCROLLING SHELF IS GONE.** 74 cassette spines looping horizontally was an index of the grid directly above the same grid, and the movement fought the player now sitting beside it. `PX_PER_SEC`, the rAF loop, the drag handlers, the three-chunk clone trick, `renderRail` and `createChip` all went with it. **Nothing in this header moves.** The **search stays** — it is how you reach one named tape out of 74 without scrolling. If a shelf ever comes back it is a new thing, not this one revived, and it does not belong in the header.

**`mini-cassette.js` is loaded here only as the roaming session store**, for `read` / `write` / `clear` / `handoff` / `setApi`. This page always shows the full deck; the floating case is for the other pages.

**Supabase is the only source.** The JSON lifeboat is long gone (see the top of this section); a failed fetch shows "Could not load soundtracks."

---

### A CITY MAY HOLD MORE THAN ONE TAPE (2026-08-16)

Migrations [2026081601_soundtracks_multiple_tapes_per_city.sql](mc/supabase/migrations/2026081601_soundtracks_multiple_tapes_per_city.sql), [2026081602_soundtrack_pull_rpc_per_tape.sql](mc/supabase/migrations/2026081602_soundtrack_pull_rpc_per_tape.sql) and [2026081605_soundtrack_pull_addresses_existing_tape.sql](mc/supabase/migrations/2026081605_soundtrack_pull_addresses_existing_tape.sql). All applied by hand — remote migration history in this project has drifted and the CLI refuses `db push`.

- **`public.soundtracks` is keyed by a surrogate `id`, not by `city_slug`.** `city_slug` is now an ordinary indexed column. Every write from the Tape Room is `soundtracks?id=eq.<id>`; a PATCH filtered on `city_slug` would hit every tape in the city.
- **`soundtrack_songs.tape_id`** says which tape a track is on, kept in step with `city_slug` by two triggers so nothing that reads the old column broke.
- **The do-not-rescrape tombstone index moved to `(tape_id, lower(title), lower(artist))`.** It was `(city_slug, …)`, which would have made a city's second tape unable to hold a track its first tape had retired. The scoping argument is unchanged and still the reason it is not global: a song can genuinely belong to two cities, and now to two tapes of one city.
- **An absent `spine_tag` in the pull RPC means "this city's existing tape"**, not "make a new one" — that was 1605, after a routine run split Jacksonville across two rows. A new tape is created only when the call names one.
- **The Tape Room keys on tape id throughout**: `tapeById`, `tapeIndexById`, `tapesInCity`. The symptom of getting this wrong is not an error — it is tracks appearing to move between a city's tapes, because the room was reading the city and finding the wrong row.
- **MANUAL ADD allows a second tape for a city but not a second tape with an identical name.** Two tapes called "Denver Mix" are two things nobody can tell apart in a list that shows the name.

### The Tape Room's tape row and tracks popup

- **The TRACKS button reads `{live}/{total}`, live in bold.** Two numbers in one control: how much of the tape is published, and how much of it exists.
- **A tape under 15 tracks gets a FILL PROMPT, not a finding.** A short tape is a job, not a fault, and the audit is explicitly forbidden to report one. The prompt asks for exactly the shortfall.
- **The NEW column is its own column and its own filter**, with a red badge carrying white text, over the 72-hour `NEW_FOR_HOURS` window. It is the queue; see the two-state note above for why the queue is time and not state.
- **A finding names TRACK TITLES, never ids.** `humaniseIssueText` exists for this: nobody reviewing a tape knows what "song 177" is, and an id is not something a human can act on.
- **Issue pips are a thick red outline on a white ground**, so they read as a mark on the row rather than a filled chip competing with the row's own state colour.
- **There is no delete button on an issue.** The issue's own buttons decide it; the popup's only global control is Cancel. Deleting a finding is the one outcome that leaves no record, and the recurrence of an uncleared finding on the next audit is the only check that a fix landed.

### THE PROMPT DIALOG HAS A TOGGLE PER PLATFORM (2026-08-20)

A `TARGET PLATFORMS` row above the sheet: Facebook, Instagram, Threads, X, YouTube, **all ticked by default**.

- **ALL FIVE TICKED WRITES NOTHING AT ALL.** The authored prompt already covers every account, so an untouched dialog hands back **exactly** the text in this file, byte for byte, and re-ticking the last box removes the block rather than leaving a paragraph saying "all of them". Same shape as the Tape Room's city picker, where blank is a real answer.
- **UNTICKING WRITES ONE DELIMITED BLOCK at the top and touches nothing else**, between `=== ACCOUNTS FOR THIS RUN ===` and `=== END ACCOUNTS ===`. **That surgical approach is the whole point**: this prompt is editable and what you type is kept, so rebuilding from `BASE_PROMPT` on every toggle — which is what the city picker does — would throw your edits away the moment you unticked a box.
- **THE BLOCK NAMES THE ACCOUNTS BOTH WAYS ROUND.** "Only these" is the instruction; the list of what to leave alone is what stops a model tagging an account out of habit, because the rules further down still describe it.
- **YOUTUBE OFF SAYS `SKIP STEP 2c` IN THE PROMPT'S OWN WORDS**, because YouTube is not a tag on a story there, it is a whole extra row.
- **NONE TICKED REPLACES THE WHOLE SHEET** with *"You must choose at least one platform to continue."* With every box off there is no run to describe, and **a prompt that carefully instructs an AI to post nowhere is a prompt somebody will paste anyway**.
  - **THE REAL TEXT IS STASHED, NOT DESTROYED**, edits and all, and comes back the moment a box is ticked. Losing somebody's typing because they unticked five checkboxes would be the worst kind of data loss: silent, self-inflicted and impossible to guess at. **Stashed once**, so unticking the last box twice cannot overwrite the stash with the warning.
  - **IT IS NEVER SAVED.** `storePrompt()` is skipped while the warning shows, so a browser closed in that state reopens with the real prompt rather than the warning stored as if it were one.
  - **THE DOORS REFUSE, AND `copyPromptText()` IS WHERE THAT IS ENFORCED**, not only in CSS. Each door copies and then opens a chat window, so without the guard you would arrive somewhere with one useless sentence on the clipboard and no idea why. The greying is the appearance; the guard is the rule.
  - **Reset re-ticks every box and clears the stash and the dressing**, since `BASE_PROMPT` carries no block: boxes left unticked would claim a restriction the restored text does not have, and a cleared stash stops the box showing real text while still refusing to copy it.

### THE PROMPT RETURNS THE SQL EDITOR LINK WITH ITS SQL (2026-08-20)

The page prompt now prints `https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/sql/new?skip=true` **directly under its SQL block**, every time.

- **BECAUSE BY THEN YOU HAVE LEFT THE PAGE THAT HAS THE BUTTON.** The dialog's own `Insert results` door is only useful while you are standing in the Socializer; you read the AI's answer in ChatGPT. Without the link the next step is going back for it. A link somebody does not need costs them one line.
- **`/sql/new?skip=true`, NOT `/sql/`, AND THE QUERY STRING IS NOT DECORATION.** `new` opens a **blank** query rather than whatever was last run in this project, and `skip=true` stops it asking. **Pasting six rows over somebody's half-written query is the accident that avoids.** The page's own door was still on the bare `/sql/` and was moved to match.
- **The prompt and the door carry the same url, so they have to be changed together**, and the prompt says not to shorten it, wrap it, or swap the project ref.
- **The ROUTINE prompt deliberately does NOT get this.** It writes through the RPC and never produces SQL, so a SQL editor link would be an instruction about a step it does not take.
- **A comment cannot go inside a tag.** The first cut of the door's change put the explanation between the anchor's attributes, which is invalid HTML and would have broken the button. Caught by parsing the page rather than by reading the diff.

### THE MANUAL ADD DIALOG READS AS THE PROMPT DIALOG'S PAIR (2026-08-20)

They are the room's two ways in, so they are built to be read together: **MANUAL ADD / Post Candidate** against **AI PROMPT / Six Post Candidates**.

- **THE REPEATED BUTTONS CAME OFF THE MANUAL HEAD.** Cancel and Add Candidate appeared twice, a few inches apart, on a dialog three lines long. They were repeated from the foot because a phone could push the foot pair below the fold, and **that reasoning expired with the form**: it used to carry nine fields and a platform picker and now carries one box. Both submitted via `form="manualPostForm"` and only the foot pair carried ids, so nothing was lost. **Bring them back if a field ever makes this form tall again.** The Edit dialog's own repeated pair is a separate decision and was not touched.
- **IT GAINED THE ERRAND PARAGRAPH** (`.prompt-howto`) the prompt dialog has always had. Without it the head was an eyebrow, a title and a lot of white space where the buttons had been. It also answers the question the single box provokes: one unlabelled field taking either a link or a sentence looks like a field you are about to get wrong, and the line under it only says which way it is going *after* you type.
  - **It is two sentences: _"Paste a link, or type an idea. It will be filed for editing and review."_** An earlier draft added that the caption and image are written later on the card, which is true and is not this dialog's business. **Naming a step that happens somewhere else, at the moment somebody is trying to finish here, reads as a warning rather than as help.** Say what the box takes and what becomes of it.
- **NO `Close` IN THE MANUAL HEAD**, even though the prompt dialog has one there. The prompt dialog's foot has no Cancel, so its Close is the only way out; this dialog's foot has Cancel, and adding Close above it would put back exactly the duplication just removed.

### A CAPTION PER ACCOUNT, WHERE ONE IS WANTED (2026-08-21)

`public.socials.captions`, [2026082103](mc/supabase/migrations/2026082103_socials_captions.sql), **apply by hand**. A jsonb object of OVERRIDES keyed by platform.

- **ONE CAPTION CANNOT BE RIGHT FOR FOUR ACCOUNTS, and the mismatch was absorbed silently.** X allows 280 and counts a link as **23 however long it is**, so `xText()` trims with an ellipsis — the right call, since losing a tail beats a post that never goes out — which means **a sentence can be cut in half with nothing on screen saying so**. Instagram's caption link is **not clickable**, making "read it here" a dead instruction on the one account that cannot follow it. Facebook unfurls the destination with its own headline, so a caption repeating that headline says it twice.
- **`blurb` IS STILL THE CAPTION.** This column is overrides and nothing else, so an absent key means use the shared one and **every row filed before the migration is already correct with a null**. Nothing was backfilled and nothing has two sources of truth.
- **A BLANK OVERRIDE DELETES ITS KEY rather than storing `''`.** Clearing a box obviously means "go back to the shared caption", and if `''` were stored, `blurbFor()`'s fallback would be the only thing standing between it and **a post that is a bare link**. Clearing the last one writes `null`, not `{}`.
- **`blurbFor()` IN [socials-post](mc/supabase/functions/socials-post/index.ts) AND `captionForPlatform()` IN THE PAGE ARE THE SAME FUNCTION TWICE**, because what goes out by machine and what lands on the clipboard have to be the same words. **Change them together.** In the Edge Function every call site is named for the account it serves — and the first cut got Instagram's wrong, because `caption: captionFor(row)` appeared twice and a blind replace made the Instagram container post Facebook's caption.
- **THE CONTROL SITS ON ITS OWN LINE UNDER THE CAPTION.** It was `inline-flex` and flowed on the caption's last line, which made it read as part of the sentence — a control tacked onto the end of **the one piece of text on the card that goes out under our name**, and which should therefore look like nothing but itself. `display: flex` with `width: fit-content`: block-level, but only as wide as its own words.
- **A DIALOG, NOT FIVE BOXES ON THE CARD**, for the reason the image editor is a dialog: writing a different caption for X means **seeing it next to the shared one and next to its own character count**, neither of which fits under a post mockup. The card carries one quiet control, and it **says how many accounts differ** — that is a fact about what will actually go out, and you should not have to open anything to learn it.
- **THE COUNT IS ONLY DRAWN ONCE A BOX HAS SOMETHING IN IT.** An empty box is using the shared caption, so a count there would be counting a string the box does not hold. Limits are only given where we know one: X's is our own code's budget, plus Threads 500 and Instagram 2200. **Facebook and YouTube get a plain count**, never an invented cap.
- **THE BOT DOES NOT WRITE THIS AND NEITHER PROMPT MENTIONS IT.** A model asked for five captions writes five versions of one sentence, which is four more things to read on a candidate that will probably be skipped. An override is a human deciding one account needs different words.

### THE PLATFORM'S OWN POST ID IS KEPT (2026-08-21)

`public.socials.posted_ids`, [2026082102](mc/supabase/migrations/2026082102_socials_posted_ids.sql), **apply by hand**. A jsonb object keyed by platform: `{"facebook": "123_456", "threads": "789"}`.

- **`socials-post` HAS ALWAYS RETURNED THESE AND THE PAGE HAS ALWAYS DROPPED THEM.** Every successful post answers `{platform, ok: true, id}` and `markPosted` recorded only the NAMES.
- **AN ID IS THE ONLY HANDLE BY WHICH A POST CAN LATER BE ASKED HOW IT DID.** Meta and Threads both serve engagement figures for a post you own, by id, and **there is no way to recover one afterwards** from a row that did not keep it. So this is not an analytics feature: it is the thing that has to exist **before** one is possible, and every post made without it is permanently unmeasurable.
- **KEYED, NOT AN ARRAY.** An id is meaningless without knowing whose it is, and `posted_platforms` beside it is an ordered list a later edit could fall out of step with.
- **BY-HAND ACCOUNTS ARE ABSENT, NOT NULL.** Nobody sees the id of a post a human made in X's own composer. A missing key means "we did not make this post through the API", which is true; a null would look like a failure. **A sitting that reached only X and YouTube writes no `posted_ids` key at all** rather than `{}`, which would claim we looked and found none.
- **A REFUSED ACCOUNT APPEARS IN NEITHER** `posted_platforms` nor `posted_ids`, because both are built from the reply.
- **`COLUMN_MIGRATIONS` IS THE NAMER.** One map from column name to migration file, so any write of a column the database lacks reports the file to run instead of a raw `PGRST204`. Add a line when you add a column.

### A CANDIDATE IN REVIEW SAYS IF IT HAS BEEN HERE BEFORE (2026-08-21)

`public.socials.returned_from`, [2026082101](mc/supabase/migrations/2026082101_socials_returned_from.sql), **apply by hand**. A chip on the kicker: **back from Posted** / **copy of a posted one** / **back from Skipped** / **copy of a skipped one**.

- **A ROW THAT CAME BACK LOOKED EXACTLY LIKE A FRESH PICK**, and they are not the same thing to decide about: one is a candidate nobody has read, the other is a judgement somebody has already made and is now revisiting.
- **MOVE FROM POSTED DESTROYS THE ONLY EVIDENCE, BY DESIGN.** The trigger clears `posted_at` — that is the whole point of Move, which is for something that never really went out — so afterwards nothing anywhere recorded that the row had ever been posted. **This column is what survives that.**
- **FOUR VALUES, THE TWO QUESTIONS CROSSED**: which side it came back from, and whether the original survived. **The copy/move distinction is the load-bearing half**: a COPY means the other row is still out there posted or skipped, a MOVE means this row *is* that row. One column rather than two, because a `returned_how` with no `returned_from` is meaningless and the pair would have to be constrained to agree.
- **`skipped-copy` HAS NO BUTTON AND THE VALUE EXISTS ANYWAY.** The Skipped card offers Move alone, deliberately: a skipped candidate was never posted, so copying it would only produce two identical undecided rows. The value is in the CHECK so that adding the button later is a one-line change rather than a second migration.
- **OVERWRITTEN ON EVERY RETURN, NEVER CLEARED.** A row that goes out and comes back twice describes its LAST return, which is the one you are looking at. **The chip is drawn only while the row is in Review**, so a stale value on a re-posted row costs nothing and clearing it would be a second write for no reader.
- **IT IS NOT A HISTORY.** If an audit trail is ever wanted, that is an events table, not a wider column.
- **It takes the accent, not the red pen**: a row that has been round before is context, not a warning. It wears the origin chip's shape because it is the same kind of fact — what the candidate *is*, rather than what it says.

## A CITY NAMED BY ANY WRITER IS ADDED TO `public.cities` (2026-08-25)

[2026082505](mc/supabase/migrations/2026082505_auto_add_cities.sql), **applied**. `tgb_ensure_city(text)` is the one doorway, and
all three writers now go through it or its equivalent.

| how an event arrives | before | now |
|---|---|---|
| MANUAL, in the room | added the city | unchanged |
| SCHEDULE, the ESPN import | badged `new city`, added nothing | adds every city it named |
| the bots, through the pull RPCs | **refused the event** | creates the city, files the event |

**THIS REVERSES THE ADVICE IN 2026082503's OWN COMMENT**, which said the
catalogue should not be writable by an anon-callable function. **The concern was
raised and overruled, which is a decision and not an oversight.** What is below
is the narrowest version that still does what was asked.

- **`tgb_ensure_city` IS INSERT-ONLY.** It can create a row and can never update
  or delete one, so no existing city can be renamed, hidden, unhidden or removed
  through it.
- **IT REFUSES A STRING THAT IS NOT A CITY**, and this is the guard that carries
  the whole design: `tgb_parse_geo` must yield a `city_name` **and** either a
  state or a country. `"Chicago, Illinois"` and `"Dublin, Ireland"` pass;
  **`"Chicago"`, `"New England"`, `"TBD"` and `""` do not.** That is what stops
  a club market becoming a catalogue row — the same thing the room's own
  `ensureCitiesExist` refuses to invent.
- **IT WRITES ONLY `city`.** The slug and every structured column come from the
  table's triggers, so a row that arrives this way is the same row as one added
  on the Cities page. Verified: `Nowheresville, Nebraska` came out
  `nowheresville / Nowheresville / NE / USA`.
- **`unknown_city` CHANGED MEANING**, and both prompts were rewritten to say so.
  It no longer means the catalogue was missing a town; it means **the string was
  not a usable city**. Both routines are now told to report it as *something you
  sent wrong*, and to name every city they caused to be created.
- **THE VISIBILITY FLAGS ARE LEFT AT THEIR DEFAULTS.** A new city arrives
  visible and is harmless: the three public rails are driven by what a city HAS
  — games, tapes, gift listings — and a city just created has none, so it shows
  nothing anywhere. Pre-hiding would mean every good city arrived switched off
  and had to be found and switched on.
- **WHAT THE BOTS ADD IS FINDABLE**, with no new column, because
  `cities.created_at` already existed:
  `select city, created_at from public.cities where created_at > now() - interval '7 days' order by created_at desc;`
- **THE TWO RPCs WERE PATCHED IN PLACE FROM THEIR LIVE DEFINITIONS**, one branch
  swapped, rather than re-pasted. **A `create or replace` rewrites the whole
  body** and this project has already lost a column that way.

**PROVED BY CALLS THAT MADE IT DO ITS JOB.** The helper refused a market, a bare
city name, a placeholder and a blank, and created a real one with its triggers
firing. An event in a town nobody had entered came back **`inserted`** with the
city created alongside it; the same event in `"New England"` still came back
`unknown_city`. Probes deleted; 4,181 events and 1,461 cities after.

## THE HUB ANSWERS "WHAT IS WAITING ON ME" AND "ARE THE BOTS ALIVE" (2026-08-25)

Two tables at the top of [mc/index.html](mc/index.html), above Ancillary Things.

### TO REVIEW — one table, every room

Until this, the question was answered by opening five rooms and counting. It sits
near the top for the same reason Access Requests does: it is about a decision
somebody owes.

- **A ROW IS DRAWN ONLY WHEN IT HAS SOMETHING IN IT**, and the panel hides itself
  when every room is clear. A table of five zeroes every morning is a table
  nobody reads, and all-clear is the state most worth seeing at a glance.
- **THE QUERY IS WRITTEN PER ROOM, NOT NORMALISED**, because the rooms genuinely
  disagree about what "waiting" is: Events writes a `status`, the Gift Shop
  derives it from two timestamps, the Tape Room from a flag plus a 72-hour
  window. Normalising would mean changing five rooms to suit one table.
  - **The Tape Room's window is COMPUTED from the same 72 hours**, not written
    out again, so the hub and the room cannot drift about what NEW means.
- **THE FIRST COLUMN NAMES THE QUEUE, NOT JUST THE ROOM**, wherever a room has
  more than one. The Tape Room has two — tracks waiting on a decision, findings
  waiting to be cleared — and they are different jobs with different verbs, so
  one merged figure would hide that. They read **Tape Room: new tracks** and
  **Tape Room: findings**.
  - **IT CANNOT BE LEFT TO THE "WHAT IT IS" COLUMN**, which is what the first cut
    did. That column is `display: none` under 640px, so **on a phone the table
    read as one room listed twice with two numbers and nothing to tell them
    apart.** A test now asserts no two rows share a label.
- **A REFUSED READ IS NEVER DRAWN AS A ZERO.** `socials` and `soundtrack_issues`
  are admin-read only, so a lapsed session answers 403 — and reporting that as 0
  would say the queue is empty when nobody knows. `countOf()` returns **null**,
  the row reads *could not read* in a quieter pen, and the total says it is a
  floor. **"Nothing is waiting" and "we could not find out" are opposite
  answers**, and the whole value of the panel is that the first can be trusted.

### AND YOU REVIEW THEM HERE (2026-08-25)

Pick a room in that table and its ITEMS load beneath it, each with the one or
two decisions this page can honestly offer. The small `room` link beside the
name still goes to the room — two destinations, so two controls.

- **IT IS A WORKLIST, NOT A SECOND COPY OF EACH ROOM**, and that line is the
  whole design. **The Tape Room ran a separate QUEUE view for one afternoon and
  deleted it**, because a track then had two homes, two renderings and two sets
  of buttons, and you had to know which room you were standing in before you knew
  what a press would do. What earns this one its place is that it is
  **CROSS-ROOM**: no single room can show you the other four.
- **SO AN ITEM GETS ONE LINE AND ITS DECISION, NEVER A CARD.** Anything needing
  judgement — writing a caption, choosing accounts, editing a track — is a link
  into the room that owns it. **If a queue ever grows a third button here, that
  is the sign it belongs in its room instead.**
- **WHAT EACH QUEUE OFFERS, and why it stops there:**

  | queue | here | why not more |
  |---|---|---|
  | Events | Clear | acting on a finding means editing fields |
  | Socializer | Skip | posting needs the Edge Function, a caption per account and five buttons |
  | Gift Shop | Keep · Shelve | two timestamps, and nothing else to decide |
  | Tape Room tracks | Live · Shelve | the room's own two words for `archived` |
  | Tape Room findings | Clear | writes `fixed`, never `dismissed` |

- **KEEP CLEARS `rejected_at` AND SHELVE CLEARS `certified_at`.** The two stamps
  are one decision seen twice, and a row carrying both is one no reader can
  interpret.
- **A DECIDED ROW STAYS PUT AND GOES QUIET.** Removing it would shift every row
  under the pointer so the next press lands on something else, and after three
  decisions you would not know what you had just done.
- **THE COUNTS ARE REBUILT AFTER EVERY DECISION, NOT DECREMENTED.** One decision
  can settle more than one queue — shelving a track can answer a finding about it
  — and a number this page worked out for itself would drift from the database.
- **`return=representation` ON EVERY WRITE.** PostgREST answers 200 with an empty
  array when RLS refuses, so without reading the row back a refused decision
  reports success and the item vanishes until a reload brings it straight back.
- **A QUEUE THAT CANNOT BE READ SAYS SO**, rather than drawing an empty list —
  the same distinction `countOf()` makes in the table above.

**THE HARNESS WAS THE BROKEN HALF TWICE HERE, both worth knowing.** Its
last-filed branch matched on `order=created_at.desc`, which the worklist's item
list also sorts by, so the list got the one-row shape and the panel said
"Nothing left here" about three gifts that were there; the real discriminator is
`select=created_at`. And its PATCH branch read `arguments[1]` inside an **arrow
function**, where `arguments` belongs to the enclosing scope — so it never
matched and every decision fell through to a generic reply that read as the
database refusing the write.

### `mc/data/cities.html` IS DELETED (2026-08-25)

The hub's Cities panel is now **the only city editor there is**. A hard break
with no redirect, as always here: `/mc/data/cities.html` 404s. Every door went
in the same commit — the Cities entry in [mc/js/admin-nav-menu.js](mc/js/admin-nav-menu.js), the card in
[mc/data/index.html](mc/data/index.html), and the hub's own Add fallback, which had pointed there.

**WHAT WENT WITH IT, STATED PLAINLY RATHER THAN DISCOVERED LATER.** These are
SQL now, until somebody asks for them back:

| gone | why it mattered |
|---|---|
| **Delete a city** | the only way to remove one |
| **Rename a city** | with its three-sentence warning about the string key |
| `city_name` / `state_name` / `state_code` / country | the structured geo fields |
| continent / country / visibility filters | browsing 1,451 rows by anything but name |
| the bulk AI import prompt | adding cities in batches |
| `?add=<city>` deep link | its last caller went with the ERRORS dialog |

**DELETE IS THE ONE THAT BITES, AND IT BITES HARDER BECAUSE OF THE OTHER CHANGE
MADE THE SAME DAY.** Cities are now created automatically by every writer, and
there is no longer any screen that can remove one. **A bad city added by a bot
is `delete from public.cities where slug = '…'` and nothing else.** If that
turns out to be a real problem, the fix is a Delete on the hub panel guarded by
a reference count, not the room coming back.

**The `?add=` handling in [mc/assets/city-picker.js](mc/assets/city-picker.js) is untouched** — that module
owns the add dialog, is loaded by the hub and by `mc/events/index.html`, and is
what both use to create a city. Only the PAGE went.

**`addcity-test` was retired with it**, its subject being that page's `?add=`
flow. **Its one still-live case moved into `cities-test`**: `isKnownCity` must
compare case-insensitively, which is the bug that once made a row UNKNOWN on one
page and ALREADY THERE on the other.

### CITIES — one city at a time, on the hub (2026-08-25)

A panel showing **one** city with its three visibility flags, a search, and
steps either side.

- **ONE, BECAUSE THE QUESTION IS ALWAYS ABOUT ONE.** The catalogue is 1,451 rows
  and what you come to it for from here is *is Foxborough hidden*, *should Tulsa
  be on the gift shop*. A hundred-row page is the right shape for the room and
  the wrong shape for a hub panel.
- **IT IS NOT THE WHOLE ROOM AND DOES NOT TRY TO BE.** [mc/data/cities.html](mc/data/cities.html) keeps
  renaming, the structured geo fields, the three filters and the bulk AI import.
  **The page is NOT deleted** — say so if it should be.
- **THERE IS NO LINK TO THE ROOM FROM THIS PANEL.** The bar is search, back,
  where-you-are, next and Add: five things that all act on the city in front of
  you, and a sixth that only went somewhere else was the one thing on it that
  did not. **It strands nothing** — the room is still reached from the nav menu
  and the Data Warehouse card, checked before removing it. The Add button's
  fallback still goes there when the shared dialog is missing, because a button
  that does nothing is indistinguishable from a broken one.
- **A RENAME IS DELIBERATELY NOT OFFERED HERE.** `city` is the KEY that games and
  gift-shop listings reference **by string**, nothing updates them
  automatically, and the room's own rename warning runs to three sentences for
  that reason. A one-line panel is the wrong place to make that decision.
- **IT SAVES ON THE TICK, with no Save button.** One row, three booleans: a Save
  would be a second press for a decision already made. The room has one because
  its card also carries five text fields a rename must be warned about.
- **`ignored` IS WRITTEN TOO, and the rule is copied exactly**: deprecated, still
  written so a reader that has not moved to the three columns behaves sensibly,
  and true **only when all three are**. The room writes it the same way and the
  two must not disagree.
- **A REFUSED WRITE PUTS THE TICK BACK.** PostgREST answers 200 with an empty
  array when RLS refuses, and leaving the box where the click put it would show
  a state the database does not hold.
- **SEARCH RESETS TO THE FIRST MATCH ON EVERY KEYSTROKE.** Holding the index
  while the list shrinks under it lands you on an unrelated city.
- **ADD OPENS THE SHARED DIALOG** (`TgbCities.openAddDialog`), never a second
  form: it derives the state code, composes the canonical string and writes the
  structured geo, so a city added here is the same row as one added anywhere
  else. **The guard tests the function it actually calls** — it tested
  `TgbCities.add` and called `openAddDialog`, which would have walked straight
  past into a TypeError.
- **The hub now loads `geo.js` and `city-picker.js`**, which it did not before.

### ROUTINES — all seven, and whether they are alive

- **LAST FILED, NOT LAST RUN.** Each row reads the newest row in the table that
  routine writes. **A run that errored writes nothing**, and since none of them
  commit anything, that absence is the only signal there is. Past its own cadence
  the figure goes red — that IS the failure notice.
  - **TGB ANCHOR EVENTS reads `commits a file`** rather than a blank, because its
    prompt is still the NFL tour builder and it writes no table. A blank nobody
    can interpret is worse than a sentence.
- **THERE IS NO RUN BUTTON, AND THAT IS NOT AN OVERSIGHT.** Firing a routine is a
  POST to the claude.ai trigger API with an **OAuth bearer**, and this page is
  public HTML on GitHub Pages: **a token in it is a published token**. Checked
  rather than assumed — `ANTHROPIC_API_KEY` in `.env` is an empty placeholder,
  and the trigger API does not take an API key anyway.
  - **OPEN goes to the routine at claude.ai, where Run is**, and the tooltip says
    so rather than leaving somebody pressing a button twice.
  - **IF A RUN BUTTON IS EVER WANTED** it is an Edge Function holding a token,
    gated by `is_photo_admin()`, exactly as `socials-post` holds the Meta
    credentials. It needs a token that exists first.

### THE `no-time` CHANGE LEFT 524 ROWS FALSELY RED, AND THAT HAD TO BE CLEARED

An ERRORS sweep had already written `status = 'review'` on 567 events under the
old rules. **The sweep never writes a row back OUT of review** — deliberately,
so it cannot undo a human's own flag — so those rows would have stayed red
forever for a rule that no longer objects. Counted first: **524 flagged for the
missing time alone, 43 genuine TBD, and 0 with any other fault**, which is what
made the cleanup safe to bound. The 524 are back to `scheduled`; 43 remain.

**THIS IS THE STANDING COST OF THAT DESIGN.** Loosening a rule does not release
the rows it already flagged. Whenever a rule stops forcing, check what is stuck
behind it.

## Mission Control's ANCILLARY THINGS cards say what the ROOMS say (2026-08-19)

**SOCIALIZER SITS FIRST (2026-08-21).** The three are ordered by how often they are opened, not alphabetically and not by age: the socials queue fills twice a day and is emptied by hand, so it is the one you come to this page for. The Gift Shop and the Tape Room accumulate and are worked in sittings. **Its card is the one wrapped in `.mc-chore-slot`**, so moving it means moving the wrapper and its follow button together, not just the `<a>`.

**THE PANEL WAS CALLED DAILY CHORES UNTIL 2026-08-20.** The old name described the CADENCE and said nothing about what the three cards are; the new one says what they are, and it lines up with the big-picture section at the top of this file: soundtracks, gifts and social posts **hang off the product rather than being it**. **The class names did not move** — `.mc-chores` and `.mc-chore` are identifiers, the same bargain the Tape Room made through four renames of its verbs without the column following. Don't reintroduce "chore" in visible copy.

All four headings are the room's own name — **GIFT SHOP**, **TAPE ROOM**, **SOCIALIZER**, **PARTNERS** — and all four paragraphs are that room's own `.room-blurb`. (**Partners joined on 2026-08-20**, moving out of the nav's Game Elements group and into its own `hubHidden` group, exactly as Socials is: a chore card at the top of `/mc/` plus a directory card below it is the same link twice.) They had been verbs with hand-written descriptions (*STOCK GIFTS*, *MAKE SOME MIX TAPES*), and those descriptions had gone quietly stale: the socials one still promised a per-account composer picker that was deleted when one click started reaching every account it can.

**A door that describes a room in its own words drifts the moment the room changes**, and nothing makes it obvious — the card still reads perfectly.

### THE SENTENCE IS RENDERED FROM ONE SOURCE NOW (2026-08-19)

**[mc/js/room-blurbs.js](mc/js/room-blurbs.js) holds all three strings and both surfaces render them**, so the pair cannot drift. This section used to end *"when you change a room's blurb, copy it here; the pair has no automation and no check"* — it has one now. **Edit the string in that file and the room and its door change together.**

- **The contract is `data-room-blurb="<key>"` on an empty element**, plus the script. Keys are `stock-room`, `tape-room`, `socializer`, `partners`.
- **THE MARKUP CARRIES NO FALLBACK TEXT, DELIBERATELY.** Leaving the sentence inline as a safety net recreates the exact thing this kills: two copies, one quietly wrong. An element that renders EMPTY because the script did not load is a visible failure somebody fixes; a stale sentence is an invisible one nobody notices. Same reasoning that deleted the soundtracks JSON fallback. **Don't "improve" it by putting the text back in the HTML.**
- **BOTH SURFACES USE `.room-blurb`**, so the container is shared as well as the words. On the hub that meant scoping the card's own rule to **`.mc-hub-card p:not(.room-blurb)`** — the two were half-fighting, and `.mc-hub-card p` (0,1,1) beat `.room-blurb` (0,1,0) on some properties while losing `font-weight` and `max-width` to it, which is neither the card's look nor the room's. The directory cards still use the unscoped rule.
- **The Socializer's blurb was a `<p class="status room-substat" id="pageStatus">`** until this pass, a leftover from when that line doubled as the status channel. **Nothing in the page reads that id** — `setPageStatus` writes `#pageNotice`, the scribble — so it became a plain `.room-blurb` like the other two. The Tape Room's `#pageTagline` is equally unread and was kept only because it costs nothing.
- **A ROOM JOINS THE FILE WHEN IT GETS A DOOR.** The Path Builder and the Green Room have blurbs and no Ancillary Things card, so their sentence is written once, on the room, and has nothing to drift against. Add them the day they get a card, not before.

The `GO TO …` buttons repeat the heading now, which is what keeps them reading as a door rather than a second title.

## Getting onto the admin list — JOIN, approved at /mc/ (2026-08-17)

Sign-in is two gates, and they are separate: **Supabase Auth** proves who you are, then `verifyAdminTable` in [mc/js/admin-auth.js](mc/js/admin-auth.js) checks your email against **`public.admin_users`**. An auth user who is not on that list signs in successfully and is told *"This account is signed in, but it is not on the admin list."* That message predates all of this and is exactly the state a pending applicant sits in.

Until now the only way onto the list was a row typed into `admin_users` in the SQL editor, so somebody with dashboard access had to be in the room. **Request Access** is the asking half. Migration: [2026081701_admin_access_requests.sql](mc/supabase/migrations/2026081701_admin_access_requests.sql) — **apply by hand**, like everything else here.

- **THE APPLICANT CREATES THEIR OWN AUTH USER, and that is a constraint, not a preference.** Making a Supabase Auth user for somebody else needs the service role key and this project has none. So JOIN signs them up with the publishable key and then files a request; **approval only ever adds an email to `admin_users`** — the same single row a human would have typed. It follows that the Supabase project must have **self-signup enabled**, and that if email confirmation is on they must confirm before they can sign in.
- **`public.admin_access_requests`** holds the queue. `status` ∈ pending | approved | denied. **SELECT is `is_photo_admin()` only** — a list of people who want in is not public — and there is **no anon policy at all**; both writes go through functions.
- **`tgb_request_admin_access(jsonb)`** is `SECURITY DEFINER`, anon-callable, insert-only, and **always writes `status = 'pending'`**. Don't add a `status` parameter, for the same reason the four pull RPCs don't have one: that constant is what makes it safe to expose.
  - **It gives the same answer every time**, and the form's message matches. Replying "you already asked" or "you are already an admin" to an unauthenticated caller turns the form into an oracle for which addresses are on the admin list. The `on conflict do nothing` is what keeps it quiet.
  - A **partial** unique index on `email where status = 'pending'` means one open request per address, while a denied one does not lock the address out forever — the usual reason for a second ask is that the first was a mistake.
  - An existing-account error from signup is **not** treated as a failure: somebody who signed up, was never approved, and has come back to ask again would otherwise be stopped by their own earlier attempt, with an error they cannot act on.
- **`tgb_decide_admin_access(uuid, boolean)`** is `SECURITY DEFINER` because approving writes `admin_users`, which no client may write directly. **Its first line is `is_photo_admin()`** — without that it hands the admin list to anybody — and it is granted to `authenticated` only, so there are two gates rather than one. It locks the row `for update`, so two admins pressing Approve at once cannot both act.
- **The panel is at the top of [mc/index.html](mc/index.html)**, above Ancillary Things, and is **hidden when nothing is pending** rather than showing an empty box. It tolerates the migration not being applied: a 404 from the table hides the panel instead of erroring, the same tolerance the Tape Room extends to a missing issues table.
- **Deny does not delete the account.** The person keeps the Supabase user they made; they simply never reach Mission Control with it. The button's tooltip says so, because the obvious reading is the wrong one.
- **REVOKING an admin is deliberately not in the UI.** It stays a `delete from public.admin_users` in the SQL editor. An Approve button that can also revoke is one misclick from locking the last admin out of Mission Control.

## THE SOCIALIZER — the social post admin page

> **"SOCIALIZER" means [mc/socializer/index.html](mc/socializer/index.html).** Nothing else. It is the room's name on screen (the `<h1>`), it is what to call it in conversation, and an instruction naming it — *"add a button to the SOCIALIZER"*, *"the SOCIALIZER is showing the wrong order"* — is an instruction about that one file, with no other page to check first.
>
> | | |
> |---|---|
> | **file** | `mc/socializer/index.html` — one self-contained page: markup, CSS and script in the one file, plus the AI prompt in a `<textarea>` |
> | **live** | <https://thegamebureau.com/mc/socializer/> — public HTML on GitHub Pages, gated by the admin sign-in, so the *page* is reachable by anyone and the *data* is not (RLS is `authenticated` both ways) |
> | **local** | <http://127.0.0.1:5500/mc/socializer/> under Live Server |
> | **table** | `public.socials`, admin-read only |
>
> **FOUR ADDRESSES IN TWO DAYS. This is the record, in order:**
>
> | when | where | why it moved |
> |---|---|---|
> | until 2026-08-19 | `mc/socials/index.html` | named after the TABLE it edits |
> | 2026-08-19 | `mc/socializer.html` | named after the room, but as a FILE |
> | 2026-08-20 | `mc/socials/index.html` | back: a file breaks the folder convention |
> | 2026-08-20 | **`mc/socializer/index.html`** | named after the room AND a folder |
>
> **THE LAST ONE IS THE ONE THAT SATISFIES BOTH RULES**, which is why the other three did not stick. Every room here is named by its folder (`/mc/gifts/`, `/mc/soundtracks/`) — that is the convention `socializer.html` broke — and every room is called by its own name on screen, which is what `socials/` broke, since the `<h1>` has said SOCIALIZER throughout and only the path disagreed. **There is no fifth form available**, so treat this as settled.
>
> **THE FIRST ROUND TRIP COST NOTHING AND THAT WAS LUCK. THIS ONE COSTS SOMETHING REAL.** `#edit=` links are what matters: TGB SOCIALIZER BOT mails five of them twice a day and has since August. The 19th broke them and the 20th healed them, because the path came back. **This move does not come back** — every link in every summary mailed before 2026-08-20 is permanently dead, and GitHub Pages serves no 301, so there is nothing to be done for them. Mail from the next run onward carries the new path. **That is the price of settling it, paid once and knowingly.**
>
> **WHAT THE MOVES TAUGHT, worth more than the moves:**
>
> - **The asset paths only survived because they were made root-absolute on the way out.** The page's three `../../mc/…` script and stylesheet references became `/mc/…` on the 19th, so changing depth twice in two days cost nothing. A relative path would have broken every time. (The fourth move keeps the same depth, so it could not have bitten here — but that is luck, not the reason it was safe.)
> - **AN ESCAPED PATH HIDES FROM A SWEEP, AND IT HID TWICE.** The admin nav's `match` regex is written `/^\/mc\/socials\//`, and a search for `/mc/socials/` does not find it. It survived the first pass of the second move and the first pass of the fourth. A `match` out of step with its `href` does not error: it just quietly never lights the button. **Grep for the escaped form every time.**
> - **The stored prompt is a third copy of the path** and moves with neither the file nor the repo. It is edited by hand on the trigger, every time.
> - **A blind find-and-replace rewrites the HISTORY as well as the paths.** The fourth move turned this very section into "it left `/mc/socializer/` on 2026-08-19", which is nonsense, and turned the retired `mc/socials/socials.json` into a file that never existed. **After sweeping paths, re-read the prose that describes the moves.**
>
> Every in-repo reference was repointed in the same commit, every time — the hub's Ancillary Things card in `mc/index.html`, the Socializer entry in `mc/js/admin-nav-menu.js` (there is no `match` regex for this room there, unlike the Tape Room's), the shared admin nav's FOLLOW button **and its `match`**, the page's own `tgb-agent-context` block and PROMPT text, both Edge Functions' comments, `PROMPTS.md`, the three migration comments, and the palette-source comments in `mc/gifts/index.html` and `mc/pathbuilder.html`.
>
> **Don't confuse it with TGB SOCIALIZER BOT**, which is the scheduled routine that files candidates *into* it. The two names now differ by one word, so read carefully: the SOCIALIZER is the page, TGB SOCIALIZER BOT is the trigger — a trigger at claude.ai, not a page. The Socializer is where a human decides; the bot only ever inserts. Same distinction the page itself makes: the button labelled TGB SOCIALIZER BOT opens the routine, and the PROMPT dialog beside it is deliberately *not* named after the bot.

[mc/socializer/index.html](mc/socializer/index.html) — **the Socializer** — shows social post candidates, found by a **scheduled Claude Code cloud agent** (**"TGB SOCIALIZER BOT"**, `trig_01KDYndJhZ9ymgUgX5Xx6LsL`, cron `14 8,20 * * *` UTC — **twice a day**, 3 AM and 3 PM Central (2 o'clock in winter; see the schedule note above, nobody adjusts)).

**ONE table holds everything: `public.socials`** ([mc/supabase/migrations/2026080502_socials_table.sql](mc/supabase/migrations/2026080502_socials_table.sql)). A row is a candidate — its content *and* its decision (`status` = review | posted | skipped). There is no JSON file and no localStorage.

**How it got here, so nobody rebuilds a discarded shape.** It was `socials/queue.json` committed by the bot, then `mc/socials/socials.json` (the room's address at the time), then briefly that file **plus** a `socials_post_state` overlay table for the human decisions. All of it is retired. The split was the problem: neither half told you what was true on its own, the file grew forever with no sign that most of it had been dealt with, decisions lived in one browser's localStorage and were invisible everywhere else, and "can we delete the json" had a dangerous answer because the file was the only copy of the content. **Don't reintroduce a file or a second table.**

- **The bot inserts through `tgb_pull_socials_candidates(jsonb)`** and commits nothing. `SECURITY DEFINER`, callable with the publishable key — a cloud routine has no secret store, the same constraint that produced `tgb_pull_book_candidates` and `tgb_pull_soundtrack_songs`. Insert-only, **always `status = 'review'`**, capped at 25 a call, and a url already present is skipped rather than raising. **Don't add a `status` parameter** — that constant is what makes it safe to expose to `anon`.
- **Dedupe is a unique index on `lower(url)`**, server-side. The bot cannot read the table (admin-only) and doesn't need to; the RPC returns `{inserted, skipped}` and the prompt tells it to check that reply.
- **The page reads and writes the table directly** under an admin session: status, the Edit dialog, and MANUAL (which INSERTs a real row, so a hand-added story is the same object as a bot-found one). RLS is `authenticated` both ways — `why` is an internal note and the review queue is not public.
- **MANUAL ADD is ONE box that takes a link OR a line of text**, and which one you gave it decides which column gets filled (2026-08-15). It is labelled **Website** and a link is what it is for: `https://` is added when the scheme is missing, the destination is read for its title, and the candidate is filed with that url. But a value that will not parse as a web address is **not an error** — it becomes the candidate's **caption**, with `url = ''`. What you have in hand when you reach for this dialog is sometimes an idea or a thing somebody said, and refusing it meant filing a candidate you did not want just to reach a box you could type the sentence in. The line under the field says which way it is about to go before you press Add.
  - **The scheme is only prefixed when the result parses.** The blur handler used the bare scheme regex, which prefixes anything — that turned a typed sentence into `https://Ran into a guy at the bar` and saved *that* as the caption. Both the box and the save now run the candidate through `normalizeManualUrl` first.
  - **`socials_url_idx` had to become blank-tolerant** ([2026081501](mc/supabase/migrations/2026081501_socials_url_index_allow_blank.sql)). `url` is NOT NULL, so every text-only candidate carries the same `''` and the second INSERT hit the unique index — the first note filed, the second failed with a 23505 naming a column the human never filled in. The predicate now skips the blank as well as the gift urls it already skipped. Two notes are two notes; a real story url is still filed once and once only. **This migration is not yet applied** — remote migration history in this project has drifted (the CLI refuses `db push`, and nothing since 2026-05 is recorded there), so it goes in by hand in the SQL editor like the rest. Until then a second text-only candidate is refused, with the page naming the migration rather than showing the raw error.
- **The last-run indicator is gone**, and deliberately. It read the GitHub commits API for the JSON on the principle that a failed run pushes nothing; the bot no longer commits, so that signal doesn't exist. If it returns, read the newest `created_at` — **not** the commits API.
- **THE MAIL GOES TO THE ROUTINE'S OWNER, AND THERE IS NO RECIPIENT FIELD TO SET.** `notifications.channel.email: true` is the whole control; the address is the claude.ai account the trigger belongs to, which is **kevinmkolb@gmail.com**. So "send it to Kevin" was already true and could not have been made truer by configuration. **What changed on 2026-08-21 is that the prompt now names him**, because a routine told who is reading writes for a person rather than for a log.
- **THE FOOT CARRIES TWO LINKS: the Socializer and `https://thegamebureau.com/mc`.** The email arrives twice a day and is often the only reason anybody opens the site, and once they are in, the queue is not always what they came for: the Gift Shop and the Tape Room are one press from `/mc` and unreachable from a link that only goes to the Socializer. **Two, side by side, and no more** — it is a footer, not a menu. Both appear even on a run that filed nothing, since the run you most need to open is the one that went wrong.
- **Each run emails its summary** (added 2026-08-05) — the routine's own `notifications.channel.email` flag, not the Gmail connector, which on this account can only draft. Step 7 of the prompt is the whole spec for that mail: the agent's **final message is an HTML fragment and nothing else** — no markdown, no prose around it, no code fence — carrying a header count, a **Review them** button, one block per candidate with the headline linked to its story, a Not filed list, and Notes. Two links to `https://thegamebureau.com/mc/socializer/`, top and bottom.
  - **Email rules, not web rules.** Fragment only (no `<html>`/`<head>`/`<style>`), inline styles only because mail clients strip stylesheets, no images, nothing over 600px — it is read on a phone. Palette is the site's: ink `#1b2438`, muted `#6b7280`, blue `#2d4880`.
  - **The fragment goes out on a failed or empty run too**, with the failure written into Notes. The run you most need to open is the one that went wrong, and an email with no link is a dead end.
- **Five candidates every run, and a `confidence` score is what makes that safe** (2026-08-07). The bot used to be told a short honest run beat a padded one and to file four or three when five would not clear the bar. It now files **five**, bending every editorial rule — the 7-day window, the topic mix, one-source-per-story — before it bends the count, and declares the stretch by scoring each pick **1-100** into `socials.confidence` ([2026080701_socials_confidence.sql](mc/supabase/migrations/2026080701_socials_confidence.sql)). 80+ post it without thinking, 20-39 filed to reach five with a rule bent. **Null is not zero** — every row before that date, and every hand-added candidate, is unscored, and the card renders nothing rather than a 0. The one rule that still outranks the count is the avoid list: file four rather than post something off-brand. The score prints as `72%` in a bubble at the head of the card's kicker, red under 40.
- **The bot's gift query must NOT filter on `gift_shop_listings.live`.** It did until 2026-08-13, and that one filter cut the pickable catalogue from **611 gifts to 79**. `live` is a real column on the listing, but **the public shop never reads it** — [gifts/index.html](gifts/index.html) fetches `gift_shop_listings` with `archived: 'eq.false'` and nothing else, then decides an item is showable from the item's own `archived` / `certified_at`. So `live` is not what a buyer sees, and a bot filtering on it was picking from a thirteenth of the shelf. The item-side filters are the load-bearing ones and stay. If `live` ever acquires a meaning, give it one in the shop first; until then treat it as vestigial.
- **`socials.origin` RECORDS HOW A CANDIDATE ARRIVED**: `bot` | `prompt` | `manual` ([2026081902_socials_origin.sql](mc/supabase/migrations/2026081902_socials_origin.sql), **apply by hand**). Three writers reach this table and **they are not the same thing to read**: the bot follows a prompt we control and can fix, a PROMPT row followed that same text through somebody else's chat session, and a MANUAL row is a person's own note answering to nobody. Judging all three by one standard is what the column exists to stop. It shows on the kicker after the found-date, quiet, with the distinction on its tooltip.
  - **THE DEFAULT IS `prompt`, and that is deliberate.** Of the three writers the pasted SQL is the only one hand-assembled and so the only one that can forget the column; the RPC hardcodes `bot` and the page sends `manual`. The default catches exactly the writer that needs catching. **The PROMPT text names it anyway**, so the default is a backstop rather than the mechanism.
  - **THERE IS NO `origin` PARAMETER ON THE RPC AND THERE MUST NOT BE**, for the same reason `status` has none: the constant is what makes the function safe to expose to `anon`, and a caller that could name its own origin could label itself anything.
  - **THE BACKFILL IS A GUESS AND SAYS SO.** `manual-` ids are exact. **Bot and prompt rows are indistinguishable historically**, because the PROMPT text tells the chat AI to use the same `<YYYY-MM-DD>-<HHMM>-<n>` id shape the routine uses — so everything date-stamped was set to `bot`, and a prompt-pasted row from before 2026-08-19 reads as bot. Everything from now on is recorded rather than inferred.
  - **A COPY FROM THE POSTED TAB CARRIES THE ORIGINAL'S ORIGIN**, not `manual`. The column answers where the *candidate* came from, not who pressed the button: a repost of something the bot found is still a thing the bot found.
  - **The chip is not drawn when the id label already says it.** A `manual-` row's label is `Manual`, so the chip beside it said Manual twice.
- **THE SCORE IS ALWAYS SHOWN AND IS THE ONE FIELD ON THE CARD THAT IS NOT EDITABLE.** An unscored candidate reads **`unscored`** in a quieter grey rather than rendering nothing: the absence of a number and the absence of the whole feature look identical, and that is exactly how the dropped column below went unnoticed for five days. It stays read-only because it is the bot's own answer to "how sure am I about this pick" - a human typing over it does not correct the number, it destroys the only thing it measured.
- **`confidence` STOPPED BEING WRITTEN ON 2026-08-13 AND NOBODY NOTICED FOR FIVE DAYS.** [2026080701](mc/supabase/migrations/2026080701_socials_confidence.sql) added the column and taught the pull RPC to carry it; [2026081302](mc/supabase/migrations/2026081302_socials_pull_row_results.sql) rewrote that same function to add the `results` reply and **rebuilt the INSERT column list without it** - the word does not appear in that file once. `create or replace` means the later definition won, so every candidate filed since arrived unscored and the Socializer drew no percentage on any of them. Restored by [2026081808](mc/supabase/migrations/2026081808_socials_pull_restore_confidence.sql), **apply by hand**.
  - **Nothing errored and nothing looked wrong**, which is why it survived. The bot kept ranking its picks in the prose of `why` ("Strongest of the four"), so the cards still read as though they had been judged.
  - **THE LESSON: a `create or replace` rewrites the WHOLE function.** A column another migration taught it about is not inherited, it has to be carried forward by hand, and Postgres will not tell you it was dropped. Check the INSERT column list against the table before replacing one of these.
- **The pull RPC reports the fate of each row, and there is a narrow reader for what has already been filed** ([2026081302_socials_pull_row_results.sql](mc/supabase/migrations/2026081302_socials_pull_row_results.sql)). Two holes in what the bot could know about its own work, both closed without widening access.
  - **`tgb_pull_socials_candidates` now also returns `results`** — one `{id, url, outcome}` per row sent, `outcome` ∈ `inserted` | `duplicate` | `invalid`. It always knew: the loop takes three distinct branches and then threw the answer away, returning two counters. `inserted` and `skipped` are unchanged and still returned, so nothing that reads them broke. **This reveals nothing** — it is the fate of rows the caller itself just sent. `invalid` matters separately: a row missing a blurb used to read as a duplicate story, sending the run off to find a replacement it did not need.
  - **`tgb_socials_filed_urls(days)`** returns story urls already filed, default 90 days, clamped to 1–365. **url and timestamp ONLY** — no headline, no caption, no `why`, and deliberately **no `status`**: "we considered this and skipped it" is an editorial judgement, and anything this returns is effectively public through the publishable key. Gift urls are excluded, since they may repeat and have their own reader. `STABLE`, so a GET works.
- **`socials_url_idx` IS NO LONGER UNIQUE, AND THE STORY DEDUPE LIVES IN THE RPC** ([2026081901_socials_allow_reposts.sql](mc/supabase/migrations/2026081901_socials_allow_reposts.sql), **apply by hand**). The index's job was always to stop TGB SOCIALIZER BOT filing a story it has already filed, since a run that rediscovers last week's article has wasted a pick. **That job stays; what was wrong was where it was enforced.** An index cannot tell the routine finding the same url twice, which is a mistake, from a person deciding on purpose to run a post again, which is not — so "Copy to Review" on a posted candidate was refused with a raw 23505 for everything except a gift, and the only explanation available was a statement about our schema.
  - **`tgb_pull_socials_candidates` now does the check itself**, with the same two exemptions the index carried: our own `/gifts/?item=` urls repeat by design, and a blank url is a note rather than a destination. **The reply is unchanged** — a url already present still comes back `duplicate`, and `inserted`/`skipped` count the same — so the routine's step 7 needed no edit.
  - **`on conflict (id)` is kept**, narrowed from the old bare `on conflict`: it still has to guard the primary key against two runs in one second or a retry of a call that already landed.
  - **What is given up, plainly:** nothing now stops a duplicate story url arriving by a path that does not go through the RPC. Today there is none — writes are `authenticated`, and the two writers are this function and the admin page. **A third writer inherits the responsibility.** The page's own MANUAL ADD warning was always a courtesy rather than the enforcement and is unaffected.
- **Slot one of every run is a GIFT from our own shop, and GIFTS ARE ALLOWED TO REPEAT — stories are not.** That asymmetry is the whole reason [2026081301_socials_gift_reposts.sql](mc/supabase/migrations/2026081301_socials_gift_reposts.sql) exists. `socials_url_idx` used to be a unique index on `lower(url)` covering every row, which is exactly right for a news story and fatal for a gift: a gift's url is `https://thegamebureau.com/gifts/?item=<id>` and never changes, so **once an item had been filed it could never be filed again, ever**. With 87 live listings and two runs a day the gift slot was guaranteed to die, and it had already started — on 2026-08-13 the bot burned three picks to duplicates before one landed. **The index is now PARTIAL and skips `/gifts/?item=` urls.** Don't put it back.
  - **The bot could not see it happening, which is why it went unnoticed.** `tgb_pull_socials_candidates` returns `{inserted, skipped}` for the whole batch and never says *which* row was skipped, and `public.socials` is admin-read only — so a run whose gift died reports `inserted: 4, skipped: 1` and reads like an ordinary duplicate story. **The gift therefore goes in its OWN call, before the four stories**, and the run checks `inserted` on that call alone; a batch of five hides the answer.
  - **`tgb_socials_used_gift_urls()` is the other half.** "May repeat" without it becomes "posts the same hat every night", so the routine reads this to pick the **least-recently-filed** gift. `SECURITY DEFINER`, no parameters, and it returns only our own public shop urls plus counts and timestamps — **never headline, caption, `why` or status**, which are the reason the table is admin-read only in the first place. It is `STABLE`, so PostgREST answers a **GET** as well as a POST — that is deliberate, so a chat AI following the PROMPT button (no key, cannot POST) can read it too.
- **THE PAGE PROMPT CARRIES AN IMAGE-CAPTURE FALLBACK THE ROUTINE DOES NOT NEED** (2026-08-19), because `image` was arriving empty from some chat AIs and not others. **Grok was the reported case and the cause is capability, not the rules**: the prompt asks for the `og:image` meta tag *in the page head*, and a browsing tool that hands back a cleaned, summarised article has stripped the head before the model ever sees it. It cannot comply, so it takes the exit the next line offers.
  - **That exit was too easy.** *"If there is no usable image, leave it out… do not hold up a good story over it"* is right for a page with no share image and wrong as the first resort. The prompt now has a ladder — **ask the tool for the page SOURCE explicitly, then take the article's own lead photograph** (almost always the same file), then give up — and states the stake, which is that Instagram's API refuses a text-only post, so a missing image is **one of three accounts going dark on that story** rather than a cosmetic gap.
  - **AND IT MUST BE REPORTED.** Every candidate filed without an image is named in the closing summary with one of two reasons: *no og:image on the page* or *could not read the page metadata*. **Those are different problems with different fixes and only the model can tell them apart**, and until now both looked identical from here — a silently empty column. The closing-summary spec asks for it too, so it is not optional.
  - **Page prompt only.** The routine fetches real HTML and has never had this problem; this is one of the deliberate differences between the two, like the write path.
  - **THE DURABLE FIX IS SERVER-SIDE AND IS NOW BUILT**: [scrape-og-image](mc/supabase/functions/scrape-og-image/index.ts). See below.
- **The PROMPT button and the routine are two different prompts on purpose, and the difference is the write path.** The routine holds the publishable key and inserts through `tgb_pull_socials_candidates` unattended. The PROMPT button is for pasting into *another* AI — ChatGPT, Gemini, whatever is open — which has no key and no session, so its deliverable is **one `insert into public.socials` statement in a ```sql block** that a human runs in the Supabase SQL editor. **Do not "fix" the page prompt to call the RPC** (attempted 2026-08-07 and reverted): a chat AI cannot make the call, and the SQL is the whole point of that button. Editorial rules — the beat, the mix, the caption voice, the confidence bands — have to be kept in step across both by hand; only the last step differs.
- **EVERY GIFT CAPTION NAMES A PLACE** (2026-08-19), in words, in the caption itself. Not optional: we sell games in cities, the shop is organised by city, and **a gift with no place attached is a product post** — with the place in it, it is a postcard from somewhere. The bot already has the value, since its shop query selects `gift_shop_listings.city`, so it never has to guess; the prompt now flags that column at the query as well as at the blurb bullet.
  - **HOW MUCH PLACE: THE CITY AND ITS STATE, PLUS THE COUNTRY ONLY OUTSIDE THE US** (2026-08-19). Never the country of a US city — nobody needs telling Tulsa is in America, and saying so makes the caption read as translated.
  - **`gift_shop_listings.city` ALREADY CARRIES BOTH HALVES**, so nothing is guessed and nothing is looked up. It is the canonical `"City, StateOrCountry"` string and never anything else: *Tulsa, Oklahoma*, *London, United Kingdom*, *Melbourne, Australia*. **46 of the 123 cities in the live catalogue are non-US**, so this is not an edge case.
  - **BOTH HALVES IN THE SENTENCE, NOT THE CATALOGUE STRING PASTED IN.** *Tulsa, Oklahoma* reads as an address label rather than something a person said, so the prompt gives four patterns that work — possessive (*Oklahoma's second city*), adjectival (*a Texas barbecue map*), as setting (*a lot of Oklahoma to hold*), and aside (*Portland, the Maine one*) — with worked yes/no pairs including the label form as a **no**.
  - **A gift about more than one city drops the city rather than picking one at random.** A guide to Texas barbecue is a *Texas* book, and calling it an Austin book is a small lie about what somebody is buying. Same for a river, a coast, a mountain range or a highway.
  - **If the object evokes a different place from its listing, the caption says the one it EVOKES.** A book about the Mississippi shelved under Memphis is a Mississippi book; a scarf listed in three cities belongs to the club's own city. The listing records where we shelved it, which is usually the same thing and occasionally is not.
  - **A gift it cannot place AT ALL, not even to a state, is a gift it should not pick** — there are hundreds with a place, and a placeless one is the weakest post in the run anyway. The scoring guidance lists "no place you could honestly attach to it" among the things that move a gift's confidence down, and the email's Notes now name which place the gift's caption used.
- **THE CAPTION ENDS ON SOMETHING TO DO, WHERE THE STORY SUPPORTS ONE** (2026-08-19). We make games about going somewhere and standing in it, so most of this beat carries a real action: walk the route, enter the contest, go and see it before the scaffolding returns. Said plainly in the last clause, the caption stops being an observation and becomes an invitation.
  - **THE CAPTION, NOT THE HEADLINE**, and the distinction is load-bearing. `headline` is the outlet's own scraped line, and on a link post the platform renders the **destination's** `og:title` anyway, so a call to action written there would change nothing but our own card. **The caption is the only text a candidate carries that is ever published.** The prompts now say so at the top of step 4.
  - **"WHERE THE STORY SUPPORTS ONE" IS HALF THE RULE.** A story about something that happened, somewhere nobody can go, has no action in it, and bolting one on produces exactly the marketing voice these prompts exist to avoid. The bot is told a caption that ends by saying the interesting thing is finished, and never to invent a deadline, a route or an opening it did not read.
  - **The gift slot is where this is easiest to get wrong**, so it is called out there too: point at what you would DO with the object, never at the transaction. *"Walk the grid, then drink out of it"* is an invitation; *"get yours today"* is an advert. The existing ban on **buy / shop now / available now / a price** stands.
  - Added to the page's PROMPT and the routine's stored prompt in the same pass, plus the gift bullet in both.
- **NO EM DASH, in the prompt or in anything it hands back** (2026-08-15). The prompt carried 45 of them and now carries none, and it says so about itself: *"This prompt does not use one either, deliberately: if the instructions were littered with them you would copy the habit."* The ban covers the caption, the headline, the `why`, the closing summary and the step-7 email, because all of those go out under our name on our own accounts and an em dash is the clearest single tell that a machine wrote the line. Rewrites used a comma, colon, semicolon, full stop or brackets, whichever the sentence wanted; **don't reintroduce one while editing this text**, and check any new clause you add. **The routine's stored prompt at claude.ai carries its own copy of these rules and has NOT been swept** — it is the same by-hand sync the editorial rules already need.
  - The prompt lives in a `<textarea>`, which is RCDATA: `<div>` survives as literal text, but `&` must be written `&amp;` or a raw `&middot;` in the email template is entity-decoded and whoever copies it gets a real `·`.
- **ONE CANDIDATE HAS ITS OWN URL** (2026-08-15): `https://thegamebureau.com/mc/socializer/#edit=<id>` opens the Socializer and **scrolls to that candidate's card and flashes it**. It opened the candidate's Edit dialog until **2026-08-19, when that dialog was deleted** (see below); the hash and its name are unchanged, because TGB SOCIALIZER BOT has mailed links in that shape twice a day since August and every one of them still has to land. It exists for TGB SOCIALIZER BOT's email, which mails five candidates twice a day; a link to the queue alone made you hunt for the row you had just read about on a phone. Same `replaceState` reasoning as `#manual` (assigning `location.hash` pushes a history entry per open and close), and the hash is **cleared on every way out** or a reload would reopen a dialog you had closed. It is resolved **after** `loadQueue()` resolves, not beside it like `#manual`, because the id has to match rows that are actually in memory; an id that matches nothing says "no candidate <id>" in the red pen rather than doing nothing. Opening the dialog from the page stamps the hash too, so the link in the email and the link you copy off the page are the same string.
- **THE EDIT BUTTON AND ITS DIALOG ARE DELETED** (2026-08-19), along with `EDIT_FIELDS`, `makeEditBtn`, `openEditDialog`, `closeEditDialog` and `submitEdit`. Every field the dialog reached is now either editable on the card or deliberately read-only, so it was a form for changing the things that had just been decided should not be changed.
  - **THE COST, stated plainly: `url`, `headline`, `source`, `published` and `topics` are now editable NOWHERE in this page.** A genuinely bad capture (a headline scraped as "403 Forbidden", a url pointing at the wrong story) is repaired with SQL, or by skipping the candidate and letting the bot find it again. That is the accepted trade, not an oversight.
  - **`#edit=<id>` STILL WORKS AND MUST.** TGB SOCIALIZER BOT mails five of those links twice a day, one per candidate, so somebody reading the email on a phone can tap the third story and land on it. `focusPostFromHash` scrolls to the card and rings it for 2.4s instead of opening a form, and `article.dataset.postId` is the only thing standing between that email and a dead link. **An unknown id still says "no candidate <id>"** rather than doing nothing.
  - **The image lightbox went with the dialog** - it was opened from the dialog's thumbnail and had no other caller. The card shows the picture full width anyway.
- **NOTHING IS EDITABLE ON A DECIDED CANDIDATE** (2026-08-19). A **posted** row is a RECEIPT: its caption is the text that actually went out, and retyping it makes the record disagree with the post. A **skipped** row is a decision already taken, so editing it is work spent on something nobody will publish. Both say so on hover, and both offer the same way back: **Move to Review**.
  - **THE PICTURE'S `EDIT` BADGE IS NOT DRAWN ON A DECIDED CARD**, and neither is the pointer or the tooltip: the dialog refuses a posted or skipped row, so all three were advertising a door that does not open. **The empty frame reads `no image` rather than `add image`** there, for the same reason. **`OPEN` is untouched** — reading the story is not editing it, and a posted card is the one you most want to follow through to.
  - **THE GATE IS INSIDE `makeEditable`, NOT AT ITS CALL SITES.** Put it at the callers and the fifth field somebody adds is editable in the Posted tab and nobody notices for a month. The field still renders exactly as it does in Review, minus the affordance, because `makeStatic` keeps the look and adds the title. **`openImageDialog` repeats the check** — the picture and its dialog are the one write path on a card that does not go through `makeEditable`.
- **A SKIPPED CARD HAS A DELETE BUTTON, AND NOTHING ELSE DOES** (2026-08-21). It is the one control on this page that destroys a record, so it is offered only where a decision has already been taken against the candidate: **not in Review**, where the row is still a live question, and **not on a posted card**, whose `posted_platforms` is the only record of where the thing went.
  - **THE CONFIRMATION NAMES THE CONSEQUENCE NOBODY EXPECTS.** That the row goes is obvious. That **the story stops being remembered** is not: `tgb_socials_filed_urls` reads this table and the pull RPC checks it, so deleting a row **frees TGB SOCIALIZER BOT to find and file that story again**. Leaving it skipped keeps the tombstone. That difference is the whole reason skipping is normally the right answer for "we do not want this", and it is invisible from the buttons.
  - **`return=representation` IS NOT DECORATION ON THE DELETE.** PostgREST answers **200 with an empty array** when RLS refuses a write, so without reading the row back a refused delete reports success and the card vanishes until a reload brings it back. Verified: a `[]` reply is reported as refused, not as done.
  - **Destructive hard left, with `margin-right: auto` pushing the rest right**, the same arrangement as the waypoint editor's foot and for the same reason: the irreversible button belongs as far as the row goes from the one you actually came to press.
- **THE POSTED CARD'S BUTTON READS `MOVE/COPY TO REVIEW` AND ASKS WHICH** (2026-08-19), because it was serving two situations with one answer. **The face names both**, since a control that opens a choice should say what the choice is; it kept the old `Move to Review` face for an hour after it started asking, which made the dialog a surprise. **The SKIPPED card keeps plain `Move to Review`** — a skipped candidate was never posted, so copying it would only produce two identical undecided rows.
  - **MOVE**: it never really went out, so the receipt is a mistake. It goes, and the row returns to the queue. One row throughout.
  - **COPY**: it *was* posted and we want to post it again. The receipt is true and must survive, so a second row is filed and the posted one is untouched.
  - **COPY WORKS ON ANYTHING.** It was gifts-only for about an hour on 2026-08-19, because `socials_url_idx` was UNIQUE on `lower(url)`; see the note below.
  - `askConfirm` grew an optional **third** answer for this (`opts.altLabel`, resolving the string `'alt'` rather than a boolean, so a two-way caller cannot mistake it for yes). **Dismissing still means cancel** — Escape and the backdrop must never perform one of the actions.
  - The copy takes a **fresh id in the routine's own shape** (`stampedCandidateId()`), so it sorts, labels and deep-links like every other row.
- **THE CARD EDITS WHAT IS OURS AND SHOWS WHAT IS THEIRS** (2026-08-19). Three fields are editable in place and eight are not, and the line is deliberate.
  - **EDITABLE: caption, image, reasoning.** Three, and the rule is **what we WROTE, not what we FOUND.** The caption is the copy that gets published and the reasoning is the internal note; **the image is the one exception, admitted on grounds of use rather than authorship** - it is the field you cannot check by reading, it fails quietly, and it is the difference between reaching two accounts and three, since Instagram's API refuses a text-only post. **It is edited in a DIALOG rather than in place** (2026-08-19); see below.
  - **READ-ONLY: the url, and only the url.** Changing it does not fix a story, it makes the row a **different** story while keeping the caption, the score and the note somebody wrote about the first one. Topics are read-only in the sense that they are not drawn as a field at all (they are the kicker pills).
  - **SOURCE AND DATE ARE EDITABLE; THE HEADLINE IS NOT.** All three were made editable on 2026-08-19 on the argument that **the bot SCRAPES them**, and a scrape fails in ways only a human reading the card can see — a paywall interstitial, a 403 page, a site tagline picked up in place of a headline. That argument held for the two small fields and lost for the headline the same day: **a headline is the OUTLET'S line**, and a box you can type in invites rewriting it into something we would rather it said. A genuinely broken capture is repaired in SQL, or the candidate is skipped and the bot finds it again, which is the bargain the url already makes.
  - **The card therefore stays a `<div>` with its own OPEN control**, because source and published are still editable. Only when **nothing** in the link bar is editable may it go back to being an anchor, and the OPEN control has to go in that same commit if it does.
  - **Making them read-only is what let the card go back to being one link**; see the note below. The Edit dialog still changes every one of them, which is the escape hatch for a genuinely bad capture. The card is for the pass you make before posting; the dialog is for repairing a row.
  - **READ-ONLY, the bot's own judgement: confidence.**
  - **A read-only field keeps its look and loses the affordance**: same element, same placeholder when empty, no pointer, no hover hint, and a `title` saying WHY. **A field that quietly ignores a click is indistinguishable from one that is broken**, which is the whole reason `makeStatic` sets that title.
- **EVERY FIELD ON A CARD IS EDITABLE IN PLACE, AND THE CARD STILL LOOKS LIKE A POST** (2026-08-18, narrowed the next day; see above). Click the caption, the headline, the domain, the source line or any cell in the new fields strip and it becomes a box holding that value; Enter saves, Escape cancels, Ctrl+Enter saves a caption. **The only standing hint is a dotted underline on hover**, so a card at rest still reads as a post rather than as a form. The Edit dialog stays and is unchanged: this is for the one-word fix that a modal, a form and a Save was too much for.
  - **It writes what the dialog writes.** Same `savePost`, same `normalizeManualUrl` on `url` and `image`, same "a headline is the one thing a candidate cannot be without" rule. **Two ideas of what a valid candidate is would be two ways to end up with a broken one.**
  - **THE BOX LIVES INSIDE THE ELEMENT, SO ITS KEYSTROKES BUBBLE UP TO IT.** The span carries an Enter/Space handler so it can be opened from the keyboard, and without a guard that handler caught Enter and **SPACE** on the way out of the open box and `preventDefault`ed them: **typing a space into any of these fields did nothing**, and "The Local Herald" could only be entered as "TheLocalHerald". The handler now returns early while `editing` is set and when the event did not originate on the element itself. **Neither condition is redundant** and this is the trap to remember when adding another editable field.
  - **The REASONING note is editable too** (2026-08-18), which closes the last gap between the card and the Edit dialog: `why` was the only field the dialog could change and the card could not. **The line is always drawn now** - it used to be skipped when it would have been empty, which was right while it was read-only and wrong the moment it became editable, since a candidate with no note had nowhere to type one.
    - **Only the NOTE is the editable span.** The score, the label and the topic sentence sit beside it and would otherwise be swallowed by the box when it opens. **Topics stay plain text here**: that sentence is built FROM the array, so a box holding "Cities. Walking." would have to be parsed back into one, and the fields strip edits the real column.
    - The box takes `font-style: normal`: the line is italic, which is right for a quoted aside and wrong for something you are typing into.
  - **It RE-RENDERS after a save rather than patching the node**, because the stored value can come back changed: a url gains its scheme, topics are lowercased. A card showing what you typed while the row holds something else is a disagreement nobody notices until later.
- **THE FIELDS STRIP IS DELETED** (2026-08-19), along with `CARD_FIELDS` and `buildFieldsRow`. It carried four columns the post itself had no room for, and they left one at a time for the same reason each time: something else on the card already said it, better.

  | left | because |
  |---|---|
  | topics | the pills at the right of the kicker |
  | media | nothing read it, and it was `photo` on nearly every row |
  | platforms | the Post button names the real destinations |
  | image url | the picture itself, which is always drawn now and opens the image dialog |

- **THE IMAGE SLOT IS ALWAYS DRAWN, AND THAT IS WHAT LET THE IMAGE URL ROW GO.** That row was the only way to reach the image dialog on a candidate with no photo to click, so deleting it without this would have made an unillustrated candidate one you could **never** illustrate. A missing picture is a dashed frame reading **ADD IMAGE** that opens the dialog, which is the better answer anyway: the absence is drawn where the thing itself would be.
  - **A hotlinked image that 403s or rots now KEEPS ITS FRAME** and turns red reading **IMAGE FAILED**, where it used to tear the figure out of the card entirely. An address that is there and does not resolve is the case most worth acting on, and it needs somewhere to be pressed. Empty and broken are the same frame in different pens.
  - The `EDIT` badge is hidden on the empty slot, which already says what it is for across the middle of itself. **Source and published are NOT among them** - they already sit on the preview card, where a link preview naturally shows them, and having them in both places showed every candidate its outlet and its date twice. **It is always drawn, even when every cell is empty** - each blank shows a placeholder and stays clickable. Without it an empty `source` was invisible AND unreachable, which is how a field quietly stops existing.
- **THE PREVIEW CARD IS ONE BIG `<a>` AGAIN** (2026-08-19), which it stopped being for a day. It had to become a `<div>` the moment its text was editable, because a click could not mean both edit and open, and the destination moved to an `OPEN ↗` control on the domain row. **Once the url, headline, source and published all went read-only there was nothing inside it left to edit**, so the anchor came back and the OPEN control went. **The picture is the one exception and stops its own click** with `preventDefault` AND `stopPropagation`: the first keeps the anchor from navigating, the second keeps the click from reaching anything above it.
- **THE `SOURCE · DATE` LINE IS TWO SPANS, NOT ONE STRING.** Joined into a single line it is right to read and impossible to edit, because a click cannot know whether you meant the outlet or the date. Each half is its own editable field with the separator between them, and the line is drawn even when both are empty so a candidate with neither has somewhere to put them.
- **CLICKING THE PHOTO OPENS THE IMAGE URL FIELD.** An image url is the one field you cannot check by reading it, so the thing you are looking at is the right place to fix it: og:image scraping fails quietly, and a masthead, a tracking pixel and a 404 all look like a fine URL in a text box.
- **The Edit dialog's Image URL field carries a thumbnail**, left of the box, click for full size. An image URL is the one field on that form you cannot check by reading: og:image scraping fails quietly, and a masthead, a tracking pixel and a 404 all look like a good URL in a text box. **Empty and broken are drawn differently on purpose** — empty is the ordinary state of an optional field, broken means the address is there and the picture is not, which is the case worth acting on, since a candidate with no working image cannot reach Instagram at all. The lightbox is deliberately **not** a `.tool-modal-panel`: it is a photograph, so black ground and no chrome, and it takes Escape *before* the dialog under it so putting a picture away never dismisses a half-filled form.
- **THE CONFIDENCE SCORE IS A BUBBLE AT THE HEAD OF THE KICKER** (2026-08-19), ahead of the found-date, set larger than the line it sits on. It used to sit small in front of the REASONING label, which put the one number on the card you cannot work out by reading it inside the sentence it is least like: everything else on that line is prose and this is a measurement. **Its tooltip opens with the words CONFIDENCE SCORE**, because the bubble shows a bare percentage and *a percentage of what* is a fair question. Under 40 it takes the red pen, border and all. `unscored` renders smaller and quieter — it is the absence of a judgement, not a low one.
  - **The kicker uses `margin-right: auto` on `.post-kicker-id`, NOT `justify-content: space-between` on the row.** With space-between, a candidate carrying no topics had nothing on the right, so the found-date itself was flung to the far edge, away from the bubble it belongs beside. The gap has to be owned by the element before it rather than distributed between whatever happens to be present.
- **THE KICKER READS `FOUND WED, AUG 19 #3`, WITH THE TOPIC PILLS OPPOSITE IT** (2026-08-19). The weekday earns its four characters: a bare date makes you count back to work out whether a candidate is from this morning's run or last Thursday's, which is the first thing you want to know about one. **FOUND, because that is what the date is** — when the bot filed it, not when the story was published, which is on the preview card below. `candidateLabel` derives it from the id, so a hand-added row still reads `Manual`.
  - **The topics are pills on the far right of that line**, not words inside the reasoning sentence. As `Travel. History.` they sat between the REASONING label and the note, so the one line had to be read past them to reach the thing it is for, and they are not reasoning — they are tags. Opposite the found-date they line up down a column of cards, which is the one thing a tag is good for. They are pushed over by `margin-right: auto` on the found-date; see the bullet above for why not `space-between`. **`topicSentence()` was deleted with its only caller.**
- **THE PLATFORM TAGS NOW DECIDE WHERE A POST GOES** (2026-08-19), reversing the advice-not-routing rule this file had carried since 2026-08-09. `postTargets()` intersects what it *can* post to with the accounts the bot *named*. The reversal follows from deleting the Platforms cell the same day: a tag that is neither obeyed nor shown is not a tag.
  - **NO ADVICE MEANS NO NARROWING.** A row whose `platforms` is empty, absent or unrecognisable posts everywhere it can. Every row filed before this, and every candidate added by hand through MANUAL, is in exactly that state, and reading silence as "post nowhere" would have made all of them unpostable at a stroke. `suggestedKeys()` returns **null** for all three cases deliberately.
  - **THE COST, and it is real:** a candidate the bot tagged badly can no longer reach an account it was capable of reaching, and under-tagging is silent. **Both prompts were changed in the same pass** to say the tag decides, because a model told its answer is advice writes a looser answer. The routine's prompt also warns that the `name` string must be exactly `Facebook` / `Instagram` / `Threads`, since the admin matches on it.
  - **The tooltip names every account that was dropped and which of the two rules dropped it.** Without that, *Post to Facebook* on a candidate with a perfectly good photograph is indistinguishable from a broken Instagram credential. `postBlockedReason()` covers the fully-blocked case, which is new: a bot naming only Instagram on an imageless story leaves nothing postable, and the button greys out saying so.
- **THE IMAGE IS EDITED IN A DIALOG, WITH THE PICTURE IN IT** (2026-08-19). Clicking the photo opens it, and so does the `IMAGE URL` cell, which is the only way in when there is no photo to click; **an `EDIT` badge sits at the photo's upper right** because a photograph does not look clickable on its own. It is deliberately **not** inline-editable any more: two editors for one column is two things to keep in step, and the inline one could not show you the picture, which is the entire reason this field is hard. **Empty and broken are drawn differently** — empty is the ordinary state of an optional field; an address that is there and does not resolve is the case worth acting on. The preview repaints as you type, so a pasted url is judged before it is saved, and a failed save is reported **inside** the dialog, where you are looking.
  - **`buildFieldsRow` takes the stable id now.** It was reaching for `buildPost`'s local `id` and threw *id is not defined* the moment anybody clicked that cell.
- **NOTHING ON A CARD IS SMALLER THAN THE `TGB SAYS:` LABEL** (2026-08-19), which is **0.72rem**, and that is the floor. The mono labels sat at 0.62rem with the topic pills at 0.58 and the photo's EDIT badge at 0.55 — under 9px at a default root, legible in a screenshot and a squint on a laptop. **A label being quiet is a matter of weight, colour and letter-spacing**, all of which these still have; it was never a reason to set it too small to read. **Start any new label here at 0.72rem.**
- **THE MOCKUP IS 80% WIDE AND CENTRED** (2026-08-19). It is a mockup of a post, not a panel of ours; at full width it read as another band of the page, and inset on both sides it reads as a quoted object. **The width is also the only lever on how much of the list one photograph takes up**: the picture is full-bleed inside the card, so the card's width *is* the picture's width, and at 1.91:1 every centimetre off the width takes half a centimetre off the height too.
- **THE REASONING BAND IS WHITE**, not the kicker's tint. It took that tint so the two would read as one header, which put three stacked grounds above the first sentence of the post. The rule under it is enough.
- **`platforms` IS GONE FROM THE CARD TOO** (2026-08-19), and the reason is the **POST BUTTON**. `postTargets()` builds *Post to Facebook + Instagram + Threads* and drops Instagram when the candidate has no image, so the button states the **real** destinations; the cell beside it stated the bot's **suggestion**, which nothing acts on. Two answers to "where does this go", one of them true. **The column is retired in place** like `media`, and the bot still writes it — the tags are cheap to produce and might yet be wanted; they simply are not drawn.
- **`media` IS GONE FROM THE CARD AND FROM BOTH PROMPTS** (2026-08-19). It held `photo` / `gallery` / `video` / `text` and had **three** things wrong with it at once. It was **inert**: nothing in the page referenced it and `postTargets()` decides Instagram from `image` alone, so it routed nothing. It was **near-constant**: the bot writes `photo` whenever it found an `og:image`, which nearly every article has. And its one interesting value, `text`, means only that the image capture failed — which the `IMAGE URL` cell beside it already reported, so it was **duplicated** as well. A cell that is inert, near-constant and redundant is three reasons to stop drawing it.
  - **THE COLUMN IS RETIRED IN PLACE, NOT DROPPED**, the way `waypoints.tour_id` and the two soundtrack timestamps were. Nothing reads it, dropping is the one irreversible move, and an unread column costs nothing. The routine's prompt says in as many words not to send it, so new rows arrive with it null.
  - Removed from the page's PROMPT (the step-3 capture line, the gift bullet, the SQL column list, the worked example and the rules list), from the `tgb-agent-context` JSON block, and from the routine's stored prompt in the same pass.
- **THE CARD IS A `<div>`, AND `OPEN ↗` IS THE ONLY THING THAT NAVIGATES.** It has swapped between `<div>` and `<a>` three times now, and the rule underneath has never changed: **the card is an anchor only while nothing inside it is editable.** With the headline, source and date editable again, a click cannot mean both *edit this line* and *leave for the story*, so going somewhere became a deliberate act on its own control. **`OPEN` is a BUTTON at the top right of the account row**, where a post keeps its own menu, so it does not read as one more line of the post. **No arrow** — the glyph was there to mark it as leaving the page while it sat inline among the domain text, and a button in the corner already reads as an action.
  - **IT SHARES ONE DECLARATION BLOCK WITH THE PICTURE'S `EDIT` BADGE.** They are the card's only two pressable controls, they sit a couple of inches apart, and drawn to different metrics they read as two different *kinds* of control rather than two of the same. `.post-card-open, .post-card-shot-edit` carry **every** visual property between them, **the 5px corner inset included**. **Restyle one and you restyle both, which is the point.**
  - **BOTH ARE ABSOLUTELY POSITIONED, and that is what makes the inset match.** OPEN sat in the account row's normal flow, so its distance from the card edge was that row's 12px padding while EDIT was 5px off the picture: identical buttons landing at different offsets. OPEN is now positioned against `.post-card` (which gained `position: relative`) and EDIT against `.post-card-shot`, so each measures 5px from the same kind of edge. `.post-card-account` carries a `padding-right` to keep a long account name from running under a control that is out of the flow. **If the link bar ever goes read-only again, the anchor can come back — and the OPEN control must go with it, or the card gets two ways out.**
- **THE MOCKUP IS A POST, NOT A LINK PREVIEW** (2026-08-19), built in the order the platform renders one: **account header, our caption, the picture full width, then the link bar**. It had been a 116px thumbnail on the left with the link text beside it, which is what an unfurled *link* looks like rather than what our post looks like.
  - **The account row is what makes it read as ours**: the paper avatar, `The Game Bureau` in bold, and a meta line under it. That line carries the **candidate's own age**, not an invented posting time — a mockup saying *3 hours ago* about a post that does not exist is decoration, whereas this says how long the thing has sat in the queue. `agoText()` is deliberately coarse for the same reason.
  - **The avatar collapses to the name alone if it 404s.** This is chrome, and chrome must never be the thing that looks wrong on a card.
  - **`TGB SAYS:` AND `.post-captionband` ARE GONE.** The caption moved inside the mockup, where it actually sits when it goes out, and the account row makes the same statement the label did — in bold, the way the platform makes it. **`BOT SAYS:` survives on its own band**, being the one line that never leaves this page, and it stays at the caption's own 1.01rem: set smaller it read as a footnote about the post rather than as the other voice. Its quiet comes from colour and italics.
  - **The caption stops the anchor** with `preventDefault` and `stopPropagation`, exactly as the picture does, because it is editable in place and the card is a link again.
  - **The empty image frame drops the 1.91:1 letterbox** (`aspect-ratio: auto`, `min-height: 96px`). A real picture wants the post's own crop; an *absence* at full width opens a 400px hole in the list.
- **TWO LABELLED SENTENCES: `TGB SAYS:` ON THE CAPTION, `BOT SAYS:` ON THE NOTE** (2026-08-19). They are the only lines on the card either party wrote, and until now nothing said which was which — the caption is **ours** and goes out under our name, the note is **the bot's** and never leaves the page. Labelling one and not the other left the louder of the two unattributed. **The label is a SIBLING of the editable span, never inside it**, or the box opens holding `TGB says: A mile of new boardwalk…` and the label gets saved into the caption.
- **TGB SOCIALIZER BOT WRITES ITS NOTE IN THE FIRST PERSON** (2026-08-19), because the queue labels it `BOT SAYS:` and a note written *about* the story reads as though somebody else wrote it. *"I picked this for the tie to our Denver tape"*, never *"Picked for the tie…"* or *"This story ties to…"*. It is told to name its doubt out loud when it has one — an honest hesitation is worth more to a human than a confident sentence, being the thing they would otherwise have to find out themselves. **The nested `why` inside the `platforms` array is a different field and stays a short fragment.** Changed in both prompts in one pass: the page's PROMPT textarea and the routine's stored prompt (which also prints the note under `Bot says:` in its email, so the mail and the queue agree word for word).
- **THE LABEL ON THAT LINE READS `BOT SAYS:`, NOT `REASONING`** (2026-08-19). The note is TGB SOCIALIZER BOT's own sentence about why it picked the story, so the label names who is talking; *Reasoning* named a category and left you to work out whose, and read a little like an instruction to us. The class stays `.post-why-label` and the column stays `why` — visible copy only, the same bargain the Tape Room made when its verbs were renamed four times without the column moving.
- **THE `BOT SAYS:` BAND SITS DIRECTLY ABOVE THE BUTTONS.** It started under the kicker, on the reasoning that it answers *why is this in front of me* and belongs where that question is still open. **The mockup becoming a real post settled it the other way**: the post is the thing being judged, so it goes first, and the bot's note is the last thing you read before deciding, immediately above the controls that take the decision. Its rule is on top, since the band below it draws its own. It is `article.appendChild`, not `insertBefore`, because the preview is already attached by that point and `.post-ephemera` is appended after it in all three of its branches.
- **BLACK AND BOLD MEANS YOU CAN CHANGE IT** (2026-08-19). Three fields on a card are editable (the caption, the image URL, the reasoning note) and eight are not, so the affordance had to be visible **at rest** rather than on hover: a dotted underline that only appears under the pointer says nothing about the other ten fields you are looking at. Every other value on the card is `--ink` blue at its own weight; an editable one is `#000` at 700. **The rule is `.post .ed`, not `.ed`** — several of the things it lands on set their own colour at the same one-class weight (`.post-field-val` is `var(--ink)`) and come later in the sheet, so a bare `.ed` lost the tie and the image URL stayed blue while the caption went black. The empty-state placeholder stays at weight 400 and stays italic: an absence should not shout.
- **The agent posts nothing and holds no account credentials.** A human clicks **Post** (opens the prefilled composers) or **Skip**. Don't ever wire this to a social API — the human-in-the-loop is the design, not a missing feature.

### scrape-og-image — the share image, read server-side (2026-08-19)

`POST { url }` → `{ image, from, title? }` or `{ image: null, reason }`. The **Fetch from page** button beside the Image URL box in the Socializer's image dialog. **Needs a deploy**: `cd mc && supabase functions deploy scrape-og-image`.

- **WHY IT EXISTS.** `socials.image` decides whether a candidate can reach Instagram at all, and filling it was the AI's job while it had the article open — which worked or did not depending entirely on the AI. A browsing tool that returns the page **source** finds `og:image` in the head in a second; one that returns a cleaned, summarised article has stripped the head before the model sees it. **Grok was the reported case.** A prompt cannot fix a tool's output, so the answer moved to a server, where it is the same for every candidate however it was filed.
- **THE PAGE CANNOT DO IT**, which is the whole reason it is a function: `/mc/socializer/` is static HTML on GitHub Pages and CORS forbids reading another origin's markup.
- **METADATA ONLY, IN ORDER**: `og:image` → `twitter:image` → `<link rel="image_src">`. **It will NOT hunt for the biggest `<img>`** — that is guessing, and a guessed address is worse than an absence, because an absence is visible and a wrong one looks right until a post goes out wearing a tracking pixel. No usable tag returns `{ image: null, reason }`, which is an **answer**, not an error.
- **Attribute order is not fixed in real HTML.** `<meta content="…" property="og:image">` is as legal as the other way round and plenty of CMSes emit it; matching one order is how a scraper "works on every site I tested". Both are matched, and `&amp;` in a query string is decoded — an unescaped one produces a URL that 404s while looking perfectly correct.
- **Relative paths resolve against the page that ANSWERED**, not the one requested, since redirects are followed.
- **A LOGO IS RETURNED WITH A `suspect` NOTE rather than dropped.** It genuinely is the page's `og:image`, and a human looking at the picture can overrule it; a masthead makes five stories look identical, which is the judgement the prompts already ask a model to make.
- **NO PRIVATE HOSTS.** Without the guard this is a server-side request forgery tool: localhost, `127.`, `10.`, `192.168.`, `172.16-31.`, `169.254.` and `.local` / `.internal` are all refused. The admin gate makes abuse unlikely rather than impossible, and unlikely is not the standard for that class of bug.
- Capped at **512KB** and **12s**, stopping at `</head>`; identifies itself honestly in the User-Agent rather than pretending to be Chrome.
- **Auth is the same gate `socials-post` uses**: the caller's own JWT against `is_photo_admin()`. Not because a public meta tag is secret, but because an open URL-fetcher on our project is a thing other people will find.
- **The button fills the box; it does not save.** You look at the picture and then decide, which is why the dialog shows one. It is greyed with an explanatory tooltip on a candidate with no link.

### POST NOW, OR AT A TIME YOU CHOOSE (2026-08-27)

A **Later** button beside the account buttons. [2026082707_socials_scheduling.sql](mc/supabase/migrations/2026082707_socials_scheduling.sql),
**applied**, plus a change to `socials-post` and a **deploy**.

- **DOES THIS BREAK THE HUMAN-IN-THE-LOOP RULE? NO, AND THE DISTINCTION MATTERS.**
  That rule is about the BOT deciding what goes out, and it is untouched: TGB
  SOCIALIZER BOT still files candidates and still cannot post one. What is
  scheduled here is a decision a HUMAN has already taken -- this candidate, to
  these accounts -- and merely deferred. **Nothing chooses; something waits.**
  If that stops being true, check that `scheduled_*` is only ever written by an
  admin in the room and never by a routine.
- **NOW IS STILL THE DEFAULT.** Every account button posts on the press exactly
  as it did. Later is one more control beside them, not a question asked before
  any of them.
- **`pg_cron` EVERY MINUTE, NOT A CLAUDE ROUTINE.** The six routines run twice a
  day at fixed minutes, so a post scheduled for 3:47pm would go out at 3am. The
  cron calls `socials-post` through `pg_net`, and that function already runs as
  the service role, so **the path is identical from the moment it is called**.
- **THE CREDENTIAL PROBLEM, SOLVED WITHOUT A SERVICE KEY.** `socials-post` gates
  on the caller's own JWT and a cron has none; this project has no service-role
  key either. So the function has a SECOND door: a shared secret in
  `x-tgb-scheduler`, which reaches **only** the sweep and cannot post an
  arbitrary payload. The secret is in Vault (for the cron) and in the function's
  secrets (for the check); neither is reachable from the public page.
  - **THE GATEWAY REJECTS A NON-KEY BEARER BEFORE THE FUNCTION RUNS.**
    `Authorization: Bearer scheduler` came back `UNAUTHORIZED_INVALID_JWT_FORMAT`
    from the platform, not from our code. The cron sends the **publishable key**
    -- which is public and authorises nothing here -- and the scheduler secret is
    what actually lets it through.
  - **THE SECRET IS NOT IN THE CRON COMMAND.** `cron.job` is readable by anything
    that can read the catalog, so the command is one function call and the
    function reads Vault.
- **THE CLAIM IS ONE SQL STATEMENT.** `tgb_claim_due_socials` is an
  `update ... where scheduled_state = 'queued' returning`, atomic per row, so
  two overlapping sweeps cannot take the same candidate. **A select-then-update
  would post twice, and a post that goes out twice cannot be taken back.**
- **THE ACCOUNTS ARE FIXED AT SCHEDULING TIME, not re-derived at send time.** A
  candidate that gains an image between now and then must not silently acquire
  Instagram. What a person agreed to send is what goes.
- **A CANDIDATE POSTED OR SKIPPED IN THE MEANTIME IS DROPPED.** Somebody changed
  their mind, and the schedule must not overrule them.
- **A FAILED SEND IS NOT RETRIED.** Every failure here is a credential or a
  refusal, and a sweep retrying every minute turns one bad token into a thousand
  refused requests. It records why and waits for a person.
- **THE SWEEP CALLS NOTHING WHEN NOTHING IS DUE.** A request a minute against an
  empty queue is a request a minute.
- **A TIME IN THE PAST IS REFUSED IN THE FORM.** The sweep would take it on its
  next pass, which is not what "later" means and is indistinguishable from
  pressing the account button.

**PROVED END TO END WITHOUT POSTING ANYTHING.** A probe queued a minute in the
past with an EMPTY platform list: pg_cron took it within seconds, the sweep
claimed it, found no accounts and marked it `failed` with *"no machine account
was recorded when this was scheduled"*. That exercises cron, Vault, pg_net, the
gateway, the scheduler door, the atomic claim and the state transition, and
sends nothing. The deploy itself was proved by a call, per the standing rule:
anon gets `not authorized` rather than `BOOT_ERROR`, a WRONG secret falls
through to the admin gate, and the real one answers `{"sweep":true,"claimed":0}`.

### Posting: three accounts, two credentials, one that expires

**Post** calls the [socials-post](mc/supabase/functions/socials-post/index.ts) Edge Function, which holds every token. The page holds none and never will — it is static HTML in a public repo, so a token in it is a published token. `PLATFORM_AUTOPOST` in [mc/socializer/index.html](mc/socializer/index.html) is only a flag saying whether the function can genuinely post there; flipping one on without its secret turns Post into a button that reports a failure the page could have predicted.

- **Facebook and Instagram are one credential** — a single Page token, `META_PAGE_ACCESS_TOKEN`. Both ids are **derived from the token** rather than stored, because a mistyped numeric id doesn't error, it posts to the wrong place. A whole day was lost to the app and the Page sitting in different **business portfolios**, which no permission can bridge and which reports nothing: the post succeeds, returns a real id, and lands somewhere else. `tgbDiagnosePost()` in the console answers what the token actually points at; run it after any token change.
- **Threads is a separate API, token and id** on `graph.threads.net` — a Page token cannot reach it. Getting the credential is a four-step errand where three steps are invisible: **Threads Tester** is its own app role (not the generic Tester), the invite is **accepted inside the phone app** with nothing in the dashboard prompting you, the account must be **public**, and `THREADS_USER_ID` is displayed nowhere — read it from `GET graph.threads.net/v1.0/me?fields=id,username`.
- **THE THREADS TOKEN EXPIRES AFTER 60 DAYS and nothing else here does.** The Meta credential is a System User token that lasts forever, so no other secret on this project has ever needed renewing. Since an Edge Function cannot write its own secrets, a refreshed token has nowhere to go — which is why **`public.integration_tokens`** exists ([2026080905](mc/supabase/migrations/2026080905_integration_tokens.sql)): RLS on with **no policies**, so only the service role can touch it. `socials-post` seeds the row from `THREADS_ACCESS_TOKEN` on first use, then refreshes on any post within a week of expiry.
  - **Once the row exists the secret is ignored.** Re-running `supabase secrets set THREADS_ACCESS_TOKEN=...` changes nothing; `delete from public.integration_tokens where key = 'threads';` first.
  - **It refreshes on posting, not on a schedule**, so the token still dies if nobody posts for two months. If that ever happens, the fix is a cron — not more code in the function.
  - Threads refuses to refresh a token under **24 hours old**, so a failed refresh is logged and never fatal; the post goes out on the token it has.
- **AMAZON IMAGES ARE 1500px AND META TAKES 1440, so the Edge Function shrinks them on the way out** (2026-08-19). `metaSafeImage()` rewrites Amazon's own `_SL1500_` size token to `_SL1200_` and is applied at all three call sites — Facebook, Instagram and Threads.
  - **It is Amazon-specific because the problem is.** `_SL1500_` is Amazon's CDN token for "scaled longest side 1500" and it is in the filename of **78 of the 109** live Amazon gifts (the other 31 are already UL320, SL1200 and the like). Bookshop, which is 498 of the 616 live gifts, tops out at 1200 and OpenLibrary at 500, so **nothing else in the catalogue is near the line**. The helper is scoped to `m.media-amazon.com`: a width token means nothing on another host, and a blind regex would mangle a url that merely contained those characters.
  - **APPLIED AT THE POINT OF USE, NEVER STORED.** `gift_shop_items.image_url` is the address the shop shows and the one a human pasted; rewriting the column would edit the catalogue to work around one API's limit.
  - **Verified against the live catalogue**, not just in principle: all 78 rewritten urls fetch and come back ≤1200px, including the two composite `_CLa…` overlay urls, and the 31 left alone are all already within the cap.
  - **Threads is where this showed up**, because it is the only one of the three that posts a gift as `media_type=IMAGE` with a url Meta must ingest. If Meta ever raises the cap this becomes harmless rather than wrong: a 1200px product photo is still a good product photo.
- **`posted_platforms` is a receipt and must name the real account.** Its labels come from a lookup with no default, deliberately: it was a `facebook ? … : 'Instagram'` ternary from the two-platform era, which would have filed every Threads post as Instagram the day Threads went live.
- **POST PUTS THE CAPTION ON THE CLIPBOARD TOO (2026-08-21).** Post reaches the accounts a machine can reach; **X and YouTube are posted by hand**, so on a candidate naming one, pressing Post finished two thirds of a job and left you to go and find the caption for the rest. The success dialog now says it is on the clipboard and **names the platform still to do**.
  - **THE COPY HAPPENS INSIDE THE CLICK, BEFORE THE AWAIT, AND THAT IS NOT A PREFERENCE.** `navigator.clipboard.writeText` needs transient user activation, and **activation does not survive a network round trip**: copying after the post resolved would fail on any candidate that took a few seconds to go out, which is most of them.
  - **IT STILL DOES NOT ASK "mark this as posted?"**, and that is the one thing deliberately NOT carried over from the Copy button. The function has just reported which accounts took it, so the status is a **recorded fact**; asking permission to write down something true only creates the chance of a false record. A "No" would leave a candidate in Review that is already live on the Page, indistinguishable from one never posted, and you would find out by posting it twice. **The clipboard adds the NEXT job, not a decision about this one.**
  - **A FAILED COPY IS NEVER CLAIMED AS A SUCCESS.** If the write failed and there is a by-hand target, the dialog names the target and says to copy it off the card; if there is no by-hand target, it says nothing at all rather than reporting a clipboard nobody asked about.
  - **`pasteKeyName()` is one function** now that two dialogs need it: two copies of a platform sniff drift the moment somebody adds a case to one.
- **COPY AND POST READ WHAT IS TRUE NOW, NOT WHAT THE CARD WAS BUILT WITH (2026-08-21).** A card closes over the `post` object it was drawn with, and that object goes stale two different ways, both of which sent yesterday's caption:
  - **`savePost()` REPLACES `posts[i]`** with the row the database returned, so after ANY save the card's `post` is not the saved row, it is an orphan holding the old values.
  - **A typed-but-uncommitted edit is in an `<input>` and in no object at all.** Clicking Copy blurs that box, which starts an async save, and the old code read `post` before that save could land. **You got the previous caption with nothing on screen saying so.**
  - **`liveField(row, id, key)` IS SYNCHRONOUS AND THAT IS THE POINT.** The clipboard write loses its permission if it waits for anything, so Copy cannot `await` a save; it reads the open box directly instead. An open editor beats the saved row, which beats the card's snapshot. **It matches on BOTH id and key**, so a note being edited on one card cannot leak into another card's caption.
  - **POST FLUSHES INSTEAD OF READING**, because it can afford to wait and because the Edge Function reads the row **out of the database**: an uncommitted caption is not merely stale there, it is invisible, and the post would carry whatever the row held before you typed. `flushOpenEdit()` blurs the box and resolves on the save that blur triggers, then `startPost()` runs.
  - **`activeEdit` is cleared on every exit path**, in `restore()` and in `commit()`'s `finally`, or a closed editor would go on answering for a field nobody is editing.
- **SKIP IS THE ONE CONTROL THE POSTING LOCK DOES NOT TAKE, ON EVERY CARD BUT THE ONE BEING POSTED** (2026-08-19). Everything else on the page goes dead while a post is in the air, and for Post itself that is the entire reason the lock exists: a second press on a candidate already in flight sends the story twice and Facebook accepts it without complaint. **Skip carries no such risk**, and it is the button you most want during the wait, because a post takes long enough that the natural thing to do is work down the rest of the queue. A locked Skip made that dead time.
  - **IT RECORDS THE PRESS AND DEFERS THE WRITE.** A PATCH sent now races the post's own `markPosted()` on the same table, and on the posting card it races it for the same row. So the id goes into `deferredSkips`, the button says *Skip queued* in dashed red, and **nothing about the stored row moves** until `setPostingLock(false)` calls `flushDeferredSkips()`. The press is real; only the write waits.
  - **PRESSING A QUEUED SKIP TAKES IT BACK.** Without that the only way out of a misclick is to wait for the post, watch the skip land, and Move to Review from the Skipped tab.
  - **THE INTENTION IS KEYED BY ID, NOT HELD ON THE BUTTON.** `paintSkipButton` draws it from `deferredSkips` on every build, so a card rebuilt by a held render comes back still wearing it.
  - **THE POSTING CARD'S OWN SKIP IS LOCKED WITH ITS POST AND COPY, and that is the exception the whole rule turns on.** Deferring that particular press asks a question the flush can only refuse: the story is going out on that card *right now*, so passing on it is not a decision anybody can still take, and offering the press then declining it afterwards is worse than not offering it. `setPostingLock` takes the acting row as a third argument and the exemption test is `btn.dataset.lockExempt && !postingRow.contains(btn)` — so on that one row Skip is an ordinary locked button, which also means **the restore loop puts it back for free** if the post fails and the card stays. `postingRow` is cleared *after* the loop, or the release pass would test a different page from the one the lock pass took.
  - **THE FLUSH STILL CHECKS FOR A RECEIPT even though that should now be unreachable.** A queue of intentions applied later has to re-check the row it is about to overwrite, because the whole point of deferring is that the world moved in between. If a queued row somehow reads `posted`, the skip does not land: the story is on the accounts and `posted_platforms` is the only record of where, so writing `skipped` over it would leave the queue disagreeing with the Page about something no page here can check. Reported, not done silently; Move/Copy to Review is the way back.
  - **THE ROW'S DIMMING HAD TO MOVE OFF `.post-actions` ONTO ITS CHILDREN.** `opacity` makes a stacking group, so a child of an element at `0.5` **cannot** be brought back to full contrast by any rule of its own — a live Skip inside a dimmed row would have read as dead, which is the one thing this change exists to avoid. The selector is `body.is-posting .post-actions > *:not([data-lock-exempt])`. `body.is-posting`'s `cursor: progress` is overridden on the exempt control for the same reason.
  - **`data-lock-exempt` IS EXEMPT IN BOTH DIRECTIONS.** Left out of the lock loop and out of the restore loop, so the unlock cannot reach in and switch on a Skip sitting disabled mid-save for a reason of its own. That restore loop is why the flag exists rather than a second selector.
### ONE BUTTON PER ACCOUNT, AND DONE IS THE ONLY THING THAT MOVES THE ROW (2026-08-21)

The card carried a single **Post to Facebook + Instagram + Threads**, a **Copy**, and a **Skip**. That worked while everything went out by machine and **fell apart once two accounts went by hand**: one press did three things, another press did a fourth by a completely different mechanism, and the row moved itself to Posted somewhere in the middle. You could not tell what had actually gone where.

**Five buttons, always in this order: Facebook · Instagram · Threads · X · YouTube.** Then **DONE**, then Skip.

- **EACH BUTTON DOES THAT ACCOUNT AND NOTHING ELSE.** Machine accounts post through the Edge Function one at a time. **A by-hand account copies the caption AND OPENS ITS COMPOSER** — copying without opening leaves you to go and find the site, which is the step people forget and then wonder why nothing went out. Both happen inside the click, because the clipboard needs user activation and a popup blocker eats a `window.open` that arrives after an await.
- **NO INSTRUCTIONS ON THE FACES.** A button reads **X**, never "Copy to clipboard for X". Which mechanism an account uses is our problem, not something to make somebody read five times a day. What differs is what the button DOES, and it explains itself while it does it.
- **DONE IS THE DECISION AND THE ONLY THING THAT WRITES `status`.** It is dead until at least one account has actually been used, and it records **the accounts you really pressed**, not the ones the bot suggested: `posted_platforms` is a receipt. The old flow marked the row posted in the middle of a sequence you had not finished.
- **`ALL N` POSTS THE MACHINE ACCOUNTS IN ONE PRESS, AND IT IS NOT A CHECKBOX** (2026-08-21). It sits first in the group, counts what it will do (**`Both`** at two, `All 3` at three: there are only ever two or three, so the word is available for the case that has one, and `All 2` reads as a counter where English has a word) and is **hidden below two**, where it would be a second copy of the button beside it. **The obvious design was a row of auto-ticked boxes and a Post button, and this page HAD that shape once**: it was deleted because it asked a question with one sensible answer, and it costs two actions to say yes to it. A button naming its own outcome is one press for the common case, with the five beside it for the exception.
  - **ONE REQUEST FOR THE BATCH, not a loop.** `postKeys(keys, btn)` sends the list to the Edge Function, which answers per account: one lock, one watchdog, one answer to read. A loop would hold the page three times over and could half-finish with nothing saying which half.
  - **`used` IS BUILT FROM THE REPLY, NOT FROM WHAT WAS ASKED FOR.** A partial answer is the normal case, so if Instagram refuses and Facebook takes it, only Facebook is ticked and only Facebook reaches `posted_platforms`. **The receipt must never name an account that refused.** Results are matched by `platform` name and only fall back to position, or a reply that reorders would tick the wrong account.
  - **`allBtn.hidden` NEEDED `.post-platform[hidden] { display: none }`** — the **fourth** time this project has hit that rule. `.btn` carries an author `display: inline-flex` and `[hidden]` is only a UA-sheet `display: none`, so the author rule wins and setting `.hidden` silently does nothing.
  - **It is NOT `primary`.** Done is the decision and stays the only filled button in the row; All is heavier than the five and lighter than the one that files the row.
- **A PLATFORM HAS A MODE PER CANDIDATE, NOT A YES/NO** (2026-08-21). `platformMode(row, key)` returns `machine` | `hand` | `off`, replacing `platformAvailable`. **Instagram is the whole reason.** Its API refuses a post with no image, so an imageless candidate used to grey it out — and an imageless candidate is **exactly** when you want to choose a picture by hand, so the one account that most needs a human was the one account you could not reach. Named but unpostable now means `hand`: the caption goes on the clipboard and `instagram.com/create/select/` opens.
  - **The button does not move when its mechanism changes**, and that is deliberate: a control that changes position as well as behaviour is one you have to find again. **It says so on its tooltip instead**, naming the reason and what would put it back.
  - **Facebook and Threads have no such case** — they take a text post, so named means machine and unnamed means off.
- **THE GIFT PHOTO IS A LINK IN THE NOTICE, NOT A SECOND TAB** (2026-08-21). Pressing a by-hand account opened the composer **and** the gift photo, which is **two `window.open` calls out of one click**, and browsers routinely allow the first and block the second. So the message said *"with the gift photo in the next tab"* about a tab that was often **not there** — worse than not offering the photo at all, because you go looking for it, fail, and cannot tell whether the fault is yours.
  - **A LINK IS PRESSED WHEN YOU WANT IT**, is a fresh user gesture of its own so it cannot be blocked, and **stays until the notice is cleared** — which is the actual requirement: the picture has to be one press away *while the composer is open and before Done*, not at the instant the button was clicked.
  - **THE MESSAGE NOW SAYS WHAT HAPPENED.** `window.open` returns null when the browser refuses, and that was never checked, so the notice claimed *"X is open"* whether or not it was. It names a blocked tab now.
  - `stickLink()` is `stick()` with an anchor on the end. `clearNotice` sets `textContent = ''`, which takes the anchor with it.
- **A HAIRLINE SITS BEFORE X**, marking where the row stops posting for you and starts handing you a clipboard. Static, because X and YouTube are always by hand; Instagram crosses that line either way and stays where it is.
- **THE TICK IS A LITERAL ✓, NOT A CSS ESCAPE, AND THAT IS A SCAR.** It was written as a `¹3` escape and reached the file as **`¹3`**, so the button read `FACEBOOK¹3` on screen. The escape passed through a heredoc and then Python, which read the first four characters as an **octal** escape (`0o271` = 185 = `¹`) and left the `3` behind. **Three layers of escaping and one of them ate it.** Type the character; there is nothing left for any layer to misread. `cat -A` is what showed it, since the mangled version looks like a plausible tick in a normal diff.
- **FILLED BLUE MEANS THIS ACCOUNT IS A DESTINATION FOR THIS CANDIDATE** (2026-08-21). Available in any sense: the machine posts it, or it hands you a clipboard and opens its composer. The fill answers the question you ask of the row five times a day, **where can this go**, at a glance rather than through five tooltips. Two states, not four: **blue you can act on it, green you already have, faded it is not a destination.**
  - **IT DOES NOT DISTINGUISH MACHINE FROM BY HAND.** The first cut filled only the three the Edge Function reaches, and that was **the wrong question to answer in colour**: which mechanism an account uses is our problem. **X and YouTube are as real a destination as Facebook** and looked like second-class controls beside it. What survives of that distinction is the **hairline before X** and the tooltip.
  - **A FALLBACK IS NOT A READY STATE, AND THIS IS THE LINE THE COLOUR ACTUALLY DRAWS** (2026-08-21). By hand is X's and YouTube's **normal** state, so they are blue whenever offered. Instagram by hand is a machine account that **could not be posted by machine this time**, for want of an image. Painting it like the two beside it made a card reading **`Both`** show **three identical buttons**, which is the row disagreeing with its own count. So `.is-fallback` is a **dashed blue outline on white**: still a destination, still pressable, visibly not one of the ones that are go.
    - **`is-used` RESETS `border-style` TO SOLID EXPLICITLY.** A used fallback keeps `.is-fallback` and would otherwise stay dashed, so a finished account would go on looking provisional.
    - Only Instagram can ever land here, because Facebook and Threads take a text post and X and YouTube are never machine.
  - **IT IS A STATE, NOT A RANK.** `sync()` toggles `.is-ready` off `platformMode()`, so a greyed account lights up the moment the candidate changes under it. Nothing in the row is styled from the bot's tags.
  - **A USED BUTTON GOES FILLED GREEN, WHATEVER ROUTE IT TOOK.** A clipboard account and a machine account that have both gone out are in the same state, and seeing where you have got to is the whole point of five buttons.
  - **`.is-used` MUST STAY AFTER `.is-ready` IN THE SHEET.** Both are (0,2,0), so source order is the only thing deciding an available account you have already pressed, and the losing branch is green text on a blue fill.
- **A USED BUTTON IS TICKED, NOT DISABLED.** Posting twice is something people legitimately do, and greying it would make a retry after a failure impossible. The tick is state, not instruction: it says where you have got to, which is the thing five buttons make easy to lose.
- **A GREYED BUTTON GIVES THE BOT'S REASON, NOT THE BARE FACT OF THE DECISION** (2026-08-21). It said *"The bot did not suggest X for this one. It named Facebook, Instagram"*, which is a **restatement of the greying** and answers nothing: standing in front of it you want to know WHY it went that way, so you can decide whether to overrule it.
  - **EVERY `platforms` ENTRY CARRIES A `why` FRAGMENT AND NOTHING HAD EVER READ IT.** Both prompts have asked for it since the column existed — *"link preview does the work"*, *"lead photo of the mural carries it"* — and it was written, stored and never shown. `suggestedPicks()` is the reader. The tooltip is now *"The bot passed over X here. It chose Facebook (link preview does the work); Instagram (lead photo of the mural carries it)."*
  - **A SKIPPED ACCOUNT HAS NO REASON OF ITS OWN**, because the bot names what it picked rather than what it passed over. So the honest answer is the reasoning behind the accounts it DID choose, which is **the same judgement seen from the other side**. It degrades to bare names for a legacy row whose entries are strings.
- **THE GREYED STATE IS `aria-disabled`, NOT `disabled`, AND THAT IS FOR THE PHONE** (2026-08-21). **A disabled button dispatches no click event at all**, so on a touch screen — where there is no hover and therefore no tooltip — the reason a button was greyed was **completely unreachable**. It is now `aria-disabled` plus a class: still announced as unavailable, still focusable, and **a press writes the reason into the notice**.
  - **`disabled` IS STILL WHAT THE POSTING LOCK USES**, and the two do not collide: the lock sets and clears `.disabled`, `sync()` owns `aria-disabled`, and `sync()` runs again after every post.
  - **The cursor is `help`, not `not-allowed`.** The button IS pressable and what it does is explain itself.
- **A GREYED BUTTON KEEPS ITS PLACE**, so the five positions never shuffle from card to card, and its tooltip says WHY: no image for Instagram, not a video for YouTube, or the bot naming other accounts.
- **YOUTUBE IS THE ONE ACCOUNT AN UNTAGGED ROW DOES NOT GET.** A news story does not belong on the channel. X is offered on an untagged row, because "no advice" has always meant "no narrowing" here.
- **DELETED WITH THE OLD ROW**, all of it read by nothing afterwards: `postBlockedReason`, `autoBlockedReason`, `byHandTarget` (the joined phrase, for a label that no longer exists), `pasteKeyName`, and `PLATFORM_COMPOSERS`, which had been dead for longer and is genuinely superseded by `PLATFORM_COMPOSE`.

- **ONE CLICK REACHES EVERY ACCOUNT THAT CAN TAKE THE STORY, and `postTargets()` is the only place that is decided.** Which accounts is a *fact about the candidate*, not a preference — Instagram's API refuses a text-only post, so it drops off a candidate with no image; Facebook and Threads take anything. The button therefore states the outcome ("Post to Facebook + Instagram + Threads") rather than asking a question with one sensible answer. **Anything added later goes in `postTargets()` or it is inert.**
  - **The agent's `platforms` tags are ADVICE, NOT ROUTING.** They are still stored, still shown in Edit, and still worth writing — a human reads them when deciding whether to post at all — but nothing paths on them. Both prompts say so.
  - **This is how Threads shipped broken for a morning.** The Edge Function, the secret and `PLATFORM_AUTOPOST.threads` were all correct, and none of it did anything, because the button asked `metaTargets()` — an answer that cannot contain Threads. `PLATFORM_ORDER` had `'threads'` added to it and hadn't been read by anything since the per-card picker was deleted with X and YouTube. **A list that no longer feeds anything answers "is this wired?" with a convincing yes**, which is why `PLATFORM_ORDER`, `PLATFORM_LABELS`, `platformLabel()`, `platformList()` and `autoPostable()` were all deleted rather than left lying about. A flag is not a switch unless something reads it.

---

## THE WIKIPEDIA SWEEP — once TGB WAYPOINT BOT, now step 3b of TGB PATH BOT

**TGB WAYPOINT BOT IS GONE AS A ROUTINE AND ITS SWEEP IS NOT.** Until 2026-08-20 it ran twice a day (`trig_018FbHnaU5DqB4GesPfABV2d`, cron `8 8,20 * * *` UTC), picked the NFL host city that had gone longest without a run, swept **Wikipedia and Wikimedia** for places in it, and committed `mc/stops/nightly.json` to `main` for a human to sort through. **That file is deleted, the routine is retired, and the sweep moved into TGB PATH BOT's stored prompt** as the fallback for a city with no published walking tour.

**Why it went, and it is worth being precise because the sourcing rules below survived it.** The routine was fine; its DELIVERY was the problem, and it was the last instance of the pattern this repo has already deleted four times (see *The "research assistant" pattern is gone*). **A prompt whose output is a file is a prompt whose output is lost.** The Path Builder popup that reviewed the file was deleted on 2026-08-18, leaving the Daily Review page as its only reader, so a scout ran twice a day into a file almost nobody opened, and every run replaced the last one wholesale. Meanwhile TGB PATH BOT was writing the same kind of place straight into `public.waypoints` through an RPC, with a walk around it.

**What the merge gained, in one line:** a swept city now produces a real path with real waypoints, in order, instead of a list somebody still has to sort. It also fills the fourth tour slot on a run where a city has no published tour, which used to make TGB PATH BOT file three walks and say so.

**What was given up, stated plainly.** The sweep is now a FALLBACK rather than a job of its own, so a city with a good published tour no longer gets its Wikipedia landmarks swept at all. Those places are simply not collected. If loose-place collection is ever wanted back it needs a **write path**, not a file: the mistake was never the sweeping.

**The `nightly*` identifiers are gone with it** — `nightlyBtn` in the Path Builder, `PATHS.waypoints`, `fetchPathCommits`, `latestPathCommit`, `fetchRawJson`, `commitDate` and `firstLine` in `mc/review/index.html`, all removed in the same commit. `mc/stops/` is now an empty directory; the Stop Builder note further down still explains why `/mc/_stops.html` and `/mc/stops/` were once different live things.

**The sourcing rules below are UNCHANGED and still binding**, because they are what made the sweep worth keeping. They now live in step 3b of TGB PATH BOT's prompt, staged in this repo at [mc/_dev/prompt-tools/path-bot.prompt.md](mc/_dev/prompt-tools/path-bot.prompt.md), and in `WIKI_SOURCE_LINES` in [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) for the page prompts.

- **A stop must have a Wikipedia article (or Commons category) carrying coordinates or a street address.** That single constraint does most of the quality filtering: a place notable enough for an article and pinned precisely enough to geotag is a place worth standing in front of, and the article URL still resolves years later — a visitor-bureau tour PDF will not. NRHP county listings and National Historic Landmark lists are the richest vein (address *and* coordinates per row); Wikipedia GeoSearch sweeps a downtown core; Commons is the still-standing photo check. Switched from published-walking-tour sourcing on 2026-07-29 — the same rules live in `WIKI_SOURCE_LINES` in [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js), shared by the page prompts, so they can't drift. **The routine's copy is its own** and is kept in step by hand like every other routine prompt.
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

- **THE AGENT WRITES TO THE DATABASE NOW, AND THIS BULLET USED TO SAY THE OPPOSITE.** It read *"the agent writes one file and never touches the database. It has no admin session and no RPC, by design; don't give it a write path, the review step is the feature."* That was true of TGB WAYPOINT BOT and the review step it named is gone: the popup that performed it was deleted on 2026-08-18, so what remained was a file with no reviewer, which is not a human in the loop, it is an output nobody reads. The surviving routine files through `tgb_pull_walking_tours`, which is the same SECURITY DEFINER doorway the four other pulls use and carries its safety in its constants rather than in a screen.
- **THE CITY ROTATION IS READ FROM `public.paths`, NOT FROM GIT HISTORY.** The old routine could not read the table (it believed RLS gated SELECT behind an admin session) so it derived a rotation from the last ~40 commits of `nightly.json` and picked the city missing longest. **`waypoints` and `paths` are both anon-readable**, so the surviving routine simply asks which NFL cities hold no path and works the division cycle from the answer. A rotation inferred from commits to a file that no longer exists would have been the single most silent failure in this merge.
- **`source_url` is mandatory on every stop** — the stop's own Wikipedia article (or the list article it is a row in), which lands in the waypoint's Source URL field so the claim stays checkable later. Unchanged by the merge, and enforced by the prompt rather than by the RPC.
- **There is no last-run signal for this routine and there cannot be one of the old kind.** It read the **GitHub commits API** for `mc/stops/nightly.json` on the principle that a run which errored pushes nothing, so a stale timestamp was the failure signal. The routine commits nothing at all now, so that signal does not exist — the same thing that happened to the Socializer when its bot stopped committing. If one is wanted back, read the newest `paths.created_at`, **never** the commits API.

### Paths are their OWN tables. A waypoint is a place. (2026-08-08, second pass)

| table | holds |
|---|---|
| `public.waypoints` | the places. **One row per place, ever.** No tour columns. |
| `public.paths` | `tour_id` (PK), `title`, `shape`, `city`. One row per path. |
| `public.path_stops` | `tour_id`, `wpid`, `ord`. **Nothing but ids and a position.** |

**THE PAGE IS `mc/pathbuilder.html` AS OF 2026-08-19**, renamed from `mc/paths.html`. **A hard break with no redirect**, as always here, so `/mc/paths.html` now 404s. The point is that the file is named after the ROOM rather than after the table it edits: the room is called the Path Builder everywhere it is spoken about, and `paths.html` read as a listing of `public.paths` — which it is not, it is the editor for three tables. **`public.paths`, `public.path_stops` and `paths.city` are untouched**; this is a filename, not a rename of the concept, and the Route-to-Path rename below is the one that moved the vocabulary.

Repointed in the same commit: the nav menu entry in `mc/js/admin-nav-menu.js`, the Data Warehouse card in `mc/data/index.html`, both links in `mc/review/index.html`, Stop Builder's new-waypoint button and its table comment in `mc/_stops.html`, and the two provenance comments in `mc/assets/waypoint-editor.js`. **Nothing inside the page referred to itself**, and its depth did not change, so no asset path needed touching. **TGB WAYPOINT BOT's stored prompt was updated in the same pass** (`trig_018FbHnaU5DqB4GesPfABV2d`, cron and everything else untouched): it names the page twice, once as where a human reviews its file and once in its own list of the room's previous addresses, which is now five entries long. **TGB PATH BOT and TGB ANCHOR EVENTS needed no change** and it is worth knowing why: TGB PATH BOT says *the Path Builder* and never names a file, and TGB ANCHOR EVENTS reads its spec out of `mc/assets/waypoint-prompts.js`, mentioning `mc/routes.html` only as history. **`?tour=` links still work** — the query contract is on the page, not the filename, but a stored link that names the old file is dead like any other.

Migration: [2026080804_paths_and_path_stops.sql](mc/supabase/migrations/2026080804_paths_and_path_stops.sql). Editor: **[mc/pathbuilder.html](mc/pathbuilder.html) — "Path Builder"**, under **GAME ELEMENTS** in the nav (moved there from Game Builder on 2026-08-17: a Path is a reusable part a game is assembled from, like a Guide or a City, not one of the tools that does the assembling).

**This REVERSES the columns-on-waypoints design from earlier the same day**, which gave a place on two walks two rows so each could carry its own sentence and its own order. The argument was real; the cost was worse. The duplicate rows were not marked as being the same place, so the catalogue grew a second Freedom Tower every time somebody built another downtown Miami walk, the map drew two pins on one building, the importers' name+city dedupe fought the design that required the duplicate, and **"what paths is this place on" could not be asked at all**. One place, one row, is the shape a catalogue wants.

- **The accepted trade, stated plainly:** a waypoint's description is shared by every path it is on. Edit it once, it changes everywhere. The merge had to pick one sentence out of two for seven Miami places.
- **`walk_order` STAYS on `waypoints` and is NOT a path position.** It is the per-city advisory order the Suggest order button computes, and it predates tours entirely. A path's order is `path_stops.ord`.
- **`tour_id` / `tour_title` / `tour_shape` on `waypoints` are retired but NOT dropped** — left in place and unread, the same way `public.maps` and `gift_shop_cities` were, so a deploy that has not caught up does not 400. The `drop` sits commented at the bottom of the migration. Nothing reads them.
- **`on delete cascade` on both sides of `path_stops`.** Deleting a path must not leave orphan stops; deleting a waypoint must not leave a path pointing at nothing. The waypoint is protected by being hard to delete in the UI, not by an orphan row.
- **A PLACE MAY APPEAR MORE THAN ONCE ON A PATH** (2026-08-18). The key was `(tour_id, wpid)` and is now **`(tour_id, ord)`** — [2026081801_path_stops_allow_repeats.sql](mc/supabase/migrations/2026081801_path_stops_allow_repeats.sql). **This reverses the rule recorded here**, which argued a loop *finishes near* its first stop rather than listing it again. That is one way to draw a loop and not the only one: a walk that starts and ends at the same square is ordinary, and naming the square twice is the obvious way to describe it. The key was deciding an editorial question and deciding it wrong. A **position** is still unique — there is no second third stop — which is why `ord` is the key rather than a new surrogate id.
  - **Everything client-side now keys on POSITION, never on wpid.** Path rows carry `data-idx`; `indexOf` would find the first copy and move the wrong one. `placeStop` split into **`insertStop`** and **`moveStop`**, chosen by the drag's `kind`: a drag from the library always **adds a copy**, a drag of a row already on the path always **moves that row**. "Is it already on the list" can no longer decide, which is what that one function used it for.
  - `addStop` no longer refuses a repeat, and the library's **Add stays live** rather than going to *Added* — closing a loop is exactly this button pressed twice. The row's caption counts: *on this path x2*.

**Deduping is on NAME + ADDRESS, never address alone.** One address is routinely several stops: 100 W 14th Ave Pkwy in Denver is the Denver Art Museum *and* the Scottish Angus Cow and Calf *and* Big Sweep and Monolith; 206 Washington St in Boston is the Old State House *and* the Boston Massacre Site; 43 Monument Sq is the Bunker Hill Monument *and* its museum. Collapsing on address would have deleted eleven real stops. The migration merged 9 rows and left 7 places genuinely shared across two paths.

- **[tgb_import_walking_tour](mc/supabase/walking-tour-prompt-import.sql) now REUSES a place it already holds** rather than inserting a second copy, matching on name + address, and **leaves a reused place's description exactly as it was** — the returned note says so. It writes all three tables and returns `action` = `path` then `waypoint` per stop.
  - Its `on conflict` names **`path_stops_pkey`** rather than `(tour_id, wpid)`. The function's `RETURNS TABLE` declares output columns called `wpid` and `ord`, and inside an index-inference clause plpgsql cannot tell those from the table's own columns — it raises `column reference "wpid" is ambiguous`. Naming the constraint sidesteps resolution entirely.
- **`tour_id` is city + shape + UTC timestamp TO THE SECOND.** Minutes were not enough: two imports of one city and shape inside a minute collided on the id and the second silently merged into the first. That produced a real twenty-stop "loop" in this table, which [2026080804](mc/supabase/migrations/2026080804_paths_and_path_stops.sql) split back apart.
- **It is called `tour_id`, not `path_id`, and that is deliberate** even now the table is named `paths`. **Path** is taken: in the canonical hierarchy a Game contains Paths and a Path's real ordering is `public.stops.ord`. Renaming the column would also break every stored `?tour=` link and the routine's stored prompt. (`route_color` is a third unrelated use of the word — the engine's rotation slot.)

### `waypoints.archived` IS DROPPED. THE ROUTINE READS THE LIBRARY INSTEAD. (2026-08-18)

Two migrations an hour apart: [2026081805](mc/supabase/migrations/2026081805_waypoints_all_live.sql) set every row live, then [2026081806](mc/supabase/migrations/2026081806_waypoints_drop_archived.sql) **dropped the column**. Both **apply by hand**. The library holds every place we know about, all of them are eligible for a path, and a place that turns out to be wrong is **edited or deleted** rather than parked in a second list.

**DROPPING IS THE THING THIS PROJECT NORMALLY REFUSES TO DO** — `public.maps`, `waypoints.tour_id` and the two soundtrack timestamps are all retired in place for that reason. It went because there was no information left in it: every row had been set to the same value an hour earlier, and a boolean every row shares is a column the next reader has to work out the meaning of. **This one had meant four things in three weeks**: hidden from the working list (2026072903), a do-not-rescrape tombstone, the arrival state of everything a routine found (2026081803), and finally nothing at all.

**THE TOMBSTONE IS REPLACED, NOT ABANDONED.** That was the only job still doing work: an importer skips a place it already holds, so an archived row stopped the next sweep filing it again. **TGB PATH BOT now reads `public.waypoints` for its four cities before it searches** (step 2 of its prompt, and it is not optional). That is better than the flag was, because it stops the duplicate being *found* rather than catching it at the door, and because `waypoints` is anon-readable so a routine can actually do it.
  - **The prompt makes the second half explicit, which is the half that goes wrong.** The RPC reuses a place when name AND address both match, lowercased, so a stop we already hold must be filed with **our exact name and address**. `Gallier Hall` + `545 St Charles Ave` reuses the row; `Gallier Hall (1853)` or `545 Saint Charles Avenue` inserts a second Gallier Hall, two pins on one building. The routine is told to compare `waypoints_reused` in the reply against what it expected and to report a mismatch.

**What went with the column**, all in one commit so nothing raises `column "archived" does not exist`: the editor's switch and its `wpCols.archived` probe, the library's shelved tag and `.stop--shelved`, `isShelved`, `isArchived()` in [waypoint-prompts.js](mc/assets/waypoint-prompts.js) and the filter that used it, the `archived` line in [waypoints-schema.sql](mc/supabase/waypoints-schema.sql) and in the prompts' inlined copy of it, and the archived branches in `tgb_import_waypoints_prompt_items`, `tgb_import_waypoints_sports_items`, `tgb_import_walking_tour` and `tgb_pull_walking_tours`. **The two import helpers are inlined into the AI prompts as well as living in `mc/supabase/`** — that pair has a standing keep-in-sync rule and both copies were changed.

`public.waypoints.archived` is **retired as a state** — [2026081805](mc/supabase/migrations/2026081805_waypoints_all_live.sql), **apply by hand**. The default goes back to `false`, every row is set `false`, and the column keeps a comment saying so. **The library holds every place it knows about, all of them are eligible for a path, and a place that turns out to be wrong is EDITED or DELETED** rather than parked in a second list.

**How it got here, in one day.** Arrivals were made to land shelved ([2026081803](mc/supabase/migrations/2026081803_waypoints_arrive_shelved.sql)) so a human would approve them in a review room; that room lasted an afternoon (below). What was left was a state nothing could clear: places arriving invisible to the room that builds paths, with no screen that turned them on.

**WHAT IS LOST, and it is worth knowing before somebody re-adds it.** `archived` was doing two jobs and only one of them was the queue. The other was a **do-not-rescrape tombstone**: an importer matches a place and skips one already held, so an archived row stopped the next sweep filing it again, and deleting a place has always invited it straight back. With every row live there is no way left to say "we looked at this and it is not wanted". Nothing breaks today, because the importers match on name + address and still find the row. **If that mark is wanted again it needs its OWN column** (`rejected_at`, say) rather than borrowing this one back — one column doing two jobs is what made this confusing in the first place.

**The column is NOT dropped**, the same reasoning that left `public.maps` and `waypoints.tour_id` in place. Nothing reads it; the editor writes `false` on every save so a stray `true` is corrected on the way past.

### THE WAYPOINT FINDER IS DELETED (2026-08-18, the same day it was built)

`mc/waypoint-finder.html` existed for a few hours. It was a queue for deciding whether a place belongs in the library at all, sitting beside the Path Builder, which puts the kept ones in an order. **The split did not survive contact with the work**: reviewing a place and putting it on a walk are the same sitting, so it put the same two ADD buttons in two rooms and made you change rooms to type in a stop you were standing in front of. **One room, both jobs.** Its card on `/mc/`, its Game Elements nav entry and the file are all gone; there is no redirect, as usual.

**What survived it, and this is the part worth keeping:**

- **[mc/assets/waypoint-editor.js](mc/assets/waypoint-editor.js)**, the whole waypoint editor as a module: `window.TgbWaypointEditor`. It came out of `mc/pathbuilder.html` (about 550 lines, plus its dialogs and its CSS) when the Finder needed the same editor and had grown a five-field form of its own instead. That is the copy-and-drift this repo has already lost to twice, with the Plus Code codec and the waypoints import helper, and the reason `waypoint-geo.js` and `waypoint-prompts.js` exist.
  - **It has one caller again**, and that is fine: the file is a clean seam, `pathbuilder.html` is 550 lines lighter, and re-inlining working code to save a script tag is churn. **Don't re-inline it.**
  - **IT HAD ONE CALLER AND THAT HID A LEAK.** `WP_FIELDS`, the column list `wpPayload` writes on every save, was declared in **`mc/pathbuilder.html`** and read by the module as a global. It worked, because a top-level `const` in a classic script is visible to every other script on the page and this was the only host. **The second room to mount the editor got `WP_FIELDS is not defined` on its first write** — which surfaced on the short-lived `mc/partners.html` as Fill silently failing, the ReferenceError caught by `fillAndSaveRow`'s own try/catch and reported as though the geocoder had refused. Moved into the module on 2026-08-20; **nothing outside that file may declare it.** A module that reads a host's variable is not a module, and this is exactly what the file header promises it does not do.
  - **`probe()` MUST BE RE-RUN ONCE THE ROWS ARE LOADED.** `probeWaypointColumns` answers "no such column" for everything when handed an empty array, and `wpPayload` gates `lat`/`lon` and `source_url` on that answer. A host that mounts before it loads therefore writes the zip and **silently drops the coordinates and the source**, which is the worst kind of half-success because nothing reports it. The Path Builder probes inside `loadAll`; Partners re-probes at the end of its own load.
  - **It brings its own markup, its own CSS and its own `#pathCityList` datalist**, so a host page has nothing to keep in step. The host contract is `restUrl` and `authHeaders` (required) plus optional `setStatus`, `waypoints()`, `defaultCity()`, `removeWaypoint()`, `onChanged()` and a `path` block. **A room with no `path` never offers to add a new place to a walk**, which is the only part of the editor that only makes sense next to an open path.
  - **Its buttons are ID-SCOPED (`#wpDlg .btn`) and that is deliberate.** Every room styles `.btn` its own way, and a host's sheet loads *after* the module's, so matching a bare `.btn` would lose on source order and the same dialog would read differently in each room. An id beats a class whatever the order.
- **`public.waypoints.created_at`** ([2026081802](mc/supabase/migrations/2026081802_waypoints_created_at.sql)) stands and is still nullable, so a row from before the column existed reads as "arrived before we started counting" rather than carrying a made-up date. **Arrivals landing SHELVED ([2026081803](mc/supabase/migrations/2026081803_waypoints_arrive_shelved.sql)) did NOT survive**: see the section above. Everything from TGB PATH BOT, an import or a human's own hand now arrives live. (TGB WAYPOINT BOT was on that list until it was retired on 2026-08-20.)

### A WAYPOINT'S NAME IS A LINK TO ITS SOURCE (2026-08-20)

`source_url` is where a claim about a place came from, it is required by three prompts, it is filled by Fill, **440 of 480 waypoints carry one** — and until now nothing read it. Every room printed the name as dead text and the URL not at all.

- **`TgbWaypointEditor.waypointNameEl(row)` is the one builder**, exported from [waypoint-editor.js](mc/assets/waypoint-editor.js) because that is the shared waypoint module every room drawing a waypoint already loads. **It is not part of the editor**, and it is the first thing in that file that is not.
- **Four call sites**: the Path Builder's library rows, its path rows and its map popup, and the Partners card. Four hand-written anchors is how three end up missing `rel="noopener"` and the fourth swallows a drag.
- **`draggable = false` ON THE ANCHOR, AND NO `dragstart` HANDLER.** This is the trap. An anchor inside a draggable row is its own drag source, so the browser drags the LINK instead of the row. The fix is `draggable = false`, which makes the browser walk up and drag the row instead. **`preventDefault` on dragstart is NOT the fix and is actively wrong**: the event bubbles, so it cancels the drag entirely and makes the middle of every row dead to the one gesture the room is built on. (Caught in review, not in the browser.)
- **No link without a parseable `http(s)` URL.** A `javascript:` source is refused by the protocol check, and a source that will not parse renders as plain text with a tooltip saying so, because an anchor that goes nowhere is worse than text: it invites the click.
- **A name with no source looks identical until you point at it**, and its tooltip says there is none. Whether we recorded a source is not a fact about the PLACE, so it must not change how the place reads in a list.
- **It inherits colour and weight** rather than going browser-blue and underlined; forty underlined blue names is a link farm, not a library. A dotted underline on hover is the room's existing idiom for "this does something".

**Where a name is still NOT a link, and why it cannot be:** the map's Leaflet tooltips (plain text by nature), the anchor picker in the AI dialog (an `<option>` cannot hold a link), and Stop Builder's `waypointLabel` in [mc/_stops.html](mc/_stops.html), which returns a STRING for `<option>` text and does not fetch `source_url` at all. That room is parked.

### The Path Builder page

- **THE LIBRARY IS A COPY SOURCE, NOT A CUT ONE** (2026-08-18). Adding a place to a path leaves it in the left panel, marked *on this path* and with Add spent. It used to vanish from the pool, which made adding a stop read as **moving** the place out of the catalogue — and the catalogue is the permanent thing: a place lives once in `public.waypoints` and can be on any number of paths, which is the whole reason `waypoints` and `path_stops` are two tables. A library that empties as you build contradicts that on screen. Add is disabled once used because a second copy is refused by the `(tour_id, wpid)` primary key, so the button's only outcome would be an error; the row still **drags**, because dragging an already-placed row is a move within the path.
- **The panels are titled `WAYPOINT LIBRARY: CITY` and `PATH: CITY`.** The left one was "*city* waypoints not on this path", which defined a standing catalogue by what it was currently missing — so the same shelf was called something different a second after you dragged a row. The city goes after the colon so both titles start with the noun and line up down the page.
- **THE ADD BAR HOLDS BOTH NOUNS: Waypoint · Waypoint Prompts | Path · Path Clone · TGB PATH BOT**, with a `.bar-sep` rule marking where one ends and the other begins.
  - **TWO CHANGES LANDED ON THIS BAR FROM OPPOSITE DIRECTIONS ON 2026-08-20 AND BOTH SURVIVE.** TGB WAYPOINT BOT's door was **deleted**, because the routine was folded into TGB PATH BOT and a door to it would 404; and **Waypoint Prompts gained a door**, because `openAiDialog` and its whole six-pull dialog had been defined and reachable from nothing. **They are not the same button**: the retired routine filed loose places on its own, and this one hands you a prompt to paste into another AI, which still returns loose waypoints.
  - **SO THE TWO HALVES NO LONGER READ THE SAME WAY, and that is honest rather than untidy.** The old pattern was "the bare noun makes the thing; the buttons after it say how else you can get one." The Waypoint half now has one fewer way, because the routine that made loose places is gone: the surviving one files a whole PATH and the waypoints arrive as its stops.
  - **WAYPOINT PROMPTS, NOT WAYPOINT AI.** *AI* had stopped distinguishing anything: the routine beside it is AI and the six pulls it opens are AI. What this button actually hands you is a **prompt to paste somewhere else**.
  - **`openFindDialog` IS STILL IN THAT STATE** — wired, working, and reachable from nothing. Either give it a door or delete it with `runFind`, `renderFindResults`, `openDraftFrom`, `#findDlg` and the search half of `waypoint-geo.js`, together.
  - **CLONE keeps its `Path`**, because Clone is not the noun: "Clone" alone would not say what it copies, and this bar holds two things you could mean. **TGB PATH BOT keeps its own** for the older reason: it is a proper noun, the routine's name on the trigger and in this file.
  - **The waypoint half left for a few hours on 2026-08-18 and came back** when the Waypoint Finder was deleted. The path buttons went bare, then took `Path` back, then landed where they are now; the settled rule is the one above, and a button reading "Bot" or "Clone" alone would name nothing.
  - **No ↗ on the door.** TGB PATH BOT opens claude.ai and wears the same chrome as the buttons beside it (so did TGB WAYPOINT BOT, while there were two); marking one control as a door while the rest are not reads as a difference in kind rather than in destination. `.btn` carries `display: inline-flex` and `text-decoration: none` so an `<a class="btn">` sits level with its `<button>` siblings.
- **THE MAP IS A THIRD PANEL WITH THE SAME HEAD** (2026-08-18). It read `Oswald's Diary - Walking Path Map` on plain white, so the first title on the page was the one that neither looked nor read like the two under it: the noun sat at the END, after the path's own name, and the head missed the `--cut-panel-bg` ground `#poolPanel` and `#pathPanel` share. It is **`PATH MAP: NAME`** on the tinted ground now, so all three titles start with the noun and line up down the page. **No city after the name**, and as of the same day neither has the PATH panel's title: it carried one in brackets from the days when the heading was the city alone and the name was added to tell two paths in one city apart. The city half outlived its reason — the library's header says NEW ORLEANS, the map above says it, the picker in the path panel's own strip says it, and every row in both columns ends with it. Three panel titles, one city, said once.
- **FILL EVERY GAP IN THE LIBRARY, from the library panel's own header** (2026-08-18). `Fill N` when a path is open, scoped to its city; **`Fill N · all cities`** when none is, scoped to every loaded row. The label carries the scope in that second case because the count beside it is the LIST's and the two disagree on purpose: with no path open the panel reads "0 waypoints" while the button offers 135, and a bare number there is the header contradicting itself.
  - **One row at a time and slowly.** Each `fill()` is several Nominatim calls a second apart, which is that service's usage policy and not a tuning knob: a parallel version gets the project blocked. 135 rows is about six minutes, which is why it reports progress by name, repaints the rows as it goes so the `missing` tags visibly clear, and **can be stopped** (the button becomes Stop). Everything already written stays written.
  - **`TgbWaypointEditor.fillAndSaveRow(row)` does one row and `missingFields(row)` decides whether it needs doing.** Both are exported so the bulk run and the single-row Fill ask the same questions and write through the same `wpPayload` - two ideas of "is this complete" or "what do we write" is how a counter and a list start disagreeing, which this repo has paid for twice.
  - **A row `fill()` could not improve is never PATCHed**, so a run over hundreds of rows touches only the ones it helped.
  - **A refused write is caught.** PostgREST answers 200 with an empty array when RLS blocks a PATCH, so without the check a bulk run reports hundreds of successes and writes none of them. Verified: run under the anon key it stops and says the database refused the write.
- **`ALL WAYPOINTS` IS THE FIRST ENTRY IN THE PATH PICKER** (2026-08-18), above every city. It is not a path: `ALL_WAYPOINTS = '__all__'` is a sentinel meaning *no path open, show me everything*, and the library fills with all 463 rows under the heading `WAYPOINT LIBRARY: EVERY CITY`. "I want to look at the places, not a walk" is a real reason to come to this room, and until now there was no way to say it.
  - **IT REACHES THE VIEW FROM A URL TOO**: `?path=__all__`. The query contract is the same one a real path uses, and the sentinel needs no special handling at boot, because `loadStops` asks PostgREST for `tour_id=eq.__all__`, gets an empty list and carries on.
  - **THE 60-ROW CAP IS GONE, AND IT WAS WRONG HERE SPECIFICALLY** (2026-08-20). `renderPool` painted `rows.slice(0, 60)` and appended *"410 more, narrow the filter to see them"*, which is defensible for a city and indefensible for the one view whose entire promise is ALL of them: it drew 60 of 470. **A view named for its completeness cannot be the one that silently truncates.** The reason for the cap was real, that the whole library made the panel a scroll pit, so that is now answered in CSS instead: **`#poolList` and `#pathStops` are bounded at `70vh` and scroll inside their own panels** rather than growing the document. Both columns keep their headers on screen and move independently, which is what makes dragging between them workable on a long list.
  - **A sentinel, not an empty string.** Blank already means "choose a path", the state the picker returns to; a third meaning on that value would make *nothing open* and *everything shown* indistinguishable.
  - **It is offered even when there are no paths at all**, and the picker stays enabled for it: the one view that does not need a path must not be unreachable in a database that has none, which is also the state you are in before you build the first one.
  - **`hasOpenPath()` now guards everything that writes to a path**, because `state.pathId` being truthy stopped meaning "a path is open" the moment a sentinel could sit in it. Without it the library's → and its drag handle offered to add a stop to a walk that does not exist, and Save / Delete / Clone / Edit all read as live. **Test `hasOpenPath()`, never `state.pathId`, for anything that acts on a path.**
- **THE LIBRARY'S CAPTIONS BECAME TAGS** (2026-08-18).
  - **THE LIBRARY IS ALPHABETICAL BY NAME.** It briefly grouped by state, which stopped meaning anything when the shelved state was removed. A name is the one key that does not move under you, and it is how you look for a place you already have in mind. `localeCompare`, so an accent or a lowercase name lands where a reader expects rather than where its code point falls.
  - **The captions were two stacked LINES and are now outlined pills.** Three lines of row for a one-line fact, and the fact was already drawn. **`on this path` is gone entirely**, and so is `shelved`, there being no such state. **The repeat count survives as `x2`**: a loop may list the same square twice and nothing else on the row would say so. **`missing`** is the only tag with a colour, in the red pen, when a row lacks an address, coordinates, a zip, a description or a source, with the tooltip naming which.
- **A WAYPOINT ALREADY ON THE OPEN PATH GETS A LIGHT BLUE ROW** (2026-08-20). `.stop--used`, `rgba(var(--bic-blue-rgb), 0.08)` with the border at 0.3 so the row reads as one filled object rather than a white row with a wash poured into it. The class had been sitting there as **a hook with no style** since the dimming came off; this is what it paints now.
  - **IT IS NOT THE DIMMING COMING BACK, and the distinction is the whole point.** See the bullet below: a faded row reads as DISABLED, and this row is not — you can still drag it, still press Edit, and still add it a second time to close a loop. A tint says *this one is in*, which is a fact about the row; grey said *you cannot have this*, which was a lie. **If it is ever restyled: colour it, never fade it, and never mute its text.**
  - **The `x2` tag still earns its place**, because one tint looks the same at any count and is the only thing that can say a place is on the path twice.
- **NOTHING IN THE LIBRARY IS GREYED OUT** (2026-08-18). Used rows sat at `opacity: 0.62` and shelved rows went colourless at 0.55: two greys carrying two meanings and needing a legend to tell them apart. The tags say it in words now, which is unambiguous, survives a screenshot and a colourblind reader, and does not make a place you can perfectly well drag onto a path look disabled. **Don't reintroduce opacity or a muted text colour on these rows.**
- **WAYPOINTS LEFT, PATH RIGHT** (2026-08-17, swapped from path-left). You are moving places out of a catalogue and into a walk, so the source sits where reading starts and the destination where it ends, and the drag runs left to right like everything else that means "put this there". The path keeps the wider column: its rows carry an ordinal, a handle and three buttons.
- **You can DRAG A WAYPOINT STRAIGHT ONTO THE PATH**, not just press Add. The pool row grew the same handle a path row has, and `wireDrag` takes a **kind** — `'pool'` inserts, `'stop'` reorders — because at the drop target the two are otherwise identical: both are a wpid and a position. `placeStop` handles both, and a pool row dropped onto a path it is already on is a **move, not a second copy**, which is what the `(tour_id, wpid)` primary key requires.
- **The path's list BODY is a drop target, not only its rows.** Two common cases have no row to aim at: a path with no stops yet, and the gap under the last row, which is where people drop something meant to go on the end. Bound once at startup (`wirePathDropZone`), since the rows are rebuilt on every render and that element is not. The dashed outline appears **only while a drag is live** — drawn always it is chrome, drawn mid-drag it answers "can I let go here?".
- **THE WHOLE ROW IS THE GRIP** (2026-08-17, replacing handle-only). Handle-only protected one real thing — a draggable element cannot have its text selected in Chrome, and copying a stop's address is something people do to these rows — but a 12px glyph is not a discoverable target, and reaching for the row and getting nothing is indistinguishable from the feature not existing. That is exactly how it read. **Both, now**: the row drags, and a `pointerdown` on `.stop-meta` (the address line) turns `draggable` off for the duration of that press, so the text stays selectable; `pointerup` / `mouseleave` / `dragend` all restore it, or one selection would leave the row dead. The same guard catches a press on a button, so a two-pixel wobble on Edit or Add cannot become a drag. **The handle stays** as the visual affordance — it is what says a row can be picked up — but it no longer carries `draggable` itself: on a child of a draggable parent that makes the drag image the glyph alone. The drop indicator is a line above or below the target rather than live reordering — aiming at ten rows that move as you go is hard.
- **Save is delete-then-insert for the whole path, not a diff.** A path is a dozen rows, positions shift wholesale when you move one, and a partial failure leaving two stop 3s is worse than redoing the lot. A crash between the two requests empties the path, which is visible and fixable; a silently wrong order is not.
- **EDIT IS BACK ON A PATH ROW** (2026-08-18), first, left of the three arrows. It had been taken off deliberately and **the reasoning still stands**, so it is recorded rather than quietly reversed: a waypoint LIVES in the library, one row edited once and shared by every path that uses it, and this panel shows that waypoint as a POSITION IN A WALK, so an Edit among the walk's own controls invites the reading that you are editing *this path's copy* of the place. That is the exact misunderstanding the two tables exist to prevent. What outweighed it: this is the panel you are looking at while building, a typo or a wrong address is noticed HERE, and the fix was in the other column behind a search. It opens **the same editor on the same row** as the library's Edit, and the tooltip says so in as many words.
- **ALL THREE EDITS ARE ONE BUTTON SEEN THREE TIMES** (2026-08-18): the path row's, the library row's, and the map popup's. The library's had neither the `.stop-edit` class nor the sentence, so `.stop-actions .btn` squeezed the word into the 30px **arrow** square with its padding zeroed, and its tooltip read three words against the path row's full one. They open the same editor on the same row, so a difference in size or wording is the room claiming they are different doors. It sits outside the arrow set and keeps its own width, because the three arrows are one set about the walk and this is about the place.
- **Remove takes a stop off the path and keeps the waypoint.** That is the entire reason these are two tables. **It is a LEFT ARROW as of 2026-08-18, sitting first, left of the up arrow**, so the row is three arrows saying where the stop goes: back across the gap to the library on the left, up the walk, down the walk. An X or a bin would be a lie about what happens, since the place is kept. **It is INK, not the red pen**: it wore red while it was a button reading "Remove", which read as the destructive control on the row, and it is not one. Only the order changes, and the arrow beside it puts that back in one press. Red on a reversible move in a room built for rearranging warns about nothing, and it broke the set. The three are one fixed 30px square with padding zeroed and the glyph centred, and `.stop-add` out in the library is the same square, being the return trip.
- **THE FOUR ARROWS ARE DRAWN, NOT TYPED** (2026-08-18). They were U+2190..U+2193, which are one family on paper and are not one family on screen: **neither face this page loads carries the horizontal pair.** Measured at 16px, Space Grotesk gives 9.92 for ↑↓ and a flat **16.00** for ←→; IBM Plex Mono gives 9.60 against the same 16.00. A round 1em advance is the signature of a **fallback glyph**, so left and right were being drawn by whatever system font answered, visibly lighter and larger than the up and down beside them. No font swap fixes it, because no available face has all four. `arrowGlyph(dir)` now builds one SVG shaft plus head and rotates it 0/90/180/270, so they are identical by construction, take their colour through `currentColor` (a `.warn` button paints its arrow red, a disabled one dims with the button), and cannot drift when a font changes. **Don't put the characters back.**
- **Path title / shape / city save on change; only the ORDER has a Save button.** Two kinds of save on one screen is confusing, and the order is the one you spend time on and would hate to lose — hence also the `beforeunload` guard.
- **The path id is shown and not editable.** Every `path_stops` row points at it; renaming would orphan them all — the same bargain `anchor_events` makes with its client-supplied primary key.
- **It has a map now** (2026-08-08) and still loads no Leaflet up front: `ensureLeaflet()` injects it the first time a path actually has a point to draw, so the fast first paint the page was built for survives. Numbered pins in path order, green start and red end, a dashed walk line under a white casing — a bare 2px dark line is invisible on satellite tiles — and a toggle for the city's unused waypoints as hollow dots you can click to add. It refits **only when the set of drawn points changes, never on a reorder**; yanking the viewport mid-drag makes the map useless exactly when it is being used.
- **The map reads stored `lat`/`lon` only and never geocodes.** Waypoints pays that 1-request-a-second cost once and writes the point back; this page reads it. An unlocated stop is named in the note rather than drawn.
- **CITY sits left of PATH and narrows it.** The catalogue is every walk in every city and a path's title does not say where it is. The city list is built from the paths themselves so it never offers an empty city; picking one opens the first path there, because a filter that hides the selected row while the picker still names it is the list contradicting itself.
- **The path's own panel carries its controls** (2026-08-18): the City and Path pickers plus New sit in a `.panel-open` strip at the top of it, and Save / Suggest order / Delete sit in its header. Both were a bar across the top of the page, which put the thing you choose a long way from the thing that changes when you choose it, and made Delete sit a few pixels from New while deleting a different kind of thing. The page now has **no top bar at all**, and the Socializer's folder-tab `.command-bar` CSS was deleted with the last fieldset that used it — the cut-panel tokens stay and are what `.panel-open` is painted with.
- **It wears the Socializer's chrome** (2026-08-17), the same port the Tape Room and the Stock Room took: the shared `.room-head` / `.room-title` / `.room-blurb` header out of [admin-shell.css](mc/js/admin-shell.css), the three cut-panel tokens, and the top bar rebuilt as two folder-tab `fieldset.command-bar`s on one `.bar-row` — **OPEN** (city, path, New) and **THIS PATH** (Save, Suggest order, Delete). `#pageStatus` kept its id and became the **red-pen scribble** beside the room name, so every `setStatus()` call still lands; its `.error` / `.success` tones are overridden to `inherit` because the scribble is a red pen whatever the news is. **When any of these rooms' chrome changes, change all of them**; the Socializer is the reference and these are copies.
- **Deriving beats storing:** there is no stored pool-city filter. The path has a city; the pool is that city's other waypoints. Two city controls on one screen can disagree.
- **`cityNameOf` exists because the two catalogues disagree.** `cities.city` is canonical `"Miami, Florida"`; `waypoints.city` and every `paths.city` hold the bare `"Miami"`. A city is **picked** from the catalogue and **stored** bare — store the canonical string and the pool matches no waypoint.

### The Waypoints page was folded into the Path Builder (2026-08-09)

**AND THE DOORWAYS FINALLY AGREED ON A NAME (2026-08-17).** The merge was done in 2026-08, but for nine days the page was still reached under two names — *Waypoints* from the Data Warehouse card and Daily Review's button, *Path Builder* from the nav menu — so it read as two rooms that happened to share a URL, which is exactly the confusion the merge existed to end. Every doorway now names the room and says it does both jobs. The Data Warehouse card **stays**, because that list is indexed by TABLE and `public.waypoints` needs an entry; it is titled *Waypoints & Paths* and its note says it opens the Path Builder.

`mc/data/waypoints.html` — 7,608 lines — **is deleted**. Everything it did is in [mc/pathbuilder.html](mc/pathbuilder.html), reached by popup off whichever list or pin you found the place in. The reasoning was that the catalogue and the walk built out of it are one job, and two rooms meant two copies of the same city, two maps, and a tab-switch in the middle of every edit.

**It is a hard break with no redirect** (GitHub Pages serves no 301), the same as the `/gifts/` and `/highlights/admin/` moves. Every in-repo link was repointed: the nav menu, the Data Warehouse card, `mc/review/index.html`, and Stop Builder's "new waypoint" button.

**Two shared modules came out of it, and they are the point.** This repo already carried the Plus Code codec twice and the waypoints import helper twice, each with a standing keep-in-sync note and a history of drift, so the merge extracted rather than copied:

| module | holds | notes |
|---|---|---|
| [mc/assets/waypoint-geo.js](mc/assets/waypoint-geo.js) | Plus Code codec, the point cache, Nominatim scoring, Fill, ZIP resolution, Wikipedia descriptions, the walk solver, dedupe, the world search | Pure logic — no DOM, no page state, no Supabase. Hand it a waypoint-shaped object, get points and patches back. |
| [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) | the five AI prompts and the schema / import-helper SQL they embed | **The text is the product.** Every clause was paid for by a bad run. Move it, don't rewrite it. |

- **`buildTourPlacesWaypointPrompt` is a scheduled routine's stored specification** — TGB ANCHOR EVENTS opens the file, finds the function, and follows it. It now lives in `waypoint-prompts.js`. **Renaming or moving it breaks that routine silently**, with no error anywhere, and the trigger's stored prompt must be updated whenever the path changes.
- **The editor is one waypoint at a time**, which is what the popup buys. The card page needed a dirty *set*, Save all, per-card Save, an Edit lock so a stray click could not silently alter a description, and a paging guard. A dialog holds a working copy: Save writes it, Close asks and discards.
- **THE EDITOR HAS NO LIVE / SHELVED SWITCH.** It had one for about an hour, in its header beside the WPID. Every waypoint is live, so there is no second state for a switch to show. `payload.archived` is written `false` on every save, so a stray `true` from anywhere is corrected on the way past.
  - It stays in the button row rather than moving into the form, because it **writes immediately** and the form's fields do not, and it sits **first** because it is the one thing there stating what the row currently is: state, then the things you can do.
  - `margin-right: auto` only holds the left end because the switch is the **first child**. Parked mid-row, as it was at first, an auto margin on a wrapping flex line does nothing predictable, and it sat stranded between Duplicate and Delete.
- **`[hidden]` HAS TO BE RE-ASSERTED ON THE EDITOR'S BUTTONS**, and this is the THIRD time this project has been bitten by the same rule. `#wpDlg .btn { display: inline-flex }` is an author rule and `[hidden]` is only a UA-sheet `display: none`, so the author rule wins and `btn.hidden = true` silently does nothing. It surfaced as **DELETE offered on a waypoint that had not been created yet**. `#wpDlg .btn[hidden] { display: none }` is what makes hiding work. Same trap the public soundtracks deck hit with `.sx-modal--inline` and the admin dialogs hit with `section.tool-modal-panel:not([hidden])`.
- **The address placeholder is `123 Main St`, and placeholders are drawn lighter than the text.** It was `200 E Colfax Ave`, which is the real Colorado State Capitol and a real row in this library, so the hint read as a value somebody had typed rather than as an example of the shape wanted. A placeholder that could be mistaken for data is worse than no placeholder.
- **ADMIN DIALOG PANELS ARE OPAQUE** (2026-08-18). `admin-shell.css` painted every one of them `rgba(255, 255, 255, 0.97)`, and 3% is enough to read: the page ghosts through wherever a panel has empty space, which on a dialog foot is exactly the gap left to separate a destructive button from a primary one. A modal already has a scrim to say the page is behind it; the panel does not need to prove it as well. This is the shared sheet, so it fixes **every** admin dialog at once.
- **THE EDITOR'S ACTION ROW IS ORDERED BY CONSEQUENCE** (2026-08-18): `DELETE ⟶ SAVE · CLOSE`, with **FILL up on the head beside the WPID**.
  - **Delete is alone on the far left, as far from Save as the row goes.** It is the only irreversible control there and it used to sit fourth of six, one button from Close, red in the middle of the line where it pulled the eye to the least likely thing you came to do. Destructive-hard-left, primary-hard-right, and the gap between them is the point.
  - **Save sits before Close**, which is the opposite of the usual order and is deliberate. Save is the only filled button; Delete is the only red one.
  - **FIND ONLINE'S BUTTON WAS DELETED** (2026-08-18) and **the dialog behind it was not**. It is still wired and still works, reachable as `TgbWaypointEditor.openFind(seed)`, and **nothing calls it**. It is the only thing in this project that can pull a place out of OpenStreetMap by name, and the search half of `waypoint-geo.js` exists for it. Either give it a door somewhere, or delete `openFindDialog` / `runFind` / `renderFindResults` / `openDraftFrom` / `#findDlg` / the `.find-*` CSS and that half of `waypoint-geo.js` **together**.
  - **THE FOOT IS THREE BUTTONS OF ONE KIND.** Delete destroys the record, Save commits it, Close discards: every one ENDS the dialog and you press each at most once a visit.
  - **FILL IS NOT ONE OF THOSE, which is why it moved to the head.** It is a tool you press repeatedly WHILE editing and it acts on the form rather than on the record, making it the same kind of thing as Open beside the Source box. A row of endings was never going to hold it, and it got moved three times in an afternoon proving that. On the head beside the WPID it reads as "fill this form in", said at the top of the form it fills.
  - **DUPLICATE was deleted** (2026-08-18), and `duplicateWaypointRow` with it. The `.dlg-rule` between the bands and the `.dlg-group` wrapper went too: with one button on the left there is nothing left to separate.
- **EVERY COLUMN IS ON THE FORM** (2026-08-20), and the three that are not are not columns anybody should write.
  - **Editable:** name, description, address, city, **state**, zip, source, **coordinates**, **walk order**, and the whole partner band.
  - **Read-only:** `wpid`, `ai_model`, `created_at`, and the two partner stamps. Provenance and trigger-written values. **Typing over `ai_model` would destroy the only trace of which model produced a bad address**, and "what wrote this and when" is the first question asked of a row that looks wrong, which previously had no answer anywhere on the form.
  - **DELIBERATELY ABSENT: `tour_id`, `tour_title`, `tour_shape`.** Retired in place since paths became their own tables on 2026-08-08 and read by nothing. **A box for a dead column is an invitation to write one.**
  - **THE STATE BOX IS BACK, AND THE RULE THAT REMOVED IT MOVED RATHER THAN BEING DROPPED.** It went because a field with one correct answer is a field that can be got wrong: Nominatim says "Florida" where all 480 rows say "FL", so the city derived it. **What changed is where the derivation applies** — `wpPayload` now fills a BLANK only, because a box that silently discards what you type is worse than no box, and the field carries a **From city** action for when the derivation is what you want. The old cost is back too and is now VISIBLE: change the city and the stale state sits next to it rather than being silently rewritten, one press from correct.
  - **THE COORDINATES ARE EDITABLE AS A PAIR.** They were a read-only reading, on the reasoning that Fill writes them and the map moves them. That holds until both fail at once: a place the geocoder cannot find has no pin to drag, and a coordinate copied off a map was then the only way in and there was none. **Both or neither**, enforced in the field and again in `wpPayload`.
  - **CLEARING A POINT NOW WORKS.** `wpPayload` wrote the pair only when both were present, so emptying the boxes left the stored point untouched and a coordinate you deleted came straight back on reload. A blank, unparseable, out-of-range or 0,0 pair writes NULL, which is what the map already draws as "not located yet".
  - **`walk_order` is a per-city HINT and is not a path position**, said on its own hint so nobody mistakes it for the other thing. A blank is null rather than 0: unsequenced is not position zero.
- **FILL IS THE ONLY LOOKUP, and it fills EVERYTHING blank**: zip, address, coordinates, description and **source url**. Locate was a second button for one of the several fields Fill writes, so it went, and `locateWaypoint` with it; `geo.locate()` is untouched and `fill()` calls it. **Maps went too**: a door out of a dialog you came here to type in. **Nothing sits beside the Coordinates reading now** — `.wp-inline-act`, `.wp-readonly-row` and `openWaypointInMaps` are all gone; `geo.googleMapsUrl()` stays exported and unused here.
  - **To move a point that is already stored**, drag its pin on the map, or edit the address, which clears the pair on save because those coordinates described where the OLD address was. **Fill never overwrites a point that is there** and that is deliberate: a pin somebody dragged into place must not be replaced by a guess.
  - **The field is labelled SOURCE and carries an OPEN button** (2026-08-18). The box holds a url and obviously looks like one, so "Source URL" was naming the format rather than the thing: what it is FOR is the place the claim came from. Open sits beside the box rather than in the foot's button row, because it acts on that one value while the foot acts on the whole waypoint, and it is **disabled until the box holds something that parses as an http(s) url** - a source that will not parse is a source nobody can check, and opening it would put the browser somewhere strange rather than saying so. It is a bordered `.btn`, **not `.ghost`**: borderless is right among other buttons and reads as a stray word beside a text box.
  - **`wpField` takes an `action`**, so any other field can grow one the same way.
  - **The source url is the WIKIPEDIA ARTICLE or nothing.** `resolveWikiTitle` finds it once and the description and the url both come out of it, so a page cannot cite one article and quote another. It is only taken **when the names agree**: Nominatim answers with whatever is nearest, so a geocode of a street address may come back as the cafe next door, and its article would be a citation for the wrong building. A geocoder result is never used as a source: linking openstreetmap.org would cite the thing that *found* the place rather than the thing that says anything about it.
  - **`geo.fill()` short-circuited on the six TEXT fields and never looked at `lat`/`lon`**, so a row with every word filled in and no coordinates answered "nothing blank to fill" and went home. That is the most common state a place arrives in, since an importer can copy an address and cannot geocode it. A missing point is a blank now, `source_url` is on that list too, and both are **reported in the `filled` list** rather than written silently.
  - **AN ADMINISTRATIVE AREA IS NOT A WAYPOINT, and `fill()` used to accept one.** `fillQueries` degrades on purpose: address, then name + city, then **city alone**, then the ZIP. That ladder is right for filling a *city* or a *state* into a row that has an address, and it is a trap for a **point**. A named place Nominatim has never heard of returns nothing at every specific rung, the ladder reaches `Minneapolis, MN`, and Nominatim answers with the city's administrative boundary.
    - **It was not hypothetical.** A bulk fill on 2026-08-18 put **fourteen Minneapolis riverfront markers on 44.9773, -93.2655**, four Denver rows on one corner, four Charlotte markers on one point, and 28 rows in all on six shared city centroids. Every one looked like a success. That is the never-approximate-a-coordinate rule the routine prompts carry, broken by our own code.
    - **A match that is an area now contributes NOTHING** (`isAdministrativeArea`: `type=administrative`, `class=boundary`, or an `addresstype` of city / town / county / state / postcode and the rest), and says *"Only found the city, not this place. Add a street address and try again."* **Refusing only the coordinates is HALF A FIX** and was the first cut of it: the ZIP comes off the same reply, so a marker still collected the city-centre postcode, which is "never guess a ZIP from the city" broken by the same fallback in the same call.
  - **`isFinite(Number(row.lat))` IS THE WRONG TEST AND IT COST THE WHOLE FEATURE.** `Number(null)` is `0` and `Number('')` is `0`, and `isFinite(0)` is true, so an unlocated row read as a row located at latitude zero and every guard written that way skipped the geocoding it was guarding. `hasPoint(row)` checks null / undefined / empty string explicitly and refuses 0,0 outright. **Don't write the short version.**
- **Editing an address clears the stored point** — those coordinates describe where the old address was.
- **Nothing found online is inserted from a results list.** A search result, and a NIGHTLY candidate, opens in the editor as an unsaved draft. The old page inserted your pick and then took you to its card to correct it, which is backwards: the geocoder is usually *nearly* right, and nearly right inserted unreviewed is what fills a catalogue with rows nobody can later tell from real ones.
- **Every search source fails soft.** Overpass is a free endpoint that 504s whenever it is busy; the first cut let that reject the whole search, discarding Nominatim matches already in hand. `search()` reports which sources answered so a partial answer says so.
- **`fillFieldsFromPlace` writes the state CODE.** Nominatim answers `"Florida"`; all 280-odd rows hold `"FL"`. The old page wrote the long form, making rows that look fine alone and sort, group and match differently from every other row in their state.
- **Dedupe warns three times and blocks never** — results list, draft, and Create. One address is routinely several stops (a museum and the sculpture outside it), which is why a conflicting house number vetoes an address match outright while names match on containment and typos.
- **TUCK IN, in the library panel's header** (2026-08-20). Re-sorts the library by **what each place would COST to insert into the open path**, and says which two stops it would go between. RECALC opposite reorders the path; this one tells you what to add to it.
  - **CHEAPEST INSERTION, which is exact rather than a heuristic.** For a candidate C and each consecutive pair (A, B) on the path, `detour = d(A,C) + d(C,B) - d(A,B)` is precisely the metres the walk grows by if C goes between them. The smallest over all pairs is what C costs, and the pair that produced it is where it goes.
  - **THIS IS NOT "WHAT IS NEAR THE PATH", AND THE DIFFERENCE IS THE POINT.** Measured on a straight four-stop test: a place **898 m** from the nearest stop costs **1.8 km** to insert, because it is past the start in the wrong direction and you pay the walk twice; a place **449 m** from the nearest stop costs **0 m**, because it is on the line. A proximity list ranks those two the wrong way round.
  - **BETWEEN, NEVER AT THE ENDS.** A candidate is only offered a slot between two existing stops, so accepting one can never silently change where the walk starts or finishes. Those are editorial decisions, the same ones RECALC asks about.
  - **THE ARROW INSERTS WHERE THE BADGE SAYS.** If the chip reads "between 3 and 4", pressing it puts it between 3 and 4. Appending would make the figure a fact about a position the button then refused to use.
  - **`TUCK_MAX_METRES = 900`.** Beyond that a place is not tucked in, it is a diversion, and offering it as one is what would make the feature untrustworthy. Under 150 m the chip goes green: that is inside the error of a straight-line measure anyway, so it reads as free.
  - **A leg with an unlocated end is SKIPPED, not scored zero**, or an unmeasurable gap would look like the cheapest one on the path.
  - **The cost rides on the row as `__tuck` and is deleted when the mode is left.** These are the shared catalogue objects, not copies, so a stale badge would otherwise survive into the alphabetical list.
  - Straight-line metres, like RECALC and with the same caveat: the map draws a routed pavement line and the two can disagree across a river.
- **RECALC, beside the path panel's legend** (2026-08-20). Each stop becomes the nearest one left. Greedy nearest neighbour, one pass, no lookahead. It rewrites `path_stops.ord` and **leaves it unsaved** so you look at the new shape on the map first; `markDirty` is what makes Save appear.
  - **IT IS NOT THE OLD SUGGEST ORDER, on two counts, both deliberate.** That button chose its own start (the northernmost point) and then ran 2-opt to pull the crossings out. This one is **told where to begin** and does not second-guess the rest, because the first stop of a walk is an editorial decision — where a visitor parks, arrives, or gets a coffee — and it is exactly the thing a solver cannot know. `suggestWalk` in `waypoint-geo.js` is untouched and still does the 2-opt version if it is ever wanted.
  - **The trade, stated plainly:** greedy nearest neighbour paints itself into a corner, so the LAST leg can be a long walk back across everything it skipped. It is a starting arrangement to drag from, not a verdict.
  - **STRAIGHT-LINE METRES, so its answer and the drawn line can disagree** — the map draws a real pavement route, and on a river or a rail cutting they will. That disagreement is one of the two reasons Suggest order was removed; it is accepted here because the button is explicitly a rough first pass rather than a recommendation.
  - **IT ASKS WHICH ENDS TO HOLD** (2026-08-20), in a small dialog: lock the start, lock the finish, both or neither. It used to pin stop 1 always and infer the loop, which is right often enough to be worth doing and wrong whenever the walk is meant to FINISH somewhere in particular: at a bar, at a station, at the stadium. **Both ends are editorial decisions and the solver knows only metres**, so it asks rather than guesses.
  - **UNLOCKING THE START MAKES IT BETTER, NOT WORSE.** With the start free it tries **every stop as the seed** and keeps the shortest walk. On a fifteen-stop path that is a couple of hundred distance calculations and instant, and it is a genuinely better answer than the arbitrary seed the old `suggestWalk` justified with "northernmost, but stable". Measured on a five-stop test: start locked gave 45% shorter, both ends free gave **64%**.
  - **The loop rule is now a DEFAULT rather than an inference.** A path whose last stop repeats its first opens with both boxes ticked, and the note says why. Untick the finish and the loop breaks, which is the honest consequence of the choice rather than something the code quietly prevents.
  - **`walkMetres` returning 0 means UNMEASURABLE, not shortest.** In the try-every-seed loop that zero would win every comparison, so it is scored as `Infinity`. The same null-is-not-zero trap `hasPoint` documents.
  - **A LOOP KEEPS ITS CLOSING STOP.** A path whose last stop repeats its first is pinned at BOTH ends, and nearest neighbour must not be left to place that one: the duplicate is **zero metres** from the stop it repeats, so it is always the nearest thing going and gets taken as stop 2 — silently turning a loop into a walk that no longer comes home. Found by testing, not by reading. Repeats in the MIDDLE are left to the ordinary rule.
  - **An unlocated stop is not a candidate for "nearest" at all**; they keep their relative order and sink to the end, and the message says how many. A first stop with no point is refused outright, since there is nothing to measure from.
  - **It sits on the legend's line, not in the panel header.** The header acts on the PATH — its name, its shape, saving it — and this acts on the ORDER of the list above, which is what the legend is describing. Disabled under three stops, so it says so by being off rather than by answering back.
- **Suggest order rewrites `path_stops.ord`, not `waypoints.walk_order`.** That column is the per-city hint described below and predates paths. Unlocated stops keep their relative order and sink to the end; nothing is written until Save.

### Leaflet was the slow load, not the data

The Waypoints page (deleted 2026-08-09, see the merge note above) loaded Leaflet as a plain synchronous tag in `<head>`: **144 KB from unpkg had to arrive and parse before the page painted anything**, whether or not a map was ever drawn. Once the coordinate backfill removed the runtime geocoding, that was all that was left of "super slow load". `ensureLeaflet()` now injects the CSS and JS the first time a city map is actually built, memoised so ten cards cannot start ten downloads, and resolving even on error — a map that will not load is not a broken page, the cards are the point and they are all still there.

### Suggested stop order — advisory, and NOT a path

Added 2026-08-07: a **Suggest order** button on the Waypoints city view, and `public.waypoints.walk_order` ([2026080705](mc/supabase/migrations/2026080705_waypoints_walk_order.sql)) to store the answer.

**The line that matters:** this is a per-city HINT, not a path. **A game's real ordering is `public.stops.ord`**, because a Stop is game + waypoint + challenge and the same waypoint sits at different positions in different games. Nothing may read a game's path out of `walk_order`, and nothing may write one into it. The page says so on screen — "not saved — set a real order in the Stop Builder" — and the column comment says so in the database.

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
- **The path is a LOOP, and the last stop must be within a five-minute walk of the first.** A walk that ends a mile from where it began is one people have to solve at the end of — they left a car, or came out of a station. Out-and-back is fine; the return leg should use a different street where the grid allows, since retracing identical pavement wastes the second half. This **replaced** an earlier "never send people back the way they came", which said the opposite.
- **Start and end are marked by `walk_order` alone.** Position 1 is the start, the highest position is the end, both must be the commercial food-or-drink stops, and nothing is added to the name or description to say so — the description's only job is to be read aloud at the stop.
- **All six stops must be distinct places**: not one building's two entrances, not "Union Station" and "the Union Station clock", and the last stop is *near* the first, never the same as it.
- **Existing waypoints are a DO-NOT-REPEAT LIST and nothing else** (2026-08-07). They were briefly sent as *anchors* to path around; that was withdrawn because the catalog was accumulated from sources of uneven quality and is not trusted stop-by-stop. The prompt now says so explicitly — if the best six stops in a city sit nowhere near anything we hold, that is the correct answer. `existingWaypointAnchors` still supplies the addresses, which the shared `existingWaypointSample` can't — it returns "Name — City", which is right for a do-not-duplicate list and useless for judging distance.

### TGB CONCERT BOT IS RETIRED (2026-08-28)

Folded into **TGB ANCHOR EVENT BOT**, which now covers concerts: the SeatGeek
sourcing, the spread across cities and acts, and the lead-time rule are all in
[anchor-event-bot.prompt.md](mc/_dev/prompt-tools/anchor-event-bot.prompt.md). **`concert-bot.prompt.md` is deleted**, and
nothing in this repo names the routine any more -- the hub's row and the
PROMPTS.md entry went with it, because a stale trigger id in an `href` 404s
silently.

- **CHECKED BEFORE DELETING THE SPEC, rather than assumed.** Every rule the
  concert brief carried is in the anchor brief except one, and **that one was
  deliberately not imported**: *"the fanbase city, never the venue suburb"*
  contradicts what `venue_city` means here. The anchor spec's own definition is
  the VENUE city -- the Chargers play in Inglewood, the Giants in East
  Rutherford -- and importing the concert rule would have made the two halves of
  one file disagree.
- **THE ROUTINE ITSELF IS DISABLED, NOT DELETED, AND ONLY BECAUSE THIS TOOLING
  CANNOT DELETE ONE.** `RemoteTrigger` has list, get, create, update and run,
  and no delete: a routine is removed at claude.ai/code/routines. **It is safe
  to delete whenever** -- nothing holds `trig_01RY2ktLpjXwNUo4mYTncPBe`.
- **AND IT IS ALREADY INERT.** Its stored prompt says to open
  `concert-bot.prompt.md` and **STOP if it is not there**, filing nothing. That
  guard was written for a spec that had moved; deleting the spec is what makes
  an accidental fire harmless.
- **`tgb_pull_concert_tours` STAYS IN THE DATABASE, retired in place**, called
  by nothing. Dropping is the one irreversible move; the anchor spec already
  says in as many words not to call it.

### TGB ANCHOR BOT — fills `public.events` from anywhere it can (2026-08-25)

`trig_01HKMKbnCyH6WLKuw7ZstY5b`, cron `8 8,20 * * *` — twice daily on the shared
schedule, in the minute TGB WAYPOINT BOT left free. **The spec is
[anchor-bot.prompt.md](mc/_dev/prompt-tools/anchor-bot.prompt.md), re-read every run**, the same arrangement TGB
CONCERT BOT uses: edit the file and the next run behaves differently, with
nothing to redeploy. It stops rather than improvises if the file is missing or
does not open with its own heading.

**IT PULLS EVERYTHING, NOT ONE KIND.** Sport, concerts, conventions, festivals,
expos, from SeatGeek, league and club sites, ESPN, venue calendars.

- **THE ONE HARD FILTER IS A VENUE HOLDING 10,000 OR MORE**, and it separates an
  event that fills hotels from a gig in a room above a pub. **A venue whose
  capacity cannot be established is a row it does not file**: nothing downstream
  re-checks it, so a guess stays wrong forever.
  - **CAPACITY IS NOT IN THE DATABASE AND CANNOT BE.** There is no column, and
    inventing one only a routine writes would be a fact nobody could check. The
    rule lives in the prompt because that is the only place it can actually be
    verified, against the venue's own page. **If it ever needs to be queryable it
    belongs on a VENUES table**, which does not exist.
- **THE WRITE PATH IS `tgb_pull_anchor_events(jsonb)`** — [2026082503](mc/supabase/migrations/2026082503_anchor_event_pull_rpc.sql), **apply
  by hand**. The seventh SECURITY DEFINER pull, for the reason all six others
  exist: `events` is `authenticated`-only and a cloud routine has no secret
  store.
  - **IT IS A SECOND FUNCTION, NOT A WIDENED `tgb_pull_concert_tours`.** That one
    hardcodes `kind = 'concert'` and `source = 'SeatGeek'`, and **those constants
    are its security**. Widening it would mean turning its two safest constants
    into parameters, which is the one change to refuse.
  - **What is still constant here, and still the security:** `status` is always
    `scheduled`, `kind` must be one of the six the page knows, the city must
    already be in `public.cities`, the date must be in the future, and at most
    **60 rows a call**. Sixty rather than ten because the brief is "as many as it
    can" — it is a bigger cap, and it is still a cap.
  - **`on conflict (id)` IS NOT ENOUGH FOR "NO DUPLICATES".** It catches a re-run
    of the same call; it does not catch **the same fixture filed under two ids**,
    which is exactly what happens when one run reads it from SeatGeek and the
    next from a league site. So it also refuses a match on **(start_date,
    venue_city, and either the title or both club nicknames)**.
  - **That natural key is deliberately NOT (date, city) alone**: two concerts in
    one city on one night is ordinary, and so is a doubleheader.
  - **The payload KEYS ARE THE COLUMN NAMES**, unlike TGB CONCERT BOT, whose keys
    are a legacy contract the function maps. What the routine sends is what a
    human sees on the page.
- **IT OVERLAPS TGB CONCERT BOT ON PURPOSE, AND THE DEDUPE IS WHAT MAKES THAT
  SAFE.** Concert Bot files ten concerts at noon through its own doorway; Anchor
  Bot files whatever it finds, twice a day, through this one. **Both write the
  same table and neither can file the other's row twice.** If Concert Bot ever
  looks redundant, disable it rather than deleting it — a trigger id does not
  survive a delete, and this project lost one that way on 2026-08-20.

### TGB ANCHOR EVENTS — a fifth routine, and the only one that reads a page as its spec

`trig_01P6fMZjt4ZapaKVoiCUfGxw`, cron `11 8,20 * * *` UTC — twice a day, **3 AM / 3 PM Central**, moved off its own 4 o'clock pair on 2026-08-15 so every TGB routine shares one schedule. Added 2026-08-07.

**It has no prompt of its own, by design.** Step 1 of its stored prompt is *open [mc/assets/waypoint-prompts.js](mc/assets/waypoint-prompts.js) and find `buildTourPlacesWaypointPrompt` — that function is the specification*. **It said `mc/data/waypoints.html` until 2026-08-09**, when that page was folded into the Path Builder and deleted; the stored prompt was repointed the same day. It now also carries a stop-rather-than-improvise instruction: if the file is missing or the function is not in it, the run reports that the spec has moved again and commits nothing, because the failure it is guarding against is silent — an agent that cannot find its spec will happily write a path from memory. **If these prompts ever move again, update the trigger in the same commit.** Proximity, the address rule, sports-and-music, the commercial start and end, the description voice, `WALK_ORDER_RULE`, the SQL shape: all of it is read fresh each run. The stored prompt only says how the routine **differs**, which is exactly two things — **six stops** instead of 8–12, and it picks its own city. Edit the page and the routine follows; that is the whole point, and it is why nothing here is worth duplicating into the trigger.

- **The city is the FANBASE city, never the venue city** — `teams.fanbase`, so Boston not Foxborough, Buffalo not Orchard Park, Dallas not Arlington, Miami not Miami Gardens. Twelve of the 32 clubs differ, and the venue town is the wrong answer for all of them: nobody sells a walking tour of Orchard Park.
- **It counts rows in `public.paths`, not waypoints, and skips a city at 3 or more.** A city with forty waypoints and no path has *zero* paths and is a strong candidate — a waypoint is a place, and most places are on no path. It picks the fanbase city with the fewest paths and re-rolls the shape if that city already has one of that shape. When every city has three, the run writes nothing and says so — a success, not a failure. (Until 2026-08-08 this counted distinct `waypoints.tour_id`; that column is retired and the routine's stored prompt was updated with it.)
- **It reads Supabase with the publishable key and writes nothing to it.** `tgb_import_waypoints_prompt_items` is SECURITY INVOKER and waypoint writes are `authenticated`-only, so the routine *cannot* insert even if it tried. Its deliverable is a committed `mc/supabase/tours/YYYY-MM-DD-<city>.sql` that a human runs — the same human-in-the-loop split as the waypoint scout, and the reason no new SECURITY DEFINER RPC was added for it.
- **`waypoints` is anon-readable**, which the nightly-scout section of this file denies. That claim is stale: `select` returns all 228 rows with the publishable key, which is what lets this routine count live waypoints per city directly instead of inferring a rotation from git history.

### TGB PATH BOT — the routine that finds walking tours in US NFL cities and files the waypoints and the path (2026-08-18, merged 2026-08-20)

`trig_01HqDJy6BzpU7n23VXv8D1gW`, cron `17 8,20 * * *` UTC — twice a day on the shared schedule. **It commits nothing and writes straight to the database**, which no other routine here does with paths.

**IT ABSORBED TGB WAYPOINT BOT ON 2026-08-20 AND IS NOW THE ONLY WALKING ROUTINE.** Two routines were covering one job from opposite ends and only one of them reached the database: the other swept Wikipedia for loose PLACES in one NFL city and committed `mc/stops/nightly.json` for a human to sort through. **The sweep survives as step 3b of this one's prompt**, as the fallback for a city with no published tour, and lands as a real path with real waypoints. See *THE WIKIPEDIA SWEEP* above for what moved and what was given up; the paste-ready merged prompt is staged at [mc/_dev/prompt-tools/path-bot.prompt.md](mc/_dev/prompt-tools/path-bot.prompt.md).

**ITS SCOPE IS THE 32 US NFL CITIES AND NOTHING ELSE, as of the same day.** No NBA, MLB or NHL, and no international series. See the phase note below for what that replaced.

**What it is for, and how it differs from the routine it now sits beside.** TGB ANCHOR EVENTS DESIGNS a six-stop walk from `buildTourPlacesWaypointPrompt` and commits SQL for a human to run. TGB PATH BOT does not design: it finds a walking tour **somebody has already published** — a historical society, a preservation trust, the NPS, a visitor bureau — and transcribes that walk, in the order its author put it in. The argument is the same one that produced *With AI (tour places)*: somebody already decided the place was worth walking to and wrote down what order to see it in, and that judgement is expensive to recreate and free to read. **Only when no such tour exists for a city does it design one**, out of the Wikipedia sweep it inherited, and it is told to say so in its report.

- **FOUR TOURS A RUN, TWO PHASES, AND BOTH PHASES ARE NOW THE NFL.**
  - **Phase 1 is the NFL, one division a run, in a FIXED CYCLE**: NFC South, NFC East, NFC North, NFC West, AFC South, AFC East, AFC North, AFC West. The run takes the **first division in that list that still holds a city with no path**, and works the cities in it that have none. Deterministic, stores nothing, and cannot go backwards because a city that has a path keeps it.
  - **THE FIRST VERSION OF THAT RULE RANKED DIVISIONS BY RECENCY AND WAS WRONG ON THE FIRST RUN.** It compared each division's newest `paths.created_at`, so one fresh path in ONE city sent the whole division to the back even though its other three had never been walked. New Orleans had a path filed an hour earlier, so **NFC South, the division the rotation is meant to start with, sorted dead last** and the first run went to NFC East. Recency is the right question for a routine that revisits (the soundtrack bot, and the waypoint bot while it existed); **coverage is the right question for one that is filling a map**, and they give opposite answers whenever one city runs ahead of its neighbours.
  - **Phase 2 starts only when all 32 NFL cities hold a path, and it is a SECOND walk in an NFL city**: the four NFL cities with the fewest paths, ties broken alphabetically.
  - **PHASE 2 USED TO LEAVE THE NFL AND NO LONGER DOES** (2026-08-20). It was the NBA / MLB / NHL cities that are not already NFL cities: roughly 20 to 25 towns, Portland, Sacramento, Oklahoma City, Memphis, San Antonio, Salt Lake City, San Jose, Raleigh, Columbus and the Canadian clubs, four a run, alphabetically, US before Canada. That reach was dropped when the routine's brief was narrowed to US NFL cities. **Nothing already filed was touched**: a Portland path from an earlier run is still a path, it simply will not gain a second one from this routine.
  - **THE RPC WAS DELIBERATELY NOT NARROWED TO MATCH.** `tgb_pull_walking_tours` still accepts the `city_name` of any NFL, NBA, MLB or NHL club, so it would happily file a Toronto walk this routine must not file. Three reasons to leave it: narrowing it needs a hand-applied migration against a remote history that has drifted; the guard's real job is stopping an **anon** caller writing an arbitrary path, which it does either way; and the prompt states in as many words that the latitude is not permission. **If the brief ever widens again, only the prompt has to change.**
  - **Breadth before depth, and it is stated twice in the prompt because it is the rule most easily lost**: a city with no walk is worth more than a second walk in a city that has one.
  - **`teams` is where all of this is read from**, never a hardcoded list: it holds NFL 32, NBA 30, MLB 30, NHL 32, each with `conference` and `division`, plus 515 NCAAF programs that are deliberately out of scope (an NCAAF `fanbase` is a SCHOOL, not a city). **The routine now reads it filtered to `league=eq.NFL`.**
- **The city is `teams.city_name`, the bare "New Orleans"**, never `fanbase` ("New Orleans, LA") — that is what `paths.city` and `waypoints.city` both hold, and the RPC refuses the other spelling. Fanbase city, never the venue town, and `city_name` already holds the right answer for all 32 clubs.
- **THE WRITE PATH IS `tgb_pull_walking_tours(jsonb)`** — [2026081804_walking_tour_pull_rpc.sql](mc/supabase/migrations/2026081804_walking_tour_pull_rpc.sql), **apply by hand**. `SECURITY DEFINER`, publishable-key callable, insert-only, the fifth of its kind for the reason all four others exist: a cloud routine has no secret store, and writes to `paths` / `path_stops` / `waypoints` are `authenticated` only. **Its constants are what make it safe to expose to `anon` and must not become parameters**: every waypoint it creates arrives **live** (it arrived shelved for one day; see the all-live section above), the city must be the `city_name` of an **NFL, NBA, MLB or NHL** club, at most 4 tours a call, 4 to 15 stops each, and it never updates a description. **Four leagues rather than one** because the routine works the NFL first and then moves on; a guard that only knew about the NFL would refuse every tour filed after the eighth division.
  - **It takes a bare array OR `{tours: [...]}`.** Over HTTP PostgREST matches a top-level key to a *parameter name*, so the routine posts `{"payload": [...]}`; called positionally in the SQL editor the argument is the array itself. That mismatch already cost this project a fortnight of silently failing statements in the Tape Room's PROMPT dialog, so this one accepts both rather than being right in one place and wrong in the other.
  - **IT STORES `lat` / `lon`, AND THE FIRST VERSION DID NOT.** Both runs on 2026-08-18 geocoded every address with Nominatim, at one request a second, and the function threw all of it away: the two columns were simply missing from its INSERT list. 51 places were filed across four cities that day and **not one of them had a point**, while the ZIPs landed fine, because `zip` was in the list and the pair was not. Nothing errored, so the run reported success. **A column a function does not name is a column it silently discards** -- the same shape of failure as the socials pull returning two counters and hiding which row it skipped.
    - **A pair or nothing.** A `lat` with no `lon` is not half a point, and a stop carrying one of the two would read as located wherever the map looked at it. An unparseable, out-of-range or 0,0 pair is DROPPED rather than raised, the way the soundtrack pull drops a malformed `spotify_id`: a plausible wrong point is worse than a null, and the Path Builder already draws a null as "not located yet".
    - **A reused place keeps the point it had.** The fill-blanks UPDATE writes the pair only when the row holds neither, so a pin somebody has dragged to the right spot by hand is never moved by an incoming guess.
    - **The reply carries `stops_located` and `stops_with_zip`** so the run can check its own work. They count what ARRIVED, not what was stored: a low `stops_located` against a high `waypoints_reused` is fine, against a high `waypoints_created` it means the routine skipped the geocoding.
  - **A refused tour is REPORTED, not raised.** One bad city in a batch of four must not throw away the three good ones — the lesson `tgb_pull_socials_candidates` learned when a row missing a blurb read as a duplicate story. The reply is `{filed, results}` with a per-tour `outcome` of `filed` / `duplicate` / `invalid`, each carrying a reason the routine can act on.
  - **It reuses a place on NAME + ADDRESS, never address alone**, and **keeps the existing description**, exactly as `tgb_import_walking_tour` does and for exactly the same reasons — one address is routinely several stops, and a path must not quietly rewrite a sentence another path depends on.
  - **`clock_timestamp()`, not `now()`, in the `tour_id`.** `now()` is the transaction start and does not move between the four tours of one call, so all four would collide on the id and three would silently merge into the first. That has already happened once in this table.
- **IT REPAIRS FIFTEEN EXISTING WAYPOINTS EVERY RUN**, as a second job after filing the tours — [2026081807_waypoint_gap_fill_rpc.sql](mc/supabase/migrations/2026081807_waypoint_gap_fill_rpc.sql), **apply by hand**. 132 of 463 rows were missing an address, a point, a ZIP or a source; fifteen twice a day clears that in under a week and then keeps up with it forever, at a request rate nobody notices.
  - **`tgb_fill_waypoint_gaps(jsonb)` is the sixth SECURITY DEFINER RPC and the only one that UPDATES**, which is why it took the most care. **It fills BLANKS ONLY**, every column through `coalesce(existing, incoming)`, so a value a human typed always wins and it cannot be used to overwrite anything; calling it twice changes nothing the second time. It can write **address, zip, source_url, lat and lon and nothing else** — not the name, city or description, which are identity and editorial rather than lookups. A coordinate pair goes only into a row holding **neither** half, so a hand-dragged pin is never moved, and is refused if out of range or 0,0. At most 25 rows a call. **Those constants are what make it safe to expose to `anon`.**
  - **THE PROMPT NOW OPENS WITH THE GEOCODER RULES**, before either job, because both halves use Nominatim and it blocked this project on 2026-08-18 when a script ran the whole catalogue twice inside half an hour. It carries a **hard ceiling of ~120 calls a run**, and **stop geocoding entirely on a 429** rather than retrying: filing tours matters more than repairs, and a blocked geocoder is a reason to stop, not to try harder.
  - **NEVER ACCEPT AN ADMINISTRATIVE AREA** is stated in the prompt as its most important check, with the fourteen-Minneapolis-markers-on-one-point story attached, because that is the failure a routine cannot see itself making and nothing downstream will catch.
  - **It prefers rows that will actually resolve**: a real street address with no point is one call from being fixed, while an intersection or a span of street probably cannot be located at all and is skipped rather than having something invented to make it resolve.
- **`tgb_import_walking_tour` is untouched** and stays `SECURITY INVOKER`: one tour, run by a human under their own session from the Path Builder's paste box. Two functions, same three tables, different callers.
- **The TGB PATH BOT button in the Path Builder's ADD bar is a real door**, an `<a>` to the routine. It read "not wired yet" until 2026-08-18, and it sat beside a TGB WAYPOINT BOT door until 2026-08-20; **it is the only bot in that bar now**.
- **ZIP AND COORDINATES ARE PART OF ITS JOB AND HAVE THEIR OWN STEP IN THE PROMPT**, because they are the half most easily skipped and the cost lands on somebody else: an unlocated waypoint cannot be drawn on the Path Builder's map, and geocoding it later costs a human 1.1 seconds a pin at Nominatim's one-request-a-second policy. The routine has the address in front of it already, so it is the cheapest place to pay that. The prompt carries the policy (sequential, 1.1s apart, identifying User-Agent, never parallelised), the accept test (the reply's `display_name` must contain the city asked for), and the standing rule that **a point is never invented or approximated** -- not from the city centre, not from a neighbouring stop, and never an intersection collapsed onto one of its streets, whose centroid can be a mile from the corner. A stop that genuinely cannot be located (an intersection, a span of street, a floor, a moored ship) is filed without one and named in the report.
- **Everything it files lands LIVE**, in the [Path Builder](mc/pathbuilder.html)'s library, ready to put on a walk. It filed shelved for one day, while a review room existed; see the all-live section above for what went with that.

### With AI (more places NEAR one of ours) — the cluster pull (2026-08-20)

A sixth pull in the Path Builder's AI dialog, `buildClusterWaypointPrompt(city, anchor, count, notes)`. **It is a pull, not a new button**: the room already has one dialog with a picker, and a second door to the same idea is how two prompts start drifting.

- **WHAT NO OTHER PULL COULD BE ASKED.** "Sweep one city" returns whatever is standable anywhere in it, and a walk built from that is a taxi ride between good places. This one is told the thing that actually makes a path: **proximity**. Every stop within a ten minute walk, roughly 800 metres, and an outlier is DROPPED rather than the radius stretched to keep it.
- **THE ANCHOR IS THE POINT OF IT.** Pick a waypoint we already hold and the sweep centres on that place: *find me more near this one*, which is the question you have when a path has four stops and needs eight. **The whole ROW goes to the prompt, not the name** — its address and its stored point, so an AI is not sent looking up a place we can already describe exactly. It is also told **not to return the anchor itself**.
- **Blank is a real answer and it is first in the list.** "Anywhere in the city" is what you want before a path exists, and the prompt handles it by picking the densest corner and naming which corner it chose in the first description.
- **The anchor list follows the CITY BOX, not the open path.** Reading `pathCity()` would offer New Orleans waypoints while the field above said Denver. That is also why the city field rebuilds the inputs on change — and only that field, on only this pull, because a rebuild moves focus and doing it everywhere would make the form unusable.
- **Sourced from published walking tours first**, like the tour-places prompt and for a sharper reason: a tour that exists has already decided both that these places are worth seeing AND that they are close enough to walk between, which is exactly the pair of judgements being asked for.
- It shares `WIKI_SOURCE_LINES`, `WALK_ORDER_RULE`, `AI_MODEL_RULE` and `NO_EM_DASH_RULE` with the other five, and returns the same `tgb_import_waypoints_prompt_items` SQL block. **`parseLocation`, not `parseArea`** — there is no such helper, and writing one from memory is how the first cut threw a ReferenceError.

### With AI (sports) — the one importer that appends instead of skipping

[mc/pathbuilder.html](mc/pathbuilder.html) has a fourth AI pull, **With AI (sports)** (added 2026-07-31), and it inverts the rule the other three share. The other prompts start from a city and ask what is in it; this one starts from the football and asks where it happened, keeping the answer **only when the place sits in a city other than that team's home** — a Seahawk's wedding church in New York, a Cowboys lineman's childhood home in Ohio, a Packers coach's grave in Georgia. A Steelers marker in Pittsburgh is explicitly worthless to it. Those stops are invisible to any city-first sweep, because no walking-tour list in Nashville is organized by which NFL team the groom played for.

- **It writes through `tgb_import_waypoints_sports_items`, not `tgb_import_waypoints_prompt_items`** — a second helper in [mc/supabase/waypoints-prompt-import.sql](mc/supabase/waypoints-prompt-import.sql), inlined into the generated prompt by `buildWaypointSportsImportHelperSql()` on the page (keep the two in sync, same as the original). Identical JSON shape; the difference is what happens on a name + city hit.
- **An existing waypoint gets the new sentence APPENDED to its description** rather than being skipped. That is the point, not a convenience: these places are usually already in the catalog for some unrelated local reason, and the football fact is the only new thing the run produced. Skipping would throw away the entire result.
- Re-paste safety comes from three rules in the function: the append is a no-op when the sentence is already in the description; **an archived row is appended to but never un-archived** (archived is a do-not-rescrape tombstone, and the returned `note` flags when this happened); and a non-null `state` / `zip` / `address` / `source_url` is left alone — only blanks are backfilled, so the AI never overwrites a human.
- It is its **own button, not a mode** of the With AI modal, because it has no place to pick — the search is "wherever the football turns out to be", so the mode's city picker would sit empty. One number, one button.

---

## PARTNERS — venues that will host visiting fans (2026-08-20)

> **A PARTNER IS A WAYPOINT.** It is a bar, brewery or other public food-and-drink room that will host visiting supporters of a rival fandom, wanted as the **last stop of a GAME run the day before the ANCHOR EVENT**. It is a row in `public.waypoints` carrying a `partner_status`, edited in the **Path Builder**, and filed by **TGB PATH BOT**.
>
> | | |
> |---|---|
> | **where** | [mc/pathbuilder.html](mc/pathbuilder.html) — the `PARTNERS n` filter in the library header, and the partner band in the waypoint editor |
> | **table** | `public.waypoints`, columns prefixed `partner_` |
> | **routine** | TGB PATH BOT, step 8 of three jobs |

Migrations: [2026082001](mc/supabase/migrations/2026082001_partner_venues.sql), [2026082002](mc/supabase/migrations/2026082002_partner_suggested_teams.sql), [2026082003](mc/supabase/migrations/2026082003_partners_onto_waypoints.sql). **Apply by hand**, in that order. The third is the one that matters now; the first two are history it supersedes.

### IT WAS A ROOM AND A ROUTINE FOR ONE DAY, AND BOTH ARE GONE

Built on 2026-08-20 as `mc/partners.html` plus a private `public.partner_venues` plus TGB PARTNER BOT, and collapsed the same day. **Both halves came apart for the same reason: a partner is not a new kind of thing.**

- **`partner_venues` was merged into `waypoints`** once the privacy argument for splitting them was withdrawn (see 2026082003 for the argument and what it costs). **A partner candidate is a waypoint with `partner_status` set**; the column being null is what "not a partner" means, so no second row can disagree with the flag.
- **`mc/partners.html` was DELETED** the moment the columns moved. It was a second list of the same rows, with a second set of boxes writing the same table, behind a second door. Everything it did is now the library's `PARTNERS` filter and the editor's partner band. Its card on `/mc/`, its nav group and its `room-blurbs.js` key went with it. **A hard break with no redirect**, as always here.
- **TGB PARTNER BOT was folded into TGB PATH BOT** as its third job. Same cities, same table, same doorway: filing a partner IS filing a waypoint, so two routines meant two runs a day reading the same NFL schedule and writing the same rows. **The old trigger (`trig_01VcgCjs3AWwrJbdUTYqVVcB`) is DISABLED, not deleted** — a delete is irreversible and this project lost a trigger id that way earlier the same day. Delete it once the merged step has run a few times.

### What survived, and where it lives

- **THE EDITOR'S PARTNER BAND** ([waypoint-editor.js](mc/assets/waypoint-editor.js)) is **collapsed until it applies**: 475 of 480 waypoints are not partners, and a dozen empty contact boxes under every statue would make the common case worse to serve the rare one. A checkbox opens it, and it opens itself for a row that already carries a status.
  - **Unticking clears `partner_status` and nothing else.** The status is the flag; leaving the contacts alone means ticking it again brings back what somebody typed rather than making them find it twice. **`wpPayload` then nulls the whole set on save**, because a phone number on a row nothing calls a partner is a state nobody could interpret.
  - **`partner_teams` is comma-separated in the box and an ARRAY in the column**, and the two dates are DATES — which is why neither is in `WP_FIELDS`: that loop writes `'' || null`, and **Postgres refuses `''` for both types**.
  - **The band is not offered against a database without the columns.** `wpCols.partner` is probed like `source_url` and `latlon`; a tick box that silently fails to save is worse than no tick box.
- **THE LIBRARY'S `PARTNERS n` FILTER** narrows the Path Builder's left panel to partner rows, and **cuts across the city test rather than sitting inside it**: "who have we lined up" is a question about the whole catalogue, and answering it only for the open city would hide the ones you have elsewhere. The button hides itself when there are none, and turns the filter off with it.
- **A partner row says so wherever it appears**, in or out of the filter, with a `partner: approved` chip. Only approved is in colour, because it is the one that changes what you would do with the row; declined is dimmed, being a closed question rather than a warning.
- **The three RPCs are unchanged in name and reply shape**, so the routine's prompt needed no edit when the table moved: `tgb_pull_partner_candidates` (still `SECURITY DEFINER`, still writes `candidate` and nothing else, still never overwrites a row already on file), `tgb_partner_coverage` and `tgb_partner_cities`. The two readers are no longer `SECURITY DEFINER`, because `waypoints` is anon-readable and a function that need not elevate should not.

## Prompts and routines: the map is [mc/_dev/prompt-tools/PROMPTS.md](mc/_dev/prompt-tools/PROMPTS.md)

Every AI prompt here is either a **page prompt** (in this repo, copied into a chat AI by a human, deliverable is SQL) or a **routine prompt** (stored on a trigger at claude.ai, runs unattended, writes through an RPC itself). They are near-copies with different last steps, and the editorial rules have to be kept in step **by hand**. That file is the table of which page pairs with which trigger, with cron and write path for each. **Open it before editing either half of a pair.**

**You can edit a routine from here** with `/schedule` or the `RemoteTrigger` tool; you do not have to go to the website. This file said otherwise by implication for a long time and it was wrong.

**THE PAGE AND ROUTINE PROMPTS WERE RESYNCED ON 2026-08-21**, after the page's card was rebuilt and the two drifted. Three things were wrong and all three are fixed in both copies:
- **The routine still forbade a video naming any account but YouTube** (`EXACTLY [{"name": "YouTube"}] AND NOTHING ELSE`), which the page had already reversed. Left alone, the next run would have filed its video with the other three accounts vetoed.
- **The page contradicted itself.** Step 2c said a video may also name Facebook, Instagram or Threads; step 6 said YouTube appears "alone, and NOWHERE ELSE", and claimed X and YouTube "were removed on 2026-08-07 and render as nothing" two lines after saying X came back. The same false claim was in the `tgb-agent-context` block.
- **Both described a Post button and a Copy button that no longer exist.** They now describe one button per account plus ALL.

**THE ROUTINE EDIT SENT THE COMPLETE `job_config`** and was verified by reading the reply back: the model pin, the git source, all twenty `allowed_tools`, the environment id, the cron, `enabled` and the email flag all survived, plus a landmark from each of the eight steps. **That verification is the point** — a partial `job_config` has silently wiped the model pin and the whole prompt on this project before.

**THE CAPTION RULES WERE REWRITTEN ON 2026-08-21, in both prompts.** The old rule was "one or two sentences: curious, specific, dry" with place optional. It is now:
- **TWO SHORT COMPLETE SENTENCES**, 120 to 160 characters, hard cap still 200. **A fragment reads like a label somebody typed into a form; a sentence reads like a person who saw the thing.**
- **FUNNY THE DRY WAY.** The joke is in the observation, never a pun, an exclamation mark or a wink. **Never at anybody's expense** — a caption that makes a town the punchline is one that town will find.
- **THE CITY AND THE STATE IN EVERY CAPTION**, not just the gift, and **split across the two sentences** where it works: a comma-joined pair is an address label, while the city in one sentence and the state in the next is two people talking. Outside the US the state becomes the country. **A story with genuinely no place names the largest honest one and NEVER invents a location**, which would be a lie about a real thing and is the failure the whole prompt exists to prevent.
- **Step 3 now captures the place while the article is open**, alongside the og:image, because reconstructing it later from a headline is how a guess gets in.

**DEDUPE ALREADY COVERS REVIEW, POSTED AND SKIPPED ALIKE**, verified against the live database rather than read off the SQL: `tgb_socials_filed_urls` and the pull RPC's own check both filter on url alone with no `status` predicate, so a story in any state is refused. **Gift urls are the deliberate exemption** and were the only 18 posted rows absent from the reader. **The one real gap is the WINDOW**: the reader defaults to 90 days while the RPC's check is all-time, so a story older than 90 days can still burn a pick before being refused. Harmless until roughly November 2026, since the table only starts on 2026-08-05; **both prompts now pass `?days=365`** and both say in as many words that a url on the list may be in review, posted or skipped and that all three mean the same thing to the bot.

**Two crons in this file had silently gone stale** and were caught on 2026-08-15 by reading the live triggers: the soundtrack bot had reverted to `30 11` once daily, and the waypoints bot was not on `45 11` as written. Both are fixed, and all five TGB routines now share one schedule. **The lesson stands: the trigger is what runs, this file is a description of it.** `RemoteTrigger {action: "list"}` is how to check, and it is worth doing before trusting any cron written here.

**NO EM DASH in a prompt, or in anything a prompt hands back** (2026-08-15). Not the character, not `&mdash;`. It covers captions, headlines, blurbs, tour-stop descriptions, internal notes, closing summaries and any HTML email a routine produces. Two reasons: it is the clearest single tell that a machine wrote the line, and most of this output goes out under our name; and **a prompt full of them teaches the model to write them back**, so the prompts carry none either and each says so about itself. Canonical wording lives in `mc/_dev/prompt-tools/no-em-dash.mjs`. **All five TGB routines and every repo prompt were swept on 2026-08-15**; the six personal routines (GTD briefs, inbox blitzes, the Supabase backup) were deliberately left alone, since nothing they write leaves your own inbox. **Code comments are exempt** (no model reads them as instruction), which is why `node mc/_dev/prompt-tools/scan.mjs` exists rather than a blanket grep.

---

## THE GIFT SHOP (the room) — the gift shop admin page

**RENAMED FROM STOCK ROOM ON 2026-08-20, AND THE NAME NOW COLLIDES THREE WAYS.**
That is worth stating before anything else, because STOCK ROOM existed precisely
to prevent it:

| the name | what it is | how to tell |
|---|---|---|
| **GIFT SHOP** the room | [mc/gifts/index.html](mc/gifts/index.html) | `/mc/gifts/`, admin-gated |
| **the gift shop** the shop | [gifts/index.html](gifts/index.html) | `/gifts/`, what a buyer sees |
| **TGB GIFT SHOP BOT** | the routine that files books into the room | a trigger at claude.ai |

**THE PATH IS THE DISAMBIGUATOR NOW.** `/mc/gifts/` is the room; `/gifts/` is the
shop. Getting those two confused was already called the single easiest mistake to
make in this repo, and it just got easier: they no longer have different names.
**When it is not obvious from context, write "the GIFT SHOP room" or "the public
shop".**

**THE HUB'S BUTTON STILL READS `GO TO STOCK ROOM`**, deliberately left alone.
That means the card's heading and its button now disagree, which breaks the rule
recorded under Ancillary Things that the `GO TO` button repeats the heading so it
reads as a door rather than a second title. Left as asked; change both together
if it is ever revisited.

> **"GIFT SHOP" (the ROOM) means [mc/gifts/index.html](mc/gifts/index.html).** Nothing else. It is the room's name on screen (the `<h1>`), it is what to call it in conversation, and an instruction naming it — *"add a button to the GIFT SHOP"*, *"the STOCK ROOM is showing the wrong count"* — is an instruction about that one file. **STOCK ROOM still resolves here**: it was this room's name until 2026-08-20 and is the word most in-repo prose still uses.
>
> | | |
> |---|---|
> | **file** | `mc/gifts/index.html` — one self-contained page: markup, CSS and script together, plus the AI prompts in dialogs |
> | **live** | <https://thegamebureau.com/mc/gifts/> — public HTML on GitHub Pages, gated by the admin sign-in |
> | **tables** | `public.gift_shop_items` (the gift) + `public.gift_shop_listings` (where to buy it) |
>
> **THE PUBLIC SHOP IS [gifts/index.html](gifts/index.html) AT THE ROOT** — a different file with a nearly identical path. `/gifts/` is what a buyer sees; `/mc/gifts/` is where you stock it. Getting these two confused is the single easiest mistake to make in this repo.
>
> **Don't confuse it with TGB GIFT SHOP BOT** either, which is the routine that files book candidates *into* it — a trigger at claude.ai, not a page.

- **Same three states as the Tape Room, derived the same way**: **REVIEW** = both stamps null and the automatic state, **LIVE** = `certified_at` set, **SHELVED** = `rejected_at` set. The daily book pull writes REVIEW candidates and can never publish; a human decides. The public shop reads the **item's own** `archived` / `certified_at`, which is why `gift_shop_listings.live` is vestigial — see the socials note above for the day that cost 532 pickable gifts.
- **Edits are batched, not saved per card.** Changing a field marks the card dirty; **SAVE ALL CHANGES** in the header writes every dirty item at once, and a `beforeunload` guard catches you leaving with unsaved work. Same bargain the Path Builder's order makes.
- **The list pages at `ITEMS_PAGE_SIZE` (10)** with a "more" footer rather than rendering the whole catalogue — it is past 600 gifts.
- **A duplicate URL is caught and translated.** `gift_shop_items.url` is unique; a 23505 on it becomes plain English rather than a raw Postgres error, the same courtesy the Tape Room extends to its title+artist index.
- **Last-run staleness is `BOOK_PULL_STALE_HOURS = 14`**, matching the Tape Room's `REVIEW_HOURS`: the bot runs twice a day, so 14 hours means one missed run shows rather than needing two.

### It wears the Socializer's chrome (2026-08-15)

Brought into line with [mc/socializer/index.html](mc/socializer/index.html) and the Tape Room in one pass. **When any of the three changes, change all three**; the Socializer is the reference and the other two are copies.

- **The cut-panel tokens were a neutral grey** (`--cut-panel-bg: #eef0f4`, both line tokens aliased to `--line`) — exactly the "faint box" state the Tape Room was in before its own pass. Now `#e4ecfa` with the two line tokens at 0.38 / 0.3 alpha, plus the tighter `0 1px 4px` cushion, so the bars read as defined panels.
- **Folder-tab legends** on `.command-bar`, `.toolbar` *and* `.btn-fieldset` — the `::before` arch, copied verbatim including `isolation: isolate`. The old `.btn-fieldset > legend` rule was deleted rather than left to fight it.
- **`#shopStatus` IS the red-pen scribble.** It was a muted line under the title carrying "Saving 3 changed gifts…", "All changes saved." and errors; it is now the `.room-scribble` beside the room name. **No JS changed** — every `setStatus(shopStatus, …)` call already aimed at that id. The `.success` / `.error` tone classes are overridden so they cannot repaint the pen.
- **A standing tagline** (`.room-blurb`, the shared class from `admin-shell.css`) says what the room is for. It is not a status line and must never be borrowed for one.
- **The last-pull line is the TGB GIFT SHOP BOT button's tooltip**, with `.btn.is-stale` giving that button a red edge when the pull is overdue — identical to the Tape Room. `paintShopRunHeader` is the single painter and was repointed; the `.run-status` dot markup under the title is gone. **The `.run-status` CSS that remains is the bot MODAL's** (`#bookPullStatus`), which is a different, boxed presentation and still in use — don't delete it as dead.
- **Not done in this pass**, and still `<select>`s: the city / status / sort filters in the FIND bar. Turning the status filter into the Socializer's segmented tabs with live counts is the obvious next step, since a closed dropdown cannot say how many gifts are waiting in Review.

## Gift shop daily book pull — also a Claude Code routine

Candidate books are added by a **scheduled Claude Code cloud agent** ("TGB GIFT SHOP BOT", `trig_01H7cKJ4fk5bA1NWSqPZi4ah`, cron `2 8,20 * * *` UTC — **twice a day**, 3 AM and 3 PM Central (2 o'clock in winter; nobody adjusts)), managed at [claude.ai/code/routines](https://claude.ai/code/routines). Each run picks the city with the fewest gifts, web-searches five books, verifies every ISBN against a real listing page, and files them as **Review candidates**. It commits nothing — the write lands in Supabase.

**US CITIES ONLY, since 2026-08-18**, and the `country_code=eq.USA` filter on its `cities` read is doing **two** jobs. The obvious one is the brief: the shop pitches US cities and a non-US city already carrying stock simply keeps it. The one that was silently broken is the other: **`public.cities` is 1,451 rows and PostgREST caps a response at 1000, truncating with no error**, so the unfiltered read this routine had been making handed it the alphabet to roughly M *looking complete* and every city after that was invisible to it. Filtered to the US it is 595 rows, comfortably under the cap. Exactly the trap the Tape Room's PROMPT dialog documents for the same table. It also now reads **`hide_from_gift_shop`** rather than the deprecated `ignored`, falling back to `ignored` when the column is absent.

**Auth without a secret.** A cloud routine has no secret store, so it calls **`tgb_pull_book_candidates(jsonb)`** ([mc/supabase/migrations/2026072802_book_candidate_pull_rpc.sql](mc/supabase/migrations/2026072802_book_candidate_pull_rpc.sql)) with the ordinary public publishable key. That function is `SECURITY DEFINER` and deliberately tiny: it can only INSERT rows with `archived = true` / `certified_at = null`, derives the Bookshop URL and cover from the ISBN so a caller can't inject a link, keeps the title/URL dedupe, and caps a call at 25 items. **Don't add parameters for `archived` or `certified_at`** — those constants are what make it safe to expose. The admin-facing `tgb_import_bookshop_prompt_items()` is unchanged and stays SECURITY INVOKER.

**Why not GitHub Actions:** it used to be `.github/workflows/shop-book-pull.yml` + `mc/_dev/scripts/shop-book-pull.mjs`, both **deleted 2026-07-28**. Two reasons. It needed a funded `ANTHROPIC_API_KEY` (the same unfunded key that killed the soundtrack workflow), and its schedule had silently stopped working: crons fired at `:55`, GitHub started scheduled runs up to 30+ minutes late, and the Central-hour guard then skipped every job while the run still reported **success**. Green runs, no books — last real insert was 2026-07-26. If you ever reinstate a cron guard, gate on a *window* of hours, never hour equality against a `:55` trigger.

Last-run status lives in the **TGB GIFT SHOP BOT** modal in [mc/gifts/index.html](mc/gifts/index.html) (called NIGHTLY until 2026-08-01; the ids in the markup are still `nightlyBtn` / `nightlyModal`). Since the job commits nothing there is no commit feed to read, so the panel treats **the freshest Review candidate as the run receipt** (`archived = true and certified_at is null`, newest first). It went twice-daily on 2026-08-01, at which point `BOOK_PULL_STALE_HOURS` dropped from 30 to **14** so one missed run shows rather than needing two.

---

## Stops and Challenges

The canonical hierarchy finally has tables behind it, as of 2026-07-30 — [mc/supabase/migrations/2026073003_stops_and_challenges.sql](mc/supabase/migrations/2026073003_stops_and_challenges.sql).

> **PARKED 2026-08-09.** Stop Builder is **off the Mission Control menu** and its file is renamed **[mc/_stops.html](mc/_stops.html)** — the leading underscore marks a room that is still live but is not offered. It is the only writer of `public.stops`, which the two game editors read through the `game_stops` view, so it cannot simply be deleted. Reach it by typing the URL.
>
> **Why:** `public.stops` is keyed by **city**, so every game in a city shares one list and **a city cannot have two different walks**. That is precisely what `public.paths` + `public.path_stops` were built to fix (2026-08-08), so the product now has two systems ordering the same waypoints — 41 stop rows across 14 cities against 24 path_stops rows across 4 paths, and only **1 of the 41** stops has a challenge attached.
>
> **The end state** matches the canonical hierarchy already written above: `path_stops` gains `challenge_id` and `end`, a game points at a `tour_id` instead of inheriting its city's list, the Path Builder grows a challenge picker, and `public.stops` + `game_stops` + `_stops.html` all retire. That touches **both engines** — the paid product — so it is a deliberate piece of work, not a follow-on.

- **`public.stops`** is a Stop: **`city_slug`** + `waypoint_id` + `challenge_id`, plus `ord` and `end`. **It is keyed by CITY, not by game** — this file said `game_id` until 2026-08-09 and was simply wrong; the column does not exist and PostgREST 400s on it. Every game in a city shares that city's stops, and **`public.game_stops` is the view that projects them back per game**, which is what makes the editors' "stops for game X" query work unchanged. It **supersedes `public.maps`**, which held these rows without the challenge. **`maps` is left in place but unread**, the same way `gift_shop_cities` was retired; the `drop table` sits commented at the bottom of the migration. Don't write `maps` again.
- **`public.challenges`** is the playable content: `name` (admin label), `prompt` (what the player reads), `answer`, and `kind` ∈ question | minigame | photo | freeform. **A challenge is reusable** — `challenge_id` is a plain FK with no unique constraint, so one challenge can sit at many stops and editing it changes all of them. Same bargain the waypoints catalog already makes.
- **`challenge_id` is nullable on purpose.** A stop is worth recording as soon as you know where it is; forcing a challenge up front would mean inventing filler to save a path. The builder shows those as "needs a challenge".
- **A unique index on `(city_slug, waypoint_id)`** means one place appears at most once in a city's list. `maps` never enforced this and the mapper's delete-then-insert save hid it.
- **The editor is [mc/_stops.html](mc/_stops.html)** ("Stop Builder"), off the menu since 2026-08-09 — see the note above. **Fourth address:** it began at `mc/stops/stops.html`, moved to `games/admin/stops.html` on 2026-07-31 "to sit with the other game tools", came back to `mc/stops.html` on 2026-08-07 when those tools moved, and took the underscore when it was parked. **`/mc/_stops.html` and `/mc/stops/` were different live things** until 2026-08-20: the folder held `nightly.json`, which the scout routine committed at that path. That routine is retired and the file is deleted, so **the folder is now empty** and the only reason to remember the distinction is that the two names still look related and are not. Its other half was `mc/data/waypoints.html` ("**Waypoints**", "Waypoint Finder" until 2026-08-07), which moved out of `mc/stops/` on 2026-07-31 and was **deleted on 2026-08-09** when it was folded into [mc/pathbuilder.html](mc/pathbuilder.html) — see the merge note above. Stop Builder's "new waypoint" button opens the Path Builder now. The old path builder `mc/mapper.html` was archived on 2026-07-30.
- **`mc/profiles.html` and `mc/builder.html` read `stops` now** (`select=waypoint_id,ord,end`, unchanged — those columns carried over) and remain **read-only on the path**: they synthesize one stop node per waypoint and never write it. The engines never read `maps` and don't read `stops` either.

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

**[mc/greenroom.html](mc/greenroom.html)** is where guides are added, written, illustrated and deleted. It replaced `mc/guides.html`, **deleted the same day** — that page was one card per GAME, which is the shape the migration exists to undo. Styled on [mc/socializer/index.html](mc/socializer/index.html), and it is the **Guide Green Room** card in the Game Elements group of the nav.

- **The card shows no game information at all**, by design. The moment a card lists the games a guide fronts it becomes a report about games instead of a place to write a character.
- Every column is an editable box on the card; **an empty one is bordered pen-red** — no chips, no error text. Roughly half the catalogue has no background, so that wall of red is the honest state of it rather than a fault. (Don't record live counts here; the table is edited daily and a number in this file rots within hours — 34 guides on the morning of 2026-08-09 was 28 by the afternoon.)
- **Nothing autosaves.** Typing edits a per-guide draft; Save writes it. **Both prompts read the draft, not the saved row** — the image prompt used to read the row, so a background typed and not yet saved was silently ignored.
- **FILL is deterministic and does not call an AI.** It fills empty boxes from full ones: `hometown` from the first catalogue city named in the guide's own text (earliest mention wins, case-sensitive — *mobile*, *reading* and *hope* are all real cities), and `bio` from the background's own summary sections, **rewritten into first person** because the bio is the guide speaking. That rewrite is mechanical and imperfect on purpose; it lands in an unsaved box.
- **Delete is the only way out** and it is irreversible. `games.guide_id` is `ON DELETE SET NULL`, so it leaves every game using that guide without one — and this page cannot show how many that is.

### The two prompts

- **The guide brief** (PROMPT, in greenroom.html) describes **a person, not a product**. It says nothing about games, tours, matchups or opponents: a guide is used in many cities, so it must identify with its **hometown** and never with wherever it happens to be guiding. The notes box on that dialog is folded in verbatim and marked *treat as fixed*.
- **The portrait prompt** lives in [mc/picmaker/prompts.js](mc/picmaker/prompts.js), shared with the picmaker page. It demands a **cartoon** — "polished, stylized illustration, not a photograph" was read by image models as permission for a photoreal render, and a guide who looks like a real person implies a real person. It also demands the artwork **fill the square**: "safe to crop to a circle" was being read as an instruction to draw one.

### Every admin popup wears the Socializer's look

Mission Control had grown a dialog vocabulary per room — `.tool-modal-panel` (socials), `.prompt-dialog` (Data Warehouse), `.add-gift-modal` (gift shop), `.dlg-panel` (Path Builder) — each with its own scrim, radius, shadow and header. The socials look now lives in **[mc/js/admin-shell.css](mc/js/admin-shell.css)** with every other vocabulary aliased onto it.

- It overrides **appearance only, never layout**. Each page shows its dialog its own way (a flex overlay toggled by `.is-open` here, `[hidden]` there); restyling that from a shared sheet would break show/hide on pages nobody is touching.
- **`admin-shell.css` must be linked AFTER the page's own `<style>`** — that is how these rules win without `!important`, and it is what the note at the top of that file has always meant. The Green Room had it in `<head>` first and the shared rules silently did nothing there.
- `mc/profiles.html` and `mc/builder.html` were **not** swept (211 dialog references each) and neither was the `highlights` image lightbox, which is a photo viewer rather than a dialog.

---

## Anchor events — the real-world events games are built around

**THE COLUMNS ARE THE PAGE'S WORDS AS OF 2026-08-25** — [2026082502](mc/supabase/migrations/2026082502_events_columns_match_the_page.sql), **applied**.
`event_date` is `start_date`, `venue_name` is `venue`, `city` is `venue_city`,
`away_locale`/`away_mascot` are `away_team_geo`/`away_team_nickname`,
`away_label` is `away_team_name`, `away_score` is `away_team_score`, and the
same four for home. The triggers are `tgb_events_*`. **Verified against the live
table**: all eleven old names 400, all eleven new ones 200, 603 rows with
nothing lost, and every `away_team_name` agreeing with its two halves.

**`venue_city` KEEPS THE CANONICAL COMPOSITE and gained five derived parts** —
`venue_city_name`, `venue_state_code`, `venue_state_name`, `venue_country_code`,
`venue_country_name` — filled by `tgb_sync_events_geo` from `tgb_parse_geo`,
the pattern `games`, `teams` and `cities` already use. **A US row carries BOTH a
state and a country** (WA *and* USA), exactly as `cities` does; the eleven rows
with no state are the eight non-US venues. The migration's own verify note
predicted "exactly one of the two" and was wrong, which is left written down
there because the next reader will guess the same way.

**THE BACKFILL HAD TO MOVE, AND ONLY A REAL RUN SHOWED IT.** A no-op
`update ... set venue_city = venue_city` fires EVERY before-update trigger, not
just the geo one — so at the end of section 2 it ran while the OLD
`tgb_anchor_events_sync_labels` was still attached, still reading
`new.away_locale`, a column section 1 had renamed away four statements earlier:
`42703: record "new" has no field "away_locale"`. **A backfill that writes rows
must come after every trigger on the table is consistent with the new shape.**
The file is one transaction, so the failure rolled back cleanly and cost
nothing.

**THE TABLE IS `public.events` AS OF 2026-08-25**, renamed from
`public.anchor_events` by [2026082501](mc/supabase/migrations/2026082501_anchor_events_becomes_events.sql), **apply by hand**. The qualifier was
distinguishing it from a thing that does not exist: nothing else in the database
calls itself an event. **GAMES are built on top of these rows and are their own
table.** [20260720_anchor_events.sql](mc/supabase/migrations/20260720_anchor_events.sql) created it and
`games.anchor_event_id` is a FK to it, so the migration filenames and that column
still carry the old word — see below.

**THIS ENDED THE ROOM'S THREE MOVES IN THREE DAYS.** `mc/data/events.html`, then
`mc/anchor_events.html` on 2026-08-23 to name the table, then
`mc/events/index.html` on 2026-08-24 to follow the folder convention. **Each move
traded one rule against the other because the room and the table were called
different things.** Renaming the table is what stopped the trade; the path, the
room and the table now agree. The standing "do not create a `public.events`
table" warning is retired with it — it IS that table.

**WHAT A TABLE RENAME BREAKS, AND WHAT IT DOES NOT.** Worth knowing, because the
list is shorter and sharper than it looks.
- **SAFE, following the table by OID rather than by name:** `games.anchor_event_id`'s
  foreign key, all three triggers, and all three trigger FUNCTIONS — which read
  `new.*` and never name the table.
- **BROKEN, and repaired in the same migration: `tgb_pull_concert_tours`.** A
  plpgsql body is stored as TEXT and resolved at runtime, so `insert into
  public.anchor_events` would have raised `42P01` on **TGB CONCERT BOT's next
  unattended run, at noon, with nobody watching.** That is the one thing a rename
  silently arms here.
  - **IT IS RE-CREATED FROM THE LIVE DEFINITION, not from the repo's copy.**
    `pg_get_functiondef`, one identifier replaced, `execute`. **A `create or
    replace` rewrites the WHOLE function** and this project has already lost a
    column that way — 2026081302 rebuilt the socials pull's INSERT list and
    dropped `confidence` for five days. Changing one identifier cannot drop
    anything, and it repairs whatever is actually installed even if that has
    drifted from the file.
- **The indexes, the primary key and the policies are renamed by scanning the
  catalog**, not by listing the five names this repo happens to know about — so
  anything added by hand in the dashboard moves too. A table called `events`
  whose key is `anchor_events_pkey` half-remembers its old name.

**NO COMPATIBILITY VIEW, DELIBERATELY, AND THIS DEPARTS FROM THE routes -> paths
PRECEDENT.** That rename left read-only views at the old names because its
consumers were spread across two engines and could not all be enumerated. **Here
they can, and there were five**, all in this repo: the room, `mc/marquee.html`,
the Data Warehouse card, TGB CONCERT BOT's prompt file, and the function above.
A view would guard against nothing but our own oversight and would **hide** it —
the same failure that got the soundtracks JSON fallback deleted, where a stale
file rendered perfectly and told nobody the tables were unreachable. `PGRST205`
names itself; let it.

**`games.anchor_event_id` IS NOT RENAMED, AND THAT IS A DECISION.** The column
still describes what it holds. Renaming it would touch `public.games`, which
**both engines read with `select=*` at play time** and which is the paid product.
`games.anchor_event_id -> events.id` reads perfectly well. Do it on its own day.

**THE CHOOSE EVENT PICKER IS IN [mc/marquee.html](mc/marquee.html), NOT `mc/profiles.html`**, which is
what this file said. Worth knowing before somebody greps for it.

**THE OLD NAME SURVIVES IN THREE PLACES ON PURPOSE**: the migration FILENAMES,
which are history; the trigger names (`tgb_anchor_events_sync_labels` and the
other two), which are identifiers the `label-drift` finding names out loud; and
`games.anchor_event_id`. Renaming the triggers would mean editing that finding's
message for no gain — the same bargain the Tape Room made through four renames of
its verbs without the column following.

**Don't create a second `events` table**, or the builder's Choose Event picker in
[mc/marquee.html](mc/marquee.html) will silently ignore half the catalog.

[mc/events/index.html](mc/events/index.html) ("Anchor Events", added 2026-08-01) is the editor over those rows, and the only one — it replaced `mc/anchor-events.html`, deleted the same day.

**IT IS `mc/events/index.html` AS OF 2026-08-24**, and that is the FOURTH address in two days. In order: `mc/data/events.html`, then `mc/anchor_events.html` on 2026-08-23, then here.

**THE TWO MOVES PULLED IN OPPOSITE DIRECTIONS, AND BOTH RULES ARE REAL.** The first was made to name the room after the TABLE it edits, because `data/events.html` named the folder it happened to sit in and then named the table wrongly: **there is no `public.events` and never has been.** This one is made to follow the FOLDER convention every other room here keeps — `/mc/gifts/`, `/mc/soundtracks/`, `/mc/socializer/` — which a bare `.html` file broke. **This file recommended `/mc/anchor-events/` as the address that would satisfy both; `/mc/events/` was chosen instead.**

**SO THE TABLE-NAMING ARGUMENT IS THE ONE THAT LOST**, and the confusion it guarded against is back: this room is at `/mc/events/` and edits `public.anchor_events`. **Nothing else in the repo is called `events`**, so the cost is a reader's first guess rather than an ambiguity between two real things, and the paragraph at the top of this section is what settles it. **Do not create a `public.events` table** — that is the mistake this naming makes easier, and it would silently halve the builder's Choose Event picker.

`/mc/anchor_events.html` now 404s. **A hard break with no redirect**, as always here, and the second in two days for this room — so any link written down on 2026-08-23 is already dead. Repointed in the same commit: the Data Warehouse card in [mc/data/index.html](mc/data/index.html), the Anchor Events entry in [mc/js/admin-nav-menu.js](mc/js/admin-nav-menu.js), the three migrations that name the page ([2026082301](mc/supabase/migrations/2026082301_anchor_events_end_date_defaults.sql), [2026082402](mc/supabase/migrations/2026082402_anchor_events_tba_start_time.sql), [2026082403](mc/supabase/migrations/2026082403_leagues_catalog.sql)), the port note in [mc/teams/leagues.htm](mc/teams/leagues.htm), and this file.

**THE DEPTH CHANGE WAS FREE, AND THAT IS NOT LUCK.** Every asset reference on the page is root-absolute (`/mc/js/…`), so moving from `mc/` to `mc/events/` cost nothing. A single `../` would have broken all five. **Write new cross-folder links root-absolute for exactly this reason** — it is the only thing that has made three moves of this page cheap.

**NOTHING CARRIED AN ESCAPED FORM OF THE OLD PATH, and that was checked rather than assumed.** The admin nav's `match` is `/^\/mc\//`, which still covers the new address, and no regex anywhere named this page. That is the trap the Socializer sprang twice: a `match` written `\/mc\/socials\/` does not turn up in a search for `/mc/socials/`, and a `match` out of step with its `href` does not error, it just quietly never lights the button. **Grep for the escaped form every time.**

**IT WEARS THE SOCIALIZER'S CHROME as of the same day.** The fourth room to take that port, after the Tape Room, the Gift Shop and the Path Builder. **When any of them changes, change them all**; the Socializer is the reference and these are copies.
- **The three cut-panel tokens** (`--cut-panel-bg: #e4ecfa`, `--cut-panel-line`, `--control-line`) plus `--mc-shell-width`. The bars were a bare flex row on the page ground with no panel at all.
- **ADD, CHECK, SEARCH EXISTING and SORT are four folder-tab `fieldset.command-bar`s on one `.bar-row`.** The Socializer's own two labels are ADD and VIEW; **there is nowhere to GO from this table**, so the second half searches what is already filed.
- **CHECK SITS HARD RIGHT** (2026-08-24), at the far end of the bar from ADD. The row reads left to right as the order you work in: put events in, find them, order them, and then — last, and only when you want it — ask what is wrong with the whole table. **Only SEARCH EXISTING may grow**; two flexible tabs would split the slack and neither end would be pinned.
- **ADD IS TWO BUTTONS: MANUAL and PROMPT** (2026-08-24, was three). **SCHEDULE folded into PROMPT** — they answered one question, *fill this table with a lot of events at once*, and made you pick a mechanism before opening anything. **Which one applies is a fact about what you are looking for, not a preference**: a league feed exists for the big four and does not exist for a concert. The dialog now says that and lets you switch.
  - **ONE DIALOG, TWO PANES, AND THE FOOT SWAPS WITH THE BODY.** The schedule's foot carries *Import selected* and the prompt's carries *Copy*; leaving both on screen would offer a button acting on a pane you cannot see.
  - **A SEGMENTED STRIP, NOT A DROPDOWN.** A closed `select` cannot say that there are two mechanisms or which one you are looking at, and that is the whole thing the strip exists to say.
  - **IT OPENS ON THE PROMPT PANE.** That one works for anything; the feed only covers four leagues. The general answer is the default and the specialised one is a click away, not the reverse.
  - **The mechanisms are untouched behind it.** Every id of both panes survives, so all the schedule wiring and all the prompt wiring needed no edit — `openScheduleDialog` became `prepareSchedulePane`, called when that pane is shown, and `#scheduleLightbox` with its own Close button was deleted.
- **SEARCH EXISTING IS ONE TEXT BOX** (2026-08-24). It carried three dropdowns — kind, league and a date window — and **the box already searches kind, league, club, venue, city, status and source**, so typing "concert" or "NFL" narrowed the list exactly as the pickers did while three controls sat there on every visit duplicating it. `fillSelect`, `rebuildFilters` and three `state` keys went with them; that pair walked every row on every load to count values for dropdown labels nothing now reads.
  - **WHAT IS GENUINELY LOST IS THE DATE WINDOW.** Upcoming / Past / No date is not a text match, so it is gone rather than folded in. **The `past` pill and the week headings are what answer that question now**, and if a real date filter is ever wanted back it is a filter, not a search term.
- **A `FILTER` TAB SITS BETWEEN SEARCH EXISTING AND CHECK** (2026-08-24), with two
  checkboxes: **Review** and **Neutral site**. Four tabs now, in the order you
  work in: put rows in, search the text, narrow by state, then ask what is wrong
  with the whole table.
  - **A CHECKBOX, NOT A SEARCH TERM, BECAUSE NEITHER IS TEXT.** `neutral_site` is
    a boolean the row never spells out, and being in review is a state — so
    nothing you could type in the box next door reaches either. That is the test
    for whether something belongs here rather than there.
  - **THE NEUTRAL-SITE BOX IS THE ONLY WAY TO FIND THOSE 15 ROWS NOW.** The pill
    that said so went with all the others, and it was the only thing on the page
    that named the column. Deleting a marker without a filter to replace it makes
    the fact unreachable, not merely quiet.
  - **THE COUNTS ARE WHY THESE ARE VISIBLE CONTROLS.** A closed picker cannot say
    that 43 rows are waiting on you, which is the question the strip exists to
    answer. Same argument as the Tape Room's filter strip.
  - **COUNTED OVER THE WHOLE TABLE, NEVER OVER WHAT IS ON SCREEN.** A count that
    shrank as you ticked the other box would read as the filter breaking, and the
    question each one answers is *how many are there*, not *how many survive the
    filter I have already applied*.
  - **A COUNT OF ZERO IS NOT DRAWN.** `(0)` beside every filter on every visit is
    a number that never means anything.
  - **ONE STATE, TWO CONTROLS: the Review box and the ERRORS button drive the same
    `state.reviewOnly`.** The sweep ticks the box, and unticking it IS pressing
    Show all. **Two controls with two ideas of one filter is how a page starts
    contradicting itself**, which this room has already paid for once — a counts
    line reading "13 shelved" beside a tab reading 8, from the same data.
  - **TICKING BOTH IS AN INTERSECTION, and the search box narrows WITHIN whatever
    is ticked.** Clearing the text does not clear a filter; they are different
    questions.
  - **ONLY SEARCH EXISTING MAY GROW.** `.command-bar--filter` is `flex: 0 0 auto`
    like ADD and CHECK: two flexible tabs would split the slack and neither end
    of the bar would stay pinned.
  - **THERE IS NO `el()` HELPER ON THIS PAGE and the first cut of this used one.**
    It holds module-level `document.getElementById` consts instead, so `el(...)`
    was a ReferenceError that killed the whole listener block — and with it every
    control wired after it. **The standing id-check did not catch it**, because
    that check matches `el('x').property` and these were bare calls. Caught by
    rendering the page, which is the only thing that would have.

- **The list panel is a `fieldset` with its own tab too**, so the room reads as a set of tagged folders rather than a tinted toolbar sitting on an unrelated white box. `<section class="panel">` became `<fieldset class="panel">`; the tint is also what lets the white cards read as objects on it.
- **`#pageStatus` IS THE RED-PEN SCRIBBLE NOW**, keeping its id so every `setStatus()` call still lands, and the standing sentence moved into a `.room-blurb` in the markup. **That split is the point.** One element was the description, the save confirmation and the error channel at once, and `setStatus('')` fell back to printing the description — so a write failure erased the only explanation of the room, and a successful save reprinted the tagline in red pen. `DEFAULT_SUBSTAT` is deleted; an empty message now clears the pen. A success clears itself after six seconds, an **error stays** until the next action.
- **`.room-scribble.error` / `.success` are overridden to `inherit`**, the same guard `#shopStatus` carries: the pen is red whatever the news is.
- **The mobile block's `.legend` / `.command-bar` / `.panel` overrides were deleted with the flat bar they were shrinking**, along with `.legend`, `.command-bar-divider` and `.command-bar-label`. **Delete a control and its CSS in the same pass** — the admin nav lost an hour to exactly this.

- **It is not a sports table.** `kind` ∈ sports | concert | convention | festival | expo | other. The two `*_team_tgbid` FKs are what a sports row adds, not what defines a row; a concert just needs a title, a date and a place. Splitting the kinds into separate tables would fork `anchor_event_id` into two nullable FKs, which is why it's one table with a discriminator.
- **`kind` / `title` / `description` / `url` / `end_date` were live in the database and in both pages for months without a migration.** [2026080101_anchor_events_general_columns.sql](mc/supabase/migrations/2026080101_anchor_events_general_columns.sql) backfills that gap; before it, a database rebuilt from `mc/supabase/migrations` alone got a table the pages 400 against. Both pages read **`select=*`, never a column list**, for the same reason the cities pages do — an unknown column in a select list is a 400, a missing column read as blank is survivable.
- **A sports row stores each club split into locale + mascot** — `away_locale` `'Chicago'` + `away_mascot` `'Bears'` — not as one string, and not as a join. That's the shape a game actually uses: the locale is a place, the mascot is what the copy calls the opponent. It also makes an event **self-describing**, which is the point: no `public.teams` row is needed for the event to be complete. Same vocabulary as `teams` (`first_name`/`fanbase` + `mascot`), deliberately.
  - **`away_label` / `home_label` still exist and are still correct**, rebuilt from the two halves by the `tgb_anchor_events_sync_labels` trigger on every write. Don't write them by hand and don't drop them — `anchorEventLabel` in the builder falls back to them, and the trigger is what lets that reader stay untouched.
  - **`away_team_tgbid` / `home_team_tgbid` are now optional**, worth filling only for the builder's team auto-fill and the fandom color palette off the away club. They are not what makes a sports event usable.
- **`neutral_site` is a stored flag, never inferred from the city columns.** True means neither club is at home — the international series, a Super Bowl, a bowl game, a relocated game — so the host city has no home team in it and both fanbases travel. It is expected to spawn **two** games eventually, one per travelling fanbase; nothing reads it that way yet. **Don't replace it with a comparison of `home_locale` to `city`**: an ordinary home game is routinely played in a differently-named suburb (Bills → Orchard Park, Giants → East Rutherford, Cowboys → Arlington), so that comparison would call a third of the league neutral. An international game keeps its league-assigned nominal home club in `home_locale`/`home_mascot` *and* carries the flag — both are true at once.
- **`start_time` is venue-local**, per the column's own comment — the time a player standing outside the stadium sees. Leagues publish in Eastern, so a seed has to convert; the NFL Week 1 seed ([2026080102](mc/supabase/migrations/2026080102_nfl_2026_week1_anchor_events.sql), 16 games) keeps the ET broadcast time in `description` so the two stay reconcilable, and its Melbourne game deliberately carries a date one day later than the US listing.
- `id` is a **client-supplied text primary key** (`NFL-2026-09-07-CHI-CAR`), not generated by the database. **Since 2026-08-28 the events room COMPOSES it on ADD and there is no box to type it in**: `LEAGUE-DATE-AWAY-HOME` for a fixture, `KIND-DATE-ACT-CITY` otherwise, upper case, every part taken from a field on the form. A collision is suffixed `-2` rather than refused, since two events of one kind in one city on one day is ordinary. **It is still permanent** -- changing it later would orphan every game pointing at it -- which is the whole argument for not asking a person in a hurry to invent one. The notice after adding names it, that being the one moment it can be questioned. The bots and the pasted SQL still supply their own.

### THE OPENED ROW IS THE MANUAL FORM (2026-08-28)

One column, one field per line, label above the box. **The five coloured
folder-tab bands are gone**, and with them `.event-band`, `.event-band-head`,
every `data-band` attribute, the per-band grids for Who and What, and the five
`--band-*-rgb` tokens.

- **IT WAS THREE FRAMES DEEP BEFORE YOU REACHED A VALUE**: a bordered panel,
  inside a bordered card, inside a bordered list. Five of them per row.
- **EDITING AN EVENT AND CREATING ONE ARE THE SAME JOB AND NOW LOOK IT.** The
  card and the manual form read down the same sequence in the same shape.
- **WHAT THE COLOURS BOUGHT, and what losing them costs.** You could aim at the
  amber band for the dates without reading anything, which was real. What they
  cost was a card that read as five objects, and a hue to learn per group. The
  whole measured argument for those five hues is in the section below; **it is
  history now, not a description of the page.**
- **`GROUP_ORDER` IS NAMED ONCE and `MANUAL_GROUP_ORDER` is it.** Two copies of
  what/when/where/who/why would have drifted the first time either was
  reordered. `FIELD_GROUPS` survives as that order plus `sportsOnly`, which is
  still the only statement of which fields belong to a fixture.
- **THE CLUB FIELDS FOLD ONE BY ONE**, the shape the manual form already used,
  **and only when the group is empty** -- a concert carrying a mascot still
  shows them, or there would be data on the row nothing on screen could reach.
- **THE SPAN CLASSES ARE NEUTRALISED, NOT REMOVED.** `grid-column: span 2` in a
  one-column grid **forces an implicit second column** and everything else
  squeezes into the first. `FIELD_META` still sets them and other surfaces read
  them, so they are re-pointed at `1 / -1` here rather than deleted.
- **IT IS NOT A COPY OF `.manual-form`'s SELECTOR.** Sharing it would tie a list
  of 4,000 rows to a dialog's metrics, and the two differ where they should: a
  row inside a card is tighter than a form on its own.

**PROVED BY OPENING ROWS**: no fieldset and no legend in the body, one
`.event-fields` block, a computed `1fr`, the five wide fields resolving to
`1 / -1`, the order, ten club fields folding on a concert and none on a
fixture, and a filled club field never folding. 25 assertions; **14 fail against
the previous commit.**

### THE ESPN SCHEDULE IMPORTER IS DELETED (2026-08-28)

The prompt dialog held two panes behind a **League schedule / AI prompt** strip.
The strip and the schedule are gone; the dialog is the prompt box.

**WHAT WENT WITH IT, and it is worth knowing before anybody rebuilds it:**

- **`neutral_site` WAS PUBLISHED PER GAME by the feed.** An international game
  arrived flagged and an ordinary home game in a suburb stadium arrived false --
  the single strongest reason to prefer it over a prompt for the big four, and
  the distinction the prompt now spends its longest passage explaining.
- **IT IMPORTED WITHOUT A COPY-PASTE**, straight into the table, chunked, with a
  per-row error report and a retry that named the row the database refused.
- **IT READ THE FEED IN THE BROWSER.** No key, no server, no build step, because
  `site.api.espn.com` sends `Access-Control-Allow-Origin: *`.
- The venue-local timezone maps (`STATE_TZ`, `COUNTRY_TZ`, `COUNTRY_ALIAS`), the
  UTC-vs-local date re-filter, and the id shapes went too.

**REBUILD IT AS A NEW THING IF IT IS WANTED, not by reviving this**, and read
the SCHEDULE section further down first -- the reasoning in it is still true,
it just describes something that is no longer there.

**THE THREE PAGES IT ABSORBED ARE STILL DELETED.** `mc/get_games.html` and
`mc/mlb.html` went in 2026-08-07 and nothing brings them back; what replaced
them is now the prompt alone.

### SCOPE IS MULTI-SELECT, AND THE CITY LIST LEFT THE PROMPT (2026-08-28)

- **THE KIND PICKER TAKES SEVERAL.** Concerts *and* festivals is an ordinary
  thing to want and the single picker made it two runs. `promptScopeLine` reads
  `selectedOptions`, not `.value` -- **`select.value` is the first selected
  option**, so reading it on a multiple select silently throws the rest away,
  which looks exactly like the control not working.
- **NOTHING SELECTED MEANS ANY KIND**, which is why the `Any kind` option went:
  on a multiple select it would be a value meaning the same as selecting
  nothing, and two ways to say one thing is how they end up disagreeing.
  **NOTHING ON SCREEN SAYS SO**, and that is the accepted cost: a hint beside
  the box read as clutter on a control most people will leave alone. Where it
  shows is the prompt -- select nothing and no scope line is written at all.
- **EVERY KNOB IS ABOVE THE PROMPT NOW**, in the order you answer them: how
  many, what kind and over what window, then anything else to narrow to.
  **THAT RETIRES THE "options sit under the text" RULE OUTRIGHT**, rather than
  one control at a time as the first two moves did. What replaced it: a knob
  here is a QUESTION you answer before you read, and the prompt is what they
  produce.
- **ALL THREE ARE THE SAME OBJECT**, a `<fieldset>` with a real `<legend>`, so
  the browser cuts each box's top border for its word. Focus and scope were both
  a `<div>` with a `<span>` inside -- a label sitting INSIDE the border beside
  one that cut through.
- **`.prompt-knobs` WENT WITH FOCUS.** It was the last thing in that wrapper,
  and a wrapper whose only job was a rule above the remaining knobs would have
  drawn a rule above nothing.
- **IT IS A REAL `<fieldset><legend>`**, so the browser cuts the box's top
  border for the word. It was a `<div>` with a `<span>` inside, which put the
  label INSIDE the border while the count beside it cut through -- two boxes
  doing one job two ways, a few pixels apart.
- **`from` OPENS ON TODAY.** An empty window wrote no bound at all, so the
  prompt was free to come back with events that have already happened -- the one
  thing this table can never use, since our game is played the day BEFORE its
  anchor and there is no day before a date that has gone.
  - **`todayIso()`, WHICH IS LOCAL.** Built from UTC it would be a day out for
    half of every day, and "on or after today" is a claim about the day the
    person at the keyboard is having.
  - **ONLY WHEN IT IS BLANK.** A window somebody typed is theirs, and reseeding
    it on every open would throw it away on the second visit -- the same rule
    the prompt text itself keeps. Clearing the box still means no lower bound.
- **THE 1,451-LINE CITY LIST IS OUT OF THE PROMPT.** It was appended verbatim to
  every copy so `venue_city` would land on a real row. The instruction now
  describes the FORM instead -- "City, State" spelled out for a US city, "City,
  Country" elsewhere -- and the room's own `unknown-city` finding catches what
  gets through. **The prompt is 9.5KB instead of ~40KB**, which is the
  difference between a prompt a model reads and a prompt it skims.

### THE AI PROMPT DIALOG IS THE SOCIALIZER'S, FOOT AND ALL (2026-08-28)

It had a blurb of my own writing and a lone **Copy** button; it now carries the
four sentences and the foot that room has run since August. **This is the fifth
room to wear that chrome: when either changes, change both.**

- **THE FOUR SENTENCES ARE PORTED, NOT REWRITTEN.** Edit and copy the prompt
  into your AI; paste the results into the website's database (Supabase); the
  two common failures; `adminhelp@thegamebureau.com`. **Both common failures
  happen after you leave the page**, so somebody meeting one has nothing on
  screen connecting it back -- which is the whole reason the sentences exist.
- **IT NAMES NO BUTTON.** A draft named *Insert results*, which did not exist in
  this room at the time; copy naming a control that is not on screen is worse
  than saying nothing, because somebody goes looking for it. The sentences name
  the ACTS instead, so they survive a change of control.
- **THE FOOT IS `COPY PROMPT TO CLIPBOARD & OPEN` + ChatGPT / Grok / Claude,
  then INSERT RESULTS.** Every one of the three copies before it opens, so the
  lone Copy was the same act minus the useful half. **What is lost is copying
  WITHOUT opening anything**, which the textarea still allows by hand.
  - **ANCHORS, AND THE COPY IS NOT AWAITED.** The new tab has to come from the
    browser's own handling of a click on a link, so there is no `preventDefault`
    and nothing awaited before the navigation -- awaiting pushes it into a later
    task, which is exactly what a popup blocker refuses.
  - **ONE LISTENER ON THE ROW**, not three on the anchors, so a fourth AI is one
    line of markup.
  - **They open BLANK**: none of these takes a prompt this long through a query
    string reliably, and a half-truncated pre-fill is worse than an empty box
    with the whole thing on the clipboard.
  - **`/sql/new?skip=true`, NOT `/sql/`.** `new` opens a blank query rather than
    whatever was last run in this project, and `skip=true` stops it asking.
    Pasting a script over somebody's half-written query is the accident that
    avoids.

**THE COUNT MOVED ABOVE THE PROMPT AND ASKS A QUESTION.** `HOW MANY ANCHOR
EVENTS?`, between the instructions and the text.

- **IT REVERSES THE "options sit under the text" RULE FOR ONE CONTROL**, and
  that is recorded rather than done quietly. The count is the one knob that is a
  QUESTION rather than an adjustment: you know how many you want before you have
  read a word, and the number is written into the prompt's first line. Scope and
  focus are refinements to something you have read, so they stay below.

**THE DIALOG IS `Add Anchor Events with AI`**, plural: the count radio goes to
500, so the singular understated it by two orders of magnitude. **The MANUAL
dialog is the one that adds one.**

### A FINDING IS ABOUT THE EVENT, NOT ABOUT A GAME (2026-08-28)

Five of them had drifted into describing the product: *"A game takes its copy
and its palette from the away club"*, *"the city is what a game is built
around"*, *"a game is played the day before its anchor event"*. **Read on a row
in this table that is an objection to the wrong object entirely** -- the row is
an ANCHOR EVENT, and a game is a separate thing somebody buys.

Each one now says what is missing from THIS EVENT first, and names a game only
as the thing that would be built on it:

| rule | now reads |
|---|---|
| `club-missing` | ...so this event does not say who is playing. The away club is also the fandom **any game built on it** would be pitched at. |
| `no-date` | No start date, so **this event cannot anchor anything**: our game is played the day before its anchor event. |
| `no-city` | No venue city, so **nothing can place this event**. The city is also what any game anchored to it would be set in. |
| `no-venue` | ...a **gap in the record** rather than a fault. |
| `multi-day` | Runs 4 days, so it is **4 anchors rather than one**. |

**AND THE PROMPT HAD THE DAY BACKWARDS.** It told the model *"A game is played
in the host city ON THE DAY OF the event"*, which is the opposite of the
product: the game is played the **day before**, while visiting fans are already
in town with an afternoon free. A prompt that states it backwards teaches a
model to pick events for the wrong reason. It also says why now, since the
reason is what makes the rule usable.

**THE ESPN IMPORTER FOUND `fixtures`, NOT `games`.** *"Found 240 games"* in a
room whose whole subject is anchor events reads as though the feed had returned
our own product.

### THE SCORES AND THE TGBIDS ARE OFF SCREEN (2026-08-28)

`OFF_SCREEN_FIELDS`: `away_team_score`, `home_team_score`, `away_team_tgbid`,
`home_team_tgbid`. The manual form had skipped them since it was built; they are
off the card too now.

- **SO THEY ARE EDITABLE NOWHERE, AND THAT IS THE COST.** A finished score goes
  in with SQL until they come back. The same bargain the Socializer already
  makes with `url` and `headline`.
- **`assertBandsCoverFields` IS TOLD ABOUT THEM RATHER THAN SILENCED.** That
  check exists to shout when a column becomes unreachable, and these four are
  exactly that, deliberately -- so the list is named in the check instead of the
  check being weakened.
- **ONE LIST, BOTH SURFACES.** It was `MANUAL_SKIP`, which the card knew nothing
  about; `MANUAL_SKIP` is now that list, and `shownFields(group)` is what both
  builders ask.
- **A SAVE CANNOT NULL THEM.** `readForm` skips an input that is not in the
  DOM, so the columns are simply absent from the PATCH. **Asserted**, because
  nulling a real score because its box was taken off the card is the failure
  this change could plausibly have.

### ONE PLURALISER (2026-08-28)

`plural(n, one, many)`. There were eleven hand-written `+ ' events'`, and
**"Checked 1 events"** is what the first of them produced when it was reached
with a one.

- **IT IS NOT A TYPO IN ONE MESSAGE**, it is the same mistake available eleven
  times, so the fix is one function rather than eleven corrections.
- **`event(s)` IS THE OTHER WAY OF DODGING IT**, and it is a form nobody speaks.
  Both of those went too.
- **A CHECK THAT SEARCHES THE SOURCE MUST STRIP COMMENTS.** The first cut
  matched the comment explaining the removal -- the same vacuous shape this file
  has already recorded once. Comments are not code.

### THE COUNT IS A QUESTION MARK UNTIL THERE IS ONE (2026-08-28)

The room's heading read **0 ANCHOR EVENTS** while the first request was still in
the air, and the markup shipped that way.

- **ZERO IS A STATEMENT, AND IT WAS A WRONG ONE.** It is also the one number on
  this page somebody might act on -- a table that says it holds nothing is a
  table somebody starts filling. `? ANCHOR EVENTS` says the true thing: we do
  not know yet.
- **THE MARKUP SHIPS THE `?` TOO**, or the wrong answer is on screen for the
  first paint whatever the painter does afterwards.
- **KNOWN MEANS LOADED OR COUNTED.** `count=exact` on the first request means
  the real total arrives with the first fifty rows, so the question mark is
  brief -- and it covers a signed-out room as well, where nobody has asked the
  database anything.
- **THE PLURAL FOLLOWS THE NUMBER, so `?` keeps ANCHOR EVENTS**: `? ANCHOR
  EVENT` would be a guess at the answer being one.

### ISSUES IS A POPUP AGAIN, AND THE ROW STILL SAYS WHY (2026-08-28)

Pressing ISSUES runs the sweep and opens a **report**. It used to narrow the
list in place and rename itself Show all.

- **ONE CONTROL WAS THE WAY IN AND THE WAY OUT OF A VIEW NOBODY ASKED FOR.**
  The room you were working in silently became a different room, with the page
  filtered under you and the pager reset. A report is something you read and
  dismiss; the list underneath is left exactly where you were.
- **`state.reviewOnly` IS GONE**, with the filter branch that read it, the
  Show all face, and the reset inside `focusEventRow`.
- **THE ROW ANNOTATIONS STAY, AND THAT IS WHAT MAKES THIS AFFORDABLE.** The
  cost that deleted the last report is real and unchanged: a block in a list has
  to repeat the event's name to say what it is talking about, and then offer a
  way back to it. It is worth paying **once**, for a thing read and closed,
  precisely because it is not the only place a finding appears -- the findings
  are still drawn on the row they belong to, where they inherit both for free.
- **`reviewReasons` IS STILL THE ONE READER**, so the report and the annotation
  cannot disagree about what is wrong with a row.
- **GO CLOSES THE REPORT AND FINDS THE ROW**, because the report can fix
  nothing: every finding is answered by editing a field. It goes through
  `focusEventRow`, which is the same path a newly added event takes.
- **A ROW FLAGGED WITH NOTHING OBJECTING SAYS SO** rather than drawing an empty
  block, which would read as the report having failed to load.
- **ESCAPE CLOSES IT FIRST**, being the one dialog here that can open over
  another.

### THE TITLE'S SAMPLE FOLLOWS THE KIND (2026-08-28)

`TITLE_SAMPLES`, read by the manual form's Kind handler.

| kind | sample |
|---|---|
| sports | The New Orleans Night vs The Chicago Blitz |
| concert | Led Zeppelin in Concert |
| convention | WEFTEC Conference |

- **ONE PLACEHOLDER CANNOT BE RIGHT FOR SIX KINDS.** A tour name shown while
  Kind says sports is a sample of the wrong SHAPE, and the shape is the only
  thing a sample teaches.
- **THE THREE UNNAMED KINDS KEEP THE FIELD'S OWN SAMPLE** rather than being
  given an invented example each.
- **A PLACEHOLDER, NEVER A VALUE.** `readForm` never reads it, so a title left
  blank stays blank -- which matters, since a sports row is allowed no title and
  reads as its two clubs.

**THE FIELD IS `Venue name`, NOT `Venue`.** Beside `Venue city`, a bare Venue
reads as the category the pair belongs to rather than as that box's own field.
The column is still `venue`; visible copy only.

### DELETE IS A REAL DELETE (2026-08-28)

The row goes. `archived_at` was written for three days and is **retired in
place**, not dropped: nothing reads it, nothing writes it, and the ~4,600 events
it might have stamped were deleted before it ever carried a value.

**IT REVERSES THE 2026-08-25 DECISION BELOW, KNOWINGLY**, and that reasoning is
kept because the arguments have not stopped being true, they were overruled. The
two costs, both real:

- **THE ROW WAS THE TOMBSTONE.** `tgb_pull_anchor_events` and
  `tgb_pull_concert_tours` both dedupe against this table with no filter, so
  deleting an event tells the bots only that they have never seen it and the
  next run is free to file it again. **That is now said in the confirmation**,
  where somebody deciding can read it, rather than on a tooltip explaining why
  the button did not do what it said.
- **A REFERENCED EVENT IS REFUSED BY THE DATABASE, NOT ORPHANED.**
  `games.anchor_event_id` has no `on delete` clause, which is NO ACTION, so
  Postgres raises **23503**. That is a good safety net and a terrible message,
  so it is translated: *"A game is built on NFL-2027-…, so it cannot be deleted.
  Repoint or delete that game first."* Never the raw constraint name.

**`setArchived`, `purgeArchived` AND `Restore` ARE ALL GONE, in the same pass**,
per the standing rule that a control and its code go together. `state` no longer
carries an archived split, and **`tgb_purge_archived_events` is now called by
nothing** — the once-per-load housekeeping job existed only to remove past
archived rows, and nothing is archived.

**`return=representation` ON THE DELETE IS NOT DECORATION.** PostgREST answers
**200 with an empty array** when RLS refuses, so without reading the row back a
refused delete reports success and the card vanishes until a reload brings it
straight back. Proved by refusing one.

**PROVED BY WATCHING THE REQUEST, not by reading the diff**, which is the only
thing that can tell these two apart: an archive and a delete look identical from
outside the page. 30 assertions — one DELETE and no PATCH, `archived_at` written
nowhere, the id in the filter, no body, the row off the list, an empty-array
reply reported as refused, 23503 becoming a sentence, cancelling sending
nothing, and no purge RPC on load. **Run against the previous commit it fails 18
ways.**

### THE ARCHIVE IT REPLACED (2026-08-25, superseded)

Kept for the reasoning, which is what to read before proposing it again.



`public.events.archived_at` — [2026082504](mc/supabase/migrations/2026082504_events_archive.sql), **applied 2026-08-25**. Null is live; a
timestamp means somebody took the event off the list. **The row stays.**

- **TWO REASONS IT CANNOT BE A REAL DELETE, and they pull the same way.**
  `games.anchor_event_id` is a foreign key with **no `on delete` clause**, so it
  is NO ACTION and deleting a referenced event fails outright — a good safety net
  this keeps. And **a deleted event comes straight back**: both pull RPCs dedupe
  against this table, so removing a row tells TGB ANCHOR BOT only that it has
  never seen the thing, and the next run files it again. **The row IS the
  tombstone.**
- **NOTHING WAS NEEDED TO MAKE "NOT PULLED AGAIN" WORK**, which was checked
  rather than assumed: `tgb_pull_anchor_events` dedupes on the id and on the
  natural key **with no filter on the rows it looks at**, and
  `tgb_pull_concert_tours` uses `on conflict (id)`. An archived row is still a
  row. **If either dedupe ever grows a `where archived_at is null`, that is the
  bug the migration's comment exists to prevent.**
- **NOT A `status` OF 'archived'.** `status` says where the event stands in the
  world; archiving says what we think of the record. One column for both is the
  cost this file already records for `review`, which overwrites the previous
  status and loses it. A cancelled event you have also archived is two true
  facts.
- **THE BUTTON SAYS DELETE AND THE TOOLTIP ADMITS THE MECHANISM.** Delete is what
  somebody came to the row to do and archiving is how it is done safely, so the
  face is honest about the OUTCOME (it leaves the list) and the tooltip is honest
  about the MEANS. **That sentence must stay said.** On an archived row the face
  reads **Restore**.
- **ARCHIVED ROWS ARE OFF THE LIST BY DEFAULT**, behind a third checkbox reading
  **Removed** — labelled for the button somebody pressed, not for the column.
  **It is not a narrowing like the other two**: Review and Neutral site pick a
  subset of what is on screen, this one SWAPS the list for what is otherwise
  hidden.
- **PAST ARCHIVED EVENTS ARE PURGED, and that is the one case where the row has
  no job left**: nothing re-files a past date, because both pulls refuse one.
  `tgb_purge_archived_events()` runs once per load, after the whole table is in,
  and **skips anything a game points at** — reported by count, not skipped in
  silence, because "why is this still here" is the obvious next question.
  - **IT IS THE ONE FUNCTION HERE GRANTED TO `authenticated` ONLY.** Every other
    is INSERT-only and exposed to `anon` because a cloud routine has no secret
    store. This one DELETES, and tightly-bounded is not the standard for handing
    a delete to an anonymous caller. No routine needs it; the room runs it with a
    person present.
  - **A MISSING FUNCTION IS NOT AN ERROR THE ROOM SHOUTS ABOUT.** The likeliest
    cause is the migration not being applied, and a housekeeping job that could
    not run is no reason to redden a page that otherwise works. It warns to the
    console and names the file.
- **`restUrl()` CANNOT BUILD AN RPC PATH**, and the first cut of the purge used
  it. It runs the table name through `encodeURIComponent`, so
  `rpc/tgb_purge_archived_events` comes out `rpc%2Ftgb_purge…` and 404s. **An
  RPC path has a slash that must survive.** Caught by a test, not by reading.

### THE FIRST 50 PAINT, THE REST ARRIVES BEHIND THEM (2026-08-25)

The table went from 603 rows to **4,123** the morning TGB ANCHOR BOT first ran,
and `loadEvents()` pulled all of it before drawing anything: five sequential
round trips of a thousand rows before a single event was on screen.

- **THE FIRST REQUEST IS ONE PAGE, `Range: 0-49`**, rendered immediately. The
  remainder is paged a thousand at a time behind it and **appended without
  redrawing** — a list that rebuilds itself while you are reading it is worse
  than one that takes a moment to finish.
- **IT DID NOT BECOME SERVER-SIDE PAGING, AND THAT IS THE WHOLE DESIGN.**
  `state.rows` is not the page, it is THE TABLE, and five things read it that
  way: the ERRORS audit, the cross-row duplicate check, the two filter counts,
  the search box, and the "already in the catalog" list the PROMPT embeds. **An
  audit that has seen 50 rows and reports a clean bill is the worst shape a bug
  can take here** — the same warning this file already carries about the
  1000-row cap. The whole table is still loaded; only the WAIT was removed.
- **`state.loaded` IS THE HONEST FLAG, and ERRORS is the one control that
  refuses while it is false.** Everything else degrades to *incomplete*; the
  audit degrades to *wrong*. It greys with `is-waiting` and says why — **not
  `disabled`**, because a disabled button dispatches no click and the reason
  would be unreachable on a phone, which is the argument the Socializer's greyed
  platform buttons already settle.
- **THE TITLE SHOWS THE SERVER'S COUNT, NOT WHAT HAS ARRIVED.** `count=exact` on
  the first request costs one header and means the room says 4,123 immediately;
  counting up from 50 as chunks land reads as the number being unstable rather
  than as loading.
- **THE APPEND DEDUPES BY ID, AND THAT IS NOT BELT AND BRACES.** If anything
  between the page and Postgres ignored the `Range` header, every chunk would
  return the same rows and the loop would append them forever. Keying on the id
  makes it safe against a server that does not page; it also stops at
  `state.total` when the count is known.
- **A FAILED BACKGROUND LOAD IS NOT SILENT.** What is on screen is real; what is
  not safe is anything reading the whole table, so `loaded` stays false, the
  audit stays off, and the scribble says how many arrived before the connection
  went.
- **`finishLoad()` REDRAWS ONLY IF NOTHING WOULD BE THROWN AWAY.** An open card
  or a half-typed edit is worth more than a tidy repaint; the counts and the
  pager are updated either way.

**THE TEST HARNESSES ALL BROKE, AND THEY WERE RIGHT TO.** Every suite stubbed
`TgbRest.fetchAll` and returned the fixture from it — modelling the old data
path. The page now loads through `fetch` with a `Range` header, so eighteen
suites were made **Range-aware**: they slice the fixture and answer
`content-range` when `count=exact` is asked for. **A stub that ignores Range is
a stub that no longer models the thing under test**, and it was that mismatch,
not a page fault, that produced the first round of failures.

### A ROW IS ONE LINE UNTIL YOU OPEN IT (2026-08-23)

The card went through both failures in one day, which is worth recording as a pair. It began as **21 controls in one flat `auto-fit` grid**: every field looked equally important and equally likely to be the one you came to change, so finding the score meant reading every label. Grouping them into six named bands fixed that and **made the card worse**, because it was still every field, now with headings, rules and an explanatory note per band. **Fifty rows meant fifty copies of a 22-field form.** You could not see three events at once, let alone scan a week.

**So the bands stayed and the card closed.** A row is one line — caret, date, name, kind, city, id — and opens into the banded editor on the one row you are working on.

- **EXPAND ALL / COLLAPSE ALL sits above the list**, right-aligned in the panel head, opposite the folder tab.
  - **ONE BUTTON THAT NAMES WHAT IT WILL DO, not a pair.** Expand all and Collapse all are never both useful: whatever the list is, one of them is a no-op. **A MIXTURE READS "Expand all"**, because that is what the press does — one press to a known state, rather than a toggle whose outcome depends on what you happened to leave open.
  - **IT ACTS ON THE PAGE, NOT THE TABLE**, and the tooltip counts the rows so it says which. `render()` only builds the current page, so there is nothing else on screen to open — and opening all 600 would mean building 13,000 controls, which is exactly what closing rows by default avoided. **Expanding fifty is still 1,100**, which is the deliberate cost of pressing it and the reason it is a button rather than a default.
  - **`setOpen` REPAINTS IT.** Opening the last shut row by hand makes the page fully open, and without that call the button goes on offering to expand a list that already is. `render()` repaints it too, since every render rebuilds the cards closed.
- **THE FIELDS ARE NOT BUILT UNTIL THE ROW IS OPENED, and that is not a micro-optimisation.** Building them anyway and merely hiding them would put **22 controls per row in the document, 1,100 for a page of fifty**, and pay that cost again on **every keystroke in the search box**, which is what re-renders the list. Measured in jsdom against the live table: a closed page of fifty rows now holds **zero** `[data-field]` controls, and 22 the moment one is opened.
- **THE HEAD IS A REAL `<button>`, not a div with a click handler.** Focusable, space and enter work, and `aria-expanded` tells a screen reader it expands something. None of that comes free from a div.
- **THE TITLE IS EDITED IN THE HEADER, AND THERE IS NO TITLE FIELD IN THE BODY** (2026-08-24). The event's name belongs where the event's name is; a second box for it in the What band was the same value in two places.
  - **THE HEAD HAD TO STOP BEING A `<button>`.** It was one so that expanding was focusable and announced — and **an `<input>` may not sit inside a `<button>`**: interactive content is outside a button's content model and browsers disagree about what to do with it. Same class of problem as the hub's button-inside-an-anchor. **The caret is a real `<button>` now**, carrying `aria-expanded`, so the keyboard and a screen reader keep one proper control; the rest of the head keeps a click handler so a mouse can still open a row by hitting anywhere on it.
  - **THE TITLE IS ALWAYS AN INPUT, not a span that swaps for one on click.** Two elements holding one value is two things to keep in step, and **the Socializer has already paid for the click-to-edit version**: its span carried an Enter/Space handler that swallowed the SPACE key inside the box it had just opened, so "The Local Herald" could only be typed as one word. A box that is simply always there cannot have that bug.
  - **IT LOOKS LIKE TEXT UNTIL YOU REACH FOR IT** — no border and no fill at rest, both appearing on hover and focus. A closed list has to read as a list, not as fifty forms.
  - **`data-field="title"` IS LOAD-BEARING.** `readForm()` searches the whole card, head included, so Save and Create pick the header box up with no special case and there is exactly one place the title lives.
  - **CLICKING THE TITLE MUST NOT TOGGLE THE ROW.** Without the guard, clicking in to fix a typo would open or close the row underneath, and every click while typing would flip it again. **The id is exempt too** — it is text you select and copy, and a selection drag ending on it should not collapse what you were reading. **The caret stops its own propagation**, or its click would reach the head handler and toggle a second time, landing back where it started.
  - **AN UNTITLED SPORTS ROW SHOWS ITS DERIVED NAME AS THE PLACEHOLDER**, italic and lighter so it cannot be mistaken for something somebody typed. A row named from its two clubs would otherwise show an empty box and lose a name it really has. `markDirty` refreshes the placeholder and **never writes to the value** — writing `displayTitle()` back into the box would overwrite what you are typing with a fallback derived from it.
  - **`HEADER_FIELDS` EXTENDS `assertBandsCoverFields`.** That check exists to catch a column with no control anywhere; a field moved out of the bands would have tripped it, and silencing it by deleting the check would have thrown away the guard. Anything given a control outside the bands goes in that list.
- **THE ID AND EVERY PILL LIVE ON ONE META LINE AT THE FOOT OF THE BODY** (2026-08-24). The head is a caret, a title and a city, and nothing else.
  - **THE HEAD HAD COLLECTED FIVE KINDS OF CHIP** — kind, past, neutral site, update needed, unsaved — **and a row could wear four at once**, so the name the row exists to show was being squeezed between a caret and a queue of tags. (**All five are gone now**; see the review section below.) The id sat beyond them, a 20-character mono key competing with the event's name.
  - **THEY SHARE A LINE BECAUSE THEY ARE THE SAME KIND OF FACT**: what this RECORD is, as against what the event is. The fields above say when and where; this line says the row has been round the block. The pills take `margin-left: auto` so the id reads from the left and the state from the right whatever the id's length.
  - **A NEW ROW'S ID IS A DIFFERENT OBJECT** and stays where it was: a required input at the TOP of the body, because nothing can be stored until it is filled. The read-only line is drawn only for a saved row.
  - **THE PILLS ARE BUILT IN `buildRow` AND APPENDED IN `buildBody`.** `paintPast` and `markDirty` close over them and both can fire before the body has ever been built.
  - **WHAT IT COSTS, plainly: a CLOSED row now shows no state at all** — not that it is unsaved, not that it needs updating. That is the second thing to leave the closed row after the date, and together they mean the list is names and cities. **If any of it comes back it should be `unsaved`**, the one with a deadline attached.
  - **NOTHING IN THE HEAD CARRIES `margin-left: auto` ANY MORE.** The push lived on the id, moved to the date box, came back to the id — **and was missed on one of those hops**, leaving the id jammed against the city with the row empty behind it. `.event-name` at `flex: 1 1 auto` takes the slack itself now, so there is one fewer thing to move next time. A test asserts the head has no auto margin at all.
- **THE HEAD CARRIES NO DATE OR TIME** (2026-08-24). The date led the row for as long as this page existed; it moved to a box upper right, and then went entirely, one day apart. Both moves were right and the reasons are different.
  - **WHY IT LEFT THE LEFT:** you scan a list of events by NAME, and a mono date at the head of every line is a column of near-identical strings to read past before reaching the words. **The least readable thing on the row sat in front of the most.** The name leads now.
  - **WHY IT LEFT THE HEAD ALTOGETHER:** with the When band boxed directly under the collapse row, an opened card said the same three facts twice a few pixels apart, and **the head's copy was the one you could not act on**.
  - **WHAT IT COSTS, stated plainly.** A closed row no longer says when the event is, so a list sorted by date is ordered on something invisible — **the same objection that brought the kind chip back under a type sort**. Accepted as asked. If it is wanted back it belongs on the CLOSED row only, hidden the moment the row opens, which is the shape that has no duplication in it.
  - **`displayDate()` / `displayTime()` / `displayWhen()` ALL SURVIVE** — the annotation lines and the row head still say when an event is. `.event-datebox`, `.event-when` and `.event-time` were deleted with the markup, per the standing rule that a control and its CSS go in the same pass.
  - **`margin-left: auto` went back onto `.event-id`** when the box that had taken it was removed. Two autos in one flex row split the free space between them, so exactly one element in the head may carry it.
- **THE CONTAINERS WERE COMPACTED AGAIN** (2026-08-24), sixteen declarations, **all of them padding, gap, margin, radius or control height — no type sizes**. Those were already cut once and cutting them again is how a room ends up unreadable. Row gap 6→4px, card head 7/10→5/9, body 9/10/10→7/9/8, field gaps 6/8→5/7, panel and bar padding 4/12/12→2/9/8, radius 10→8, bar gap 12→8, controls 42→36px, and the folder-tab legend 0.92→0.74rem. **The tab was the tallest thing on a bar holding one control**, which is the giveaway that a label had been sized for a different room.
  - **THE SHARED ROOM HEADER WAS LEFT ALONE.** `.room-head`, `.room-title` and `.room-blurb` come from `admin-shell.css` and are the same object in four rooms. **Overriding the title size here is exactly the fork that sheet exists to prevent** — four inline copies is how those rooms drifted into four different scales in the first place. If the header is too tall, it is too tall in every room and changes there.
- **THE CLOSED ROW CARRIES THE CITY AND NOT THE VENUE.** A game is built around a city, so "where is this" is the question you ask of a *list* of events; the stadium is a detail you open the row for.
- **NO KIND CHIP BESIDE THE NAME.** All 272 rows in the table are `sports`, so the chip said the same word on every line and distinguished nothing — the loudest repetition on the row, and it sat between the two things you actually read, the name and where it is. The kind is in the What band a click away, and **the name already tells you**: a sports row reads "Away at Home", everything else reads as its own title. Same argument as the Tape Room dropping the status chip from a track and drawing the Spotify ID chip only when the id is missing.
  - **THE OTHER CHIPS STAY, and they are a different kind of thing.** `neutral site`, `⚠ club missing` and `unsaved` are **exceptions**, drawn only on the rows they are true of. **A label drawn on every row is furniture; one drawn on three rows out of fifty is news.** `.event-kind` is still the shared chip style for those three, so it is not dead CSS.
- **A NEW ROW OPENS ITSELF.** It exists only to be filled in, so making you press it first would be one click on the way to the only thing you can do with it.
- **CHECK's `Go` OPENS THE ROW IT RINGS.** Landing on a closed row would show the heading and hide the field the finding is about, which is the thing you pressed Go to reach.
- **`FIELD_GROUPS` is the layout; `EDITABLE_FIELDS` is still the column list.** The write path reads the second, never the first, so the two can disagree — and **a field in no band is a field nobody can edit, with nothing on screen saying so**: the card would simply not draw it and the column would quietly stop being maintained. `assertBandsCoverFields()` runs on load and logs both directions of that mismatch.
- **THE BANDS ARE THE FIVE Ws: Who · What · When · Where · Why** (2026-08-24). An anchor event is a real thing that happened somewhere, so the questions a person asks of one are the questions they ask of any event — **naming the bands that way means nobody has to learn our vocabulary to read the form**. They were When / What / Where / Clubs / Result / Source.
  - **WHO IS A TWO-ROW TABLE, ONE ROW PER CLUB** (2026-08-24): `from | are | score | tgbid`, away above home, with League and Sport spanning two each on the line above. The ten fields were in an auto-fit grid that packed them in whatever order they fitted, so **`home_score` wrapped onto a second row beside the tgbids** — one club's four facts split across two lines while the other club's sat whole on one.
    - **EVERY LABEL NAMES ITS OWN FIELD** (2026-08-24). They were `Away from`,
      `Away are`, `Home from`, `Home are` — built so a club's row scanned as a
      sentence: *"Away, from Chicago, are Bears"*. **That works reading left to
      right along the row and fails the moment you look at one box**, which is
      exactly what somebody does when filling one in. A form label has to work
      the second way.
    - **`geo` AND `nickname` SAY WHAT GOES IN THE BOX; `Away team` SAYS WHOSE.**
      So: **Away team geo · Away team nickname · Away team score · Away team
      tgbid**, and the same four for home.
    - **THE SCORES WERE RENAMED TOO, THOUGH THEY WERE ALREADY READABLE.** A row
      where three labels open `Away team` and the fourth opens `Away` reads as
      an oversight. All four columns of a club's row now share one shape, so the
      band reads DOWN as well as across.
    - **THE LONGEST IS `Away team tgbid (opt)`, about 142px in a ~120px column**,
      so it wraps to two lines. That is fine and was checked rather than assumed;
      the label has no `nowrap`, and the narrow breakpoints give it MORE room,
      not less. Anything that would need three lines is too long.
    - **THE MANUAL FORM FOLLOWED FOR FREE**, being derived from `FIELD_GROUPS`.
      Two hand-kept lists would have drifted on the first rename — which is the
      whole reason it is derived.
    - **THE FIELD ORDER IS BY SIDE**, away's four then home's four. The tgbids used to trail after both clubs, which is what let the wrap interleave them.
    - **`nth-child(1)` and `(2)` are League and Sport**, which is positional and therefore **pinned by a test**. `:has()` would name them directly and is not reached for, because this file serves whatever browser the admin happens to have.
    - **THE MANUAL FORM NEEDED NO EDIT.** It is derived from `FIELD_GROUPS`, so it followed — which is the whole point of deriving it, and two suites noticed by failing on the old order.
  - **WHAT PUTS ITS TWO FIELDS SIDE BY SIDE** (2026-08-24). Kind is a select with six short values and Description is prose, so the auto-fit grid's equal columns were wrong in both directions — **and `span: 'full'` on the description pushed it onto a row of its own, leaving a six-character dropdown alone on the line above it.** Fixed proportions (`minmax(0, 0.55fr) minmax(0, 2fr)`) rather than auto-fit, because the two are not interchangeable: one is always narrow and one always wants the room. `minmax(0, …)` on both, or a long word in the textarea pushes the column past the card.
    - **THE `field--full` OVERRIDE IS SCOPED TO THE BAND**, not dropped from `FIELD_META`. The manual form is one column, so full width means the same thing there either way, and anything else drawing a description keeps the behaviour it was written for.
    - **THEY STACK AGAIN UNDER 560px.** 0.55fr of a phone's width is a 110px dropdown beside a 200px box with both labels wrapping to three lines.
- **THE NEUTRAL-SITE CHECKBOX IS LABEL-ABOVE-CONTROL LIKE EVERY OTHER FIELD** (2026-08-24). It was a two-column grid — box then words, both on one line — which put the whole field up on the **label row** of its neighbours, floating above two inputs with nothing under it. Every other field in the band reads label, then control; this one does too now, so the labels line up across the row and so do the controls.
  - **THE 8.5px IS THE ALIGNMENT AND IT IS EXACT, NOT EYEBALLED.** An input is 32px tall so its middle sits at 16; the box is 15px, so it needs `(32 - 15) / 2` to put its own middle on 16. **A test recomputes that from the stylesheet**, so changing the input height or the box size fails loudly rather than drifting a pixel at a time.
  - **THE MANUAL FORM KEEPS THE INLINE TREATMENT, deliberately.** It is one column, so a label on its own line above a 15px box would spend two rows of a 22-field form on one tick — and there are no neighbouring controls for it to line up with, which is the entire reason the card's version changed.
  - **THREE JUDGEMENT CALLS, all arguable.** **Scores are under WHO**: they are per-club columns (`away_score` sits beside `away_mascot`) and "who won" is a question about the clubs, not a sixth category — a Result band held three fields that only ever applied to the same rows the club fields do. **Status is under WHEN**: scheduled / postponed / cancelled are statements about whether and when this happens, which is what the dates answer. **WHY is the evidence** — `url` and `source`, why we believe this is a real event worth building a game around, the same job `waypoints.source_url` does, named for the question rather than the format.
  - **EACH BAND IS A FOLDER-TAB PANEL IN ITS OWN COLOUR** (2026-08-24). The five Ws are the card's whole structure, so they are told apart by colour rather than by reading five labels — you learn where the dates are once and then aim at the amber band.
    - **A REAL `<fieldset><legend>`, the same object as the command bars up the page**, so the browser cuts the panel's top border for the tab. Drawing that cut over a `<div>` means faking a gap that has to track the word's width. The tab is a **pseudo-element over the top half of the legend** with `isolation: isolate` — the identical construction, and the identical reasons, as `.command-bar > legend`.
    - **IT WAS A PILL FOR ONE PASS.** A pill says "label on a group"; a tab says "this panel is a section of the card", which is what these are and what the rest of the room already uses.
    - **`--band-rgb` IS SET PER BAND AND EVERYTHING ELSE IS AN ALPHA OF IT** — the fill, the border and the tab. Held as R,G,B triples rather than colours so a hue cannot drift between the three.
    - **WHY IS PLUM, AND IT WAS THE ERROR RED UNTIL 2026-08-24.** Not merely
      near it: `--band-why-rgb` was `160, 63, 45` and `--danger` is `#a03f2d`,
      **the same three numbers**. That was a harmless joke while nothing else on
      the card was red, and it stopped being one the day a row in review started
      taking `--danger` for its border and its left edge, so the WHY tab read as
      a fault rather than as a heading. It is `132, 38, 112` now.
    - **CHOSEN BY MEASUREMENT.** 54 deltaE off the red pen, where it was 0.0;
      24 off the violet next door, against the 18.6 that blue and violet have
      always sat at, so it is no tighter than the set already was; 7.23:1 as tab
      text on its own wash.
    - **HUE ALONE IS THE WRONG METRIC, and the first cut of the test used it.**
      **Amber is only 30 degrees off the red pen** and does not read as red at
      all, because it also differs in lightness and chroma — so a hue-gap bar
      strict enough to protect WHY failed WHEN for no reason. In Lab, amber is
      **32 deltaE** away, which is comfortable. `bands-test` recomputes contrast
      and deltaE **from the stylesheet**, so changing a token fails loudly rather
      than drifting a shade at a time, and no band can ever be the red pen again.
    - **THE AMBER IS MEASURED, NOT PICKED.** The tab sets its text in the band's own hue on a wash of it, and at 0.62rem that must clear 4.5:1. A natural amber (150,106,24) came out at **3.67:1** — amber is simply light — so When is `122,84,12`, which measures 4.97:1 and still reads amber beside the other four. **All five were checked; the worst is 4.97:1.**
    - **THE FILLS ALONE DO NOT SEPARATE FIVE HUES**, and it is worth knowing rather than pretending. At the alpha a card can carry, the five washes are within a few channel values of each other; **the tab is what actually carries the colour**, and the fill is a hint that the tab is telling the truth.
    - **`box: true` IS GONE.** Only When was boxed, on the argument that it is the one most reached for; with a hue each, singling one out would say it is the only group that is a group. It says it by being the amber one.
  - **WHEN NO LONGER LEADS.** It kept its box, which is what grouped the date and time together, but the five Ws have a usual order and Who comes first. **Say so if the box should go back under the collapse row** — that was an explicit earlier decision and this order overrides it.
  - **THE MANUAL FORM IS DERIVED FROM `FIELD_GROUPS`**, not listed again: two hand-kept orders would drift the first time a field moved. **`title` is injected into What** — on a card it is the header box and so in no band, and this dialog has no header box. `assertManualCoversFields` now also catches a field listed **twice**, which is what an injection into a group that already named it would produce: two boxes for one column, with `readForm` taking whichever it found first.
- **THE BANDS WERE PREVIOUSLY When, What, Where, Clubs, Result, Source.** A new row gets its id box above them, being the one field that must be filled before anything can be stored and permanent once it is.
- **WHEN LEADS, DIRECTLY UNDER THE EXPAND ROW, AND IT IS IN A BOX** (2026-08-23). The head shows the date and time in a box on the right; opening the card puts **the same three facts, editable, in a matching box immediately beneath it**. Painted to the same border, fill and radius as `.event-datebox` on purpose, so reading a date and writing one are visibly **one thing in two states** rather than two unrelated panels. It is also the band most often reached for — a fixture moves, a kickoff slot lands, a festival turns out to run three days — and under What it sat two bands down behind a description nobody edits.
  - **`box: true` on the group is the whole switch**, so a second band could be boxed with one word if one ever earns it. Today exactly one is, and the test asserts that.
  - **A BOXED BAND DROPS ITS HEAD RULE.** `.event-band-head::after` draws a line out to the edge, which is right for an unboxed group and is **two frames for one thing** inside a border. Same repetition this room keeps having to remove.
- **THE CLUBS BAND IS HIDDEN ON A NON-SPORTS ROW** — a concert row carried eight blank club and tgbid boxes — **and only when it is also EMPTY.** That second half is what keeps it honest: hiding a band that holds values would put data on the row nothing on screen can reach or correct, which is `assertBandsCoverFields`'s failure arrived at from the other direction. A concert row that somehow carries a mascot still shows Clubs, so you can see it and clear it.
- **NO PER-BAND NOTE.** Each band briefly carried an explanatory sentence: three extra things to read on a form whose labels already say what the fields are. What genuinely needed saying moved onto the field's own `title`.
- **`.event-band[hidden]` and `.event-body[hidden]` ARE DECLARED, and this is the fifth time this project has hit that rule.** Any author `display` beats the UA sheet's `display: none`, so both are left as plain blocks and the rules are the belt for whenever one grows a display of its own.
- **DELETE MOVED HARD LEFT, SAVE HARD RIGHT**, with a flex spacer between. Delete sat against Save, which is one misclick from losing a row every game pointing at it depends on. Same arrangement the waypoint editor's foot uses.
- **Field labels are 0.64rem**, having been 0.6 and then briefly 0.68. Inside an opened row a label sits directly above the thing it names and is read once; the 0.6 they started at was under 10px at a default root.
- **A NEW EVENT PUTS ITS VENUE CITY IN THE CITY CATALOGUE** (2026-08-24). A new event routinely names a town the catalogue has never held — a stadium suburb, a festival site — and until now that produced an `unknown-city` finding, a trip to the Cities page and a form to fill in by hand. **The event has just told us the city; adding it is the obvious thing to do with that.**
  - **IT NEVER BLOCKS AND NEVER FAILS THE EVENT.** The event is already saved by the time this runs, so a refused catalogue write is reported and nothing else. **A city that could not be added is a smaller problem than an event that looks like it did not save.**
  - **IT IS NOT A GUESS.** `TgbCities.add` is handed the canonical string and the geo `TgbGeo.parseGeo` reads out of it — exactly what the add dialog sends — so a city arriving this way is the same row as one added by hand.
  - **IT FORCES A CATALOGUE RELOAD AFTERWARDS**, or `isKnownCity` and the City datalist would both go on not knowing about it and the ERRORS report would still call the city unknown.
  - **A CITY ALREADY THERE SAYS NOTHING.** The common case is not news.
  - **THE ESPN IMPORTER DELIBERATELY DOES NOT DO THIS.** It writes hundreds of rows at a time and **a bulk import quietly creating dozens of cities is a different decision** from one event bringing one city with it. It still badges a row "new city", which is the prompt to go and add it.
  - **`eventName` IS PASSED IN, not read from `submitManual`'s locals.** Reaching for `added` from here would have been a ReferenceError inside a `.then()`, surfacing as a rejected promise blaming the catalogue write for something else entirely.
- **`end_date` DEFAULTS TO `event_date`** (2026-08-23). A single-day event ends the day it starts, so a blank end date is filled from the start rather than stored null.
  - **WHAT IT CHANGES: null used to MEAN "one day"**, and 2026080101's column comment said so. Every reader then had to spell the fallback out — `matches()` and the CHECK rule both do `end_date || event_date`. **They keep it anyway**, and should: the fallback costs nothing and is the only thing standing between a reader and a row that arrives from somewhere we do not control.
  - **[2026082301](mc/supabase/migrations/2026082301_anchor_events_end_date_defaults.sql) WAS APPLIED ON 2026-08-24.** Verified against the live table rather than taken on trust: **603 rows, 0 with a null `end_date`, 0 ending before they start**, and all 272 pre-change NFL rows now reading `end_date == event_date`. **The TRIGGER half is unverified from here and that distinction matters** — proving it needs an insert with no `end_date`, and the publishable key is refused by RLS, so the count being 0 only proves the backfill ran. The probe is in the migration's Verify block.
  - **THE ESPN IMPORTER'S HALF IS PROVEN IN PRODUCTION.** 331 NCAAF rows were imported through SCHEDULE on 2026-08-24, after the change, and **every one arrived with `end_date` already set** — as against the 272 NFL rows filed on 2026-08-02 that needed the backfill. The split falls exactly on the date of the change.
  - **IT FILLS IN FRONT OF YOU, NOT ONLY AT SAVE TIME.** `withDefaults()` would apply it on the way out regardless, but the box would then sit empty while a value went to the database — a card showing something the row does not hold, which is the disagreement nobody notices until later. The end date box fills as you set the start.
  - **IT ONLY EVER FILLS A BLANK.** A real range you typed is never overwritten by changing the start date.
  - **IT INVENTS NO RANGE.** `displayWhen` prints `start – end` only when the two differ, so a filled-in same-day end reads exactly as it did.
  - **THERE ARE THREE WRITERS AND THE PAGE IS ONLY TWO OF THEM.** `withDefaults()` covers the card, the ESPN importer writes it per fixture, and the PROMPT text now asks for it — but **pasted SQL never goes through our code**, which is why 2026082301 carries a trigger as well as the backfill. A column default cannot do this job: `default event_date` is not legal, since a default may not reference another column.
  - **IT IS NOT A NOT NULL CONSTRAINT AND MUST NOT BECOME ONE.** `event_date` is itself nullable, an event whose date is not yet announced is a real row worth keeping, and the CHECK report names it rather than the database refusing it. A row with no start has no end.
- **THE URL FIELD CARRIES AN `OPEN` BUTTON** (2026-08-23). **A url is the one field on the card you cannot check by reading it**: a tickets page that has moved, a 404 and a perfectly good address all look identical in a text input.
  - **IT SITS BESIDE THE BOX, NOT IN THE CARD'S FOOT.** It acts on that one value; the foot acts on the whole row. Same arrangement the waypoint editor uses for its Source field, and `action: 'open'` in `FIELD_META` is generic, so any other field can grow one the same way.
  - **DEAD UNTIL THE BOX HOLDS SOMETHING THAT PARSES AS `http(s)`**, and it follows what you TYPE rather than what was loaded. A url that will not parse is one nobody can check, and opening it would put the browser somewhere strange rather than saying so.
  - **THE PROTOCOL CHECK IS THE SECURITY, not tidiness.** `javascript:alert(1)` parses perfectly well as a `URL`, so without it that string would become a live `href` on an admin page. Tested explicitly.
  - **`rel="noopener noreferrer"`** — the destination is somebody else's site and there is no reason to tell it where the link came from.
  - **IT IS GREYED, NOT REMOVED, AND NOT `disabled`.** An anchor cannot be disabled, so the off state is no `href` (not focusable, not followable) plus `aria-disabled` plus a class — and it keeps its place, so the box beside it does not change width the moment you type into it. The tooltip says which of the two reasons applies.
  - **A BORDERED `.btn`, not a bare link.** Borderless reads as a stray word beside a text box, and this is a control.
  - **It wraps the input in `.field-with-action` and the input keeps its `data-field`**, so `readForm()` still finds it. Verified: 22 of 22 editable fields still reachable on a card that has one.
- **THE DATE FIELD IS "START DATE", NOT "DATE"** (2026-08-23). It sits next to End date and the pair has to read as a pair: a bare "Date" beside "End date" invites the reading that one is the event and the other is something *about* it, when they are the two ends of the same thing. **The column stays `event_date`** — visible copy only, the same bargain the Tape Room made through four renames of its verbs.
  - **IT FORCED A SECOND RENAME.** `start_time` was labelled "Start (local)", which was unambiguous beside a field called "Date" and stopped being so the moment that became Start date: the band read **Start date | End date | Start (local)**, two labels opening on the same word for two different things. It is "Start time (local)" now. **The "(local)" is load-bearing and must stay**: the column holds the clock a player standing outside the venue reads, not the broadcast time the league publishes, and the two differ for most of the schedule.
- **AN UNSAVED ROW SAYS SO IN A WORD.** On a closed row the accent border would otherwise be the only sign, and an unsaved edit is discarded the moment the list redraws. The chip is drawn on every card and hidden by CSS until `.is-dirty`, so marking one costs no DOM work per keystroke.

**PROVED BY RENDERING IT, NOT BY READING IT.** The page runs in jsdom with the auth and REST modules stubbed and **the live 272 rows and all 1,451 cities fed in**. Verified: 50 cards build closed, zero controls in the closed list, the head is a `BUTTON` with `aria-expanded=false`, clicking it opens and builds 22 controls, all 22 editable fields are reachable, the Clubs band folds when Kind goes to concert with the band empty and stays when it holds a value, the actions read Delete | Save, a new row opens itself with an ID box, and CHECK renders its report. No console errors, so `assertBandsCoverFields` is silent too.

**THE TEST WAS WRONG BEFORE THE PAGE WAS.** A run said the Clubs band refused to fold; it was emptying five of the band's eight fields, and `syncBands` asks whether ANY field in it holds a value — `sport` and the two tgbids are in it. **The harness has now been the broken half twice on this page** (see also the 1000-row city truncation under CHECK), which is the argument for asserting an expected value in the test rather than eyeballing its output.

### THE ORDER IS OLDEST FIRST AND THERE IS NO SORT CONTROL (2026-08-24)

It had a SORT tab offering four orders — date each way, and type-then-date each way. **All of it is gone**; `compareRows` is simply the order.

- **OLDEST FIRST, because this is a forward-looking catalogue.** A game is played the day before its anchor event, so the row you want is the next one coming up.
- **THE WEEK HEADINGS ARE WHY A CHOICE WAS WRONG.** The list is separated by numbered weeks, and **weeks only read as a calendar in one direction** — a control offering to run them backwards, or to group by type instead, was offering to make the page worse. The week grouping was conditional on not being a type sort; it is unconditional now.
- **`state.sort` IS GONE.** Nothing chooses, so nothing has to be remembered. `loadEvents()` asks PostgREST for the same order, so the first paint and the sorted list agree — kept in step by hand, and nothing checks that they are.
- **UNDATED SINKS TO THE END and ties break on `id`**, which is what makes the order stable: twelve fixtures share a Sunday, and without a second key one could move under you as you type in the search box.
- **DELETED WITH IT**, all of it read by nothing afterwards: the type branch of `compareRows`, the kind chip (drawn only while grouped by type, to stop the grouping being invisible), and **`effectiveKind()`**, whose only two readers those were. The places that still ask "is this a sports row" use the plainer `!kind || kind === 'sports'`.

### MARKED PAST WAS A CHIP, AND IT WENT WITH THE REST (2026-08-24)

A quiet dashed `past` chip used to sit on any row whose LAST day had been and
gone. **It is deleted, with `isPast()`**, in the pass that took every chip off
these rows. Its reasoning is kept because the questions come back:

- **IT READ `end_date`, NOT `event_date`**, so a festival was not called past
  while it was still running.
- **TODAY IS NOT PAST.** Strictly less than, so an event happening this afternoon
  is still ahead of you, which is when somebody is most likely to look at it.
- **IT WAS NOT THE `past-but-scheduled` RULE, AND THAT RULE SURVIVES.** That one
  fires when a past row still claims to be `scheduled` — a record out of step
  with the world — and it now forces the row into review. The chip said only when
  the event was, which the date on the row already says.
- **WHICH IS WHY LOSING IT COSTS LITTLE.** The row carries its date; a chip
  restating that the date has passed was the row saying one thing twice.

**AND THE FIRST TEST RUN FAILED ON THE TEST, NOT THE PAGE.** The fixtures were
built with `toISOString()` (UTC) while `todayIso()` is local, and local was a day
behind UTC, so the fixture's "yesterday" was really the page's today. **The
page's choice is the right one**: whether an event has happened should be
answered in the reader's own day. `past-sort-test` still holds that case.

### SPLIT A MULTI-DAY EVENT INTO ONE EVENT PER DAY (2026-08-23)

A **Split into N days** button on an opened row, drawn only when `end_date` is later than `event_date`. It turns a span into one row per day, each titled `... (Day 2 of 4)`.

- **A GAME IS PLAYED THE DAY BEFORE ITS ANCHOR EVENT, and that is the whole reason this exists.** A convention running Friday to Sunday is not one opportunity, it is three: somebody arriving for Saturday wants a game on Friday, and a single row spanning the weekend cannot express that. Split, each day is its own anchorable event with its own date.
- **THE ORIGINAL ROW SURVIVES AND BECOMES DAY 1.** It is not deleted and re-created, because **`games.anchor_event_id` is a foreign key pointing at that id**: deleting the row would either fail on the constraint or orphan every game built on it. Days 2..N are new rows; day 1 keeps the id anything already points at, and a game anchored to the old span stays anchored to the first day of it, which is the closest true answer. The confirmation says so.
- **DAY 1 IS WRITTEN FIRST, DELIBERATELY.** If the inserts then fail you are left with a one-day event and a message saying to fix the problem and split again — a state somebody can act on. The other order leaves duplicate days 2..N beside a row still claiming the whole span.
- **UTC THROUGHOUT.** These are calendar dates, not moments, and a local-time `Date` crossing a DST boundary lands on 23 or 25 hours, so the day arithmetic drifts by one. On a nine-day festival that is a wrong answer, not a rounding error. Tested across both US DST switches, a leap day and a year end.
- **IT READS THE FORM, NOT THE STORED ROW**, so a span you have just typed splits the way it looks on screen, and `withDefaults()` collapses a blank end date exactly as a save would.
- **`return=representation` ON THE PATCH IS NOT DECORATION.** PostgREST answers **200 with an empty array** when RLS refuses a write, so without reading the row back a refused split reports success and then inserts days 2..N beside an unchanged original.
- **IDS ARE `<id>-D2`, `-D3`…, AND DAY 1 KEEPS THE BARE ID.** An id already in the table gets a letter (`-D2a`) rather than being written over: two rows cannot share a primary key, and silently clobbering somebody's row is the worse failure.
- **RE-SPLITTING REWRITES THE SUFFIX RATHER THAN STACKING IT**, so a row cannot end up `X (Day 1 of 3) (Day 1 of 2)`. `DAY_SUFFIX_RE` is what strips the old one.
- **NO EM DASH IN THE SEPARATOR**, per the standing rule, and `DAY_SUFFIX` is a constant so a fifth opinion about the wording is one edit.
- **THE `multi-day` RULE EXISTS so a splittable row is findable without opening fifty cards** — the Split button only exists on an opened one. **It is the one rule marked `noReview: true`**: nothing is missing from a multi-day row and nobody has to find anything out, so putting every festival in the table into review forever would be the flag crying wolf again.
- **`.event-actions .btn[hidden]` HAD TO BE DECLARED — the SIXTH time this project has hit that rule.** `.btn` carries an author `display: inline-flex` and `[hidden]` is only a UA-sheet `display: none`, so setting `.hidden` silently did nothing and Split appeared on every row.

**PROVED ON ROWS BUILT TO BE SPLIT, because there is not one multi-day event in the live table.** 28 unit cases over `dayCount` / `dayTitle` / `dayId` / `planSplit` — DST both ways, a leap day, a year boundary, id collisions, re-splitting, a nine-day festival — and 10 more in the rendered page: the button appears on a four-day row and not on a one-day row or a real NFL fixture, widening the end date reveals it and recounts with no reload, narrowing hides it again, the actions read `Delete | Split | Save`, and the `multi-day` rule names the row without turning it red.

### AN ERROR PUTS THE ROW INTO REVIEW. THERE ARE NO CHIPS. (2026-08-24)

**`status = 'review'` is now the one place "something is wrong with this row" is
recorded**, and it is written by the audit and by a human alike. That second half
is the whole point of the change: **a person can flag a row exactly the way the
checks do**, by picking Review in the Status dropdown, and it lands in the same
list, wearing the same red, reached by the same button.

**THE ROW ITSELF IS THE FLAG.** `.event-row.is-review` takes a red border, a
3px red left edge and a faint red fill, and its reasons are drawn as
`.event-annotation-line`s **on the CLOSED row** — you do not open a card to find
out what is wrong with it. **Every chip is gone**: `past`, `neutral site`,
`update needed`, `unsaved` and the `.event-pills` wrap that held them, plus
`isPast()` and the `.event-kind` CSS. **Delete a control and its CSS in the same
pass**; this room had collected five kinds of chip and a row could wear four at
once, which squeezed the name the row exists to show.

- **`reviewReasons(row)` IS THE ONE READER, AND IT READS `CHECK_RULES`.** Every
  rule but one carries the force; **a separate list of what makes a row wrong
  would be a second idea of it** and the two would drift the first time either
  was edited. It also folds in the cross-row duplicate finding, which no
  per-row rule can see.
- **`isInReview(row)` IS `status === 'review'` OR `reviewReasons().length`.** So a
  row can be in review because a rule says so, because a human said so, or both,
  and nothing on screen has to distinguish them.
- **TWO RULES REPORT WITHOUT ACCUSING, AND THEY ARE DRAWN AS NOTES** (2026-08-25).
  `multi-day` and `no-time` carry `noReview: true`: their findings appear on the
  row in the **muted** pen, under any real faults, and never turn it red or put
  it into review.
  - **`no-time` STOPPED FORCING because a missing start time means the SOURCE has
    not announced the slot yet.** That is a gap which fills itself when the
    league or the promoter publishes it, not something anybody can act on.
    Forcing it put **524 rows** — most of the concert catalogue — into a list of
    things to do with nothing to do. An ERRORS press went from **567 rows (14%)
    to 43 (1%)**, measured against the live 4,123.
  - **THE MESSAGE SAYS "THE SOURCE", NOT "THE LEAGUE".** League was true while
    the table was 603 NFL and NCAAF fixtures and became wrong the morning TGB
    ANCHOR BOT filed 524 concerts.
  - **AN EXPLICIT `TBD` STILL FORCES REVIEW**, and the difference is real: that
    is scraped text sitting in the description which goes stale and wants
    clearing, and the row usually carries a meaningless zoned time beside it.
    Absent is a gap; TBD is a statement.
  - **THEIR FINDINGS HAD NEVER BEEN SHOWN TO ANYBODY.** `reviewReasons()` filters
    `noReview` rules out by design and nothing else read them, so `multi-day` had
    been computed and discarded since it was written. **A rule whose message no
    eye ever reaches is a rule that is not doing anything.** `noteReasons()` is
    the reader; a test asserted the old silence and had to be corrected.
  - **`.event-annotation-line--note` IS MUTED, NOT RED.** Sharing the red pen
    would undo the whole point: 524 rows would look wrong for a slot nobody has
    announced.
- **`multi-day` WAS THE ONLY RULE MARKED `noReview: true` until `no-time` joined it.** A run of several days
  is a suggestion (there is a Split button for it), not a fault. Forcing it would
  put every festival in the table into review forever, which is the flag crying
  wolf — and a flag people stop reading costs more than it was worth.
- **`'review'` HAD TO GO INTO `STATUS_VALUES` OR THE PAGE ACCUSES ITSELF.** The
  `bad-status` rule flags a status it does not recognise, so without this a row
  in review is in review *because* it is in review, and it never settles.
  Nothing in the database needed changing: `anchor_events.status` is free text
  with no CHECK, so `review` needed no migration.

**THE ERRORS BUTTON RUNS THE CHECKS, WRITES `review`, AND SHOWS ONLY THOSE
ROWS.** One press does all three, because they are one errand. It reads
`Errors (N)` with N the count in review, and **`Show all` while you are in that
view**, so the face always names what the press will do.

- **IT FORCES THE CITY CATALOGUE RELOAD (`{ force: true }`).** `TgbCities`
  caches on first load, and the commonest fix for a finding is adding the city on
  the other page. Without the force you would come back, press Errors, and be
  told the city still does not exist: **both halves working and the errand
  looking broken.** Best-effort, since a catalogue that will not reload is no
  reason to refuse to re-check the events.
- **THE WRITE IS PER ROW WITH `Prefer: return=representation`.** PostgREST
  answers **200 with an empty array** when RLS refuses a PATCH, so without
  reading the row back a refused sweep reports success and the page shows a
  status the table never took.
- **IT WRITES ONLY WHAT IS NOT ALREADY IN REVIEW**, so a second press writes
  nothing. Verified against the live table before shipping: one press would
  rewrite **0 of 604 rows**, because they are all clean.

**TWO COSTS, STATED PLAINLY, BECAUSE BOTH ARE REAL AND NEITHER IS AN OVERSIGHT.**

1. **`review` OVERWRITES THE PREVIOUS STATUS AND NOTHING RECORDS WHAT IT WAS.**
   A `postponed` row that trips a rule becomes `review`, and the fact that it was
   postponed survives only in whatever else the row says. One column is holding
   two ideas — where the event stands in the world, and whether we are happy with
   the row. **If that ever bites, the answer is a second column
   (`needs_review boolean`), not a cleverer status.**
2. **THE SWEEP NEVER WRITES A ROW BACK OUT OF REVIEW.** Fixing the fault drops
   the specific findings and leaves the row red until somebody sets the status
   back by hand. **That is deliberate**: clearing it automatically would undo a
   human's own flag, which is the one thing this change exists to make possible.
   So the annotation on such a row must say something TRUE of it — *"In review,
   with nothing here for a rule to object to; set the status back when it is
   settled"* — and must **not** claim a human flagged it, which was the first
   wording and was wrong for exactly the rows the sweep had touched.

**THE ERRORS DIALOG IS DELETED**, with `renderCheckReport`, `FINDING_GOTO`, the
Copy report / Refresh / Close head, `.check-item` and the rest of its CSS. A
report listing findings had to repeat each row's name and id just to say what it
was talking about, and then offer a way back to it; drawn on the row it inherits
both for free. **The same reasoning that deleted the Tape Room's Issues view.**

**WHAT THAT COST: the `Add city` button is gone.** `FINDING_GOTO` carried the
unknown city to `/mc/data/cities.html?add=<encoded>` so the add dialog opened
prefilled. **The Cities half is untouched and still works** — `?add=` is still
read, still cleared only once acted on, still `replaceState` — so rebuilding the
affordance is one link on the annotation line if it is wanted. What was lost is
only the link.

### 12:01 AM MEANS THE KICKOFF HAS NOT BEEN ANNOUNCED (2026-08-24)

`TBA_TIME = '00:01'`, written by the ESPN importer and backfilled onto the 43
rows already filed by [2026082402](mc/supabase/migrations/2026082402_anchor_events_tba_start_time.sql), **apply by hand**.

- **ESPN SAYS SO AND THE IMPORTER THREW IT AWAY.** A fixture with no published
  kickoff still carries a placeholder UTC timestamp, and `status.type.shortDetail`
  reads `TBD`. The importer copied that into the description and then **zoned the
  placeholder anyway**, so the 43 rows hold **26 at 00:00, 11 at 23:00, 5 at
  21:00 and 1 at 22:00** — one placeholder seen through four timezones.
- **A WRONG TIME IS WORSE THAN A BLANK, and this is why it mattered.**
  `no-start-time` cannot see these rows: the field IS populated. The standing
  rule that an unmapped venue leaves `start_time` NULL exists for exactly this
  reason and was being undercut by the branch above it.
- **00:01 IS THE LISTINGS CONVENTION** for "to be announced". It sorts to the top
  of its own day rather than sitting among the evening games, and it is one
  minute off a midnight that might be genuine.
- **THE COST, PLAINLY: it is a real time.** The field alone cannot be told from a
  genuine 12:01 AM event. What stops that being lost is that **the TBD stays in
  the description** and the `tbd` rule keeps the row in review until somebody
  replaces it with the real kickoff. **Do not tidy those descriptions** — the
  sentence is the only evidence of what 00:01 means.
- **THE BACKFILL MATCHES ON THE DESCRIPTION, NEVER ON THE TIME.** All four
  placeholder clock values are times real fixtures also hold, so matching on them
  would rewrite genuine kickoffs. Word-boundary in Postgres (`~*` with `\m`/`\M`)
  as on the page, and `is distinct from` makes it re-runnable.
- **ONE CONSTANT.** `TBA_TIME` is named once, so the importer and any future
  writer cannot disagree about which minute means "not announced".
- **The page writes it going forward**, so the migration is a backfill of what is
  already filed rather than the mechanism — the same split as the `tbd` rule.

### A TBD ANYWHERE ON THE ROW FORCES REVIEW (2026-08-24)

The `tbd` rule scans **every editable text field** for `tbd` / `tba` / `to be
determined` / `to be announced`, so the ERRORS press files those rows like any
other finding. It is a rule rather than a one-off UPDATE on purpose: the SQL
would fix today's rows and say nothing about tomorrow's import.

- **IT WAS ALREADY CAUGHT IN THE CLUB FIELDS AND THAT MISSED THE REAL CASE.**
  `isPlaceholderClub` reads `away_*` / `home_*` only. **The 43 rows that actually
  carry a TBD carry it in the DESCRIPTION** — `"... ESPN listing: TBD."`, written
  by the ESPN importer when a kickoff has not been published.
- **AND THOSE ROWS STORE A START TIME THAT MEANS NOTHING.** The importer zoned
  the placeholder anyway, so they read `21:00:00` or `00:00:00`. **A row claiming
  midnight is worse than a row claiming nothing**, because `no-start-time` cannot
  see it: the field is populated. The TBD is the only trace left that the time
  was never known, which is what makes scanning the prose worth doing.
- **WORD BOUNDARY, NEVER A BARE SUBSTRING.** `Tbilisi` and `Ratbdome` must not
  flag; a rule that cries wolf is one people stop reading.
- **NUMERIC AND BOOLEAN FIELDS ARE NOT SCANNED.** `TEXT_FIELDS` is DERIVED from
  `EDITABLE_FIELDS` minus those two lists rather than written out again, so a
  column added to the form is scanned without anybody remembering to.
- **THE DEAD `update: true` FLAG WENT IN THE SAME PASS.** Nine rules carried it
  and **nothing had read it** since `reviewReasons` started filtering on
  `noReview`. Two ideas of "does this force review" is exactly the drift this
  file keeps paying for.

**PROVED AGAINST THE LIVE TABLE, ALL 603 ROWS PAGED.** A press would put
**43 rows** into review, every one of them for `tbd`, and **no other rule fires
on the remaining 560** — so widening the scan did not start flagging finished
rows. 21 unit cases besides, six of them false-positive guards.

**THE ESCAPING SCAR AGAIN, SEVENTH TIME.** The two word boundaries in `TBD_RE`
reached the file as literal **backspace** bytes. Same heredoc into Python into
the file; same fix, `chr(92)`.

**THE TEST HARNESS BROKE ON THE INSERT POINT, WHICH IS WORTH KNOWING.** The new
constants sit between `PLACEHOLDER_CLUB` and `isPlaceholderClub`, so the suites'
`helpers` regex swallowed them and `TBD_RE` was declared twice. **A test that
scrapes a source file by regex is coupled to where things sit in it.**

**THE RULES THEMSELVES ARE UNCHANGED and their reasoning still holds:**

- **`isPlaceholderClub` READS THE CLUB FIELDS ONLY, NEVER THE TITLE.** "AFC
  Championship" is a real title for a row whose clubs are known, and matching it
  there would flag every playoff game forever. The conference pattern is anchored
  to the WHOLE value, so "National Harbor Wizards" and "New England Patriots" do
  not flag.
- **`cancelled` DELIBERATELY DOES NOT FLAG.** It is settled; `postponed` is a
  promise of a new date.
- **A FINDING MUST FIT THE ROW IT IS DRAWN ON** (2026-08-25). The duplicate
  finding read **"Same league, date and clubs as X"** on every row it caught —
  right for a fixture and **nonsense on a concert**, which has no league and no
  clubs. The table is 524 concerts deep. The message is now built from what
  actually matched: *"Same league, title, date and clubs as NFL-A"* against
  *"Same title and date as CON-A"*.
  - **`duplicateIds` HOLDS `{twin, what}`, NOT JUST AN ID.** The phrase is
    assembled where the key is, because that is the only place that knows which
    parts were non-empty. Writing one sentence at the finding is what produced
    the wrong one.
  - **THE KEY ITSELF WAS ALREADY RIGHT** and did not change: it falls back to
    title + date when there are no clubs, which is why two concerts on one night
    at different venues are not called duplicates. **Only the wording was
    wrong**, which is the kind of bug that survives because the logic works.
- **`label-drift` NAMED A TRIGGER THAT NO LONGER EXISTS**, and did from the
  moment 2026082502 renamed the family to `tgb_events_*`. It told people to run
  a migration that would not fix it and to look for `tgb_anchor_events_sync_labels`,
  which is not there. **A finding that names the wrong object is worse than no
  finding**: it is the translate-errors-into-sentences rule failing in the one
  place it was supposed to be applied. It names `tgb_events_sync_team_names` and
  2026082502 now.
- **`label-drift` IS THE ONE SCHEMA FINDING.** `away_label` / `home_label`
  disagreeing with their locale + mascot halves does not mean the ROW is wrong,
  it means `tgb_anchor_events_sync_labels` is not installed, and the finding
  names the migration.
- **`isKnownCity` RETURNS TRUE WHEN THE CATALOGUE HAS NOT LOADED**, and it
  compares **trim + lowercase**. It compared exactly (`=== v`) while the Cities
  page lowercased, so a row holding `chicago, illinois` was **UNKNOWN here and
  ALREADY THERE over there** — press Add city, no form appears, both pages right
  by their own rule. Deliberately nothing fuzzier: `city` is a canonical string
  with one spelling, and a loose match would hide the typos this exists to catch.
- **THE AUDIT READS `state.rows`, WHICH IS GENUINELY THE WHOLE TABLE**, because
  `loadEvents()` pulls through `TgbRest.fetchAll` and pages past PostgREST's
  silent 1000-row cap. **If that ever goes back to a single unpaged fetch, the
  sweep audits the first thousand rows and reports a clean bill for the rest.**
- **A RULE THAT THROWS IS CAUGHT AND LOGGED** and the sweep carries on. A bug in
  one rule must not tell somebody their table is fine.

**PROVED BY RUNS THAT MADE IT DO ITS JOB, NOT BY AN EMPTY REPLY.** The live table
is clean, so every rule finds nothing on it — **and an empty answer is exactly
what a broken check also returns.** So each rule is provoked by a row built to
trip it (16 cases, including four false-positive guards), and 23 more in the
rendered page: the faulty row is red and the clean one is not, a hand-flagged row
is red with the "nothing objects" wording, a multi-day run is NOT forced, the
annotation shows on the CLOSED row and names both faults, one press writes only
the faulty row and only `review`, the list narrows to the review rows, the second
press shows everything, a repeat sweep writes nothing, `review` is in the Status
dropdown, and a row in review is not also a bad-status error.

**AND THE TEST HARNESS FELL INTO THIS FILE'S OWN 1000-ROW TRAP.** A first pass
reported **90 unknown-city findings** across the NFL venue towns. They are all
real rows in `public.cities`; the harness had fetched the catalogue with one
unpaged `curl` and got the alphabet as far as roughly M. **`city-picker.js` pages
properly, so the page itself was always right** — the bug was in the check of the
check.

**THE ESCAPING SCAR CAME BACK, SIX TIMES ACROSS THIS WORK.** A backslash-b
reached the file as a literal **backspace** (0x08), a backslash-n as a real
newline that broke the parse, and a backslash-zero-zero-b-seven as a **NUL byte**
that made grep call the file binary. All went through a bash heredoc into Python
into the file: **three layers of escaping and one of them ate it.** `cat -A` is
what shows it, since these are invisible in a normal diff. **Fix: build the
backslash with `chr(92)`, type the character literally, or use `includes()`
instead of a regex.** The page is verified to contain zero control characters.

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

**Left in place deliberately:** `mc/_dev/scripts/mlb_matchup_maker.js`, `nfl-schedule-2026-matchup-maker.js` and the venue backfills still generate `public.games` rows, which is a different pipeline. **`mc/data/mlb.jsonl` was deleted 2026-08-08** — 9.9 MB with no reader but that generator, and because `mc/` is deployed it was being published to the public web on every build. Regenerate it with the script if it is ever wanted again. `mc/data/paths.jsonl` went the same day: its only reader was the archived `content.html`.

---

## Game play tracking (instances / responses / events)

**"Team" is two different things:** a **sports team** is a pro team a game is based on (`public.teams`; **team colors** = shell/stripe/mask belong here), reachable via `game_id → games`. A **Game Bureau team** is a group of our players, led by a **team leader** and identified by a chosen **team name**, never a color. The engine's blue/black/purple/silver/orange value is a **route-rotation slot** (`route_color`) and has nothing to do with a walking **Path**, not a sports-team color either — don't label Game Bureau teams with it.

Playthroughs are recorded for stats. A **team leader** (the buyer/leader — we used to say "player") plays a **game instance** (one playthrough by one Game Bureau team, a client-generated uuid). Tables: `game_instances`, `game_responses`, `game_events`, plus a `game_play_stats` view. Schema: [mc/supabase/migrations/20260625_game_instances_responses.sql](mc/supabase/migrations/20260625_game_instances_responses.sql); client: [mc/game/run/config/instance-tracker.js](mc/game/run/config/instance-tracker.js) (`window.TgbInstance`), wired into both engines. Full write-up: [mc/_dev/docs/supabase/game-instances-responses.md](mc/_dev/docs/supabase/game-instances-responses.md).

- **Append-only for anon** (engines use the anon key): RLS allows `INSERT` only; admin reads gated by `is_photo_admin()`. Don't add anon update/delete — record progress as `game_events`, not by mutating rows.
- **Team leader email is folded in server-side**, never sent by the client: the `tgb_link_game_instance_identity` SECURITY DEFINER trigger looks the play's `access_code` up in `gift_codes` and copies the Stripe email. The link is **Stripe → gift_codes → game_instances → game_responses**.
- Team name + team leader name are collected *before* Stripe in the buy modal (`mc/js/gs-buy-modal.js`) and written to `gift_codes` (`team_name`, `team_leader_name`) by `gs-create-checkout`; the instance trigger folds them onto the play. They're also best-effort on the instance (chosen in-game), and the authoritative team name is recoverable from `game_responses` (the `player_name` var). `route_color` is the engine's own rotation slot, not a sports color and not a walking Path.
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
- **A NEW PUBLIC PAGE UNDER `/mc/` MUST BE ADDED TO `PUBLIC_MC`**, or the
  beacon silently refuses to count it and the `<script>` tag looks like it
  worked. This is the exact trap the four public `mc/` pages already fell into
  once. **Follow was briefly the fifth entry and is not one any more**: it moved
  to `/follow/` at the root on 2026-08-20, where it is counted by default, and
  it came back OUT of the list in the same commit. A page named there that no
  longer lives under `/mc/` is a line that has stopped describing anything.
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
  public HTML on GitHub Pages — so the Tape Room offers a **LISTENER STATS** link in
  its VIEW bar, deep into the Cloudflare dashboard, with the caveats on its
  tooltip, rather than counts. (It was a **Viewer Statistics** card carrying
  those links plus a live *beacon-installed* check that fetched
  `site-analytics.js` and confirmed `TOKEN` was still filled in; the card is
  gone and only the link survives.) To put real figures on the page, a Supabase
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

## /linkinbio/ — THE ONE ADDRESS AN INSTAGRAM BIO CAN HOLD (2026-08-21)

[linkinbio/index.html](linkinbio/index.html). A black page listing the last 24 things we actually posted, each a whole-row link with the outlet's headline and a thumbnail. Title: **The Game Bureau Links**.

- **IT EXISTS BECAUSE INSTAGRAM'S CAPTION LINK IS NOT CLICKABLE**, on the account most likely to be read. Without somewhere to send people, every story posted there is a thing you can see and cannot reach. **This is not the Start Page idea that was refused** — that was a menu of our five accounts, and `/follow/` was deleted the day before for being five links that did not earn a page load. This one carries the CONTENT.
- **IT CALLS `tgb_public_socials_feed`, NOT THE TABLE**, and that is the whole safety argument. `public.socials` is admin-only in both directions and must stay so: it holds the review queue, `why` (an internal note written for one person) and `confidence` (the bot's score for its own pick). The function is `SECURITY DEFINER`, `STABLE` so a plain **GET** works from a static page, returns **`status = 'posted'` rows only**, and refuses all three of those fields.
  - **"ANY POST OF ANY KIND" MEANS ANY KIND, NOT ANY STATUS.** Stories, gifts and YouTube videos all appear. **Review and Skipped never do** — a candidate in Review is one nobody has decided on, and a skipped one was often turned down for being off-brand or grim. Publishing either would put our editorial judgement on the public web.
- **[2026082004_public_socials_feed.sql](mc/supabase/migrations/2026082004_public_socials_feed.sql) IS APPLIED**, verified by calling it. It was written for the deleted Follow page and recorded here as having no consumer; **it has one now**, and this page needed no migration of its own.
- **IT LISTS INSTAGRAM POSTS ONLY** ([2026082105](mc/supabase/migrations/2026082105_public_socials_feed_instagram.sql), **apply by hand**). The page exists because an Instagram caption link is not clickable, so **a story that never went to Instagram is one the reader arriving from Instagram has not seen** — and the list is read as "the things I just saw", which makes a Facebook-only post something they hunt for and never find. 18 of the newest 24 had gone to Instagram on the day this was written.
  - **FILTERED IN THE FUNCTION, NOT THE PAGE.** Filtering client-side would break the paging, because an offset counts rows the server returned rather than rows the page decided to draw.
  - **MATCHED ON `posted_platforms`, THE RECEIPT — never `platforms`, the bot's SUGGESTION.** The suggestion may name an account that refused the post or was never pressed, so filtering on it would list stories that are not on Instagram at all.
  - **THE SIGNATURE IS UNCHANGED**, so the page needed no edit and there is no second overload for PostgREST to refuse to choose between. **The name is now narrower than it reads** and that is a real cost: `tgb_public_socials_feed` sounds general and is not. If a general feed is ever wanted it needs a parameter, which means dropping this signature — **do not add an overload beside it**.
  - **THE PAGE'S OWN COPY MOVED WITH THE FILTER.** It said *"Everything we have posted lately"*, which stopped being true. A subtitle that overstates what a page holds is how somebody ends up scrolling for a story that is not there.
- **TWENTY-FIVE ON THE FRONT, EVERYTHING BEHIND `?all`** (2026-08-21). [2026082104](mc/supabase/migrations/2026082104_public_socials_feed_paged.sql) raised the per-call ceiling from 24 to 100 and added `feed_offset`, because the old function could serve neither number: 25 was above its clamp, and an archive cannot be one response forever.
  - **ONE FILE, TWO VIEWS, NOT TWO PAGES.** A second file means a second copy of this stylesheet and this renderer, and **copy-and-drift is the failure this repo has paid for more than any other**. A link to an archive was asked for; a separate FILE was not.
  - **THE FIRST PAGE PAINTS BEFORE ANYTHING ELSE HAPPENS.** Nothing waits on a second request. The archive is one request under 100 posts and grows a **Show more** button above it.
  - **A BUTTON, NOT AN INFINITE SCROLL.** Loading forever as somebody scrolls makes the footer unreachable and spends their data without asking.
  - **A SHORT PAGE IS THE END.** Asking for a count separately would be a second request answering a question the first already settles.
  - **THE FIRST PAGE DELIBERATELY DOES NOT SEND `feed_offset`.** PostgREST answers a call naming a parameter the function lacks with *function not found*, so a page that always sent it would be **blank until somebody ran some SQL**. Sending it only when non-zero means both views work against either version, and only the archive's DEPTH waits on the migration. Verified against a simulated old function: 24 rows and a working page, not an error.
  - **The order is `(posted_at desc, id desc)`, not `posted_at` alone.** Paging over an order with ties can show one row twice and skip another, and two posts filed in the same second is an ordinary morning here.
  - **The scraping argument behind the original cap is intact**: a caller still cannot ask for the whole table in one request. It can walk it, which is fine, since everything here is already public on our own accounts.
- **NOTHING ON THIS PAGE MOVES AFTER IT IS DRAWN** (2026-08-21), which is a requirement rather than a polish item: it is read in **Instagram's in-app browser**, which rubber-bands on both axes, so anything that reflows late reads as the page sliding around under your thumb.
  - **EVERY ROW IS A FIXED 98px, AND THAT IS THE REAL FIX.** Row height used to be decided by the TEXT — one line of headline or three, in whichever font had arrived — so the whole list re-laid itself out when the webfont landed and again as slow thumbnails resolved, and **everything below the change jumped**. At a fixed height the page is 25 rows of 108px before a single character is measured. `98 = 74px thumbnail + 11px padding either side + 2 borders`, so the picture still sets the proportion and the text now fits inside it rather than deciding it.
  - **THE CLAMP IS TWO LINES BECAUSE OF THAT, NOT BY TASTE.** Measured: two lines plus the source line is 59.5px inside a 74px content box; **three is 80.1px and pushes the source out of the card.** Change the height and re-do that sum.
  - **THIS IS WHAT MAKES THE NON-BLOCKING WEBFONT SAFE.** Loading the font as `media="print"` and switching to `all` is a deliberate late reflow — with fixed rows it can no longer move anything, only re-draw glyphs inside a box that is already the right size. The speed and the stability stopped being a trade.
  - **`overflow-x: hidden` IS THE BACKSTOP AND `overscroll-behavior: none` IS THE CURE.** One pixel of horizontal overflow turns every vertical swipe into a wobble there; the second stops the bounce itself and stops a swipe chaining through to whatever is behind the page.
  - **`.body` NEEDED `flex: 1 1 auto` AS WELL AS `min-width: 0`.** Without an explicit basis a flex child is sized from its content, and `.meta` is `white-space: nowrap`: a long outlet name could set a width wider than the row and push the card past the viewport, which is real overflow that `overflow-x: hidden` only conceals.
- **THE WEBFONT DOES NOT BLOCK THE FIRST PAINT.** A stylesheet link is render-blocking and this page is opened on mobile data inside Instagram's browser. Loaded as `media="print"` and switched to `all` on load, so the system stack draws immediately; a `<noscript>` copy covers a browser that never runs the switch.
- **NO SHARED CHROME, DELIBERATELY.** No nav, no `site-footer.js`, no `site-pages.css`. A bio-link page is one screen with no navigation — that is the form. **Don't add it to the site-pages nav sweep.**
- **It is at the ROOT, so `site-analytics.js` counts it by default** and `PUBLIC_MC` needs no entry. Traffic is the entire point of the page, so measuring it matters more here than almost anywhere.
- **THE SOURCE IS NAMED ON EVERY ROW AND THAT IS NOT DECORATION.** A headline is the **outlet's** line. A bare list of them under our own masthead would read as things The Game Bureau wrote.
- **A row with no url is not drawn.** MANUAL ADD can file a plain line of text with no destination, which is useful in the queue and is nothing at all on a page whose only job is to send people somewhere.
- **A dead image leaves the placeholder** rather than a browser's broken-image glyph, which on a black card looks like the page itself has failed. Same reasoning as the Socializer's IMAGE FAILED state, drawn the other way round because this one is public.
- **Links open in the SAME TAB.** This is read inside Instagram's own browser, where a new tab is a second webview with no obvious way back.
- **A failure says "Nothing here just yet." and puts the real reason in the console.** A visitor is told nothing about our schema; somebody who came to find out why the page is empty looks in the one place that has it.

## FOLLOW is a menu, not a page (2026-08-20)

**`/follow/` EXISTED FOR ONE DAY AND IS DELETED.** It was a public page listing the five accounts; five links did not earn a page load, a scroll and a way back. **FOLLOW is now a control that opens a Linktree-shaped menu** of the accounts, in two places: the public nav, and the **sign-off bar** of the footer.

- **`shell/site-nav.js` OWNS THE LIST AND THE REEL**, exported as `TgbNav.socials()` and `TgbNav.followPopup(el)`. The footer hands its button to the second one; **it does not know our account urls and must not learn them**, because it carried its own copy once and they drifted (bare `instagram.com` against `www.`), which is what deleted the old Follow column.
- **THE FOOTER'S COPY IS IN THE SIGN-OFF BAR, NOT IN THE SITE COLUMN** (2026-08-20), and it took four attempts to land there. The footer has held a column of five icon links, then a link to `/follow/`, then a labelled button in The Site column, and now this. **The Site is four DESTINATIONS and Follow is a menu-opener**, which is why it read wrong in that column every time; the sign-off row already holds the copyright and the Mission Control door, which is to say the things that are not sections. An unlabelled glyph is at home in a line of fine print in a way it never was in a list.
- **IT IS THE REEL, WITH NO WORD**, the same one-icon-wide scroller the nav wears. The reel names the five networks by showing them, which is more than the word FOLLOW says.
- **THE REEL IS OPT-IN VIA `data-follow-reel="1"`**, which is what keeps there being ONE reel. It was gated on the nav's own class; the footer asks for it by attribute rather than building a second copy, so the faces, the timing and the repeated last frame cannot drift between the two.
- **THE WRAP IS THE FLEX CHILD, NOT THE BUTTON.** `followPopup` re-parents its trigger into a `.tgb-followpop-wrap` so the panel has something to position against, so **any layout property aimed at the button lands on an element the flex row is no longer looking at** — the footer's `margin-left: auto` is on both. This is the same mistake the nav made when `order: 5` went on the button and FOLLOW jumped to the front of the bar. The auto margin is also why it is not left to `justify-content: space-between`: with three children that would strand the reel in the middle of a wide footer.
- **THE BUTTON SHIPS `hidden` AND IS REVEALED ONLY ON SUCCESS.** It has no `href` to fall back to and its entire content is injected, so without `site-nav.js` it would be an empty button that does nothing. **Three public pages load the footer and no nav** — [mc/account/](mc/account/index.html), [mc/how/](mc/how/index.html) and [shell/privacy.html](shell/privacy.html) — so the control is simply absent there, which is the right failure. An absent control beats a dead one.
- **THE TRIGGER IS A `<button>`.** It was an anchor to `/follow/` with the click intercepted, which was right while the page existed; with it gone, an anchor would point at a 404 for anyone without JavaScript. A control that only opens a menu should be a button and should say so to a screen reader.
- **THE NAV BUTTON HAS NO LABEL AND NO FIXED GLYPH.** Its face is a **one-icon-wide window with the five account icons scrolling through it**, each holding about two seconds. A Lucide "users" glyph was a picture of the IDEA of following; the accounts themselves tell you which networks we are on without asking anyone to read.
  - **THE HOVER AND THE ACCESSIBLE NAME DISAGREE ON PURPOSE, and this is the only control in the repo where that is true.** `title` is **"Where to find us"** and `aria-label` is **"Follow The Game Bureau"**. The tooltip is read by somebody who can already see the reel cycling, so it does not have to name the action and is better spent saying what is behind the button; the accessible name is announced to somebody who cannot see the reel at all, and for them the plainest verb is the useful one. **Don't tidy them into agreement** — they are aimed at two readers with two different amounts of context. Both copies of the button carry the same pair.
  - **The reel is built from `SOCIALS`**, the same array the menu is, so the faces and the links cannot disagree.
  - **SIX TILES FOR FIVE ACCOUNTS.** The last frame is the first icon again, so the reel travels one whole tile past the end and the loop restarts at 0 invisibly. Without the repeat it snaps backwards through four icons every eleven seconds.
  - **It freezes on the first icon under `prefers-reduced-motion`.** A looping animation is precisely what that setting is for, and one frozen account icon is still a truthful face for the button.
  - The `::before` glyph the other four nav buttons carry is suppressed on this one, or there would be a second picture beside the reel.
- **THE PANEL FLIPS UPWARD when there is more room above than below**, decided at open time from `getBoundingClientRect` rather than from which trigger it is. That is what the footer's copy needs — it sits at the bottom of the page — and deciding it by measurement rather than by caller is what makes `followPopup` safe to attach to a trigger anywhere.
- **`order: 5` IS ON THE WRAPPER AS WELL AS THE ANCHOR**, and that is not belt and braces. `wireFollowPopup` re-parents the trigger into a positioned `<span>` so the panel has something to hang off, which makes the WRAPPER the flex child and leaves the button's own `order` inert. The wrapper had none, so it sorted at 0 and **FOLLOW jumped to the front of the nav**. One declaration covers both states.

## THE ADMIN NAV IS TGB, MISSION CONTROL AND THE PADLOCK (2026-08-20)

[mc/js/admin-site-nav.js](mc/js/admin-site-nav.js) carried five section buttons — GAMES / GIFTS / SOUNDTRACKS / HIGHLIGHTS / FOLLOW — each an admin destination wearing a public section's name, each with a quiet ADMIN under it and a plain link to its public page below. **All five are deleted.** The bar is the brand, **MISSION CONTROL**, and the sign-in padlock.

- **TGB SITS LEFT OF IT** (2026-08-20), an `<a>` to `/` wearing the **waypoint pin** — the glyph the deleted GAMES button carried, which is the closest thing this project has to a logo and is doing the same job here it did there: standing for the product rather than for a tool. The pairing is the point: **one button is the way further in, the other the way back out to what a visitor sees.** It takes **no `match` and no `aria-current`**, because every page that loads this bar is under `/mc/`, so it can never be the page you are standing on. **It stays in THIS tab**, unlike MISSION CONTROL beside it. It opened a new one for about ten minutes, on the reasoning that a glance at the live site should not take your admin page away; that is the wrong model of the press. Leaving the admin area is a departure rather than a peek, and a door that quietly spawns a tab on every press is how you end up with nine of them. The back button is the way back.
- **WHY: five doors on every room's header is a site map, not a navigation bar.** Mission Control already IS the index, it is one press away, and it lists every room with a description rather than a one-word face you had to learn.
- **THE BURGER WENT WITH THEM**, along with `setOpen`, `data-nav-open`, the Escape and outside-tap handlers and the matchMedia reset. It existed only to collapse those five on a phone, so with nothing left to collapse it was a control that opened an empty drawer.
- **`roomIsCurrent` IS NOW A CONSTANT `false`.** It was `ROOMS.some(...)`, and it existed because MISSION CONTROL matches the whole of `/^\/mc\//` while a room button was the more specific answer, so the mast button stood down whenever a room claimed the page. With no rooms there is nothing to defer to.
- **THE FOLLOW REEL LASTED ABOUT AN HOUR HERE** and was not wasted: it moved to **[mc/js/follow-reel.js](mc/js/follow-reel.js)**, which is where every admin surface reads it from now. See below.
- **TGB AND MISSION CONTROL ARE ONE SIZE, EQUALISED BY GRID RATHER THAN BY A MEASURED WIDTH.** `.asn-links` is `grid-auto-flow: column` with **`grid-auto-columns: 1fr`**, which in an auto-width container sizes every track to the widest one. So the pair matches whatever the longest label happens to be, and keeps matching if either is renamed or a third button is added; a hand-measured `min-width` would be a number nobody could maintain and would be wrong the first time the font changed. Grid's default `align-items: stretch` is what makes the HEIGHTS agree, so the one-line face grows to the two-line one instead of floating at 44px beside a taller neighbour.
- **DELETING THE BURGER BROKE THE PHONE BAR FOR AN HOUR, SILENTLY.** The panel rules outlived it: under 900px `.asn-links` was `display: none` with **`[data-nav-open="true"]` as the only way back**, and that attribute is written by the burger. With the burger gone nothing on earth could set it, so the bar built its two buttons and then hid them, with no error and nothing to click. Two further rules hid the icon and the word on every `.asn-links .asn-link` (they existed so a section button could shrink to its ADMIN tag) and these buttons have no tag, so they would have rendered EMPTY. **The bar is now simply a row on a phone**, which two buttons fit. **DELETE A CONTROL AND ITS CSS IN THE SAME PASS.**
- **THE DEAD CSS IS SWEPT.** `.asn-item`, `.asn-public*`, `.asn-admin`, `.asn-link--reel`, `.asn-burger` and `.asn-follow-*` are gone, 66 lines. `.asn-labelcol` and `.asn-word` stay: MISSION CONTROL uses them for its two stacked lines.
  - **THE SWEEP ORPHANED THE ONE RULE THAT DRAWS EVERY GLYPH**, and this is the trap in any selector-based deletion. The mask rule was a GROUP, `.asn-link::before, .asn-public::before { ... }`; removing the dead half took the declaration block with it and left `.asn-link::before,` dangling, which makes the **whole stylesheet fail to parse**, not just that rule. Caught because jsdom refused the sheet. **When deleting a selector, check whether it shares a rule with a live one.**

## THE FOLLOW REEL IS A SHARED ADMIN MODULE (2026-08-20)

[mc/js/follow-reel.js](mc/js/follow-reel.js) builds the one-icon-wide scroller of our five account icons. `window.TgbFollowReel.build()` returns one; **the usual way to get one is `data-tgb-reel` on an empty element**, which the module fills at load, the same contract `room-blurbs.js` uses.

- **IT IS DECORATION, NOT A CONTROL.** No click handler, no href, `aria-hidden`, and **`pointer-events: none`** — which is load-bearing on the hub, where it sits inside the SOCIALIZER card's heading and that card is one big `<a>`. A decoration that ate that click would be a bug.
- **ON THE HUB IT IS A BUTTON IN THE SOCIALIZER CARD'S UPPER RIGHT** ([mc/index.html](mc/index.html)) and it **opens the menu of the five accounts**. It spent an hour in front of the heading as pure decoration first; as a control it says which networks the room feeds *and* gets you to them.
- **THE BUTTON IS A SIBLING OF THE CARD, NOT A CHILD.** The card is one big `<a>` and **a `<button>` inside an `<a>` is invalid HTML** that browsers disagree about, so a `.mc-chore-slot` wrapper holds both and the button is placed over the corner. The wrapper is the grid item; the card stretches to fill it, so wrapping one card changes nothing about how the three sit together.
- **THE REEL STAYS DECORATIVE IN BOTH USES, AND THAT IS WHAT KEEPS `pointer-events: none` UNCONDITIONAL.** Where it must be pressable, a real button goes AROUND it and takes the click. The reel is the face; the button is the control.
- **`popup()` RE-PARENTS ITS TRIGGER INTO `.tgb-reelpop-wrap`, SO THE OFFSETS MOVE TO THE WRAP.** Styling the button alone would leave it in the card's flow with the wrap pinned to the corner — the same mistake the public nav made when `order: 5` went on the button instead of its wrapper.
- **`stopPropagation` ON THE TRIGGER IS LOAD-BEARING.** The outside-click handler is registered in the **capture** phase, so without it the menu would see its own opening click on the way down and shut instantly.
- **THE BUTTON SHIPS `hidden` AND IS REVEALED ONLY AFTER WIRING**, and `[hidden]` has to out-specify its `display: inline-flex` or it shows empty before the module fills it. Third time this project has hit that rule — see the admin dialogs and the public soundtracks deck.
- **`--reel-size` IS A VARIABLE AND THE KEYFRAMES ARE `calc()` MULTIPLES OF IT.** The track must travel exactly one tile per step or the icons land half cut, so a host resizes it with one custom property and nothing else.
- **THE PUBLIC NAV KEEPS ITS OWN COPY** inside [shell/site-nav.js](shell/site-nav.js) and **cannot share this one**: that file returns early when there is no public header to build and never reaches its exports, so an admin page loading it gets nothing back. Two copies, and the split is admin / public.
- **ONE ARRAY OF OBJECTS, NOT TWO LISTS MATCHED BY INDEX.** `ACCOUNTS` and `ICONS` were separate and paired by position, which worked **exactly until the first reorder**: moving Facebook up on 2026-08-20 would have left every icon attached to the wrong account, silently, with nothing to catch it but somebody looking at the menu. Keyed together they cannot drift. **The public nav's `SOCIALS` was always one array and was never at risk** — that is the shape to copy.
- **THE MENU ORDER IS INSTAGRAM, FACEBOOK, THREADS, X, YOUTUBE**, with Facebook under Instagram because those two are one Page and one credential everywhere else in this project. **The order lives in both files and must be changed in both.**
- **IT CARRIES THE URLS NOW, WHICH REVERSES HOW IT SHIPPED THIS MORNING.** The first version held icons only, on the argument that a drifted url sends somebody to the wrong account (what killed the footer's old Follow column) while a drifted icon merely costs a picture. **That held while the reel was decoration with nowhere to go, and stopped the moment it became a button that opens the menu: a menu with no links in it is not a menu.** So the five accounts are written twice, here and in `site-nav.js`, kept in step by hand, and there is no clever way around it. **Change an account in both files.**

## THE ADMIN NAV'S FOLLOW BUTTON WAS THE REEL, FOR ONE HOUR (2026-08-20, superseded)

The fifth button in the shared admin bar ([mc/js/admin-site-nav.js](mc/js/admin-site-nav.js)) wears the **same scrolling reel of account icons** the public nav's FOLLOW button wears, and it goes to the **Socializer**.

- **NO WORD AND NO `ADMIN` UNDER IT.** Every other button in that bar carries the ADMIN sub-label because its face says a public section word (GIFTS) while the button goes to a room (`/mc/gifts/`) — the label exists to correct the face. **This face says nothing at all**, so there is no claim to correct, and a qualifier under a wordless button is a caption on a picture of nothing. `title` and `aria-label` both read **"The Socializer"**, naming the destination outright rather than "Admin socials".
- **IT NAVIGATES; THE PUBLIC COPY OPENS A MENU.** Out there Follow *is* those five links, so the button is a menu-opener. In here it is a door to the room where what goes on those accounts is decided, so it behaves like every other button in the bar.
- **IT IS THE ONLY ONE OF THE FIVE THAT STAYS IN THE SAME TAB.** The other four are a sideways glance at another room while you are working in this one, so a new tab keeps your place. The Socializer is somewhere you GO — and a wordless button that silently spawns a tab on every press is how you end up with nine of them.
- **THE ICONS ARE MIRRORED FROM `shell/site-nav.js` AND THE URLS ARE NOT.** That asymmetry is the whole safety argument. This file is self-contained by design and **cannot** borrow the public nav's copy: `site-nav.js` returns early when there is no public header to build and never reaches its own exports, so `TgbNav.socials()` does not exist on an admin page. So five icons are duplicated — but **only the icons**, because this button goes to the Socializer and has no use for the account urls. A drifted URL sends somebody to the wrong place, which is exactly what killed the footer's old Follow column; a drifted icon costs a picture. Add a sixth account in both files; until you do, the admin reel simply shows five.
- **THE NARROW BREAKPOINT WOULD HAVE DRAWN AN EMPTY BOX.** Under the phone rules every admin link shrinks to its ADMIN tag alone, with `::before { content: none }` and `.asn-word { display: none }`. This button has neither a glyph nor a word, so it would have kept its 48px height and drawn nothing. It is named explicitly there and keeps its reel.
- **17px, not the public nav's 18.** It matches the Lucide glyph the four buttons beside it carry, so all five faces are drawn to one size. The `@keyframes` are a separate name (`asnFollowReel`) with 17px steps for the same reason.

## THE NAV COUNTS HOLD THEIR SPACE (2026-08-20)

The four section buttons badge a live count, fetched by `site-footer.js` and pushed into the nav through `TgbNav.setButtonStats`. The badge used to be `hidden`, which is `display: none`: it took no room, so **every button grew and the whole row reflowed the moment the numbers landed**, two network round trips after first paint.

- **It is now always in the layout and merely invisible until it has a number**, with **`min-width: 3ch`** reserved. Three characters covers every figure this site plausibly shows (470 waypoints, 616 gifts, 89 tapes); a fourth digit widens a button by one character rather than making the badge appear from nothing, which is a shift nobody notices.
- **`data-pending`, not `hidden`.** `hidden` means "not rendered" and this IS rendered, just not readable yet, so `visibility` is the honest property. It is `aria-hidden` while pending so a screen reader does not announce a blank.
- **`visibility`, never `display`.** `display: none` gives the space back and puts the pop straight back.

## The "research assistant" pattern is gone (2026-08-07)

`mc/research.html`, `mc/get_games.html`, `mc/mlb.html`, `mc/places.html`, `mc/get_teams.html`, `mc/js/research.js`, `mc/research.css`, `mc/js/research-nav.js` and `mc/README.md` were **all deleted on 2026-08-07**. Don't rebuild any of it.

**What the pattern was, and why every instance of it failed the same way.** A research page paired a baked-in AI prompt with a **cousin `.jsonl` file** of the same basename in `mc/data/`: you copied the prompt, ran it in a chat AI, and saved the reply beside the page. The file was the deliverable — and the file was the problem, because nothing consumed it.

| page | its file | how it actually ended |
|---|---|---|
| `get_games.html` | `get_games.jsonl` | **The file never existed on disk.** Every run's output went nowhere. |
| `mlb.html` | `mlb.jsonl` (22 MB) | Written by a Node script, uploaded by hand, and it POSTed `public.games` — finished products, not the events they anchor to. |
| `places.html` | `places.jsonl` | 456 real places sat there until someone hand-wrote a migration to lift 406 into `waypoints`. |
| `get_teams.html` | *(none)* | The only one that already wrote to Supabase — so it was never really a research page at all. |

**Every replacement writes to the database directly**, which is the whole lesson: [mc/events/index.html](mc/events/index.html) reads the ESPN feed in-browser and imports into `anchor_events`; [mc/pathbuilder.html](mc/pathbuilder.html) returns import SQL from its prompts; [mc/data/teams.html](mc/data/teams.html) upserts `public.teams`. **A prompt whose output is a file is a prompt whose output is lost.**

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

- A **Game** contains one or more **Paths**. (**Renamed from Route on 2026-08-17**, tables and all: `public.routes` → `public.paths`, `public.route_stops` → `public.path_stops`, `mc/routes.html` → `mc/paths.html` (and on to [mc/pathbuilder.html](mc/pathbuilder.html) on 2026-08-19), Route Builder → **Path Builder**. Migration [2026081702_routes_become_paths.sql](mc/supabase/migrations/2026081702_routes_become_paths.sql), which leaves read-only compatibility views behind at the old names — drop them once nothing reads them. **`route_color` was deliberately NOT renamed**: it is the engine's Latin-square rotation slot, has never meant a walking route, and both engines read it at play time. Neither was `tour_id`, for the reasons already recorded below.)
- A **Path** contains an ordered list of **Stops**.
- A **Stop** combines one **Place** with one **Challenge**.
- A **Place** is a reusable real-world point with geographic metadata such as city, address, coordinates, or Plus Code.
- A **Challenge** is the playable content at a Stop: prompts, clues, media, mini-games, and player replies.
- A **Direction** is what a player is given AFTER solving a challenge: feedback on what they just did, plus what leads them to the next waypoint. Named 2026-08-20. **It has no table yet** and lives inside the conversation flow in `public.games`; see THE BIG PICTURE at the top of this file before giving it one.

Use `location` only for technical geographic fields and browser APIs. `waypoint`, `waypointGroup`, `waypoint_group`, and path `waypoints` are legacy compatibility vocabulary only; do not create new writes or UI with those names.

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

**History:** Until 2026-05-17 engines lived under `/mc/game/play/` and `/mc/game/play/index.html` was a thin pathr. That folder was merged into `/mc/game/run/` and the pathr was deleted. Old `/mc/game/play/...` URLs no longer resolve.

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

## `public.leagues` — which sport each league plays (2026-08-24)

Two columns, `sport` and `league`, seeded with ten US leagues.
[2026082403](mc/supabase/migrations/2026082403_leagues_catalog.sql), **apply by hand**.

| sport | leagues |
|---|---|
| Football | NFL, NCAAF |
| Basketball | NBA, NCAAB, WNBA |
| Baseball | MLB |
| Hockey | NHL |
| Soccer | MLS |
| Auto racing | NASCAR |
| Mixed martial arts | UFC |

- **WHY, WHEN `teams` ALREADY CARRIES BOTH.** `teams` answers *what sport does
  this CLUB play*, 639 times over with the pair repeated on every row, so "what
  leagues do we cover" is a distinct scan and **a league with no teams filed
  cannot be named at all**. Four of these ten are in that position: MLS, WNBA,
  NASCAR and UFC.
- **`sport` IS ALREADY SPELLED TWO WAYS AND THIS DOES NOT FIX THAT.**
  `teams.sport` holds lower case `football` (515 rows); `anchor_events.sport`
  holds `Football` (331). Neither is wrong and nothing reconciles them. **The
  seed uses the title case**, because that is what `anchor_events` holds and what
  a picker on that page would write; `teams` is left alone, being 639 rows read
  by the builder and the fandom palette. Recorded rather than quietly changed.
- **THE LEAGUE IS THE KEY**, not a surrogate. There is one NFL, and `NFL` is the
  value `anchor_events.league` and `teams.league` already store, so a reference
  from either is a plain text match with nothing to carry.
- **NO FOREIGN KEY FROM `anchor_events.league`, DELIBERATELY.** That column is
  free text, and a FK would refuse the first concert or festival carrying a
  league nobody has listed. **This is a catalogue, not a gate.** Both `distinct`
  checks pass today — every league in `anchor_events` and in `teams` is in the
  seed, verified before shipping — so the FK is available whenever the refusals
  are actually wanted.
- **Anon-readable, admin-written**, like `cities` and `teams`: reference data
  with nothing private in it, and a cloud routine holds only the publishable key.
- **The first seven are the leagues the ESPN importer can already read a schedule
  for**, spelled as its own `LEAGUES` map spells them, so the two agree. The last
  three have no feed here and are listed because the table's job is to say what
  we cover, not what we can scrape.

### The Leagues room — [mc/teams/leagues.htm](mc/teams/leagues.htm) (2026-08-24)

The editor over `public.leagues`: list, add, edit, delete. **The fifth page to
wear the Socializer's chrome**, ported from [mc/events/index.html](mc/events/index.html) — when any of
the five changes, change them all; the Socializer is the reference.

- **IT IS `.htm`, THE ONLY ONE IN THE LIVE REPO**, and it does not follow the
  folder convention either (every room is named by its folder: `/mc/gifts/`,
  `/mc/socializer/`). Both were asked for explicitly. **Worth knowing before
  somebody "fixes" it**: GitHub Pages serves no 301, so a rename to
  `/mc/teams/leagues/` would be a hard break like every other move here.
- **THE NAV ENTRY WENT IN THE SAME COMMIT.** A room with no door is unreachable,
  which is the standing rule read the other way round.
- **ADD IS THE WHOLE BAR — no search, no filter.** Ten rows. A control that
  narrows a list of ten to one of them is a control nobody needs, the same
  reasoning that kept a YouTube filter out of the Socializer's queue.
- **GROUPED BY SPORT, AND THE GROUPING IS THE POINT.** `sport` is free text, so a
  second spelling of one sport appears as a second heading with one row under it.
  **That is the only place on the site where such a drift is visible at a
  glance**, and this database already has one — see the note above. The add
  dialog's sport box is a `datalist` of the sports already used, for the same
  reason.
- **THE LEAGUE IS THE PRIMARY KEY AND IS STILL EDITABLE, WITH A GUARD.** Postgres
  permits renaming a PK and **there is no foreign key to refuse it**, so nothing
  in the database would warn that every `anchor_events` and `teams` row naming
  the old string is now pointing at a league that is not in the list. So the page
  **counts those rows first and puts the number in the question**: *"331
  anchor_events rows and 515 teams rows name NCAAF. There is no foreign key, so
  those rows will NOT follow the rename."* Delete asks the same way.
  - **A table it cannot read is reported as unchecked, never as zero.** A
    confident zero about a table nobody could reach is the worse answer.
- **A NEW LEAGUE IS UPPER CASED ON THE WAY IN.** Every other table spells a
  league that way and the whole value of this catalogue is that the strings
  match; correcting it is obviously right, so it is done rather than refused.
- **NOTHING AUTOSAVES.** An edit is a draft keyed by the row's ORIGINAL league,
  so a re-render cannot silently discard typing, and the foot counts the unsaved
  ones. **That count is the only warning there is** — and it is repainted by
  `paintDirtyCount()` on every keystroke rather than by `render()`, which cannot
  run per keystroke without stealing focus from the box being typed in. It was
  wired to `render()` alone at first and simply never appeared.
- **`return=representation` ON THE SAVE, THE DELETE AND THE INSERT.** PostgREST
  answers **200 with an empty array** when RLS refuses a write, so without
  reading the row back a refused save reports success and the page shows a value
  the table never took. Tested by refusing every write.
- **A MISSING TABLE NAMES THE MIGRATION** rather than reporting `42P01`, which is
  a statement about our schema and not something the person at the keyboard can
  act on.

**PROVED BY RENDERING IT**, in jsdom with the auth and REST modules stubbed: 46
cases over the ten real rows — the grouping and counts, an edit saving and
regrouping, a rename warning with both reference counts and one warning it has
nothing to strand, the upper-casing, a duplicate caught before the round trip,
a delete naming what points at it, a cancelled delete sending no request, a
refused write reported as refused, and the missing-table message.

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
- **ONLY ONE ADD DIALOG MAY BE OPEN, AND TWO USED TO THROW** (2026-08-24). Both carried `id="tgb-city-states"` on their state datalist; once the second wrap was in the document, **`wrap.querySelector('#tgb-city-states')` resolved to the FIRST dialog's datalist, failed the descendant test and came back null** — and the very next line called `appendChild` on it. The dialog appeared, half built, with an exception in the console.
  - **IT WAS LATENT UNTIL `?add=` MADE IT REACHABLE.** Nothing could open a second dialog while the first was modal, so it never fired; the moment the Cities page learned to open one itself on arrival, **landing there and then pressing ADD gave you two**.
  - **THREE THINGS FIXED IT, and the first alone would have been enough — the other two are what make it stay fixed.** `openAddDialog` refuses a second, focuses the open one and resolves `null` (every caller already ignores a null row). Each dialog's datalist gets **an id of its own**, so duplicate ids cannot exist. And the datalist is found **by tag within the wrap** rather than by that id, since finding it through the id is the part that went wrong.
  - **Reproduced before it was fixed, and the reproduction is a test now** — including that the surviving dialog keeps what was typed in it.
- **THE ADD DIALOG HAS NO ABBR BOX** (2026-08-24). It asked you to type the two-letter state code beside the state you had just chosen — **the one field on that form with exactly one right answer**. `findState()` knows every US state and CA province, which is what `state_code` is for and what drives the map icons, so the code is derived and the box is gone.
  - **THE DERIVED CODE IS SHOWN IN THE PREVIEW** (`Saves as: Youngstown, Ohio · code OH`), because with the box gone that line is the only place you can see whether one was worked out — **a silent derivation and a silent failure to derive look identical**.
  - **WHAT IS GIVEN UP: a foreign region's own code.** `resolveGeoParts` still takes an explicit code and its comment names the case (Île-de-France → IDF); nothing on this dialog supplies one any more. Two things soften it: `findState` treats a value of three characters or fewer as a code, so **typing `IDF` into the State box still works**, and the Cities page's row editor keeps its `St. abbr` field for fixing one afterwards.
  - **`?add=<city>` OPENS IT PREFILLED**, which is how the Anchor Events room USED to hand over an unknown city. **That link went with the errors dialog** and the Cities half is untouched, so `?add=` still works and rebuilding the affordance is one anchor. See that section.
- **Every city control goes through [mc/assets/city-picker.js](mc/assets/city-picker.js)** (`window.TgbCities`) — Start City in `mc/profiles.html`, and the venue City in [mc/events/index.html](mc/events/index.html). (`mc/anchor-events.html` used it before it was deleted on 2026-08-01; `mc/mapper.html` and `mc/content.html` before they were archived on 2026-07-30.) It fills the control from the catalog and hangs a **+** beside it that adds a city without leaving the page. `attach(el, { includeIgnored: true })` for admin surfaces; omit the flag where only real destinations belong.
  - **`attach()` is for a control that outlives a render.** It pushes a controller onto a module-level array and never releases it, so a page that rebuilds a list of rows on every keystroke must not call it per row — `mc/events/index.html` binds one shared `<datalist>` from `TgbCities.all()` instead and puts the **+ city** button in its command bar. Use `attach()` on a form; use the catalog directly on a list.
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

- The **game editor is [mc/overview.html](mc/overview.html)** (editgames.html and builder.html both point here). Its Start City is now **City textbox + State/Province dropdown + Country dropdown** (`#nodeCityInput` / `#nodeStateInput` / `#nodeCountryInput`); on change it composes `meta.city` and fills `meta.cityName/stateCode/stateName/countryCode/countryName`, serialized via `GAME_COLUMN_TO_NODE_FIELD`. `builder.html` has no Start City inspector markup (its `nodeCityInput` JS is dead/guarded) — only its data-path was updated. `mc/challenges.html` was a stale, unreferenced twin and was archived to `mc/_dev/archive/mc/` on 2026-07-30, along with `mapper.html` (the path builder, the only writer of `public.maps`) and `content.html`.
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
