// Builds the three Parlay Squares PDFs from the HTML in parlay/.
//   pdf/parlay-squares.pdf              visitor copy: 8.5 x 11, front cover, notebook, back cover
//   pdf/parlay-squares-lulu-cover.pdf   Lulu wraparound cover, 17.25 x 11.25 (0.125 in bleed)
//   pdf/parlay-squares-lulu-interior.pdf Lulu interior, 8.75 x 11.25 (0.125 in bleed)
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
  const cover = await render(browser, 'cover.html', path.join(tmp, 'lulu-cover.pdf'));
  const interior = await render(browser, 'notebook.html', path.join(tmp, 'lulu-interior.pdf'), { prep: buildBook });

  const front = await render(browser, 'cover.html', path.join(tmp, 'front.pdf'), { css: panelCss('front') });
  const back = await render(browser, 'cover.html', path.join(tmp, 'back.pdf'), { css: panelCss('back') });
  const inner = await render(browser, 'notebook.html', path.join(tmp, 'inner.pdf'), {
    prep: buildBook, css: '@page{size:8.5in 11in;margin:0.6in}',
  });
  await browser.close();

  const doc = await PDFDocument.create();
  doc.setTitle('Parlay Squares');
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
  const [c, i, v] = [await size(cover), await size(interior), await size(visitor)];
  expect('Lulu cover', c, 17.25, 11.25);
  expect('Lulu interior', i, 8.75, 11.25);
  expect('Visitor PDF', v, 8.5, 11);
  if (c.length !== 1) throw new Error('Lulu cover should be 1 page, got ' + c.length);
  if (v.length !== i.length + 2) throw new Error('Visitor PDF should be interior + 2 cover pages');
  if (i.length < 4) throw new Error('Lulu interior has only ' + i.length + ' pages');

  fs.copyFileSync(path.join(tmp, 'lulu-cover.pdf'), path.join(OUT, 'parlay-squares-lulu-cover.pdf'));
  fs.copyFileSync(path.join(tmp, 'lulu-interior.pdf'), path.join(OUT, 'parlay-squares-lulu-interior.pdf'));
  fs.writeFileSync(path.join(OUT, 'parlay-squares.pdf'), visitor);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Checks passed: cover 1 page, interior ' + i.length + ' pages, visitor ' + v.length + ' pages');
  console.log('PDFs written to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
