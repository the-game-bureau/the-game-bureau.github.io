/* THE MAP, THE TWO AUDIENCES AND THE ANCHOR'S DATE REACH THE PATCH.
   ---------------------------------------------------------------------------
   THREE THINGS ON THE GAME BUILDER LOOKED SAVED AND WERE NOT, as of 2026-09-06:

   - `map_id: false` sat in SUPABASE_GAMES_SCHEMA, and that flag was the only
     write path's gate, so picking a map wrote the meta, reported Saved and
     never reached the PATCH. 0 of 393 games carried a real map.
   - `markDirty()` was called by the map and logo commits and DEFINED NOWHERE,
     so every map pick threw a ReferenceError before the repaint.
   - `target` / `rival` were free text over prose columns, so nothing could
     join a game to an audience. 2026090601 adds `target_id` / `rival_id`, and
     the boxes are pickers over public.audiences writing the id and deriving
     the prose in one act.

   AND THE ANCHOR SUGGESTS THE DATE: a BLANK tgb_date fills with the event's
   start_date minus one day, and a typed date is never overwritten.

   WHY A REAL BROWSER: every claim is about what LEAVES the page after a datalist
   pick, and a datalist pick fires `change`, which a source read cannot see.

   RUN FROM THE REPO ROOT. It serves the repo over http itself. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };

/* THE FIXTURE IS A ROW FILED BEFORE THE ID COLUMNS EXISTED ON ONE SIDE and after
   them on the other: the target carries PROSE and no id (the legacy state, so
   the "not linked yet" note is exercised), the rival carries an id (so the
   paint-from-a-stored-id half is exercised), and the date is blank. */
const GAME_NODE = [{ id: 'n1', type: 'game', title: 'Probe Game',
                     tagline: 'A walk', city: 'New Orleans, Louisiana' }];
const mkGame = () => ({
  id: 'probe', name: 'Probe Game', city: 'New Orleans, Louisiana',
  archived: 'YES', status: 'building', tagline: 'A walk',
  anchor_event_id: null, tgb_date: null, map_id: null,
  target: 'Chicago Bears fans', target_id: null,
  rival: 'New Orleans Saints fans', rival_id: 'nfl-new-orleans',
  nodes: GAME_NODE, links: [], updated_at: '2026-01-01T00:00:00Z'
});

const EVENTS = [
  { id: 'NFL-2027-01-01-CHI-NO', kind: 'sports', title: null,
    start_date: '2027-01-01', venue_city: 'New Orleans, Louisiana',
    away_team_geo: 'Chicago', away_team_nickname: 'Bears',
    home_team_geo: 'New Orleans', home_team_nickname: 'Saints',
    league: 'NFL', away_team_name: 'Chicago Bears', home_team_name: 'New Orleans Saints' },
  { id: 'NFL-2027-03-15-CHI-NO', kind: 'sports', title: null,
    start_date: '2027-03-15', venue_city: 'New Orleans, Louisiana',
    away_team_geo: 'Chicago', away_team_nickname: 'Bears',
    home_team_geo: 'New Orleans', home_team_nickname: 'Saints',
    league: 'NFL', away_team_name: 'Chicago Bears', home_team_name: 'New Orleans Saints' }
];
/* ONE BODY FOR EVERY /audiences READ, so the rows carry a superset: the picker
   asks for five columns and the palette list asks for `*`. */
