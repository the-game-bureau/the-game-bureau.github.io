/* THE RIGHT HALF PLAYS THE CHALLENGE, IT DOES NOT LIST IT.
   Reads go to the LIVE tables; every write is intercepted -- a rehearsal must
   never reach `game_responses` or `stops`. */
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
  await new Promise((r) => srv.listen(9260, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        /* NO SESSION, so `authHeaders` falls back to the publishable key.
             A stub token of 'p' is not a JWT and Supabase answers
             `Expected 3 parts in JWT; got 1` -- which reads as the page
             failing to load. */
          return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      /* THE STREET VIEW FRAME IS BLOCKED. It is a third-party request per open
         and this check opens several. */
      if (/google\.com\/maps/.test(u)) { q.respond({ status: 200, contentType: 'text/html', body: '' }); return; }
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET') { q.continue(); return; }
      writes.push({ m: m, u: u.slice(-40) });
      q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
    });

    await p.goto('http://127.0.0.1:9260/mc/stop-builder/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    /* A BARE IDENTIFIER, NEVER `window.state`. `state` is a top-level `const` in
       a classic script, which does not create a window property -- the first cut
       waited on `window.state` and timed out on a page that had loaded fine. */
    await p.waitForFunction(
      () => typeof state !== 'undefined' && state.loaded && state.rows.length > 0,
      { timeout: 60000 });

    const shapes = await p.evaluate(() => {
      const has = (pred) => (state.rows.filter((r) => {
        if (r.challenge_id == null) return false;
        const c = state.challenges.filter((x) => x.id === r.challenge_id)[0];
        return c && pred(c);
      })[0] || null);
      /* A SHAPE PRODUCTION HAS STOPPED CARRYING IS MADE UP RATHER THAN SKIPPED.
         **The `judged` branch silently stopped running when the catalogue
         changed** -- the suite reported `19 ok, 0 FAIL` where it had been 21,
         which reads as a clean run and is two assertions that are no longer
         testing anything. A branch guarded on the table being in one shape is
         coverage that rots the day somebody edits a row.
           The same treatment the RANDOM and {{waypoint}} branches below already
         had; this only extends it to the three answer shapes. */
      /* WELL CLEAR OF THE PROBE BELOW, which pushes its own challenge as `-1`.
         Starting at -1 here made `chalById(-1)` find MINE instead, and three
         assertions about variable filling failed on a page that is correct --
         **two probes in one suite colliding on an id**. */
      let fake = -9000;
      const wpid = (state.rows.filter((r) => r.waypoint_id != null)[0] || {}).waypoint_id;
      const madeUp = (fields) => {
        fake -= 1;
        state.challenges.push(Object.assign(
          { id: fake, name: 'Probe ' + (-fake), type: 'type_answer',
            prompt: 'A probe question.', answer: null, choices: null, tags: [] },
          fields));
        return { stop_id: fake, waypoint_id: wpid, challenge_id: fake,
                 challenge_tags: null, challenge_tags_match: 'all' };
      };
      return {
        choices: has((c) => Array.isArray(c.choices) && c.choices.length > 1)
          || madeUp({ type: 'multiple_choice', ladder_key: 'x', answer: 'Right',
                      choices: ['Right', 'Wrong', 'Also wrong', 'Wrong too'] }),
        typed: has((c) => (!c.choices || !c.choices.length) && String(c.answer || '').trim())
          || madeUp({ answer: 'Chicago' }),
        /* NO ANSWER AT ALL: judged by the team, which is what a photo and a
           minigame are, and what a typed challenge may now be since
           `any_answer` merged into `type_answer` on 2026090317. */
        judged: has((c) => (!c.choices || !c.choices.length) && !String(c.answer || '').trim())
          || madeUp({ type: 'photo', answer: null }),
        random:  (state.rows.filter((r) => r.challenge_id == null)[0] || null),
        stops: state.rows.length, challenges: state.challenges.length
      };
    });
    console.log('   ' + shapes.stops + ' stops, ' + shapes.challenges + ' challenges');
    console.log('   shapes on file: choices=' + !!shapes.choices + ' typed=' + !!shapes.typed
      + ' judged=' + !!shapes.judged + ' random=' + !!shapes.random);
    console.log('');

    const play = async (row) => {
      await p.evaluate((r) => { openStop(r); }, row);
      await new Promise((r) => setTimeout(r, 400));
      return p.evaluate(() => {
        const right = document.getElementById('svChallenge');
        return {
          text: (right.innerText || '').trim(),
          choices: [...right.querySelectorAll('.sv-choice')].map((b) => b.textContent),
          box: !!right.querySelector('.sv-answerbox'),
          verdict: (right.querySelector('.sv-verdict') || {}).textContent || '',
          labels: [...right.querySelectorAll('.sv-label')].map((l) => l.textContent),
          foot: (right.querySelector('.sv-playfoot') || {}).textContent || '',
          unknownVars: right.querySelectorAll('.sv-var.is-unknown').length,
          filledVars: [...right.querySelectorAll('.sv-var:not(.is-unknown)')].map((v) => v.textContent)
        };
      });
    };

    /* ---- MULTIPLE CHOICE ------------------------------------------- */
    if (shapes.choices) {
      const v = await play(shapes.choices);
      t('a challenge with choices draws buttons', v.choices.length > 1, v.choices);
      t('and does not show the answer up front',
        v.labels.indexOf('Answer') === -1, v.labels);
      const orderBefore = v.choices.join('|');
      const after = await p.evaluate(() => {
        const right = document.getElementById('svChallenge');
        const wrong = [...right.querySelectorAll('.sv-choice')]
          .filter((b) => b.textContent.trim().toLowerCase() !== String(state.play.challenge.answer || '').trim().toLowerCase())[0];
        wrong.click();
        return { verdict: (right.querySelector('.sv-verdict') || {}).textContent || '',
                 right: right.querySelectorAll('.sv-choice.is-right').length,
                 wrong: right.querySelectorAll('.sv-choice.is-wrong').length,
                 labels: [...right.querySelectorAll('.sv-label')].map((l) => l.textContent),
                 locked: [...right.querySelectorAll('.sv-choice')].every((b) => b.disabled) };
      });
      t('pressing a wrong one says so', /wrong/i.test(after.verdict), after.verdict);
      /* THE RIGHT ONE IS ALWAYS MARKED, or a wrong answer tells you only that
         you were wrong. */
      t('and marks the right one anyway', after.right === 1 && after.wrong === 1, after);
      t('the answer is revealed only after it is met', after.labels.indexOf('Answer') !== -1, after.labels);
      t('and the buttons lock', after.locked);

      /* SHUFFLED PER OPEN, NOT PER PAINT: judging must not rearrange the
         buttons under the pointer at the moment somebody reads which they got
         wrong. */
      const stable = await p.evaluate(() =>
        [...document.querySelectorAll('#svChallenge .sv-choice')].map((b) => b.textContent).join('|'));
      t('and judging does not reorder them',
        stable === orderBefore, { was: orderBefore, now: stable });
    }

    /* ---- TYPED ------------------------------------------------------ */
    if (shapes.typed) {
      const v = await play(shapes.typed);
      t('a challenge with an answer and no choices draws a box', v.box && !v.choices.length, v);
      t('and hides the answer until it is met', v.labels.indexOf('Answer') === -1, v.labels);
      const right = await p.evaluate(() => {
        const box = document.querySelector('#svChallenge .sv-answerbox');
        /* CASE AND SURROUNDING SPACE ARE THE ONLY THINGS FORGIVEN. */
        box.value = '  ' + String(state.play.challenge.answer).toUpperCase() + '  ';
        [...document.querySelectorAll('#svChallenge button')].filter((b) => /check/i.test(b.textContent))[0].click();
        const r = document.getElementById('svChallenge');
        return { verdict: (r.querySelector('.sv-verdict') || {}).textContent || '',
                 labels: [...r.querySelectorAll('.sv-label')].map((l) => l.textContent) };
      });
      t('the right answer in the wrong case still counts', /right/i.test(right.verdict), right.verdict);
      t('and the answer is shown afterwards', right.labels.indexOf('Answer') !== -1, right.labels);
    }

    /* ---- JUDGED BY THE TEAM ----------------------------------------- */
    if (shapes.judged) {
      const v = await play(shapes.judged);
      t('a challenge with no stored answer offers no box to check against',
        !v.box && !v.choices.length, v);
      t('and says a person judges it', /judged by the team/i.test(v.text), v.text.slice(0, 90));
    }

    /* ---- THE TWO BRANCHES PRODUCTION DOES NOT CARRY -----------------
       No stop on file is RANDOM and none carries a {{waypoint}} prompt, so
       both are driven with rows made up here. A check that waited for the
       table to grow the right shape is a check that rots. */
    const made = await p.evaluate(() => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      const w = state.waypoints.filter((x) => x.wpid === row.waypoint_id)[0];
      /* A prompt with one variable the STOP knows, one the worked example
         knows, and one that exists nowhere. */
      state.challenges.push({ id: -1, name: 'Probe', type: 'type_answer', scope: 'portable',
        prompt: 'Stand outside {{waypoint}} in {{venue_city}} and shout for the {{nope}}.',
        answer: '', choices: null });
      openStop({ waypoint_id: row.waypoint_id, challenge_id: -1, stop_id: -1 });
      const right = document.getElementById('svChallenge');
      const filled = [...right.querySelectorAll('.sv-var:not(.is-unknown)')].map((v) => v.textContent);
      const unknown = [...right.querySelectorAll('.sv-var.is-unknown')].map((v) => v.textContent);
      /* THE CITY IS THE WAYPOINT'S. `row.city` was the expectation until
         2026090302 dropped that column; reading it now is `undefined`, which
         is the check demanding a shape the table no longer has. */
      const out = { filled: filled, unknown: unknown, want: w ? String(w.name) : '',
                    city: w ? [w.city, w.state].filter(Boolean).join(', ') : '' };
      /* and a RANDOM stop */
      openStop({ waypoint_id: row.waypoint_id, challenge_id: null, stop_id: -2 });
      out.randomText = (document.getElementById('svChallenge').innerText || '').trim();
      out.randomControls = document.querySelectorAll('#svChallenge .sv-choice, #svChallenge .sv-answerbox').length;
      out.randomDraw = [...document.querySelectorAll('#svChallenge button')]
        .filter((b) => /draw/i.test(b.textContent)).length;
      state.challenges = state.challenges.filter((c) => c.id !== -1);
      return out;
    });
    t('the stop fills {{waypoint}} with its own waypoint',
      made.filled.indexOf(made.want) !== -1, made);
    t("and {{venue_city}} with its WAYPOINT's city",
      made.filled.indexOf(made.city) !== -1, made);
    /* AN UNKNOWN VARIABLE IS LEFT UNFILLED AND MARKED, which is exactly what a
       team would see. Showing it resolved would hide the fault. */
    t('a variable that exists nowhere is left in its braces and marked',
      made.unknown.length === 1 && made.unknown[0].indexOf('nope') !== -1, made.unknown);
    /* A RANDOM STOP IS REHEARSABLE NOW, which reverses what this asserted.
       Until 2026090309 it could only say there was nothing to play; it offers a
       Draw that goes through `tgb_pick_challenge` -- the same function play time
       will call -- so the rehearsal cannot drift from the real rule. It still
       draws no answer control until something has been drawn. */
    t('a RANDOM stop offers a draw rather than an answer control',
      made.randomDraw === 1 && made.randomControls === 0,
      { draw: made.randomDraw, controls: made.randomControls });
    t('and says the draw never repeats one already taken',
      /never repeats|no repeat/i.test(made.randomText), made.randomText.slice(0, 120));

    /* READ ON AN ACTUAL REHEARSAL. A RANDOM stop has nothing to rehearse and
       so has no footer, which is right -- an earlier draft read it after the
       random open and failed on correct behaviour. */
    const last = await p.evaluate((r) => {
      openStop(r);
      return (document.querySelector('#svChallenge .sv-playfoot') || {}).textContent || '';
    }, shapes.choices || shapes.typed || shapes.judged);
    t('every rehearsal says nothing is recorded', /nothing is recorded/i.test(last), last);
    t('and nothing was written', writes.length === 0, writes);
    t('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
