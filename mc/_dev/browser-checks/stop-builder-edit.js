/* A STOP IS EDITED FROM ITS OWN POPUP (2026-09-03).

   A stop is a waypoint and a challenge, and until now the only way to change
   either was to delete the stop and add it back, which threw the row away.
   Both halves are editable in the popup, and DELETE moved there with them.

   Reads go to the LIVE database and **every write is intercepted** -- this
   drives a real stop, and a probe that let a PATCH through would edit the
   catalogue it is testing. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
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
  await new Promise((r) => srv.listen(9450, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 950 });
    const errs = [], writes = [];
    let refuseNext = null;
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {},
                 authHeaders: (x) => Object.assign(
                   { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
      window.confirm = () => true;
    }, KEY);
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') {
        let body = null;
        try { body = JSON.parse(q.postData() || 'null'); } catch (e) { body = q.postData(); }
        writes.push({ method: m, url: decodeURIComponent(u), body: body,
                      prefer: (q.headers() || {})['prefer'] || '' });
        if (refuseNext) {
          const r = refuseNext; refuseNext = null;
          q.respond({ status: 409, contentType: 'application/json', headers: H, body: r });
          return;
        }
        /* THE REPLY IS THE ROW THAT WAS SENT, which is what a real PATCH with
           `return=representation` answers. A stub inventing its own row would
           let a wrong body pass unnoticed.
             AND IT ECHOES THE `stop_id` FROM THE FILTER. Hardcoding one made
           every saved row come back with the SAME id, and `rowKey` is that id
           -- so two rows collided and one delete removed both. **That read as
           the page deleting two stops** and was the harness. A real server
           answers with the row it actually updated. */
        const sent = (body && !Array.isArray(body)) ? body : {};
        const m2 = /stop_id=eq\.(\d+)/.exec(decodeURIComponent(u));
        const id = m2 ? Number(m2[1]) : 1;
        q.respond({ status: 200, contentType: 'application/json', headers: H,
                    body: JSON.stringify([Object.assign({ stop_id: id }, sent)]) });
        return;
      }
      q.continue();
    });
    await p.goto('http://127.0.0.1:9450/mc/stop-builder/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows
      && state.rows.length > 0 && state.waypoints.length > 0 && state.challenges.length > 0,
      { timeout: 40000 });

    const wired = await p.evaluate(() => !!document.getElementById('svSave'));
    if (!wired) {
      t('the popup has a Save at all', false, 'no #svSave in the page');
      console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
      await br.close(); srv.close();
      process.exit(1);
    }

    /* ---- DELETE MOVED OFF THE ROW ---------------------------------------- */
    const rowCtl = await p.evaluate(() => ({
      rowDeletes: [...document.querySelectorAll('#list .btn')]
        .filter((b) => /delete/i.test(b.textContent)).length,
      deadCss: [...document.styleSheets].some((sh) => {
        try { return [...sh.cssRules].some((r) => (r.selectorText || '').indexOf('stop-del') !== -1); }
        catch (e) { return false; }
      })
    }));
    t('no row carries a Delete any more', rowCtl.rowDeletes === 0, rowCtl.rowDeletes);
    /* A CONTROL AND ITS STYLESHEET GO IN ONE PASS. */
    t('and its CSS went with it', rowCtl.deadCss === false);

    /* ---- THE POPUP OPENS ON WHAT THE ROW HOLDS --------------------------- */
    const opened = await p.evaluate(() => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      openStop(row);
      const w = wpById(row.waypoint_id);
      const c = row.challenge_id == null ? null : chalById(row.challenge_id);
      return {
        id: row.stop_id,
        wp: document.getElementById('svWpInput').value,
        wantWp: wpLabel(w),
        chal: document.getElementById('svChalInput').value,
        wantChal: c ? chalLabel(c) : null,
        hasSave: !!document.getElementById('svSave'),
        hasDelete: !!document.getElementById('svDelete')
      };
    });
    t('the popup carries both combos, a Save and a Delete',
      opened.hasSave && opened.hasDelete && opened.wp !== undefined);
    /* FILLED THROUGH THE SAME LABELLERS THE ADD BAR USES, or a value picked
       here and one picked there would not resolve the same way. */
    t('and the waypoint box opens on the row value', opened.wp === opened.wantWp, opened);
    if (opened.wantChal) {
      t('and the challenge box too', opened.chal === opened.wantChal, opened);
    } else {
      t('and a random stop opens on RANDOM', /^RANDOM/.test(opened.chal), opened.chal);
    }

    /* ---- SAVE SENDS ONE PATCH, KEYED ON stop_id -------------------------- */
    writes.length = 0;
    const saved = await p.evaluate(async () => {
      const other = state.waypoints.filter((w) => !state.rows.some((r) => r.waypoint_id === w.wpid))[0];
      const c = state.challenges[0];
      document.getElementById('svWpInput').value = wpLabel(other);
      document.getElementById('svChalInput').value = chalLabel(c);
      document.getElementById('svChalInput').dispatchEvent(new Event('input', { bubbles: true }));
      await saveStop();
      return { wpid: other.wpid, chalId: c.id };
    });
    t('Save sends exactly one write', writes.length === 1, writes.map((w) => w.method));
    const w0 = writes[0] || {};
    t('and it is a PATCH keyed on the row own stop_id',
      w0.method === 'PATCH' && w0.url.indexOf('stop_id=eq.' + opened.id) !== -1, w0.url);
    t('and it carries the new waypoint and challenge',
      w0.body && w0.body.waypoint_id === saved.wpid && w0.body.challenge_id === saved.chalId,
      w0.body);
    /* A NAMED CHALLENGE AND A FILTER ARE EXCLUSIVE. A PATCH that omitted the key
       would leave the old filter and the row would say both. */
    t('and nulls the tag filter rather than leaving it off',
      w0.body && 'challenge_tags' in w0.body && w0.body.challenge_tags === null, w0.body);
    /* WITHOUT `return=representation` a refused save reports success: PostgREST
       answers 200 with an empty array when RLS says no. */
    t('and asks for the row back', /return=representation/.test(w0.prefer || ''), w0.prefer);

    /* ---- A TYPO IS REFUSED AND NOTHING IS SENT --------------------------- */
    writes.length = 0;
    const typo = await p.evaluate(async () => {
      document.getElementById('svWpInput').value = 'Not A Real Waypoint';
      await saveStop();
      const bad1 = document.getElementById('svWpInput').getAttribute('data-invalid');
      const w = state.waypoints[0];
      document.getElementById('svWpInput').value = wpLabel(w);
      document.getElementById('svChalInput').value = 'Not A Real Challenge';
      await saveStop();
      return { wpFlagged: bad1,
               chalFlagged: document.getElementById('svChalInput').getAttribute('data-invalid') };
    });
    t('a waypoint the list does not hold is refused', typo.wpFlagged === 'true', typo);
    t('and a challenge typo too, never stored as RANDOM',
      typo.chalFlagged === 'true', typo);
    t('and neither sent anything', writes.length === 0, writes);

    /* ---- THE TAG DIALOG SERVES THE BOX THAT ASKED ------------------------ */
    const tags = await p.evaluate(() => {
      /* THE BAR'S OWN SETTLED FILTER IS SET FIRST, so the check can prove the
         popup's dialog does not overwrite it. One shared slot would carry a
         filter set here into the next thing added from the bar. */
      state.pendingTags = { tags: ['barvalue'], mode: 'all' };
      document.getElementById('svChalInput').value = 'RANDOM';
      document.getElementById('svChalInput').dispatchEvent(new Event('change', { bubbles: true }));
      const open = !document.getElementById('tagBackdrop').hidden;
      const host = state.tagHost;
      const chips = [...document.querySelectorAll('.tag-pick')];
      if (chips[0]) chips[0].click();
      document.getElementById('tagUse').click();
      return { open: open, host: host,
               svBox: document.getElementById('svChalInput').value,
               barBox: document.getElementById('chalInput').value,
               editTags: state.editTags.tags,
               barTags: state.pendingTags.tags };
    });
    t('choosing RANDOM in the popup opens the tag dialog',
      tags.open && tags.host === 'edit', tags);
    t('and the answer goes back into the popup box', /^RANDOM tagged /.test(tags.svBox), tags.svBox);
    /* THE BAR IS UNTOUCHED, which is the whole reason there are two slots. */
    t('and the ADD bar keeps its own filter',
      tags.barTags.join() === 'barvalue' && !/tagged/.test(tags.barBox), tags);

    /* ---- THE REFUSAL FITS THE ACT ---------------------------------------- */
    writes.length = 0;
    refuseNext = JSON.stringify({ code: '23505', message:
      'duplicate key value violates unique constraint "stops_one_per_waypoint"' });
    const refused = await p.evaluate(async () => {
      const w = state.waypoints[0], c = state.challenges[0];
      document.getElementById('svWpInput').value = wpLabel(w);
      document.getElementById('svChalInput').value = chalLabel(c);
      document.getElementById('svChalInput').dispatchEvent(new Event('input', { bubbles: true }));
      await saveStop();
      return (document.getElementById('note') || document.querySelector('.room-scribble') || {}).textContent || '';
    });
    /* IT SAID "rather than adding a second", which is right for the ADD bar and
       wrong here: nothing is being added. */
    t('a taken waypoint is refused in words that fit an edit',
      /already at that waypoint/i.test(refused) && !/adding a second/i.test(refused), refused);

    /* ---- THE PREVIEW FOLLOWS THE BOXES ---------------------------------- */
    /* It used to follow the STORED row and nothing else, so changing the
       waypoint left the street view, the address and the rehearsal describing
       the place you had just moved away from until you pressed Save. */
    writes.length = 0;
    const preview = await p.evaluate(async () => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      openStop(row);
      const read = () => ({
        title: document.getElementById('svTitle').textContent,
        city: document.getElementById('svCity').textContent,
        pano: (document.querySelector('#svWaypoint iframe') || {}).src || '',
        values: [...document.querySelectorAll('#svWaypoint .sv-value')]
          .map((v) => v.textContent).join(' | '),
        right: document.getElementById('svChallenge').textContent
      });
      const before = read();
      before.wpid = state.open.waypoint_id;
      /* A DIFFERENT WAYPOINT, one with its own coordinates so the street view
         has something to change to. */
      const other = state.waypoints.filter((w) =>
        w.wpid !== row.waypoint_id && w.lat != null && w.lon != null
        && w.name !== before.title)[0];
      const box = document.getElementById('svWpInput');
      box.value = wpLabel(other);
      box.dispatchEvent(new Event('change', { bubbles: true }));
      const afterWp = read();

      /* AND A DIFFERENT CHALLENGE. */
      const otherChal = state.challenges.filter((c) =>
        c.id !== row.challenge_id && String(c.prompt || '').trim())[0];
      const cbox = document.getElementById('svChalInput');
      cbox.value = chalLabel(otherChal);
      cbox.dispatchEvent(new Event('input', { bubbles: true }));
      cbox.dispatchEvent(new Event('change', { bubbles: true }));
      const afterChal = read();

      return { before: before, afterWp: afterWp, afterChal: afterChal,
               wantTitle: other.name, wantCity: wpWhere(other),
               wantPrompt: String(otherChal.prompt || '').trim(),
               storedWp: state.open.waypoint_id, otherWp: other.wpid };
    });
    t('changing the waypoint redraws the title and the city',
      preview.afterWp.title === preview.wantTitle
      && preview.afterWp.city === preview.wantCity, preview.afterWp);
    t('and the street view with it',
      preview.afterWp.pano !== preview.before.pano && !!preview.afterWp.pano,
      { before: preview.before.pano.slice(0, 60), after: preview.afterWp.pano.slice(0, 60) });
    t('and the address and description underneath',
      preview.afterWp.values !== preview.before.values, preview.afterWp.values.slice(0, 80));
    t('changing the challenge restarts the rehearsal on it',
      preview.afterChal.right.indexOf(preview.wantPrompt.slice(0, 30)) !== -1,
      preview.afterChal.right.slice(0, 120));
    /* NOTHING IS SAVED BY LOOKING, which is what makes it a preview: the stored
       row is untouched until Save. */
    t('and none of it wrote anything', writes.length === 0, writes);
    t('nor changed the row it is previewing',
      preview.storedWp === preview.before.wpid
      && preview.storedWp !== preview.otherWp,
      { open: preview.storedWp, wasShowing: preview.before.wpid, previewed: preview.otherWp });

    /* AN UNRESOLVABLE VALUE LEAVES THE PREVIEW ALONE rather than blanking it.
       Mid-edit is not a state worth drawing, and Save is what refuses a typo. */
    const typoPreview = await p.evaluate(() => {
      const was = document.getElementById('svTitle').textContent;
      const box = document.getElementById('svWpInput');
      box.value = 'Not A Real Waypoint';
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return { was: was, now: document.getElementById('svTitle').textContent };
    });
    t('a typo leaves the preview standing rather than blanking it',
      typoPreview.now === typoPreview.was, typoPreview);

    /* THE FILTER REACHES THE PANEL THAT SHOWS IT. `useTagDialog` writes the box
       directly, which fires no `change`, so without an explicit refresh the
       RANDOM panel would go on describing the filter from before the dialog. */
    const tagPreview = await p.evaluate(() => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      openStop(row);
      const cbox = document.getElementById('svChalInput');
      cbox.value = 'RANDOM';
      cbox.dispatchEvent(new Event('change', { bubbles: true }));
      const before = document.getElementById('svChallenge').textContent;
      const chips = [...document.querySelectorAll('.tag-pick')];
      const word = chips[0] ? chips[0].dataset.tag : '';
      if (chips[0]) chips[0].click();
      document.getElementById('tagUse').click();
      return { before: before, word: word,
               after: document.getElementById('svChallenge').textContent };
    });
    t('using the tag dialog redraws the RANDOM panel',
      tagPreview.after !== tagPreview.before,
      { before: tagPreview.before.slice(0, 70), after: tagPreview.after.slice(0, 70) });
    t('and the panel names the tag that was chosen',
      !!tagPreview.word
      && tagPreview.after.toLowerCase().indexOf(tagPreview.word.toLowerCase()) !== -1,
      { word: tagPreview.word, panel: tagPreview.after.slice(0, 90) });

    /* UNDERSCORES READ AS SPACES, the rule the Challenge Bank's badge keeps.
       This panel drew the raw column, so it said `type_answer` where the Bank
       says TYPE ANSWER -- one column spelled two ways in two rooms. **The
       stored value keeps the underscore and has to**: it is a CSS class over
       there, and a space in a class name is two selectors. */
    const spelling = await p.evaluate(() => {
      const row = state.rows.filter((r) => r.challenge_id != null)[0];
      openStop(row);
      const c = chalById(row.challenge_id);
      return { panel: document.getElementById('svChallenge').textContent,
               label: chalLabel(c), stored: String(c.type || ''),
               roundTrip: (chalFromLabel(chalLabel(c)) || {}).id === c.id };
    });
    t('the panel draws the type with spaces, not underscores',
      spelling.stored.indexOf('_') === -1
      || spelling.panel.indexOf(spelling.stored) === -1, spelling);
    t('and so does the picker label', spelling.label.indexOf('_') === -1, spelling.label);
    /* THE ROUND TRIP HOLDS because `chalFromLabel` matches against `chalLabel`
       itself -- one composer, so changing how a label reads cannot stop a value
       resolving. */
    t('and a label still resolves back to its challenge', spelling.roundTrip, spelling);

    /* ---- THE DOWN ARROW OFFERS THE WHOLE LIST --------------------------- */
    /* A DATALIST FILTERS ITS OPTIONS BY WHAT IS IN THE BOX, so a field holding
       a full label offers exactly one entry: itself. **The native dropdown is
       browser chrome and cannot be read from here**, so what is asserted is the
       mechanism that decides what it contains -- the box is empty while
       focused, so nothing is filtered out. */
    const arrow = await p.evaluate(() => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      openStop(row);
      const wp = document.getElementById('svWpInput');
      const filled = wp.value;
      wp.focus();
      const whileFocused = wp.value;
      wp.blur();
      const afterBlur = wp.value;
      return {
        filled: filled, whileFocused: whileFocused, afterBlur: afterBlur,
        /* AND THE LIST IT POINTS AT IS THE WHOLE CATALOGUE, "depending" on the
           box: waypoints for one, challenges for the other. */
        wpList: document.getElementById('svWpInput').getAttribute('list'),
        chList: document.getElementById('svChalInput').getAttribute('list'),
        wpOptions: document.querySelectorAll('#wpList option').length,
        chOptions: document.querySelectorAll('#chalList option').length,
        waypoints: state.waypoints.length,
        challenges: state.challenges.length
      };
    });
    t('a filled box empties while focused, so the arrow offers everything',
      arrow.filled && arrow.whileFocused === '', arrow);
    /* AN EMPTY BOX IS NOT AN INSTRUCTION. Clicking in and away again must not
       wipe the row value -- Save would then be refused for something nobody
       deleted. */
    t('and the value comes back on blur if nothing was chosen',
      arrow.afterBlur === arrow.filled, arrow);
    t('the waypoint box lists every waypoint',
      arrow.wpList === 'wpList' && arrow.wpOptions === arrow.waypoints, arrow);
    /* RANDOM IS AN OPTION IN ITS OWN RIGHT, so the challenge list is one longer
       than the catalogue. */
    t('and the challenge box every challenge, plus RANDOM',
      arrow.chList === 'chalList' && arrow.chOptions === arrow.challenges + 1, arrow);

    /* ---- THE WAYPOINTS ARE OFFERED BY CITY --------------------------------
       ONE DATALIST FEEDS BOTH BOXES, so this is one order and both are asserted
       to point at it -- a check that read only the popup's would pass on a page
       where the bar had drifted to a second list.
         THE EXPECTED ORDER IS COMPUTED HERE, from the same rule and separate
       code. Asking the page whether its own list agrees with its own sort proves
       nothing; two implementations of one rule having to agree is the claim. */
    const sorted = await p.evaluate(() => ({
      wpList: document.getElementById('wpInput').getAttribute('list'),
      svList: document.getElementById('svWpInput').getAttribute('list'),
      shown: Array.from(document.querySelectorAll('#wpList option')).map((o) => o.value),
      raw: state.waypoints.map((w) => ({
        wpid: w.wpid, name: w.name, city: w.city, state: w.state
      }))
    }));

    const where = (w) => [w.city, w.state].filter(Boolean).join(', ');
    const label = (w) => (where(w) ? w.name + ' - ' + where(w) : String(w.name || ''));
    const expect = sorted.raw.slice().sort((a, b) => {
      const ca = where(a), cb = where(b);
      if (!ca !== !cb) return ca ? -1 : 1;
      if (ca !== cb) return ca.localeCompare(cb, undefined, { sensitivity: 'base', numeric: true });
      const na = String(a.name || '').trim(), nb = String(b.name || '').trim();
      if (na !== nb) return na.localeCompare(nb, undefined, { sensitivity: 'base', numeric: true });
      return (Number(a.wpid) || 0) - (Number(b.wpid) || 0);
    }).map(label);

    t('both waypoint boxes point at the one list, so one order serves both',
      sorted.wpList === 'wpList' && sorted.svList === 'wpList', sorted);

    /* THE CITIES RUN IN ORDER, which is the whole ask. Read off what is SHOWN
       rather than off the rows, because an order the reader cannot see is what
       a broken sort looks like. */
    /* THE CITY COMES OFF THE ROW, NEVER PARSED BACK OUT OF THE LABEL. Two
       waypoints on file carry " - " in their own NAME -- `Top of the World -
       Baltimore Inner Harbor` -- so splitting on the first separator reads half
       a name as a city, and on the last one it invents a city for a row that has
       none. The first cut of this check did the first and reported a sort fault
       that was its own. (`wpFromLabel` is unaffected: it compares the WHOLE
       label, so an ambiguous separator costs it nothing.) */
    const byLabel = {};
    sorted.raw.forEach((w) => { byLabel[label(w)] = where(w); });
    const cities = sorted.shown.map((v) => byLabel[v] || '');
    const named = cities.filter(Boolean);
    let climbs = true, firstDrop = null;
    for (let i = 1; i < named.length; i += 1) {
      if (named[i].localeCompare(named[i - 1], undefined, { sensitivity: 'base', numeric: true }) < 0) {
        climbs = false; firstDrop = named[i - 1] + ' then ' + named[i]; break;
      }
    }
    t('the waypoints are offered by city, A to Z', climbs, firstDrop);

    /* THE WHOLE ORDER, not only that the cities climb: within a city the names
       have to run in order too, or a town with forty places is a scramble. */
    const same = sorted.shown.length === expect.length
      && sorted.shown.every((v, i) => v === expect[i]);
    t('and by name within each city, all the way down', same,
      same ? sorted.shown.length + ' options'
           : sorted.shown.slice(0, 3).join(' | ') + '  vs  ' + expect.slice(0, 3).join(' | '));

    /* A WAYPOINT WITH NO CITY HAS NO PLACE IN A LIST GROUPED BY ONE, so it
       sinks rather than leading the alphabet. Asserted only where the catalogue
       actually holds one -- a check that demands production carry a shape is a
       check that rots. */
    const blanks = cities.filter((c) => !c).length;
    if (blanks) {
      const lastNamed = cities.lastIndexOf(named[named.length - 1]);
      t('a waypoint with no city sinks to the end',
        cities.slice(lastNamed + 1).every((c) => !c), { blanks: blanks, at: lastNamed });
    } else {
      t('no waypoint on file is missing a city, so nothing to sink', true, blanks);
    }

    /* A BARE `RANDOM` MUST NOT SWALLOW THE CLICK. The mousedown intercept
       exists to reopen a FILTER, and it fired on a bare RANDOM too -- so the
       challenge list could not be reached by pointer at all on such a stop. */
    const bare = await p.evaluate(() => {
      state.editTags = { tags: [], mode: 'all' };
      document.getElementById('svChalInput').value = 'RANDOM';
      const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      document.getElementById('svChalInput').dispatchEvent(ev);
      const swallowedBare = ev.defaultPrevented;
      state.editTags = { tags: ['sports'], mode: 'all' };
      document.getElementById('svChalInput').value = 'RANDOM tagged sports';
      const ev2 = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      document.getElementById('svChalInput').dispatchEvent(ev2);
      const swallowedFilter = ev2.defaultPrevented;
      document.getElementById('tagCancel').click();
      state.editTags = { tags: [], mode: 'all' };
      return { swallowedBare: swallowedBare, swallowedFilter: swallowedFilter };
    });
    t('clicking a bare RANDOM box opens the list rather than the tag dialog',
      bare.swallowedBare === false, bare);
    /* AND A BOX THAT HOLDS A FILTER STILL REOPENS IT, which is the only way
       back to a filter already chosen. */
    t('and a box holding a filter still reopens the dialog',
      bare.swallowedFilter === true, bare);

    /* ---- AND DELETE ACTUALLY DELETES ------------------------------------ */
    writes.length = 0;
    const deleted = await p.evaluate(async () => {
      const row = state.rows.filter((r) => r.waypoint_id != null)[0];
      const before = state.rows.length;
      openStop(row);
      document.getElementById('svDelete').click();
      await new Promise((r) => setTimeout(r, 400));
      return { id: row.stop_id, before: before, after: state.rows.length,
               shut: document.getElementById('svBackdrop').hidden };
    });
    const d0 = writes.filter((w) => w.method === 'DELETE')[0] || {};
    t('Delete sends a DELETE keyed on the row own stop_id',
      d0.method === 'DELETE' && d0.url.indexOf('stop_id=eq.' + deleted.id) !== -1, d0.url);
    t('and asks for the row back too',
      /return=representation/.test(d0.prefer || ''), d0.prefer);
    t('and takes the row off the list', deleted.after === deleted.before - 1, deleted);
    /* THE POPUP CLOSES, or it would be sitting open on a stop that is gone. */
    t('and closes the popup it was opened from', deleted.shut === true, deleted);

    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
