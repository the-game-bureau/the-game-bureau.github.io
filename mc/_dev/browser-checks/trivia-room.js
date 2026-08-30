/* Drives mc/trivia/index.html against the REAL rows. Proves by rendering. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TRIVIA = JSON.parse(fs.readFileSync('C:/tmp/fx-trivia.json', 'utf8'));
const DEST = JSON.parse(fs.readFileSync('C:/tmp/fx-dest.json', 'utf8'));
const WP = JSON.parse(fs.readFileSync('C:/tmp/fx-wp.json', 'utf8'));
const HTML = fs.readFileSync('C:/Code/the-game-bureau/mc/trivia/index.html', 'utf8');

let ok = 0, bad = 0;
const t = (m, c, got) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (got !== undefined ? '   got: ' + got : '')));

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x/mc/trivia/' });
const w = dom.window, d = w.document;

/* Every request is recorded, because what the room SENDS is most of what these
   changes are about: a score row, a patch, an insert. */
const sent = [];
w.fetch = (url, opt) => {
  const u = String(url), o = opt || {};
  sent.push({ url: u, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null,
              headers: o.headers || {} });
  const rows = /\/trivia/.test(u) ? TRIVIA : /\/destinations/.test(u) ? DEST
             : /\/waypoints/.test(u) ? WP : [];
  if (o.method === 'PATCH' || o.method === 'POST') {
    const body = o.body ? JSON.parse(o.body) : {};
    /* A PATCH ECHOES THE ROW IT PATCHED, id and all. The first cut of this stub
       invented a trivia_id on every write, the page merged it into the row as it
       should, and every later lookup of that row missed. **The stub was the
       broken half**, and it looked exactly like the page losing an edit. */
    const m = /trivia_id=eq\.(\d+)/.exec(u);
    const base = m ? { trivia_id: Number(m[1]) } : { trivia_id: 900 + sent.length };
    return Promise.resolve({ ok: true, json: () => Promise.resolve([
      Object.assign({ id: 'denver-co', question: 'q', answer: 'a', choices: null },
                    base, body)
    ]), text: () => Promise.resolve('') });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve(rows), text: () => Promise.resolve('') });
};
let authorized = null;
w.TgbMcAdminAuth = { create: (o) => { authorized = o.onAuthorized; return { getSession: () => null, init: () => authorized() }; } };
w.TgbAdminSiteNav = { bindAuth: () => {} };
const errs = [];
w.onerror = (e) => errs.push(String(e));

const script = [...d.querySelectorAll('script')].filter((s) => !s.src).map((s) => s.textContent).join('\n');
try { w.eval(script); } catch (e) { console.log('  FAIL boot threw: ' + e.message); bad++; }

const el = (id) => d.getElementById(id);
const rows = () => [...d.querySelectorAll('tbody tr')];
const choices = () => [...d.querySelectorAll('.choice')];
const click = (n) => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const fire = (n, type) => n.dispatchEvent(new w.Event(type, { bubbles: true }));
const key = (n, k) => n.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
const rowFor = (r) => rows().find((x) => x.dataset.row === String(r.trivia_id));
const cell = (r, field) => rowFor(r).querySelector('[data-field="' + field + '"]');
const posts = (frag) => sent.filter((s) => s.method === 'POST' && s.url.indexOf(frag) >= 0);
const patches = () => sent.filter((s) => s.method === 'PATCH');
const optText = (b) => b.querySelector('span:nth-child(2)').textContent;

