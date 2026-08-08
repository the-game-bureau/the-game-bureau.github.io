// backfill-waypoint-coords.mjs — locate every waypoint once, so nobody waits again.
//
// WHY THIS EXISTS. The Waypoints page draws a map of the city you are looking
// at. With no coordinates on the row it derived each pin from the street address
// at runtime through Nominatim, which allows one request per second — so a cold
// cache cost ~41s on Denver (37 pins), ~30s on Baltimore, ~23s on Atlanta before
// the map settled. A localStorage cache hid it on whichever machine had already
// sat through it, which is why it read as "sometimes slow".
//
// 2026080704_waypoints_latlon.sql gave the table lat/lon back and the page now
// writes a point the moment it geocodes one. This script pays off the backlog in
// one go instead of making the next person visit all 60 cities.
//
// RUN IT ONCE:
//   node mc/_dev/scripts/backfill-waypoint-coords.mjs --dry-run   # look first
//   node mc/_dev/scripts/backfill-waypoint-coords.mjs
//
// It needs SUPABASE_SERVICE_KEY in the repo-root .env, because waypoints are
// admin-gated: RLS grants writes to `authenticated` only, and this is a script
// with no session. Absent as of 2026-08-06 — see the Environment section of
// CLAUDE.md. Without it the script still runs read-only and reports what it
// would do.
//
// It is SAFE TO RE-RUN and safe to interrupt: it only touches rows where lat is
// null, so a second run picks up wherever the first stopped.
//
// ONE REQUEST PER SECOND, AND THAT IS NOT NEGOTIABLE. Nominatim is a free
// service run on donated hardware; the rate limit is their usage policy, not a
// suggestion, and the User-Agent identifying us is a requirement of it. 220 rows
// takes about four minutes. Do not parallelise this.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Minimal .env reader — the other scripts in this folder do the same rather
// than take a dependency for six lines.
function loadEnv() {
  const file = path.join(REPO_ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const SB_URL = (process.env.SUPABASE_URL || 'https://qmaafbncpzrdmqapkkgr.supabase.co').replace(/\/+$/, '');
const SB_PUBLISHABLE = process.env.SUPABASE_KEY || 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('--dry-run') || !SB_SERVICE;
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;

const GAP_MS = 1100;                 // just over Nominatim's 1/sec ceiling
const UA = 'TheGameBureau-waypoint-backfill/1.0 (+https://thegamebureau.com)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (v) => (v == null ? '' : String(v)).trim();

async function sb(pathAndQuery, init = {}) {
  const key = init.method && init.method !== 'GET' ? (SB_SERVICE || SB_PUBLISHABLE) : SB_PUBLISHABLE;
  const res = await fetch(SB_URL + pathAndQuery, {
    ...init,
    headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json', ...(init.headers || {}) }
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathAndQuery} -> ${res.status} ${await res.text()}`);
  return res;
}

// Ordered query attempts for one row, mirroring the page's own
// geocodeAddressPoint. Order matters and so does the SHAPE:
//
//   waypoints.address is ALREADY A COMPLETE ADDRESS — "200 E Colfax Ave,
//   Denver, CO 80203" — not a bare street line. Appending city/state/zip to it
//   yields "…Denver, CO 80203, Denver, CO, 80203", which Nominatim does not
//   resolve. The first cut of this script did exactly that and found nothing
//   for any of the first three Denver rows. Checked against the live service:
//
//     q = "200 E Colfax Ave, Denver, CO 80203"          -> 39.73921, -104.98485
//     structured street="200 E Colfax Ave" + city/state -> 39.73921, -104.98485
//     structured street=<the whole address>             -> NOT FOUND
//     q = "Colorado State Capitol, Denver, CO"          -> 39.73796, -104.98531
//
// So: the address alone first, then the named venue, then the structured
// endpoint with the street segment split back out.
function attemptsFor(row) {
  const address = clean(row.address);
  const city = clean(row.city);
  const state = clean(row.state);
  const zip = clean(row.zip);
  const name = clean(row.name);
  const out = [];

  if (address) out.push({ q: address });
  if (name && (city || state)) out.push({ q: [name, city, state].filter(Boolean).join(', ') });
  if (address) {
    // Everything before the first comma is the street line in every row in this
    // table; the structured endpoint is the most precise form of the question.
    const street = address.split(',')[0].trim();
    if (street && street !== address) {
      const structured = { street };
      if (city) structured.city = city;
      if (state) structured.state = state;
      if (zip) structured.postalcode = zip;
      out.push(structured);
    }
  }
  return out;
}

// Each attempt is its own request, so each one waits out the rate limit too.
async function geocode(row) {
  const attempts = attemptsFor(row);
  for (let i = 0; i < attempts.length; i += 1) {
    if (i) await sleep(GAP_MS);
    const point = await geocodeOnce(attempts[i]);
    if (point) return point;
  }
  return null;
}

async function geocodeOnce(params) {
  const url = 'https://nominatim.openstreetmap.org/search?'
    + new URLSearchParams({ ...params, format: 'json', limit: '1', addressdetails: '0' });
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('nominatim ' + res.status);
  const hits = await res.json();
  const hit = Array.isArray(hits) ? hits[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

async function main() {
  console.log(DRY_RUN
    ? (SB_SERVICE ? '— DRY RUN, nothing will be written —' : '— no SUPABASE_SERVICE_KEY, running read-only —')
    : '— writing coordinates —');

  let rows;
  try {
    rows = await (await sb('/rest/v1/waypoints?select=wpid,name,address,city,state,zip,lat&lat=is.null&order=city.asc,wpid.asc')).json();
  } catch (err) {
    if (/lat/.test(String(err))) {
      console.error('\nThe lat column does not exist yet. Apply the migration first:');
      console.error('  cd mc && supabase db push        (2026080704_waypoints_latlon.sql)\n');
      process.exit(1);
    }
    throw err;
  }

  const todo = rows.slice(0, LIMIT);
  console.log(`${rows.length} waypoint(s) without coordinates` + (todo.length < rows.length ? `, doing ${todo.length}` : ''));
  if (!todo.length) { console.log('Nothing to do.'); return; }
  console.log(`At ${GAP_MS}ms apart this takes about ${Math.ceil(todo.length * GAP_MS / 60000)} minute(s).\n`);

  let located = 0, skipped = 0, failed = 0;
  for (let i = 0; i < todo.length; i += 1) {
    const row = todo[i];
    const label = `[${String(i + 1).padStart(3)}/${todo.length}] WPID${row.wpid} ${clean(row.name) || '(unnamed)'} — ${clean(row.city)}`;
    if (!attemptsFor(row).length) { skipped += 1; console.log(`${label}\n      skip: no address and no name`); continue; }

    let point = null;
    try { point = await geocode(row); } catch (err) { console.log(`${label}\n      error: ${err.message}`); }

    if (!point) {
      failed += 1;
      console.log(`${label}\n      not found: ${clean(row.address) || clean(row.name)}`);
    } else {
      located += 1;
      console.log(`${label}\n      ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`);
      if (!DRY_RUN) {
        try {
          await sb(`/rest/v1/waypoints?wpid=eq.${encodeURIComponent(row.wpid)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ lat: point.lat, lon: point.lon })
          });
        } catch (err) {
          failed += 1; located -= 1;
          console.log(`      WRITE FAILED: ${err.message}`);
        }
      }
    }
    if (i < todo.length - 1) await sleep(GAP_MS);
  }

  console.log(`\n${located} located, ${failed} not found, ${skipped} skipped.`);
  if (DRY_RUN) console.log('Nothing was written.');
  if (failed) console.log('Anything not found keeps a null point; the page will still geocode it on demand.');
}

main().catch((err) => { console.error(err); process.exit(1); });
