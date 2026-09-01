/* THE ANCHOR PREFILL MUST NOT WRITE A CITY THE TABLE REFUSES.
   ---------------------------------------------------------------------------
   `games_away_team_city_format_check` wants `City, FullStateName` -- one comma,
   never a two-letter code -- and `events.away_team_geo` is a BARE CITY on all
   608 sports events we hold. The prefill wrote that value straight through, so
   PostgREST answered 23514 and rejected the WHOLE upsert: the anchor, the
   audiences and every other edit in that save. 0 of 395 games carried an anchor
   because of it, and the room reported nothing.

   THE WRITE IS INTERCEPTED, NEVER SENT. Letting it through is how a check
   damages the row it is testing -- which is exactly what happened while this
   bug was being found, and it cost a real game its clubs.

   Run against the previous file this fails on the two city assertions with the
   bare cities the event carries. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };

/* THE CONSTRAINT ITSELF, so the check cannot drift from the database. */
const OK_CITY = (v) => /^[^,]+, [^,]+$/.test(v) && !/, [A-Z]{2}$/.test(v);

let ok = 0, fail = 0;
const is = (what, cond, got) => {
  if (cond) { ok += 1; console.log('  ok   ' + what); }
  else { fail += 1; console.log('  FAIL ' + what + (got === undefined ? '' : '   got: ' + JSON.stringify(got))); }
};

(async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const server = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => server.listen(8873, r));
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => ({ access_token: 'anon' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    const writes = [];
    const pageErrors = [];
    p.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
    p.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1 || req.method() === 'GET' || req.method() === 'OPTIONS') { req.continue(); return; }
      writes.push({ u: u, b: req.postData() });
      req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '[]' });
    });

    await p.goto('http://127.0.0.1:8873/mc/games/?id=nor2026car1', { waitUntil: 'networkidle2' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await new Promise((r) => setTimeout(r, 9000));

    /* A SPORTS EVENT: one that names clubs, which is what triggers the prefill. */
    const picked = await p.evaluate(() => {
      const opts = [...document.querySelectorAll('#anchorEventList option')];
      const o = opts.find((x) => (x.value || '').indexOf(' · sports · ') !== -1) || opts[0];
      if (!o) return null;
      const i = document.getElementById('anchorEventInput');
      i.value = o.value; i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return o.value;
    });
    is('a sports anchor event is on offer', !!picked && picked.indexOf('sports') !== -1, picked);
    await new Promise((r) => setTimeout(r, 900));

    writes.length = 0;
    await p.evaluate(() => { const b = document.getElementById('gamePickerSaveBtn'); if (b) b.click(); });
    await new Promise((r) => setTimeout(r, 8000));

    const w = writes.find((x) => x.u.indexOf('/games') !== -1 && x.u.indexOf('/rpc/') === -1);
    is('a games write is attempted', !!w);
    const row = w ? (() => { const j = JSON.parse(w.b); return Array.isArray(j) ? j[0] : j; })() : {};

    is('the payload carries the anchor', typeof row.anchor_event_id === 'string' && row.anchor_event_id.length > 0, row.anchor_event_id);
    is('the payload carries the target audience', !!row.target_audience_id, row.target_audience_id);
    /* THE TWO THAT FAIL ON THE OLD FILE. */
    is('away_team_city satisfies the CHECK, or is not written',
       !row.away_team_city || OK_CITY(row.away_team_city), row.away_team_city);
    is('home_team_city satisfies the CHECK, or is not written',
       !row.home_team_city || OK_CITY(row.home_team_city), row.home_team_city);
    is('the mascot is still written', typeof row.away_team_mascot === 'string' && row.away_team_mascot.length > 0, row.away_team_mascot);

    /* IT REFUSES RATHER THAN APPROXIMATES. */
    const refuses = await p.evaluate(() => {
      if (typeof legacyTeamCityFromEvent !== 'function') return '(no helper)';
      return legacyTeamCityFromEvent({ away_team_geo: 'Nowhereville', away_team_nickname: 'Nobodies' }, 'away');
    });
    is('a side with no audience writes nothing rather than a bare city', refuses === '', refuses);

    /* REAL PAGE ERRORS, COLLECTED FROM THE BROWSER. This read `window.__err`,
       which nothing on the page ever sets -- so it was always `[]` and the
       assertion COULD NOT FAIL. That is the `|| true` shape this project warns
       about, written into a check by the person who wrote the warning.

       IT ASSERTS UNCAUGHT EXCEPTIONS, NOT FAILED REQUESTS. This page really
       does 404 on DATA -- a game whose `logo_url` names an asset we do not
       hold, a guide portrait among the 372 of 395 that were already dead -- and
       a check that failed on those would be failing on content. */
    is('no uncaught page errors', pageErrors.length === 0, pageErrors);
  } finally { await br.close(); server.close(); }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
