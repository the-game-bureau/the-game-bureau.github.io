/* POST AND SKIP DECISION SURFACES (2026-08-31; Socializer renamed 2026-09-02).
   These read the SOURCE for the faces a room builds and the maps it builds them
   from, plus a rendered check that the old words are gone from what a reader
   sees. The identifiers must NOT have moved: renaming a column or a class would
   be the opposite of the bargain this project makes with these renames. */
const fs = require('fs');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const read = (f) => fs.readFileSync(f, 'utf8');
/* COMMENTS ARE NOT COPY. This project has three times reported a word as
   PRESENT because the match was the comment explaining its removal. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');

const TAPE = read('mc/soundtracks/index.html');
const GIFT = read('mc/gifts/index.html');
const SOC  = read('mc/socializer/index.html');
const GAME = read('mc/games/index.html');
const EDGE = read('mc/supabase/functions/socials-post/index.ts');
const DIRECT_POST_START = EDGE.lastIndexOf('const { data: row, error: rowErr } = await supa');
const DIRECT_POST_END = EDGE.indexOf('// 200 even on a total failure', DIRECT_POST_START);
const DIRECT_POST = EDGE.slice(DIRECT_POST_START, DIRECT_POST_END === -1 ? EDGE.length : DIRECT_POST_END);

console.log('\n-- the Tape Room --');
t('the two maps say Post and Skip',
  /STATUS_LABEL = \{ LIVE: 'Posted', SHELVED: 'Skipped' \}/.test(TAPE)
  && /STATUS_VERB = \{ LIVE: 'Post', SHELVED: 'Skip' \}/.test(TAPE));
t('the track switch reads Skipped | Posted',
  /tape-air-word--off">Skipped</.test(TAPE) && /tape-air-word--on">Posted</.test(TAPE));
t('the batch panel offers Post and Skip',
  /btn\('Post', 'primary'/.test(TAPE) && /btn\('Skip', 'primary'/.test(TAPE));
t('both delete confirmations offer Skip instead',
  (TAPE.match(/btn\('Skip instead', 'primary'/g) || []).length === 2,
  (TAPE.match(/btn\('Skip instead', 'primary'/g) || []).length);
t('the key legend reads P post, S skip',
  /\['P', 'post'\], \['S', 'skip'\]/.test(TAPE));
t('P is bound, and L and K are kept as aliases',
  /key === 'p' \|\| key === 'l' \|\| key === 'k'/.test(TAPE));
t('the column and the status strings did NOT move',
  /'LIVE'/.test(TAPE) && /'SHELVED'/.test(TAPE) && /archived: true/.test(TAPE));
t('and neither did the class',
  /\.track-line\.is-shelved/.test(TAPE));

console.log('\n-- the Gift Shop --');
t('the process buttons read POST and SKIP',
  />\s*POST<\/button>/.test(GIFT) && />\s*SKIP<\/button>/.test(GIFT));
t('LATER survives, because it is not a decision',
  />\s*LATER<\/button>/.test(GIFT));
t('the status words are Posted / Post and Skipped / Skip',
  /LIVE:\s*\{ on: 'Posted',\s*off: 'Post' \}/.test(GIFT)
  && /SHELVED: \{ on: 'Skipped',\s*off: 'Skip' \}/.test(GIFT));
t('REVIEW keeps its own word, being the state a gift arrives in',
  /REVIEW:\s*\{ on: 'Reviewing', off: 'Review' \}/.test(GIFT));
t('the radios read Posted and Skipped',
  /value="LIVE" data-status-choice>\s*<span>Posted<\/span>/.test(GIFT)
  && /value="SHELVED" data-status-choice>\s*<span>Skipped<\/span>/.test(GIFT));
t('the filter reads Posted / Skipped / Not skipped',
  /Filter: Posted</.test(GIFT) && /Filter: Skipped</.test(GIFT) && /Filter: Not skipped</.test(GIFT));
t('the finished-sitting tally says posted and skipped',
  /d\.live \+ ' posted'/.test(GIFT) && /d\.shelve \+ ' skipped'/.test(GIFT));
t('the values and the class did NOT move',
  /value="LIVE"/.test(GIFT) && /value="SHELVED"/.test(GIFT)
  && /process-shelve/.test(GIFT) && /id="processLive"/.test(GIFT));

console.log('\n-- the Socializer --');
t('the decision button reads FILE AS POSTED',
  /doneBtn\.textContent = 'FILE AS POSTED'/.test(SOC));
t('and Skip is still beside it', /queued \? 'Skip queued' : 'Skip'/.test(SOC));
t('its tooltip says FILE, so the face cannot be read as an action',
  /'File this as posted to ' \+ used\.join/.test(SOC)
  && /does not post \\?\n?/.test(SOC.replace(/\s+/g, ' ')) || /does not post/.test(SOC));
t('and says outright that it sends nothing', /It sends nothing/.test(SOC));
t('the id and the class did NOT move',
  /doneBtn/.test(SOC) && /post-done/.test(SOC));
t('the account buttons are still named for accounts, not for the verb',
  /PLATFORM_NAME/.test(SOC));
t('machine posts tick account buttons and stay in Review',
  /postSessionReceipts/.test(SOC)
  && /storedLabels/.test(SOC)
  && /posted_platforms/.test(SOC)
  && /noteUsed\(k, r\.id\)/.test(SOC)
  && /Press FILE AS POSTED when this/.test(SOC)
  && !/function finishMachineRun/.test(SOC));
t('FILE AS POSTED is what marks the row posted',
  /doneBtn\.addEventListener\('click'/.test(SOC)
  && /markPosted\(used\.slice\(\), false\)/.test(SOC));
t('Socializer has no send-later controls',
  !/post-platform--later|schedBackdrop|schedCard|schedGo|openScheduleDialog|writeSchedule/.test(SOC));
t('direct socials-post does not auto-file the row',
  /Direct button presses do NOT move the row/.test(EDGE)
  && /receiptPatch\(row, results\)/.test(DIRECT_POST)
  && !/update\(\{[\s\S]*status:\s*'posted'/.test(DIRECT_POST));
t('scheduler calls are disabled',
  /x-tgb-scheduler/.test(EDGE)
  && /scheduled social posting has been removed/.test(EDGE)
  && !/async function runSweep|tgb_claim_due_socials/.test(EDGE));

console.log('\n-- the Game Builder --');
t('the picker groups read POSTED / BUILDING / SKIPPED',
  /key: 'LIVE', label: 'POSTED'/.test(GAME)
  && /key: 'BUILDING', label: 'BUILDING'/.test(GAME)
  && /key: 'ARCHIVED', label: 'SKIPPED'/.test(GAME));
t('a row that is not on sale is marked from a map, not from the key',
  /GROUP_WORD = \{ LIVE: '', BUILDING: 'building', ARCHIVED: 'skipped' \}/.test(GAME));
t('the counts line says posted and skipped',
  /' posted \+ '/.test(GAME) && /' skipped = '/.test(GAME));
/* THE NAV'S TWO-WAY BUTTON IS GONE (2026-08-31) and the three words are on the
   Status radios instead. It could say posted or not and could never reach
   BUILDING, because `archived` is 'YES' for both building and skipped. */
