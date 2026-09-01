/* THE CHALLENGE BANK: the name, and the count in the blurb.
   Rendered in real Chrome, because the count is painted and a static read of
   the markup would only ever see the `?` it ships with. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.ico': 'image/x-icon' };

const CH = [];
for (let i = 1; i <= 7; i++) {
  CH.push({ id: i, name: 'Challenge ' + i, kind: 'question', scope: 'portable',
            prompt: 'What is the thing?', answer: 'Yes', choices: null,
            ladder_key: null, scope_team: null, scope_city: null, scope_wpid: null,
            tags: null, created_at: '2026-01-01' });
}

/* LOADED, NOT GREPPED. A source scan for the sentence would match the comment
   explaining a change as readily as the card itself -- which this project has
   recorded three times. Running the module answers what a reader would see. */
function navGroups() {
  const src = fs.readFileSync('C:/Code/the-game-bureau/mc/js/admin-nav-menu.js', 'utf8');
  const g = { document: undefined };
  new Function('window', src)(g);
  return g.TgbMcAdminNav.getGroups();
}
function navDescription() {
  let d = '';
  navGroups().forEach((grp) => (grp.items || []).forEach((it) => {
    if (it.href === '/mc/challenges/') d = it.description || '';
  }));
  return d;
}
function navHrefs() {
  const out = [];
  navGroups().forEach((grp) => (grp.items || []).forEach((it) => out.push(it.href)));
  return out;
}

let ok = 0, fail = 0;
const t = (what, pass, got) => {
  if (pass) { ok++; console.log('  ok  ' + what); }
  else { fail++; console.log('  FAIL ' + what + (got === undefined ? '' : '   got: ' + got)); }
};

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
  await new Promise((r) => server.listen(8804, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const errs = [];
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
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
      const send = (b) => req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' },
        body: JSON.stringify(b) });
      if (req.method() === 'OPTIONS') { send([]); return; }
      if (u.indexOf('/challenges?') !== -1) { send(CH); return; }
      send([]);
    });

    await p.goto('http://127.0.0.1:8804/mc/challenges/', { waitUntil: 'networkidle0' });
    await p.evaluate(async () => {
      document.body.classList.add('mc-auth-authorized');
      if (window.__authed) await window.__authed();
    });
    await new Promise((r) => setTimeout(r, 700));

    const out = await p.evaluate(() => ({
      title: document.getElementById('roomTitle').textContent.trim(),
      pageTitle: document.title,
      blurb: (document.querySelector('.room-blurb') || {}).textContent.trim(),
      count: (document.getElementById('blurbCount') || {}).textContent
    }));

    /* THE TITLE IS THE ROOM NAME AND CARRIES NO COUNT. The count-in-the-title
       convention leads with the room OWN NOUN, and it only works while the name
       IS that noun: `24 CHALLENGES` reads and `24 CHALLENGE BANK` does not. */
    t('the title is the room name', out.title === 'CHALLENGE BANK', out.title);
    t('and carries no count', !/[0-9?]/.test(out.title), out.title);
    t('the tab says so too', out.pageTitle.indexOf('CHALLENGE BANK') === 0, out.pageTitle);

    /* AND THE COUNT LEADS THE BLURB, the way the Waypoint Library keeps its own. */
    t('the count leads the blurb', out.count === String(CH.length), out.count);
    t('and the blurb is the room own sentence',
      out.blurb === CH.length + ' Challenges. A Challenge is what a team does when they'
        + ' get there, and Waypoint + Challenge = Game Stop. Trivia lives here too,'
        + ' keyed to a fandom or a city rather than to a scope.', out.blurb);

    /* THE SECOND SENTENCE ARRIVED WITH THE TRIVIA ROWS on 2026-08-31, and it is
       not decoration: without it the count simply jumps from 23 to 62 with
       nothing on screen saying what the other 39 rows are. */
    t('and it says trivia lives here', out.blurb.indexOf('Trivia lives here too') !== -1);

    /* AND THE DOOR SAYS THE SAME, in the room's own words. A card describing a
       room in words the room no longer uses drifts on the first read, and this
       one is the reason the Waypoint Library's card was found stale.
         THE MODULE IS LOADED HERE RATHER THAN IN THE PAGE, because the room
       carries `admin-site-nav.js` -- the bar -- and not `admin-nav-menu.js`,
       which is the directory. Reading it from inside the page finds nothing
       and reports an empty string, which reads as a stale card. */
    t('and the nav card says it too', navDescription().indexOf('Trivia lives here too') !== -1,
      navDescription());

    /* AND THE TRIVIA ROOM'S OWN DOOR IS GONE. A stale href 404s in silence,
       which this project has already paid for with a deleted trigger id. */
    t('and no door is left pointing at the deleted trivia room',
      !navHrefs().some((h) => h.indexOf('/mc/trivia') === 0), navHrefs().join(','));

    t('and no console errors', errs.length === 0, errs.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
})();
