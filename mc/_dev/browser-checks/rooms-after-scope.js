/* THE CHALLENGE BANK AND THE ROUTE BUILDER, AFTER SCOPE.
   2026090311 dropped `challenges.scope` and its three keys, and both rooms
   carried a scope UI. This drives each one against the LIVE database and
   asserts what a source grep cannot: that the page loads, that no read comes
   back 4xx, that it draws its rows, and that NO SCOPE CONTROL SURVIVES.

   IT WRITES NOTHING -- both rooms are read-only on the paths it exercises.

   AND THE PROBE WAS THE BROKEN HALF TWICE, which is why the selectors are
   named rather than guessed: `#routeStops` and `#routePick` do not exist (they
   are `#routeBody` and `#routeSel`), and an earlier threshold demanded the
   picker offer 40 challenges when the room deliberately excludes trivia and
   the whole library is 25. Both reported a page fault that was its own. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));
(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => srv.listen(9275, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    for (const room of ['challenges', 'routes']) {
      const p = await br.newPage();
      const errs = [], failed = [];
      p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
      await p.evaluateOnNewDocument(() => {
        window.__a = null;
        window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
          return { getSession: () => null, init: () => {} }; } };
        window.TgbAdminSiteNav = { bindAuth: () => {} };
      });
      p.on('response', (r) => { if (r.status() >= 400 && r.url().indexOf('supabase.co') !== -1)
        failed.push(r.status() + ' ' + r.url().slice(0, 110)); });
      await p.goto('http://127.0.0.1:9275/mc/' + room + '/', { waitUntil: 'domcontentloaded' });
      await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
      await new Promise((r) => setTimeout(r, 4500));
      if (room === 'routes') {
        /* A ROUTE HAS TO BE OPENED. The stops list is empty until one is picked,
           which is the room working rather than failing -- the first cut of this
           probe read it cold and reported a page fault that was its own. */
        await p.evaluate(() => {
          const sel = document.getElementById('routeSel');
          if (sel && sel.options.length > 1) {
            sel.selectedIndex = 1;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        await new Promise((r) => setTimeout(r, 2500));
      }
      const seen = await p.evaluate(() => ({
        rows: document.querySelectorAll('#list > *, #routeBody > *, .ch-line').length,
        pickerOptions: Math.max(0, ...[...document.querySelectorAll('select')]
          .filter((x) => /challenge/i.test(x.id) || (x.options[0] || {}).textContent === 'not chosen yet')
          .map((x) => x.options.length)),
        scopeControls: document.querySelectorAll('#scopeFilter,#batchScope,#fScope,#fScopeTeam,#fScopeCity,#fScopeWpid').length,
        text: (document.body.innerText || '').slice(0, 200)
      }));
      console.log('  /mc/' + room + '/  rows drawn: ' + seen.rows);
      t(room + ': no page errors', errs.length === 0, errs.slice(0, 3));
      t(room + ': no failed supabase read', failed.length === 0, failed.slice(0, 3));
      t(room + ': draws its list', seen.rows > 0, seen.text.slice(0, 90));
      if (room === 'routes') {
        /* THE PICKER OFFERS EVERY CHALLENGE NOW. It was scope-filtered to 17 of
           24 on a real route; with scope gone it is the whole library. */
        t('routes: the challenge picker offers the whole non-trivia library',
          seen.pickerOptions >= 26, seen.pickerOptions);
      }
      t(room + ': no scope control survives', seen.scopeControls === 0, seen.scopeControls);
      await p.close();
    }
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
