// Run: node server.js
// Then open: http://localhost:3000/builder
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execFile } = require('child_process');

function parseEnvValue(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';

  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
    return inner;
  }

  return trimmed.replace(/\s+#.*$/, '').trim();
}

function isPlaceholderApiKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'your_openai_api_key_here';
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) return;

    const key = match[1];
    const value = parseEnvValue(match[2]);
    const existing = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
    if (existing && !isPlaceholderApiKey(existing)) return;
    process.env[key] = value;
  });
}

function loadLocalEnvFiles() {
  const repoRoot = path.join(__dirname, '..', '..', '..');
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '.env.local')
  ];
  const seen = new Set();
  candidates.forEach((filePath) => {
    const normalized = path.normalize(filePath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    loadEnvFile(normalized);
  });
}

loadLocalEnvFiles();

const PORT       = 3000;
const GAMES_FILE  = path.join(__dirname, '..', 'data', 'games_archive.json');
const GAMES_NEW_FILE = path.join(__dirname, '..', 'data', 'games_new.json');
const STOPS_FILE  = path.join(__dirname, '..', 'data', 'stops.json');
const ROUTES_FILE = path.join(__dirname, '..', 'data', 'routes.json');
const STATIC_DIR = path.join(__dirname, '..', '..', '..');
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const WAYPOINT_SUGGEST_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const WAYPOINT_PROMPT_REQUIREMENT = 'We build fun scavenger hunt type games that present challenges at the location provided, that can be played with friends on the streets. Give radical ideas and look at our games table in supabase for inspiration. Put special emphasis on the current game';

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function getMissingOpenAiKeyMessage() {
  return 'OPENAI_API_KEY is missing or still set to the placeholder value in c:\\Code\\the-game-bureau\\.env.';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function clipText(value, maxLength = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function normalizeFlag(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function extractOpenAiText(payload) {
  if (payload && typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const textParts = [];
  const outputItems = Array.isArray(payload && payload.output) ? payload.output : [];
  outputItems.forEach((item) => {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) return;
    item.content.forEach((part) => {
      if (!part) return;
      if (typeof part.text === 'string' && part.text.trim()) {
        textParts.push(part.text.trim());
      } else if (typeof part.output_text === 'string' && part.output_text.trim()) {
        textParts.push(part.output_text.trim());
      }
    });
  });
  return textParts.join('\n\n').trim();
}

function htmlToText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchLocationContext(location) {
  const trimmed = String(location || '').trim();
  if (!trimmed || !isHttpUrl(trimmed)) return null;
  try {
    const response = await fetch(trimmed, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'TGB Builder Suggestion Fetcher'
      }
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const raw = await response.text();
    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descriptionMatch = raw.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)
      || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
    const plainText = contentType.includes('html') ? htmlToText(raw) : clipText(raw, 600);
    return {
      url: trimmed,
      title: clipText(titleMatch ? titleMatch[1] : '', 160),
      description: clipText(descriptionMatch ? descriptionMatch[1] : '', 240),
      excerpt: clipText(plainText, 420)
    };
  } catch (error) {
    return null;
  }
}

function summarizeGameRecord(game) {
  const nodes = Array.isArray(game && game.nodes) ? game.nodes : [];
  const gameNode = nodes.find((node) => node && node.type === 'game') || null;
  const stopNodes = nodes.filter((node) => node && node.type === 'stop');
  const bubbleNodes = nodes.filter((node) => node && node.type === 'bubble');
  const replyNodes = nodes.filter((node) => node && node.type === 'reply');
  const tags = gameNode && Array.isArray(gameNode.tags) ? gameNode.tags.filter(Boolean).slice(0, 8) : [];
  return {
    id: game && game.id ? String(game.id) : '',
    name: clipText((game && game.name) || (gameNode && gameNode.title) || 'Untitled Game', 100),
    tagline: clipText(gameNode && gameNode.tagline ? gameNode.tagline : '', 140),
    description: clipText(gameNode && gameNode.body ? gameNode.body : '', 220),
    guideName: clipText(gameNode && gameNode.guideName ? gameNode.guideName : '', 80),
    guideImageUrl: clipText(gameNode && gameNode.guideImageUrl ? gameNode.guideImageUrl : '', 180),
    tags,
    waypointCount: stopNodes.length,
    guideMessageCount: bubbleNodes.length,
    playerMessageCount: replyNodes.length,
    sampleGuideMessages: bubbleNodes.slice(0, 3).map((node) => clipText(node && node.body ? node.body : '', 140)).filter(Boolean),
    samplePlayerAnswers: replyNodes.slice(0, 3).map((node) => clipText(node && node.body ? node.body : '', 120)).filter(Boolean),
    sampleWaypoints: stopNodes.slice(0, 4).map((node) => ({
      name: clipText(node && node.title ? node.title : '', 80),
      location: clipText(node && node.location ? node.location : '', 180),
      notes: clipText(node && node.body ? node.body : '', 160)
    }))
  };
}

function formatGameSummary(summary, heading = 'Current game') {
  if (!summary || typeof summary !== 'object') return heading + ': none';
  const lines = [heading + ':'];
  if (summary.name) lines.push('- Name: ' + summary.name);
  if (summary.tagline) lines.push('- Tagline: ' + summary.tagline);
  if (summary.description) lines.push('- Description: ' + summary.description);
  if (summary.guideName) lines.push('- Guide: ' + summary.guideName);
  if (summary.guideImageUrl) lines.push('- Guide image: ' + summary.guideImageUrl);
  if (summary.primaryColor || summary.secondaryColor) lines.push('- Colors: ' + [summary.primaryColor, summary.secondaryColor].filter(Boolean).join(' / '));
  if (Array.isArray(summary.tags) && summary.tags.length) lines.push('- Tags: ' + summary.tags.join(', '));
  lines.push('- Structure: ' + (summary.waypointCount || 0) + ' waypoints, ' + (summary.guideMessageCount || 0) + ' guide messages, ' + (summary.playerMessageCount || 0) + ' player messages');
  if (Array.isArray(summary.sampleWaypoints) && summary.sampleWaypoints.length) {
    lines.push('- Sample waypoints: ' + summary.sampleWaypoints.map((waypoint) => {
      const parts = [waypoint.name || 'Untitled waypoint'];
      if (waypoint.location) parts.push('@ ' + waypoint.location);
      if (waypoint.notes) parts.push('[' + waypoint.notes + ']');
      return parts.join(' ');
    }).join(' | '));
  }
  if (Array.isArray(summary.sampleGuideMessages) && summary.sampleGuideMessages.length) {
    lines.push('- Sample guide messages: ' + summary.sampleGuideMessages.join(' | '));
  }
  if (Array.isArray(summary.samplePlayerAnswers) && summary.samplePlayerAnswers.length) {
    lines.push('- Sample player answers: ' + summary.samplePlayerAnswers.join(' | '));
  }
  return lines.join('\n');
}

async function fetchSupabaseInspirationGames(config, currentGame) {
  if (!config || typeof config !== 'object') return [];
  const url = typeof config.url === 'string' ? config.url.trim().replace(/\/+$/, '') : '';
  const publishableKey = typeof config.publishableKey === 'string' ? config.publishableKey.trim() : '';
  const gamesTable = typeof config.gamesTable === 'string' && config.gamesTable.trim() ? config.gamesTable.trim() : 'games';
  if (!url || !publishableKey) return [];

  try {
    const requestUrl = new URL('/rest/v1/' + encodeURIComponent(gamesTable), url + '/');
    requestUrl.searchParams.set('select', 'id,name,archived,erased,nodes,updated_at');
    requestUrl.searchParams.set('order', 'updated_at.desc');
    requestUrl.searchParams.set('limit', '18');
    const response = await fetch(requestUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: publishableKey,
        Authorization: 'Bearer ' + publishableKey,
        Accept: 'application/json'
      }
    });
    if (!response.ok) return [];
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    const currentId = currentGame && currentGame.id ? String(currentGame.id).trim() : '';
    const currentName = currentGame && currentGame.name ? String(currentGame.name).trim().toLowerCase() : '';
    return rows
      .filter((row) => normalizeFlag(row && row.erased) !== 'YES')
      .map(summarizeGameRecord)
      .filter((summary) => summary.name)
      .filter((summary) => (!currentId || summary.id !== currentId) && (!currentName || summary.name.toLowerCase() !== currentName))
      .slice(0, 6);
  } catch (error) {
    return [];
  }
}

