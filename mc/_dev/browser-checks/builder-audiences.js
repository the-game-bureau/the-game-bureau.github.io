/* THE TWO BUILDERS' TEAM DROPDOWNS, AGAINST THE LIVE audiences TABLE.
 *
 * WHY THIS EXISTS. 2026090119 dropped `team_sort`, and three readers still
 * ordered by it -- so PostgREST answered 400 on the WHOLE request and every one
 * of them silently got nothing:
 *
 *   mc/assets/team-palette.js   loadTeams() rejected for BOTH engines
 *   mc/games/index.html         the Game Builder's team dropdowns
 *   mc/builder/index.html       the Flow Builder's team dropdowns
 *
 * The view had ALSO lost `first_name` and `fanbase`, which both mappings read,
 * so a repaired order alone would have produced rows the callers' own
 * `fanbase && mascot` filter discarded -- a second, quieter fault behind the
 * first.
 *
 * THE READS GO TO THE REAL DATABASE. The claim is about what PostgREST accepts,
 * so a stub would be testing the stub. Only the admin gate is faked.
 *
 * Run with a plain `python -m http.server` in the repo root, over http.
 */
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
const PORT = process.env.PORT || 8981;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const GATE = 'window.TgbMcAdminAuth={create:function(o){return{getSession:function(){return null;},'
  + 'init:function(){document.body.classList.add("mc-auth-authorized");o.onAuthorized&&o.onAuthorized();}};}};';

