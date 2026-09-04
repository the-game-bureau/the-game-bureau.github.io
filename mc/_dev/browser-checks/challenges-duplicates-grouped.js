/* DUPLICATES ARE GROUPED, AND THE ROW CARRIES A DELETE (2026-09-03).

   TWO ASKS, AND THE FIRST ONE ONLY MEANS ANYTHING BECAUSE OF A MEASUREMENT.
   The finding goes on every row of a cluster BUT THE FIRST, and on the live
   table **all 12 rows in review are duplicate seconds while not one of their 12
   twins carries a fault of its own** -- so under the issues filter the row you
   are told to compare against is not on screen at all. Grouping 12 unrelated
   findings would say nothing. So the twin is PULLED IN, marked as being there
   for the comparison rather than for a fault, and the pair is drawn together.

   THE RULES ARE DRIVEN ON ROWS MADE UP HERE, so this cannot rot the day
   somebody works through the duplicates and the table comes out clean -- which
   is exactly what the delete button is for. The live table is asserted too, in
   whichever shape it is actually in.

   Reads go to the LIVE database. Every write is intercepted, and the DELETE is
   answered the way PostgREST answers one so the room's read-back is exercised.

   Run: node mc/_dev/browser-checks/challenges-duplicates-grouped.js           */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const NL = String.fromCharCode(10);

/* THE FIXTURE IS BUILT SO THE SORT WOULD SEPARATE THE PAIR. Alpha and Zulu are
   the two ends of the alphabet with Gamma between them, so a list ordered by
   name puts something else between the twins -- and grouping has to move one.
   A fixture whose pair is already adjacent proves nothing. */
