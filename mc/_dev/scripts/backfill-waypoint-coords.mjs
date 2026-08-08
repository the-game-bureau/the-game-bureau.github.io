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

// waypoints.address is sometimes a COMPLETE address - "200 E Colfax Ave, Denver,
// CO 80203" - and sometimes a bare street line - "800 Ocean Dr". The two need
// opposite handling, and getting that wrong is not a near miss:
//
//   * A complete address must be sent AS IT STANDS. Appending city/state/zip to
//     it produces a string Nominatim cannot resolve, which is how the first cut
//     of this script found nothing for three Denver rows in a row.
//   * A bare street line must NEVER be sent alone. "Ocean Dr" exists in every
//     English-speaking country on earth, and a free-text search happily returns
//     the one in London or Melbourne. The first run of this script did exactly
//     that: 36 of 274 points landed on the wrong continent - Boston stops in
//     London, a Baltimore synagogue in Melbourne, Atlanta in Sydney.
//
// So the comma decides, and the city is always attached when there is not one.
function attemptsFor(row) {
  const s = (v) => String(v == null ? '' : v).trim();
  const addr = s(row.address);
  const city = s(row.city);
  const st = s(row.state);
  const zip = s(row.zip);
  const name = s(row.name);
  const out = [];
  if (addr && /,/.test(addr)) {
    out.push(addr);
  } else if (addr) {
    out.push([addr, city, st, zip].filter(Boolean).join(', '));
    out.push([addr, city, st].filter(Boolean).join(', '));
  }
  // Last resort: the place by name in its city. Weaker - it can land on a
  // same-named business across town - so it is never tried first.
  if (name && city) out.push([name, city, st].filter(Boolean).join(', '));
  return [...new Set(out.filter(Boolean))];
}

// Retries, because a five-minute sequential run over somebody else's free
// service WILL hit a transient failure, and an unhandled one threw away 100
// rows of finished work the first time. A network error is not an answer about
// the address; only an empty result is.
async function geocode(q, tries = 3) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q);
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      // 429/5xx is "ask again later", not "no such place".
      if (res.status === 429 || res.status >= 500) throw new Error('http ' + res.status);
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      const hit = Array.isArray(j) && j[0];
      if (!hit || !hit.lat || !hit.lon) return null;
      return { lat: Number(hit.lat), lon: Number(hit.lon) };
    } catch (err) {
      if (attempt === tries) {
        process.stderr.write('  giving up on "' + q + '": ' + (err && err.message || err) + '\n');
        return null;
      }
      await sleep(GAP_MS * attempt * 3);
    }
  }
  return null;
}

// The second half of the same defence. Every candidate point is checked against
// the city it claims to be in, and anything absurdly far away is thrown out
// rather than stored. A query can still be answered by the wrong place in the
// right-sounding town; this catches the ones that are not even close.
//
// 75 km is deliberately loose. It has to clear a genuinely spread metro - a
// stadium in Foxborough is 40 km from downtown Boston and correct - while still
// rejecting a different continent by three orders of magnitude. There is no
// value of this that separates "wrong side of the county" from "right", and
// pretending otherwise would throw away good points.
const MAX_KM_FROM_CITY = 75;
const cityPoints = new Map();

function kmBetween(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function cityPoint(city, state) {
  const key = (city + '|' + state).toLowerCase();
  if (cityPoints.has(key)) return cityPoints.get(key);
  const hit = city ? await geocode([city, state].filter(Boolean).join(', ')) : null;
  await sleep(GAP_MS);
  cityPoints.set(key, hit);
  return hit;
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
    // A row that blows up is one row, not the end of the run - the point of a
    // five-minute job is that you get the other 280.
    let anchor = null;
    try {
      anchor = await cityPoint(String(row.city || '').trim(), String(row.state || '').trim());
    } catch (err) {
      process.stderr.write('  city lookup failed for ' + row.city + ': ' + (err && err.message || err) + '\n');
    }
    let hit = null;
    for (const q of attemptsFor(row)) {
      let got = null;
      try { got = await geocode(q); } catch (err) { got = null; }
      await sleep(GAP_MS);
      if (!got) continue;
      // A point that is not near the city it claims is wrong, however confident
      // the geocoder sounded. Keep looking; a later, more qualified query often
      // gets it right.
      if (anchor && kmBetween(anchor, got) > MAX_KM_FROM_CITY) {
        process.stderr.write(`  rejected wpid ${row.wpid} (${row.name}): ${Math.round(kmBetween(anchor, got))} km from ${row.city}\n`);
        continue;
      }
      hit = got;
      break;
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