setTimeout(() => {
  /* ---- the table ---------------------------------------------------------- */
  t('every question is a row (' + rows().length + ')', rows().length === TRIVIA.length);
  const mcRow = TRIVIA.find((r) => r.choices && r.choices.length);
  const owRow = TRIVIA.find((r) => !r.choices);
  t('the choices column lists the options',
    cell(mcRow, 'choices').textContent.indexOf(mcRow.choices[0]) >= 0,
    cell(mcRow, 'choices').textContent);
  t('and is blank on a typed row', cell(owRow, 'choices').textContent === '');
  t('key, question, answer and choices are all editable cells',
    ['id', 'question', 'answer', 'choices'].every((f) => !!cell(mcRow, f)));

  /* ---- editing in place ---------------------------------------------------- */
  click(cell(mcRow, 'question'));
  const box = cell(mcRow, 'question').querySelector('input');
  t('clicking a cell turns it into a box', !!box);
  t('holding what was there', box.value === mcRow.question, box.value);
  key(box, 'Escape');
  t('Escape cancels without writing', patches().length === 0, patches().length);
  t('and does not open the popup', !el('playDlg').classList.contains('is-open'));

  click(cell(mcRow, 'question'));
  const box2 = cell(mcRow, 'question').querySelector('input');
  box2.value = 'Reworded question?';
  key(box2, 'Enter');
  t('Enter saves one PATCH', patches().length === 1, patches().length);
  t('against that row alone',
    patches()[0].url.indexOf('trivia_id=eq.' + mcRow.trivia_id) >= 0, patches()[0].url);
  t('carrying the new question', patches()[0].body.question === 'Reworded question?');
  t('and asking for the row back',
    /return=representation/.test(patches()[0].headers.Prefer || ''), patches()[0].headers.Prefer);

  click(cell(mcRow, 'choices'));
  const cbox = cell(mcRow, 'choices').querySelector('input');
  cbox.value = ' Alpha / Bravo / Charlie ';
  key(cbox, 'Enter');
  let last = patches()[patches().length - 1];
  t('choices save as a trimmed array',
    Array.isArray(last.body.choices) && last.body.choices.join('|') === 'Alpha|Bravo|Charlie',
    JSON.stringify(last.body.choices));

  click(cell(mcRow, 'choices'));
  const cbox2 = cell(mcRow, 'choices').querySelector('input');
  cbox2.value = '   ';
  key(cbox2, 'Enter');
  last = patches()[patches().length - 1];
  t('an emptied choices line stores NULL, not an empty array', last.body.choices === null,
    JSON.stringify(last.body.choices));

  /* ---- two tries ----------------------------------------------------------- */
  const mc2 = TRIVIA.find((r) => r.choices && r.choices.length >= 3);
  click(rowFor(mc2).querySelector('[data-play]'));
  t('Play opens the popup', el('playDlg').classList.contains('is-open'));

  click(choices().find((b) => optText(b) !== mc2.answer));
  t('a wrong first try reveals nothing', !d.querySelector('.choice.is-right'));
  t('it marks the miss', !!d.querySelector('.choice.is-wrong'));
  t('and kills only that option', choices().filter((b) => b.disabled).length === 1,
    choices().filter((b) => b.disabled).length);
  t('the rest stay live',
    choices().filter((b) => !b.disabled).length === mc2.choices.length - 1);
  t('nothing is scored on a first miss', posts('/scores').length === 0, posts('/scores').length);
  t('and the room offers one more try',
    /one more try/i.test(d.querySelector('.verdict').textContent),
    d.querySelector('.verdict').textContent);

  click(choices().find((b) => optText(b) === mc2.answer));
  t('right on the second try reveals it', !!d.querySelector('.choice.is-right'));
  t('and is worth 3', /\b3\b/.test(d.querySelector('.verdict').textContent),
    d.querySelector('.verdict').textContent);

  const s1 = posts('/scores')[0];
  t('a score row is written on settle', !!s1);
  t('player blank, for the database to fold to anon', s1.body.player === '');
  t('area trivia, subject the question id',
    s1.body.area === 'trivia' && s1.body.subject_id === String(mc2.trivia_id));
  t('correct, tries 2, points 3',
    s1.body.correct === true && s1.body.tries === 2 && s1.body.points === 3,
    JSON.stringify([s1.body.correct, s1.body.tries, s1.body.points]));
  t('exactly one row per question', posts('/scores').length === 1);

  /* ---- first try is seven --------------------------------------------------- */
  el('player').value = '  Kevin  ';
  const mc3 = TRIVIA.filter((r) => r.choices && r.choices.length)[1];
  click(rowFor(mc3).querySelector('[data-play]'));
  click(choices().find((b) => optText(b) === mc3.answer));
  const s2 = posts('/scores')[1];
  t('right first time is worth 7', s2.body.tries === 1 && s2.body.points === 7,
    JSON.stringify([s2.body.tries, s2.body.points]));
  t('the player name is trimmed', s2.body.player === 'Kevin', s2.body.player);
  t('the bar adds them up (3 + 7)', /10/.test(el('score').textContent), el('score').textContent);

  /* ---- wrong twice is nothing ----------------------------------------------- */
  const mc4 = TRIVIA.filter((r) => r.choices && r.choices.length >= 3)[2];
  click(rowFor(mc4).querySelector('[data-play]'));
  const misses = choices().filter((b) => optText(b) !== mc4.answer).map(optText);
  click(choices().find((b) => optText(b) === misses[0]));
  click(choices().find((b) => optText(b) === misses[1]));
  const s3 = posts('/scores')[2];
  t('wrong twice scores nothing',
    s3.body.correct === false && s3.body.tries === 2 && s3.body.points === 0,
    JSON.stringify([s3.body.correct, s3.body.tries, s3.body.points]));
  t('and only then is the answer shown',
    d.querySelector('.verdict').textContent.indexOf(mc4.answer) >= 0,
    d.querySelector('.verdict').textContent);

  /* ---- a game is ten -------------------------------------------------------- */
  click(el('closeBtn'));
  click(el('gameBtn'));
  t('a game opens on one of ten', el('dlgTitle').textContent === 'Question 1 of 10',
    el('dlgTitle').textContent);
  const before = posts('/scores').length;
  for (let i = 0; i < 10; i++) {
    if (choices().length) {
      click(choices()[0]);
      const live = choices().find((b) => !b.disabled);
      if (live && !d.querySelector('.choice.is-right')) click(live);
    } else {
      el('wordBox').value = 'zzz'; click(el('wordBtn'));
      if (el('wordBox') && !el('wordBox').disabled) { el('wordBox').value = 'zzz'; click(el('wordBtn')); }
    }
    click(el('nextBtn'));
  }
  t('ten questions writes ten score rows', posts('/scores').length - before === 10,
    posts('/scores').length - before);
  t('and ends on a result screen', el('dlgTitle').textContent === 'Game over',
    el('dlgTitle').textContent);
  t('reporting out of ten', /of 10/.test(el('dlgBody').textContent), el('dlgBody').textContent);
  click(el('nextBtn'));
  t('Play again deals a new one', el('dlgTitle').textContent === 'Question 1 of 10',
    el('dlgTitle').textContent);
  click(el('closeBtn'));

  el('teamPick').value = 'new-orleans-la-nba-pelicans';
  fire(el('teamPick'), 'change');
  click(el('gameBtn'));
  t('a short scope plays short', el('dlgTitle').textContent === 'Question 1 of 1',
    el('dlgTitle').textContent);
  t('and says so rather than padding', /holds only 1 question/.test(el('pageStatus').textContent),
    el('pageStatus').textContent);
  click(el('closeBtn'));
  el('teamPick').value = '';
  fire(el('teamPick'), 'change');

  /* ---- adding --------------------------------------------------------------- */
  click(el('manualBtn'));
  t('Manual opens the add dialog', el('addDlg').classList.contains('is-open'));
  const opts = [...el('placeList').options].map((o) => o.value);
  t('the key list offers a city, a team and a waypoint',
    opts.indexOf('denver-co') >= 0 && opts.indexOf('denver-co-nfl-broncos') >= 0
    && opts.some((v) => v.indexOf('wp-') === 0), opts.length);

  el('addId').value = 'nowhere-zz'; el('addQ').value = 'Q?'; el('addA').value = 'A';
  click(el('addSave'));
  t('a key matching nothing is refused before any request',
    /Nothing matches/.test(el('addMsg').textContent) && posts('/trivia').length === 0,
    el('addMsg').textContent);

  el('addId').value = 'denver-co';
  el('addQ').value = 'One word: who?';
  click(el('addSave'));
  t('a question opening with One word is refused',
    /may not open/.test(el('addMsg').textContent), el('addMsg').textContent);

  el('addQ').value = 'Which river?'; el('addA').value = 'Two words';
  click(el('addSave'));
  t('a multi word typed answer is refused',
    /single word/.test(el('addMsg').textContent), el('addMsg').textContent);

  el('addC').value = 'Platte / South Platte'; el('addA').value = 'Missouri';
  click(el('addSave'));
  t('an answer outside its own choices is refused',
    /one of the choices/.test(el('addMsg').textContent), el('addMsg').textContent);

  el('addA').value = 'Platte';
  click(el('addSave'));
  setTimeout(() => {
    const ins = posts('/trivia')[0];
    t('a good one is inserted', !!ins);
    t('with key, answer and choices',
      ins && ins.body.id === 'denver-co' && ins.body.answer === 'Platte'
      && ins.body.choices.join('|') === 'Platte|South Platte', ins && JSON.stringify(ins.body));

    /* ---- the waypoint shape --------------------------------------------------- */
    click(el('manualBtn'));
    el('addId').value = 'wp-' + WP[0].wpid;
    el('addQ').value = 'What stood here?';
    el('addA').value = 'Something';
    el('addC').value = 'Something / Nothing';
    click(el('addSave'));
    setTimeout(() => {
      t('a wp- key resolves rather than being refused',
        !/Nothing matches/.test(el('addMsg').textContent), el('addMsg').textContent);
      t('and draws as the waypoint shape',
        rows().some((r) => r.querySelector('.chip').textContent.trim() === 'waypoint'),
        [...new Set(rows().map((r) => r.querySelector('.chip').textContent.trim()))].join(','));

      const wpRow = rows().find((r) => r.querySelector('.chip').textContent.trim() === 'waypoint');
      click(wpRow.querySelector('[data-play]'));
      t('and the popup names the waypoint, not the key',
        el('dlgSub').textContent.indexOf(WP[0].name) >= 0, el('dlgSub').textContent);
      click(el('closeBtn'));

      click(el('manualBtn'));
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      t('Escape closes the add dialog first', !el('addDlg').classList.contains('is-open'));

      t('no console errors', errs.length === 0, errs.join(' | '));
      console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
      process.exit(bad ? 1 : 0);
    }, 40);
  }, 40);
}, 60);
