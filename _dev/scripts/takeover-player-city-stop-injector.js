#!/usr/bin/env node
// Reads a curated player-city connection list (CSV) and appends a multiple-
// choice game stop to every matching Takeover game in Supabase. The MC stop
// asks "Which of these players was born/raised in {opponent city}?" with
// A/B/C options listed inline in the question text. The reply node accepts
// A, B, C, or the full player name.
//
// Schema notes:
//   The flow is appended AFTER the existing closing bubble (gd-03):
//     gd-03 -> st-02 -> gd-04 (question) -> pl-02 (reply) -> gd-05 (response)
//   Existing nodes/links are preserved; the new chain hangs off the end.
//
// Usage:
//   node _dev/scripts/takeover-player-city-stop-injector.js
//   node _dev/scripts/takeover-player-city-stop-injector.js --dry-run
//   node _dev/scripts/takeover-player-city-stop-injector.js --only=<game-id>

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const USER_AGENT = 'TGB Player City Stop Injector/1.0';
const CSV_PATH = path.resolve(__dirname, 'takeover-player-city-connections.csv');

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_ARG = process.argv.find((arg) => arg.startsWith('--only='));
const ONLY_ID = ONLY_ARG ? ONLY_ARG.slice('--only='.length) : null;

const SHORT_LABEL = {
  ARI: 'Arizona', ATL: 'Atlanta', BAL: 'Baltimore', BUF: 'Buffalo',
  CAR: 'Carolina', CHI: 'Chicago', CIN: 'Cincinnati', CLE: 'Cleveland',
  DAL: 'Dallas', DEN: 'Denver', DET: 'Detroit', GB: 'Green Bay',
  HOU: 'Houston', IND: 'Indianapolis', JAX: 'Jacksonville', KC: 'Kansas City',
  LV: 'Las Vegas', LAC: 'Los Angeles', LAR: 'Los Angeles', MIA: 'Miami',
  MIN: 'Minnesota', NE: 'New England', NO: 'New Orleans', NYG: 'New York',
  NYJ: 'New York', PHI: 'Philadelphia', PIT: 'Pittsburgh', SF: 'San Francisco',
  SEA: 'Seattle', TB: 'Tampa Bay', TEN: 'Tennessee', WSH: 'Washington',
};

async function main() {
  console.log(`Takeover player-city stop injector${DRY_RUN ? ' [dry-run]' : ''}`);

  const connections = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  if (!connections.length) {
    console.error(`No usable rows in ${CSV_PATH}`);
    process.exit(1);
  }
  console.log(`Loaded ${connections.length} player-city connection(s)`);

  const byPair = new Map();
  for (const row of connections) {
    const a = String(row.team_a || '').toUpperCase().trim();
    const b = String(row.team_b || '').toUpperCase().trim();
    if (!a || !b || a === b) continue;
    const key = [a, b].sort().join('|');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(row);
  }

  const games = await fetchTakeoverGames();
  console.log(`Found ${games.length} Takeover game(s)`);

  let processed = 0, skipped = 0, errors = 0;

  for (const game of games) {
    if (ONLY_ID && game.id !== ONLY_ID) continue;
    try {
      const teams = parseTeamsFromId(game.id);
      if (!teams) { skipped++; continue; }
      const key = [teams.awayCode, teams.homeCode].sort().join('|');
      const candidates = byPair.get(key) || [];
      if (!candidates.length) { skipped++; continue; }

      const connection = pickConnection(candidates, teams);
      if (!connection) { skipped++; continue; }

      const updated = appendMcStop(game, teams, connection);
      if (!updated) { skipped++; continue; }

      if (DRY_RUN) {
        console.log(`  dry: ${game.name} <- ${connection.player}`);
      } else {
        await patchGame(game.id, { nodes: updated.nodes, links: updated.links });
        console.log(`  ok:  ${game.name} <- ${connection.player}`);
      }
      processed++;
    } catch (error) {
      console.error(`  err: ${game.id} -- ${error.message}`);
      errors++;
    }
  }

  console.log(`Processed: ${processed}  Skipped: ${skipped}  Errors: ${errors}`);
}

function parseTeamsFromId(id) {
  const match = String(id || '').match(/^nfl\d{4}-\d{8}-([a-z]+)-([a-z]+)-([a-z]+)-/);
  if (!match) return null;
  const norm = (code) => (code.toUpperCase() === 'WAS' ? 'WSH' : code.toUpperCase());
  return {
    awayCode: norm(match[1]),
    homeCode: norm(match[2]),
    fanCode: norm(match[3]),
  };
}