t('the three words are the three radios',
  /value="live"[\s\S]*?>Post</.test(GAME)
  && /value="building"[\s\S]*?>Build</.test(GAME)
  && /value="archived"[\s\S]*?>Skip</.test(GAME));
t('and the two-way nav button is gone', GAME.indexOf('id="archiveGameBtn"') === -1);
t('the erase dialog offers Skip instead', />Skip instead<\/button>/.test(GAME));
/* THE IDENTIFIERS NEVER MOVE WITH THE VISIBLE COPY, which is the bargain this
   whole rename made. */
t('the group keys, the column and the ids did NOT move',
  /getHeaderGameGroup/.test(GAME) && /status === 'archived'/.test(GAME)
  && /id="gameArchiveConfirmBtn"/.test(GAME));

console.log('\n-- the old words are gone from what a reader sees --');
const gone = [
  ['the Tape Room', TAPE, [/btn\('Go live'/, /btn\('Shelve',/, /'Shelve instead'/,
                           /tape-air-word--on">Live</, /'shelved, ' \+ total/]],
  ['the Gift Shop', GIFT, [/>\s*GO LIVE<\/button>/, />\s*SHELVE<\/button>/,
                           /off: 'Go live'/, /off: 'Shelve'/, /Filter: Shelved</]],
  ['the Socializer', SOC, [/doneBtn\.textContent = 'Done'/,
                           /doneBtn\.textContent = 'Post'/]],
  ['the Game Builder', GAME, [/label: 'LIVE'/, /label: 'ARCHIVED'/,
                              /'Unarchive' : 'Archive'/, /' live \+ '/, /' archived = '/]]
];
gone.forEach(([name, src, pats]) => {
  const body = stripComments(src);
  pats.forEach((re) => {
    t(name + ': no ' + re.source.slice(0, 34), !re.test(body));
  });
});

console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
