// tampa-seed-shape.js -- proves five-tampa-waypoints.sql before anybody pastes
// it: the rows have the library's own shape, every source article resolves,
// every point is in Tampa AND within 150 m of what Nominatim returns for the
// street line (the "read the coordinate back against the city" lesson), and
// nothing in it is already on file.
//
//   node mc/_dev/browser-checks/tampa-seed-shape.js
//
// It talks to Wikipedia and Nominatim for real, one request at a time and
// slowly, because both are free services and this project has been blocked
// from one of them once. A run that cannot reach either SKIPS that half and
// says so rather than reporting a pass it did not earn.

const fs = require('fs');
const path = require('path');
const https = require('https');

const SEED = path.join(__dirname, '..', '..', 'supabase', 'seeds', 'five-tampa-waypoints.sql');
const API = 'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1';
const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const UA = 'TheGameBureau waypoint check (adminhelp@thegamebureau.com)';

let okCount = 0, failCount = 0;
function is(label, pass, got) {
  if (pass) { okCount++; console.log('  ok   ' + label); }
  else { failCount++; console.log('  FAIL ' + label + (got === undefined ? '' : '   got: ' + JSON.stringify(got))); }
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ---- the same hand walker nfl-seed-shape.js uses: no regex over SQL --------
function parseValues(sql) {
  const start = sql.indexOf('values');
  const body = sql.slice(start + 'values'.length);
  const rows = [];
  let i = 0;
  function skipWs() { while (i < body.length && ' \t\r\n'.indexOf(body[i]) >= 0) i++; }
  function readString() {
    i++;
    let out = '';
    while (i < body.length) {
      if (body[i] === "'") {
        if (body[i + 1] === "'") { out += "'"; i += 2; continue; }
        i++; return out;
      }
      out += body[i++];
    }
    throw new Error('unterminated string');
  }
  function readValue() {
    skipWs();
    if (body[i] === "'") return readString();
    if (body.startsWith('null', i)) { i += 4; return null; }
    let j = i;
    while (j < body.length && '-0123456789.'.indexOf(body[j]) >= 0) j++;
    if (j > i) { const n = Number(body.slice(i, j)); i = j; return n; }
    throw new Error('unexpected at ' + i + ': ' + body.slice(i, i + 20));
  }
  for (;;) {
    skipWs();
    if (body[i] !== '(') break;
    i++;
    const v = [];
    for (;;) {
      v.push(readValue());
      skipWs();
      if (body[i] === ',') { i++; continue; }
      if (body[i] === ')') { i++; break; }
      throw new Error('bad tuple at ' + i);
    }
    rows.push({ name: v[0], description: v[1], address: v[2], city: v[3], state: v[4], zip: v[5], country: v[6], lat: v[7], lon: v[8], source_url: v[9] });
    skipWs();
    if (body[i] === ',') { i++; continue; }
    break;
  }
  return rows;
}

function fetchText(url, method) {
  return new Promise(function (resolve) {
    // The Supabase headers go to Supabase and nowhere else: Wikipedia answers
    // 400 to a bearer token it did not issue, which reads as a dead article.
    const headers = { 'User-Agent': UA };
    if (url.indexOf(API) === 0) { headers.apikey = KEY; headers.Authorization = 'Bearer ' + KEY; }
    const req = https.request(url, { method: method || 'GET', headers: headers }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () { resolve({ status: res.statusCode, body: buf }); });
    });
    req.on('error', function (e) { resolve({ status: 0, body: String(e) }); });
    req.end();
  });
}

function metres(aLat, aLon, bLat, bLon) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLon = (bLon - aLon) * toRad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

(async function main() {
  const sql = fs.readFileSync(SEED, 'utf8');
  const rows = parseValues(sql);
  console.log('seed rows parsed: ' + rows.length);
  is('five rows', rows.length === 5, rows.length);
  is('no em dash anywhere in the file', sql.indexOf(String.fromCharCode(8212)) < 0);
  is('no control bytes in the file', !sql.split('').some(function (c) {
    const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 && n !== 13;
  }));
  // The insert's own column list, never the prose above it: the header says
  // in words that wpid is never sent, and a search over the whole file would
  // match the sentence explaining the rule.
  const colList = sql.slice(sql.indexOf('insert into public.waypoints'), sql.indexOf('values'));
  is('wpid is not in the insert column list', colList.indexOf('wpid') < 0);

  const live = JSON.parse((await fetchText(API + '/waypoints?select=wpid,name,address,city&city=eq.Tampa')).body);
  is('the live table answered for Tampa', Array.isArray(live) && live.length > 0, live && live.length);

  rows.forEach(function (r, n) {
    const tag = '[' + (n + 1) + ' ' + r.name + '] ';
    is(tag + 'has a name', !!r.name && r.name.trim() !== '');
    is(tag + 'has a description, read aloud at the stop', !!r.description && r.description.trim().length > 40);
    is(tag + 'address is a street line, not a postal address', !!r.address && r.address.indexOf(',') < 0 && r.address.toLowerCase().indexOf('tampa') < 0, r.address);
    is(tag + 'city, state and country spelled like every FL row', r.city === 'Tampa' && r.state === 'FL' && r.country === 'USA', [r.city, r.state, r.country]);
    is(tag + 'zip is five digits', typeof r.zip === 'string' && r.zip.length === 5 && !isNaN(Number(r.zip)), r.zip);
    is(tag + 'point is a pair, six decimals, inside Tampa', typeof r.lat === 'number' && typeof r.lon === 'number'
      && r.lat > 27.85 && r.lat < 28.10 && r.lon > -82.55 && r.lon < -82.35, [r.lat, r.lon]);
    is(tag + 'source is a Wikipedia article, not a map', r.source_url.indexOf('https://en.wikipedia.org/wiki/') === 0);
    const dupName = live.find(function (l) { return String(l.name).toLowerCase() === r.name.toLowerCase(); });
    is(tag + 'name is not already on file in Tampa', !dupName, dupName && dupName.wpid);
    const dupAddr = live.find(function (l) { return String(l.address || '').toLowerCase() === r.address.toLowerCase(); });
    is(tag + 'address is not already on file in Tampa', !dupAddr, dupAddr && dupAddr.wpid);
  });

  // ---- the slow half: each article resolves, each point sits at its address.
  for (const r of rows) {
    const tag = '[' + r.name + '] ';
    await sleep(6000);
    const w = await fetchText(r.source_url, 'HEAD');
    if (w.status === 429 || w.status === 0) console.log('  SKIP ' + tag + 'Wikipedia did not answer (' + w.status + ')');
    else is(tag + 'the article resolves', w.status === 200, w.status);
    await sleep(1500);
    const q = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(r.address + ', Tampa, FL');
    const g = await fetchText(q);
    let hit = null;
    try { hit = JSON.parse(g.body)[0]; } catch (e) { hit = null; }
    if (g.status !== 200 || !hit) { console.log('  SKIP ' + tag + 'Nominatim did not answer (' + g.status + ')'); continue; }
    const d = metres(r.lat, r.lon, Number(hit.lat), Number(hit.lon));
    is(tag + 'point is within 150 m of the street line', d < 150, Math.round(d) + ' m');
  }

  console.log('');
  console.log(okCount + ' ok, ' + failCount + ' FAIL');
  if (okCount === 0) { console.log('ZERO ASSERTIONS IS NOT SUCCESS'); process.exit(2); }
  process.exit(failCount ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
