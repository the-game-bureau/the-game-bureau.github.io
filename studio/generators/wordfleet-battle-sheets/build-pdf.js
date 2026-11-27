// Renders saved battle sheet editions to PDF. Usage, from the repo root:
//   node studio/generators/wordfleet-battle-sheets/build-pdf.js wordfleet2/battle-sheets/20261127-1824.json [...]
// Writes <same name>.pdf beside each JSON file. Needs playwright (the battle-sheet-pdfs workflow installs it).
// It opens the generator page with ?edition=<path>&pdf, which shows exactly that edition, and prints it.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // the repo root, which is the site root
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf' };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

(async () => {
  const list = process.argv.slice(2);
  if (!list.length) { console.log('Nothing to build.'); return; }
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failed = 0;
  try {
    for (const rel of list) {
      if (!/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\/battle-sheets\/[\w.-]+\.json$/.test(rel)) { console.error('Skipping ' + rel + ': not a battle sheet edition'); failed++; continue; }
      const page = await browser.newPage();
      page.on('pageerror', e => console.error(rel + ': ' + e.message));
      await page.goto(base + '/studio/generators/wordfleet-battle-sheets/?pdf&edition=' + encodeURIComponent(rel));
      await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
      if (await page.evaluate(() => document.body.dataset.ready) !== '1') { console.error(rel + ': ' + await page.textContent('#gen-status')); failed++; await page.close(); continue; }
      await page.evaluate(() => document.fonts.ready);
      const sheets = await page.$$eval('.bs-page', x => x.length);
      const out = path.join(ROOT, rel.replace(/\.json$/, '.pdf'));
      await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
      console.log(rel + ': ' + sheets + ' sheets -> ' + path.relative(ROOT, out));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
})();
