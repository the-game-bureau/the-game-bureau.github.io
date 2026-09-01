/* THE STOP BUILDER: equal halves, and the popup.
   These read the built DOM and the requests actually sent. A correct markup
   string proves nothing about what a viewer sees or what reached the database. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const HTML = fs.readFileSync('mc/stop-builder/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const WP = [
  { wpid: 101, name: 'Cloud Gate', city: 'Chicago', state: 'IL', address: '201 E Randolph St',
    description: 'The bean.', lat: 41.8827, lon: -87.6233, source_url: 'https://en.wikipedia.org/wiki/Cloud_Gate' },
  { wpid: 102, name: 'Buckingham Fountain', city: 'Chicago', state: 'IL', address: '301 S Columbus Dr',
    description: '', lat: null, lon: null, source_url: '' },
  { wpid: 103, name: 'Jackson Square', city: 'New Orleans', state: 'LA', address: '701 Decatur St',
    description: 'The square.', lat: 29.9575, lon: -90.0629, source_url: '' }
];
const CH = [
  { id: 7, name: 'Sing the fight song', kind: 'minigame', scope: 'portable',
    prompt: 'Sing it.', answer: '' },
  { id: 8, name: 'Count the panels', kind: 'question', scope: 'place',
    prompt: 'How many?', answer: '168' }
];
const AUD = [
  { home_place_id: 'chicago-il', places: { city: 'Chicago', state: 'IL' } },
  { home_place_id: 'new-orleans-la', places: { city: 'New Orleans', state: 'LA' } }
];
/* THREE FIELDS. No id, because (city, waypoint_id) is the key. */
/* THE ROWS CARRY THEIR OWN `id`, which is the primary key and is how a stop is
   addressed. The third has NO WAYPOINT: 2026083117 strips the waypoint when it
   is deleted rather than removing the stop, so a stop that kept its challenge
   and needs a new place is an ordinary row this room has to draw. */
let STOPS = [{ id: 11, city: 'Chicago, IL', waypoint_id: 101, challenge_id: 7 },
             { id: 12, city: 'Chicago, IL', waypoint_id: 102, challenge_id: null },
             { id: 13, city: 'Chicago, IL', waypoint_id: null, challenge_id: 7 }];

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true,
                              url: 'https://x/mc/stop-builder/' });
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
  if (m === 'POST') {
    const row = JSON.parse(opt.body);
    STOPS.push(row);
    return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve([row]),
                             text: () => Promise.resolve('') });
  }
  if (m === 'DELETE') {
    /* MATCHED ON THE ROW'S OWN id, the way PostgREST would. It matched the
       pair (city, waypoint_id) until 2026083117 made a waypoint strippable,
       at which point `waypoint_id=eq.null` matches nothing and the room could
       not delete the one row somebody most wants to fix.
         A STUB THAT DOES NOT MODEL THE FILTER THE PAGE SENDS reports a page
       fault that is its own, which this suite has already been caught by
       once over `+` meaning a space. */
    const id = Number((u.match(/id=eq\.(\d+)/) || [])[1]);
    const gone = STOPS.filter((r) => r.id === id);
    STOPS = STOPS.filter((r) => r.id !== id);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(gone),
                             text: () => Promise.resolve('') });
  }
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
const rows = () => [...d.querySelectorAll('.stop')];
/* HOW MANY THE FIXTURE STARTED WITH. `STOPS` is mutated by the insert the
   suite performs, so reading its length later counts the row just added. */
const STOPS_AT_FIRST = STOPS.length;
const posts = () => sent.filter((x) => x.method === 'POST');
const key = (e) => new w.KeyboardEvent('keydown', { key: e, bubbles: true });

