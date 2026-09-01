/* HOW WIDE A FIELD IS, MEASURED IN A REAL BROWSER.
   ---------------------------------------------------------------------------
   THIS REPLACES game-builder-row-geometry.js, whose whole subject was the flex
   row that held the anchor, the audiences and the map. That row went on
   2026-08-31 -- each has its own line -- so the question is no longer whether
   three boxes FIT side by side. It is whether the CONTROLS INSIDE THEM are the
   width of what they hold.

   EVERY BAR IS FULL WIDTH, deliberately: they are the page's structure and they
   line up down the left edge. THE FIELDS ARE NOT. A 40-character event label in
   a 1,384px box reads as an input that has lost its neighbour, and the page had
   six of them stacked -- the anchor, the map, the tagline, the intro, the tag
   box and the game name were all the width of the room.

   jsdom CANNOT SEE ANY OF THIS: it has no layout, so every width is zero and a
   suite there passes over an input the width of the screen. This project has
   recorded a map 43,376 pixels tall that four jsdom suites passed over.

   THE PAGE IS ADMIN-GATED, so rather than stub a sign-in this lifts the bars'
   own markup and the page's own <style>, byte for byte -- the approach the row
   geometry check already used, and for the same reason. */
const fs = require('fs');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');

const SRC = fs.readFileSync('mc/games/index.html', 'utf8');
const styles = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join(' ');
const doc = new JSDOM(SRC).window.document;

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const ORDER = ['anchorBar', 'audienceBar', 'cityBar', 'mapBar',
               'gameIdentityBar', 'guideBar', 'tagsBar'];
const bars = ORDER.map((id) => doc.getElementById(id)).filter(Boolean);
if (bars.length !== ORDER.length) {
  console.log('  FAIL could not lift all seven bars   got: ' + bars.length);
  process.exit(1);
}

/* THE GATE COMES OFF, so the fields are drawn as somebody working would see
   them rather than in their disabled state. */
bars.forEach((b) => b.querySelectorAll('[disabled]').forEach((n) => n.removeAttribute('disabled')));
/* AND A REAL EVENT LABEL GOES IN, because the question is whether a whole one
   fits beside the new button. */
const ae = doc.getElementById('anchorEventInput');
if (ae) ae.setAttribute('value', 'Sat 4 Oct 2026 - sports - Bears at Saints');

const page = '<!doctype html><html><head><meta charset="utf-8"><style>'
  + 'html,body{margin:0;font-family:system-ui,sans-serif}' + styles + '</style></head>'
  + '<body class="builder-page--editor">'
  + '<main class="games-page builder-editor-page" style="padding:24px">'
  + bars.map((b) => b.outerHTML).join('\n') + '</main></body></html>';
fs.writeFileSync('C:/tmp/gb-widths.html', page);

const read = (p) => p.evaluate(() => {
  const px = (n) => Math.round(n);
  const w = (sel) => { const n = document.querySelector(sel);
    return n ? px(n.getBoundingClientRect().width) : 0; };
  const h = (sel) => { const n = document.querySelector(sel);
    return n ? px(n.getBoundingClientRect().height) : 0; };
  return {
    bars: [...document.querySelectorAll('.game-id-bar')].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id, x: px(r.x), w: px(r.width), y: px(r.y), h: px(r.height) };
    }),
    anchor: w('#anchorEventInput'), map: w('#gameMapInput'), city: w('#nodeCityInput'),
    target: w('#targetAudienceInput'), rival: w('#rivalAudienceInput'),
    name: w('#nodeTitleInput'), tagline: w('#nodeTaglineInput'), intro: w('#nodeBodyInput'),
    tag: w('#nodeTagNewInput'),
    /* THE DOOR BUTTONS ARE GONE -- see below. */
    inputH: h('#anchorEventInput'),
    page: document.documentElement.clientWidth,
    sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
});

/* ---- THE REAL PAGE, for the things a lifted fragment cannot show ---------
   Served over http, because this page's cross-folder links are root-absolute
   and none of them resolves under file://. */
