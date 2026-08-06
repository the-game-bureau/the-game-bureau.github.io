// Resumable lat/lon (+ ZIP) backfill via the Google Geocoding API — no rate
// limits like Nominatim. Processes only waypoints where lat IS NULL, fills zip
// when blank, writes incrementally (every 50). Re-run any time to continue.

const SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const PUB = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const PROJECT = 'qmaafbncpzrdmqapkkgr';
const TOKEN = process.env.SB_TOKEN;
const GKEY = 'AIzaSyB93DZq4cYKLms-Q6quJuENf0O2fz-LF1I';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (v) => String(v == null ? '' : v).trim();
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function parseLatLon(text) {
  const m = clean(text).match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon, zip: '' };
}

async function geocode(q) {
  const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(q) + '&key=' + GKEY;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status === 'OVER_QUERY_LIMIT' || j.status === 'REQUEST_DENIED') { console.log('  Google: ' + j.status + ' ' + (j.error_message || '')); return { fatal: j.status }; }
    if (j.status !== 'OK' || !j.results || !j.results[0]) return null;
    const r = j.results[0];
    const z = (r.address_components || []).find((c) => c.types.includes('postal_code'));
    return { lat: r.geometry.location.lat, lon: r.geometry.location.lng, zip: z ? z.long_name : '' };
  } catch { return null; }
}

async function flush(buf) {
  if (!buf.length) return;
  const res = await fetch('https://api.supabase.com/v1/projects/' + PROJECT + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buf.join('\n') })
  });
  if (!res.ok) console.log('  WRITE ERROR ' + res.status + ': ' + (await res.text()));
  buf.length = 0;
}

async function main() {
  if (!TOKEN) { console.error('No SB_TOKEN'); process.exit(1); }
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(SB_URL + '/rest/v1/waypoints?select=wpid,name,city,state,zip,address&lat=is.null&order=wpid.asc',
      { headers: { apikey: PUB, Authorization: 'Bearer ' + PUB, Range: from + '-' + (from + 999) } });
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  console.log('Missing coords: ' + rows.length);

  const buf = [];
  let local = 0, geo = 0, miss = 0, zipset = 0, done = 0;
  for (const w of rows) {
    let pt = parseLatLon(w.address);
    if (pt) local++;
    else {
      const q = [clean(w.address) || clean(w.name), clean(w.city), clean(w.state)].filter(Boolean).join(', ');
      pt = q ? await geocode(q) : null;
      if (pt && pt.fatal) { await flush(buf); console.log('Stopping: ' + pt.fatal); return; }
      if (pt) geo++;
      await sleep(110);
    }
    done++;
    if (!pt) { miss++; if (miss <= 30) console.log('  miss #' + w.wpid + ' ' + (w.name || '')); continue; }
    const sets = ['lat=' + round6(pt.lat), 'lon=' + round6(pt.lon)];
    if (!clean(w.zip) && pt.zip) { sets.push('zip=' + sq(pt.zip)); zipset++; }
    buf.push('update public.waypoints set ' + sets.join(', ') + ' where wpid=' + Number(w.wpid) + ';');
    if (buf.length >= 50) { await flush(buf); console.log('  ...' + done + '/' + rows.length + ' (' + (local + geo) + ' located, ' + zipset + ' zips, ' + miss + ' missed)'); }
  }
  await flush(buf);
  console.log('\nDone. local ' + local + ', geocoded ' + geo + ', zips added ' + zipset + ', missed ' + miss + ', of ' + rows.length + '.');
}
main();
