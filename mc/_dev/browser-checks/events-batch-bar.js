/* THE BATCH BAR IS SELECT ALL, THE COUNT AND DELETE. NOTHING ELSE.
   The painter changed with the cut -- `aria-disabled` used to be written by a
   loop over two buttons and is now written inside the Delete branch -- so the
   enable/disable behaviour has to be driven, not read off the markup. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

const ROWS = [
  { id:'NFL-2026-11-08-PHI-DAL', kind:'sports', title:null, start_date:'2026-11-08',
    end_date:'2026-11-08', venue:'AT&T Stadium', venue_city:'Arlington, Texas',
    status:'scheduled', source:'SeatGeek', away_team_nickname:'Eagles', home_team_nickname:'Cowboys' },
  { id:'CON-2026-12-05-GEORGE-ARL', kind:'concert', title:'George Strait',
    start_date:'2026-12-05', end_date:'2026-12-05', venue:'AT&T Stadium',
    venue_city:'Arlington, Texas', status:'scheduled', source:'SeatGeek' }
];

let ok = 0, bad = 0;
const is = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
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
  await new Promise((r) => srv.listen(9088, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 1000 });
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
    if (m !== 'GET') { writes.push({ m: m, u: u, b: q.postData() });
      q.respond({ status:200, contentType:'application/json', headers:H, body:'[]' }); return; }
    if (u.indexOf('/events') !== -1) {
      q.respond({ status:200, contentType:'application/json',
        headers: Object.assign({ 'content-range':'0-' + (ROWS.length - 1) + '/' + ROWS.length }, H),
        body: JSON.stringify(ROWS) }); return; }
    q.respond({ status:200, contentType:'application/json', headers:H, body:'[]' });
  });

  await p.goto('http://127.0.0.1:9088/mc/events/', { waitUntil:'networkidle2' });
  await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
  await new Promise((r) => setTimeout(r, 3500));

  const bar = await p.evaluate(() => {
    const b = document.getElementById('batchBar');
    if (!b) return null;
    const kids = [...b.querySelectorAll('*')].filter((x) => x.parentElement === b || x.parentElement.className === 'batch-actions');
    return {
      text: b.textContent.replace(/\s+/g, ' ').trim(),
      controls: [...b.querySelectorAll('button, select, input, a')].map((x) => x.id || x.type || x.tagName),
      seps: b.querySelectorAll('.bar-sep').length,
      del: !!document.getElementById('batchDeleteBtn'),
      delState: (document.getElementById('batchDeleteBtn') || {}).getAttribute
        ? document.getElementById('batchDeleteBtn').getAttribute('aria-disabled') : null,
      delText: (document.getElementById('batchDeleteBtn') || {}).textContent
    };
  });
  console.log('   bar: ' + JSON.stringify(bar));
  console.log('');

  is('the bar exists', !!bar);
  is('it holds two controls: the select-all tick and Delete',
     bar.controls.length === 2 && bar.controls.indexOf('batchDeleteBtn') !== -1, bar.controls);
  is('no pipe is left in it', bar.seps === 0, bar.seps);
  is('and its words are Select all, the count and Delete',
     /^SELECT ALL/i.test(bar.text) && /delete/i.test(bar.text)
       && !/set kind/i.test(bar.text) && !/set source/i.test(bar.text) && !/apply/i.test(bar.text),
     bar.text);
  is('Delete is off with nothing ticked', bar.delState === 'true', bar.delState);
  is('and reads the bare verb', bar.delText === 'Delete', bar.delText);

  /* THE PAINTER MOVED, so the enable path is driven rather than assumed. */
  await p.evaluate(() => {
    const b = document.getElementById('batchAllBox');
    b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));
  const on = await p.evaluate(() => ({
    state: document.getElementById('batchDeleteBtn').getAttribute('aria-disabled'),
    text: document.getElementById('batchDeleteBtn').textContent,
    title: document.getElementById('batchDeleteBtn').title,
    count: document.getElementById('batchCount').textContent.trim()
  }));
  is('ticking everything turns Delete on', on.state === 'false', on);
  is('and it carries the count', on.text === 'Delete 2', on.text);
  is('and the count line says so', /2/.test(on.count), on.count);

  await p.evaluate(() => {
    const b = document.getElementById('batchAllBox');
    b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 400));
  const off = await p.evaluate(() => document.getElementById('batchDeleteBtn').getAttribute('aria-disabled'));
  is('and unticking turns it off again', off === 'true', off);

  /* NOTHING IS STRANDED: both columns the batch bar used to write are still
     editable on an opened row. That is what makes the removal a loss of a
     CAPABILITY rather than of a field. */
  await p.evaluate(() => { const c = document.querySelector('.event-caret'); if (c) c.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const fields = await p.evaluate(() => ({
    kind: !!document.querySelector('.event-row [data-field="kind"]'),
    source: !!document.querySelector('.event-row [data-field="source"]')
  }));
  is('kind is still editable on an opened row', fields.kind);
  is('and so is source', fields.source);

  is('nothing was written', writes.length === 0, writes.map((w) => w.m + ' ' + w.u.slice(-40)));
  is('no page errors', errs.length === 0, errs.slice(0, 2));

  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  await br.close(); srv.close();
  process.exit(bad ? 1 : 0);
})();
