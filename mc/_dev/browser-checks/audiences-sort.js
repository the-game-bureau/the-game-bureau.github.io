/* THE AUDIENCES SORT TOGGLES, DRIVEN IN REAL CHROME.
   ---------------------------------------------------------------------------
   Every claim here is about what a person SEES: which control is filled, what
   order the rows come out in, and whether the head still holds one line. jsdom
   has no layout and does not resolve a cascade at a width, so it would pass
   over the half of this that matters.
      node mc/_dev/browser-checks/audiences-sort.js

   IT SERVES THE REAL 640 AUDIENCES, read from Supabase once at the top and
   replayed to the page. A synthetic fixture would order perfectly and tell you
   nothing about the rows that actually break an alphabet -- the homeless clubs,
   the four `kind` values shared across hundreds of rows, the mascots that are
   blank on every college club. */
const http = require('http');
const fs = require('fs');
const path = require('path');
/* THE ROOM'S OWN PAGE SIZE. Named here so the wait, the page assertions and
   the walk all mean the same hundred -- and so a change to it fails loudly in
   one place rather than three. */
const PAGE = 100;

const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const API = 'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/* A HEX AS THE BROWSER REPORTS IT. Comparing the declaration against the
   computed value is the only way to know the border really took the colour
   rather than merely being told about it. */
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return 'rgb(' + parseInt(h.slice(0, 2), 16) + ','
    + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ')';
};

let ok = 0; let bad = 0;
const is = (n, c, got) => {
  if (c) { ok += 1; console.log('  ok   ' + n); }
  else { bad += 1; console.log('  FAIL ' + n + (got !== undefined ? '   got: ' + JSON.stringify(got) : '')); }
};

/* PostgREST caps a response at 1000 rows and truncates in SILENCE, so the read
   pages. `audiences` is 640 today, which is exactly the size that crosses that
   line without anybody noticing. */
async function readAll(table, select) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(API + '/' + table + '?select=' + select, {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: from + '-' + (from + 999) }
    });
    if (!r.ok) throw new Error(table + ' ' + r.status);
    const rows = await r.json();
    out.push.apply(out, rows);
    if (rows.length < 1000) return out;
  }
}