const AUDIENCES = [
  { id: 'nfl-chicago', full_name: 'Chicago Bears', first: 'Chicago', last: 'Bears',
    type: 'sports', league: 'NFL', code: 'CHI', city: 'Chicago, IL',
    primary: '#0B162A', secondary: '#C83803', tertiary: '#FFFFFF', text: '#FFFFFF' },
  { id: 'nfl-new-orleans', full_name: 'New Orleans Saints', first: 'New Orleans', last: 'Saints',
    type: 'sports', league: 'NFL', code: 'NO', city: 'New Orleans, LA',
    primary: '#D3BC8D', secondary: '#101820', tertiary: '#FFFFFF', text: '#FFFFFF' }
];
const ATLAS = [
  { map_id: 'new-orleans-murder-map', map_name: 'Murder Map', stop_order: 1 },
  { map_id: 'new-orleans-murder-map', map_name: 'Murder Map', stop_order: 2 }
];

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  await new Promise((r) => server.listen(8849, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  try {
    const writes = [], reads = [], errs = [];
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                     'access-control-expose-headers': 'content-range' };
      if (req.method() === 'OPTIONS') { req.respond({ status: 204, headers: cors }); return; }
      if (req.method() === 'GET') reads.push(u);
      else writes.push({ m: req.method(), u: u, b: req.postData() });
      let body = [];
      if (u.indexOf('/events') !== -1) body = EVENTS;
      else if (u.indexOf('/audiences') !== -1) body = AUDIENCES;
      else if (u.indexOf('/atlas') !== -1) body = ATLAS;
      else if (u.indexOf('/games') !== -1) body = [mkGame()];
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-0/1' }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8849/mc/games/?id=probe', { waitUntil: 'networkidle2' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    /* WAIT ON THE CONDITION, NEVER ON A CLOCK: both lists are fetched after the
       gate opens and the audiences are paged. */
    await p.waitForFunction(() => document.querySelectorAll('#audienceList option').length > 0
      && document.querySelectorAll('#gameMapList option').length > 0
      && document.querySelectorAll('#anchorEventList option').length > 1, { timeout: 15000 })
      .catch(() => {});
    await wait(800);

    /* A DATALIST PICK SETS THE VALUE AND FIRES input THEN change. */
    const pick = (id, value) => p.evaluate((sel, v) => {
      const i = document.getElementById(sel);
      i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, value);
    const optionWith = (listId, needle) => p.evaluate((l, n) => {
      const o = [...document.querySelectorAll('#' + l + ' option')]
        .find((x) => (x.value || x.textContent).indexOf(n) !== -1);
      return o ? (o.value || o.textContent) : null;
    }, listId, needle);
    const box = (id) => p.evaluate((sel) => {
      const i = document.getElementById(sel);
      return i ? { value: i.value, disabled: i.disabled, invalid: i.getAttribute('data-invalid'),
                   placeholder: i.placeholder } : null;
    }, id);
    const noteOf = (id) => p.evaluate((sel) => {
      const n = document.getElementById(sel); return n ? n.textContent : null;
    }, id);

    /* ---- THE READ ------------------------------------------------------ */
    console.log('the read');
    const rowRead = reads.find((u) => u.indexOf('id=eq.probe') !== -1 && u.indexOf('/games') !== -1);
    const sel = rowRead ? decodeURIComponent(new URL(rowRead).searchParams.get('select') || '') : '';
    const cols = sel.split(',');
    t('  the row read asks for map_id', cols.indexOf('map_id') !== -1, sel);
    t('  and for target_id and rival_id',
      cols.indexOf('target_id') !== -1 && cols.indexOf('rival_id') !== -1, sel);

    /* ---- ON OPEN ------------------------------------------------------- */
    console.log('');
    console.log('on open');
    const rivalOpen = await box('rival');
    const saintsLabel = await optionWith('audienceList', 'nfl-new-orleans');
    t('  the audience list is built from the rows', !!saintsLabel, saintsLabel);
    t('  a stored rival id paints as its label',
      rivalOpen && saintsLabel && rivalOpen.value === saintsLabel,
      rivalOpen && JSON.stringify(rivalOpen.value));
    const targetOpen = await box('target');
    t('  a target with prose and no id shows the prose',
      targetOpen && targetOpen.value === 'Chicago Bears fans',
      targetOpen && JSON.stringify(targetOpen.value));
    t('  and says it is not linked yet',
      String(await noteOf('targetNote')).indexOf('Not linked') !== -1, await noteOf('targetNote'));
    t('  both pickers are enabled over an open game',
      targetOpen && rivalOpen && !targetOpen.disabled && !rivalOpen.disabled);

    /* ---- THE ANCHOR FILLS A BLANK DATE ---------------------------------- */
    console.log('');
    console.log('the anchor and the date');
    const evA = await optionWith('anchorEventList', '2027-01-01');
    const evB = await optionWith('anchorEventList', '2027-03-15');
    t('  both events are offered', !!evA && !!evB, [evA, evB].join(' | '));
    await pick('anchorEventInput', evA);
    await wait(400);
    const dateAfterA = await box('tgbDate');
    t('  choosing an event fills a BLANK date with the day before it',
      dateAfterA && dateAfterA.value === '2026-12-31', dateAfterA && dateAfterA.value);
    /* NOW A TYPED DATE, AND A DIFFERENT EVENT: the typed one is theirs. */
    await p.evaluate(() => {
      const d = document.getElementById('tgbDate');
      d.value = '2027-06-01';
      d.dispatchEvent(new Event('input', { bubbles: true }));
      d.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await pick('anchorEventInput', evB);
    await wait(400);
    const dateAfterB = await box('tgbDate');
    t('  and never overwrites a date somebody typed',
      dateAfterB && dateAfterB.value === '2027-06-01', dateAfterB && dateAfterB.value);

    /* ---- THE AUDIENCES ------------------------------------------------- */
    console.log('');
    console.log('the audiences');
    const bearsLabel = await optionWith('audienceList', 'nfl-chicago');
    await pick('target', bearsLabel);
    await wait(300);
    const targetPicked = await box('target');
    t('  picking a target paints its label', targetPicked && targetPicked.value === bearsLabel,
      targetPicked && JSON.stringify(targetPicked.value));
    t('  and the not-linked note clears', String(await noteOf('targetNote')) === '',
      await noteOf('targetNote'));
    await pick('rival', 'Nobody In Particular');
    await wait(300);
    const rivalTypo = await box('rival');
    t('  a typo is refused, never stored', rivalTypo && rivalTypo.invalid === 'true',
      rivalTypo && JSON.stringify(rivalTypo));
    t('  and says so', String(await noteOf('rivalNote')).indexOf('No audience called') !== -1,
      await noteOf('rivalNote'));
    await pick('rival', '');
    await wait(300);
    const rivalCleared = await box('rival');
    t('  clearing the box is accepted', rivalCleared && rivalCleared.value === '' && !rivalCleared.invalid,
      rivalCleared && JSON.stringify(rivalCleared));

    /* ---- THE MAP ------------------------------------------------------- */
    console.log('');
    console.log('the map');
    const mapLabel = await optionWith('gameMapList', 'new-orleans-murder-map');
    t('  the map list is built from the atlas', !!mapLabel, mapLabel);
    await pick('gameMapInput', mapLabel);
    await wait(300);
    const mapBox = await box('gameMapInput');
    t('  picking a map paints its label without throwing',
      mapBox && mapBox.value === mapLabel && errs.length === 0,
      errs.join(' | ') || (mapBox && mapBox.value));

    /* ---- THE SAVE ------------------------------------------------------ */
    console.log('');
    console.log('the save');
    const armed = await p.evaluate(() => {
      const b = document.getElementById('gamePickerSaveBtn');
      return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    });
    t('  the Save button is armed', armed);
    writes.length = 0;
    await p.evaluate(() => { const b = document.getElementById('gamePickerSaveBtn'); if (b) b.click(); });
    await wait(1800);
    const upsert = writes.find((w) => w.u.indexOf('/games') !== -1);
    let row = null;
    if (upsert) { try { const j = JSON.parse(upsert.b); row = Array.isArray(j) ? j[0] : j; } catch (e) {} }
    t('  pressing it writes the row', !!row, writes.length);
    const has = (k) => !!row && Object.prototype.hasOwnProperty.call(row, k);
    t('  carrying the map', row && row.map_id === 'new-orleans-murder-map',
      row && JSON.stringify(row.map_id));
    t('  the target id', row && row.target_id === 'nfl-chicago', row && JSON.stringify(row.target_id));
    t('  and the prose derived from it', row && row.target === 'Chicago Bears fans',
      row && JSON.stringify(row.target));
    t('  a NULL for the rival that was cleared, not an absent key',
      has('rival_id') && row.rival_id === null, row && JSON.stringify(row.rival_id));
    t('  and a NULL for its prose too', has('rival') && row.rival === null,
      row && JSON.stringify(row.rival));
    t('  the typed date', row && row.tgb_date === '2027-06-01', row && JSON.stringify(row.tgb_date));
    t('  and the second event', row && row.anchor_event_id === 'NFL-2027-03-15-CHI-NO',
      row && JSON.stringify(row.anchor_event_id));
    t('  with no page errors', errs.length === 0, errs.join(' | '));
    await p.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
