// Draws mc/assets/add-post.ico -- 16 + 32 px, the tab and bookmark icon the
// Socializer swaps in while its #manual Add box is open.
//
// THE HOME-SCREEN ICON IS NOT DRAWN HERE. iOS ignores .ico and takes the
// apple-touch-icon, and that one deliberately stays the base page's Mission
// Control tile: a shortcut to this URL is a shortcut to Mission Control's
// socials room, and giving it its own tile would file it on the home screen as
// if it were a separate product.
//
// Run:  node mc/_dev/scripts/make-add-post-icon.mjs
//
// It is here, and not a binary someone drew once, because the glyph is four
// numbers -- field colour, plus colour, arm thickness, arm length -- and every
// one of them is easier to re-tune in code than to re-draw. No dependencies:
// the ICO is a hand-written BMP payload, which is a few lines.
//
// Palette is the site's, from the page's own :root -- bic blue field, paper
// plus. Deliberately NOT tgb.ico: the whole point is that a tab sitting on
// #manual is tellable from the Socializer itself at 16 px.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
// IT LIVES IN mc/assets, NOT IN THE ROOM'S OWN FOLDER. It was written to
// mc/socials/ until 2026-08-20 and this line was not moved with the file, so
// running the script would have quietly recreated a folder that no longer
// exists -- and the room has since been renamed to mc/socializer/, so the
// recreated one would not even have been the right name.
const OUT_DIR = join(REPO_ROOT, 'mc', 'assets');

const FIELD = [0x2d, 0x48, 0x80];   // --bic-blue  #2d4880
const PLUS  = [0xfe, 0xfe, 0xf9];   // --paper-base #fefef9

// Returns { r, g, b, a } for one pixel of a size x size icon.
function pixel(x, y, size) {
  const unit = size / 32;
  const radius = Math.round(6 * unit);          // rounded square
  const arm = Math.max(2, Math.round(4 * unit)); // plus stroke thickness
  const reach = Math.round(9 * unit);            // half-length of each arm

  // Outside the rounded corner -> transparent, so the icon is a tile rather
  // than a square block whatever the tab background happens to be.
  const cx = Math.min(x, size - 1 - x);
  const cy = Math.min(y, size - 1 - y);
  if (cx < radius && cy < radius) {
    const dx = radius - cx - 0.5;
    const dy = radius - cy - 0.5;
    if (dx * dx + dy * dy > radius * radius) return { r: 0, g: 0, b: 0, a: 0 };
  }

  const mx = x - (size - 1) / 2;
  const my = y - (size - 1) / 2;
  const onPlus =
    (Math.abs(mx) <= arm / 2 && Math.abs(my) <= reach) ||
    (Math.abs(my) <= arm / 2 && Math.abs(mx) <= reach);

  const [r, g, b] = onPlus ? PLUS : FIELD;
  return { r, g, b, a: 255 };
}

// ── ICO ────────────────────────────────────────────────────────────────────
// One BITMAPINFOHEADER + 32bpp BGRA rows, bottom-up, then the 1bpp AND mask.
// The mask is all zeros (alpha carries the transparency) but the format still
// requires it, and the header's height is DOUBLED to cover both planes -- the
// two things that silently produce a garbled icon if you leave them out.
function icoImage(size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = pixel(x, y, size);
      const at = ((size - 1 - y) * size + x) * 4;   // bottom-up
      xor[at] = p.b; xor[at + 1] = p.g; xor[at + 2] = p.r; xor[at + 3] = p.a;
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, xor, Buffer.alloc(maskRow * size)]);
}

function ico(sizes) {
  const images = sizes.map(icoImage);
  const dir = Buffer.alloc(6 + 16 * sizes.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(sizes.length, 4);
  let offset = dir.length;
  sizes.forEach((size, i) => {
    const at = 6 + 16 * i;
    dir[at] = size === 256 ? 0 : size;
    dir[at + 1] = size === 256 ? 0 : size;
    dir.writeUInt16LE(1, at + 4);
    dir.writeUInt16LE(32, at + 6);
    dir.writeUInt32LE(images[i].length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += images[i].length;
  });
  return Buffer.concat([dir, ...images]);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'add-post.ico'), ico([16, 32]));
console.log('wrote mc/assets/add-post.ico');