const FIXTURE = [
  { id: 10, name: 'Alpha', prompt: 'Who threw the pass?', answer: 'Bart',
    type: 'question', choices: null, tags: [], ladder_key: null,
    created_at: '2026-01-01T00:00:00Z' },
  { id: 11, name: 'Zulu', prompt: 'who threw  the pass!!', answer: 'Bart',
    type: 'question', choices: null, tags: [], ladder_key: null,
    created_at: '2026-01-02T00:00:00Z' },
  { id: 12, name: 'Gamma', prompt: '', answer: 'x',
    type: 'question', choices: null, tags: [], ladder_key: null,
    created_at: '2026-01-03T00:00:00Z' },
  { id: 13, name: 'Delta', prompt: 'Nothing to do with it.', answer: 'y',
    type: 'question', choices: null, tags: [], ladder_key: null,
    created_at: '2026-01-04T00:00:00Z' }
];

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
  await new Promise((r) => srv.listen(9447, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [], asked = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(NL)[0]));

    /* A NATIVE `confirm` BLOCKS THE PAGE FOREVER UNDER PUPPETEER unless
       something answers it, and a run that HANGS reads as the harness rather
       than as a failure -- the worst shape a check can take. */
    let sayYes = true;
    p.on('dialog', async (d) => { asked.push(d.message()); await (sayYes ? d.accept() : d.dismiss()); });

    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {},
                 authHeaders: (x) => Object.assign(
                   { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    }, KEY);

    /* THE DELETE IS ANSWERED THE WAY POSTGREST ANSWERS ONE -- the deleted row
       back -- because the room reads that array and treats an empty one as a
       refusal. A stub answering `[]` would report every delete as refused, and
       that would read as a page fault. */
    let refuseDelete = false;
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') {
        writes.push({ method: m, url: u, prefer: (q.headers() || {}).prefer || '' });
        const id = (u.match(/id=eq\.([0-9]+)/) || [])[1];
        const body = (m === 'DELETE' && !refuseDelete && id)
          ? JSON.stringify([{ id: Number(id) }]) : '[]';
        q.respond({ status: 200, contentType: 'application/json', headers: H, body: body });
        return;
      }
      q.continue();
    });

    await p.goto('http://127.0.0.1:9447/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows && state.rows.length > 0,
                            { timeout: 40000 });

    const wired = await p.evaluate(() => ({
      group: typeof groupTwins === 'function',
      company: typeof isCompany === 'function',
      del: typeof deleteFromRow === 'function',
      shared: typeof removeChallenge === 'function'
    }));
    if (!wired.group || !wired.company || !wired.del) {
      t('the room groups duplicates and deletes from a row', false, wired);
      console.log(NL + ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close(); process.exit(1);
    }
    t('one delete, two callers, so the editor and the row cannot drift',
      wired.shared === true, wired);

    /* ---- THE LIVE TABLE, IN WHATEVER SHAPE IT IS IN --------------------- */
    const live = await p.evaluate(() => {
      state.q = ''; state.kind = 'any'; state.reviewOnly = true;
      render();
      const shown = Array.from(document.querySelectorAll('.ch')).map((r) => Number(r.dataset.id));
      const faulty = state.rows.filter(isInReview).map((c) => Number(c.id));
      const company = state.rows.filter(isCompany).map((c) => Number(c.id));
      // ADJACENT: every twin that is on screen sits next to the row it doubles.
      let apart = [];
      shown.forEach((id, i) => {
        const twins = (dupeTwins[id] || []).map(Number).filter((x) => shown.indexOf(x) !== -1);
        twins.forEach((x) => {
          const j = shown.indexOf(x);
          if (Math.abs(j - i) !== 1) apart.push([id, x]);
        });
      });
      return { total: state.rows.length, shown: shown.length, faulty: faulty.length,
               company: company.length, apart: apart };
    });
    t('on the live table every duplicate sits next to its twin',
      live.apart.length === 0, live.apart);
    if (live.company) {
      t('and the twin is pulled in, since it carries no fault of its own',
        live.shown === live.faulty + live.company, live);
    } else {
      t('no duplicate is left on the live table, so nothing to pull in',
        live.faulty === live.shown, live);
    }

    /* ---- THE REAL BUTTON, AND WHAT IT SAYS ------------------------------
       THE COUNT ON THAT LINE IS THE ONE THING SOMEBODY CHECKS AGAINST THE
       ROWS, so it has to count what is on screen: a twin pulled in for the
       comparison is a row, and a line reading "showing the 12" over a list of
       24 is the room contradicting itself. */
    const said = await p.evaluate(async () => {
      state.reviewOnly = false; render();
      document.getElementById('checkBtn').click();
      await new Promise((z) => setTimeout(z, 200));
      return { msg: document.getElementById('pageStatus').textContent,
               rows: document.querySelectorAll('.ch').length,
               faulty: state.rows.filter(isInReview).length,
               company: state.rows.filter(isCompany).length };
    });
    /* WHICHEVER SHAPE THE TABLE IS IN. The 12 duplicates were worked through
       and deleted while this check was being written, which is exactly what the
       delete button is for -- and a check that demanded they still be there
       would have gone red on somebody doing their job. Both branches assert the
       thing that is true of them. */
    if (said.faulty) {
      t('the Check button turns the filter on and says what it did',
        /something wrong/.test(said.msg || ''), said.msg);
      t('and the rows on screen are the faults plus their twins',
        said.rows === said.faulty + said.company, said);
    } else {
      t('the Check button says the table is clean when it is',
        /nothing wrong/i.test(said.msg || '') && said.company === 0, said);
      /* AND IT DOES NOT NARROW TO NOTHING. Setting the filter with nothing to
         show would empty the room under a line saying all is well, which this
         room already removed once. */
      t('and leaves every row on screen rather than narrowing to none',
        said.rows > 0, said);
    }

    /* ---- THE RULES, ON ROWS MADE UP HERE -------------------------------- */
    const drove = await p.evaluate((rows) => {
      window.__keep = state.rows.slice();
      state.rows = rows;
      state.q = ''; state.kind = 'any'; state.sort = 'name';

      state.reviewOnly = false;
      render();
      const open = Array.from(document.querySelectorAll('.ch')).map((r) => Number(r.dataset.id));
      const openDel = document.querySelectorAll('.ch-del').length;

      state.reviewOnly = true;
      render();
      const shut = Array.from(document.querySelectorAll('.ch')).map((r) => Number(r.dataset.id));
      const notes = {};
      Array.from(document.querySelectorAll('.ch')).forEach((r) => {
        notes[Number(r.dataset.id)] = {
          review: r.classList.contains('is-review'),
          company: !!r.querySelector('.ch-note.is-company'),
          text: (r.querySelector('.ch-note') || {}).textContent || ''
        };
      });
      return { open: open, openDel: openDel, shut: shut, notes: notes };
    }, FIXTURE);

    /* THE LINE COUNTS WHAT IS ON SCREEN, PROVED WHERE THE TWO DIFFER. On the
       live table the faults and the twins are both 12, so a message quoting one
       12 satisfies a check for both -- and the first cut of this passed on the
       old wording for exactly that reason. Here it is 2 faults and 1 twin. */
    const drovenSaid = await p.evaluate(async () => {
      state.reviewOnly = false; render();
      document.getElementById('checkBtn').click();
      await new Promise((z) => setTimeout(z, 200));
      const msg = document.getElementById('pageStatus').textContent;
      return { msg: msg, nums: (msg.match(/[0-9]+/g) || []).map(Number),
               rows: document.querySelectorAll('.ch').length,
               faulty: state.rows.filter(isInReview).length,
               company: state.rows.filter(isCompany).length };
    });
    t('the check line names the faults and the twins separately',
      drovenSaid.faulty === 2 && drovenSaid.company === 1
        && drovenSaid.nums.indexOf(2) !== -1 && drovenSaid.nums.indexOf(1) !== -1
        && drovenSaid.rows === 3, drovenSaid);
    /* ONE TWIN IS A TWIN, NOT TWINS. A hand-written plural is what a joined
       count and a fixed noun give you, and this room has one twin far more
       often than two. */
    t('and one twin reads as one row',
      / 1 twinned row[^s]/.test(drovenSaid.msg + ' '), drovenSaid.msg);

    /* UNFILTERED THE ORDER IS UNTOUCHED. Grouping is for the job of working
       through the duplicates; outside that filter it would be a sort nobody
       asked for reordering the room. */
    t('unfiltered, the chosen sort is left alone',
      JSON.stringify(drove.open) === JSON.stringify([10, 13, 12, 11]), drove.open);
    t('and no row carries a Delete', drove.openDel === 0, drove.openDel);

    /* THE PAIR IS 10 AND 11, WHICH THE NAME SORT PUTS AT OPPOSITE ENDS with
       Gamma between them. Grouped, 11 is pulled up to sit under 10. */
    t('under the issues filter the pair is drawn together',
      JSON.stringify(drove.shut) === JSON.stringify([10, 11, 12]), drove.shut);
    t('the row with the finding is in the red pen',
      drove.notes[11] && drove.notes[11].review === true && drove.notes[11].company === false,
      drove.notes[11]);
    /* THE TWIN IS NOT ACCUSED. It has no fault; it is on screen so the finding
       on 11 has something to point at, and the row says exactly that. */
    t('and the twin is not, but says why it is here',
      drove.notes[10] && drove.notes[10].review === false && drove.notes[10].company === true,
      drove.notes[10]);
    t('naming the challenge that doubles it',
      /challenge 11/i.test((drove.notes[10] || {}).text || ''), (drove.notes[10] || {}).text);
    t('an unrelated finding is still shown, and is not company',
      drove.notes[12] && drove.notes[12].review === true && drove.notes[12].company === false,
      drove.notes[12]);
    t('and a clean row with no twin stays out',
      drove.shut.indexOf(13) === -1, drove.shut);

    /* ---- THE DELETE BUTTON ---------------------------------------------- */
    const geo = await p.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.ch'));
      const r = rows.filter((x) => Number(x.dataset.id) === 11)[0];
      const del = r.querySelector('.ch-del');
      if (!del) return { missing: true, count: rows.length };
      const line = r.querySelector('.ch-line');
      const rb = r.getBoundingClientRect(), db = del.getBoundingClientRect(),
            lb = line.getBoundingClientRect();
      return {
        onEvery: rows.length === rows.filter((x) => !!x.querySelector('.ch-del')).length,
        count: rows.length,
        pastLine: Math.round(db.left - lb.right),
        fromRight: Math.round(rb.right - db.right),
        height: Math.round(db.height),
        rowHeight: Math.round(rb.height),
        text: del.textContent
      };
    });
    /* ON BOTH ROWS OF A PAIR. Which of the two to keep is the editorial call
       the room cannot make, so offering it on one would be making it. */
    t('every row under the filter carries a Delete, the twin included',
      geo.onEvery === true && geo.count === 3, geo);
    if (geo.missing) {
      console.log(NL + ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close(); process.exit(1);
    }
    t('and it sits at the right of the row', geo.pastLine >= 0 && geo.fromRight <= 14, geo);
    /* `.btn`'s OWN 36px WOULD GROW A ROW WHOSE PADDING IS 7px, and the list is
       a hundred of them. */
    t('trimmed, so it does not set the row height',
      geo.height <= 28 && geo.height < geo.rowHeight, geo);

    /* THE ROW OPENS THE EDITOR ON CLICK, so the button has to stop its own or
       deleting would open the editor over the row it had just deleted. */
    sayYes = false;
    const declined = await p.evaluate(async () => {
      const r = Array.from(document.querySelectorAll('.ch'))
        .filter((x) => Number(x.dataset.id) === 11)[0];
      r.querySelector('.ch-del').click();
      await new Promise((z) => setTimeout(z, 120));
      return { rows: state.rows.length,
               editorOpen: document.getElementById('dlg').classList.contains('is-open'),
               editing: state.editing === null ? null : state.editing.id,
               shown: document.querySelectorAll('.ch').length };
    });
    t('declining the confirm writes nothing',
      declined.rows === 4 && writes.length === 0, { rows: declined.rows, writes: writes });
    t('and the press never opens the editor',
      declined.editorOpen === false && declined.editing === null, declined);
    t('the question names the survivor, which is the choice being made',
      /challenge 10/i.test(asked[0] || '') && /stays/i.test(asked[0] || ''), asked[0]);

    /* A REFUSED DELETE IS REPORTED AND THE ROW STAYS. PostgREST answers 200
       with an empty array when RLS refuses, so without reading the row back a
       refusal reports success and the row vanishes until a reload. */
    sayYes = true; refuseDelete = true;
    const refused = await p.evaluate(async () => {
      const r = Array.from(document.querySelectorAll('.ch'))
        .filter((x) => Number(x.dataset.id) === 11)[0];
      r.querySelector('.ch-del').click();
      await new Promise((z) => setTimeout(z, 200));
      return { rows: state.rows.length, shown: document.querySelectorAll('.ch').length,
               msg: document.getElementById('pageStatus').textContent };
    });
    t('a refused delete keeps the row', refused.rows === 4 && refused.shown === 3, refused);
    t('and says the database refused it', /refused/i.test(refused.msg || ''), refused.msg);

    refuseDelete = false;
    writes.length = 0;
    const done = await p.evaluate(async () => {
      const r = Array.from(document.querySelectorAll('.ch'))
        .filter((x) => Number(x.dataset.id) === 11)[0];
      r.querySelector('.ch-del').click();
      await new Promise((z) => setTimeout(z, 200));
      return { rows: state.rows.map((c) => Number(c.id)),
               shown: Array.from(document.querySelectorAll('.ch')).map((x) => Number(x.dataset.id)),
               msg: document.getElementById('pageStatus').textContent };
    });
    const d0 = writes.filter((w) => w.method === 'DELETE')[0] || {};
    t('a taken delete sends a DELETE keyed on the row own id',
      d0.method === 'DELETE' && d0.url.indexOf('id=eq.11') !== -1, d0.url);
    t('and asks for the row back, or a refusal reads as a success',
      /return=representation/.test(d0.prefer || ''), d0.prefer);
    t('the row goes', done.rows.indexOf(11) === -1 && done.rows.length === 3, done.rows);
    /* AND THE TWIN GOES WITH IT -- not deleted, but no longer company, because
       the finding it was standing next to is gone. */
    t('and its twin drops out, having nothing left to be compared against',
      JSON.stringify(done.shown) === JSON.stringify([12]), done.shown);
    t('and it says so', /deleted/i.test(done.msg || ''), done.msg);

    /* ---- BOTH NUMBERS FROM ONE STATE ------------------------------------
       `issueCount` reads `dupeMap`, which only `refreshDupes` fills, so counting
       BEFORE the repaint counted against the previous rows while the twin count
       was read after -- one sentence quoting two numbers from two different
       states. A SCREENSHOT CAUGHT IT: "1 of 5" over a list of five with three
       findings in it.
         IT NEEDS A SWAP WITH NO RENDER IN BETWEEN, which is why the probes above
       cannot see it: every one of them renders first, and a render makes the map
       current and masks the fault. */
    const fresh = await p.evaluate(async (rows) => {
      state.rows = rows.slice();
      state.reviewOnly = false;
      document.getElementById('checkBtn').click();
      await new Promise((z) => setTimeout(z, 200));
      const msg = document.getElementById('pageStatus').textContent;
      return { msg: msg, nums: (msg.match(/[0-9]+/g) || []).map(Number),
               faulty: state.rows.filter(isInReview).length,
               rows: document.querySelectorAll('.ch').length };
    }, FIXTURE);
    t('the check counts the rows it is looking at, not the ones it last saw',
      fresh.faulty === 2 && fresh.nums.indexOf(2) !== -1 && fresh.rows === 3, fresh);

    await p.evaluate(() => { state.rows = window.__keep; state.reviewOnly = false; render(); });
    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(NL + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
