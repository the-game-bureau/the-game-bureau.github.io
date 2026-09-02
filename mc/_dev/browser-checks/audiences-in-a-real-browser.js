/* THE AUDIENCES ROOM IN REAL CHROME.
 *
 * jsdom does no layout, so every headless suite here STUBS getBoundingClientRect
 * and is therefore blind to geometry -- which is exactly what a grid of badges
 * is.
 *
 * REWRITTEN 2026-09-01 AGAINST THE BADGE. Every selector in it named the old
 * collapsible table -- tbody tr, tr.row-head, [data-open] -- which was replaced
 * by one solid badge before this session, so it threw on its first evaluate. It
 * could not report that, because it also required a bare puppeteer-core and
 * could not start: TWO FAULTS, EITHER OF WHICH LOOKED LIKE COVERAGE from
 * outside.
 *
 * It measures what only a browser can: that the badges really sit three across
 * with a real gap, that no two fields overlap or squeeze to nothing, that the
 * room scrolls ONCE rather than inside a box inside itself, that the name is
 * really the biggest thing on a card, that the values are really black where
 * the labels are really grey, and that an empty field really says nothing. And
 * it writes a screenshot, because a correct markup string proves nothing about
 * what a viewer sees.
 *
 * Run with a plain `python -m http.server` in the repo root, over http, never
 * file:// -- the page's links are root-absolute and resolve to nothing there.
 */
const fs = require('fs');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
/* REPOINTED 2026-09-01. A bare `puppeteer-core` cannot resolve here -- this
   machine's modules are at C:/tmp -- so this suite could not run AT ALL, and
   an unrunnable check is worse than a missing one: it looks like coverage.
   Third file in this repo to need it, after games-in-a-real-browser.js and
   game-builder-target-audience.js. */

const PORT = process.env.PORT || 8975;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROWS = fs.readFileSync('C:/tmp/fx-aud.json', 'utf8');
/* READ FROM THE FIXTURE, never written down. The list grows by scrolling and
   the claim is that EVERY row is reachable, so a hard-coded total would go
   stale the day the fixture is refreshed and report a cap that is not there. */
