# Prompts and routines: which is which, and where each one lives

Every AI prompt in this product exists in one of two places, and the two are
easy to confuse because several of them are near-copies of each other.

| | |
|---|---|
| **A page prompt** | Lives in this repo, in a `<textarea class="prompt">` or a `build*Prompt()` function. Copied by a human into whatever chat AI is open. That AI has **no key and no session**, so its deliverable is always SQL to paste into the Supabase editor. |
| **A routine prompt** | Lives at [claude.ai/code/routines](https://claude.ai/code/routines), stored on the trigger. Runs unattended twice a day or so, holds the publishable key, and **writes through an RPC itself**. |

**They are not the same text and must not be merged.** The write path differs,
which is the whole reason both exist. Editorial rules (the beat, the mix, the
verbs, the counts, the confidence bands) have to be kept in step **by hand**;
only the last step differs. When you change one, open the other.

To edit a routine from here, ask Claude Code (`/schedule`) or use the
`RemoteTrigger` tool directly. You do not have to go to the website.

---

## The map

**All five run at 3 AM and 3 PM Central, staggered three minutes apart.** (Five
since 2026-08-20, when TGB WAYPOINT BOT was folded into TGB PATH BOT; its `8 8,20`
slot in the stagger is now empty and can be reused.) The
cron field is UTC and `8,20` is the CDT mapping, so in winter they land at 2
o'clock instead. **That drift is accepted and nobody adjusts for it**; there is
no DST calendar item any more, and the two-cron-plus-hour-guard trick is not
worth the complexity for a job whose exact minute nobody depends on.

The stagger exists so five cloud sessions do not provision at the same instant.
The order is deliberate: the gift shop files books first, and TGB SOCIALIZER BOT goes last so the
gift catalogue it reads is the freshest it can be. TGB PATH BOT was added on 2026-08-18 at `:17`,
after the rest, and is the only one with NO page prompt in this repo: nothing on a page pastes
walking tours, so there is no pair to keep in step.

| Routine (claude.ai) | Trigger | Cron (UTC) | Its page prompt in this repo | Writes |
|---|---|---|---|---|
| **TGB SOCIALIZER BOT** | `trig_01KDYndJhZ9ymgUgX5Xx6LsL` | `14 8,20` | [mc/socializer/index.html](../../socializer/index.html), PROMPT dialog | `tgb_pull_socials_candidates` |
| **TGB SOUNDTRACK BOT** | `trig_014sqaUyU7557svq9mGA1E4a` | **none, by hand** | **[mc/soundtracks/soundtracks.md](../../soundtracks/soundtracks.md) IS the prompt.** The stored trigger only points at it, and the Tape Room's PROMPT dialog was deleted on 2026-08-25. There is no pair to keep in step. | `tgb_pull_soundtrack_songs`, `tgb_report_soundtrack_issues` |
| **TGB GIFT SHOP BOT** | `trig_01H7cKJ4fk5bA1NWSqPZi4ah` | `2 8,20` | [mc/gifts/index.html](../../gifts/index.html), PROMPT dialog | `tgb_pull_book_candidates` |
| **TGB ANCHOR EVENTS** | `trig_01P6fMZjt4ZapaKVoiCUfGxw` | `11 8,20` | [mc/assets/waypoint-prompts.js](../../assets/waypoint-prompts.js) `buildTourPlacesWaypointPrompt` | commits `mc/supabase/tours/*.sql` |
| **TGB PATH BOT** | `trig_01HqDJy6BzpU7n23VXv8D1gW` | `17 8,20` | none, but see [path-bot.prompt.md](path-bot.prompt.md) | `tgb_pull_walking_tours`, `tgb_fill_waypoint_gaps` |

**All five carry the no-em-dash rule and none contains an em dash** (four swept
2026-08-15, TGB PATH BOT written clean on 2026-08-18 and kept clean through the
2026-08-20 merge). Verify with `RemoteTrigger {action: "list"}` and count U+2014 in
each `job_config.ccr.events[0].data.message.content`.

Six further routines (GTD briefs, inbox blitzes, the nightly Supabase backup)
are personal-productivity jobs with no page prompt in this repo. **They were
deliberately left out of the sweep**: they write to nobody but Kevin, so a
machine tell in them costs nothing. Seventeen em dashes between them as of
2026-08-15, if that ever changes.

### TGB PATH BOT ABSORBED TGB WAYPOINT BOT (2026-08-20)

**Two routines were covering one job from opposite ends and only one of them
reached the database.** TGB WAYPOINT BOT swept Wikipedia for loose PLACES in one
NFL city and committed them to `mc/stops/nightly.json`; TGB PATH BOT transcribed
a published walking tour and filed it through an RPC. The file half had been
decaying for a while: the Path Builder popup that reviewed it was deleted on
2026-08-18, leaving the Daily Review page as its only reader, so a scout ran
twice a day into a file almost nobody opened.

**The sweep survives as step 3b of TGB PATH BOT's prompt** and is now the
fallback for a city with no published tour, which is what used to make a run file
three walks instead of four. A swept city produces a real path with real
waypoints, in order, rather than a list somebody still has to sort.

**Scope narrowed to the 32 US NFL cities at the same time.** The old phase 2
(NBA, MLB and NHL cities that are not NFL cities) is retired; phase 2 is now a
SECOND walk in an NFL city. **`tgb_pull_walking_tours` was NOT narrowed to
match** and still accepts any NFL, NBA, MLB or NHL `city_name`. That is
deliberate: narrowing it needs a hand-applied migration, the guard is doing its
real job either way (it is what stops an anon caller writing an arbitrary path),
and the prompt says in as many words that the latitude is not permission.

**TGB WAYPOINT BOT's trigger was disabled on 2026-08-21**, a day after this fold,
during which it kept committing a file that nothing read into a path that no
longer existed in the working tree.

**"Must be switched off by hand" was wrong**, and it is worth correcting rather
than deleting: a Claude Code CLOUD session cannot touch a routine created through
the website, which is what that sentence was about, but a LOCAL session can.
`RemoteTrigger {action: "update", body: {"enabled": false}}` does it in a second,
and `enabled` is a top-level field, so it can be changed without resending the
prompt. Disabled rather than deleted, because a trigger id does not survive a
delete: `trig_018FbHnaU5DqB4GesPfABV2d` is one flag from running again.

### TGB SOCIALIZER BOT files SIX rows, not five (2026-08-20)

Five for the queue (one gift, four stories) plus **one YouTube video** as a sixth,
in its own RPC call. The video is marked by `platforms: [{"name": "YouTube"}]`
and nothing else, which is what greys the Post button and puts it behind the
Socializer's YouTube filter. **That array is the marker; adding a second platform
to it turns the row back into an ordinary post.** Its id ends `-y1`.

**THE PAGE PROMPT HAS IT TOO**, as of later the same day. It was routine-only
for an hour, on the argument that a chat AI cannot check its own work against the
queue. That held for the COUNT and not for the MARKER: a human pasting SQL whose
video row names Facebook in `platforms` files a candidate that posts to the wrong
accounts, and nothing downstream catches it. The rule belongs in front of them,
so the dialog is titled **Six Post Candidates** and step 7's worked example
carries the sixth row.

### TGB SOCIALIZER BOT's email deep-links each candidate

Step 8 of its stored prompt builds one link per candidate:

    https://thegamebureau.com/mc/socializer/#edit=<the id it filed>

That hash is a **contract with [mc/socializer/index.html](../../socializer/index.html)**,
which resolves it after the queue loads and opens that candidate's Edit dialog.
If the hash format ever changes, the prompt and the page have to move together,
and the page is the half that also has to keep answering the old shape or every
link in every email already sent goes dead.

### TGB ANCHOR EVENTS is the special case

**Its stored prompt is not a copy of anything. It is a pointer.** Step 1 is
*open `mc/assets/waypoint-prompts.js`, find `buildTourPlacesWaypointPrompt`,
that function is the specification*. Edit the file and the routine follows on
its next run, with nothing to sync.

That is the only routine wired this way, and it has one failure mode: **rename
or move that function and the routine breaks silently**, because an agent that
cannot find its spec will write a route from memory rather than stop. The stored
prompt now tells it to stop and report instead. **If the prompts file moves
again, update the trigger in the same commit.**

---

## A THIRD KIND: A CONTENT SPEC, WHICH IS NEITHER

[trivia.prompt.md](trivia.prompt.md) is not a page prompt and not a routine prompt. **Nothing
runs it today.** It is the rulebook for writing trivia rows of `public.challenges`, aimed at
a person or at whatever AI is asked to produce some, and it is the file a trivia
routine will open and follow when one exists, the way TGB PATH BOT opens
`path-bot.prompt.md`.

**IT IS THE SECOND HALF OF A PAIR AND THE FIRST HALF IS IN THE DATABASE.** Nine
CHECK constraints refuse a bad row outright, and the file names them so a
writer meeting one knows what it means rather than reading a raw `23514`. **When
a constraint changes, change that file in the same commit**, or it will go on
describing a rule the database no longer keeps.

**THE RULES A CONSTRAINT CANNOT CARRY are the reason the file is long**: verify
or omit, prefer a fact that does not move, write plausible distractors, no
tragedy as a punchline. Those are editorial and nothing will ever enforce them.

---

## The no-em-dash rule

**No em dash may appear in a prompt, or in anything a prompt hands back.** Not
the character, not the `&mdash;` entity. Applies to captions, headlines,
descriptions, blurbs, internal notes, closing summaries and any HTML email a
routine produces.

Two reasons, and the second is the one people forget:

1. An em dash is the single clearest tell that a machine wrote the line, and
   most of this output goes out under our name (social posts, cassette blurbs
   read off a public page, tour-stop descriptions read aloud at the stop).
2. **A prompt littered with em dashes teaches the model to write them back.**
   So the prompts carry none either, and each one says so about itself.

Canonical wording: [`no-em-dash.mjs`](no-em-dash.mjs). Import `RULE` from there
for anything in the repo; paste it verbatim into a routine, which lives at
claude.ai and cannot import.

**Code comments are exempt.** They are for humans and no model reads them as
instruction. Only prompt *text* is in scope, which is why a blanket `grep` is
the wrong tool and [`scan.mjs`](scan.mjs) exists:

```bash
node mc/_dev/prompt-tools/scan.mjs     # prompt text only; prints CLEAN or a count
```

The waypoint prompts share the rule as `NO_EM_DASH_RULE`, spread into all five
builders beside `AI_MODEL_RULE` and `WALK_ORDER_RULE` for the same reason those
are shared: five prompts, one wording, no drift.
