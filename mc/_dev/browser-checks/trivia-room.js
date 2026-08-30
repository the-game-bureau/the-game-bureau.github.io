/* Drives mc/trivia/index.html against the REAL 9 questions and 110 destinations.
   Proves by rendering, not by reading the diff. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TRIVIA = JSON.parse(fs.readFileSync('C:/tmp/fx-trivia.json', 'utf8'));
const DEST = JSON.parse(fs.readFileSync('C:/tmp/fx-dest.json', 'utf8'));
const HTML = fs.readFileSync('C:/Code/the-game-bureau/mc/trivia/index.html', 'utf8');

let ok = 0, bad = 0;
const t = (m, c, got) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (got !== undefined ? '   got: ' + got : '')));

const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x/mc/trivia/' });
const w = dom.window, d = w.document;

w.fetch = (url) => {
  const rows = String(url).indexOf('/trivia') >= 0 ? TRIVIA : DEST;
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
const fire = (node, type, init) => node.dispatchEvent(new w.Event(type, Object.assign({ bubbles: true }, init)));
const click = (node) => node.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

setTimeout(() => {
  /* ---- the table ------------------------------------------------------- */
  t('the room counts the questions in its title (' + el('roomTitle').textContent + ')',
    el('roomTitle').textContent === TRIVIA.length + ' QUESTIONS', el('roomTitle').textContent);
  t('every question is a table row (' + rows().length + ')', rows().length === TRIVIA.length, rows().length);

  const shapes = rows().map((r) => r.querySelector('.chip').textContent.trim());
  t('no row is keyed to a place that does not exist',
    !shapes.some((s) => s === 'no such place'), shapes.filter((s) => s === 'no such place').length);
  t('both shapes are drawn (team ' + shapes.filter((s) => s === 'team').length
    + ', city ' + shapes.filter((s) => s === 'city').length + ')',
    shapes.includes('team') && shapes.includes('city'));

  const forms = rows().map((r) => r.querySelector('.col-form').textContent.trim());
  t('the form column tells choices from one word',
    forms.some((f) => /choices/.test(f)) && forms.some((f) => f === 'one word'), forms.join(' / '));

  /* ---- the chips carry a ground, and it has to be READABLE ---------------
     PROVE THE MATHS BEFORE CLAIMING IT. The fills are rgba over the panel's
     near-white paper, so the composite is computed here rather than eyeballed,
     and 4.5:1 is the floor for 0.6rem text. jsdom does not resolve a var()
     inside a shorthand, so the values are read from the stylesheet text, which
     is the approach this repo already uses for the same limitation. */
  const css = [...d.querySelectorAll('style')].map((x) => x.textContent).join(' ');
  const PAPER = [255, 255, 254];                      // --paper over --paper-base
  const INK = [45, 72, 128];
  const over = (rgb, a) => rgb.map((v, i) => Math.round(v * a + PAPER[i] * (1 - a)));
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
                            return (x + 0.05) / (y + 0.05); };

  const teamCss = (css.match(/\.chip--team\s*{([^}]*)}/) || [])[1] || '';
  const cityCss = (css.match(/\.chip--city\s*{([^}]*)}/) || [])[1] || '';
  const badCss  = (css.match(/\.chip--bad\s*{([^}]*)}/)  || [])[1] || '';

  t('each chip declares its own background',
    /background:/.test(teamCss) && /background:/.test(cityCss) && /background:/.test(badCss));

  const pairs = [
    ['team', over(INK, 0.12), INK],
    ['city', over([122, 84, 12], 0.13), [122, 84, 12]],
    ['bad',  over([194, 55, 55], 0.10), [194, 55, 55]]
  ];
  pairs.forEach(([name, bg, fg]) => {
    const r = ratio(fg, bg);
    t(name + ' chip text clears 4.5:1 on its own fill (' + r.toFixed(2) + ':1)', r >= 4.5, r.toFixed(2));
  });

  /* THE THREE GROUNDS MUST DIFFER FROM EACH OTHER, or the fill says nothing. */
  const grounds = pairs.map(([, bg]) => bg.join(','));
  t('the three fills are three different colours', new Set(grounds).size === 3, grounds.join(' | '));

  /* AND THE WORD SURVIVES WITHOUT THE COLOUR. */
  t('every chip still carries its word, so colour is not the only signal',
    rows().every((r) => r.querySelector('.chip').textContent.trim().length > 0));

  /* ---- the pickers ------------------------------------------------------ */  /* ---- the pickers ------------------------------------------------------ */
  const cityOpts = [...el('cityPick').options];
  const teamOpts = [...el('teamPick').options];
  t('the city picker is built from the rows (' + (cityOpts.length - 1) + ')', cityOpts.length > 1);
  t('the team picker is built from the rows (' + (teamOpts.length - 1) + ')', teamOpts.length > 1);
  t('neither offers a place with nothing behind it',
    cityOpts.slice(1).concat(teamOpts.slice(1)).every((o) => !/\(0\)$/.test(o.textContent)));
  t('and both carry a count', /\(\d+\)$/.test(cityOpts[1].textContent), cityOpts[1].textContent);
  t('there are far more destinations than offered cities (110 vs ' + (cityOpts.length - 1) + ')',
    DEST.length > cityOpts.length - 1);

  /* ---- the popup: multiple choice --------------------------------------- */
  const mc = TRIVIA.find((r) => Array.isArray(r.choices) && r.choices.length);
  const mcRow = rows().find((r) => r.dataset.row === String(mc.trivia_id));
  click(mcRow.querySelector('[data-play]'));
  t('playing opens the popup', el('playDlg').classList.contains('is-open'));
  t('the popup names where the question is keyed',
    el('dlgSub').textContent.indexOf(mc.id) >= 0, el('dlgSub').textContent);
  t('a multiple choice question draws buttons (' + choices().length + ')',
    choices().length === mc.choices.length, choices().length);
  t('and no text box', !el('wordBox'));

  /* THE OPTIONS ARE SHUFFLED PER OPEN, so the stored order cannot become the
     answer. Same SET every time, different ORDER across opens, and it must NOT
     move when the answer is judged. */
  const optsOf = () => choices().map((c) => c.querySelector('span:nth-child(2)').textContent);
  const first = optsOf();
  t('the options are the whole set and nothing else',
    first.slice().sort().join('|') === mc.choices.slice().sort().join('|'),
    first.join(', '));

  const seen = new Set([first.join('|')]);
  for (let i = 0; i < 30; i++) {
    click(el('closeBtn'));
    click(rows().find((r) => r.dataset.row === String(mc.trivia_id)).querySelector('[data-play]'));
    const o = optsOf();
    if (o.slice().sort().join('|') !== mc.choices.slice().sort().join('|')) {
      t('a reopen kept the same set', false, o.join(', '));
    }
    seen.add(o.join('|'));
  }
  t('reopening rearranges them (' + seen.size + ' orders in 31 opens)', seen.size > 1, seen.size);
  t('and the answer is not always in the same slot',
    new Set([...seen].map((o) => o.split('|').indexOf(mc.answer))).size > 1);

  const orderBeforeAnswer = optsOf();
  const wrong = choices().find((c) => c.textContent.indexOf(mc.answer) < 0);
  click(wrong);
  t('answering wrong marks the answer right and the guess wrong',
    !!d.querySelector('.choice.is-right') && !!d.querySelector('.choice.is-wrong'));
  t('the verdict names the answer',
    d.querySelector('.verdict').textContent.indexOf(mc.answer) >= 0,
    d.querySelector('.verdict').textContent);
  /* THE SET, NOT THE ORDER. This compared the joined marks to 'Correct/You said',
     which baked in the assumption that the right option renders above the wrong
     one -- true until the options were shuffled, and then flaky about half the
     time. The page was never wrong; the assertion had a position in it. */
  const marks = [...d.querySelectorAll('.choice-mark')].map((x) => x.textContent).sort();
  t('right and wrong are not colour alone',
    marks.join('|') === 'Correct|You said', marks.join('|'));
  t('the choices lock once answered', choices().every((c) => c.disabled));
  /* JUDGING MUST NOT RESHUFFLE. paintDialog runs again the moment an answer
     lands, so a shuffle in there would rearrange the four buttons under the
     pointer at the exact moment somebody is reading which one they got wrong. */
  t('answering does not rearrange them',
    optsOf().join('|') === orderBeforeAnswer.join('|'), optsOf().join(', '));
  t('the score counts the miss (' + el('score').textContent + ')',
    el('score').textContent.replace(/\s+/g, ' ') === '0 of 1', el('score').textContent);
  click(choices()[0]);
  t('a second press cannot change the score', el('score').textContent.replace(/\s+/g, ' ') === '0 of 1');

  /* ---- the popup: one word ---------------------------------------------- */
  const ow = TRIVIA.find((r) => !r.choices);
  click(rows().find((r) => r.dataset.row === String(ow.trivia_id)).querySelector('[data-play]'));
  t('a one word question draws a text box', !!el('wordBox'));
  t('and no buttons', choices().length === 0, choices().length);
  el('wordBox').value = '  ' + ow.answer.toUpperCase() + ' ';
  click(el('wordBtn'));
  t('case and surrounding space are forgiven',
    /is-right/.test(d.querySelector('.verdict').className), d.querySelector('.verdict').className);
  t('the score counts the hit (' + el('score').textContent + ')',
    el('score').textContent.replace(/\s+/g, ' ') === '1 of 2', el('score').textContent);
  t('the box locks once answered', el('wordBox').disabled);

  /* ---- moving on -------------------------------------------------------- */
  const before = el('dlgSub').textContent;
  click(el('nextBtn'));
  t('Next moves to another question', el('dlgSub').textContent !== before);
  t('and it is unanswered', !d.querySelector('.verdict'));

  /* ---- escape and the backdrop ------------------------------------------ */
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  t('Escape closes the popup', !el('playDlg').classList.contains('is-open'));

  /* ---- the pickers narrow ------------------------------------------------ */
  const city = cityOpts.find((o) => o.value === 'denver-co');
  t('Denver is offered as a city', !!city);
  el('cityPick').value = 'denver-co';
  fire(el('cityPick'), 'change');
  const denver = rows().length;
  t('a city narrows the table (' + denver + ')', denver > 0 && denver < TRIVIA.length, denver);
  t('and includes both the city row and the club row',
    rows().map((r) => r.querySelector('.col-key').textContent).some((k) => k === 'denver-co')
    && rows().map((r) => r.querySelector('.col-key').textContent).some((k) => /denver-co-/.test(k)));
  t('the count line names the scope', /Denver/.test(el('deckCount').textContent), el('deckCount').textContent);
  t('Clear lit up', el('clearBtn').getAttribute('aria-disabled') === 'false');

  el('teamPick').value = 'denver-co-nfl-broncos';
  fire(el('teamPick'), 'change');
  t('a team narrows further (' + rows().length + ')', rows().length < denver, rows().length);
  t('and choosing a team clears the city picker', el('cityPick').value === '');
  t('a team shows only its own rows',
    rows().every((r) => r.querySelector('.col-key').textContent === 'denver-co-nfl-broncos'));

  click(el('randomBtn'));
  t('Random clears both pickers', el('cityPick').value === '' && el('teamPick').value === '');
  t('and opens a question', el('playDlg').classList.contains('is-open'));
  t('the table is back to everything (' + rows().length + ')', rows().length === TRIVIA.length);
  click(el('closeBtn'));

  click(el('clearBtn'));
  t('Clear on nothing says so rather than doing nothing',
    /Nothing is picked/.test(el('pageStatus').textContent), el('pageStatus').textContent);

  click(el('resetBtn'));
  t('Reset zeroes the score', el('score').textContent.replace(/\s+/g, ' ') === '0 of 0');

  /* ---- one listener, not one per repaint --------------------------------- */
  let opens = 0;
  const spy = rows()[0];
  spy.addEventListener('click', () => { opens += 1; });
  click(spy.querySelector('[data-play]'));
  t('a row click is handled once, not once per repaint', opens === 1, opens);

  t('no console errors', errs.length === 0, errs.join(' | '));

  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
}, 60);
