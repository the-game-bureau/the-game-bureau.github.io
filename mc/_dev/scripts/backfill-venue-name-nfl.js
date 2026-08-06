// Backfill games venue fields (venue_name, venue_city) for EXISTING NFL games in
// Supabase, BY HOME TEAM.
//
// The MLB backfill (backfill-venue-name.js) matches by `id` against a generated
// .jsonl. The NFL takeover rows in the table use a hand-rolled id scheme that
// won't match the NFL generator's ids, so we can't id-match them. Instead we map
// each row's `home_team_mascot` to that team's home stadium and the stadium's
// city (both mirrored from the NFL maker's TEAM_METADATA / VENUE_OVERRIDES).
//
// Caveats (accepted trade-offs):
//   • NOT neutral-site aware — every game is stamped with the HOME team's stadium.
//   • Only touches rows whose id is NOT like 'mlb%', so the Giants / Cardinals
//     mascot overlap with MLB can never misfire onto a baseball row.
//   • Rows whose mascot isn't a known NFL team (junk/test/college rows) are skipped.
//
// Prerequisite: games.venue_name and games.venue_city columns must exist.
//
// Usage:
//   node backfill-venue-name-nfl.js            # fill MISSING fields on non-mlb rows
//   node backfill-venue-name-nfl.js --force    # also overwrite fields that already have a value
//   node backfill-venue-name-nfl.js --dry-run  # report; write nothing

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

// mascot → home stadium (NFL). Mirrors TEAM_METADATA in the NFL maker.
const NFL_VENUE_BY_MASCOT = {
  Cardinals: 'State Farm Stadium', Falcons: 'Mercedes-Benz Stadium', Ravens: 'M&T Bank Stadium',
  Bills: 'Highmark Stadium', Panthers: 'Bank of America Stadium', Bears: 'Soldier Field',
  Bengals: 'Paycor Stadium', Browns: 'Huntington Bank Field', Cowboys: 'AT&T Stadium',
  Broncos: 'Empower Field at Mile High', Lions: 'Ford Field', Packers: 'Lambeau Field',
  Texans: 'NRG Stadium', Colts: 'Lucas Oil Stadium', Jaguars: 'EverBank Stadium',
  Chiefs: 'GEHA Field at Arrowhead Stadium', Raiders: 'Allegiant Stadium', Chargers: 'SoFi Stadium',
  Rams: 'SoFi Stadium', Dolphins: 'Hard Rock Stadium', Vikings: 'U.S. Bank Stadium',
  Patriots: 'Gillette Stadium', Saints: 'Caesars Superdome', Giants: 'MetLife Stadium',
  Jets: 'MetLife Stadium', Eagles: 'Lincoln Financial Field', Steelers: 'Acrisure Stadium',
  '49ers': "Levi's Stadium", Seahawks: 'Lumen Field', Buccaneers: 'Raymond James Stadium',
  Titans: 'Nissan Stadium', Commanders: 'Northwest Stadium',
};

// stadium → city. Mirrors VENUE_OVERRIDES in the NFL maker.
const STADIUM_CITY = {
  'State Farm Stadium': 'Glendale', 'Mercedes-Benz Stadium': 'Atlanta', 'M&T Bank Stadium': 'Baltimore',
  'Highmark Stadium': 'Orchard Park', 'Bank of America Stadium': 'Charlotte', 'Soldier Field': 'Chicago',
  'Paycor Stadium': 'Cincinnati', 'Huntington Bank Field': 'Cleveland', 'AT&T Stadium': 'Arlington',
  'Empower Field at Mile High': 'Denver', 'Ford Field': 'Detroit', 'Lambeau Field': 'Green Bay',
  'NRG Stadium': 'Houston', 'Lucas Oil Stadium': 'Indianapolis', 'EverBank Stadium': 'Jacksonville',
  'GEHA Field at Arrowhead Stadium': 'Kansas City', 'Allegiant Stadium': 'Las Vegas', 'SoFi Stadium': 'Inglewood',
  'Hard Rock Stadium': 'Miami Gardens', 'U.S. Bank Stadium': 'Minneapolis', 'Gillette Stadium': 'Foxborough',
  'Caesars Superdome': 'New Orleans', 'MetLife Stadium': 'East Rutherford', 'Lincoln Financial Field': 'Philadelphia',
  'Acrisure Stadium': 'Pittsburgh', "Levi's Stadium": 'Santa Clara', 'Lumen Field': 'Seattle',
  'Raymond James Stadium': 'Tampa', 'Nissan Stadium': 'Nashville', 'Northwest Stadium': 'Landover',
};

