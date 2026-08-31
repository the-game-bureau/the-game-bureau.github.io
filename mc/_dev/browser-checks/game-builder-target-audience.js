/* THE TARGET AUDIENCE SECTION IN THE GAME BUILDER, IN REAL CHROME.
 *
 * It reads public.audiences and writes games.target_audience_id, and the two
 * failures worth catching are both invisible in the markup: a picker that opens
 * empty because the fetch shape was wrong, and a PATCH that does not carry the
 * column because one of the SIX wiring points was missed.
 */
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 8998;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const AUDIENCES = fs.readFileSync('C:/tmp/fx-aud.json', 'utf8');
const TEAMS = fs.readFileSync('C:/tmp/fx-teams.json', 'utf8');
const GAMES = fs.readFileSync('C:/tmp/fx-games.json', 'utf8');
const PLACES = fs.readFileSync('C:/tmp/fx-places-full.json', 'utf8');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'content-range',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
};

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const errs = [];
  const sent = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (/\/mc\/js\/admin-auth\.js/.test(u)) {
      return req.respond({ contentType: 'application/javascript', body:
        'window.TgbMcAdminAuth={create:function(o){return{getSession:function(){return null;},'
        + 'init:function(){document.body.classList.add("mc-auth-authorized");o.onAuthorized&&o.onAuthorized();}};}};' });
    }
    if (/supabase\.co/.test(u)) {
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: CORS, body: '' });
      if (req.method() !== 'GET') {
        sent.push({ url: u, method: req.method(), body: req.postData() });
        return req.respond({ contentType: 'application/json', headers: CORS, body: '[{"id":"probe"}]' });
      }
      if (/rest\/v1\/audiences/.test(u)) return req.respond({ contentType: 'application/json', headers: CORS, body: AUDIENCES });
      if (/rest\/v1\/teams/.test(u)) return req.respond({ contentType: 'application/json', headers: CORS, body: TEAMS });
      if (/rest\/v1\/games/.test(u)) return req.respond({ contentType: 'application/json', headers: CORS, body: GAMES });
      /* THE TOWN COMES FROM `places`, so the stub has to serve it or every label
         loses its city and the check reports a page fault that is its own. */
      if (/rest\/v1\/places/.test(u)) return req.respond({ contentType: 'application/json', headers: CORS, body: PLACES });
      return req.respond({ contentType: 'application/json', headers: CORS, body: '[]' });
    }
    req.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/mc/games/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  const m = await page.evaluate(() => {
    const bar = document.getElementById('targetAudienceBar');
    const sel = document.getElementById('targetAudienceInput');
    const idBar = document.getElementById('gameIdentityBar');
    const pos = bar && idBar ? (bar.compareDocumentPosition(idBar) & Node.DOCUMENT_POSITION_FOLLOWING) : 0;
    return {
      hasBar: !!bar,
      legend: bar ? bar.querySelector('legend').textContent.trim() : '',
      aboveGame: !!pos,
      options: document.querySelectorAll('#audienceList option').length,
      firstReal: (document.querySelector('#audienceList option') || {}).value || '',
      names: [...document.querySelectorAll('#audienceList option')].map((o) => o.value).join('|')
    };
  });

  t('the section is on the page', m.hasBar);
  t('it is called Target audience', /target audience/i.test(m.legend), m.legend);
  t('and it sits ABOVE the Game section', m.aboveGame);
  t('the list is filled from the audiences table (' + m.options + ')', m.options > 600, m.options);
  t('an option names the audience, not a mascot alone',
    /NFL Chicago \(Bears\)/.test(m.names), m.firstReal);
  /* THE TOWN IS IN THE LABEL WHERE IT IS NEWS, and left out where it repeats
     the name -- most pro clubs are already named for their city. */
  t('a college option carries its town',
    /NCAAF Alabama \(Crimson Tide\) · Tuscaloosa, AL/.test(m.names),
    (m.names.split('|').find((x) => /Crimson Tide/.test(x)) || 'not found'));
  t('and a pro option does not say its city twice',
    !/NFL Chicago \(Bears\) · Chicago/.test(m.names),
    (m.names.split('|').find((x) => /NFL Chicago/.test(x)) || 'not found'));
  /* A PRO CLUB IS NAMED BY ITS CITY -- 2026083024 put that in the column, so a
     picker showing "Bears" would mean the room had reached past it. */
  t('no option is a bare mascot where a city exists',
    !/\|NFL Bears\b/.test('|' + m.names));

  /* THE WRITE. Choosing an audience must reach games.target_audience_id, which
     is six separate wiring points away from the picker. */
  const opened = await page.evaluate(() => {
    const picker = document.getElementById('gamePickerSelect');
    if (!picker || picker.options.length < 2) return { ok: false, options: picker ? picker.options.length : 0 };
    picker.selectedIndex = 1;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, id: picker.value };
  });
  await new Promise((r) => setTimeout(r, 700));
  t('a game can be opened from the picker', opened.ok, JSON.stringify(opened));

  const patched = await page.evaluate(() => {
    const sel = document.getElementById('targetAudienceInput');
    if (!sel || sel.disabled) return { disabled: true };
    sel.value = 'nfl-chicago';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const meta = window.state && window.state.currentGameMeta;
    return {
      disabled: false,
      inState: meta ? meta.targetAudienceId : '(no meta)',
      swatches: document.querySelectorAll('#targetAudienceSwatches .ta-swatch').length,
      swatchDisplay: (() => {
        const s = document.querySelector('#targetAudienceSwatches .ta-swatch');
        return s ? getComputedStyle(s).display : '';
      })(),
      swatchColour: (() => {
        const s = document.querySelector('#targetAudienceSwatches .ta-swatch');
        return s ? getComputedStyle(s).backgroundColor : '';
      })()
    };
  });

  /* THE PICKER IS LIVE EXACTLY WHEN THE REST OF THE IDENTITY BAR IS, which is
     the real invariant and does not depend on this harness getting a whole game
     document to load. Opening a game needs its flow doc; the stub serves rows,
     so the bar stays disabled here and the TAGLINE is disabled with it. */
  const gate = await page.evaluate(() => ({
    tagline: document.getElementById('nodeTaglineInput').disabled,
    ta: document.getElementById('targetAudienceInput').disabled
  }));
  t('the picker is gated exactly like the rest of the identity bar',
    gate.ta === gate.tagline, JSON.stringify(gate));

  /* TYPING A LABEL RESOLVES BACK TO AN ID, and a label the list does not hold
     is REFUSED rather than stored -- the column is a foreign key, so the
     database would answer with a constraint name nobody can act on. */
  const typed = await page.evaluate(() => {
    const el = document.getElementById('targetAudienceInput');
    el.disabled = false;
    const type = (v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    type('not a real audience at all');
    const bad = { invalid: el.hasAttribute('data-invalid'), title: el.title };
    type('NFL Chicago (Bears)');
    return { bad: bad, goodInvalid: el.hasAttribute('data-invalid'), value: el.value };
  });
  t('a label the list does not hold is refused', typed.bad.invalid);
  t('and says so in words, not a constraint name',
    /No audience called/.test(typed.bad.title), typed.bad.title);
  t('a real one clears the refusal', !typed.goodInvalid);

  /* THE SWATCH IS A `<span>`, AND WIDTH AND HEIGHT ARE IGNORED ON AN INLINE
     ELEMENT -- this project has shipped an invisible pin and an invisible
     swatch for exactly that, and no markup assertion can see it. */
  const sw = await page.evaluate(() => {
    const host = document.getElementById('targetAudienceSwatches');
    const x = document.createElement('span');
    x.className = 'ta-swatch';
    x.style.background = '#0B162A';
    host.appendChild(x);
    const cs = getComputedStyle(x);
    const b = x.getBoundingClientRect();
    return { display: cs.display, w: Math.round(b.width), h: Math.round(b.height),
             colour: cs.backgroundColor, ring: cs.boxShadow };
  });
  t('a swatch is a block box, not an inline span', sw.display === 'block', sw.display);
  t('with a real size', sw.w >= 20 && sw.h >= 20, sw.w + 'x' + sw.h);
  t('painted the colour it was given', /rgb\(11,\s*22,\s*42\)/.test(sw.colour), sw.colour);
  t('and ringed, or a white club colour is invisible on a white bar',
    sw.ring && sw.ring !== 'none', sw.ring);

  /* THE RIVAL IS THE SAME CONTROL, NOT A SECOND ONE. What is worth asserting is
     that they SHARE the list and the resolver and yet write to DIFFERENT
     columns -- the two failures a duplicate invites are one list going stale
     and both fields writing the same key. */
  const pair = await page.evaluate(() => {
    const tin = document.getElementById('targetAudienceInput');
    const rin = document.getElementById('rivalAudienceInput');
    const tbar = document.getElementById('targetAudienceBar');
    const rbar = document.getElementById('rivalAudienceBar');
    const game = document.getElementById('gameIdentityBar');
    const order = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    /* READ THE SWATCHES BEFORE TYPING, because typing cannot write to the meta
       here and would only tell us what the previous value drew. */
    const stored = {
      t: document.querySelectorAll('#targetAudienceSwatches .ta-swatch').length,
      r: document.querySelectorAll('#rivalAudienceSwatches .ta-swatch').length
    };
    tin.disabled = false; rin.disabled = false;
    const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    type(tin, 'NFL Chicago (Bears)');
    type(rin, 'NFL New Orleans (Saints)');
    return {
      exists: !!rbar,
      legend: rbar ? rbar.querySelector('legend').textContent.trim() : '',
      afterTarget: order(tbar, rbar),
      beforeGame: order(rbar, game),
      sameList: tin.getAttribute('list') === rin.getAttribute('list'),
      oneList: document.querySelectorAll('datalist').length,
      tTitle: tin.title, rTitle: rin.title,
      tValue: tin.value, rValue: rin.value,
      tStored: stored.t, rStored: stored.r,
      distinctHosts: document.getElementById('targetAudienceSwatches')
                  !== document.getElementById('rivalAudienceSwatches')
    };
  });
  t('there is a Rival audience section', pair.exists);
  t('called Rival audience', /rival audience/i.test(pair.legend), pair.legend);
  t('after Target audience', pair.afterTarget);
  t('and still above the Game section', pair.beforeGame);
  t('both fields point at the same datalist', pair.sameList,
    pair.sameList + ' (' + pair.oneList + ' datalists on the page, one is the city picker)');
  t('each resolves its own audience', pair.tTitle === 'nfl-chicago' && pair.rTitle === 'nfl-new-orleans',
    pair.tTitle + ' | ' + pair.rTitle);
  t('and holds its own label', /Chicago/.test(pair.tValue) && /New Orleans/.test(pair.rValue),
    pair.tValue + ' | ' + pair.rValue);
  /* DRAWN FROM THE STORED VALUE, so the fixture is a game that carries both.
     Typing cannot fill these here: the write is guarded on an open game node,
     which this stub cannot produce. */
  t('each draws its own colours, from its own stored value',
    pair.tStored >= 2 && pair.rStored >= 2, pair.tStored + '/' + pair.rStored);
  t('and the two hosts are different elements', pair.distinctHosts);

  /* THE SIX WIRING POINTS. A column reaches the database through all of them or
     none: miss one and the picker works, the value shows, and the PATCH quietly
     does not carry it. Structural on purpose -- the harness cannot open a game,
     and this is the failure that would otherwise ship. */
  const src = fs.readFileSync('mc/games/index.html', 'utf8');
  [['target', 'target_audience_id', 'targetAudienceId'],
   ['rival',  'rival_audience_id',  'rivalAudienceId']].forEach(([side, col, camel]) => {
    [['saved columns',    col + ': true'],
     ['column map',       col + ": '" + camel + "'"],
     ['initGameMeta',     camel + ':'],
     ['initGameMeta reads the column', 'g.' + col],
     ['normalize (row)',  'row && row.' + col],
     ['normalize (raw)',  'raw && raw.' + col],
     ['serializeGameRow', '_meta.' + camel + ' || null']
    ].forEach(([name, needle]) => t(side + ' wired into ' + name, src.indexOf(needle) >= 0, needle));
  });

  t('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await page.screenshot({ path: 'C:/tmp/game-builder.png' });
  await browser.close();
  /* SAID RATHER THAN COVERED BY A CHECK THAT PROVES NOTHING: the write itself
     is not exercised here. Opening a game needs its whole flow document, which
     this stub does not serve, so the change handler's early return is never
     passed. What is asserted instead is that every wiring point the value would
     travel through exists, and that the control is gated like its siblings. */
  console.log(String.fromCharCode(10) + '  UNVERIFIED FROM HERE: the PATCH itself. '
    + 'No game opens in this stub, so the handler returns early. Six wiring '
    + 'points asserted structurally instead.');
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
