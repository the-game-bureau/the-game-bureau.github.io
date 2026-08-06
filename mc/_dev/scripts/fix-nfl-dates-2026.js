// One-off remediation: fix wrong/null game_date on NFL takeover rows, fix the
// clearly-broken times (null/00:00/23:00/01:24), and delete one true duplicate.
// Dates are computed as the ESPN-kickoff "day before" in Central (matches the
// existing dataset convention). Broken times are set to the ESPN kickoff in ET
// (+2h window). Plausible existing times are left untouched.
const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const espn = JSON.parse(fs.readFileSync(__dirname + '/../../_espn.json', 'utf8')).events || [];

// Confident date fixes only: regular-season New Orleans home games with REAL
// ESPN kickoff times. Flex/TBD (Week 17-18), intl (Melbourne), and college rows
// are intentionally excluded — their real date/time isn't set yet.
const DATE_FIX = new Set([
  'nor2026lvr','nor2026atl','nor2026min','nor2026car1','nor2026gnb','nor2026ari',
]);
// Of those, the ones whose stored time is null/broken (others keep their time).
const TIME_FIX = new Set([
  'nor2026lvr','nor2026atl','nor2026ari',
]);
const DELETE_IDS = ['nor2026car']; // exact dup of nor2026car1 ("...Too")

const emap = {};
for (const e of espn) {
  const c = e.competitions && e.competitions[0]; if (!c) continue;
  const h = c.competitors.find((x) => x.homeAway === 'home');
  const a = c.competitors.find((x) => x.homeAway === 'away');
  if (!h || !a) continue;
  emap[`${a.team.abbreviation}@${h.team.abbreviation}`] = e.date;
}
function zparts(iso, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; f.formatToParts(new Date(iso)).forEach((p) => { if (p.type !== 'literal') o[p.type] = p.value; });
  return o;
}
const pad = (n) => String(n).padStart(2, '0');
function dayBeforeDate(iso) { // ET calendar day of kickoff, minus 1
  const p = zparts(iso, 'America/New_York');
  const b = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  b.setUTCDate(b.getUTCDate() - 1);
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}`;
}
function etWindow(iso) { // kickoff time in ET, plus a 2h end
  const p = zparts(iso, 'America/New_York');
  const start = +p.hour * 60 + +p.minute;
  const end = (start + 120) % 1440;
  const fmt = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
  return { start: fmt(start), end: fmt(end) };
}
function espnFor(row) {
  const a = (row.away_team_key || '').slice(4), h = (row.home_team_key || '').slice(4);
  return emap[`${a}@${h}`] || emap[`${h}@${a}`] || null;
}
async function api(path, opts) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json', ...(opts && opts.headers) },
  });
}

(async () => {
  const ids = [...new Set([...DATE_FIX, ...TIME_FIX, ...DELETE_IDS])];
  const res = await api(`games?select=id,name,game_date,start_time,end_time,away_team_key,home_team_key&id=in.(${ids.join(',')})`);
  const rows = await res.json();
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  (rows loaded: ${rows.length})\n`);
  let patched = 0, deleted = 0, failed = 0;

  for (const id of ids) {
    if (DELETE_IDS.includes(id)) continue;
    const row = byId[id];
    if (!row) { console.log(`! ${id}: not found, skipping`); continue; }
    const iso = espnFor(row);
    if (!iso) { console.log(`! ${id}: no ESPN match, skipping`); continue; }
    const patch = {};
    if (DATE_FIX.has(id)) { const nd = dayBeforeDate(iso); if (nd !== row.game_date) patch.game_date = nd; }
    if (TIME_FIX.has(id)) { const w = etWindow(iso); patch.start_time = w.start; patch.end_time = w.end; }
    if (!Object.keys(patch).length) { console.log(`= ${id}: already correct`); continue; }
    console.log(`~ ${id}: ${row.game_date}/${row.start_time}-${row.end_time} -> ${patch.game_date || row.game_date}/${patch.start_time || row.start_time}-${patch.end_time || row.end_time}  "${row.name}"`);
    if (APPLY) {
      const r = await api(`games?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      if (r.ok) patched++; else { failed++; console.log(`   FAIL ${r.status}: ${await r.text()}`); }
    }
  }

  for (const id of DELETE_IDS) {
    const row = byId[id];
    console.log(`\nx DELETE ${id}  "${row ? row.name : '(not found)'}"`);
    if (APPLY && row) {
      const r = await api(`games?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      if (r.ok) deleted++; else { failed++; console.log(`   FAIL ${r.status}: ${await r.text()}`); }
    }
  }
  console.log(`\nDone. patched=${patched} deleted=${deleted} failed=${failed}${APPLY ? '' : '  (dry-run, no writes)'}`);
})();
