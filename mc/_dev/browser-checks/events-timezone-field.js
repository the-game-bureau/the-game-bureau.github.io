/* THE TIMEZONE IS A FIELD ON THE ROW, AND IT SAVES.
   Reads on to the live table; the PATCH is intercepted. */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json',
            '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon' };
let ok = 0, bad = 0;
const is = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

(async () => {
  const root = 'C:/Code/the-game-bureau';
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url, 'http://x');
    let f = path.join(root, decodeURIComponent(u.pathname));
    if (u.pathname.endsWith('/')) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
  });
  await new Promise((r) => srv.listen(9101, r));
  const br = await pup.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
                                args: ['--no-sandbox'], protocolTimeout: 180000 });
  try {
    const p = await br.newPage();
    await p.setViewport({ width: 1500, height: 1100 });
    const errs = [], noise = [], writes = [];
    p.on('pageerror', (e) => errs.push(String(e.message).split(String.fromCharCode(10))[0]));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') noise.push(m.text()); });
    await p.evaluateOnNewDocument(() => {
      window.__a = null;
      window.TgbMcAdminAuth = { create: (o) => { window.__a = o.onAuthorized;
        return { getSession: () => ({ access_token: 'p' }), init: () => {} }; } };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });
    await p.setRequestInterception(true);
    p.on('request', (q) => {
      const u = q.url(), m = q.method();
      const H = { 'access-control-allow-origin':'*','access-control-allow-headers':'*',
                  'access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS',
                  'access-control-expose-headers':'content-range' };
      if (u.indexOf('supabase.co') === -1) { q.continue(); return; }
      if (m === 'OPTIONS') { q.respond({ status: 204, headers: H }); return; }
      if (m === 'GET') { q.continue(); return; }
      writes.push({ m: m, u: u, b: q.postData() });
      let echo = '[]';
      try { echo = JSON.stringify([Object.assign({ id: 'x' }, JSON.parse(q.postData() || '{}'))]); }
      catch (e) { echo = '[]'; }
      q.respond({ status: 200, contentType: 'application/json', headers: H, body: echo });
    });

    await p.goto('http://127.0.0.1:9101/mc/events/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => { document.body.classList.add('mc-auth-authorized'); if (window.__a) await window.__a(); });
    await new Promise((r) => setTimeout(r, 18000));

    /* THE BAND GUARD RUNS ON LOAD AND SHOUTS IF A COLUMN HAS NO CONTROL. */
    const orphan = noise.filter((t) => /band|group|field/i.test(t));
    is('no column is left without a control', orphan.length === 0, orphan.slice(0, 3));

    /* OPEN A ROW AND READ THE WHEN BAND. */
    const band = await p.evaluate(() => {
      const head = document.querySelector('.event-row .event-caret') || document.querySelector('.event-row');
      if (head) head.click();
      const row = document.querySelector('.event-row.is-open') || document.querySelector('.event-row');
      const f = [...row.querySelectorAll('[data-field]')].map((x) => x.dataset.field);
      const tz = row.querySelector('[data-field="timezone"]');
      const lab = tz && tz.closest('label') ? tz.closest('label').textContent.trim()
        : (tz && tz.parentElement ? tz.parentElement.textContent.trim() : '');
      return { fields: f, present: !!tz, value: tz ? tz.value : null,
               label: lab.split(String.fromCharCode(10))[0].trim(),
               place: tz ? tz.getAttribute('placeholder') : null,
               afterStartTime: f.indexOf('timezone') === f.indexOf('start_time') + 1 };
    });
    console.log('   when-band fields: ' + band.fields.filter((f) =>
      ['start_date','end_date','start_time','timezone'].indexOf(f) !== -1).join(', '));
    console.log('   timezone reads   : ' + JSON.stringify(band.value) + '   label ' + JSON.stringify(band.label));

    is('the opened row has a timezone control', band.present);
    is('it sits directly after the start time', band.afterStartTime, band.fields.slice(0, 12));
    is('it shows the zone the row holds', !!band.value && band.value.indexOf('/') > 0, band.value);
    is('and it is labelled Timezone', band.label.indexOf('Timezone') !== -1, band.label);
    is('with an IANA placeholder', String(band.place || '').indexOf('/') > 0, band.place);

    /* TYPE A ZONE AND SAVE. */
    await p.evaluate(() => {
      const row = document.querySelector('.event-row.is-open');
      const tz = row.querySelector('[data-field="timezone"]');
      tz.value = 'Europe/Lisbon';
      tz.dispatchEvent(new Event('input', { bubbles: true }));
      tz.dispatchEvent(new Event('change', { bubbles: true }));
      const save = [...row.querySelectorAll('button')].filter((b) => /save/i.test(b.textContent))[0];
      if (save) save.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    const patch = writes.filter((w) => w.m === 'PATCH').pop();
    let sent = null;
    try { sent = patch ? JSON.parse(patch.b) : null; } catch (e) { sent = null; }
    is('saving the row sends the timezone', !!sent && sent.timezone === 'Europe/Lisbon',
       sent ? sent.timezone : (patch ? patch.b : 'no PATCH'));
    is('no page errors', errs.length === 0, errs.slice(0, 3));
  } finally { await br.close(); srv.close(); }
  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
