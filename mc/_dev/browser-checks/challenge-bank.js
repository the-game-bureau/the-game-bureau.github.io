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
/* SEVERAL TYPES, BECAUSE THE REAL TABLE HAS THEM. A fixture of one type draws
   one badge width, and the column assertion below would then be comparing a
   single cell with itself -- passing on a page whose type column is ragged.
   MULTIPLE CHOICE is the widest value and has to be among them. Row 0 keeps
   `type_answer`, which the badge-class assertion reads by position. */
const FIX_TYPES = ['type_answer', 'multiple_choice', 'minigame', 'photo',
                   'operations', 'waypoint_reveal', 'multiple_choice'];
for (let i = 1; i <= 7; i++) {
  CH.push({ id: i, name: 'Challenge ' + i, type: FIX_TYPES[i - 1], scope: 'portable',
            /* A LONG PROMPT, BECAUSE THE REAL ONES ARE. A short one makes
               `.ch-line`'s max-content small enough to fit beside the tick even
               with a `flex: 1 1 auto` basis -- so the geometry assertions below
               would pass on the very bug they are for. */
            /* LONG **AND DISTINCT**. Long because the real ones are, and a
               short prompt makes `.ch-line`'s max-content small enough to fit
               beside the tick even on the old `flex: 1 1 auto` -- so the
               geometry assertions would pass on the very bug they are for.
               DISTINCT because the duplicate check reports two rows that ask
               the same question, and seven rows sharing one prompt is six
               duplicates: a fixture the real table cannot hold. */
            prompt: 'Name ' + i + ' players between you. One point each, and a'
              + ' name somebody has clearly invented costs you a point instead.',
            answer: 'Yes', choices: null,
            ladder_key: null, scope_team: null, scope_city: null, scope_wpid: null,
            /* REAL ROWS CARRY TAGS, and the tags are their own line now -- an
               untagged fixture has no third row for the layout assertion to
               measure and would pass over it. */
            tags: ['sports', 'chicago'], created_at: '2026-01-01' });
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
  else {
    fail++;
    const g = got === undefined ? ''
      : '   got: ' + (typeof got === 'object' && got !== null ? JSON.stringify(got) : got);
    console.log('  FAIL ' + what + g);
  }
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
      count: (document.getElementById('blurbCount') || {}).textContent,
      /* THE STRIPE, AND THE TWO STATES IT MUST LOSE TO. Read from the rows
         themselves, and the hover from a class the sheet cannot fake -- so the
         `:hover` rule is applied by hand to a clone rather than asserted from
         its declaration, which would say nothing about which rule wins. */
      stripe: (function () {
        const rows = [...document.querySelectorAll('#list > .ch')];
        if (rows.length < 2) return null;
        const bg = (e) => getComputedStyle(e).backgroundColor;
        return { odd: bg(rows[0]), even: bg(rows[1]),
                 rowsAreFirst: [...document.querySelectorAll('#list > *')][0] === rows[0],
                 footIsNotStriped: (function () {
                   const f = document.querySelector('.ch-more');
                   return !f || !f.classList.contains('ch');
                 })() };
      })(),
      /* THE TICK SITS BESIDE THE TITLE. Layout, so nothing static can see it,
         and the numbers are what the claim is: same line, tick to the left. */
      row: (function () {
        const r = document.querySelector('.ch');
        if (!r) return null;
        const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), h: Math.round(b.height) }; };
        return {
          cells: [...r.children].map((e) => e.className),
          kindCell: box(r.querySelector('.ch-kindcell')),
          anyTick: !!document.querySelector('#list input[type="checkbox"]'),
          name: box(r.querySelector('.ch-name')),
          prompt: box(r.querySelector('.ch-prompt')),
          tags: box(r.querySelector('.ch-tags')),
          lineFlex: getComputedStyle(r.querySelector('.ch-line')).flexBasis,
          kindClass: r.querySelector('.ch-kind').className,
          kindInk: getComputedStyle(r.querySelector('.ch-kind')).color,
          kindBg: getComputedStyle(r.querySelector('.ch-kind')).backgroundColor,
          /* EVERY TYPE'S HUE, read by putting the class on a throwaway badge --
             the fixture is one type, and asserting the palette needs all six. */
          /* WHAT AN UNNAMED TYPE DRAWS, so "not the fallback" is measured
             against the fallback rather than against a colour I typed here. */
          fallbackInk: (function () {
            const b = document.createElement('span');
            b.className = 'ch-kind';
            r.appendChild(b);
            const c = getComputedStyle(b).color;
            b.remove();
            return c;
          })(),
          /* THE LIST COMES FROM THE PAGE'S OWN `KIND_VALUES`, never from a copy
             here. A second list of the types is exactly what rots: `freeform`
             was renamed this morning and the room's copy stayed behind, so the
             picker offered a value the CHECK refuses. Derived, this cannot miss
             a type the room offers. */
          palette: (function () {
            const out = {};
            (typeof KIND_VALUES !== 'undefined' ? KIND_VALUES : [])
              .forEach((k) => {
                const b = document.createElement('span');
                b.className = 'ch-kind is-known is-' + k;
                r.appendChild(b);
                out[k] = getComputedStyle(b).color;
                b.remove();
              });
            return out;
          })()
        };
      })()
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
        + ' get to a Waypoint.', out.blurb);

    /* THE TICK IS ON THE TITLE'S OWN LINE. `.ch-line` carried `flex: 1 1 auto`,
       and **an `auto` basis is the item's own MAX-CONTENT** -- which `.ch-prompt`
       makes enormous by asking for 100% -- so a WRAPPING container placed it on
       a line of its own BEFORE any shrinking, pushing the tick above the title.
       `flex: 1 1 0` always fits beside the tick and then grows. */
    /* THE ROW IS TWO CELLS: the type, then everything else. THE TICK AND ITS
       CELL WENT WITH THE BATCH BAR (2026-09-03) -- there is nothing to select,
       so a row is opened by clicking it and that is the only thing a click on
       one does. */
    t('the row is a type cell and the line',
      out.row && out.row.cells.join(',') === 'ch-kindcell,ch-line',
      out.row && out.row.cells);
    t('and there is no tick anywhere in the list',
      out.row && !out.row.anyTick, out.row && out.row.anyTick);
    /* BOTH ON ONE FLEX LINE -- which is what `flex: 1 1 0` on the line buys.
       With `auto` its basis is its own max-content and a wrapping container
       puts it on a row of its own. */
    t('and both start at the same y, so neither has wrapped',
      out.row && out.row.kindCell.y === out.row.name.y,
      out.row && { type: out.row.kindCell.y, name: out.row.name.y });
    t('with the type to the LEFT of the name',
      out.row && out.row.kindCell.x < out.row.name.x,
      out.row && { type: out.row.kindCell.x, name: out.row.name.x });
    /* THE PROMPT STILL GETS ITS OWN LINE UNDER BOTH, which is what `flex: 1 0
       100%` inside the line is for -- fixing the wrap must not flatten it. */
    /* THREE LINES INSIDE THE CELL: name, prompt, tags -- in that order and each
       on its own. The tags sat on the TITLE's line and pushed the name about as
       a row gained or lost one. */
    t('the prompt is on its own line below the name',
      out.row && out.row.prompt && out.row.prompt.y > out.row.name.y,
      out.row && out.row.prompt && { name: out.row.name.y, prompt: out.row.prompt.y });
    t('and the tags are a third line below the prompt',
      out.row && out.row.tags && out.row.tags.y > out.row.prompt.y,
      out.row && { prompt: out.row.prompt && out.row.prompt.y,
                   tags: out.row.tags && out.row.tags.y });
    /* THE TYPE CELL IS A COLUMN OR IT IS NOTHING, and it was not one until
       today: `flex: 0 0 92px` is a BASIS rather than a cap, because a flex
       item's automatic minimum size is its content -- so the `nowrap` MULTIPLE
       CHOICE badge grew its own cell to 109px and pushed the name right on
       every row carrying it. **The claim is that all the cells share one
       width**, which only a measurement can answer; the rule read as correct
       the whole time. */
    const cells = await p.evaluate(() => {
      const out = {};
      document.querySelectorAll('#list > .ch').forEach((row) => {
        const b = row.querySelector('.ch-kind'), c = row.querySelector('.ch-kindcell');
        if (!b || !c) return;
        out[b.textContent] = { cell: Math.round(c.getBoundingClientRect().width),
                               badge: Math.ceil(b.getBoundingClientRect().width),
                               nameX: Math.round(row.querySelector('.ch-name')
                                        .getBoundingClientRect().x) };
      });
      return out;
    });
    const widths = Object.keys(cells).map((k) => cells[k].cell);
    t('every type cell is the same width, so the badges are a column',
      widths.length > 1 && new Set(widths).size === 1, cells);
    t('and every name starts at the same x',
      new Set(Object.keys(cells).map((k) => cells[k].nameX)).size === 1, cells);
    t('and no badge overflows its cell',
      Object.keys(cells).every((k) => cells[k].badge <= cells[k].cell), cells);

    /* THE BADGE IS COLOUR CODED, and the class is the value so an unnamed type
       keeps the quiet fallback rather than losing its badge. */
    t('the type badge carries its own type as a class',
      out.row && out.row.kindClass.split(' ').indexOf('is-known') !== -1
      && out.row.kindClass.split(' ').indexOf('is-type_answer') !== -1,
      out.row && out.row.kindClass);
    t('and is drawn in its own hue, not the muted fallback',
      out.row && out.row.kindInk !== out.row.fallbackInk
      && out.row.kindBg !== 'rgba(0, 0, 0, 0)',
      out.row && { ink: out.row.kindInk, fallback: out.row.fallbackInk, bg: out.row.kindBg });
    /* ALL SIX ARE DISTINCT. A palette where two types share a colour is a
       legend to learn rather than a column to scan. */
    t('all six types have a colour and no two share one',
      out.row && (function () {
        const v = Object.values(out.row.palette);
        return v.length === 6 && v.every(Boolean) && new Set(v).size === 6;
      })(), out.row && out.row.palette);

    /* THE LIST PANEL HAS NO HEAD (2026-09-03). Asserted because the removal
       took `#listCount` with it, and **a surviving write to a deleted id
       throws, which takes the auth callback down and blanks the room** -- the
       failure at the top of CLAUDE.md, met twice in one session.
         The room still renders and the rows are still there, which is what the
       assertions below and around this one measure; this one says the head is
       actually gone rather than merely emptied. */
    t('the list panel has no head',
      await p.evaluate(() => !document.querySelector('.panel-head')
                          && !document.getElementById('listCount')));

    /* EVERY OTHER ROW IS SHADED. Both halves: the even one is tinted AND the
       odd one is not -- a rule that painted every row would pass either alone. */
    t('every other row is shaded',
      out.stripe && out.stripe.even !== out.stripe.odd, out.stripe);
    t('and the unshaded one is left alone',
      out.stripe && out.stripe.odd === 'rgba(0, 0, 0, 0)', out.stripe && out.stripe.odd);
    /* THE ROWS ARE THE FIRST CHILDREN, which is what makes `nth-child` count
       rows rather than something else, and the foot is not one of them. */
    t('the stripe counts rows, not the foot', out.stripe && out.stripe.rowsAreFirst
      && out.stripe.footIsNotStriped, out.stripe);

    /* A ROW IN REVIEW KEEPS ITS RED TINT EVEN WHEN IT IS AN EVEN ROW. Testable
       directly, because `.is-review` is a class -- so this reads what actually
       wins rather than what the sheet declares. */
    const review = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#list > .ch')];
      /* AN EVEN ROW THAT IS NOT ALREADY IN REVIEW. Adding the class to one that
         already has it changes nothing, and the assertion would then compare
         the red pen with itself and fail on a page that is perfectly correct.
         That is exactly what a fixture of seven identical prompts produced. */
      const even = rows.filter((r, i) => i % 2 === 1 && !r.classList.contains('is-review'))[0]
                   || rows[1];
      const plain = getComputedStyle(even).backgroundColor;
      even.classList.add('is-review');
      const tinted = getComputedStyle(even).backgroundColor;
      even.classList.remove('is-review');
      return { plain: plain, tinted: tinted };
    });
    t('a row in review beats the stripe', review.tinted !== review.plain, review);
    /* AND IT IS RED, not a darker blue -- the point being that the SIGNAL wins
       rather than merely that something changed. */
    t('and stays red rather than going blue',
      /^rgba?\(19[0-9]/.test(review.tinted), review.tinted);

    /* HOVER CANNOT BE FORCED FROM SCRIPT, so its precedence is asserted where
       it is actually decided: **all three selectors are (0,2,0)**, so SOURCE
       ORDER is the whole mechanism, and the stripe has to come first. Reading
       the declaration alone would say nothing about which rule wins. */
    const order = await p.evaluate(() => {
      const css = [...document.styleSheets]
        .map((sh) => { try { return [...sh.cssRules].map((r) => r.cssText).join(String.fromCharCode(10)); }
                       catch (e) { return ''; } }).join(String.fromCharCode(10));
      const stripe = css.indexOf('.ch:nth-child(2n)') !== -1
        ? css.indexOf('.ch:nth-child(2n)') : css.indexOf('.ch:nth-child(even)');
      return { stripe: stripe,
               hover: css.indexOf('.ch:hover'),
               review: css.indexOf('.ch.is-review') };
    });
    t('the stripe is declared before hover and review, which is what lets them win',
      order.stripe > -1 && order.stripe < order.hover && order.stripe < order.review,
      order);

    t('the line takes a zero basis, not its content',
      out.row && out.row.lineFlex === '0px', out.row && out.row.lineFlex);

    /* THE BLURB NAMED TRIVIA UNTIL 2026-09-03, and losing it has a cost worth
       knowing: **the count jumps from 25 to 62 with nothing on screen saying
       what the other 37 rows are.** That sentence was added on 2026-08-31 for
       exactly that reason. The kind picker and the chips are what answer it
       now, one row at a time. */

    /* AND THE DOOR SAYS THE SAME, in the room's own words. A card describing a
       room in words the room no longer uses drifts on the first read, and this
       one is the reason the Waypoint Library's card was found stale.
         THE MODULE IS LOADED HERE RATHER THAN IN THE PAGE, because the room
       carries `admin-site-nav.js` -- the bar -- and not `admin-nav-menu.js`,
       which is the directory. Reading it from inside the page finds nothing
       and reports an empty string, which reads as a stale card. */
    /* THE PAIR MUST AGREE, WHICH IS STRONGER THAN PINNING A PHRASE. Asserting
       a particular sentence makes this fail the next time somebody edits the
       copy -- which is doing their job, not breaking it. What must never
       happen is the two saying DIFFERENT things, so the door's description has
       to be the tail of the room's own blurb. */
    t('and the nav card says the same as the room',
      navDescription().length > 0 && out.blurb.slice(-navDescription().length) === navDescription(),
      { card: navDescription(), blurb: out.blurb });

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
