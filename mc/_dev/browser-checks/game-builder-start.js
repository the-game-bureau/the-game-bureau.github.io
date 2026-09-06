/* THE START BOX, THE CITY, AND THE DELETE (2026-09-05).
 *
 * AGAINST THE LIVE DATABASE with only the WRITE intercepted, because the claim
 * is about what leaves the page and what comes back: a stubbed fixture would be
 * testing my own guess at the row shape, which is how a check ends up agreeing
 * with itself. The reads go through; nothing is written.
 *
 * WHAT IT IS FOR. `start_time` and `timezone` are new columns and a column
 * reaches the database through TEN wiring points here -- the schema flag, two
 * select lists, the header select, `normalizeGameRow`, `normalizeSavedGame`,
 * `initGameMeta`, the snapshot, the slot map and `serializeGameRow`. Missing
 * one is silent in a different way each time: left out of the SELECT it saves
 * fine and never comes home; left out of the snapshot it leaves Save dead;
 * left out of `serializeGameRow` it never reaches the PATCH. So the round trip
 * is what is asserted, not the presence of a box. */
const http = require('http');
const fs = require('fs');
const pathmod = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + JSON.stringify(g) : '')));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon' };

const srv = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  let f = pathmod.join('C:/Code/the-game-bureau', decodeURIComponent(u.pathname));
  if (u.pathname.endsWith('/')) f = pathmod.join(f, 'index.html');
  fs.readFile(f, (e, b) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': TYPES[pathmod.extname(f)] || 'application/octet-stream' });
    r.end(b);
  });
});

