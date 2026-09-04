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
   `probeColumns` reads the FIRST row, so a column missing from the fixture
   hides whatever the room gates on it and the run passes over that half.
     THE FOUR `scope*` COLUMNS WENT WITH 2026090311 and `ladder_key` is no
   longer editable (2026-09-03), so what is left to check about a trivia row is
   its OPTIONS and its chip. */
const BASE = { tags: [], ladder_key: null, choices: null,
               created_at: '2026-08-01T00:00:00Z' };

const ROWS = [
  Object.assign({}, BASE, { id: 1, type: 'question', name: 'Whose house is this',
    prompt: 'Whose house is this?', answer: 'Davis',
    }),
  Object.assign({}, BASE, { id: 2, type: 'question', name: 'The green river',
    prompt: 'Which river is dyed bright green downtown every St Patrick Day?',
    answer: 'Chicago', ladder_key: 'chicago-il',
    choices: ['Chicago', 'Calumet', 'Des Plaines', 'Fox'] }),
  /* THE OPTIONS BOX MUST STAY OFF A ROW THAT IS NOT A QUESTION, and after
     2026090319 that means a photo: the box is offered on EVERY question, so no
     question-shaped row can prove it any more. */
  Object.assign({}, BASE, { id: 9, type: 'photo', name: 'Snap the gate',
    prompt: 'Photograph the ugliest thing you can see from here.',
    answer: null }),
  Object.assign({}, BASE, { id: 3, type: 'question', name: 'Sweetness',
    prompt: 'The last name of the running back they called Sweetness?',
    answer: 'Payton', ladder_key: 'chicago-il-nfl-bears' }),
  /* THE ORPHAN. A key that resolves to nothing is refused by no constraint,
     reads perfectly, and means the question is asked of nobody. */
  Object.assign({}, BASE, { id: 4, type: 'question', name: 'Keyed to nowhere',
    prompt: 'Which bridge carries the interstate over the river?', answer: 'Huey',
    ladder_key: 'nowhere-zz-nfl-nobody' }),
  Object.assign({}, BASE, { id: 5, type: 'operations', name: 'The waiver (DRAFT)',
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
    t('every challenge is listed, trivia included',
      listed.length === ROWS.length, { listed: listed.length, fixture: ROWS.length });
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
    t('the type picker offers all five types', kinds.length === 5, kinds.join(','));
    /* WITHOUT `consent` AND `trivia` HERE, OPENING ONE OF THOSE ROWS SHOWS
       `question` SELECTED and saving silently rewrites what kind of thing it
       is -- which is why listing them and completing this list are one change. */
    t('including operations and question, which the room now draws',
      kinds.indexOf('operations') !== -1 && kinds.indexOf('question') !== -1, kinds.join(','));

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
    /* WITH THE ORPHAN FINDING GONE, THE CHIP IS THE ONLY THING THAT SAYS A KEY
       RESOLVES TO NOTHING -- so it is asserted here rather than left to the
       fixture row merely existing. `ladder_key` is not a foreign key and cannot
       be one, so nothing else in the system will ever report it. */
    t('a key that resolves to nothing is still marked on the row',
      chips['Keyed to nowhere'].loose, chips['Keyed to nowhere'].scope);
    t('and a key that resolves is not', !chips['Sweetness'].loose);

    /* A STOP CHALLENGE WORE ITS OWN SCOPE CHIP until 2026090311 dropped the
       column, and `orphan-ladder-key` reported a rung resolving to nothing
       until the field it told you to fix went (2026-09-03). Both are gone; the
       CHIP is still asserted above, since a trivia row still shows what its
       stored key resolves to. */

    /* ---- THE FORM FOLLOWS THE KIND ------------------------------------- */
    const shape = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      const open = (name) => {
        const r = rows.find((x) => x.querySelector('.ch-name')
          && x.querySelector('.ch-name').textContent.trim() === name);
        r.click();
          /* `offsetParent`, NEVER THE `hidden` PROPERTY. `.field` is
           `display: flex`, an AUTHOR rule that beat the UA sheet's `[hidden]`
           until 2026-09-03 -- so the property was true while the box was on
           screen, and a check reading it passed over the bug. */
        const vis2 = (id) => { const f = document.getElementById(id);
          return !!(f && f.offsetParent !== null); };
        return {
          choices: vis2('choicesField'),
          choicesValue: document.getElementById('fChoices').value,
          kind: document.getElementById('fKind').value
        };
      };
      const t1 = open('Sweetness');
      document.getElementById('closeBtn').click();
      const c1 = open('Snap the gate');
      document.getElementById('closeBtn').click();
      const g = open('The green river');
      return { trivia: t1, challenge: c1, green: g };
    });
    t('a trivia row opens with its options', shape.trivia.choices);
    t('the options come back one per line, not comma joined',
      shape.green.choicesValue.split(String.fromCharCode(10)).length === 4,
      JSON.stringify(shape.green.choicesValue));
    /* THE OPTIONS BOX IS A QUESTION'S AND NOBODY ELSE'S. It was on screen for
       every kind until `.field[hidden]` was declared -- a photo, a minigame and
       the waiver all offered a list of multiple-choice options. */
    t('and a photo opens without it', !shape.challenge.choices);
    t('and the waiver keeps its own kind rather than falling back to question',
      await p.evaluate(() => {
        const rows = [...document.querySelectorAll('#list > .ch')];
        const r = rows.find((x) => x.querySelector('.ch-name')
          && x.querySelector('.ch-name').textContent.trim() === 'The waiver (DRAFT)');
        r.click();
        const k = document.getElementById('fKind').value;
        document.getElementById('closeBtn').click();
        return k;
      }) === 'operations');

    /* CHANGING THE KIND REPAINTS THE FORM. Without it the boxes on screen and
       the payload disagree in silence. */
    const swap = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'Whose house is this').click();
      const k = document.getElementById('fKind');
      k.value = 'question';
      k.dispatchEvent(new Event('change'));
      const f = document.getElementById('choicesField');
      const out = { choices: !!(f && f.offsetParent !== null) };
      document.getElementById('closeBtn').click();
      return out;
    });
    t('choosing trivia reveals the options box', swap.choices, JSON.stringify(swap));

    /* ---- THE PAYLOAD OBEYS THE EXCLUSIVITY CHECK ----------------------- */
    sent.length = 0;
    await p.evaluate(async () => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      rows.find((x) => x.querySelector('.ch-name').textContent.trim() === 'The green river').click();
      document.getElementById('fChoices').value = ['Alpha', 'Beta', ''].join(String.fromCharCode(10));
      document.getElementById('saveBtn').click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const body = sent.length ? JSON.parse(sent[sent.length - 1].body) : {};
    /* THE STORED RUNG IS CARRIED THROUGH UNTOUCHED. No field asks for one any
       more, and `challenges_ladder_key_belongs_to_trivia` refuses a trivia row
       WITHOUT one -- so nulling it would refuse every trivia save. */
    t('a trivia save carries the stored rung untouched',
      body.ladder_key === 'chicago-il', body.ladder_key);
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
    /* AND SENDS NO SCOPE, the four columns having gone with 2026090311. */
    t('and no scope columns at all',
      !('scope' in b2) && !('scope_wpid' in b2), JSON.stringify(Object.keys(b2)));

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

    /* THE RUNG LIST WENT WITH THE FIELD IT FILLED (2026-09-03). It offered
       every rung that resolves -- the portable star, a family, a city prefix
       and a destination id -- and there is nothing to type into now. */

    /* ---- AND THE COUNT IS OF EVERYTHING ------------------------------- */
    /* THE BLURB NAMED TRIVIA UNTIL 2026-09-03. Losing that has a cost worth
       knowing -- the count jumps from 25 to 62 with nothing on screen saying
       what the other 37 rows are -- but it is a deliberate copy change, and a
       check demanding a sentence somebody removed on purpose fails on them
       doing their job. **What still matters is that the count is of EVERY row**,
       trivia included: that is the number the room is judged by, and it is what
       broke when this read carried `kind=neq.trivia`. */
    const blurb = await p.evaluate(() => document.querySelector('.room-blurb').textContent.trim());
    t('the count leads the blurb and counts everything, trivia included',
      blurb.indexOf(ROWS.length + ' Challenges') === 0, blurb.slice(0, 30));

    t('and no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
})();