(async () => {
  const audiences = await readAll('audiences', '*');
  const places = await readAll('places', 'id,city,state');
  /* THE BLANKS THAT ARE NOT COLLEGE CLUBS, TAKEN NOW. The stub PUSHES a POSTed
     row into `audiences`, and the suite presses MANUAL twice and then renames
     what it created -- so by the end of the run Node holds two rows under ids
     the page has since re-slugged. Snapshot it before any probe runs. */
  const nonCollegeBlanksAtLoad = audiences
    .filter((r) => !String(r.city || '').trim() && String(r.league || '') !== 'NCAAF')
    .map((r) => r.id);
  console.log('  (' + audiences.length + ' audiences, ' + places.length + ' places)');

  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => server.listen(8896, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  const reads = [];
  /* COUNTED IN NODE, because the thing being observed is a RELOAD -- it
     destroys the page's execution context, so nothing inside the page can
     survive to report it. */
  let navs = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1100 });
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs += 1; });

    /* THE GATE IS STUBBED BEFORE THE PAGE SCRIPT RUNS. Forcing the authorized
       class after load shows the room and never fires `onAuthorized`, so it
       renders zero rows -- which reads as a page fault and is the harness's. */
    await page.evaluateOnNewDocument(() => {
      window.__authorize = null;
      window.TgbMcAdminAuth = { create: (o) => {
        window.__authorize = o.onAuthorized;
        return { getSession: () => ({ access_token: 'stub' }), init: () => {} };
      } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });

    const writes = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.indexOf('supabase.co') === -1) { req.continue(); return; }
      /* EVERY WRITE IS RECORDED AND NONE REACHES THE DATABASE. The reads are
         the real 641 rows; a PATCH or a POST is answered with the row it sent,
         which is what `return=representation` promises, so the page carries on
         exactly as it would against a live table. */
      const m = req.method();
      if (m === 'PATCH' || m === 'POST' || m === 'DELETE') {
        let sentBody = null;
        try { sentBody = JSON.parse(req.postData() || 'null'); } catch (e) { sentBody = req.postData(); }
        writes.push({ method: m, url: url, body: sentBody, headers: req.headers() });
        /* AN INSERTED ROW IS THERE ON THE NEXT READ, which is what a real server
           does and what the room depends on: MANUAL reloads, and the row it just
           wrote is how the SECOND press knows `_NAME` is taken. Without this the
           stub served the same rows back and both presses composed the same key
           -- reported as the page colliding with itself, and it was the harness. */
        if (m === 'POST' && sentBody && sentBody.id) audiences.push(sentBody);
        req.respond({
          status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
          /* THE PATCHED ROW, NOT A FIXTURE. This answered
             `Object.assign({ id: 'x', ... }, sentBody)` -- so a PATCH that did
             not itself carry an `id` came back claiming the row's key was `x`,
             and `patchRow` assigns the reply onto the row, **so any row this
             suite edited became `x` in the page's memory.** The colour probe
             edits the FIRST card, which is the placeholder MANUAL had just
             written, so the next press could not find its key and composed the
             same one again -- reported as the room colliding with itself.
               A REAL SERVER ANSWERS WITH THE ROW IT UPDATED. The stub looks it
             up by the `id=eq.` filter it was addressed with and merges. */
          body: JSON.stringify(m === 'DELETE' ? [{}]
            : (function () {
                const b = Array.isArray(sentBody) ? sentBody[0] : sentBody;
                if (m === 'POST') return [b];
                const was = (url.match(/id=eq\.([^&]*)/) || [])[1];
                const row = audiences.filter((r) => r.id === decodeURIComponent(was || ''))[0];
                return [Object.assign({}, row || { id: was, full_name: 'X' }, b)];
              })())
        });
        return;
      }
      reads.push(url);
      const body = url.indexOf('/places') !== -1 ? places
        : url.indexOf('/audiences') !== -1 ? audiences : [];
      req.respond({
        status: 200,
        contentType: 'application/json',
        /* **THE PREFLIGHT HAS TO NAME PATCH AND DELETE.** Without
           `access-control-allow-methods` a browser allows only the CORS-safe
           three -- GET, HEAD, POST -- so the reads and the add dialog worked
           while every PATCH was blocked before it left. It reads as the page
           silently failing to save, and it is the harness. */
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          /* **NO-STORE, OR THE RELOAD READS THE ROOM'S OWN CACHE.** MANUAL
             writes a row and reloads; the GET after that reload is the same URL
             as the one before it, so Chrome served the OLD body and the page
             came back without the row it had just written -- the second press
             then composed the same key and it read as the room colliding with
             itself. A real server sends cache headers; the stub sent none. */
          'cache-control': 'no-store',
          'access-control-expose-headers': 'content-range', 'content-range': '0-' + body.length + '/' + body.length },
        body: JSON.stringify(body)
      });
    });

    /* NAMED, BECAUSE MANUAL RELOADS THE PAGE. Pressing it writes a row and
       calls `location.reload()`, so the room comes back UNAUTHORISED and empty
       -- and every probe after it finds no `.aud` and reports the room as having
       failed to draw. The gate has to be walked through again. */
    const authorize = () => page.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authorize) await window.__authorize();
    });

    await page.goto('http://127.0.0.1:8896/mc/audiences/', { waitUntil: 'networkidle2' });
    await authorize();
    /* WAIT ON THE CONDITION, NEVER ON A CLOCK. A fixed sleep makes the check
       flaky the first time the machine is busy.
         IT WAS `> 100` AND THE ROOM NOW PAGES AT EXACTLY 100, so the old wait
       could never be satisfied and the whole suite timed out. **The check was
       correctly broken**: it was asserting that the entire catalogue is drawn,
       which is the thing the pager deliberately stopped doing. */
    /* PASSED IN, NEVER CLOSED OVER. The callback is serialised and run in the
       BROWSER, where a Node const does not exist -- it would throw
       `PAGE is not defined` inside the page and surface here as a timeout,
       which reads as the room failing to draw. */
    const drawn = () => page.waitForFunction(
      (n) => document.querySelectorAll('.aud').length === n, { timeout: 20000 }, PAGE);
    await drawn();

    /* PRESS MANUAL AND WAIT FOR THE ROOM TO COME BACK. The reload destroys the
       execution context, so the press cannot be made from inside
       `page.evaluate` -- the call never returns and the run dies with
       `Execution context was destroyed`, which reads as the page crashing
       rather than as a control doing exactly what it says. */
    const pressManual = async () => {
      /* WAIT FOR THE NAVIGATION, NOT A CLOCK. `drawn()` is satisfied by the OLD
         document -- it still has its hundred badges until the reload lands -- so
         a fixed sleep let `pressManual` return before the page had gone, and the
         SECOND press then clicked a page whose rows did not yet include the row
         the first had written. It composed the same key twice and reported the
         room as colliding with itself. */
      const before = navs;
      await page.click('#manualBtn');
      for (let i = 0; i < 60 && navs === before; i += 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
      /* AND WAIT FOR THE PAGE SCRIPT TO HAVE RUN. `authorize()` calls
         `window.__authorize`, which the room only sets when its own script
         reaches `TgbMcAdminAuth.create` -- so straight after a navigation it is
         still null, the gate is never walked, and `drawn()` then waits twenty
         seconds for a room that was never told to load. */
      await page.waitForFunction(() => typeof window.__authorize === 'function',
        { timeout: 15000 });
      await authorize();
      await drawn();
      /* AND WAIT FOR THE ROOM TO HAVE READ THE ROW IT JUST WROTE. `drawn()` only
         says a hundred badges are on screen, which is true of a page that has
         re-read the OLD rows -- so the next press composed the same key and it
         read as the room colliding with itself.
           THE BLURB IS THE ROOM'S OWN COUNT of `state.rows`, so waiting for it
         to reach the number the stub is serving is waiting for the exact thing
         the next press depends on. */
      await page.waitForFunction((n) => {
        const el = document.getElementById('blurbCount');
        return el && el.textContent.trim() === String(n);
      }, { timeout: 15000 }, audiences.length);
    };

    const names = () => page.evaluate(() =>
      /* ONE SOLID BADGE, so a value is found by its `data-field` rather than by
         its position in a face that no longer exists. */
      [].slice.call(document.querySelectorAll('.aud')).map((card) => {
        const v = (k) => {
          const f = card.querySelector('[data-field="' + k + '"]');
          return f ? f.textContent.trim() : '';
        };
        /* THE KEY COMES OFF `data-row`, not off a field. A locked cell is
           drawn without `data-field` -- that attribute is what the in-place
           editor finds, and the key is not editable -- so there is nothing to
           read it from inside the badge. The badge itself carries it. */
        /* THE NAME IS THE TWO HALVES JOINED. `full_name` is NOT DRAWN -- the
           badge shows `first` and `last` -- so reading it returned '' on every
           row, and every order assertion then compared blanks and reported the
           whole catalogue as nameless. **The room sorts on `full_name`, so the
           check has to reconstruct it exactly as the row spells it.** */
        return { key: card.dataset.row || '',
                 fullName: [v('first'), v('last')].filter(Boolean).join(' '),
                 kind: v('type'), home: v('city') };
      }));

    const sorted = (list, pick) => {
      /* THE SAME RULE THE PAGE KEEPS: a blank sinks, and it is compared
         case-insensitively. Written out here rather than imported, so the check
         is an independent statement of the order rather than a mirror of the
         implementation. */
      for (let i = 1; i < list.length; i += 1) {
        const a = pick(list[i - 1]); const b = pick(list[i]);
        if (!a && b) return 'blank "' + pick(list[i - 1]) + '" before "' + b + '" at row ' + i;
        if (!a || !b) continue;
        if (a.toLowerCase().localeCompare(b.toLowerCase(), undefined, { numeric: true }) > 0) {
          return '"' + a + '" before "' + b + '" at row ' + i;
        }
      }
      return '';
    };

    /* ---- there is no sort control ---- */
    /* THE THREE TOGGLES ARE GONE. They were name, type and city over the list,
       and the list is ONE order now -- name, A to Z -- which is the order this
       room has opened on since it was built.
         WHAT WENT WITH THEM IS EVERY ASSERTION ABOUT THE CONTROL: how many were
       on, which one, that `aria-pressed` marked exactly one, that the on state
       differed from the rest. **What survives is the thing those toggles were
       FOR**, which is the order itself -- and that is asserted below, where it
       always was.
         WHAT IS LOST, PLAINLY: nothing orders by type or by city any more. Both
       are still searchable and the city has its own filter, so what is gone is
       reading the catalogue in those orders rather than reaching a row through
       them. */
    const control = await page.evaluate(() => ({
      toggles: document.querySelectorAll('.th-sort').length,
      head: document.querySelectorAll('.aud-head').length,
      bars: document.querySelectorAll('.command-bar').length,
      sortBars: document.querySelectorAll('.command-bar--sort').length
    }));
    is('there is no sort header', control.head === 0, control.head);
    is('and no sort toggles', control.toggles === 0, control.toggles);
    is('and no separate sort bar', control.sortBars === 0, control.sortBars);
    is('and the room is down to three command bars', control.bars === 3, control.bars);

    /* SCROLL TO THE END AND READ THE LOT. This is the assertion the list needs
       and the one a first-chunk check cannot make: that the hundred on screen is
       a WINDOW rather than a cap -- every row reachable, none drawn twice, and
       the order still right across the seam where a chunk was appended.
         IT WAS A PAGER AND IS ONE LIST NOW, so the walk scrolls instead of
       pressing Next. **Same claim, and it is the claim that matters**: a top-N
       and a growing list look identical on first paint.
         IT SETTLES RATHER THAN COUNTING PRESSES. The observer fires on its own
       schedule, so the loop scrolls until the count stops moving -- a fixed
       number of scrolls would be a clock, which this suite has already been
       caught by once. */
    const walk = async () => {
      let last = -1, quiet = 0;
      for (let i = 0; i < 120; i += 1) {
        const n = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          return document.querySelectorAll('.aud').length;
        });
        /* THREE QUIET SAMPLES, NOT ONE. The observer fires on its own schedule,
           so two consecutive reads can match while a chunk is still on its way
           -- and breaking there ended the walk at 300 of 641 and reported the
           list as capped. **The whole point of this walk is that it is NOT.** */
        quiet = (n === last) ? quiet + 1 : 0;
        if (quiet >= 3) break;
        last = n;
        await new Promise((r) => setTimeout(r, 150));
      }
      return names();
    };
    /* BACK TO ONE CHUNK, THROUGH THE ROOM'S OWN RESET. Typing into the search
       box and clearing it is what puts `shown` back and the page with it; there
       is no control to press and reaching into the page's variables would be
       testing something no person can do. */
    const rewind = async () => {
      await page.evaluate(() => {
        const q = document.getElementById('q');
        q.value = 'zzzz-not-a-club'; q.dispatchEvent(new Event('input', { bubbles: true }));
        q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 250));
    };

    /* ---- the order on load ---- */
    const onLoad = await names();
    is('the list opens on a hundred badges, not the whole catalogue',
      onLoad.length === PAGE, onLoad.length);
    const footSays = await page.evaluate(() => {
      const f = document.querySelector('[data-more]');
      return f ? f.textContent.trim() : '(none)';
    });
    /* IT IS NOT A SILENT CAP, which is the whole difference between this and the
       top-N this project has deleted before: the foot says how many of how many
       are drawn, and the figure it counts is what the filter left. */
    is('and the foot says how many of how many',
      footSays === PAGE + ' of ' + audiences.length + '. Scroll for more.', footSays);

    const everyPage = await walk();
    is('every audience is reachable by scrolling',
      everyPage.length === audiences.length, everyPage.length + ' of ' + audiences.length);
    is('and none is drawn twice',
      new Set(everyPage.map((r) => r.key)).size === audiences.length,
      new Set(everyPage.map((r) => r.key)).size);
    is('and the order continues across the seam',
      sorted(everyPage, (r) => r.fullName) === '', sorted(everyPage, (r) => r.fullName));
    await rewind();
    await new Promise((r) => setTimeout(r, 120));
    is('the rows arrive sorted by full name', sorted(onLoad, (r) => r.fullName) === '',
      sorted(onLoad, (r) => r.fullName));

    /* ---- the one order ---- */
    /* THE THREE TOGGLES ARE GONE and so are the assertions that pressed them --
       Type sorts by type, City sorts by city, one on after two presses. **What
       they were FOR survives**: the order itself, which is name A to Z and is
       walked over the whole list below.
         THE BLANK-SINKS RULE IS KEPT AND MOVED TO THE NAME, which is the column
       the list is ordered on now. A blank has no position in an alphabet, so it
       sinks rather than leading -- putting it at the top would be the list
       asserting something it does not know.
         MEASURED OVER EVERY ROW, NOT THE FIRST HUNDRED. The sink is a fact about
       the LIST, and a chunk of a hundred filled rows would pass on a page that
       was not sinking anything. */
    const orderWalk = await walk();
    await rewind();
    await new Promise((r) => setTimeout(r, 120));
    const nms = orderWalk.map((r) => r.fullName);
    const nblank = nms.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
    const nfilled = nms.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    is('a nameless row would sink to the end',
      nblank.length === 0
        || (nfilled.length > 0
            && Math.min.apply(null, nblank) > Math.max.apply(null, nfilled)),
      nblank.length + ' nameless, first at '
        + (nblank.length ? Math.min.apply(null, nblank) : '-')
        + ', last named at ' + (nfilled.length ? Math.max.apply(null, nfilled) : '-'));

    /* ---- the list is whole and nothing is narrowing it ---- */
    /* IT WAS `sorting hides nothing`, and there is no sort to press. The claim
       that survives is the one that mattered: after walking the whole list and
       rewinding, the room is back to one chunk with NOTHING filtered -- so a
       walk cannot leave a narrowing behind. */
    const afterSorts = await page.evaluate(() => ({
      rows: document.querySelectorAll('.aud').length,
      clear: document.getElementById('clearBtn').getAttribute('aria-disabled')
    }));
    is('the list is back to one chunk', afterSorts.rows === PAGE, afterSorts.rows);
    is('and Clear is dark, because nothing is narrowing',
      afterSorts.clear === 'true', afterSorts.clear);

    /* ---- the search still narrows, and the order survives it ---- */
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'chicago';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    const narrowed = await names();
    is('the search still narrows', narrowed.length > 0 && narrowed.length < PAGE,
      narrowed.length);
    /* A FILTER RESETS TO THE TOP. Holding the position would land you on
       whatever happens to be 300th in a completely different list. */
    /* A FILTER PUTS THE LIST BACK TO ONE CHUNK. It was `the pager is on page
       one`; the pager is gone and the list grows by scrolling, so the same rule
       is read off the number of badges. */
    const backAtOne = await page.evaluate(() => document.querySelectorAll('.aud').length);
    is('and a filter puts the list back to one chunk', backAtOne <= PAGE, backAtOne);
    const whileNarrowed = await page.evaluate(() => document.getElementById('blurbCount').textContent.trim());
    is('the count does not move with a filter',
      whileNarrowed === String(audiences.length), whileNarrowed + ' while ' + narrowed.length + ' shown');
    /* ORDERED BY NAME, which is the only order there is. It read `home` here,
       left over from a City sort that had been pressed a few lines above -- with
       the toggles gone there is nothing to have chosen, and a filter must not
       disturb the one order. */
    is('and what is left is still in order',
      sorted(narrowed, (r) => r.fullName) === '', sorted(narrowed, (r) => r.fullName));

    /* ---- the head ---- */
    const head = await page.evaluate(() => {
      const b = document.querySelector('.room-blurb');
      const cs = getComputedStyle(b);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      return {
        title: (document.querySelector('.room-title') || {}).textContent.trim(),
        wrap: cs.whiteSpace,
        lines: Math.round(b.getBoundingClientRect().height / lh),
        count: document.getElementById('blurbCount').textContent.trim(),
        blurb: b.textContent.trim(),
        theads: document.querySelectorAll('.aud-head').length,
        panelHeads: document.querySelectorAll('.panel-head').length,
        ths: document.querySelectorAll('.aud-head .th-sort').length,
        headWords: [].slice.call(document.querySelectorAll('.aud-head .th-sort')).map(function(t){return t.textContent.trim();}).join('|'),
        cells: document.querySelectorAll('.aud [data-field]').length
      };
    });
    is('the room is named Audience Queue', head.title === 'AUDIENCE QUEUE', head.title);
    /* NO HEADER AT ALL. It was the sort bar, and with one order there is
       nothing for it to offer -- the list is badges and nothing above them. */
    is('the badges have no header above them', head.theads === 0, head.theads);
    is('and no panel bar above it', head.panelHeads === 0, head.panelHeads);
    is('and no sort toggles anywhere', head.ths === 0, head.ths);

    is('and the row draws exactly those columns',
      head.cells > 0, head.cells);   // the badge draws fields, not columns
    is('the count leads the blurb', head.count === String(audiences.length), head.count);
    is('and does not say the noun twice',
      head.blurb.indexOf(' on file. Audiences are') > 0, head.blurb.slice(0, 40));
    is('the blurb does not wrap', head.wrap === 'nowrap', head.wrap);
    is('and holds one line', head.lines === 1, head.lines);

    /* ---- what an opened row shows ----
       KEY AND NAME ARE NOT REPEATED. The closed row above already draws both,
       and `name` is editable up there, so nothing became unreachable -- which
       is the test for taking a field off a form. */
    /* NOTHING TO OPEN. The badge is solid, so the fields are simply there. */
    const detail = await page.evaluate(() => {
      const d = document.querySelector('.aud');
      const fields = [].slice.call(d.querySelectorAll('[data-field]')).map((f) => f.dataset.field);
      return {
        fields: fields,
        labels: [].slice.call(d.querySelectorAll('.flabel')).map((l) => l.textContent.trim()),
        groups: [].slice.call(d.querySelectorAll('.fgroup')).map((g) => g.textContent.trim()),
        first: d.querySelector('.fields > *').classList.contains('field--colours') ? 'colours' : 'something else'
      };
    });
    /* THE DETAIL SHOWS EVERY FIELD NOW. It skipped `id` and `name` while the
       closed row drew them; the closed row draws neither, so skipping them
       would leave `name` -- which is editable -- reachable from nowhere. */
    /* THE KEY IS THE BADGE'S FOOT, NOT A FIELD. It is drawn as one black cell
       reading `ID: chicago-bears` at the bottom of the card, so it carries no
       `.flabel` -- which is why this asks for the cell rather than the label. */
    const keyFoot = await page.evaluate(() => {
      const f = document.querySelector('.aud .aud-id');
      return f ? f.textContent.trim() : '(no id cell)';
    });
    /* NO `ID: ` PREFIX ANY MORE. It was a `::before`, which is the mechanism
       the empty-field placeholder uses -- so the foot read as a filled field
       drawing a name. The bar is reversed out, which is what says it is the
       key, and the key is now editable like every other field. */
    is('the key is drawn as the foot of the badge',
      /^[a-z0-9-]+$/.test(keyFoot), keyFoot);
    /* `name` IS GONE FROM THE TABLE, so the assertion is the other way round
       now: the badge must carry `full_name` -- which is the key the row is made
       of -- and must NOT carry a field for a column that no longer exists,
       which would render `none` on all 641. */
    /* THE TWO HALVES, NOT THE WHOLE NAME. `full_name` is still what the key
       was made from and is still rewritten from the pair on every edit; it is
       simply not drawn, because `first` and `last` are.
         BY FIELD, NOT BY LABEL. **The badge carries no labels at all now** -- a
       word under every value on every card is a column heading repeated a
       hundred times, and a field's name is drawn only where the field is EMPTY,
       as its placeholder. So this asks the cells. */
    is('and both halves of the name',
      detail.fields.indexOf('first') >= 0 && detail.fields.indexOf('last') >= 0,
      detail.fields.slice(0, 6));
    is('and nothing for the dropped `name`',
      detail.fields.indexOf('name') === -1, detail.fields.join(','));
    /* THE OTHER THREE CLOSED-ROW COLUMNS ARE STILL THERE, deliberately: they
       are editable, and a reader opening a row to work through every field
       would otherwise find three gaps. */
    is('and every other field the table has',
      /* `full_name` IS NOT DRAWN. Its two HALVES are -- `first` over its
         label and `last` over its own -- and the whole name beside them would
         be the same words three times. */
      ['type', 'city', 'first', 'last', 'primary']
        .every((k) => detail.fields.indexOf(k) >= 0), detail.fields.slice(0, 6));
    /* NO GROUP HEADINGS AT ALL. Every field carries its own column name, so
       IDENTITY / WHERE / KEYS were a second layer of labelling over things
       already labelled. The GROUPING still exists in `COLUMNS.g` and still sets
       the ORDER the fields come out in; it is simply not drawn. */
    is('the badge draws no group headings', detail.groups.length === 0, detail.groups);
    /* THE COLOURS COME FIRST, which is the one field you can read from across a
       list without reading. */
    is('the colour cube is the first thing on the badge',
      detail.first === 'colours', detail.first);

    /* ---- the page is its own height ----
       THE LIST SCROLLS INSIDE ITS PANEL, so the document should be about one
       screen tall however many rows there are. It was 34,260px against a 900px
       viewport: 641 absolutely-positioned `.sr` spans whose containing block
       was `main.app` -- outside the scroll container, so the clip never reached
       them -- sitting at their static positions, the last 34,260px down.

       MEASURED AGAINST THE ROW COUNT, not against a number, so the assertion
       says the real thing: the page must not grow with the list. */
    /* THE SEARCH IS STILL NARROWING FROM THE TEST ABOVE, and a short list does
       not need to scroll -- so measuring here would be measuring the filter. */
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 300));
    const height = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight,
      view: window.innerHeight,
      rows: document.querySelectorAll('.aud').length,
      panel: Math.round(document.querySelector('.panel-body').getBoundingClientRect().height),
      panelScroll: Math.round(document.querySelector('.panel-body').scrollHeight)
    }));
    /* THE PANEL NO LONGER SCROLLS INSIDE ITSELF, and the page does. It was
       the other way round -- `max-height: 72vh; overflow: auto` -- which put a
       scrollbar inside a scrollbar: the wheel meant two different things an
       inch apart and a badge could never be read against the room's own head.
         BOTH HALVES ARE ASSERTED. A panel that does not scroll AND a page that
       does not grow would mean the list had silently stopped being drawn, so
       neither reading is worth anything on its own. */
    is('the panel does not scroll inside itself',
      height.panelScroll <= height.panel + 2,
      height.panel + ' tall, ' + height.panelScroll + ' of content');
    is('and the badges are on the page, which scrolls',
      height.doc > height.view && height.rows === PAGE,
      height.doc + 'px document, ' + height.view + 'px viewport, ' + height.rows + ' rows');

    const navSays = require('fs').readFileSync('C:/Code/the-game-bureau/mc/js/admin-nav-menu.js', 'utf8');
    is('the nav card says what the room says',
      /* SPLIT ON THE SEPARATOR, NEVER A REGEX. The first version stripped the
         count with `^\d+ on file. ` and the backslash was eaten on the way into
         the file, leaving `^d+`, which matches nothing -- so the assertion
         failed on copy that was perfectly correct. There is nothing to escape
         if there is no pattern. */
      navSays.indexOf(head.blurb.split(' on file. ')[1]) > 0,
      head.blurb.slice(0, 46));

    /* ---- the badge wears its club's own primary ---- */
    const paint = await page.evaluate(() => {
      const cards = [].slice.call(document.querySelectorAll('.aud'));
      const withLine = cards.filter((c) => c.style.getPropertyValue('--aud-line'));
      const one = withLine[0];
      const bare = cards.filter((c) => !c.style.getPropertyValue('--aud-line'))[0];
      return {
        cards: cards.length,
        coloured: withLine.length,
        /* THE BORDER TAKES IT, and the left edge carries it at full strength --
           1px of a pale club colour says nothing across a list of 641. The edge
           is on the BADGE now; it was on a face, and the face went with the
           collapse. */
        border: getComputedStyle(one).borderTopColor,
        edge: getComputedStyle(one).boxShadow,
        line: one.style.getPropertyValue('--aud-line').trim(),
        /* AND A CLUB WITH NO PRIMARY FALLS BACK to the room's own line rather
           than to a border of nothing, which would read as a card that failed
           to draw. */
        bareBorder: bare ? getComputedStyle(bare).borderTopColor : '(every one has a colour)',
        /* THREE ACROSS, so the gap between cards[0] and cards[1] is
           HORIZONTAL and the vertical one is to the card a row below.
           Measuring the old way returned -383px -- a correct reading of a
           layout that had changed under the assertion. */
        perRow: cards.filter((c) =>
          Math.abs(c.getBoundingClientRect().top - cards[0].getBoundingClientRect().top) < 2).length,
        colGap: cards.length > 1
          ? Math.round(cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().right)
          : -1,
        rowGap: cards.length > 3
          ? Math.round(cards[3].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom)
          : -1,
        radius: getComputedStyle(one).borderTopLeftRadius
      };
    });
    is('most badges carry their own colour', paint.coloured > paint.cards * 0.8,
      paint.coloured + ' of ' + paint.cards);
    is('and the border really takes it',
      paint.border.replace(/\s/g, '') === hexToRgb(paint.line),
      paint.border + ' vs ' + paint.line);
    is('the left edge carries it at full strength',
      paint.edge.indexOf('inset') >= 0, paint.edge);
    is('a club with no primary still has a border',
      paint.bareBorder === '(every one has a colour)'
        || paint.bareBorder !== 'rgba(0, 0, 0, 0)', paint.bareBorder);
    is('the badges sit three across', paint.perRow === 3, paint.perRow + ' per row');
    is('and are detached, not a table',
      paint.colGap > 0 && paint.rowGap > 0,
      paint.colGap + 'px across, ' + paint.rowGap + 'px down');
    is('and rounded', parseFloat(paint.radius) > 0, paint.radius);

    /* ---- the opened badge shows EVERY column the table has ----
       Both directions matter and they fail differently. A column the table has
       and the room does not is a value nobody can see or correct; one the room
       has and the table does not renders as a permanently empty field that
       looks like missing data -- which is exactly what `espn_id` did for the
       hour between the column being dropped and this check existing.
         MEASURED AGAINST THE LIVE TABLE, not a list written out here, so the
       assertion cannot drift from the schema it is about. */
    /* ONE COLUMN IS DELIBERATELY OFF THE BADGE, and it is NAMED rather than the
       check being loosened: `home_place_id` is the key the room writes from the
       city and is what decides a game's rival, but it is derived and reads
       `none` on 381 badges. Anything else missing is a value nobody can see. */
    const OFF_BADGE = [
      /* THE KEY THE ROOM WRITES FROM THE CITY. Derived, and `none` on 381
         badges -- but it is what decides a game's rival. */
      'home_place_id',
      /* THE LEAGUE AND THE CLUB CODE. They were one packed `team_key` until
         2026090119 split it and dropped it -- the split exists because without
         the league `destinations.id` COLLIDES: the Florida Panthers and the
         Florida International Panthers are both Miami and both Panthers.
           NEITHER IS DRAWN, inheriting `team_key`'s own exemption: `teams`,
         `destinations`, the rival rule and every ladder rung read them, and
         nobody reads a club code off a list. The league IS on screen -- as the
         FILTER at the top of the room, which is where it is useful. */
      'league', 'code',
      /* THE WHOLE NAME, WHICH THE BADGE DOES NOT DRAW because `first` and
         `last` are drawn instead. It is still the column, still NOT NULL, and
         still rewritten from the pair on every edit -- so it is exempt here
         rather than missing, and a check that simply stopped asking would hide
         the day it stops being maintained. */
      'full_name',
      /* THE KEY, WHICH IS DRAWN AND IS NOT A FIELD. It is the badge's foot --
         one black cell at the bottom of the card -- so it carries no
         `data-field` and no label for the column sweep to find. Exempt here
         rather than missing, and asserted separately above. */
      'id',
      /* `nickname` IS NOT LISTED BECAUSE IT IS NOT A COLUMN. 2026090118
         dropped it -- `last` below IS the mascot -- and this list is filtered
         against the LIVE columns, so naming a dropped one would be dead
         weight rather than an exemption. */
      /* THE TWO HALVES OF `full_name`, added 2026090117. They are not drawn
         either, and for a different reason from the mascot: they are halves of
         a field the badge ALREADY SHOWS, so drawn as their own rows the card
         would print the name three times -- whole, then in pieces. What they
         decide is where the heading breaks, which the badge does draw. */
      'first', 'last'
    ];
    const tableCols = Object.keys(audiences[0]).filter((k) => OFF_BADGE.indexOf(k) === -1).sort();
    const roomCols = await page.evaluate(() => {
      const d = document.querySelector('.aud');
      const shown = [].slice.call(d.querySelectorAll('[data-field]')).map((f) => f.dataset.field);
      /* THE READ-ONLY ONES CARRY NO `data-field`, and with the labels gone they
         carry no name on screen either -- so they are found by the CLASS that
         makes them read-only, one per locked column, in the order the column
         list puts them: the key is the badge's foot and the two stamps are the
         pair at the bottom of the fields.
           IT WAS `.flabel`, WHICH NO LONGER EXISTS, so the key and both stamps
         read as missing from a badge that plainly draws them. */
      const locked = [].slice.call(d.querySelectorAll('.fval.is-locked'));
      const labels = (d.querySelector('.aud-id') ? ['id'] : [])
        .concat(locked.length >= 2 ? ['created', 'updated'] : []);
      return { shown: shown, labels: labels };
    });
    const missingFromRoom = tableCols.filter((k) => roomCols.shown.indexOf(k) === -1);
    /* THE READ-ONLY THREE, checked by label rather than by data-field. The pair
       of stamps was `created_at` / `updated_at` and is now `created` /
       `updated` -- 2026090111 renamed the first and 2026090114 the second, so a
       list written against the old names reports two present columns missing. */
    const readOnly = { id: 'id', created: 'created', updated: 'updated' };
    const reallyMissing = missingFromRoom.filter((k) =>
      !readOnly[k] || roomCols.labels.indexOf(readOnly[k]) === -1);
    is('the expand shows every column the table has',
      reallyMissing.length === 0, reallyMissing);

    /* ---- the write path ------------------------------------------------
       FOLDED IN FROM `audiences-room.js`, WHICH IS DELETED. That suite drove
       this room in jsdom against a table with an expanding `tr.row-detail` per
       row; the room is one solid badge now, so every selector in it named
       something that no longer exists. What was worth keeping is the half no
       other check covers -- what actually LEAVES the page -- and it belongs
       here, where the page is already loaded and already works.
       Nothing reaches the database: every write is intercepted above. */

    /* AN ALIAS IS LOWERCASED ON THE WAY IN, because `audiences_aliases_lower`
       refuses a capital -- so a room that sent what was typed would be refused
       by a constraint the person cannot see. */
    const aliasPatch = await page.evaluate(async () => {
      const card = document.querySelector('.aud');
      const cell = card.querySelector('[data-field="audience_aliases"]');
      if (!cell) return 'no aliases field';
      cell.click();
      const box = cell.querySelector('input');
      if (!box) return 'no box';
      box.value = ' Da Bears / MONSTERS of the Midway ';
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 600));
      return 'sent';
    });
    const patch = writes.filter((w) => w.method === 'PATCH').pop();
    is('a cell opens into a box and Enter writes', aliasPatch === 'sent' && !!patch, aliasPatch);
    is('aliases go as an array', !!patch && Array.isArray(patch.body.audience_aliases),
      patch && JSON.stringify(patch.body));
    /* WHAT IS TYPED IS WHAT IS STORED. It was lowercased on the way in because
       `audiences_aliases_lower` refused a capital; 2026090124 dropped that, so
       the room must stop rewriting what somebody typed. **The cost is that the
       column no longer guarantees case** -- any matcher has to lowercase both
       sides -- and this is the assertion that would catch the lowercasing
       coming back. */
    is('the case somebody typed is kept',
      !!patch && (patch.body.audience_aliases || []).join('|') === 'Da Bears|MONSTERS of the Midway',
      patch && patch.body.audience_aliases);
    /* TRIMMED AND SPLIT ON THE SLASH STILL, and a blank member is still refused
       by `audiences_aliases_not_blank`. */
    is('and each is trimmed with no blank members',
      !!patch && (patch.body.audience_aliases || [])
        .every((a) => a === a.trim() && a.length > 0),
      patch && patch.body.audience_aliases);
    /* PostgREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES, so a write
       that does not read the row back reports a refusal as a success. */
    is('and it asks for the row back',
      !!patch && /return=representation/.test(patch.headers.prefer || patch.headers.Prefer || ''),
      patch && (patch.headers.prefer || patch.headers.Prefer));

    /* ---- MANUAL writes a row and reloads ---- */
    /* THERE IS NO DIALOG. It collected a name, a type and a city and then handed
       you the same four fields to edit on the badge -- a second way to do one
       thing -- so pressing MANUAL now writes a placeholder row and reloads.
         WHAT IS ASSERTED IS WHAT LEAVES THE PAGE, not what a form reads back.
       The old probe typed a name, read the key preview and checked the dialog
       opened, all of which stayed true while the dialog wrote a row with no
       `first` and no `last` -- a name its own badge could not draw. */
    const manualBefore = writes.filter((w) => w.method === 'POST').length;
    /* THE RELOAD DESTROYS THE EXECUTION CONTEXT, so the press cannot be made
       from inside `page.evaluate` -- the call never returns and the run dies
       with `Execution context was destroyed`, which reads as the page crashing.
       Clicking from Node and watching the navigation from Node is the only way
       to observe a control whose last act is to reload. */
    const navsBefore = navs;
    await pressManual();
    const manualPost = writes.filter((w) => w.method === 'POST').pop();
    is('MANUAL opens no dialog', !(await page.evaluate(() => !!document.getElementById('addDlg'))));
    /* THE SHAPE, NOT THE LITERAL `_NAME`. This suite reads the LIVE table, so
       the moment somebody presses MANUAL in a real browser `_NAME` is taken and
       the room correctly composes `_NAME 2` -- **an assertion that hardcodes
       `-name` fails on a room that is working exactly as designed.** What is
       true whatever is on file: the name starts `_NAME`, and both halves of the
       write agree with each other. */
    const looksBlank = (b) => !!b
      && /^_NAME( \d+)?$/.test(b.first || '')
      && b.last === '_LAST'
      && b.full_name === (b.first + ' ' + b.last);
    is('and writes a placeholder row', looksBlank(manualPost && manualPost.body),
      manualPost && manualPost.body);
    /* AND CHOOSES NO TYPE. It wrote `fandom` -- now `sports` -- which unlike `_NAME` and `_LAST`
       looks exactly like an answer -- so a row created five seconds ago claimed
       a type nobody had picked. 2026090121 dropped the NOT NULL so the column
       can simply be unset, and the badge draws `TYPE` in the empty cell. */
    is('and picks no type for you',
      !!(manualPost && manualPost.body && manualPost.body.type === undefined),
      manualPost && manualPost.body && manualPost.body.type);
    /* AND IT HOLDS THE ROW IT JUST MADE AT THE TOP. Asserted HERE rather than
       further down, because every Clear in this suite now releases the pin --
       and the row is only pinned by MANUAL itself. */
    const pinnedByManual = await page.evaluate(() => {
      const held = document.querySelector('.aud.is-pinned');
      return { search: location.search, id: held ? held.dataset.row : '',
               first: held === document.querySelector('.aud') };
    });
    is('and holds the new row at the top',
      pinnedByManual.first && /[?&]new=/.test(pinnedByManual.search),
      pinnedByManual.search + ' ' + pinnedByManual.id);
    /* `first` AND `full_name` BOTH. The badge draws the HALVES and `full_name`
       is NOT NULL, so writing one without the other is the fault that shipped
       from the dialog.
         AND THE KEY IS THE SLUG OF THE NAME, which is the room's whole naming
       convention and the thing nothing in the database enforces. */
    is('with the key its own name slugs to',
      !!(manualPost && manualPost.body
         && manualPost.body.id === manualPost.body.full_name
              .toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      manualPost && manualPost.body && manualPost.body.id);
    is('and asks for the row back, since RLS answers 200 with an empty array',
      !!(manualPost && /return=representation/.test(
        manualPost.headers.prefer || manualPost.headers.Prefer || '')),
      manualPost && (manualPost.headers.prefer || manualPost.headers.Prefer));
    is('and then reloads the page', navs > navsBefore, navs - navsBefore);
    is('exactly one row was written',
      writes.filter((w) => w.method === 'POST').length === manualBefore + 1,
      writes.filter((w) => w.method === 'POST').length - manualBefore);

    /* IMMEDIATELY AFTER THE FIRST, AND THAT IS NOT TIDINESS. Every probe below
       edits `document.querySelector('.aud')` -- the FIRST card -- which is the
       placeholder this press just wrote, because `_NAME` sorts to the top. So a
       second press run later in the suite was reading a row some other probe had
       renamed, and it composed the first key again. **The two presses have to be
       adjacent or they are not testing each other.** */
    /* THE DUPLICATE-KEY GUARD IS THE SECOND PRESS. The dialog refused a key that
       already existed before any request; MANUAL cannot be refused that way,
       because it CHOOSES a free name -- so the same guard is asserted the other
       way round: press it twice and the second row must not collide.
         `_NAME 2` IS THE FIRST FREE ONE, and the check reads the rows in memory,
       which the reload between the two presses has just refreshed. */
    const twoBefore = writes.filter((w) => w.method === 'POST').length;
    await pressManual();
    const second = writes.filter((w) => w.method === 'POST').pop();
    is('a second press does not collide on the key',
      !!(second && second.body && manualPost && manualPost.body
         && second.body.id !== manualPost.body.id && looksBlank(second.body)),
      second && second.body && (manualPost.body.id + ' then ' + second.body.id));
    is('and it is one more row, not two',
      writes.filter((w) => w.method === 'POST').length === twoBefore + 1,
      writes.filter((w) => w.method === 'POST').length - twoBefore);

    /* CLOSE ANY EDITOR THIS SUITE LEFT OPEN. `editing` is ONE FLAG for the whole
     room, so a probe that walks away from an open box makes the NEXT probe's
     click do nothing -- and it then reports "(nothing sent)", which reads as
     the page refusing to save. **This suite has been bitten by that twice**,
     once on the colour probe and once on the name probe, and which one fails
     depends only on the order they run in. A probe that leaves state behind is
     a probe that fails its neighbours. */
  const closeAnyEditor = async () => {
    await page.evaluate(() => {
      const box = document.querySelector('.ed-box');
      if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 120));
  };

    /* ---- the key follows the name, live ---- */
    /* `id` IS `slug(full_name)` -- the room's whole naming convention, which
       NOTHING IN THE DATABASE ENFORCES -- so a renamed row that kept its old key
       would be the one place that convention is broken, silently.
         **THIS REVERSES A DELIBERATE REFUSAL AND THE CASCADE IS WHY IT IS
       SAFE.** The room would not rename from a cell edit because moving a key
       moves what points at it; 2026090113 gave all three incoming foreign keys
       `ON UPDATE CASCADE`, so `game_templates` and both `games` columns follow
       in the same statement.
         THE FILTER IS THE OLD KEY AND THE BODY IS THE NEW ONE, which is the
       half that is easy to get backwards: `patchRow` addresses the row by
       `row.id`, so a patch that had already moved it in memory would address a
       row that does not exist yet and answer 200 with an empty array. */
    await closeAnyEditor();
    const keyBefore = writes.length;
    const renamed = await page.evaluate(async () => {
      const card = document.querySelector('.aud');
      const was = card.dataset.row;
      const cell = card.querySelector('[data-field="first"]');
      cell.click();
      const box = cell.querySelector('input');
      if (!box) return { was: was, opened: false };
      box.value = 'Zed';
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 300));
      return { was: was, opened: true };
    });
    const keyPatch = writes.slice(keyBefore).filter((w) => w.method === 'PATCH').pop();
    is('renaming a half moves the key with it',
      !!(renamed.opened && keyPatch && keyPatch.body
         && keyPatch.body.id === keyPatch.body.full_name
              .toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      keyPatch && keyPatch.body);
    is('and addresses the row by the key it still has',
      !!(keyPatch && keyPatch.url.indexOf('id=eq.' + renamed.was) !== -1),
      keyPatch && keyPatch.url.replace(/^.*rest\/v1\//, ''));
    is('and the three travel in one patch',
      !!(keyPatch && keyPatch.body && keyPatch.body.first
         && keyPatch.body.full_name && keyPatch.body.id),
      keyPatch && Object.keys(keyPatch.body || {}).join(','));


  /* EDITING A HALF REWRITES THE WHOLE NAME, and it is the assertion that
     matters most on this card: `full_name` is NOT NULL and is NOT DRAWN -- the
     badge shows `first` and `last` -- so a save that moved a half and left the
     name alone would put a row on file whose name contradicts its own two
     halves, invisibly.
       THE OTHER HALF IS READ OFF THE ROW, never off the screen: the editor runs
     from one cell and only ever knows what it was given. */
  const nameWrite = await (async () => {
    await closeAnyEditor();
    const before = writes.length;
    const other = await page.evaluate(() => {
      const card = document.querySelector('.aud');
      const l = card.querySelector('[data-field="last"]').textContent.trim();
      const cell = card.querySelector('[data-field="first"]');
      cell.click();
      const box = cell.querySelector('input');
      if (!box) return null;
      box.value = 'Probe';
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return l;
    });
    await new Promise((r) => setTimeout(r, 200));
    const sent = writes.slice(before).filter((w) => w.method === 'PATCH').pop();
    return { other: other, body: sent ? sent.body : null };
  })();
  is('editing a half sends that half',
    !!(nameWrite.body && nameWrite.body.first === 'Probe'),
    nameWrite.body ? JSON.stringify(nameWrite.body) : '(nothing sent)');
  is('and rewrites full_name from the pair, in the same patch',
    !!(nameWrite.body
       && nameWrite.body.full_name === ('Probe ' + nameWrite.other).trim()),
    nameWrite.body ? String(nameWrite.body.full_name) : '(nothing sent)');

  /* THE HASH IS PUNCTUATION, NOT A DECISION. Six hex digits pasted out of a
     brand guide arrive with no `#`, and typing one in front of a value that
     already has one gives two -- both were refused with a sentence about a
     character rather than the colour being saved. Every leading hash is
     dropped and exactly one is put back.
       THE SIX DIGITS ARE STILL NOT FORGIVEN, which is the half that matters:
     a value that is not a colour draws NOTHING on a swatch and looks exactly
     like an empty cell, so it is refused as it always was.
       THE WRITES ARE RECORDED IN NODE, not in the page -- they come off the
     request interception -- so the typing happens in the browser and the
     reading happens here, one value at a time. A probe that reached for a
     `window.__writes` would find nothing and report every colour refused. */
  const typeColour = async (text) => {
    await closeAnyEditor();
    const before = writes.length;
    const opened = await page.evaluate((v) => {
      const cell = document.querySelector('.aud [data-field="primary"]');
      cell.click();
      const box = cell.querySelector('input');
      /* IT SAYS SO RATHER THAN RETURNING QUIETLY. `editing` is ONE flag for the
         whole room, so an editor left open anywhere makes `startEdit` refuse --
         and a silent return here reported `(nothing sent)`, which reads as the
         page failing to save a colour it never got. */
      if (!box) return false;
      box.value = v;
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    }, text);
    if (!opened) return '(no editor opened)';
    /* WAIT ON THE WRITE, NEVER ON A CLOCK. This was a flat 160ms and failed
       about one run in five on a busy machine: the PATCH had not landed, the
       probe read `(nothing sent)`, and three assertions went red about a page
       that was perfectly correct. **A check that passes only sometimes is worth
       nothing.** */
    for (let i = 0; i < 100 && writes.length === before; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const sent = writes.slice(before).filter((w) => w.method === 'PATCH').pop();
    /* `body` IS ALREADY PARSED. The interceptor above runs `JSON.parse` when it
       records the request, so parsing it again throws
       `"[object Object]" is not valid JSON` -- which reads as the page sending
       something malformed and was the probe. */
    return sent && sent.body ? sent.body.primary : '(nothing sent)';
  };
  const bare = await typeColour('0b162a');
  const one  = await typeColour('#1A2B3C');
  const two  = await typeColour('##4D5E6F');
  const junk = await typeColour('not a colour');

  is('a colour with no hash gets one', bare === '#0B162A', bare);
  is('and one with a hash keeps exactly one', one === '#1A2B3C', one);
  is('and two hashes come back as one', two === '#4D5E6F', two);
  is('but six hex digits are still required', junk === '(nothing sent)', junk);

  /* ---- MORE: ONE URL, WITH OR WITHOUT A SCHEME -----------------------------
     THE COLUMN TAKES IT EITHER WAY AND STORES WHAT WAS TYPED. `https://` is
     added when the LINK is built, not on the way into the database, so the cell
     shows the value the row really holds -- and these two assertions are what
     would catch a normaliser being added on the write path, which is the
     silent-rewrite fault this table already fixed once for its aliases.
       THE DOOR IS A SIBLING OF THE CELL, and that is the load-bearing half.
     Both the click handler and the `focusin` handler ask
     `closest('.ed')`, so an anchor INSIDE the value would bubble to them and a
     press would navigate AND open the editor over the cell it was leaving. */
  const typeMore = async (text) => {
    await closeAnyEditor();
    const before = writes.length;
    const opened = await page.evaluate((v) => {
      const cell = document.querySelector('.aud [data-field="more"]');
      if (!cell) return false;
      cell.click();
      const box = cell.querySelector('input');
      if (!box) return false;
      box.value = v;
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return true;
    }, text);
    if (!opened) return '(no editor opened)';
    for (let i = 0; i < 100 && writes.length === before; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const sent = writes.slice(before).filter((w) => w.method === 'PATCH').pop();
    return sent && sent.body && 'more' in sent.body ? sent.body.more : '(nothing sent)';
  };
  /* THE DOOR AS THE BROWSER RESOLVES IT. `a.href` is the ABSOLUTE url, which is
     exactly what is wanted here -- the claim is that a scheme-less value ends up
     somewhere a browser can go. */
  /* IT SETTLES RATHER THAN READING ONCE. `typeMore` waits for the PATCH to be
     RECORDED, and the badge is not repainted until the reply RESOLVES -- so a
     single read after the write returned the door the row had BEFORE it, and
     one assertion went red about a page that was perfectly correct. The colour
     probe never met this because it only ever reads the request body.
       A TIMEOUT RETURNS THE STALE VALUE, so a door that never updates fails
     naming what it is still pointing at rather than hanging. */
  const doorOf = async (want) => {
    let state = await readDoor();
    for (let i = 0; i < 100 && want && state.href !== want; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
      state = await readDoor();
    }
    return state;
  };
  const readDoor = () => page.evaluate(() => {
    const field = document.querySelector('.aud .field--more');
    const a = field && field.querySelector('.fopen');
    return {
      drawn: !!a,
      href: a ? a.href : '',
      target: a ? a.getAttribute('target') : '',
      rel: a ? a.getAttribute('rel') : '',
      insideCell: !!(a && a.closest('.ed')),
      text: field ? (field.querySelector('.fval') || {}).textContent : ''
    };
  });

  const emptyDoor = await doorOf('');
  is('an empty MORE draws no door', emptyDoor.drawn === false, emptyDoor);

  const bareUrl = await typeMore('thegamebureau.com');
  const bareDoor = await doorOf('https://thegamebureau.com/');
  is('a url with no scheme is stored as typed',
    bareUrl === 'thegamebureau.com', bareUrl);
  is('and the door adds https:// for it',
    bareDoor.href === 'https://thegamebureau.com/', bareDoor.href);
  is('and the cell still shows what was typed',
    bareDoor.text === 'thegamebureau.com', bareDoor.text);
  is('the door is a sibling of the cell, not inside it',
    bareDoor.drawn && bareDoor.insideCell === false, bareDoor);
  is('and it opens in a new tab, with the opener cut',
    bareDoor.target === '_blank' && /noopener/.test(bareDoor.rel), bareDoor);

  const schemed = await typeMore('https://example.org/x?a=1');
  const schemedDoor = await doorOf('https://example.org/x?a=1');
  is('a url that carries a scheme keeps exactly one',
    schemed === 'https://example.org/x?a=1', schemed);
  is('and the door is that url unchanged',
    schemedDoor.href === 'https://example.org/x?a=1', schemedDoor.href);

  /* `javascript:alert(1)` PARSES PERFECTLY WELL AS A URL, so without the
     protocol test that string would become a live `href` on an admin page. */
  const evil = await typeMore('javascript:alert(1)');
  const evilDoor = await doorOf('https://example.org/x?a=1');
  is('a javascript: url is refused rather than linked',
    evil === '(nothing sent)', evil);
  is('and the row keeps the address it had',
    evilDoor.href === 'https://example.org/x?a=1', evilDoor.href);


    /* NOTHING LOOKS A CITY UP. 2026090120 severed every read of
       `public.places` from an audience -- the city is text on the row and
       `destinations`, `teams` and both label functions split it themselves. The
       room's own read went with them, so this asserts what the change WAS.
         IT READS THE REQUESTS, NOT THE SOURCE. A grep would match the comment
       explaining the removal, which this project has been caught by four times;
       what matters is whether the page ASKS. */
    is('the room never reads public.places',
      reads.filter((u) => /\/places(\?|$)/.test(u)).length === 0,
      reads.filter((u) => /\/places(\?|$)/.test(u)));

    /* ---- the type filter, and free text ---- */
    /* IT IS BUILT FROM THE ROWS, NEVER FROM `KINDS`. The column is free text
       since 2026090123, so a list of the four the room colours would miss a
       fifth somebody typed and offer choices with nothing behind them. */
    await closeAnyEditor();
    const typeCtl = await page.evaluate(() => {
      const tp = document.getElementById('typePick');
      return { present: !!tp,
               order: [].slice.call(
                 document.querySelectorAll('#cityPick, #typePick, #clearBtn')).map((e) => e.id),
               opts: tp ? [].slice.call(tp.options).map((o) => o.textContent) : [] };
    });
    is('there is a type filter', typeCtl.present, typeCtl.present);
    is('and it sits to the right of city',
      typeCtl.order.join('|') === 'cityPick|typePick|clearBtn', typeCtl.order);
    is('its options carry counts', typeCtl.opts.every((o) => /\(\d+\)$/.test(o)),
      typeCtl.opts.slice(0, 4));
    /* THE COUNT IS OVER THE WHOLE TABLE, never over what a search has left. */
    is('and Any type counts the room',
      typeCtl.opts[0] === 'Any type (' + audiences.length + ')', typeCtl.opts[0]);
    /* UNTYPED IS ITS OWN OPTION, because blank already means "any type" -- and
       it is the state every MANUAL row arrives in, so leaving it unreachable
       would put the newest rows behind a filter that cannot select them. */
    is('and untyped rows are reachable',
      typeCtl.opts.some((o) => /^No type \(/.test(o)), typeCtl.opts.slice(0, 3));

    const typeNarrow = await page.evaluate(async () => {
      const tp = document.getElementById('typePick');
      const pick = [].slice.call(tp.options).filter((o) => /^sports \(/.test(o.textContent))[0];
      if (!pick) return { picked: false };
      tp.value = pick.value;
      tp.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
      /* THE HELD ROW IS EXEMPT, and that is the pin working rather than the
         filter failing: a row pinned by MANUAL stays at the top whatever is
         filtered, or it would vanish from the list while you were editing it.
         The suite presses MANUAL earlier, so a pin is live from then on. */
      const kinds = [].slice.call(document.querySelectorAll('.aud:not(.is-pinned) [data-field="type"]'))
        .map((e) => e.textContent.trim());
      const clear = document.getElementById('clearBtn').getAttribute('aria-disabled');
      document.getElementById('clearBtn').click();
      await new Promise((r) => setTimeout(r, 250));
      return { picked: true, kinds: kinds,
               clear: clear, after: tp.value,
               rows: document.querySelectorAll('.aud').length };
    });
    is('choosing a type narrows to it',
      typeNarrow.picked && typeNarrow.kinds.length > 0
        && typeNarrow.kinds.every((k) => k === 'sports'),
      typeNarrow.kinds && typeNarrow.kinds.slice(0, 3));
    is('and it lights Clear', typeNarrow.clear === 'false', typeNarrow.clear);
    is('and Clear puts the picker back', typeNarrow.after === '', typeNarrow.after);

    /* ---- the pin -------------------------------------------------------------
       MANUAL writes a `_NAME` placeholder and reloads. That name sorts to the
       top only while it is still called that, so the moment you type a real one
       the row sorts away MID-EDIT -- and with a filter on it can leave the list
       altogether. `?new=<id>` holds it at position one until Clear releases it.
         WHAT IS ASSERTED IS THE THING THAT WAS WRONG: that it survives a rename
       and a filter, which are the two ways it used to move. */
    /* THE PIN COMES FROM THE URL HERE, not from another MANUAL press. Every
       Clear in this suite releases it, so by now there is none -- and pressing
       MANUAL again would write a THIRD placeholder row into the live table for
       no reason. `?new=` is the same machinery either way. */
    const pinTarget = audiences.filter((r) => /^_NAME/.test(String(r.first || '')))[0]
      || audiences[audiences.length - 1];
    await page.goto('http://127.0.0.1:8896/mc/audiences/?new='
      + encodeURIComponent(pinTarget.id), { waitUntil: 'networkidle0' });
    await authorize();
    await page.waitForFunction(() => document.querySelectorAll('.aud').length > 0,
      { timeout: 20000 });
    const pin = await page.evaluate(async () => {
      const first = () => document.querySelector('.aud');
      const held = () => document.querySelector('.aud.is-pinned');
      const out = { search: location.search };
      out.firstIsHeld = !!held() && held() === first();
      out.id = held() ? held().dataset.row : '';

      /* A RENAME RE-SLUGS THE KEY. Without the pin following it, the FIRST
         thing typed releases the hold -- which is the moment the pin is for. */
      const cell = held() && held().querySelector('[data-field="first"]');
      if (cell) {
        cell.click();
        const box = cell.querySelector('input');
        if (box) {
          box.value = 'Zzz Held';
          box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      out.afterRename = { search: location.search,
                          firstIsHeld: !!held() && held() === first(),
                          id: held() ? held().dataset.row : '',
                          name: first() ? (first().querySelector('[data-field="first"]') || {}).textContent : '' };

      /* AND IT SURVIVES A FILTER IT DOES NOT MATCH. Held only by the sort it
         would still disappear behind one -- and the row is a blank placeholder,
         so it matches almost none of them. */
      const q = document.getElementById('q');
      q.value = 'chicago';
      q.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 400));
      out.afterFilter = { firstIsHeld: !!held() && held() === first(),
                          rows: document.querySelectorAll('.aud').length,
                          othersMatch: [].slice.call(
                            document.querySelectorAll('.aud:not(.is-pinned)'))
                            .every((c) => /chicago/i.test(c.textContent)) };

      /* CLEAR IS THE RELEASE. */
      document.getElementById('clearBtn').click();
      await new Promise((r) => setTimeout(r, 400));
      out.afterClear = { search: location.search,
                         held: !!held(),
                         rows: document.querySelectorAll('.aud').length };
      return out;
    });
    is('a ?new= link holds that row at the top',
      pin.firstIsHeld && /[?&]new=/.test(pin.search), pin.search + ' ' + pin.id);
    /* THE ONE THAT MATTERS. The key moves when the name does, so a pin that did
       not follow would be released by the first keystroke. */
    is('and the hold survives a rename that moves the key',
      pin.afterRename.firstIsHeld && pin.afterRename.id !== pin.id
        && pin.afterRename.search.indexOf(encodeURIComponent(pin.afterRename.id)) > 0,
      pin.id + ' -> ' + pin.afterRename.id + ' ' + pin.afterRename.search);
    is('and the row really was renamed', /Zzz Held/.test(pin.afterRename.name || ''),
      pin.afterRename.name);
    /* IT IS IN THE LIST WHETHER OR NOT IT MATCHES, or the pin would hold a row
       a filter had already hidden. */
    is('and it survives a filter it does not match',
      pin.afterFilter.firstIsHeld && pin.afterFilter.rows > 1,
      pin.afterFilter.rows + ' rows');
    is('while every other row still matches',
      pin.afterFilter.othersMatch, pin.afterFilter.othersMatch);
    is('and Clear releases it', !pin.afterClear.held
      && pin.afterClear.search === '', pin.afterClear.search);
    is('and the whole list comes back', pin.afterClear.rows === 100, pin.afterClear.rows);


    /* ---- the filters live in the URL ----------------------------------------
       THE CLAIM IS THAT A RELOAD KEEPS THEM, so the check RELOADS. Reading the
       address after a change proves only that something was written; only
       coming back to it proves the room reads it. */
    const urlSet = await page.evaluate(async () => {
      const q = document.getElementById('q');
      const cp = document.getElementById('cityPick');
      const tp = document.getElementById('typePick');
      const city = [].slice.call(cp.options).filter((o) => /^Chicago/.test(o.textContent))[0];
      const type = [].slice.call(tp.options).filter((o) => /^sports \(/.test(o.textContent))[0];
      q.value = 'bears'; q.dispatchEvent(new Event('input', { bubbles: true }));
      if (city) { cp.value = city.value; cp.dispatchEvent(new Event('change', { bubbles: true })); }
      if (type) { tp.value = type.value; tp.dispatchEvent(new Event('change', { bubbles: true })); }
      await new Promise((r) => setTimeout(r, 250));
      return { search: location.search, rows: document.querySelectorAll('.aud').length,
               entries: history.length };
    });
    const beforeReload = urlSet.search;
    is('the search reaches the address', /[?&]q=bears/.test(beforeReload), beforeReload);
    is('and so does the city', /[?&]city=/.test(beforeReload), beforeReload);
    is('and so does the type', /[?&]type=sports/.test(beforeReload), beforeReload);

    /* A RELOAD, THE WHOLE POINT.
         NOT `drawn()`. That waits for EXACTLY one page of cards, which is right
       for an unfiltered room and impossible here -- a filtered load draws a
       handful, so it timed out and read as the room failing to render. */
    await page.reload({ waitUntil: 'networkidle0' });
    await authorize();
    await page.waitForFunction(() => document.querySelectorAll('.aud').length > 0,
      { timeout: 20000 });
    const kept = await page.evaluate(() => ({
      search: location.search,
      q: document.getElementById('q').value,
      city: document.getElementById('cityPick').value,
      type: document.getElementById('typePick').value,
      rows: document.querySelectorAll('.aud').length,
      clear: document.getElementById('clearBtn').getAttribute('aria-disabled')
    }));
    is('a reload keeps the search box filled', kept.q === 'bears', kept.q);
    is('and keeps both pickers set', !!kept.city && kept.type === 'sports',
      kept.city + '/' + kept.type);
    /* THE LIST ITSELF, not just the controls. A room that restored the boxes and
       drew every row would be the worst of both. */
    is('and the list is still narrowed', kept.rows > 0 && kept.rows === urlSet.rows,
      kept.rows + ' vs ' + urlSet.rows);
    is('and Clear is lit', kept.clear === 'false', kept.clear);

    /* CLEAR EMPTIES THE ADDRESS TOO, or the room would come back filtered after
       being cleared -- and an unfiltered room has a clean address rather than
       `?q=&city=&type=`. */
    const cleared = await page.evaluate(async () => {
      document.getElementById('clearBtn').click();
      await new Promise((r) => setTimeout(r, 250));
      return { search: location.search, rows: document.querySelectorAll('.aud').length };
    });
    is('Clear empties the address', cleared.search === '', JSON.stringify(cleared.search));
    is('and the whole list is back', cleared.rows === 100, cleared.rows);

    /* `replaceState`, NEVER `pushState`: the search box writes on every
       keystroke, so pushing would stack one history entry per letter and the
       back button would walk backwards through a word rather than leaving. */
    const hist = await page.evaluate(async () => {
      const q = document.getElementById('q');
      const before = history.length;
      'chicago'.split('').forEach((ch, i) => {
        q.value = 'chicago'.slice(0, i + 1);
        q.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise((r) => setTimeout(r, 250));
      const after = history.length;
      document.getElementById('clearBtn').click();
      await new Promise((r) => setTimeout(r, 250));
      return { before: before, after: after };
    });
    is('typing does not stack history entries', hist.after === hist.before,
      hist.before + ' -> ' + hist.after);

    /* A FILTER NAMING SOMETHING THE TABLE NO LONGER HOLDS FALLS BACK TO THE
       WHOLE LIST, and the address stops claiming it. `buildPickers` already
       drops a stored value the rows do not carry; this is that behaviour
       reached through the URL. */
    await page.goto('http://127.0.0.1:8896/mc/audiences/?city=Atlantis%2C%20XX&type=nonesuch',
      { waitUntil: 'networkidle0' });
    await authorize();
    await drawn();
    const stale = await page.evaluate(() => ({
      search: location.search,
      city: document.getElementById('cityPick').value,
      type: document.getElementById('typePick').value,
      rows: document.querySelectorAll('.aud').length
    }));
    is('a filter the table no longer holds falls back to the whole list',
      stale.city === '' && stale.type === '' && stale.rows === 100,
      stale.city + '/' + stale.type + '/' + stale.rows);
    is('and the address stops claiming it', stale.search === '', stale.search);

    /* MANUAL DROPS THE FILTERS, WHICH A PLAIN RELOAD WOULD NOW KEEP. `_NAME`
       matches almost no filter, so pressing it in a filtered room would write
       the row and land you on a list it is not in -- a control that appears to
       do nothing. */
    const manualUrl = fs.readFileSync('mc/audiences/index.html', 'utf8');
    is('MANUAL leaves the filters behind rather than reloading into them',
      /window\.location\.href = window\.location\.pathname/.test(manualUrl)
        && !/window\.location\.reload\(\)/.test(manualUrl),
      /window\.location\.reload\(\)/.test(manualUrl) ? 'still reloads' : 'ok');


    /* AND THE COLUMN TAKES ANYTHING. It was checked against the four and refused
       everything else, so `history` where the list said `historical` came back
       as a refusal about a word rather than a saved value. **Lowercased on the
       way in**, because three views filter on `type = 'sports'` and `Sports`
       would drop a club out of all three in silence. */
    await closeAnyEditor();
    const typeBefore = writes.length;
    await page.evaluate(async () => {
      const cell = document.querySelector('.aud [data-field="type"]');
      cell.click();
      const box = cell.querySelector('input');
      if (!box) return;
      box.value = 'History';
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((r) => setTimeout(r, 250));
    });
    const typePatch = writes.slice(typeBefore).filter((w) => w.method === 'PATCH').pop();
    is('a type outside the four is saved, not refused',
      !!(typePatch && typePatch.body && typePatch.body.type === 'history'),
      typePatch && typePatch.body);

    /* ---- the prompt ---- */
    /* IT IS BUILT FROM THE ROWS THAT ARE ACTUALLY BLANK, never from a list
       written into the page -- so it cannot ask about a row that is already
       filled in, and it cannot miss one.
         WHAT IS ASSERTED IS THE SHAPE OF WHAT IT ASKS FOR: an UPDATE keyed on
       the ID, no league filter, the guard that stops it overwriting a town
       somebody has already checked, and the instruction to leave a row out
       rather than guess -- which is the clause the whole catalogue's accuracy
       rests on.
         AND THAT IT COVERS EVERY BLANK. It listed names and keyed on `a.first`
       with `a.league = 'NCAAF'` beside it, so a blank row that is not a college
       club was listed and then silently skipped by the query. The count is
       compared against the room's own blanks rather than a number written down
       here, which is the only comparison that can catch that. */
    const prompt = await page.evaluate(async () => {
      document.getElementById('promptBtn').click();
      await new Promise((r) => setTimeout(r, 200));
      const t = document.getElementById('promptText');
      const v = t.value;
      const lines = v.split(String.fromCharCode(10));
      document.getElementById('promptClose').click();
      const at = lines.findIndex((l) => /AUDIENCES WITH NO CITY|THE ONE AUDIENCE/.test(l));
      const listed = at === -1 ? []
        : lines.slice(at + 1).filter((l) => l.indexOf('  ') === 0 && l.indexOf(' = ') > 0);
      return {
        open: v.length > 0,
        shut: !document.getElementById('promptDlg').classList.contains('is-open'),
        sql: v.indexOf('update public.audiences a set city') > 0,
        keyed: v.indexOf('a.id = v.id') > 0,
        notName: v.indexOf('a.first = v.first') === -1,
        noLeague: v.indexOf('a.league') === -1,
        guard: v.indexOf("btrim(a.city) = ''") > 0,
        leaveOut: /leave a row out rather than guess/i.test(v),
        form: v.indexOf('City, ST') > 0,
        traps: /Austin College is in SHERMAN/.test(v) && /Bluefields/.test(v),
        noEmDash: v.indexOf(String.fromCharCode(8212)) === -1,
        listed: listed.length,
        keys: listed.map((l) => l.trim().split(' = ')[0]),
        header: (lines.filter((l) => /AUDIENCES WITH NO CITY|THE ONE AUDIENCE/.test(l))[0] || ''),
        firstListed: listed[0] || ''
      };
    });
    is('the prompt opens with text in it', prompt.open, prompt.open);
    /* KEYED ON THE PRIMARY KEY, NEVER ON THE NAME. Two of the blank rows share a
       `first`, so a name would set both rows or the wrong one; and the id does
       not move when somebody edits a name. */
    is('and asks for an UPDATE keyed on the id',
      prompt.sql && prompt.keyed && prompt.notName, prompt);
    /* NO LEAGUE FILTER: the blanks that are not college clubs have to move too. */
    is('with no league filter to skip the non-college blanks',
      prompt.noLeague, prompt.noLeague);
    /* THE GUARD IS WHAT STOPS IT OVERWRITING A CHECKED TOWN. */
    is('with the blanks-only guard', prompt.guard, prompt.guard);
    is('and says to leave a row out rather than guess', prompt.leaveOut, prompt.leaveOut);
    is('and gives the form and the traps',
      prompt.form && prompt.traps, prompt.form + '/' + prompt.traps);
    /* THE STANDING RULE FOR EVERY PROMPT IN THIS REPO: a prompt littered with em
       dashes teaches the model to write them back, and this output goes into
       our own catalogue. */
    is('and carries no em dash', prompt.noEmDash, prompt.noEmDash);
    /* EVERY BLANK IS LISTED, compared against the room's own count rather than a
       number written here. The old assertion was `named >= 0`, which could not
       fail -- the `|| true` shape this project keeps warning about. */
    const blankRows = audiences.filter((r) => !String(r.city || '').trim());
    is('and lists every blank row, not just the college ones',
      blankRows.length > 0 && prompt.listed === blankRows.length,
      prompt.listed + ' listed of ' + blankRows.length + ' blank');
    /* THE REGRESSION GUARD, AND IT NAMES THE ROWS THE OLD PROMPT LOST. A blank
       that is not a college club was listed and then skipped by the query, so it
       is not enough that the count matches -- these rows have to be in it. */
    is('including the blanks that are not college clubs',
      nonCollegeBlanksAtLoad.length > 0
        && nonCollegeBlanksAtLoad.every((id) => prompt.keys.indexOf(id) !== -1),
      'missing: ' + nonCollegeBlanksAtLoad
        .filter((id) => prompt.keys.indexOf(id) === -1).join(', ')
        + ' of ' + nonCollegeBlanksAtLoad.join(', '));
    is('and says how many it is asking about',
      prompt.header.indexOf(String(blankRows.length)) > 0
        || /THE ONE AUDIENCE/.test(prompt.header),
      prompt.header);
    /* EACH LINE IS THE KEY AND THE NAME, in that order: the key is what the
       query matches on, so it has to be the thing being copied. */
    is('and each line gives the key then the name',
      / = /.test(prompt.firstListed)
        && prompt.firstListed.trim().split(' = ')[0].indexOf(' ') === -1,
      prompt.firstListed);
    is('and Close shuts it', prompt.shut, prompt.shut);

    is('no uncaught errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