(async () => {
  await new Promise((r) => srv.listen(8884, r));
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'] });
  const writes = [];
  const errs = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1200 });
    p.on('pageerror', (e) => errs.push(e.message));
    let lastDialog = '';
    p.on('dialog', async (d) => { lastDialog = d.message(); await d.dismiss(); });
    await p.evaluateOnNewDocument(() => {
      window.__authed = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__authed = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    /* EVERY WRITE IS CAUGHT AND ANSWERED, never sent. A probe that let one
       through cost a real game its clubs on 2026-09-01. */
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const m = req.method();
      if (req.url().indexOf('supabase.co') !== -1 && m !== 'GET' && m !== 'OPTIONS') {
        writes.push({ m, u: decodeURIComponent(req.url()), b: req.postData() || '' });
        /* THE ID IS ECHOED OUT OF THE URL FILTER, never invented. Answering
           every PATCH with `{id:'stub'}` made the page adopt `stub` as the
           open game and the DELETE after it was addressed to that -- a page
           fault that was the harness's own, for the eighth time this week. */
        const idm = /id=eq\.([^&]+)/.exec(decodeURIComponent(req.url()));
        /* AND A POST HAS NO FILTER TO ECHO, so the id comes off the BODY. The
           save is an upsert, so answering it with `stub` renamed the open game
           to `stub` and the DELETE after it went there. */
        let bodyId = null;
        try { const parsed = JSON.parse(req.postData() || 'null');
          const row = Array.isArray(parsed) ? parsed[0] : parsed;
          bodyId = row && row.id; } catch (e) {}
        req.respond({ status: 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify([{ id: (idm && idm[1]) || bodyId || 'stub' }]) });
        return;
      }
      req.continue();
    });

    await p.goto('http://127.0.0.1:8884/mc/games/index.html?id=oswald',
      { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed(); });
    await p.waitForFunction(
      () => document.querySelectorAll('#nodeTagPicker .tag-pill').length > 20,
      { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));

    /* ---- THE BOX IS THERE AND IT IS ITS OWN CONTAINER ------------------- */
    const box = await p.evaluate(() => {
      const bar = document.getElementById('startBar');
      if (!bar) return { there: false };
      const leg = bar.querySelector('legend');
      const name = document.getElementById('nodeTitleInput');
      const r = bar.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      const f = (id) => { const el = document.getElementById(id);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const field = el.closest('.gid-field');
        return { type: el.type, disabled: el.disabled, top: Math.round(b.top),
                 w: Math.round(b.width),
                 options: el.tagName === 'SELECT'
                   ? [...el.options].map((o) => o.value) : null,
                 label: field && (field.querySelector('.start-label') || {}).textContent };
      };
      return { there: true, legend: (leg.textContent || '').trim(),
               tag: bar.tagName,
               /* BESIDE THE NAME, NOT INSIDE IT (2026-09-05). It was a
                  fieldset within the name's own box for a day; a box drawn
                  inside another box reads as one question, and these are two.
                  Both halves are asserted: no nesting either way, and the two
                  really share a row -- either alone would pass on an
                  arrangement nobody asked for. */
               insideName: !!document.getElementById('gameNameBar').contains(bar),
               sameRowAsName: Math.abs(r.top - nr.top) < 60,
               fillsRow: (() => {
                 const pair = document.querySelector('.gid-pair');
                 if (!pair) return null;
                 /* THE NAME BAR, NEVER THE NAME INPUT. `nr` is the rect of
                    `nodeTitleInput`, which sits inside the bar's padding -- so
                    comparing its left edge with the row's answered false on a
                    page that lines up exactly. */
                 const pr = pair.getBoundingClientRect();
                 const br = document.getElementById('gameNameBar')
                   .getBoundingClientRect();
                 return Math.round(br.left) === Math.round(pr.left)
                   && Math.round(r.right) === Math.round(pr.right);
               })(),
               date: f('tgbDate'), time: f('startMinute'), hour: f('startHour'),
               zone: f('startZone'),
               zoneList: !!document.getElementById('startZoneList'),
               zones: [...document.querySelectorAll('#startZoneList option')].length };
    });
    t('START is its own box beside the name',
      box.there && box.tag === 'FIELDSET' && !box.insideName && box.sameRowAsName,
      { tag: box.tag, insideName: box.insideName, sameRow: box.sameRowAsName });
    /* AND THE TWO FILL THE ROW. The name starts where the row starts and START
       ends where it ends, so the pair lines up with every bar below it.
         NOT `the name is wider`, which was the first assertion here and was a
       guess about proportions rather than a measurement of the claim: START
       holds four controls and comes out 616px against the name's 552, and it
       being the wider of the two is what `takes its content` produces. What is
       actually claimed is that START takes its content and the name takes what
       is left -- measured across two viewports in game-builder-widths, which is
       the suite that changes the window. */
    t('and the two fill the row between them', box.fillsRow, box.fillsRow);
    t('and it is called Start', box.there && /^start$/i.test(box.legend), box.legend);
    t('and it holds a date, a time and a timezone',
      box.date && box.time && box.hour && box.zone && box.date.type === 'date',
      { date: box.date && box.date.type, hour: box.hour && box.hour.type,
        minute: box.time && box.time.type, zone: box.zone && box.zone.type });
    /* THE MINUTE IS A DROPDOWN OF THREE (2026-09-05). `step="900"` on a `time`
       input was the previous answer and it is not one: it makes an off-quarter
       minute fail validation, and the browser still draws its own control. The
       only way to SHOW exactly three minutes is to be the dropdown. */
    t('and the minute offers 00, 15 and 30 and nothing else',
      box.time && box.time.options
      && box.time.options.join(',') === ',00,15,30',
      box.time && box.time.options);
    /* THE HOURS ARE ALL 24, built rather than written out -- 24 hand-typed
       options is 24 chances to mistype one. */
    t('and the hour offers all 24',
      box.hour && box.hour.options && box.hour.options.length === 25,
      box.hour && box.hour.options && box.hour.options.length);
    /* THREE BOXES IN A ROW NEED THREE LABELS. Only the date and the time draw
       their own format; a zone box is indistinguishable from any other text
       field. */
    t('and each one is labelled',
      /date/i.test((box.date || {}).label || '') && /time/i.test((box.time || {}).label || '')
      && /zone/i.test((box.zone || {}).label || ''),
      { d: (box.date || {}).label, t: (box.time || {}).label, z: (box.zone || {}).label });
    /* THEY SHARE A LINE, which is the whole reason START is a box rather than
       three loose fields: a date, a time and a zone are one answer. */
    t('and the three share a line',
      Math.abs(box.date.top - box.time.top) < 4
      && Math.abs(box.date.top - box.zone.top) < 4,
      { d: box.date.top, t: box.time.top, z: box.zone.top });
    t('and the zone offers a list of real IANA names',
      box.zoneList && box.zones >= 10, box.zones);
    /* ENABLED ON AN OPEN GAME. `isGameNode` is false on every game in this
       room -- no canvas -- so a field gated on it is a field nobody can use. */
    t('and all of them are enabled on an open game',
      !box.date.disabled && !box.time.disabled && !box.hour.disabled
      && !box.zone.disabled,
      { d: box.date.disabled, h: box.hour.disabled, m: box.time.disabled,
        z: box.zone.disabled });

    /* ---- THE CITY IS ON, EMPTY-BOX, AND WRITES THE ROW ------------------ */
    const city = await p.evaluate(() => {
      const el = document.getElementById('nodeCityInput');
      return { there: !!el, disabled: el && el.disabled,
               list: el && el.getAttribute('list'),
               example: !!document.getElementById('cityExample'),
               value: el && el.value };
    });
    t('the city box is turned on', city.there && !city.disabled, city);
    /* PULLED FROM NOWHERE: no datalist, no catalogue, no + to add one. */
    t('and it is a plain text box with nothing behind it',
      city.there && !city.list, city.list);
    t('and the ex.: hint is gone', !city.example, city.example);

    /* ---- THE ROUND TRIP, which is the only thing that proves ten wiring
       points rather than one box ----------------------------------------- */
    const typed = { date: '2026-11-15', time: '13:30', zone: 'America/Chicago',
                    city: 'Green Bay, WI' };
    await p.evaluate((v) => {
      const set = (id, val) => { const el = document.getElementById(id);
        el.focus(); el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('tgbDate', v.date);
      set('startHour', v.time.slice(0, 2)); set('startMinute', v.time.slice(3));
      set('startZone', v.zone);
      set('nodeCityInput', v.city);
    }, typed);
    await new Promise((r) => setTimeout(r, 400));
    const meta = await p.evaluate(() => ({
      startDate: state.currentGameMeta.startDate,
      startTime: state.currentGameMeta.startTime,
      startZone: state.currentGameMeta.startZone,
      city: state.currentGameMeta.city }));
    t('typing reaches the row meta',
      meta.startDate === typed.date && meta.startTime === typed.time
      && meta.startZone === typed.zone, meta);
    /* THE CITY IS COMPOSED, NOT STORED AS TYPED. The box holds the whole place
       and `parseGeo` reads the state half back out of it, so `Green Bay, WI`
       is stored as the canonical string the rest of the catalogue spells. */
    t('and the city is composed into the canonical string',
      /^Green Bay, Wisconsin$/.test(String(meta.city || '')), meta.city);

    await p.evaluate(() => { document.getElementById('gamePickerSaveBtn').click(); });
    await new Promise((r) => setTimeout(r, 1400));
    const patch = writes.filter((w) => /\/games\b/.test(w.u))
      .map((w) => { try { return JSON.parse(w.b); } catch (e) { return null; } })
      .filter(Boolean).map((b) => Array.isArray(b) ? b[0] : b)
      .find((b) => b && Object.prototype.hasOwnProperty.call(b, 'start'));
    /* ONE COLUMN, THREE PARTS. `games.start` is a jsonb object, so the whole of
       START arrives as one value or not at all -- and the CHECK on the column
       refuses any key but these three. */
    t('and the save carries START as one object',
      !!patch && patch.start && patch.start.date === typed.date
      && patch.start.time === typed.time && patch.start.timezone === typed.zone,
      patch && patch.start);
    t('and the city with them',
      !!patch && patch.city === 'Green Bay, Wisconsin', patch && patch.city);
    /* A CLEARED BOX SENDS NULL, NEVER ''. A `time` column refuses an empty
       string outright, so a blank that went as '' would fail the whole save. */
    await p.evaluate(() => {
      ['startHour', 'startMinute', 'startZone'].forEach((id) => { const el = document.getElementById(id);
        el.focus(); el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true })); });
    });
    await new Promise((r) => setTimeout(r, 300));
    writes.length = 0;
    await p.evaluate(() => { document.getElementById('gamePickerSaveBtn').click(); });
    await new Promise((r) => setTimeout(r, 1400));
    const cleared = writes.filter((w) => /\/games\b/.test(w.u))
      .map((w) => { try { return JSON.parse(w.b); } catch (e) { return null; } })
      .filter(Boolean).map((b) => Array.isArray(b) ? b[0] : b)
      .find((b) => b && Object.prototype.hasOwnProperty.call(b, 'start'));
    /* AN EMPTY PART IS OMITTED, NOT STORED AS ''. A blank time and no time are
       the same fact and only one of them is a value -- and the column's CHECK
       would take '' happily, so nothing but the page stops it. */
    t('and clearing a START box drops that key rather than storing an empty one',
      !!cleared && cleared.start && cleared.start.date === typed.date
      && !('time' in cleared.start) && !('timezone' in cleared.start),
      cleared && cleared.start);

    /* ---- DELETE REALLY DELETES ------------------------------------------ */
    writes.length = 0;
    await p.evaluate(() => { document.getElementById('gameEraseBtn').click(); });
    await p.waitForFunction(
      () => /for good/i.test(document.getElementById('gameEraseMessage').textContent),
      { timeout: 20000 });
    const question = await p.evaluate(() =>
      document.getElementById('gameEraseMessage').textContent);
    /* THE CONFIRMATION SAYS WHAT IT CANNOT BE UNDONE FROM. It used to promise
       the row was kept, which was true of the flag and is a lie about a
       delete. */
    t('the delete question says it cannot be undone',
      /cannot be undone/i.test(question) && !/row is kept/i.test(question), question);
    /* AND IT OFFERS THE ALTERNATIVE. The cascade sentence was cut on
       2026-09-05 -- see CLAUDE.md for what the question no longer says -- so
       what is left to assert is that it names both the act and the way out.
       IT ALSO MUST NOT SAY `conversation flow` any more, which is the phrase
       that was reported: a delete really does take the flow, and the question
       naming one of the six things it takes and none of the other five was
       arbitrary rather than informative. */
    t('and offers Skip as the way to keep it',
      /skip instead/i.test(question) && !/conversation flow/i.test(question),
      question);
    /* THREE SENTENCES. A confirmation is read in the moment it is shown, and
       every clause past the third is one somebody scrolls rather than reads.
       SPLIT ON EVERY SENTENCE ENDER, NOT ON THE FULL STOP. The first sentence
       is a QUESTION and ends in a question mark, so counting periods answered
       two about a three-sentence line -- and it failed on a page that was
       exactly right. An assertion that counts the wrong character is a
       measurement of the wrong thing, not a finding. */
    t('and it is three sentences',
      question.split(/[.?!]/).filter((x) => x.trim()).length === 3, question);

    /* THE GAME'S NAME IS THE BOLD HALF. Measured rather than read off the
       rule: a `font-weight` that is present and beaten reads as correct in the
       file and wrong on screen. */
    const bold = await p.evaluate(() => {
      const msg = document.getElementById('gameEraseMessage');
      const el = msg.querySelector('.erase-note-name');
      if (!el) return { there: false, kids: msg.childNodes.length };
      const w = (x) => getComputedStyle(x).fontWeight;
      /* AND THE WEIGHT IS NOT INERT. The message is set in a handwriting
         face, so the same string is rendered twice in the same place -- once
         at 700 and once at the weight around it -- and the two have to differ.
           WIDER WAS THE FIRST ASSERTION AND IT FAILED ON A CORRECT PAGE:
         this family's bold face is NARROWER, 438 against 454, so `wider` was a
         guess about how a font behaves rather than a measurement. **What a
         headless width can honestly say is that the weight changes the
         drawing**; whether it LOOKS heavier is a screenshot's question. */
      const probe = el.cloneNode(true);
      probe.style.fontWeight = w(msg);
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      msg.appendChild(probe);
      const wide = el.getBoundingClientRect().width;
      const plain = probe.getBoundingClientRect().width;
      probe.remove();
      return {
        there: true, tag: el.tagName, name: w(el), around: w(msg),
        wide: Math.round(wide), plain: Math.round(plain),
        markup: el.querySelectorAll('*').length,
        whole: msg.textContent.indexOf(el.textContent) > 0,
      };
    });
    t('the game name is its own element in the question',
      bold.there && bold.tag === 'STRONG', bold);
    t('and it is bolder than the sentence around it',
      bold.name === '700' && bold.around !== '700',
      { name: bold.name, around: bold.around });
    t('and the weight is not inert',
      bold.wide !== bold.plain, { at700: bold.wide, around: bold.plain });
    /* AND THE SENTENCE STILL READS WHOLE from `textContent`, which is what
       every assertion above this one reads. */
    t('and the question still reads as one sentence',
      bold.whole && /^Delete .+ for good\?/.test(question), question.slice(0, 60));

    /* A NAME IS A ROW VALUE, SO IT MUST NEVER REACH THE DOM AS MARKUP. Driven
       rather than argued: the STORED name is given a tag and the real dialog is
       opened on it, so the question has to hold those characters literally. An
       innerHTML build fails this by rendering the tag.
         IT REACHES THE ROW, NOT THE NAME BOX, and the first cut of this probe
       got that wrong: typing into `nodeTitleInput` writes the META and arms
       Save, while the confirmation reads the STORE entry -- so the question
       went on naming the saved name and the probe reported a page fault that
       was its own.
         `getCurrentGameArchiveEntry` IS REACHABLE because it is a top-level
       FUNCTION DECLARATION, which does create a window property. `state` is a
       top-level `const` and does not, which is why nothing here reaches for
       it. */
    await p.evaluate(() => {
      document.getElementById('gameEraseCancelBtn').click();
      window.getCurrentGameArchiveEntry().name = 'Zed <b>bold</b> Game';
    });
    await p.evaluate(() => { document.getElementById('gameEraseBtn').click(); });
    await p.waitForFunction(
      () => /for good/i.test(document.getElementById('gameEraseMessage').textContent),
      { timeout: 20000 });
    const tagged = await p.evaluate(() => {
      const msg = document.getElementById('gameEraseMessage');
      const el = msg.querySelector('.erase-note-name');
      return {
        text: el ? el.textContent : '',
        inside: el ? el.querySelectorAll('*').length : -1,
        elements: msg.querySelectorAll('*').length,
      };
    });
    t('a name with a tag in it stays text',
      tagged.text === 'Zed <b>bold</b> Game' && tagged.inside === 0
        && tagged.elements === 1, tagged);
    await p.evaluate(() => { document.getElementById('gameEraseConfirmBtn').click(); });
    await new Promise((r) => setTimeout(r, 1200));
    const del = writes.find((w) => w.m === 'DELETE');
    t('and pressing Delete issues a real DELETE',
      !!del && /id=eq\.oswald/.test(del.u), del && del.u);
    /* NEVER A PATCH. It set `games.erased`, a column that was dropped -- so
       every press answered PGRST204 and nothing happened. */
    t('and never a PATCH of an erased flag',
      !writes.some((w) => w.m === 'PATCH' && /erased/.test(w.b || '')),
      writes.filter((w) => w.m === 'PATCH').map((w) => w.b.slice(0, 90)));

    t('no console errors', errs.length === 0, errs);
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
