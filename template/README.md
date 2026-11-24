# Notebook game template

Everything needed to put a paper notebook game on thegamebureau.com: a public page, a rules
page, and an admin page that builds the printable PDFs. Live sample:
[thegamebureau.com/template/dice-derby/](https://thegamebureau.com/template/dice-derby/).

```
template/
  kit/            shared code every game uses (don't copy it; games link to /template/kit/)
    kit.js kit.css       public page + rules page, built from game.json
    print.js print.css   lays out cover.html and contents.html for print
    admin.js admin.css   admin page: Build PDFs button, files, proofs
    build-pdfs.js        renders the PDFs in Chrome (run by the GitHub workflow)
    new-game.js          copies the sample into a new game folder
    fonts/               Anton + Inter (OFL), so PDFs look the same everywhere
  dice-derby/     the sample game: copy this to start a new one
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

## Start a new game

1. `node template/kit/new-game.js my-game "My Game"` (or copy `template/dice-derby/` to `/my-game/` and change `slug` in `game.json` to `my-game`; the slug must match the folder name).
2. Edit `game.json`: words, price, `order.url` (a Stripe Payment Link gets the quantity passed along), `media` (images, `{"type":"youtube","id":"..."}`, `{"type":"vimeo","id":"..."}` or `{"type":"video","src":"..."}`), `brand` colours, `print` size.
3. Write `rules.md`, design `cover.html` and `contents.html`. Proof them in the browser from the admin page.
4. Update the title and `og:` tags in `index.html` and `rules.html`.
5. Push to `main`. The PDFs build, then the public page's sampler link works.