const ROW_COUNT = JSON.parse(ROWS).length;
const PLACES = fs.readFileSync('C:/tmp/fx-places.json', 'utf8');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    /* THE ADMIN GATE IS STUBBED BY REPLACING THE MODULE, not by defining a global
       first: the page loads admin-auth.js with a <script src>, which would
       overwrite anything set beforehand. */
    if (/\/mc\/js\/admin-auth\.js/.test(u)) {
      return req.respond({ contentType: 'application/javascript', body:
        'window.TgbMcAdminAuth={create:function(o){return{getSession:function(){return null;},'
        + 'init:function(){document.body.classList.add("mc-auth-authorized");o.onAuthorized();}};}};' });
    }
    /* A STUBBED CROSS-ORIGIN RESPONSE STILL HAS TO PASS CORS, and the page sends
       `apikey` and `Authorization`, which makes every read a PREFLIGHTED one.
       Without these the browser blocks the reply and the room renders empty --
       which looks exactly like the page being broken. It was the harness. */
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    };
    if (/supabase\.co/.test(u) && req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: CORS, body: '' });
    }
    if (/supabase\.co\/rest\/v1\/audiences/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: ROWS });
    }
    if (/supabase\.co\/rest\/v1\/places/.test(u)) {
      return req.respond({ contentType: 'application/json', headers: CORS, body: PLACES });
    }
    if (/supabase\.co/.test(u))
      return req.respond({ contentType: 'application/json', headers: CORS, body: '[]' });
    req.continue();
  });

  await page.goto('http://127.0.0.1:' + PORT + '/mc/audiences/', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.aud').length > 0,
    { timeout: 10000 });

  const m = await page.evaluate(() => {
    const cards = [].slice.call(document.querySelectorAll('.aud'));
    const first = cards[0];
    const topOf = (c) => c.getBoundingClientRect().top;
    const perRow = cards.filter((c) => Math.abs(topOf(c) - topOf(first)) < 2).length;

    /* NO TWO FIELDS ON TOP OF EACH OTHER, AND NONE SQUEEZED TO NOTHING. A grid
       says both should hold and jsdom cannot answer either -- it has no layout,
       so every box there is zero by zero. */
    const fields = [].slice.call(first.querySelectorAll('.field'));
    const boxes = fields.map((f) => f.getBoundingClientRect());
    let overlaps = 0, tiny = 0;
    boxes.forEach((a, i) => {
      if (a.width < 24 || a.height < 6) tiny += 1;
      boxes.slice(i + 1).forEach((b) => {
        if (a.left < b.right - 1 && b.left < a.right - 1
         && a.top < b.bottom - 1 && b.top < a.bottom - 1) { overlaps += 1;
          window.__ov = (window.__ov || []).concat([(fields[i].className + '/' + (fields[i].querySelector('.flabel')||{textContent:'?'}).textContent) + ' X ' + (fields[boxes.indexOf(b)].className + '/' + (fields[boxes.indexOf(b)].querySelector('.flabel')||{textContent:"?"}).textContent)]); }
      });
    });

    /* THE STAMPS SHARE A LINE, HALF THE CARD EACH. They took a grid track each
       until the halves were folded into one field; a track is 50% of the row
       LESS HALF THE COLUMN GAP, so the rule between them drew six pixels right
       of centre. Now the field splits itself `1fr 1fr` with no gap.
         MEASURED, NOT READ OFF A DECLARATION: equal widths, a shared top, and
       the rule landing on the block's own midpoint. */
    const stampBlock = first.querySelector('.field--stamps');
    const stamps = [].slice.call(first.querySelectorAll('.field--stamps .stamp'));
    const stampsPaired = stamps.length === 2
      && Math.abs(stamps[0].getBoundingClientRect().top
                - stamps[1].getBoundingClientRect().top) < 2;
    const stampGeom = (function () {
      if (!stampBlock || stamps.length !== 2) return null;
      const b = stampBlock.getBoundingClientRect();
      const a = stamps[0].getBoundingClientRect(), c2 = stamps[1].getBoundingClientRect();
      return { equal: Math.abs(a.width - c2.width) < 1.5,
               centred: Math.abs(c2.left - (b.left + b.width / 2)) < 1.5,
               align: [getComputedStyle(a === null ? stamps[0] : stamps[0].querySelector('.fval')).textAlign,
                       getComputedStyle(stamps[1].querySelector('.fval')).textAlign].join('/'),
               widths: Math.round(a.width) + '/' + Math.round(c2.width),
               off: Math.round(c2.left - (b.left + b.width / 2)) };
    })();

    /* THE NAME IS `first` NOW. `full_name` is not drawn -- its two halves
       are -- so reading it here measured a box that does not exist and reported
       the heading as 0px. */
    const name = first.querySelector('[data-field="first"]');
    const other = first.querySelector('[data-field="type"]');
    const label = first.querySelector('.flabel');
    const swatch = first.querySelector('.stripe[style*="background"]');
    const sb = swatch ? swatch.getBoundingClientRect() : { width: 0, height: 0 };
    const sPad = swatch ? getComputedStyle(swatch) : null;

    const panel = document.querySelector('.panel-body');
    const pager = document.querySelector('.pager');
    const scrib = document.querySelector('.room-scribble');
    const title = document.querySelector('.room-title');
    const st = scrib ? scrib.getBoundingClientRect() : { height: 0, top: 0, bottom: 0 };
    const ti = title ? title.getBoundingClientRect() : { top: 0, bottom: 0 };

    /* A BLANK IS BLANK. `.ed:empty::before` drew `no home` and the rest out of a
       `data-empty`; nothing may put words in an empty field now. Measured over
       the whole page rather than one card, since which fields are empty is a
       property of the row rather than of the layout. */
    const empties = [].slice.call(document.querySelectorAll('.aud .fval'))
      .filter((f) => !f.textContent.trim());
    const withText = empties.filter((f) => {
      const c = getComputedStyle(f, '::before').content;
      return c && c !== 'none' && c !== 'normal' && c !== '""';
    }).length;
    const clickable = empties.filter((f) => f.classList.contains('ed'))[0];

    return {
      cards: cards.length,
      perRow: perRow,
      colGap: cards.length > 1
        ? Math.round(cards[1].getBoundingClientRect().left - first.getBoundingClientRect().right) : -1,
      rowGap: cards.length > 3
        ? Math.round(cards[3].getBoundingClientRect().top - first.getBoundingClientRect().bottom) : -1,
      cardW: Math.round(first.getBoundingClientRect().width),
      fields: fields.length,
      overlaps: overlaps,
      ovList: (window.__ov || []).join(' | '),
      tiny: tiny,
      stampsPaired: stampsPaired,
      stampGeom: stampGeom,
      /* A VERTICAL RULE BETWEEN THE TWO STAMPS. They are the one pair that
         shares a line, so where every other field is closed by a rule UNDER its
         label, these two are separated by one BETWEEN them. Read as a computed
         border on the SECOND of the pair, which is the only place it can be and
         still fall between them. */
      /* THE KEY IS THE BADGE'S FOOT, not a field. Read as computed colour and
         alignment, because "black on white reversed out" is a claim about what
         a viewer sees and the markup is right either way. */
      idCell: (function () {
        const f = first.querySelector('.aud-id');
        if (!f) return null;
        const cs = getComputedStyle(f);
        const cb = first.getBoundingClientRect(), fb = f.getBoundingClientRect();
        return { text: f.textContent.trim(), bg: cs.backgroundColor, ink: cs.color,
                 align: cs.textAlign,
                 /* THE LAST THING DRAWN, not the last CHILD. The Delete
                    button moved to the end of the article on 2026-09-01 so it
                    is the last TAB STOP -- it is absolutely positioned, so the
                    foot is still the last thing on screen. */
                 last: [].slice.call(first.children)
                   .filter((c) => getComputedStyle(c).position !== 'absolute')
                   .pop() === f,
                 full: Math.round(fb.width) >= Math.round(cb.width) - 4,
                 editable: f.classList.contains('ed') };
      })(),
      idField: first.querySelectorAll('[data-field="id"]').length,
      stampRule: (function () {
        if (stamps.length !== 2) return '(not a pair)';
        const cs = getComputedStyle(stamps[1]);
        return cs.borderLeftStyle + ' ' + cs.borderLeftWidth + ' / first has '
          + getComputedStyle(stamps[0]).borderLeftStyle;
      })(),
      nameSize: name ? parseFloat(getComputedStyle(name).fontSize) : 0,
      /* THE NAME IS TWO LABELLED FIELDS, ONE ABOVE THE OTHER. It was ONE field
         holding the whole name, broken at the mascot by two spans inside it;
         each half is its own field now, with its own label under it.
           MEASURED AS TWO BOXES ON TWO LINES, over every card -- not by reading
         the markup, which was right the whole time the CSS was not.
           COMPARE THE TWO TOPS, NEVER A TOP AGAINST A BOTTOM. `line-height:
         1.05` is NEGATIVE LEADING, so a box overflows its own line box and can
         start a pixel or two ABOVE the one above it while sitting perfectly on
         the next line. The first version compared them and reported 98 of 100
         on one line about a page that was breaking every one correctly. */
      nameSplit: (function () {
        const cards = [].slice.call(document.querySelectorAll('.aud'));
        let split = 0, sameLine = 0, sample = '';
        cards.forEach(function (c) {
          const f = c.querySelector('[data-field="first"]');
          const l = c.querySelector('[data-field="last"]');
          if (!f || !l) return;
          split += 1;
          const fb = f.getBoundingClientRect(), lb = l.getBoundingClientRect();
          const lh = parseFloat(getComputedStyle(f).lineHeight);
          if (lb.top - fb.top < lh * 0.8) sameLine += 1;
          if (!sample) sample = f.textContent + ' / ' + l.textContent;
        });
        return { split: split, sameLine: sameLine, sample: sample, cards: cards.length };
      })(),
      /* AND EACH CARRIES ITS OWN LABEL, which is the whole difference from the
         two spans: the break used to be the only thing saying where one half
         stopped and the other began. */
      /* COUNTED ACROSS THE WHOLE PAGE, not one card. A label left on one field
         of one kind would hide in a sample of one. */
      labelCount: document.querySelectorAll('.aud .flabel, .aud .name-labels').length,
      /* THE EMPTY FIELDS, AND WHAT EACH ONE SAYS. `::before` content is not in
         `textContent`, so it is read with `getComputedStyle(el, ':before')` --
         the whole claim is about a pseudo-element and nothing else can see it. */
      emptyNamed: (function () {
        const es = [].slice.call(document.querySelectorAll('.aud .ed'))
          .filter(function (e) { return !e.textContent.trim(); });
        return es.filter(function (e) {
          const c = getComputedStyle(e, ':before').content;
          return c && c !== 'none' && c !== 'normal' && c.replace(/["']/g, '').trim();
        }).length;
      })(),
      emptySample: (function () {
        const es = [].slice.call(document.querySelectorAll('.aud .ed'))
          .filter(function (e) { return !e.textContent.trim(); }).slice(0, 6);
        return es.map(function (e) {
          const c = getComputedStyle(e, ':before').content.replace(/["']/g, '').trim();
          return { field: e.dataset.field, drew: c, ok: c === e.dataset.field };
        });
      })(),
      /* A FILLED FIELD MUST DRAW NOTHING. `:empty` is the only thing standing
         between the placeholder and every card in the room saying CITY. */
      filledExtra: (function () {
        return [].slice.call(document.querySelectorAll('.aud .ed'))
          .filter(function (e) { return e.textContent.trim(); })
          .filter(function (e) {
            const c = getComputedStyle(e, ':before').content;
            return c && c !== 'none' && c !== 'normal' && c.replace(/["']/g, '').trim();
          }).length;
      })(),
      emptyInk: (function () {
        const e = document.querySelector('.aud .ed');
        const blank = [].slice.call(document.querySelectorAll('.aud .ed'))
          .filter(function (x) { return !x.textContent.trim(); })[0];
        return blank ? getComputedStyle(blank, ':before').color : '';
      })(),
      emptySize: (function () {
        const blank = [].slice.call(document.querySelectorAll('.aud .ed'))
          .filter(function (x) { return !x.textContent.trim(); })[0];
        return blank ? parseFloat(getComputedStyle(blank, ':before').fontSize) : 0;
      })(),
      nameLabels: (function () {
        /* BOTH LABELS SIT IN THE NAME BLOCK NOW, first in front of last. Read
           through the FIELD they share -- looking each up from its own value
           returns the block's FIRST label twice, which is what the arrangement
           before this returned honestly and this one returns wrongly. */
        const c = document.querySelector('.aud');
        const box = c && c.querySelector('.field--name');
        const ls = box ? [].slice.call(box.querySelectorAll('.flabel')) : [];
        return ls.map(function (l) { return l.textContent.trim(); }).join('/');
      })(),
      /* AND THEY REALLY ARE ON ONE LINE, with the values stacked above them.
         The whole point of the move is where the labels SIT, which is a
         measurement rather than a string. */
      /* THE NAME BLOCK, WHICH IS NOW TWO VALUES AND NOTHING ELSE. It read the
         two labels as well until they were removed; requiring them made the
         whole measurement come back null, which reads as the block having
         vanished rather than as the probe asking for something that is gone. */
      nameGeom: (function () {
        const c = document.querySelector('.aud');
        const box = c && c.querySelector('.field--name');
        if (!box) return null;
        const f = box.querySelector('[data-field="first"]');
        const l = box.querySelector('[data-field="last"]');
        if (!f || !l) return null;
        const fb = f.getBoundingClientRect(), lb = l.getBoundingClientRect();
        return { valuesStacked: lb.top > fb.top + 2,
                 aligned: Math.abs(fb.left - lb.left) < 2,
                 labels: box.querySelectorAll('.flabel').length };
      })(),
      otherSize: other ? parseFloat(getComputedStyle(other).fontSize) : 0,
      /* THE LARGEST SIZE ANYWHERE ON THE CARD, and the largest that is NOT the
         name -- so `biggest` is measured rather than compared with one field
         somebody picked. */
      maxSize: (function () {
        return [].slice.call(first.querySelectorAll('*')).reduce(function (n, e) {
          return Math.max(n, parseFloat(getComputedStyle(e).fontSize) || 0);
        }, 0);
      })(),
      maxOther: (function () {
        const name = first.querySelector('.field--name');
        return [].slice.call(first.querySelectorAll('*')).filter(function (e) {
          return !name || !name.contains(e);
        }).reduce(function (n, e) {
          return Math.max(n, parseFloat(getComputedStyle(e).fontSize) || 0);
        }, 0);
      })(),
      valueInk: other ? getComputedStyle(other).color : '',
      labelInk: label ? getComputedStyle(label).color : '',
      /* A LABEL IS SMALLER THAN ITS VALUE. Measured as a RATIO of the two, so
         it survives a change to the card's one font size -- which is the whole
         reason that size is a single custom property. */
      labelSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      stripeLabelSize: (function () {
        const k = first.querySelector('.stripe-k');
        return k ? parseFloat(getComputedStyle(k).fontSize) : 0;
      })(),
      emptyCount: empties.length,
      emptyWithText: withText,
      emptyClickable: clickable ? Math.round(clickable.getBoundingClientRect().height) : -1,
      swatchW: Math.round(sb.width),
      swatchH: Math.round(sb.height),
      swatchFill: swatch ? sPad.backgroundColor : '',
      swatchPadY: swatch ? parseFloat(sPad.paddingTop) : 0,
      swatchPadX: swatch ? parseFloat(sPad.paddingLeft) : 0,
      panelH: Math.round(panel.getBoundingClientRect().height),
      panelScroll: Math.round(panel.scrollHeight),
      docH: document.documentElement.scrollHeight,
      viewH: window.innerHeight,
      pageScrollW: document.documentElement.scrollWidth,
      pageW: document.documentElement.clientWidth,
      /* THE FOOT, WHERE THE PAGER WAS. Same job -- how many of how many -- and
         it is the element the observer watches rather than a control. */
      pagerText: (function () {
        const f = document.querySelector('[data-more]');
        return f ? f.textContent.trim() : '(none)';
      })(),
      scribH: Math.round(st.height),
      scribText: scrib ? scrib.textContent.trim() : '',
      overlapsTitle: st.height > 0 && st.top < ti.bottom - 1 && ti.top < st.bottom - 1
    };
  });

  t('the room renders its badges in a real browser (' + m.cards + ')', m.cards === 100, m.cards);
  t('three across', m.perRow === 3, m.perRow + ' per row');
  t('with a real gap both ways', m.colGap > 0 && m.rowGap > 0,
    m.colGap + 'px across, ' + m.rowGap + 'px down');
  t('and a badge is about a third of the room', m.cardW > 340 && m.cardW < 520, m.cardW + 'px');

  /* TEN, AND THE NUMBER IS THE POINT. Fourteen columns, less the mascot which
     is deliberately off the badge, less the four colours which collapse into
     one block: 14 - 1 - 4 + 1 = 10. A count that drifts means a column has
     silently stopped being drawn, which is a value nobody can see or correct. */
  /* ELEVEN. Seventeen columns, less the three dropped on 2026-09-01
     (`nickname`, `team_key`, `home_place_id`), less `full_name` which is not
     drawn because its two halves are, less the four colours which collapse into
     one block, plus that block: 17 - 3 - 1 - 4 + 1 = 10... and it is ELEVEN
     because `first` and `last` are two fields where the whole name was one.
     A count that drifts means a column has silently stopped being drawn. */
  /* EIGHT. Seventeen columns, less the three dropped on 2026-09-01, less
     `full_name` (its two halves are drawn instead) and less `id` (the badge's
     FOOT rather than a field), less the four colours which collapse into one
     block, plus that block -- and TWO pairs are one field each now: the name's
     halves, and the two stamps, which split themselves 50/50 rather than taking
     a grid track each. A count that drifts means a column has silently stopped
     being drawn. */
  /* NINE. `more` joined them on 2026-09-01 -- one url per audience, drawn as
     its own field with the door beside it. A count that drifts means a column
     has silently stopped being drawn. */
  t('a badge draws all nine of its fields', m.fields === 9, m.fields);
  t('with no two on top of each other', m.overlaps === 0, m.overlaps + ': ' + m.ovList);
  t('and none squeezed to nothing', m.tiny === 0, m.tiny + ' collapsed');
  t('created and updated share a line', m.stampsPaired, m.stampsPaired);
  /* HALF EACH, AND THE RULE ON THE CENTRE LINE. The two halves being equal is
     not enough on its own: a grid track each was equal too, and still put the
     rule half a column gap off centre. */
  t('each takes half the block', m.stampGeom && m.stampGeom.equal,
    m.stampGeom && m.stampGeom.widths);
  t('and the rule between them is on the centre line',
    m.stampGeom && m.stampGeom.centred, m.stampGeom && (m.stampGeom.off + 'px off'));
  t('and each date is centred in its half',
    m.stampGeom && m.stampGeom.align === 'center/center',
    m.stampGeom && m.stampGeom.align);
  t('the key is the badge foot',
    !!(m.idCell && /^[a-z0-9-]+$/.test(m.idCell.text)),
    m.idCell ? m.idCell.text : '(no id cell)');
  /* THE LAST THING ON THE CARD, and no longer FULL width -- it is inset on the
     left by the coloured edge, which is what stopped the black painting over
     the stripe. The two assertions below it measure that; this one is now only
     about position. */
  t('and it is the last thing drawn on the card', !!(m.idCell && m.idCell.last),
    m.idCell ? ('last=' + m.idCell.last) : '(none)');
  t('black ground, white ink, centred',
    !!(m.idCell && m.idCell.bg === 'rgb(0, 0, 0)'
       && m.idCell.ink === 'rgb(255, 255, 255)' && m.idCell.align === 'center'),
    m.idCell ? (m.idCell.bg + ' / ' + m.idCell.ink + ' / ' + m.idCell.align) : '(none)');
  /* AND IT IS EDITED LIKE EVERY OTHER FIELD. It carried a tooltip and nothing
     else -- the one value on the badge you could read and not change -- and the
     room's answer to a wrong key was SQL.
       IT IS DRAWN ONCE, in the foot: the key twice on one card would be the
     duplication that took it out of the field list in the first place.
       IT IS SAFE BECAUSE OF THE CASCADE. 2026090113 gave all three incoming
     foreign keys `ON UPDATE CASCADE`, so what points at a key follows it. */
  t('and the key is drawn once, as the foot', m.idField === 1, m.idField + ' id fields');
  t('and it is editable like every other field',
    !!(m.idCell && m.idCell.editable), m.idCell && m.idCell.editable);

  t('with a rule between them, on the second and not the first',
    /^solid [1-9]/.test(m.stampRule) && / first has none$/.test(m.stampRule),
    m.stampRule);

  /* THE NAME IS THE HEADING OF ITS OWN CARD, and it is asserted against EVERY
     other size on the badge rather than against one field.
       IT WAS A RATIO OF 1.6 TO THE BODY, which was a fair proxy while the title
     was literally `1.9em` of it. **They are two independent custom properties
     now** -- `--aud-title-size` and `--aud-card-font-size` -- precisely so that
     growing the body does not drag the heading up with it, so a ratio to one
     other field has stopped measuring what it was measuring. The claim is that
     the name is the largest thing here and clearly so. */
  t('the name is the biggest thing on the badge',
    m.nameSize === m.maxSize && m.nameSize > m.otherSize * 1.3,
    m.nameSize + 'px, next largest ' + m.maxOther + 'px, body ' + m.otherSize + 'px');

  /* BLACK VALUES, GREY LABELS, MEASURED. `--ink` is #2d4880, the house blue, so
     "black" here is a real change rather than a token swap -- and only a
     computed read can tell them apart. */
  t('every badge draws both halves of the name',
    m.nameSplit.split === m.nameSplit.cards,
    m.nameSplit.split + ' of ' + m.nameSplit.cards + ', e.g. ' + m.nameSplit.sample);
  t('and the last always starts a new line', m.nameSplit.sameLine === 0,
    m.nameSplit.sameLine + ' on one line');
  /* NO LABELS ANYWHERE. A badge is what the row HOLDS; a word under every
     value on every card is a column heading repeated a hundred times. **Nine
     assertions here described the labelled arrangement and were correctly
     broken by removing it** -- they are the rule that replaced it now.
       THE NAME IS STILL TWO STACKED VALUES, which is the half that did not
     change: the pair is two lines by construction, so the old `min-height:
     2.1em` floor would have made it four. */
  t('a badge carries no labels at all', m.labelCount === 0, m.labelCount);
  t('the two halves of the name stack', m.nameGeom && m.nameGeom.valuesStacked,
    m.nameGeom);

  t('values are black', m.valueInk === 'rgb(0, 0, 0)', m.valueInk);

  /* AND AN EMPTY FIELD SHOWS ITS COLUMN NAME, which is the whole of what
     replaced the labels: the name is drawn in the ONE place there is nothing
     else to read. **This inverts the assertion that stood here** -- a blank was
     blank, because the mechanism had drawn `no home` / `no mascot` / `nowhere`,
     words in the shape of data. A real column name is not that. */
  t('there are empty fields to check', m.emptyCount > 0, m.emptyCount);
  t('every empty field names its column', m.emptyNamed === m.emptyCount,
    m.emptyNamed + ' of ' + m.emptyCount);
  t('and it is the real column name', m.emptySample.every((x) => x.ok),
    JSON.stringify(m.emptySample.filter((x) => !x.ok)));
  /* DRAWN AS A PLACEHOLDER, NOT AS A VALUE. Muted and smaller, or a card with
     several blanks reads as a card full of words rather than as a card with
     gaps in it. */
  t('a placeholder is muted, not the value ink',
    m.emptyInk && m.emptyInk !== m.valueInk, m.emptyInk + ' vs ' + m.valueInk);
  t('and smaller than a value', m.emptySize > 0 && m.emptySize < m.otherSize,
    m.emptySize + 'px vs ' + m.otherSize + 'px');
  /* A FILLED FIELD SAYS NOTHING BUT ITS VALUE. Without this the check above
     would pass on a page that drew the name in every field, empty or not. */
  t('a filled field draws no name', m.filledExtra === 0,
    m.filledExtra + ' filled fields with placeholder text');
  t('an empty field is still tall enough to click into', m.emptyClickable >= 10,
    m.emptyClickable + 'px');

  t('a colour is drawn as a box, not an inline span with no size',
    m.swatchW > 20 && m.swatchH > 10, m.swatchW + 'x' + m.swatchH);
  t('painted a real colour', m.swatchFill !== 'rgba(0, 0, 0, 0)', m.swatchFill);
  t('with the hex set in the box rather than against its edge',
    m.swatchPadY > 0 && m.swatchPadX > 0, m.swatchPadY + '/' + m.swatchPadX + 'px');

  /* THE ROOM SCROLLS ONCE. It was `max-height: 72vh; overflow: auto` on the
     panel -- a scrollbar inside a scrollbar, where the wheel meant two
     different things an inch apart. */
  t('the panel does not scroll inside itself', m.panelScroll <= m.panelH + 2,
    m.panelH + ' tall, ' + m.panelScroll + ' of content');
  t('the badges are on the page, which scrolls', m.docH > m.viewH,
    m.docH + 'px document, ' + m.viewH + 'px viewport');
  t('and the page never scrolls sideways', m.pageScrollW <= m.pageW + 1,
    m.pageScrollW + ' vs ' + m.pageW);


  t('the red pen holds a sentence, not a paragraph', m.scribH <= 60, m.scribH + 'px: ' + m.scribText.slice(0, 200));
  t('and does not climb over the room title', !m.overlapsTitle, m.scribH + 'px');
  /* EVERY EDITABLE FIELD OPENS A BOX, one at a time, in a real browser.
     **This is the check that was missing.** The suites asserted that ONE cell
     opened -- the aliases in one, `first` in the other -- so a field that had
     quietly stopped being editable would have passed both. Reported as "can't
     edit fields from web page", and only a sweep over all of them can answer
     that either way. */
  const editable = await page.evaluate(async () => {
    /* THE CARD IS RE-QUERIED EVERY TIME, and that is not fussiness: closing an
       editor calls `paintTable`, which REBUILDS THE LIST -- so a reference
       taken before the loop is detached from the second field onward, and
       clicking a detached node does nothing. The first version held one and
       reported ten dead fields on a page where every one of them works. */
    const keys = [].slice.call(
      document.querySelector('.aud').querySelectorAll('.fval.ed, .stripe.ed'))
      .map((f) => f.dataset.field);
    const out = [];
    for (const k of keys) {
      const cell = document.querySelector('.aud [data-field="' + k + '"]');
      if (!cell) { out.push({ k: k, opened: false }); continue; }
      cell.click();
      await new Promise((r) => setTimeout(r, 30));
      const box = cell.querySelector('input');
      out.push({ k: k, opened: !!box });
      if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    }
    return { keys: keys, out: out };
  });
  const dead = editable.out.filter((x) => !x.opened).map((x) => x.k);
  t('every field marked editable really opens a box',
    editable.out.length > 0 && dead.length === 0,
    dead.length ? dead.join(', ') + ' did not open'
                : editable.out.length + ' fields: ' + editable.keys.join(', '));

  /* AND CLICKING STRAIGHT FROM ONE FIELD TO THE NEXT, which is the gesture a
     person actually makes and the one the sweep above does NOT test: it closes
     each editor before opening the next.
       THE FIRST CLICK BLURS THE OPEN BOX, `finish(true)` runs, and an unchanged
     value calls `paintTable()` -- which REBUILDS THE LIST. The click then lands
     on a cell that is no longer in the document, and the box is appended to a
     detached node: nothing appears. */
  const straightOn = await page.evaluate(async () => {
    document.querySelector('.aud [data-field="description"]').click();
    await new Promise((r) => setTimeout(r, 40));
    const openedFirst = !!document.querySelector('.aud [data-field="description"] input');
    /* A REAL mousedown-then-click, because it is the BLUR that repaints and a
       bare `.click()` never fires one. */
    const next = document.querySelector('.aud [data-field="city"]');
    next.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const open = document.querySelector('.ed-box');
    if (open) open.blur();
    next.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const opened2 = !!document.querySelector('.aud [data-field="city"] input');
    /* CLOSE WHAT THIS PROBE OPENED. `editing` is one flag for the whole room,
       so leaving a box open makes the NEXT probe's click do nothing -- which it
       then reports as the page refusing to open a field. A probe that leaves
       state behind is a probe that fails its neighbours. */
    const leftOpen = document.querySelector('.ed-box');
    if (leftOpen) leftOpen.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 40));
    return { openedFirst: openedFirst,
             openedSecond: opened2,
             anyBox: document.querySelectorAll('.ed-box').length,
             stillConnected: next.isConnected,
             cityCells: document.querySelectorAll('.aud [data-field="city"]').length };
  });
  t('a field opens on the first click', straightOn.openedFirst, straightOn.openedFirst);
  t('and clicking straight on to the next opens THAT one',
    straightOn.openedSecond,
    'second opened: ' + straightOn.openedSecond + ', boxes: ' + straightOn.anyBox
      + ', target still connected: ' + straightOn.stillConnected
      + ', city cells: ' + straightOn.cityCells);

  /* A HALF OPENS ON ITS OWN VALUE. `startEdit` reads the STORED row rather
     than the cell, so this is what says the two fields really are two columns
     and not one name cut in half at render time.
       THE WRITE ITSELF IS ASSERTED IN `audiences-sort.js`, which records what
     leaves the page; this suite only intercepts. Splitting it that way is why
     the probe here can be three lines. */
  const nameEdits = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const cell = card.querySelector('[data-field="first"]');
    const was = cell.textContent.trim();
    cell.click();
    const box = cell.querySelector('input');
    const got = box ? box.value : '(no box)';
    if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { was: was, got: got };
  });
  t('a half opens on its own value, not the whole name',
    nameEdits.got === nameEdits.was,
    JSON.stringify(nameEdits.got) + ' vs ' + JSON.stringify(nameEdits.was));


  /* THE LIST GROWS WHERE YOU ARE, WHICH IS THE OPPOSITE OF WHAT THE PAGER DID.
     Next put you back at the top of the page, because a hundred badges is
     twelve thousand pixels and pressing it from the foot left you at the bottom
     of the next hundred. Scrolling has no such moment: **the new rows arrive
     below the ones you are reading and the page must not move at all.** */
  const growth = await page.evaluate(async () => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    const at = Math.round(window.scrollY);
    const n = document.querySelectorAll('.aud').length;
    /* THE TOP BADGE STAYS PUT. Appending cannot move it; repainting the list to
       grow it would, which is the whole reason `growList` appends. */
    const firstTop = Math.round(document.querySelector('.aud').getBoundingClientRect().top);
    await new Promise((r) => setTimeout(r, 300));
    return { at: at, n: n, firstTop: firstTop,
             stillAt: Math.round(window.scrollY),
             firstTopAfter: Math.round(document.querySelector('.aud').getBoundingClientRect().top) };
  });
  t('the list was grown from the foot of the page', growth.at > 1000, growth.at);
  t('and growing it does not move the page', growth.stillAt === growth.at,
    growth.at + ' then ' + growth.stillAt);
  t('nor the badges already drawn', growth.firstTopAfter === growth.firstTop,
    growth.firstTop + ' then ' + growth.firstTopAfter);

  /* EVERY LABEL A PERSON READS, AND WHAT IT CLAIMS. The badge draws the REAL
     COLUMN NAME as each label, deliberately -- on a page whose whole job is
     editing this table the database's own word is the useful one -- so a label
     naming a column that is not there is the page lying about the row. */
  const labels = await page.evaluate(() => ({
    badge: [].slice.call(document.querySelectorAll('.aud:first-of-type .flabel'))
      .map((l) => l.textContent.trim()),
    stripes: [].slice.call(document.querySelectorAll('.aud:first-of-type .stripe-k'))
      .map((l) => l.textContent.trim()),
    sort: [].slice.call(document.querySelectorAll('.th-sort')).map((b) => b.textContent.trim()),
    legends: [].slice.call(document.querySelectorAll('legend')).map((l) => l.textContent.trim()),
    pickers: [].slice.call(document.querySelectorAll('select')).map((x) =>
      x.id + '=' + (x.options[0] ? x.options[0].textContent.trim() : '')),
    /* THE KEY'S OWN TOOLTIP, ON THE FOOT CELL. It was on the `id` FIELD, and the
         key stopped being a field when it became the badge's foot -- so this
         read the first locked cell it found, which is now `created`, and
         reported a sentence about the stamps as though it were about the key. */
      keyTitle: (function () {
        const f = document.querySelector('.aud .aud-id');
        return f ? (f.getAttribute('title') || '') : '';
      })(),
    /* THE ADD DIALOG IS GONE, so this reads whatever dialogs the room still
       has rather than pressing MANUAL to open one. **Pressing it now writes a
       row and RELOADS**, which destroys the execution context -- the run died
       with `Execution context was destroyed` on the next probe, which reads as
       the page crashing rather than as a button doing what it says. */
    dlg: [].slice.call(document.querySelectorAll('.dlg label, .dlg .flabel'))
      .map((l) => l.textContent.trim())
  }));
  /* NO LABEL MAY NAME A COLUMN THE TABLE DOES NOT HAVE. The badge draws the
     REAL column name as each label, so this is the check that keeps that
     promise -- and it is the general form of the fault it caught: the key's
     tooltip read "Generated from the family and the name" months after `family`
     was dropped AND after the id stopped being generated at all. A sentence
     naming a column that is gone is the page lying about the row it is on. */
  const cols = Object.keys(JSON.parse(ROWS)[0]);
  const claimed = labels.badge.concat(labels.stripes).concat(labels.sort)
    .concat(labels.dlg).filter((w) => /^[a-z][a-z0-9_]*$/.test(w));
  const unreal = claimed.filter((w) => cols.indexOf(w) === -1);
  t('every label names a column the table has', unreal.length === 0, unreal.join(', '));
  /* THE HALF OF THIS THAT SURVIVES THE SHORT TOOLTIP. It required the hover to
     EXPLAIN that nothing generates the key, which was the essay; what it may
     never do is CLAIM the id is derived from something, which is what it did
     for months after `family` was dropped and after the id stopped being
     generated at all. A sentence naming a column that is gone is the page lying
     about the row it is on. */
  t('and the key does not claim to be generated or derived',
    !/generated|derived|composed from/i.test(labels.keyTitle),
    labels.keyTitle.slice(0, 90));

  console.log('  LABELS badge   : ' + labels.badge.join(' | '));
  console.log('  LABELS stripes : ' + labels.stripes.join(' | '));
  console.log('  LABELS sort    : ' + labels.sort.join(' | '));
  console.log('  LABELS legends : ' + labels.legends.join(' | '));
  console.log('  LABELS pickers : ' + labels.pickers.join(' | '));
  console.log('  LABELS dialog  : ' + labels.dlg.join(' | '));

  /* THE RULES UNDER THE LABELS, WHICH NOTHING ASSERTED AT ALL. A field is
     closed by a line under its label, and three are exempt for three different
     reasons -- so removing the RIGHT one and removing the WRONG one both passed
     silently. Only a computed read can tell: a `border-bottom` declared and
     lost to a later rule at equal weight reads perfectly correct in the file. */
  const rules = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const px = (k) => {
      const f = card.querySelector('[data-field="' + k + '"]');
      const field = f && f.closest('.field');
      if (!field) return null;
      const cs = getComputedStyle(field);
      return { w: cs.borderBottomWidth, style: cs.borderBottomStyle,
               left: cs.borderLeftWidth };
    };
    /* A LOCKED CELL CARRIES NO `data-field` -- only an editable one does -- so
       the two stamps are found by the class that pairs them off. Looking them
       up by field name came back null and read as the page having lost its
       rules; it was the probe. */
    const stamps = card.querySelectorAll('.field--stamps .stamp');
    const box = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { w: cs.borderBottomWidth, style: cs.borderBottomStyle,
               left: cs.borderLeftWidth };
    };
    return { first: px('first'), last: px('last'), city: px('city'),
             stamps: stamps.length,
             created: box(stamps[0]), updated: box(stamps[1]) };
  });
  /* FIRST AND LAST ARE TWO HALVES OF ONE NAME AND ONE FIELD, so there is no
     rule between them to draw -- the block is closed by a single line under it,
     which is what separates what the card is CALLED from what the row HOLDS. */
  t('the name is one field, so nothing rules between its halves',
    rules.first && rules.last && rules.first.w === rules.last.w
      && rules.first.style === rules.last.style, rules.first);
  t('and the heading is closed by one line under the block',
    rules.last && rules.last.w !== '0px' && rules.last.style !== 'none',
    rules.last);
  t('an ordinary field keeps its line',
    rules.city && rules.city.w !== '0px' && rules.city.style !== 'none',
    rules.city);
  /* THE STAMPS SHARE A LINE, so they are closed by a rule BETWEEN them rather
     than one under each -- two short segments side by side with a gap. */
  t('the stamps have no line under them',
    rules.created && (rules.created.w === '0px' || rules.created.style === 'none'),
    rules.created);
  t('and are separated by a vertical one',
    rules.updated && rules.updated.left !== '0px', rules.updated);

  /* THE CITY IS TYPED, NOT PICKED. It is free text on the row and nothing
     resolves it, so a dropdown beside it claims a constraint the column does
     not have. **The FILTER is still a `<select>` and must stay one**: that one
     narrows what is on screen to cities the table HAS, which is a different
     question from what to store -- so the check asserts both halves, or
     deleting the wrong control would pass. */
  const cityCtl = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const cell = card && card.querySelector('[data-field="city"]');
    if (cell) cell.click();
    const box = card && card.querySelector('[data-field="city"] input, .ed-box');
    /* IT CLOSES WHAT IT OPENED. `editing` is ONE flag for the whole room, so an
       editor left open here makes `startEdit` refuse for every probe after it
       -- and they report `(no box)`, which reads as the page having lost its
       editor rather than as this probe holding the lock. It cost the font check
       below a red run. */
    const read = { editList: box ? (box.getAttribute('list') || '') : '(no box)',
             editTag: box ? box.tagName : '(none)',
             /* THERE IS NO ADD DIALOG. It collected a name, a type and a city
                and then handed you the same four to edit on the badge; MANUAL
                writes a placeholder row instead. `(none)` is the honest answer
                and the assertion below accepts it. */
             addList: (document.getElementById('addHome') || {}).getAttribute
               ? document.getElementById('addHome').getAttribute('list') || '' : '',
             datalists: document.querySelectorAll('datalist').length,
             filterIsSelect: !!document.getElementById('cityPick'),
             filterTag: (document.getElementById('cityPick') || {}).tagName || '(none)' };
    if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return read;
  });
  t('editing a city gives a plain text box', cityCtl.editTag === 'INPUT', cityCtl.editTag);
  t('with no dropdown attached', cityCtl.editList === '', cityCtl.editList);
  t('and the add dialog the same', cityCtl.addList === '', cityCtl.addList);
  t('no datalist is left on the page', cityCtl.datalists === 0, cityCtl.datalists);
  t('the city FILTER is still a select', cityCtl.filterTag === 'SELECT', cityCtl.filterTag);

  /* THE EDIT BOX WEARS THE TYPE OF THE TEXT IT REPLACES. The cells are not all
     one size -- the name is the heading, the key and the stamps are mono, a
     stripe is small mono -- so a PINNED size matched exactly one of them, and
     clicking the name opened a 9pt box over a 22.8px heading.
       IT IS ASSERTED PER FIELD AGAINST THE CELL, never against a number. A
     number would be a second copy of the sizes and would drift; comparing the
     box with the cell it sits in is the claim itself. */
  const edFont = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const out = [];
    ['first', 'city', 'description', 'primary'].forEach((k) => {
      const cell = card.querySelector('[data-field="' + k + '"]');
      if (!cell) { out.push({ k: k, miss: true }); return; }
      const cs = getComputedStyle(cell);
      const was = [cs.fontSize, cs.fontFamily.split(',')[0], cs.fontWeight].join(' ');
      cell.click();
      const box = cell.querySelector('input');
      if (!box) { out.push({ k: k, noBox: true }); return; }
      const bs = getComputedStyle(box);
      out.push({ k: k, was: was,
                 box: [bs.fontSize, bs.fontFamily.split(',')[0], bs.fontWeight].join(' ') });
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    return out;
  });
  const edBad = edFont.filter((r) => r.miss || r.noBox || r.was !== r.box);
  t('an edit box matches the type of the text it replaces', edBad.length === 0,
    edBad.map((r) => r.k + ': ' + r.was + ' -> ' + r.box).join(' | '));
  /* AND THE BADGE DOES NOT JUMP WHEN ONE OPENS. The page's own input rule
     carries a 34px min-height, taller than a stripe row, so clicking a colour
     grew the colourbar by 13px. */
  const jump = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const cb = card.querySelector('.colourbar');
    const before = cb.getBoundingClientRect().height;
    card.querySelector('[data-field="primary"]').click();
    const after = cb.getBoundingClientRect().height;
    const box = card.querySelector('.stripe input');
    if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return Math.round(Math.abs(after - before));
  });
  t('and opening a colour editor does not resize the badge', jump <= 4, jump + 'px');

  /* THE LIST IS ONE LIST, DRAWN AS YOU REACH IT. It was a pager; the chunk and
     the guarantee are the same and the control is gone. **What has to be
     asserted is that it is not a top-N**, which is the thing this project has
     deleted before and which looks identical on first paint: a hundred badges
     and no way to tell whether the other 541 are reachable. */
  const count = () => page.evaluate(() => document.querySelectorAll('.aud').length);
  const footText = () => page.evaluate(() => {
    const f = document.querySelector('[data-more]');
    return f ? f.textContent.trim() : '(none)';
  });
  const toBottom = async (times) => {
    for (let i = 0; i < times; i += 1) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 220));
    }
  };
  /* RESET FIRST, AND SAY SO. Every probe above this has scrolled -- the growth
     one deliberately runs from the foot -- so `shown` is well past a chunk by
     now and asserting the opening state without resetting reads as the list
     opening on 200. **Typing into the search box and clearing it is the room's
     own reset**, which is the honest way to reach that state rather than
     reaching into the page's variables. */
  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = 'zzzz-not-a-club'; q.dispatchEvent(new Event('input', { bubbles: true }));
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  const first = await count();
  t('the list opens on one chunk', first === 100, first);
  t('and the foot says how many of how many', /^100 of \d+\. Scroll for more\.$/.test(await footText()),
    await footText());
  t('there is no pager', await page.evaluate(() => !document.querySelector('.pager')));

  await toBottom(1);
  const grown = await count();
  t('scrolling to the foot draws the next chunk', grown === 200, grown);

  await toBottom(14);
  const allDrawn = await count();
  /* EVERY ROW IS REACHABLE, which is the whole difference from a cap. */
  t('and scrolling on reaches every row', allDrawn === ROW_COUNT, allDrawn + ' of ' + ROW_COUNT);
  t('and the foot goes when there is no more',
    (await footText()) === '(none)', await footText());

  /* A FILTER RESETS THE LIST AND THE PAGE. Resetting the count alone is not
     enough on a list that grows by scrolling: filtered from the bottom you are
     still at the bottom, the foot is instantly in view, and the observer fills
     the list back out to reach you. */
  await page.evaluate(() => {
    const q = document.getElementById('q');
    q.value = 'zzzz-not-a-club'; q.dispatchEvent(new Event('input', { bubbles: true }));
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 300));
  const afterFilter = await count();
  t('a filter puts the list back to one chunk', afterFilter === 100, afterFilter);
  t('and the page back to the top',
    (await page.evaluate(() => window.scrollY)) === 0,
    await page.evaluate(() => window.scrollY));

  /* EVERY CELL NAMES ITS COLUMN ON HOVER AND SAYS WHETHER YOU CAN TYPE IN IT,
     and nothing else. With the labels gone the hover is the only thing that can
     name a FILLED field -- an empty one draws its own name as a placeholder.
       **THE TWO STAMPS ARE WHY IT MATTERS MOST**: they share a line, so two
     dates sit side by side with nothing on screen saying which is CREATED and
     which is UPDATED.
       IT WAS AN ESSAY ON THREE CELLS AND ABSENT ON THE HUNDRED YOU ACTUALLY
     CLICK. What is asserted now is the shape, everywhere: `FIELD | Click to
     edit.` on anything editable and `FIELD | Not editable.` on the two stamps,
     which must not claim a click does something. */
  const tips = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const read = (sel) => [].slice.call(card.querySelectorAll(sel))
      .map(function (l) { return { f: l.dataset.field || '', t: l.title || '' }; });
    return {
      locked: [].slice.call(card.querySelectorAll('.field--stamps .stamp .fval.is-locked'))
        .map(function (l) { return l.title; }),
      editable: read('.fval.ed'),
      stripes: read('.stripe.ed'),
      key: (function () {
        const f = card.querySelector('.aud-id');
        return f ? (f.getAttribute('title') || '') : '';
      })(),
      untitled: [].slice.call(card.querySelectorAll('.fval, .stripe, .aud-id'))
        .filter(function (l) { return !l.getAttribute('title'); }).length
    };
  });
  const shaped = (o) => o.t === o.f.toUpperCase() + ' | Click to edit.';
  t('the stamps are named on hover, in order',
    tips.locked.length === 2
      && tips.locked[0] === 'CREATED | Not editable.'
      && tips.locked[1] === 'UPDATED | Not editable.',
    tips.locked.join(' / '));
  /* A LOCKED CELL MUST NOT SAY "Click to edit" -- it would be a lie, and a
     field that silently ignores a click is indistinguishable from a broken
     one. That much of the old rule stays. */
  t('and neither claims a click does anything',
    tips.locked.every(function (x) { return x.indexOf('Click to edit') === -1; }),
    tips.locked.join(' / '));
  t('every editable field says COLUMN | Click to edit.',
    tips.editable.length > 0 && tips.editable.every(shaped),
    (tips.editable.filter(function (o) { return !shaped(o); })[0] || {}).t || 'all');
  t('and so does every colour stripe',
    tips.stripes.length === 4 && tips.stripes.every(shaped),
    tips.stripes.map(function (o) { return o.t; }).join(' / '));
  t('and so does the key on the foot',
    tips.key === 'ID | Click to edit.', tips.key);
  /* NOT ONE CELL WITHOUT ONE. The tooltip is the only thing naming a filled
     field, so a cell that has none is a value nobody can identify. */
  t('and no cell is left without a tooltip', tips.untitled === 0, tips.untitled);
  /* SHORT. The point of the change is that a hover is a label rather than a
     paragraph; without a ceiling the essays could come back one cell at a
     time. */
  t('and none of them is a paragraph',
    tips.editable.concat(tips.stripes).every(function (o) { return o.t.length < 40; })
      && tips.locked.every(function (x) { return x.length < 40; }),
    Math.max.apply(null, tips.editable.map(function (o) { return o.t.length; })));

  /* ---- THE KEYBOARD ------------------------------------------------------
     Every editable cell is a `div`, so none of them was in the tab order: Tab
     skipped the whole card and landed on the next one. **A field disguised as
     text is still a field**, so they carry `tabindex` and Tab walks them.
       REAL KEY PRESSES, never a synthetic event. The claim is about what the
     BROWSER does with Tab -- which element it moves to next, and in what order
     -- and a dispatched KeyboardEvent moves focus nowhere at all, so a check
     written that way would pass on a page where Tab does nothing. */
  const tab = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const cells = [].slice.call(card.querySelectorAll('.ed'));
    return {
      cells: cells.length,
      tabbable: cells.filter((c) => c.getAttribute('tabindex') === '0').length,
      /* THE DELETE BUTTON IS THE LAST CHILD OF THE CARD, which is what makes it
         the last tab stop. It was the FIRST, so tabbing into a card reached the
         most destructive control on it before any field. */
      delIsLast: card.lastElementChild
        && card.lastElementChild.classList.contains('aud-delete'),
      delWasFirst: card.firstElementChild
        && card.firstElementChild.classList.contains('aud-delete')
    };
  });
  t('every editable cell is a tab stop', tab.cells > 0 && tab.tabbable === tab.cells,
    tab.tabbable + ' of ' + tab.cells);
  t('and Delete is the last thing in the card, not the first',
    tab.delIsLast && !tab.delWasFirst, 'last=' + tab.delIsLast + ' first=' + tab.delWasFirst);

  /* WALK IT. Focus the first cell, then Tab and record where focus lands each
     time -- through every field of the card, onto its Delete, and then into the
     NEXT card's first field. */
  await page.evaluate(() => {
    const c = document.querySelector('.aud .ed');
    c.focus();
  });
  const firstField = await page.evaluate(() => {
    const c = document.querySelector('.aud .ed');
    return c.dataset.field || c.className;
  });
  const walk = [];
  for (let i = 0; i < tab.cells + 2; i += 1) {
    walk.push(await page.evaluate(() => {
      const a = document.activeElement;
      if (!a) return 'none';
      const cell = a.tagName === 'INPUT' ? a.closest('.ed') : a;
      const card = cell && cell.closest ? cell.closest('[data-row]') : null;
      const which = cell && cell.classList && cell.classList.contains('aud-delete')
        ? 'DELETE'
        : (cell && cell.dataset ? (cell.dataset.field || cell.className) : a.tagName);
      return (card ? card.dataset.row : '?') + ':' + which
        + (a.tagName === 'INPUT' ? '(editing)' : '');
    }));
    await page.keyboard.press('Tab');
  }
  const rows = walk.map((w) => w.split(':')[0]);
  const fields = walk.map((w) => w.split(':')[1]);
  /* IT STARTS ON A FIELD, NOT ON DELETE. */
  /* THE CARD'S OWN FIRST FIELD, whatever it happens to be -- which is the
     `primary` colour stripe, since the colour cube is the first thing on the
     badge. Naming a column here would be asserting the LAYOUT, and the claim is
     that Tab starts on a field rather than on Delete. */
  /* THE CARD'S OWN FIRST FIELD, whatever it happens to be -- which is the
     `primary` colour stripe, since the colour cube is the first thing on the
     badge. Naming a column here would be asserting the LAYOUT; the claim is
     that Tab starts on a field rather than on Delete, and that it OPENS it. */
  t('tabbing starts on the first field, not on Delete',
    (fields[0] || '').indexOf(firstField) === 0 && fields[0] !== 'DELETE'
      && /\(editing\)$/.test(walk[0] || ''), walk[0]);
  /* AND EVERY STOP IS AN EDITOR, which is what "tabs through fields" means: it
     lands IN the field ready to type rather than beside it. */
  t('and each stop opens that field for typing',
    walk.slice(1, tab.cells).every((w) => /\(editing\)$/.test(w)),
    walk.slice(0, 4).join(' -> '));
  /* DELETE IS THE LAST STOP ON THE CARD. */
  const delAt = fields.indexOf('DELETE');
  t('Delete is the last stop before the next card',
    delAt === tab.cells && rows[delAt] === rows[0],
    'at ' + delAt + ' of ' + tab.cells + ' | ' + walk.slice(-3).join(' -> '));
  /* AND THEN IT LEAVES FOR THE NEXT CARD. */
  t('and the next Tab moves to another card',
    delAt >= 0 && rows[delAt + 1] && rows[delAt + 1] !== rows[0],
    rows[0] + ' -> ' + rows[delAt + 1]);
  /* NO FIELD IS VISITED TWICE, which is what a stepper that walked a stale list
     would produce. */
  t('and no field is visited twice on the way',
    new Set(walk.slice(0, tab.cells)).size === tab.cells,
    walk.slice(0, tab.cells).join(' -> '));

  /* SHIFT+TAB WALKS BACK. */
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  const back = await page.evaluate(() => {
    const a = document.activeElement;
    const cell = a.tagName === 'INPUT' ? a.closest('.ed') : a;
    return cell && cell.classList.contains('aud-delete') ? 'DELETE'
      : (cell && cell.dataset ? cell.dataset.field : a.tagName);
  });
  t('Shift+Tab walks back', !!back && back !== 'BODY', back);

  /* FOCUS OPENS THE FIELD, which is what makes Tab behave like a form. There
     is deliberately no separate Enter-to-open: `focusin` means a cell can never
     be focused-but-closed, so a second path would be unreachable code. */
  const onFocus = await page.evaluate(async () => {
    document.activeElement && document.activeElement.blur();
    await new Promise((r) => setTimeout(r, 60));
    const c = document.querySelectorAll('.aud .ed')[3];
    const before = !c.querySelector('input');
    c.focus();
    await new Promise((r) => setTimeout(r, 60));
    return { before: before, after: !!c.querySelector('input'),
             field: c.dataset.field || '' };
  });
  t('focusing a field opens it', onFocus.before && onFocus.after,
    onFocus.field + ' before=' + onFocus.before + ' after=' + onFocus.after);
  await page.keyboard.press('Escape');

  /* THE RING. Without it the caret is nowhere and the page looks inert while
     the keyboard is working. `:focus-visible`, so a mouse click draws none. */
  const ring = await page.evaluate(() => {
    const sheet = [].slice.call(document.styleSheets)
      .filter((s) => { try { return !!s.cssRules; } catch (e) { return false; } });
    let found = '';
    sheet.forEach((s) => [].slice.call(s.cssRules).forEach((r) => {
      if (r.selectorText && /\.ed:focus-visible/.test(r.selectorText)) found = r.cssText;
    }));
    return found;
  });
  t('a focused field draws a ring', /outline/.test(ring) && /focus-visible/.test(ring),
    ring.slice(0, 60));

  /* THE COLOURED EDGE RUNS THE WHOLE HEIGHT, INCLUDING PAST THE FOOT. The edge
     is a 5px inset shadow and the foot is a full-width child with a background,
     so the black painted over it and the column of colour narrowed to a single
     pixel across the bottom of the card.
       MEASURED AS GEOMETRY, not as a declaration: the claim is where the foot
     STARTS relative to the card, and `margin-left` reads as correct whatever it
     resolves to. */
  const edge = await page.evaluate(() => {
    const card = document.querySelector('.aud');
    const foot = card.querySelector('.aud-id');
    if (!foot) return null;
    const cb = card.getBoundingClientRect(), fb = foot.getBoundingClientRect();
    const cs = getComputedStyle(card);
    const stripe = parseFloat((cs.boxShadow.match(/inset|([0-9.]+)px/) && cs.boxShadow) ? '5' : '0');
    return { gap: Math.round(fb.left - cb.left),
             rightFlush: Math.round(cb.right - fb.right),
             stripe: stripe };
  });
  /* 6 = the card's 1px border plus the 5px stripe. */
  t('the foot starts where the coloured edge ends', edge && edge.gap === 6,
    edge && (edge.gap + 'px from the card edge'));
  t('and is flush on the other side', edge && edge.rightFlush <= 1,
    edge && (edge.rightFlush + 'px'));

  t('no console errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  await page.screenshot({ path: 'C:/tmp/audiences-room.png', fullPage: false });
  console.log(String.fromCharCode(10) + '  ' + m.cards + ' badges, ' + m.perRow
    + ' across at ' + m.cardW + 'px; ' + m.fields + ' fields each; page '
    + m.docH + 'px, no sideways scroll; foot ' + m.pagerText);
  console.log('  screenshot: C:/tmp/audiences-room.png');

  await browser.close();
  console.log(String.fromCharCode(10) + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
