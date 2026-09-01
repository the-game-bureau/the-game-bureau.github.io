/* THE STATUS BOX. Three radios over `games.status`, which is the one decision on
   the page: whether anybody can buy this game.

   WHAT THIS CAN AND CANNOT SEE, said rather than implied. The markup, the
   wiring and the mapping from a stored status to a checked dot are all read
   here. The PATCH leaving the page is not: opening a game needs its whole flow
   document and an admin session, which this harness does not stand up. What is
   asserted instead is that there is exactly ONE writer for the column and that
   it sends the right body. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const s = fs.readFileSync('mc/games/index.html', 'utf8');
const d = new JSDOM(s).window.document;
/* SEARCHING THE RAW SOURCE MATCHES THE COMMENT EXPLAINING A REMOVAL, which
   this project has reported as a live bug three times. Anything asking
   whether a name is GONE reads the stripped copy. */
const nc = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* ---- STATUS LIVES IN THE NAV ROW, NOT IN A BOX (2026-08-31) -------------
   It was a seventh bar at the foot of the page for a few hours. It is the one
   DECISION here -- whether anybody can buy this game -- so it belongs with New,
   Duplicate, Save and Preview, which are the other things you DO to the open
   game rather than facts you fill in about it.
   MOVED, NEVER COPIED: every id came with it, so the painter, the writer and
   all the wiring needed no edit -- which is what the assertions below still
   exercise unchanged. */
const bars = [...d.querySelectorAll('fieldset.game-id-bar')];
t('six bars now, Status having left them', bars.length === 6, bars.length);
t('and Tags is the last of them',
  bars[bars.length - 1].id === 'tagsBar', bars.map((b) => b.id).join(','));
t('the status box is gone entirely', !d.getElementById('statusBar'));

/* ---- AND IT HAS A BOX OF ITS OWN, THE THIRD ON THAT LINE ----------------
   It sat INSIDE the tool row for an hour, which made it read as a fourth
   control among Save and Preview -- and it is not the same kind of thing. Save
   and Preview ACT and are done; this is a STATE the game is left in, and the
   filled button is a standing answer rather than something that just happened.
   The row now reads as what you MAKE, what you DO with the open one, and what
   STATE you leave it in. */
const rows = d.getElementById('gameStatusRow');
const group = d.getElementById('gameStatusToggle');
t('status has a box of its own', !!rows && rows.contains(group));
t('and it is not inside the tool row',
  !d.getElementById('mbNav').contains(group));
/* THE THREE BOXES ARE SIBLINGS on one line, in the order the work runs. */
t('three boxes on the line, status last',
  [...d.querySelector('.builder-nav-rows').children].map((n) => n.id || n.className).join(' | ')
    .indexOf('gameStatusRow') > 0
  && d.querySelector('.builder-nav-rows').lastElementChild === rows,
  [...d.querySelector('.builder-nav-rows').children].map((n) => n.id || n.className).join(' | '));
t('and it wears the same box as the two beside it',
  /\bbuilder-nav-row\b/.test(rows.className), rows.className);
/* THE #mbNav HIDE RULE MUST NOT STILL NAME IT. That rule hides every child of
   the tool row but two; status is not a child of it now, so a `:not()` for it
   would be a selector naming an element that is not there. */
