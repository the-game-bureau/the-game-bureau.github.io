/* ATLASES. An ordered list of stops, and a stop may be in several.
   These read the built DOM and the requests actually sent: a correct markup
   string proves nothing about what a viewer sees or what reached the database. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const HTML = fs.readFileSync('mc/atlases/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const WP = [
  { wpid: 101, name: 'Cloud Gate', city: 'Chicago', state: 'IL', address: '201 E Randolph St' },
  { wpid: 103, name: 'Jackson Square', city: 'New Orleans', state: 'LA', address: '701 Decatur St' }
];
const CH = [{ id: 7, name: 'Sing the fight song', kind: 'minigame' }];
const STOPS = [
  { id: 1, city: 'Chicago, IL', waypoint_id: 101, challenge_id: 7 },
  { id: 2, city: 'New Orleans, LA', waypoint_id: 103, challenge_id: null }
];
/* THE SAME STOP IN TWO ATLASES, which is the whole reason this table exists and
   the reason a stop needed a single-column identity to be pointed at. */
let ROWS = [
  { atlas_id: 'murder-map', atlas_name: 'Murder Map', stop_id: 1, stop_number: 1 },
  { atlas_id: 'murder-map', atlas_name: 'Murder Map', stop_id: 2, stop_number: 2 },
  { atlas_id: 'jazz-walk',  atlas_name: 'Jazz Walk',  stop_id: 2, stop_number: 1 }
];

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true,
                              url: 'https://x/mc/atlases/' });
const w = dom.window, d = w.document;
const sent = [];

w.fetch = (url, opt) => {
  const u = String(url), m = (opt && opt.method) || 'GET';
  const headers = (opt && opt.headers) || {};
  sent.push({ url: u, method: m, body: opt && opt.body, headers: headers });
  const from = Number(String(headers.Range || '0-999').split('-')[0]);
  const reply = (rows) => Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(from ? [] : rows),
    text: () => Promise.resolve(JSON.stringify(rows))
  });
  const key = () => {
    // `+` IS A SPACE in a query string: URLSearchParams emits it and PostgREST
    // decodes it. A stub that gets this wrong reports a page fault that is its
    // own, which has already happened once in this repo.
    const a = decodeURIComponent(((u.match(/atlas_id=eq\.([^&]*)/) || [])[1] || '')
      .split('+').join(' '));
    const n = Number((u.match(/stop_number=eq\.(\d+)/) || [])[1]);
    return { a, n };
  };
  if (m === 'POST') {
    const row = JSON.parse(opt.body);
    // THE DATABASE ADOPTS THE NAME an atlas already has; the stub models that,
    // or the room could appear to set a second name and no check would see it.
    const known = ROWS.filter((r) => r.atlas_id === row.atlas_id)[0];
    if (known) row.atlas_name = known.atlas_name;
    ROWS.push(row);
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve([row]),
                             text: () => Promise.resolve('') });
  }
  if (m === 'PATCH') {
    const { a, n } = key();
    const patch = JSON.parse(opt.body);
    const hit = ROWS.filter((r) => r.atlas_id === a && r.stop_number === n);
    // A TRIGGER PROPAGATES A RENAME to every row of the atlas. Modelled, because
    // the room patches ONE row and relies on it.
    if (patch.atlas_name) {
      ROWS.forEach((r) => { if (r.atlas_id === a) r.atlas_name = patch.atlas_name; });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hit),
                             text: () => Promise.resolve('') });
  }
  if (m === 'DELETE') {
    const { a, n } = key();
    const gone = ROWS.filter((r) => r.atlas_id === a && r.stop_number === n);
    ROWS = ROWS.filter((r) => !(r.atlas_id === a && r.stop_number === n));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(gone),
                             text: () => Promise.resolve('') });
  }
  if (u.indexOf('/atlases?') !== -1) return reply(ROWS);
  if (u.indexOf('/stops?') !== -1) return reply(STOPS);
  if (u.indexOf('/waypoints?') !== -1) return reply(WP);
  if (u.indexOf('/challenges?') !== -1) return reply(CH);
  return reply([]);
};
let authorized = null;
w.TgbMcAdminAuth = { create: (o) => { authorized = o.onAuthorized;
  return { getSession: () => ({ access_token: 'x' }), init: () => {} }; } };
w.TgbAdminSiteNav = { bindAuth: () => {} };
w.confirm = () => true;

const script = [...d.querySelectorAll('script')].filter((s) => !s.src)
  .map((s) => s.textContent).join(String.fromCharCode(10));
try { w.eval(script); } catch (e) { t('the page boots', false, e.message); }

const el = (id) => d.getElementById(id);
const boxes = () => [...d.querySelectorAll('.atlas')];
/* FOUND BY ID, NEVER BY POSITION. The list is sorted by atlas_id, so adding a
   row can move which box is first -- and the first run of this suite asserted
   against index 0 and reported a page fault that was its own. */
