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
| **TGB SOCIALIZER BOT** | `trig_01KDYndJhZ9ymgUgX5Xx6LsL` | `14 8,20` | [mc/socializer.html](../../socializer.html), PROMPT dialog | `tgb_pull_socials_candidates` |
| **TGB SOUNDTRACK BOT** | `trig_014sqaUyU7557svq9mGA1E4a` | `5 8,20` | [mc/soundtracks/index.html](../../soundtracks/index.html), PROMPT dialog | `tgb_pull_soundtrack_songs`, `tgb_report_soundtrack_issues` |
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

**TGB WAYPOINT BOT's trigger is still enabled and must be switched off by hand.**
A Claude Code remote session cannot touch a routine created through the website,
so neither half of the trigger surgery could be done from the commit that made
these changes. Until somebody disables `trig_018FbHnaU5DqB4GesPfABV2d` it keeps
committing a file that nothing reads, into a path that no longer exists in the
working tree.

### TGB SOCIALIZER BOT's email deep-links each candidate

Step 8 of its stored prompt builds one link per candidate:

    https://thegamebureau.com/mc/socializer.html#edit=<the id it filed>

That hash is a **contract with [mc/socializer.html](../../socializer.html)**,
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
