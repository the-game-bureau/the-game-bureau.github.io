/* THE DATE IS ON THE CLOSED ROW, AFTER THE NAME, AS MONTH DD, YYYY.
   ---------------------------------------------------------------------------
   IT IS ON THE CLOSED ROW ONLY, which is the shape this room settled on when
   the date last left the head: the When band sits directly under the head with
   the same value in an editable box, so leaving it on would be the same fact
   twice a few pixels apart and the head's copy is the one you cannot act on.

   THE TIMEZONE TRAP IS THE ONE WORTH DRIVING. `new Date('2026-09-27')` parses
   as UTC MIDNIGHT, so west of Greenwich it renders as the 26th. The check runs
   the page in America/Los_Angeles, which is UTC-7: a date built the naive way
   comes out a day early there and correct in London, so a check run in one
   timezone only would pass over it.

   Run against a build that uses `new Date(iso)` it fails naming the 26th. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

/* Dates chosen to catch the off-by-one and the ordinary cases: a September
   day, a single-digit day, the first of a month, and one with no date at all. */
const ROWS = [
  { id:'A', kind:'sports', title:null, start_date:'2026-09-27', end_date:'2026-09-27',
    venue:'Maracana Stadium', venue_city:'Rio de Janeiro, Brazil', status:'scheduled',
    league:'NFL', away_team_nickname:'Ravens', home_team_nickname:'Cowboys' },
  { id:'B', kind:'concert', title:'A Single Digit Day', start_date:'2026-11-05',
    end_date:'2026-11-05', venue:'Hall', venue_city:'Denver, Colorado', status:'scheduled' },
  { id:'C', kind:'concert', title:'The First Of A Month', start_date:'2027-01-01',
    end_date:'2027-01-01', venue:'Hall', venue_city:'Chicago, Illinois', status:'scheduled' },
  { id:'D', kind:'concert', title:'No Date At All', start_date:null,
    end_date:null, venue:'Hall', venue_city:'Tulsa, Oklahoma', status:'scheduled' }
];

let ok = 0, bad = 0;
const is = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

async function room(tz, port) {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => srv.listen(port, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox', '--lang=en-US'] });
  const p = await br.newPage();
  await p.emulateTimezone(tz);
  await p.setViewport({ width: 1500, height: 1000 });
  const errs = [];
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
    if (m !== 'GET') { q.respond({ status:200, contentType:'application/json', headers:H, body:'[]' }); return; }
    if (u.indexOf('/events') !== -1) {
      q.respond({ status:200, contentType:'application/json',
        headers: Object.assign({ 'content-range':'0-' + (ROWS.length - 1) + '/' + ROWS.length }, H),
        body: JSON.stringify(ROWS) }); return; }
    q.respond({ status:200, contentType:'application/json', headers:H, body:'[]' });
  });
  await p.goto('http://127.0.0.1:' + port + '/mc/events/', { waitUntil: 'networkidle2' });
  await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
  await new Promise((r) => setTimeout(r, 3500));
  return { p: p, br: br, srv: srv, errs: errs };
}

function readRows(p) {
  return p.evaluate(() => [...document.querySelectorAll('.event-row')].map((r) => {
    const w = r.querySelector('.event-when');
    const name = r.querySelector('.event-name');
    const city = r.querySelector('.event-where');
    const cs = w ? getComputedStyle(w) : null;
    const nb = name.getBoundingClientRect();
    return {
      id: r.dataset.rowId,
      title: name.value || name.placeholder,
      when: w ? w.textContent : null,
      display: cs ? cs.display : null,
      wrap: cs ? cs.whiteSpace : null,
      afterName: w ? Math.round(w.getBoundingClientRect().left - nb.right) : null,
      beforeCity: (w && city) ? Math.round(city.getBoundingClientRect().left - w.getBoundingClientRect().right) : null
    };
  }));
}

(async () => {
  /* ---- 1. WEST OF GREENWICH, where the naive parse is a day early -------- */
  const a = await room('America/Los_Angeles', 9094);
  const west = await readRows(a.p);
  west.forEach((r) => console.log('   ' + (r.id + '   ').slice(0, 4) + (r.when === null ? '(no span)' : JSON.stringify(r.when))));
  console.log('');

  const byId = (rows, id) => rows.filter((r) => r.id === id)[0];
  is('the date is drawn after the name', byId(west, 'A').when === 'September 27, 2026', byId(west, 'A').when);
  is('a single digit day carries no leading zero', byId(west, 'B').when === 'November 5, 2026', byId(west, 'B').when);
  is('the first of a month is right', byId(west, 'C').when === 'January 1, 2027', byId(west, 'C').when);
  is('a row with no date draws nothing', byId(west, 'D').when === '', JSON.stringify(byId(west, 'D').when));
  is('it sits between the name and the city',
     byId(west, 'A').afterName >= 0 && byId(west, 'A').beforeCity >= 0,
     { afterName: byId(west, 'A').afterName, beforeCity: byId(west, 'A').beforeCity });
  is('and does not wrap', byId(west, 'A').wrap === 'nowrap', byId(west, 'A').wrap);

  /* OPENING THE ROW MUST HIDE IT, or the head and the When band say the same
     thing a few pixels apart -- which is why it left the head in the first
     place. */
  await a.p.evaluate(() => { document.querySelector('.event-row .event-caret').click(); });
  await new Promise((r) => setTimeout(r, 500));
  const opened = await a.p.evaluate(() => {
    const r = document.querySelector('.event-row');
    const w = r.querySelector('.event-when');
    return { open: r.classList.contains('is-open'), display: getComputedStyle(w).display,
             band: !!r.querySelector('[data-field="start_date"]') };
  });
  is('opening the row hides the head date', opened.open && opened.display === 'none', opened);
  is('and the editable date is there instead', opened.band);
  await a.p.evaluate(() => { document.querySelector('.event-row .event-caret').click(); });
  await new Promise((r) => setTimeout(r, 400));
  const shut = await a.p.evaluate(() =>
    getComputedStyle(document.querySelector('.event-row .event-when')).display);
  is('and closing it brings the date back', shut !== 'none', shut);

  is('no page errors west of Greenwich', a.errs.length === 0, a.errs.slice(0, 2));
  await a.br.close(); a.srv.close();

  /* ---- 2. EAST OF IT, where a naive parse looks correct ------------------ */
  const b = await room('Europe/London', 9095);
  const east = await readRows(b.p);
  is('the same date reads the same in London',
     byId(east, 'A').when === byId(west, 'A').when, { london: byId(east, 'A').when, la: byId(west, 'A').when });
  is('no page errors in London', b.errs.length === 0, b.errs.slice(0, 2));
  await b.br.close(); b.srv.close();

  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