authorized().then(() => setTimeout(() => {
  /* ---- the room is named, and the count is in the blurb ------------------ */
  /* THE TITLE IS THE ROOM NAME AND CARRIES NO COUNT, which is the third room to
     make that move after the Waypoint Library and the Challenge Bank. The
     convention leads with the room OWN NOUN and only works while the name IS
     that noun: `41 STOPS` reads and `41 STOPS BUILDER` does not. */
  const title = d.getElementById('roomTitle');
  t('the title is the room name', title && title.textContent.trim() === 'STOPS BUILDER',
    title && title.textContent.trim());
  t('and carries no count', title && !/[0-9?]/.test(title.textContent),
    title && title.textContent.trim());
  t('the tab says so too', d.title.indexOf('STOPS BUILDER') === 0, d.title);

  const blurb = d.querySelector('.room-blurb');
  const bc = d.getElementById('blurbCount');
  /* THE COUNT LEADS THE BLURB and is the room's whole total, so it must equal
     the fixture rather than whatever a filter has left. */
  t('the count leads the blurb', bc && bc.textContent === String(STOPS_AT_FIRST),
    bc && bc.textContent);
  t('and the blurb is the formula', blurb
    && blurb.textContent.trim() === STOPS_AT_FIRST + ' Stops. Waypoint + Challenge = Stop.',
    blurb && blurb.textContent.trim());

  /* ---- the row is a city and two equal halves --------------------------- */
  t('every stop is drawn', rows().length === STOPS_AT_FIRST, rows().length);
  const r0 = rows()[0];
  t('the city leads the row, on the left', r0.children[0].className === 'stop-city',
    r0.children[0].className);
  /* CENTRED, while everything else starts at the top: a half must, or its
     kicker would drift down as the other half grew. */
  t('the city is centred against the pair',
    w.getComputedStyle(r0.querySelector('.stop-city')).alignSelf === 'center',
    w.getComputedStyle(r0.querySelector('.stop-city')).alignSelf);
  t('and the two halves still start at the top',
    [...r0.querySelectorAll('.stop-half')]
      .every((h) => w.getComputedStyle(h).alignSelf !== 'center'));
  t('and the row reads city, waypoint, challenge, delete',
    [...r0.children].map((c) => c.className.split(' ')[0]).join(' ')
      === 'stop-city stop-half stop-half btn',
    [...r0.children].map((c) => c.className.split(' ')[0]).join(' '));

  const halves = [...r0.querySelectorAll('.stop-half')];
  t('there are exactly two blocks under it', halves.length === 2, halves.length);
  /* EQUAL WEIGHT IS THE ASK, and `1fr 1fr` is what says it: sized to content,
     the half with more words would look like the point of the row. */
  /* THE TWO HALVES ARE STILL EQUAL, which is the ask that survived the city
     moving: the city takes what it needs and the pair split the rest. */
  t('the two halves are still equal columns, with the city sized to its own text',
    w.getComputedStyle(r0).gridTemplateColumns === 'minmax(120px, max-content) 1fr 1fr auto',
    w.getComputedStyle(r0).gridTemplateColumns);
  t('waypoint first, challenge second',
    halves[0].querySelector('.stop-kicker').textContent === 'Waypoint'
    && halves[1].querySelector('.stop-kicker').textContent === 'Challenge');
  t('the waypoint half names the place and its address',
    /Cloud Gate/.test(halves[0].textContent) && /201 E Randolph/.test(halves[0].textContent));
  t('the challenge half names the challenge and its kind',
    /Sing the fight song/.test(halves[1].textContent) && /minigame/.test(halves[1].textContent));

  const rnd = rows()[1].querySelectorAll('.stop-half')[1];
  t('a null challenge is drawn as the WORD RANDOM, not an empty half',
    /RANDOM/.test(rnd.textContent), rnd.textContent.trim());
  t('and marked as a decision rather than a gap',
    rnd.querySelector('.stop-name').classList.contains('is-random'));

  /* ---- the whole row opens it ------------------------------------------- */
  t('the row is a real control, not a div with a handler',
    r0.getAttribute('role') === 'button' && r0.tabIndex === 0);
  t('the popup is shut to start with', el('svBackdrop').hidden);

  r0.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  t('clicking anywhere on the row opens it', !el('svBackdrop').hidden);
  t('the head names the waypoint and the city',
    el('svTitle').textContent === 'Cloud Gate' && el('svCity').textContent === 'Chicago, IL',
    el('svTitle').textContent + ' / ' + el('svCity').textContent);

  /* ---- waypoint left, challenge right ----------------------------------- */
  const body = d.querySelector('.sv-body');
  t('the popup is two equal columns',
    w.getComputedStyle(body).gridTemplateColumns === '1fr 1fr',
    w.getComputedStyle(body).gridTemplateColumns);
  t('the waypoint side is first in the DOM, so it is the LEFT one',
    body.children[0].id === 'svWaypoint' && body.children[1].id === 'svChallenge',
    body.children[0].id);

  const frame = el('svWaypoint').querySelector('iframe');
  t('the left side carries a street view frame', !!frame);
  t('pointed at the waypoint own coordinates',
    frame && frame.src.indexOf('cbll=41.8827,-87.6233') !== -1, frame && frame.src);
  t('and it is the keyless panorama embed, since this project holds no maps key',
    frame && frame.src.indexOf('output=svembed') !== -1);
  t('the address, description and source are under it',
    /201 E Randolph/.test(el('svWaypoint').textContent)
    && /The bean/.test(el('svWaypoint').textContent)
    && !!el('svWaypoint').querySelector('a[href*="wikipedia"]'));
  t('the source opens safely',
    el('svWaypoint').querySelector('a').rel.indexOf('noopener') !== -1);

  t('the right side carries the challenge, prompt and answer',
    /Sing the fight song/.test(el('svChallenge').textContent)
    && /Sing it\./.test(el('svChallenge').textContent));
  t('and no street view frame on that side', !el('svChallenge').querySelector('iframe'));

  /* ---- closing tears the frame down ------------------------------------- */
  d.dispatchEvent(key('Escape'));
  t('Escape closes it', el('svBackdrop').hidden);
  /* A HIDDEN GOOGLE FRAME GOES ON LOADING. The Tape Room learned the same
     about a hidden Spotify embed, which kept playing. */
  t('and the frame is torn down, not merely hidden',
    !el('svWaypoint').querySelector('iframe'));

  /* ---- a waypoint with no coordinates says so --------------------------- */
  rows()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  t('a waypoint with no point draws no frame',
    !el('svWaypoint').querySelector('iframe'));
  t('and says why, rather than showing a grey box',
    /No coordinates/.test(el('svWaypoint').textContent), el('svWaypoint').textContent.slice(0, 60));
  t('a RANDOM stop says what random means on the right',
    /whatever fits at play time/.test(el('svChallenge').textContent));
  el('svClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  t('Close closes it', el('svBackdrop').hidden);

  /* ---- the three-field write path --------------------------------------- */
  el('cityInput').value = 'New Orleans, LA';
  el('wpInput').value = 'Jackson Square - New Orleans, LA';
  el('chalInput').value = '';
  el('addBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  setTimeout(() => {
    const last = posts()[posts().length - 1];
    const sentBody = JSON.parse(last.body);
    t('the insert carries exactly three fields',
      Object.keys(sentBody).sort().join(',') === 'challenge_id,city,waypoint_id',
      Object.keys(sentBody).join(','));
    t('no id is sent, because the table has none',
      !('id' in sentBody) && !('created_at' in sentBody));
    t('a blank challenge box posts RANDOM, which is a null', sentBody.challenge_id === null);
    t('the new stop is on the list', rows().length === STOPS_AT_FIRST + 1, rows().length);

    /* ---- A STOP SURVIVES ITS WAYPOINT (2026083117) ---------------------
       Deleting a waypoint strips it from the stop rather than removing the
       stop: the challenge and the position are editorial work and must not
       be thrown away by a correction to the catalogue. So a stop with no
       waypoint is an ordinary row here, and it has to say so rather than
       reading `waypoint null`. */
    const stripped = rows().filter((r) => r.textContent.indexOf('waypoint deleted') !== -1)[0];
    t('a stop whose waypoint was deleted says so', !!stripped,
      rows().map((r) => r.textContent.trim().slice(0, 24)).join(' | '));

    /* ---- delete filters on the row's own id ---------------------------
       It was the pair (city, waypoint_id), which stopped being an identity
       the moment a waypoint could be stripped: the filter becomes
       `waypoint_id=eq.null`, PostgREST matches nothing, and the row you most
       want to fix is the one row you could not remove. */
    const before = rows().length;
    stripped.querySelector('.stop-del')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    setTimeout(() => {
      const del = sent.filter((x) => x.method === 'DELETE').pop();
      t('the delete filters on the row own id',
        del.url.indexOf('id=eq.13') !== -1, del.url);
      t('and can therefore remove a stop that has no waypoint',
        del.url.indexOf('waypoint_id=eq.null') === -1, del.url);
      t('and asks for the row back', String(del.headers.Prefer).indexOf('return=representation') !== -1);
      t('the row is gone', rows().length === before - 1, rows().length);

      /* THE DELETE MUST NOT OPEN THE POPUP over the row it just removed. */
      t('deleting did not open the popup', el('svBackdrop').hidden);

      /* ---- what it must never do ---------------------------------------- */
      t('no request named public.cities',
        !sent.some((x) => x.url.indexOf('/cities?') !== -1));
      t('every read paged', sent.filter((x) => x.method === 'GET')
        .every((x) => x.headers.Range !== undefined));

      console.log('');
      console.log(ok + ' ok, ' + bad + ' FAIL');
      process.exit(bad ? 1 : 0);
    }, 10);
  }, 10);
}, 20));
