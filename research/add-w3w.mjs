// Resolve each place's location and write a what3words address (the w3w field).
// AIs hallucinate coordinates, so the AI only NAMES the place; this geocodes it
// (Google Places when GOOGLE_PLACES_API_KEY is set — best coverage — else
// Nominatim) and converts the point to a 3-word address via the what3words API.
//   node research/add-w3w.mjs [file=research/atlas.jsonl] [limit] [--all]
// By default only fills places MISSING a w3w; --all re-does every place.
// Operates on atlas.jsonl: "route" records are skipped, only "place" records geocode.
// Keys: GOOGLE_PLACES_API_KEY (optional), W3W_API_KEY (or the CSNL2XHT constant).
import { readFileSync, writeFileSync } from 'node:fs';

const ARGS = process.argv.slice(2);
const ALL = ARGS.includes('--all');
const POS = ARGS.filter((a) => !a.startsWith('--'));
const FILE = POS[0] || 'research/atlas.jsonl';
const LIMIT = POS[1] ? Number(POS[1]) : Infinity;

const W3W_KEY = process.env.W3W_API_KEY || 'CSNL2XHT';   // replace or set W3W_API_KEY
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY || '';
const THROTTLE = GOOGLE_KEY ? 120 : 1100;                // Nominatim ~1/sec
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocodeGoogle(q) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': 'places.location,places.formattedAddress' },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  if (!res.ok) { if (res.status === 401 || res.status === 403) process.stderr.write('  (Google key rejected)\n'); return null; }
  const p = (await res.json()).places?.[0];
  return p?.location ? { lat: p.location.latitude, lng: p.location.longitude, address: p.formattedAddress } : null;
}
async function geocodeNominatim(q) {
  const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(q),
    { headers: { 'User-Agent': 'TheGameBureau-places/1.0 (research tool)' } });
  if (!res.ok) return null;
  const a = await res.json();
  return a[0] ? { lat: +a[0].lat, lng: +a[0].lon } : null;
}
const geocode = (q) => (GOOGLE_KEY ? geocodeGoogle(q) : geocodeNominatim(q));

async function geocodePlace(s) {
  const queries = [];
  if (s.name && s.city) queries.push(s.name + ', ' + s.city);
  if (s.address) queries.push(s.address);
  if (s.name && s.city) queries.push(s.name + ' ' + String(s.city).split(',')[0]);
  for (const q of queries) { await sleep(THROTTLE); const ll = await geocode(q); if (ll) return ll; }
  return null;
}

async function toW3W(lat, lng) {
  const r = await fetch('https://api.what3words.com/v3/convert-to-3wa?coordinates=' + lat + ',' + lng + '&key=' + W3W_KEY);
  if (!r.ok) { if (r.status === 401 || r.status === 402) process.stderr.write('  (what3words key rejected)\n'); return null; }
  return (await r.json()).words || null;
}

const recs = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
const flush = () => writeFileSync(FILE, recs.filter(Boolean).map((r) => JSON.stringify(r)).join('\n') + '\n');

process.stderr.write('Resolver: ' + (GOOGLE_KEY ? 'Google Places' : 'Nominatim') + ' → what3words\n');
let set = 0, n = 0;
for (const r of recs) {
  if (!r) continue;
  if (r.type === 'route') continue;                                              // routes carry no geocodable place
  if (n >= LIMIT) break;
  if (!ALL && typeof r.lat === 'number' && typeof r.lng === 'number') continue;  // already placed
  n++;
  const ll = await geocodePlace(r);
  if (!ll) { process.stderr.write(`[${n}] ${r.name} (${r.city}) -> could not geocode\n`); continue; }
  r.lat = ll.lat; r.lng = ll.lng;                    // coords for fast map rendering
  if (ll.address) r.address = ll.address;
  const w = await toW3W(ll.lat, ll.lng);
  if (w) r.w3w = w;                                  // refresh w3w from the same point
  set++;
  process.stderr.write(`[${n}] ${r.name} (${r.city}) -> ${ll.lat.toFixed(5)},${ll.lng.toFixed(5)}${w ? ' ///' + w : ''}\n`);
  if (n % 20 === 0) flush();
}
flush();
console.log(`\nDone: placed ${set} of ${n} places.`);
