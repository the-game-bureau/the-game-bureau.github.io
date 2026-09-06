/* THE TAGS BAR, REBUILT (2026-09-04).
 *
 * WHAT IT REPLACED, because the screenshot is the argument. Chosen tags were an
 * 8% tint of the house blue, so three chosen among 91 were indistinguishable
 * from the other 88 at a glance; the primary dot was a lime-green blob welded
 * to a square left edge, left over from a canvas theme this page has not worn
 * for months; the `+` button was `display:none` in this theme, so adding was
 * Enter-only in a box that never said so; and there was no way to delete a tag
 * at all.
 *
 * WHAT THIS CAN SEE THAT jsdom CANNOT, which is why it is a real browser: the
 * FILL. `aria-pressed` and a class both read correct on the old bar too -- the
 * fault was that nothing on screen distinguished them, and only a computed
 * background can say so.
 *
 * AND SINCE 2026-09-05 IT COVERS TWO MORE THINGS. Choosing a tag WRITES
 * `public.games` straight away rather than waiting for Save; and the bar reads
 * the ROW rather than the flow node, because 14 of the 394 games carry no game
 * node and on those every chip was disabled while the row's own tags showed as
 * `0 chosen`.
 *
 * READS ARE STUBBED AND EVERY WRITE IS CAUGHT. A check has no business editing
 * the catalogue it is testing. */
const http = require('http');
const fs = require('fs');
const pathmod = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + JSON.stringify(g) : '')));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon' };

/* TWO GAMES, AND THE SECOND ONE CARRIES THE TAG THE CHECK DELETES -- with it as
   its PRIMARY, which is the case that needs the extra patch. A fixture where
   nothing uses the tag proves only the easy half. */
const OPEN = { id: 'oswald', name: "Oswald's Diary", city: 'New Orleans, Louisiana',
  status: 'live', tags: ['Mystery', 'History', 'Walking Tour'], primary_tag: 'Mystery',
  nodes: [{ id: 'g1', type: 'game', title: "Oswald's Diary",
            tags: ['Mystery', 'History', 'Walking Tour'], primaryTag: 'Mystery' }] };
const OTHER = { id: 'quizzer', name: 'Quizzer', city: 'Atlanta, Georgia',
  status: 'live', tags: ['Trivia', 'Puzzle'], primary_tag: 'Trivia',
  nodes: [{ id: 'g2', type: 'game', title: 'Quizzer',
            tags: ['Trivia', 'Puzzle'], primaryTag: 'Trivia' }] };
/* A REAL SHAPE, NOT AN INVENTED ONE. `paris2026` is one of the 14 games with
   no game node, and it carries two tags and a primary -- which is what made the
   fault visible: the bar said `0 chosen` over a row holding Sports and
   Baseball, with every chip greyed. */
const NODELESS = { id: 'paris2026', name: 'Paris (placeholder)', city: 'Paris, France',
  status: 'live', tags: ['Sports', 'History'], primary_tag: 'Sports',
  nodes: [], links: [] };
/* `Featured` SITS IN THE MIDDLE ON PURPOSE. It was first in this list, so an
   assertion that it LEADS the box would have passed without the pin running at
   all -- the fixture agreeing with the answer rather than testing it. */
const POOL = ['Atlanta', 'Food', 'Football', 'Featured', 'History', 'Horror',
              'Music', 'Mystery', 'Puzzle', 'Sports', 'Trivia', 'Walking Tour'];

