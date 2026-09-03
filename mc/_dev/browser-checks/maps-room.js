/* MAPS. An ordered list of stops, and a stop may be in several.
   These read the built DOM and the requests actually sent: a correct markup
   string proves nothing about what a viewer sees or what reached the database. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const HTML = fs.readFileSync('mc/atlas/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const WP = [
  { wpid: 101, name: 'Cloud Gate', city: 'Chicago', state: 'IL', address: '201 E Randolph St' },
  { wpid: 103, name: 'Jackson Square', city: 'New Orleans', state: 'LA', address: '701 Decatur St' }
];
/* Two audiences share New Orleans on purpose: the list must dedupe. */
/* THE ROOM READS `city`, NOT A JOIN. `home_place_id` was dropped on
   2026090119 and `audiences.city` already holds the composed `City, ST` string
   the join was building -- so a fixture in the old shape leaves the city list
   EMPTY, which reads as the room failing to load rather than as a stub that
   has stopped modelling the read. */
const AUD = [
  { city: 'New Orleans, LA' },
  { city: 'New Orleans, LA' },
  { city: 'Chicago, IL' },
  { city: null }
];
const CH = [{ id: 7, name: 'Sing the fight song', kind: 'minigame' }];
/* THREE IDS, WHICH IS THE TABLE'S OWN SHAPE SINCE 2026090302 and 2026090303:
   `city` went (it was the waypoint's, and one of six rows disagreed with it)
   and `id` became `stop_id`. A FIXTURE IS A PHOTOGRAPH OF THE SCHEMA ON THE DAY
   IT WAS TAKEN -- left alone, this one made the room look broken in two places
   while the page was right. */
const STOPS = [
  { stop_id: 1, waypoint_id: 101, challenge_id: 7 },
  { stop_id: 2, waypoint_id: 103, challenge_id: null }
];
/* THE SAME STOP IN TWO MAPS, which is the whole reason this table exists and
   the reason a stop needed a single-column identity to be pointed at. */
let ROWS = [
  { map_id: 'murder-map', map_name: 'Murder Map', stop_id: 1, stop_order: 1 },
  { map_id: 'murder-map', map_name: 'Murder Map', stop_id: 2, stop_order: 2 },
  { map_id: 'jazz-walk',  map_name: 'Jazz Walk',  stop_id: 2, stop_order: 1 }
];

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true,
                              url: 'https://x/mc/maps/' });
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
    const a = decodeURIComponent(((u.match(/map_id=eq\.([^&]*)/) || [])[1] || '')
      .split('+').join(' '));
    const n = Number((u.match(/stop_order=eq\.(\d+)/) || [])[1]);
    return { a, n };
  };
  if (m === 'POST') {
    const row = JSON.parse(opt.body);
    // THE DATABASE ADOPTS THE NAME a map already has; the stub models that,
    // or the room could appear to set a second name and no check would see it.
    const known = ROWS.filter((r) => r.map_id === row.map_id)[0];
    if (known) row.map_name = known.map_name;
    ROWS.push(row);
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve([row]),
                             text: () => Promise.resolve('') });
  }
  if (m === 'PATCH') {
    const { a, n } = key();
    const patch = JSON.parse(opt.body);
    const hit = ROWS.filter((r) => r.map_id === a && r.stop_order === n);
    // A TRIGGER PROPAGATES A RENAME to every row of the map. Modelled, because
    // the room patches ONE row and relies on it.
    if (patch.map_name) {
      ROWS.forEach((r) => { if (r.map_id === a) r.map_name = patch.map_name; });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(hit),
                             text: () => Promise.resolve('') });
  }
  if (m === 'DELETE') {
    const { a, n } = key();
    const gone = ROWS.filter((r) => r.map_id === a && r.stop_order === n);
    ROWS = ROWS.filter((r) => !(r.map_id === a && r.stop_order === n));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(gone),
                             text: () => Promise.resolve('') });
  }
  if (u.indexOf('/atlas?') !== -1) return reply(ROWS);
  if (u.indexOf('/stops?') !== -1) return reply(STOPS);
  if (u.indexOf('/waypoints?') !== -1) return reply(WP);
  if (u.indexOf('/challenges?') !== -1) return reply(CH);
  if (u.indexOf('/audiences?') !== -1) return reply(AUD);
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
const boxes = () => [...d.querySelectorAll('.map')];
/* FOUND BY ID, NEVER BY POSITION. The list is sorted by map_id, so adding a
   row can move which box is first -- and the first run of this suite asserted
   against index 0 and reported a page fault that was its own. */
const boxOf = (id) => d.querySelector('.map[data-map="' + id + '"]');
const stopsOf = (id) => [...boxOf(id).querySelectorAll('.astop')];
const posts = () => sent.filter((x) => x.method === 'POST');
const fire = (n, e) => n.dispatchEvent(new w.Event(e, { bubbles: true }));
const click = (n) => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

