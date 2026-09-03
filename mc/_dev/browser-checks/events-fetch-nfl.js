/* A REAL NFL FETCH, AGAINST THE LIVE SEATGEEK API, WRITE INTERCEPTED.
   ---------------------------------------------------------------------------
   The claim is entirely about what SeatGeek hands back, so a fixture of my own
   events would be testing my own guess. Only the Supabase writes are caught.

   WHAT IT IS FOR. On an international NFL game SeatGeek's home/away flags are
   inverted where they exist and ABSENT on Munich, while the title `A vs B` is
   correct on all six. That produced three rows with the sides swapped and one
   with no clubs at all. This drives the import and reads what would be filed. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

/* The league's own designation, from ESPN, for the six SeatGeek carries. */
const LEAGUE = {
  'Melbourne|2026-09-11':   ['San Francisco 49ers', 'Los Angeles Rams'],
  'Rio De Janeiro|2026-09-27': ['Baltimore Ravens', 'Dallas Cowboys'],
  'London|2026-10-04':      ['Indianapolis Colts', 'Washington Commanders'],
  'London|2026-10-11':      ['Philadelphia Eagles', 'Jacksonville Jaguars'],
  'London|2026-10-18':      ['Houston Texans', 'Jacksonville Jaguars'],
  'Saint-Denis|2026-10-25': ['Pittsburgh Steelers', 'New Orleans Saints'],
  'Madrid|2026-11-08':      ['Cincinnati Bengals', 'Atlanta Falcons'],
  'Munich|2026-11-15':      ['New England Patriots', 'Detroit Lions'],
  'Mexico City|2026-11-22': ['Minnesota Vikings', 'San Francisco 49ers']
};

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
  await new Promise((r) => srv.listen(9096, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
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
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }   /* SeatGeek is REAL */
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') { writes.push({ m: m, u: u, b: q.postData() });
        q.respond({ status:200, contentType:'application/json', headers:H, body: q.postData() || '[]' }); return; }
      q.respond({ status:200, contentType:'application/json',
        headers: Object.assign({ 'content-range':'*/0' }, H), body:'[]' });   /* an EMPTY table */
    });

    await p.goto('http://127.0.0.1:9096/mc/events/', { waitUntil: 'networkidle2' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await new Promise((r) => setTimeout(r, 3000));

    /* THE ADD BAR IS MANUAL AND FETCH (2026-09-03). MORE was deleted with its
       whole prompt once the top-up made a league fetch complete; asserting its
       ABSENCE is what stops it drifting back, and asserting the bar's contents
       is what would catch a third button arriving unnoticed. */
    const faces = await p.evaluate(() => ({
      fetch: (document.getElementById('seatgeekBtn') || {}).textContent,
      more: !!document.getElementById('conventionsBtn'),
      dialog: !!document.getElementById('cvLightbox'),
      add: [...document.querySelectorAll('.command-bar--add .btn')].map((b) => b.textContent)
    }));
    is('the fetch button says FETCH', faces.fetch === 'FETCH', faces.fetch);
    is('the MORE button is gone', faces.more === false);
    is('and so is its dialog', faces.dialog === false);
    is('the Add bar is MANUAL and FETCH, and nothing else',
       faces.add.join(',') === 'MANUAL,FETCH', faces.add);

    await p.evaluate(() => { document.getElementById('seatgeekBtn').click(); });
    await new Promise((r) => setTimeout(r, 500));
    await p.evaluate(() => {
      const c = document.getElementById('sgCity');
      c.value = 'NFL'; c.dispatchEvent(new Event('input', { bubbles: true }));
      const f = document.getElementById('sgFrom');
      if (f) { f.value = '2026-09-01'; f.dispatchEvent(new Event('input', { bubbles: true })); }
      const o = document.getElementById('sgTo');
      if (o) { o.value = '2027-03-01'; o.dispatchEvent(new Event('input', { bubbles: true })); }
      document.getElementById('sgFetchBtn').click();
    });
    for (let i = 0; i < 60; i += 1) {
      const done = await p.evaluate(() => document.getElementById('sgFetchBtn').disabled === false);
      if (done) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 1500));

    const rows = await p.evaluate(() => (window.__sgRows || []));
    /* sgState is not on window, so the rows are read off the drawn list and
       the import payload instead -- which is what would actually be filed. */
    const status = await p.evaluate(() =>
      (document.getElementById('sgStatus') || {}).textContent || '');
    console.log('   ' + status.trim().slice(0, 150));

    await p.evaluate(() => { const b = document.getElementById('sgImportBtn'); if (b) b.click(); });
    await new Promise((r) => setTimeout(r, 4000));

    const post = writes.filter((w) => w.m === 'POST' && w.u.indexOf('/events') !== -1)[0];
    /* EACH REASON IN THE STATUS LINE COUNTS ITS OWN ROWS. `dropped` is the
       undated ones and nothing else -- it reported the 27 non-games as "27 had
       no readable date", which is a false reason and worse than no reason. */
    is('the status does not blame the wrong filter',
       !/had no readable date/.test(status) || !/left out for not being a game/.test(status)
       || /(\d+) had no readable date/.exec(status)[1] !== /(\d+) rows left out for not being/.exec(status)[1],
       status.trim());
    is('and it says what it left out for not being a settled fixture',
       /left out for not being a settled fixture/.test(status), status.trim().slice(0, 220));
    /* NO COUNT IN THAT LINE MAY BE NEGATIVE. `dropped` read MINUS THREE once
       the league schedule started adding rows the marketplace never had -- a
       count taken from a list that has since grown. A negative in a status
       line is the page admitting it cannot count, in front of the person who
       is deciding what to import. */
    is('no count in the status line is negative',
       !/-\d/.test(status), status.trim());
    is('and it says the league schedule filled the gap',
       /came from the league schedule/.test(status), status.trim().slice(0, 240));

    is('an import was attempted', !!post, writes.map((w) => w.m + ' ' + w.u.slice(-30)));
    const filed = post ? JSON.parse(post.b) : [];
    console.log('   rows in the import payload: ' + filed.length);

    const kinds = {};
    filed.forEach((r) => { kinds[r.kind] = (kinds[r.kind] || 0) + 1; });
    console.log('   kinds: ' + JSON.stringify(kinds));
    is('every imported row is kind sports-nfl',
       filed.length > 0 && filed.filter((r) => r.kind === 'sports-nfl').length === filed.length, kinds);

    /* A LEAGUE TERM RETURNS GAMES AND NOTHING ELSE (2026-09-03). SeatGeek
       answers the nfl taxonomy with 850 rows: 550 stadium tours, and among the
       rest watch parties, rally days, season-ticket events and VIP tailgates --
       every one carrying the nfl taxonomy and not one of them a game. NONE OF
       THEM MAY REACH THE IMPORT. */
    const fixtures = filed.filter((r) => r.away_team_nickname && r.home_team_nickname);
    const notGames = filed.filter((r) => !(r.away_team_nickname && r.home_team_nickname));
    console.log('   fixtures ' + fixtures.length + '   not games ' + notGames.length);
    is('nothing that is not a game is imported', notGames.length === 0,
       notGames.slice(0, 4).map((r) => r.title));
    /* BY NAME AS WELL AS BY SHAPE. These are the four that were actually
       getting through, and the next one will look like them. */
    const junk = filed.filter((r) => /watch party|rally day|season ticket|suite holder|tailgate|pages & purple/i
      .test(String(r.title || '')));
    is('and none by name either', junk.length === 0, junk.slice(0, 4).map((r) => r.title));
    is('every fixture is named City Nickname at City Nickname',
       fixtures.filter((r) => r.title && r.title.indexOf(' at ') !== -1).length === fixtures.length,
       fixtures.filter((r) => !r.title || r.title.indexOf(' at ') === -1).slice(0, 3).map((r) => r.title));
    /* HOW CLOSE TO THE WHOLE SEASON A FETCH CAN GET, stated as a number
       rather than as a hope. 272 regular-season games exist; SeatGeek carries
       269 of them plus one `TBD at ...` placeholder for a game whose clubs are
       not settled, and it does NOT carry Melbourne, Rio or Saint-Denis --
       measured against the whole feed, not a window. So 270 is the ceiling for
       this route and the remaining three are the MORE prompt's errand.
         IF THIS EVER READS HIGHER, SeatGeek has started carrying one of the
       three and the prompt has less to do. If it reads LOWER, something in the
       import stopped resolving clubs. Either way it is worth looking at. */
    /* THE WHOLE REGULAR SEASON AND NOT ONE ROW MORE: 272. SeatGeek sells 269
       of them, does NOT sell Melbourne, Rio or Saint-Denis by any query, and
       DOES sell `TBD at Tennessee Titans` on 2027-02-01 -- a post-season
       placeholder that made this read 273 for a 272-game season. The three
       come from the league scoreboard; the placeholder is dropped. */
    is('the fetch reaches the whole regular season and nothing more',
       fixtures.length === 272 && filed.length === 272,
       { fixtures: fixtures.length, filed: filed.length });
    const scoreboard = filed.filter((r) => r.source === 'League scoreboard');
    console.log('   from the league schedule: '
                + scoreboard.map((r) => r.title).join(' | '));
    /* AT LEAST THREE, AND THE COUNT IS NOT PINNED. The three internationals
       are always topped up because SeatGeek does not sell them -- but the
       top-up also covers whatever the MARKETPLACE READ ITSELF HAPPENED TO
       MISS, and it really does miss rows: the feed's total moved 850 to 849
       between two runs minutes apart, and paging by page number over a list
       that is changing under you drops rows at the boundaries. One run topped
       up 3, the next 4, the fourth being `Cleveland Browns at New York Jets`
       -- still in the feed, simply skipped by the paged read.
         SO PINNING THIS TO 3 WOULD BE ASSERTING SEATGEEK'S INVENTORY ON ONE
       AFTERNOON. What is invariant is that the three unsold ones are always
       there and that the season comes out whole. */
    is('at least the three it does not sell came from the league schedule',
       scoreboard.length >= 3, scoreboard.map((r) => r.title));
    is('and those three are among them',
       ['Melbourne', 'Rio', 'Saint-Denis'].every((c) =>
         scoreboard.some((r) => String(r.venue_city || '').indexOf(c) !== -1)),
       scoreboard.map((r) => r.venue_city));
    is('each topped-up row carries a neutral flag that matches its venue',
       scoreboard.every((r) => {
         const abroad = !/, [A-Z]{2}$/.test(String(r.venue_city || ''));
         return r.neutral_site === abroad;
       }),
       scoreboard.map((r) => r.venue_city + ' neutral=' + r.neutral_site));
    is('and none duplicates a marketplace row',
       (function () {
         const seen = {};
         let dupe = 0;
         filed.forEach((r) => {
           const k = [r.away_team_nickname, r.home_team_nickname].sort().join('|')
                     + '|' + r.start_date;
           if (seen[k]) dupe += 1; seen[k] = 1;
         });
         return dupe === 0;
       })());
    /* NO BACKSLASH ESCAPES. A word boundary written as one has reached a file
       in this repo as a real backspace nineteen times; a plain substring
       cannot be eaten, and no club name contains TBD. */
    const tbd = filed.filter((r) => String(r.title || '').indexOf('TBD') !== -1
      || String(r.away_team_nickname || '').indexOf('TBD') !== -1);
    is('and no fixture with an unsettled club is imported', tbd.length === 0,
       tbd.map((r) => r.start_date + ' ' + r.title));
    is('every fixture is kind sports-nfl',
       fixtures.filter((r) => r.kind === 'sports-nfl').length === fixtures.length, kinds);
    const sample = filed.filter((r) => (r.venue_city || '').indexOf('Seattle') !== -1)[0] || filed[0];
    console.log('   sample: ' + JSON.stringify(sample && sample.title));

    is('no title uses vs as the separator',
       filed.filter((r) => / vs /i.test(r.title || '')).length === 0,
       filed.filter((r) => / vs /i.test(r.title || '')).slice(0, 3).map((r) => r.title));
    is('and no asterisk is baked into a title',
       filed.filter((r) => (r.title || '').indexOf('*') !== -1).length === 0);

    /* THE SIX INTERNATIONALS, AGAINST THE LEAGUE'S OWN DESIGNATION. */
    const intl = filed.filter((r) => r.neutral_site);
    console.log('');
    console.log('   NEUTRAL SITE ROWS (' + intl.length + '):');
    intl.forEach((r) => console.log('     ' + r.start_date + '  ' + r.title + '   (' + r.venue_city + ')'));
    is('all nine internationals are filed', intl.length === 9, intl.length);

    let agree = 0, wrong = [];
    intl.forEach((r) => {
      const city = String(r.venue_city || '').split(',')[0].trim();
      const want = LEAGUE[city + '|' + r.start_date];
      if (!want) { wrong.push(r.start_date + ' ' + city + ' (not in the league table)'); return; }
      const away = [r.away_team_geo, r.away_team_nickname].filter(Boolean).join(' ');
      const home = [r.home_team_geo, r.home_team_nickname].filter(Boolean).join(' ');
      if (away === want[0] && home === want[1]) agree += 1;
      else wrong.push(r.start_date + '  ours ' + away + ' at ' + home + '  league ' + want[0] + ' at ' + want[1]);
    });
    is('every international agrees with the league on which side is which',
       wrong.length === 0 && agree === 9, { wrong: wrong, agreed: agree });

    is('Munich carries both clubs',
       intl.filter((r) => /Munich/.test(r.venue_city || '') && r.away_team_nickname && r.home_team_nickname).length === 1,
       intl.filter((r) => /Munich/.test(r.venue_city || '')).map((r) => r.title));

    /* A KICKOFF WITHOUT A ZONE IS A NUMBER NOBODY CAN INTERPRET.
       ------------------------------------------------------------------
       `start_time` is the clock outside the venue and the row has to say
       which clock. Both sources can answer: SeatGeek carries an IANA zone on
       every venue, and the top-up derives one from the page's own city and
       state maps. */
    const noZone = filed.filter((r) => !r.timezone);
    is('every imported row says which clock its kickoff is on',
       noZone.length === 0, noZone.slice(0, 4).map((r) => r.start_date + ' ' + r.title));

    /* AN IANA NAME, NEVER AN OFFSET AND NEVER AN ABBREVIATION. An offset is
       wrong twice a year -- Saint-Denis kicks off on the very Sunday Europe
       puts its clocks back -- and CST means two different things depending on
       the hemisphere. Tested by handing it to Intl, which is what reads it. */
    const badZone = filed.filter((r) => {
      const z = String(r.timezone || '');
      if (z.indexOf('/') < 1 || z.indexOf('+') !== -1 || z.indexOf(':') !== -1) return true;
      try { new Intl.DateTimeFormat('en-CA', { timeZone: z }); return false; }
      catch (e) { return true; }
    });
    is('and every zone is an IANA name the browser accepts',
       badZone.length === 0, badZone.slice(0, 4).map((r) => r.timezone));

    /* THE DATE ON A NON-US GAME IS THE LOCAL ONE.
       A UTC instant crossing midnight files the fixture on the wrong calendar
       day, and a game is played the day BEFORE its anchor. Mexico City is the
       one 2026 fixture where the two differ -- 18:20 local on the 22nd is 00:20
       UTC on the 23rd -- so it is asserted by name as well as by the table. */
    const offLocal = intl.filter((r) => {
      const city = String(r.venue_city || '').split(',')[0].trim();
      return !LEAGUE[city + '|' + r.start_date];
    });
    is('every international is filed on its LOCAL date',
       offLocal.length === 0,
       offLocal.map((r) => r.start_date + ' ' + String(r.venue_city || '').split(',')[0]));

    const mex = intl.filter((r) => /Mexico City/.test(r.venue_city || ''))[0];
    is('Mexico City is the 22nd, not the UTC 23rd',
       !!mex && mex.start_date === '2026-11-22' && mex.timezone === 'America/Mexico_City',
       mex ? { date: mex.start_date, zone: mex.timezone } : 'not filed');

    /* AND THE TOP-UPS CARRY A KICKOFF NOW. They were filed with neither a time
       nor a zone, because a UTC instant alone cannot be turned into the clock
       outside the venue. With the zone the conversion is ordinary. */
    const toppedUp = filed.filter((r) => r.source === 'League scoreboard');
    const dumb = toppedUp.filter((r) => !r.start_time || !r.timezone);
    is('every league-schedule row carries a kickoff and a zone',
       toppedUp.length > 0 && dumb.length === 0,
       { topped: toppedUp.length, without: dumb.map((r) => r.title) });
    toppedUp.forEach((r) => console.log('     top-up  ' + r.start_date + ' ' + r.start_time
      + '  ' + r.timezone + '  ' + r.title));

    /* AND THE ASTERISK IS DRAWN FROM THE COLUMN, NOT THE NAME. */
    const star = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#sgList .sg-item')];
      return rows.length;
    });
    is('the fetch list drew rows', star > 0, star);

    is('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
