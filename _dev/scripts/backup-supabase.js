// Dump every exposed Supabase table to backups/supabase-<table>-YYYY-MM-DD.json.
// Run from the repo root: node _dev/scripts/backup-supabase.js
//
// Prunes backup files older than RETENTION_DAYS. Does NOT commit — that's on you.
//
// For a complete backup (including RLS-restricted tables like admin_users),
// set SUPABASE_SERVICE_KEY in the environment or in .env (which is gitignored).
// Without it, the script falls back to the publishable key and RLS-restricted
// tables will back up as empty arrays.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

// Minimal .env loader (no deps). Only sets vars that aren't already in env.
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(path.join(REPO_ROOT, '.env'));

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_KEY = SERVICE_KEY || PUBLISHABLE_KEY;

const TABLES = [
  'admin_users',
  'builder_documents',
  'game_notes',
  'games',
  'games_bu',
  'photo_submissions',
  'tags',
];

const RETENTION_DAYS = 30;
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

function utcDateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function fetchTable(table) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('response was not a JSON array');
  return data;
}

function pruneOldBackups(today) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const deleted = [];
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const m = name.match(/^supabase-.+-(\d{4}-\d{2}-\d{2})\.json$/);
    if (!m) continue;
    if (new Date(m[1] + 'T00:00:00Z') < cutoff) {
      fs.unlinkSync(path.join(BACKUP_DIR, name));
      deleted.push(name);
    }
  }
  return deleted;
}

async function run() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const today = new Date();
  const dateStr = utcDateStr(today);

  const results = [];
  for (const table of TABLES) {
    try {
      const rows = await fetchTable(table);
      const file = path.join(BACKUP_DIR, `supabase-${table}-${dateStr}.json`);
      const json = JSON.stringify(rows, null, 2);
      fs.writeFileSync(file, json);
      results.push({ table, rows: rows.length, bytes: Buffer.byteLength(json) });
    } catch (err) {
      results.push({ table, error: err.message });
    }
  }

  const deleted = pruneOldBackups(today);

  console.log(`\nBackup summary (${dateStr} UTC, key=${SERVICE_KEY ? 'service_role' : 'publishable (RLS-limited)'}):`);
  for (const r of results) {
    if (r.error) console.log(`  ${r.table.padEnd(20)} FAILED  ${r.error}`);
    else console.log(`  ${r.table.padEnd(20)} ${String(r.rows).padStart(5)} rows   ${String(r.bytes).padStart(8)} bytes`);
  }
  console.log(`\nPruned (>${RETENTION_DAYS}d): ${deleted.length ? deleted.join(', ') : 'none'}`);
  console.log(`\nBackups at: ${BACKUP_DIR}`);
}

run().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
