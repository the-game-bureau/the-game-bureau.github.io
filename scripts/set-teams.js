// Set teams for a game by ID
// Usage: node set-teams.js <gameId> "Team 1" "Team 2" ... (up to 8)
// Example: node set-teams.js smissno "Golden Eagle Mafia" "Hattiesburg Hitmen"

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

const [,, gameId, ...teams] = process.argv;

if (!gameId || teams.length === 0) {
  console.error('Usage: node set-teams.js <gameId> "Team 1" "Team 2" ...');
  process.exit(1);
}

if (teams.length > 8) {
  console.error('Max 8 teams.');
  process.exit(1);
}

// Pad to 8 slots
const paddedTeams = Array.from({ length: 8 }, (_, i) => teams[i] || '');

async function run() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${gameId}&select=id,nodes`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const [game] = await res.json();
  if (!game) { console.error(`Game "${gameId}" not found.`); process.exit(1); }

  const teamKeys = {};
  paddedTeams.forEach((name, i) => { teamKeys[`team${String(i + 1).padStart(2, '0')}`] = name; });

  const nodes = (game.nodes || []).map(n =>
    n?.type === 'game' ? { ...n, teams: paddedTeams, ...teamKeys } : n
  );

  const patch = await fetch(`${SUPABASE_URL}/rest/v1/games?id=eq.${gameId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({ nodes })
  });

  if (!patch.ok) { console.error('Failed:', patch.status, await patch.text()); process.exit(1); }

  console.log(`✓ Teams saved for "${gameId}":`);
  paddedTeams.filter(Boolean).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
}

run();
