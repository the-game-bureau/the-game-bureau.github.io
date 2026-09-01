/* THE FORMULA DRAWS AS WHAT A GAME IS MADE OF.
   ---------------------------------------------------------------------------
       GAME INFO
       ANCHOR EVENT | AUDIENCES |  MAP
                                   STOP
                                   WAYPOINT | CHALLENGE

   A breakdown chart: the game across the top, the three things it names under
   it, and under the map what a map is made of. It drew as an EQUATION until
   2026-08-31 -- `waypoint + challenge = stop -> atlas` -- which said one true
   thing about two of the rooms and could not say the rest.

   MEASURED IN REAL CHROME, because every claim here is a claim about LAYOUT:
   which card is left of which, which two share a column, whether the nesting
   reads. jsdom has no layout and would pass over all of it. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.ico': 'image/x-icon' };

let ok = 0, fail = 0;
const t = (what, pass, got) => {
  if (pass) { ok++; console.log('  ok  ' + what); }
  else { fail++; console.log('  FAIL ' + what + (got === undefined ? '' : '   got: ' + got)); }
};

/* THE SEVEN, BY THE HEADING EACH CARD SHOWS. Found by label rather than by
   position, so a reorder in the nav fails loudly here instead of quietly
   drawing the wrong room in the wrong box. */
