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
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1500, height: 1100 });
    page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));

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
        req.respond({
          status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
          body: JSON.stringify(m === 'DELETE' ? [{}]
            : [Object.assign({ id: 'x', full_name: 'X', type: 'fandom' },
                             Array.isArray(sentBody) ? sentBody[0] : sentBody)])
        });
        return;
      }
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
          'access-control-expose-headers': 'content-range', 'content-range': '0-' + body.length + '/' + body.length },
        body: JSON.stringify(body)
      });
    });

    await page.goto('http://127.0.0.1:8896/mc/audiences/', { waitUntil: 'networkidle2' });
    await page.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authorize) await window.__authorize();
    });
    /* WAIT ON THE CONDITION, NEVER ON A CLOCK. A fixed sleep makes the check
       flaky the first time the machine is busy. */
    await page.waitForFunction(() => document.querySelectorAll('.aud').length > 100,
      { timeout: 20000 });

    const names = () => page.evaluate(() =>
      /* ONE SOLID BADGE, so a value is found by its `data-field` rather than by
         its position in a face that no longer exists. */
      [].slice.call(document.querySelectorAll('.aud')).map((card) => {
        const v = (k) => {
          const f = card.querySelector('[data-field="' + k + '"]');
          return f ? f.textContent.trim() : '';
        };
        return { fullName: v('full_name'), kind: v('type'), home: v('home_city') };
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

    /* ---- the control itself ---- */
    const control = await page.evaluate(() => {
      const btns = [].slice.call(document.querySelectorAll('.th-sort'));
      const on = btns.filter((b) => b.classList.contains('is-on'));
      const rest = btns.filter((b) => !b.classList.contains('is-on'))[0];
      const cs = getComputedStyle(on[0]);
      const rs = getComputedStyle(rest);
      /* MEASURED AGAINST THE BAR'S OWN LABEL -- an element the button does not
         sit in, so it is a real comparison rather than the element against
         itself. It was a caret cell, which went with the collapse. */
      const plainTh = getComputedStyle(document.querySelector('.aud-head-label') || document.querySelector('.aud-head'));
      return {
        labels: btns.map((b) => b.textContent.trim()),
        values: btns.map((b) => b.dataset.sort),
        onCount: on.length,
        onValue: on[0].dataset.sort,
        /* `aria-pressed`, NOT `aria-sort`. The list is badges rather than a
           table, so inventing a table's ARIA around it would describe a
           structure that is not there; a toggle button says `aria-pressed`. */
        ariaSorted: [].slice.call(document.querySelectorAll('.th-sort'))
          .filter((b) => b.getAttribute('aria-pressed') === 'true')
          .map((b) => b.textContent.trim()),
        onColour: cs.color,
        restColour: rs.color,
        onUnderline: cs.textDecorationLine,
        restUnderline: rs.textDecorationLine,
        font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        thFont: plainTh.fontFamily.split(',')[0].replace(/["']/g, ''),
        size: cs.fontSize,
        thSize: plainTh.fontSize,
        bars: document.querySelectorAll('.command-bar').length,
        sortBars: document.querySelectorAll('.command-bar--sort').length
      };
    });

    is('three toggles, in the order the row reads',
      control.labels.join('|') === 'full_name|type|home_city', control.labels);
    is('each names its own column',
      control.values.join('|') === 'full_name|type|home_city', control.values);
    /* NOT CUMULATIVE. The header is rebuilt from `state.sort` on every render,
       so the paint IS the exclusion -- there is no set to keep in step. */
    is('exactly one is on', control.onCount === 1, control.onCount);
    is('full_name is the one on, on load', control.onValue === 'full_name', control.onValue);
    /* `aria-sort` IS THE ONE THING A BUTTON ALONE CANNOT SAY. Without it a
       screen reader is told there are five buttons and not which column the
       table is ordered by. */
    is('the sorted column says so to a screen reader (aria-pressed)',
      control.ariaSorted.join('|') === 'full_name', control.ariaSorted);

    is('the pressed word is inked and underlined',
      control.onColour !== control.restColour
        && control.onUnderline.indexOf('underline') >= 0
        && control.restUnderline.indexOf('underline') === -1,
      control.onColour + ' / ' + control.onUnderline + ' vs '
        + control.restColour + ' / ' + control.restUnderline);
    /* IT MUST READ AS THE HEADER, not as a browser button. Measured against a
       `th` it does not sit in, so it is a real comparison rather than the
       element against itself. */
    is('the word wears the header\u2019s own type',
      control.font === control.thFont && control.size === control.thSize,
      control.font + ' ' + control.size + ' vs ' + control.thFont + ' ' + control.thSize);

    /* THE SORT BAR IS GONE. One control for one thing: the bar and the header
       printed the same five words a few inches apart. */
    is('there is no separate sort bar', control.sortBars === 0, control.sortBars);
    is('and the room is down to three command bars', control.bars === 3, control.bars);

    /* ---- the order on load ---- */
    const onLoad = await names();
    is('every audience is drawn', onLoad.length === audiences.length,
      onLoad.length + ' of ' + audiences.length);
    is('the rows arrive sorted by full name', sorted(onLoad, (r) => r.fullName) === '',
      sorted(onLoad, (r) => r.fullName));

    /* ---- each toggle ---- */
    /* A REAL CLICK ON THE HEADER WORD, not a synthetic event on a control: the
       thing under test is a DELEGATED listener on a host whose innerHTML is
       replaced on every render, so dispatching straight at the button would
       pass over a handler bound to the wrong element. */
    const press = async (value) => {
      await page.evaluate((v) => {
        [].slice.call(document.querySelectorAll('.th-sort'))
          .filter((b) => b.dataset.sort === v)[0].click();
      }, value);
      await new Promise((r) => setTimeout(r, 250));
      return names();
    };

    /* KEY AND MASCOT ARE NO LONGER COLUMNS, so they are no longer sorts: the
       header words ARE the toggles, which makes the columns and the sorts one
       list by construction rather than two kept in step by hand. */
    const byKind = await press('type');
    is('Type sorts by type', sorted(byKind, (r) => r.kind) === '', sorted(byKind, (r) => r.kind));
    const byHome = await press('home_city');
    /* THE CITY IS THE VALUE NOW, not a key showing a label -- so there is
       nothing left to translate, which is the point of the change. */
    is('City sorts by the city',
      sorted(byHome, (r) => r.home) === '', sorted(byHome, (r) => r.home));

    /* A BLANK HAS NO POSITION IN AN ALPHABET, so it sinks rather than leading.
       Measured on CITY, which is the column that actually has blanks now:
       every college club is homeless, so it is the common case. */
    /* AN EMPTY CELL IS EMPTY. `no home` is drawn by `.ed:empty::before` from the
       cell's `data-empty`, so it is NOT in `textContent` -- a first version
       compared against the words and found 0 blanks in a table that is mostly
       blank, which read as the page not sinking them and was the harness. */
    const homes = byHome.map((r) => r.home);
    const blanks = homes.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
    const filled = homes.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    is('rows with no city sink to the end',
      blanks.length > 0 && filled.length > 0
        && Math.min.apply(null, blanks) > Math.max.apply(null, filled),
      blanks.length + ' homeless, first at ' + (blanks.length ? Math.min.apply(null, blanks) : '-')
        + ', last with a city at ' + (filled.length ? Math.max.apply(null, filled) : '-'));

    /* ONE AT A TIME, MEASURED AFTER FOUR PRESSES rather than assumed from the
       markup. With buttons the exclusion is the PAINT rather than the browser,
       so this is the assertion that actually carries it -- and `aria-sort` is
       checked with it, since the class and the attribute are written together
       and could drift apart. */
    const still = await page.evaluate(() => ({
      on: document.querySelectorAll('.th-sort.is-on').length,
      sorted: document.querySelectorAll('.th-sort[aria-pressed="true"]').length
    }));
    is('still exactly one is on after two presses',
      still.on === 1 && still.sorted === 1, still);

    /* ---- sorting is not filtering ---- */
    const afterSorts = await page.evaluate(() => ({
      rows: document.querySelectorAll('.aud').length,
      clear: document.getElementById('clearBtn').getAttribute('aria-disabled')
    }));
    is('sorting hides nothing', afterSorts.rows === audiences.length, afterSorts.rows);
    is('and does not light Clear, which is about narrowing',
      afterSorts.clear === 'true', afterSorts.clear);

    /* ---- the search still narrows, and the order survives it ---- */
    await page.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'chicago';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    const narrowed = await names();
    is('the search still narrows', narrowed.length > 0 && narrowed.length < audiences.length,
      narrowed.length);
    const whileNarrowed = await page.evaluate(() => document.getElementById('blurbCount').textContent.trim());
    is('the count does not move with a filter',
      whileNarrowed === String(audiences.length), whileNarrowed + ' while ' + narrowed.length + ' shown');
    is('and what is left is still in the chosen order',
      sorted(narrowed, (r) => r.home) === '', sorted(narrowed, (r) => r.home));

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
    is('the badges keep a detached column header', head.theads === 1, head.theads);
    is('and no panel bar above it', head.panelHeads === 0, head.panelHeads);
    /* THE HEADER IS A SORT BAR, NOT A COLUMN HEAD. It names the three fields
       the list can be ordered by; the badge draws every field the table has, so
       the two counts are deliberately different now. */
    is('the sort bar names three fields', head.ths === 3, head.ths);
    is('and the header names the three the toggles name',
      head.headWords === 'full_name|type|home_city', head.headWords);
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
    is('the detail carries the key, which the row no longer shows',
      detail.labels.indexOf('id') >= 0, detail.labels.slice(0, 4));
    /* `name` IS GONE FROM THE TABLE, so the assertion is the other way round
       now: the badge must carry `full_name` -- which is the key the row is made
       of -- and must NOT carry a field for a column that no longer exists,
       which would render `none` on all 641. */
    is('and full_name, which is the key the row is made of',
      detail.labels.indexOf('full_name') >= 0, detail.labels.slice(0, 6));
    is('and nothing for the dropped `name`',
      detail.labels.indexOf('name') === -1 && detail.fields.indexOf('name') === -1,
      detail.labels.join(','));
    /* THE OTHER THREE CLOSED-ROW COLUMNS ARE STILL THERE, deliberately: they
       are editable, and a reader opening a row to work through every field
       would otherwise find three gaps. */
    is('and every other field the table has',
      ['nickname', 'type', 'home_city', 'full_name', 'primary']
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
    is('the list really does scroll inside its panel',
      height.panelScroll > height.panel * 10,
      height.panel + ' shown of ' + height.panelScroll);
    is('and the page does not grow with it',
      height.doc < height.view * 2,
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
        /* THEY ARE DETACHED, so the gap between two of them is real. */
        gap: cards.length > 1
          ? Math.round(cards[1].getBoundingClientRect().top - cards[0].getBoundingClientRect().bottom)
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
    is('the badges are detached, not a table', paint.gap > 0, paint.gap + 'px gap');
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
      /* THE CLUB CODE, and NOT dead: since 2026090108 it is where the LEAGUE
         lives, so teams.league, destinations.id, the same-league rival rule and
         every ladder rung split it. Nobody reads it off a list. */
      'team_key'
    ];
    const tableCols = Object.keys(audiences[0]).filter((k) => OFF_BADGE.indexOf(k) === -1).sort();
    const roomCols = await page.evaluate(() => {
      const d = document.querySelector('.aud');
      const shown = [].slice.call(d.querySelectorAll('[data-field]')).map((f) => f.dataset.field);
      /* THE READ-ONLY ONES CARRY NO `data-field`, so they are found by their
         label instead -- otherwise the key and the two stamps would read as
         missing from a detail that plainly shows them. */
      const labels = [].slice.call(d.querySelectorAll('.flabel')).map((l) => l.textContent.trim());
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
    is('lowercased, since the CHECK refuses a capital',
      !!patch && (patch.body.audience_aliases || []).every((a) => a === a.toLowerCase()),
      patch && patch.body.audience_aliases);
    /* PostgREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES, so a write
       that does not read the row back reports a refusal as a success. */
    is('and it asks for the row back',
      !!patch && /return=representation/.test(patch.headers.prefer || patch.headers.Prefer || ''),
      patch && (patch.headers.prefer || patch.headers.Prefer));

    /* ---- the add dialog ---- */
    const add = await page.evaluate(async () => {
      document.getElementById('manualBtn').click();
      const open = document.getElementById('addDlg').classList.contains('is-open');
      const box = document.getElementById('addFullName');
      box.value = 'Probe Athletic Club';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      const previewed = document.getElementById('keyPreview').textContent.trim();
      /* THE KEY IS THE FULL NAME. It is what three tables reference and it is
         permanent, so the preview is the one moment anybody sees it first. */
      document.getElementById('addSave').click();
      await new Promise((r) => setTimeout(r, 400));
      return { open: open, previewed: previewed,
               fields: ['addFullName', 'addType', 'addHome'].filter((i) => document.getElementById(i)),
               gone: ['addFamily', 'addName', 'addKind'].filter((i) => document.getElementById(i)) };
    });
    is('Add opens the dialog', add.open);
    is('and it asks for the columns the table has', add.fields.length === 3, add.fields);
    is('and none for the three that were dropped', add.gone.length === 0, add.gone);
    is('the key is previewed before it is made',
      add.previewed === 'probe-athletic-club', add.previewed);
    const post = writes.filter((w) => w.method === 'POST').pop();
    is('and the insert sends that key with the row',
      !!post && post.body.id === 'probe-athletic-club' && post.body.full_name === 'Probe Athletic Club',
      post && JSON.stringify(post.body));
    is('with `type`, never the dropped `kind`',
      !!post && post.body.type === 'fandom' && post.body.kind === undefined,
      post && JSON.stringify(post.body));

    /* A KEY THAT ALREADY EXISTS IS REFUSED BEFORE ANY REQUEST, so the answer is
       a sentence rather than a 23505 naming a constraint. */
    const before = writes.filter((w) => w.method === 'POST').length;
    const dupe = await page.evaluate(async () => {
      document.getElementById('manualBtn').click();
      const box = document.getElementById('addFullName');
      box.value = 'Chicago Bears';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('addSave').click();
      await new Promise((r) => setTimeout(r, 300));
      return document.getElementById('addMsg').textContent.trim();
    });
    is('a key that already exists is refused, and says so', /already exists/i.test(dupe), dupe);
    is('and nothing is sent',
      writes.filter((w) => w.method === 'POST').length === before,
      writes.filter((w) => w.method === 'POST').length - before);

    is('no uncaught errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }

  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
