/* CHOOSING AN ANCHOR EVENT REFILLS BOTH AUDIENCES.
   ---------------------------------------------------------------------------
   ASKED FOR AS: when a new anchor event is chosen, repopulate audiences with
   best guess.

   THE AWAY CLUB IS THE TARGET AND THE HOME CLUB IS THE RIVAL -- the standing
   rule, not a new one: a game is pitched at the travelling fandom and the club
   they are surrounded by is who they are up against.

   IT IS DRIVEN AGAINST THE LIVE EVENTS with the writes intercepted, because
   the claim is about what a REAL event row produces. A fixture of my own would
   only test my own guess at what `public.events` holds.

   FOUR CASES, AND THREE OF THEM ARE THE ONES THAT GO WRONG:
     a fixture           -> both boxes are refilled, overwriting what was there
     the SAME event      -> nothing moves (the box re-resolves on every blur)
     an event with no clubs -> nothing moves (clearing is not a guess)
     the picker cleared  -> nothing moves

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
  await new Promise((r) => srv.listen(9337, r));
  const browser = await pup.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox'],
    protocolTimeout: 240000
  });
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1500, height: 1200 });
    const errs = [], writes = [];
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
      writes.push({ m, b: q.postData() || '' });
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

    await p.goto('http://127.0.0.1:9337/mc/games/index.html', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(
      () => document.querySelectorAll('#gamePickerList option').length > 5, { timeout: 60000 });
    await p.waitForFunction(
      () => !document.getElementById('gameNameBar').hidden, { timeout: 30000 });
    /* THE EVENTS PAGE IN BEHIND THE FIRST PAINT -- 3,051 rows, a thousand at a
       time -- so the probe waits for the catalogue rather than a clock. */
    await p.waitForFunction(
      () => document.querySelectorAll('#anchorEventList option').length > 100, { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));

    /* THE FIXTURES ARE REAL AND THE CLUBLESS EVENT IS MADE UP, and the split is
       the honest one: `public.events` is **272 rows and every one of them is
       `sports-nfl` with both clubs named** -- measured, not assumed -- so a
       concert is a shape the table does not currently hold.
         A CHECK THAT WAITS FOR PRODUCTION TO GROW THE RIGHT ROW IS A CHECK THAT
       ROTS. This project has been caught by that five times, twice by a branch
       that quietly stopped running. So the clubless case is driven with a row
       pushed into the loaded catalogue, and the two fixtures come from the
       table -- naming an id would be a copy of it that goes stale instead. */
    const found = await p.evaluate(() => {
      const named = (v) => String(v == null ? '' : v).trim() !== '';
      /* A BARE IDENTIFIER, NEVER `window.builderAnchorEvents`. It is a
         top-level `let` in a classic script, which creates NO window property
         -- so reading it off `window` answered an empty list and the check
         reported a catalogue of 3,051 events as 0. `page.evaluate` runs in the
         same realm, so the bare name resolves.
         This file has already recorded that for `builderTeamsList`. */
      const all = (typeof builderAnchorEvents === 'undefined') ? [] : builderAnchorEvents;
      const fixture = all.find((e) => named(e.away_team_nickname) && named(e.home_team_nickname));
      /* THE CLUBLESS EVENT IS PUSHED IN, and it goes into BOTH the array and
         the id map -- `resolveTypedEvent` walks the array to match a label and
         `applyAnchorEventSelection` reads the map to find the row, so one
         without the other resolves to an id whose event cannot be found. */
      let other = all.find((e) => !named(e.away_team_nickname) && !named(e.home_team_nickname));
      if (!other) {
        other = { id: 'ZED-PROBE-CONCERT', kind: 'concert', start_date: '2027-08-08',
                  title: 'Zed Probe Concert', venue_city: 'Chicago, Illinois',
                  away_team_geo: '', away_team_nickname: '',
                  home_team_geo: '', home_team_nickname: '' };
        all.push(other);
        builderAnchorEventsById.set(String(other.id), other);
        populateAnchorEventSelect();
      }
      const second = all.find((e) => named(e.away_team_nickname) && named(e.home_team_nickname)
        && e.id !== (fixture && fixture.id));
      const pack = (e) => e && { id: String(e.id), label: anchorEventLabel(e),
        away: (e.away_team_geo + ' ' + e.away_team_nickname).trim(),
        home: (e.home_team_geo + ' ' + e.home_team_nickname).trim(),
        /* THE EXPECTED START IS WORKED OUT HERE, INDEPENDENTLY OF THE PAGE.
           Asking the room whether it agrees with its own helper proves nothing;
           the day before is computed from the event's own date with a second
           implementation, in UTC for the reason the page uses it. */
        eventDate: String(e.start_date || '').slice(0, 10),
        eventTime: String(e.start_time || '').slice(0, 5),
        zone: String(e.timezone || ''),
        dayBefore: (() => {
          const q = String(e.start_date || '').slice(0, 10).split('-').map(Number);
          const d = new Date(Date.UTC(q[0], q[1] - 1, q[2]));
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        })() };
      return { count: all.length, fixture: pack(fixture), second: pack(second),
               other: other ? { id: String(other.id), label: anchorEventLabel(other) } : null };
    });
    t('the events catalogue loaded', found.count > 100, found.count);
    t('and it offers two fixtures and an event with no clubs',
      !!found.fixture && !!found.other && !!found.second
      && found.fixture.id !== found.second.id,
      { fixture: found.fixture && found.fixture.id, other: found.other && found.other.id,
        second: found.second && found.second.id });
    if (!found.fixture || !found.other || !found.second) {
      throw new Error('the live catalogue did not offer the shapes this check needs');
    }

    /* A HELPER THAT DRIVES THE REAL CONTROL. Setting `.value` and firing
       `change` is what the datalist itself does; the room resolves the label
       back to an id in `resolveTypedEvent`. */
    const chooseEvent = async (label) => {
      await p.evaluate((v) => {
        const el = document.getElementById('anchorEventInput');
        el.focus();
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
      }, label);
      await new Promise((r) => setTimeout(r, 400));
    };
    const boxes = () => p.evaluate(() => ({
      target: document.getElementById('target').value,
      rival: document.getElementById('rival').value,
      anchor: document.getElementById('anchorEventInput').title,
      date: document.getElementById('tgbDate').value,
      hour: document.getElementById('startHour').value,
      minute: document.getElementById('startMinute').value,
      zone: document.getElementById('startZone').value,
      /* THE MINUTE PICKER OFFERS 00, 15 AND 30, and a kickoff is routinely on
         another minute -- so the option the room ADDS for it is read too. That
         marked option is the page saying the value did not come from the list,
         and it is the common case here rather than an edge. */
      minuteMarked: (() => {
        const sel = document.getElementById('startMinute');
        const o = sel.options[sel.selectedIndex];
        return o ? o.textContent.trim() : '';
      })()
    }));

    /* ---- 1. A HAND-TYPED PAIR IS REPLACED ----------------------------- */
    /* THE OVERWRITE IS THE ASK, and it reverses the fill-a-blank rule the old
       prefill kept: filling only blanks would do nothing on a game that
       already has audiences, which is every game that has ever been anchored. */
    await p.evaluate(() => {
      [['target', 'Zed typed target'], ['rival', 'Zed typed rival']].forEach(([id, v]) => {
        const el = document.getElementById(id);
        el.focus(); el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.blur();
      });
    });
    const before = await boxes();
    t('both audiences hold what was typed', before.target === 'Zed typed target'
      && before.rival === 'Zed typed rival', before);

    await chooseEvent(found.fixture.label);
    const after = await boxes();
    t('choosing a fixture refills the target with the away club',
      after.target === found.fixture.away + ' fans',
      { got: after.target, want: found.fixture.away + ' fans' });
    t('and the rival with the home club',
      after.rival === found.fixture.home + ' fans',
      { got: after.rival, want: found.fixture.home + ' fans' });
    /* IN THE WORDS THE COLUMN ALREADY HOLDS. All 366 filled rows are
       `full_name || ' fans'`, so a guess in any other shape would be the one
       row in the table spelt differently. */
    t('and both are worded the way the column is', /\bfans$/.test(after.target)
      && /\bfans$/.test(after.rival), after);
    t('and the anchor really changed', after.anchor === found.fixture.id, after.anchor);

    /* ---- AND START IS THE EVENT'S OWN, A DAY EARLIER ------------------- */
    /* THE PRODUCT RULE, NOT AN ARBITRARY OFFSET: a TGB game is played the day
       BEFORE its anchor. The date is compared against a second implementation
       rather than against the page's own helper. */
    t('choosing a fixture fills START with the day before',
      after.date === found.fixture.dayBefore,
      { got: after.date, want: found.fixture.dayBefore, event: found.fixture.eventDate });
    t('and the day before is one day, not a timezone away',
      (Date.parse(found.fixture.eventDate + 'T00:00:00Z')
       - Date.parse(after.date + 'T00:00:00Z')) === 86400000,
      { event: found.fixture.eventDate, start: after.date });
    /* THE SAME CLOCK. `events.start_time` is the clock OUTSIDE THE VENUE, so
       the guess carries it across rather than converting it. */
    t('and the same clock the event kicks off at',
      after.hour + ':' + after.minute === found.fixture.eventTime,
      { got: after.hour + ':' + after.minute, want: found.fixture.eventTime });
    /* AND THE ZONE WITH IT, which is what makes the clock mean anything -- a
       number in a box with nothing saying which clock it is on cannot be
       converted or checked. */
    t("and the venue" + String.fromCharCode(39) + "s own timezone",
      after.zone === found.fixture.zone, { got: after.zone, want: found.fixture.zone });
    /* AN OFF-LIST MINUTE IS MARKED RATHER THAN ROUNDED. The picker offers three
       minutes and a kickoff is routinely on another, so this is the common case
       -- and rounding would change the answer that was asked for. */
    const quarter = ['00', '15', '30'].indexOf(after.minute) !== -1;
    t('and an off-list minute is kept and marked',
      quarter || after.minuteMarked.indexOf('(not offered)') !== -1,
      { minute: after.minute, shown: after.minuteMarked });

    /* ---- 2. THE SAME EVENT AGAIN CHANGES NOTHING ---------------------- */
    /* `resolveTypedEvent` RUNS ON CHANGE **AND** ON BLUR, so it re-resolves the
       same id whenever the box is left. Without the changed-id guard, tabbing
       past the anchor would rewrite both audiences every time -- which would
       undo an edit somebody had just made by hand. */
    await p.evaluate(() => {
      const el = document.getElementById('target');
      el.focus(); el.value = 'Zed edited by hand';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.blur();
    });
    await chooseEvent(found.fixture.label);
    const same = await boxes();
    t('re-resolving the SAME event leaves the audiences alone',
      same.target === 'Zed edited by hand', same);

    /* ---- 3. AN EVENT WITH NO CLUBS CHANGES NOTHING -------------------- */
    /* CLEARING BOTH BECAUSE SOMEBODY ANCHORED A GAME TO A CONCERT WOULD BE
       DESTRUCTIVE RATHER THAN A GUESS. */
    /* THE CLUBLESS EVENT CARRIES A DATE, so START still follows it -- the two
       fills are independent and the audiences are the half that has nothing to
       go on. */
    const beforeClubless = await boxes();
    await chooseEvent(found.other.label);
    const clubless = await boxes();
    t('an event with no clubs still fills START',
      clubless.date === '2027-08-07' && clubless.date !== beforeClubless.date,
      { got: clubless.date, want: '2027-08-07' });
    t('an event that names no clubs leaves them alone',
      clubless.target === 'Zed edited by hand' && clubless.rival === same.rival, clubless);
    t('and it still records the link', clubless.anchor === found.other.id, clubless.anchor);

    /* ---- 4. AND A DIFFERENT FIXTURE REFILLS AGAIN --------------------- */
    await chooseEvent(found.second.label);
    const moved = await boxes();
    t('a different fixture refills from that one',
      moved.target === found.second.away + ' fans'
      && moved.rival === found.second.home + ' fans',
      { got: [moved.target, moved.rival],
        want: [found.second.away + ' fans', found.second.home + ' fans'] });

    /* ---- 5. NOTHING IS SAVED BY CHOOSING ------------------------------ */
    /* THE WAY BACK FROM AN UNWANTED OVERWRITE is closing the game without
       saving, which only holds while choosing an event writes nothing. */
    t('and choosing an event writes nothing on its own',
      writes.filter((w) => w.m === 'POST' || w.m === 'PATCH').length === 0,
      writes.map((w) => w.m));

    /* ---- 6. AND IT REACHES THE COLUMN ON SAVE ------------------------- */
    writes.length = 0;
    await p.evaluate(() => {
      const b = document.getElementById('gamePickerSaveBtn');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 2200));
    const sent = {};
    writes.forEach((w) => {
      try { Object.assign(sent, [JSON.parse(w.b)].flat()[0] || {}); } catch (e) {}
    });
    t('the refilled START reaches public.games',
      sent.start && sent.start.date === found.second.dayBefore
      && sent.start.time === found.second.eventTime
      && sent.start.timezone === found.second.zone,
      { got: sent.start, want: { date: found.second.dayBefore,
        time: found.second.eventTime, timezone: found.second.zone } });
    t('the refilled audiences reach public.games',
      sent.target === found.second.away + ' fans'
      && sent.rival === found.second.home + ' fans',
      { target: sent.target, rival: sent.rival });
    t('and the anchor id with them', sent.anchor_event_id === found.second.id,
      sent.anchor_event_id);

    t('no page errors', errs.length === 0, errs);
  } finally {
    await browser.close();
    srv.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
