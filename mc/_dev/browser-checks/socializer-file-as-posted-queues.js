/* FILE AS POSTED STAYS LIVE UNDER THE POSTING LOCK, AND SKIP STOPS BEING
   OFFERED ONCE A STORY HAS GONE OUT (2026-09-09).

   ASKED FOR AS: keep the file as posted button live always and have it queue if
   posting is happening, see skip button functionality; and make skip not
   available if any posts have been done.

   THE CLAIM IS ABOUT A MOMENT, so it is driven at that moment: an account
   button is really pressed, the Edge Function's reply is HELD OPEN, and the
   other card is worked while the lock is on. Reading the source would say the
   handler branches; only holding the request says the branch is reached.

   FIVE THINGS, AND THE FIRST TWO ARE OPPOSITE HALVES OF ONE RULE:
     on the card being posted   FILE AS POSTED is locked (its own accounts are
                                about to change what the receipt should say)
     on every other card        it is live, and the press is QUEUED

   THE LOCK BECAME ONE CARD WIDE ON THE SAME DAY, an hour after this was
   written, so the exemption these two buttons carried is gone: every button on
   every card but the one posting is live now, and each of them queues. That
   half is socializer-queue-goes-down-the-line.js. What is still this check's
   own is the FILING -- what it writes, when, and what it refuses to write over.
     pressing a queued filing   takes it back
     the lock lifting           writes the receipt that was queued
     an account having gone out SKIP is no longer offered, and says why

   THE READS ARE STUBBED HERE, unlike this room's other checks. The claim is
   about two cards in known states -- one posting, one not -- and the live queue
   is whatever the bot filed this morning.

   Run: node mc/_dev/browser-checks/socializer-file-as-posted-queues.js       */
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
const PORT = 9483;
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

