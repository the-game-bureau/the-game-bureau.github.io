# Notebook game template

Everything needed to put a paper notebook game on thegamebureau.com: a public page, a rules
page, and an admin page that builds the printable PDFs. Live sample:
[thegamebureau.com/template/dice-derby/](https://thegamebureau.com/template/dice-derby/).

```
template/
  index.html      the Notebook Studio: start new notebooks, find every admin page
  kit/            shared code every game uses (don't copy it; games link to /template/kit/)
    kit.js kit.css       public page + rules page, built from game.json
    print.js print.css   lays out cover.html and contents.html for print
    admin.js admin.css   admin page: setup steps, editors with live preview, save, PDFs
    studio.js            the Notebook Studio
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
| `admin.html` | `/<game>/admin.html`: builds the PDFs. Not linked anywhere and marked noindex. |
| `images/` | Photos for the gallery. |
| `pdf/` | Built PDFs. Don't edit; the build writes them. |

## PDFs (built from the admin page)

- `<slug>-cover.pdf`: front/back cover for the printer, one wraparound spread (back, spine, front) with 0.125 in bleed. Spine width = pages x `print.spinePerPage`.
- `<slug>-contents.pdf`: the inside pages for the printer, rules first, with bleed, padded with blanks to a multiple of `print.padTo`.
- `<slug>.pdf`: print-at-home notebook at trim size: front, rules, contents, back.
- `<slug>-sampler.pdf`: free sampler: front, rules, the first `print.samplerPages` pages (or pages marked `data-sampler`), back. This is the free download on the public page (set `"freeFullPdf": true` to offer the whole notebook instead).

**Build PDFs** on the admin page runs `.github/workflows/notebook-pdfs.yml`, which renders the
pages in Chrome, checks every page size, commits the PDFs to `pdf/` and republishes the site
(about 2 to 3 minutes). For one-click builds, save a fine-grained GitHub token (this repository
only, Actions: Read and write) under "GitHub access" on the admin page. Without one, the button
opens the workflow on GitHub. The PDFs also rebuild on their own when a game's `game.json`,
`rules.md`, `cover.html` or `contents.html` changes on `main`.

Build locally: `node template/kit/build-pdfs.js template/dice-derby` (needs `playwright` and `pdf-lib`).

## Start a new game: the Notebook Studio

Open **[thegamebureau.com/template/](https://thegamebureau.com/template/)** (the Notebook Studio):

1. **Connect GitHub** once per browser: a fine-grained token for this repository only, with
   Contents and Actions set to Read and write. Saving from the studio or an admin page is a
   commit to `main`, which republishes the site.
2. **Start a new notebook**: name, web address, tagline, pitch, players, price, colours, and
   whether to start from the blank starter or the Dice Derby sample. The studio copies the
   template into `/<address>/` with those filled in. The template folders are only read.
3. **Open its admin page** (`/<address>/admin.html`) and work down the Setup checklist:
   Content, Colors, Rules, Cover, Inside pages, Photos & video, PDFs, each with a live preview.
   Edits are kept as a draft in the browser until **Save and publish**.
4. The PDFs rebuild on their own about 3 minutes after each save. Until real photos are added,
   the game page shows pictures of the cover and pages from the build.

Folders under `template/` open read-only in the admin page (a checkbox there allows editing the
template on purpose).

Without the studio: `node template/kit/new-game.js my-game "My Game"` copies the Dice Derby
sample, or copy a folder by hand and change `slug` in `game.json` to the folder name.
