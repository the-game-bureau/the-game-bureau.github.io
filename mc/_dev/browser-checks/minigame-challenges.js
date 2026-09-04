/* ONE CHALLENGE PER MINIGAME, AND THE URL CARRIES AN AUDIENCE (2026-09-04).

   THE MANIFEST IS READ FROM DISK, not written into this file, so the check
   cannot drift from the thing both engines actually launch. A challenge naming
   a file the manifest does not is a challenge that can never be played, and a
   minigame with no challenge is one nobody can put on a stop -- **both
   directions are asserted**, because either alone passes on half a job.

   `{{audience}}` IS DECLARED IN ONE ROOM AND FILLED IN ANOTHER. The Challenge
   Bank says which variables exist and the Stop Builder's rehearsal fills them,
   so a key in one and not the other is either an `unknown-variable` finding on
   a perfectly good row or a rehearsal that leaves it in its braces. Both are
   asserted against the SAME key list rather than against a literal.

   Reads go to the LIVE database. Every write is intercepted.

   Run: node mc/_dev/browser-checks/minigame-challenges.js                    */
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

(async () => {
  /* THE MANIFEST, AND THE FOLDER, WHICH ARE NOT THE SAME LIST. The ask said
     "each child folder is a minigame"; two of the five are loose html files and
     `teams/` is an empty folder with no playable page. The manifest is what the
     engines read, so it is what a challenge has to match. */
  const manifest = JSON.parse(fs.readFileSync(ROOT + '/minigames/manifest.json', 'utf8'));
  const files = manifest.map((m) => m.file).sort();
  const ids = manifest.map((m) => m.id).sort();

  t('the manifest names at least one minigame', manifest.length > 0, manifest.length);
  t('and every file it names is on disk',
    manifest.every((m) => fs.existsSync(ROOT + '/minigames/' + m.file)),
    manifest.filter((m) => !fs.existsSync(ROOT + '/minigames/' + m.file)).map((m) => m.file));

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
  await new Promise((r) => srv.listen(9451, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(NL)[0]));
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

    // ---- THE CHALLENGE BANK ------------------------------------------------
    await p.goto('http://127.0.0.1:9451/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    const bank = await p.evaluate(() => ({
      varKeys: VAR_KEYS.slice(),
      rows: state.rows.filter((c) => (c.tags || []).indexOf('app') !== -1)
        .map((c) => ({
          id: c.id, name: c.name, type: c.type, tags: c.tags,
          prompt: c.prompt, answer: c.answer, ladder_key: c.ladder_key,
          unknown: unknownVarsIn(c.prompt).concat(unknownVarsIn(c.answer)),
          review: isInReview(c)
        }))
    }));

    t('the Bank declares an `audience` variable',
      bank.varKeys.indexOf('audience') !== -1, bank.varKeys);

    /* BOTH DIRECTIONS. A check on one alone passes on half a job: five rows
       naming four games, or five games with four rows. */
    const rowIds = bank.rows.map((r) => (r.tags || []).filter((x) =>
      x !== 'minigame' && x !== 'app')[0]).sort();
    t('every minigame in the manifest has a challenge',
      JSON.stringify(rowIds) === JSON.stringify(ids), { rows: rowIds, manifest: ids });

    const named = bank.rows.map((r) => {
      const m = String(r.prompt || '').match(/\/minigames\/([^?\s]+)/);
      return m ? m[1] : null;
    }).sort();
    t('and every challenge names a file the manifest names',
      JSON.stringify(named) === JSON.stringify(files), { named: named, manifest: files });

    /* THE ASK ITSELF. The id is per GAME and a challenge row is not, so it can
       only be a variable -- and it has to be a KNOWN one, or every row carries
       an `unknown-variable` finding. */
    t('every one sends an audience id',
      bank.rows.length > 0 && bank.rows.every((r) =>
        /\?audience=\{\{audience\}\}$/.test(String(r.prompt || '').trim())),
      bank.rows.map((r) => String(r.prompt || '').slice(-34)));
    t('and the room does not flag it as an unknown variable',
      bank.rows.every((r) => r.unknown.length === 0),
      bank.rows.filter((r) => r.unknown.length).map((r) => [r.name, r.unknown]));
    t('so no minigame challenge is in review',
      bank.rows.every((r) => !r.review),
      bank.rows.filter((r) => r.review).map((r) => r.name));

    /* THE SHAPE THE TABLE ENFORCES. A ladder key is refused on anything that is
       not a `question`, and the app judges these so there is nothing to mark. */
    t('each is a minigame with no answer and no ladder key',
      bank.rows.every((r) => r.type === 'minigame' && !r.answer && !r.ladder_key),
      bank.rows.map((r) => ({ n: r.name, t: r.type, a: r.answer, k: r.ladder_key })));

    /* THE `app` TAG IS WHAT TELLS THE TWO KINDS APART, because the type cannot:
       `minigame` also holds the physical ones -- twenty paces, one quiet minute
       -- which have no app anywhere. */
    const physical = await p.evaluate(() => state.rows.filter((c) =>
      c.type === 'minigame' && (c.tags || []).indexOf('app') === -1).length);
    t('and the physical minigames are still there, untagged as apps',
      physical > 0, physical);

    // ---- THE STOP BUILDER FILLS IT ----------------------------------------
    await p.goto('http://127.0.0.1:9451/mc/stop-builder/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.waypoints
                                  && state.waypoints.length > 0, { timeout: 40000 });

    const sb = await p.evaluate(() => {
      const v = varsFor({}, null);
      /* BUILT THROUGH THE ROOM'S OWN RENDERER, which marks an unfilled variable
         `is-unknown` -- so this asserts what a reader would SEE rather than a
         string match that cannot tell a filled variable from a red one. */
      const node = promptNode('go to /minigames/jersey/index.html?audience={{audience}}', v);
      const vars = [...node.querySelectorAll('.sv-var')];
      return { keys: Object.keys(v).sort(), audience: v.audience,
               text: node.textContent,
               spans: vars.map((x) => ({ txt: x.textContent,
                                         unknown: x.className.indexOf('is-unknown') !== -1 })) };
    });
    t('the rehearsal knows the same variables the Bank declares',
      JSON.stringify(sb.keys) === JSON.stringify(bank.varKeys.slice().sort()),
      { rehearsal: sb.keys, bank: bank.varKeys.slice().sort() });
    /* A KNOWN VARIABLE THE STOP CANNOT FILL TAKES THE WORKED EXAMPLE rather
       than being left in its braces and reddened -- a stop knows nothing about
       which game it is walked in, so `audience` is the worked example forever. */
    t('and fills the audience rather than reddening it',
      !!sb.audience && sb.spans.length === 1 && sb.spans[0].unknown === false
        && sb.spans[0].txt === sb.audience && sb.text.indexOf('{{') === -1, sb);

    t('nothing was written', writes.length === 0, writes);
    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(NL + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
