/* A NEW KIND REACHES EVERY CONTROL THAT OFFERS ONE.
   `KIND_VALUES` is meant to be the ONLY list -- the row's picker, the manual
   form and the batch bar are all built from it. Three hand-kept copies drifted
   before that was true, so the point of this check is that one edit is enough. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };

const ROWS = [
  { id: 'HIS-1', kind: 'historical', title: 'The centenary parade',
    league: null, sport: null, start_date: '2027-07-04', end_date: '2027-07-04',
    start_time: '10:00:00', home_team_geo: null, home_team_nickname: null,
    away_team_geo: null, away_team_nickname: null, venue: 'Jackson Square',
    venue_city: 'New Orleans, Louisiana', neutral_site: false,
    home_team_score: null, away_team_score: null, url: null, source: 'Manual',
    description: null, status: 'scheduled', issues: 'NO', issues_detail: null }
];

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(8819, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 1000 });
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                     'access-control-expose-headers': 'content-range' };
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
      const body = u.indexOf('/events') !== -1 ? ROWS : [];
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-0/' + body.length }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8819/mc/events/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 900));

    /* ---- THE LIST IS ALPHABETICAL --------------------------------------
       It used to group -- the three sports shapes, then music, then the theatre
       slugs -- which reads well once you know the list and is no help when you
       are hunting one of twenty-one in a dropdown.
       ASSERTED IN THE SOURCE AND IN THE DROPDOWN, because they answer different
       questions: the first says the constant is WRITTEN sorted, the second says
       that is what a person SEES. A build step that reordered would pass one
       and fail the other. */
    const SRC = fs.readFileSync('mc/events/index.html', 'utf8');
    const declared = [...(/const KIND_VALUES = \[([\s\S]*?)\];/.exec(SRC) || [])[1]
      .matchAll(/'([^']+)'/g)].map((m) => m[1]);
    t('the constant is written in alphabetical order',
      declared.join(',') === declared.slice().sort().join(','),
      declared.join(','));
    /* A KIND APPENDED IN THE WRONG PLACE IS INVISIBLE IN A DIFF and obvious in
       the dropdown, which is the whole reason this is a check rather than a
       note. */
    t('and holds every kind exactly once',
      new Set(declared).size === declared.length, declared.length);

    /* THE BATCH BAR'S PICKER, which was a fourth hand-kept copy until it was
       built from the constant. */
    const batch = await p.evaluate(() =>
      [...document.querySelectorAll('#batchKind option')].map((o) => o.value));
    t('the batch picker offers historical', batch.indexOf('historical') !== -1, batch.join(','));
    /* THE FIRST OPTION IS `Set kind`, a placeholder rather than a kind, so it is
       dropped before the order is judged. */
    const batchKinds = batch.filter(Boolean);
    t('and lists them alphabetically on screen',
      batchKinds.join(',') === batchKinds.slice().sort().join(','),
      batchKinds.join(','));
    /* AND IT IS NOT `other`, which is where an unknown kind used to land. */
    t('and still offers other beside it', batch.indexOf('other') !== -1);

    /* THE ROW'S OWN PICKER, built when the row is opened. */
    await p.evaluate(() => {
      const c = document.querySelector('.event-caret');
      if (c) c.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const row = await p.evaluate(() => {
      const sel = document.querySelector('.event-row [data-field="kind"]');
      return { opts: sel ? [...sel.options].map((o) => o.value) : null,
               value: sel ? sel.value : null };
    });
    t('the row picker offers it too', row.opts && row.opts.indexOf('historical') !== -1,
      row.opts && row.opts.join(','));
    t('and the row picker is alphabetical too',
      row.opts && row.opts.join(',') === row.opts.slice().sort().join(','),
      row.opts && row.opts.join(','));
    /* THE ROW'S OWN VALUE HAS TO BE SELECTABLE, or opening a historical event
       shows the first option and saving silently rewrites what it is -- the
       exact fault the Challenge Bank hit with `consent`. */
    t('and a historical row keeps its own kind', row.value === 'historical', row.value);

    /* THE MANUAL FORM, which is derived from FIELD_GROUPS and FIELD_META. */
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => x.textContent.trim().toUpperCase() === 'MANUAL');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    const manual = await p.evaluate(() => {
      const sel = document.querySelector('#manualForm [data-field="kind"]');
      return sel ? [...sel.options].map((o) => o.value) : null;
    });
    t('the manual form offers it', manual && manual.indexOf('historical') !== -1,
      manual && manual.join(','));
    t('and so is the manual form',
      manual && manual.filter(Boolean).join(',')
        === manual.filter(Boolean).slice().sort().join(','),
      manual && manual.join(','));

    /* AND THE ROOM DOES NOT ACCUSE ITSELF. `bad-kind` fires on a kind outside
       KIND_VALUES, so a kind the importer or a person can produce but the
       constant does not name would flag every row carrying it. */
    const flagged = await p.evaluate(() => {
      const notes = [...document.querySelectorAll('.event-annotation-line')]
        .map((n) => n.textContent.trim());
      return { notes: notes, review: document.querySelectorAll('.event-row.is-review').length };
    });
    t('and does not flag a historical row as a bad kind',
      !flagged.notes.some((n) => /valid Kind/i.test(n)), flagged.notes.join(' | '));

    t('and no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
})();
