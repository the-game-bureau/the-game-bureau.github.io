// Run: node server.js
// Then open: http://localhost:3000/private/builder.html
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { execFile } = require('child_process');

const PORT       = 3000;
const GAMES_FILE  = path.join(__dirname, '..', 'data', 'games.json');
const GAMES_NEW_FILE = path.join(__dirname, '..', 'data', 'games_new.json');
const GAMES_PHONEANALOGY_FILE = path.join(__dirname, '..', 'data', 'games_phoneanalogy.json');
const STOPS_FILE  = path.join(__dirname, '..', 'data', 'stops.json');
const ROUTES_FILE = path.join(__dirname, '..', 'data', 'routes.json');
const STATIC_DIR = path.join(__dirname, '..', '..');

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

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // POST /games — write games.json
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

  // POST /games-phoneanalogy — write games_phoneanalogy.json
  if (req.method === 'POST' && req.url === '/games-phoneanalogy') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        fs.writeFileSync(GAMES_PHONEANALOGY_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
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

  // GET /games-phoneanalogy — read games_phoneanalogy.json
  if (req.method === 'GET' && req.url === '/games-phoneanalogy') {
    try {
      const txt = fs.readFileSync(GAMES_PHONEANALOGY_FILE, 'utf8');
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

  // GET /games — read games.json
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
  if (req.url === '/') { res.writeHead(302, { Location: '/play/private/builder.html' }); res.end(); return; }
  let filePath = path.join(STATIC_DIR, req.url.split('?')[0]);
  const ext    = path.extname(filePath);
  if (!MIME[ext]) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] });
    res.end(data);
  });

}).listen(PORT, () => console.log('http://localhost:' + PORT + '/play/private/builder.html'));
