# Notebook Studio and notebook game template

Everything needed to put a paper notebook game on thegamebureau.com: a public page, a rules
page, and an editor in the studio that builds the printable PDFs.

```
studio/
  index.html      the Notebook Studio: one editor for new and existing notebooks
  edit.html       old address of the editor; sends you to /studio/?game=<folder>
  kit/            shared code every game uses (don't copy it; games link to /studio/kit/)
    kit.js kit.css       public page + rules page, built from game.json
    print.js print.css   lays out cover.html and contents.html for print
    admin.js admin.css   the editor: setup steps, editors with live preview, save, PDFs
    studio.js            the studio's Connect and Notebooks tabs, and the start-from list
    gh.js                GitHub calls from the browser (commit files, saved drafts, start builds)
    build-pdfs.js        renders the PDFs in Chrome (run by the GitHub workflow)
    new-game.js          copies the blank starter into a new game folder
    fonts/               Anton + Inter (OFL), so PDFs look the same everywhere
  starter/        the blank starter a new notebook can start from (hidden from Notebooks)
```

## Each game folder

| File | What it is |
| --- | --- |
| `game.json` | Title, tagline, price, order link, photos and videos, description, specs, how-it-works steps, colours, print size. **The public page is built from this.** |
| `index.html` | The public page (`/<game>/`). Only the title and share-preview tags need editing. |
| `rules.md` | The full rules, as HTML (`<h1>{{title}} rules</h1>`, `<h2>`, `<p>`, `<ol>`...). Shown on `rules.html` **and** printed at the front of the notebook. Older notebooks wrote it in Markdown, which still works; the studio turns it into HTML when opened. |
| `rules.html` | The rules page. Nothing to edit but the title tags. With `"rulesLink": "https://..."` in game.json (Rules tab, *Link to them*), every rules button opens that link in a new tab and this page forwards there; the notebook still prints `rules.md`. |
| `cover.html` | Front and back cover design (`.cover-front`, `.cover-back`, optional `.cover-spine`). `{{image}}` puts the game's main image there: photo 1 in Photos & video when the cover is generated, or a pattern of squares until there is a photo. |
| `contents.html` | Every inside page after the rules. Use `<template data-repeat>` for repeated sheets. |
| `sampler.html` | The free sampler's own pages (same layout as `contents.html`). Its PDF is front, these pages, back. |
| `images/` | Photos for the gallery. |
| `pdf/` | Built PDFs. Don't edit; the build writes them. |

## PDFs (built from the editor)

