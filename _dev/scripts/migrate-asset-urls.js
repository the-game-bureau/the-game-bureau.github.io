// Normalize database asset URLs to https://thegamebureau.com/assets/games/*
// Run with: node migrate-asset-urls.js

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const REPLACEMENTS = [
  ['https://raw.githubusercontent.com/the-game-bureau/the-game-bureau.github.io/main/assets/', 'https://thegamebureau.com/assets/'],
  ['http://raw.githubusercontent.com/the-game-bureau/the-game-bureau.github.io/main/assets/', 'https://thegamebureau.com/assets/'],
  ['https://the-game-bureau.github.io/the-game-bureau/', 'https://thegamebureau.com/'],
  ['https://the-game-bureau.github.io/', 'https://thegamebureau.com/'],
  ['assets/teams/', 'assets/games/'],
  ['assets/vendors/', 'assets/games/'],
];

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?select=*`, {
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
    const original = JSON.stringify(game);
    let replaced = original;
    for (const [old, next] of REPLACEMENTS) replaced = replaced.split(old).join(next);
    if (replaced === original) continue;

    const updatedGame = JSON.parse(replaced);
    const { id, ...fields } = updatedGame;
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${game.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(fields)
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

run();
