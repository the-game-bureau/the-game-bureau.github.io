// Archive all games that are not already archived
// Usage: node archive-all-games.js

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

async function archiveAll() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?or=(archived.is.null,archived.neq.YES)&select=id,name`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error('Failed to fetch games:', await res.text());
    process.exit(1);
  }

  const games = await res.json();
  console.log(`Found ${games.length} non-archived game(s).`);

  if (games.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const game of games) {
    console.log(`  Archiving: ${game.id} — ${game.name}`);
  }

  const patch = await fetch(`${SUPABASE_URL}/rest/v1/games?or=(archived.is.null,archived.neq.YES)`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ archived: 'YES' }),
  });

  if (!patch.ok) {
    console.error('PATCH failed:', await patch.text());
    process.exit(1);
  }

  console.log('Done — all games archived.');
}

archiveAll();
