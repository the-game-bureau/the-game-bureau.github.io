/* THE BOOKMARKLET IN THE SOCIALIZER (2026-09-04).

   THE CHIP IS CALLED `SHARE AS TGB` and holds nothing else. Its text is what a
   browser takes as the BOOKMARK'S NAME when the anchor is dragged, so anything
   in there is in the name -- which is why the check counts the anchor's children
   rather than only reading its words.

   IT REPLACED THE `PROMPT` BUTTON, which handed you the page's own copy of the
   socials brief to paste into a chat AI. That text is kept at
   mc/socializer/socializer.md, Appendix B, and the ROUTINE is untouched.

   THE CLAIM IS AN END TO END ONE and it is checked that way: the bookmarklet is
   RUN, for real, against a fixture page with a relative `og:image`, and what it
   hands `window.open` is then fed back into the Socializer as a `#share=` hash.
   Asserting the source string would prove nothing about whether it works.

   **THE ONE THING THAT DECIDES THE WHOLE DESIGN** is that a bookmarklet cannot
   write the row: `public.socials` is `authenticated` in both directions and it
   has no session. So it opens this room, which is signed in, and the room
   files. The write is intercepted here and its body read.

   Reads go to the LIVE database. Every write is intercepted.

   Run: node mc/_dev/browser-checks/socializer-bookmarklet.js                  */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
            '.json': 'application/json' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const NL = String.fromCharCode(10);
const ROOT = 'C:/Code/the-game-bureau';
const PORT = 9471;

/* A PAGE THE BOOKMARKLET CAN BE RUN AGAINST. The `og:image` is RELATIVE on
   purpose: that is the ordinary case, and resolved anywhere but in the page it
   came from it would point at the Socializer's own origin -- a url that looks
   perfectly right and 404s. */
const FIXTURE = [
  '<!DOCTYPE html><html><head><meta charset="utf-8">',
  '<title>The tag title, which loses</title>',
  '<meta property="og:title" content="A river runs green through Chicago">',
  '<meta property="og:image" content="/pics/river.jpg">',
  '<meta property="og:description" content="The description, which the selection beats.">',
  /* REPEATED ON PURPOSE: `article:tag` is a repeating tag, so a first-match
     reader would find one of three. And `keywords` is a comma list, which is
     the other shape. Both carry a duplicate and a capital, so the dedupe and
     the lowercasing are exercised rather than assumed. */
  '<meta property="article:tag" content="Chicago">',
  '<meta property="article:tag" content="rivers">',
  '<meta property="article:tag" content="st patricks day">',
  '<meta name="keywords" content="chicago, dye, ,  Rivers ">',
  '</head><body><h1>hello</h1>',
  '<p id="pick">  Dyed bright green' + String.fromCharCode(10) + '  every March.  </p>',
  '</body></html>'
].join('');