const boxOf = (id) => d.querySelector('.atlas[data-atlas="' + id + '"]');
const stopsOf = (id) => [...boxOf(id).querySelectorAll('.astop')];
const posts = () => sent.filter((x) => x.method === 'POST');
const fire = (n, e) => n.dispatchEvent(new w.Event(e, { bubbles: true }));
const click = (n) => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

t('the title is a question mark, never a zero', el('roomTitle').textContent.indexOf('?') === 0,
  el('roomTitle').textContent);

authorized().then(() => setTimeout(() => {
  /* ---- grouped, not a flat list ------------------------------------------ */
  t('two atlases', boxes().length === 2, boxes().length);
  t('the title counts atlases, not rows', el('roomTitle').textContent.indexOf('2 ATLAS') === 0,
    el('roomTitle').textContent);
  t('and the panel counts the stops', /3 stops/.test(el('listCount').textContent),
    el('listCount').textContent);
  t('the first atlas holds its two stops, in order',
    stopsOf('murder-map').map((s) => s.querySelector('.astop-num').textContent).join(',') === '1,2',
    stopsOf('murder-map').map((s) => s.querySelector('.astop-num').textContent).join(','));

  /* THE SAME STOP IN TWO ATLASES is the whole point of the table. */
  t('the same stop appears in both atlases',
    /Jackson Square/.test(stopsOf('murder-map')[1].textContent) && /Jackson Square/.test(stopsOf('jazz-walk')[0].textContent));

  /* ---- a stop row wears the Stop Builder's two hues ---------------------- */
  const halves = stopsOf('murder-map')[0].querySelectorAll('.astop-half');
  t('each stop shows a waypoint half and a challenge half', halves.length === 2, halves.length);
  t('waypoint first, challenge second',
    halves[0].querySelector('.astop-kicker').textContent === 'Waypoint'
    && halves[1].querySelector('.astop-kicker').textContent === 'Challenge');
  t('and they are equal columns, as in the Stop Builder',
    w.getComputedStyle(stopsOf('murder-map')[0]).gridTemplateColumns === '44px minmax(110px, max-content) 1fr 1fr auto',
    w.getComputedStyle(stopsOf('murder-map')[0]).gridTemplateColumns);
  const rnd = stopsOf('murder-map')[1].querySelectorAll('.astop-half')[1];
  t('a stop with no challenge reads RANDOM, not an empty half',
    /RANDOM/.test(rnd.textContent) && rnd.querySelector('.astop-name').classList.contains('is-random'));

  /* ---- the name is edited on the atlas, not on a stop -------------------- */
  t('the name is an input on the atlas head', !!boxOf('murder-map').querySelector('.atlas-name-input'));
  t('and no stop row carries one',
    stopsOf('murder-map').every((s) => !s.querySelector('.atlas-name-input')));

  const before = posts().length;

  /* ---- ADDING TO AN ATLAS YOU ARE LOOKING AT ---------------------------- */
  const addBtnOf = (id) => boxOf(id).querySelector('.atlas-add');
  t('every atlas carries its own Add a stop', boxes().every((b) => !!b.querySelector('.atlas-add')));
  t('and it is in the head, at the far end, so it is in the same place on each',
    boxes().every((b) => b.querySelector('.atlas-head > .atlas-add')));

  click(addBtnOf('jazz-walk'));
  t('pressing it aims the form at THAT atlas', el('atlasInput').value === 'jazz-walk',
    el('atlasInput').value);
  /* IT FIRES THE INPUT HANDLER rather than copying what it does, so the name
     fills and locks exactly as it would if you had typed the key. */
  t('the name fills and locks itself',
    el('nameInput').value === 'Jazz Walk' && el('nameInput').readOnly,
    el('nameInput').value + ' readOnly=' + el('nameInput').readOnly);
  t('the stop and number boxes are cleared for the new one',
    el('stopInput').value === '' && el('numInput').value === '');
  t('and it says which atlas it is adding to',
    /Adding to Jazz Walk/.test(el('pageStatus').textContent), el('pageStatus').textContent);
  t('it writes nothing by itself', posts().length === before,
    posts().length - before);

  /* THE ONE FORM, AIMED. A second inline form would be a second write path. */
  t('there is exactly one add form on the page',
    d.querySelectorAll('.atlas-form').length === 1,
    d.querySelectorAll('.atlas-form').length);

  /* ---- adding ------------------------------------------------------------ */
  el('atlasInput').value = ''; el('stopInput').value = 'Cloud Gate - Chicago, IL';
  click(el('addBtn'));
  t('no atlas key is refused, and nothing is sent',
    posts().length === before && /needs a key/.test(el('pageStatus').textContent),
    el('pageStatus').textContent);

  el('atlasInput').value = 'murder-map'; fire(el('atlasInput'), 'input');
  t('a known atlas fills its name and locks it, since the database keeps the one it has',
    el('nameInput').value === 'Murder Map' && el('nameInput').readOnly,
    el('nameInput').value + ' readOnly=' + el('nameInput').readOnly);

  el('stopInput').value = 'Not A Real Stop';
  click(el('addBtn'));
  t('a stop the list does not hold is refused',
    posts().length === before && /No stop called/.test(el('pageStatus').textContent),
    el('pageStatus').textContent);

  /* BLANK MEANS THE END OF THE WALK, which saves counting. */
  el('stopInput').value = 'Cloud Gate - Chicago, IL';
  el('numInput').value = '';
  click(el('addBtn'));
  setTimeout(() => {
    const last = posts()[posts().length - 1];
    const body = JSON.parse(last.body);
    t('a blank number goes on the end', body.stop_number === 3, body.stop_number);
    t('the row carries exactly the four fields',
      Object.keys(body).sort().join(',') === 'atlas_id,atlas_name,stop_id,stop_number',
      Object.keys(body).join(','));
    t('and the stop by its id', body.stop_id === 1, body.stop_id);
    /* THE CHAIN CLOSES HERE: the form names an atlas, and the write goes to
       THAT atlas rather than making a new one. Aiming the form is proved above;
       this is the other half. */
    t('the write goes to the atlas the form names, not a new one',
      body.atlas_id === 'murder-map', body.atlas_id);
    t('and takes the name that atlas already has',
      body.atlas_name === 'Murder Map', body.atlas_name);
    t('it asks for the row back, or a refused write reports success',
      String(last.headers.Prefer).indexOf('return=representation') !== -1);
    t('the atlas now has three stops', stopsOf('murder-map').length === 3, stopsOf('murder-map').length);

    /* ---- renaming ------------------------------------------------------- */
    const nameBox = boxOf('murder-map').querySelector('.atlas-name-input');
    nameBox.value = 'The Murder Map';
    fire(nameBox, 'change');
    setTimeout(() => {
      const patch = sent.filter((x) => x.method === 'PATCH').pop();
      t('a rename patches ONE row and lets the database do the rest',
        !!patch && /stop_number=eq\./.test(patch.url), patch && patch.url);
      t('and every row of the atlas follows',
        ROWS.filter((r) => r.atlas_id === 'murder-map').every((r) => r.atlas_name === 'The Murder Map'));
      t('the head shows the new name',
        boxOf('murder-map').querySelector('.atlas-name-input').value === 'The Murder Map');
      t('the OTHER atlas is untouched',
        boxOf('jazz-walk').querySelector('.atlas-name-input').value === 'Jazz Walk');

      /* ---- removing a stop from an atlas ---------------------------------- */
      const n = stopsOf('murder-map').length;
      click(stopsOf('murder-map')[0].querySelector('.astop-del'));
      setTimeout(() => {
        const del = sent.filter((x) => x.method === 'DELETE').pop();
        t('the delete filters on the atlas AND the number, which is the key',
          del.url.indexOf('atlas_id=eq.') !== -1 && del.url.indexOf('stop_number=eq.') !== -1,
          del.url);
        t('the row is gone from the atlas', stopsOf('murder-map').length === n - 1, stopsOf('murder-map').length);
        /* TAKING A STOP OUT OF ONE ATLAS LEAVES IT IN THE OTHERS, which is the
           difference between an atlas and a copy of the stops. */
        t('and the stop is still in the other atlas', stopsOf('jazz-walk').length === 1, stopsOf('jazz-walk').length);
        t('the notice says the numbers after it are unchanged',
          /numbers after it are unchanged/.test(el('pageStatus').textContent),
          el('pageStatus').textContent);

        /* ---- search --------------------------------------------------------- */
        el('q').value = 'jazz'; fire(el('q'), 'input');
        t('search reaches the atlas name', boxes().length === 1, boxes().length);
        el('q').value = 'jackson'; fire(el('q'), 'input');
        t('and reaches a waypoint inside an atlas', boxes().length >= 1, boxes().length);
        click(el('clearBtn'));
        t('Clear puts them back', boxes().length === 2, boxes().length);

        /* ---- what it must never do ------------------------------------------ */
        t('it does not offer trivia as a stop challenge',
          sent.some((x) => x.url.indexOf('/challenges?') !== -1
                        && x.url.indexOf('kind=neq.trivia') !== -1));
        t('no request named public.cities',
          !sent.some((x) => x.url.indexOf('/cities?') !== -1));
        t('every read paged, because PostgREST truncates at 1000 in silence',
          sent.filter((x) => x.method === 'GET').every((x) => x.headers.Range !== undefined));

        console.log('');
        console.log(ok + ' ok, ' + bad + ' FAIL');
        process.exit(bad ? 1 : 0);
      }, 10);
    }, 10);
  }, 10);
}, 20));
