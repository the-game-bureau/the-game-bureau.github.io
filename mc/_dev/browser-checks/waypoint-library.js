const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.ico': 'image/x-icon' };

const WP = [];
for (let i = 1; i <= 6; i++) {
  WP.push({ wpid: i, name: 'Place ' + i, city: 'Chicago', state: 'IL', country: 'USA',
            address: i >= 5 ? '' : '1 Main St', zip: i >= 5 ? '' : '60601',
            description: i >= 5 ? '' : 'A thing.',
            source_url: i >= 5 ? '' : (i === 2 ? 'not a url' : 'https://en.wikipedia.org/wiki/Place' + i),
            lat: i >= 5 ? null : 41.88 + i / 100, lon: i >= 5 ? null : -87.63,
            ai_model: '', created_at: '2026-01-01' });
}
/* TWO ROWS FOR THE TWO RUNGS THE OLD LADDER COULD NOT REACH.
   7 HOLDS A POINT AND NO STREET -- a marker, a monument, a square, which is
     what 12 of the live rows are. Only a REVERSE lookup can mend it.
   8 HOLDS A STREET AND NO POINT, which is the STRUCTURED rung: the parts go
     to Nominatim separately, so a comma in a value cannot confuse it. */
WP.push({ wpid: 7, name: 'Place 7', city: 'Chicago', state: 'IL', country: 'USA',
          address: '', zip: '', description: 'A thing.',
          source_url: 'https://en.wikipedia.org/wiki/Place7',
          lat: 41.95, lon: -87.65, ai_model: '', created_at: '2026-01-01' });
WP.push({ wpid: 8, name: 'Place 8', city: 'Chicago', state: 'IL', country: 'USA',
          address: '9 Wacker Dr Suite 400', zip: '', description: 'A thing.',
          source_url: 'https://en.wikipedia.org/wiki/Place8',
          lat: null, lon: null, ai_model: '', created_at: '2026-01-01' });
/* 9 CARRIES A POINT THAT IS NOT IN ITS OWN CITY, which is a fault in the row
   that nothing else in this project would ever surface: the map draws it
   happily, the pills say nothing, and only a reverse lookup can tell.
     THE POINT IS THE NEXT TOWN OVER rather than the next state, because that
   is the version that actually happens and the harder one to catch -- a
   coordinate a few miles out looks entirely reasonable on a map. */
WP.push({ wpid: 9, name: 'Place 9', city: 'Chicago', state: 'IL', country: 'USA',
          address: '', zip: '', description: 'A thing.',
          source_url: 'https://en.wikipedia.org/wiki/Place9',
          lat: 42.045, lon: -87.688, ai_model: '', created_at: '2026-01-01' });

/* DERIVED, NOT WRITTEN OUT. The fixture is the only statement of how many
   rows there are; an assertion that repeats the number is one that has to be
   found and corrected every time a row is added, which is how a fixture stops
   being extended. */
/* 10 HAS NO COUNTRY. A waypoint may have no state -- Lisbon is not in one --
   and every place on earth is in a country, so that is the half that is a
   gap. It is given a state and no country, which is the wrong way round and
   is exactly what the old prompt produced. */
WP.push({ wpid: 10, name: 'Place 10', city: 'Chicago', state: 'IL', country: '',
          address: '5 Main St', zip: '60601', description: 'A thing.',
          source_url: 'https://en.wikipedia.org/wiki/Place10',
          lat: 41.87, lon: -87.62, ai_model: '', created_at: '2026-01-01' });

const N = WP.length;
const GAPPED = WP.filter((w) => !w.address || !w.description || !w.source_url
  || !w.country || w.lat === null || w.lon === null).length;
