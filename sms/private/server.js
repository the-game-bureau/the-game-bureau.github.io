// Run: node server.js
// Then open: http://localhost:3000/game_builder.html
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = 3000;
const GAMES_FILE = path.join(__dirname, '..', 'games', 'games.json');
const STATIC_DIR = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

http.createServer((req, res) => {
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
  let filePath = path.join(STATIC_DIR, req.url === '/' ? '/game_builder.html' : req.url);
  const ext    = path.extname(filePath);
  if (!MIME[ext]) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] });
    res.end(data);
  });

}).listen(PORT, () => console.log('http://localhost:' + PORT + '/game_builder.html'));
