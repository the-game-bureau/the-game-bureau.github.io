// Backfill games venue fields (venue_name, venue_city) on EXISTING Supabase rows
// from a generated .jsonl, matched by `id`.
//
// Why this exists: the /mc/mlb.html importer POSTs with
// `resolution=ignore-duplicates`, so re-importing skips games already in the
// table and never backfills new columns. This fills them in, matching each DB
// row to a generated record by `id` (so neutral-site games keep the venue/city
// the generator already resolved — no hardcoded maps).
//
// Prerequisite: the games table must have the columns:
//   alter table games add column venue_name text;
//   alter table games add column venue_city text;
//
// Usage:
//   node backfill-venue-name.js                    # fill MISSING fields, from mc/data/mlb.jsonl
//   node backfill-venue-name.js path/to/file.jsonl # use a different generated file
//   node backfill-venue-name.js --force            # also overwrite fields that already have a value
//   node backfill-venue-name.js --dry-run          # report what would change; write nothing
//
// The source file must be regenerated with the updated maker first, so its
// records carry venue_name / venue_city.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const VENUE_FIELDS = ['venue_name', 'venue_city'];

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const fileArg = args.find((a) => !a.startsWith('--'));
const jsonlPath = fileArg
  ? path.resolve(process.cwd(), fileArg)
  : path.resolve(__dirname, '../../mc/data/mlb.jsonl');

function parseJsonl(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip unparseable line */ }
  }
  return out;
}

async function fetchAllGames() {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/games?select=id,${VENUE_FIELDS.join(',')}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) {
      const text = await res.text();
      const missing = VENUE_FIELDS.find((f) => text.includes(f)) || 'venue_*';
      if (/column|does not exist|schema cache/i.test(text)) {
        console.error(`\nThe games table is missing a column (${missing}). Add them in Supabase, then retry:`);
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
  if (!fs.existsSync(jsonlPath)) {
    console.error(`Source file not found: ${jsonlPath}`);
    process.exit(1);
  }

  const records = parseJsonl(fs.readFileSync(jsonlPath, 'utf8'));
  const wantById = new Map(); // id -> { venue_name, venue_city } (only fields with values)
  for (const r of records) {
    const id = String(r.id || '').trim();
    if (!id) continue;
    const want = {};
    for (const f of VENUE_FIELDS) {
      const v = String(r[f] || '').trim();
      if (v) want[f] = v;
    }
    if (Object.keys(want).length) wantById.set(id, want);
  }
  console.log(`Loaded ${wantById.size} record(s) with venue fields from ${path.relative(process.cwd(), jsonlPath)}.`);
  if (wantById.size === 0) {
    console.error('No venue fields in that file. Regenerate it with the updated maker, then retry.');
    process.exit(1);
  }

  const existing = await fetchAllGames();
  const existingById = new Map(existing.map((g) => [String(g.id), g]));

  // Group ids by the exact patch object they need (so we PATCH once per distinct patch).
  const updates = new Map(); // JSON(patch) -> { patch, ids:[] }
  let inBoth = 0, notInDb = 0, nothingToDo = 0;
  for (const [id, want] of wantById) {
    const row = existingById.get(id);
    if (!row) { notInDb++; continue; }
    inBoth++;
    const patch = {};
    for (const [f, v] of Object.entries(want)) {
      const current = String(row[f] || '').trim();
      if ((!current || force) && current !== v) patch[f] = v;
    }
    if (!Object.keys(patch).length) { nothingToDo++; continue; }
    const key = JSON.stringify(patch);
    if (!updates.has(key)) updates.set(key, { patch, ids: [] });
    updates.get(key).ids.push(id);
  }

  const totalToPatch = [...updates.values()].reduce((n, g) => n + g.ids.length, 0);
  console.log(`In DB & file: ${inBoth}  |  already complete: ${nothingToDo}  |  in file but not in DB: ${notInDb}`);
  console.log(`Rows to update: ${totalToPatch} across ${updates.size} distinct patch(es).`);
  if (totalToPatch === 0) { console.log('Nothing to do.'); return; }

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
