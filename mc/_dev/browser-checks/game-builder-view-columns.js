/* DOES THE VIEW CARRYING THE COLUMN CHANGE WHAT GETS SAVED?
   ---------------------------------------------------------------------------
   Two runs against the same page: one where the games read answers WITHOUT
   `anchor_event_id` (the view as it was), one WITH it (as it is now). If the
   payload differs, the view was the fault and the fix is the fix. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

/* A REAL ROW SHAPE, committed rather than fetched: the point is the seven-node
   document the room actually loads, and a fixture cannot go stale in a way
   that matters here -- the columns are what is under test, not the values. */
const ROW = { id: 'probe', name: 'Carolina Fans Takeover New Orleans',
  city: 'New Orleans, Louisiana', archived: 'YES', status: 'building',
  tagline: 'x', anchor_event_id: null, target_audience_id: null,
  rival_audience_id: null, links: [], updated_at: '2026-01-01T00:00:00Z',
  nodes: [{ id: 'n1', type: 'game', title: 'Carolina Fans Takeover New Orleans',
            city: 'New Orleans, Louisiana' }] };
const EVENTS = [{
  id: 'NFL-2026-11-15-CAR-NO', kind: 'sports', title: null,
  start_date: '2026-11-15', venue_city: 'New Orleans, Louisiana',
  away_team_geo: 'Carolina', away_team_nickname: 'Panthers',
  home_team_geo: 'New Orleans', home_team_nickname: 'Saints', league: 'NFL'
}];

async function run(browser, viewHasColumn) {
  const writes = [];
  const errs = [];
  const p = await browser.newPage();
  await p.setViewport({ width: 1500, height: 1100 });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.evaluateOnNewDocument(() => {
    window.__a = null;
    window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
      return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
    window.TgbAdminSiteNav = { bindAuth: () => {} };
  });
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    const u = req.url();
    if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
    const cors = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
      'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS','access-control-expose-headers':'content-range' };
    if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
    if (req.method() !== 'GET') writes.push({ m: req.method(), u: u, b: req.postData() });

    /* THE VIEW AS IT WAS: the column is absent, so PostgREST refuses the WHOLE
       request rather than dropping the field. That is the behaviour under test. */
    if (!viewHasColumn && req.method() === 'GET' && u.indexOf('anchor_event_id') !== -1) {
      req.respond({ status: 400, contentType: 'application/json', headers: cors,
        body: JSON.stringify({ code: '42703', message: 'column games_with_graph_and_teams.anchor_event_id does not exist' }) });
      return;
    }
    let body = [];
    if (u.indexOf('/events') !== -1) body = EVENTS;
    else if (u.indexOf('games') !== -1) {
      const row = Object.assign({}, ROW);
      if (!viewHasColumn) delete row.anchor_event_id;
      body = [row];
    }
    req.respond({ status: 200, contentType: 'application/json',
      headers: Object.assign({ 'content-range': '0-0/1' }, cors), body: JSON.stringify(body) });
  });

  await p.goto('http://127.0.0.1:8860/mc/games/?id=' + ROW.id, { waitUntil: 'networkidle2' });
  await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
  await new Promise((r) => setTimeout(r, 1600));

  const label = await p.evaluate(() => {
    const o = document.querySelector('#anchorEventList option');
    return o ? (o.value || o.textContent) : null;
  });
  await p.evaluate((lab) => {
    const i = document.getElementById('anchorEventInput');
    i.value = lab;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, label);
  await new Promise((r) => setTimeout(r, 700));

  writes.length = 0;
  await p.evaluate(() => { const b = document.getElementById('gamePickerSaveBtn'); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 2000));

  let anchor = '(no games write at all)';
  const w = writes.find((x) => x.u.indexOf('/games') !== -1);
  if (w) {
    try {
      const j = JSON.parse(w.b);
      const r = Array.isArray(j) ? j[0] : j;
      anchor = ('anchor_event_id' in r) ? JSON.stringify(r.anchor_event_id) : '(column absent)';
    } catch (e) { anchor = '(unparsed)'; }
  }
  await p.close();
  return { anchor: anchor, writes: writes.length, errs: errs };
}

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => server.listen(8860, r));
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  try {
    let ok = 0, bad = 0;
    const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
      : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

    /* THE FAULT, REPRODUCED. A 400 naming the column is parsed by
       getMissingGamesColumnName and switched off by markMissingGamesColumn,
       and the save then omits it for the rest of the session -- so a column
       missing from the VIEW makes a column on the TABLE unwritable. */
    const before = await run(br, false);
    t('a view missing the column makes the save drop it',
      before.anchor === '(column absent)', before.anchor);
    t('  and the save still lands, which is why it is silent',
      before.writes > 0, before.writes);

    /* AND THE FIX. 2026083124 put it on the view. */
    const after = await run(br, true);
    t('with the column on the view the save carries it',
      after.anchor === '"NFL-2026-11-15-CAR-NO"', after.anchor);
    t('  with no console errors', after.errs.length === 0, after.errs.join(' | '));

    console.log('');
    console.log(ok + ' ok, ' + bad + ' FAIL');
    if (bad) process.exitCode = 1;
  } finally { await br.close(); server.close(); }
})();