function buildWaypointSuggestionInput(payload, locationContext, inspirationGames) {
  const location = clipText(payload && payload.location ? payload.location : '', 240);
  const waypointName = clipText(payload && payload.waypointName ? payload.waypointName : '', 120);
  const currentGame = payload && payload.currentGame && payload.currentGame.summary ? payload.currentGame.summary : null;
  const lines = [
    WAYPOINT_PROMPT_REQUIREMENT,
    '',
    'Waypoint to design:',
    '- Waypoint name: ' + (waypointName || 'Untitled waypoint'),
    '- Location: ' + (location || 'Unknown location')
  ];

  if (locationContext) {
    lines.push('- URL context title: ' + (locationContext.title || 'Unknown'));
    if (locationContext.description) lines.push('- URL context description: ' + locationContext.description);
    if (locationContext.excerpt) lines.push('- URL context excerpt: ' + locationContext.excerpt);
  }

  lines.push('');
  lines.push(formatGameSummary(currentGame, 'Current game'));

  if (Array.isArray(inspirationGames) && inspirationGames.length) {
    lines.push('');
    lines.push('Other games from Supabase for inspiration:');
    inspirationGames.forEach((summary, index) => {
      lines.push(formatGameSummary(summary, 'Reference game ' + (index + 1)));
      lines.push('');
    });
  }

  lines.push('Return plain text only for the waypoint NOTES field.');
  lines.push('Make it builder-facing, radical, practical, and grounded in the location.');
  lines.push('Give one strong core stop concept, 4-6 short challenge ideas, and 2-3 production/clue notes.');
  return lines.join('\n');
}

