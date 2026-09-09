/* THE POSTING LOCK IS ONE CARD WIDE, AND EVERY OTHER CARD QUEUES (2026-09-09).

   ASKED FOR AS: while posting, gray out all buttons for THAT candidate only.
   Do not gray out any other buttons for any other candidates during posting.
   Instead, make all buttons on all other candidates into queue buttons that
   queue up their action and take place in order after the candidate posts,
   then it just goes down the line posting or skipping.

   THE CLAIM IS ABOUT A MOMENT, so it is driven at that moment: an account
   button is really pressed, the Edge Function's reply is HELD OPEN, and the
   rest of the queue is worked while the lock is on. Reading the source would
   say the handler branches; only holding the request says the branch is
   reached -- and only holding the SECOND one says the queue re-locks the card
   it has moved on to.

   FIVE CARDS, EACH ANSWERING ONE THING:
     A  posts, and is held.  Its whole row must be dead.
     B  an account press, queued.  It must post when A answers.
     C  Facebook then Skip.   The later press wins; they are opposite answers.
     D  Skip then Facebook.   The same rule from the other side.
     E  X, which is BY HAND.  It must run NOW: a clipboard write and a popup
        both need the activation of the click that asked for them, and a press
        replayed from the queue a minute later has neither.

   SO THE EXPECTED ORDER IS B post, C skip, D post -- down the line, posting or
   skipping, in the order the buttons were pressed.

   THE READS ARE STUBBED. The claim is about five cards in known states, and the
   live queue is whatever the bot filed this morning.

   Run: node mc/_dev/browser-checks/socializer-queue-goes-down-the-line.js    */
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
const PORT = 9487;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* A GATE THAT FAILS BY NAME RATHER THAN TIMING OUT. A raw waitForFunction that
   never settles kills the run with a stack, which names no assertion and stops
   everything after it -- so a real fault reads as the harness rather than as
   the page. This reports, then stops deliberately. */
function stop(msg) {
  const e = new Error(msg);
  e.__stop = true;
  return e;
}

/* FIVE CANDIDATES, ALL POSTABLE. `platforms` is null on purpose: no advice
   means no narrowing, which is this room's own rule and is the state every
   hand-added row is in. An image is what keeps Instagram out of the by-hand
   fallback, so the account row reads the same on all five. */
function row(id, headline) {
  return {
    id: id, status: 'review', created_at: '2026-09-09T10:00:00+00:00',
    url: 'https://example.com/' + id, headline: headline,
    blurb: 'Zed caption for ' + id, image: 'https://example.com/' + id + '.jpg',
    source: 'Zed Probe Wire', published: '2026-09-08', topics: ['probe'],
    why: 'probe row', confidence: 80, platforms: null, origin: 'manual',
    posted_at: null, posted_platforms: null, posted_ids: null, captions: null
  };
}
const ROWS = [
  row('zed-a', 'Zed A the posting one'),
  row('zed-b', 'Zed B the queued post'),
  row('zed-c', 'Zed C the queued skip'),
  row('zed-d', 'Zed D the later press'),
  row('zed-e', 'Zed E the by hand one')
];

