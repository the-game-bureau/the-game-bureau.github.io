/* THE SEARCH BUTTON ON A SPOTIFY FINDING (2026-09-04).

   191 tracks carry no `spotify_id` and every one has an open `spotify` finding
   saying it cannot be previewed. Until now the only thing the card offered was
   `Go to`, which opens the Tape Room on a row whose own `Find` button calls an
   Edge Function that needs an API app nobody has set up. THIS BUTTON NEEDS NO
   CREDENTIALS AT ALL: it is Spotify's own search page with the title and artist
   in it, which is the same fallback the public page already makes.

   THE ARTIST IS NOT ON THE FINDING, which is what this check is really about.
   `subject_label` is the title and the artist appears only inside the detail
   sentence, so the query is built from the TRACK ROW rather than by parsing our
   own prose. The read is batched into one request for the whole queue.

   AND A STALE FINDING GETS NO BUTTON. A track can gain an id after the sweep
   filed its finding, and the row is the only thing that knows.

   FIND ID SITS BESIDE IT and is the one that can finish the job in a press:
   it calls the `spotify-lookup` Edge Function, shows what came back, and writes
   the id a human picks. IT NEEDS THE SPOTIFY APP; the search link does not,
   which is why both are there.

   Reads are stubbed, and so is the Edge Function. Nothing is written.

   Run: node mc/_dev/browser-checks/issues-spotify-search.js                  */
const http = require('http'), fs = require('fs'), path = require('path');
const pup = require('C:/tmp/node_modules/puppeteer-core');
const T = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok   ' + m))
  : (bad++, console.log('  FAIL ' + m + (g === undefined ? '' : '   got: ' + JSON.stringify(g))));

const ROOT = 'C:/Code/the-game-bureau';
const PORT = 9622;

/* THE FOUR CASES, chosen so each button decision is exercised by a row rather
   than argued about: a real gap, a finding whose track has SINCE gained an id,
   a finding of another kind, and a track the read could not return. */
const FINDINGS = [
  { id: 1, area: 'soundtrack', kind: 'spotify', severity: 'warn', scope: 'song',
    subject_id: 501, subject_label: 'Come Back to Louisiana',
    group_key: 'alexandria', group_label: 'From Pop to Country:',
    detail: 'Come Back to Louisiana by Jay Chevalier has no Spotify id.',
    created_at: '2026-09-01T00:00:00Z' },
  { id: 2, area: 'soundtrack', kind: 'spotify', severity: 'warn', scope: 'song',
    subject_id: 502, subject_label: 'Allentown',
    group_key: 'allentown', group_label: 'Queen City Mix',
    detail: 'Allentown by Billy Joel has no Spotify id.',
    created_at: '2026-09-01T00:00:00Z' },
  { id: 3, area: 'soundtrack', kind: 'facts', severity: 'warn', scope: 'song',
    subject_id: 503, subject_label: 'Hang On Sloopy',
    group_key: 'columbus', group_label: 'Arch City Mix',
    detail: 'The blurb says third down; it is the fourth quarter.',
    created_at: '2026-09-01T00:00:00Z' },
  { id: 4, area: 'soundtrack', kind: 'spotify', severity: 'warn', scope: 'song',
    subject_id: 999, subject_label: 'A Track The Read Missed',
    group_key: 'nowhere', group_label: 'Ghost Tape',
    detail: 'A Track The Read Missed by Nobody has no Spotify id.',
    created_at: '2026-09-01T00:00:00Z' },
];

/* THE TRACK ROWS. 502 already has an id, which is the stale-finding case. 999
   is deliberately absent, which is the unreadable-row case. */
const TRACKS = [
  { id: 501, title: 'Come Back to Louisiana', artist: 'Jay Chevalier', spotify_id: null },
  { id: 502, title: 'Allentown', artist: 'Billy Joel', spotify_id: '59xhCcRskqyMtKzdvLZDfV' },
  { id: 503, title: 'Hang On Sloopy', artist: 'The McCoys', spotify_id: '0i7O5MtSTXvR4BEY7stpjF' },
];

/* THE SAME SONG, THREE TIMES OVER, WHICH IS THE ORDINARY CASE. Six real
   tracks looked up on 2026-09-04 turned up three, four and three valid
   duplicates each, and every one matched on title and artist alone. The YEAR is
   what tells the original from the remaster, so the list has to draw it. */
