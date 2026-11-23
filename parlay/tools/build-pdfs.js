// Builds the three Parlay Squares PDFs from the HTML in parlay/.
//   pdf/parlay-squares.pdf              visitor copy: 8.5 x 11, front cover, workbook, back cover
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

// Builds the workbook's print pages (same as its Print button) without opening a dialog.
const buildBook = () => new Promise(res => {
  window.print = () => res();
  const b = document.getElementById('print');
  b.hidden = false; b.click(); b.hidden = true;
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'parlay-'));

  await render(browser, 'cover.html', path.join(OUT, 'parlay-squares-lulu-cover.pdf'));
  await render(browser, 'index.html', path.join(OUT, 'parlay-squares-lulu-interior.pdf'), { prep: buildBook });

  const front = await render(browser, 'cover.html', path.join(tmp, 'front.pdf'), { css: panelCss('front') });
  const back = await render(browser, 'cover.html', path.join(tmp, 'back.pdf'), { css: panelCss('back') });
  const inner = await render(browser, 'index.html', path.join(tmp, 'inner.pdf'), {
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
  fs.writeFileSync(path.join(OUT, 'parlay-squares.pdf'), await doc.save());
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('PDFs written to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
