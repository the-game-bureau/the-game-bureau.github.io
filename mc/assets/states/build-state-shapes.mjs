#!/usr/bin/env node
// Fetches a public GeoJSON of US states, converts each state's geometry to a
// compact SVG path normalized to a uniform 40x24 viewBox (aspect-preserved,
// centered), and writes us-state-shapes.js for use by index.html.
// Run once whenever the source data needs refreshing — output is committed.
//
// Source: PublicaMundi/MappingAPI (CC0-ish open data, US Census derivatives).

import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'us-state-shapes.js');

// Target badge size.
const TARGET_W = 40;
const TARGET_H = 24;
const PADDING = 2;

// FIPS code → 2-letter abbreviation. PublicaMundi's `id` field is the FIPS.
const FIPS_TO_ABBR = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE',
  '11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA',
  '20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN',
  '28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM',
  '36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI',
  '45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA',
  '54':'WV','55':'WI','56':'WY'
};

// Distance threshold for Douglas-Peucker simplification (in source-coord units,
// i.e. degrees of longitude/latitude). 0.06° ≈ 4 mi, plenty fine for a 40px badge.
const SIMPLIFY_EPS = 0.06;

// Hand-drawn shape overrides — applied AFTER the auto-generation pass, before
// writing the output file. Use this for territories whose real geometry
// simplifies poorly into a recognizable silhouette at 40x24.
//
// DC: the real district is an L-shape (post-1846 Virginia retrocession). At
// 40x24 it collapses into an unrecognizable quadrilateral. We use the iconic
// 100-square-mile diamond (original 1791 federal boundary) instead because it
// reads instantly as DC. If you ever need to revert to the real shape, delete
// the DC entry below and rerun the build.
const HAND_DRAWN_SHAPES = {
  DC: 'M20 2L32 12L20 22L8 12L20 2Z'
};

// ── Geometry helpers ────────────────────────────────────────────────────────

function ringBBox(ring) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function ringArea(ring) {
  // Shoelace. Sign indicates winding — we only need magnitude for "biggest ring".
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a) / 2;
}

// Douglas-Peucker line simplification. eps is the max allowed perpendicular
// distance from a point to the simplified segment, in source units.
function simplify(points, eps) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const projX = ax + t * dx;
      const projY = ay + t * dy;
      const d = Math.hypot(px - projX, py - projY);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Extract polygon rings out of a GeoJSON Polygon / MultiPolygon geometry.
function geometryRings(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates;
  if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
  return [];
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${SRC}…`);
  const resp = await fetch(SRC);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const fc = await resp.json();
  if (!fc || fc.type !== 'FeatureCollection') throw new Error('Expected FeatureCollection');

  const shapes = {};
  let kept = 0;

  for (const feature of fc.features || []) {
    const abbr = FIPS_TO_ABBR[feature.id];
    if (!abbr) continue;
    const rings = geometryRings(feature.geometry);
    if (!rings.length) continue;

    // Simplify each ring, then drop any whose remaining bbox is tiny relative
    // to the biggest one (these are offshore islands that visually clutter
    // a 40x24 badge — e.g. Hawaii's outer keys, Alaska's Aleutians).
    const simplified = rings.map((r) => simplify(r, SIMPLIFY_EPS)).filter((r) => r.length >= 4);
    if (!simplified.length) continue;

    const areas = simplified.map(ringArea);
    const maxArea = Math.max(...areas);
    const dropRatio = abbr === 'AK' || abbr === 'HI' ? 0.04 : 0.005;
    const kept2 = simplified.filter((_, i) => areas[i] >= maxArea * dropRatio);

    // Compute combined bbox across kept rings (in lon/lat, with lat un-flipped
    // for now — we'll flip Y at draw time).
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of kept2) {
      const b = ringBBox(r);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w <= 0 || h <= 0) continue;

    const availW = TARGET_W - 2 * PADDING;
    const availH = TARGET_H - 2 * PADDING;
    const scale = Math.min(availW / w, availH / h);
    const usedW = w * scale;
    const usedH = h * scale;
    const offX = PADDING + (availW - usedW) / 2;
    const offY = PADDING + (availH - usedH) / 2;

    // Build the path. Flip Y (lat grows north → SVG y grows south).
    const pathParts = [];
    for (const ring of kept2) {
      const cmds = [];
      ring.forEach(([lon, lat], i) => {
        const x = (lon - minX) * scale + offX;
        const y = (maxY - lat) * scale + offY;
        cmds.push((i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2));
      });
      cmds.push('Z');
      pathParts.push(cmds.join(''));
    }
    shapes[abbr] = pathParts.join('');
    kept++;
  }

  // Apply hand-drawn overrides (see HAND_DRAWN_SHAPES above for reasoning).
  for (const [abbr, path] of Object.entries(HAND_DRAWN_SHAPES)) {
    shapes[abbr] = path;
  }

  console.log(`Wrote ${kept} state shapes (with ${Object.keys(HAND_DRAWN_SHAPES).length} hand-drawn overrides).`);

  // Emit a compact JS module that defines window.US_STATE_SHAPES.
  const sortedKeys = Object.keys(shapes).sort();
  const lines = [
    '// Auto-generated by assets/states/build-state-shapes.mjs.',
    `// Source: ${SRC}`,
    `// Each value is an SVG path string normalized to a ${TARGET_W}x${TARGET_H} viewBox`,
    `// with ${PADDING}px padding, aspect ratio preserved, Y flipped to SVG coords.`,
    'window.US_STATE_SHAPES = {',
    `  _viewBox: '0 0 ${TARGET_W} ${TARGET_H}',`,
    `  _w: ${TARGET_W},`,
    `  _h: ${TARGET_H},`,
    ...sortedKeys.map((k) => `  ${k}: '${shapes[k]}',`),
    '};'
  ];
  await writeFile(OUT, lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
