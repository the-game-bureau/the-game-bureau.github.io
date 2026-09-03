/* SEATGEEK LISTS STADIUM TOURS AS NFL FIXTURES. THEY MUST NOT REACH THE LIST.
   ---------------------------------------------------------------------------
   A stadium tour is a TICKET, not a reason to be in town, so it fails the only
   test this table applies: did this fill the hotels. And it arrives in the
   worst possible shape -- SeatGeek types one `football > nfl > sports >
   stadium_tours`, so `sgKind` reads `sports` and files it as a game.

   MEASURED ON THE LIVE CATALOGUE, 2026-09-02: 550 events carry the
   `stadium_tours` taxonomy site-wide and ALL 550 ARE AT&T STADIUM, in 7
   distinct titles -- and 81 of the first 100 events on a plain `nfl` fetch are
   those tours. Typing NFL into that box gave a list four-fifths of which was
   somebody's stadium tour.

   IT RUNS AGAINST THE REAL API, deliberately: the claim is about what SeatGeek
   actually lists, and a fixture of my own titles would only be testing my own
   guess. SeatGeek being down is not a fault here, so an unreachable run SKIPS
   and exits 0 -- the same call events-seatgeek-mascot.js makes.

   THE MATCHER IS LIFTED OUT OF THE PAGE rather than retyped. A copy here would
   drift the first time either was edited, and the copy would go on passing.

   Run with the exclusion removed it fails on the 550. */
const fs = require('fs'), vm = require('vm'), https = require('https');

const S = fs.readFileSync('mc/events/index.html', 'utf8')
  .split(String.fromCharCode(13)).join('');
const a = S.indexOf('const SG_EXCLUDE_TITLES');
const b = S.indexOf(String.fromCharCode(10) + '    }' + String.fromCharCode(10),
                    S.indexOf('function sgExcluded')) + 7;
if (a === -1 || b < 7) {
  console.log('  FAIL could not lift SG_EXCLUDE_TITLES / sgExcluded out of the page');
  process.exit(1);
}
const ctx = {}; vm.createContext(ctx); vm.runInContext(S.slice(a, b), ctx);
const sgExcluded = ctx.sgExcluded;
console.log('patterns: ' + (S.slice(a, S.indexOf(']', a) + 1).match(/'[^']+'/g) || []).join(', '));

/* The id in the page, which is public and authorises a read of the public
   catalogue and nothing else. */
const K = (S.match(/const SG_CLIENT_ID = '([^']+)'/) || [])[1];

let ok = 0, bad = 0;
const is = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const get = (u) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout')), 20000);
  https.get(u, (r) => { let d = ''; r.on('data', (c) => d += c);
    r.on('end', () => { clearTimeout(t); try { res(JSON.parse(d)); } catch (e) { rej(e); } }); })
    .on('error', (e) => { clearTimeout(t); rej(e); });
});
const api = (q) => get('https://api.seatgeek.com/2/events?client_id=' + K + '&' + q);

(async () => {
  let tours = [];
  try {
    for (let pg = 1; ; pg += 1) {
      const d = await api('taxonomies.name=stadium_tours&per_page=100&page=' + pg + '&sort=datetime_local.asc');
      const e = d.events || []; if (!e.length) break;
      e.forEach((x) => tours.push(x.short_title || x.title || ''));
      if (e.length < 100) break;
    }
  } catch (err) {
    console.log('  SKIPPED  SeatGeek is unreachable (' + err.message + '). Their being down is not a fault here.');
    process.exit(0);
  }

  const missed = tours.filter((t) => !sgExcluded(t));
  is('every stadium tour SeatGeek holds is excluded (' + tours.length + ' of them)',
     missed.length === 0, [...new Set(missed)].slice(0, 5));

  /* THE ONES THAT DO NOT END ON THE WORD TOUR are the whole reason the match is
     not anchored at the end -- `... + Dallas Cowboys Locker Room`,
     `... + Jerry Jones Experience`. Assert they exist, or the next assertion
     proves nothing. */
  const tail = tours.filter((t) => !t.trim().toLowerCase().endsWith('tour'));
  is('and some carry a suffix after Tour (' + tail.length + ')', tail.length > 0, tail[0]);
  is('those are excluded too', tail.every(sgExcluded));

  /* THE REST OF AT&T STADIUM MUST SURVIVE -- real concerts and fixtures at the
     same venue, which is the set most at risk from a loose pattern. */
  const kept = [], killed = [];
  for (let pg = 1; pg <= 8; pg += 1) {
    const d = await api('venue.id=4965&per_page=100&page=' + pg + '&sort=datetime_local.asc');
    const e = d.events || []; if (!e.length) break;
    e.forEach((x) => { const t = x.short_title || x.title || '';
      if (!(x.taxonomies || []).some((y) => y.name === 'stadium_tours')) (sgExcluded(t) ? killed : kept).push(t); });
    if (e.length < 100) break;
  }
  is('nothing else at AT&T Stadium is excluded (' + kept.length + ' kept)',
     killed.length === 0, [...new Set(killed)].slice(0, 5));

  /* THE NFL TERM IS HOW MOST PEOPLE WILL MEET THESE, and it is asserted rather
     than assumed. A first draft of this check called it a FAILURE that a league
     fetch returned tours -- the premise was wrong, not the page. */
  const nfl = await api('taxonomies.name=nfl&per_page=100&sort=datetime_local.asc');
  const nflEv = nfl.events || [];
  const nflTours = nflEv.filter((x) => (x.taxonomies || []).some((y) => y.name === 'stadium_tours'));
  is('a plain NFL fetch really does carry tours (' + nflTours.length + ' of ' + nflEv.length + ')',
     nflTours.length > 0);
  is('and every one of them is excluded', nflTours.every((x) => sgExcluded(x.short_title || x.title || '')));
  const nflReal = nflEv.filter((x) => !(x.taxonomies || []).some((y) => y.name === 'stadium_tours'))
                       .map((x) => x.short_title || x.title || '');
  const nflKilled = nflReal.filter(sgExcluded);
  is('no actual NFL fixture is excluded (' + nflReal.length + ' read)',
     nflKilled.length === 0, nflKilled.slice(0, 3));

  /* THE MATCHER ITSELF, BOTH WAYS ROUND. A check that only ever says yes would
     pass on a pattern that excluded the whole catalogue. */
  is('the words in the wrong order are kept', !sgExcluded('Tour of the AT&T Stadium'));
  is('a Cowboys fixture is kept', !sgExcluded('Philadelphia Eagles at Dallas Cowboys'));
  is('a real tour NAME is kept', !sgExcluded('The Eras Tour'));
  is('a concert at the venue is kept', !sgExcluded('George Strait at AT&T Stadium'));
  is('case does not matter', sgExcluded('at&t stadium vip guided tour'));

  console.log('');
  console.log(ok + ' ok, ' + bad + ' FAIL');
  process.exit(bad ? 1 : 0);
})();