(async () => {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(PORT, r));
  const br = await pup.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'], protocolTimeout: 240000
  });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1400 });
    const errs = [], writes = [], log = [];
    /* EVERY POST IS HELD, none answered automatically. Answering as they arrive
       would make the flush a blur; held, each one is a moment the page can be
       measured in -- which is the only way to say the queue RE-LOCKS the card
       it has moved on to rather than posting it in the open. */
    const held = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(NL)[0]));
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = {
        create: (o) => {
          window.__a = o.onAuthorized;
          return {
            getSession: () => ({ access_token: 'probe-token' }),
            init: () => {},
            authHeaders: (x) => Object.assign(
              { apikey: k, Authorization: 'Bearer ' + k }, x || {})
          };
        }
      };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
      /* THE BY-HAND BRANCH REALLY OPENS A COMPOSER. Left alone it would open a
         real tab at x.com on every run; stubbed, the branch is still taken and
         still reports what it did. The clipboard needs no stub: copyToClipboard
         already falls back to a hidden textarea over plain http, and either way
         the account is recorded in the .then. */
      window.__opened = [];
      window.open = function (url) {
        window.__opened.push(String(url || ''));
        return { opener: null, focus: function () {} };
      };
    }, KEY);

    const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                'access-control-expose-headers': 'content-range' };
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      let body = null;
      try { body = JSON.parse(q.postData() || 'null'); } catch (e) { body = q.postData(); }

      if (u.indexOf('/functions/v1/') !== -1) {
        /* THE ACCOUNT CHECK POSTS AT THE SAME ENDPOINT ON EVERY LOAD. Counting
           it as a post would read exactly like the room posting twice, so it is
           told apart by its own payload. */
        if (body && body.diagnose) {
          q.respond({ status: 200, contentType: 'application/json', headers: H,
                      body: '{"meta":{"ok":true},"threads":{"ok":true},"x":{"ok":true}}' });
          return;
        }
        held.push({ q: q, body: body });
        log.push('POST ' + (body && body.id) + ' ' + JSON.stringify(body && body.platforms));
        return;
      }
      if (m === 'GET' && u.indexOf('/rest/v1/socials') !== -1) {
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify(ROWS) });
        return;
      }
      if (m !== 'GET') {
        writes.push({ method: m, url: u, body: body });
        log.push(m + ' ' + (body && body.status ? body.status + ' ' : '')
                 + u.slice(u.indexOf('id=eq.') + 6).split('&')[0]);
        /* THE REPLY IS THE ROW THAT WAS PATCHED, merged with the patch, which
           is what PostgREST answers under `return=representation`. A stub
           answering with the WRONG row leaves `posts` holding two copies of one
           id and the flush's own guards then miss -- a page fault that is the
           harness's own. An empty array is what PostgREST answers when RLS
           refuses, so answering [] would exercise the failure path every run. */
        const at = u.indexOf('id=eq.');
        const which = at === -1 ? '' : decodeURIComponent(u.slice(at + 6).split('&')[0]);
        const base = ROWS.filter((r) => r.id === which)[0] || ROWS[0];
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify([Object.assign({}, base, body)]) });
        return;
      }
      q.continue();
    });

    const answerPost = (i, platform) => held[i].q.respond({
      status: 200, contentType: 'application/json', headers: H,
      body: JSON.stringify({ posted: [platform],
                             results: [{ platform: platform, ok: true,
                                         id: platform + '-' + i }] })
    });

    await p.goto('http://127.0.0.1:' + PORT + '/mc/socializer/index.html',
                 { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('is-admin');
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(
      () => document.querySelectorAll('.post .post-done').length === 5, { timeout: 30000 });

    /* ---- the cards, found by their own headlines ------------------------- */
    await p.evaluate(() => {
      window.__card = function (which) {
        return Array.prototype.slice.call(document.querySelectorAll('.post'))
          .filter(function (c) { return c.textContent.indexOf('Zed ' + which + ' the') !== -1; })[0] || null;
      };
      window.__row = function (which) {
        var c = window.__card(which);
        return c ? c.querySelector('.post-actions') : null;
      };
      /* MATCHED ON THE START OF THE LABEL, because a queued Facebook reads
         `Facebook queued` -- the word is how the button says so. Matching the
         whole label would lose the button the moment it did its job. */
      window.__acct = function (which, name) {
        var r = window.__row(which);
        if (!r) return null;
        return Array.prototype.slice.call(r.querySelectorAll('.post-platform'))
          .filter(function (b) { return b.textContent.trim().indexOf(name) === 0; })[0] || null;
      };
      window.__done = function (w) { var c = window.__card(w); return c ? c.querySelector('.post-done') : null; };
      window.__skip = function (w) { var c = window.__card(w); return c ? c.querySelector('.post-actions .btn.danger') : null; };
      /* VISIBLE BUTTONS ONLY. `All` is hidden AND disabled on a card with
         nothing to batch, which is a state of its own and not the lock. */
      window.__states = function (which) {
        var r = window.__row(which);
        if (!r) return null;
        return Array.prototype.slice.call(r.querySelectorAll('button'))
          .filter(function (b) { return b.offsetParent !== null; })
          .map(function (b) { return { t: b.textContent.trim(), off: !!b.disabled }; });
      };
    });

    const drawn = await p.evaluate(() => ['A', 'B', 'C', 'D', 'E']
      .map((w) => !!window.__card(w)));
    t('all five probe candidates draw', drawn.every(Boolean), drawn);
    if (!drawn.every(Boolean)) throw stop('the fixture did not render');

    /* ---- 1. THE LOCK, WITH THE FIRST POST HELD OPEN --------------------- */
    await p.evaluate(() => { window.__acct('A', 'Facebook').click(); });
    await p.waitForFunction(() => document.body.classList.contains('is-posting'),
                            { timeout: 15000 });
    t('the post is really in the air', held.length === 1, log);

    const under = await p.evaluate(() => ({
      a: window.__states('A'),
      b: window.__states('B'),
      c: window.__states('C'),
      aRow: !!window.__row('A').classList.contains('is-posting-row'),
      bRow: !!window.__row('B').classList.contains('is-posting-row'),
      /* MEASURED ON A DIRECT CHILD OF THE ACTION ROW, which is where the
         dimming is: opacity makes a stacking group, so it is set once on the
         row's own children and inherited visually by everything under them.
         `getComputedStyle` on an account BUTTON returns that button's own
         opacity -- 0.42 from its aria-disabled rule -- and says nothing at all
         about whether the row it sits in is dimmed. */
      aDim: getComputedStyle(window.__row('A').querySelector('.post-platforms')).opacity,
      bDim: getComputedStyle(window.__row('B').querySelector('.post-platforms')).opacity,
      aDone: getComputedStyle(window.__done('A')).opacity,
      bDone: getComputedStyle(window.__done('B')).opacity,
      bCursor: getComputedStyle(window.__acct('B', 'Threads')).cursor
    }));
    t('EVERY button on the card being posted is off',
      under.a.length > 3 && under.a.every((x) => x.off), under.a);
    t('and NO button on any other card is',
      under.b.length > 3 && under.b.every((x) => !x.off)
        && under.c.every((x) => !x.off), { b: under.b, c: under.c });
    t('the posting row is the one marked', under.aRow && !under.bRow, under);
    t('and the one dimmed, account row and all',
      under.aDim === '0.5' && under.bDim === '1'
        && under.aDone === '0.5' && under.bDone === '1',
      { aDim: under.aDim, bDim: under.bDim, aDone: under.aDone, bDone: under.bDone });
    t('a live account button still offers a pointer, not the wait cursor',
      under.bCursor === 'pointer', under);

    /* ---- 2. AN ACCOUNT PRESS ON ANOTHER CARD IS QUEUED, NOT SENT -------- */
    const beforeB = held.length;
    await p.evaluate(() => { window.__acct('B', 'Facebook').click(); });
    await wait(300);
    const qb = await p.evaluate(() => {
      var b = window.__acct('B', 'Facebook');
      return { text: b.textContent.trim(), marked: b.classList.contains('is-post-queued'),
               border: getComputedStyle(b).borderTopStyle, title: b.title };
    });
    t('nothing is sent while the first post is in the air',
      held.length === beforeB, log);
    t('the account button says it is queued', qb.text === 'Facebook queued', qb);
    t('and wears the dashes a queued Skip wears', qb.border === 'dashed', qb);
    t('and says how to take it back', /[Pp]ress again to cancel/.test(qb.title || ''), qb);

    /* PRESSING IT AGAIN TAKES IT BACK -- and the state is read on BOTH sides of
       the press in one go. Reading only the after would pass on a page where
       nothing was ever queued, which is exactly the page this check is for. */
    const toggled = await p.evaluate(() => {
      var b = window.__acct('B', 'Facebook');
      var was = b.classList.contains('is-post-queued');
      b.click();
      var now = window.__acct('B', 'Facebook');
      return { was: was, text: now.textContent.trim(),
               marked: now.classList.contains('is-post-queued') };
    });
    t('a queued account press is cancelled by pressing it again',
      toggled.was && !toggled.marked && toggled.text === 'Facebook', toggled);
    await p.evaluate(() => { window.__acct('B', 'Facebook').click(); });
    await wait(200);

    /* ---- 3. SKIP AND AN ACCOUNT PRESS CANCEL EACH OTHER ----------------- */
    /* AGAIN READ ON BOTH SIDES. "Facebook is not queued" is true of a page
       where it never could be, so `was` is what makes this an assertion about
       cancelling rather than about nothing having happened. */
    await p.evaluate(() => { window.__acct('C', 'Facebook').click(); });
    await wait(200);
    const cState = await p.evaluate(() => {
      var was = window.__acct('C', 'Facebook').classList.contains('is-post-queued');
      window.__skip('C').click();
      return { was: was,
               fb: window.__acct('C', 'Facebook').textContent.trim(),
               queued: window.__acct('C', 'Facebook').classList.contains('is-post-queued'),
               skip: window.__skip('C').textContent.trim() };
    });
    t('a Skip cancels the account press queued on the same card',
      cState.was && cState.fb === 'Facebook' && !cState.queued
        && cState.skip === 'Skip queued', cState);

    await p.evaluate(() => { window.__skip('D').click(); });
    await wait(200);
    await p.evaluate(() => { window.__acct('D', 'Facebook').click(); });
    await wait(300);
    const dState = await p.evaluate(() => ({
      fb: window.__acct('D', 'Facebook').textContent.trim(),
      skip: window.__skip('D').textContent.trim()
    }));
    t('and an account press cancels the Skip, the same rule from the other side',
      dState.fb === 'Facebook queued' && dState.skip === 'Skip', dState);

    /* ---- 4. A BY-HAND ACCOUNT RUNS NOW AND CANNOT QUEUE ----------------- */
    const beforeE = held.length;
    await p.evaluate(() => { window.__acct('E', 'X').click(); });
    await wait(500);
    const eState = await p.evaluate(() => {
      var x = window.__acct('E', 'X');
      return { text: x.textContent.trim(),
               queued: x.classList.contains('is-post-queued'),
               used: x.classList.contains('is-used'),
               opened: window.__opened.slice(),
               skipOff: window.__skip('E').getAttribute('aria-disabled') };
    });
    /* THE PRESS RAN, AND THAT IS ASSERTED FIRST. "Not queued" is true of a dead
       button too, so it is only worth anything beside proof that the press did
       something -- which on this path is the composer opening. */
    t('a by-hand account runs there and then, even under the lock',
      eState.opened.length === 1 && eState.used, eState);
    t('and is NOT queued: a replayed press has no clipboard and no popup',
      eState.opened.length === 1 && !eState.queued && eState.text === 'X', eState);
    t('it reaches no account through us', held.length === beforeE, log);
    t('and the rest of the row is told, so Skip stops being offered',
      eState.used && eState.skipOff === 'true', eState);

    /* ---- 5. THE QUEUE GOES DOWN THE LINE -------------------------------- */
    const beforeFlush = writes.length;
    answerPost(0, 'facebook');

    /* B's queued post is the next thing to leave the page. WAITED ON THE
       CONDITION, never on a clock: the flush runs on its own schedule and a
       fixed sleep is a check that passes four runs in five. */
    const gotB = await (async () => {
      for (let i = 0; i < 120 && held.length < 2; i += 1) await wait(100);
      return held.length >= 2;
    })();
    if (!gotB) {
      t('the queued post goes out when the first one answers', false, log);
      throw stop('the queue did not post the account press queued on card B');
    }
    t('the queued post goes out when the first one answers',
      held[1].body && held[1].body.id === 'zed-b', held[1] && held[1].body);
    t('and it names the account that was pressed',
      String(JSON.stringify(held[1].body.platforms)).indexOf('facebook') !== -1,
      held[1].body);
    t('nothing was written before it', writes.length === beforeFlush,
      writes.slice(beforeFlush));

    /* AND THE CARD IT IS POSTING IS THE ONE THAT GOES DEAD, which is the whole
       reason the queue re-locks rather than posting in the open. */
    const mid = await p.evaluate(() => ({
      posting: document.body.classList.contains('is-posting'),
      bRow: window.__row('B') && window.__row('B').classList.contains('is-posting-row'),
      b: window.__states('B'),
      d: window.__states('D')
    }));
    t('the card the queue is posting goes dead', mid.posting && mid.bRow
      && mid.b.every((x) => x.off), mid);
    t('and every other card is still live', mid.d.every((x) => !x.off), mid.d);

    answerPost(1, 'facebook');

    /* D's post is the last thing in the line, after C's skip. */
    const gotD = await (async () => {
      for (let i = 0; i < 120 && held.length < 3; i += 1) await wait(100);
      return held.length >= 3;
    })();
    if (!gotD) {
      t('and then goes on down the line', false, log);
      throw stop('the queue stopped after the first item');
    }
    t('and then goes on down the line', held[2].body.id === 'zed-d', held[2].body);
    answerPost(2, 'facebook');
    await p.waitForFunction(() => !document.body.classList.contains('is-posting'),
                            { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 60 && !/skipped zed-c/.test(log.join('|')); i += 1) await wait(100);

    /* ---- 6. THE ORDER IS THE ORDER THEY WERE PRESSED -------------------- */
    const line = log.filter((l) => /zed-[bcd]/.test(l));
    t('C is skipped, not merely dropped',
      line.some((l) => l.indexOf('PATCH skipped zed-c') === 0), log);
    t('B posts before C is skipped, and C before D posts',
      line.length === 3
        && line[0].indexOf('POST zed-b') === 0
        && line[1].indexOf('PATCH skipped zed-c') === 0
        && line[2].indexOf('POST zed-d') === 0, line);
    t('nothing was written for the cards that only posted',
      writes.filter((w) => /zed-b|zed-d/.test(w.url)).length === 0,
      writes.map((w) => w.url.slice(w.url.indexOf('id=eq.'))));

    /* THE PAGE COMES BACK. The tabs and the sort are held for the whole flush,
       not only while a post is in the air, and this is the one place they are
       switched on again -- without it the room would stay held after the queue
       had emptied, which reads exactly like a post that never answered. */
    const rested = await p.evaluate(() => ({
      posting: document.body.classList.contains('is-posting'),
      tabs: Array.prototype.slice.call(document.querySelectorAll('.queue-tabs button'))
        .map((b) => !!b.disabled),
      marked: !!document.querySelector('.post-actions.is-posting-row')
    }));
    t('the page is live again when the queue has emptied',
      !rested.posting && !rested.marked && rested.tabs.every((v) => !v), rested);

    t('no page errors', errs.length === 0, errs);
  } catch (e) {
    if (!e || !e.__stop) throw e;
    console.log(NL + '  -- stopped: ' + e.message
      + NL + '     nothing below this point could be exercised.');
  } finally {
    await br.close();
    srv.close();
  }
  console.log(NL + '  ' + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