const http = require('http');
const pathmod = require('path');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };
const GAME = {
  id: 'oswald', name: 'Oswald New Orleans', city: 'New Orleans, Louisiana',
  city_name: 'New Orleans', state_code: 'LA', tagline: 'A walk', body: 'Intro.',
  price: '25', engine: 'text', status: 'building', archived: 'YES',
  tags: [], teams: [], nodes: null
};
let server = null;
function serve() {
  if (server) return Promise.resolve();
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let f = pathmod.join('C:/Code/the-game-bureau', decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = pathmod.join(f, 'index.html');
    fs.readFile(f, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[pathmod.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((r) => server.listen(8814, r));
}
async function realPage(browser) {
  await serve();
  const p = await browser.newPage();
  await p.setViewport({ width: 1600, height: 1100 });
  await p.evaluateOnNewDocument(() => {
    window.__authed = null;
    window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
      return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
    window.TgbAdminSiteNav = { bindAuth: () => {} };
  });
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                   'access-control-expose-headers': 'content-range' };
    if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
    const body = u.indexOf('/games') !== -1 ? [GAME] : [];
    req.respond({ status: 200, contentType: 'application/json',
      headers: Object.assign({ 'content-range': '0-0/' + body.length }, cors),
      body: JSON.stringify(body) });
  });
  await p.goto('http://127.0.0.1:8814/mc/games/index.html?id=oswald',
    { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    document.body.classList.add('mc-auth-authorized');
    if (window.__authed) await window.__authed();
  });
  await new Promise((r) => setTimeout(r, 600));
  return p;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  try {
    const p = await browser.newPage();

    /* ---- a desktop window ---------------------------------------------- */
    await p.setViewport({ width: 1500, height: 1200 });
    await p.goto('file:///C:/tmp/gb-widths.html');
    await new Promise((r) => setTimeout(r, 400));
    const m = await read(p);

    /* THE BARS ARE THE PAGE'S STRUCTURE and line up down the left edge. */
    /* SEVEN SINCE 2026-08-31. Status LEFT for the nav row, being the one
       DECISION on the page rather than a fact about the game; GUIDE ARRIVED
       from the inspector drawer, being part of what the game IS. */
    t('seven bars, each on its own line, all the same width',
      m.bars.length === 7
      && m.bars.every((b) => b.x === m.bars[0].x && b.w === m.bars[0].w),
      m.bars.map((b) => b.id + ' x' + b.x + ' w' + b.w).join('  '));
    t('and in the order the work runs in',
      m.bars.map((b) => b.id).join(',') === ORDER.join(','),
      m.bars.map((b) => b.id).join(','));
    /* STACKED, NOT SIDE BY SIDE. Every bar starts below the one before it. */
    t('stacked, never side by side',
      m.bars.every((b, i) => i === 0 || b.y >= m.bars[i - 1].y + m.bars[i - 1].h - 1),
      m.bars.map((b) => b.y).join(','));

    /* ---- AND NO FIELD IS THE WIDTH OF THE ROOM ------------------------- */
    /* THE FAULT THIS CHECK IS FOR. At 1500px the bar is 1,452 wide; every one
       of these measured within a few pixels of that before the caps went in. */
    const barW = m.bars[0].w;
    const wide = [['anchor', m.anchor], ['map', m.map], ['city', m.city],
                  ['target', m.target], ['rival', m.rival], ['name', m.name],
                  ['tagline', m.tagline], ['intro', m.intro], ['tag', m.tag]]
      .filter(([, v]) => v > barW * 0.75);
    t('no field is the width of the room',
      wide.length === 0, wide.map((x) => x[0] + ' ' + x[1]).join(', '));

    /* AND NONE IS TOO NARROW TO READ ITS OWN GUIDE TEXT. The audience pair came
       to 362px each when it split one line's measure, which clipped its own
       placeholder mid-word: `Auto filled or type or tap to choose an Exist`. */
    t('and none is too narrow for the sentence printed in it',
      m.target >= 460 && m.rival >= 460 && m.anchor >= 460,
      [m.target, m.rival, m.anchor].join('/'));

    /* THE DOOR-BESIDE-THE-FIELD ASSERTION IS RETIRED, not repointed again.
       It measured the anchor door, then the map door, and by the end of
       2026-08-31 BOTH had become their box's legend -- so there is no `new`
       button left on this page to measure. Repointing a third time would be
       hunting for a survivor rather than checking anything.

       WHAT IT WAS PROTECTING -- that a door is a real control the height of
       its input rather than bare blue text half outside the bar -- no longer
       applies to a legend, which takes the legend's own metrics. The three
       doors are checked in game-builder-boxes.js instead. */

    t('and the page never scrolls sideways', !m.sideways);

    /* ---- THE CAPS HOLD AT EVERY WIDTH ---------------------------------- */
    /* A cap that is undone by a media query is a cap that puts the fault back
       at a narrower window, which is exactly what happened: an old query wrote
       `max-width: none` on the anchor below 1100px, and it measured 965 there
       against 675 at 1500. */
    const anchors = [m.anchor];
    for (const width of [1200, 1100, 900, 820]) {
      await p.setViewport({ width: width, height: 1200 });
      await new Promise((r) => setTimeout(r, 250));
      const n = await read(p);
      anchors.push(n.anchor);
      t('at ' + width + 'px no field is the width of the room',
        [n.anchor, n.map, n.city, n.target, n.rival, n.name, n.tagline, n.intro, n.tag]
          .every((v) => v <= n.bars[0].w * 0.99),
        n.bars[0].w + ' bar');
      t('and the page still never scrolls sideways at ' + width + 'px', !n.sideways);
    }
    /* THE ANCHOR IS THE ONE THAT WAS BEING RELEASED, so it is asserted directly:
       its measure must not grow as the window narrows. */
    t('the anchor keeps one measure at every width',
      anchors.every((v) => v <= anchors[0]), anchors.join('/'));

    /* ---- AND THE WHOLE COLUMN IS ONE MEASURE, IN THE REAL PAGE --------
       REPORTED AS: the elements start the right width and then pop to the full
       page. `.games-page` is capped and centred ONLY under
       `body.builder-page--editor.is-header-only`, and that class comes off the
       moment the flow canvas is shown -- taking the cap off everything in the
       page with it. At 1600px the bars went 1180 -> 1537, nearly edge to edge,
       while the row directly above them stayed at 1180.

       THE LIFTED HARNESS ABOVE IS STRUCTURALLY BLIND TO IT: it has no
       `.games-page`, no `is-header-only` and no room head, so 16 assertions
       passed over a page popping to full width. This loads the real one. */
    const real = await realPage(browser);
    try {
      const col = await real.evaluate(() => {
        const box = (sel) => { const n = document.querySelector(sel);
          if (!n) return null; const r = n.getBoundingClientRect();
          return { x: Math.round(r.x), w: Math.round(r.width) }; };
        return { head: box('.room-head'), nav: box('.builder-nav-rows'),
                 bar: box('#anchorBar'), last: box('#tagsBar'),
                 headerOnly: document.body.classList.contains('is-header-only') };
      });
      /* THE CANVAS MODE IS THE ONE THAT BROKE. In header-only mode the parent is
         already capped, so a max-width there is a no-op and proves nothing. */
      t('the real page is in canvas mode, where the cap came off', !col.headerOnly,
        col.headerOnly);
      t('the room head, the nav row and the bars are one column',
        col.head && col.nav && col.bar && col.last
        && col.head.x === col.nav.x && col.nav.x === col.bar.x && col.bar.x === col.last.x
        && col.head.w === col.nav.w && col.nav.w === col.bar.w && col.bar.w === col.last.w,
        [col.head, col.nav, col.bar, col.last].map((b) => b ? b.w + '@' + b.x : '-').join('  '));
      /* AND IT IS THE SHELL MEASURE, not merely equal to each other: three
         things agreeing at 1537 would pass an equality check and still be the
         fault that was reported. */
      t('and that column is the shell measure, not the window',
        col.bar.w <= 1180, col.bar.w);
    } finally {
      await real.close();
    }

  } finally {
    await browser.close();
    if (server) server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
})();