(async () => {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/fixture/') {
      r.writeHead(200, { 'content-type': 'text/html' });
      r.end(FIXTURE);
      return;
    }
    let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(PORT, r));
  const base = 'http://127.0.0.1:' + PORT;
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    const errs = [], writes = [];
    let stubRows = null;
    let breakWrite = false;
    p.on('pageerror', (e) => errs.push(String(e.message).split(NL)[0]));
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => ({ access_token: 'probe-token' }), init: () => {},
                 authHeaders: (x) => Object.assign(
                   { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    }, KEY);
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET' && stubRows && u.indexOf('/rest/v1/socials') !== -1) {
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify(stubRows) });
        return;
      }
      if (m !== 'GET' && breakWrite) {
        q.respond({ status: 401, contentType: 'application/json', headers: H,
                    body: '{"message":"probe refusal"}' });
        return;
      }
      if (m !== 'GET') {
        let body = null;
        try { body = JSON.parse(q.postData() || 'null'); } catch (e) { body = q.postData(); }
        writes.push({ method: m, url: u, body: body });
        /* ANSWER WITH THE ROW, as PostgREST does under `return=representation`.
           An empty array is what it answers when RLS REFUSES, and the page
           reads that back -- so a stub answering `[]` would exercise the
           failure path on every run. */
        q.respond({ status: 201, contentType: 'application/json', headers: H,
                    body: JSON.stringify([Object.assign({ status: 'review' },
                      Array.isArray(body) ? body[0] : body)]) });
        return;
      }
      q.continue();
    });

    const authorize = async () => {
      await p.evaluate(async () => {
        /* TWO CLASSES. `is-admin` is the room's own flag and
           `mc-auth-authorized` is what admin-shell.css waits for before it
           will show any child of the body -- with only the first, every
           element measures 0x0 at 0,0. */
        document.body.classList.add('is-admin');
        document.body.classList.add('mc-auth-authorized');
        if (window.__a) await window.__a();
      });
      /* THE ROOM'S SCRIPT IS AN IIFE, so `posts` and every other name inside it
         are unreachable from here. The wait watches the DOM instead -- the
         queue has either drawn a card or said it is empty -- which is what a
         person watches too. */
      await p.waitForFunction(() => {
        const list = document.getElementById('queueList');
        const empty = document.getElementById('queueEmpty');
        return (list && list.children.length > 0) || (empty && !empty.hidden);
      }, { timeout: 40000 });
    };

    // ---- THE DOOR ---------------------------------------------------------
    await p.goto(base + '/mc/socializer/', { waitUntil: 'domcontentloaded' });
    await authorize();

    const raw = fs.readFileSync(ROOT + '/mc/socializer/index.html', 'utf8');
    /* COMMENTS OUT BEFORE THE SEARCH. A negative assertion over raw source
       matches the comment explaining the removal, which this repo has been
       caught by four times -- and it caught this one too, on `copyPromptText`
       inside a CSS note the sweep had orphaned. */
    const src = raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    /* THE PROMPT IS GONE, NOT HIDDEN, and its wiring went with it. The scroll
       lock read `promptCard` inside `closeTool`, so a leftover there would have
       thrown on EVERY close and left the page's scroll locked for good. */
    t('nothing in the room still names the prompt dialog',
      !/promptCard|promptBtn|promptEl|copyPromptText|platformBoxes/.test(src),
      (src.match(/promptCard|promptBtn|promptEl|copyPromptText|platformBoxes/g) || []).slice(0, 6));
    /* THE ONE SPOT. Both prompts moved into mc/socializer/socializer.md on
       2026-09-04, so this reads the file that is actually kept -- and it asserts
       BOTH, because the routine's copy sits in there beside the retired one and
       losing either would be silent. */
    const oneSpot = fs.existsSync(ROOT + '/mc/socializer/socializer.md')
      ? fs.readFileSync(ROOT + '/mc/socializer/socializer.md', 'utf8') : '';
    t('and the authored prompt text is kept rather than lost',
      oneSpot.indexOf('You are the socials scout for The Game Bureau') !== -1
        && oneSpot.indexOf('You are SOCIALIZER BOT, the socials scout') !== -1,
      oneSpot.length);

    const btn = await p.evaluate(() => {
      const b = document.getElementById('bookmarkletBtn');
      const old = document.getElementById('promptBtn');
      return { text: b ? b.textContent.trim() : null, title: b ? b.title : null,
               oldGone: !old };
    });
    t('the Add bar carries a BOOKMARKLET button', btn.text === 'BOOKMARKLET', btn);
    t('and the PROMPT button is gone', btn.oldGone, btn);

    await p.click('#bookmarkletBtn');
    const dlg = await p.evaluate(() => {
      const a = document.getElementById('bookmarkletLink');
      return {
        open: !document.getElementById('bookmarkletCard').hidden,
        word: a.textContent.trim(),
        inside: a.childElementCount,
        title: document.getElementById('bookmarkletTitle').textContent.trim(),
        href: a.getAttribute('href'),
        code: document.getElementById('bookmarkletCode').value,
        origin: document.getElementById('bookmarkletOrigin').textContent,
        cursor: getComputedStyle(a).cursor
      };
    });
    t('pressing it opens the dialog', dlg.open);
    /* THE CHIP'S TEXT IS THE BOOKMARK'S NAME. Dragging an anchor onto the bar
       takes its text as the title, so this is the string that ends up on the
       bar and the string you hunt for there. */
    t('the draggable thing is called SHARE AS TGB',
      dlg.word === 'SHARE AS TGB', dlg.word);
    /* THE HEADING NAMES THE THING YOU ARE DRAGGING, so it follows it: left
       behind it would name a button that is not there. NO MARK ON IT, though --
       the heading is the room's uppercase mono and a picture in it is
       decoration, where on the chip it is the thing itself. */
    t('and the dialog is titled the same, without the mark',
      dlg.title === 'SHARE AS TGB', dlg.title);
    /* AND NOTHING ELSE IS IN THERE. A mark, a badge or a wrapper inside the
       anchor is part of the name, so reading the words alone would pass on a
       chip carrying a picture the bookmark would then be called by. */
    t('and nothing else rides along inside the name',
      dlg.inside === 0, dlg.inside);
    /* IT HAS TO BE A REAL `javascript:` ANCHOR. That is the only thing a
       browser will take onto the bookmarks bar, and it is the whole mechanism. */
    t('and it is a real javascript: link', /^javascript:/.test(dlg.href || ''),
      (dlg.href || '').slice(0, 40));
    t('and the pasteable address is the same string', dlg.code === dlg.href);
    /* GRAB, NOT POINTER. The gesture it wants is a drag and the cursor is the
       only thing that can say so before you try. */
    t('and the cursor says it wants dragging', dlg.cursor === 'grab', dlg.cursor);

    /* THE ORIGIN IS THIS PAGE'S OWN, never hardcoded: one dragged from localhost
       points at localhost. The dialog prints which, because it is the one thing
       about the button a reader cannot check by looking at it. */
    t('it files into this page, and says so',
      dlg.origin === base + '/mc/socializer/'
        && dlg.href.indexOf(base + '/mc/socializer/#share=') !== -1,
      { printed: dlg.origin, inHref: dlg.href.indexOf(base) !== -1 });

    /* NOT ONE DOUBLE QUOTE, which is why the meta tags are walked rather than
       reached with a selector: the string has to survive an href, a read back,
       and a paste into a bookmark by hand. */
    t('and carries no double quote and no line break',
      dlg.href.indexOf('"') === -1 && dlg.href.indexOf(NL) === -1);

    /* ---- THE LOOK, WHICH ONLY A BROWSER CAN ANSWER ------------------------
       THE BODY HAD NO PADDING AT ALL. The room's 16px lives on `.modal-form`,
       and this dialog's content sat as loose children of the `<section>` -- so
       the text ran to the panel edges, and it was not the panel's scrolling
       element either, since `section.tool-modal-panel > .modal-form` names that
       by selector. A short window would have clipped it with nothing to
       scroll. */
    const look = await p.evaluate(() => {
      const card = document.getElementById('bookmarkletCard');
      const body = card.querySelector('.bookmarklet-body');
      const first = card.querySelector('.bookmarklet-body > p');
      const well = card.querySelector('.bookmarklet-drag');
      const chip = document.getElementById('bookmarkletLink');
      const foot = card.querySelector('.modal-actions');
      const cs = (el) => getComputedStyle(el);
      const box = (el) => el.getBoundingClientRect();
      return {
        bodyIsModalForm: body.classList.contains('modal-form'),
        bodyPad: cs(body).padding,
        bodyScrolls: cs(body).overflowY,
        // The gap between the panel's left edge and the first line of prose.
        textInset: Math.round(box(first).left - box(card).left),
        footInset: Math.round(box(card).right - box(foot.querySelector('.btn:last-of-type')).right),
        wellDashed: cs(well).borderTopStyle,
        wellPad: parseInt(cs(well).paddingTop, 10),
        chipInWell: well.contains(chip),
        chipH: Math.round(box(chip).height),
        panelW: Math.round(box(card).width),
        /* THE RENDERED WIDTH, NOT THE SOURCE'S LINE BREAKS. Counting the
           latter answered 71 about lines running past 100 characters on
           screen, which is a metric that cannot see the thing it is for.
           Roughly 7px a character at this size, so 540px is about 75 -- the
           top of the range anybody reads comfortably. */
        proseW: Math.round(box(first).width)
      };
    });
    t("the dialog body is the room's own padded, scrolling one",
      look.bodyIsModalForm && look.bodyScrolls === 'auto', look);
    /* MEASURED FROM THE PANEL EDGE, never read off a declaration: a `padding`
       that is present and beaten by something else reads as correct in the file
       and wrong on screen. */
    t('and the prose is inset from the panel edge rather than touching it',
      look.textInset >= 14 && look.textInset <= 20, look.textInset);
    t('and the foot is inset by the same amount',
      Math.abs(look.footInset - look.textInset) <= 1,
      { text: look.textInset, foot: look.footInset });

    /* THE WELL. The chip is the point of the dialog, so it is set in something
       rather than floating in prose -- and the border is DASHED, which is the
       drop-zone idiom read backwards: this is the thing you take OUT of here. */
    t('the chip sits in a dashed well of its own',
      look.chipInWell && look.wellDashed === 'dashed' && look.wellPad >= 12, look);
    t('and is a real target rather than a word', look.chipH >= 34, look.chipH);

    /* THE PANEL IS THE MEASURE. 780px is the room's default for a two-column
       form; this dialog is a paragraph, a chip and a code box, and set that wide
       the lines ran past 100 characters. */
    t('the panel is narrowed to a readable measure',
      look.panelW <= 600 && look.proseW <= 540, look);

    const clicked = await p.evaluate(() => {
      const before = location.href;
      document.getElementById('bookmarkletLink').click();
      return { moved: location.href !== before,
               said: document.getElementById('bookmarkletStatus').textContent };
    });
    /* PRESSING IT HERE WOULD FILE THE SOCIALIZER ITSELF, so the click is refused
       and says the one useful thing. */
    t('clicking it goes nowhere and says to drag it',
      !clicked.moved && /[Dd]rag/.test(clicked.said), clicked);

    // ---- RUN THE BOOKMARKLET, FOR REAL ------------------------------------
    const source = dlg.href;
    await p.goto(base + '/fixture/', { waitUntil: 'domcontentloaded' });
    /* SELECT SOMETHING FIRST, because that is the gesture the caption is for:
       highlight a sentence, press the button, and that sentence is the caption.
       The fixture's paragraph carries a newline and doubled spaces, so the
       squash is exercised rather than assumed. */
    const opened = await p.evaluate((code) => {
      var r = document.createRange();
      r.selectNodeContents(document.getElementById('pick'));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      var got = null;
      var real = window.open;
      window.open = function (u) { got = u; return null; };
      try { eval(code.replace(/^javascript:/, '')); } finally { window.open = real; }
      return got;
    }, source);

    t('running it on a page opens the Socializer', !!opened
      && opened.indexOf(base + '/mc/socializer/#share=') === 0, opened);

    let payload = null;
    try {
      payload = JSON.parse(decodeURIComponent(String(opened).split('#share=')[1]));
    } catch (e) { payload = null; }
    t('and hands over the page it was pressed on',
      !!payload && payload.u === base + '/fixture/', payload);
    /* THE PAGE'S OWN TITLE, read IN the page. `og:title` beats `<title>`, which
       is what the fixture is built to tell apart. */
    t('with the og:title rather than the tag title',
      !!payload && payload.t === 'A river runs green through Chicago', payload && payload.t);
    /* THE IMAGE IS THE THING ONLY A BOOKMARKLET CAN GET, and it is made absolute
       IN the page: a relative og:image resolved anywhere else would point at the
       Socializer's own origin, which looks right and 404s. */
    t('and an absolute image, resolved against the page it came from',
      !!payload && payload.i === base + '/pics/river.jpg', payload && payload.i);
    /* THE SELECTION IS SENT RAW -- collapsing it in the bookmarklet would need a
       whitespace class, and a backslash in that string has to survive an href, a
       read back and a paste by hand. The room squashes it. */
    t('and the text that was selected, as the caption',
      !!payload && /Dyed bright green/.test(payload.b || ''), payload && payload.b);
    t('and every article:tag, not just the first',
      !!payload && ['Chicago', 'rivers', 'st patricks day']
        .every((x) => (payload.g || []).indexOf(x) !== -1), payload && payload.g);
    t('and when the button was pressed',
      !!payload && !isNaN(new Date(payload.f).getTime())
        && Math.abs(Date.now() - new Date(payload.f).getTime()) < 120000,
      payload && payload.f);

    // ---- WHAT THE ROOM DOES WITH IT ---------------------------------------
    writes.length = 0;
    await p.goto(opened, { waitUntil: 'domcontentloaded' });
    await authorize();
    await p.waitForFunction(() => (location.hash || '').indexOf('#share=') !== 0,
                            { timeout: 20000 }).catch(() => {});

    /* THE TABLE, NOT EVERY POST. `checkAccounts` posts `{diagnose:true}` at the
       `socials-post` Edge Function on every load, and counting that as a filing
       reads exactly like the room writing twice. */
    const isFiling = (w) => w.method === 'POST' && w.url.indexOf('/rest/v1/socials') !== -1;
    const filed = writes.filter(isFiling);
    t('arriving there files exactly one candidate', filed.length === 1,
      writes.map((w) => w.method + ' ' + w.url.split('/rest/v1/')[1]));
    const row = filed[0] && filed[0].body;
    t('and the row carries the url', !!row && row.url === base + '/fixture/', row);
    t('and the headline the bookmarklet read',
      !!row && row.headline === 'A river runs green through Chicago', row && row.headline);
    /* MANUAL DROPS THE IMAGE EVEN WHEN ITS METADATA READ FINDS ONE. This is the
       whole reason the bookmarklet is better than MANUAL at the same job:
       Instagram's API refuses a post with no image. */
    t('and the image, which MANUAL cannot fill at all',
      !!row && row.image === base + '/pics/river.jpg', row && row.image);
    t('and says it arrived by hand rather than from the bot',
      !!row && row.origin === 'manual', row && row.origin);
    /* THE CAPTION IS THE COPY THAT GETS PUBLISHED. The selection wins over the
       page's own description, which is the outlet's marketing -- and the
       newline and doubled spaces in it are collapsed on the way in, since
       `cleanText` only trims. */
    t('the caption is the selection, squashed to one line',
      !!row && row.blurb === 'Dyed bright green every March.', row && row.blurb);
    /* LOWERCASED AND DEDUPED, the shape the strip's own editor writes. The
       fixture repeats `rivers` in both shapes and capitalises one of them. */
    t('the tags are lowercased and deduped across both shapes',
      !!row && JSON.stringify(row.topics) ===
        JSON.stringify(['chicago', 'rivers', 'st patricks day', 'dye']),
      row && row.topics);
    /* THE FOUND TIME IS THE PRESS, not the filing. The column's own `now()`
       cannot know it: a share that arrives signed out waits for the sign-in. */
    const pressed = (() => {
      try { return new Date(payload.f).toISOString(); } catch (e) { return null; }
    })();
    t('and the found time is the moment the button was pressed',
      !!row && !!pressed && row.created_at === pressed,
      { row: row && row.created_at, pressed: payload && payload.f });

    /* CLEARED WHATEVER HAPPENS. A hash left behind re-files the same page on the
       next reload -- a worse version of the stale `#manual` this room already
       fixed once, because this one writes a row. */
    t('and the hash is cleared so a reload does not file it again',
      (await p.evaluate(() => location.hash)) === '', await p.evaluate(() => location.hash));

    /* A PAGE THAT OFFERS NONE OF IT. `blurb` is NOT NULL, so an empty caption
       has to be a real empty string rather than a missing column -- and a row
       with no tags stores null rather than an empty array, which is what the
       strip's own editor writes. */
    writes.length = 0;
    await p.goto('about:blank');
    await p.goto(base + '/mc/socializer/#share=' +
      encodeURIComponent(JSON.stringify({ u: base + '/bare/', t: 'bare' })),
      { waitUntil: 'domcontentloaded' });
    await authorize();
    await new Promise((r) => setTimeout(r, 900));
    const bare = writes.filter(isFiling)[0] && writes.filter(isFiling)[0].body;
    t('a page with no caption and no tags files anyway',
      !!bare && bare.blurb === '' && bare.topics === null, bare);
    /* AN UNUSABLE TIMESTAMP FALLS BACK TO THE COLUMN'S OWN `now()`. It comes off
       the clock of whatever machine pressed the button, and a `created_at` in
       2041 sorts the queue wrong for ever. */
    t('and one with no found time leaves the column to its default',
      !!bare && bare.created_at === undefined, bare && bare.created_at);

    writes.length = 0;
    await p.goto('about:blank');
    await p.goto(base + '/mc/socializer/#share=' +
      encodeURIComponent(JSON.stringify({ u: base + '/future/', t: 'future',
        f: new Date(Date.now() + 40 * 86400000).toISOString() })),
      { waitUntil: 'domcontentloaded' });
    await authorize();
    await new Promise((r) => setTimeout(r, 900));
    const far = writes.filter(isFiling)[0] && writes.filter(isFiling)[0].body;
    t('and a found time in the future is refused rather than stored',
      !!far && far.created_at === undefined, far && far.created_at);

    // ---- THE CARD SAYS WHEN IT WAS FOUND ----------------------------------
    /* IT READ `Manual` AND SAID NOTHING ABOUT WHEN, on every row this room has
       ever filed by hand -- the id carries no date and `candidateLabel` had
       nothing else to read. `created_at` is NOT NULL on every row. */
    stubRows = [{ id: 'manual-2026-09-04-1200-abc', url: base + '/dated/',
                  headline: 'a dated one', blurb: '', status: 'review',
                  origin: 'manual',
                  created_at: '2026-09-02T12:00:00.000Z' }];
    await p.goto('about:blank');
    await p.goto(base + '/mc/socializer/', { waitUntil: 'domcontentloaded' });
    await authorize();
    const kicker = await p.evaluate(() => {
      const el = document.querySelector('.post-kicker-id');
      const origin = document.querySelector('.post-kicker-origin');
      return { label: el ? el.textContent.trim() : null,
               origin: origin ? origin.textContent.trim() : null };
    });
    t('a hand-filed card says when it was found, not just that it was manual',
      /^Found /.test(kicker.label || ''), kicker);
    /* THE CHIP COMES BACK BY ITSELF. It is drawn on
       `candidateLabel !== originLabel`, written when both said Manual -- so the
       two facts, WHEN and HOW, are on screen together now rather than collapsed
       into one word. */
    t('and the origin chip says how it arrived, beside it',
      /manual/i.test(kicker.origin || ''), kicker);
    stubRows = null;

    // ---- THE SAME PAGE TWICE ----------------------------------------------
    /* THE DUPLICATE CHECK READS THE ROWS IN MEMORY, which is why the receiver
       waits for the queue rather than running beside it. The stub's reply is
       not in `posts`, so the row is put there by hand to model a queue that
       already holds it. */
    writes.length = 0;
    stubRows = [{ id: 'probe', url: base + '/fixture/', headline: 'already here',
                  blurb: '', status: 'review', origin: 'manual',
                  created_at: new Date().toISOString() }];
    /* AWAY FIRST, OR THERE IS NO LOAD AT ALL. A `goto` that differs from the
       current url only in the HASH does not reload the document -- it fires
       `hashchange`, which the room handles -- so the queue would still hold the
       rows from the previous probe and this one would file, correctly, on a
       page that had never seen the stub. It read as the duplicate check
       failing. */
    await p.goto('about:blank');
    await p.goto(base + '/mc/socializer/#share=' +
      encodeURIComponent(JSON.stringify({ u: base + '/fixture/', t: 'again', i: '' })),
      { waitUntil: 'domcontentloaded' });
    await authorize();
    await new Promise((r) => setTimeout(r, 900));
    t('a page already in the queue is not filed twice',
      writes.filter(isFiling).length === 0,
      writes.filter(isFiling).map((w) => w.body));
    t('and it says so rather than doing nothing visible',
      /[Aa]lready/.test(await p.evaluate(() =>
        (document.getElementById('queueStatus') || {}).textContent || '')),
      await p.evaluate(() => (document.getElementById('queueStatus') || {}).textContent));

    // ---- THE WAY OUT ------------------------------------------------------
    stubRows = null;
    await p.goto(base + '/mc/socializer/', { waitUntil: 'domcontentloaded' });
    await authorize();
    await p.click('#bookmarkletBtn');
    await p.keyboard.press('Escape');
    t('Escape closes the dialog',
      await p.evaluate(() => document.getElementById('bookmarkletCard').hidden));
    /* THE SCROLL LOCK IS THE ONE THAT BITES. `closeTool` used to ask whether the
       prompt card was open; with that var gone it would throw on every close and
       leave the page unscrollable for the rest of the session. */
    t('and the page can be scrolled again',
      (await p.evaluate(() => document.body.style.overflow)) !== 'hidden',
      await p.evaluate(() => document.body.style.overflow));

    /* THE CAPTURE IS NOT LOST WHEN THE WRITE FAILS. The hash is cleared either
       way -- a reload must not re-file -- so the url is handed to the Add box,
       where it can be looked at and pressed. A write that fails without saying
       so is a bug in itself.
         This was found rather than designed for: with no session in the stub,
       the whole run took this path and read as the receiver being broken. */
    stubRows = null;
    breakWrite = true;
    await p.goto(base + '/mc/socializer/#share=' +
      encodeURIComponent(JSON.stringify({ u: base + '/nope/', t: 'refused', i: '' })),
      { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('is-admin');
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await new Promise((r) => setTimeout(r, 1500));
    const refused = await p.evaluate(() => ({
      box: !document.getElementById('manualCard').hidden,
      url: (document.getElementById('manualUrl') || {}).value,
      said: (document.getElementById('manualStatus') || {}).textContent,
      hash: location.hash
    }));
    t('a write that fails hands the capture to the Add box and says why',
      refused.box && refused.url === base + '/nope/' && /[Cc]ould not file/.test(refused.said),
      refused);
    t('and the share hash is cleared even then, so a reload cannot re-file',
      refused.hash !== '' ? refused.hash.indexOf('#share=') !== 0 : true, refused.hash);

    /* AN ID BEATS A CLASS WHATEVER THE MEDIA QUERY -- a media query adds no
       specificity of its own -- so `#bookmarkletCard`'s own width kept applying
       on a phone and the panel sat 8px from the left with 24px on the right:
       off centre by exactly the 16px the two arithmetics differ by. */
    await p.setViewport({ width: 390, height: 760 });
    await p.goto(base + '/mc/socializer/', { waitUntil: 'domcontentloaded' });
    await authorize();
    await p.click('#bookmarkletBtn');
    const phone = await p.evaluate(() => {
      const c = document.getElementById('bookmarkletCard').getBoundingClientRect();
      const hint = document.querySelector('.bookmarklet-hint');
      return { left: Math.round(c.left),
               right: Math.round(document.documentElement.clientWidth - c.right),
               sideways: document.documentElement.scrollWidth
                         > document.documentElement.clientWidth,
               hintShown: !!hint && getComputedStyle(hint).display !== 'none' };
    });
    t('on a phone it uses the width evenly and does not scroll sideways',
      phone.left === phone.right && !phone.sideways, phone);
    /* THE HINT IS STILL SHOWN HERE, and that is right: this is a narrow WINDOW
       with a mouse, not a touch screen. The `pointer: coarse` guard asks about
       the input rather than the width, because a narrow desktop window drags
       perfectly well -- so a breakpoint would be a guess about the device. */
    t('and the drag hint is still there, since a narrow window can still drag',
      phone.hintShown, phone);
    await p.setViewport({ width: 1500, height: 1000 });

    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(NL + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