const GAME = 'Game Builder';
const ANCHOR = 'Anchor Events';
const AUD = 'Audiences';
const MAP = 'TGB Atlas';
const STOP = 'Stops Builder';
const WP = 'Waypoint Library';
const CH = 'Challenge Bank';
const NEED = [GAME, ANCHOR, AUD, MAP, STOP, WP, CH];

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(8807, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
    await p.setViewport({ width: 1360, height: 1000 });
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
      req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
        body: JSON.stringify([]) });
    });

    const read = async () => p.evaluate(() => {
      const g = document.querySelector('.mc-hub-grid--flow');
      if (!g) return null;
      const box = (n) => { const r = n.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y),
                 w: Math.round(r.width), h: Math.round(r.height),
                 right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
      const cards = {};
      [...g.querySelectorAll('.mc-hub-card')].forEach((c) => {
        cards[c.querySelector('h2').textContent.trim()] = box(c);
      });
      return {
        cards: cards,
        grid: box(g),
        /* THE CHART DRAWS NO CONNECTORS. A containment diagram states the
           nesting by ALIGNMENT, so a sign or an arrow left behind would be a
           mark saying something the layout already says. */
        marks: g.querySelectorAll('.flow-mark, .flow-sign, .flow-word, .flow-arrow').length,
        /* THE WHOLE CARD IS THE LINK, so a button drawn inside it is a control
           inside a control -- and `OPEN TOOL` on every card in the directory is
           furniture rather than information. */
        buttons: g.querySelectorAll('.mc-hub-card-button').length,
        anchors: [...g.querySelectorAll('.mc-hub-card')].filter((c) =>
          c.tagName === 'A' && c.getAttribute('href')).length,
        /* THE GAME IS THE TITLE OF THE DIAGRAM, so it is measured like one.
           CENTRED IS THE GAPS EITHER SIDE MATCHING, not a property being set:
           the card is a GRID, so `text-align` on the heading centres the text
           inside a box that is itself sitting left. Both have to be right and
           only the geometry can say so. */
        title: (() => {
          const card = g.querySelector('.flow-game');
          if (!card) return null;
          const h = card.querySelector('h2');
          const cr = card.getBoundingClientRect(), hr = h.getBoundingClientRect();
          return {
            px: Math.round(parseFloat(getComputedStyle(h).fontSize)),
            caps: getComputedStyle(h).textTransform,
            text: h.textContent.trim(),
            left: Math.round(hr.x - cr.x),
            right: Math.round(cr.right - hr.right),
            fits: hr.width <= cr.width + 1,
            blurb: !!card.querySelector('p'),
            blurbText: (card.querySelector('p') || {}).textContent,
            navBlurb: (window.TgbMcAdminNav.getGroups()[0].items[0] || {}).description
          };
        })(),
        /* THE ANCHOR IS CENTRED AND SHOUTED TOO -- it is the first thing a
           game names, so it reads as a heading rather than as one of three
           cards in a row. Measured the same way as the title: equal gaps,
           because `text-align` alone leaves the heading BOX sitting left in a
           grid however its own text is set. */
        anchor: (() => {
          const card = g.querySelector('.flow-anchor');
          if (!card) return null;
          const h = card.querySelector('h2');
          const cr = card.getBoundingClientRect(), hr = h.getBoundingClientRect();
          return {
            caps: getComputedStyle(h).textTransform,
            left: Math.round(hr.x - cr.x),
            right: Math.round(cr.right - hr.right),
            blurbAlign: getComputedStyle(card.querySelector('p')).textAlign,
            blurb: card.querySelector('p').textContent.trim(),
            text: h.textContent.trim()
          };
        })(),
        /* EVERY BOX IS CENTRED AND SHOUTED -- this is a DIAGRAM, not a
           directory. Measured per card as EQUAL GAPS either side of the
           heading, because `text-align` alone leaves the heading BOX sitting
           left in a grid however its own text is set: both declarations are
           needed and one alone looks right. */
        boxes: [...g.querySelectorAll('.mc-hub-card')].map((card) => {
          const h = card.querySelector('h2');
          const cr = card.getBoundingClientRect(), hr = h.getBoundingClientRect();
          const p = card.querySelector('p');
          return {
            name: h.textContent.trim(),
            caps: getComputedStyle(h).textTransform,
            left: Math.round(hr.x - cr.x),
            right: Math.round(cr.right - hr.right),
            fits: hr.width <= cr.width + 1,
            blurbAlign: p ? getComputedStyle(p).textAlign : 'center'
          };
        }),
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });

    await p.goto('http://127.0.0.1:8807/mc/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 700));

    const w = await read();
    if (!w) { console.log('  FAIL the chart did not render'); process.exit(1); }
    const c = w.cards;

    console.log('the seven rooms');
    NEED.forEach((n) => t('  ' + n + ' is on the chart', !!c[n]));
    if (NEED.some((n) => !c[n])) {
      console.log('  (cards found: ' + Object.keys(c).join(', ') + ')');
      throw new Error('a room is missing from the chart');
    }
    /* SEVEN AND NO MORE. A room that quietly joined the group would land in a
       slot the chart never meant for it. */
    t('  and nothing else is', Object.keys(c).length === 7, Object.keys(c).join(', '));

    console.log('');
    console.log('the game is the whole top row');
    /* IT SPANS EVERYTHING, which is the diagram's first statement: all of this
       hangs off a game. */
    t('  it starts at the left edge of the chart',
      Math.abs(c[GAME].x - w.grid.x) <= 1, c[GAME].x + ' vs ' + w.grid.x);
    t('  and reaches the right edge',
      Math.abs(c[GAME].right - w.grid.right) <= 1, c[GAME].right + ' vs ' + w.grid.right);
    t('  and everything else is below it',
      NEED.slice(1).every((n) => c[n].y >= c[GAME].bottom - 1),
      NEED.slice(1).map((n) => n + ' ' + c[n].y).join(', '));

    console.log('');
    console.log('the three a game names share a row');
    t('  anchor, audiences and map are level',
      c[ANCHOR].y === c[AUD].y && c[AUD].y === c[MAP].y,
      [c[ANCHOR].y, c[AUD].y, c[MAP].y].join(', '));
    t('  in that order, left to right',
      c[ANCHOR].right <= c[AUD].x && c[AUD].right <= c[MAP].x,
      [c[ANCHOR].right, c[AUD].x, c[AUD].right, c[MAP].x].join(' | '));
    /* THE MAP IS THE WIDE ONE, because it is a column with three boxes under
       it rather than a leaf. */
    t('  and the map is the wide one, being a column rather than a leaf',
      c[MAP].w > c[ANCHOR].w && c[MAP].w > c[AUD].w,
      c[MAP].w + ' vs ' + c[ANCHOR].w + ' / ' + c[AUD].w);

    console.log('');
    console.log('and what a map is made of sits under it');
    /* THE COLUMN IS THE STATEMENT. Map, stop, and the two halves all share the
       map's own left and right edges, which is what makes the nesting readable
       with no connecting line drawn anywhere. */
    t('  the stop is directly under the map, edge to edge',
      c[STOP].x === c[MAP].x && c[STOP].right === c[MAP].right && c[STOP].y >= c[MAP].bottom - 1,
      c[STOP].x + '-' + c[STOP].right + ' vs ' + c[MAP].x + '-' + c[MAP].right);
    t('  the waypoint and the challenge are under the stop',
      c[WP].y >= c[STOP].bottom - 1 && c[CH].y >= c[STOP].bottom - 1,
      c[WP].y + ' / ' + c[CH].y + ' vs ' + c[STOP].bottom);
    t('  side by side, and level',
      c[WP].y === c[CH].y && c[WP].right <= c[CH].x,
      c[WP].y + ' / ' + c[CH].y + ', ' + c[WP].right + ' then ' + c[CH].x);
    /* THE TWO HALVES FILL THE STOP EXACTLY, which is the diagram saying they
       ARE the stop rather than merely sitting near it. */
    t('  and the pair spans exactly the width of the stop above them',
      c[WP].x === c[STOP].x && c[CH].right === c[STOP].right,
      c[WP].x + '-' + c[CH].right + ' vs ' + c[STOP].x + '-' + c[STOP].right);

    console.log('');
    console.log('the chart itself');
    /* NO SIGNS. The equation's +, =, arrow and its word are gone; a containment
       chart draws no connectors, and a mark left behind would say something the
       alignment already says. */
    t('  draws no signs or arrows', w.marks === 0, w.marks);
    /* AND NO BUTTON INSIDE A CARD. The card IS the button: an `<a>` with the
       href on it, a heading in the accent, and a lift on hover. */
    t('  and no button inside a card, because the card is the link',
      w.buttons === 0, w.buttons);
    t('  every card being an anchor that goes somewhere',
      w.anchors === 7, w.anchors);

    console.log('');
    console.log('and the game is set as the title of the diagram');
    /* HUGE. Everything below is what a game is MADE OF, and a top card drawn to
       the same weight as its own parts said they were all the same kind of
       thing. Measured at 1360px, where the clamp is at its ceiling. */
    t('  it is over 120px', w.title.px > 120, w.title.px + 'px');
    /* AND CENTRED, WHICH IS TWO THINGS: the heading is a grid ITEM, so it sits
       left however its own text is aligned. Equal gaps prove both. */
    t('  centred, with the gaps either side matching',
      w.title.left === w.title.right, w.title.left + ' / ' + w.title.right);
    t('  and it fits inside its card', w.title.fits);
    /* NO SENTENCE UNDER IT. A description below a 136px heading is a caption on
       the title of the chart; every box beneath it keeps its own. */
    /* IT SAYS IT IS PRESSABLE. With the OPEN TOOL bar gone, nothing on the
       card announced that -- and a 122px word set on its own reads as a
       HEADING, which is the one thing on a page people do not try to click. */
    t('  and its sentence says it is a button', w.title.blurbText === 'This is a button.',
      w.title.blurbText);
    /* AND THE ROOM OWN SENTENCE IS UNTOUCHED IN THE DATA, since that is what
       the dropdown and the directory print. Only the chart substitutes. */
    t('  while the nav still holds the room own sentence',
      /Admins and AI build games here/.test(w.title.navBlurb), w.title.navBlurb);
    /* THE CAPS ARE A RENDERING CHOICE, NOT THE DATA. The nav holds `Game
       Builder` -- the room own name, which the dropdown and the directory both
       print -- and only the chart shouts it. That is also what keeps this very
       suite working: it finds every card BY HEADING, and `text-transform` does
       not touch `textContent`. */
    t('  shouted in CSS', w.title.caps === 'uppercase', w.title.caps);
    t('  while the data still says the room own name',
      w.title.text === GAME, w.title.text);

    console.log('');
    console.log('every box is a centred, shouted label');
    /* ALL SEVEN, so a box added later cannot arrive looking like none of the
       others -- which is why this is one rule on the chart rather than seven. */
    t('  all seven are shouted',
      w.boxes.every((b) => b.caps === 'uppercase'),
      w.boxes.filter((b) => b.caps !== 'uppercase').map((b) => b.name).join(', '));
    t('  all seven have equal gaps either side of the heading',
      w.boxes.every((b) => b.left === b.right),
      w.boxes.filter((b) => b.left !== b.right)
        .map((b) => b.name + ' ' + b.left + '/' + b.right).join(', '));
    t('  every heading fits its card',
      w.boxes.every((b) => b.fits),
      w.boxes.filter((b) => !b.fits).map((b) => b.name).join(', '));
    t('  and every sentence is centred under its heading',
      w.boxes.every((b) => b.blurbAlign === 'center'),
      w.boxes.filter((b) => b.blurbAlign !== 'center').map((b) => b.name).join(', '));

    console.log('');
    console.log('and the anchor event in particular');
    t('  shouted in CSS', w.anchor.caps === 'uppercase', w.anchor.caps);
    t('  centred, with the gaps either side matching',
      w.anchor.left === w.anchor.right, w.anchor.left + ' / ' + w.anchor.right);
    t('  and its sentence is centred under it',
      w.anchor.blurbAlign === 'center', w.anchor.blurbAlign);
    /* THE DATA STILL CARRIES THE ROOM OWN NAME, for the same reason the game
       title does: this suite finds every card by heading. */
    t('  while the data still says the room own name',
      w.anchor.text === ANCHOR, w.anchor.text);
    t('  and it says what an anchor event is FOR',
      /catalysts for one of our games/.test(w.anchor.blurb), w.anchor.blurb);
    t('  and the page does not scroll sideways', !w.sideways);
    t('  with no console errors', errs.length === 0, errs.join(' | '));

    /* ---- AND IT HOLDS ITS SHAPE ON A NARROWER SCREEN ------------------- */
    console.log('');
    console.log('at 820px it is two columns and still a diagram');
    await p.setViewport({ width: 820, height: 1100 });
    await new Promise((r) => setTimeout(r, 300));
    const n = (await read()).cards;
    t('  the game still spans the top',
      n[GAME].x < n[ANCHOR].x + 1 && n[GAME].right > n[AUD].right - 1,
      n[GAME].x + '-' + n[GAME].right);
    t('  the anchor and the audiences still share a row',
      n[ANCHOR].y === n[AUD].y, n[ANCHOR].y + ' / ' + n[AUD].y);
    t('  the map, the stop and the pair still read downward',
      n[MAP].y < n[STOP].y && n[STOP].y < n[WP].y,
      [n[MAP].y, n[STOP].y, n[WP].y].join(' < '));
    t('  and the waypoint and challenge are still side by side',
      n[WP].y === n[CH].y && n[WP].right <= n[CH].x, n[WP].y + ' / ' + n[CH].y);
    /* THE TITLE SHRINKS WITH THE CHART. `clamp()` rather than a flat size: at
       136px `Game Builder` is four times the width of a phone. */
    const n2 = await read();
    t('  and the title has shrunk but is still centred and inside its card',
      n2.title.px < w.title.px && n2.title.left === n2.title.right && n2.title.fits,
      n2.title.px + 'px, gaps ' + n2.title.left + '/' + n2.title.right);

    console.log('');
    console.log('at 390px it is one column, in reading order');
    await p.setViewport({ width: 390, height: 1400 });
    await new Promise((r) => setTimeout(r, 300));
    const m = await read();
    const mc = m.cards;
    /* ONE COLUMN, AND THE ORDER IS THE CHART'S OWN. A stack in any other order
       would be the diagram saying something different from the desktop one. */
    t('  every card starts at the same x',
      NEED.every((k) => mc[k].x === mc[GAME].x),
      NEED.map((k) => mc[k].x).join(', '));
    t('  and they stack in the order the chart reads',
      mc[GAME].y < mc[ANCHOR].y && mc[ANCHOR].y < mc[AUD].y
      && mc[AUD].y < mc[MAP].y && mc[MAP].y < mc[STOP].y
      && mc[STOP].y < mc[WP].y && mc[WP].y < mc[CH].y,
      NEED.map((k) => k + ' ' + mc[k].y).join(' | '));
    t('  and the page still does not scroll sideways', !m.sideways);
    t('  and the title still fits, centred, on a phone',
      m.title.fits && m.title.left === m.title.right,
      m.title.px + 'px, gaps ' + m.title.left + '/' + m.title.right);
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
