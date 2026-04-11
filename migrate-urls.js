// Fix database URLs: the-game-bureau.io/ → the-game-bureau.github.io/
// Run with: node migrate-urls.js

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const OLD_DOMAIN = 'https://the-game-bureau.io/';
const NEW_DOMAIN = 'https://the-game-bureau.github.io/';

async function fixUrls() {
  // Fetch all games
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?select=id,nodes`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });

  if (!res.ok) {
    console.error('Fetch failed:', res.status, await res.text());
    return;
  }

  const games = await res.json();
  console.log(`Fetched ${games.length} games`);

  let updated = 0;

  for (const game of games) {
    const nodesStr = JSON.stringify(game.nodes);
    if (!nodesStr.includes(OLD_DOMAIN)) continue;

    const fixedStr = nodesStr.split(OLD_DOMAIN).join(NEW_DOMAIN);
    const fixedNodes = JSON.parse(fixedStr);

    const patch = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${game.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ nodes: fixedNodes })
    });

    if (patch.ok) {
      console.log(`Updated game ${game.id}`);
      updated++;
    } else {
      console.error(`Failed game ${game.id}:`, patch.status, await patch.text());
    }
  }

  console.log(`Done. Updated ${updated} games.`);
}

fixUrls();
