# archive/

Old code kept for reference or because live files still depend on pieces of it.

---

## builder/
Superseded version of the game builder (pre-Supabase era).
- **Still referenced?** No — not linked from any active page.
- `index.js` / `index.css` are dead weight; kept in case a diff is ever useful.

## game/
Old game runtime. Several files are **still load-bearing**:
- `config/lemon-config.js` — loaded at runtime by `pay/index.html` and `play/index.html`
- `play/help.html` — linked from `builder/index.html` as the in-builder help page
- `config/supabase.js` — used by the old runtime; check before deleting
- Everything else (`lib/`, `archive/`, `config/games_archive.json`) appears unused.

## oswaldoldsite/
Static snapshot of the old oswaldsdiary.com site.
- **Still referenced?** No — purely archival.
- Safe to delete if disk space or repo size ever matters.

## index_old.html / index_old.js
Previous version of the homepage.
- `index_old.html` is referenced by `builder/index.html` as `GAMES_PAGE_ROUTE` (the "back to games" link shown to unauthenticated users). **Do not delete.**
- `index_old.js` accompanies it; keep together.

## index.css / index.ico
Styles and icon from the old homepage era.
- `play/index.html` imports `archive/index.css` styles inline (comment says "Base chat UI").
- **Do not delete `index.css`** until those styles are migrated into `play/index.html`.
- `index.ico` appears unused.
