/* EVERY FIELD IN THE BARS REACHES public.games.
   ---------------------------------------------------------------------------
   ASKED FOR AS: pull guides from the guide table and save guide id to games,
   and all fields on the game builder save an id or a raw value to the table.

   IT IS DRIVEN AGAINST THE LIVE DATABASE with only the WRITES intercepted, so
   what is measured is what a save would carry today. **A source read cannot
   make this claim**: a value that reaches the box and not the payload looks
   identical in the file, which is exactly what six of these fields were doing.

   THE FAULT IT IS FOR, IN TWO HALVES. Six controls were gated on
   `isGameNode` -- the flow DOCUMENT, which this room never loads -- so they
   were disabled on all 393 games; and their handlers returned on the same test
   one layer down, so **enabling them alone would have produced a field that
   accepts typing and stores none of it, which is worse than a disabled one.**
   Both halves are asserted, because either alone passes on that arrangement.

   THE MAP IS THE THIRD SHAPE. Its box was live and its handler wrote
   `meta.mapId` -- and `public.games` had no `map_id` column, so the schema map
   had it switched off and the value went nowhere. 2026090503 renamed
   `games.map`, which was text, empty on all 393 rows and read by nothing.

   NEEDS A SERVER IT STARTS ITSELF. The admin gate is stubbed; nothing else is.
   ------------------------------------------------------------------------ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

/* WHAT EACH BOX WRITES. The column is the claim; the value is what to type.
   `pick` means a select or a datalist, where the probe takes an OFFERED option
   rather than inventing one -- an invented value is refused by the resolver,
   which would report a page fault that is the probe's own. */
const FIELDS = [
  { id: 'nodeTitleInput',        col: 'name',            v: 'Zed Probe Name' },
  { id: 'nodeTaglineInput',      col: 'tagline',         v: 'Zed tagline' },
  { id: 'nodeCityInput',         col: 'city',            v: 'Chicago, IL' },
  { id: 'nodeBodyInput',         col: 'body',            v: 'Zed intro' },
  { id: 'nodePriceInput',        col: 'price',           v: '44' },
  { id: 'nodeEngineInput',       col: 'engine',          pick: 'option' },
  { id: 'nodeDefaultEmojiInput', col: 'default_emoji',   v: 'ZZ' },
  { id: 'nodeCategoryIconInput', col: 'category_icon',   pick: 'option' },
  { id: 'nodeGuideSelect',       col: 'guide_id',        pick: 'option' },
  { id: 'nodeLogoSelect',        col: 'logo_id',         pick: 'option' },
  { id: 'gameMapInput',          col: 'map_id',          pick: '#gameMapList option' },
  { id: 'anchorEventInput',      col: 'anchor_event_id', pick: '#anchorEventList option' },
  { id: 'target',                col: 'target',          v: 'Zed target fans' },
  { id: 'rival',                 col: 'rival',           v: 'Zed rival fans' },
  { id: 'tgbDate',               col: 'start',           v: '2027-03-04' },
  { id: 'startHour',             col: 'start',           pick: 'option' },
  { id: 'startMinute',           col: 'start',           pick: 'option' },
  { id: 'startZone',             col: 'start',           v: 'America/Denver' }
];

/* THE SAME LIST `game-builder-columns.js` HOLDS, and it is here as well because
   that suite reads the SOURCE while this one reads what actually LEAVES the
   page -- a column absent from the map can still be sent by a hand-written
   PATCH, and two of the writes here are exactly that. */
