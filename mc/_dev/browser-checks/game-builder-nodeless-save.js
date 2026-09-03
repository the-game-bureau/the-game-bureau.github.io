/* A GAME WITH AN EMPTY FLOW DOCUMENT SAVES LIKE ANY OTHER.
   ---------------------------------------------------------------------------
   ELEVEN OF THE 395 GAMES HAVE NO GAME NODE -- batonrouge2026, biloxi2026,
   paris2026 and eight more. `shouldStageCurrentGameForSave` opened with
   `if (!hasGameNode()) return false`, so on those games nothing was ever staged
   and NOTHING ON THE PAGE SAVED: not the anchor event, not the audiences, not
   the name, not one field.

   AND IT REPORTED SUCCESS. `canSaveCurrentGame` reads `hasUnsavedChanges`,
   which compares a snapshot that DOES include the meta -- so the button lit,
   the press ran, and the row went back with the values it was loaded with.

   WHAT MADE IT REACHABLE was making those fields editable on such a game
   earlier the same day. Before that they were greyed and nobody could type.

   THE FIELD GATE AND THE SAVE GATE ASK DIFFERENT QUESTIONS, which is the whole
   lesson: `hasGameNode()` is about the flow DOCUMENT, `state.currentGameMeta`
   is about the game ROW, and every column on `public.games` belongs to the row.

   WHY A REAL BROWSER: the claim is about what leaves the page. The only honest
   test is to drive the controls a person drives and read the request. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };

/* THE FIXTURE IS THE SHAPE THAT BREAKS: a real row with an EMPTY node list. */
const mkGame = (nodes) => ({
  id: 'probe', name: 'Probe Game', city: 'New Orleans, Louisiana',
  archived: 'YES', status: 'building', tagline: 'A walk',
  anchor_event_id: null, target: null, rival: null,
  nodes: nodes, links: [], updated_at: '2026-01-01T00:00:00Z'
});

const EVENTS = [{
  id: 'NFL-2027-01-01-CHI-NO', kind: 'sports', title: null,
  start_date: '2027-01-01', venue_city: 'Chicago, Illinois',
  away_team_geo: 'Chicago', away_team_nickname: 'Bears',
  home_team_geo: 'New Orleans', home_team_nickname: 'Saints',
  league: 'NFL', away_team_name: 'Chicago Bears', home_team_name: 'New Orleans Saints'
}];
const AUDIENCES = [
  { id: 'nfl-chicago', family: 'nfl', name: 'Chicago', nickname: 'Bears',
    home_place_id: 'chicago-il', team_key: 'NFL:CHI',
    shell: '#0B162A', stripe: '#C83803', mask: '#FFFFFF' },
  { id: 'nfl-new-orleans', family: 'nfl', name: 'New Orleans', nickname: 'Saints',
    home_place_id: 'new-orleans-la', team_key: 'NFL:NO',
    shell: '#D3BC8D', stripe: '#101820', mask: '#FFFFFF' }
];
const PLACES = [{ id: 'chicago-il', city: 'Chicago', state: 'IL' },
                { id: 'new-orleans-la', city: 'New Orleans', state: 'LA' }];

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* ONE RUN AGAINST ONE SHAPE OF GAME, so the same assertions can be made about a
   game WITH a node and a game WITHOUT one -- the second is the bug, the first
   is the regression guard. */
