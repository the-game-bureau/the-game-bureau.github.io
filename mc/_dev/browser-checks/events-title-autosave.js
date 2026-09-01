/* THE ANCHOR EVENT TITLE SAVES ITSELF WHEN IT LOSES FOCUS.
   ---------------------------------------------------------------------------
   IT IS THE ONE FIELD ON A CLOSED ROW, and a closed row has no Save button --
   the body is not built until it is opened. So a title typed in the list could
   only be committed from the floating SAVE ALL in the corner, which is a long
   way from what you just typed: it read as an edit that would not save.

   WHAT THIS DRIVES IS THE REAL PAGE IN CHROME, because the claim is about focus:
   what a `blur` does, whether the element survives it, and whether the list
   rebuilds underneath. jsdom has no layout and no real focus model. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml',
                '.png': 'image/png', '.ico': 'image/x-icon' };

const mk = (id, title) => ({
  id: id, kind: 'concert', title: title, league: null, sport: null,
  start_date: '2027-05-01', end_date: '2027-05-01', start_time: '19:00:00',
  home_team_geo: null, home_team_nickname: null,
  away_team_geo: null, away_team_nickname: null,
  venue: 'Superdome', venue_city: 'New Orleans, Louisiana',
  neutral_site: false, home_team_score: null, away_team_score: null,
  url: null, source: 'SeatGeek', description: null, status: 'scheduled',
  issues: 'NO', issues_detail: null
});
const ROWS = [mk('CON-1', 'Old Title'), mk('CON-2', 'Second Event')];

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

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
  await new Promise((r) => server.listen(8820, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const sent = [];
  let refuse = false;
  const errs = [];
  try {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 1000 });
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
      if (req.method() !== 'GET') sent.push({ method: req.method(), url: u, body: req.postData() });
      let body = [];
      if (u.indexOf('/events') !== -1 && req.method() === 'GET') body = ROWS;
      else if (req.method() === 'PATCH') {
        /* POSTGREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES, which is
           the refusal this page has to translate rather than report as a save. */
        body = refuse ? [] : [Object.assign({}, ROWS[0], JSON.parse(req.postData() || '{}'))];
      }
      req.respond({ status: 200, contentType: 'application/json',
        headers: Object.assign({ 'content-range': '0-1/2' }, cors),
        body: JSON.stringify(body) });
    });

    await p.goto('http://127.0.0.1:8820/mc/events/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 900));

    const titleSel = '.event-row [data-field="title"]';
    const type = async (text) => {
      await p.click(titleSel);
      await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control');
      await p.keyboard.press('Backspace');
      await p.type(titleSel, text, { delay: 15 });
    };

    /* ---- 1. A TITLE TYPED ON A CLOSED ROW SAVES WHEN FOCUS LEAVES -------- */
    sent.length = 0;
    await type('Typed On A Closed Row');
    t('typing marks the row unsaved',
      await p.evaluate(() => !!document.querySelector('.event-row.is-dirty')));
    t('and nothing has been sent yet', sent.length === 0, sent.length);

    /* TABBING AWAY IS THE GESTURE, not a synthetic event: the claim is about
       what real focus loss does. */
    await p.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 500));

    t('losing focus sends one PATCH', sent.length === 1, sent.length);
    const body1 = sent.length ? JSON.parse(sent[0].body) : {};
    t('for that row', sent.length && sent[0].url.indexOf('id=eq.CON-1') !== -1,
      sent.length && sent[0].url.slice(sent[0].url.indexOf('/events')));
    t('carrying the new title', body1.title === 'Typed On A Closed Row', body1.title);
    /* A CLOSED ROW HAS ONLY THE HEADER IN THE DOM, so `readForm` finds only the
       title -- which is right: it patches what is on screen and nothing else. */
    t('and only the title, since a closed row has no other field on screen',
      Object.keys(body1).join(',') === 'title', Object.keys(body1).join(','));
    t('the unsaved mark is cleared',
      !(await p.evaluate(() => !!document.querySelector('.event-row.is-dirty'))));

    /* ---- 2. IT DOES NOT REDRAW THE LIST --------------------------------- */
    /* A render rebuilds every row from the stored values, so it would tear out
       whatever the keyboard has just moved to. The saved row is stamped and the
       stamp has to survive. */
    await p.evaluate(() => {
      const r = document.querySelector('.event-row');
      if (r) r.dataset.stamp = 'survivor';
    });
    await type('Second Edit');
    await p.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 500));
    t('and the row element survives, so focus is not thrown away',
      await p.evaluate(() => {
        const r = document.querySelector('.event-row');
        return !!r && r.dataset.stamp === 'survivor';
      }));

    /* ---- 3. AN UNTOUCHED TITLE SENDS NOTHING ---------------------------- */
    sent.length = 0;
    await p.click(titleSel);
    await p.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 400));
    t('tabbing through a title nobody changed sends nothing',
      sent.length === 0, sent.length);

    /* ---- 4. PRESSING SAVE DOES NOT SAVE TWICE --------------------------- */
    /* Clicking Save blurs the title first, so without a guard the row goes
       twice: once from the blur and once from the click. */
    sent.length = 0;
    await p.evaluate(() => {
      const c = document.querySelector('.event-caret');
      if (c) c.click();
    });
    await new Promise((r) => setTimeout(r, 300));
    await type('Saved By The Button');
    await p.evaluate(() => {
      const b = [...document.querySelectorAll('.event-row .btn')]
        .find((x) => x.textContent.trim() === 'Save');
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 700));
    t('blurring onto Save sends one PATCH, not two', sent.length === 1, sent.length);

    /* ---- 5. A REFUSAL SPEAKS -------------------------------------------- */
    /* `quiet` silences the failure as well as the redraw, which is why the
       autosave needed a flag of its own: a write that fails without saying so
       is a bug in itself. */
    refuse = true;
    sent.length = 0;
    await type('This One Is Refused');
    await p.keyboard.press('Tab');
    await new Promise((r) => setTimeout(r, 600));
    const said = await p.evaluate(() => {
      const n = document.querySelector('.room-scribble');
      return n ? n.textContent.trim() : '';
    });
    t('a refused autosave says so', /refused/i.test(said), said);
    t('and the row is still marked unsaved, so the words are not lost',
      await p.evaluate(() => !!document.querySelector('.event-row.is-dirty')));
    t('and what was typed is still in the box',
      await p.evaluate(() =>
        document.querySelector('.event-row [data-field="title"]').value)
        === 'This One Is Refused');

    t('and no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
})();
