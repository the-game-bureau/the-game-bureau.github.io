// Builds a notebook game's PDFs from its HTML. Usage, from the repo root:
//   node studio/kit/build-pdfs.js studio/starter   (one game: its folder from the repo root)
//   node studio/kit/build-pdfs.js --all                 (every folder with a notebook game.json)
// Needs playwright and pdf-lib (the GitHub workflow installs them).
//
// Writes into <game>/pdf/:
//   <slug>-cover.pdf     front/back cover for the printer: one wraparound spread,
//                        back + spine + front, with bleed. Spine width grows with page count.
//   <slug>-contents.pdf  the inside pages for the printer, rules first, with bleed,
//                        padded with blank pages to a multiple of print.padTo.
//   <slug>.pdf           print-at-home copy at trim size: front, rules, contents, back.
//   <slug>-sampler.pdf   free sampler at trim size, always exactly: the chosen front cover with the
//                        SAMPLER stamp, the rules, the scoring pages, then sampler.html's pages. No back.
// The game pages come from game.json "pages": contents.html's game sheet (the default), a link (a PDF,
// Google file or web page, printed print.sheets times) or a generator's saved edition (each sheet once).
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

// Where the game pages come from: the same rules as NB.pagesSource in kit.js.
function gameSource(g) {
  const p = (g && g.pages) || {};
  if (p.source === 'link') return { source: 'link', link: String(p.link || '').trim() };
  if (p.source === 'generator') return { source: 'generator', generator: String(p.generator || ''), edition: String(p.edition || '') };
  return { source: 'html' };
}

// A page's print output as a PDF, sized by its own @page rule. Waits for data-ready when the page sets it.
async function renderUrl(browser, url, size, ready) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('  page error in ' + url + ':', e.message));
  await page.emulateMedia({ media: 'print' });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (ready) await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
  const err = await page.evaluate(() => document.body.dataset.ready === 'error' && (document.body.dataset.error || 'the page could not draw its sheets'));
  if (err) throw new Error(url + ': ' + err);
  const buf = await page.pdf(size ? { width: size[0] + 'in', height: size[1] + 'in', printBackground: true } : { preferCSSPageSize: true, printBackground: true });
  await page.close();
  return buf;
}

