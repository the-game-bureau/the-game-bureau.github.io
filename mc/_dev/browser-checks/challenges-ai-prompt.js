/* THE AI PROMPT IN THE CHALLENGE BANK (2026-09-04).

   IT REPLACED `NFL trivia`, WHICH WROTE ONE MULTIPLE CHOICE QUESTION PER NFL
   CLUB. What that lost is the list being built FROM THE ROWS, so this suite
   carries the assertions that replace it: a topic is not a set anything can
   enumerate, so the guarantees are now that the KNOBS reach the sheet and that
   the club printed is the club asked for.

   THE ONE THING WORTH PROVING HARDEST IS THE KEY. `ladder_key` is not a foreign
   key and nothing in the database will refuse a wrong one: the row reads
   perfectly and the question is never asked of anybody. **12 clubs are called
   the Bears**, and the first cut of `aiClub` took the first match -- printing
   `baltimore-md-ncaaf-bears` beside a city box saying Chicago. So the key is
   asserted against the LIVE `destinations` catalogue rather than against a
   literal, and every one of the four resolution paths is driven.

   Reads go to the LIVE database. Every write is intercepted.

   Run: node mc/_dev/browser-checks/challenges-ai-prompt.js                    */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
            '.json': 'application/json' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const NL = String.fromCharCode(10);
const ROOT = 'C:/Code/the-game-bureau';

