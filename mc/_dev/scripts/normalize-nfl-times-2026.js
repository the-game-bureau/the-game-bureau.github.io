// Normalize NFL takeover start_time/end_time to the real ESPN kickoff in ET,
// with a 2-hour window. Skips flex/TBD games (ESPN midnight placeholder) and
// non-NFL (college) rows. Dates are left untouched. Dry-run unless --apply.
const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260901-20270115&limit=1000';
const APPLY = process.argv.includes('--apply');
const fs = require('fs');

async function api(path, opts) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Accept: 'application/json', ...(opts && opts.headers) },
  });
}
function etParts(iso) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; f.formatToParts(new Date(iso)).forEach((p) => { if (p.type !== 'literal') o[p.type] = p.value; });
  return o;
}
const pad = (n) => String(n).padStart(2, '0');

(async () => {
  // ESPN kickoff map: AWAY@HOME (abbr) -> ISO
  const espn = (await (await fetch(ESPN_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } })).json()).events || [];
  const emap = {};
  for (const e of espn) {
    const c = e.competitions && e.competitions[0]; if (!c) continue;
    const h = c.competitors.find((x) => x.homeAway === 'home');
    const a = c.competitors.find((x) => x.homeAway === 'away');
    if (!h || !a) continue;
    emap[`${a.team.abbreviation}@${h.team.abbreviation}`] = e.date;
  }

  const rows = await (await api('games?select=id,name,game_date,start_time,end_time,away_team_key,home_team_key&category_icon=eq.football')).json();
  // Backup current times.
  fs.writeFileSync(__dirname + '/../backups/nfl-times-prenormalize-backup.json', JSON.stringify(rows, null, 2));

  let changed = 0, tbd = 0, nonNfl = 0, same = 0, failed = 0;
  for (const r of rows) {
    if (!r.away_team_key || !r.away_team_key.startsWith('NFL:')) { nonNfl++; continue; }
    const a = r.away_team_key.slice(4), h = r.home_team_key.slice(4);
    const iso = emap[`${a}@${h}`] || emap[`${h}@${a}`];
    if (!iso) { nonNfl++; continue; }
    const p = etParts(iso);
    if (p.hour === '00' && p.minute === '00') { tbd++; continue; } // flex/TBD — no real time
    const startMin = +p.hour * 60 + +p.minute;
    const endMin = (startMin + 120) % 1440;
    const start = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}:00`;
    const end = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
    if (r.start_time === start && r.end_time === end) { same++; continue; }
    changed++;
    if (changed <= 18 || APPLY) console.log(`~ ${r.id}: ${r.start_time}-${r.end_time} -> ${start}-${end}  (${a}@${h})`);
    if (APPLY) {
      const resp = await api(`games?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ start_time: start, end_time: end }),
      });
      if (!resp.ok) { failed++; console.log(`   FAIL ${resp.status}: ${await resp.text()}`); }
    }
  }
  console.log(`\n${APPLY ? 'APPLIED' : 'DRY-RUN'}: would-change=${changed} already-ET=${same} tbd-skipped=${tbd} non-nfl-skipped=${nonNfl} failed=${failed} (total ${rows.length})`);
})();
