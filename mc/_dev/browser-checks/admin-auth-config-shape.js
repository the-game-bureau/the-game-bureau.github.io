/* THE ROOM SUITES STUB TgbMcAdminAuth, so they are structurally incapable of
   noticing that the room calls it wrongly. This loads the REAL module and asks
   whether it accepted the config, which is the only thing that would have
   caught `supabaseUrl` being passed where `supabaseConfig` was wanted. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const AUTH = fs.readFileSync('C:/Code/the-game-bureau/mc/js/admin-auth.js', 'utf8');
// THE TRIVIA ROOM LEFT THIS LIST ON 2026-08-31 with the room itself; its
// questions are challenges now. A check naming a deleted page fails on the
// page being gone rather than on the fault it is for.
const ROOMS = ['routes', 'challenges', 'events', 'waypoints'];

let ok = 0, bad = 0;
const t = (m, c, got) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (got !== undefined ? '   got: ' + got : '')));

ROOMS.forEach((room) => {
  const file = 'C:/Code/the-game-bureau/mc/' + room + '/index.html';
  if (!fs.existsSync(file)) { console.log('  --   ' + room + ' has no index.html'); return; }
  const HTML = fs.readFileSync(file, 'utf8');

  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://x/mc/' + room + '/' });
  const w = dom.window, d = w.document;
  w.fetch = () => new Promise(() => {});           // never resolves: we only want boot
  w.TgbAdminSiteNav = { bindAuth: () => {} };

  let created = null;
  try { w.eval(AUTH); } catch (e) { t(room + ': admin-auth.js loads', false, e.message); return; }
  const realCreate = w.TgbMcAdminAuth.create;
  w.TgbMcAdminAuth = Object.assign({}, w.TgbMcAdminAuth, {
    create: (o) => { created = o; return realCreate(o); }
  });

  const script = [...d.querySelectorAll('script')].filter((s) => !s.src)
    .map((s) => s.textContent).join('\n');
  try { w.eval(script); } catch (e) { /* a later failure is not this check's business */ }

  t(room + ': calls TgbMcAdminAuth.create', !!created);
  if (!created) return;
  const c = created.supabaseConfig;
  t(room + ': passes supabaseConfig, not supabaseUrl/supabaseKey',
    !!c && !created.supabaseUrl && !created.supabaseKey,
    Object.keys(created).join(', '));
  t(room + ': the config carries url and publishableKey',
    !!(c && c.url && c.publishableKey), c ? Object.keys(c).join(', ') : 'none');

  /* THE PROOF, rather than the shape: the module must not have written its
     config-missing sentence into anything a person can READ.

     `body.textContent` INCLUDES <script> SOURCE IN JSDOM, so reading it here
     matched the page's own comment explaining this very bug and failed on two
     correct files. Scripts are stripped from a clone before asking. */
  const view = d.body.cloneNode(true);
  view.querySelectorAll('script').forEach((s) => s.remove());
  const said = /Supabase is not configured/.test(view.textContent);
  t(room + ': the module does not report the project as unconfigured', !said);
});

console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
