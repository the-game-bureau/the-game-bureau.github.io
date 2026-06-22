// Strip the city / state / ZIP out of each waypoint's address field, leaving the
// street only. Matches against the row's own city/state/zip values (handling
// full-name vs 2-letter state), so it's reliable. Coordinate addresses are left
// alone. Pure string work + DB writes — no geocoding. Writes incrementally.

const SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
const PUB = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
const PROJECT = 'qmaafbncpzrdmqapkkgr';
const TOKEN = process.env.SB_TOKEN;
const clean = (v) => String(v == null ? '' : v).trim();
const norm = (s) => clean(s).toLowerCase().replace(/\s+/g, ' ');
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const US_STATES = [
  ['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],['Colorado','CO'],
  ['Connecticut','CT'],['Delaware','DE'],['District of Columbia','DC'],['Florida','FL'],['Georgia','GA'],
  ['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],['Indiana','IN'],['Iowa','IA'],['Kansas','KS'],['Kentucky','KY'],
  ['Louisiana','LA'],['Maine','ME'],['Maryland','MD'],['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],
  ['Mississippi','MS'],['Missouri','MO'],['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],['New Hampshire','NH'],
  ['New Jersey','NJ'],['New Mexico','NM'],['New York','NY'],['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],
  ['Oklahoma','OK'],['Oregon','OR'],['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],
  ['South Dakota','SD'],['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],['Virginia','VA'],
  ['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY']
];
function stateForms(state) {
  const v = norm(state);
  const forms = new Set();
  if (v) forms.add(v);
  for (const [full, abbr] of US_STATES) {
    if (v === full.toLowerCase() || v === abbr.toLowerCase()) { forms.add(full.toLowerCase()); forms.add(abbr.toLowerCase()); }
  }
  return forms;
}

// Full state names (strippable after a comma OR space) and 2-letter abbreviations
// (strippable ONLY after a comma, so a street's "St NE" directional is safe).
const STATE_FULL = US_STATES.map(([f]) => f).sort((a, b) => b.length - a.length).map(escapeRe).join('|');
const STATE_ABBR = US_STATES.map(([, a]) => a).join('|');

function stripLocality(address, city, state, zip) {
  let a = clean(address);
  if (!a) return '';
  if (/^\s*-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?\s*$/.test(a)) return a; // coords — leave alone
  const c = clean(city);
  let prev;
  do {
    prev = a;
    a = a.replace(/[\s,]+$/, '').trim();
    a = a.replace(/[\s,]+(u\.?s\.?a\.?|united states(?: of america)?)$/i, '').trim();   // country
    a = a.replace(/[\s,]+\d{4,6}(?:-\d{4})?$/, '').trim();                                  // zip / postcode
    a = a.replace(new RegExp('[\\s,]+(?:' + STATE_FULL + ')$', 'i'), '').trim();            // full state name
    a = a.replace(new RegExp(',\\s*(?:' + STATE_ABBR + ')$', 'i'), '').trim();              // state abbr (after comma only)
    a = a.replace(/,\s*[A-Za-z .'’-]+ (?:County|Parish|Borough)$/i, '').trim();        // "X County/Parish/Borough"
    if (c) a = a.replace(new RegExp('[\\s,]+' + escapeRe(c) + '$', 'i'), '').trim();        // the row's city
  } while (a !== prev);
  return a.replace(/[\s,]+$/, '').trim();
}

const DRY = !!process.env.DRY;
async function flush(buf) {
  if (!buf.length) return;
  if (DRY) { buf.length = 0; return; }
  const res = await fetch('https://api.supabase.com/v1/projects/' + PROJECT + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: buf.join('\n') })
  });
  if (!res.ok) console.log('  WRITE ERROR ' + res.status + ': ' + (await res.text()));
  buf.length = 0;
}

async function main() {
  if (!TOKEN) { console.error('No SB_TOKEN'); process.exit(1); }
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(SB_URL + '/rest/v1/waypoints?select=wpid,name,address,city,state,zip&order=wpid.asc',
      { headers: { apikey: PUB, Authorization: 'Bearer ' + PUB, Range: from + '-' + (from + 999) } });
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  console.log('Loaded ' + rows.length + ' waypoints.');

  const buf = [];
  let changed = 0, sample = 0;
  for (const w of rows) {
    const cur = clean(w.address);
    const next = stripLocality(w.address, w.city, w.state, w.zip);
    if (next === cur) continue;
    changed++;
    if (sample < 12) { console.log('  #' + w.wpid + '  "' + cur + '"  ->  "' + next + '"'); sample++; }
    buf.push('update public.waypoints set address=' + (next ? sq(next) : 'null') + ' where wpid=' + Number(w.wpid) + ';');
    if (buf.length >= 50) await flush(buf);
  }
  await flush(buf);
  console.log('\nCleaned ' + changed + ' addresses (of ' + rows.length + ').');
}
main();
