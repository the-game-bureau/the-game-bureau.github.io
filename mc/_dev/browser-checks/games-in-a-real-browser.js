// THE PAGE IN A REAL BROWSER.
//
// jsdom has no layout, no paint and no font matching, so it has now passed over
// four separate faults that all rendered as "nothing there". This drives real
// Chrome: it can answer the only question that matters, which is whether the
// pin occupies pixels on screen.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
// SERVED OVER HTTP, like Live Server. Under file:// the page's root-absolute
// paths (/shell/..., /mc/assets/...) cannot resolve at all, which is a fault
// of the harness rather than of the page.
const PAGE = 'http://127.0.0.1:5599/games/';

const REAL = JSON.parse(fs.readFileSync('C:/tmp/fx_live.json', 'utf8'));
const PTS = JSON.parse(fs.readFileSync('C:/tmp/fx_citypoints.json', 'utf8'));

let ok = 0, bad = 0;
const t = (n, c, got) => {
  if (c) { ok++; console.log('  ok  ' + n); }
  else { bad++; console.log('  FAIL ' + n + (got !== undefined ? '   got: ' + got : '')); }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--allow-file-access-from-files', '--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // The Supabase reads are stubbed; the CDN and the page's own scripts are not,
  // because whether Leaflet actually arrives is part of what is under test.
  await page.setRequestInterception(true);
  const seen = [];
  page.on('request', (req) => {
    const u = req.url();
    seen.push(u);
    if (u.indexOf('supabase.co') >= 0) {
      let body = [];
      if (u.indexOf('/waypoints') >= 0) body = PTS.map((p) => ({ city: p.c, lat: p.lat, lon: p.lon }));
      else if (u.indexOf('/games') >= 0) body = REAL;
      return req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    }
    req.continue();
  });

  await page.goto(PAGE, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2500));

  const shot = await page.evaluate(() => {
    const out = {};
    out.cards = document.querySelectorAll('.gm').length;
    out.leaflet = !!window.L;
    const mapEl = document.getElementById('map');
    const mr = mapEl.getBoundingClientRect();
    out.mapBox = { w: Math.round(mr.width), h: Math.round(mr.height) };
    out.tiles = document.querySelectorAll('.leaflet-tile').length;
    const icons = [...document.querySelectorAll('.leaflet-marker-icon')];
    out.markers = icons.length;
    out.note = (document.getElementById('mapnote') || {}).textContent || '';
    out.noteHidden = (document.getElementById('mapnote') || {}).hidden;
    out.pins = icons.map((i) => {
      const r = i.getBoundingClientRect();
      const pin = i.querySelector('.wp-pin');
      const b = i.querySelector('.wp-pin b');
      const mark = i.querySelector('.wp-mark svg');
      const cs = pin ? getComputedStyle(pin) : null;
      const bs = b ? getComputedStyle(b) : null;
      const rb = b ? b.getBoundingClientRect() : null;
      return {
        onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
                  && r.right > 0 && r.left < innerWidth,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        hasPin: !!pin, hasMark: !!mark,
        pinDisplay: cs && cs.display,
        bodyBg: bs && bs.backgroundColor,
        bodyRect: rb && { w: Math.round(rb.width), h: Math.round(rb.height) },
        vis: cs && cs.visibility, op: cs && cs.opacity
      };
    }).slice(0, 4);
    return out;
  });

  console.log('cards          : ' + shot.cards);
  console.log('Leaflet loaded : ' + shot.leaflet);
  console.log('map box        : ' + shot.mapBox.w + ' x ' + shot.mapBox.h);
  console.log('tiles          : ' + shot.tiles);
  console.log('markers        : ' + shot.markers);
  console.log('note           : ' + (shot.noteHidden ? '(hidden)' : shot.note.slice(0, 70)));
  shot.pins.forEach((p, i) => {
    console.log('  pin ' + i + '  onScreen=' + p.onScreen
      + '  rect=' + JSON.stringify(p.rect)
      + '  display=' + p.pinDisplay + '  body=' + JSON.stringify(p.bodyRect)
      + '  bg=' + p.bodyBg + '  mark=' + p.hasMark);
  });
  console.log('');

  t('the map has a real box', shot.mapBox.w > 100 && shot.mapBox.h > 100,
    shot.mapBox.w + 'x' + shot.mapBox.h);
  t('Leaflet loaded from the CDN', shot.leaflet);
  t('tiles are drawn (' + shot.tiles + ')', shot.tiles > 0);
  t('markers are in the document (' + shot.markers + ')', shot.markers > 0);
  if (shot.pins.length) {
    t('a pin has real pixels', shot.pins[0].rect.w > 0 && shot.pins[0].rect.h > 0,
      JSON.stringify(shot.pins[0].rect));
    t('its body is a 38px disc', shot.pins[0].bodyRect && shot.pins[0].bodyRect.w === 38,
      JSON.stringify(shot.pins[0].bodyRect));
    t('painted in a colour, not transparent',
      shot.pins[0].bodyBg && shot.pins[0].bodyBg.indexOf('rgba(0, 0, 0, 0)') < 0,
      shot.pins[0].bodyBg);
    t('and at least one pin is on screen',
      shot.pins.some((p) => p.onScreen));
  }

  await page.screenshot({ path: 'C:/tmp/games-real.png' });
  console.log('screenshot: C:/tmp/games-real.png');
  if (errors.length) console.log('PAGE ERRORS: ' + errors.slice(0, 4).join(' | '));
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
