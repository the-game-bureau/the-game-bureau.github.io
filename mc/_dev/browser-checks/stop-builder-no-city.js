/* A STOP IS A WAYPOINT AND A CHALLENGE. THE CITY IS THE WAYPOINT'S.
   2026090302 dropped `stops.city`, so this asserts BOTH halves: the room no
   longer asks for a town or sends one, and the town it draws comes off the
   waypoint. Either alone would pass on a page that had traded one for the
   other -- a room that stopped sending a city and stopped showing one is not
   the change that was asked for.

   Reads go to the LIVE database; the write is intercepted and answered with a
   plausible row, because a check has no business adding a stop to the
   catalogue it is reading. */
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
  await new Promise((r) => srv.listen(9263, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    const errs = [], writes = [], reads = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      if (/google\.com\/maps/.test(u)) { q.respond({ status: 200, contentType: 'text/html', body: '' }); return; }
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET') { reads.push(u); q.continue(); return; }
      let body = null;
      try { body = JSON.parse(q.postData() || 'null'); } catch (e) { body = q.postData(); }
      writes.push({ m: m, u: u, body: body });
      /* ANSWERED WITH THE ROW THE DATABASE WOULD HAVE RETURNED, so the success
         path runs. An empty array is what a REFUSED write looks like, and the
         room correctly reports that as a refusal -- which would test the
         refusal branch rather than the insert. */
      const made = body && !Array.isArray(body)
        ? Object.assign({ stop_id: 99999 }, body) : { stop_id: 99999 };
      q.respond({ status: 200, contentType: 'application/json', headers: H,
                  body: JSON.stringify([made]) });
    });

    await p.goto('http://127.0.0.1:9263/mc/stop-builder/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    let loaded = true;
    try {
      await p.waitForFunction(
        () => typeof state !== 'undefined' && state.loaded && state.rows.length > 0,
        { timeout: 40000 });
    } catch (e) { loaded = false; }
    if (!loaded) {
      const why = await p.evaluate(() => ({
        scribble: (document.getElementById('pageStatus') || {}).textContent || '',
        rows: typeof state !== 'undefined' ? state.rows.length : -1
      }));
      t('the room loads its stops', false, why);
      /* A 400 ON THE ORDER IS THE LIKELY CAUSE and is worth naming here rather
         than leaving to be worked out: an order clause naming a column that is
         gone takes the WHOLE read with it. */
      const four = reads.filter((u) => /stops\?/.test(u));
      console.log('   stops reads: ' + (four[0] || '(none)'));
      console.log('');
      console.log(ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));

    /* ---- THE TABLE ITSELF -------------------------------------------- */
    const cols = await p.evaluate(() => Object.keys(state.rows[0]).sort());
    /* THREE IDS, AND EVERY ONE SAYS WHAT IT POINTS AT. `id` became `stop_id`
       on 2026090303, which is also the name `maps.stop_id` already used for the
       column it references -- the two halves of that key share one name now. */
    t('a stop row is three ids and every one is named',
      cols.join(',') === 'challenge_id,stop_id,waypoint_id', cols);
    t('and the read does not order by a column that is gone',
      !reads.some((u) => /stops\?[^#]*city/.test(u)), reads.filter((u) => /stops\?/.test(u)));

    /* ---- THE ADD BAR ASKS FOR TWO THINGS ------------------------------ */
    const bar = await p.evaluate(() => ({
      fields: [...document.querySelectorAll('.stop-form .stop-field')]
        .map((f) => (f.querySelector('span') || {}).textContent.trim().split(String.fromCharCode(10))[0].trim()),
      cityInput: !!document.getElementById('cityInput'),
      cityList: !!document.getElementById('cityList'),
      wpTitle: (document.getElementById('wpInput') || {}).title || ''
    }));
    t('the add bar asks for a waypoint and a challenge, and no city',
      bar.fields.length === 2 && !bar.cityInput, bar.fields);
    /* THE DATALIST GOES WITH THE FIELD. A list nothing fills is what somebody
       re-points at the wrong thing. */
    t('and the city datalist went with the field', !bar.cityList);
    t('and the waypoint box no longer promises to narrow by city',
      !/narrow/i.test(bar.wpTitle), bar.wpTitle);

    /* ---- THE FOURTH LINE ---------------------------------------------- */
    const row = await p.evaluate(() => {
      const line = document.querySelector('#list .stop');
      const wpHalf = line.querySelector('.stop-half--wp');
      const chHalf = line.querySelector('.stop-half--ch');
      const key = line.dataset.key;
      const r = state.rows.filter((x) => String(x.stop_id) === key)[0];
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      return {
        cols: getComputedStyle(line).gridTemplateColumns.split(' ').length,
        cityCell: !!line.querySelector('.stop-city'),
        wpLines: [...wpHalf.children].map((n) => n.className),
        wpWhere: (wpHalf.querySelector('.stop-where') || {}).textContent || '',
        chWhere: !!chHalf.querySelector('.stop-where'),
        want: w ? [w.city, w.state].filter(Boolean).join(', ') : '',
        address: w ? String(w.address || '') : ''
      };
    });
    t('the row has no city column of its own', !row.cityCell && row.cols === 3, row.cols);
    /* KICKER, NAME, ADDRESS, CITY -- the city is the FOURTH line, which is the
       ask stated as a position rather than as a presence. */
    t('the waypoint badge is four lines',
      row.wpLines.join(',') === 'stop-kicker,stop-name,stop-sub,stop-where', row.wpLines);
    t("and the fourth is the WAYPOINT's own city",
      row.wpWhere === row.want && row.want.length > 0, row);
    /* A CHALLENGE IS NOT ANYWHERE. */
    t('the challenge badge has no such line', !row.chWhere);

    /* A WAYPOINT WITH NO ADDRESS MUST NOT PRINT ITS TOWN TWICE, which the old
       `w.address || wpWhere(w)` fallback would do now the city is always
       drawn. */
    const twice = await p.evaluate(() => {
      const w = state.waypoints.filter((x) => !String(x.address || '').trim())[0];
      if (!w) return { skipped: true };
      const r = { stop_id: -7, waypoint_id: w.wpid, challenge_id: null };
      state.rows.push(r); render();
      const line = [...document.querySelectorAll('#list .stop')]
        .filter((n) => n.dataset.key === '-7')[0];
      const half = line.querySelector('.stop-half--wp');
      const out = { sub: (half.querySelector('.stop-sub') || {}).textContent || '',
                    where: (half.querySelector('.stop-where') || {}).textContent || '' };
      state.rows = state.rows.filter((x) => x.stop_id !== -7); render();
      return out;
    });
    t('a waypoint with no address does not print its town twice',
      twice.skipped || (twice.sub === '' && twice.where.length > 0), twice);

    /* ---- THE POPUP ----------------------------------------------------- */
    const pop = await p.evaluate(() => {
      const r = state.rows.filter((x) => x.waypoint_id != null)[0];
      openStop(r);
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      const out = { head: document.getElementById('svCity').textContent,
                    want: w ? [w.city, w.state].filter(Boolean).join(', ') : '' };
      closeStop();
      return out;
    });
    t("the popup head says the waypoint's city", pop.head === pop.want && pop.want.length > 0, pop);

    /* ---- THE BOX SAYS WHAT IT IS AND WHAT IT TAKES --------------------- */
    const box = await p.evaluate(() => {
      const q = document.getElementById('q');
      return { legend: q.closest('fieldset').querySelector('legend').textContent.trim(),
               placeholder: q.placeholder };
    });
    t('the box is labelled Search', box.legend === 'Search', box.legend);
    /* THE PLACEHOLDER SAYS WHAT IT SEARCHES. It named three things -- city,
       place, challenge -- while every other field on both halves was on screen
       and unfindable, so it was describing a narrower box than the one there. */
    t('and its placeholder does not name a closed list of three',
      !/city, place or challenge/i.test(box.placeholder), box.placeholder);

    /* ---- EVERY FIELD ON BOTH HALVES ------------------------------------
       DRIVEN OFF REAL VALUES rather than a pinned fixture: the check asks the
       loaded rows for a term and then requires the search to find it. A check
       that demanded production data hold one shape is a check that rots the
       moment somebody edits a row. */
    const fields = await p.evaluate(() => {
      const q = document.getElementById('q');
      const find = (term) => {
        q.value = term;
        q.dispatchEvent(new Event('input', { bubbles: true }));
        const n = document.querySelectorAll('#list .stop').length;
        q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
        return n;
      };
      /* A TERM MUST BE DISTINCTIVE, or a hit proves nothing: a search for "a"
         matches everything whatever the code does. The longest word of five
         letters or more is taken from each field. */
      const word = (v) => {
        const parts = String(v == null ? '' : v).split(/[^A-Za-z0-9]+/)
          .filter((x) => x.length >= 5);
        return parts.sort((a, b) => b.length - a.length)[0] || '';
      };
      const out = {};
      state.rows.forEach((r) => {
        const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
        const c = r.challenge_id == null ? null : state.challenges.filter((x) => x.id === r.challenge_id)[0];
        ['description', 'zip', 'source_url'].forEach((k) => {
          if (!out['wp.' + k] && w && word(w[k])) out['wp.' + k] = word(w[k]);
        });
        ['prompt', 'answer', 'kind', 'scope'].forEach((k) => {
          if (!out['ch.' + k] && c && word(c[k])) out['ch.' + k] = word(c[k]);
        });
        if (!out['ch.choices'] && c && Array.isArray(c.choices)) {
          const got = c.choices.map(word).filter(Boolean)[0];
          if (got) out['ch.choices'] = got;
        }
      });
      const res = {};
      Object.keys(out).forEach((k) => { res[k] = { term: out[k], n: find(out[k]) }; });
      return res;
    });
    Object.keys(fields).forEach((k) => {
      const f = fields[k];
      t('searching a ' + k.replace('.', ' ') + ' finds its stop', f.n > 0, f);
    });
    t('and it reached fields the old four-term search could not',
      Object.keys(fields).length >= 4, Object.keys(fields));

    /* ---- SEARCH STILL REACHES A TOWN ----------------------------------- */
    const found = await p.evaluate(() => {
      const r = state.rows.filter((x) => x.waypoint_id != null)[0];
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      const town = String(w.city || '').toLowerCase();
      const box = document.getElementById('q');
      box.value = town;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      const n = document.querySelectorAll('#list .stop').length;
      box.value = '';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return { town: town, n: n };
    });
    /* THE CITY IS STILL SEARCHABLE, THROUGH THE WAYPOINT. Reading `row.city`
       would compare against undefined and match nothing, which looks exactly
       like a town nobody has a stop in. */
    t('searching a town still finds its stops', found.n > 0, found);

    /* ---- THE WRITE ----------------------------------------------------- */
    const sent = await p.evaluate(async () => {
      const used = {};
      state.rows.forEach((r) => { if (r.waypoint_id != null) used[r.waypoint_id] = true; });
      const w = state.waypoints.filter((x) => !used[x.wpid])[0];
      document.getElementById('wpInput').value = wpLabel(w);
      document.getElementById('chalInput').value = '';
      await addStop();
      return { wpid: w.wpid };
    });
    await new Promise((r) => setTimeout(r, 400));
    const post = writes.filter((w) => w.m === 'POST')[0];
    t('adding a stop POSTs exactly the two ids',
      !!post && Object.keys(post.body).sort().join(',') === 'challenge_id,waypoint_id',
      post ? Object.keys(post.body) : writes);
    t('and the waypoint it was given', post && post.body.waypoint_id === sent.wpid,
      post && post.body.waypoint_id);
    /* RANDOM IS A NULL CHALLENGE, and that is unambiguous only because the
       picker has no empty option. */
    t('with RANDOM as a null challenge', post && post.body.challenge_id === null,
      post && post.body.challenge_id);
    t('and no city anywhere in it',
      post && !Object.prototype.hasOwnProperty.call(post.body, 'city'), post && post.body);

    /* ---- A DATABASE THAT HAS NOT RUN THE MIGRATION -------------------
       This is the direction that really happens: the page is deployed and the
       SQL goes in by hand, so for a while `city` is still NOT NULL and the
       two-id insert is refused. THE ROOM MUST NAME THE FILE rather than hand
       over a raw 23502, which is a statement about our schema. */
    const told = await p.evaluate(async () => {
      const res = { status: 400, ok: false, text: async () => JSON.stringify({
        code: '23502', message: 'null value in column "city" of relation "stops" '
          + 'violates not-null constraint' }) };
      return await readError(res);
    });
    t('an un-migrated database is told which file to run',
      /2026090302/.test(told), told);
    t('and is not handed a raw postgres code', !/^The database refused/.test(told), told);

    t('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
