#!/usr/bin/env node
// Geocode every public.waypoints row that has an address and no point, and emit
// the UPDATE statements to apply.
//
// WHY THIS EXISTS. The Waypoints page derives its city map from the street
// address at runtime through Nominatim, which allows ONE REQUEST PER SECOND -
// so the loop is necessarily sequential with a 1.1s gap. On a cold cache that
// was ~41s for Denver's 37 pins before the map settled. lat/lon on the row
// removes that entirely; this script pays the cost once, offline, for the whole
// table instead of making whoever opens a city sit through it.
//
// IT WRITES NO DATABASE. It reads a JSON array of rows on stdin (or --in FILE)
// and prints SQL on stdout. That is deliberate: waypoint writes are gated behind
// the authenticated role, this script has no session, and an earlier version
// needed SUPABASE_SERVICE_KEY - a secret that is not in .env and should not have
// to be. Pipe the output through the Supabase SQL editor or:
//
//   node mc/_dev/scripts/backfill-waypoint-coords.mjs --in rows.json > coords.sql
//   cd mc && supabase db query --linked -f ../coords.sql
//
// Get the input with:
//   supabase db query --linked --output json \
//     "select wpid, name, city, state, zip, address from public.waypoints
//       where lat is null and coalesce(btrim(address),'') <> '' order by wpid"
//
// SAFE TO RE-RUN AND SAFE TO INTERRUPT - it only ever looks at rows you gave it,
// and a row it cannot resolve is simply left out of the output. A null point
// means "not located yet", never "has no location": the page still geocodes
// those on demand.
//
// DO NOT PARALLELISE IT. The 1/sec limit is Nominatim's usage policy, not a
// performance characteristic, and the identifying User-Agent below is part of
// that same policy. 280 rows is about five minutes. That is the correct speed.

import fs from 'node:fs';

const UA = 'the-game-bureau waypoint backfill (https://thegamebureau.com; kevinmkolb@gmail.com)';
const GAP_MS = 1100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// waypoints.address is a COMPLETE address - "200 E Colfax Ave, Denver, CO 80203"
// - not a street line. Appending city/state/zip to it produces a string
// Nominatim cannot resolve, which is exactly how the first cut of this script
// found nothing for three Denver rows in a row. So: try it as it stands first,
// and only then fall back to compositions for the rows that hold a bare street.
function attemptsFor(row) {
  const s = (v) => String(v == null ? '' : v).trim();
  const addr = s(row.address);
  const city = s(row.city);
  const st = s(row.state);
  const zip = s(row.zip);
  const name = s(row.name);
  const looksComplete = /,/.test(addr);
  const out = [];
  if (addr) out.push(addr);
  if (addr && !looksComplete) {
    out.push([addr, city, st, zip].filter(Boolean).join(', '));
    out.push([addr, city, st].filter(Boolean).join(', '));
  }
  // Last resort: the place by name in its city. Weaker - it can land on a
  // same-named business elsewhere in town - so it is never tried first.
  if (name && city) out.push([name, city, st].filter(Boolean).join(', '));
  return [...new Set(out.filter(Boolean))];
}

async function geocode(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  const hit = Array.isArray(j) && j[0];
  if (!hit || !hit.lat || !hit.lon) return null;
  return { lat: Number(hit.lat), lon: Number(hit.lon) };
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

async function main() {
  const i = process.argv.indexOf('--in');
  const raw = i > -1
    ? fs.readFileSync(process.argv[i + 1], 'utf8')
    : fs.readFileSync(0, 'utf8');
  const rows = JSON.parse(raw);

  const found = [];
  let missed = 0;
  for (let n = 0; n < rows.length; n++) {
    const row = rows[n];
    let hit = null;
    for (const q of attemptsFor(row)) {
      hit = await geocode(q);
      await sleep(GAP_MS);
      if (hit) break;
    }
    if (hit) found.push({ wpid: row.wpid, ...hit });
    else missed++;
    if ((n + 1) % 25 === 0) {
      process.stderr.write(`  ${n + 1}/${rows.length} - ${found.length} located, ${missed} not\n`);
    }
  }

  process.stderr.write(`done: ${found.length} located, ${missed} not resolvable\n`);
  if (!found.length) { console.log('-- nothing to update'); return; }

  // One statement. A row-per-UPDATE file of 280 statements is slower to apply
  // and much harder to read when something goes wrong.
  console.log('-- Coordinates from Nominatim, ' + new Date().toISOString().slice(0, 10) + '.');
  console.log('-- Only rows that were null are touched; a re-run cannot move a point.');
  console.log('update public.waypoints w set lat = v.lat, lon = v.lon');
  console.log('from (values');
  console.log(found.map((f) => `  (${f.wpid}, ${round6(f.lat)}, ${round6(f.lon)})`).join(',\n'));
  console.log(') as v(wpid, lat, lon)');
  console.log('where w.wpid = v.wpid and w.lat is null;');
}

main().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
