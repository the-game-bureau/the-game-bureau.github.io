/*
 * build-sound-page.js
 * -------------------
 * Generates the static city cards in ../index.html. Each song is a link that
 * plays on Spotify. Song titles/artists come from all-cities-spotify-import.csv
 * (the clean, curated list); the Spotify track IDs come from the Exportify CSVs
 * in ./exportify/ (one file per playlist, matched by name). A song with a known
 * track ID links straight to the track; a song without one links to a Spotify
 * search for "artist title" (still plays, just one tap more).
 *
 * It also writes song-playlists.json as the durable record, so future rebuilds
 * don't need the Exportify folder — edit that JSON and re-run:
 *     node playlists/build-sound-page.js
 */

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const INDEX_HTML = path.join(HERE, '..', 'index.html');
const MASTER_JSON = path.join(HERE, 'city-playlists.json');       // slug/city/region/playlistName (+accent)
const CLEAN_CSV = path.join(HERE, 'all-cities-spotify-import.csv'); // clean titles/artists
const EXPORTIFY_DIR = path.join(HERE, 'exportify');                 // Exportify track CSVs (for IDs)
const SONGS_JSON = path.join(HERE, 'song-playlists.json');          // durable output

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Normalize a track title for fuzzy matching: drop "- 2005 Remaster", "(feat. ...)",
// accents/punctuation, case. Non-ASCII is stripped so mojibake and accents both reduce
// to the same ASCII skeleton.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .split(/ - | \(/)[0]
    .replace(/[^a-z0-9]/g, '');
}