const VENUE_FIELDS = ['venue_name', 'venue_city'];

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');

async function fetchTargets() {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/games?select=id,${VENUE_FIELDS.join(',')},home_team_mascot&id=not.like.mlb*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      if (/column|does not exist|schema cache/i.test(text)) {
        console.error('\nThe games table is missing a venue column. Add them in Supabase, then retry:');
        console.error('  alter table games add column venue_name text;');
        console.error('  alter table games add column venue_city text;');
        process.exit(1);
      }
      console.error('Fetch failed:', res.status, text);
      process.exit(1);
    }
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function patchFields(ids, patch) {
  const list = ids.map(encodeURIComponent).join(',');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?id=in.(${list})`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    console.error(`\nPATCH failed for ${JSON.stringify(patch)}:`, res.status, await res.text());
    process.exit(1);
  }
}

async function main() {
  const rows = await fetchTargets();
  console.log(`Fetched ${rows.length} non-MLB game(s).`);

  const updates = new Map(); // JSON(patch) -> { patch, ids:[] }
  let noMascotMatch = 0, nothingToDo = 0;
  const unmatched = new Map();
  for (const g of rows) {
    const mascot = String(g.home_team_mascot || '').trim();
    const venueName = NFL_VENUE_BY_MASCOT[mascot];
    if (!venueName) {
      noMascotMatch++;
      unmatched.set(mascot || '∅', (unmatched.get(mascot || '∅') || 0) + 1);
      continue;
    }
    const want = { venue_name: venueName, venue_city: STADIUM_CITY[venueName] || '' };
    const patch = {};
    for (const [f, v] of Object.entries(want)) {
      if (!v) continue;
      const current = String(g[f] || '').trim();
      if ((!current || force) && current !== v) patch[f] = v;
    }
    if (!Object.keys(patch).length) { nothingToDo++; continue; }
    const key = JSON.stringify(patch);
    if (!updates.has(key)) updates.set(key, { patch, ids: [] });
    updates.get(key).ids.push(g.id);
  }

  const totalToPatch = [...updates.values()].reduce((n, x) => n + x.ids.length, 0);
  console.log(`Matched NFL mascot & already complete: ${nothingToDo}  |  no NFL mascot match (skipped): ${noMascotMatch}`);
  console.log(`Rows to update: ${totalToPatch} across ${updates.size} distinct patch(es).`);

  if (unmatched.size) {
    const top = [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log('Skipped (no NFL mascot match) — top home_team_mascot values:');
    for (const [m, c] of top) console.log(`  ${m} × ${c}`);
  }

  if (totalToPatch === 0) { console.log('Nothing to update.'); return; }

  if (dryRun) {
    for (const { patch, ids } of updates.values()) console.log(`  [dry] ${JSON.stringify(patch)} → ${ids.length} game(s)`);
    console.log('Dry run — no writes performed.');
    return;
  }

  let patched = 0;
  for (const { patch, ids } of updates.values()) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await patchFields(chunk, patch);
      patched += chunk.length;
      process.stdout.write(`\rPatched ${patched}/${totalToPatch}…`);
    }
  }
  process.stdout.write('\n');
  console.log('Done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
