// Builds a notebook game's PDFs from its HTML. Usage, from the repo root:
//   node studio/kit/build-pdfs.js studio/dice-derby   (one game: its folder from the repo root)
//   node studio/kit/build-pdfs.js --all                 (every folder with a notebook game.json)
// Needs playwright and pdf-lib (the GitHub workflow installs them).
//
// Writes into <game>/pdf/:
//   <slug>-cover.pdf     front/back cover for the printer: one wraparound spread,
//                        back + spine + front, with bleed. Spine width grows with page count.
//   <slug>-contents.pdf  the inside pages for the printer, rules first, with bleed,
//                        padded with blank pages to a multiple of print.padTo.
//   <slug>.pdf           print-at-home copy at trim size: front, rules, contents, back.
//   <slug>-sampler.pdf   free sampler at trim size: front, rules, sampler pages, back.
// Everything renders to a temp folder first; pdf/ is only touched when every check passes.
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..', '..'); // the repo root, which is the site root
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.otf': 'font/otf', '.ico': 'image/x-icon' };

// The pages use site-root paths (/studio/kit/...), so serve the repo root over http.
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

const isNotebook = dir => {
  try { const g = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'game.json'), 'utf8')); return g.kit === 'notebook'; } catch (e) { return false; }
};

// Folders up to 3 levels deep that hold a notebook game.json.
function findGames(rel = '', depth = 0) {
  const out = [];
  for (const d of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('.') || d.name.startsWith('_') || ['node_modules', 'mc', 'backups'].includes(d.name)) continue;
    const r = rel ? rel + '/' + d.name : d.name;
    if (isNotebook(r)) out.push(r);
    else if (depth < 2) out.push(...findGames(r, depth + 1));
  }
  return out;
}