async function run(browser, nodes, label) {
  const writes = [];
  const errs = [];
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
    if (req.method() !== 'GET') writes.push({ m: req.method(), u: u, b: req.postData() });
    let body = [];
    if (u.indexOf('/events') !== -1) body = EVENTS;
    else if (u.indexOf('/audiences') !== -1) body = AUDIENCES;
    else if (u.indexOf('/places') !== -1) body = PLACES;
    else if (u.indexOf('/games') !== -1) body = [mkGame(nodes)];
    req.respond({ status: 200, contentType: 'application/json',
      headers: Object.assign({ 'content-range': '0-0/1' }, cors),
      body: JSON.stringify(body) });
  });

  await p.goto('http://127.0.0.1:8848/mc/games/?id=probe', { waitUntil: 'networkidle2' });
  await p.evaluate(async () => {
    document.body.classList.add('mc-auth-authorized');
    if (window.__authed) await window.__authed();
  });
  await new Promise((r) => setTimeout(r, 1500));

  /* PICKING FROM A DATALIST SETS THE VALUE AND FIRES `change`. It is not a run
     of keystrokes -- and the labels carry a non-ASCII separator that
     keyboard.type does not reliably deliver, which cost a probe an hour. */
  const pick = (id, value) => p.evaluate((sel, v) => {
    const i = document.getElementById(sel);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  }, id, value);

  const evLabel = await p.evaluate(() => {
    const o = document.querySelector('#anchorEventList option');
    return o ? (o.value || o.textContent) : null;
  });
  await pick('anchorEventInput', evLabel);
  await new Promise((r) => setTimeout(r, 500));

  /* THE NAME IS THE FIELD SOMEBODY IS MOST LIKELY TO CHANGE, and it is the one
     that proves the whole row went rather than only the picker's own column. */
  await p.evaluate(() => {
    const n = document.getElementById('nodeTitleInput');
    n.value = 'Renamed By Hand';
    n.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));

  const armed = await p.evaluate(() => {
    const b = document.getElementById('gamePickerSaveBtn');
    return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  });

  writes.length = 0;
  await p.evaluate(() => { const b = document.getElementById('gamePickerSaveBtn'); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 1800));

  const upsert = writes.find((w) => w.u.indexOf('/games') !== -1);
  let row = null;
  if (upsert) { try { const j = JSON.parse(upsert.b); row = Array.isArray(j) ? j[0] : j; } catch (e) {} }

  await p.close();
  return { armed: armed, row: row, evLabel: evLabel, errs: errs, writes: writes.length };
}

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
  await new Promise((r) => server.listen(8848, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  try {
    const GAME_NODE = [{ id: 'n1', type: 'game', title: 'Probe Game',
                         tagline: 'A walk', city: 'New Orleans, Louisiana' }];

    /* ---- THE BUG: A GAME WITH NO GAME NODE ------------------------------ */
    console.log('a game whose flow document is empty');
    const none = await run(browser, [], 'nodeless');
    t('  the anchor picker offers the event', !!none.evLabel, none.evLabel);
    t('  the Save button is armed', none.armed);
    t('  and pressing it writes the row', !!none.row, none.writes);
    t('  carrying the anchor event that was chosen',
      none.row && none.row.anchor_event_id === 'NFL-2027-01-01-CHI-NO',
      none.row && JSON.stringify(none.row.anchor_event_id));
    /* NOT ONLY THE PICKER'S OWN COLUMN. If staging is skipped, EVERY field is
       written from the values the row was loaded with, so the name is what
       proves the whole row went. */
    t('  and the name that was typed, not the one it was loaded with',
      none.row && none.row.name === 'Renamed By Hand',
      none.row && JSON.stringify(none.row.name));
    /* THE EVENT NAMES BOTH CLUBS, so choosing it fills the legacy team fields. */
    /* THE CLUBS ARE NO LONGER COPIED (2026-09-02). All six club columns were
       dropped from public.games, so a game holds the event's ID and the clubs
       are read through it. The assertion inverts: the payload must carry the
       LINK and none of the columns that used to duplicate what it points at. */
    t('  and no club column rides along with it',
      !!none.row && !['away_team_mascot', 'home_team_mascot', 'away_team_city',
                      'home_team_city', 'away_team_key', 'home_team_key']
        .some((c) => Object.prototype.hasOwnProperty.call(none.row, c)),
      none.row && Object.keys(none.row).filter((k) => k.indexOf('team') !== -1).join(', ') || 'none');
    t('  with no console errors', none.errs.length === 0, none.errs.join(' | '));

    /* ---- AND THE ORDINARY GAME IS UNCHANGED ----------------------------- */
    console.log('');
    console.log('a game with a game node, which must not have changed');
    const with_ = await run(browser, GAME_NODE, 'with node');
    t('  the Save button is armed', with_.armed);
    t('  the anchor event still saves',
      with_.row && with_.row.anchor_event_id === 'NFL-2027-01-01-CHI-NO',
      with_.row && JSON.stringify(with_.row.anchor_event_id));
    t('  the typed name still saves',
      with_.row && with_.row.name === 'Renamed By Hand',
      with_.row && JSON.stringify(with_.row.name));
    t('  with no console errors', with_.errs.length === 0, with_.errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
