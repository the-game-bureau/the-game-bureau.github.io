/* THE NFL TRIVIA PROMPT (2026-09-03).

   A button in the Challenge Bank's ADD bar that hands an AI a prompt for one
   multiple choice question per NFL club. It writes nothing -- the deliverable
   is one `insert` block a person runs -- so what is worth asserting is the TEXT
   and the fact that it is BUILT FROM THE ROWS.

   READS GO TO THE LIVE DATABASE. The whole claim is about the real 32 NFL
   destinations and which of them already have a question, and a fixture would
   only be testing my own guess at both. Every write is intercepted; this dialog
   makes none, which is itself asserted. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

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
  await new Promise((r) => srv.listen(9418, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
      /* THE CLIPBOARD IS NOT AVAILABLE OVER PLAIN HTTP, so a door would report a
         failure that is the harness's and not the page's. It is recorded. */
      window.__clip = [];
      /* `navigator.clipboard` IS A READ-ONLY GETTER ON THE PROTOTYPE, so a plain
         assignment is silently ignored and the stub records nothing -- which
         reads as the door failing to copy rather than as the harness failing to
         listen. `defineProperty` is what takes. */
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (v) => { window.__clip.push(v); return Promise.resolve(); } }
      });
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') {
        writes.push({ method: m, url: u });
        q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' });
        return;
      }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9418/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });
    await p.waitForFunction(() => state.nflTeams && state.nflTeams.length > 0, { timeout: 40000 });

    /* ---- THE BUTTON IS IN THE ADD BAR ---------------------------------- */
    const bar = await p.evaluate(() => {
      const add = [...document.querySelectorAll('.command-bar')]
        .filter((f) => (f.querySelector('legend') || {}).textContent === 'Add')[0];
      return { faces: [...add.querySelectorAll('.btn')].map((b) => b.textContent.trim()),
               open: document.getElementById('nflDlg').classList.contains('is-open') };
    });
    t('the ADD bar offers the NFL trivia prompt beside Challenge',
      bar.faces.length === 2 && bar.faces[0] === 'Challenge' && bar.faces[1] === 'NFL trivia',
      bar.faces);
    t('and its dialog is shut at rest', bar.open === false);

    /* ---- IT IS BUILT FROM THE ROWS ------------------------------------- */
    const built = await p.evaluate(() => {
      document.getElementById('nflBtn').click();
      const text = document.getElementById('nflPrompt').value;
      const all = state.nflTeams.map((d) => d.id);
      const done = {};
      state.rows.forEach((c) => {
        if (String(c.type) === 'question' && c.ladder_key) done[String(c.ladder_key)] = 1;
      });
      const need = all.filter((id) => !done[id]);
      const have = all.filter((id) => done[id]);
      return {
        open: document.getElementById('nflDlg').classList.contains('is-open'),
        sub: document.getElementById('nflSub').textContent,
        text: text,
        nfl: all.length,
        need: need,
        have: have,
        /* THE LIST IS THE LINES WHOSE FIRST WORD IS A BARE KEY. The worked SQL
           example quotes one too, and that is a shape rather than an ask -- so
           searching the whole text would be measuring the wrong thing. */
        listed: text.split(String.fromCharCode(10))
          .map((l) => l.trim().split(/\s+/)[0])
          .filter((w) => /^[a-z][a-z0-9-]+-nfl-[a-z0-9-]+$/.test(w))
      };
    });
    t('pressing it opens the dialog', built.open);
    t('the live table holds all 32 NFL clubs', built.nfl === 32, built.nfl);
    /* THE WHOLE POINT: it cannot ask about a club that is done, and cannot miss
       one that is not. A list written into the page would be stale the first
       time somebody wrote a question by hand. */
    t('every club with no question is named',
      built.need.every((id) => built.listed.indexOf(id) !== -1),
      { named: built.listed.length, needing: built.need.length });
    t('and no club that already has one is',
      built.have.every((id) => built.listed.indexOf(id) === -1),
      { wronglyListed: built.have.filter((id) => built.listed.indexOf(id) !== -1) });
    /* BOTH STATES, because the table moved under this check within the hour:
       the prompt was run, all 32 clubs were covered, and three assertions that
       assumed at least one club still needed a question went red on a page that
       was perfectly correct. **A check that demands production data be in one
       shape rots the moment somebody does the job it exists for.** */
    if (built.need.length) {
      t('and the head says how many', built.sub.indexOf(String(built.need.length)) !== -1, built.sub);
    } else {
      t('and with every club covered the head says so', /already/.test(built.sub), built.sub);
    }

    /* EVERY KEY IT PRINTS HAS TO BE A REAL ONE. An invented key resolves to
       nothing, the row reads perfectly, and the question is never asked. */
    const keyed = await p.evaluate(() => {
      const real = {};
      state.destinations.forEach((id) => { real[id] = 1; });
      return real;
    });
    t('it prints a key for each club and every one resolves',
      built.listed.length === built.need.length
      && built.listed.every((k) => keyed[k]),
      { printed: built.listed.length, needing: built.need.length,
        unreal: built.listed.filter((k) => !keyed[k]) });

    /* THE WORKED EXAMPLE QUOTES A REAL KEY, which is what makes it worth having
       -- an invented one would contradict the copy-it-exactly rule two
       paragraphs above. **So it has to say it is an example and not an ask**,
       or a model may simply file it. */
    t('the worked example says it is one and is not to be filed',
      /an EXAMPLE OF THE SHAPE/.test(built.text)
      && /not on your list/.test(built.text));

    /* THE LIST HAS TO REACT, which is the whole claim and the one thing a
       static read of the prompt cannot say: writing a question for a club must
       take it off the list. Asserted by giving one an answer in memory and
       reopening -- if the prompt were a list baked into the page, both counts
       would be identical. */
    const reacted = await p.evaluate(() => {
      const before = nflTeamsNeedingTrivia().map((d) => d.id);
      let victim, undo;
      if (before.length) {
        // A CLUB WITH NO QUESTION GAINS ONE, and has to drop off the list.
        victim = before[0];
        state.rows.push({ id: -1, type: 'question', ladder_key: victim,
                          name: 'probe', prompt: 'p', answer: 'a', tags: [] });
        undo = () => { state.rows.pop(); };
      } else {
        // EVERY CLUB IS COVERED, so one LOSES its questions and has to
        // reappear. Same claim from the other side rather than a skip.
        victim = state.nflTeams[0].id;
        const kept = state.rows.filter((c) => c.ladder_key === victim);
        state.rows = state.rows.filter((c) => c.ladder_key !== victim);
        undo = () => { state.rows = state.rows.concat(kept); };
      }
      document.getElementById('nflBtn').click();
      const text = document.getElementById('nflPrompt').value;
      const after = nflTeamsNeedingTrivia().map((d) => d.id);
      undo();
      return { victim: victim, before: before.length, after: after.length,
               stillNamed: text.split(String.fromCharCode(10))
                 .map((l) => l.trim().split(/\s+/)[0]).indexOf(victim) !== -1,
               sub: document.getElementById('nflSub').textContent };
    });
    if (reacted.before) {
      t('writing a question for a club takes it off the list',
        reacted.after === reacted.before - 1 && !reacted.stillNamed, reacted);
      t('and the count on the head follows',
        reacted.sub.indexOf(String(reacted.after)) !== -1, reacted.sub);
    } else {
      t('removing a club question puts it back on the list',
        reacted.after === 1 && reacted.stillNamed, reacted);
      t('and the count on the head follows', reacted.sub.indexOf('1') !== -1, reacted.sub);
    }

    /* ---- THE RULES THE DATABASE ACTUALLY ENFORCES ---------------------- */
    const txt = built.text;
    t('it says not to put the answer in the question',
      /answer in the question/i.test(txt));
    t('and not to open with One word', txt.indexOf('"One word"') !== -1);
    t('and to copy the key exactly', /COPY IT EXACTLY/.test(txt));
    t('and asks for four options with the answer among them',
      /FOUR OPTIONS/.test(txt) && /answer is one of them/.test(txt));
    t('and says tags carry no spaces', /NO SPACES/.test(txt));

    /* THE TAG VOCABULARY. A tag is how a challenge says where it belongs, and
       positive/negative is the half nobody would guess: it says which SIDE the
       question is written for, not whether the fact is a happy one. */
    t('it names all four kinds of tag',
      /THE LEAGUE/.test(txt) && /THE CITY/.test(txt) && /THE CLUB/.test(txt)
      && /POSITIVE or NEGATIVE/.test(txt));
    t('and says positive and negative are about the SIDE, not the mood',
      /which side the question is written for/i.test(txt)
      && /not[\s\S]{0,40}whether the fact is a happy one/i.test(txt));
    /* THE TARGET/RIVAL PAIR IS WHY THE TAG EXISTS: the same club is one or the
       other depending on whose game it is. */
    t('and explains that a club is target for its own fans and rival for others',
      /TARGET/.test(txt) && /RIVAL/.test(txt));
    /* THE STANDING RULE SURVIVES ON THE NEGATIVE SIDE, or it becomes a licence
       to be nasty about a town. */
    t('and holds negative to combative, never cruel',
      /combative, never cruel/i.test(txt));
    t('and asks for one of the two rather than both',
      /NOT BOTH/.test(txt));
    /* THE WORKED EXAMPLE HAS TO CARRY WHAT THE RULES ASK FOR, or it teaches the
       shorter shape. */
    t('and the worked example tags a league, a city, a club and a side',
      /array\['nfl', 'chicago', 'bears', 'positive'\]/.test(txt),
      (txt.match(/array\['nfl[^\]]*\]/) || [])[0]);
    /* THE STANDING RULE. A prompt littered with them teaches the model to write
       them back, and this output goes out under our name. */
    t('and the prompt itself carries no em dash', txt.indexOf(String.fromCharCode(8212)) === -1);

    /* THE SQL SHAPE HAS TO BE THE CURRENT ONE. `kind` and `trivia` both moved
       today, and a prompt naming either hands back SQL the database refuses. */
    t('the SQL block names the type column and the current value',
      /insert into public\.challenges \(type,/.test(txt) && /'question'/.test(txt));
    t('and names neither of the values that moved today',
      txt.indexOf("'trivia'") === -1 && !/\(kind,/.test(txt));
    t('and tells the AI not to send the generated id', /DO NOT SEND/.test(txt));
    t('and prints the SQL editor link, which is where the block is run',
      txt.indexOf('/sql/new?skip=true') !== -1);

    /* ---- EDITING, AND WHAT THE DOORS COPY ------------------------------ */
    const edited = await p.evaluate(() => {
      const box = document.getElementById('nflPrompt');
      const resetHiddenAtRest = document.getElementById('nflReset').hidden;
      box.value = 'MY OWN TEXT';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      const resetShown = !document.getElementById('nflReset').hidden;
      document.getElementById('nflChatgpt').click();
      const copied = window.__clip[window.__clip.length - 1];
      document.getElementById('nflReset').click();
      return { resetHiddenAtRest: resetHiddenAtRest, resetShown: resetShown,
               copied: copied, restored: box.value.indexOf('THE JOB') !== -1,
               resetHiddenAgain: document.getElementById('nflReset').hidden };
    });
    t('Reset is not offered on an untouched prompt', edited.resetHiddenAtRest === true);
    t('and appears once the text differs', edited.resetShown);
    /* THE DOORS COPY THE BOX, NOT WHAT WAS BUILT. Copying the generated text
       would throw an edit away in silence, which is the whole reason the sheet
       is editable. */
    t('a door copies what is in the box', edited.copied === 'MY OWN TEXT', edited.copied);
    t('and Reset puts the built prompt back', edited.restored);
    t('and hides itself again', edited.resetHiddenAgain === true);

    /* ---- IT WRITES NOTHING, AND ESCAPE CLOSES THE ONE ON TOP ----------- */
    const esc = await p.evaluate(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return document.getElementById('nflDlg').classList.contains('is-open');
    });
    t('Escape closes the prompt dialog', esc === false);
    t('and the whole thing wrote nothing to the database', writes.length === 0, writes);

    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