function buildGameDescriptionInput(gameName) {
  return 'generate a description for a scavenger hunt/escape room style game that takes place on city streets. The game is named ' + gameName;
}

async function requestWaypointSuggestionFromOpenAi(payload, locationContext, inspirationGames) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: WAYPOINT_SUGGEST_MODEL,
      store: false,
      instructions: 'You help The Game Bureau create builder-facing waypoint notes for playable on-the-street scavenger hunt SMS games. Return plain text only. Do not explain your process. Do not write player-facing UI copy.',
      input: buildWaypointSuggestionInput(payload, locationContext, inspirationGames)
    })
  });
  const json = await response.json();
  if (!response.ok) {
    const message = json && json.error && typeof json.error.message === 'string'
      ? json.error.message
      : 'OpenAI suggestion request failed.';
    throw new Error(message);
  }
  const suggestion = extractOpenAiText(json);
  if (!suggestion) {
    throw new Error('OpenAI did not return any suggestion text.');
  }
  return suggestion;
}

async function requestGameDescriptionFromOpenAi(gameName) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.OPENAI_API_KEY
    },
    body: JSON.stringify({
      model: WAYPOINT_SUGGEST_MODEL,
      store: false,
      instructions: 'You help The Game Bureau write short, vivid descriptions for scavenger hunt and escape room style games played on city streets. Return plain text only with no quotation marks.',
      input: buildGameDescriptionInput(gameName)
    })
  });
  const json = await response.json();
  if (!response.ok) {
    const message = json && json.error && typeof json.error.message === 'string'
      ? json.error.message
      : 'OpenAI description request failed.';
    throw new Error(message);
  }
  const description = extractOpenAiText(json);
  if (!description) {
    throw new Error('OpenAI did not return any description text.');
  }
  return description;
}