let server = null;
function serve() {
  if (server) return Promise.resolve();
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let f = pathmod.join('C:/Code/the-game-bureau', decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = pathmod.join(f, 'index.html');
    fs.readFile(f, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[pathmod.extname(f)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((r) => server.listen(8877, r));
}

(async () => {
  await serve();
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'],
  });
  const writes = [];
  const errs = [];
  const asked = [];
  let refuseWrites = false;
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1200 });
    p.on('pageerror', (e) => errs.push(e.message));
    /* THE CONFIRMATION IS ANSWERED BY THE HARNESS, or a native dialog blocks
       the page for ever under Puppeteer and the run HANGS -- which reads as the
       harness rather than as a failure, the worst shape a check can take. */
    let lastConfirm = '';
    let answerConfirm = true;
    p.on('dialog', async (d) => { lastConfirm = d.message();
      if (answerConfirm) await d.accept(); else await d.dismiss(); });

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
      /* COUNT THE METHOD, NOT THE URL. Every call here is preflighted, so
         counting urls reads as the page asking for everything twice. */
      if (req.method() !== 'GET') {
        writes.push({ m: req.method(), u: decodeURIComponent(u), b: req.postData() || '' });
      } else {
        asked.push(decodeURIComponent(u));
      }
      let body = [];
      /* A PATCH ANSWERS WITH THE ROW IT UPDATED. An empty array is what RLS
         refusing looks like, and the page is careful about that branch -- a
         stub that answers `[]` reports a page fault that is its own. */
      /* AN EMPTY ARRAY IS WHAT RLS REFUSING LOOKS LIKE, and the page has a
         branch for it, so the stub can produce one on demand. */
      if (req.method() === 'PATCH') body = refuseWrites ? [] : [{ id: 'stub' }];
      else if (req.method() === 'POST') body = [{ name: 'stub' }];
      else if (u.indexOf('/games') !== -1) body = [OPEN, OTHER, NODELESS];
      else if (u.indexOf('/tags') !== -1) body = POOL.map((n) => ({ name: n }));
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-' + Math.max(0, body.length - 1)
          + '/' + body.length }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8877/mc/games/index.html?id=oswald',
      { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await p.waitForFunction(
      () => document.querySelectorAll('#nodeTagPicker .tag-pill').length > 0,
      { timeout: 8000 });

    const read = () => p.evaluate(() => {
      const chip = (name) => [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
        .find((n) => n.dataset.tag === name);
      const look = (name) => {
        const c = chip(name);
        if (!c) return null;
        const wrap = c.closest('.tag-pill-wrap');
        const cs = getComputedStyle(wrap);
        return { pressed: c.getAttribute('aria-pressed'), bg: cs.backgroundColor,
                 ink: getComputedStyle(c).color,
                 n: (c.querySelector('.tag-n') || {}).textContent,
                 kill: !!wrap.querySelector('.tag-kill') };
      };
      const picker = document.getElementById('nodeTagPicker');
      const get = (id) => document.getElementById(id);
      const add = get('nodeTagAddBtn');
      const manage = get('nodeTagManageBtn');
      const box = get('nodeTagNewInput');
      const bar = get('tagsBar');
      if (!picker) return { missing: 'nodeTagPicker' };
      return {
        has: { add: !!add, manage: !!manage, box: !!box, count: !!get('nodeTagCount') },
        chips: [...picker.querySelectorAll('.tag-pill')].map((n) => n.dataset.tag),
        on: [...picker.querySelectorAll('.tag-pill[aria-pressed="true"]')]
          .map((n) => n.dataset.tag),
        mystery: look('Mystery'), atlanta: look('Atlanta'), featured: look('Featured'),
        trivia: look('Trivia'),
        dots: [...picker.querySelectorAll('.tag-primary-radio')].length,
        primaryDot: (() => {
          const c = chip('Mystery');
          const l = c && c.closest('.tag-pill-wrap').querySelector('.tag-primary-radio');
          return l ? l.className : null;
        })(),
        count: (get('nodeTagCount') || {}).textContent || '',
        add: add ? { on: !add.disabled, shown: getComputedStyle(add).display,
                     word: add.textContent.trim() }
                 : { on: false, shown: 'absent', word: '' },
        manage: manage ? { pressed: manage.getAttribute('aria-pressed'),
                           word: manage.textContent.trim() }
                       : { pressed: 'absent', word: '' },
        kills: picker.querySelectorAll('.tag-kill').length,
        boxW: box ? Math.round(box.getBoundingClientRect().width) : 0,
        barW: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
        scrolls: picker.scrollHeight > picker.clientHeight + 1
          || getComputedStyle(picker).overflowY === 'auto',
        /* IS IT A BOX. A ground and a border, measured rather than read off
           the rule, because a declaration that is present and beaten reads as
           correct in the file and wrong on screen. */
        pickerBox: (function () {
          const cs = getComputedStyle(picker);
          return { border: parseFloat(cs.borderTopWidth) || 0,
                   radius: parseFloat(cs.borderTopLeftRadius) || 0,
                   pad: parseFloat(cs.paddingTop) || 0,
                   bg: cs.backgroundColor,
                   maxH: cs.maxHeight };
        }()),
        /* THE FULL HEIGHT OF THE CHIPS, so a cap that hid two thirds of them
           cannot pass as a box that fits. */
        pickerH: Math.round(picker.getBoundingClientRect().height),
        /* FEATURED: where it sits and what colour it is. Read from the
           RENDERED order and the COMPUTED paint, never from the rule -- a
           declaration that is present and beaten reads correct in the file. */
        featured: (function () {
          const wraps = [...picker.querySelectorAll('.tag-pill-wrap')];
          const words = wraps.map((w) => (w.querySelector('.tag-pill')
            .dataset.tag || '').trim());
          const i = words.findIndex((w) => w.toLowerCase() === 'featured');
          if (i < 0) return { there: false, first: words[0] || '' };
          const wrap = wraps[i], pill = wrap.querySelector('.tag-pill');
          const cs = getComputedStyle(wrap), ps = getComputedStyle(pill);
          return { there: true, index: i, first: words[0] || '',
                   ink: ps.color, bg: cs.backgroundColor, border: cs.borderTopColor,
                   dot: !!wrap.querySelector('.tag-primary-radio') };
        }()),
        /* THE FOOTNOTE UNDER THE BOX. Read from the RENDERED text and from
           geometry, never from the markup: a note that is present and hidden,
           or drawn above the thing it explains, reads correct in the file. */
        note: (function () {
          const el = document.getElementById('nodeTagNote');
          if (!el) return { there: false };
          const r = el.getBoundingClientRect();
          const pr = picker.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const chip = picker.querySelector('.tag-pill');
          return { there: true, text: el.textContent.replace(/\s+/g, ' ').trim(),
                   shown: r.height > 0 && cs.display !== 'none'
                     && cs.visibility !== 'hidden',
                   below: r.top >= pr.bottom - 1,
                   size: parseFloat(cs.fontSize),
                   chipSize: chip ? parseFloat(getComputedStyle(chip).fontSize) : 0,
                   ink: cs.color,
                   chipInk: chip ? getComputedStyle(chip).color : '' };
        }()),
        chipRows: [...new Set([...picker.querySelectorAll('.tag-pill-wrap')]
          .map((c) => Math.round(c.getBoundingClientRect().top)))].length,
      };
    });
    /* ONE CHIP'S OWN COUNT, off the rendered chip rather than off the
       function: what a check is for is what somebody SEES. */
    const tally = (pg, tag) => pg.evaluate((t) => {
      const w = [...document.querySelectorAll('#nodeTagPicker .tag-pill-wrap')]
        .find((x) => (x.querySelector('.tag-pill').dataset.tag || '').toLowerCase()
          === t.toLowerCase());
      if (!w) return null;
      const n = w.querySelector('.tag-n');
      return { n: n ? parseInt(n.textContent, 10) : null,
               on: w.classList.contains('is-on') };
    }, tag);

    const type = async (text) => {
      await p.evaluate(() => { const i = document.getElementById('nodeTagNewInput');
        i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
      if (text) { await p.click('#nodeTagNewInput'); await p.keyboard.type(text); }
      await new Promise((r) => setTimeout(r, 120));
    };
    const press = (name) => p.evaluate((n) => {
      [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
        .find((x) => x.dataset.tag === n).click();
    }, name);

    let m = await read();

    /* ---- THE GATE. A missing control is named, not thrown on -------------- */
    t('the picker, the box, Add and Manage pool are all on the page',
      !m.missing && m.has && m.has.add && m.has.manage && m.has.box && m.has.count,
      m.missing || m.has);
    if (m.missing || !m.has.manage) {
      /* NO ESCAPE OF ANY KIND IN THIS FILE. A backslash-n written through a
         heredoc into Python arrives as a REAL newline inside a string literal,
         which is a syntax error -- the twenty-third instance of that scar in
         this repo, and it landed in a check whose whole job is to fail loudly.
         `String.fromCharCode(10)` cannot be eaten by any layer. */
      const NL = String.fromCharCode(10);
      console.log(NL + '  -- the rest needs the rebuilt bar --');
      console.log(NL + ok + ' ok, ' + (bad + 1) + ' FAIL');
      process.exitCode = 1;
      await browser.close(); if (server) server.close();
      return;
    }

    /* ---- THE CONTROLS ---------------------------------------------------- */
    t('the bar has one box that finds and adds, an Add, a Manage and a count',
      m.add.word === 'Add' && m.manage.word === 'Manage pool' && !!m.count,
      { add: m.add.word, manage: m.manage.word, count: m.count });
    /* THE `+` WAS `display:none` IN THIS THEME. Adding was Enter-only in a box
       whose placeholder said nothing about it. */
    t('and Add is on screen rather than hidden by the theme',
      m.add.shown !== 'none', m.add.shown);
    /* THE TYPING BOX HOLDS A TAG, NOT A ROW. Left to grow it took every pixel
       the row had, which reads as an input that has lost its neighbours. */
    t('the box is a box, not the width of the bar',
      m.boxW < m.barW * 0.4, { box: m.boxW, bar: m.barW });
    /* AND THE CHIPS ARE IN A BOX THAT DOES NOT SCROLL (2026-09-05).
       IT WAS CAPPED AT 184px WITH `overflow-y:auto`, on a comment that guessed
       91 tags at about six rows. MEASURED IT IS 28 at a sentence's width, so
       two thirds of the pool sat behind a scrollbar inside a page that already
       scrolls -- the wheel meaning two different things an inch apart. */
    t('the chips do not scroll', !m.scrolls,
      { scrolls: m.scrolls, maxH: m.pickerBox.maxH });
    /* AND EVERY CHIP IS REALLY IN THE BOX. `overflow: visible` would let them
       spill out of a box still capped in height and PASS the assertion above
       while looking broken, so the box has to be as tall as its own rows. */
    t('and the box is as tall as the chips in it',
      m.pickerH >= m.chipRows * 20,
      { boxH: m.pickerH, rows: m.chipRows });
    /* IT IS A BOX, not a bare run of chips. Measured, never read off the rule:
       a declaration that is present and beaten reads correct in the file. */
    t('and it is drawn as a box',
      m.pickerBox.border >= 1 && m.pickerBox.radius >= 4 && m.pickerBox.pad >= 4
      && m.pickerBox.bg !== 'rgba(0, 0, 0, 0)', m.pickerBox);

    /* ---- THE COUNT MOVES WHEN YOU CHOOSE (2026-09-05) -------------------- */
    /* REPORTED AS EXACTLY THIS and it was true of every game: the chip filled
       and the number beside it did not move. `countGamesWithTag` read
       `getGameNode()`, which on this page -- no canvas -- answers null on ALL
       of them, so the live half never ran; and `tagUseRows` follows the write,
       so skipping the open row then took back the one the map had just gained.
       Minus one, plus nothing. */
    const cBefore = await tally(p, 'Horror');
    await p.evaluate(() => { [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
      .find((x) => x.dataset.tag === 'Horror').click(); });
    await new Promise((r) => setTimeout(r, 600));
    const cAfter = await tally(p, 'Horror');
    t('choosing a tag puts one on its count',
      cBefore && cAfter && cAfter.on && cAfter.n === cBefore.n + 1,
      { before: cBefore, after: cAfter });
    /* AND THIS ONE PASSES ON THE BUG, which is worth saying rather than
       leaving to be found. IN THIS HARNESS `getGameNode()` ANSWERS -- the
       fixture's document carries a game node and nothing hides it -- so the
       broken version's live half still ran here and only the NODELESS half
       reproduced the report. The live page has no canvas, so it answers null
       on every game.
       SO THE RULE IS ASSERTED STRUCTURALLY AS WELL: this function reads the
       same holder the chips do. That is what actually generalises, and it
       fails on the restored fault where the arithmetic above does not. */
    const src = await p.evaluate(() => countGamesWithTag.toString());
    t('and the count reads the same holder the chips do',
      src.indexOf('tagTarget()') !== -1 && src.indexOf('getGameNode') === -1,
      src.replace(/\s+/g, ' ').slice(0, 160));
    /* AND BACK DOWN. A count that only ever grows is one that has stopped
       describing the catalogue and started describing how many times you have
       pressed the chip. */
    await p.evaluate(() => { [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
      .find((x) => x.dataset.tag === 'Horror').click(); });
    await new Promise((r) => setTimeout(r, 600));
    const cBack = await tally(p, 'Horror');
    t('and unchoosing takes it off again',
      cBack && !cBack.on && cBack.n === cBefore.n,
      { before: cBefore, back: cBack });

    /* ---- FEATURED LEADS, AND IT IS THE GREEN PEN (2026-09-05) ----------- */
    /* IT IS THE ONE TAG THE PAGE ITSELF READS -- it decides whether a game is
       featured -- so it is a switch among ninety subjects, and hunting for it
       in the F row is hunting for a control rather than for a word. */
    t('Featured leads the box, whatever the alphabet says',
      m.featured.there && m.featured.index === 0,
      { index: m.featured.index, first: m.featured.first });
    /* AND IT CARRIES NO PRIMARY DOT, which the note under the box explains.
       The chip being a different colour is what makes that read as deliberate
       rather than as a chip that failed to draw one. */
    t('and carries no primary dot', m.featured.there && !m.featured.dot,
      m.featured.dot);
    /* A RULE AFTER IT, so the pin reads as a pin rather than as a word that
       happens to sort first. Measured as a box with a real width in the flow
       between the two chips, not as a declaration. */
    const sep = await p.evaluate(() => {
      const box = document.getElementById('nodeTagPicker');
      const kids = [...box.children];
      const i = kids.findIndex((k) => k.classList.contains('tag-sep'));
      if (i < 0) return { there: false, kids: kids.length };
      const r = kids[i].getBoundingClientRect();
      const before = kids[i - 1] && kids[i - 1].querySelector('.tag-pill');
      return { there: true, at: i, w: Math.round(r.width), h: Math.round(r.height),
               after: before ? before.dataset.tag : null,
               ink: getComputedStyle(kids[i]).backgroundColor };
    });
    t('and a rule divides it from the rest',
      sep.there && sep.at === 1 && sep.w >= 1 && sep.h > 8
      && String(sep.after || '').toLowerCase() === 'featured', sep);

    /* ---- AND THE DOT SAYS WHAT IT DOES (2026-09-05) ---------------------- */
    /* THE DOT IS A REAL RADIO AND READS AS ONE, so it invites a press that
       means something -- and what it means was only ever on a `title`, which a
       touch screen cannot reach at all. It is the one thing about this bar
       nobody can work out by looking. */
    t('a note under the box explains the dot',
      m.note.there && m.note.shown, m.note);
    t('and it says the dot picks the primary tag',
      /primary tag/i.test(m.note.text || ''), m.note.text);
    /* IT NAMED THE EXCEPTION AND NO LONGER DOES (2026-09-05). `Featured`
       carries no dot -- `isPrimary` refuses a protected tag outright -- and
       the note used to say so, which is what stopped somebody hunting for a
       control deliberately not there. The rewrite dropped that sentence.
       WHAT STANDS IN ITS PLACE is `One per game` plus the chip being a
       different colour, which says the tag is not one of the ninety subjects
       without saying what it cannot do. **The behaviour is still asserted**
       two lines up -- only the words explaining it are gone. */
    t('and Featured still carries no primary dot at all',
      m.featured.there && !m.featured.dot, m.featured);
    /* AND IT SAYS WHAT `Featured` IS FOR, which is the half the position and
       the green cannot say on their own: the chip leads and is a different
       colour, and neither of those tells you WHY.
       WHAT THE NOTE NO LONGER SAYS (2026-09-05): that this bar writes
       `public.games` as you press it, where every other field on the page
       waits for Save. That sentence was cut when the note was rewritten, and
       it is the one thing here nobody can guess. It is recorded in CLAUDE.md
       instead. */
    t('and says what the featured tag is for',
      /featured/i.test(m.note.text || '') && /top of some pages/i.test(m.note.text || ''),
      m.note.text);
    /* UNDER the chips, not above them: a note that explains a control has to
       follow it, or it is read before there is anything to read it about. */
    t('and it sits under the chips', m.note.below, m.note.below);
    /* QUIET IS COLOUR, NOT SIZE, and the first cut of this assertion had it
       backwards -- it required the note to be SMALLER than a chip and failed
       on `{"note":11.52,"chip":9.92}`, which is a page that is right. A chip
       is a label you scan at 9.9px; the note is PROSE you read once, and this
       repo's own rule is that a label is made quiet by weight and colour and
       that being too small to read was never the way. So: readable, and
       lighter than the ink it sits under. */
    /* THE BRIGHTNESS HELPERS SIT FORTY LINES DOWN, next to the fill check, so
       this reads them there rather than declaring a second `lum` -- two ideas
       of how bright a colour is, under one name, is a syntax error and under
       two names is a drift. */
    let noteInk = { size: m.note.size, ink: m.note.ink, chipInk: m.note.chipInk };

    /* ---- CHOSEN IS FILLED, WHICH IS THE WHOLE POINT ---------------------- */
    /* THE FAULT THIS CHECK IS FOR: chosen was `rgba(var(--bic-blue-rgb), .08)`,
       an 8% tint, so three chosen among 91 looked like the other 88. Read as a
       COMPUTED colour: the class and the attribute were both correct on the old
       bar, and neither could see it. */
    /* THE ALPHA IS THE WHOLE MEASUREMENT, and leaving it out made this
       assertion VACUOUS -- it passed against the very 8% tint it exists to
       reject, because `rgba(45, 72, 128, 0.08)` and `rgb(45, 72, 128)` carry
       the same three numbers. Composited over the ground they are 238 and 72.
       An assertion that has never failed on the bug it is for is one nobody
       should trust, and this one had not. */
    const rgb = (s) => (String(s).match(/[\d.]+/g) || []).map(Number);
    const over = (s, ground) => {
      const c = rgb(s);
      if (c.length < 3) return ground;
      const a = c.length > 3 ? c[3] : 1;
      return [0, 1, 2].map((i) => c[i] * a + ground[i] * (1 - a));
    };
    const lum = (c) => (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000;
    /* AND A CONTRAST RATIO, WHICH IS A DIFFERENT QUESTION FROM `lum`. WCAG
       relative luminance rather than the BT.601 measure above: the two
       disagree on exactly the pairs this file cares about. Declared once, HERE
       with the other colour helpers -- a second copy under another name is two
       ideas of how bright a colour is, and a second under the SAME name is a
       syntax error, which is how this arrived. */
    const wcag = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a, b) => { const x = wcag(a), y = wcag(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    /* THE BAR'S OWN GROUND, read rather than assumed to be white: these chips
       sit on a pale blue panel, and compositing over the wrong ground would
       measure a colour nobody sees. */
    const ground = rgb(await p.evaluate(() =>
      getComputedStyle(document.getElementById('tagsBar')).backgroundColor)).slice(0, 3);
    const bed = ground.length === 3 ? ground : [255, 255, 255];
    /* QUIET IS COLOUR, NOT SIZE, and the first cut of this had it backwards:
       it required the note to be SMALLER than a chip and failed on
       `{"note":11.52,"chip":9.92}`, which is a page that is right. A chip is a
       label you SCAN at 9.9px; the note is PROSE you read once, and this repo's
       own rule is that a label is made quiet by weight and colour and that
       being too small to read was never the way. */
    t('and is lighter than the chips rather than smaller',
      noteInk.size >= 10
      && lum(over(noteInk.ink, bed)) > lum(over(noteInk.chipInk, bed)),
      noteInk);

    /* THE GREEN IS MEASURED AS A HUE, not compared against a string. `#146b3a`
       is a value somebody can change; what must stay true is that the chip is
       GREEN -- more green than red or blue -- and readable on the bar. */
    const fInk = over(m.featured.ink, bed);
    /* AND THE RULE AFTER IT IS THE HOUSE BLUE, not the chip's green. The
       green belongs to `Featured`; the rule is the box saying where the pin
       stops, so it takes the pen every other divider here takes. Measured as a
       HUE over the picker's own ground rather than against a string somebody
       may change -- and asserted HERE because `over` and `rgb` live with the
       other colour helpers, and a third copy of them is three ideas of what
       compositing means. */
    const sepBed = rgb(await p.evaluate(() =>
      getComputedStyle(document.getElementById('nodeTagPicker')).backgroundColor));
    const sepInk = over(sep.ink, sepBed.length === 3 ? sepBed : bed);
    t('and the rule is the house blue rather than the chip green',
      sepInk[2] > sepInk[1] + 10,
      { ink: sep.ink, composited: sepInk.map(Math.round) });
    t('and Featured is drawn in the green pen',
      fInk[1] > fInk[0] + 20 && fInk[1] > fInk[2] + 20,
      { ink: m.featured.ink, composited: fInk.map(Math.round) });
    /* READABLE ON THE BAR'S OWN GROUND, which is a pale blue rather than white
       -- compositing over the wrong ground measures a colour nobody sees. */
    t('and it clears 4.5:1 on the bar',
      ratio(fInk, bed) >= 4.5, Math.round(ratio(fInk, bed) * 100) / 100);

    const chosenL = lum(over(m.mystery.bg, bed));
    const plainL = lum(over(m.atlanta.bg, bed));
    /* THEY HAVE TO BE TOLD APART AT A GLANCE, which is a DIFFERENCE rather than
       a value: the old tint sat 17 apart and this sits about 180. */
    t('a chosen chip is filled dark and an unchosen one is not',
      plainL - chosenL > 90 && chosenL < 120,
      { chosen: Math.round(chosenL), not: Math.round(plainL),
        gap: Math.round(plainL - chosenL) });
    t('and its ink is light against that fill',
      lum(over(m.mystery.ink, bed)) > 200 && lum(over(m.atlanta.ink, bed)) < 150,
      { chosen: m.mystery.ink, not: m.atlanta.ink });
    /* THE STATE IS AN ATTRIBUTE TOO, so a screen reader is told and a check can
       read it -- and it cannot drift from the fill, both being written from one
       `isSelected`. */
    t('aria-pressed agrees with the fill',
      m.mystery.pressed === 'true' && m.atlanta.pressed === 'false',
      { chosen: m.mystery.pressed, not: m.atlanta.pressed });
    /* THE COUNT IS WHAT MAKES DELETING SAFE TO REASON ABOUT. */
    t('every chip carries how many games use it',
      m.mystery.n === '1' && m.atlanta.n === '0', { mystery: m.mystery.n, atlanta: m.atlanta.n });
    t('and the line says how many are chosen', /3 chosen/.test(m.count), m.count);

    /* ---- THE PRIMARY DOT ------------------------------------------------- */
    /* ON CHOSEN TAGS ONLY, and never on `Featured`: that tag is a mechanism
       rather than a label, so it has no primary to be. */
    t('a dot on each chosen tag, and none on the unchosen',
      m.dots === m.on.filter((x) => x !== 'Featured').length, { dots: m.dots, on: m.on });
    t('and the primary one is marked', /is-primary/.test(m.primaryDot || ''), m.primaryDot);

    /* ---- THE BOX NARROWS THE CHIPS --------------------------------------- */
    await type('foo');
    m = await read();
    t('typing narrows the chips', m.chips.join(',') === 'Food,Football', m.chips);
    t('and the line says how much of the pool is on screen',
      /2 of 12 shown/.test(m.count), m.count);
    /* ONE BOX ANSWERS BOTH QUESTIONS. A word that matches something is a
       search; a word that matches nothing is the new tag. */
    t('a word that matches nothing lights Add', m.add.on, m.add.on);
    await type('Mystery');
    m = await read();
    /* PRESSING ADD ON AN EXISTING TAG WOULD LOOK LIKE IT HAD DONE SOMETHING and
       could only ever have chosen it, which is what its chip does. */
    t('and a word that already exists does not', !m.add.on, m.add.on);

    /* ---- CHOOSING AND UNCHOOSING ----------------------------------------- */
    await type('');
    const before = writes.length;
    await press('Horror');
    m = await read();
    t('pressing a chip chooses it', m.on.indexOf('Horror') !== -1, m.on);
    await press('Horror');
    m = await read();
    t('and pressing it again takes it off', m.on.indexOf('Horror') === -1, m.on);
    /* CHOOSING WRITES THE ROW (2026-09-05). This reverses the assertion that
       was here -- `and neither writes anything on its own` -- which was correct
       until the behaviour was asked to change. What it protected survives as
       the assertion on WHAT is sent. */
    const tagPatches = writes.slice(before).filter((w) => w.m === 'PATCH' && /\/games/.test(w.u));
    t('choosing a tag writes the row straight away',
      tagPatches.length >= 1, writes.slice(before).map((w) => w.m + ' ' + w.u));
    const last = tagPatches[tagPatches.length - 1];
    t('onto the open game, not another',
      !!last && last.u.indexOf('id=eq.oswald') !== -1, last && last.u);
    /* BOTH COLUMNS TOGETHER, ALWAYS. `primary_tag` follows the list, so sending
       one without the other leaves the row naming a primary its own `tags` no
       longer carries -- a state no reader can interpret. */
    t('and carries both tags and primary_tag',
      !!last && /"tags"/.test(last.b) && /"primary_tag"/.test(last.b), last && last.b);
    t('and asks for the row back, since RLS refuses with a 200 and an empty array',
      !!last, last && last.u);

    /* ---- A REFUSED WRITE IS REPORTED ------------------------------------- */
    /* PostgREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES, and the chip
       already shows the new state -- so silence here would leave the page and
       the row disagreeing with nothing to say which is right. */
    refuseWrites = true;
    await press('Food');
    await p.waitForFunction(
      () => /could not save/i.test(document.getElementById('nodeTagCount').textContent || ''),
      { timeout: 8000 }).catch(() => {});
    const refused = await p.evaluate(() =>
      (document.getElementById('nodeTagCount') || {}).textContent || '');
    t('a refused write says so rather than going quiet',
      /could not save/i.test(refused) && /Save/.test(refused), refused);
    /* AND THE CHANGE SURVIVES IT. The message says to press Save, so the tag
       has to still be chosen and the document has to be marked unsaved --
       telling somebody to save something the page had already discarded is
       worse than saying nothing. */
    const kept = await p.evaluate(() => ({
      on: [...document.querySelectorAll('#nodeTagPicker .tag-pill[aria-pressed="true"]')]
        .map((n) => n.dataset.tag),
      dirty: typeof hasUnsavedChanges === 'function' ? hasUnsavedChanges() : null,
    }));
    t('and the tag it could not save is still chosen, with Save armed',
      kept.on.indexOf('Food') !== -1 && kept.dirty !== false, kept);
    /* AND IT SURVIVES A REPAINT. The count is written into this same line on
       every render, so a message that is merely SET can be gone before anybody
       reads it -- which is how this assertion came to pass four runs in six.
       A check that passes only sometimes is worth nothing. */
    await p.evaluate(() => renderTagPicker());
    await new Promise((r) => setTimeout(r, 250));
    const held = await p.evaluate(() =>
      (document.getElementById('nodeTagCount') || {}).textContent || '');
    t('and the message survives the next repaint', /could not save/i.test(held), held);

    /* A WRITE THAT LANDS CLEARS IT, or the line reports a refusal that has
       since been corrected. */
    refuseWrites = false;
    await press('Food');
    await p.waitForFunction(
      () => !/could not save/i.test(document.getElementById('nodeTagCount').textContent || ''),
      { timeout: 8000 });
    const cleared = await p.evaluate(() =>
      (document.getElementById('nodeTagCount') || {}).textContent || '');
    t('and a write that lands clears it', /chosen/.test(cleared), cleared);

    /* ---- ADDING ---------------------------------------------------------- */
    await type('Bourbon Street');
    await p.click('#nodeTagAddBtn');
    await new Promise((r) => setTimeout(r, 400));
    m = await read();
    t('adding puts the tag in the pool and on the game',
      m.chips.indexOf('Bourbon Street') !== -1 && m.on.indexOf('Bourbon Street') !== -1,
      { chips: m.chips.indexOf('Bourbon Street'), on: m.on });
    /* SORTED IN, NOT APPENDED. The list is alphabetical, and one entry out of
       order at the end is a list nobody can predict.
       THIS ASSERTION WAS `indexOf === 1` AND THE PIN CORRECTLY BROKE IT: with
       `Featured` led out to the front, `Bourbon Street` is second among the
       rest rather than second overall. It asks the thing that actually
       matters now -- everything after the pin is in order -- which is true
       whatever else gets pinned later. */
    const rest = m.chips.filter((c) => c.toLowerCase() !== 'featured');
    t('sorted into the list rather than left at the end',
      m.chips.indexOf('Bourbon Street') !== -1
      && rest.join('|') === rest.slice().sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())).join('|'),
      m.chips);
    t('and it is filed in the catalogue',
      writes.some((w) => w.m === 'POST' && /\/tags/.test(w.u)),
      writes.map((w) => w.m + ' ' + w.u.split('/rest/v1/')[1]));
    t('and the box is cleared for the next one', !m.add.on && /chosen/.test(m.count), m.count);

    /* ---- MANAGE POOL ----------------------------------------------------- */
    /* A MODE, DELIBERATELY. Deleting takes the tag off every game that carries
       it -- the widest-reaching act on this page -- and it was removed on
       2026-08-31 for being drawn as an x on a pill inside ONE game's editor. */
    await p.click('#nodeTagManageBtn');
    m = await read();
    t('Manage pool is a mode and says so', m.manage.pressed === 'true'
      && m.manage.word === 'Done', m.manage);
    t('and every chip but Featured grows an x',
      m.kills === m.chips.length - 1 && !m.featured.kill,
      { kills: m.kills, chips: m.chips.length, featured: m.featured.kill });
    /* THE x HAS TO BE READABLE ON BOTH KINDS OF CHIP. The red pen measures
       1.73:1 on the filled one, so on a chosen tag the most consequential
       control on the page was the one you could not see. It reads `wcag` and
       `ratio`, hoisted up beside `lum` and `over` -- see the note there. */
    const killInk = await p.evaluate(() => {
      const pick = (on) => {
        const w = [...document.querySelectorAll('#nodeTagPicker .tag-pill-wrap')]
          .find((n) => n.classList.contains('is-on') === on && n.querySelector('.tag-kill'));
        if (!w) return null;
        return { ink: getComputedStyle(w.querySelector('.tag-kill')).color,
                 bed: getComputedStyle(w).backgroundColor };
      };
      return { on: pick(true), off: pick(false) };
    });
    const seen = (x) => x && ratio(over(x.ink, bed).map(Math.round), over(x.bed, bed).map(Math.round));
    t('and the x is readable on a chosen chip as well as a plain one',
      seen(killInk.on) >= 4.5 && seen(killInk.off) >= 4.5,
      { chosen: Math.round(seen(killInk.on) * 100) / 100,
        plain: Math.round(seen(killInk.off) * 100) / 100 });
    /* SO A CLICK CAN NEVER MEAN BOTH `choose this` AND `destroy this
       everywhere`. */
    const wasOn = m.on.slice();
    await press('Atlanta');
    m = await read();
    t('and a chip no longer toggles while the mode is on',
      m.on.join(',') === wasOn.join(','), { was: wasOn, now: m.on });

    /* ---- DELETING -------------------------------------------------------- */
    const beforeDel = writes.length;
    answerConfirm = false;
    await p.evaluate(() => {
      [...document.querySelectorAll('#nodeTagPicker .tag-pill-wrap')]
        .find((w) => w.querySelector('.tag-pill').dataset.tag === 'Trivia')
        .querySelector('.tag-kill').click();
    });
    await new Promise((r) => setTimeout(r, 300));
    m = await read();
    /* THE CONFIRMATION NAMES THE COST. `Trivia` is on one stored game, and how
       many games a deletion reaches is the only thing anybody can decide with. */
    t('the question names the tag and how many games lose it',
      /Trivia/.test(lastConfirm) && /1 game\b/.test(lastConfirm), lastConfirm);
    t('and saying no writes nothing and keeps the tag',
      writes.length === beforeDel && m.chips.indexOf('Trivia') !== -1,
      { wrote: writes.slice(beforeDel).map((w) => w.m), chips: m.chips.indexOf('Trivia') });

    answerConfirm = true;
    await p.evaluate(() => {
      [...document.querySelectorAll('#nodeTagPicker .tag-pill-wrap')]
        .find((w) => w.querySelector('.tag-pill').dataset.tag === 'Trivia')
        .querySelector('.tag-kill').click();
    });
    await new Promise((r) => setTimeout(r, 900));
    m = await read();
    t('saying yes takes it out of the pool', m.chips.indexOf('Trivia') === -1, m.chips);
    const del = writes.find((w) => w.m === 'DELETE' && /\/tags/.test(w.u));
    t('and deletes the catalogue row', !!del && /name=eq\.Trivia/.test(del.u), del && del.u);
    /* THE WORD OFF EVERY GAME THAT CARRIES IT. Deleting the row alone leaves
       the word on the games with nothing naming it -- and worse, the next store
       sync re-files it, so the deletion undoes itself. */
    const patch = writes.find((w) => w.m === 'PATCH' && /\/games/.test(w.u));
    t('and takes the word off the game that carried it', !!patch
      && patch.b.indexOf('Trivia') === -1 && /"tags"/.test(patch.b), patch && patch.b);
    /* AND THE PRIMARY GOES WITH IT. A game whose primary is a word nothing else
       carries is a row no reader can interpret. */
    t('and clears the primary tag where it named the deleted one',
      !!patch && /"primary_tag"/.test(patch.b), patch && patch.b);

    /* ---- AND IT STAYS DELETED -------------------------------------------- */
    /* THE TWO RESURRECTION PATHS, WHICH ARE WHY THE OLD DELETE WAS REMOVED.
       `ALL_TAGS` hardcodes 21 of the 91 rows and was merged into the pool on
       every load; `syncAllTagsFromStore` re-files any tag it finds on a game
       straight back into `public.tags`. Either one puts a deleted tag back with
       nothing on screen saying so. */
    const back = await p.evaluate(() => {
      syncAllTagsFromStore();
      renderTagPicker(getGameNode());
      return [...document.querySelectorAll('#nodeTagPicker .tag-pill')].map((n) => n.dataset.tag);
    });
    t('and a store sync does not put it back', back.indexOf('Trivia') === -1, back);
    const hard = await p.evaluate(() => {
      /* `History` IS ONE OF THE 21 HARDCODED TAGS, which is the half the
         constant would resurrect. */
      return { inConst: ALL_TAGS.indexOf('History') !== -1, loaded: tagPoolLoaded };
    });
    t('the pool is the table once it has answered, not the hardcoded list',
      hard.inConst && hard.loaded === true, hard);

    /* ---- A GAME WITH NO FLOW NODE (2026-09-05) --------------------------- */
    /* THE FAULT THIS HALF IS FOR. `renderTagPicker` took a game NODE and
       disabled every chip without one -- and 14 of the 394 games have none, so
       on those the bar was dead AND lied about the row: `paris2026` holds two
       tags and it read `0 chosen`.
         `isGameNode` ASKS ABOUT THE FLOW DOCUMENT; `games.tags` and
       `games.primary_tag` ARE COLUMNS ON THE ROW. This is the sixth field in
       this room to need that correction. */
    const p2 = await browser.newPage();
    await p2.setViewport({ width: 1500, height: 1200 });
    p2.on('pageerror', (e) => errs.push('nodeless: ' + e.message));
    await p2.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p2.setRequestInterception(true);
    const nodelessWrites = [];
    p2.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-expose-headers': 'content-range' };
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
      if (req.method() !== 'GET') {
        nodelessWrites.push({ m: req.method(), u: decodeURIComponent(u), b: req.postData() || '' });
      }
      let body = [];
      if (req.method() === 'PATCH') body = [{ id: 'paris2026' }];
      else if (req.method() === 'POST') body = [{ name: 'stub' }];
      else if (u.indexOf('/games') !== -1) body = [NODELESS, OPEN];
      else if (u.indexOf('/tags') !== -1) body = POOL.map((x) => ({ name: x }));
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-' + Math.max(0, body.length - 1)
          + '/' + body.length }, cors),
        body: JSON.stringify(body) });
    });
    await p2.goto('http://127.0.0.1:8877/mc/games/index.html?id=paris2026',
      { waitUntil: 'domcontentloaded' });
    await p2.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await p2.waitForFunction(
      () => document.querySelectorAll('#nodeTagPicker .tag-pill').length > 0,
      { timeout: 8000 });

    const nl = await p2.evaluate(() => ({
      hasNode: !!(typeof getGameNode === 'function' && getGameNode()),
      openId: state.currentGameId,
      chips: document.querySelectorAll('#nodeTagPicker .tag-pill').length,
      dead: [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
        .filter((n) => n.disabled).length,
      on: [...document.querySelectorAll('#nodeTagPicker .tag-pill[aria-pressed="true"]')]
        .map((n) => n.dataset.tag).sort(),
      box: document.getElementById('nodeTagNewInput').disabled,
      manage: document.getElementById('nodeTagManageBtn').disabled,
      count: (document.getElementById('nodeTagCount') || {}).textContent,
    }));
    /* THE FIXTURE HAS TO BE THE BROKEN SHAPE or this proves nothing. */
    t('the second game really has no game node', !nl.hasNode && nl.openId === 'paris2026', nl);
    t('and its chips are live rather than every one disabled',
      nl.chips > 0 && nl.dead === 0, { chips: nl.chips, dead: nl.dead });
    /* THE ROW'S OWN TAGS ARE SHOWN. They were lost in `normalizeSavedGame`,
       which carried every other flat column and not these two -- so the bar
       said `0 chosen` over a row holding both. */
    t('and the tags the row carries show as chosen',
      nl.on.join(',') === 'History,Sports', nl.on);
    t('and the count agrees with them', /2 chosen/.test(nl.count), nl.count);
    t('and the box and Manage pool are usable',
      !nl.box && !nl.manage, { box: nl.box, manage: nl.manage });

    await p2.evaluate(() => {
      [...document.querySelectorAll('#nodeTagPicker .tag-pill')]
        .find((x) => x.dataset.tag === 'Food').click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const nlPatch = nodelessWrites.find((w) => w.m === 'PATCH' && /\/games/.test(w.u));
    t('choosing one writes the row on a nodeless game too',
      !!nlPatch && nlPatch.u.indexOf('id=eq.paris2026') !== -1, nlPatch && nlPatch.u);
    /* THE SAME ON A NODELESS GAME, because the `type === 'game'` test that
       came off with `getGameNode()` would put the fault straight back here --
       a meta carries no type at all. */
    const nlCount = await tally(p2, 'Food');
    t('and its count moves too',
      nlCount && nlCount.on && nlCount.n >= 1, nlCount);
    t('and the write carries the tag that was pressed',
      !!nlPatch && /"Food"/.test(nlPatch.b) && /"primary_tag"/.test(nlPatch.b),
      nlPatch && nlPatch.b);
    await p2.close();

    /* ---- AND NOTHING ELSE WAS TOUCHED ------------------------------------ */
    t('no console errors', errs.length === 0, errs);
    t('the room asked for the tag catalogue', asked.some((u) => /\/tags\?/.test(u)),
      asked.filter((u) => /\/tags/.test(u)).length);
  } finally {
    await browser.close();
    if (server) server.close();
  }
  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  if (bad) process.exitCode = 1;
})();
