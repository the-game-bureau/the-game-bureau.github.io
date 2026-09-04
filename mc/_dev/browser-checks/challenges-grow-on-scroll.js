/* THE LIST IS ON THE PAGE AND GROWS AS YOU REACH IT (2026-09-03).

   The room drew every row inside `max-height: 70vh; overflow-y: auto` -- a
   scrollbar inside a scrollbar, so the wheel meant two different things an inch
   apart. It draws a hundred on the page and appends the next hundred when the
   foot comes into view.

   **IT IS NOT A SILENT CAP**, which is the rule this has to satisfy and what
   this check is really for: nothing is truncated, the foot says how many of how
   many are drawn, and scrolling reaches every row. A top-N that quietly stopped
   at a hundred would pass a per-page check and is exactly what this project has
   deleted before -- so the walk below concatenates every chunk and asserts the
   whole list comes back, none twice, still in order.

   Reads go to the LIVE database and every write is intercepted. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(9406, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 900 });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    /* THE LIVE TABLE IS 62 ROWS, UNDER THE CHUNK -- so against production the
       list never grows and every assertion about growing would pass without
       exercising a line of it. **The mechanism is checked on a list big enough
       to need it**, and the panel and the CSS are checked against the real
       room. Same fault as a fixture whose prompts are one short sentence, in
       the live-data direction. */
    const BIG = [];
    for (let i = 1; i <= 250; i++) {
      BIG.push({ id: 10000 + i,
                 name: 'Row ' + String(i).padStart(4, '0'),
                 type: 'question', prompt: 'A prompt.', answer: 'An answer.',
                 choices: null, ladder_key: null, tags: ['sports'],
                 created_at: '2026-01-01' });
    }
    let serveBig = false;

    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') { q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
      if (serveBig && u.indexOf('/challenges?') !== -1) {
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify(BIG) });
        return;
      }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9406/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    /* ---- ON THE PAGE, NOT IN A WINDOW ON IT ---------------------------- */
    const box = await p.evaluate(() => {
      const b = document.querySelector('.panel-body');
      const c = getComputedStyle(b);
      return { overflowY: c.overflowY, maxHeight: c.maxHeight,
               scrolls: b.scrollHeight > b.clientHeight + 2,
               pageScrolls: document.documentElement.scrollHeight > window.innerHeight };
    });
    t('the list panel does not scroll inside itself',
      box.overflowY !== 'auto' && box.overflowY !== 'scroll' && !box.scrolls, box);
    t('and it has no height cap of its own', box.maxHeight === 'none', box.maxHeight);
    t('so the PAGE is what scrolls', box.pageScrolls);

    /* ---- A HUNDRED AT A TIME ------------------------------------------- */
    const first = await p.evaluate(() => ({
      drawn: document.querySelectorAll('#list > .ch').length,
      total: state.rows.length,
      shown: state.shown,
      foot: (document.querySelector('.ch-more') || {}).textContent || ''
    }));
    t('a hundred are drawn to start, or all of them if there are fewer',
      first.drawn === Math.min(100, first.total), first);
    /* THE FOOT IS WHAT MAKES THIS NOT A SILENT CAP. */
    if (first.total > 100) {
      t('and the foot says how many of how many',
        first.foot.indexOf(' of ') !== -1, first.foot);
    } else {
      t('and with everything drawn there is no foot at all', first.foot === '', first.foot);
    }

    /* ---- AND NOW ON A LIST THAT ACTUALLY HAS TO GROW ------------------- */
    serveBig = true;
    await p.goto('http://127.0.0.1:9406/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows.length === 250,
                            { timeout: 40000 });

    const big = await p.evaluate(() => ({
      drawn: document.querySelectorAll('#list > .ch').length,
      foot: (document.querySelector('.ch-more') || {}).textContent || ''
    }));
    t('250 rows draw a hundred', big.drawn === 100, big.drawn);
    t('and the foot says how many of how many',
      big.foot.indexOf('100 of 250') !== -1, big.foot);

    /* ---- SCROLLING REACHES EVERY ROW ----------------------------------- */
    const walk = await p.evaluate(async () => {
      const names = () => [...document.querySelectorAll('#list > .ch .ch-name')]
        .map((e) => e.textContent);
      /* SETTLE RATHER THAN COUNT SCROLLS. The observer fires on its own
         schedule, so a fixed number of passes would be a clock -- which this
         project has already been caught by. Three quiet reads in a row. */
      let last = -1, quiet = 0, guard = 0;
      while (quiet < 3 && guard++ < 80) {
        window.scrollTo(0, document.documentElement.scrollHeight);
        await new Promise((r) => setTimeout(r, 90));
        const n = names().length;
        quiet = (n === last) ? quiet + 1 : 0;
        last = n;
      }
      const got = names();
      return { got: got, total: state.rows.length, dupes: got.length - new Set(got).size };
    });
    t('scrolling draws every row', walk.got.length === walk.total,
      { drawn: walk.got.length, total: walk.total });
    t('and none of them twice', walk.dupes === 0, walk.dupes);
    t('and still in order across the seam',
      walk.got.join('|') === walk.got.slice().sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())).join('|'));
    t('and the foot is gone once everything is drawn',
      await p.evaluate(() => !document.querySelector('.ch-more')));

    /* ---- GROWING MUST NOT MOVE THE PAGE -------------------------------- */
    const stayed = await p.evaluate(async () => {
      window.scrollTo(0, 400);
      const before = window.scrollY;
      const firstRow = document.querySelector('#list > .ch');
      const y = firstRow.getBoundingClientRect().y;
      if (typeof growList === 'function') growList();
      await new Promise((r) => setTimeout(r, 60));
      return { before: before, after: window.scrollY,
               rowMoved: Math.abs(firstRow.getBoundingClientRect().y - y) };
    });
    /* APPENDING CANNOT MOVE A ROW ALREADY ON SCREEN; REPAINTING WOULD. */
    t('growing the list does not move the page', stayed.before === stayed.after, stayed);
    t('nor the row you were reading', stayed.rowMoved === 0, stayed.rowMoved);

    /* ---- A FILTER RESETS THE LIST AND THE PAGE ------------------------- */
    const filtered = await p.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const q = document.getElementById('q');
      q.value = 'the';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      return { scrollY: window.scrollY, shown: state.shown,
               drawn: document.querySelectorAll('#list > .ch').length };
    });
    /* RESETTING `shown` IS NOT ENOUGH. Filtered from the bottom you are still
       at the bottom, the foot is instantly in view, and the observer fills the
       list straight back out to reach you. */
    t('a filter goes back to the top of the page', filtered.scrollY === 0, filtered);
    t('and back to one chunk', filtered.shown === 100, filtered.shown);

    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
