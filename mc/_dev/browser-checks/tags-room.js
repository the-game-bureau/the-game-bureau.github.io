/* THE TAGS ROOM, DRIVEN IN REAL CHROME AGAINST THE REAL CATALOGUE.
   ---------------------------------------------------------------------------
      node mc/_dev/browser-checks/tags-room.js

   IT SERVES THE REAL 91 TAGS AND 395 GAMES, read from Supabase once at the top
   and replayed to the page. A synthetic fixture counts perfectly and would say
   nothing about the rows that actually matter here -- the tag on 375 games, the
   eight nothing uses, the games carrying one tag twice.

   EVERY WRITE IS INTERCEPTED. Letting one through cost a real game its clubs
   once already on this project; a check somebody will run again may not touch
   the database. What is asserted is the REQUEST -- the method, the path and the
   body -- which is the only thing that says what a save would actually do. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const API = 'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

let ok = 0; let bad = 0;
const is = (n, c, got) => {
  if (c) { ok += 1; console.log('  ok   ' + n); }
  else { bad += 1; console.log('  FAIL ' + n + (got !== undefined ? '   got: ' + JSON.stringify(got) : '')); }
};

async function readAll(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(API + '/' + table + '?select=' + select, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: from + '-' + (from + 999) }
    });
    if (!r.ok) throw new Error(table + ' ' + r.status);
    const rows = await r.json();
    out.push.apply(out, rows);
    if (rows.length < 1000) return out;
  }
}

(async () => {
  const tags = await readAll('tags', 'id,name');
  const games = await readAll('games', 'id,tags,primary_tag');
  console.log('  (' + tags.length + ' tags, ' + games.length + ' games)');

  /* THE EXPECTED COUNTS, WORKED OUT HERE rather than read back off the page --
     an independent statement of the answer, not a mirror of the page's own. */
  const uses = {};
  games.forEach((g) => {
    const list = Array.isArray(g.tags) ? g.tags : [];
    new Set(list.map((t) => String(t || '').trim()).filter(Boolean))
      .forEach((t) => { uses[t] = (uses[t] || 0) + 1; });
  });
  const busiest = Object.keys(uses).sort((a, b) => uses[b] - uses[a])[0];
  const unused = tags.filter((t) => !uses[t.name]).length;

  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => server.listen(8897, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  const writes = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));

    await page.evaluateOnNewDocument(() => {
      window.__authorize = null;
      window.TgbMcAdminAuth = { create: (o) => {
        window.__authorize = o.onAuthorized;
        return { getSession: () => ({ access_token: 'stub' }), init: () => {} };
      } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
      /* `confirm` IS ANSWERED, or a native dialog blocks the page forever under
         Puppeteer and the run HANGS -- which reads as the harness rather than
         as a failure, the worst shape a check can take. */
      window.__confirmed = true;
      window.__asked = [];
      window.confirm = (q) => { window.__asked.push(q); return window.__confirmed; };
    });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.indexOf('supabase.co') === -1) { req.continue(); return; }
      const method = req.method();
      /* COUNT THE METHOD, NOT THE URL. Every call here is preflighted -- the
         `apikey` header makes it so -- so counting urls alone reads as the page
         asking for everything twice. */
      if (method === 'OPTIONS') {
        req.respond({ status: 204, headers: { 'access-control-allow-origin': '*',
          'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' } });
        return;
      }
      if (method !== 'GET') {
        let body = null;
        try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = req.postData(); }
        writes.push({ method: method, url: url.split('/rest/v1/')[1], body: body });
        /* A WRITE IS ANSWERED WITH A ROW, because the page reads the reply back
           -- PostgREST answers 200 with an empty array when RLS refuses, and
           the page reports that as a refusal. Answering `[]` here would make
           every write look refused and test nothing. */
        req.respond({ status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify([{ id: 'stub-id', name: (body && body.name) || 'x' }]) });
        return;
      }
      const body = url.indexOf('/tags') !== -1 ? tags : url.indexOf('/games') !== -1 ? games : [];
      req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*',
          'access-control-expose-headers': 'content-range',
          'content-range': '0-' + body.length + '/' + body.length },
        body: JSON.stringify(body) });
    });

    await page.goto('http://127.0.0.1:8897/mc/tags/', { waitUntil: 'networkidle2' });
    await page.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authorize) await window.__authorize();
    });
    await page.waitForFunction(() => document.querySelectorAll('.tag-row').length > 10,
      { timeout: 20000 });

    const shelf = () => page.evaluate(() =>
      [].slice.call(document.querySelectorAll('.tag-row')).map((r) => ({
        name: r.querySelector('.tag-name').value,
        uses: r.querySelector('.tag-uses').textContent.trim(),
        none: r.querySelector('.tag-uses').classList.contains('is-none')
      })));

    /* ---- what is drawn ---- */
    const rows = await shelf();
    is('every tag is drawn', rows.length === tags.length, rows.length + ' of ' + tags.length);

    const head = await page.evaluate(() => ({
      title: document.querySelector('.room-title').textContent.trim(),
      count: document.getElementById('blurbCount').textContent.trim(),
      blurb: document.querySelector('.room-blurb').textContent.trim().slice(0, 60),
      tally: document.getElementById('tally').textContent.trim()
    }));
    is('the room is called TAGS', head.title === 'TAGS', head.title);
    is('the count leads the blurb', head.count === String(tags.length), head.count);
    is('the blurb defines a tag',
      head.blurb.indexOf('Tags. A tag is one word') > 0, head.blurb);
    is('the panel counts what is shown', head.tally === tags.length + ' tags', head.tally);

    /* ---- the count is the fact you cannot get elsewhere ---- */
    const busy = rows.find((r) => r.name === busiest);
    is('the busiest tag reports its real total',
      busy && busy.uses === uses[busiest] + ' games', (busy || {}).uses + ' vs ' + uses[busiest]);
    is('a tag nothing uses is drawn in the red pen',
      rows.filter((r) => r.none).length === unused,
      rows.filter((r) => r.none).length + ' of ' + unused);
    /* ONE PLURALISER. "1 games" is what a hand-written suffix produces. */
    const ones = rows.filter((r) => r.uses === '1 game');
    is('a tag on one game says "1 game", not "1 games"',
      ones.length === Object.keys(uses).filter((k) => uses[k] === 1).length,
      ones.length);

    /* ---- sort ---- */
    const sortedByName = rows.slice().sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    is('it opens sorted by name',
      rows.map((r) => r.name).join('|') === sortedByName.map((r) => r.name).join('|'));

    await page.evaluate(() => {
      const i = document.querySelector('#sortGroup input[value="uses"]');
      i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));
    const byUses = await shelf();
    const nums = byUses.map((r) => parseInt(r.uses, 10));
    is('sorting by games puts the busiest first',
      nums[0] === uses[busiest] && nums.every((n, i) => i === 0 || nums[i - 1] >= n),
      nums.slice(0, 4));
    const still = await page.evaluate(() =>
      document.querySelectorAll('#sortGroup input:checked').length);
    is('exactly one sort is on', still === 1, still);

    /* ---- find ---- */
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'foot'; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));
    const found = await shelf();
    is('the search narrows', found.length > 0 && found.length < tags.length, found.length);
    is('and matches on the tag', found.every((r) => r.name.toLowerCase().indexOf('foot') >= 0),
      found.map((r) => r.name));
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));

    /* ---- adding ---- */
    writes.length = 0;
    await page.evaluate(() => {
      const i = document.getElementById('newTag');
      i.value = 'Probe Tag';
      document.getElementById('addBtn').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    is('Add posts one row to tags',
      writes.length === 1 && writes[0].method === 'POST'
        && writes[0].url.indexOf('tags') === 0 && writes[0].body.name === 'Probe Tag',
      writes);

    writes.length = 0;
    await page.evaluate(() => {
      const i = document.getElementById('newTag');
      i.value = '';
      document.getElementById('addBtn').click();
    });
    await new Promise((r) => setTimeout(r, 250));
    const blankSaid = await page.evaluate(() =>
      document.getElementById('pageStatus').textContent.trim());
    is('Add with nothing typed writes nothing and says so',
      writes.length === 0 && blankSaid.indexOf('Type a tag') >= 0, blankSaid);

    /* ---- renaming reaches the games ----
       THE WHOLE REASON THE ROOM EXISTS. Renaming the catalogue row alone would
       leave the old word on every game carrying it, with nothing naming it. */
    const target = 'Football';
    const expectGames = uses[target];
    writes.length = 0;
    await page.evaluate((was) => {
      const rows = [].slice.call(document.querySelectorAll('.tag-row'));
      const row = rows.find((r) => r.querySelector('.tag-name').value === was);
      const input = row.querySelector('.tag-name');
      input.value = 'Gridiron';
      input.dispatchEvent(new Event('blur', { bubbles: true }));
    }, target);
    await page.waitForFunction(() =>
      document.getElementById('pageStatus').textContent.indexOf('is now') >= 0,
      { timeout: 20000 });

    const tagPatch = writes.filter((w) => w.method === 'PATCH' && w.url.indexOf('tags?') === 0);
    const gamePatch = writes.filter((w) => w.method === 'PATCH' && w.url.indexOf('games?') === 0);
    is('the rename patches the catalogue row once',
      tagPatch.length === 1 && tagPatch[0].body.name === 'Gridiron', tagPatch.length);
    is('and every game carrying the word',
      gamePatch.length === expectGames, gamePatch.length + ' of ' + expectGames);
    is('the new word is written into the game tags',
      gamePatch.every((w) => w.body.tags.indexOf('Gridiron') >= 0
        && w.body.tags.indexOf('Football') === -1), gamePatch[0] && gamePatch[0].body);
    /* A GAME WHOSE PRIMARY TAG IS THE RENAMED WORD MUST FOLLOW, or the row
       names a primary nothing else on it carries. */
    const primaries = games.filter((g) => g.primary_tag === target).length;
    is('and a primary tag follows the rename',
      gamePatch.filter((w) => w.body.primary_tag === 'Gridiron').length === primaries,
      gamePatch.filter((w) => w.body.primary_tag === 'Gridiron').length + ' of ' + primaries);
    const said = await page.evaluate(() =>
      document.getElementById('pageStatus').textContent.trim());
    is('and the room says how many it reached',
      said.indexOf(String(expectGames)) >= 0, said);

    /* ---- deleting names the consequence ---- */
    writes.length = 0;
    await page.evaluate(() => { window.__confirmed = false; window.__asked = []; });
    await page.evaluate(() => {
      const rows = [].slice.call(document.querySelectorAll('.tag-row'));
      const row = rows.find((r) => r.querySelector('.tag-uses').textContent.indexOf('0 ') === 0);
      row.querySelector('[data-del]').click();
    });
    await new Promise((r) => setTimeout(r, 250));
    const asked = await page.evaluate(() => window.__asked.slice());
    is('declining the question writes nothing', writes.length === 0, writes);
    is('an unused tag says nothing uses it',
      asked.length === 1 && asked[0].indexOf('Nothing uses it') > 0, asked);

    await page.evaluate(() => { window.__confirmed = false; window.__asked = []; });
    await page.evaluate((was) => {
      const rows = [].slice.call(document.querySelectorAll('.tag-row'));
      const row = rows.find((r) => r.querySelector('.tag-name').value === was);
      row.querySelector('[data-del]').click();
    }, 'Sports');
    await new Promise((r) => setTimeout(r, 250));
    const askedBusy = await page.evaluate(() => window.__asked.slice());
    is('a used tag says how many games it comes off',
      askedBusy.length === 1 && askedBusy[0].indexOf(uses.Sports + ' games') > 0, askedBusy);

    is('no uncaught errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
