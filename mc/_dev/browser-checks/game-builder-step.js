/* THE BACK / FORWARD PAIR FLIPS THROUGH GAMES.
   Reads go to the LIVE database; the write is intercepted, because a check has
   no business editing the catalogue it is stepping through. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
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
  await new Promise((r) => srv.listen(9220, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    p.on('dialog', async (d) => { await d.accept(); });
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => ({ access_token: 'p' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET') { q.continue(); return; }
      writes.push({ m: m, u: u });
      q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
    });

    await p.goto('http://127.0.0.1:9220/mc/games/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await p.waitForFunction(() => document.querySelectorAll('#gamePickerList option').length > 5,
      { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    /* ---- WHERE IT SITS ------------------------------------------------ */
    const place = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.builder-nav-rows > .builder-nav-row')];
      const box = document.querySelector('.builder-nav-row--step');
      const nav = document.getElementById('mbNav');
      const status = document.getElementById('gameStatusRow');
      const r = (n) => { const x = n.getBoundingClientRect(); return { x: Math.round(x.x), w: Math.round(x.w || x.width) }; };
      return {
        order: rows.map((n) => n.id || n.className.replace('builder-nav-row ', '')),
        between: rows.indexOf(box) > rows.indexOf(nav) && rows.indexOf(box) < rows.indexOf(status),
        boxAfterNav: box && nav ? r(box).x > r(nav).x : false,
        boxBeforeStatus: box && status ? r(box).x < r(status).x : false,
        btns: [...box.querySelectorAll('button')].map((b) => ({
          id: b.id, w: Math.round(b.getBoundingClientRect().width),
          h: Math.round(b.getBoundingClientRect().height),
          svg: b.querySelectorAll('svg').length, text: (b.textContent || '').trim()
        }))
      };
    });
    console.log('   nav rows: ' + place.order.join('  |  '));
    t('the step box sits between the chooser row and the status box', place.between, place.order);
    t('and on screen it is after the chooser and before status',
      place.boxAfterNav && place.boxBeforeStatus);
    t('two buttons, both drawn rather than typed',
      place.btns.length === 2 && place.btns.every((b) => b.svg === 1 && b.text === ''), place.btns);
    /* DRAWN TO THE STATUS PAIR'S METRICS: a 42px control beside a 34px one
       reads as a different KIND of control. */
    const statusH = await p.evaluate(() => Math.round(
      document.querySelector('.builder-nav-btn--status').getBoundingClientRect().height));
    t("and to the status buttons own height",
      place.btns.every((b) => b.h === statusH), { steps: place.btns.map((b) => b.h), status: statusH });

    /* ---- IT STEPS THE PICKER'S OWN ORDER ------------------------------ */
    const listed = await p.evaluate(() =>
      [...document.querySelectorAll('#gamePickerList option')].map((o) => o.value));
    console.log('   games in the picker: ' + listed.length);

    const open1 = await p.evaluate(async () => {
      const ids = window.gamePickerOrderedGames ? window.gamePickerOrderedGames().map((e) => e.game.id) : [];
      return { total: ids.length, first: ids[0] || '', second: ids[1] || '' };
    });
    /* open the FIRST game through the picker's own path, so the step is
       measured from a known place */
    await p.evaluate(async (id) => { await openSavedGameById(id, {}); }, open1.first);
    await new Promise((r) => setTimeout(r, 2500));

    const atFirst = await p.evaluate(() => ({
      cur: state.currentGameId,
      prev: document.getElementById('gameStepPrevBtn').getAttribute('aria-disabled'),
      next: document.getElementById('gameStepNextBtn').getAttribute('aria-disabled'),
      prevTitle: document.getElementById('gameStepPrevBtn').title,
      nextTitle: document.getElementById('gameStepNextBtn').title
    }));
    t('on the first game, back is off and forward is on',
      atFirst.cur === open1.first && atFirst.prev === 'true' && atFirst.next === 'false', atFirst);
    t('and the off one says why', /first game/i.test(atFirst.prevTitle), atFirst.prevTitle);
    t('while the live one says where you are',
      /1 of /.test(atFirst.nextTitle), atFirst.nextTitle);

    await p.evaluate(() => document.getElementById('gameStepNextBtn').click());
    await new Promise((r) => setTimeout(r, 3000));
    const afterNext = await p.evaluate(() => ({
      cur: state.currentGameId,
      picker: document.getElementById('gamePickerInput').value,
      prev: document.getElementById('gameStepPrevBtn').getAttribute('aria-disabled')
    }));
    t("forward opens the next game in the picker order",
      afterNext.cur === open1.second, { got: afterNext.cur, want: open1.second });
    t('and the chooser follows it', afterNext.picker.length > 0, afterNext.picker);
    t('and back turns on', afterNext.prev === 'false');

    await p.evaluate(() => document.getElementById('gameStepPrevBtn').click());
    await new Promise((r) => setTimeout(r, 3000));
    const back = await p.evaluate(() => state.currentGameId);
    t('back returns to the one before it', back === open1.first, { got: back, want: open1.first });

    /* ---- CLAMPED, NOT WRAPPED ---------------------------------------- */
    const pressAtEnd = await p.evaluate(() => {
      const b = document.getElementById('gameStepPrevBtn');
      const before = state.currentGameId;
      b.click();
      return { before: before, after: state.currentGameId, off: b.getAttribute('aria-disabled') };
    });
    t('pressing the off end does not wrap round', pressAtEnd.before === pressAtEnd.after
      && pressAtEnd.off === 'true', pressAtEnd);

    t('nothing was written to the database', writes.length === 0, writes.map((w) => w.m));
    t('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