(async () => {
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => {
      if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  });
  await new Promise((r) => srv.listen(9463, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 240000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1000 });
    const errs = [], writes = [], popups = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(NL)[0]));
    br.on('targetcreated', async (tg) => {
      if (tg.type() !== 'page') return;
      popups.push(tg.url());
      try { const q = await tg.page(); if (q) await q.close(); } catch (e) { /* gone */ }
    });
    await p.evaluateOnNewDocument((k) => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => null, init: () => {},
                 authHeaders: (x) => Object.assign(
                   { apikey: k, Authorization: 'Bearer ' + k }, x || {}) }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    }, KEY);
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers': 'content-range' };
      /* THE DOORS REALLY NAVIGATE. Whether somebody else's site answers is not
         what this suite is about, and letting it try leaves the browser busy. */
      if (q.isNavigationRequest() && u.indexOf('127.0.0.1') === -1) { q.abort(); return; }
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m !== 'GET') { writes.push(m);
        q.respond({ status: 200, contentType: 'application/json', headers: H, body: '[]' }); return; }
      q.continue();
    });

    await p.goto('http://127.0.0.1:9463/mc/challenges/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__a) await window.__a();
    });
    await p.waitForFunction(() => typeof state !== 'undefined' && state.rows
                                  && state.rows.length > 0, { timeout: 40000 });

    /* THE NFL PROMPT IS GONE, NOT HIDDEN. A control coming back is a decision
       somebody takes rather than something that drifts, and the room went blank
       for a moment during this change because the wiring outlived the markup. */
    const src = fs.readFileSync(ROOT + '/mc/challenges/index.html', 'utf8');
    t('nothing in the room still names the old prompt',
      !/nfl[A-Z]|NFL_DOORS|buildNflPrompt/.test(src),
      (src.match(/nfl[A-Z]|NFL_DOORS/g) || []).slice(0, 6));

    // ---- THE DOOR ----------------------------------------------------------
    const btn = await p.evaluate(() => {
      const b = document.getElementById('aiBtn');
      return b ? { text: b.textContent.trim(), title: b.title,
                   inAdd: !!b.closest('.command-bar') } : null;
    });
    t('the Add bar carries a Prompt button', !!btn && btn.text === 'Prompt', btn);
    t('and its tooltip does not promise trivia',
      !!btn && !/trivia|NFL/i.test(btn.title), btn && btn.title);

    t('pressing it opens the dialog', await (async () => {
      await p.click('#aiBtn');
      return p.evaluate(() => el('aiDlg').classList.contains('is-open'));
    })());

    // ---- THE KNOBS ---------------------------------------------------------
    const knobs = await p.evaluate(() => ({
      ids: ['aiTopics', 'aiCity', 'aiTeam', 'aiCount'].filter((id) => !!el(id)),
      types: [...document.querySelectorAll('.ai-type')].map((x) => ({
        word: x.textContent.trim(),
        boxInside: !!x.querySelector('input[type="checkbox"]'),
        on: x.querySelector('input').checked
      })),
      cityOpts: el('aiCityList').children.length,
      teamOpts: el('aiTeamList').children.length,
      clubs: (state.clubs || []).length
    }));
    t('it asks for topics, a city, a team and a count',
      knobs.ids.length === 4, knobs.ids);
    /* THE WORD IS INSIDE THE LABEL, so clicking either picks the kind -- the
       same construction the Tape Room's filter radios use. */
    t('and offers the kinds as labelled boxes',
      knobs.types.length >= 4 && knobs.types.every((x) => x.boxInside),
      knobs.types.map((x) => x.word));
    t('with more than one kind ticked to begin with',
      knobs.types.filter((x) => x.on).length > 1,
      knobs.types.filter((x) => x.on).map((x) => x.word));
    /* `operations` IS DELIBERATELY ABSENT. The only row of that kind is the
       waiver, whose words are a contract, and asking an AI to write more of
       those is not a thing this button should be able to do. */
    t('and never offers to write an operations row',
      knobs.types.every((x) => !/operation/i.test(x.word)),
      knobs.types.map((x) => x.word));

    /* BUILT FROM THE CATALOGUE, so neither box can suggest a club or a city
       nothing holds. Both stay free text: a topic prompt is not limited to
       places we have already filed. */
    t('both pickers are built from the club catalogue',
      knobs.clubs > 100 && knobs.teamOpts === knobs.clubs && knobs.cityOpts > 100,
      knobs);

    const set = (o) => p.evaluate((o) => {
      Object.keys(o).forEach((k) => {
        el(k).value = o[k];
        el(k).dispatchEvent(new Event('input', { bubbles: true }));
      });
    }, o);
    const sheet = () => p.evaluate(() => el('aiPrompt').value);

    // ---- THE KNOBS REACH THE SHEET ----------------------------------------
    await set({ aiTopics: 'the river, the fire, deep dish', aiCity: 'Chicago',
                aiTeam: 'Bears', aiCount: '6' });
    let text = await sheet();

    t('a topic typed reaches the prompt, one to a line',
      ['the river', 'the fire', 'deep dish'].every((x) =>
        text.indexOf(NL + '  ' + x) !== -1), text.slice(0, 400));
    t('and the count is asked for in words',
      /THE JOB: write 6 challenges\./.test(text),
      (text.match(/THE JOB.*/) || [''])[0]);
    t('and the city is named as the setting',
      /THE CITY: Chicago\./.test(text), (text.match(/THE CITY:.*/) || [''])[0]);

    /* THE KEY IS THE THING NOTHING DOWNSTREAM CHECKS, so it is checked here --
       against the LIVE catalogue rather than against a string in this file. */
    const key = (text.match(/Its key is\s+(\S+)/) || [])[1];
    t('the club box resolves to a key', !!key, key);
    const found = await p.evaluate(async (k, K) => {
      const u = 'https://qmaafbncpzrdmqapkkgr.supabase.co/rest/v1/destinations'
              + '?select=id,city,nickname,league&id=eq.' + encodeURIComponent(k);
      const r = await fetch(u, { headers: { apikey: K, Authorization: 'Bearer ' + K } });
      return r.ok ? await r.json() : null;
    }, key || '-', KEY);
    t('and that key is a real row in the destinations catalogue',
      !!found && found.length === 1, found);
    /* THE FAULT THIS REPLACED: `Bears` matched Baltimore, a real college side,
       beside a city box saying Chicago. A wrong key resolves silently. */
    t('and it is the club in the city that was asked for',
      !!found && found[0] && found[0].city === 'Chicago' && found[0].league === 'NFL',
      found && found[0]);

    // ---- AMBIGUOUS IS ITS OWN ANSWER --------------------------------------
    await set({ aiCity: '', aiTeam: 'Bears' });
    text = await sheet();
    t('with no city an ambiguous nickname prints NO key at all',
      text.indexOf('Its key is') === -1, (text.match(/THE CLUB.*/) || [''])[0]);
    t('and says how many clubs it names, and lists some',
      /names \d+ clubs/.test(text) && /Chicago Bears\s+\(NFL\)/.test(text),
      text.split(NL).filter((l) => /names \d+ clubs|Bears\s+\(/.test(l)).slice(0, 3));
    t('and tells the model to leave the key out',
      /Leave `ladder_key` out of every row/.test(text));

    await set({ aiTeam: 'Chicago Bears' });
    t('the whole name resolves it without a city',
      /Its key is\s+chicago-il-nfl-bears/.test(await sheet()));

    await set({ aiTeam: 'Wombats' });
    text = await sheet();
    t('a club the catalogue does not hold prints no key and says why',
      text.indexOf('Its key is') === -1 && /not in our catalogue/.test(text),
      (text.match(/THE CLUB.*/) || [''])[0]);

    // ---- THE TAGS IT ASKS FOR ---------------------------------------------
    await set({ aiCity: 'New Orleans', aiTeam: 'Saints' });
    text = await sheet();
    /* THE PROMPT PRINTS TAGS, SO IT LOWERCASES AND HYPHENATES THEM. It printed
       `NFL` and `New-Orleans` at first -- capitals, in the block telling the
       model to write lowercase tags. */
    t('the tag vocabulary is hyphenated and lowercase',
      /THE CITY\s+new-orleans/.test(text) && /THE LEAGUE\s+nfl/.test(text)
        && /THE CLUB\s+saints/.test(text),
      text.split(NL).filter((l) => /THE CITY\s|THE LEAGUE\s|THE CLUB\s+[a-z]/.test(l)));
    t('and it asks for positive or negative on a club question',
      /POSITIVE or NEGATIVE/.test(text) && /ONE OF THE TWO, NOT BOTH/.test(text));

    /* WHAT THE DATABASE REALLY REFUSES, READ OFF `pg_constraint` RATHER THAN
       REMEMBERED. The first cut claimed a tag with a space is refused; there is
       NO constraint on `tags` at all, and pasted SQL never goes through this
       room's own `hyphenate`. A prompt naming a refusal the database does not
       make teaches the wrong rule. */
    t('it says nothing checks the tags, which is the true thing',
      /NOTHING CHECKS THE TAGS/.test(text)
        && !/A tag with a space or a capital in it/.test(text));
    t('and names the refusals that are real',
      /CONTAINS ITS OWN ANSWER/.test(text)
        && /opens with the words "One word"/.test(text)
        && /Fewer than two options/.test(text)
        && /DO NOT SEND `id`/.test(text));

    /* THE STANDING EDITORIAL RULES, each paid for by a row this project got
       wrong. A prompt that loses one of these is a prompt that files them. */
    t('and carries the rules this project has already paid for',
      /ANSWERED BY LOOKING/.test(text) && /A CHALLENGE IS FREE, ALWAYS/.test(text)
        && /COMBATIVE, NEVER CRUEL/.test(text) && /VERIFY OR OMIT/.test(text)
        && /NO EM DASH/.test(text));
    t('and uses no em dash itself', text.indexOf(String.fromCharCode(8212)) === -1);
    t('and hands back one SQL block with the editor link under it',
      /insert into public\.challenges/.test(text)
        && /sql\/new\?skip=true/.test(text)
        && /AN EXAMPLE OF THE SHAPE and not rows to file/.test(text));

    // ---- THE KINDS TICKED ARE THE KINDS ASKED FOR -------------------------
    const tick = (k, on) => p.evaluate((k, on) => {
      const b = el('aiType_' + k);
      if (b.checked !== on) { b.checked = on; b.dispatchEvent(new Event('change', { bubbles: true })); }
    }, k, on);
    await tick('photo', false);
    await tick('minigame', false);
    await tick('waypoint_reveal', false);
    text = await sheet();
    t('unticking a kind takes it out of the prompt',
      /^  question$/m.test(text) && !/^  photo$/m.test(text)
        && !/^  minigame$/m.test(text), text.split(NL).filter((l) => /^  \w+$/.test(l)));
    await tick('photo', true);
    t('and ticking it puts it back', /^  photo$/m.test(await sheet()));

    /* NONE TICKED IS NOT A RUN. A prompt that carefully instructs an AI to write
       nothing is a prompt somebody pastes anyway. */
    await tick('question', false);
    await tick('photo', false);
    text = await sheet();
    t('with nothing ticked the sheet says the one thing that helps',
      text.trim() === 'Tick at least one kind of challenge to continue.', text);
    /* THE DOORS REFUSE TOO, AND THE GUARD IS IN THE COPY RATHER THAN IN CSS:
       each door copies AND opens a chat window, so without it you arrive
       somewhere with one useless sentence on the clipboard. */
    popups.length = 0;
    await p.click('#aiChatgpt');
    await new Promise((r) => setTimeout(r, 400));
    t('and a door says so rather than copying',
      /Tick at least one kind/.test(await p.evaluate(() => el('aiCopyStatus').textContent)),
      await p.evaluate(() => el('aiCopyStatus').textContent));
    /* AND IT DOES NOT OPEN EITHER. The first cut stopped the copy and let the
       anchor navigate, so you landed at ChatGPT holding whatever was on the
       clipboard before -- worse than the useless sentence, because nothing says
       so. */
    t('and does not open the chat window on a refusal', popups.length === 0, popups);
    await tick('question', true);

    /* THE HAPPY PATH STILL OPENS, and that is the whole reason there is no
       blanket `preventDefault`: the tab has to come from the browser's own
       handling of a click on a link. */
    popups.length = 0;
    await p.click('#aiGrok');
    await new Promise((r) => setTimeout(r, 600));
    t('but with a kind ticked the door does open a window', popups.length > 0, popups);

    // ---- THE SHEET IS EDITABLE, AND A KNOB REBUILDS IT ---------------------
    const reset = await p.evaluate(() => {
      const sheetEl = el('aiPrompt');
      const before = el('aiReset').hidden;
      sheetEl.value = 'edited by hand';
      sheetEl.dispatchEvent(new Event('input', { bubbles: true }));
      return { hiddenAtRest: before, shownAfterEdit: !el('aiReset').hidden };
    });
    t('Reset appears only once the sheet differs from what was built',
      reset.hiddenAtRest && reset.shownAfterEdit, reset);
    t('and pressing it restores what the knobs say', await (async () => {
      await p.click('#aiReset');
      const v = await sheet();
      return v.indexOf('edited by hand') === -1 && /THE JOB: write/.test(v);
    })());

    // ---- THE DOORS --------------------------------------------------------
    const doors = await p.evaluate(() => ['aiChatgpt', 'aiGrok', 'aiClaude', 'aiInsert']
      .map((id) => { const a = el(id);
        return { id: id, tag: a.tagName, href: a.getAttribute('href'),
                 blank: a.getAttribute('target') === '_blank',
                 noopener: (a.getAttribute('rel') || '').indexOf('noopener') !== -1 }; }));
    /* REAL ANCHORS, AND THE COPY IS NOT AWAITED. The new tab has to come from
       the browser's own handling of a click on a link; awaiting the clipboard
       pushes the open into a later task, which is what a popup blocker
       refuses. */
    t('all four doors are real anchors opening a new tab safely',
      doors.every((d) => d.tag === 'A' && d.blank && d.noopener && d.href), doors);
    t('and the SQL editor link opens a BLANK query rather than the last one',
      /\/sql\/new\?skip=true$/.test(doors[3].href), doors[3].href);

    // ---- THE WAY OUT ------------------------------------------------------
    await p.keyboard.press('Escape');
    t('Escape closes it',
      !(await p.evaluate(() => el('aiDlg').classList.contains('is-open'))));
    /* THE SAME BACKDROP GESTURE GUARD AS THE EDITOR. A `click` fires on the
       NEAREST COMMON ANCESTOR of the press and the release, so selecting text
       in the sheet and letting go past the panel edge would otherwise shut the
       dialog and take the edit with it. */
    await p.click('#aiBtn');
    const box = await p.evaluate(() => {
      const r = el('aiPrompt').getBoundingClientRect();
      const d = el('aiDlg').getBoundingClientRect();
      return { x: r.x + 40, y: r.y + 20, outX: d.x + 8, outY: d.y + d.height - 8 };
    });
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.outX, box.outY, { steps: 6 });
    await p.mouse.up();
    t('a drag out of the sheet does NOT close it',
      await p.evaluate(() => el('aiDlg').classList.contains('is-open')));
    await p.mouse.click(box.outX, box.outY);
    t('but a real backdrop click does',
      !(await p.evaluate(() => el('aiDlg').classList.contains('is-open'))));

    t('nothing was written', writes.length === 0, writes);
    t('no page errors', errs.length === 0, errs);
  } finally { await br.close(); srv.close(); }
  console.log(NL + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
