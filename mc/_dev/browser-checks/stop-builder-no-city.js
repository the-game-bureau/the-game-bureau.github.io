/* A STOP IS A WAYPOINT AND A CHALLENGE. THE CITY IS THE WAYPOINT'S.
   2026090302 dropped `stops.city`, so this asserts BOTH halves: the room no
   longer asks for a town or sends one, and the town it draws comes off the
   waypoint. Either alone would pass on a page that had traded one for the
   other -- a room that stopped sending a city and stopped showing one is not
   the change that was asked for.

   Reads go to the LIVE database; the write is intercepted and answered with a
   plausible row, because a check has no business adding a stop to the
   catalogue it is reading. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => srv.listen(9263, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    const errs = [], writes = [], reads = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      if (/google\.com\/maps/.test(u)) { q.respond({ status: 200, contentType: 'text/html', body: '' }); return; }
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET') { reads.push(u); q.continue(); return; }
      let body = null;
      try { body = JSON.parse(q.postData() || 'null'); } catch (e) { body = q.postData(); }
      writes.push({ m: m, u: u, body: body });
      /* ANSWERED WITH THE ROW THE DATABASE WOULD HAVE RETURNED, so the success
         path runs. An empty array is what a REFUSED write looks like, and the
         room correctly reports that as a refusal -- which would test the
         refusal branch rather than the insert. */
      const made = body && !Array.isArray(body)
        ? Object.assign({ stop_id: 99999 }, body) : { stop_id: 99999 };
      q.respond({ status: 200, contentType: 'application/json', headers: H,
                  body: JSON.stringify([made]) });
    });

    await p.goto('http://127.0.0.1:9263/mc/stop-builder/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    let loaded = true;
    try {
      await p.waitForFunction(
        () => typeof state !== 'undefined' && state.loaded && state.rows.length > 0,
        { timeout: 40000 });
    } catch (e) { loaded = false; }
    if (!loaded) {
      const why = await p.evaluate(() => ({
        scribble: (document.getElementById('pageStatus') || {}).textContent || '',
        rows: typeof state !== 'undefined' ? state.rows.length : -1
      }));
      t('the room loads its stops', false, why);
      /* A 400 ON THE ORDER IS THE LIKELY CAUSE and is worth naming here rather
         than leaving to be worked out: an order clause naming a column that is
         gone takes the WHOLE read with it. */
      const four = reads.filter((u) => /stops\?/.test(u));
      console.log('   stops reads: ' + (four[0] || '(none)'));
      console.log('');
      console.log(ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close();
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 300));

    /* ---- THE TABLE ITSELF -------------------------------------------- */
    const cols = await p.evaluate(() => Object.keys(state.rows[0]).sort());
    /* THE THREE IDS, PLUS THE FILTER THAT STANDS IN FOR ONE OF THEM. `id`
       became `stop_id` on 2026090303; `challenge_tags` and its match mode
       arrived on 2026090309 and 2026090310, and they are what a stop carries
       INSTEAD of a challenge_id rather than as well -- `stops_fixed_or_filtered`
       refuses both at once. */
    t('a stop row is the three ids and the tag filter',
      cols.join(',') === 'challenge_id,challenge_tags,challenge_tags_match,stop_id,waypoint_id', cols);
    t('and the read does not order by a column that is gone',
      !reads.some((u) => /stops\?[^#]*city/.test(u)), reads.filter((u) => /stops\?/.test(u)));

    /* ---- THE ADD BAR ASKS FOR TWO THINGS ------------------------------ */
    const bar = await p.evaluate(() => ({
      fields: [...document.querySelectorAll('.stop-form .stop-field')]
        .map((f) => (f.querySelector('span') || {}).textContent.trim().split(String.fromCharCode(10))[0].trim()),
      cityInput: !!document.getElementById('cityInput'),
      cityList: !!document.getElementById('cityList'),
      wpTitle: (document.getElementById('wpInput') || {}).title || '',
      wpPlaceholder: (document.getElementById('wpInput') || {}).placeholder || '',
      chPlaceholder: (document.getElementById('chalInput') || {}).placeholder || '',
      chTitle: (document.getElementById('chalInput') || {}).title || '',
      tagsInBar: !!document.querySelector('.stop-form #tagsInput'),
      dialogShut: (document.getElementById('tagBackdrop') || {}).hidden
    }));
    /* TWO FIELDS AGAIN. The tag filter was a third one permanently beside
       them, which made a stop read as three decisions when it is two; it is
       asked in a dialog at the moment a RANDOM challenge is chosen. */
    t('the add bar asks for a waypoint and a challenge, and no city',
      bar.fields.length === 2 && bar.fields[0] === 'Waypoint'
      && bar.fields[1] === 'Challenge' && !bar.cityInput, bar.fields);
    /* BOTH BOXES SAY WHAT TO DO, in the same words. The challenge one read
       `RANDOM`, which is a REAL ACCEPTED VALUE and the first option in its own
       datalist -- so an empty box looked like a filled one. Same fault the
       waypoint field had when its placeholder was a real row's address. */
    t('and the waypoint box says what to do',
      bar.wpPlaceholder === 'Choose a Waypoint', bar.wpPlaceholder);
    t('and the challenge box says what to do',
      bar.chPlaceholder === 'Choose a Challenge', bar.chPlaceholder);
    /* THE PLACEHOLDER WAS ALSO NAMING THE DEFAULT, and an empty box really is
       RANDOM -- `chalFromLabel('')` returns it. Moving the placeholder without
       moving that fact would make a live rule invisible. */
    t('and the tooltip still says an empty box is RANDOM',
      /empty is RANDOM/i.test(bar.chTitle), bar.chTitle);
    /* THE DATALIST GOES WITH THE FIELD. A list nothing fills is what somebody
       re-points at the wrong thing. */
    t('and the city datalist went with the field', !bar.cityList);
    t('and the waypoint box no longer promises to narrow by city',
      !/narrow/i.test(bar.wpTitle), bar.wpTitle);

    t('the tag filter is not a field in the bar', !bar.tagsInBar);
    t('and its dialog is shut at rest', bar.dialogShut === true, bar.dialogShut);

    /* ---- CHOOSING RANDOM ASKS WHICH CHALLENGES ------------------------- */
    const dlg = await p.evaluate(async () => {
      const box = document.getElementById('chalInput');
      box.value = 'RANDOM';
      box.dispatchEvent(new Event('change', { bubbles: true }));
      const open1 = !document.getElementById('tagBackdrop').hidden;
      /* CHOOSING IS THE GESTURE, so the check chooses. It drove a text box and
         a datalist before, which could never have caught the fault: a datalist
         pick REPLACES the whole value, so choosing a second tag wiped the
         first and only a typed comma gave two. */
      const chips = [].slice.call(document.querySelectorAll('.tag-pick'));
      const chipCount = chips.length;
      /* THE CHIPS SURVIVE A PRESS. Rebuilding the list on every toggle destroys
         the button that was just pressed, so focus goes to the body and a
         keyboard user cannot choose a second -- and this very array would be
         left holding detached nodes, which is how the first cut of this check
         reported `chicago` as unfindable on a page that offered it. */
      const firstChip = chips[0];
      const pick = (name) => {
        const b = chips.filter((x) => x.dataset.tag.toLowerCase() === name)[0];
        if (b) b.click();
        return !!b;
      };
      const gotSports = pick('sports');
      const afterOne = state.tagDraft.tags.slice();
      const gotChicago = pick('chicago');
      const afterTwo = state.tagDraft.tags.slice();
      /* AND OFF AGAIN, because a toggle that only adds is a control you cannot
         correct. */
      pick('sports');
      const afterOff = state.tagDraft.tags.slice();
      pick('sports');
      const stillThere = document.body.contains(firstChip)
        && document.querySelectorAll('.tag-pick').length === chipCount;
      /* AND FOCUS STAYS ON THE CHIP YOU PRESSED, which is the half a DOM check
         alone would miss. */
      chips.filter((x) => x.dataset.tag.toLowerCase() === 'quiz')[0].focus();
      chips.filter((x) => x.dataset.tag.toLowerCase() === 'quiz')[0].click();
      const keptFocus = document.activeElement
        && document.activeElement.dataset
        && document.activeElement.dataset.tag
        && document.activeElement.dataset.tag.toLowerCase() === 'quiz';
      chips.filter((x) => x.dataset.tag.toLowerCase() === 'quiz')[0].click();
      const pressed = [].slice.call(document.querySelectorAll('.tag-pick[aria-pressed="true"]'))
        .map((b) => b.dataset.tag.toLowerCase()).sort();
      const modeShown = !document.getElementById('tagMode').hidden;
      const countAll = (document.getElementById('tagCount') || {}).textContent || '';
      /* OR IS WIDER THAN AND, and the dialog says so before anything is filed. */
      const or = document.querySelector('input[name="tagsMatch"][value="any"]');
      or.checked = true;
      or.dispatchEvent(new Event('change', { bubbles: true }));
      const countAny = (document.getElementById('tagCount') || {}).textContent || '';
      /* MEASURED WHILE IT IS OPEN, because both of these are LAYOUT and every
         assertion above would pass on a panel with a 200px hole in it. */
      const h = (sel) => {
        const e = document.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().height) : -1;
      };
      const bg = (sel) => {
        const e = document.querySelector(sel);
        return e ? getComputedStyle(e).backgroundColor : '';
      };
      const geom = {
        panel: h('.sv-panel--tags'),
        picks: h('#tagPicks'),
        onBg: bg('input[name="tagsMatch"]:checked + span'),
        offBg: bg('input[name="tagsMatch"]:not(:checked) + span')
      };
      document.getElementById('tagUse').click();
      return {
        open1: open1, modeShown: modeShown,
        countAll: countAll, countAny: countAny,
        chipCount: chipCount, tagsInUse: tagsInUse().length,
        chipsCarryCounts: chips.length > 0 && chips.every((b) => /[0-9]/.test(b.textContent)),
        gotSports: gotSports, gotChicago: gotChicago,
        stillThere: stillThere, keptFocus: keptFocus,
        oneChipPerFoldedTag: (function () {
          const seen = {};
          return chips.every((b) => {
            const k = b.dataset.tag.toLowerCase();
            if (seen[k]) return false;
            seen[k] = true; return true;
          });
        })(),
        afterOne: afterOne, afterTwo: afterTwo, afterOff: afterOff, pressed: pressed,
        shutAfter: document.getElementById('tagBackdrop').hidden,
        boxSays: box.value, geom: geom
      };
    });
    t('choosing RANDOM opens the tag dialog', dlg.open1);
    /* EVERY TAG IN USE IS OFFERED, built from the rows -- so the control cannot
       name a tag no challenge carries. */
    t('every tag in use is offered as a chip',
      dlg.chipCount === dlg.tagsInUse && dlg.chipCount > 1,
      { chips: dlg.chipCount, inUse: dlg.tagsInUse });
    t('and each says how many are behind it', dlg.chipsCarryCounts);
    /* THE WHOLE POINT: MORE THAN ONE. */
    t('choosing one tag takes it', dlg.gotSports && dlg.afterOne.length === 1, dlg.afterOne);
    t('and choosing a second KEEPS the first',
      dlg.gotChicago && dlg.afterTwo.length === 2, dlg.afterTwo);
    t('choosing a chosen one takes it off',
      dlg.afterOff.length === 1 && dlg.afterOff[0].toLowerCase() === 'chicago', dlg.afterOff);
    t('and the chosen chips say so',
      dlg.pressed.join(',') === 'chicago,sports', dlg.pressed);
    t('a press does not rebuild the chips out from under you', dlg.stillThere);
    t('so focus stays on the one you pressed', dlg.keptFocus);
    /* TWO SPELLINGS OF ONE TAG ARE ONE CHIP, because the resolver folds case:
       `history` and `History` must not be separately addable. */
    t('two spellings of one tag are one chip', dlg.oneChipPerFoldedTag);
    t('two tags reveal the AND / OR choice', dlg.modeShown);
    /* THE COUNT IS THE WHOLE REASON THE DIALOG SAYS ANYTHING. A filter reaching
       nothing is a team standing in the street with no challenge. */
    t('and OR reaches more than AND',
      parseInt(dlg.countAny, 10) > parseInt(dlg.countAll, 10),
      { and: dlg.countAll, or: dlg.countAny });
    /* THE FIELD MAY NOT KEEP THE ADD BAR'S FLEX BASIS. `.stop-field` is
       `flex: 1 1 240px`, a WIDTH floor in that row; this body is a COLUMN, so
       it became a HEIGHT and a 34px input opened a 240px box -- 410px of panel
       for three controls, most of it a hole. Only a computed read can see it. */
    /* THE CHIPS SCROLL RATHER THAN GROWING THE PANEL. 25 tags today and the
       bank grows; a dialog that gets taller with the catalogue is one that
       eventually will not fit. The old text field carried the Add bar's
       `flex: 1 1 240px` -- a WIDTH floor in that row, a HEIGHT here -- and
       opened a 411px panel for three controls, most of it a hole. */
    t('the chips are capped and scroll',
      dlg.geom.picks > 0 && dlg.geom.picks <= 222, dlg.geom.picks);
    t('so the panel is no taller than a screen',
      dlg.geom.panel > 0 && dlg.geom.panel < 420, dlg.geom.panel);
    /* AND / OR IS THE ONLY CHOICE ON THE DIALOG BESIDES THE TAGS, so the chosen
       one is FILLED. Outlined in the label's own type it read as two words. */
    t('and the chosen match mode is filled, not merely outlined',
      dlg.geom.onBg !== dlg.geom.offBg
      && !/rgba\(0, 0, 0, 0\)|transparent/.test(dlg.geom.onBg),
      { on: dlg.geom.onBg, off: dlg.geom.offBg });
    t('using it closes the dialog', dlg.shutAfter === true);
    /* THE ANSWER GOES BACK INTO THE CHALLENGE BOX, which is what keeps the bar
       two fields and makes the choice visible with no second control. */
    /* SORTED, NOT IN PICK ORDER: the resolver is order-independent, so one
       filter chosen two ways must read one way. The probe presses sports,
       chicago, sports off, sports on -- and still gets them alphabetically. */
    t('and the challenge box says what was chosen, in a stable order',
      dlg.boxSays === 'RANDOM tagged chicago or sports', dlg.boxSays);

    /* NAMING A CHALLENGE DROPS THE FILTER, or a stop would carry both and
       `stops_fixed_or_filtered` would refuse it. */
    const dropped = await p.evaluate(() => {
      const box = document.getElementById('chalInput');
      const named = state.challenges[0];
      box.value = chalLabel(named);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return state.pendingTags.tags.length;
    });
    t('naming a challenge drops the filter', dropped === 0, dropped);

    /* ---- THE LABEL IS THE DOOR ------------------------------------------
       The word itself opens the room the field is filled from, and the small
       `new` beside it is gone. */
    const doors = await p.evaluate(() => {
      const out = [];
      /* ONLY THE FIELDS THAT HAVE A DOOR. The Tags field has an ordinary
         `<label for>` and should -- it leads nowhere, and a label is the right
         mechanism where there is no room to open. */
      document.querySelectorAll('.stop-form .stop-field').forEach((f) => {
        const a = f.querySelector('span a');
        if (!a) return;
        const box = f.querySelector('input');
        const span = f.querySelector('span');
        const cs = a ? getComputedStyle(a) : null;
        const ps = span ? getComputedStyle(span) : null;
        out.push({
          word: a ? a.textContent.trim() : '',
          href: a ? new URL(a.getAttribute('href'), location.origin).pathname : '',
          target: a ? a.getAttribute('target') : '',
          rel: a ? (a.getAttribute('rel') || '') : '',
          /* AN ANCHOR CANNOT ALSO BE A `<label for>` -- a label focuses its
             input and a link navigates -- so the input needs its own
             accessible name or it has none at all. */
          inLabel: a ? !!a.closest('label') : false,
          labelFor: !!f.querySelector('label'),
          aria: box ? (box.getAttribute('aria-label') || '') : '',
          /* IT READS AS A LABEL FIRST: everything about its type is the span's
             own, so at rest it looks exactly like the label it replaced. */
          sameType: !!(cs && ps && cs.fontSize === ps.fontSize
            && cs.fontWeight === ps.fontWeight
            && cs.letterSpacing === ps.letterSpacing
            && cs.textTransform === ps.textTransform),
          sameColour: !!(cs && ps && cs.color === ps.color),
          underlined: cs ? cs.textDecorationLine : ''
        });
      });
      return { fields: out, newLinks: document.querySelectorAll('.stop-form .stop-new').length };
    });
    /* THE LABEL WORD ITSELF IS THE LINK, which is the ask. Testing only that
       an anchor sits in the span passes on the arrangement this replaced --
       there the anchor was the little `new` beside the label, pointing at the
       same room. The assertion has to name the word. */
    t('the label word itself is the link', doors.fields.length === 2
      && (doors.fields[0] || {}).word === 'Waypoint'
      && (doors.fields[1] || {}).word === 'Challenge',
      doors.fields.map((f) => f.word + ' -> ' + f.href));
    t('the waypoint one opens the Waypoint Library',
      (doors.fields[0] || {}).href === '/mc/waypoints/', (doors.fields[0] || {}).href);
    t('the challenge one opens the Challenge Bank',
      (doors.fields[1] || {}).href === '/mc/challenges/', (doors.fields[1] || {}).href);
    /* A NEW TAB, because the room is a glance and a half-filled form must not
       be lost to one. */
    t('both open a new tab, with noopener',
      doors.fields.every((f) => f.target === '_blank' && /noopener/.test(f.rel)),
      doors.fields.map((f) => f.target + ' ' + f.rel));
    /* THE SEPARATE `new` LINK IS GONE, and so is the class -- a control and its
       stylesheet go in one pass. */
    t('and the separate new link is gone', doors.newLinks === 0, doors.newLinks);
    t('no <label> is left to fight the link',
      doors.fields.every((f) => !f.labelFor), doors.fields.map((f) => f.labelFor));
    t('the link is not nested in a label', doors.fields.every((f) => !f.inLabel));
    t('so each input carries its own accessible name',
      doors.fields.every((f) => f.aria.length > 0), doors.fields.map((f) => f.aria));
    t('the door reads as a label at rest',
      doors.fields.every((f) => f.sameType && f.sameColour),
      doors.fields.map((f) => ({ type: f.sameType, colour: f.sameColour })));
    t('and is not browser-underlined',
      doors.fields.every((f) => f.underlined === 'none'), doors.fields.map((f) => f.underlined));

    /* ---- THE FOURTH LINE ---------------------------------------------- */
    const row = await p.evaluate(() => {
      const line = document.querySelector('#list .stop');
      const wpHalf = line.querySelector('.stop-half--wp');
      const chHalf = line.querySelector('.stop-half--ch');
      const key = line.dataset.key;
      const r = state.rows.filter((x) => String(x.stop_id) === key)[0];
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      return {
        cols: getComputedStyle(line).gridTemplateColumns.split(' ').length,
        cityCell: !!line.querySelector('.stop-city'),
        wpLines: [...wpHalf.children].map((n) => n.className),
        wpWhere: (wpHalf.querySelector('.stop-where') || {}).textContent || '',
        chWhere: !!chHalf.querySelector('.stop-where'),
        want: w ? [w.city, w.state].filter(Boolean).join(', ') : '',
        address: w ? String(w.address || '') : ''
      };
    });
    t('the row has no city column of its own', !row.cityCell && row.cols === 3, row.cols);
    /* KICKER, NAME, ADDRESS, CITY -- the city is the FOURTH line, which is the
       ask stated as a position rather than as a presence. */
    t('the waypoint badge is four lines',
      row.wpLines.join(',') === 'stop-kicker,stop-name,stop-sub,stop-where', row.wpLines);
    t("and the fourth is the WAYPOINT's own city",
      row.wpWhere === row.want && row.want.length > 0, row);
    /* A CHALLENGE IS NOT ANYWHERE. */
    t('the challenge badge has no such line', !row.chWhere);

    /* A WAYPOINT WITH NO ADDRESS MUST NOT PRINT ITS TOWN TWICE, which the old
       `w.address || wpWhere(w)` fallback would do now the city is always
       drawn. */
    const twice = await p.evaluate(() => {
      const w = state.waypoints.filter((x) => !String(x.address || '').trim())[0];
      if (!w) return { skipped: true };
      const r = { stop_id: -7, waypoint_id: w.wpid, challenge_id: null };
      state.rows.push(r); render();
      const line = [...document.querySelectorAll('#list .stop')]
        .filter((n) => n.dataset.key === '-7')[0];
      const half = line.querySelector('.stop-half--wp');
      const out = { sub: (half.querySelector('.stop-sub') || {}).textContent || '',
                    where: (half.querySelector('.stop-where') || {}).textContent || '' };
      state.rows = state.rows.filter((x) => x.stop_id !== -7); render();
      return out;
    });
    t('a waypoint with no address does not print its town twice',
      twice.skipped || (twice.sub === '' && twice.where.length > 0), twice);

    /* ---- THE POPUP ----------------------------------------------------- */
    const pop = await p.evaluate(() => {
      const r = state.rows.filter((x) => x.waypoint_id != null)[0];
      openStop(r);
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      const out = { head: document.getElementById('svCity').textContent,
                    want: w ? [w.city, w.state].filter(Boolean).join(', ') : '' };
      closeStop();
      return out;
    });
    t("the popup head says the waypoint's city", pop.head === pop.want && pop.want.length > 0, pop);

    /* ---- THE BOX SAYS WHAT IT IS AND WHAT IT TAKES --------------------- */
    const box = await p.evaluate(() => {
      const q = document.getElementById('q');
      return { legend: q.closest('fieldset').querySelector('legend').textContent.trim(),
               placeholder: q.placeholder };
    });
    t('the box is labelled Search', box.legend === 'Search', box.legend);
    /* THE PLACEHOLDER SAYS WHAT IT SEARCHES. It named three things -- city,
       place, challenge -- while every other field on both halves was on screen
       and unfindable, so it was describing a narrower box than the one there. */
    t('and its placeholder does not name a closed list of three',
      !/city, place or challenge/i.test(box.placeholder), box.placeholder);

    /* ---- EVERY FIELD ON BOTH HALVES ------------------------------------
       DRIVEN OFF REAL VALUES rather than a pinned fixture: the check asks the
       loaded rows for a term and then requires the search to find it. A check
       that demanded production data hold one shape is a check that rots the
       moment somebody edits a row. */
    const fields = await p.evaluate(() => {
      const q = document.getElementById('q');
      const find = (term) => {
        q.value = term;
        q.dispatchEvent(new Event('input', { bubbles: true }));
        const n = document.querySelectorAll('#list .stop').length;
        q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
        return n;
      };
      /* A TERM MUST BE DISTINCTIVE, or a hit proves nothing: a search for "a"
         matches everything whatever the code does. The longest word of five
         letters or more is taken from each field. */
      const word = (v) => {
        const parts = String(v == null ? '' : v).split(/[^A-Za-z0-9]+/)
          .filter((x) => x.length >= 5);
        return parts.sort((a, b) => b.length - a.length)[0] || '';
      };
      const out = {};
      state.rows.forEach((r) => {
        const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
        const c = r.challenge_id == null ? null : state.challenges.filter((x) => x.id === r.challenge_id)[0];
        ['description', 'zip', 'source_url'].forEach((k) => {
          if (!out['wp.' + k] && w && word(w[k])) out['wp.' + k] = word(w[k]);
        });
        ['prompt', 'answer', 'kind', 'scope'].forEach((k) => {
          if (!out['ch.' + k] && c && word(c[k])) out['ch.' + k] = word(c[k]);
        });
        if (!out['ch.choices'] && c && Array.isArray(c.choices)) {
          const got = c.choices.map(word).filter(Boolean)[0];
          if (got) out['ch.choices'] = got;
        }
      });
      const res = {};
      Object.keys(out).forEach((k) => { res[k] = { term: out[k], n: find(out[k]) }; });
      return res;
    });
    Object.keys(fields).forEach((k) => {
      const f = fields[k];
      t('searching a ' + k.replace('.', ' ') + ' finds its stop', f.n > 0, f);
    });
    t('and it reached fields the old four-term search could not',
      Object.keys(fields).length >= 4, Object.keys(fields));

    /* ---- SEARCH STILL REACHES A TOWN ----------------------------------- */
    const found = await p.evaluate(() => {
      const r = state.rows.filter((x) => x.waypoint_id != null)[0];
      const w = state.waypoints.filter((x) => x.wpid === r.waypoint_id)[0];
      const town = String(w.city || '').toLowerCase();
      const box = document.getElementById('q');
      box.value = town;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      const n = document.querySelectorAll('#list .stop').length;
      box.value = '';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      return { town: town, n: n };
    });
    /* THE CITY IS STILL SEARCHABLE, THROUGH THE WAYPOINT. Reading `row.city`
       would compare against undefined and match nothing, which looks exactly
       like a town nobody has a stop in. */
    t('searching a town still finds its stops', found.n > 0, found);

    /* ---- THE WRITE ----------------------------------------------------- */
    const sent = await p.evaluate(async () => {
      const used = {};
      state.rows.forEach((r) => { if (r.waypoint_id != null) used[r.waypoint_id] = true; });
      const w = state.waypoints.filter((x) => !used[x.wpid])[0];
      document.getElementById('wpInput').value = wpLabel(w);
      document.getElementById('chalInput').value = '';
      state.pendingTags = { tags: [], mode: 'all' };
      await addStop();
      return { wpid: w.wpid };
    });
    await new Promise((r) => setTimeout(r, 400));
    const post = writes.filter((w) => w.m === 'POST')[0];
    t('adding a stop POSTs the two ids and the filter',
      !!post && Object.keys(post.body).sort().join(',')
        === 'challenge_id,challenge_tags,challenge_tags_match,waypoint_id',
      post ? Object.keys(post.body) : writes);
    /* A BARE RANDOM CARRIES NO TAGS, and the match mode still goes because the
       column is NOT NULL -- leaving it off would take the default, which is
       right for `all` and silently wrong for `any`. */
    t('and a bare RANDOM sends no tags', post && post.body.challenge_tags === null,
      post && post.body.challenge_tags);
    t('and the waypoint it was given', post && post.body.waypoint_id === sent.wpid,
      post && post.body.waypoint_id);
    /* RANDOM IS A NULL CHALLENGE, and that is unambiguous only because the
       picker has no empty option. */
    t('with RANDOM as a null challenge', post && post.body.challenge_id === null,
      post && post.body.challenge_id);
    t('and no city anywhere in it',
      post && !Object.prototype.hasOwnProperty.call(post.body, 'city'), post && post.body);

    /* ---- A DATABASE THAT HAS NOT RUN THE MIGRATION -------------------
       This is the direction that really happens: the page is deployed and the
       SQL goes in by hand, so for a while `city` is still NOT NULL and the
       two-id insert is refused. THE ROOM MUST NAME THE FILE rather than hand
       over a raw 23502, which is a statement about our schema. */
    const told = await p.evaluate(async () => {
      const res = { status: 400, ok: false, text: async () => JSON.stringify({
        code: '23502', message: 'null value in column "city" of relation "stops" '
          + 'violates not-null constraint' }) };
      return await readError(res);
    });
    t('an un-migrated database is told which file to run',
      /2026090302/.test(told), told);
    t('and is not handed a raw postgres code', !/^The database refused/.test(told), told);

    t('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
