/* THE TAPE ROW INSIDE AN OPEN GAME, in a real browser, against real shapes.

   WHY PUPPETEER AND NOT jsdom. This page has recorded FOUR separate ways a row
   can be correct in the markup and invisible on screen -- an inline box whose
   size was ignored, a glyph in the colour behind it, a glyph with no font, and
   a container 43,376 pixels tall. Every one of them passed a markup assertion.
   So this reads getComputedStyle and getBoundingClientRect.

   IT IS SERVED OVER HTTP, NEVER file://. The page's cross-folder links are
   root-absolute (/shell/..., /mc/assets/...) and under file:// none of them
   resolves -- a first run of the sibling check reported 0 cards and that was
   the harness, not the page. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* WCAG relative luminance, so the readability question is answered with a
   number rather than by eye. */
function rgb(v) {
  const m = String(v).match(/\d+(\.\d+)?/g) || [];
  return [Number(m[0] || 0), Number(m[1] || 0), Number(m[2] || 0)];
}
function lum(v) {
  const c = rgb(v).map((n) => {
    const x = n / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
                '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
                '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

/* ---- the fixtures, in the shapes production actually returns ------------- */
const GAME = {
  id: 'g-nola', name: 'Chicago Fans Takeover New Orleans', city: 'New Orleans, Louisiana',
  archived: null, erased: null, status: 'live', price: '30', tagline: 'A walk',
  away_team_city: 'Chicago', away_team_mascot: 'Bears',
  home_team_city: 'New Orleans', home_team_mascot: 'Saints',
  primary_color: '#0B162A', secondary_color: '#C83803', category_icon: 'football'
};
const DENVER = Object.assign({}, GAME, {
  id: 'g-den', name: 'Bears Fans Takeover Denver', city: 'Denver, Colorado',
  home_team_city: 'Denver', home_team_mascot: 'Broncos'
});
/* A CITY WITH NO TAPE IS THE COMMON CASE -- 24 of the 54 game cities. */
const BILOXI = Object.assign({}, GAME, {
  id: 'g-bil', name: 'Biloxi Walk', city: 'Biloxi, Mississippi',
  away_team_city: '', away_team_mascot: '', home_team_city: 'Biloxi', home_team_mascot: ''
});

const NOLA_TRACKS = [];
['Who Dat', 'Brass', 'Trad Jazz', '(More than Jazz)'].forEach((tp) => {
  for (let i = 1; i <= 15; i++) {
    NOLA_TRACKS.push({ city_slug: 'new-orleans', tape: tp, position: i, title: tp + ' ' + i, artist: 'Someone' });
  }
});
const DEN_TRACKS = [];
for (let i = 1; i <= 14; i++) {
  DEN_TRACKS.push({ city_slug: 'denver', tape: 'Jams', position: i, title: 'Denver ' + i, artist: 'Someone' });
}

(async () => {
  const root = process.cwd();
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
  await new Promise((r) => server.listen(8794, r));

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox']
  });
  const seen = [];
  try {
    const p = await browser.newPage();
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1) { req.continue(); return; }
      /* RECORD THE METHOD TOO. Every one of these is a preflighted request (the
         `apikey` header makes it so), so counting URLs alone counts each one
         twice -- which reads exactly like the page asking twice. */
      seen.push(req.method() + ' ' + u);
      const send = (body) => req.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        body: JSON.stringify(body)
      });
      if (req.method() === 'OPTIONS') { send([]); return; }
      if (u.indexOf('/games?') !== -1) { send([GAME, DENVER, BILOXI]); return; }
      if (u.indexOf('gift_shop_listings') !== -1) {
        send([{ archived: false, city: 'x', gift_shop_items: {
          id: 'gift-1', title: 'A Book', image_url: '', archived: false,
          certified_at: '2026-01-01', rejected_at: null } }]);
        return;
      }
      if (u.indexOf('/soundtrack?') !== -1) {
        /* `URLSearchParams` EMITS A SPACE AS `+` AND `decodeURIComponent` DOES
           NOT DECODE IT. PostgREST does, so `city=eq.New+Orleans,+Louisiana`
           matches the real row -- but a stub matching on the decoded string
           silently misses every city with a space in its name, which is most of
           them. This harness reported a page fault that was its own once
           already today, on the Stop Builder's delete. */
        const q = decodeURIComponent(u.replace(/\+/g, ' '));
        if (q.indexOf('New Orleans') !== -1) { send(NOLA_TRACKS); return; }
        if (q.indexOf('Denver') !== -1) { send(DEN_TRACKS); return; }
        send([]); return;
      }
      send([]);
    });
    /* THE SHOP GETS A REAL ROW TOO. The whole point of the metrics assertion is
       that the two rows sit together, so comparing against an empty shop would
       be comparing against nothing. */

    await p.goto('http://127.0.0.1:8794/games/', { waitUntil: 'networkidle0' });

    const open = async (gid) => {
      /* THE CARD IS A <button class="gm"> carrying `data-game-id`, and pressing
         it is what opens the game -- driven the way somebody uses it rather
         than by calling the page's own internals. */
      await p.evaluate((id) => {
        const el = document.querySelector('.gm[data-game-id="' + id + '"]');
        if (!el) throw new Error('no card for ' + id + ' (cards: '
          + [...document.querySelectorAll('.gm')].map((n) => n.dataset.gameId).join(',') + ')');
        el.click();
      }, gid);
      await new Promise((r) => setTimeout(r, 400));
    };

    /* ---- a city with four tapes ------------------------------------------ */
    await open('g-nola');
    const nola = await p.evaluate(() => {
      const box = document.querySelector('.gm-tapes');
      if (!box) return { none: true };
      const cards = [...box.querySelectorAll('.gm-tape')];
      const first = cards[0];
      const mark = first && first.querySelector('.gm-tape-mark');
      const art = first && first.querySelector('.gm-tape-art');
      const svg = mark && mark.querySelector('svg');
      const r = first ? first.getBoundingClientRect() : { width: 0, height: 0 };
      const mr = mark ? mark.getBoundingClientRect() : { width: 0, height: 0 };
      const gift = document.querySelector('.gm-gift:not(.gm-tape)');
      return {
        hidden: box.hidden,
        label: box.querySelector('.gm-shop-label span').textContent,
        allText: box.querySelector('.gm-shop-all').textContent,
        allHref: box.querySelector('.gm-shop-all').getAttribute('href'),
        n: cards.length,
        names: cards.map((c) => c.querySelector('.gm-gift-name').textContent),
        hrefs: [...new Set(cards.map((c) => c.getAttribute('href')))],
        title: first && first.getAttribute('title'),
        markDisplay: mark ? getComputedStyle(mark).display : '',
        artColor: art ? getComputedStyle(art).color : '',
        artBg: art ? getComputedStyle(art).backgroundColor : '',
        hasSvg: !!svg,
        svgDisplay: svg ? getComputedStyle(svg).display : '',
        w: Math.round(r.width), h: Math.round(r.height),
        mw: Math.round(mr.width), mh: Math.round(mr.height),
        radiusMatches: !!gift && getComputedStyle(gift).borderRadius === getComputedStyle(first).borderRadius,
        nameFontMatches: !!gift
          && getComputedStyle(gift.querySelector('.gm-gift-name')).fontSize
             === getComputedStyle(first.querySelector('.gm-gift-name')).fontSize
      };
    });

    t('the tape row is drawn', !nola.none && !nola.hidden, JSON.stringify(nola).slice(0, 90));
    t('four tapes', nola.n === 4, nola.n);
    t('each is named, in the order the city holds them',
      nola.names.join(',') === 'Who Dat,Brass,Trad Jazz,(More than Jazz)', nola.names.join(','));
    /* THE HEADING FOLLOWS THE COUNT, or four tapes sit under "the soundtrack". */
    t('the heading is plural for four', nola.label === 'New Orleans soundtracks', nola.label);
    t('the way out says Hear it', nola.allText === 'Hear it', nola.allText);
    /* THE DEEP LINK IS BY CITY SLUG, never by tape: a key like `denver--204` is
       not a city, and the hash contract on the public page is a city. */
    t('and goes to the city slug', nola.allHref === '/soundtracks/#new-orleans', nola.allHref);
    t('every tape points at the same place, which is the honest answer',
      nola.hrefs.length === 1 && nola.hrefs[0] === '/soundtracks/#new-orleans', nola.hrefs.join(' '));
    t('a tape says how many tracks it holds', /15 tracks/.test(nola.title || ''), nola.title);

    /* ---- the four ways this page has made a row invisible ---------------- */
    t('the card has a real size', nola.w > 0 && nola.h > 0, nola.w + 'x' + nola.h);
    /* A SPAN IS INLINE BY DEFAULT AND ITS WIDTH IS IGNORED. This page lost a
       whole pin to exactly that, with 35 assertions passing over it. */
    t('the mark is not an inline box', nola.markDisplay === 'block', nola.markDisplay);
    t('and it has a real size too', nola.mw > 10 && nola.mh > 6, nola.mw + 'x' + nola.mh);
    /* DRAWN, NOT TYPED: no face this site loads carries an emoji glyph, so a
       character is a picture on some machines and tofu on others. */
    t('the cassette is a drawn svg', nola.hasSvg);
    t('and the svg is a block, or its baseline sits it low in the tile',
      nola.svgDisplay === 'block', nola.svgDisplay);
    /* CONTRAST, NOT MERELY DIFFERENCE. "Not the same colour as its background"
       is true of a navy cassette on a near-black tile and says nothing: the
       first cut of this passed while the mark was invisible at 1.3:1. */
    t('the mark is readable against its tile',
      contrast(nola.artColor, nola.artBg) >= 3,
      contrast(nola.artColor, nola.artBg).toFixed(2) + ':1  '
      + nola.artColor + ' on ' + nola.artBg);
    /* THE TWO ROWS SIT A FEW PIXELS APART. Drawn to two scales they read as two
       different kinds of thing. */
    t('it wears the gift card metrics', nola.radiusMatches && nola.nameFontMatches);

    /* ---- one tape --------------------------------------------------------- */
    await open('g-den');
    const den = await p.evaluate(() => {
      const box = document.querySelector('.gm-tapes');
      if (!box || box.hidden) return { none: true };
      return {
        label: box.querySelector('.gm-shop-label span').textContent,
        n: box.querySelectorAll('.gm-tape').length,
        href: box.querySelector('.gm-shop-all').getAttribute('href')
      };
    });
    t('one tape reads singular', den.label === 'The Denver soundtrack', den.label);
    t('and draws one card', den.n === 1, den.n);
    t('with its own slug', den.href === '/soundtracks/#denver', den.href);

    /* ---- a city with no tape ---------------------------------------------- */
    /* 24 OF THE 54 GAME CITIES HAVE NONE, so this is the common case rather
       than an edge. A row that drew an empty strip would open a gap under every
       one of them. */
    await open('g-bil');
    const bil = await p.evaluate(() => {
      const box = document.querySelector('.gm-tapes');
      return { present: !!box, hidden: box ? box.hidden : null,
               h: box ? Math.round(box.getBoundingClientRect().height) : -1 };
    });
    t('a city with no tape draws nothing', bil.hidden === true, JSON.stringify(bil));
    t('and takes no height', bil.h === 0, bil.h);

    /* ---- the request itself ----------------------------------------------- */
    const st = seen.filter((u) => u.indexOf('/soundtrack?') !== -1 && u.indexOf('GET ') === 0);
    t('it asked the soundtrack table', st.length > 0, st.length);
    /* `select=*` ANSWERS 401 FOR THE WHOLE REQUEST, because `findings` is kept
       out of the anon grant per column. Do not put * back -- that is the privacy
       boundary, not tidiness. */
    t('it names its columns, never *', st.every((u) => u.indexOf('select=*') === -1));
    t('and never asks for findings', st.every((u) => u.indexOf('findings') === -1));
    t('it filters on live tracks, the public page own test',
      st.every((u) => u.indexOf('archived=eq.false') !== -1));
    /* NOTHING IS FETCHED UNTIL A GAME IS OPENED, and each city is asked once. */
    t('one request per city, cached after that',
      new Set(st).size === st.length && st.length === 3,
      st.length + ' calls, ' + new Set(st).size + ' distinct');

    /* ---- and reopening a city asks nothing ------------------------------- */
    const before = st.length;
    await open('g-nola');
    const after = seen.filter((u) => u.indexOf('/soundtrack?') !== -1 && u.indexOf('GET ') === 0).length;
    t('reopening a game asks the catalogue nothing', after === before, before + ' -> ' + after);

    /* AND LOOK AT IT. The validator checks structure and computed style; a
       screenshot is what catches a row that is technically right and reads
       wrong beside the one above it. */
    /* A SECOND PRESS CLOSES A CARD -- the card is its own way out -- so this
       opens until the one it wants is the open one rather than pressing blind. */
    const openId = () => p.evaluate(() => {
      const c = document.querySelector('.gm.is-open');
      return c ? c.dataset.gameId : '';
    });
    if (await openId() !== 'g-nola') await open('g-nola');
    const shot = (await openId()) === 'g-nola';
    if (shot) {
      await p.evaluate(() => document.querySelector('.gm.is-open').scrollIntoView({ block: 'center' }));
      await new Promise((r) => setTimeout(r, 250));
      const card = await p.$('.gm.is-open');
      if (card) await card.screenshot({ path: 'C:/tmp/games-tape-row.png' });
      console.log('  screenshot: C:/tmp/games-tape-row.png');
    }

    console.log('');
    console.log(ok + ' ok, ' + bad + ' FAIL');
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(bad ? 1 : 0);
})();
