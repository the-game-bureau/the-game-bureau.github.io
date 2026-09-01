/* THE GUIDE BAR IS SPLIT, AND THE DOOR SITS BESIDE THE PICKER.
   ---------------------------------------------------------------------------
   Every claim here is about LAYOUT -- which box is left of which, whether the
   portrait is centred in its own panel, whether the door shares a line with the
   select -- and jsdom has no layout at all. It would pass over every one of
   them, which is the lesson this project has recorded six times.

   THE CENTRING IS MEASURED AS FOUR GAPS, not read off a property. `centred and
   middled` is two declarations and one alone still LOOKS deliberate: comparing
   the slack on each side is the only thing that catches having set just one. */
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon' };

let ok = 0, fail = 0;
const is = (what, cond, got) => {
  if (cond) { ok += 1; console.log('  ok   ' + what); }
  else { fail += 1; console.log('  FAIL ' + what + (got === undefined ? '' : '   got: ' + JSON.stringify(got))); }
};

(async () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const server = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => server.listen(8874, r));
  const br = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox'] });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => ({ access_token: 'anon' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    /* READS GO THROUGH; NOTHING IS WRITTEN. A layout check has no business
       touching the database, and a probe that let a save through once cost a
       real game its clubs. */
    await p.setRequestInterception(true);
    p.on('request', (req) => {
      const u = req.url();
      if (u.indexOf('supabase.co') === -1 || req.method() === 'GET' || req.method() === 'OPTIONS') { req.continue(); return; }
      req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                   'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' }, body: '[]' });
    });

    await p.goto('http://127.0.0.1:8874/mc/games/?id=nor2026car1', { waitUntil: 'networkidle2' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await new Promise((r) => setTimeout(r, 9000));

    const m = await p.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
                 right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
      const mid = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.y + r.height / 2); };
      const shot = document.getElementById('guidePickShot');
      const img = document.getElementById('guidePickImage');
      const sel = document.getElementById('nodeGuideSelect');
      const door = document.getElementById('guideGreenroomBtn');
      const row = document.querySelector('.guide-pick-row');
      if (!shot || !img || !sel || !door || !row) return null;
      const cs = getComputedStyle(shot);
      const ci = getComputedStyle(img);
      return {
        shot: box(shot), img: box(img), sel: box(sel), door: box(door), row: box(row),
        shotBg: cs.backgroundColor,
        objectFit: ci.objectFit,
        imgDisplay: ci.display,
        doorWhiteSpace: getComputedStyle(door).whiteSpace,
        imgComplete: img.complete && img.naturalWidth > 0,
        mids: { shot: mid(shot), sel: mid(sel), door: mid(door) },
        tops: { shot: Math.round(shot.getBoundingClientRect().y), sel: Math.round(sel.getBoundingClientRect().y) },
        statusDisplay: getComputedStyle(document.getElementById('guidePickStatus')).display,
        pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
    is('the guide bar is on the page', !!m);
    if (!m) throw new Error('no guide bar');

    /* ---- SPLIT: image left, controls right ---- */
    is('the portrait is left of the picker', m.shot.right <= m.sel.x, { shotRight: m.shot.right, selX: m.sel.x });
    is('the panel stretches to the controls beside it',
       m.shot.h >= m.row.h - 2, { panel: m.shot.h, row: m.row.h });

    /* ---- WHITE ---- */
    is('the panel is white', /^rgba?\(255,\s*255,\s*255(,\s*1)?\)$/.test(m.shotBg), m.shotBg);

    /* ---- CENTRED AND MIDDLED: four gaps, not one property ---- */
    is('the image is contained, not cropped', m.objectFit === 'contain', m.objectFit);
    is('the image is a block box', m.imgDisplay === 'block', m.imgDisplay);
    const left = m.img.x - m.shot.x;
    const right = m.shot.right - m.img.right;
    const top = m.img.y - m.shot.y;
    const bottom = m.shot.bottom - m.img.bottom;
    is('the image is centred across', Math.abs(left - right) <= 1, { left: left, right: right });
    is('the image is middled down', Math.abs(top - bottom) <= 1, { top: top, bottom: bottom });
    is('the image is inside its panel', left >= 0 && right >= 0 && top >= 0 && bottom >= 0,
       { left: left, right: right, top: top, bottom: bottom });

    /* ---- THE DOOR BESIDE THE PICKER ---- */
    is('the door is right of the dropdown', m.door.x >= m.sel.right, { doorX: m.door.x, selRight: m.sel.right });
    is('the door shares a line with the dropdown',
       m.door.y < m.sel.bottom && m.sel.y < m.door.bottom, { door: m.door, sel: m.sel });
    is('the door does not wrap', m.doorWhiteSpace === 'nowrap' && m.door.h <= 44, { ws: m.doorWhiteSpace, h: m.door.h });
    is('the dropdown still has real width', m.sel.w >= 120, m.sel.w);

    /* ---- ALIGNED: the dropdown starts where the frame starts ----
       The select and the door are centred against EACH OTHER, which is a
       regression guard rather than something that was ever wrong. What moved is
       the pair against the portrait: centred earlier the same day, then aligned
       to the top, which is what was asked for. */
    is('the dropdown and the door share a centreline',
       Math.abs(m.mids.sel - m.mids.door) <= 1, m.mids);
    /* TOP-ALIGNED (2026-08-31), which reverses the centring made earlier the
       same day and is what was asked for. THIS ASSERTION WAS CORRECTLY BROKEN
       by that and is updated rather than worked around: it compared the two
       CENTRELINES, which was true of the arrangement it was written for and is
       false of this one. The dropdown now starts where the frame starts. */
    is('the dropdown starts at the top of the frame',
       Math.abs(m.tops.sel - m.tops.shot) <= 1, m.tops);
    is('an empty status takes no room', m.statusDisplay === 'none', m.statusDisplay);

    is('the page does not scroll sideways', !m.pageScrollsSideways);

    /* ---- IT STILL FITS ITS FIELD AT A NARROWER WINDOW ---- */
    await p.setViewport({ width: 1100, height: 1000 });
    await new Promise((r) => setTimeout(r, 600));
    const n = await p.evaluate(() => {
      const b = (id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect();
        return { x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y), bottom: Math.round(r.bottom) }; };
      return { sel: b('nodeGuideSelect'), door: b('guideGreenroomBtn'),
               wide: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    is('at 1100px the door is still beside the dropdown', n.door.x >= n.sel.right, n);
    is('at 1100px the page still does not scroll sideways', !n.wide);
  } finally { await br.close(); server.close(); }
  console.log('');
  console.log(ok + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
