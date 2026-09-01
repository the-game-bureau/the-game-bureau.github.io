/* A PAST ANCHOR EVENT REACHES THE PICKER.
   ---------------------------------------------------------------------------
   REPORTED AS: past anchor events do not show. There was no date filter
   anywhere -- PostgREST caps a response at 1000 rows and truncates in SILENCE,
   and the read was one unpaged fetch of a table holding 3,051. The order is
   `start_date.desc`, newest first, so the 1000 rows that arrived were the
   furthest-FUTURE ones and all 63 past events sat beyond the cap.

   SO THE FIXTURE IS SHAPED LIKE THE FAULT: 1,100 events, newest first, with the
   past ones LAST. A page that does not page sees 1,000 and never reaches them,
   which is the bug exactly; a page that does sees all 1,100.

   THE STUB HONOURS `Range` AND WOULD OTHERWISE BE TESTING ITSELF. A stub that
   returns everything however it is asked cannot tell a paged read from an
   unpaged one -- this project has twice reported a page fault that was the
   harness's own for less than that. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* 1,100 EVENTS, NEWEST FIRST. The last 40 are in the past, so every one of them
   is beyond the 1000-row cap -- which is the shape the live table has. */
const TOTAL = 1100;
const PAST = 40;
const EVENTS = [];
for (let i = 0; i < TOTAL; i++) {
  const past = i >= TOTAL - PAST;
  EVENTS.push({
    id: (past ? 'PAST-' : 'FUT-') + i,
    kind: 'sports',
    start_date: past ? ('2020-01-' + String((i % 28) + 1).padStart(2, '0'))
                     : ('2027-06-' + String((i % 28) + 1).padStart(2, '0')),
    title: null,
    away_team_geo: 'Chicago', away_team_nickname: 'Bears',
    home_team_geo: 'New Orleans', home_team_nickname: 'Saints',
    venue_city: 'New Orleans, Louisiana', venue_name: 'Superdome'
  });
}
const GAME = {
  id: 'oswald', name: 'Oswald New Orleans', city: 'New Orleans, Louisiana',
  city_name: 'New Orleans', state_code: 'LA', tagline: 'A walk', body: 'Intro.',
  price: '25', engine: 'text', status: 'building', archived: 'YES',
  tags: [], teams: [], nodes: null
};

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
  await new Promise((r) => server.listen(8815, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const ranges = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
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

      let body = [];
      if (u.indexOf('/events') !== -1) {
        /* THE CAP IS THE POINT. Whatever is asked for, at most 1000 rows come
           back -- which is what PostgREST does and what the page has to work
           around. */
        const range = (req.headers().range || req.headers().Range || '');
        ranges.push(range || '(none)');
        let from = 0, to = 999;
        const m = /(\d+)-(\d+)/.exec(range);
        if (m) { from = Number(m[1]); to = Math.min(Number(m[2]), from + 999); }
        body = EVENTS.slice(from, to + 1);
      } else if (u.indexOf('/games') !== -1) {
        body = [GAME];
      }
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-0/' + body.length }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8815/mc/games/index.html?id=oswald',
      { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 1400));

    const got = await p.evaluate(() => {
      const opts = [...document.querySelectorAll('#anchorEventList option')].map((o) => o.value);
      return {
        count: opts.length,
        /* THE LABEL CARRIES THE DATE, so a past event is findable by its year --
           which is also how somebody types for one. */
        past: opts.filter((v) => v.indexOf('2020') !== -1).length,
        future: opts.filter((v) => v.indexOf('2027') !== -1).length
      };
    });

    /* THE READ PAGES. Two requests for 1,100 rows, and the second one asks for
       the rows past the cap. */
    t('the read asks for more than one page', ranges.length >= 2, ranges.join(' | '));
    t('and the second page starts where the first ended',
      ranges.length >= 2 && /^1000-/.test(ranges[1]), ranges[1]);

    /* AND EVERY ROW ARRIVES. Unpaged this is 1000, and every past event is
       missing -- which is the bug exactly. */
    t('every event reaches the picker', got.count === TOTAL, got.count);
    t('including the past ones beyond the 1000-row cap',
      got.past === PAST, got.past + ' of ' + PAST);
    t('and the future ones are all still there',
      got.future === TOTAL - PAST, got.future);

    /* IT STOPS. A server that ignored `Range` would hand back the same first
       page for ever, so the loop ends on a page that adds nothing new. */
    t('and it does not run away: at most a handful of requests',
      ranges.length <= 4, ranges.length);
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
})();