function pickConnection(candidates, teams) {
  // Prefer a row that's relevant to both teams in the game; any matching row works.
  for (const row of candidates) {
    if (!row.player) continue;
    return row;
  }
  return null;
}

function appendMcStop(game, teams, connection) {
  const nodes = Array.isArray(game.nodes) ? game.nodes.map(cloneNode) : [];
  const links = Array.isArray(game.links) ? game.links.map((link) => ({ ...link })) : [];
  if (!nodes.length) return null;

  // Determine fan/opponent for prompt substitution.
  const fanCode = teams.fanCode;
  const opponentCode = fanCode === teams.awayCode ? teams.homeCode : teams.awayCode;
  const fanShort = SHORT_LABEL[fanCode] || fanCode;
  const oppShort = SHORT_LABEL[opponentCode] || opponentCode;

  // The connection points one of the teams as the player's hometown and the other
  // as the team the player plays for. The trivia angle ("born in opponent city")
  // works in either direction; we just need to know which city is being asked.
  // hometown_team = the team WHOSE CITY the player is from.
  const hometownCode = String(connection.hometown_team || '').toUpperCase().trim();
  const playerTeamCode = String(connection.player_team || '').toUpperCase().trim();
  const player = String(connection.player || '').trim();
  if (!player) return null;

  const askingCity = SHORT_LABEL[hometownCode] || hometownCode || oppShort;

  const wrong1 = String(connection.wrong_answer_1 || '').trim();
  const wrong2 = String(connection.wrong_answer_2 || '').trim();
  const choices = [player, wrong1, wrong2].filter(Boolean);
  if (choices.length < 2) return null;
  // Shuffle deterministically by hashing the game id so order is stable across runs.
  const shuffledChoices = stableShuffle(choices, game.id);
  const correctIndex = shuffledChoices.indexOf(player);
  const correctLetter = String.fromCharCode(65 + correctIndex); // A/B/C

  // Question prompt with inline choices: A) X, B) Y, C) Z
  const promptTemplate = String(connection.prompt || '').trim()
    || `Which of these players is from ${askingCity}?`;
  const questionBody = `${promptTemplate.replace(/%fan%/g, fanShort).replace(/%opp%/g, oppShort)}\n`
    + shuffledChoices.map((name, i) => `${String.fromCharCode(65 + i)}) ${name}`).join('\n');

  // Build accepted answers: letter, letter+paren, full name (case-insensitive matched
  // downstream via the player UI, which lowercases input). We list a few common forms.
  const answers = [];
  shuffledChoices.forEach((name, i) => {
    const letter = String.fromCharCode(65 + i);
    answers.push(letter, name);
  });

  // answerResponses parallel to answers; correct + wrong messages
  const responses = answers.map((ans) => {
    const idx = ans.length === 1
      ? ans.charCodeAt(0) - 65
      : shuffledChoices.findIndex((n) => n.toLowerCase() === ans.toLowerCase());
    if (idx === correctIndex) {
      const playerTeamShort = SHORT_LABEL[playerTeamCode] || playerTeamCode || '';
      return playerTeamShort
        ? `Right! ${player} (${playerTeamShort}) is from ${askingCity}.`
        : `Right! ${player} is from ${askingCity}.`;
    }
    return `Not quite — the answer is ${player}.`;
  });

  // Position the new chain below the existing nodes.
  const maxY = nodes.reduce((m, n) => Math.max(m, Number(n.y || 0) + Number(n.height || 0)), 0);
  const baseY = maxY + 80;

  const stopNode = buildStopNode('st-02', 'BORN HERE?', 24, baseY, 700);
  const questionBubble = buildBubble('gd-04', questionBody, 24, baseY + 60, 800);
  const replyNode = buildReply('pl-02', answers, responses, 'player_city_answer', 288, baseY + 170, 900);
  const responseBubble = buildBubble('gd-05', `Next up, ${fanShort} fans...`, 24, baseY + 280, 1000);

  nodes.push(stopNode, questionBubble, replyNode, responseBubble);

  // Wire into existing chain: existing flow ends at gd-03. New chain hangs off it.
  // Last existing link in the matchup-maker is pl-01 -> gd-03; we link gd-03 -> st-02.
  links.push(
    { id: `${game.id}-link-5`, from: 'gd-03', to: 'st-02', fromPort: 'out-right' },
    { id: `${game.id}-link-6`, from: 'st-02', to: 'gd-04', fromPort: 'out-right' },
    { id: `${game.id}-link-7`, from: 'gd-04', to: 'pl-02', fromPort: 'out-right' },
    { id: `${game.id}-link-8`, from: 'pl-02', to: 'gd-05', fromPort: 'out-right' },
  );

  // Drop any duplicates if the script has been run before (idempotent).
  const seen = new Set();
  const dedupedNodes = nodes.filter((n) => {
    if (!n.id) return true;
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
  const linkSeen = new Set();
  const dedupedLinks = links.filter((l) => {
    const key = `${l.from}->${l.to}`;
    if (linkSeen.has(key)) return false;
    linkSeen.add(key);
    return true;
  });

  return { nodes: dedupedNodes, links: dedupedLinks };
}

function cloneNode(node) {
  return JSON.parse(JSON.stringify(node));
}

function buildStopNode(id, title, x, y, orderIndex) {
  return {
    x, y, id, body: '', city: '', kind: '', tags: [], type: 'stop',
    price: '', teams: Array(8).fill(''), title, width: 236, height: 90,
    team01: '', team02: '', team03: '', team04: '', team05: '', team06: '', team07: '', team08: '',
    anytime: false, endTime: '', linkUrl: '', logoUrl: '', tagline: '', varName: '',
    featured: '', gameDate: '', guideBio: '', rotation: 0, acceptAny: false,
    buttonUrl: '', guideName: '', howToPlay: '', startTime: '', orderIndex,
    builderNotes: '', defaultEmoji: '', anytimePairId: '', guideImageUrl: '',
    locationBased: 'NO', tertiaryColor: '#000000', waypointGroup: '',
    answerResponses: [], quaternaryColor: '#FFFFFF',
    startingLocation: '', startingLocationLat: null, startingLocationLon: null,
  };
}

function buildBubble(id, body, x, y, orderIndex) {
  return {
    x, y, id, body, city: '', kind: 'text', tags: [], type: 'bubble',
    price: '', teams: Array(8).fill(''), title: '', width: 250, height: 92,
    team01: '', team02: '', team03: '', team04: '', team05: '', team06: '', team07: '', team08: '',
    anytime: false, endTime: '', linkUrl: '', logoUrl: '', tagline: '', varName: '',
    featured: '', gameDate: '', guideBio: '', rotation: 0, acceptAny: false,
    buttonUrl: '', guideName: '', howToPlay: '', startTime: '', orderIndex,
    builderNotes: '', defaultEmoji: '', anytimePairId: '', guideImageUrl: '',
    locationBased: 'NO', tertiaryColor: '#000000', waypointGroup: '',
    answerResponses: [], quaternaryColor: '#FFFFFF',
    startingLocation: '', startingLocationLat: null, startingLocationLon: null,
  };
}

function buildReply(id, answers, answerResponses, varName, x, y, orderIndex) {
  return {
    x, y, id, body: answers.join(','), city: '', kind: '', tags: [], type: 'reply',
    price: '', teams: Array(8).fill(''), title: '', width: 230, height: 88,
    team01: '', team02: '', team03: '', team04: '', team05: '', team06: '', team07: '', team08: '',
    anytime: false, endTime: '', linkUrl: '', logoUrl: '', tagline: '', varName,
    featured: '', gameDate: '', guideBio: '', rotation: 0, acceptAny: false,
    buttonUrl: '', guideName: '', howToPlay: '', startTime: '', orderIndex,
    builderNotes: '', defaultEmoji: '', anytimePairId: '', guideImageUrl: '',
    locationBased: 'NO', tertiaryColor: '#000000', waypointGroup: '',
    answerResponses, quaternaryColor: '#FFFFFF',
    startingLocation: '', startingLocationLat: null, startingLocationLon: null,
  };
}

function stableShuffle(arr, seed) {
  // Simple deterministic shuffle using a hash of the seed.
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) | 0;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchTakeoverGames() {
  const url = `${SUPABASE_URL}/rest/v1/games?name=ilike.*Takeover*&id=like.nfl*&select=id,name,nodes,links&order=name.asc`;
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase fetch failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function patchGame(gameId, patch) {
  const url = `${SUPABASE_URL}/rest/v1/games?id=eq.${encodeURIComponent(gameId)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Supabase patch failed: ${response.status} ${await response.text()}`);
  }
}

function parseCsv(text) {
  const rows = [];
  let headers = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cells = splitCsvLine(line);
    if (!headers) {
      headers = cells.map((h) => h.trim());
      continue;
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
