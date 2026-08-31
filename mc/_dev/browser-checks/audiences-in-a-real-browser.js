/* THE AUDIENCES ROOM IN REAL CHROME.
 *
 * jsdom does no layout, so every headless suite here STUBS getBoundingClientRect
 * and is therefore blind to geometry -- which is exactly what a 33-column table
 * is. This one measures: how wide the table really is, whether the panel really
 * scrolls sideways while the page does not, whether the key column really holds
 * its position at the left edge, and whether a swatch really paints.
 *
 * Run with a plain `python -m http.server` in the repo root, over http, never
 * file:// -- the page's links are root-absolute and resolve to nothing there.
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 8975;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROWS = fs.readFileSync('C:/tmp/fx-aud.json', 'utf8');
const PLACES = fs.readFileSync('C:/tmp/fx-places.json', 'utf8');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    /* THE ADMIN GATE IS STUBBED BY REPLACING THE MODULE, not by defining a global
       first: the page loads admin-auth.js with a <script src>, which would
       overwrite anything set beforehand. */
    if (/\/mc\/js\/admin-auth\.js/.test(u)) {
      return req.respond({ contentType: 'application/javascript', body:
        'window.TgbMcAdminAuth={create:function(o){return{getSession:function(){return null;},'
        + 'init:function(){document.body.classList.add("mc-auth-authorized");o.onAuthorized();}};}};' });
    }
    /* A STUBBED CROSS-ORIGIN RESPONSE STILL HAS TO PASS CORS, and the page sends
       `apikey` and `Authorization`, which makes every read a PREFLIGHTED one.
       Without these the browser blocks the reply and the room renders empty --
       which looks exactly like the page being broken. It was the harness. */
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    };
    if (/supabase\.co/.test(u) && req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: CORS, body: '' });
    }
    if (/supabase\.co\/rest\/v1\/audiences/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: ROWS });
    }
    if (/supabase\.co\/rest\/v1\/places/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: PLACES });
    }
    if (/supabase\.co/.test(u))
      return req.respond({ contentType: 'application/json', headers: CORS, body: '[]' });
    req.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/mc/audiences/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('tbody tr', { timeout: 8000 }).catch(() => {});

  const m = await page.evaluate(() => {
    const tbl = document.querySelector('tbody') && document.querySelector('tbody').closest('table');
    const panel = document.getElementById('tableHost');
    const firstHead = document.querySelector('thead tr:nth-child(2) th');
    const row = document.querySelector('tbody tr');
    const key = row && row.children[0];
    const keyBox = key && key.getBoundingClientRect();
    /* SCROLL IT RIGHT, THEN ASK WHERE THE KEY IS. Sticky is a declaration until
       something actually scrolls past it. */
    if (panel) panel.scrollLeft = 900;
    const keyAfter = key && key.getBoundingClientRect();
    const keyBg = key ? getComputedStyle(key).backgroundColor : '';
    /* DOES THE ROW ACTUALLY SLIDE UNDER THE KEY, or through it? The only way to
       ask is to put a cell behind it and read the pixel: elementFromPoint at the
       key's own centre must answer the key, not whatever is scrolled beneath. */
    const kc = keyAfter ? document.elementFromPoint(keyAfter.left + keyAfter.width / 2,
                                                   keyAfter.top + keyAfter.height / 2) : null;
    const keyOnTop = !!(kc && (kc === key || key.contains(kc)));
    /* THE RED PEN IS FOR A SENTENCE. If it grows into a paragraph it climbs over
       the room's own title, which is what 499 named ids did. */
    const scrib = document.getElementById('pageStatus');
    const sb = scrib ? scrib.getBoundingClientRect() : null;
    const head = document.querySelector('.room-title, h1');
    const hb = head ? head.getBoundingClientRect() : null;
    const sw = document.querySelector('.swatch');
    const swBox = sw && sw.getBoundingClientRect();
    return {
      rows: document.querySelectorAll('tbody tr').length,
      headers: document.querySelectorAll('thead tr:nth-child(2) th').length,
      bands: [...document.querySelectorAll('thead .bandrow th')].map((x) => x.textContent).filter(Boolean),
      tableW: tbl ? Math.round(tbl.getBoundingClientRect().width) : 0,
      panelW: panel ? Math.round(panel.clientWidth) : 0,
      panelScrollW: panel ? Math.round(panel.scrollWidth) : 0,
      pageScrollW: Math.round(document.documentElement.scrollWidth),
      pageW: Math.round(document.documentElement.clientWidth),
      keyLeftBefore: keyBox ? Math.round(keyBox.left) : -1,
      keyLeftAfter: keyAfter ? Math.round(keyAfter.left) : -1,
      keyVisible: keyAfter ? keyAfter.width > 0 && keyAfter.left >= 0 : false,
      headerText: firstHead ? firstHead.textContent : '',
      swatches: document.querySelectorAll('.swatch').length,
      swW: swBox ? Math.round(swBox.width) : 0,
      swH: swBox ? Math.round(swBox.height) : 0,
      swColour: sw ? getComputedStyle(sw).backgroundColor : '',
      swDisplay: sw ? getComputedStyle(sw).display : '',
      keyBg: keyBg, keyOnTop: keyOnTop,
      scribH: sb ? Math.round(sb.height) : 0,
      scribText: scrib ? scrib.textContent.trim() : '',
      overlapsTitle: !!(sb && hb && sb.height > 0 && sb.bottom > hb.bottom + 4 && sb.top < hb.bottom)
    };
  });

  t('the room renders its rows in a real browser (' + m.rows + ')', m.rows > 600, m.rows);
  t('all 33 columns have a header', m.headers === 34, m.headers);
  t('the six group bands are drawn', m.bands.length === 6, m.bands.join('/'));
  t('the table is genuinely wider than the panel', m.tableW > m.panelW,
    m.tableW + ' vs ' + m.panelW);
  t('so the panel scrolls sideways', m.panelScrollW > m.panelW + 50,
    m.panelScrollW + ' vs ' + m.panelW);
  /* THE ONE THAT MATTERS MOST: a wide table inside a page must never make the
     PAGE scroll sideways. That is the failure the house rule is about. */
  t('and the page itself does NOT', m.pageScrollW <= m.pageW + 1,
    m.pageScrollW + ' vs ' + m.pageW);
  t('the key column holds the left edge after scrolling 900px',
    Math.abs(m.keyLeftAfter - m.keyLeftBefore) <= 1,
    m.keyLeftBefore + ' -> ' + m.keyLeftAfter);
  t('and is still on screen', m.keyVisible, m.keyLeftAfter);
  /* A SWATCH IS A SPAN, AND WIDTH AND HEIGHT ARE IGNORED ON AN INLINE ELEMENT.
     This project has already shipped an invisible pin for exactly that. */
  t('the colour swatches are drawn (' + m.swatches + ')', m.swatches > 100, m.swatches);
  t('as a box, not an inline span with no size', m.swDisplay !== 'inline', m.swDisplay);
  t('with real width and height', m.swW >= 12 && m.swH >= 12, m.swW + 'x' + m.swH);
  t('painted a real colour', /^rgba?\(/.test(m.swColour) && m.swColour !== 'rgba(0, 0, 0, 0)',
    m.swColour);
  /* THE TWO A HEADLESS RUN CANNOT SEE. jsdom does not resolve a `var()`, so a
     background of `var(--panel)` -- a token this room never defined -- came back
     as that literal string and every non-transparent check passed over a
     completely see-through column. Only a real browser resolves it. */
  t('the sticky key column is fully opaque',
    /^rgb\(/.test(m.keyBg) && !/rgba\([^)]*0(\.\d+)?\)$/.test(m.keyBg), m.keyBg);
  t('so the scrolled rows pass BEHIND it, not through it', m.keyOnTop, m.keyBg);

  t('the red pen holds a sentence, not a paragraph', m.scribH <= 60, m.scribH + 'px');
  t('and does not climb over the room title', !m.overlapsTitle, m.scribText.slice(0, 60));
  t('it names no college ids', !/ncaaf-[a-z]+,/.test(m.scribText), m.scribText.slice(0, 80));

  t('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  /* A SCREENSHOT, BECAUSE THE MEASUREMENTS ABOVE STILL CANNOT SEE OVERLAP OR
     CLIPPING. It is written next to the check rather than asserted on. */
  await page.screenshot({ path: 'C:/tmp/audiences-room.png' });
  console.log(String.fromCharCode(10) + '  table ' + m.tableW + 'px inside a ' + m.panelW + 'px panel; page '
    + m.pageScrollW + '/' + m.pageW + '; swatches ' + m.swatches
    + '; key stayed at x=' + m.keyLeftAfter);

  await browser.close();
  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