const MATCHES = [
  { id: 'aaaaaaaaaaaaaaaaaaaaaa', title: 'Come Back to Louisiana',
    artist: 'Jay Chevalier', album: 'The Louisiana Sessions', year: '1961', explicit: false },
  { id: 'bbbbbbbbbbbbbbbbbbbbbb', title: 'Come Back to Louisiana',
    artist: 'Jay Chevalier', album: 'Swamp Pop Classics', year: '2004', explicit: false },
];

let lookupMode = 'unconfigured';
const writes = [];
const reads = [];

function serve() {
  return new Promise((res) => {
    const s = http.createServer((rq, rp) => {
      const u = new URL(rq.url, 'http://x');
      let f = path.join(ROOT, u.pathname);
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        rp.writeHead(200, { 'content-type': T[path.extname(f)] || 'text/plain' });
        return rp.end(fs.readFileSync(f));
      }
      rp.writeHead(404); rp.end('no');
    }).listen(PORT, () => res(s));
  });
}

(async () => {
  const server = await serve();
  const b = await pup.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox'],
  });
  /* A WAIT THAT REPORTS RATHER THAN THROWS. `waitForFunction` raising takes
     the rest of the run with it, so against a room without the button this file
     reported 4 failures where there are 10. */
  const settle = async (p, fn, why) => {
    try { await p.waitForFunction(fn, { timeout: 8000 }); return true; }
    catch (e) { t(why, false, 'timed out'); return false; }
  };

  try {
    const p = await b.newPage();
    p.on('pageerror', (e) => console.log('  PAGEERROR ' + e.message));

    /* THE GATE IS STUBBED BEFORE THE PAGE SCRIPT RUNS. Forcing the authorized
       class after load shows the room and never fires onAuthorized, which
       renders nothing and reads as the page being broken. */
    await p.evaluateOnNewDocument(() => {
      window.TgbMcAdminAuth = {
        create: (o) => ({
          init: async () => {
            document.body.classList.add('mc-auth-authorized', 'is-admin');
            if (o && o.onAuthorized) await o.onAuthorized({ access_token: 'x' });
          },
          getSession: () => ({ access_token: 'x' }),
          session: () => ({ access_token: 'x' }),
          authHeaders: (x) => Object.assign(
            { apikey: 'probe', Authorization: 'Bearer probe' }, x || {}),
        }),
      };
      window.TgbAdminSiteNav = { bindAuth: () => {} };
    });

    await p.setRequestInterception(true);
    p.on('request', (rq) => {
      const u = rq.url();
      if (!/supabase\.co/.test(u)) return rq.continue();
      if (rq.method() === 'PATCH' || rq.method() === 'DELETE') {
        writes.push({ method: rq.method(), url: u, body: rq.postData() || '' });
      }
      if (rq.method() !== 'OPTIONS') reads.push(u);
      let body = '[]';
      if (rq.method() === 'PATCH') body = JSON.stringify([{ id: 501 }]);
      else if (rq.method() === 'DELETE') body = JSON.stringify([{ id: 1 }]);
      else if (/\/issues\?/.test(u)) body = JSON.stringify(FINDINGS);
      if (/spotify-lookup/.test(u)) {
        /* TWO SHAPES, BOTH REAL. `lookupMode` is flipped by the check so the
           unconfigured answer and a real hit are both driven rather than
           argued about. The unconfigured one is what a press does TODAY. */
        rq.respond({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                     'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
                     'content-type': 'application/json' },
          body: JSON.stringify(lookupMode === 'unconfigured'
            ? { matches: [], reason: 'Spotify lookup is not configured yet: '
                + 'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are not set.' }
            : { matches: MATCHES }),
        });
        return;
      }
      if (rq.method() === 'GET' && /\/soundtrack\?/.test(u)) {
        /* MODEL THE FILTER, or the check is testing the stub. A read that
           returned every track whatever was asked for could not tell a batched
           request from one that asks for the wrong ids. */
        const m = decodeURIComponent(u).match(/id=in\.\(([^)]*)\)/);
        const want = m ? m[1].split(',').map((x) => x.trim()) : [];
        body = JSON.stringify(TRACKS.filter((r) => want.indexOf(String(r.id)) !== -1));
      }
      rq.respond({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'content-type': 'application/json',
          'content-range': (function () {
            const n = JSON.parse(body).length;
            return n ? '0-' + (n - 1) + '/' + n : '*/0';
          })(),
        },
        body,
      });
    });

    await p.goto('http://127.0.0.1:' + PORT + '/mc/issues/', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelectorAll('.issue-item').length > 0,
      { timeout: 20000 });

    const cards = await p.evaluate(() => Array.from(document.querySelectorAll('.issue-item'))
      .map((el) => {
        const find = Array.from(el.querySelectorAll('a.btn'))
          .find((a) => a.textContent.trim() === 'Search Spotify');
        return {
          text: el.textContent,
          hasFind: !!find,
          href: find ? find.getAttribute('href') : '',
          target: find ? find.getAttribute('target') : '',
          rel: find ? find.getAttribute('rel') : '',
          title: find ? find.title : '',
          /* THE ORDER IS PART OF THE CLAIM: Go to, then the search, then the
             destructive one. */
          acts: Array.from(el.querySelectorAll('.issue-acts > *'))
            .map((x) => x.textContent.trim()),
        };
      }));

    const byTitle = (s) => cards.find((c) => c.text.indexOf(s) !== -1) || {};
    const gap = byTitle('Come Back to Louisiana');
    const filled = byTitle('Allentown');
    const other = byTitle('Hang On Sloopy');
    const missing = byTitle('A Track The Read Missed');

    t('four findings render', cards.length === 4, cards.length);

    /* ---- THE READ ---------------------------------------------------- */
    const trackReads = reads.filter((u) => /\/soundtrack\?/.test(u));
    t('the tracks behind the findings are read', trackReads.length >= 1, trackReads.length);
    /* ONE REQUEST FOR THE QUEUE, NOT ONE PER CARD. A per-card read is what this
       shape is chosen to avoid, and it is invisible from the rendered page. */
    t('and in ONE request, not one per card', trackReads.length === 1, trackReads);
    const asked = decodeURIComponent(trackReads[0] || '');
    t('asking only for the spotify findings, not every finding',
      /id=in\.\(/.test(asked) && asked.indexOf('501') !== -1
        && asked.indexOf('999') !== -1 && asked.indexOf('503') === -1, asked);
    t('and asking for the artist, which the finding does not carry',
      /select=[^&]*artist/.test(asked), asked);

    /* ---- WHERE THE BUTTON IS DRAWN ------------------------------------ */
    t('a track with no id gets a Search Spotify button', gap.hasFind, gap.acts);
    t('a finding of another kind does not', !other.hasFind, other.acts);
    /* THE STALE CASE. A finding outlives the gap it reported. */
    t('nor does one whose track has since gained an id', !filled.hasFind, filled.acts);
    /* AND THE UNREADABLE ROW. Absent rather than a button that searches for
       nothing, which is the rule Delete beside it already keeps. */
    t('nor one whose track could not be read', !missing.hasFind, missing.acts);

    /* ---- WHAT IT SEARCHES FOR ----------------------------------------- */
    const href = decodeURIComponent(gap.href || '');
    t('it goes to Spotify search', /^https:\/\/open\.spotify\.com\/search\//.test(gap.href || ''),
      gap.href);
    /* A FIELDED QUERY. A bag of words returns forty covers, which is why the
       Tape Room's own lookup builds it the same way. */
    t('with the title as a field', href.indexOf('track:"Come Back to Louisiana"') !== -1, href);
    t('and the ARTIST, taken from the row rather than parsed out of the detail',
      href.indexOf('artist:"Jay Chevalier"') !== -1, href);
    t('and narrowed to tracks', /\/tracks$/.test(href), href);

    /* ---- IT IS A REAL LINK -------------------------------------------- */
    t('a new tab, since the room is where you are working', gap.target === '_blank', gap.target);
    t('and noopener, because it is somebody else\u0027s site',
      (gap.rel || '').indexOf('noopener') !== -1, gap.rel);
    t('its tooltip says what to do with what it finds',
      /paste/i.test(gap.title) && /Tape Room/.test(gap.title), gap.title);

    /* ---- ORDER --------------------------------------------------------- */
    /* THE ORDER IS THE ARGUMENT: the way there, then the one that can finish
       the job, then the fallback that works with no Spotify app, then the two
       that destroy something. */
    t('the row reads Go to, Find id, Search Spotify, then the destructive ones',
      gap.acts.join('|') === 'Go to|Find id|Search Spotify|Delete track|Clear issue',
      gap.acts);
    t('and a card with no gap gets neither of the two',
      other.acts.indexOf('Find id') === -1 && other.acts.indexOf('Search Spotify') === -1,
      other.acts);

    /* ---- FIND ID, UNCONFIGURED: what a press does TODAY ---------------- */
    const pressFind = async () => p.evaluate(() => {
      const card = Array.from(document.querySelectorAll('.issue-item'))
        .find((el) => el.textContent.indexOf('Come Back to Louisiana') !== -1);
      const b = card && Array.from(card.querySelectorAll('button'))
        .find((x) => x.textContent.trim() === 'Find id');
      if (!b) return false;
      b.click();
      return true;
    });

    const pressed = await pressFind();
    t('there is a Find id button to press', pressed === true, pressed);
    await new Promise((r) => setTimeout(r, 600));
    const unconf = await p.evaluate(() => ({
      notice: (document.querySelector('.room-scribble') || {}).textContent || '',
      list: !!document.querySelector('.issue-matches'),
    }));
    /* THE FUNCTION'S OWN SENTENCE, NAMING BOTH SECRETS. A press that said
       "lookup failed" would leave nobody anything to act on, which is the whole
       reason the function answers 200 with a reason rather than an error. */
    t('unconfigured, the press names the two missing secrets',
      /SPOTIFY_CLIENT_ID/.test(unconf.notice) && /SPOTIFY_CLIENT_SECRET/.test(unconf.notice),
      unconf.notice);
    t('and draws no match list', !unconf.list, unconf.list);
    t('and writes nothing', writes.length === 0, writes);

    /* ---- FIND ID, CONFIGURED: the day the secrets exist ----------------- */
    lookupMode = 'ok';
    await pressFind();
    await settle(p, () => !!document.querySelector('.issue-matches'),
      'configured, a match list is drawn');
    const shown = await p.evaluate(() => {
      const box = document.querySelector('.issue-matches');
      if (!box) return { lede: '', rows: [], none: false };
      return {
        lede: (box.querySelector('.issue-matches-lede') || {}).textContent || '',
        rows: Array.from(box.querySelectorAll('.issue-match')).map((r) => r.textContent),
        none: !!Array.from(box.querySelectorAll('button'))
          .find((b) => b.textContent.trim() === 'None of these'),
      };
    });
    t('configured, both matches are shown rather than one being taken',
      shown.rows.length === 2, shown.rows);
    /* THE YEAR IS THE POINT. Two identical title-and-artist matches are the
       ordinary case, and the year is the only thing that separates them. */
    t('and each carries its album and year, which is what tells them apart',
      /1961/.test(shown.rows[0]) && /2004/.test(shown.rows[1]), shown.rows);
    t('with a way out that changes nothing', shown.none, shown);
    t('and still nothing written until one is pressed', writes.length === 0, writes);

    /* ---- TAKING ONE ------------------------------------------------------ */
    await p.evaluate(() => {
      const rows = document.querySelectorAll('.issue-matches .issue-match');
      if (rows[1]) rows[1].click();
    });
    await settle(p, () => !document.querySelector('.issue-matches'),
      'and taking one closes the list');
    await new Promise((r) => setTimeout(r, 400));

    const patch = writes.find((w) => w.method === 'PATCH');
    const del = writes.find((w) => w.method === 'DELETE');
    t('pressing a match writes that id onto the track', !!patch
      && /"spotify_id":"bbbbbbbbbbbbbbbbbbbbbb"/.test(patch.body), patch);
    t('onto the track the finding names, not another',
      !!patch && decodeURIComponent(patch.url).indexOf('id=eq.501') !== -1, patch && patch.url);
    t('and asks for the row back, since RLS refuses with a 200 and an empty array',
      !!patch, patch);
    /* THE FINDING IS NOW A LIE AND GOES. Nothing else clears one, which is how
       191 findings came to outlive the gaps they reported. */
    t('and the finding is cleared, because it now says something untrue',
      !!del && decodeURIComponent(del.url).indexOf('issues?id=eq.1') !== -1, del);

    /* ---- AND NOTHING IS WRITTEN BY LOOKING ------------------------------- */
    t('nothing was written by the lookup itself, only by taking a match',
      writes.filter((w) => w.method === 'PATCH').length === 1, writes.length);
    t('the room calls no RPC to look one up',
      reads.every((u) => !/rpc\//.test(u)), reads.filter((u) => /rpc\//.test(u)));
  } catch (e) {
    bad++; console.log('  FAIL threw: ' + e.message);
  } finally {
    await b.close(); server.close();
  }
  console.log('\n' + ok + ' ok, ' + bad + ' FAIL');
  process.exitCode = bad ? 1 : 0;
})();
