// One-time migration: rewrite stored asset URLs to use the new /site/assets/
// prefix. Repo structure: index.html + mc/ + game/ at root; everything else
// (account, library, gift, howitworks, assets/, microsites) lives under site/.
//
// Run with: node _dev/scripts/migrate-assets-to-site-prefix.js
//   --dry-run    Print proposed changes without writing.
//
// Pattern rewritten (idempotent — re-running is a no-op):
//   /assets/...                              -> /site/assets/...
//   https://thegamebureau.com/assets/...     -> https://thegamebureau.com/site/assets/...
//
// The negative lookbehind `(?<!site\/)` skips any "/assets/" already preceded
// by "/site/", so re-running is safe.

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const DRY_RUN = process.argv.includes('--dry-run');

const ASSETS_RE = /(?<!site\/)\/assets\//g;

function rewriteValue(value) {
  if (typeof value !== 'string' || !value) return value;
  return value.replace(ASSETS_RE, '/site/assets/');
}

function rewriteGame(game) {
  const patch = {};
  for (const [key, val] of Object.entries(game)) {
    if (typeof val !== 'string') continue;
    const next = rewriteValue(val);
    if (next !== val) patch[key] = next;
  }
  return patch;
}

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error('Fetch failed:', res.status, await res.text());
    process.exit(1);
  }

  const games = await res.json();
  console.log(`Fetched ${games.length} games${DRY_RUN ? ' (dry run)' : ''}`);

  let updated = 0;
  let skipped = 0;

  for (const game of games) {
    const patch = rewriteGame(game);
    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }

    console.log(`Game ${game.id}:`);
    for (const [field, value] of Object.entries(patch)) {
      console.log(`  ${field}: ${game[field]}  ->  ${value}`);
    }

    if (DRY_RUN) {
      updated++;
      continue;
    }

    const result = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${encodeURIComponent(game.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    });

    if (result.ok) {
      updated++;
    } else {
      console.error(`  FAILED: ${result.status} ${await result.text()}`);
    }
  }

  console.log(`Done. ${DRY_RUN ? 'Would update' : 'Updated'} ${updated} games. Skipped ${skipped}.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
