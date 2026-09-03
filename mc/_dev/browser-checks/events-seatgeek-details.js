/* EVERY SEATGEEK ROW CARRIES A DETAILS DOOR, HARD RIGHT.
   ---------------------------------------------------------------------------
   THE ROW IS A DIV AND THE TICKABLE PART IS THE LABEL INSIDE IT. It used to be
   a label end to end, and an anchor inside a label is the nesting browsers
   disagree about -- a press could navigate AND toggle the checkbox under it.
   This repo already keeps such a door OUTSIDE the label in the Stop Builder and
   on the audience badge, and this is that rule applied a third time.

   SO THE TWO GESTURES ARE ASSERTED SEPARATELY, both ways round: pressing
   Details must not tick the row, and clicking the row text must still tick it.
   Either one alone would pass on a page that had traded one for the other.

   RIGHT ALIGNED IS A MEASUREMENT, never a declaration -- the gap from the
   button to the row edge is the row's own padding and nothing more.

   AND THE STRUCTURAL ASSERTION IS THE LOAD-BEARING ONE, which was measured
   rather than assumed: with the door put back INSIDE the label, THIS Chrome
   still refuses to forward the label's activation to an interactive
   descendant, so the two behavioural assertions pass and only
   `the anchor is NOT inside the label` fails. The behaviour check cannot see
   the fault in the browser it runs in -- which is the whole reason the repo
   keeps the door outside rather than trusting one browser to get it right.

   Run against a page with the door inside the label it fails on the structure.
   Run against one with no door it fails on the count. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

const EV = [
 { id:9100, short_title:'Philadelphia Eagles at Dallas Cowboys', title:'x',
   datetime_local:'2026-11-08T16:25:00',
   url:'https://seatgeek.com/philadelphia-eagles-at-dallas-cowboys-tickets/9100',
   taxonomies:[{name:'sports'},{name:'football'},{name:'nfl'}],
   venue:{name:'AT&T Stadium',city:'Arlington',state:'TX',country:'US'},
   performers:[{name:'Dallas Cowboys',short_name:'Cowboys',home_team:true},
               {name:'Philadelphia Eagles',short_name:'Eagles',away_team:true}] },
 { id:9101, short_title:'George Strait at AT&T Stadium', title:'x',
   datetime_local:'2026-12-05T19:00:00',
   url:'https://seatgeek.com/george-strait-tickets/9101',
   taxonomies:[{name:'concert'}],
   venue:{name:'AT&T Stadium',city:'Arlington',state:'TX',country:'US'}, performers:[] },
 /* A ROW WITH NO URL. SeatGeek gives every event one today, so this is a
    guard rather than an observation -- and a door that leads nowhere is what
    is being guarded against. */
 { id:9102, short_title:'A Listing With No Link', title:'x',
   datetime_local:'2026-12-09T19:00:00', url:'',
   taxonomies:[{name:'concert'}],
   venue:{name:'AT&T Stadium',city:'Arlington',state:'TX',country:'US'}, performers:[] }
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
  await new Promise((r) => srv.listen(9086, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  const p = await br.newPage();
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
    if (u.indexOf('api.seatgeek.com') !== -1) {
      q.respond({ status:200, contentType:'application/json', headers:H,
        body: JSON.stringify({ events: EV, meta:{ total: EV.length, page:1, per_page:100 } }) }); return; }
    if (u.indexOf('seatgeek.com') !== -1) {
      q.respond({ status:200, contentType:'text/html', body:'<title>sg</title>' }); return; }
    if (u.indexOf('supabase.co') !== -1) {
      if (m === 'OPTIONS') { q.respond({ status:204, headers:H }); return; }
      q.respond({ status:200, contentType:'application/json',
        headers: Object.assign({ 'content-range':'0-0/0' }, H), body:'[]' }); return; }
    q.continue();
  });

  await p.goto('http://127.0.0.1:9086/mc/events/', { waitUntil:'networkidle2' });
  await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
  await new Promise((r) => setTimeout(r, 3000));
  await p.evaluate(() => { document.getElementById('seatgeekBtn').click(); });
  await new Promise((r) => setTimeout(r, 500));
  await p.evaluate(() => {
    const c = document.getElementById('sgCity');
    c.value = 'Arlington'; c.dispatchEvent(new Event('input', { bubbles:true }));
    const f = document.getElementById('sgFrom');
    if (f && !f.value) { f.value = '2026-11-01'; f.dispatchEvent(new Event('input', { bubbles:true })); }
    document.getElementById('sgFetchBtn').click();
  });
  await new Promise((r) => setTimeout(r, 5000));

  const shape = await p.evaluate(() => {
    return [...document.querySelectorAll('#sgList .sg-item')].map((r) => {
      const a = r.querySelector('.sg-details');
      const rb = r.getBoundingClientRect();
      const when = r.querySelector('.sg-when');
      return {
        name: (r.querySelector('.sg-name') || {}).textContent,
        has: !!a, text: a ? a.textContent : null, href: a ? a.getAttribute('href') : null,
        target: a ? a.getAttribute('target') : null, rel: a ? a.getAttribute('rel') : null,
        tag: r.tagName, pickTag: (r.querySelector('.sg-pick') || {}).tagName,
        anchorInLabel: a ? !!a.closest('label') : false,
        rowH: Math.round(rb.height),
        gapRight: a ? Math.round(rb.right - a.getBoundingClientRect().right) : null,
        afterDate: (a && when) ? Math.round(a.getBoundingClientRect().left - when.getBoundingClientRect().right) : null
      };
    });
  });
  shape.forEach((r) => console.log('   ' + JSON.stringify(r)));
  console.log('');

  is('the row is a div and the tickable part is the label inside it',
     shape.every((r) => r.tag === 'DIV' && r.pickTag === 'LABEL'));
  is('two of the three rows carry a Details door', shape.filter((r) => r.has).length === 2);
  is('the row with no url draws none', shape.find((r) => /No Link/.test(r.name)).has === false);
  is('it says Details', shape.filter((r) => r.has).every((r) => r.text === 'Details'));
  is('it points at the SeatGeek event',
     shape.filter((r) => r.has).every((r) => r.href.indexOf('https://seatgeek.com/') === 0), shape[0].href);
  is('a new tab, with the opener cut',
     shape.filter((r) => r.has).every((r) => r.target === '_blank' && /noopener/.test(r.rel)));
  is('the anchor is NOT inside the label',
     shape.filter((r) => r.has).every((r) => r.anchorInLabel === false));

  /* RIGHT ALIGNED IS A MEASUREMENT, never a declaration: the gap to the row
     edge is the row padding and nothing more. */
  is('it sits hard right, one row padding from the edge',
     shape.filter((r) => r.has).every((r) => r.gapRight >= 8 && r.gapRight <= 12), shape[0].gapRight);
  /* THE BUTTON DOES SET THE ROW HEIGHT -- it is the tallest thing in the row,
     and no size stops that. WHAT IS WORTH ASSERTING IS THE COST, measured
     against the alternative rather than against a number I picked: the row
     with no door is the control, and .btn.small is what this would be without
     the trim. This list is capped at 46vh, so every pixel is rows off screen. */
  const heights = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#sgList .sg-item')];
    const withDoor = rows.filter((r) => r.querySelector('.sg-details'))[0];
    const noDoor = rows.filter((r) => !r.querySelector('.sg-details'))[0];
    const bare = Math.round(noDoor.getBoundingClientRect().height);
    const trimmed = Math.round(withDoor.getBoundingClientRect().height);
    const a = withDoor.querySelector('.sg-details');
    a.style.minHeight = '32px'; a.style.padding = '0 10px'; a.style.fontSize = '0.76rem';
    const full = Math.round(withDoor.getBoundingClientRect().height);
    a.style.minHeight = ''; a.style.padding = ''; a.style.fontSize = '';
    return { bare: bare, trimmed: trimmed, full: full };
  });
  console.log('   row height  no door ' + heights.bare + 'px  |  trimmed ' + heights.trimmed
              + 'px  |  .btn.small ' + heights.full + 'px');
  is('the trim really is shorter than .btn.small would be',
     heights.trimmed < heights.full, heights);
  is('and it costs the row no more than 5px', heights.trimmed - heights.bare <= 5,
     heights.trimmed - heights.bare);

  /* THE TRAP THIS SHAPE EXISTS FOR: pressing Details must not tick the row. */
  const before = await p.evaluate(() => [...document.querySelectorAll('#sgList input[type=checkbox]')].map((c) => c.checked));
  const pagesBefore = (await br.pages()).length;
  await p.evaluate(() => { document.querySelector('#sgList .sg-item .sg-details').click(); });
  await new Promise((r) => setTimeout(r, 1500));
  const after = await p.evaluate(() => [...document.querySelectorAll('#sgList input[type=checkbox]')].map((c) => c.checked));
  const pagesAfter = (await br.pages()).length;
  is('pressing Details does not tick or untick the row',
     JSON.stringify(before) === JSON.stringify(after), { before: before, after: after });
  is('and it really opens a tab', pagesAfter > pagesBefore, { before: pagesBefore, after: pagesAfter });

  /* AND THE ROW STILL TICKS FROM ITS TEXT, which is what the label is for. */
  await p.evaluate(() => { document.querySelector('#sgList .sg-item .sg-name').click(); });
  await new Promise((r) => setTimeout(r, 400));
  const toggled = await p.evaluate(() => [...document.querySelectorAll('#sgList input[type=checkbox]')].map((c) => c.checked));
  is('clicking the row text still ticks it', toggled[0] !== after[0], { after: after[0], toggled: toggled[0] });

  is('no page errors', errs.length === 0, errs.slice(0, 2));
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  await br.close(); srv.close();
  process.exit(bad ? 1 : 0);
})();
