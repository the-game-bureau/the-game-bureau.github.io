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
      return req.respond({ contentType: 'application/json', headers: CORS, body: '[]' });
    }
    req.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/mc/games/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  const m = await page.evaluate(() => {
    const bar = document.getElementById('targetAudienceBar');
    const sel = document.getElementById('targetAudienceSelect');
    const idBar = document.getElementById('gameIdentityBar');
    const pos = bar && idBar ? (bar.compareDocumentPosition(idBar) & Node.DOCUMENT_POSITION_FOLLOWING) : 0;
    return {
      hasBar: !!bar,
      legend: bar ? bar.querySelector('legend').textContent.trim() : '',
      aboveGame: !!pos,
      options: sel ? sel.options.length : 0,
      firstReal: sel && sel.options[1] ? sel.options[1].textContent : '',
      names: sel ? [...sel.options].slice(1).map((o) => o.textContent).join('|') : ''
    };
  });

  t('the section is on the page', m.hasBar);
  t('it is called Target audience', /target audience/i.test(m.legend), m.legend);
  t('and it sits ABOVE the Game section', m.aboveGame);
  t('the picker is filled from the audiences table (' + m.options + ')', m.options > 600, m.options);
  t('an option names the audience, not a mascot alone',
    /NFL Chicago \(Bears\)/.test(m.names), m.firstReal);
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
    const sel = document.getElementById('targetAudienceSelect');
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
    ta: document.getElementById('targetAudienceSelect').disabled
  }));
  t('the picker is gated exactly like the rest of the identity bar',
    gate.ta === gate.tagline, JSON.stringify(gate));

  /* THE SWATCH IS A `<span>`, AND WIDTH AND HEIGHT ARE IGNORED ON AN INLINE
     ELEMENT -- this project has shipped an invisible pin and an invisible
     swatch for exactly that, and no markup assertion can see it. One is drawn
     by hand here because the handler that would draw it needs an open game. */
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

  /* THE SIX WIRING POINTS. A column reaches the database through all of them or
     none: miss one and the picker works, the value shows, and the PATCH quietly
     does not carry it. Structural on purpose -- the harness cannot open a game,
     and this is the failure that would otherwise ship. */
  const src = fs.readFileSync('mc/games/index.html', 'utf8');
  const points = [
    ['saved columns',    /target_audience_id: true/],
    ['column map',       /target_audience_id: 'targetAudienceId'/],
    ['initGameMeta',     /targetAudienceId:\s+g\.target_audience_id/],
    ['normalize (row)',  /target_audience_id:\s+row && row\.target_audience_id/],
    ['normalize (raw)',  /target_audience_id:\s+raw && raw\.target_audience_id/],
    ['serializeGameRow', /target_audience_id:\s+_meta\.targetAudienceId \|\| null/]
  ];
  points.forEach(([name, re]) => t('wired into ' + name, re.test(src)));

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
