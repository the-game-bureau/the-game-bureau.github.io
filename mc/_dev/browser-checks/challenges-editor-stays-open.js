/* THE EDITOR MUST NOT CLOSE WHILE YOU ARE EDITING (2026-09-03).

   Reported as "when editing a challenge in popup, it keeps closing", and the
   cause is a gesture rather than a state: **a `click` fires on the NEAREST
   COMMON ANCESTOR of the press and the release**, so selecting text in a field
   and letting go past the panel edge targets the backdrop -- and the backdrop
   handler shut the dialog, taking everything typed with it.

   SO THIS DRIVES REAL MOUSE MOVEMENT. `page.click` and a dispatched event both
   land squarely on one element and can never reproduce it; only a press in one
   place and a release in another does.

   BOTH HALVES ARE ASSERTED. A dialog that ignored the backdrop entirely would
   pass the first three and is not the change that was asked for. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript' };
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
  await new Promise((r) => srv.listen(9403, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    /* EVERY WRITE IS INTERCEPTED. A check has no business editing the
       catalogue it is reading. */
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') { q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9403/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    const open = async () => {
      await p.evaluate(() => { openEditor(state.rows[0]); });
      await new Promise((r) => setTimeout(r, 120));
    };
    const isOpen = () => p.evaluate(() => document.getElementById('dlg').classList.contains('is-open'));

    await open();
    t('the editor opens', await isOpen());

    /* TYPING. The floor: if this closed it, nothing else would matter. */
    await p.click('#fName');
    await p.keyboard.type('probe');
    t('typing in a field does not close it', await isOpen());

    /* A SELECTION INSIDE THE BOX. Press and release share a target here, so
       this passed even on the broken page -- it is the control case. */
    await open();
    const box = await p.$('#fPrompt');
    const b = await box.boundingBox();
    await p.mouse.move(b.x + 20, b.y + 12);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width - 20, b.y + 12, { steps: 8 });
    await p.mouse.up();
    t('selecting text inside a field does not close it', await isOpen());

    /* THE REPORTED GESTURE. Press in the field, release past the panel edge --
       the click then targets the backdrop and the dialog used to shut. */
    await open();
    const panel = await p.$('#dlg > *');
    const pb = await panel.boundingBox();
    await p.mouse.move(b.x + 20, b.y + 12);
    await p.mouse.down();
    await p.mouse.move(pb.x - 40, pb.y + pb.height + 60, { steps: 10 });
    await p.mouse.up();
    t('and a selection that ends OUTSIDE the panel does not close it', await isOpen());
    t('and what was typed is still there',
      (await p.evaluate(() => document.getElementById('fPrompt').value)).length > 0);

    /* THE OTHER HALF. A dialog that simply ignored the backdrop would pass
       everything above and would not be the change that was asked for. */
    await open();
    await p.mouse.click(pb.x - 40, pb.y + pb.height + 60);
    t('a real click on the backdrop still closes it', (await isOpen()) === false);

    /* AND ESCAPE, which is the other way out and is untouched. */
    await open();
    await p.keyboard.press('Escape');
    t('and Escape still closes it', (await isOpen()) === false);

    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