const LOCATED = WP.filter((w) => w.lat !== null && w.lon !== null).length;

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) p = path.join(p, 'index.html');
    fs.readFile(p, (e, buf) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(8796, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  /* PLAIN CHARACTERS, NEVER A REGEX ESCAPE. A backslash written through a
     heredoc into this file is eaten one level, and it was: the first cut of the
     assertion below read /Place 8 (zip, point)/, whose parentheses are a
     capture group, so it matched nothing and reported a page fault that was its
     own. Sixteenth instance in this repo. */
  const OPEN = String.fromCharCode(40), CLOSE = String.fromCharCode(41);
  const errs = [];
  const logs = [];
  let refuseDelete = false;
  const Q = String.fromCharCode(34);
  const geoAt = [];
  /* WHAT THE PAGE ASKED THE OUTSIDE WORLD FOR, and what it wrote back. The
     lookups are stubbed: hitting the real Nominatim from a test would be one
     request a second against somebody else's free service, which is the policy
     this feature is built around. */
  const lookups = [];
  const patches = [];
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
    p.on('console', (m) => {
      logs.push(m.text());
      if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200));
    });
    /* THE ROOM GATES ON A REAL ADMIN SESSION, so the module is stubbed BEFORE
       the page script runs -- forcing the class afterwards shows the room and
       never fires the load, which reads exactly like a page that renders
       nothing. */
    await p.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      const json = (b) => req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
        body: JSON.stringify(b) });
      /* THE TWO LOOKUPS ARE STUBBED. Hitting the real Nominatim from a test
         would be one request a second against somebody else's free service,
         which is the policy this feature is built around. */
      if (u.indexOf('nominatim') !== -1) {
        /* LOGGED BY KIND, because the three rungs are three different URLs and
           the point of the ladder is which one a row takes. */
        const kind = u.indexOf('/reverse?') !== -1 ? 'reverse'
          : (u.indexOf('street=') !== -1 ? 'structured' : 'freeform');
        lookups.push('nominatim ' + kind + ' ' + decodeURIComponent(u.split('q=')[1] || ''));
        geoAt.push(Date.now());
        /* REVERSE ANSWERS A STREET AND A POSTCODE FOR THE POINT ASKED ABOUT. */
        if (kind === 'reverse') {
          /* ROW 9's POINT ANSWERS AS EVANSTON, which is what lets the page
             notice the row says Chicago. */
          if (u.indexOf('lat=42.045') !== -1) {
            json({ lat: '42.045', lon: '-87.688', class: 'place', type: 'house',
                   addresstype: 'place',
                   address: { house_number: '1', road: 'Sheridan Rd', city: 'Evanston',
                              state: 'Illinois', 'ISO3166-2-lvl4': 'US-IL', postcode: '60201' } });
            return;
          }
          json({ lat: '41.95', lon: '-87.65', class: 'place', type: 'house',
                 addresstype: 'place',
                 address: { house_number: '197', road: 'Madison St', city: 'Chicago',
                            state: 'Illinois', 'ISO3166-2-lvl4': 'US-IL', postcode: '60601' } });
          return;
        }
        if (kind === 'structured') {
          /* THE STREET AS GIVEN CARRIES A SUITE AND FINDS NOTHING; the tidied
             variant is what hits. That is the ladder's whole point: the
             address is a lead to be adjusted, not fixed input. */
          if (u.indexOf('Suite') !== -1 || u.indexOf('Suite%20400') !== -1) { json([]); return; }
          json([{ lat: '41.87', lon: '-87.63', class: 'building', type: 'commercial',
                  addresstype: 'building', place_rank: 30,
                  address: { house_number: '9', road: 'Wacker Dr', city: 'Chicago',
                             state: 'Illinois', 'ISO3166-2-lvl4': 'US-IL', postcode: '60606' } }]);
          return;
        }
        /* THE SECOND ROW'S NAME RESOLVES TO A CITY BOUNDARY, which must be
           refused: that is the fault that put fourteen markers on one point. */
        if (u.indexOf('Place%206') !== -1 || u.indexOf('Place+6') !== -1) {
          json([{ lat: '41.88', lon: '-87.63', class: 'boundary', type: 'administrative',
                  addresstype: 'city', address: { postcode: '60601' } }]);
          return;
        }
        /* A WRONG-STATE CANDIDATE COMES BACK FIRST and must be stepped over.
           There was no sanity check on a returned coordinate at all, so the
           first answer was simply taken -- which is the whole class of
           silently-wrong point this scoring exists to remove. */
        json([
          { lat: '43.66', lon: '-70.25', class: 'tourism', type: 'museum',
            addresstype: 'museum', place_rank: 30,
            address: { house_number: '5', road: 'Congress St', city: 'Portland',
                       state: 'Maine', 'ISO3166-2-lvl4': 'US-ME', postcode: '04101' } },
          { lat: '41.9', lon: '-87.7', class: 'tourism', type: 'museum',
            addresstype: 'museum', place_rank: 30,
            address: { house_number: '77', road: 'Wacker Dr', city: 'Chicago',
                       state: 'Illinois', 'ISO3166-2-lvl4': 'US-IL', postcode: '60606' } }
        ]);
        return;
      }
      if (u.indexOf('wikipedia.org') !== -1) {
        /* THREE DIFFERENT CALLS NOW, and the point of the change is which one
           is asked first: geosearch asks WHICH ARTICLES ARE NEAR THIS POINT,
           which is a better question than a global text search. */
        if (u.indexOf('list=geosearch') !== -1) {
          lookups.push('wikipedia geosearch');
          /* WHAT IS NEARBY IS NOT NECESSARILY WHAT THIS IS: the first title
             is a real article beside the place and must be refused, or a
             marker gets cited to whatever monument stands next to it. */
          json({ query: { geosearch: [
            { title: 'Mill Ruins Park', dist: 145 },
            { title: 'Place 5 Monument', dist: 0 }
          ] } });
          return;
        }
        if (u.indexOf('list=search') !== -1) {
          lookups.push('wikipedia search');
          json({ query: { search: [{ title: 'Place 5 Monument' }] } });
          return;
        }
        lookups.push('wikipedia extract');
        json({ query: { pages: { 1: { title: 'Place 5 Monument',
                                      extract: 'A described thing.' } } } });
        return;
      }
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      const send = (b) => req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
        body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') { send([]); return; }
      if (u.indexOf('/waypoints?') !== -1) {
        if (req.method() === 'DELETE' && refuseDelete) {
          /* THE EXACT BODY POSTGREST SENDS FOR A BLOCKED DELETE, which is what
             reached the room raw: a constraint name and a table name, in our
             schema's words, in front of somebody trying to delete a row. */
          req.respond({ status: 409, contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                       'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
            body: JSON.stringify({ code: '23503', message: 'update or delete on table '
              + Q + 'waypoints' + Q + ' violates foreign key constraint '
              + Q + 'stops_old_waypoint_id_fkey' + Q + ' on table ' + Q + 'stops_old' + Q }) });
          return;
        }
        if (req.method() === 'PATCH') {
          const id = Number((u.match(/wpid=eq\.(\d+)/) || [])[1]);
          const body = JSON.parse(req.postData() || '{}');
          const row = WP.filter((w) => w.wpid === id)[0];
          Object.keys(body).forEach((k) => { row[k] = body[k]; });
          patches.push({ id: id, body: body });
          send([row]);
          return;
        }
        send(WP); return;
      }
      send([]);
    });

    await p.goto('http://127.0.0.1:8796/mc/waypoints/', { waitUntil: 'networkidle0' });
    // the room gates on an admin session; force the authorized state the way
    // the page's own guard does.
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 900));

    const out = await p.evaluate(() => {
      const t = document.getElementById('roomTitle');
      const list = document.getElementById('list') || document.querySelector('#wpList, .wp-list');
      return {
        title: t ? t.textContent : '(no roomTitle)',
        pageTitle: document.title,
        rows: document.querySelectorAll('.wp').length,
        bodyVisible: getComputedStyle(document.body).visibility,
        panels: [...document.querySelectorAll('.panel-title')].map((n) => n.textContent),
        legends: [...document.querySelectorAll('.command-bar legend')].map((n) => n.textContent),
        scribble: (document.getElementById('pageStatus') || {}).textContent || '',
        count: (document.getElementById('listCount') || {}).textContent || '',
        blurb: (document.querySelector('.room-blurb') || {}).textContent || ''
      };
    });
    let ok = 0, bad = 0;
    const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
      : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

    /* THE TITLE IS THE ROOM'S NAME AND IS NOT PAINTED. It led with a count,
       which is this project's convention -- and that convention leads with a
       count of the room's own NOUN, which only works while the name IS that
       noun. `536 WAYPOINT LIBRARY` is not a sentence. */
    t('the room is the Waypoint Library', out.title === 'WAYPOINT LIBRARY', out.title);
    t('and the tab says so too', out.pageTitle === 'WAYPOINT LIBRARY | THE GAME BUREAU', out.pageTitle);
    t('the title carries no count', !/[0-9?]/.test(out.title), out.title);
    /* THE COUNT IS NOT LOST -- it moved to the list panel, which already carried
       a figure and which `render()` was already writing. Keeping both would have
       been two writers for one element, with the second silently winning. */
    /* THE COUNT LEADS THE BLURB. It is the room's own total, painted, and the
       `###` in the ask was that number rather than markdown -- which I read as
       literal text twice before it was said plainly. */
    t('the blurb leads with the live count',
      /* THE BLURB SAYS WHAT IS ON THE PAGE, not only what the word means. It
         defined the noun and stopped, which left somebody who had just arrived
         knowing what a waypoint IS and nothing about what this page DOES. The
         errand is in the order the room is laid out: find, map, fix. */
      out.blurb === N + " Waypoints. A Waypoint is a real world location where a"
        + " game's challenge takes place, and Waypoint + Challenge = Game Stop."
        + " Find one, see them all on the map, and fix what is missing.",
      out.blurb);
    /* THE PANEL SAYS ONLY WHAT THE BLURB CANNOT. Unfiltered it says nothing, or
       the same figure would be on screen twice. */
    t('the panel is the plain noun', out.panels.join(',') === 'Map,Waypoints', out.panels.join(','));
    t('and says nothing while nothing is filtered', out.count === '', out.count);
    /* THE PANEL STOPS SAYING THE ROOM'S NAME BACK. Two inches under a title
       reading WAYPOINT LIBRARY, a panel called Waypoint Library is the same
       words twice a few pixels apart. */



    /* AND IT ACTUALLY WORKS, which is the half a markup check cannot see. */
    t('the library drew its rows', out.rows === N, out.rows);
    t('the bars are Add, Find, Issues', out.legends.join(',') === 'Add,Find,Issues', out.legends.join(','));
    t('the room is not hiding behind the auth gate', out.bodyVisible === 'visible');
    t('nothing was written to the red pen', out.scribble === '', out.scribble);
    t('and no page errors', errs.length === 0, errs.join(' | '));

    /* ---- ONE PILL PER GAP, AND A MESSAGE TO MATCH (2026-08-31) ----------
       It was a single `missing` pill whatever the gap and ONE rule -- so a row
       with no address wore a pill and was told nothing, while a row with no
       point was told something and wore no pill. Two lists that had already
       drifted: `missingBits` watched `city` and the checks did not. */
    const gaps = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('.wp')];
      const byName = (nm) => rows.filter((r) => r.textContent.indexOf(nm) === 0)[0];
      const read = (r) => ({
        pills: [...r.querySelectorAll('.wp-tag--missing')].map((t) => t.textContent),
        titles: [...r.querySelectorAll('.wp-tag--missing')].map((t) => t.title),
        lines: [...r.querySelectorAll('.wp-note, .wp-review-line, .wp-reason')].map((n) => n.textContent)
      });
      return { five: read(byName('Place 5')), one: read(byName('Place 1')),
               allLines: [...document.querySelectorAll('.wp.is-review')].length };
    });

    /* THE PILL NAMES THE GAP. A row missing an address and a row missing a
       source no longer read the same. */
    t('a row wears one pill per gap, each named',
      gaps.five.pills.join(',') === 'coordinates,address,description,source',
      gaps.five.pills.join(','));
    /* NO PILL WITHOUT A MESSAGE AND NO MESSAGE WITHOUT A PILL: both come off
       the same rule, so they cannot disagree. The tooltip IS the message. */
    t('and every pill carries its own instruction',
      gaps.five.titles.length === 4
      && gaps.five.titles.every((x) => x.length > 10)
      && new Set(gaps.five.titles).size === 4,
      gaps.five.titles.join(' | '));
    /* AND NO TWO OPEN ON THE SAME NOUN, which is what `differ` has to mean now
       that every message is built the same way: the leading word is the whole
       of what tells one line from another on a row wearing four of them. */
    t('no two messages open on the same noun',
      new Set(gaps.five.titles.map((x) => x.split(' ')[0])).size === gaps.five.titles.length,
      gaps.five.titles.map((x) => x.split(' ')[0]).join(','));

    /* EVERY MESSAGE IS A CALL TO ACTION AND OPENS WITH THE VERB, so a row
       wearing four of them reads as four things to do rather than four
       paragraphs about what a waypoint is. */
    t('every message names the thing before its state',
      gaps.five.titles.every((x) => /^[A-Z][a-z]/.test(x) && x.indexOf(' missing.') !== -1),
      gaps.five.titles.join(' | '));

    /* AND NONE OF THEM NAMES FILL. It was on two rules word for word, so a row
       missing both read the same instruction twice; it was true of four, so the
       two that named it were arbitrary; and FILL is sitting in the batch bar
       with a count on it while the rows are already ticked. */
    t('and none of them says press Fill, which the lit button already does',
      gaps.five.titles.every((x) => x.indexOf('Fill') === -1),
      gaps.five.titles.join(' | '));

    /* A SECOND CLAUSE ONLY WHERE IT CHANGES WHAT YOU TYPE. Two of the six earn
       one: a description is read aloud, and `source` means a page about the
       place rather than where we found the row. The other four said what a
       waypoint is in general, to somebody already looking at one. */
    t('the plain ones are the noun and its state, and nothing else',
      gaps.five.titles[0] === 'Coordinates missing.'
      && gaps.five.titles[1] === 'Street address missing.'
      && gaps.five.titles[3] === 'Source web page missing.',
      gaps.five.titles.join(' | '));
    /* AND ONE KEEPS A CLAUSE, because it changes the sentence you write. */
    t('and the one that changes what you write keeps its clause',
      gaps.five.titles[2] === 'Description missing. It is read aloud at the stop.',
      gaps.five.titles[2]);
    /* THE PILL AND THE MESSAGE NAME THE SAME THING. They said `no point` and
       `Add coordinates` while the form said Latitude and Longitude -- three
       words for one field, and the pill was the odd one out. */
    /* THE PILL IS THE FIELD, AND THE RED IS WHAT SAYS IT IS MISSING. They read
       'no coordinates', which spent the first word of every pill on a word
       that was the same on all of them, and said in ink what the pen was
       already saying in colour. A pill only ever appears on a gap. */
    t('no pill carries the word no, which the red already says',
      gaps.five.pills.every((p) => p.indexOf('no ') === -1), gaps.five.pills.join(','));
    t('the pill names what the message names',
      gaps.five.pills.every((p, i) =>
        gaps.five.titles[i].toLowerCase().indexOf(p.replace('no ', '')) !== -1),
      gaps.five.pills.join(',') + '  vs  ' + gaps.five.titles.join(' | '));
    /* A COMPLETE ROW WEARS NOTHING, which is what makes a pill news rather than
       furniture. */
    t('a complete row wears no pill at all', gaps.one.pills.length === 0, gaps.one.pills.join(','));
    t('and only the rows with a gap are flagged', gaps.allLines === GAPPED, gaps.allLines);

    /* ---- CHECK NARROWS TO THE FAULTY ROWS AND TICKS THEM (2026-08-31) ---
       Finding them and acting on them is one errand: every flagged row is a
       candidate for Fill, and ticking a narrowed list by hand is a press per
       row for an answer the check has already worked out. */
    /* ---- DELETING A WAYPOINT (2026-08-31) -------------------------------
       REPORTED FROM THE ROOM: a waypoint could not be deleted, and what came
       back was `violates foreign key constraint stops_old_waypoint_id_fkey`.
       Two tables nobody was maintaining were refusing the delete, and **60 of
       the 564 waypoints could not be deleted at all**. 2026083116 makes every
       key into waypoints cascade or set null, so this is now unreachable --
       and the room says something a person can act on if a new one blocks. */
    const asked = [];
    p.on('dialog', async (d) => { asked.push(d.message()); await d.accept(); });

    refuseDelete = true;
    await p.evaluate(() => {
      document.querySelector('.wp .wp-pick').click();
    });
    await new Promise((r) => setTimeout(r, 200));
    await p.click('#batchDeleteBtn');
    await new Promise((r) => setTimeout(r, 400));

    /* THE QUESTION CARRIES THE CONSEQUENCE NOBODY EXPECTS. That the row goes
       is obvious; that it takes every stop built on it is not, and four tables
       cascade -- two of them silently, long before this came up. */
    t('the delete asks first, and says the stop survives',
      asked.length === 1
      && asked[0].indexOf('keeps its challenge and will need a new waypoint') !== -1,
      asked.join(' | '));
    /* AND IT COUNTS IN ENGLISH. `1 waypoints` is what a hand-written plural
       gives the first time it meets a one, and this room has a pluraliser. */
    t('and says one waypoint rather than 1 waypoints',
      asked[0].indexOf('1 waypoint for good') !== -1, asked[0].split(String.fromCharCode(10))[0]);

    /* AND A REFUSAL IS A SENTENCE, NEVER THE CONSTRAINT NAME. */
    const refused = await p.evaluate(() => document.getElementById('pageStatus').textContent);
    t('a blocked delete names the table, not the constraint',
      refused.indexOf('stops_old') !== -1
      && refused.indexOf('foreign key constraint') === -1
      && refused.indexOf('_fkey') === -1,
      refused);
    t('and says it is a missing rule rather than something you did',
      refused.indexOf('rather than anything you have done') !== -1, refused);

    /* AND THE ROW IS STILL THERE, because nothing was deleted. */
    t('a refused delete leaves the row on screen',
      await p.evaluate(() => document.querySelectorAll('.wp').length) === N,
      await p.evaluate(() => document.querySelectorAll('.wp').length));
    refuseDelete = false;
    await p.evaluate(() => { document.querySelector('.wp .wp-pick').click(); });
    await new Promise((r) => setTimeout(r, 200));

    /* ---- A WAYPOINT MAY HAVE NO STATE AND MUST ALWAYS HAVE A COUNTRY ----
       Nine live rows genuinely have no subdivision -- Lisbon is not in a
       state -- so a missing state is not a gap. Every place on earth is in a
       country, so a missing country is. */
    const gapPills = await p.evaluate(() => [...document.querySelectorAll('.wp')]
      .filter((r) => (r.querySelector('.wp-name') || {}).textContent === 'Place 10')
      .map((r) => [...r.querySelectorAll('.wp-tag--missing')].map((x) => x.textContent.trim()))[0] || []);
    t('a row with no country wears a pill for it',
      gapPills.indexOf('country') !== -1, gapPills.join(','));
    t('and nothing complains about the state, which a place may not have',
      gapPills.join(',').indexOf('state') === -1, gapPills.join(','));

    /* AND THE PROMPT ASKS FOR IT IN ITS OWN FIELD. The country lived in the
       state box until the column existed, and the prompt taught exactly that,
       telling the model to put the country name in the state field. Reading it,
       a model would go on filing
       Portugal as a state forever. */
    const prompt = await p.evaluate(() => {
      document.getElementById('promptBtn').click();
      return document.getElementById('aiPrompt').value;
    });
    t('the prompt lists country as its own column',
      prompt.indexOf('city, state, country, zip') !== -1);
    t('and its worked example puts a stateless place in it',
      prompt.indexOf("'Lisbon', null, 'Portugal'") !== -1);
    t('and no longer tells the model to put a country in state',
      prompt.indexOf('THE COUNTRY NAME') === -1);

    /* ---- IT IS A WAYPOINT, NOT A PLACE (2026-08-31) --------------------
       AND IT IS NOT A STYLE PREFERENCE: `public.places` IS A REAL TABLE AND
       IT HOLDS CITIES. An audience carries a `home_place_id`, the Stop
       Builder joins `places` to list the cities a club is at home in, and
       `places.id` is `city-state`. So a waypoint called a place collides
       with a table that means something else, in rooms that read both.
         READ OFF THE RENDERED PAGE, NEVER THE SOURCE. A source scan cannot
       tell the waypoint sense from the city one: `placeFilter` narrows by
       city, `.ch-scope.is-place` is a value of `challenges.scope`, and
       `home place` is the audiences table. A first cut of this checked the
       source and reported 24 lines, every one of them correct. **What a person
       SEES is the thing to check.** */
    const seen = await p.evaluate(() => {
      const c = document.body.cloneNode(true);
      [...c.querySelectorAll("script, style")].forEach((n) => n.remove());
      const titles = [...c.querySelectorAll("[title]")]
        .map((n) => n.getAttribute("title"));
      return c.textContent + " " + titles.join(" ");
    });
    /* THE TWO SENSES ON SCREEN THAT ARE NOT A WAYPOINT, named here rather than
       matched by accident: the picker narrows by city, state and country, which
       is `places` own meaning; and the blurb says a challenge TAKES PLACE,
       which is ordinary English and is the sentence you wrote. */
    /* AND THE ROW NAMES COME OUT FIRST. The fixture calls its rows Place 1,
       Place 2 -- which is DATA, not the room vocabulary. What is being checked
       is the words the room chose, not the words somebody typed into a name. */
    let stillThere = seen;
    WP.forEach((w) => { stillThere = stillThere.split(w.name).join(" "); });
    stillThere = stillThere.split("Narrow to one place").join(" ")
      .split("takes place").join(" ");
    t('nothing a person reads calls a waypoint a place',
      !/place/i.test(stillThere),
      (stillThere.match(/.{0,45}place.{0,45}/i) || [""])[0]);

    /* ---- THE PROMPT CARRIES THE ROOM OWN CHECKS (2026-08-31) -----------
       So a row is mended while the AI still has the article open, rather than
       landing flagged for somebody else to chase. */
    t('the prompt tells the AI what the room will check',
      prompt.indexOf('RUN IT PAST OUR OWN CHECKS') !== -1);

    /* AND THE LIST IS DERIVED FROM THE RULES, never written out again: a prompt
       listing our checks by hand is a second copy of them, and it drifts the
       first time a rule is added, reworded or removed. Every rule that draws a
       pill has to appear, WORD FOR WORD as the row would say it. */
    const said = await p.evaluate(() => window.__rules || null);
    t('every check the room runs is named in the prompt, word for word',
      !!said && said.every((x) => prompt.indexOf(x) !== -1),
      said ? (said.filter((x) => prompt.indexOf(x) === -1).join(' | ') || 'all present')
           : 'no rules exported');
    t('and the prompt names no check the room does not run',
      !!said && prompt.split(String.fromCharCode(10))
        .filter((l) => l.trim().slice(-9) === ' missing.')
        .every((l) => said.indexOf(l.trim()) !== -1),
      'a missing. line no rule produces');

    /* AND THE FOUR IT WAS CAUGHT BY, each a real row: an address written as a
       postal address, a marker with no door, an article about the man rather
       than his statue, and a point in the wrong Portland. */
    t('it says the address is a street line, not a postal address',
      prompt.indexOf('STREET LINE, NOT A POSTAL ADDRESS') !== -1);
    t('that a corner or a block is a real address',
      prompt.indexOf('E Colfax Ave and Broadway') !== -1);
    t('that the source must be the place, not the man it is named after',
      prompt.indexOf('Pride of Baltimore') !== -1 && prompt.indexOf('Nathan Hale') !== -1);
    t('and to read the coordinate back against the city',
      prompt.indexOf('Portland, Maine') !== -1);
    /* CLOSED BY ITS OWN BUTTON, not by setting .hidden: the dialog is shown
       with a class, so hiding it that way left it open and every later click
       landed on the overlay -- which read as Clear not clearing. */
    await p.click('#aiCloseBtn');
    await new Promise((r) => setTimeout(r, 200));

    /* THE FACE IS A VERB AND CARRIES NO TALLY. It read `Check (24)`, which is
       a verb with a bare figure after it: twenty-four of WHAT is the only
       question anybody asks of that, and spelling it out made the button the
       loudest thing in the bar for an answer you get by pressing it. The
       count is in the scribble after the press, where a count belongs. */
    t('the button is a verb, with no count on it',
      await p.evaluate(() => document.getElementById('checkBtn').textContent) === 'Check',
      await p.evaluate(() => document.getElementById('checkBtn').textContent));

    /* AND IT SAYS SO WHILE IT WORKS. Read in the SAME TICK as the press,
       because the check yields a frame and then runs: waiting and looking
       afterwards would only ever see the state it settles in. */
    t('it says Checking while it checks',
      await p.evaluate(() => {
        document.getElementById('checkBtn').click();
        return document.getElementById('checkBtn').textContent;
      }) === 'Checking...');
    await new Promise((r) => setTimeout(r, 300));
    /* AND GOES BACK TO THE VERB. It never reads anything else: pressing Check
       checks, whatever the list is currently showing. */
    t('and goes back to the verb, never to a second mode',
      await p.evaluate(() => document.getElementById('checkBtn').textContent) === 'Check',
      await p.evaluate(() => document.getElementById('checkBtn').textContent));
    /* THE WAY OUT IS CLEAR, and it lights up the moment the check narrows. */
    t('Clear is lit as the way out of the narrowing',
      await p.evaluate(() => document.getElementById('clearBtn').getAttribute('aria-disabled')) === 'false');
    await p.click('#clearBtn');
    await new Promise((r) => setTimeout(r, 300));
    t('and pressing it shows every waypoint again',
      await p.evaluate(() => document.querySelectorAll('.wp').length) === N,
      await p.evaluate(() => document.querySelectorAll('.wp').length));

    await p.evaluate(() => {
      /* A LEFTOVER TICK FIRST, so the replace can be told from an add. */
      document.querySelector('.wp .wp-pick').click();
      const q = document.getElementById('q');
      q.value = 'chicago'; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    await p.click('#checkBtn');
    await new Promise((r) => setTimeout(r, 300));
    const checked = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      ticked: [...document.querySelectorAll('.wp-pick')].filter((c) => c.checked).length,
      names: [...document.querySelectorAll('.wp')]
        .map((r) => (r.querySelector('.wp-name') || r).textContent.trim()),
      fill: document.getElementById('batchFillBtn').textContent,
      q: document.getElementById('q').value,
      btn: document.getElementById('checkBtn').textContent,
      scribble: document.getElementById('pageStatus').textContent
    }));
    t('Check narrows to the rows with a gap', checked.rows === GAPPED, checked.rows);
    t('and ticks every one of them', checked.ticked === GAPPED, checked.ticked);
    t('so Fix is one press away',
      checked.fill === 'Fix ' + GAPPED, checked.fill);
    /* THE SELECTION IS REPLACED, NEVER ADDED TO: a tick left from something
       else would put a row nobody chose into the next batch press. */
    t('the leftover tick is gone, not added to',
      checked.names.indexOf('Place 1') === -1, checked.names.join(','));
    t('every other filter came off first', checked.q === '', checked.q);
    /* AND THE PEN SAYS THE ONE THING NOTHING ELSE ON SCREEN DOES: the count.
       It used to add that the filters had come off and which buttons to press,
       and every word of that is already visible: the bar shows the filters
       cleared, the rows show their ticks, and FILL and CLEAR are both sitting
       there lit. It ran to three lines of handwriting across the room title to
       say it. */
    t('the pen says the count and nothing that is already on screen',
      checked.scribble === GAPPED + ' of ' + N + ' need something.',
      checked.scribble);

    /* THE FACE NEVER BECOMES A SECOND MODE. It is a verb and stays one. */
    t('the button still reads Check after it has narrowed', checked.btn === 'Check', checked.btn);
    /* CLEAR CLEARS THE FILTERS, NOT THE SELECTION, and that is the right way
       round: it WIDENS the list, so every ticked row is still on screen and
       still actionable -- and a hand-made selection survives a press of Clear
       rather than being thrown away by it. The invariant that matters is the
       one the room enforces on every render: NOTHING TICKED IS OFF SCREEN. */
    await p.click('#clearBtn');
    await new Promise((r) => setTimeout(r, 300));
    const shown = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      ticked: [...document.querySelectorAll('.wp-pick')].filter((c) => c.checked).length
    }));
    t('Clear puts every row back', shown.rows === N, shown.rows);
    t('and nothing ticked is off screen, which is the rule that matters',
      shown.ticked <= shown.rows && shown.ticked === GAPPED,
      shown.ticked + ' ticked of ' + shown.rows + ' shown');

    /* ---- CLICKING A PIN FILTERS THE LIST TO THAT WAYPOINT ---------------
       DRIVEN BY CLICKING A REAL PIN, not by calling the page's own state: the
       thing being tested is a Leaflet marker's click handler, and a stub for
       that would be testing the stub. */
    const pins = await p.$$('.wp-pin');
    /* FOUR OF THE SIX ARE LOCATED. The other two arrive with no point, no
       address, no zip and no source -- they are what Fill has to mend. */
    t('every located waypoint has a pin', pins.length === LOCATED, pins.length);
    t('and a pin looks pressable',
      await p.evaluate(() => getComputedStyle(document.querySelector('.wp-pin')).cursor) === 'pointer');

    await pins[0].click();
    await new Promise((r) => setTimeout(r, 250));
    const pinned = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      name: (document.querySelector('.wp .wp-name') || document.querySelector('.wp')).textContent.trim().slice(0, 8),
      marked: document.querySelectorAll('.wp-pin.is-pinned').length,
      pins: document.querySelectorAll('.wp-pin').length,
      count: document.getElementById('listCount').textContent,
      scribble: document.getElementById('pageStatus').textContent,
      clear: document.getElementById('clearBtn').getAttribute('aria-disabled')
    }));
    t('the list narrows to that one waypoint', pinned.rows === 1, pinned.rows);
    t('and it is the one the pin belongs to', pinned.name.indexOf('Place') === 0, pinned.name);
    /* THE MAP KEEPS EVERY PIN. Drawn from the fully filtered list it would show
       the one pin just pressed, and there would be no way to pick a different
       waypoint without clearing first. */
    t('the map keeps all its pins, so another can be picked', pinned.pins === LOCATED, pinned.pins);
    t('exactly one is marked as the one filtering', pinned.marked === 1, pinned.marked);
    t('the panel says how much of the total is left',
      pinned.count === '1 of ' + N + ' shown', pinned.count);
    t('and it says how to put the list back',
      /Press the pin again, or Clear/.test(pinned.scribble), pinned.scribble);
    /* A NARROWING WITH NO VISIBLE WAY OUT IS THE THING THIS ROOM HAS REMOVED
       BEFORE, so the pin counts as a filter and Clear lights up for it. */
    t('Clear lights up for it', pinned.clear === 'false', pinned.clear);

    /* ANOTHER PIN MOVES THE FILTER rather than adding to it.
       BY IDENTITY, NEVER BY INDEX. The map refits to whatever is located, so
       which pin sits at position 3 depends on the fixture's geography -- and
       when a row was added in another state the pins spread out, the click at
       that index landed on nothing, and the harness reported a page fault that
       was its own. */
    /* THE FURTHEST PIN FROM THE PINNED ONE, because pins overlap: the pinned
       pin is larger and drawn on top, so a click aimed at a neighbour a few
       pixels away lands on THAT one and toggles the filter off. The harness
       read that as the page ignoring the press. */
    const otherIdx = await p.evaluate(() => {
      const all = [...document.querySelectorAll('.wp-pin')];
      const box = (n) => { const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
      const on = box(document.querySelector('.wp-pin.is-pinned'));
      let best = -1, far = -1;
      all.forEach((n, i) => {
        if (n.classList.contains('is-pinned')) return;
        const b = box(n);
        const d = Math.hypot(b[0] - on[0], b[1] - on[1]);
        if (d > far) { far = d; best = i; }
      });
      return best;
    });
    const other = (await p.$$('.wp-pin'))[otherIdx];
    await other.click();
    await new Promise((r) => setTimeout(r, 250));
    const moved = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      marked: document.querySelectorAll('.wp-pin.is-pinned').length
    }));
    t('a second pin moves the filter rather than adding to it',
      moved.rows === 1 && moved.marked === 1, moved.rows + '/' + moved.marked);

    /* THE PIN IS ITS OWN WAY OUT, the rule the game cards on /games/ keep. */
    const same = (await p.$$('.wp-pin.is-pinned'))[0];
    await same.evaluate((n) => n.scrollIntoView({ block: 'center' }));
    await same.click();
    await new Promise((r) => setTimeout(r, 250));
    const off = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      marked: document.querySelectorAll('.wp-pin.is-pinned').length,
      count: document.getElementById('listCount').textContent
    }));
    t('pressing the same pin again puts the list back', off.rows === N, off.rows);
    t('nothing is marked', off.marked === 0, off.marked);
    t('and the panel goes quiet again', off.count === '', off.count);

    /* ---- THE WHOLE ROW OPENS THE POPUP (2026-08-31) ---------------------
       The name was a link to the waypoint's SOURCE, which made it the one part
       of the row that did NOT open the editor -- so the row meant two things
       depending on which pixel you hit. */
    t('no name in the list is a link',
      await p.evaluate(() => document.querySelectorAll('.wp-name a').length) === 0);

    /* CLICKING THE NAME OPENS THE EDITOR, which is the half that changed. */
    await p.click('.wp .wp-name');
    await new Promise((r) => setTimeout(r, 250));
    const viaName = await p.evaluate(() => ({
      open: document.getElementById('dlg').classList.contains('is-open'),
      src: document.getElementById('fSourceUrl').value,
      href: document.getElementById('fSourceOpen').getAttribute('href'),
      dis: document.getElementById('fSourceOpen').getAttribute('aria-disabled')
    }));
    t('clicking the name opens the editor', viaName.open);
    /* THE SOURCE IS NOT STRANDED: the editor's own field grew an Open, which is
       now the only way to follow one. */
    t('and the source can still be followed from it',
      viaName.href === 'https://en.wikipedia.org/wiki/Place1' && viaName.dis === 'false',
      viaName.href + ' / ' + viaName.dis);

    /* A VALUE THAT IS NOT A URL LEAVES THE BUTTON OFF, and the protocol check is
       the security: `javascript:` parses perfectly well as a URL. */
    await p.evaluate(() => {
      const f = document.getElementById('fSourceUrl');
      f.value = 'javascript:alert(1)';
      f.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const jsUrl = await p.evaluate(() => ({
      href: document.getElementById('fSourceOpen').getAttribute('href'),
      dis: document.getElementById('fSourceOpen').getAttribute('aria-disabled')
    }));
    t('a javascript: url never becomes a live href', jsUrl.href === null && jsUrl.dis === 'true',
      jsUrl.href + ' / ' + jsUrl.dis);
    await p.evaluate(() => document.getElementById('closeBtn').click());
    await new Promise((r) => setTimeout(r, 200));

    /* THE TICK IS THE ONE EXEMPTION, or selecting a row would open a dialog
       over the list. */
    await p.click('.wp .wp-pick');
    await new Promise((r) => setTimeout(r, 200));
    t('ticking a row does not open the editor',
      await p.evaluate(() => !document.getElementById('dlg').classList.contains('is-open')));
    await p.click('.wp .wp-pick');
    await new Promise((r) => setTimeout(r, 150));

    /* ---- EITHER SELECTOR CLEARS THE OTHER NARROWINGS FIRST (2026-08-31) --
       Both mean "this one", and a leftover place filter or a half-typed search
       could hide the very waypoint just chosen -- a press that appears to do
       nothing, which is the worst answer a control can give. */
    /* A SEARCH THAT STILL LEAVES PINS, because the map narrows with every
       filter except the pin -- so a search matching nothing would leave nothing
       to click, which is correct and untestable. */
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'chicago'; q.dispatchEvent(new Event('input', { bubbles: true }));
      const sel = document.getElementById('placeFilter');
      sel.value = sel.options[sel.options.length - 1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    const pinsNow = await p.$$('.wp-pin');
    await pinsNow[0].click();
    await new Promise((r) => setTimeout(r, 300));
    const afterPin = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      q: document.getElementById('q').value,
      place: document.getElementById('placeFilter').value
    }));
    /* THE PIN WINS AND THE ROW APPEARS, which it could not have done with a
       search for `zzz-nothing` still set. */
    t('a pin clears the search and the place filter first',
      afterPin.rows === 1 && afterPin.q === '' && afterPin.place === 'any',
      JSON.stringify(afterPin));

    /* AND THE FIND BOX LETS THE PIN GO, or a map selection made a moment ago
       would go on narrowing to one row while the box says something else. */
    await p.evaluate(() => {
      const sel = document.getElementById('placeFilter');
      sel.value = sel.options[sel.options.length - 1].value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      const q = document.getElementById('q');
      q.value = 'Place 3'; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 300));
    const afterFind = await p.evaluate(() => ({
      rows: document.querySelectorAll('.wp').length,
      marked: document.querySelectorAll('.wp-pin.is-pinned').length,
      place: document.getElementById('placeFilter').value
    }));
    t('picking in Find drops the pin and the place filter',
      afterFind.rows === 1 && afterFind.marked === 0 && afterFind.place === 'any',
      JSON.stringify(afterFind));
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));

    /* ---- THE FIND BOX FILTERS AS YOU TYPE AND OFFERS NOTHING ------------
       It was bound to a datalist of every name until 2026-08-31, and a datalist
       opens on FOCUS showing everything it holds -- so clicking into the box
       dropped the whole library over the list underneath, and the list
       underneath is the answer. You had to click away from the control to read
       what it had found. */
    const find = await p.evaluate(() => {
      const q = document.getElementById('q');
      return {
        type: q.type,
        bound: q.getAttribute('list'),
        lists: document.querySelectorAll('datalist').length,
        placeholder: q.placeholder
      };
    });
    t('it is still a search box', find.type === 'search', find.type);
    /* NOTHING MAY COVER THE ANSWER. A `list` attribute is the whole fault, so
       the check asks for its absence rather than for a narrower list: a
       dropdown that merely opened smaller would still sit over the results. */
    t('and it is bound to no dropdown', find.bound === null, find.bound);
    t('and the page holds no datalist at all', find.lists === 0, find.lists);
    t('and the placeholder says the one job it has',
      /^Search waypoints/.test(find.placeholder), find.placeholder);

    /* THE LIST NARROWS ON EVERY KEYSTROKE, which it always did -- what changed
       is that nothing is dropped over it. Typed one letter at a time, because
       assigning `.value` in one go would pass over a handler that only fired
       on a complete word. */
    await p.evaluate(async () => {
      const q = document.getElementById('q');
      q.value = '';
      for (const ch of 'Place 4') {
        q.value += ch;
        q.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise((r) => setTimeout(r, 250));
    t('typing a name narrows to that waypoint',
      await p.evaluate(() => document.querySelectorAll('.wp').length) === 1);
    /* AND EVERY OPTION THE DROPDOWN HELD IS STILL REACHABLE, which is what
       makes losing it cheap: a partial name matches. */
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'Place';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    t('and a partial name reaches every row it should',
      await p.evaluate(() => document.querySelectorAll('.wp').length) === N);
    /* TYPING SEARCHES MORE THAN THE NAME, which the dropdown never could:
       the city was not in it and still matches. */
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = 'chicago';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 250));
    t('and typing still searches every field, not just the name',
      await p.evaluate(() => document.querySelectorAll('.wp').length) === N);
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));

    /* ---- THE BATCH BAR IS SELECT ALL, A COUNT AND DELETE (2026-08-31) ----
       Set city, Set state and Apply are gone, asked for outright. Setting a
       city across a selection is SQL now, or the editor one row at a time. */
    const bar = await p.evaluate(() => ({
      texts: document.querySelectorAll('.batch-row input[type="text"]').length,
      buttons: [...document.querySelectorAll('.batch-row .btn')].map((b) => b.textContent),
      sep: document.querySelectorAll('.batch-row .bar-sep').length,
      hasAll: !!document.getElementById('batchAllBox'),
      hasCount: !!document.getElementById('batchCount')
    }));
    t('no text boxes are left in the batch bar', bar.texts === 0, bar.texts);
    /* FILL SITS LEFT OF DELETE: the order of consequence, the one that mends
       before the one that destroys. */
    /* THREE BUTTONS, IN THE ORDER OF CONSEQUENCE: FIX looks the blanks up
       here, from a geocoder and an encyclopedia; OUTSOURCE FIX writes the same
       errand out as a prompt for an AI with a browser, which can read a page a
       geocoder cannot; DELETE is last because it is the one that destroys. */
    t('three buttons: Fix, Outsource fix, Delete',
      bar.buttons.join(',') === 'Fix,Outsource fix,Delete', bar.buttons.join(','));

    /* ---- OUTSOURCE FIX (2026-08-31) --------------------------------------
       FIX looks the blanks up here and is exact where it works; measured on the
       live rows, most of what it cannot mend are markers, statues and monuments
       that NO GEOCODER HOLDS. An AI with a browser can read the historical
       society page that does. So this is the second thing to try, not a
       different feature -- and it takes the rows already on screen rather than
       asking for new ones. */
    await p.evaluate(() => { document.getElementById("batchAllBox").click(); });
    await new Promise((r) => setTimeout(r, 200));
    await p.click("#batchPromptBtn");
    await new Promise((r) => setTimeout(r, 250));
    const fix = await p.evaluate(() => ({
      open: document.getElementById("fixDlg").classList.contains("is-open"),
      text: document.getElementById("fixPrompt").value
    }));

    t("it opens a dialog with a prompt in it", fix.open && fix.text.length > 800,
      fix.open + " / " + fix.text.length);

    /* IT HANDS BACK AN UPDATE, WHICH IS THE WHOLE DIFFERENCE from the ADD
       prompt: these rows exist, so an insert would make second copies of them. */
    t("it asks for UPDATE, not INSERT",
      fix.text.indexOf("update public.waypoints set") !== -1
      && fix.text.indexOf("insert into public.waypoints") === -1);
    t("keyed on the wpid, which is permanent",
      fix.text.indexOf("where wpid =") !== -1);

    /* ONLY THE ROWS WITH A GAP. A complete row in the prompt is a row the AI is
       invited to change, and there is nothing on it to change. */
    const listed = (fix.text.match(/wpid [0-9]+ -- needs/g) || []).length;
    t("it lists only the waypoints with something missing",
      listed === GAPPED, listed + " of " + GAPPED);

    /* AND IT SAYS WHAT EACH ONE NEEDS, in the COLUMNS the SQL will set rather
       than the room own words: the pill says `coordinates` and an UPDATE has to
       say `lat` and `lon`. The needs come from the same table the pills do. */
    t("each row says what it needs, in column names",
      fix.text.indexOf("needs lat and lon") !== -1, 
      (fix.text.match(/wpid [0-9]+ -- needs [^\n]*/) || [""])[0]);

    /* AND IT CARRIES WHAT THE ROW ALREADY HAS, so the AI is not sent looking up
       a city we can already tell it. */
    t("and what it already has", fix.text.indexOf("city: Chicago") !== -1);

    /* THE TWO SHARED BLOCKS ARE IN BOTH PROMPTS AND WRITTEN ONCE. A second copy
       drifts the first time either is edited, which is the fault this repo keeps
       paying for. */
    t("it shares the sourcing rules with the ADD prompt",
      fix.text.indexOf("atlasobscura.com") !== -1
      && fix.text.indexOf("WHERE TO GO LOOKING") !== -1);
    t("and the four lessons",
      fix.text.indexOf("Pride of Baltimore") !== -1
      && fix.text.indexOf("Portland, Maine") !== -1);

    /* SET ONLY WHAT WAS ASKED FOR. Everything else on the row was typed by a
       person, and an UPDATE naming a column nobody asked about overwrites it. */
    t("it forbids setting anything it did not ask for",
      fix.text.indexOf("SET ONLY THE FIELDS I ASKED FOR") !== -1);
    t("and a row it cannot mend gets no UPDATE at all",
      fix.text.indexOf("gets no UPDATE at all") !== -1);

    await p.click("#fixCloseBtn");
    await new Promise((r) => setTimeout(r, 150));
    t("Close shuts it",
      !(await p.evaluate(() => document.getElementById("fixDlg").classList.contains("is-open"))));

    /* AND IT REFUSES WITH NOTHING TICKED, saying what to do rather than opening
       an empty prompt. */
    await p.evaluate(() => { document.getElementById("batchAllBox").click(); });
    await new Promise((r) => setTimeout(r, 200));
    await p.click("#batchPromptBtn");
    await new Promise((r) => setTimeout(r, 200));
    t("with nothing ticked it says so rather than opening",
      !(await p.evaluate(() => document.getElementById("fixDlg").classList.contains("is-open")))
      && /Tick some waypoints first/.test(
        await p.evaluate(() => document.getElementById("pageStatus").textContent)),
      await p.evaluate(() => document.getElementById("pageStatus").textContent));

    /* THE HAIRLINE STOOD BETWEEN APPLY AND DELETE to say they were not two
       options of one kind. It went with Apply. */
    t('and the hairline went with Apply', bar.sep === 0, bar.sep);
    t('Select all and the count stay', bar.hasAll && bar.hasCount);

    /* ---- FILL LOOKS UP WHAT IS BLANK (2026-08-31) -----------------------
       DRIVEN BY TICKING ROWS AND PRESSING IT, not by calling the function. */
    await p.evaluate(() => {
      document.getElementById('batchAllBox').click();
    });
    await new Promise((r) => setTimeout(r, 200));
    t('Fill is off until something is ticked, and on after',
      await p.evaluate(() => document.getElementById('batchFillBtn').getAttribute('aria-disabled')) === 'false');

    const before = patches.length;
    await p.click('#batchFillBtn');
    /* WAIT FOR THE RUN'S OWN END SIGNAL, never a flat number of seconds. The
       button reads Stop while it runs and Fix when it is done, and the report
       has to be read the moment it lands: `setStatus` clears a clean success
       after six seconds, so a fixed nine-second wait read an EMPTY scribble --
       and the assertion below had been passing only because the old ladder was
       slow enough to still be running at nine. */
    await p.waitForFunction(
      () => /^Fix/.test(document.getElementById('batchFillBtn').textContent),
      { timeout: 40000, polling: 120 });

    const after = await p.evaluate(() => ({
      scribble: document.getElementById('pageStatus').textContent,
      btn: document.getElementById('batchFillBtn').textContent,
      rows: [...document.querySelectorAll('.wp')].length,
      missing: [...document.querySelectorAll('.wp-tag--missing')].length
    }));
    const wrote = patches.slice(before);

    /* ONE REQUEST A SECOND TO NOMINATIM, ACROSS THE WHOLE RUN AND NOT MERELY
       WITHIN A ROW. This is the guarantee that gets the project blocked when
       it is broken, and nothing tested it: a per-row counter paced the calls
       inside a row perfectly and let the first call of the next row follow
       the last call of this one with no gap at all. Measured from the stub's
       own arrival times, with a little slack for the timer. */
    const geoGaps = geoAt.slice(1).map((t, i) => t - geoAt[i]);
    t('no two geocoder calls are closer than a second, across rows as well as within one',
      geoGaps.every((g) => g >= 1000), geoGaps.join(','));

    const geoCalls = lookups.filter((l) => l.indexOf('nominatim') === 0);
    const kinds = geoCalls.map((l) => l.split(' ')[1]);

    /* ---- THE LADDER, WHICH IS THE WHOLE OF THE QUALITY ------------------
       ONE METHOD PER FIELD, ANCHORED ON A POINT. The old Fill made three
       separate guesses -- a point from one search, an address from another, a
       postcode from a third -- which could disagree with each other on a row
       nobody would ever check. Now the point is established first and every
       other geographic field is read off that one coordinate, so they agree by
       construction. */

    /* EVERY POINT, FOUND OR ALREADY HELD, IS THEN REVERSED, so a row's address
       and postcode come off the same spot as its coordinate rather than off
       whatever a name search happened to match. Four rows reach a point here --
       two that already held one and two that found one -- and every one of them
       is asked what is at it. */
    t('every point, found or already held, is reversed for the rest',
      kinds.filter((k) => k === 'reverse').length === 4, kinds.join(','));

    /* THE ADDRESS IS A LEAD TO BE ADJUSTED, NOT FIXED INPUT. Place 8's street
       carries `Suite 400`, which defeats a geocode outright -- Nominatim has no
       idea what suite 400 is and answers with nothing at all. The tidied
       variant is what hits, which is why there are two structured calls. */
    t('a street that misses as written is tidied and asked again',
      kinds.filter((k) => k === 'structured').length === 2, kinds.join(','));

    /* AND ONLY A ROW WITH NEITHER A POINT NOR A STREET falls to the free-form
       name search, which is the rung that can be wrong. There is deliberately
       no city-only rung below it: that fallback once put fourteen Minneapolis
       markers on one point, every one looking like a success. */
    t('only a row with neither a point nor a street falls to the name search',
      kinds.filter((k) => k === 'freeform').length === 2, kinds.join(','));

    /* ---- A RETURNED COORDINATE IS CHECKED, WHICH IT NEVER WAS -----------
       The old Fill asked for one result and took it, so a name search for a
       marker in Portland, Oregon answering with one in Portland, Maine was
       written and nothing on the row or the map would ever say otherwise: a
       wrong point looks exactly like a right one. The stub answers the
       free-form search with a Maine candidate FIRST, and it has to be stepped
       over. */
    const five = wrote.filter((x) => x.id === 5)[0];
    t('a candidate in the wrong state is stepped over, not taken',
      five && five.body.lat === 41.9 && five.body.lon === -87.7,
      five && five.body.lat + ',' + five.body.lon);

    /* AND THE ADDRESS AND ZIP COME OFF THAT POINT, not off the search hit. The
       forward hit said `77 Wacker Dr` / `60606`; the reverse of the coordinate
       it returned says `197 Madison St` / `60601`, and the reverse is the one
       actually about the point being stored. */
    t('the address is read off the point, not off the search hit',
      five && five.body.address === '197 Madison St', five && five.body.address);
    t('and so is the postcode, so the three agree with each other',
      five && five.body.zip === '60601', five && five.body.zip);

    /* ---- WIKIPEDIA BY COORDINATE ----------------------------------------
       A text search is the weakest way to find an article about a place: it is
       a global index, so a marker's name matches a book, a band, or the same
       monument in another state. Geosearch asks which articles are NEAR this
       coordinate, which is a different question with a far better answer. */
    t('the article is looked for by coordinate first',
      lookups.indexOf('wikipedia geosearch') !== -1, lookups.join(' | '));
    /* WHAT IS NEARBY IS NOT NECESSARILY WHAT THIS IS. The stub puts a real
       neighbouring article first; taking it would cite a marker to whatever
       monument stands beside it, so the name still has to agree. */
    t('but a nearby article whose name does not fit is refused',
      five && five.body.source_url.indexOf('Place_5_Monument') !== -1,
      five && five.body.source_url);
    t('and the source and the description come off that one article',
      five && five.body.description === 'A described thing.', five && five.body.description);

    /* ---- A ROW WHOSE OWN FIELDS DISAGREE IS A FINDING -------------------
       Place 9 holds a point in the next town over. The map draws it happily,
       the pills say nothing, and a reverse lookup is the only thing in this
       project that will ever notice. Fill writes NOTHING off it -- one of the
       two values is wrong and only a person can say which -- and names it. */
    t('a point that disagrees with the row is not written off',
      wrote.filter((x) => x.id === 9).length === 0);
    t('and the disagreement is reported by name',
      after.scribble.indexOf('Place 9: its point is in Evanston, not Chicago') !== -1,
      after.scribble);

    /* AND A ROW WITH NOTHING TO WRITE IS NOT PATCHED AT ALL. */
    t('a boundary match still writes nothing whatsoever',
      wrote.filter((x) => x.id === 6).length === 0);
    t('so it wrote every row it could resolve and no others',
      wrote.length === 3, wrote.length);

    /* ---- THE REPORT ------------------------------------------------------
       THE LIST IS THE REPORT AND THE PEN IS ONE LINE. The rows it could not
       mend are still on screen, still ticked, wearing their own pills, so the
       pen says how the run went and points at them. */
    t('the shortfall is named, never rounded up',
      after.scribble.indexOf('Filled 3 of 5') === 0, after.scribble);
    t('and the pen stays short enough to be handwriting beside the room name',
      after.scribble.length <= 160, after.scribble.length + ' chars');
    /* THE FIELD-BY-FIELD DETAIL IS NOT LOST, it moved to the console, which is
       where a record of what a write path actually wrote belongs. */
    t('what it wrote is recorded, field by field, where a record belongs',
      logs.some((l) => l.indexOf('Fill wrote:') === 0 && l.indexOf('Place 8 (point, zip)') !== -1),
      logs.filter((l) => l.indexOf('Fill ') === 0).join(' | '));
    /* A REPORT THAT POINTS AT UNFINISHED WORK MUST NOT CLEAR ITSELF after six
       seconds while somebody is still reading it. */
    t('a run with a shortfall in it stays on screen',
      await p.evaluate(() => document.getElementById('pageStatus').classList.contains('error')));

    await p.evaluate(() => document.getElementById('batchAllBox').click());
    await new Promise((r) => setTimeout(r, 200));

    /* AND THE FILTERED FORM, which is the only thing the panel now says. */
    await p.type('#q', 'Place 4');
    await new Promise((r) => setTimeout(r, 300));
    const filtered = await p.evaluate(() => ({
      count: document.getElementById('listCount').textContent,
      blurb: document.querySelector('.room-blurb').textContent
    }));
    t('a filter says how much of the total is left',
      filtered.count === '1 of ' + N + ' shown', filtered.count);
    /* THE BLURB IS THE TOTAL AND DOES NOT MOVE WITH A FILTER: a number that
       shrank as you typed would read as the filter breaking. */
    t('and the blurb still says the whole library',
      filtered.blurb.indexOf(N + ' Waypoints.') === 0, filtered.blurb.slice(0, 24));
    await p.evaluate(() => {
      const q = document.getElementById('q');
      q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 200));

    /* SCROLLED TO THE LIST, because the panel this change is about is below the
       fold and a screenshot of the header proves nothing about it. */
    await p.click('#checkBtn');
    await new Promise((r) => setTimeout(r, 400));
    await p.evaluate(() => {
      const b = document.getElementById('batchBar');
      if (b) b.scrollIntoView({ block: 'center' });
    });
    await new Promise((r) => setTimeout(r, 200));
    await p.screenshot({ path: 'C:/tmp/wp.png' });
    console.log('');
    console.log(ok + ' ok, ' + bad + ' FAIL');
    if (bad) process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