t('and the tool-row hide rule no longer names it',
  !/:not\(#gameStatusToggle\)/.test(s));
/* THEY WEAR THE ROW'S OWN BUTTON, borrowed rather than drawn again: a control
   invented here would read as a different KIND of thing from the four beside
   it. */
t('the three wear the same button as New, Duplicate, Save and Preview',
  [...group.querySelectorAll('span')].every((n) => /builder-nav-btn/.test(n.className)),
  [...group.querySelectorAll('span')].map((n) => n.className).join(' | '));

/* ---- three options, because there are three states ----------------------- */
const radios = [...d.querySelectorAll('input[name="gameStatus"]')];
t('three radios', radios.length === 3, radios.length);
t('exclusive by construction: one name, type radio',
  radios.every((r) => r.type === 'radio' && r.name === 'gameStatus'));
t('Post / Build / Skip, over live / building / archived',
  radios.map((r) => r.value + '=' + r.nextElementSibling.textContent).join(' ')
    === 'live=Post building=Build archived=Skip',
  radios.map((r) => r.value + '=' + r.nextElementSibling.textContent).join(' '));
/* THE WORD IS PART OF THE CONTROL, not a caption beside it, so clicking either
   picks the option. Same rule the Tape Room's filter group keeps. */
t('every word is inside a label that holds its radio',
  radios.every((r) => {
    const lab = r.closest('label');
    return lab && lab.contains(r.nextElementSibling);
  }));
t('the group is announced as a radiogroup',
  d.getElementById('gameStatusToggle').getAttribute('role') === 'radiogroup'
  && !!d.getElementById('gameStatusToggle').getAttribute('aria-label'));
/* DISABLED IN THE MARKUP, like every other field in this room: nothing here is
   usable until a game is open, and the painter is what turns them on. */
t('they ship disabled, so a page with no game open offers nothing',
  radios.every((r) => r.disabled));
/* ---- THE BOX IS A LEGEND AND THREE PILLS (2026-08-31) -------------------
   THREE THINGS WENT, and each was the box saying something twice.
     THE LABEL: the legend already says STATUS and this is the only field under
   it -- the same call the anchor, the city and the map boxes made the same day.
     THE INFO BUBBLE: `Post puts the game on sale. Build is written and
   deliberately not for sale. Skip is off the shelf.` is the three pills
   expanded into three sentences, behind a hover -- and a hover tooltip is
   unreachable on a touch screen, which makes it the worst place on the page for
   a rule that matters.
     THE NOTE UNDER THE PILLS: `On sale.` beneath a lit POST is the control
   describing itself back to you.
   AND THE WIRING WENT WITH THEM, per the standing rule that a control and its
   code go in one pass. */
t('no label repeating the legend',
  !d.querySelector('#gameStatusField .field-label'));
t('and no info bubble', !d.querySelector('#gameStatusField .field-info'));
t('and no note under the pills', !d.getElementById('gameStatusNote'));
t('and nothing left writing one',
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').indexOf('gameStatusNote') === -1);
/* THE GROUP KEEPS ITS OWN NAME, or removing the label leaves a control with no
   accessible name at all: a legend names the GROUP, not the field. */
t('and the radiogroup is still named for a screen reader',
  d.getElementById('gameStatusToggle').getAttribute('aria-label') === 'Game status',
  d.getElementById('gameStatusToggle').getAttribute('aria-label'));

/* ---- it writes `status`, which is the whole reason it exists -------------- */
/* `archived` IS 'YES' FOR BOTH BUILDING AND SKIPPED, so a control writing the
   flag can never tell those two apart -- which is exactly what the nav's
   two-way button could not do. */
t('the writer PATCHes status', /body: JSON\.stringify\(\{ status: next \}\)/.test(s));
t('and refuses a status that is not one of the three',
  /next !== 'live' && next !== 'building' && next !== 'archived'/.test(s));
/* POSTGREST ANSWERS 200 WITH AN EMPTY ARRAY WHEN RLS REFUSES. */
t('it asks for the row back', /Prefer: 'return=representation'/.test(s));
t('and reports an empty reply as a refusal, never as a success',
  /The database refused this change/.test(s));
/* A PAGE THAT NEEDS A MIGRATION MUST NAME IT, never a raw PGRST204. */
t('a database with no status column is told which file to run',
  /2026083028_three_game_statuses\.sql/.test(s));

/* ---- ONE writer for the column ------------------------------------------- */
/* THE NAV'S TWO-WAY BUTTON IS GONE, so there is no second control to keep in
   step: the radios ARE the control. `toggleCurrentGameArchiveState` went with
   it, being its only caller -- the two-way act does not survive a three-way
   column, because there is nothing left that means "the other one". */
t('the two-way toggle is gone with its button',
  nc.indexOf('toggleCurrentGameArchiveState') === -1
  && nc.indexOf('id="archiveGameBtn"') === -1);
t('and its shortcut went too, since a shortcut with no control is undiscoverable',
  nc.indexOf("isPrimaryShiftShortcut(event, 'KeyA')") === -1);
t('so setGameStatusInSupabase is the only place status is PATCHed',
  (s.match(/JSON\.stringify\(\{ status:/g) || []).length === 1,
  (s.match(/JSON\.stringify\(\{ status:/g) || []).length);
t('and the game is saved first, since a status is set on a row',
  /saveDoc\(\{ silent: true \}\)/.test(s));

/* ---- the painter reads the one reader ------------------------------------ */
t('the dot is painted from getHeaderGameGroup, the picker\'s own reader',
  /const group = entry \? getHeaderGameGroup\(entry\) : ''/.test(s));
/* THE MAPPING IS THE HALF THAT CAN BE WRONG SILENTLY -- a page showing Build
   over a posted game looks exactly like a page showing the truth. It is lifted
   out and run. */
const line = (s.match(/const want = group === 'LIVE'[^;]+;/) || [])[0];
t('the mapping is there to test', !!line);
if (line) {
  const want = (group) => {
    let out;
    // eslint-disable-next-line no-eval
    eval(line.replace('const want =', 'out ='));
    return out;
  };
  t('LIVE checks Post', want('LIVE') === 'live', want('LIVE'));
  t('BUILDING checks Build', want('BUILDING') === 'building', want('BUILDING'));
  t('ARCHIVED checks Skip', want('ARCHIVED') === 'archived', want('ARCHIVED'));
  /* NO GAME OPEN CHECKS NOTHING, rather than defaulting to one of the three --
     a dot on Post over no game is the page asserting something it cannot know. */
  t('and nothing at all with no game open', want('') === '', want(''));
}
/* NEVER WRITTEN WHILE IT HAS FOCUS, or a repaint mid-choice moves the selection
   out from under somebody using the arrow keys. The Game ID box has carried the
   same guard since 2026-08-10. */
t('a focused radio is not repainted under the user',
  /if \(document\.activeElement !== radio\) radio\.checked/.test(s));

/* ---- one listener, and it does not write for nothing --------------------- */
t('one listener on the group, not three on the radios',
  (s.match(/gameStatusToggle\.addEventListener/g) || []).length === 1);
/* A RADIO RAISES `change` ON THE WAY IN FROM THE KEYBOARD TOO, so arrowing
   across the group would file two writes to reach the third option. */
t('choosing the status it already has writes nothing',
  /A PRESS ON THE STATUS IT ALREADY HAS WRITES NOTHING/.test(s));
t('and a refused write puts the dot back', /if \(!done\) updateSelectionUi\(\)/.test(s));

/* ---- A COLUMN IS ASKED FOR OR IT IS NOT THERE (2026-08-31) ----------------
   REPORTED AS "can't change it from building to post, no error message", and
   the PATCH was landing every time. `fetchGameRowFromSupabase` did not name
   `status` in its select, so the row came home without it, `getHeaderGameGroup`
   fell through to its BUILDING default, and the dot snapped back.
   THE WRITE PATH HAS SIX WIRING POINTS AND THE READ PATH HAS THE SELECTS, and
   missing one of either is silent in a different way: a write that does not
   carry the column, or a read that cannot see what was written. */
const selects = [...s.matchAll(/buildGamesSelectColumns\(\[([\s\S]*?)\]\)/g)].map((m) => m[1]);
t('every games select that reads a game asks for status',
  selects.filter((sel) => /'name'/.test(sel)).every((sel) => /'status'/.test(sel)),
  selects.filter((sel) => /'name'/.test(sel) && !/'status'/.test(sel)).length + ' without');
/* THE ONE THAT DOES NOT IS `['id', 'nodes']`, which reads no game state. */
t('and the id-and-nodes read is left alone',
  selects.some((sel) => /'id'/.test(sel) && /'nodes'/.test(sel) && !/'name'/.test(sel) && !/'status'/.test(sel)));
t('status is in the schema map, so a stale database can turn it off',
  /^\s*status: true,/m.test(s));
/* AND THE BRANCH THAT HID IT. A press that quietly does nothing looks exactly
   like one that failed. */
t('no bare return on the write path: no game open says so',
  /Open a game before setting its status/.test(s));


console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