// Per-song identity key = normalized title + artist. Two songs can share a title
// within one city (e.g. Baltimore: Nina Simone vs. Randy Newman), so IDs/blurbs are
// keyed by title+artist, never title alone, to keep them from colliding.
function songKey(title, artist) {
  return norm(title) + '|' + norm(artist);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function exportifyFilename(playlistName) {
  return playlistName.replace(/: /g, '_').replace(/ /g, '_') + '.csv';
}

// --- load master city list ---
const master = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8')).cities;
const byName = new Map(master.map((c) => [c.playlistName, c]));

// --- previously-resolved IDs + blurbs, so ./exportify is optional on future runs ---
const prevIds = new Map();    // slug -> Map(normTitle -> id)
const prevBlurbs = new Map(); // slug -> Map(normTitle -> blurb): the "why it fits the city" line
if (fs.existsSync(SONGS_JSON)) {
  try {
    for (const c of (JSON.parse(fs.readFileSync(SONGS_JSON, 'utf8')).cities || [])) {
      const ids = new Map(), blurbs = new Map();
      for (const s of (c.songs || [])) {
        if (s.spotifyId) ids.set(songKey(s.title, s.artist), s.spotifyId);
        if (s.blurb) blurbs.set(songKey(s.title, s.artist), s.blurb);
      }
      prevIds.set(c.slug, ids);
      prevBlurbs.set(c.slug, blurbs);
    }
  } catch (e) { /* ignore malformed */ }
}

// --- load clean titles/artists, grouped by playlist name (in file order) ---
const cleanRows = parseCsv(fs.readFileSync(CLEAN_CSV, 'utf8')).slice(1);
const cleanByPlaylist = new Map();
for (const r of cleanRows) {
  const [playlist, title, artist] = r;
  if (!playlist) continue;
  if (!cleanByPlaylist.has(playlist)) cleanByPlaylist.set(playlist, []);
  cleanByPlaylist.get(playlist).push({ title, artist });
}

// --- build id indexes from each city's Exportify CSV ---
// Exportify columns: Track URI, Track Name, Artist Name(s), ... — so r[0]/r[1]/r[2].
// byKey (title+artist) is exact & collision-proof; byTitle keeps the old fuzzy fallback.
function idIndexFor(playlistName) {
  const file = path.join(EXPORTIFY_DIR, exportifyFilename(playlistName));
  if (!fs.existsSync(file)) return null;
  const rows = parseCsv(fs.readFileSync(file, 'utf8')).slice(1);
  const byKey = new Map(), byTitle = new Map();
  for (const r of rows) {
    const id = (r[0] || '').replace('spotify:track:', '').trim();
    const name = r[1] || '';
    const artist = r[2] || '';
    if (!id) continue;
    const tkey = norm(name);
    const fkey = songKey(name, artist);
    if (fkey && !byKey.has(fkey)) byKey.set(fkey, id);
    if (tkey && !byTitle.has(tkey)) byTitle.set(tkey, id);
  }
  return { byKey, byTitle };
}

function findId(idIndex, title, artist) {
  if (!idIndex) return null;
  const exact = idIndex.byKey.get(songKey(title, artist)); // artist-scoped exact match first
  if (exact) return exact;
  const key = norm(title);
  if (idIndex.byTitle.has(key)) return idIndex.byTitle.get(key);
  // fuzzy: one contains the other (guards against "The Super Bowl Shuffle" vs "Superbowl Shuffle")
  for (const [k, v] of idIndex.byTitle) {
    if (k.length >= 5 && key.length >= 5 && (k.includes(key) || key.includes(k))) return v;
  }
  return null;
}

// --- compose songs per city ---
const cities = master
  .slice()
  .sort((a, b) => String(a.city).localeCompare(String(b.city), undefined, { sensitivity: 'base' }))
  .map((c) => {
    const clean = cleanByPlaylist.get(c.playlistName) || [];
    const idIndex = idIndexFor(c.playlistName);
    const prev = prevIds.get(c.slug);
    const blurbs = prevBlurbs.get(c.slug);
    const songs = clean.map((t) => {
      let id = findId(idIndex, t.title, t.artist);    // fresh from ./exportify
      if (!id && prev) id = prev.get(songKey(t.title, t.artist)) || null; // else keep prior artist-scoped ID
      const blurb = (blurbs && blurbs.get(songKey(t.title, t.artist))) || ''; // "why it fits the city"
      return { title: t.title, artist: t.artist, spotifyId: id, blurb };
    });
    return { slug: c.slug, city: c.city, region: c.region, accent: c.accent, secondary: c.secondary, songs };
  });

// --- durable JSON record ---
fs.writeFileSync(
  SONGS_JSON,
  JSON.stringify({ cities: cities.map(({ accent, secondary, ...c }) => c) }, null, 2) + '\n',
  'utf8'
);

// --- HTML cards ---
function songHref(s) {
  return s.spotifyId
    ? 'https://open.spotify.com/track/' + s.spotifyId
    : 'https://open.spotify.com/search/' + encodeURIComponent(s.artist + ' ' + s.title);
}

function cardHtml(c) {
  // Per-city accent colors live in a generated <style> block (see accentCss below),
  // keyed by #slug — not inline styles, so the markup stays lint-clean.
  const locationLabel = c.city + ', ' + c.region;
  const items = c.songs.map((s) =>
    '            <li><a class="song-link" href="' + esc(songHref(s)) + '" target="_blank" rel="noopener">' +
    '<span class="song-main"><span class="song-title">' + esc(s.title) + '</span>' +
    '<span class="song-artist">' + esc(s.artist) + '</span></span>' +
    '<span class="song-blurb">' + esc(s.blurb || '') + '</span>' +
    '<span class="song-play">Play</span></a></li>'
  ).join('\n');
  return [
    '          <article class="playlist-card" id="' + esc(c.slug) + '">',
    '            <div class="playlist-body">',
    '              <div class="playlist-heading">',
    '                <h2 class="playlist-title">' + esc(locationLabel) + '</h2>',
    '              </div>',
    '              <ol class="song-list">',
    items,
    '              </ol>',
    '            </div>',
    '          </article>',
  ].join('\n');
}

const cardsHtml = cities.map(cardHtml).join('\n');

// Per-city accent colors as CSS rules (keyed by #slug) instead of inline styles.
const accentCss = cities
  .filter((c) => c.accent || c.secondary)
  .map((c) => {
    const decls = [];
    if (c.accent) decls.push('--city-accent: ' + c.accent);
    if (c.secondary) decls.push('--city-secondary: ' + c.secondary);
    return '    #' + c.slug + ' { ' + decls.join('; ') + '; }';
  })
  .join('\n');

// Replace everything between two markers with `inner` (which supplies its own
// surrounding newlines/indentation, ending with the indent for the end marker).
function injectBetween(html, startMark, endMark, inner) {
  const a = html.indexOf(startMark), b = html.indexOf(endMark);
  if (a === -1 || b === -1) { console.error('Markers not found: ' + startMark); process.exit(1); }
  return html.slice(0, a + startMark.length) + inner + html.slice(b);
}

// --- inject cards + accents between their markers ---
let html = fs.readFileSync(INDEX_HTML, 'utf8');
html = injectBetween(html, '<!-- CITY-CARDS:START -->', '<!-- CITY-CARDS:END -->', '\n' + cardsHtml + '\n          ');
html = injectBetween(html, '/* CITY-ACCENTS:START */', '/* CITY-ACCENTS:END */', '\n' + accentCss + '\n    ');
fs.writeFileSync(INDEX_HTML, html, 'utf8');

// --- stats ---
let total = 0, linked = 0, searched = 0;
for (const c of cities) {
  for (const s of c.songs) { total++; s.spotifyId ? linked++ : searched++; }
}
const noExport = master
  .filter((c) => !fs.existsSync(path.join(EXPORTIFY_DIR, exportifyFilename(c.playlistName))))
  .map((c) => c.city);
console.log('Cities: ' + cities.length + '  Songs: ' + total);
console.log('  direct track links: ' + linked);
console.log('  search links (no ID matched): ' + searched);
console.log('Cities with no Exportify file (all search links): ' + noExport.length);
if (noExport.length) console.log('  ' + noExport.join(', '));