- `<slug>-cover.pdf`: front/back cover for the printer, one wraparound spread (back, spine, front) with 0.125 in bleed. Spine width = pages x `print.spinePerPage`. The spine text (`.cover-spine`) is sized to fit with 1/16 in clear each side, and left off when the spine is under about 0.21 in (`print.spineTextMin` overrides that). The Cover tab shows the width and previews the spread at it.
- `<slug>-contents.pdf`: the inside pages for the printer, rules first, with bleed, padded with blanks to a multiple of `print.padTo`.
- `<slug>.pdf`: print-at-home notebook at trim size: front, rules, contents, back.
- `<slug>-sampler.pdf`: free sampler: front, the pages in `sampler.html` (the studio's Sampler tab), back. `sampler.html` is separate from `contents.html`. This is the free download on the public page.

**Build PDFs** in the editor runs `.github/workflows/notebook-pdfs.yml`, which renders the
pages in Chrome, checks every page size, commits the PDFs to `pdf/` and republishes the site
(about 2 to 3 minutes). For one-click builds, save a fine-grained GitHub token (this repository
only, Actions: Read and write) under "GitHub access" in the editor. Without one, the button
opens the workflow on GitHub. The PDFs also rebuild on their own when a game's `game.json`,
`rules.md`, `cover.html`, `contents.html` or `sampler.html` changes on `main`.

Build locally: `node studio/kit/build-pdfs.js chess` (needs `playwright` and `pdf-lib`).

## Start a new game: the Notebook Studio

Open **[thegamebureau.com/studio/](https://thegamebureau.com/studio/)** (the Notebook Studio):

The studio is one editor for new and existing notebooks, with the same tabs for both:
Welcome, Connect, Notebooks, Colors, Media, Website, Cover, Pages (Rules, Scoring, Game), Sampler, Bundle, Checklist, History, Ideas. DISCARD, SAVE and PUBLISH are in the title bar.
Plain `/studio/` opens with only Connect and Notebooks available; the other tabs are greyed out
until a notebook is chosen in Notebooks (New notebook, or EDIT on an existing one).

1. **Connect** (once per browser): a fine-grained token for this repository only, with
   Contents and Actions set to Read and write.
2. **A new notebook**: NEW NOTEBOOK under Notebooks (`/studio/?new`) opens the editor on a new
   notebook. In Content, start from the blank starter or a copy of any notebook on the site, and
   give it a title and web address. Shape anything else with the live preview.
3. **An existing notebook**: EDIT under Notebooks, or `/studio/?game=<address>`. Work down the
   Checklist.
4. **SAVE and PUBLISH (title bar).** Edits are kept in the browser as you go. **SAVE** stores the whole notebook
   (photos included) as one file on the `studio-drafts` branch, which is never deployed, so it
   is not on the site but any browser connected to GitHub can open it from Notebooks (marked
   SAVED, NOT PUBLISHED). **PUBLISH** commits to `main`, which republishes the site; for a new
   notebook it copies the starting folder into `/<address>/` with your edits. Publishing removes
   the saved draft.
   - **DISCARD** throws changes away: back to the last SAVE, back to the live version, or (for a
     notebook never published) the whole notebook. Notebooks also has DELETE on saved, unpublished notebooks.
   - **Someone else got there first:** before SAVE or PUBLISH the studio checks whether another
     browser saved or published the notebook since it was opened, and asks before replacing it.
   - **PDF status:** after PUBLISH the title bar follows the PDF build on GitHub (building, then ready).
   - **History** lists every published version; LOAD puts one back in the editor, photos included,
     to PUBLISH again.
5. **Short address (optional):** the checklist's "Give it its own web address" step has the exact
   Cloudflare settings, filled in for that game, to make `https://<address>.thegamebureau.com`
   redirect to `https://thegamebureau.com/<address>/`: a proxied `AAAA` record to `100::` named
   `<address>`, plus a Redirect Rule (Hostname equals `<address>.thegamebureau.com`, Dynamic,
   `concat("https://thegamebureau.com/<address>", http.request.uri.path)`, 301, keep query string).
6. The PDFs rebuild on their own about 3 minutes after each publish. Until real photos are added,
   the game page shows pictures of the cover and pages from the build.

**Editing pages with an AI.** The Cover, Scoring and Game tabs have an "Edit this page with an AI"
box. COPY FOR AI copies the page size, the layout rules and the whole file for a chat AI, and
PASTE AI ANSWER puts its reply back in the editor (nothing is saved until SAVE or PUBLISH).
For an AI that can use GitHub, it shows the repository, the file path and what to tell it.

**Deleting a notebook.** Under Notebooks, DELETE asks you to type the folder name, then removes
the whole folder in one commit (it can be brought back from the git history). The blank starter
under `studio/` is not listed.

Old `/template/` links redirect to `/studio/`.

**Keeping it private.** Nothing can be changed without the GitHub token, which is stored only in
the browser that set up the studio. To also hide the studio (and its editor), put
Cloudflare Access (free plan) in front of it. Steps: in Cloudflare Zero Trust, one
Self-hosted application for `thegamebureau.com/studio` (Allow, your email, One-time PIN), and a second one for `thegamebureau.com/studio/kit` with a
Bypass policy for Everyone, because every public game page loads the kit. The studio and editor
are also marked `noindex`. Games no longer have their own `admin.html`; an old one is removed
the next time that game is published.

`/studio/?game=studio/starter` opens the blank starter read-only (a checkbox there allows
editing it on purpose).

Without the studio: `node studio/kit/new-game.js my-game "My Game"` copies the blank
starter, or copy a folder by hand and change `slug` in `game.json` to the folder name.
