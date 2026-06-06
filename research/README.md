# research/ — the two-panel research paradigm

A lightweight workflow for **quasi-coders**. Every page is split in two: build a
prompt up top, run it in any AI by hand, and drop the reply next door — the
bottom panel renders it.

```
┌─────────────────────────────────────────┐
│ SECTION 1 · PROMPT                        │
│   • a baked-in prompt template            │
│   • Keywords + open-text inputs           │
│   • [Generate]  [Copy]                    │
├─────────────────────────────────────────┤
│ SECTION 2 · RESULT                        │
│   • renders this page's cousin .jsonl     │
│     (oldestbar.html → oldestbar.jsonl)    │
└─────────────────────────────────────────┘
```

## The loop

1. Open a page (e.g. `oldestbar.html`).
2. Type **keywords** and any **notes** — the finished prompt assembles **live**
   below the fields as you type.
3. **Copy** it and paste into ChatGPT / Claude / etc.
4. The AI returns records. Save them beside the page as the **cousin file**
   (`oldestbar.html` → `oldestbar.jsonl`) — **one JSON object per line**.
5. Reload — Section 2 renders the records (Structured or Raw view).
6. Next time, just **append more lines** to the `.jsonl` — old data stays put.

## Section 1 — the prompt

The template lives in the `#basePrompt` textarea of each page, "specified at page
creation," and is **read-only** in the UI. Its label reflects the page name
automatically: `oldestbar.html` shows **Base prompt (Oldest Bar)**, pulled from
the page's `<h1>`.

Two optional placeholders are substituted as you type:

- `{{keywords}}` → the Keywords field
- `{{notes}}` → the Notes / open-text field

Anything you *don't* reference is appended automatically as `KEYWORDS:` / `NOTES:`
blocks, so a template with no placeholders still works. The assembled prompt
updates **live** — there's no Generate button; just **Copy** when you're ready.

> Tip: end the prompt with *"Return ONLY JSON Lines — one object per line …"* so
> each result is its own appendable line. `oldestbar` returns one bar per city
> when given a list or a group of cities — one line each.

## Section 2 — the cousin file (.jsonl)

`research.js` derives the filename from the page's own URL: same path, `.html` →
the cousin result file. So `lighthouses.html` reads `lighthouses.jsonl` — no
wiring, just matching names.

**Format — JSON Lines, so you can truly append.** One JSON object per line, no
enclosing brackets:

```
{"name":"Bar A", ...}
{"name":"Bar B", ...}
```

Add a new record by adding a line (`>> ` append, or paste) — old data is never
rewritten. The loader prefers `.jsonl`, but **falls back to a plain `.json`**
array/object if that's what's there, so either format works. It also tolerates a
pasted `.json` array (brackets/commas) dropped into a `.jsonl` file.

The renderer shows **one record at a time** — `‹` / `›` arrows (or **←/→** keys)
page through them with a `1 / N` counter. It handles **any** shape — nested
objects, arrays, numbers, booleans — and auto-links `http(s)` URLs. Toggle
**Structured / Raw**, or **Copy** the current record. Until the file exists, the
panel shows a friendly "awaiting JSON" state.

### Add results — merge without overwriting

Section 2 has an **Add results** box. Run the prompt in your AI, paste the reply
(JSONL lines, a JSON array, or a single object), and hit **Append & save**:

- **Chrome / Edge** (File System Access API): you pick the `.jsonl` file once, and
  the page reads it, merges the new records in (exact-duplicate lines are
  skipped), and **writes it back to disk**. Subsequent appends reuse the file — one
  click, no re-pick (until reload).
- **Firefox / Safari** (no file-write): it merges in memory and hands you a
  **download** of the combined `.jsonl` to save over the file.

Either way old records are preserved, and the pager refreshes to land on the first
newly-added record.

There's also an **Overwrite** button right next to Append: it replaces the **entire**
file with what you've pasted (after a confirm) — handy for fixing a corrupted file or
reseeding from a clean run. The page writes to the **local** file you choose — to
publish, commit & push it like any other change.

**Format-aware writes.** The merge writer matches the cousin file's shape:
- a JSONL/array cousin → written as JSON Lines;
- a **wrapper object** (e.g. `teams.json`'s `{ _ai_update_prompt, teams:[…] }`) →
  re-emitted as a **pretty-printed object**, with every other top-level field
  (like `_ai_update_prompt`) preserved and the collection updated in place.

So `teams.html` can Overwrite `teams.json` directly without corrupting it. A page
can still **opt out** of the merge box entirely with `<body data-merge="off">` if
it should be view-only.

## index.html — auto-discovering home

`index.html` is a **hard-coded** list of cards — one `<a class="card">` per research
page, with its title, a one-line blurb, the cousin filename, and a "result ready"
badge. When you add a new page, add a matching card to `index.html`.

## Make a new research page

1. Copy `_template.html` → `yourtopic.html`.
2. Edit the `<title>`, the `<h1>` (this also names the prompt label), and the
   `#basePrompt` template.
3. Add `yourtopic.jsonl` now, or after you run the prompt (one object per line).
4. Add a card for it in `index.html` (the index is a hard-coded list).

That's it — `research.css` and `research.js` are shared, so new pages are tiny.

## Files

| File | Role |
| --- | --- |
| `index.html` | Auto-discovering home (GitHub Contents API). |
| `_template.html` | Starter page to copy. |
| `oldestbar.html` / `oldestbar.jsonl` | Worked example + its cousin records. |
| `games.html` / `games.jsonl` | Sports matchups across the 4 major leagues (TGBID-keyed; MLS-extensible). |
| `stops.html` / `stops.jsonl` | Walking-tour stops a city already has — landmarks, monuments, public art (several per city). Location is a **what3words** address (`w3w`). |
| `map.html` | **Routes** — a Mission Control tool (wears the shared `/mc/` chrome: admin-shell + sign-in nav; listed in the MC nav menu). Google Maps (satellite) + the what3words 3 m grid. Pins placed by each stop's `w3w` (else address). Click a square then **Add stop** (prefilled with that square's `///words`) — or right-click a spot. **Build route** links stops into an ordered path saved to `routes.jsonl`. Needs a Google Maps key + a what3words key. |
| `routes.jsonl` | Ordered paths through stops (one route per line: `route_id`, `name`, `city`, ordered `stops:[{name,w3w}]`). Written by map.html's Build route — separate from stops. Locations ≠ routes ≠ challenges ≠ games. |
| `add-w3w.mjs` | CLI: geocode each stop (**Google Places** when `GOOGLE_PLACES_API_KEY` is set, else Nominatim) and write its **what3words** address (`w3w`). `node research/add-w3w.mjs [file] [limit] [--all]` (default fills only stops missing a w3w). Keys: `GOOGLE_PLACES_API_KEY` (optional), `W3W_API_KEY`. |
| `teams.html` / `teams.json` | The team database (4 major leagues, MLS-extensible). Wraps teams.json's built-in update prompt; pages one team at a time, and **Overwrite** writes teams.json back as a pretty object (`_ai_update_prompt` preserved). The `/assets/teams/` editor is the alternative. |
| `research.css` | Shared dark "dev-tool" styling. |
| `research.js` | Shared engine: prompt assembly + cousin loader/renderer + format-aware merge (.jsonl/.json). |

## Note on serving

Section 2 and the index use `fetch()`, which needs the page served over
**http(s)** — the live site, or a local server like `python -m http.server`.
Opening a file directly with `file://` blocks the JSON/API loads; the on-screen
empty states explain this.
