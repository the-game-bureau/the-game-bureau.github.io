/* TRIVIA IS EDITED IN THE CHALLENGE BANK.
   ---------------------------------------------------------------------------
   Driven against fixtures shaped like the real rows, in real Chrome, because
   the claims are about what the FORM sends and what the ROW draws -- and the
   nine CHECK constraints mean a payload that is merely plausible is refused.

   RUN AGAINST THE PREVIOUS COMMIT IT FAILS on the read still carrying
   `kind=neq.trivia`, on the kind picker holding four options, and on both
   trivia fields being absent from the markup. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.ico': 'image/x-icon' };

let ok = 0, fail = 0;
const t = (what, pass, got) => {
  if (pass) { ok++; console.log('  ok  ' + what); }
  else { fail++; console.log('  FAIL ' + what + (got === undefined ? '' : '   got: ' + got)); }
};

/* SHAPED LIKE THE REAL ROWS, INCLUDING THE COLUMNS THE ROOM PROBES FOR.
   `probeColumns` reads the FIRST row, so a fixture missing `scope_team` would
   hide the whole binding half of the editor and the run would pass over it. */
const BASE = { scope: 'portable', scope_team: null, scope_city: null, scope_wpid: null,
               tags: [], ladder_key: null, choices: null, created_at: '2026-08-01T00:00:00Z' };

