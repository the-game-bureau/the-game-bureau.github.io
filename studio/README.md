# Notebook Studio and notebook game template

Everything needed to put a paper notebook game on thegamebureau.com: a public page, a rules
page, and an editor in the studio that builds the printable PDFs. Live sample:
[thegamebureau.com/studio/dice-derby/](https://thegamebureau.com/studio/dice-derby/).

```
studio/
  index.html      the Notebook Studio: one editor for new and existing notebooks
  edit.html       old address of the editor; sends you to /studio/?game=<folder>
  kit/            shared code every game uses (don't copy it; games link to /studio/kit/)
    kit.js kit.css       public page + rules page, built from game.json
    print.js print.css   lays out cover.html and contents.html for print
    admin.js admin.css   the editor: setup steps, editors with live preview, save, PDFs
    studio.js            the studio's Connect and Notebooks tabs, and the template list
    gh.js                GitHub calls from the browser (commit files, start builds)
    build-pdfs.js        renders the PDFs in Chrome (run by the GitHub workflow)
    new-game.js          copies the sample into a new game folder
    fonts/               Anton + Inter (OFL), so PDFs look the same everywhere
  starter/        the blank starter the studio copies by default
  dice-derby/     a finished sample game
```

## Each game folder

| File | What it is |
| --- | --- |
| `game.json` | Title, tagline, price, order link, photos and videos, description, specs, how-it-works steps, colours, print size. **The public page is built from this.** |
| `index.html` | The public page (`/<game>/`). Only the title and share-preview tags need editing. |
| `rules.md` | The full rules. Shown on `rules.html` **and** printed at the front of the notebook. |
| `rules.html` | The rules page. Nothing to edit but the title tags. |
| `cover.html` | Front and back cover design (`.cover-front`, `.cover-back`, optional `.cover-spine`). |
| `contents.html` | Every inside page after the rules. Use `<template data-repeat>` for repeated sheets. |
| `images/` | Photos for the gallery. |
| `pdf/` | Built PDFs. Don't edit; the build writes them. |

## PDFs (built from the editor)

- `<slug>-cover.pdf`: front/back cover for the printer, one wraparound spread (back, spine, front) with 0.125 in bleed. Spine width = pages x `print.spinePerPage`.
- `<slug>-contents.pdf`: the inside pages for the printer, rules first, with bleed, padded with blanks to a multiple of `print.padTo`.
- `<slug>.pdf`: print-at-home notebook at trim size: front, rules, contents, back.
- `<slug>-sampler.pdf`: free sampler: front, rules, the first `print.samplerPages` pages (or pages marked `data-sampler`), back. This is the free download on the public page (set `"freeFullPdf": true` to offer the whole notebook instead).

**Build PDFs** in the editor runs `.github/workflows/notebook-pdfs.yml`, which renders the
pages in Chrome, checks every page size, commits the PDFs to `pdf/` and republishes the site
(about 2 to 3 minutes). For one-click builds, save a fine-grained GitHub token (this repository
only, Actions: Read and write) under "GitHub access" in the editor. Without one, the button
opens the workflow on GitHub. The PDFs also rebuild on their own when a game's `game.json`,
`rules.md`, `cover.html` or `contents.html` changes on `main`.

Build locally: `node studio/kit/build-pdfs.js studio/dice-derby` (needs `playwright` and `pdf-lib`).

## Start a new game: the Notebook Studio

Open **[thegamebureau.com/studio/](https://thegamebureau.com/studio/)** (the Notebook Studio):

The studio is one editor for new and existing notebooks, with the same tabs for both:
Connect, Notebooks, How it works, Checklist, Content, Colors, Rules, Cover, Inside pages, Photos & video, PDFs.
Plain `/studio/` opens with only Connect and Notebooks available; the other tabs are greyed out
until a notebook is chosen in Notebooks (New notebook, or EDIT on an existing one).

1. **Connect** (once per browser): a fine-grained token for this repository only, with
   Contents and Actions set to Read and write. Saving from the studio is a commit to `main`,
   which republishes the site.
2. **A new notebook**: NEW NOTEBOOK under Notebooks (`/studio/?new`) opens the editor on a new, unsaved notebook started from the
   blank starter (or the Dice Derby sample; pick in Content). Give it a title and web address in
   Content, shape anything else with the live preview, and click **Create notebook**. That copies
   the template into `/<address>/` with your edits and opens it. Until then the draft is kept in
   the browser. The template folders are only read.
3. **An existing notebook**: EDIT under Notebooks, or `/studio/?game=<address>`. Work down the
   Checklist. Edits are kept as a draft in the browser until **Save and publish**.
4. **Short address (optional):** the checklist's "Give it its own web address" step has the exact
   Cloudflare settings, filled in for that game, to make `https://<address>.thegamebureau.com`
   redirect to `https://thegamebureau.com/<address>/`: a proxied `AAAA` record to `100::` named
   `<address>`, plus a Redirect Rule (Hostname equals `<address>.thegamebureau.com`, Dynamic,
   `concat("https://thegamebureau.com/<address>", http.request.uri.path)`, 301, keep query string).
5. The PDFs rebuild on their own about 3 minutes after each save. Until real photos are added,
   the game page shows pictures of the cover and pages from the build.

**Editing pages with an AI.** The Cover and Inside pages tabs have an "Edit this page with an AI"
box. COPY FOR AI copies the page size, the layout rules and the whole file for a chat AI, and
PASTE AI ANSWER puts its reply back in the editor (nothing is saved until Save and publish).
For an AI that can use GitHub, it shows the repository, the file path and what to tell it.

**Deleting a notebook.** Under Notebooks, DELETE asks you to type the folder name, then removes
the whole folder in one commit (it can be brought back from the git history). The template
folders under `studio/` have no DELETE button.

Old `/template/` links redirect to `/studio/`.

**Keeping it private.** Nothing can be changed without the GitHub token, which is stored only in
the browser that set up the studio. To also hide the studio (and its editor), put
Cloudflare Access (free plan) in front of it. Steps: in Cloudflare Zero Trust, one
Self-hosted application for `thegamebureau.com/studio` (Allow, your email, One-time PIN), and a second one for `thegamebureau.com/studio/kit` with a
Bypass policy for Everyone, because every public game page loads the kit. The studio and editor
are also marked `noindex`. Games no longer have their own `admin.html`; an old one is removed
the next time that game is saved.

Folders under `studio/` open read-only in the editor (a checkbox there allows editing the
template on purpose).

Without the studio: `node studio/kit/new-game.js my-game "My Game"` copies the Dice Derby
sample, or copy a folder by hand and change `slug` in `game.json` to the folder name.
