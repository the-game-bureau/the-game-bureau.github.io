/* THE ISSUES CHECK FINDS DUPLICATES (2026-09-03).

   Two challenges that ask the same question are one challenge, and this room
   had no way to say so. **13 pairs were on file within an hour of the NFL
   prompt shipping** -- 26 of 104 rows -- because the prompt was run twice and
   its already-covered list is built when the prompt is BUILT, so a second run
   from the same page cannot know what the first one filed.

   IT CANNOT BE A `CHECK_RULES` ENTRY: every rule there tests ONE row, and
   being a duplicate is a fact about a PAIR.

   THE PAIRS ARE DRIVEN, NOT WAITED FOR. Production holds real duplicates today
   and the check asserts that too, but the rules -- what counts as a match, that
   only the second row is flagged, that punctuation is forgiven -- are exercised
   on rows made up here, so this cannot rot the day somebody cleans the table.

   Reads go to the LIVE database and every write is intercepted. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(9444, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {},
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
      if (m !== 'GET') { writes.push(m);
        q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9444/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    const wired = await p.evaluate(() => typeof refreshDupes === 'function');
    if (!wired) {
      t('the room has a duplicate check at all', false, 'no refreshDupes in the page');
      console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close();
      process.exit(1);
    }

    /* ---- THE RULES, ON ROWS MADE UP HERE -------------------------------- */
    const driven = await p.evaluate(() => {
      const keep = state.rows.slice();
      state.rows = [
        { id: 10, name: 'Alpha',  prompt: 'Who threw it?',   type: 'question', tags: [] },
        { id: 11, name: 'Beta',   prompt: 'who threw  it!!', type: 'question', tags: [] },
        { id: 12, name: 'Alpha',  prompt: 'Something else.', type: 'question', tags: [] },
        { id: 13, name: 'Gamma',  prompt: 'A third thing.',  type: 'question', tags: [] },
        { id: 14, name: '',       prompt: '',                type: 'question', tags: [] },
        { id: 15, name: '',       prompt: '',                type: 'question', tags: [] }
      ];
      refreshDupes();
      const say = {};
      state.rows.forEach((c) => { say[c.id] = reviewReasons(c); });
      const flagged = state.rows.filter((c) => isInReview(c)).map((c) => c.id);
      state.rows = keep;
      refreshDupes();
      return { say: say, flagged: flagged };
    });

    /* PUNCTUATION, CASE AND SPACING ARE ALL FORGIVEN, which is what two AI runs
       of one prompt actually differ by. */
    t('the same question typed differently is one question',
      driven.say[11].some((m) => /same question as challenge 10/.test(m)), driven.say[11]);
    /* ONLY THE SECOND ROW CARRIES IT, or one fact is in the room twice. */
    t('and only the second row of a pair is flagged',
      !driven.say[10].some((m) => /same question/.test(m)), driven.say[10]);
    t('and the message names the twin so the pair is reachable',
      driven.say[11].join(' ').indexOf('10') !== -1, driven.say[11]);

    /* THE NAME IS A SEPARATE MISTAKE: two different questions under one name is
       a list you cannot read, and it is not the same fault as a real duplicate. */
    t('the same name on two different questions is its own finding',
      driven.say[12].some((m) => /same name as challenge 10/.test(m)), driven.say[12]);
    t('and it says to rename rather than to delete',
      driven.say[12].some((m) => /Rename one/.test(m)), driven.say[12]);

    t('a row that is neither is left alone', driven.say[13].length === 0, driven.say[13]);
    /* A BLANK IS NOT A DUPLICATE OF ANOTHER BLANK. Two unwritten rows are two
       rows to write, and `no-prompt` already reports each of them. */
    t('two blank rows are not called duplicates of each other',
      !driven.say[15].some((m) => /same question|same name/.test(m)), driven.say[15]);

    /* THE FINDING PUTS THE ROW IN REVIEW, which is what makes Check find it. */
    t('a duplicate is in review',
      driven.flagged.indexOf(11) !== -1 && driven.flagged.indexOf(13) === -1, driven.flagged);

    /* THE ROW ORDER MUST NOT DECIDE WHICH OF A PAIR IS FLAGGED. Sorting the
       list changes the order `state.rows` is walked in; the map keys on the id
       so the finding stays put. */
    const stable = await p.evaluate(() => {
      const keep = state.rows.slice();
      state.rows = [
        { id: 21, name: 'B', prompt: 'Same question.', type: 'question', tags: [] },
        { id: 20, name: 'A', prompt: 'Same question.', type: 'question', tags: [] }
      ];
      refreshDupes();
      const first = reviewReasons(state.rows[1]).length === 0
                    && reviewReasons(state.rows[0]).length > 0;
      state.rows.reverse();
      refreshDupes();
      const second = reviewReasons(state.rows.filter((c) => c.id === 20)[0]).length === 0
                     && reviewReasons(state.rows.filter((c) => c.id === 21)[0]).length > 0;
      state.rows = keep;
      refreshDupes();
      return { first: first, second: second };
    });
    t('the lower id is the original whichever order the rows arrive in',
      stable.first && stable.second, stable);

    /* ---- AND THE LIVE TABLE -------------------------------------------- */
    const live = await p.evaluate(() => {
      const norm = (v) => String(v == null ? '' : v).toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ').trim();
      const byPrompt = {};
      state.rows.forEach((c) => {
        const k = norm(c.prompt);
        if (!k) return;
        byPrompt[k] = (byPrompt[k] || 0) + 1;
      });
      const dupePairs = Object.keys(byPrompt).filter((k) => byPrompt[k] > 1).length;
      const flagged = state.rows.filter((c) =>
        reviewReasons(c).some((m) => /same question as challenge/.test(m))).length;
      return { rows: state.rows.length, dupePairs: dupePairs, flagged: flagged };
    });
    t('the room holds the live catalogue', live.rows > 40, live.rows);
    /* ONE FINDING PER EXTRA COPY. With every group a pair, that is one per
       group -- and the check computes the groups independently rather than
       asking the page whether it agrees with itself. */
    t('and every duplicate question on file is reported once',
      live.flagged === live.dupePairs, live);

    t('nothing was written', writes.length === 0, writes);
    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