const ROWS = [
  Object.assign({}, BASE, { id: 1, kind: 'question', name: 'Whose house is this',
    prompt: 'Whose house is this?', answer: 'Davis',
    scope: 'place', scope_wpid: 7 }),
  Object.assign({}, BASE, { id: 2, kind: 'trivia', name: 'The green river',
    prompt: 'Which river is dyed bright green downtown every St Patrick Day?',
    answer: 'Chicago', ladder_key: 'chicago-il',
    choices: ['Chicago', 'Calumet', 'Des Plaines', 'Fox'] }),
  Object.assign({}, BASE, { id: 3, kind: 'trivia', name: 'Sweetness',
    prompt: 'The last name of the running back they called Sweetness?',
    answer: 'Payton', ladder_key: 'chicago-il-nfl-bears' }),
  /* THE ORPHAN. A key that resolves to nothing is refused by no constraint,
     reads perfectly, and means the question is asked of nobody. */
  Object.assign({}, BASE, { id: 4, kind: 'trivia', name: 'Keyed to nowhere',
    prompt: 'Which bridge carries the interstate over the river?', answer: 'Huey',
    ladder_key: 'nowhere-zz-nfl-nobody' }),
  Object.assign({}, BASE, { id: 5, kind: 'consent', name: 'The waiver (DRAFT)',
    prompt: 'Reply AGREE to continue.', answer: 'agree' })
];
const DESTS = [{ id: 'chicago-il-nfl-bears' }, { id: 'new-orleans-la-nfl-saints' }];

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
  await new Promise((r) => server.listen(8808, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  const sent = [];
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
    await p.setViewport({ width: 1400, height: 1100 });
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
      /* COUNT THE METHOD, NOT THE URL. Every call here is preflighted, so a
         request log keyed on the url reads as the page asking twice. */
      if (req.method() !== 'GET') sent.push({ url: u, method: req.method(), body: req.postData() });
      let body = [];
      if (u.indexOf('/challenges') !== -1 && req.method() === 'GET') body = ROWS;
      else if (u.indexOf('/destinations') !== -1) body = DESTS;
      else if (u.indexOf('/waypoints') !== -1) body = [{ wpid: 7, name: 'Cloud Gate', city: 'Chicago', state: 'IL' }];
      else if (u.indexOf('/teams') !== -1) body = [{ team_key: 'NFL:CHI', city_name: 'Chicago', mascot: 'Bears', league: 'NFL' }];
      else if (req.method() === 'PATCH' || req.method() === 'POST') body = [ROWS[1]];
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-' + Math.max(0, body.length - 1) + '/' + body.length }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8808/mc/challenges/', { waitUntil: 'networkidle0' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 700));

    /* ---- THE ROOM LISTS EVERY KIND ------------------------------------ */
    const listed = await p.evaluate(() =>
      [...document.querySelectorAll('#list .ch-name')].map((n) => n.textContent.trim()));
    t('every challenge is listed, trivia included', listed.length === 5, listed.length);
    t('and the trivia rows are among them',
      listed.indexOf('The green river') !== -1 && listed.indexOf('Sweetness') !== -1,
      listed.join(' | '));
    /* THE ROOM STOPPED FILTERING, WHICH IS THE HALF A FIXTURE CANNOT SHOW.
       A stub answers whatever it is asked, so the filter has to be read off
       the request the page actually made. */
    const reads = await p.evaluate(() => performance.getEntriesByType('resource')
      .map((e) => e.name).filter((n) => n.indexOf('/challenges') !== -1));
    t('and it asks the database for them, rather than filtering them out',
      reads.length > 0 && reads.every((u) => u.indexOf('neq.trivia') === -1),
      reads.map((u) => u.slice(u.indexOf('challenges'))).join(' | '));

    /* ---- THE PICKER HOLDS EVERY KIND THE CHECK ALLOWS ------------------ */
    const kinds = await p.evaluate(() =>
      [...document.querySelectorAll('#fKind option')].map((o) => o.value));
    t('the kind picker offers all six kinds', kinds.length === 6, kinds.join(','));
    /* WITHOUT `consent` AND `trivia` HERE, OPENING ONE OF THOSE ROWS SHOWS
       `question` SELECTED and saving silently rewrites what kind of thing it
       is -- which is why listing them and completing this list are one change. */
    t('including consent and trivia, which the room now draws',
      kinds.indexOf('consent') !== -1 && kinds.indexOf('trivia') !== -1, kinds.join(','));

    /* ---- THE ROW SAYS WHERE A QUESTION IS ASKED ------------------------ */
    const chips = await p.evaluate(() => {
      const out = {};
      [...document.querySelectorAll('#list > .ch')].forEach((r) => {
        const n = r.querySelector('.ch-name');
        if (!n) return;
        out[n.textContent.trim()] = {
          scope: r.querySelector('.ch-scope') ? r.querySelector('.ch-scope').textContent.trim() : '',
          loose: !!r.querySelector('.ch-scope.is-loose'),
          tags: [...r.querySelectorAll('.ch-tag')].map((x) => x.textContent.trim()),
          notes: [...r.querySelectorAll('.ch-note')].map((x) => x.textContent.trim())
        };
      });
      return out;
    });
    t('a trivia row wears its rung where a challenge wears its scope',
      chips['Sweetness'].scope === 'chicago-il-nfl-bears', chips['Sweetness'].scope);
    t('and a multiple choice row says how many options',
      chips['The green river'].tags.indexOf('4 options') !== -1,
      chips['The green river'].tags.join(','));
    t('a stop challenge still wears its own binding',
      chips['Whose house is this'].scope.indexOf('Cloud Gate') !== -1,
      chips['Whose house is this'].scope);

    /* ---- THE ORPHAN CHECK CAME WITH THE ROWS --------------------------- */
    t('a key that resolves to nothing is reported',
      chips['Keyed to nowhere'].notes.some((n) => n.indexOf('Nothing is keyed to') === 0),
      chips['Keyed to nowhere'].notes.join(' | '));
    t('and names the key, so it can be found',
      chips['Keyed to nowhere'].notes.join(' ').indexOf('nowhere-zz-nfl-nobody') !== -1);
    t('and it is drawn in the red pen', chips['Keyed to nowhere'].loose);
    /* THE FINDING MUST NOT FIRE ON A KEY THAT IS FINE, or 38 rows redden and
       the check is one nobody reads. */
    t('a key that resolves is not reported',
      chips['Sweetness'].notes.length === 0 && chips['The green river'].notes.length === 0,
      chips['Sweetness'].notes.concat(chips['The green river'].notes).join(' | '));

    /* ---- THE FORM FOLLOWS THE KIND ------------------------------------- */
    const shape = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      const open = (name) => {
        const r = rows.find((x) => x.querySelector('.ch-name')
          && x.querySelector('.ch-name').textContent.trim() === name);
        r.click();
        const vis = (id) => { const f = document.getElementById(id); return f && !f.hidden; };
        return {
          ladder: vis('ladderField'), choices: vis('choicesField'),
          scope: !document.getElementById('fScope').closest('.field').hidden,
          ladderValue: document.getElementById('fLadder').value,
          choicesValue: document.getElementById('fChoices').value,
          kind: document.getElementById('fKind').value
        };
      };
      const t1 = open('Sweetness');
      document.getElementById('closeBtn').click();
      const c1 = open('Whose house is this');
      document.getElementById('closeBtn').click();
      const g = open('The green river');
      return { trivia: t1, challenge: c1, green: g };
    });
    t('a trivia row opens with its rung and its options', shape.trivia.ladder && shape.trivia.choices);
    t('and without the scope picker, which its CHECK forbids anything but portable',
      !shape.trivia.scope);
    t('and the rung is filled in', shape.trivia.ladderValue === 'chicago-il-nfl-bears',
      shape.trivia.ladderValue);
    t('the options come back one per line, not comma joined',
      shape.green.choicesValue.split(String.fromCharCode(10)).length === 4,
      JSON.stringify(shape.green.choicesValue));
    t('a stop challenge opens with the scope picker and neither trivia field',
      shape.challenge.scope && !shape.challenge.ladder && !shape.challenge.choices);
    t('and the waiver keeps its own kind rather than falling back to question',
      await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#list > .ch')];
        const r = rows.find((x) => x.querySelector('.ch-name')
          && x.querySelector('.ch-name').textContent.trim() === 'The waiver (DRAFT)');
        r.click();
        const k = document.getElementById('fKind').value;
        document.getElementById('closeBtn').click();
        return k;
      }) === 'consent');

    /* CHANGING THE KIND REPAINTS THE FORM. Without it the boxes on screen and
       the payload disagree in silence. */
    const swap = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'Whose house is this').click();
      const k = document.getElementById('fKind');
      k.value = 'trivia';
      k.dispatchEvent(new Event('change'));
      const out = { ladder: !document.getElementById('ladderField').hidden,
                    scope: !document.getElementById('fScope').closest('.field').hidden };
      document.getElementById('closeBtn').click();
      return out;
    });
    t('choosing trivia reveals the rung and puts the scope picker away',
      swap.ladder && !swap.scope, JSON.stringify(swap));

    /* ---- THE PAYLOAD OBEYS THE EXCLUSIVITY CHECK ----------------------- */
    sent.length = 0;
    await p.evaluate(async () => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'The green river').click();
      document.getElementById('fLadder').value = 'NEW-ORLEANS-LA';
      document.getElementById('fChoices').value = ['Alpha', 'Beta', ''].join(String.fromCharCode(10));
      document.getElementById('saveBtn').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const body = sent.length ? JSON.parse(sent[sent.length - 1].body) : {};
    t('a trivia save sends the rung', body.ladder_key === 'new-orleans-la', body.ladder_key);
    /* LOWERCASED ON THE WAY IN rather than refused by the CHECK for a capital,
       since a rung is matched and never printed. */
    t('lowercased, because the CHECK requires it and a capital is not a mistake worth refusing',
      body.ladder_key === (body.ladder_key || '').toLowerCase());
    t('and portable, with no scope key', body.scope === 'portable'
      && body.scope_team === null && body.scope_city === null && body.scope_wpid === null,
      JSON.stringify([body.scope, body.scope_team, body.scope_city, body.scope_wpid]));
    t('the options go as an array, blank lines dropped',
      Array.isArray(body.choices) && body.choices.length === 2
      && body.choices[0] === 'Alpha', JSON.stringify(body.choices));

    /* AND THE OTHER WAY ROUND: a stop challenge must send no rung, or the same
       CHECK refuses it. */
    sent.length = 0;
    await p.evaluate(async () => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'Whose house is this').click();
      document.getElementById('saveBtn').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const b2 = sent.length ? JSON.parse(sent[sent.length - 1].body) : {};
    t('a stop challenge sends no rung and no options',
      b2.ladder_key === null && b2.choices === null,
      JSON.stringify([b2.ladder_key, b2.choices]));
    t('and keeps its own binding', b2.scope === 'place' && b2.scope_wpid === 7,
      JSON.stringify([b2.scope, b2.scope_wpid]));

    /* AN EMPTY LIST IS NULL, NOT [], or challenges_choices_enough answers with
       a message about cardinality that says nothing to whoever cleared the box. */
    sent.length = 0;
    await p.evaluate(async () => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'The green river').click();
      document.getElementById('fChoices').value = '';
      document.getElementById('saveBtn').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const b3 = sent.length ? JSON.parse(sent[sent.length - 1].body) : {};
    t('clearing the options sends null, never an empty array', b3.choices === null,
      JSON.stringify(b3.choices));

    /* ---- THE RUNGS ARE OFFERED RATHER THAN TYPED FROM MEMORY ----------- */
    const opts = await p.evaluate(() =>
      [...document.querySelectorAll('#ladderList option')].map((o) => o.value));
    t('the rung list is built from the keys that exist', opts.length > 0, opts.length);
    t('and offers the portable star and a real destination',
      opts.indexOf('*') !== -1 && opts.indexOf('chicago-il-nfl-bears') !== -1,
      opts.join(','));
    t('and a city prefix, which is a rung and is not a destination id',
      opts.indexOf('chicago-il') !== -1, opts.join(','));

    /* ---- AND THE ROOM SAYS IT HOLDS THEM ------------------------------- */
    const blurb = await p.evaluate(() => document.querySelector('.room-blurb').textContent.trim());
    t('the blurb says trivia lives here', blurb.toLowerCase().indexOf('trivia') !== -1, blurb);
    t('and leads with the count of everything', blurb.indexOf('5 Challenges') === 0, blurb.slice(0, 30));

    t('and no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
})();
