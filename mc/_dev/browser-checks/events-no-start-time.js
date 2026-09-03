/* A FIXTURE WITH NO KICKOFF IS AN ISSUE. ANYTHING ELSE IS A NOTE.
   ---------------------------------------------------------------------------
   THE RULE IS DRIVEN WITH SYNTHETIC ROWS, and that is the point rather than a
   convenience. The first version of this check read the live table and asserted
   the room narrows to "the N fixtures with no time" -- which was 3 on the day
   it was written and is 0 now that the backfill has filled them in. At 0 the
   comparison is 0 === 0 and CANNOT FAIL: the check would go green over a rule
   that had been deleted. A check that demands production data be in one shape
   is a check that rots the moment somebody fixes the data.

   The page script is a plain classic script, so `reviewReasons` and
   `noteReasons` are top-level function declarations and therefore reachable.
   Calling them on rows we make up proves BOTH sides at once, for ever, whatever
   the table happens to hold.

   The live table is still read, and still asserted against -- but only for
   what is actually true of it, which is the other half of that lesson.

   The `issues` PATCH is intercepted. A check has no business editing the table
   it audits. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

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
  await new Promise((r) => srv.listen(9100, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 180000 });
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
      if (m === 'GET') { q.continue(); return; }         /* reads are REAL */
      writes.push({ m: m, u: u, b: q.postData() });
      /* A REFUSED WRITE ANSWERS 200 WITH AN EMPTY ARRAY and the room reads the
         row back to tell that from a success, so a stub echoing the REQUEST
         body hands it an object where it expects an array and the page
         correctly reports a refusal. The first run of this check did exactly
         that, and an assertion looking for the count PASSED ON THE ERROR
         MESSAGE. It answers with a row array. */
      let echo = '[]';
      try {
        const sent = JSON.parse(q.postData() || '{}');
        const ids = /id=in\.%28(.*?)%29|id=in\.\((.*?)\)/.exec(u);
        const list = ids ? decodeURIComponent(ids[1] || ids[2]).split(',')
          .map((x) => x.replace(/^"|"$/g, '')) : ['x'];
        echo = JSON.stringify(list.map((id) => Object.assign({ id: id }, sent)));
      } catch (e) { echo = '[]'; }
      q.respond({ status: 200, contentType: 'application/json', headers: H, body: echo });
    });

    await p.goto('http://127.0.0.1:9100/mc/events/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await new Promise((r) => setTimeout(r, 20000));

    /* ---- THE RULE ITSELF, ON ROWS WE MAKE UP ------------------------- */
    const rule = await p.evaluate(() => {
      const say = (row) => ({
        findings: reviewReasons(row).filter((x) => x.indexOf('Start Time') !== -1).length,
        notes: noteReasons(row).filter((x) => x.indexOf('Start Time') !== -1).length
      });
      const base = { id: 'PROBE', title: 'Probe', start_date: '2026-10-01', end_date: '2026-10-01',
                     venue: 'Somewhere', venue_city: 'Chicago, Illinois', url: '', source: 'probe' };
      const fx = { league: 'NFL', sport: 'Football', away_team_geo: 'Chicago',
                   away_team_nickname: 'Bears', home_team_geo: 'Green Bay',
                   home_team_nickname: 'Packers' };
      return {
        fixtureBlank: say(Object.assign({}, base, fx, { kind: 'sports-nfl', start_time: '' })),
        fixtureBare:  say(Object.assign({}, base, fx, { kind: 'sports',     start_time: '' })),
        fixtureTimed: say(Object.assign({}, base, fx, { kind: 'sports-nfl', start_time: '13:00' })),
        concertBlank: say(Object.assign({}, base, { kind: 'concert',    start_time: '' })),
        conventionBlank: say(Object.assign({}, base, { kind: 'convention', start_time: '' }))
      };
    });

    is('a fixture with no kickoff is a FINDING',
       rule.fixtureBlank.findings === 1 && rule.fixtureBlank.notes === 0, rule.fixtureBlank);
    is('and so is a plain sports row',
       rule.fixtureBare.findings === 1 && rule.fixtureBare.notes === 0, rule.fixtureBare);
    is('a fixture that has one says nothing at all',
       rule.fixtureTimed.findings === 0 && rule.fixtureTimed.notes === 0, rule.fixtureTimed);
    /* THE OTHER SIDE, AND THE REASON IT IS HERE. Forcing this on everything was
       measured at 524 rows of a 4,123-row table in August, because a promoter
       who has not announced a slot is a gap that fills itself. Re-import a
       season of concerts and they must be muted notes again. */
    is('a concert with no time is a muted NOTE, never a finding',
       rule.concertBlank.notes === 1 && rule.concertBlank.findings === 0, rule.concertBlank);
    is('and so is a convention',
       rule.conventionBlank.notes === 1 && rule.conventionBlank.findings === 0, rule.conventionBlank);

    /* ---- AND WHAT THE LIVE TABLE ACTUALLY HOLDS ---------------------- */
    const table = await p.evaluate(async () => {
      const k = (/sb_publishable_[A-Za-z0-9_-]+/.exec(document.documentElement.innerHTML) || [])[0];
      const r = await fetch('https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/events'
        + '?select=id,kind,start_time,timezone,title&limit=1000',
        { headers: { apikey: k, Authorization: 'Bearer ' + k } });
      return r.json();
    });
    const timeless = table.filter((r) => !r.start_time);
    const fixturesTimeless = timeless.filter((r) => String(r.kind || '').indexOf('sports') === 0);
    const zoneless = table.filter((r) => r.start_time && !r.timezone);
    console.log('');
    console.log('   table: ' + table.length + ' rows, ' + timeless.length + ' with no start time ('
                + fixturesTimeless.length + ' of them fixtures), '
                + zoneless.length + ' with a time and no zone');
    fixturesTimeless.slice(0, 6).forEach((r) => console.log('     ' + r.kind + '  ' + r.title));
    console.log('');

    /* A TIME WITHOUT A ZONE IS A NUMBER NOBODY CAN INTERPRET. */
    is('no row on file carries a kickoff with no zone', zoneless.length === 0,
       zoneless.slice(0, 4).map((r) => r.title));

    /* ---- THE CHECK BUTTON, PRESSED --------------------------------- */
    const before = await p.evaluate(() =>
      (document.getElementById('errorsBtn') || document.querySelector('.command-bar--check .btn') || {}).textContent);
    is('the Check button exists', typeof before === 'string' && before.length > 0, before);

    await p.evaluate(() => {
      const b = document.getElementById('errorsBtn') || document.querySelector('.command-bar--check .btn');
      if (b) b.click();
    });
    /* WAIT ON THE CONDITION, NEVER ON A CLOCK. The scribble clears itself after
       six seconds on a success, and a probe that slept exactly 6000ms read it
       empty on one run and right on the next. */
    await p.waitForFunction(() => {
      const t = ((document.getElementById('pageStatus') || {}).textContent || '').trim();
      return t.length > 0;
    }, { timeout: 30000 });
    const after = await p.evaluate(() => ({
      scribble: (document.getElementById('pageStatus') || {}).textContent || '',
      rows: document.querySelectorAll('.event-row').length,
      review: document.querySelectorAll('.event-row.is-review').length,
      lines: [...document.querySelectorAll('.event-annotation-line')].map((x) => x.textContent),
      notes: [...document.querySelectorAll('.event-annotation-line--note')].map((x) => x.textContent)
    }));
    console.log('   ' + after.scribble.trim().slice(0, 200));
    console.log('   rows drawn ' + after.rows + ', in review ' + after.review);
    console.log('');

    is('the sweep reports and does not fail',
       !/could not|refused|check you are signed in/i.test(after.scribble), after.scribble.trim());

    /* THE ROOM'S OWN ANSWER, ASSERTED FOR THE STATE THE TABLE IS ACTUALLY IN
       -- both branches, so neither can go vacuous. */
    const drawn = after.lines.filter((l) => l.indexOf('Add a Start Time') !== -1).length;
    const noted = after.notes.filter((l) => l.indexOf('Add a Start Time') !== -1).length;
    if (fixturesTimeless.length) {
      is('the room draws the finding on every timeless fixture',
         drawn === fixturesTimeless.length && noted === 0,
         { drawn: drawn, noted: noted, expected: fixturesTimeless.length });
      is('and narrows to them',
         after.rows === fixturesTimeless.length && after.review === fixturesTimeless.length,
         { rows: after.rows, review: after.review, expected: fixturesTimeless.length });
    } else {
      is('with every fixture timed, no row claims the finding', drawn === 0 && noted === 0,
         { drawn: drawn, noted: noted });
      is('and the room does not narrow to nothing', after.rows > 0, after.rows);
    }

    is('the audit wrote nothing but the issues flag',
       writes.every((w) => w.m === 'PATCH'), writes.map((w) => w.m).slice(0, 3));
    is('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
