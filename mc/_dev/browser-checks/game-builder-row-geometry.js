/* THE THREE BOXES ON ONE ROW, MEASURED IN A REAL BROWSER.
   jsdom has no layout: `getBoundingClientRect` returns zeroes, so it cannot say
   whether three boxes fit side by side or whether one has overflowed the page.
   This project has recorded a map 43,376 pixels tall that four jsdom suites
   passed over, and the lesson each time was the same one -- get a real browser.

   THE PAGE ITSELF IS ADMIN-GATED, so rather than stub a sign-in this lifts the
   page's own <style> and the row's own markup into a standalone document. The
   row's geometry depends on nothing else: the CSS is the page's, byte for byte,
   and the fields are the page's own markup. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const SRC = fs.readFileSync('mc/games/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const styles = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join(' ');
/* LIFT THE ROW WITH A PARSER, NOT WITH indexOf. Slicing on a closing tag broke
   twice -- the markup around the row moved and the slice silently took the wrong
   bytes, which reported a page fault that was the harness's own. */
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const row = new JSDOM(SRC).window.document.querySelector('.gid-row');
if (!row || !row.querySelector('#atlasBar')) {
  console.log('  FAIL could not lift the row out of the page');
  process.exit(1);
}

const page = '<!doctype html><html><head><meta charset="utf-8"><style>'
  + 'html,body{margin:0}' + styles
  + '</style></head><body class="builder-page--editor"><main style="padding:0 24px">'
  + row.outerHTML + '</main></body></html>';
fs.writeFileSync('C:/tmp/rowgeom.html', page);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  try {
    const p = await browser.newPage();

    /* ---- the desktop arrangement ---------------------------------------- */
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto('file:///' + 'C:/tmp/rowgeom.html'.replace(/\\/g, '/'));

    const wide = await p.evaluate(() => {
      const bars = [...document.querySelectorAll('.gid-row > .game-id-bar')]
        .map((b) => { const r = b.getBoundingClientRect();
                      return { id: b.id, x: Math.round(r.x), w: Math.round(r.width),
                               top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
      return { bars,
               pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
               rowW: Math.round(document.querySelector('.gid-row').getBoundingClientRect().width) };
    });

    console.log('  1440px:', wide.bars.map((b) => b.id + ' ' + b.w + 'px').join('  '));

    t('all three are drawn', wide.bars.length === 3, wide.bars.length);
    /* ON ONE LINE means they share a top edge, which is the only thing that
       distinguishes a row from three stacked boxes with no layout to see. */
    t('and they share a top edge, so they really are on one line',
      new Set(wide.bars.map((b) => b.top)).size === 1,
      wide.bars.map((b) => b.top).join(','));
    t('left to right: anchor, audience, atlas',
      wide.bars.map((b) => b.id).join(',') === 'anchorBar,audienceBar,atlasBar'
      && wide.bars[0].x < wide.bars[1].x && wide.bars[1].x < wide.bars[2].x,
      wide.bars.map((b) => b.id + '@' + b.x).join(' '));
    t('none of them collapsed to nothing', wide.bars.every((b) => b.w > 180),
      wide.bars.map((b) => b.w).join(','));
    /* THE THREE FILL THE ROW, or the last one is floating with a gap after it. */
    const spanned = wide.bars[2].x + wide.bars[2].w - wide.bars[0].x;
    t('and they span the row, give or take the gaps',
      Math.abs(spanned - wide.rowW) <= 2, spanned + ' of ' + wide.rowW);
    /* THE AUDIENCE BOX IS THE WIDEST, because it holds two fields. */
    t('the audience box is the widest, holding two fields',
      wide.bars[1].w > wide.bars[0].w && wide.bars[1].w > wide.bars[2].w,
      wide.bars.map((b) => b.w).join(','));
    t('the page does not scroll sideways', !wide.pageWide);
    /* STRETCHED, so the three boxes end level whatever each one holds. */
    t('the three end level, because the row stretches them',
      new Set(wide.bars.map((b) => b.bottom)).size === 1,
      wide.bars.map((b) => b.bottom).join(','));

    /* ---- IT HOLDS THE LINE ON AN ORDINARY LAPTOP ------------------------
       THE BREAKPOINT WAS 1240px AND THAT WAS THE BUG: the three stacked on
       exactly the windows they were designed for. Measured with the query
       lifted out, they hold to about 900px. */
    await p.setViewport({ width: 1100, height: 900 });
    const laptop = await p.evaluate(() => {
      const bars = [...document.querySelectorAll('.gid-row > .game-id-bar')]
        .map((b) => { const q = b.querySelector('input, select');
                      return { id: b.id, top: Math.round(b.getBoundingClientRect().top),
                               inp: Math.round(q ? q.getBoundingClientRect().width : 0) }; });
      return { bars,
               pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    console.log('  1100px:', laptop.bars.map((b) => b.id.replace('Bar', '') + ' ' + b.inp + 'px').join('  '));
    t('at 1100px the three are still on one line',
      new Set(laptop.bars.map((b) => b.top)).size === 1,
      laptop.bars.map((b) => b.top).join(','));
    /* AND THEY ARE STILL FILLABLE, which is the thing a breakpoint is really
       protecting -- three boxes on a line is worth nothing if every combo in
       them is too narrow to read a value in. */
    t('and every combo is still wide enough to use',
      laptop.bars.every((b) => b.inp > 180), laptop.bars.map((b) => b.inp).join(','));
    t('the page does not scroll sideways there', !laptop.pageWide);

    /* ---- and below the breakpoint it does break up ----------------------- */
    await p.setViewport({ width: 860, height: 900 });
    const narrow = await p.evaluate(() => {
      const bars = [...document.querySelectorAll('.gid-row > .game-id-bar')]
        .map((b) => { const r = b.getBoundingClientRect();
                      return { id: b.id, w: Math.round(r.width), top: Math.round(r.top) }; });
      return { bars,
               pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    console.log('   860px:', narrow.bars.map((b) => b.id.replace('Bar', '') + ' ' + b.w + 'px').join('  '));
    t('under the breakpoint each is its own full-width bar again',
      new Set(narrow.bars.map((b) => b.top)).size === 3,
      narrow.bars.map((b) => b.top).join(','));
    t('and none of them is squeezed', narrow.bars.every((b) => b.w > 600),
      narrow.bars.map((b) => b.w).join(','));
    t('the page still does not scroll sideways', !narrow.pageWide);

    /* ---- a phone --------------------------------------------------------- */
    await p.setViewport({ width: 390, height: 780 });
    const phone = await p.evaluate(() => ({
      pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      anyOver: [...document.querySelectorAll('.gid-row input')]
        .some((i) => i.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
    }));
    t('at 390px nothing overflows the page', !phone.pageWide && !phone.anyOver,
      JSON.stringify(phone));

    console.log('');
    console.log(ok + ' ok, ' + bad + ' FAIL');
    process.exit(bad ? 1 : 0);
  } finally {
    await browser.close();
  }
})();