async function room(browser, path) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const errs = [], reads = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('dialog', async (d) => { await d.dismiss(); });
  page.on('response', (r) => {
    if (/rest\/v1\/(audiences|teams)/.test(r.url())) reads.push(r.status() + ' ' + r.url());
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/\/mc\/js\/admin-auth\.js/.test(req.url()))
      return req.respond({ contentType: 'application/javascript', body: GATE });
    req.continue();
  });
  await page.goto('http://127.0.0.1:' + PORT + path, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2500));
  return { page, errs, reads };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    /* NEITHER ROOM DRAWS A TEAM DROPDOWN, AND THE LIST IS STILL WHAT MATTERS.
       The Game Builder's AWAY/HOME TEAM pickers were deleted on 2026-08-31 and
       its `populateTeamSelects` is deliberately an empty list; the Flow Builder
       still LOOPS over two ids and **neither is in its markup** -- the same
       consts-with-no-markup state this repo already recorded for its
       `fandomGameToggle`. That is pre-existing and is not what this change was
       about.
         SO THE LIST IS ASSERTED, NOT A SELECT. `builderTeamsList` is read by
       `TgbTeamPalette` to colour a fandom game, which is its only consumer in
       either room -- and it was EMPTY. */
    const rooms = [
      ['Game Builder', '/mc/games/', []],
      ['Flow Builder', '/mc/builder/', ['nodeAwayTeamInput', 'nodeHomeTeamCityInput']]
    ];
    for (let i = 0; i < rooms.length; i += 1) {
      const name = rooms[i][0], path = rooms[i][1], selects = rooms[i][2];
      console.log('');
      console.log('  ' + name);
      const r = await room(browser, path);
      const page = r.page, errs = r.errs, reads = r.reads;

      /* THE READ ITSELF. A 400 here is the whole bug, and it is invisible on
         screen: the list is simply empty. */
      const bad4xx = reads.filter((x) => !/^2\d\d /.test(x));
      t('every audiences read is answered', bad4xx.length === 0, bad4xx.join(' | '));
      t('and it reads the audiences table, not the teams view',
        reads.some((x) => /rest\/v1\/audiences/.test(x)),
        reads.map((x) => x.split('?')[0]).join(' | ') || '(no read)');
      /* `team_sort` IS GONE. Ordering by it 400s the whole request. */
      t('and no read orders by a column that was dropped',
        !reads.some((x) => /team_sort/.test(x)),
        reads.filter((x) => /team_sort/.test(x))[0] || 'none');

      /* A BARE IDENTIFIER, NEVER `window.builderTeamsList`. It is declared with
         `let` at the top level of a classic script, which does NOT create a
         window property -- so reading it off `window` returned undefined and
         this reported an empty list on a page that had loaded 638 rows. */
      const got = await page.evaluate(() => {
        const list = typeof builderTeamsList !== 'undefined' ? builderTeamsList : [];
        const withCity = list.filter((x) => x.gameCity && String(x.gameCity).trim());
        return {
          n: list.length,
          sample: list.slice(0, 2).map((x) => [x.fanbase, x.mascot, x.shell].join('/')),
          keys: list.filter((x) => x.teamKey).length,
          colours: list.filter((x) => /^#[0-9a-fA-F]{6}$/.test(String(x.shell || ''))).length,
          cities: withCity.length,
          bears: list.filter((x) => x.teamKey === 'NFL:CHI')
            .map((x) => x.teamKey + ' ' + x.fanbase + ' ' + x.shell)[0] || ''
        };
      });
      /* THE LIST IS FILLED. It was EMPTY -- the read 400d, and the mapping read
         two columns the view no longer has, so the caller's own
         `fanbase && mascot` filter would have discarded whatever survived. */
      t('the team list is filled (' + got.n + ')', got.n > 600, got.n + ' ' + got.sample);
      t('every row carries a club key', got.keys === got.n, got.keys + ' of ' + got.n);
      /* THE COLOURS ARE THE POINT OF THE LIST: a fandom game takes its palette
         from the away club. `primary/secondary/tertiary` on the table are
         `shell/stripe/mask` here, so a mis-map is a list of blanks. */
      t('and a real six-digit colour', got.colours > 600, got.colours + ' of ' + got.n);
      /* A COLLEGE CLUB WITH NO CITY MUST STILL BE IN THE LIST. `fanbase` falls
         back to the name's own first half, or 196 rows are dropped by the
         caller's filter. */
      t('and a game city', got.cities > 600, got.cities + ' of ' + got.n);
      /* MATCHED ON THE KEY, NEVER THE MASCOT. **Twelve clubs are called the
         Bears** -- Baylor, Brown, Mercer, Morgan State and eight more -- so a
         mascot match found Baylor and reported `#154734` as the wrong colour
         for a row that is perfectly correct. */
      t('the Chicago Bears resolve with their own colour',
        /NFL:CHI/.test(got.bears) && /#0B162A/i.test(got.bears), got.bears);

      /* THE DROPDOWNS A PERSON ACTUALLY SEES, not just the array behind them.
         Named by id, never "the biggest select on the page" -- that found the
         GAMES picker and reported it as a team list. */
      /* IT LOOPS OVER TWO IDS THAT ARE NOT IN THE MARKUP. Recorded rather than
         fixed -- it is pre-existing, and the room does not draw the control at
         all. **When that markup comes back this assertion fails**, which is the
         prompt to assert the dropdown itself rather than the list behind it. */
      if (selects.length) {
        const drawn = await page.evaluate((ids) => ids.map((id) =>
          id + '=' + (document.getElementById(id) ? 'present' : 'absent')), selects);
        t('the two team selects it loops over are still absent from the markup',
          drawn.every((d) => /absent$/.test(d)), drawn.join(' '));
      }

      /* A MISSING ASSET IS NOT A SCRIPT ERROR, and this room really does 404 on
         DATA -- a guide portrait among the 372 of 395 that were already dead.
         A check that failed on those would be failing on content. */
      const real = errs.filter((e) => !/Failed to load resource/.test(e));
      t('no uncaught errors', real.length === 0, real.slice(0, 2).join(' | '));
      await page.close();
    }

    /* THE SHARED RESOLVER, WHICH BOTH ENGINES USE AT PLAY TIME. `loadTeams`
       rejected for every caller: the LEGACY fallback repeated the same order
       and threw too, so there was no path that worked. */
    console.log('');
    console.log('  team-palette.js (both engines use this)');
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + PORT + '/mc/game/run/',
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.TgbTeamPalette, { timeout: 15000 });
    const pal = await page.evaluate(async () => {
      const cfg = { url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
                    key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3' };
      try {
        const rows = await window.TgbTeamPalette.loadTeams(cfg);
        const bears = rows.filter((x) => /Bears/i.test(x.mascot || ''))[0];
        return { n: rows.length, bears: bears ? bears.team_key + ' ' + bears.shell : '' };
      } catch (e) { return { error: String(e) }; }
    });
    t('loadTeams resolves rather than throwing', !pal.error, pal.error || (pal.n + ' rows'));
    t('and the Bears keep their palette', /#0B162A/i.test(pal.bears || ''), pal.bears);
    await page.close();
  } finally {
    await browser.close();
    console.log('');
    console.log(ok + ' ok, ' + bad + ' FAIL');
    process.exit(bad ? 1 : 0);
  }
})();
