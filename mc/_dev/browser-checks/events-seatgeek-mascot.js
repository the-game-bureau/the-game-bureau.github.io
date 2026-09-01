/* THE SEATGEEK BOX TAKES A TEAM MASCOT.
   ---------------------------------------------------------------------------
   `venue.city=Falcons` returns nothing, so typing a mascot was a search that
   quietly found no events. A club is a PERFORMER on SeatGeek, and
   `/events?performers.slug=` answers every game it plays, home and away.

   THIS RUNS AGAINST THE LIVE SEATGEEK API, deliberately. The whole claim is
   about how a real reply ranks: the ordering is SeatGeek's, the noise is
   SeatGeek's, and a stub would be testing the stub. Supabase is still stubbed,
   because nothing here should touch our own tables.

   IT IS THEREFORE ALLOWED TO BE SKIPPED. SeatGeek can be slow or down and that
   is not this repo's fault; a run that cannot reach it says so and exits 0
   rather than reporting a page fault that is not one. */
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

/* A WINDOW WITH FIXTURES IN IT. The NFL season runs Sep to Jan, so a window
   anchored on the file's own idea of today would empty out in February and the
   check would start failing for a reason that is not a fault. */
const FROM = '2026-09-01';
const TO = '2026-11-30';

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
  await new Promise((r) => server.listen(8852, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const sgCalls = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 1000 });
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    await p.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      /* SEATGEEK GOES THROUGH. That is the point of this check. */
      if (u.indexOf('api.seatgeek.com') !== -1) { sgCalls.push(u); req.continue(); return; }
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                     'access-control-expose-headers': 'content-range' };
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '*/0' }, cors), body: '[]' });
    });

    await p.goto('http://127.0.0.1:8852/mc/events/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 900));

    /* THE RANKER IS PURE, so it is checked directly on real replies before the
       whole dialog is driven -- a failure here is about the rule rather than
       about the fetch, and the two are worth telling apart. */
    const key = await p.evaluate(() => (typeof SG_CLIENT_ID === 'string' ? SG_CLIENT_ID : ''));
    t('the page carries a SeatGeek client id', !!key);

    const reachable = await p.evaluate(async () => {
      try {
        const r = await fetch('https://api.seatgeek.com/2/performers?q=Falcons&per_page=1&client_id='
          + SG_CLIENT_ID);
        return r.ok;
      } catch (e) { return false; }
    });
    if (!reachable) {
      console.log('  SKIPPED: SeatGeek could not be reached. Not a page fault.');
      console.log('');
      console.log(ok + ' ok, ' + bad + ' FAIL');
      return;
    }

    /* ---- 1. THE RANK, ON LIVE REPLIES ---------------------------------- */
    const MASCOTS = [
      ['Falcons', 'Atlanta Falcons'],
      ['Saints', 'New Orleans Saints'],
      ['Cubs', 'Chicago Cubs'],
      ['Broncos', 'Denver Broncos']
    ];
    /* CALLED THROUGH A GUARD, so a page WITHOUT the lookup fails these
       assertions rather than throwing. Run against the previous page it threw
       `sgFindPerformer is not defined`, which is a crash rather than a report:
       it names no assertion and stops every check after it. */
    const findClub = (term) => p.evaluate(async (x) => {
      if (typeof sgFindPerformer !== 'function') return '(no lookup on this page)';
      const club = await sgFindPerformer(SG_CLIENT_ID, x);
      return club ? club.name : null;
    }, term);

    for (const pair of MASCOTS) {
      const got = await findClub(pair[0]);
      t('  ' + pair[0] + ' resolves to the club', got === pair[1], got);
    }
    /* THE FLOOR. A term that matches nothing must stay a city, which is the
       standing rule -- an unknown term is still a city. */
    const nonsense = await findClub('Xyzzyfoo');
    t('  a term that names no club resolves to nothing', nonsense === null, JSON.stringify(nonsense));

    /* ---- 2. THE BOX, DRIVEN ------------------------------------------- */
    console.log('');
    console.log('typing a mascot into the box');
    await p.evaluate(() => {
      const b = document.getElementById('seatgeekBtn');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    /* NOT offsetParent -- IT IS NULL ON A position:fixed ELEMENT, and these
       dialogs are fixed. It reported a shut dialog over one that was plainly
       open, since the fetch below then ran. A rect with a size is the honest
       test of whether something is on screen. */
    const opened = await p.evaluate(() => {
      const c = document.getElementById('sgCity');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    t('  the dialog opens', opened);

    sgCalls.length = 0;
    await p.evaluate((from, to) => {
      const set = (id, v) => { const e = document.getElementById(id); if (e) {
        e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
      set('sgCity', 'Falcons');
      set('sgFrom', from);
      set('sgTo', to);
      const b = document.getElementById('sgFetchBtn');
      if (b) b.click();
    }, FROM, TO);

    /* THE FETCH IS A REAL NETWORK ROUND TRIP -- a city miss, then a performer
       lookup, then the club's own pages. Waited on rather than slept through. */
    let waited = 0;
    let done = false;
    while (waited < 40000 && !done) {
      await new Promise((r) => setTimeout(r, 500));
      waited += 500;
      done = await p.evaluate(() => {
        const b = document.getElementById('sgFetchBtn');
        return !!b && !b.disabled;
      });
    }
    t('  the fetch finishes', done, waited + 'ms');

    const out = await p.evaluate(() => ({
      said: (document.getElementById('sgStatus') || {}).textContent || '',
      rows: document.querySelectorAll('.sg-item').length
    }));
    console.log('    ' + out.said.trim());

    /* THE CITY IS TRIED FIRST AND ALWAYS. That is what keeps `Denver` meaning
       the town, so the wasted request is the design rather than a slip. */
    t('  it asked the venue town first',
      sgCalls.some((u) => u.indexOf('venue.city=Falcons') !== -1));
    t('  then looked the word up as a performer',
      sgCalls.some((u) => u.indexOf('/performers') !== -1 && u.indexOf('has_upcoming_events') !== -1));
    t('  and read the club by its slug, not by a free-text event search',
      sgCalls.some((u) => u.indexOf('performers.slug=atlanta-falcons') !== -1)
      && !sgCalls.some((u) => u.indexOf('/events') !== -1 && u.indexOf('q=Falcons') !== -1));
    t('  it found games', out.rows > 0, out.rows);
    t('  and said how it read the word',
      /read as/i.test(out.said) && /atlanta falcons/i.test(out.said), out.said.trim());
    t('  with no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