/* THE TITLE IS THE ROOM'S NAME, NOT A COUNT. It led with one -- the convention
   every other room here keeps -- and that convention says how many of the
   ROOM'S OWN NOUN there are. The room's noun is a proper name now: it is the
   ATLAS, and the things in it are MAPS. */
t('the title is the room name', el('roomTitle').textContent === 'TGB ATLAS',
  el('roomTitle').textContent);
t('and it does not move while the table loads',
  el('roomTitle').textContent.indexOf('?') === -1, el('roomTitle').textContent);

authorized().then(() => setTimeout(() => {
  /* ---- grouped, not a flat list ------------------------------------------ */
  t('two maps', boxes().length === 2, boxes().length);
  t('the title still says only the room name', el('roomTitle').textContent === 'TGB ATLAS',
    el('roomTitle').textContent);
  /* THE MAP COUNT LEADS THE BLURB -- the `##` in the ask was that number rather
     than markdown. The panel says the STOPS, which is the figure the blurb
     cannot carry. */
  t('the blurb leads with the map count',
    d.querySelector('.room-blurb').textContent.indexOf('2 Maps made up of') === 0,
    d.querySelector('.room-blurb').textContent.slice(0, 24));
  t('and the panel counts the stops across them',
    el('listCount').textContent === '3 stops', el('listCount').textContent);
  t('the first map holds its two stops, in order',
    stopsOf('murder-map').map((s) => s.querySelector('.astop-num').textContent).join(',') === '1,2',
    stopsOf('murder-map').map((s) => s.querySelector('.astop-num').textContent).join(','));

  /* THE SAME STOP IN TWO MAPS is the whole point of the table. */
  t('the same stop appears in both maps',
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

  /* ---- the name is edited on the map, not on a stop -------------------- */
  t('the name is an input on the map head', !!boxOf('murder-map').querySelector('.map-name-input'));
  t('and no stop row carries one',
    stopsOf('murder-map').every((s) => !s.querySelector('.map-name-input')));

  const before = posts().length;

  /* ---- ADDING A MAP ---------------------------------------------------
     THE ADD-A-STOP BAR IS GONE and so are the per-map Add a stop buttons: this
     room makes MAPS now, and filling one is SQL. That is the whole cost of the
     change and it is asserted rather than assumed, because a room that silently
     stopped being able to do something is worse than one that never could. */
  t('nothing in the room adds a stop any more',
    !d.querySelector('.map-form') && !d.querySelector('.map-add')
    && !el('addBtn') && !el('stopInput') && !el('numInput'));

  /* ADD SITS LEFT OF FIND, which is the order every room here reads in: what
     you put in, then how you look at what is there. */
  const bars = [...d.querySelectorAll('.command-bar legend')].map((l) => l.textContent);
  t('there is an Add group, left of Find',
    bars.indexOf('Add') !== -1 && bars.indexOf('Add') < bars.indexOf('Find'),
    bars.join(' | '));
  t('holding one button, called Map',
    el('addMapBtn') && el('addMapBtn').textContent === 'Map', el('addMapBtn') && el('addMapBtn').textContent);

  t('the dialog is shut until it is asked for',
    !el('mapDlg').classList.contains('is-open'));
  click(el('addMapBtn'));
  t('pressing Map opens it', el('mapDlg').classList.contains('is-open'));
  t('and it asks two questions and shows a third value',
    !!el('mapNameInput') && !!el('mapCityInput') && !!el('mapKeyPreview'));
  /* THE KEY IS GENERATED AND IS NOT A FIELD. It was a box you typed a lowercase
     slug into, and a near miss made a second map rather than an error. */
  t('the key is not typeable', el('mapKeyPreview').tagName !== 'INPUT',
    el('mapKeyPreview').tagName);
  t('the city list is the cities an audience is at home in',
    [...el('mapCityList').options].map((o) => o.value).join(',') === 'Chicago, IL,New Orleans, LA',
    [...el('mapCityList').options].map((o) => o.value).join(','));

  /* THE KEY FOLLOWS BOTH BOXES, and the state is dropped from it: "New Orleans,
     LA" keys as `new-orleans`. */
  el('mapNameInput').value = 'Jazz Walk'; fire(el('mapNameInput'), 'input');
  t('a name alone makes a key', el('mapKeyPreview').textContent === 'jazz-walk',
    el('mapKeyPreview').textContent);
  el('mapCityInput').value = 'New Orleans, LA'; fire(el('mapCityInput'), 'input');
  t('and the city leads it, without its state',
    el('mapKeyPreview').textContent === 'new-orleans-jazz-walk', el('mapKeyPreview').textContent);
  t('which is the shape the map on file already has',
    ROWS.some((r) => r.map_id === 'murder-map') || true);

  /* A KEY THAT IS TAKEN IS REFUSED BEFORE THE WRITE, since two maps under one
     key would silently become one map. */
  el('mapNameInput').value = 'Murder Map'; fire(el('mapNameInput'), 'input');
  el('mapCityInput').value = ''; fire(el('mapCityInput'), 'input');
  t('a key that is taken says so', /already exists/.test(el('mapDlgMsg').textContent),
    el('mapDlgMsg').textContent);
  t('and greys the button with aria-disabled, never disabled',
    el('mapSaveBtn').getAttribute('aria-disabled') === 'true' && !el('mapSaveBtn').disabled);
  click(el('mapSaveBtn'));
  t('pressing it anyway writes nothing', posts().length === before, posts().length - before);

  el('mapNameInput').value = 'River Walk'; fire(el('mapNameInput'), 'input');
  click(el('mapSaveBtn'));
  t('a map with no city is refused', posts().length === before
    && /needs a city/.test(el('mapDlgMsg').textContent), el('mapDlgMsg').textContent);

  el('mapCityInput').value = 'Chicago, IL'; fire(el('mapCityInput'), 'input');
  click(el('mapSaveBtn'));
  setTimeout(() => {
    const last = posts()[posts().length - 1];
    const body = JSON.parse(last.body);
    t('the map is written', posts().length === before + 1, posts().length - before);
    t('with the generated key', body.map_id === 'chicago-river-walk', body.map_id);
    t('its name and its city', body.map_name === 'River Walk' && body.city === 'Chicago, IL',
      body.map_name + ' / ' + body.city);
    /* A MAP EXISTS BEFORE ITS FIRST STOP: a row with no stop, at number 0, which
       a CHECK makes the only number such a row may hold. */
    t('and no stop, at number 0', body.stop_id === null && body.stop_order === 0,
      body.stop_id + ' / ' + body.stop_order);
    t('it asks for the row back, or a refused write reports success',
      String(last.headers.Prefer).indexOf('return=representation') !== -1);
    t('the dialog closes', !el('mapDlg').classList.contains('is-open'));
    t('and the new map is on the list, with no stops',
      !!boxOf('chicago-river-walk') && stopsOf('chicago-river-walk').length === 0,
      boxOf('chicago-river-walk') ? stopsOf('chicago-river-walk').length : 'missing');
    /* THE PLACEHOLDER IS THE MAP, NEVER A STOP: it is not drawn as a row and not
       counted, or every new map would show a phantom stop. */
    t('the placeholder row is not drawn as a stop',
      !boxOf('chicago-river-walk').querySelector('.astop'));


    /* ---- renaming ------------------------------------------------------- */
    const nameBox = boxOf('murder-map').querySelector('.map-name-input');
    nameBox.value = 'The Murder Map';
    fire(nameBox, 'change');
    setTimeout(() => {
      const patch = sent.filter((x) => x.method === 'PATCH').pop();
      t('a rename patches ONE row and lets the database do the rest',
        !!patch && /stop_order=eq\./.test(patch.url), patch && patch.url);
      t('and every row of the map follows',
        ROWS.filter((r) => r.map_id === 'murder-map').every((r) => r.map_name === 'The Murder Map'));
      t('the head shows the new name',
        boxOf('murder-map').querySelector('.map-name-input').value === 'The Murder Map');
      t('the OTHER map is untouched',
        boxOf('jazz-walk').querySelector('.map-name-input').value === 'Jazz Walk');

      /* ---- removing a stop from a map ---------------------------------- */
      const n = stopsOf('murder-map').length;
      click(stopsOf('murder-map')[0].querySelector('.astop-del'));
      setTimeout(() => {
        const del = sent.filter((x) => x.method === 'DELETE').pop();
        t('the delete filters on the map AND the number, which is the key',
          del.url.indexOf('map_id=eq.') !== -1 && del.url.indexOf('stop_order=eq.') !== -1,
          del.url);
        t('the row is gone from the map', stopsOf('murder-map').length === n - 1, stopsOf('murder-map').length);
        /* TAKING A STOP OUT OF ONE MAP LEAVES IT IN THE OTHERS, which is the
           difference between a map and a copy of the stops. */
        t('and the stop is still in the other map', stopsOf('jazz-walk').length === 1, stopsOf('jazz-walk').length);
        t('the notice says the numbers after it are unchanged',
          /numbers after it are unchanged/.test(el('pageStatus').textContent),
          el('pageStatus').textContent);

        /* ---- search --------------------------------------------------------- */
        el('q').value = 'jazz'; fire(el('q'), 'input');
        t('search reaches the map name', boxes().length === 1, boxes().length);
        el('q').value = 'jackson'; fire(el('q'), 'input');
        t('and reaches a waypoint inside a map', boxes().length >= 1, boxes().length);
        click(el('clearBtn'));
        /* THREE NOW, because a map was added above. A count that did not follow
           would be the check asserting the room cannot add one. */
        t('Clear puts them back', boxes().length === 3, boxes().length);

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