async function build(browser, base, folder) {
  const dir = path.join(ROOT, folder);
  const slug = path.basename(folder);
  const g = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
  if (g.slug !== slug) throw new Error(folder + '/game.json has slug "' + g.slug + '"; it must match the folder name');
  const P = Object.assign({ trim: [8.5, 11], bleed: 0.125, spinePerPage: 0.002252, padTo: 2 }, g.print || {});
  const [W, H] = P.trim;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-' + slug + '-'));

  async function render(file, query) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('  page error in ' + file + ':', e.message));
    await page.emulateMedia({ media: 'print' });
    await page.goto(base + '/' + folder + '/' + file + '?pdf=1&' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
    const err = await page.evaluate(() => document.body.dataset.ready === 'error' && document.body.dataset.error);
    if (err) throw new Error(file + ': ' + err);
    const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await page.close();
    return buf;
  }
  const load = b => PDFDocument.load(b);

  console.log('Building ' + slug + ' (' + W + ' x ' + H + ' in, bleed ' + P.bleed + ' in)');

  // Contents for the printer, padded with blanks.
  const contentsDoc = await load(await render('contents.html', 'bleed=1'));
  const pad = Math.max(1, P.padTo | 0);
  const [cw, ch] = [(W + 2 * P.bleed) * 72, (H + 2 * P.bleed) * 72];
  let blanks = 0;
  while (contentsDoc.getPageCount() % pad) { contentsDoc.addPage([cw, ch]); blanks++; }
  const pages = contentsDoc.getPageCount();
  contentsDoc.setTitle(g.title + ' notebook, contents'); contentsDoc.setAuthor(P.author || 'The Game Bureau');
  const contents = await contentsDoc.save();

  // Cover spread, with a spine sized for that page count.
  const spine = P.spine != null ? +P.spine : +(pages * P.spinePerPage).toFixed(3);
  const coverDoc = await load(await render('cover.html', 'layout=spread&spine=' + spine));
  // Chrome rounds page sizes to whole pixels; set the boxes to the exact size.
  const CW = (2 * W + spine + 2 * P.bleed) * 72, CH = (H + 2 * P.bleed) * 72;
  coverDoc.getPages().forEach(pg => { const h = pg.getHeight(); pg.setMediaBox(0, h - CH, CW, CH); pg.setCropBox(0, h - CH, CW, CH); });
  coverDoc.setTitle(g.title + ' notebook, cover'); coverDoc.setAuthor(P.author || 'The Game Bureau');
  const cover = await coverDoc.save();

  // Print-at-home and sampler copies: front + inside (no bleed) + back.
  const front = await render('cover.html', 'layout=front');
  const back = await render('cover.html', 'layout=back');
  const inner = await render('contents.html', 'bleed=0');
  const samplerInner = await render('contents.html', 'bleed=0&sampler=1');
  async function combine(parts, title) {
    const doc = await PDFDocument.create();
    doc.setTitle(title); doc.setAuthor(P.author || 'The Game Bureau');
    for (const buf of parts) { const src = await load(buf); (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p)); }
    return doc.save();
  }
  const full = await combine([front, inner, back], g.title + ' notebook');
  const sampler = await combine([front, samplerInner, back], g.title + ' free sampler');

  // Checks: page sizes in inches and page counts. A failure stops here and keeps the old PDFs.
  const sizes = async b => (await load(b)).getPages().map(p => [p.getWidth() / 72, p.getHeight() / 72]);
  const expect = async (label, b, w, h, tol = 0.02) => {
    const bad = (await sizes(b)).filter(([pw, ph]) => Math.abs(pw - w) > tol || Math.abs(ph - h) > tol);
    if (bad.length) throw new Error(label + ': ' + bad.length + ' page(s) are not ' + w.toFixed(3) + ' x ' + h.toFixed(3) + ' in (got ' + bad[0].map(n => n.toFixed(3)).join(' x ') + ')');
  };
  await expect('Cover', cover, 2 * W + spine + 2 * P.bleed, H + 2 * P.bleed, 0.001);
  await expect('Contents', contents, W + 2 * P.bleed, H + 2 * P.bleed);
  await expect('Print-at-home', full, W, H);
  await expect('Sampler', sampler, W, H);
  if ((await load(cover)).getPageCount() !== 1) throw new Error('Cover should be 1 page. Check cover.html for content that spills over.');
  if ((await load(front)).getPageCount() !== 1 || (await load(back)).getPageCount() !== 1) throw new Error('Front and back should be 1 page each. Check cover.html for content that spills over.');
  const fullCount = (await load(full)).getPageCount(), samplerCount = (await load(sampler)).getPageCount();
  if (samplerCount >= fullCount) throw new Error('Sampler (' + samplerCount + ' pages) is not shorter than the full notebook (' + fullCount + ').');

  // Product pictures for the public page, used until real photos are added:
  // the front cover, then the first inside pages of the sampler.
  const shots = [];
  async function shoot(file, query, selector, count) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1300 }, deviceScaleFactor: 1.4 });
    await page.goto(base + '/' + folder + '/' + file + '?pdf=1&' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
    for (const el of (await page.$$(selector)).slice(0, count)) {
      const box = await el.boundingBox();
      if (!box) continue;
      const name = 'preview-' + (shots.length + 1) + '.jpg';
      await page.screenshot({ path: path.join(tmp, name), type: 'jpeg', quality: 82, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, box.width * H / W) } });
      shots.push(name);
    }
    await page.close();
  }
  await shoot('cover.html', 'layout=front', '.pk-cover', 1);
  await shoot('contents.html', 'bleed=0&sampler=1', '.flow, .page', 3);

  const out = path.join(dir, 'pdf');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^preview-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(out, f));
  shots.forEach(f => fs.copyFileSync(path.join(tmp, f), path.join(out, f)));
  fs.writeFileSync(path.join(out, slug + '-cover.pdf'), cover);
  fs.writeFileSync(path.join(out, slug + '-contents.pdf'), contents);
  fs.writeFileSync(path.join(out, slug + '.pdf'), full);
  fs.writeFileSync(path.join(out, slug + '-sampler.pdf'), sampler);
  // A small record the admin page reads to show what was built.
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({
    built: new Date().toISOString(), trim: [W, H], bleed: P.bleed, spine,
    pages: { contents: pages, blanksAdded: blanks, printAtHome: fullCount, sampler: samplerCount },
    previews: shots.map(f => 'pdf/' + f),
  }, null, 2) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('  contents ' + pages + ' pages (' + blanks + ' blank added), cover ' + (2 * W + spine + 2 * P.bleed).toFixed(3) + ' x ' + (H + 2 * P.bleed).toFixed(3) + ' in, spine ' + spine + ' in');
  console.log('  print-at-home ' + fullCount + ' pages, sampler ' + samplerCount + ' pages -> ' + path.relative(ROOT, out) + '/');
}

(async () => {
  const args = process.argv.slice(2);
  let games = args.includes('--all')
    ? findGames()
    : args.filter(a => !a.startsWith('-')).map(a => a.replace(/^\.?\/+|\/+$/g, ''));
  if (!games.length) { console.error('Usage: node studio/kit/build-pdfs.js <game-folder> [...] | --all'); process.exit(2); }
  for (const s of games) {
    if (!/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(s) || !isNotebook(s)) { console.error('"' + s + '" is not a notebook game folder (needs game.json with "kit": "notebook")'); process.exit(2); }
  }
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failed = 0;
  for (const s of games) {
    try { await build(browser, base, s); } catch (e) { failed++; console.error('FAILED ' + s + ': ' + e.message); }
  }
  await browser.close();
  server.close();
  process.exit(failed ? 1 : 0);
})();
