# research/ — the two-panel research paradigm

A lightweight workflow for **quasi-coders**: each page is split in two.

```
┌─────────────────────────────────────────┐
│ SECTION 1 · PROMPT BUILDER               │
│   • a baked-in AI prompt template        │
│   • Keywords + open-text inputs          │
│   • [Edit] [Generate] [Copy]             │
├─────────────────────────────────────────┤
│ SECTION 2 · RESULT                       │
│   • renders the page's cousin .json      │
│     (oldestbar.html → oldestbar.json)    │
└─────────────────────────────────────────┘
```

## The loop

1. Open a page (e.g. `oldestbar.html`).
2. Type **keywords** and any **notes**.
3. Hit **Generate** — the template + your inputs become a finished prompt.
4. Hit **Copy** and paste it into ChatGPT / Claude / etc.
5. The AI returns **JSON**. Save it next to the page as the **cousin file**
   (`oldestbar.html` → `oldestbar.json`).
6. Reload — Section 2 renders the JSON (Structured or Raw view).

## The three buttons

| Button | What it does |
| --- | --- |
| **Generate** | Assembles `#basePrompt` + Keywords + Notes into the final prompt. |
| **Copy** | Copies the generated prompt to the clipboard (auto-generates first if empty). |
| **Edit** | Unlocks the base prompt so you can tweak it in-page. *Session only* — to keep a change, edit the `#basePrompt` text in the HTML file. |

## The prompt template

Lives in the `#basePrompt` textarea of each HTML page — "specified upon page
creation." Two optional placeholders are substituted on Generate:

- `{{keywords}}` → the Keywords field
- `{{notes}}` → the Notes / open-text field

Anything you *don't* reference is appended automatically as `KEYWORDS:` / `NOTES:`
blocks, so a template with no placeholders still works.

Tip: end the prompt with *"Return ONLY valid JSON …"* so the reply drops straight
into the cousin `.json`.

## The cousin .json

`research.js` derives it from the page's own URL: same path, `.html` → `.json`.
So `lighthouses.html` automatically reads `lighthouses.json`. No wiring needed —
just name the two files the same.

The renderer handles **any** JSON shape: nested objects, arrays, numbers,
booleans, and auto-links `http(s)` URLs. Toggle **Structured / Raw** in Section 2.

## index.html — auto-discovering home

`index.html` lists every research page in this folder **dynamically**. Because the
site runs on a custom domain (no readable repo slug, no directory listing on
static hosting), it lists the folder through the **GitHub Contents API** in one
call, then enriches each page same-origin:

- pulls each page's real `<h1>` / subtitle for the card,
- flags whether the cousin `.json` already exists (**● result ready** vs **○ awaiting JSON**),
- offers a live filter box.

Drop in a new `*.html` and it appears on the index automatically — no manifest.
`index.html` and files starting with `_` (like `_template.html`) are skipped.

> The GitHub API allows ~60 unauthenticated requests/hour. If you hit that, the
> index shows a Retry button. The owner/repo are constants at the top of
> `index.html` (`the-game-bureau/the-game-bureau.github.io`).

## Make a new research page

1. Copy `_template.html` → `yourtopic.html`.
2. Edit the `<title>`, `<h1>`, and the `#basePrompt` template.
3. (Optional) Add `yourtopic.json` now, or after you run the prompt.

That's it — `research.css` and `research.js` are shared, so new pages are tiny.

## Note on serving

Section 2 uses `fetch()`, which needs the page served over **http(s)** (the live
site, or a local server like `python -m http.server`). Opening the file directly
with `file://` will block the JSON load — the empty state explains this.
