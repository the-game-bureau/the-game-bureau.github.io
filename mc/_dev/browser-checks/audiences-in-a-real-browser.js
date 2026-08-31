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

  /* OPEN A ROW, because the whole shape of this room is that a row is one line
     until you do. The measurements below are about what that opening costs. */
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('tr.row-head')].find((x) => x.dataset.row === 'nfl-tampa');
    r.scrollIntoView({ block: 'center' });
    r.querySelector('[data-open]').click();
  });
  await new Promise((r) => setTimeout(r, 200));

  const m = await page.evaluate(() => {
    const panel = document.getElementById('tableHost');
    const tbl = panel.querySelector('table');
    const det = [...document.querySelectorAll('tr.row-detail')].find((x) => x.dataset.detail === 'nfl-tampa');
    const fields = det ? [...det.querySelectorAll('.field')] : [];
    const boxes = fields.map((f) => f.getBoundingClientRect());
    /* DO ANY TWO FIELDS OVERLAP? A grid says they should not, and jsdom cannot
       answer it at all -- it has no layout, so every box there is zero by zero. */
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right - 1 && b.left < a.right - 1
            && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
      }
    }
    const sw = det && det.querySelector('.swatch');
    const swBox = sw && sw.getBoundingClientRect();
    const blurb = document.querySelector('.room-blurb');
    const bb = blurb ? blurb.getBoundingClientRect() : null;
    const bar = document.querySelector('.bar-row, .command-bar');
    const barB = bar ? bar.getBoundingClientRect() : null;
    const scrib = document.getElementById('pageStatus');
    const sb = scrib ? scrib.getBoundingClientRect() : null;
    const head = document.querySelector('.room-title, h1');
    const hb = head ? head.getBoundingClientRect() : null;
    const key = document.querySelector('tr.row-head td:nth-child(2)');
    return {
      rows: document.querySelectorAll('tr.row-head').length,
      headCells: document.querySelector('tr.row-head').children.length,
      fields: fields.length,
      groups: det ? det.querySelectorAll('.fgroup').length : 0,
      overlaps: overlaps,
      widestField: boxes.length ? Math.round(Math.max(...boxes.map((b) => b.width))) : 0,
      cols: boxes.length ? new Set(boxes.map((b) => Math.round(b.left))).size : 0,
      tableW: Math.round(tbl.getBoundingClientRect().width),
      panelW: Math.round(panel.clientWidth),
      panelScrollW: Math.round(panel.scrollWidth),
      pageScrollW: Math.round(document.documentElement.scrollWidth),
      pageW: Math.round(document.documentElement.clientWidth),
      swW: swBox ? Math.round(swBox.width) : 0,
      swH: swBox ? Math.round(swBox.height) : 0,
      swColour: sw ? getComputedStyle(sw).backgroundColor : '',
      swDisplay: sw ? getComputedStyle(sw).display : '',
      /* BODY CELLS ONLY. The thead sticks VERTICALLY on purpose, so the header
         stays while you scroll down; counting it here would fail on a rule that
         is doing its job. What must not exist is a FROZEN COLUMN. */
      stickies: [...document.querySelectorAll('tbody td')]
        .filter((c) => getComputedStyle(c).position === 'sticky').length,
      blurbBottom: bb ? Math.round(bb.bottom) : 0,
      barTop: barB ? Math.round(barB.top) : 0,
      scribH: sb ? Math.round(sb.height) : 0,
      scribText: scrib ? scrib.textContent.trim() : '',
      overlapsTitle: !!(sb && hb && sb.height > 0 && sb.bottom > hb.bottom + 4 && sb.top < hb.bottom)
    };
  });

  t('the room renders its rows in a real browser (' + m.rows + ')', m.rows > 600, m.rows);
  t('a closed row is seven cells, not thirty-three', m.headCells === 7, m.headCells);
  /* THE POINT OF THE WHOLE CHANGE: the table fits the panel now. */
  t('so the table fits its panel and never scrolls sideways',
    m.panelScrollW <= m.panelW + 1, m.panelScrollW + ' vs ' + m.panelW);
  t('and neither does the page', m.pageScrollW <= m.pageW + 1, m.pageScrollW + ' vs ' + m.pageW);

  t('opening a row shows all 23 fields', m.fields === 23, m.fields);
  t('under six group headings', m.groups === 6, m.groups);
  t('laid out in real columns, not stacked', m.cols >= 3, m.cols);
  t('with no two fields on top of each other', m.overlaps === 0, m.overlaps);
  t('and none of them squeezed to nothing', m.widestField >= 180, m.widestField);

  /* A SWATCH IS A SPAN, AND WIDTH AND HEIGHT ARE IGNORED ON AN INLINE ELEMENT.
     This project has already shipped an invisible pin for exactly that. */
  t('a colour is drawn as a box, not an inline span with no size',
    m.swDisplay !== 'inline', m.swDisplay);
  t('with real width and height', m.swW >= 12 && m.swH >= 12, m.swW + 'x' + m.swH);
  t('painted a real colour', /^rgba?\(/.test(m.swColour) && m.swColour !== 'rgba(0, 0, 0, 0)',
    m.swColour);

  /* NOTHING IS FROZEN ANY MORE, and that is asserted rather than assumed: a
     sticky column on a table that fits is dead CSS, and dead CSS is how a room
     ends up with a rule nobody can explain. */
  t('no column is frozen, because none needs to be', m.stickies === 0, m.stickies);

  t('the red pen holds a sentence, not a paragraph', m.scribH <= 60, m.scribH + 'px');
  t('and does not climb over the room title', !m.overlapsTitle, m.scribText.slice(0, 60));
  t('the blurb sits above the bar rather than through it',
    m.blurbBottom <= m.barTop + 1, m.blurbBottom + ' vs ' + m.barTop);
  t('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  await page.screenshot({ path: 'C:/tmp/audiences-room.png' });
  console.log(String.fromCharCode(10) + '  table ' + m.tableW + 'px in a ' + m.panelW
    + 'px panel; page ' + m.pageScrollW + '/' + m.pageW + '; open row = ' + m.fields
    + ' fields in ' + m.cols + ' columns, widest ' + m.widestField + 'px');

  await browser.close();
  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
