// Dump exposed Supabase relations to backups/supabase-<relation>-YYYY-MM-DD.json.
// Run from the repo root: node _dev/scripts/backup-supabase.js
//
// Prunes backup files older than RETENTION_DAYS. Does not commit anything.
//
// For a complete backup (including RLS-restricted tables like admin_users),
// set SUPABASE_SERVICE_KEY in the environment or in .env (which is gitignored).
// Without it, the script falls back to the publishable key and can only back up
// rows allowed by public RLS policies.

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');

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

const RETENTION_DAYS = Number(process.env.SUPABASE_BACKUP_RETENTION_DAYS || 30);
const PAGE_SIZE = Number(process.env.SUPABASE_BACKUP_PAGE_SIZE || 1000);
const BACKUP_DIR = path.join(REPO_ROOT, 'backups');

const FALLBACK_RELATIONS = [
  'admin_users',
  'anytime_replies',
  'builder_documents',
  'games',
  'game_results',
  'game_nodes',
  'game_node_links',
  'games_bu',
  'games_with_teams',
  'games_with_graph',
  'games_with_graph_and_teams',
  'gift_codes',
  'gift_orders',
  'gift_shop_items',
  'gift_shop_listings',
  'jersey_game',
  'photo_submissions',
  'purchases',
  'tags',
  'teams',
];
const PUBLIC_BROWSER_FALLBACK_RELATIONS = new Set([
  'games',
  'game_results',
  'games_with_teams',
  'games_with_graph',
  'games_with_graph_and_teams',
  'teams',
]);

function utcDateStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function relationFileName(name, dateStr) {
  return `supabase-${name.replace(/[^a-z0-9_-]+/gi, '_')}-${dateStr}.json`;
}

function latestRelationFileName(name) {
  return `supabase-${name.replace(/[^a-z0-9_-]+/gi, '_')}-latest.json`;
}

function restUrl(relation) {
  const base = SUPABASE_URL.replace(/\/+$/, '');
  return new URL(`rest/v1/${encodeURIComponent(relation)}`, `${base}/`);
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    Accept: 'application/json',
    ...extra,
  };
}

async function discoverRelations() {
  if (!SERVICE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY is not set; using fallback relation list');
  }

  const url = restUrl('');
  const res = await fetch(url, {
    headers: headers({ Accept: 'application/openapi+json' }),
  });
  if (!res.ok) throw new Error(`OpenAPI discovery HTTP ${res.status} ${await res.text()}`);

  const spec = await res.json();
  const names = new Set();
  for (const route of Object.keys(spec.paths || {})) {
    const m = route.match(/^\/([^/{]+)$/);
    if (!m) continue;
    const methods = spec.paths[route] || {};
    if (methods.get) names.add(decodeURIComponent(m[1]));
  }

  if (!names.size) throw new Error('OpenAPI discovery returned no GET relations');
  return [...names].sort((a, b) => a.localeCompare(b));
}

function parseTotalFromContentRange(value) {
  if (!value) return null;
  const m = value.match(/\/(\d+|\*)$/);
  if (!m || m[1] === '*') return null;
  return Number(m[1]);
}

async function fetchRelation(relation) {
  const rows = [];
  let offset = 0;
  let total = null;

  while (true) {
    const url = restUrl(relation);
    url.searchParams.set('select', '*');

    const end = offset + PAGE_SIZE - 1;
    const res = await fetch(url, {
      headers: headers({
        Prefer: 'count=exact',
        Range: `${offset}-${end}`,
        'Range-Unit': 'items',
      }),
    });

    if (res.status === 416) break;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('response was not a JSON array');

    rows.push(...data);
    total = parseTotalFromContentRange(res.headers.get('content-range')) ?? total;

    if (data.length < PAGE_SIZE) break;
    if (total !== null && rows.length >= total) break;
    offset += PAGE_SIZE;
  }

  return { rows, total };
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

async function getRelations() {
  try {
    const relations = await discoverRelations();
    return { relations, source: 'openapi', discoveryError: '' };
  } catch (err) {
    return {
      relations: FALLBACK_RELATIONS,
      source: 'fallback',
      discoveryError: err.message,
    };
  }
}

async function run() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const today = new Date();
  const dateStr = utcDateStr(today);
  const { relations, source, discoveryError } = await getRelations();

  const results = [];
  for (const relation of relations) {
    try {
      const { rows, total } = await fetchRelation(relation);
      const file = path.join(BACKUP_DIR, relationFileName(relation, dateStr));
      const json = JSON.stringify(rows, null, 2);
      fs.writeFileSync(file, json);
      let latestFile = '';
      if (PUBLIC_BROWSER_FALLBACK_RELATIONS.has(relation)) {
        latestFile = path.join(BACKUP_DIR, latestRelationFileName(relation));
        fs.writeFileSync(latestFile, json);
      }
      results.push({
        relation,
        rows: rows.length,
        total,
        bytes: Buffer.byteLength(json),
        file: path.basename(file),
        latest_file: latestFile ? path.basename(latestFile) : '',
      });
    } catch (err) {
      results.push({ relation, error: err.message });
    }
  }

  const deleted = pruneOldBackups(today);
  const failed = results.filter((r) => r.error);
  const manifest = {
    generated_at: today.toISOString(),
    supabase_url: SUPABASE_URL,
    backup_dir: BACKUP_DIR,
    key_type: SERVICE_KEY ? 'service_role' : 'publishable',
    relation_source: source,
    discovery_error: discoveryError,
    relation_count: relations.length,
    page_size: PAGE_SIZE,
    retention_days: RETENTION_DAYS,
    results,
    pruned: deleted,
  };

  const manifestFile = path.join(BACKUP_DIR, relationFileName('backup_manifest', dateStr));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  console.log(`\nBackup summary (${dateStr} UTC, key=${manifest.key_type}${SERVICE_KEY ? '' : ' / RLS-limited'}):`);
  if (discoveryError) console.log(`  relation list: ${source} (${discoveryError})`);
  else console.log(`  relation list: ${source}`);

  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.relation.padEnd(28)} FAILED  ${r.error}`);
    } else {
      const totalText = r.total === null || r.total === r.rows ? '' : `/${r.total}`;
      console.log(
        `  ${r.relation.padEnd(28)} ${String(r.rows).padStart(6)}${totalText} rows   ${String(r.bytes).padStart(10)} bytes`
      );
    }
  }

  console.log(`\nManifest: ${manifestFile}`);
  console.log(`Pruned (>${RETENTION_DAYS}d): ${deleted.length ? deleted.join(', ') : 'none'}`);
  console.log(`Backups at: ${BACKUP_DIR}`);

  if (failed.length) {
    console.log(`\nCompleted with ${failed.length} failed relation(s). See manifest for details.`);
  }
}

run().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