/* TWO CANDIDATES, BOTH POSTABLE. `platforms` is null on purpose: no advice
   means no narrowing, which is this room's own rule and is the state every
   hand-added row is in. An image is what keeps Instagram out of the by-hand
   fallback, so the account row reads the same on both. */
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
const ROWS = [row('zed-a', 'Zed A the posting one'), row('zed-b', 'Zed B the filed one')];

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
    await p.setViewport({ width: 1500, height: 1200 });
    const errs = [], writes = [];
    let held = null;                     // the post request, kept open
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
        /* THE ACCOUNT CHECK POSTS AT THE SAME ENDPOINT ON EVERY LOAD.
           Counting it as a post would read exactly like the room posting
           twice, so it is told apart by its own payload. */
        if (body && body.diagnose) {
          q.respond({ status: 200, contentType: 'application/json', headers: H,
                      body: '{"meta":{"ok":true},"threads":{"ok":true},"x":{"ok":true}}' });
          return;
        }
        /* HELD OPEN. This is the whole harness: the lock stays on until the
           probe answers, which is the moment every assertion below is about. */
        held = q;
        return;
      }
      if (m === 'GET' && u.indexOf('/rest/v1/socials') !== -1) {
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify(ROWS) });
        return;
      }
      if (m !== 'GET') {
        writes.push({ method: m, url: u, body: body });
        /* THE REPLY IS THE ROW THAT WAS PATCHED, merged with the patch, which
           is what PostgREST answers under `return=representation`.
             THIS IS NOT TIDINESS. savePost writes the reply back into `posts`,
           and the deferred-skip flush then asks that array whether the row has
           since been filed as posted. A stub answering with the WRONG row
           leaves the array holding two copies of one id, the guard misses, and
           the skip writes over a receipt -- a page fault that is the harness's
           own. It cost one on the first run of this very assertion.
             AND AN EMPTY ARRAY IS WHAT POSTGREST ANSWERS WHEN RLS REFUSES, so
           a stub answering [] would exercise the failure path on every run. */
        const at = u.indexOf('id=eq.');
        const which = at === -1 ? '' : decodeURIComponent(u.slice(at + 6).split('&')[0]);
        const base = ROWS.filter((r) => r.id === which)[0] || ROWS[0];
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify([Object.assign({}, base, body)]) });
        return;
      }
      q.continue();
    });

    await p.goto('http://127.0.0.1:' + PORT + '/mc/socializer/index.html',
                 { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('is-admin');
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(
      () => document.querySelectorAll('.post .post-done').length === 2, { timeout: 30000 });

    /* ---- the two cards, found by their own headlines ---------------------- */
    await p.evaluate(() => {
      window.__card = function (which) {
        var cards = Array.prototype.slice.call(document.querySelectorAll('.post'));
        return cards.filter(function (c) {
          return c.textContent.indexOf('Zed ' + which + ' the') !== -1;
        })[0] || null;
      };
      window.__btn = function (which, text) {
        var c = window.__card(which);
        if (!c) return null;
        return Array.prototype.slice.call(c.querySelectorAll('.post-actions button'))
          .filter(function (b) { return b.textContent.trim() === text; })[0] || null;
      };
      window.__done = function (which) {
        var c = window.__card(which);
        return c ? c.querySelector('.post-done') : null;
      };
      window.__skip = function (which) {
        var c = window.__card(which);
        return c ? c.querySelector('.post-actions .btn.danger') : null;
      };
      window.__note = function (which) {
        var c = window.__card(which);
        var el = c ? c.querySelector('.post-feedback') : null;
        return el ? el.textContent.trim() : '';
      };
    });

    const both = await p.evaluate(() => ({
      a: !!window.__card('A'), b: !!window.__card('B'),
      /* NO EXEMPTION SINCE 2026-09-09, and its absence is asserted rather than
         left to be noticed. The lock is ONE CARD WIDE now -- every button on
         every card but the one being posted is live -- so a flag saying "leave
         this one alone" describes a rule that no longer exists, and a dead hook
         is what makes somebody re-point at the wrong thing. The live half of
         that rule is socializer-queue-goes-down-the-line.js. */
      exemptDone: window.__done('B') && !window.__done('B').dataset.lockExempt,
      exemptSkip: window.__skip('B') && !window.__skip('B').dataset.lockExempt,
      fb: !!window.__btn('A', 'Facebook')
    }));
    t('both probe candidates draw', both.a && both.b, both);
    t('FILE AS POSTED needs no lock exemption, and carries none', both.exemptDone, both);
    t('and neither does Skip, for the same reason', both.exemptSkip, both);
    t('card A offers Facebook to press', both.fb, both);
    /* THE OTHER HALF OF THE SKIP RULE, and it is asserted HERE rather than at
       the end because here is the only point in the run where a candidate that
       has gone nowhere is still in Review. Left to the end it read
       `any > 0 || total === 1`, which passes on the fixed page for the wrong
       reason and on the broken one too -- an assertion that cannot fail. */
    const skipsAtRest = await p.evaluate(() => Array.prototype.slice
      .call(document.querySelectorAll('.post .post-actions .btn.danger'))
      .map((b) => b.getAttribute('aria-disabled')));
    t('a candidate that has gone nowhere may be skipped',
      skipsAtRest.length === 2 && skipsAtRest.every((v) => v === null), skipsAtRest);

    /* ---- 1. THE LOCK, WITH THE POST HELD OPEN ---------------------------- */
    await p.evaluate(() => { window.__btn('A', 'Facebook').click(); });
    await p.waitForFunction(() => document.body.classList.contains('is-posting'),
                            { timeout: 15000 });
    t('the post is really in the air', !!held);

    const under = await p.evaluate(() => ({
      /* THE CARD BEING POSTED IS THE EXCEPTION. Its own accounts are about to
         change what the receipt should say, so filing it now would record one
         that is missing the account currently going out. */
      aDone: window.__done('A').disabled,
      aSkip: window.__skip('A').disabled,
      bDone: window.__done('B').disabled,
      bSkip: window.__skip('B').disabled,
      bText: window.__done('B').textContent.trim(),
      /* Live means live: the page's cursor says wait and a control that is
         genuinely still pressable must not. */
      bCursor: getComputedStyle(window.__done('B')).cursor,
      bOpacity: getComputedStyle(window.__done('B')).opacity
    }));
    t('FILE AS POSTED is locked on the card being posted', under.aDone, under);
    t('and so is that card own Skip', under.aSkip, under);
    t('FILE AS POSTED is LIVE on every other card', !under.bDone, under);
    t('and so is Skip, as it always was', !under.bSkip, under);
    t('the live button is not dimmed with the rest of the row',
      under.bOpacity === '1', under);
    t('and offers a pointer rather than the page wait cursor',
      under.bCursor === 'pointer', under);

    /* ---- 2. THE PRESS IS QUEUED, NOT WRITTEN ---------------------------- */
    /* NO ACCOUNT WAS PRESSED ON B, so filing it is a CLAIM about something
       posted elsewhere and the room asks. Answering is part of the gesture. */
    const answer = async (label) => {
      try {
        await p.waitForFunction(
          () => { var y = document.getElementById('confirmYes');
                  return y && y.offsetParent !== null; }, { timeout: 8000 });
      } catch (e) {
        t(label, false, 'the confirm never opened, so the press did nothing');
        throw stop('FILE AS POSTED is dead under the lock on this page');
      }
      ok++;
      console.log('  ok   ' + label);
      await p.evaluate(() => { document.getElementById('confirmYes').click(); });
      await wait(400);
    };

    const before = writes.length;
    await p.evaluate(() => { window.__done('B').click(); });
    await answer('the press reaches the room and it asks before claiming');

    const queued = await p.evaluate(() => {
      var b = window.__done('B');
      return {
        text: b.textContent.trim(),
        marked: b.classList.contains('is-done-queued'),
        border: getComputedStyle(b).borderTopStyle,
        moved: !!window.__card('B')
      };
    });
    t('nothing is written while the post is in the air',
      writes.length === before, writes.slice(before));
    t('the button says the filing is queued', queued.text === 'FILING QUEUED', queued);
    t('and wears the dashes a queued Skip wears', queued.border === 'dashed', queued);
    t('the card stays where it is', queued.moved, queued);

    /* ---- 3. PRESSING IT AGAIN TAKES IT BACK ----------------------------- */
    await p.evaluate(() => { window.__done('B').click(); });
    await wait(300);
    const undone = await p.evaluate(() => ({
      text: window.__done('B').textContent.trim(),
      marked: window.__done('B').classList.contains('is-done-queued'),
      asked: !!(document.getElementById('confirmYes')
        && document.getElementById('confirmYes').offsetParent !== null)
    }));
    t('a queued filing is cancelled by pressing it again',
      undone.text === 'FILE AS POSTED' && !undone.marked, undone);
    t('and cancelling asks nothing', !undone.asked, undone);
    t('still nothing written', writes.length === before, writes.slice(before));

    /* queue it again, and this time let the post land underneath it */
    await p.evaluate(() => { window.__done('B').click(); });
    await answer('it asks again on the second press');
    t('queued a second time', await p.evaluate(
      () => window.__done('B').textContent.trim() === 'FILING QUEUED'));

    /* AND A SKIP QUEUED ON THE SAME CARD. This is the whole reason the unlock
       runs the two queues in order rather than together: POSTED beats SKIPPED,
       savePost writes the row back into `posts`, and the skip flush then finds
       it posted and leaves the receipt alone. Run together they would race and
       the last writer would win by accident. */
    await p.evaluate(() => { window.__skip('B').click(); });
    await wait(300);
    t('a skip can be queued on the same card', await p.evaluate(
      () => window.__skip('B').textContent.trim() === 'Skip queued'));

    /* ---- 4. THE LOCK LIFTS AND THE RECEIPT IS WRITTEN ------------------- */
    held.respond({
      status: 200, contentType: 'application/json', headers: H,
      body: JSON.stringify({ posted: ['facebook'],
                             results: [{ platform: 'facebook', ok: true, id: 'fb-1' }] })
    });
    await p.waitForFunction(() => !document.body.classList.contains('is-posting'),
                            { timeout: 20000 });
    await wait(1200);

    const filed = writes.filter((w) => w.method === 'PATCH'
      && w.url.indexOf('id=eq.zed-b') !== -1);
    t('the queued filing is written when the post answers', filed.length === 1,
      writes.map((w) => w.method + ' ' + w.url.slice(w.url.indexOf('/rest/'))));
    t('and it files it as posted',
      !!filed[0] && filed[0].body && filed[0].body.status === 'posted',
      filed[0] && filed[0].body);
    /* posted_platforms IS A RECEIPT AND STAYS ONE. Nothing went out through
       this room for B, so an EMPTY list is the honest record -- it must never
       be filled in with the accounts the bot suggested. */
    t('with no account named, because none was pressed',
      !!filed[0] && Array.isArray(filed[0].body.posted_platforms)
        && filed[0].body.posted_platforms.length === 0,
      filed[0] && filed[0].body.posted_platforms);
    t('and no posted_ids at all, rather than an empty object',
      !!filed[0] && !('posted_ids' in filed[0].body),
      filed[0] && Object.keys(filed[0].body));
    const skippedB = writes.filter((w) => w.method === 'PATCH'
      && w.url.indexOf('id=eq.zed-b') !== -1
      && w.body && w.body.status === 'skipped');
    t('and the skip queued beside it does not write over that receipt',
      skippedB.length === 0, skippedB);

    /* ---- 5. SKIP IS NOT OFFERED ONCE THE STORY HAS GONE OUT ------------- */
    await p.waitForFunction(
      () => { var c = Array.prototype.slice.call(document.querySelectorAll('.post'))
                .filter(function (x) { return x.textContent.indexOf('Zed A the') !== -1; })[0];
              var s = c && c.querySelector('.post-actions .btn.danger');
              return !!s && s.getAttribute('aria-disabled') === 'true'; },
      { timeout: 15000 }).catch(() => {});
    const after = await p.evaluate(() => {
      var s = window.__skip('A');
      return {
        there: !!s,
        off: s && s.getAttribute('aria-disabled') === 'true',
        /* NEVER `disabled`, or a press dispatches no click at all and the
           reason is unreachable on a touch screen. */
        notDisabled: s && !s.disabled,
        went: s && String(s.dataset.wentOutTo || ''),
        title: s && s.title
      };
    });
    t('Skip is off once an account has taken the story', after.there && after.off, after);
    t('and it is aria-disabled rather than disabled', after.notDisabled, after);
    t('the button knows which account it went to',
      after.went === 'Facebook', after);
    t('and its tooltip names it', /Facebook/.test(after.title || ''), after);

    const wasWrites = writes.length;
    await p.evaluate(() => { window.__skip('A').click(); });
    await wait(500);
    const said = await p.evaluate(() => window.__note('A'));
    t('a press on the off Skip writes nothing',
      writes.length === wasWrites, writes.slice(wasWrites));
    t('and answers rather than doing nothing',
      /already went out/i.test(said) && /FILE AS POSTED/.test(said), said);

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
