/* Drives mc/audiences/index.html against the REAL 640 audiences and 95 places. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROWS = JSON.parse(fs.readFileSync('C:/tmp/fx-aud.json', 'utf8'));
const PLACES = JSON.parse(fs.readFileSync('C:/tmp/fx-places.json', 'utf8'));
const HTML = fs.readFileSync('C:/Code/the-game-bureau/mc/audiences/index.html', 'utf8');

let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x/mc/audiences/' });
const w = dom.window, d = w.document;

const sent = [];
w.fetch = (url, opt) => {
  const u = String(url), o = opt || {};
  sent.push({ url: u, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null,
              headers: o.headers || {} });
  if (o.method) {
    const body = o.body ? JSON.parse(o.body) : {};
    const m = /id=eq\.([^&]+)/.exec(u);
    const base = m ? { id: decodeURIComponent(m[1]) } : { id: 'new-key' };
    if (o.method === 'DELETE') return Promise.resolve({ ok: true, json: () => Promise.resolve([base]), text: () => Promise.resolve('') });
    return Promise.resolve({ ok: true, json: () => Promise.resolve([
      Object.assign({ family: 'x', name: 'y', kind: 'fandom', aliases: [] }, base, body)
    ]), text: () => Promise.resolve('') });
  }
  const rows = /\/audiences/.test(u) ? ROWS : /\/places/.test(u) ? PLACES : [];
  return Promise.resolve({ ok: true, json: () => Promise.resolve(rows), text: () => Promise.resolve('') });
};
let authorized = null;
w.TgbMcAdminAuth = { create: (o) => { authorized = o.onAuthorized; return { getSession: () => null, init: () => authorized() }; } };
w.TgbAdminSiteNav = { bindAuth: () => {} };
const errs = []; w.onerror = (e) => errs.push(String(e));
let asked = null;
w.confirm = (msg) => { asked = msg; return true; };

const script = [...d.querySelectorAll('script')].filter((s) => !s.src).map((s) => s.textContent).join('\n');
try { w.eval(script); } catch (e) { console.log('  FAIL boot threw: ' + e.message); bad++; }

const el = (id) => d.getElementById(id);
const rows = () => [...d.querySelectorAll('tbody tr')];
const click = (n) => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const fire = (n, ty) => n.dispatchEvent(new w.Event(ty, { bubbles: true }));
const key = (n, k) => n.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
const rowFor = (id) => rows().find((r) => r.dataset.row === id);
const cell = (id, f) => rowFor(id).querySelector('[data-field="' + f + '"]');
const patches = () => sent.filter((s) => s.method === 'PATCH');
const posts = () => sent.filter((s) => s.method === 'POST');
const dels = () => sent.filter((s) => s.method === 'DELETE');

setTimeout(() => {
  t('the room counts them (' + el('roomTitle').textContent + ')',
    el('roomTitle').textContent === ROWS.length + ' AUDIENCES', el('roomTitle').textContent);
  t('every audience is a row (' + rows().length + ')', rows().length === ROWS.length);

  const kinds = [...new Set(rows().map((r) => r.querySelector('.chip').textContent.trim()))];
  t('the kinds are drawn as chips', kinds.indexOf('fandom') >= 0, kinds.join(', '));
  t('and the interest one is there too', kinds.indexOf('interest') >= 0, kinds.join(', '));

  /* THE HOME CELL SHOWS A LABEL, NOT THE KEY. */
  const bears = ROWS.find((r) => r.id === 'nfl-chicago');
  t('a club shows where it is at home, in words',
    /Chicago/.test(cell('nfl-chicago', 'home_place_id').textContent),
    cell('nfl-chicago', 'home_place_id').textContent);
  /* AND SO DOES AN INTEREST, WHICH THE ADD DIALOG REFUSES TO CREATE. The one
     real interest on file, `history-jfk`, carries new-orleans-la, while the
     dialog below says "an interest is not at home anywhere". The database holds
     no such rule. Both are asserted rather than reconciled, so the
     disagreement is visible instead of being a comment nobody reads. */
  const jfk = ROWS.find((r) => r.kind === 'interest');
  t('an interest carries its home too, and the cell shows it in words',
    /New Orleans/.test(cell(jfk.id, 'home_place_id').textContent),
    cell(jfk.id, 'home_place_id').textContent);

  /* ---- editing ----------------------------------------------------------- */
  click(cell('nfl-chicago', 'team_key'));
  const box = cell('nfl-chicago', 'team_key').querySelector('input');
  t('a cell opens into a box', !!box);
  key(box, 'Escape');
  t('Escape writes nothing', patches().length === 0, patches().length);

  click(cell('nfl-chicago', 'aliases'));
  const ab = cell('nfl-chicago', 'aliases').querySelector('input');
  ab.value = ' Da Bears / MONSTERS of the midway ';
  key(ab, 'Enter');
  let p = patches()[patches().length - 1];
  t('aliases save as an array', Array.isArray(p.body.aliases), JSON.stringify(p.body.aliases));
  t('lowercased on the way in, since the CHECK refuses a capital',
    p.body.aliases.join('|') === 'da bears|monsters of the midway', p.body.aliases.join('|'));
  t('the patch asks for the row back',
    /return=representation/.test(p.headers.Prefer || ''), p.headers.Prefer);

  /* THE HOME CELL SHOWS A LABEL AND THE COLUMN HOLDS A KEY, so a typed label
     has to be resolved back or a foreign key would get "Chicago, IL". */
  click(cell('nfl-chicago', 'home_place_id'));
  const hb = cell('nfl-chicago', 'home_place_id').querySelector('input');
  hb.value = 'Denver, CO';
  key(hb, 'Enter');
  p = patches()[patches().length - 1];
  t('a typed place label resolves back to its key',
    p.body.home_place_id === 'denver-co', JSON.stringify(p.body));

  const beforeBad = patches().length;
  click(cell('nfl-chicago', 'home_place_id'));
  const hb2 = cell('nfl-chicago', 'home_place_id').querySelector('input');
  hb2.value = 'Nowhereville';
  key(hb2, 'Enter');
  t('a place that does not exist sends NOTHING', patches().length === beforeBad,
    patches().length + ' vs ' + beforeBad);
  t('and it says which place it could not find',
    /no place called Nowhereville/i.test(el('pageStatus').textContent),
    el('pageStatus').textContent);

  /* CLEARING THE HOME CLEARS THE DESTINATION TOO, or the CHECK refuses the row
     for carrying a destination with no home. */
  click(cell('nfl-chicago', 'home_place_id'));
  const hb3 = cell('nfl-chicago', 'home_place_id').querySelector('input');
  hb3.value = '';
  key(hb3, 'Enter');
  p = patches()[patches().length - 1];
  t('clearing the home sends just that', p.body.home_place_id === null, JSON.stringify(p.body));
  /* `destination_id` IS DROPPED. The destination id is derivable from the home
     place, the family and the nickname, so storing it was a second copy of a
     computable fact. */
  t('and no longer writes a destination_id',
    p.body.destination_id === undefined, JSON.stringify(p.body));

  /* THE MASCOT IS A COLUMN AND IT IS NOT THE NAME. A club at home without one
     vanishes from the destinations view, which is why the database refuses it. */
  t('a pro club is named by its city, never its mascot',
    cell('nfl-chicago', 'name').textContent.trim() === 'Chicago'
    && cell('nfl-chicago', 'nickname').textContent.trim() === 'Bears',
    cell('nfl-chicago', 'name').textContent + ' / ' + cell('nfl-chicago', 'nickname').textContent);

  const bamaRow = ROWS.find((r) => r.id === 'ncaaf-alabama');
  if (bamaRow) {
    t('a college audience is named for its school',
      cell('ncaaf-alabama', 'name').textContent.trim() === 'Alabama',
      cell('ncaaf-alabama', 'name').textContent);
    t('and carries the mascot separately',
      cell('ncaaf-alabama', 'nickname').textContent.trim() === 'Crimson Tide',
      cell('ncaaf-alabama', 'nickname').textContent);
  }

  /* ---- renaming changes the key, and it says so ------------------------- */
  asked = null;
  click(cell('nfl-chicago', 'name'));
  const nb = cell('nfl-chicago', 'name').querySelector('input');
  nb.value = 'Monsters';
  key(nb, 'Enter');
  t('renaming asks first', !!asked);
  t('and shows both keys in the question',
    asked && asked.indexOf('nfl-chicago') >= 0 && asked.indexOf('nfl-monsters') >= 0, asked);

  /* ---- filters ----------------------------------------------------------- */
  const before = rows().length;
  el('familyPick').value = 'ncaaf';
  fire(el('familyPick'), 'change');
  const sec = rows().length;
  t('a family narrows the list (' + sec + ')', sec > 0 && sec < before, sec);
  t('to that family only',
    rows().every((r) => r.querySelector('[data-field="family"]').textContent.trim() === 'ncaaf'));
  t('the tally says so', /of \d+/.test(el('tally').textContent), el('tally').textContent);
  t('Clear lit up', el('clearBtn').getAttribute('aria-disabled') === 'false');

  el('kindPick').value = 'interest';
  fire(el('kindPick'), 'change');
  t('two filters combine (' + rows().length + ')', rows().length === 0, rows().length);
  click(el('clearBtn'));
  t('Clear puts everything back', rows().length === before, rows().length);

  el('q').value = 'bama';
  fire(el('q'), 'input');
  t('search reaches an alias, not just a name (' + rows().length + ')',
    rows().length > 0 && rows().length < before, rows().length);
  el('q').value = '';
  fire(el('q'), 'input');

  /* ---- adding ------------------------------------------------------------ */
  click(el('manualBtn'));
  t('Manual opens the dialog', el('addDlg').classList.contains('is-open'));
  el('addFamily').value = 'music'; fire(el('addFamily'), 'input');
  el('addName').value = 'Taylor Swift'; fire(el('addName'), 'input');
  t('the key is previewed before it is made',
    el('keyPreview').textContent === 'music-taylor-swift', el('keyPreview').textContent);

  el('addKind').value = 'artist';
  el('addHome').value = 'denver-co';
  click(el('addSave'));
  t('an artist with a home place is refused',
    /not at home anywhere/.test(el('addMsg').textContent), el('addMsg').textContent);

  el('addHome').value = '';
  click(el('addSave'));
  setTimeout(() => {
    const ins = posts()[0];
    t('a good one is inserted', !!ins);
    t('with family, name, kind and a null home',
      ins && ins.body.family === 'music' && ins.body.name === 'Taylor Swift'
      && ins.body.kind === 'artist' && ins.body.home_place_id === null,
      ins && JSON.stringify(ins.body));

    click(el('manualBtn'));
    el('addFamily').value = 'nfl'; fire(el('addFamily'), 'input');
    el('addName').value = 'Chicago'; fire(el('addName'), 'input');
    click(el('addSave'));
    t('a key that already exists is refused before any request',
      /already exists/.test(el('addMsg').textContent) && posts().length === 1,
      el('addMsg').textContent);
    click(el('addCancel'));

    /* ---- EVERY COLUMN IS ON THE PAGE ---------------------------------------
       These read getComputedStyle and the built header rather than the source,
       because a correct markup string proves nothing about what a viewer sees:
       this project has recorded a suite passing over an invisible pin, an
       unstyled row and a glyph with no font. Run against the previous commit
       they fail, which is the only reason to trust them. */
    const cols = [...HTML.matchAll(
      /\{\s*g:\s*'([^']+)',\s*k:\s*'([^']+)',\s*t:\s*'([^']+)',\s*kind:\s*'([^']+)'([^}]*)\}/g)]
      .map((m) => ({ g: m[1], k: m[2], t: m[3], kind: m[4], edit: /edit:\s*false/.test(m[5]) ? false : true }));
    t('the column list parses out of the source', cols.length > 0, cols.length);
    const heads = [...d.querySelectorAll('thead tr:nth-child(2) th')].map((x) => x.textContent);
    t('every column on the table has a header (' + cols.length + ')',
      heads.length === cols.length + 1, heads.length);
    t('in the order the one list gives',
      cols.every((c, i) => heads[i] === c.t), heads.slice(0, 5).join('|'));
    t('all 33 database columns are drawn', cols.length === 33, cols.length);

    const bands = [...d.querySelectorAll('thead .bandrow th')];
    t('the group band names the runs',
      bands.map((x) => x.textContent).join('/') === 'Identity/Where/Sport/Colours/Keys/Filed/',
      bands.map((x) => x.textContent).join('/'));
    t('and its colspans cover every column',
      bands.reduce((n, x) => n + (Number(x.getAttribute('colspan')) || 1), 0) === cols.length + 1,
      bands.reduce((n, x) => n + (Number(x.getAttribute('colspan')) || 1), 0));

    const firstCell = rows()[0].children[0];
    const fcs = w.getComputedStyle(firstCell);
    t('the key column is stuck to the left edge', fcs.position === 'sticky', fcs.position);
    t('at zero', fcs.left === '0px', fcs.left);
    t('on its own ground, or the cells slide under it',
      fcs.background !== '' && !/transparent/.test(fcs.background), fcs.background);

    const tbl = d.querySelector('tbody').closest('table');
    t('the table takes its natural width rather than being squeezed',
      w.getComputedStyle(tbl).width === 'max-content', w.getComputedStyle(tbl).width);

    /* A COLOUR IS A SWATCH, and the swatch has to carry the row's own value. */
    const tampa = rows().find((r) => r.dataset.row === 'nfl-tampa');
    const shellIdx = cols.findIndex((c) => c.k === 'shell');
    const sw = tampa.children[shellIdx].querySelector('.swatch');
    t('a colour cell draws a swatch', !!sw);
    t('painted the row\u2019s own colour',
      sw && /rgb\(255,\s*255,\s*255\)/.test(w.getComputedStyle(sw).backgroundColor),
      sw && w.getComputedStyle(sw).backgroundColor);
    t('with a ring, or white is invisible on the panel',
      sw && w.getComputedStyle(sw).boxShadow !== 'none', sw && w.getComputedStyle(sw).boxShadow);
    t('and the hex beside it', /FFFFFF/i.test(tampa.children[shellIdx].textContent),
      tampa.children[shellIdx].textContent);

    const numIdx = cols.findIndex((c) => c.k === 'tgbid');
    const ncs = w.getComputedStyle(tampa.children[numIdx]);
    t('figures line up on the right', ncs.textAlign === 'right', ncs.textAlign);
    t('in tabular figures', /tabular-nums/.test(ncs.fontVariantNumeric), ncs.fontVariantNumeric);
    t('and the value is there', tampa.children[numIdx].textContent.trim() === '105',
      tampa.children[numIdx].textContent);

    /* THE THREE THE DATABASE OWNS ARE NOT EDITABLE. */
    ['id', 'created_at', 'updated_at'].forEach((k) => {
      const i = cols.findIndex((c) => c.k === k);
      t(k + ' cannot be typed over', !tampa.children[i].dataset.field);
    });
    t('but the club facts can',
      ['shell', 'conference', 'venue_city', 'espn_id'].every((k) =>
        tampa.children[cols.findIndex((c) => c.k === k)].dataset.field === k));

    /* A WORD IN A NUMBER COLUMN, AND JUNK IN A COLOUR ONE, ARE REFUSED WITH A
       SENTENCE RATHER THAN SENT. A raw 22P02 is a statement about our schema. */
    const before = sent.filter((x) => x.method === 'PATCH').length;
    const typeInto = (rowId, key, value) => {
      const r = rows().find((x) => x.dataset.row === rowId);
      const td = r.children[cols.findIndex((c) => c.k === key)];
      click(td);
      const box = td.querySelector('input, textarea');
      box.value = value;
      box.dispatchEvent(new w.FocusEvent('blur', { bubbles: true }));
    };
    typeInto('nfl-tampa', 'tgbid', 'twelve');
    t('a word in a number column is refused',
      /whole number/.test(el('pageStatus').textContent), el('pageStatus').textContent);
    typeInto('nfl-tampa', 'shell', 'reddish');
    t('and junk in a colour column names the shape wanted',
      /six hex digits/.test(el('pageStatus').textContent), el('pageStatus').textContent);
    t('neither reached the database',
      sent.filter((x) => x.method === 'PATCH').length === before,
      sent.filter((x) => x.method === 'PATCH').length - before);

    /* THE SEARCH READS WHAT THE TABLE DRAWS, or a column you can see is one you
       cannot find. `conference` was unreachable before this. */
    el('q').value = 'NFC South'; fire(el('q'), 'input');
    t('search reaches a merged column', rows().length === 4, rows().length);
    el('q').value = ''; fire(el('q'), 'input');

    /* ---- deleting ---------------------------------------------------------- */
    const n = rows().length;
    click(rows()[0].querySelector('[data-del]'));
    setTimeout(() => {
      t('delete asks first', asked && /Delete/.test(asked), asked);
      t('and sends one DELETE', dels().length === 1, dels().length);
      t('taking the row off the list', rows().length === n - 1, rows().length);

      t('no console errors', errs.length === 0, errs.join(' | '));
      console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
      process.exit(bad ? 1 : 0);
    }, 30);
  }, 30);
}, 60);
