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

/* SEVEN. The AUDIENCES bar came back on 2026-09-02, and the NAME moved to the
   front of the page the same day -- it sat fifth, so the first four things you
   answered were about a game you had not named yet. */
/* `tgbDateBar` IS GONE (2026-09-05). The date stopped being a bar of its own
   and became START -- a date, a time and a timezone -- NESTED inside GAME, so
   there is no top-level bar to measure and the one that replaced it is measured
   with its parent. */
const ORDER = ['gameNameBar', 'anchorBar', 'audienceBar', 'cityBar', 'mapBar',
               'gameIdentityBar', 'guideBar', 'tagsBar'];
const bars = ORDER.map((id) => doc.getElementById(id)).filter(Boolean);
if (bars.length !== ORDER.length) {
  console.log('  FAIL could not lift every bar   got: ' + bars.length);
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
    /* A BAR IS ONE WHOSE NEAREST BAR ANCESTOR IS ITSELF. Nothing is nested
       today -- START was a fieldset inside GAME for a day and is a sibling of
       it since 2026-09-05 -- but the next box to hold a box would be measured
       as a bar and report the row as broken. */
    bars: [...document.querySelectorAll('.game-id-bar')]
      .filter((b) => !b.parentElement || !b.parentElement.closest('.game-id-bar'))
      .map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id, x: px(r.x), w: px(r.width), y: px(r.y), h: px(r.height) };
    }),
    anchor: w('#anchorEventInput'), map: w('#gameMapInput'), city: w('#nodeCityInput'),
    target: w('#target'), rival: w('#rival'),
    /* THE IDS MOVED WHEN THE PICKERS BECAME PLAIN BOXES, and these two were
       left naming the old ones -- so both measured 0 and the assertion below
       reported `0/0/736` about fields that are perfectly wide. **A measurement
       of an element that is not there reads as a page fault**, which is why it
       is worth repointing rather than relaxing. */
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
    /* THE COUNT IS ORDER'S, NOT A LITERAL (2026-09-02). It was a hard 7, so
       adding GAME NAME to the list above failed this assertion while the page
       was perfectly correct -- two places holding one number, kept in step by
       hand. Now there is one.
         Status LEFT for the nav row on 2026-08-31, being the one DECISION on
       the page rather than a fact about the game; GUIDE ARRIVED from the
       inspector drawer, being part of what the game IS. */
    t('every bar on its own line, all the same width',
      m.bars.length === ORDER.length
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
    /* THE PAIR SPLITS ONE MEASURE, so each half must still be wide enough to
       read its own guide sentence. They came to 362px each when they split a
       LINE's measure rather than a PAIR's, which clipped the placeholder
       mid-word. */
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
        [n.anchor, n.map, n.city, n.target, n.rival, n.name, n.tagline, n.intro, n.tag].join('/')
          + ' vs bar ' + n.bars[0].w);
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

      /* ---- THE NAME AND START SHARE A ROW (2026-09-05) ------------------
         START takes its CONTENT and the name takes what is LEFT, which is a
         claim about two viewports rather than one: START is the same width at
         1600 and at 1200 while the name shrinks with the window. A single
         measurement cannot tell those apart, and `the name is the wider of the
         two` -- the first assertion written here -- is not the claim at all:
         START holds four controls and comes out 616 against the name's 552. */
      const pairAt = async (w) => {
        await real.setViewport({ width: w, height: 900 });
        await new Promise((r) => setTimeout(r, 300));
        return real.evaluate(() => {
          const box = (sel) => { const el = document.querySelector(sel);
            if (!el) return null; const r = el.getBoundingClientRect();
            return { x: Math.round(r.x), w: Math.round(r.width),
                     y: Math.round(r.y), right: Math.round(r.right) }; };
          return { pair: box('.gid-pair'), name: box('#gameNameBar'),
                   start: box('#startBar'), anchor: box('#anchorBar'),
                   sideways: document.documentElement.scrollWidth
                     > document.documentElement.clientWidth };
        });
      };
      const wide = await pairAt(1600);
      const mid = await pairAt(1200);
      const narrow = await pairAt(900);
      t('the pair is the same column as the bars below it',
        wide.pair && wide.anchor && wide.pair.x === wide.anchor.x
        && wide.pair.w === wide.anchor.w,
        [wide.pair, wide.anchor]);
      t('and the two boxes share a top edge',
        wide.name.y === wide.start.y, [wide.name.y, wide.start.y]);
      t('and they fill the row between them',
        wide.name.x === wide.pair.x && wide.start.right === wide.pair.right,
        wide);
      /* THE CLAIM ITSELF: START does not move with the window and the name
         does. */
      t('START takes its content at both widths',
        wide.start.w === mid.start.w, [wide.start.w, mid.start.w]);
      t('and the name takes what is left',
        mid.name.w < wide.name.w, [wide.name.w, mid.name.w]);
      /* AND IT WRAPS RATHER THAN SQUEEZING. Under 1000px the name is down to
         its own floor and START's three controls are already at their own
         width, so the next thing to give is the row. */
      t('and under 1000px they stack, each the full row',
        narrow.name.y < narrow.start.y && narrow.name.w === narrow.pair.w
        && narrow.start.w === narrow.pair.w, narrow);
      t('and the page never scrolls sideways at any of the three',
        !wide.sideways && !mid.sideways && !narrow.sideways,
        [wide.sideways, mid.sideways, narrow.sideways]);
      await real.setViewport({ width: 1600, height: 900 });
      await new Promise((r) => setTimeout(r, 300));
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

      /* NOTHING EMPTY PAINTS BELOW THE LAST BAR.
         The inspector drawer drew a 1180x25 grey pill under the tags bar with
         nothing in it. Only a browser can say so: the markup was correct at
         every stage, and what made it visible was `#inspector` carrying its own
         background, border, radius and shadow while every child was hidden. */
      const tail = await real.evaluate(() => {
        const bars = [...document.querySelectorAll('.game-id-bar')]
          .filter((b) => b.getBoundingClientRect().height > 4);
        const last = bars[bars.length - 1];
        if (!last) return { noBars: true };
        const floor = last.getBoundingClientRect().bottom + window.scrollY;
        const junk = [];
        document.querySelectorAll('main *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height < 4 || r.width < 60) return;
          if (r.top + window.scrollY < floor + 2) return;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const paints = cs.borderTopWidth !== '0px'
            || (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)')
            || (cs.boxShadow && cs.boxShadow !== 'none');
          if (!paints) return;
          if ((el.textContent || '').replace(/[\s\u00a0]+/g, '')) return;
          junk.push((el.tagName + (el.id ? '#' + el.id : '')).toLowerCase()
            + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
        });
        return { junk: junk };
      });
      t('nothing empty paints below the last bar',
        !tail.noBars && tail.junk.length === 0, tail.junk);

      /* THE CHROME SITS ON THE COLUMN TOO.
         The nav bar and the gears watermark are both positioned by the SHARED
         `admin-site-nav.js`, against `.admin-site-nav-host`. On every other mc
         room that host IS the content column; on this page it is a full-width
         `main`, so both landed at the screen edge -- the brand at x=24 with the
         links flung out to x=2103, and the gears a thousand pixels left of
         anything. Only a real browser at a wide viewport can see it. */
      await real.setViewport({ width: 2200, height: 900 });
      await new Promise((r) => setTimeout(r, 900));
      const chrome = await real.evaluate(() => {
        const x = (sel) => { const n = document.querySelector(sel);
          return n ? Math.round(n.getBoundingClientRect().x) : null; };
        const r = (sel) => { const n = document.querySelector(sel);
          return n ? Math.round(n.getBoundingClientRect().right) : null; };
        return { brand: x('.asn-brand'), head: x('.room-head'),
                 links: r('.asn-links'), headEnd: r('.room-head'),
                 gear: x('.asn-page-gear'),
                 wide: document.documentElement.scrollWidth > window.innerWidth };
      });
      t('the nav brand starts on the content column',
        chrome.brand !== null && chrome.brand === chrome.head, chrome);
      t('and the nav links end with it',
        chrome.links !== null && Math.abs(chrome.links - chrome.headEnd) <= 60, chrome);
      /* THE GEARS OVERHANG THE COLUMN BY THE SHARED SHEET'S OWN 58px, which is
         the whole point of them: they sit just outside the content, not at the
         edge of the screen. */
      t('and the gears overhang that column rather than the screen',
        chrome.gear !== null && chrome.head - chrome.gear === 58,
        { gear: chrome.gear, head: chrome.head, overhang: chrome.head - chrome.gear });
      t('with no sideways scroll at 2200px', chrome.wide === false);
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