http.createServer((req, res) => {
  loadLocalEnvFiles();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, anthropic-version');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && req.url === '/anthropic-proxy') {
    (async () => {
      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          sendJson(res, 503, { error: 'ANTHROPIC_API_KEY is not set on the local server.' });
          return;
        }

        const payload = await readJsonBody(req);
        const anthropicRes = await fetch(ANTHROPIC_MESSAGES_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload)
        });

        res.writeHead(anthropicRes.status, { 'Content-Type': 'application/json' });
        anthropicRes.body.pipe(res);
      } catch (error) {
        sendJson(res, 500, { error: error && error.message ? error.message : 'Anthropic proxy failed.' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && req.url === '/ai/waypoint-suggest') {
    (async () => {
      try {
        if (isPlaceholderApiKey(process.env.OPENAI_API_KEY)) {
          sendJson(res, 503, { error: getMissingOpenAiKeyMessage() });
          return;
        }

        const payload = await readJsonBody(req);
        const location = String(payload && payload.location ? payload.location : '').trim();
        if (!location) {
          sendJson(res, 400, { error: 'Location is required.' });
          return;
        }

        const locationContext = await fetchLocationContext(location);
        const inspirationGames = await fetchSupabaseInspirationGames(payload && payload.supabase, payload && payload.currentGame);
        const suggestion = await requestWaypointSuggestionFromOpenAi(payload, locationContext, inspirationGames);
        sendJson(res, 200, { suggestion });
      } catch (error) {
        sendJson(res, 500, { error: error && error.message ? error.message : 'Waypoint suggestion failed.' });
      }
    })();
    return;
  }

  // POST /games — write games_archive.json
  if (req.method === 'POST' && req.url === '/ai/game-description') {
    (async () => {
      try {
        if (isPlaceholderApiKey(process.env.OPENAI_API_KEY)) {
          sendJson(res, 503, { error: getMissingOpenAiKeyMessage() });
          return;
        }

        const payload = await readJsonBody(req);
        const gameName = String(payload && payload.gameName ? payload.gameName : '').trim();
        if (!gameName) {
          sendJson(res, 400, { error: 'Game name is required.' });
          return;
        }

        const description = await requestGameDescriptionFromOpenAi(gameName);
        sendJson(res, 200, { description });
      } catch (error) {
        sendJson(res, 500, { error: error && error.message ? error.message : 'Game description generation failed.' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && req.url === '/games') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);          // validate JSON
        fs.writeFileSync(GAMES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /stops — write stops.json
  // POST /games-new — write games_new.json
  if (req.method === 'POST' && req.url === '/games-new') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(GAMES_NEW_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /stops â€” write stops.json
  if (req.method === 'POST' && req.url === '/stops') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(STOPS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /stops — read stops.json
  if (req.method === 'GET' && req.url === '/stops') {
    try {
      const txt = fs.readFileSync(STOPS_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    }
    return;
  }

  // POST /routes — write routes.json
  // GET /games-new — read games_new.json
  if (req.method === 'GET' && req.url === '/games-new') {
    try {
      const txt = fs.readFileSync(GAMES_NEW_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"games":[]}');
    }
    return;
  }

  // POST /routes â€” write routes.json
  if (req.method === 'POST' && req.url === '/routes') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(ROUTES_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // GET /routes — read routes.json
  if (req.method === 'GET' && req.url === '/routes') {
    try {
      const txt = fs.readFileSync(ROUTES_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    }
    return;
  }

  // POST /publish — git commit + push
  if (req.method === 'POST' && req.url === '/publish') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const msg = 'Publish button in builder pressed';
      const repoRoot = path.join(__dirname, '..', '..');
      const run = (cmd, args) => new Promise((resolve, reject) =>
        execFile(cmd, args, { cwd: repoRoot, shell: true }, (err, stdout, stderr) =>
          err ? reject(new Error(stderr || stdout || err.message)) : resolve(stdout)));
      (async () => {
        try {
          await run('git', ['add', '-A']);
          await run('git', ['commit', '--allow-empty', '-m', msg]);
          await run('git', ['push']);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      })();
    });
    return;
  }

  // GET /games — read games_archive.json
  if (req.method === 'GET' && req.url === '/games') {
    try {
      const txt = fs.readFileSync(GAMES_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } catch (e) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"games":[]}');
    }
    return;
  }

  // Static files
  if (req.url === '/') { res.writeHead(302, { Location: '/builder.html' }); res.end(); return; }
  const requestPath = decodeURIComponent(String(req.url || '').split('?')[0] || '/');
  const relativePath = requestPath.replace(/^\/+/, '');
  const staticRoot = path.resolve(STATIC_DIR);
  const filePath = path.resolve(staticRoot, relativePath || 'builder.html');
  if (filePath !== staticRoot && !filePath.startsWith(staticRoot + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const ext = path.extname(filePath);
  if (!MIME[ext]) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] });
    res.end(data);
  });

}).listen(PORT, () => console.log('http://localhost:' + PORT + '/builder.html'));
