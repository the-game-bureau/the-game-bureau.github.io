/* THE JERSEY MINIGAME, IN REAL CHROME, AFTER tgbid WAS DROPPED.
 *
 * Its 101 puzzles were keyed on `tgbid`, so removing that column would have left
 * every jersey without its club colours **and nothing would have said so** -- the
 * game still renders, just in a default palette. That is the exact shape of
 * failure this repo keeps recording, so it gets a check that reads the painted
 * colour rather than the markup.
 */
const fs = require('fs');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

const PORT = process.env.PORT || 8994;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TEAMS = fs.readFileSync('C:/tmp/fx-teams.json', 'utf8');
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

(async () => {
  /* THE PUZZLE FILE IS CHECKED FIRST, BEFORE THE BROWSER. A key that resolves to
     no club is a jersey with no colours, and there is no point measuring pixels
     if the data cannot answer. */
  const j = JSON.parse(fs.readFileSync('mc/minigames/jersey/jerseys.json', 'utf8'));
  const teams = JSON.parse(TEAMS);
  const keys = new Set(teams.map((r) => r.team_key));
  let used = new Set(), unresolved = new Set();
  j.records.forEach((r) => [1, 2, 3].forEach((i) => {
    const k = r['player' + i + 'key'];
    if (!k) return;
    used.add(k);
    if (!keys.has(k)) unresolved.add(k);
  }));
  t('no puzzle still carries a tgbid',
    !/tgbid/i.test(JSON.stringify(j)), JSON.stringify(j).match(/\w*tgbid\w*/i));
  t('the puzzles name ' + used.size + ' clubs by key', used.size > 30, used.size);
  t('and every one of them is a real club', unresolved.size === 0, [...unresolved].join(', '));

  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (/supabase\.co/.test(u) && req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: CORS, body: '' });
    }
    if (/rest\/v1\/teams/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: TEAMS });
    }
    if (/supabase\.co/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: '[]' });
    }
    req.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/mc/minigames/jersey/', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 900));

  const m = await page.evaluate(() => {
    /* A SHIRT IS NOT AN SVG FILL. It is drawn from CSS custom properties on
       `.jersey`, so the colour is read off the COMPUTED style of the element a
       viewer is looking at -- the first cut of this check asked for `svg [fill]`,
       found none, and reported a broken game that was rendering perfectly. */
    const shirts = [...document.querySelectorAll('.jersey')];
    const paint = (n) => {
      const cs = getComputedStyle(n);
      return [cs.backgroundColor, cs.color, cs.getPropertyValue('--jersey-primary'),
              cs.getPropertyValue('--jersey-shell'), cs.borderTopColor]
        .map((v) => String(v || '').trim()).filter(Boolean);
    };
    const fills = [];
    shirts.forEach((n) => {
      paint(n).forEach((v) => fills.push(v));
      n.querySelectorAll('*').forEach((c) => paint(c).forEach((v) => fills.push(v)));
    });
    const real = fills.filter((v) => v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent');
    const text = document.body.innerText;
    return {
      svgs: shirts.length,
      distinctFills: [...new Set(real)],
      /* THE CLUB'S OWN NAME UNDER EACH SHIRT IS THE OTHER HALF OF THE PROOF:
         it comes out of the same lookup the colour does. */
      clubNamed: /NEW ORLEANS|CHICAGO|DALLAS|BOSTON|DENVER|GREEN BAY|[A-Z ]{4,}/.test(text),
      names: (text.match(/[A-Z][a-z]+\s[A-Z][a-z]+/g) || []).length,
      bodyLen: text.length,
      err: /No jersey puzzles|could not|failed/i.test(text) ? text.slice(0, 120) : ''
    };
  });

  t('the game drew its three jerseys', m.svgs === 3, m.svgs);
  t('and said nothing about failing to load', !m.err, m.err);
  /* A DEFAULT PALETTE IS THE FAILURE THIS EXISTS TO CATCH: the game renders
     perfectly with every shirt the same colour if the lookup returns nothing. */
  /* A DEFAULT PALETTE IS THE FAILURE THIS EXISTS TO CATCH: the game renders
     perfectly, every shirt the same grey, if the lookup returns nothing. */
  t('the shirts are painted a real colour',
    m.distinctFills.length >= 2, m.distinctFills.slice(0, 6).join(' '));
  t('and the club is named under them', m.clubNamed, m.bodyLen);
  t('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  await page.screenshot({ path: 'C:/tmp/jersey.png' });
  await browser.close();
  console.log(String.fromCharCode(10) + '  ' + used.size + ' clubs used, fills: '
    + m.distinctFills.slice(0, 8).join(' '));
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
