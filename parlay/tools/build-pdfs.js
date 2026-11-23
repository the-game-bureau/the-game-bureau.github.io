// Builds the three Parlay Squares PDFs from the HTML in parlay/.
//   pdf/parlay-squares.pdf              visitor copy: 8.5 x 11, front cover, notebook, back cover
//   pdf/parlay-squares-notebook-cover.pdf   Print wraparound cover, 17.25 x 11.25 (0.125 in bleed)
//   pdf/parlay-squares-notebook-interior.pdf Print interior, 8.75 x 11.25 (0.125 in bleed)
// Run: node parlay/tools/build-pdfs.js   (needs playwright + pdf-lib)
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'pdf');
const url = f => pathToFileURL(path.join(ROOT, f)).href;

// One cover panel on a plain 8.5 x 11 page for the visitor PDF.
const panelCss = side => `
  @page{size:8.5in 11in;margin:0}
  html,body{background:#fff!important}
  .spread-wrap{padding:0!important;display:block!important}
  .spread{zoom:1!important;width:8.5in!important;height:11in!important}
  .cv-panel{width:8.5in!important;height:11in!important;padding:.6in!important}
  .cv-panel.${side === 'front' ? 'back' : 'front'}{display:none!important}`;

async function render(browser, file, out, { css, prep } = {}) {
  const page = await browser.newPage();
  // Always render the print layout (@media print + @page), never the screen layout.
  await page.emulateMedia({ media: 'print' });
  await page.goto(url(file), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (prep) await page.evaluate(prep);
  if (css) await page.addStyleTag({ content: css });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const buf = await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
  await page.close();
  return buf;
}

// Builds the notebook's print pages (same as its Print button) without opening a dialog.
const buildBook = () => new Promise(res => {
  window.print = () => res();
  const b = document.getElementById('print');
  b.hidden = false; b.click(); b.hidden = true;
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'parlay-'));

  // Everything renders into a temp folder first; pdf/ is only replaced if all checks pass.
  const cover = await render(browser, 'cover.html', path.join(tmp, 'print-cover.pdf'));
  const interior = await render(browser, 'notebook.html', path.join(tmp, 'print-interior.pdf'), { prep: buildBook });

  const front = await render(browser, 'cover.html', path.join(tmp, 'front.pdf'), { css: panelCss('front') });
  const back = await render(browser, 'cover.html', path.join(tmp, 'back.pdf'), { css: panelCss('back') });
  const inner = await render(browser, 'notebook.html', path.join(tmp, 'inner.pdf'), {
    prep: buildBook, css: '@page{size:8.5in 11in;margin:0.6in}',
  });
  // Front cover alone as a 300 dpi PNG (2550 x 3300 px), for listings and previews.
  const shot = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 3.125 });
  await shot.emulateMedia({ media: 'print' });
  await shot.goto(url('cover.html'), { waitUntil: 'load' });
  await shot.evaluate(() => document.fonts.ready);
  await shot.addStyleTag({ content: panelCss('front') + 'html,body{margin:0!important;padding:0!important}' });
  await shot.evaluate(() => document.fonts.ready);
  await shot.waitForTimeout(400);
  await shot.screenshot({ path: path.join(tmp, 'front.png'), clip: { x: 0, y: 0, width: 816, height: 1056 } });
  await shot.close();
  await browser.close();

  const doc = await PDFDocument.create();
  doc.setTitle('The Parlay Squares Notebook');
  doc.setAuthor('The Game Bureau');
  for (const buf of [front, inner, back]) {
    const src = await PDFDocument.load(buf);
    (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p));
  }
  const visitor = await doc.save();

  // Print-form checks: page sizes in inches and page counts. A failure stops the build and keeps the old PDFs.
  const size = async buf => (await PDFDocument.load(buf)).getPages().map(p => p.getSize()).map(({ width, height }) => [width / 72, height / 72]);
  const expect = (label, pages, w, h) => {
    const bad = pages.filter(([pw, ph]) => Math.abs(pw - w) > 0.01 || Math.abs(ph - h) > 0.01);
    if (bad.length) throw new Error(label + ': ' + bad.length + ' page(s) not ' + w + ' x ' + h + ' in');
  };
  const [c, i, v, f] = [await size(cover), await size(interior), await size(visitor), await size(front)];
  expect('Front cover 8.5 x 11', f, 8.5, 11);
  if (f.length !== 1) throw new Error('Front cover should be 1 page, got ' + f.length);
  expect('Print cover', c, 17.25, 11.25);
  expect('Print interior', i, 8.75, 11.25);
  expect('Visitor PDF', v, 8.5, 11);
  if (c.length !== 1) throw new Error('Print cover should be 1 page, got ' + c.length);
  if (v.length !== i.length + 2) throw new Error('Visitor PDF should be interior + 2 cover pages');
  if (i.length < 4) throw new Error('Print interior has only ' + i.length + ' pages');

  fs.copyFileSync(path.join(tmp, 'print-cover.pdf'), path.join(OUT, 'parlay-squares-notebook-cover.pdf'));
  fs.copyFileSync(path.join(tmp, 'print-interior.pdf'), path.join(OUT, 'parlay-squares-notebook-interior.pdf'));
  fs.writeFileSync(path.join(OUT, 'parlay-squares.pdf'), visitor);
  fs.copyFileSync(path.join(tmp, 'front.pdf'), path.join(OUT, 'parlay-squares-notebook-front-8.5x11.pdf'));
  fs.copyFileSync(path.join(tmp, 'front.png'), path.join(OUT, 'parlay-squares-notebook-front-8.5x11.png'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Checks passed: cover 1 page, interior ' + i.length + ' pages, visitor ' + v.length + ' pages');
  console.log('PDFs written to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
