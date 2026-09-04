/* THE GIFT SHOP'S READS (2026-09-03).

   Both gift shop pages were reading columns of `public.games` that no longer
   exist. **PostgREST 400s the WHOLE request on one unknown column**, so:

     ROOM   games?select=...,away_team_city,...  400  -> the room drew NOTHING
                                                        and spilled the raw
                                                        error into its own
                                                        error channel
     SHOP   games_with_teams                     404  -> caught, so silent
     NAV    games?select=city,archived,erased    400  -> the games badge read
                                                        an empty array on
                                                        EVERY public page

   None of it was about cities: `gift_shop_listings.city` is filled on all 969
   rows and both pages already read it.

   SO THE CLAIM IS THE ONE A SOURCE GREP CANNOT MAKE: every read these pages
   actually send comes back OK against the live database. A select naming a
   column that has been dropped is invisible until it is sent. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
            '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
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
  await new Promise((r) => srv.listen(9430, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    async function load(url, authed, read) {
      const p = await br.newPage();
      await p.setViewport({ width: 1500, height: 950 });
      const errs = [], failed = [], sent = [];
      p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
      p.on('request', (q) => {
        if (q.url().indexOf('supabase.co') !== -1) sent.push(decodeURIComponent(q.url()));
      });
      p.on('response', async (r) => {
        if (r.url().indexOf('supabase.co') === -1 || r.status() < 400) return;
        let body = '';
        try { body = (await r.text()).slice(0, 160); } catch (e) { body = '(unreadable)'; }
        failed.push(r.status() + ' ' + decodeURIComponent(r.url()).replace(/^.*rest\/v1\//, '') + ' ' + body);
      });
      if (authed) {
        await p.evaluateOnNewDocument((k) => {
          window.__a = null;
          /* THE STUB MUST EXPORT `authHeaders`. The real module does, and one
             without it makes the room report `adminAuth.authHeaders is not a
             function` -- which reads as a page fault and is the harness's. */
          window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
            return { getSession: () => null, init: () => {},
                     authHeaders: (x) => Object.assign(
                       { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
          window.TgbAdminSiteNav = { bindAuth: () => {} };
        }, KEY);
      }
      await p.goto(url, { waitUntil: 'domcontentloaded' });
      if (authed) {
        await p.evaluate(async () => {
          document.body.classList.add('mc-auth-authorized');
          if (window.__a) await window.__a();
        });
      }
      await new Promise((r) => setTimeout(r, 7000));
      const seen = await p.evaluate(read);
      await p.close();
      return { seen: seen, failed: failed, errs: errs, sent: sent };
    }

    /* ---- THE PUBLIC SHOP ------------------------------------------------ */
    const shop = await load('http://127.0.0.1:9430/gifts/', false, () => ({
      /* THE GRID'S OWN CHILDREN, found by reading the markup rather than
         guessing a class: the wrapper is `.gift-grid-wrap`. */
      cards: document.querySelectorAll('.gift-grid-wrap a, .gift-grid-wrap article, .gift-grid-wrap > * > *').length,
      body: document.body.innerText.replace(/\s+/g, ' '),
      /* THE BADGE IS `[data-tgb-nav-stat]`, which is what `setStat` writes. */
      gamesBadge: (document.querySelector('[data-tgb-nav-stat="games"]') || {}).textContent || ''
    }));
    t('the public shop sends no failing read', shop.failed.length === 0, shop.failed);
    t('and raises no page error', shop.errs.length === 0, shop.errs);
    t('and draws its gifts', /GIFT SHOP/.test(shop.seen.body) && shop.seen.cards > 100,
      { cards: shop.seen.cards });
    /* THE VIEW IS GONE. Asking for it again is a 404 on every visit. */
    t('and never asks for games_with_teams',
      shop.sent.every((u) => u.indexOf('games_with_teams') === -1),
      shop.sent.filter((u) => u.indexOf('games_with_teams') !== -1));

    /* ---- THE ROOM -------------------------------------------------------- */
    const room = await load('http://127.0.0.1:9430/mc/gifts/', true, () => ({
      rows: document.querySelectorAll('[class*="item"],[class*="row"],article').length,
      body: document.body.innerText.replace(/\s+/g, ' ')
    }));
    t('the room sends no failing read', room.failed.length === 0, room.failed);
    t('and raises no page error', room.errs.length === 0, room.errs);
    t('and draws its items', room.seen.rows > 100, room.seen.rows);
    /* THE ROOM'S OWN ERROR CHANNEL IS THE THING THAT WAS SHOUTING. */
    t('and its error channel is quiet',
      room.seen.body.indexOf('does not exist') === -1
      && room.seen.body.indexOf('is not a function') === -1,
      room.seen.body.slice(0, 160));

    /* ---- NO READ NAMES A COLUMN THAT IS GONE ---------------------------- */
    const DEAD = ['away_team_city', 'away_team_mascot', 'home_team_city',
                  'home_team_mascot', 'away_team_key', 'home_team_key',
                  'fandom_game', 'logo_url', 'primary_color', 'erased'];
    const all = shop.sent.concat(room.sent);
    const named = DEAD.filter((c) => all.some((u) => u.indexOf(c) !== -1));
    t('no read names a column dropped from public.games', named.length === 0, named);
    /* `archived` IS STILL A REAL COLUMN OF THE GIFT TABLES, so it may only be
       refused where the table is `games`. A blanket ban would be wrong. */
    const gamesArchived = all.filter((u) => /\/games\?/.test(u) && u.indexOf('archived') !== -1);
    t('and no games read asks for archived', gamesArchived.length === 0, gamesArchived);

    /* ---- THE BADGE AGREES WITH THE DATABASE ----------------------------- */
    const res = await fetch('https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/games?select=status',
      { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
    const rows = res.ok ? await res.json() : [];
    const live = rows.filter((g) => String(g.status || '').trim().toLowerCase() === 'live').length;
    /* THE BADGE IS WHAT A VISITOR CAN BUY, so it counts `live` and nothing
       else. Today that is 0 of 394, every game being archived -- which is an
       honest empty shop window rather than a broken badge. */
    t('the nav games badge is the live count', rows.length > 0
      && shop.seen.gamesBadge.trim() === String(live),
      { badge: shop.seen.gamesBadge.trim(), live: live, total: rows.length });

    /* ---- CITIES COME FROM THE GIFT SHOP'S OWN TABLE --------------------- */
    t('the shop reads its cities from gift_shop_listings',
      all.some((u) => /gift_shop_listings\?[^ ]*select=city/.test(u)), );
    /* AND NOT FROM THE CATALOGUE. `public.cities` is intact and the BOT still
       reads it, correctly -- but neither page does, and has not since
       2026-08-31. */
    t('and neither page reads public.cities',
      all.every((u) => !/\/cities\?/.test(u)),
      all.filter((u) => /\/cities\?/.test(u)));
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