const REAL = new Set(('accept_any,anchor_event_id,anytime,body,button_url,category_icon,'
  + 'checkout_url,city,created_at,currency,default_emoji,engine,featured,guide_id,'
  + 'home_team_tgbid,id,link_url,logo_id,map_id,name,price,price_cents,primary_tag,'
  + 'rival,start,state_name,status,tagline,tags,target,tgb_date,updated_at,var_name'
  ).split(','));

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(9336, r));
  const browser = await pup.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'],
    protocolTimeout: 240000
  });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1200 });
    const errs = [], writes = [], failed = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = {
        create: (o) => {
          window.__a = o.onAuthorized;
          return { getSession: () => null, init: () => {} };
        }
      };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      if (u.indexOf('supabase.co') === -1 || m === 'GET' || m === 'OPTIONS') {
        q.continue();
        return;
      }
      writes.push({ m, u: u.slice(u.indexOf('/rest/')), b: q.postData() || '' });
      /* THE REPLY ECHOES WHAT WAS SENT, so the page adopts the row it just
         wrote rather than a stub id -- a reply inventing one made the page
         address the wrong row for everything after it. */
      let body = '[]';
      try { body = JSON.stringify([JSON.parse(q.postData() || '{}')].flat()); } catch (e) {}
      q.respond({
        status: 200, contentType: 'application/json', body,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'access-control-expose-headers': 'content-range'
        }
      });
    });
    p.on('response', async (r) => {
      const u = r.url();
      if (u.indexOf('supabase.co') === -1 || r.status() < 400) return;
      let body = '';
      try { body = (await r.text()).slice(0, 160); } catch (e) {}
      failed.push(r.status() + ' '
        + u.slice(u.indexOf('/rest/'), u.indexOf('/rest/') + 90) + ' ' + body);
    });

    await p.goto('http://127.0.0.1:9336/mc/games/index.html', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(
      () => document.querySelectorAll('#gamePickerList option').length > 5, { timeout: 60000 });
    await p.waitForFunction(
      () => !document.getElementById('gameNameBar').hidden, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));

    /* ---- 1. NOTHING VISIBLE IS DEAD ------------------------------------ */
    const dead = await p.evaluate(() => {
      const out = [];
      document.querySelectorAll('.game-id-bar').forEach((bar) => {
        bar.querySelectorAll('input,select,textarea').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0)) return;
          if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') return;
          if (el.disabled) out.push(bar.id + '/' + el.id);
        });
      });
      return out;
    });
    /* THE ID BOX LOOKS LIKE AN EXCEPTION AND IS NOT ONE HERE: it is disabled
       only while there is no SAVED id to rename, and a game is open. */
    t('no visible field in the bars is dead with a game open', dead.length === 0, dead);

    /* ---- 2. THE GUIDE PICKER IS FILLED FROM public.guides -------------- */
    const guide = await p.evaluate(() => {
      const sel = document.getElementById('nodeGuideSelect');
      if (!sel) return { there: false };
      const opts = [...sel.options];
      return {
        there: true, count: opts.length, disabled: sel.disabled,
        numeric: opts.filter((o) => o.value && /^[0-9]+$/.test(o.value)).length,
        first: opts.slice(0, 3).map((o) => o.value + '=' + o.textContent.trim())
      };
    });
    t('the guide picker is filled from public.guides',
      guide.there && guide.count > 5 && !guide.disabled, guide);
    /* THE VALUE IS THE ROW'S OWN ID, never its name -- which is what makes
       `guide_id` a link rather than a copy of the character. One option carries
       no value: the empty one that means no guide. */
    t('and every guide it offers is an id', guide.numeric === guide.count - 1, guide.first);

    /* ---- 2b. AND A STORED GUIDE COMES HOME WITH THE ROW ---------------
       THE OTHER HALF OF `pull guides from the guide table and save guide id`.
       Saving is worth nothing if the value does not come back, and it used to
       arrive by a route of its own: `ensureCurrentGameGuideId` fetched it one
       row and one column at a time, because the room read a view built on
       `select game.*` and FROZEN before `guide_id` existed. The views are gone,
       the read is against `public.games`, and the column is in the select -- so
       that function was deleted on 2026-09-05.
         IT HAD NEVER RUN IN THIS ROOM ANYWAY: its one caller was gated on
       `isGameNode`, which is false on every game here. Which is the reason
       removing it was safe, and the reason this assertion matters -- it is the
       only thing now saying the guide arrives at all.
         `alno` CARRIES GUIDE 12 IN THE LIVE TABLE. A game is named rather than
       hunted for because the room opens one of its own on load, and 378 of the
       393 carry no guide. */
    const opened = await p.evaluate(async () => {
      if (!window.openSavedGameById) return { err: 'no opener' };
      await window.openSavedGameById('alno');
      await new Promise((r) => setTimeout(r, 1500));
      const sel = document.getElementById('nodeGuideSelect');
      const opt = sel && sel.options[sel.selectedIndex];
      return { value: sel && sel.value, label: opt && opt.textContent.trim(),
               shot: !!document.querySelector('.guide-pick-shot img') };
    });
    t('a game that carries a guide opens showing it',
      opened.value === '12' && /Hank Houndstooth/.test(opened.label || ''), opened);

    /* ---- 3. TYPE INTO EVERY ONE OF THEM ------------------------------- */
    writes.length = 0;
    const typed = await p.evaluate((fields) => fields.map((f) => {
      const el = document.getElementById(f.id);
      if (!el) return { id: f.id, err: 'no such control' };
      if (el.disabled) return { id: f.id, err: 'disabled' };
      el.focus();
      if (f.pick) {
        const sel = f.pick === 'option'
          ? [...el.options].find((o) => o.value && o.value !== el.value)
          : document.querySelector(f.pick);
        if (!sel) return { id: f.id, err: 'nothing offered' };
        el.value = sel.value;
      } else {
        el.value = f.v;
      }
      /* WHAT WAS CHOSEN, READ BEFORE THE EVENTS. A change repaints the bar it
         is in, and a repaint rewrites the control from the meta -- so reading
         `el.value` afterwards answered `""` for the engine and the logo while
         the payload carried both. **That is a measurement of the wrong moment,
         not a page fault**, and it is the third one in two days. */
      const chosen = String(el.value).slice(0, 60);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return { id: f.id, v: chosen };
    }), FIELDS);
    const noValue = typed.filter((x) => x.err);
    t('every field takes a value', noValue.length === 0, noValue);

    await new Promise((r) => setTimeout(r, 700));
    await p.evaluate(() => {
      const b = document.getElementById('gamePickerSaveBtn');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 2500));

    /* ---- 4. AND EVERY ONE OF THEM IS IN A WRITE ----------------------- */
    const sent = {};
    writes.forEach((w) => {
      if (w.m !== 'POST' && w.m !== 'PATCH') return;
      if (w.u.indexOf('/rpc/') !== -1) return;
      let row = null;
      try { row = [JSON.parse(w.b)].flat()[0]; } catch (e) { return; }
      Object.keys(row || {}).forEach((k) => { sent[k] = row[k]; });
    });
    const wanted = [...new Set(FIELDS.map((f) => f.col))];
    const missing = wanted.filter((c) => !(c in sent));
    t('and every field reaches public.games', missing.length === 0,
      { missing, sent: Object.keys(sent).sort() });

    /* NOT MERELY PRESENT: the value has to be the one that was typed. A
       `category_icon: null` beside `football` in the picker is the shape this
       is really for -- it did not fail to save, it wrote the ABSENCE over
       whatever the row held. */
    const byId = Object.fromEntries(typed.map((x) => [x.id, x.v]));
    const carried = (id, col, read) => {
      const want = byId[id];
      const got = read ? read(sent[col]) : sent[col];
      t('  ' + col + ' carries what was typed',
        want !== undefined && String(got) === String(want), { want, got });
    };
    carried('nodeTitleInput', 'name');
    carried('nodeTaglineInput', 'tagline');
    carried('nodeBodyInput', 'body');
    carried('nodePriceInput', 'price');
    carried('nodeEngineInput', 'engine');
    carried('nodeDefaultEmojiInput', 'default_emoji');
    carried('nodeCategoryIconInput', 'category_icon');
    carried('nodeGuideSelect', 'guide_id');
    carried('nodeLogoSelect', 'logo_id');
    carried('target', 'target');
    carried('rival', 'rival');
    carried('startZone', 'start', (v) => v && v.timezone);
    carried('tgbDate', 'start', (v) => v && v.date);
    /* THE CITY IS COMPOSED ON THE WAY OUT -- `Chicago, IL` is stored as the
       canonical `Chicago, Illinois` -- so it is asserted as a composition
       rather than as the string that was typed. */
    t('  city is stored canonically', String(sent.city) === 'Chicago, Illinois', sent.city);
    /* THE MAP IS AN ID, NOT THE LABEL. The box shows the atlas's name, its key
       and its stop count; the column takes the key. */
    t('  map_id is the atlas key rather than the label',
      typeof sent.map_id === 'string' && sent.map_id.length > 0
      && String(byId.gameMapInput).indexOf(sent.map_id) !== -1,
      { sent: sent.map_id, shown: byId.gameMapInput });
    /* AND THE ANCHOR IS THE EVENT'S OWN ID rather than the sentence the box
       shows, which is a date, a kind and two clubs. */
    t('  anchor_event_id is an event id',
      typeof sent.anchor_event_id === 'string' && sent.anchor_event_id.length > 2
      && sent.anchor_event_id.indexOf(' ') === -1, sent.anchor_event_id);

    /* ---- 5. AND NOTHING IS WRITTEN THAT THE TABLE LACKS --------------- */
    const unknown = Object.keys(sent).filter((k) => !REAL.has(k));
    t('and no write names a column public.games lacks', unknown.length === 0, unknown);

    t('no failed request', failed.length === 0, failed);
    /* A THROW ONE LINE PAST A WRITE IS THE QUIETEST WAY TO HALF-APPLY A
       CHANGE: `commitMapField` called a `markDirty` that does not exist, so the
       map saved and the repaint after it never ran -- the note and the field
       went on describing the map you had just moved away from. */
    t('no page errors', errs.length === 0, errs);
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