// The game pages behind a link: a PDF, a Google Doc/Sheet/Slides (its PDF export), a Google Drive
// file, or any web page (printed at the notebook's trim size).
async function linkPdf(browser, base, link, W, H) {
  if (!/^(https:\/\/|\/)/.test(link)) throw new Error('Game pages: the link "' + link + '" is not a web address');
  let u = link, m;
  if ((m = u.match(/^https:\/\/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/)) && m[2] !== 'e') u = 'https://docs.google.com/' + m[1] + '/d/' + m[2] + '/export' + (m[1] === 'presentation' ? '/pdf' : '?format=pdf');
  else if ((m = u.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/))) u = 'https://drive.google.com/uc?export=download&id=' + m[1];
  if (u.startsWith('/')) {
    const file = path.join(ROOT, decodeURIComponent(u.split(/[?#]/)[0]));
    if (/\.pdf$/i.test(file) && file.startsWith(ROOT) && fs.existsSync(file)) return fs.readFileSync(file);
    return renderUrl(browser, base + u, [W, H]);
  }
  const r = await fetch(u, { redirect: 'follow' }).catch(e => { throw new Error('Game pages: could not reach ' + link + ' (' + ((e.cause && e.cause.code) || e.message) + ')'); });
  if (!r.ok) throw new Error('Game pages: ' + link + ' answered ' + r.status + '. For a Google file, set sharing to Anyone with the link.');
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.slice(0, 5).toString() === '%PDF-') return buf;
  return renderUrl(browser, link, [W, H]);
}

// Adds every page of pdf (copies times over) to doc, each on a page of the notebook's size
// (trim + bleed), scaled to fit the trim and centred on it.
async function place(doc, pdf, W, H, bleed, copies) {
  const src = await PDFDocument.load(pdf);
  const pages = await doc.embedPdf(src, src.getPageIndices());
  if (!pages.length) throw new Error('Game pages: the source has no pages');
  const PW = (W + 2 * bleed) * 72, PH = (H + 2 * bleed) * 72;
  for (let c = 0; c < copies; c++) for (const ep of pages) {
    const k = Math.min(W * 72 / ep.width, H * 72 / ep.height);
    const w = ep.width * k, h = ep.height * k;
    doc.addPage([PW, PH]).drawPage(ep, { x: (PW - w) / 2, y: (PH - h) / 2, width: w, height: h });
  }
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

  // The game pages: contents.html's own game sheet (html), or pages from a link or a generator's
  // saved edition (game.json "pages"). Those are placed on notebook-size pages after the scoring pages.
  const src = gameSource(g);
  let gamePdf = null; // the source's pages as a PDF, at whatever size it made them
  if (src.source === 'link') gamePdf = await linkPdf(browser, base, src.link, W, H);
  if (src.source === 'generator') {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(src.generator) || !fs.existsSync(path.join(ROOT, 'studio/generators', src.generator, 'index.html'))) throw new Error('Game pages: there is no generator "' + src.generator + '"');
    const ed = String(src.edition).replace(/^\/+/, '');
    // A new notebook can only save an edition once it is published, so until one is picked
    // the notebook prints its own HTML game sheet instead of failing the build.
    if (!ed) console.log('  No saved edition picked yet for the ' + src.generator + ' generator, so the HTML game sheet is used for now.');
    else if (!/^[a-z0-9][a-z0-9/-]*\/pages\/[\w.-]+\.json$/.test(ed) || !fs.existsSync(path.join(ROOT, ed))) throw new Error('Game pages: the saved edition ' + (ed || '(none chosen)') + ' is not on the site');
    if (ed) gamePdf = await renderUrl(browser, base + '/studio/generators/' + src.generator + '/?pdf=1&edition=' + encodeURIComponent(ed), null, true);
  }
  const copies = src.source === 'link' ? Math.max(1, +P.sheets || 1) : 1;
  // contents.html as a PDF, with the game pages from the source when there is one.
  async function inside(bleed) {
    const own = await render('contents.html', 'bleed=' + bleed + (gamePdf ? '&only=rules,scoring' : ''));
    if (!gamePdf) return own;
    const doc = await load(own);
    await place(doc, gamePdf, W, H, bleed ? P.bleed : 0, copies);
    return doc.save();
  }

  // Contents for the printer, padded with blanks.
  const contentsDoc = await load(await inside(1));
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

  // Print-at-home copy: front + inside (no bleed) + back.
  const front = await render('cover.html', 'layout=front');
  const back = await render('cover.html', 'layout=back');
  const inner = await inside(0);
  // The free sampler is always these four parts, in this order, and nothing else (Kevin, 2026-11-27):
  // 1. the chosen front cover with the SAMPLER stamp on top, 2. the rules, 3. the scoring pages,
  // 4. sampler.html's own pages. Rules and scoring are the notebook's own, from contents.html.
  const SAMPLER = [
    ['cover.html', 'layout=front&stamp=sampler', '.pk-cover'],
    ['contents.html', 'bleed=0&only=rules', '.flow'],
    ['contents.html', 'bleed=0&only=scoring', '.page'],
    ['sampler.html', 'bleed=0&part=sampler', '.flow, .page'],
  ];
  if (!fs.existsSync(path.join(dir, 'sampler.html'))) throw new Error(folder + ' has no sampler.html (the free sampler\'s own pages). Open it in the studio and publish to make one.');
  const samplerParts = [];
  for (const [file, query] of SAMPLER) samplerParts.push(await render(file, query));
  async function combine(parts, title) {
    const doc = await PDFDocument.create();
    doc.setTitle(title); doc.setAuthor(P.author || 'The Game Bureau');
    for (const buf of parts) { const src = await load(buf); (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p)); }
    return doc.save();
  }
  const full = await combine([front, inner, back], g.title + ' notebook');
  const sampler = await combine(samplerParts, g.title + ' free sampler');

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
  if ((await load(front)).getPageCount() !== 1 || (await load(samplerParts[0])).getPageCount() !== 1 || (await load(back)).getPageCount() !== 1) throw new Error('Front and back should be 1 page each. Check cover.html for content that spills over.');
  const fullCount = (await load(full)).getPageCount(), samplerCount = (await load(sampler)).getPageCount();
  if (samplerCount >= fullCount) throw new Error('Sampler (' + samplerCount + ' pages) is not shorter than the full notebook (' + fullCount + ').');

  // Product pictures for the public page, used until real photos are added:
  // the front cover, then the rules and scoring pages (the inside pages of the sampler).
  const shots = [];
  async function shoot(file, query, selector, count, opts = {}) {
    const list = opts.list || shots, dir = opts.dir || tmp, prefix = opts.prefix || 'preview-';
    const page = await browser.newPage({ viewport: { width: 2200, height: 1300 }, deviceScaleFactor: opts.scale || 1.4 });
    await page.goto(base + '/' + folder + '/' + file + '?pdf=1&' + query, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 30000 });
    for (const el of (await page.$$(selector)).slice(0, count)) {
      const box = await el.boundingBox();
      if (!box) continue;
      const name = prefix + (list.length + 1) + '.jpg';
      const tall = opts.spread ? box.height : Math.min(box.height, box.width * H / W);
      await page.screenshot({ path: path.join(dir, name), type: 'jpeg', quality: opts.quality || 82, fullPage: true, clip: { x: box.x, y: box.y, width: box.width, height: tall } });
      list.push(name);
    }
    await page.close();
  }
  await shoot('cover.html', 'layout=front', '.pk-cover', 1);
  await shoot('contents.html', 'bleed=0&only=rules', '.flow', 1);
  await shoot('contents.html', 'bleed=0&only=scoring', '.page', 2);

  // Small pictures of the first pages of each PDF, for the studio's Bundle tab.
  const tdir = path.join(tmp, 'thumbs');
  fs.mkdirSync(tdir);
  const thumbs = {};
  for (const [key, parts] of Object.entries({
    cover: [['cover.html', 'layout=spread&spine=' + spine, '.pk-cover', 1, true]],
    contents: [['contents.html', 'bleed=1', '.flow, .page', 3]],
    print: [['cover.html', 'layout=front', '.pk-cover', 1], ['contents.html', 'bleed=0', '.flow, .page', 2]],
    sampler: SAMPLER.map(([file, query, sel]) => [file, query, sel, 1]),
  })) {
    const list = [];
    for (const [file, query, sel, n, spread] of parts) await shoot(file, query, sel, n, { list, dir: tdir, prefix: key + '-', scale: 0.35, quality: 70, spread });
    thumbs[key] = list.map(f => 'pdf/thumbs/' + f);
  }

  const out = path.join(dir, 'pdf');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^preview-\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(out, f));
  shots.forEach(f => fs.copyFileSync(path.join(tmp, f), path.join(out, f)));
  fs.rmSync(path.join(out, 'thumbs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'thumbs'));
  for (const f of fs.readdirSync(tdir)) fs.copyFileSync(path.join(tdir, f), path.join(out, 'thumbs', f));
  fs.writeFileSync(path.join(out, slug + '-cover.pdf'), cover);
  fs.writeFileSync(path.join(out, slug + '-contents.pdf'), contents);
  fs.writeFileSync(path.join(out, slug + '.pdf'), full);
  fs.writeFileSync(path.join(out, slug + '-sampler.pdf'), sampler);
  // A small record the admin page reads to show what was built.
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({
    built: new Date().toISOString(), trim: [W, H], bleed: P.bleed, spine,
    pages: { contents: pages, blanksAdded: blanks, printAtHome: fullCount, sampler: samplerCount },
    previews: shots.map(f => 'pdf/' + f),
    thumbs,
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
