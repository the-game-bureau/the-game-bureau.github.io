/* THE CHALLENGE BANK SORTS BY NAME, NEWEST OR TYPE (2026-09-03).

   Three orders, each a different question: which challenge is this, what just
   landed, and what kind are these.

   EVERY ORDER IS COMPUTED HERE AND COMPARED, never mirrored from the page.
   Asking the room whether its list agrees with its own sorter proves nothing;
   the rows are read out of `state`, ordered in Node, and the two are diffed.

   Reads go to the LIVE database and every write is intercepted. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

/* THE EXPECTED ORDER, WRITTEN OUT INDEPENDENTLY. Same four rules the page
   claims: a blank sinks, ties break on the numeric id, type sorts on the DRAWN
   label, and newest runs the other way. */
function expected(rows, which) {
  const label = (v) => String(v == null ? '' : v).trim().split('_').join(' ');
  const keyOf = { name: (c) => String(c.name || '').trim(),
                  newest: (c) => String(c.created_at || '').trim(),
                  type: (c) => label(c.type) }[which];
  const dir = which === 'newest' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    if (!ka && kb) return 1;
    if (ka && !kb) return -1;
    if (ka !== kb) return dir * String(ka).localeCompare(String(kb), undefined,
      { sensitivity: 'base', numeric: true });
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  }).map((c) => c.id);
}

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
  await new Promise((r) => srv.listen(9436, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {},
                 authHeaders: (x) => Object.assign(
                   { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    }, KEY);
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') { writes.push(m);
        q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9436/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    /* ---- THE CONTROL ---------------------------------------------------- */
    /* A MISSING CONTROL IS A NAMED FAILURE, NOT AN EXCEPTION. Without this the
       whole run dies on the first `querySelector` of a null and prints a stack
       trace with no summary line -- **which reads as a suite that was not run
       rather than one that failed**, and a `grep FAIL` over it comes back
       clean. This repo has been caught by that shape before. */
    const present = await p.evaluate(() => !!document.getElementById('sortGroup'));
    if (!present) {
      t('the room has a sort control at all', false, 'no #sortGroup in the page');
      console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close();
      process.exit(1);
    }

    const ctl = await p.evaluate(() => {
      const g = document.getElementById('sortGroup');
      const opts = [...g.querySelectorAll('.sort-opt')];
      const bar = g.closest('.command-bar');
      return {
        role: g.getAttribute('role'),
        named: !!g.getAttribute('aria-label'),
        legend: (bar.querySelector('legend') || {}).textContent,
        words: opts.map((o) => o.querySelector('span').textContent),
        names: opts.map((o) => o.querySelector('input').name),
        checked: opts.filter((o) => o.querySelector('input').checked)
          .map((o) => o.querySelector('input').value),
        /* `display: none` WOULD TAKE IT OUT OF THE TAB ORDER and out of the
           radiogroup a screen reader sees. */
        inputDisplay: getComputedStyle(opts[0].querySelector('input')).display,
        inputOpacity: getComputedStyle(opts[0].querySelector('input')).opacity,
        titles: opts.map((o) => o.title)
      };
    });
    t('the bar is called Sort', ctl.legend === 'Sort', ctl.legend);
    t('and offers name, newest and type',
      ctl.words.join('|') === 'Name|Newest|Type', ctl.words);
    t('as one radio group', ctl.role === 'radiogroup' && ctl.named
      && new Set(ctl.names).size === 1, ctl);
    t('with exactly one on, and it is Name',
      ctl.checked.length === 1 && ctl.checked[0] === 'name', ctl.checked);
    t('the input is hidden without leaving the tab order',
      ctl.inputDisplay !== 'none' && ctl.inputOpacity === '0', ctl);
    t('and each option says what it does', ctl.titles.every(Boolean), ctl.titles);

    /* ---- EACH ORDER, COMPARED AGAINST ONE COMPUTED HERE ------------------ */
    async function orderOf(which) {
      return p.evaluate((w) => {
        if (w !== state.sort) {
          const el = document.querySelector('.sort-opt input[value="' + w + '"]');
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        /* `visible()` IS THE PAGE'S OWN ANSWER for the whole filtered set --
           the DOM holds only the first chunk, so reading the list would be
           measuring the pager rather than the order. */
        return { ids: visible().map((c) => c.id), sort: state.sort, shown: state.shown };
      }, which);
    }
    const rows = await p.evaluate(() => state.rows.map((c) => ({
      id: c.id, name: c.name, created_at: c.created_at, type: c.type })));
    t('the room holds the live catalogue', rows.length > 40, rows.length);

    for (const which of ['name', 'newest', 'type']) {
      const got = await orderOf(which);
      const want = expected(rows, which);
      t('sorting by ' + which + ' matches an order computed independently',
        got.ids.join(',') === want.join(','),
        { first: got.ids.slice(0, 4), wanted: want.slice(0, 4) });
    }

    /* THE THREE ORDERS HAVE TO DIFFER, or the check would pass on a page that
       ignored the control entirely. */
    const byName = await orderOf('name');
    const byNew = await orderOf('newest');
    t('and the orders are actually different',
      byName.ids.join(',') !== byNew.ids.join(','));

    /* ---- A BLANK SINKS, AND TIES ARE STABLE ----------------------------- */
    const edge = await p.evaluate(() => {
      const keep = state.rows.slice();
      state.rows = [
        { id: 9001, name: 'Zeta', created_at: '2026-01-02', type: 'photo', tags: [] },
        { id: 9002, name: '', created_at: '2026-01-03', type: '', tags: [] },
        { id: 9003, name: 'Alpha', created_at: '', type: 'photo', tags: [] },
        { id: 9000, name: 'Alpha', created_at: '2026-01-01', type: 'photo', tags: [] }
      ];
      const out = {};
      ['name', 'newest', 'type'].forEach((w) => { state.sort = w; out[w] = visible().map((c) => c.id); });
      state.rows = keep;
      state.sort = 'name';
      return out;
    });
    /* THE BLANK NAME IS LAST WHICHEVER WAY THE ORDER RUNS. */
    t('a blank sinks in the name order', edge.name[edge.name.length - 1] === 9002, edge.name);
    t('and in the newest order too', edge.newest[edge.newest.length - 1] === 9003, edge.newest);
    t('and a blank type sinks as well', edge.type[edge.type.length - 1] === 9002, edge.type);
    /* TWO ROWS CALLED ALPHA BREAK ON THE ID, LOWEST FIRST. Without that a row
       can move under you as you type in the search box. */
    t('ties break on the id, so the order is stable',
      edge.name.indexOf(9000) < edge.name.indexOf(9003), edge.name);

    /* ---- A SORT NARROWS NOTHING ----------------------------------------- */
    const after = await p.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const beforeScroll = window.scrollY;
      const el = document.querySelector('.sort-opt input[value="type"]');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      const clear = document.getElementById('clearBtn');
      return { beforeScroll: beforeScroll, scrollY: window.scrollY, shown: state.shown,
               clearOff: clear.getAttribute('aria-disabled'),
               drawn: document.querySelectorAll('#list > .ch').length,
               total: visible().length };
    });
    t('a sort goes back to the top of the page',
      after.beforeScroll > 0 && after.scrollY === 0, after);
    t('and back to one chunk', after.shown === 100, after.shown);
    /* SORTING HIDES NOTHING, so Clear must stay off -- it would otherwise
       report the list as filtered when it is not. */
    t('and does not light Clear', after.clearOff === 'true', after.clearOff);
    t('and hides no row', after.total === rows.length, { shown: after.total, all: rows.length });

    /* CLEAR MUST NOT RESET THE SORT. Its job is to WIDEN the list, and throwing
       away the order somebody chose would be a second, unrelated act. */
    const cleared = await p.evaluate(() => {
      document.getElementById('q').value = 'a';
      document.getElementById('q').dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('clearBtn').click();
      return { sort: state.sort, q: state.q,
               checked: [...document.querySelectorAll('.sort-opt input')]
                 .filter((i) => i.checked).map((i) => i.value) };
    });
    t('Clear puts the filters back and leaves the sort alone',
      cleared.sort === 'type' && !cleared.q && cleared.checked.join() === 'type', cleared);

    t('nothing was written', writes.length === 0, writes);
    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
