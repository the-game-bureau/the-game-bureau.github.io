/* THE MAP BOX, and the State / Province container that went. Read from the
   source and the built DOM: a column reaches the database through all six
   wiring points or none, and missing one is SILENT -- the picker works, the
   value shows, and the PATCH quietly does not carry it. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const s = fs.readFileSync('mc/games/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

/* `games.map_id` IS A LIVE COLUMN AND THE FLAG IS ON (2026-09-06). This check
   used to assert `map_id: false` on the premise that the column had been
   dropped on 2026-09-02; it had not -- a PATCH of it lands and a select of it
   answers 200 -- and that flag was the ONLY gate on the write path, so the map
   bar read and could not save while the assertion passed. The flag being TRUE
   is what makes a pick reach the PATCH; the other five wiring points are the
   rest of the path. */
[['the schema map has the column ON', 'map_id: true,'],
 ['normalizeGameRow', 'map_id:              row && row.map_id'],
 ['initGameMeta, snake ?? camel ?? node', 'mapId:              g.map_id ?? g.mapId ?? gn.mapId'],
 ['the column-to-node map', "map_id: 'mapId'"],
 ['normalizeSavedGame', 'map_id:              raw && raw.map_id'],
 ['serializeGameRow', 'map_id:              _meta.mapId || null']
].forEach(([n, p]) => t('wired: ' + n, s.indexOf(p) !== -1));

t('the write sends null, never an empty string', s.indexOf('_meta.mapId || null') !== -1);
t('the loader reads the maps table', /select: 'map_id,map_name,stop_order'/.test(s));
t('and groups the rows, since the id repeats per stop', /by\.set\(r\.map_id/.test(s));
t('a typed value is resolved back to an id', /function mapFromTyped/.test(s));
t('a bare key resolves too', /byId \? byId\.id : null/.test(s));
t('a stored map that is not on file is NAMED, since no key can say it',
  /No map called ' \+ stored/.test(s));
t('the field is gated on showGameDetails, not isGameNode',
  /mapBox\.disabled = !showGameDetails/.test(s));
t('it commits on change, not per keystroke', /addEventListener\('change', commitMapField\)/.test(s));

const d = new JSDOM(s).window.document;
/* THE BAR LAYOUT LIVES IN game-builder-boxes.js, not here. This suite is about
   the map WIRING; asserting the order in both would be two copies to keep in
   step, and they drifted the moment the Audience box split out of the Anchor --
   which is what these three assertions caught, correctly, about themselves. */
t('the map box is there and holds a combo bound to a datalist',
  d.getElementById('gameMapInput').getAttribute('list') === 'gameMapList'
  && !!d.getElementById('gameMapList'));
t('it ships disabled, like every other identity field', d.getElementById('gameMapInput').disabled);
t('and carries a note for what no key can enforce', !!d.getElementById('gameMapNote'));

/* THE STATE / PROVINCE CONTAINER, and everything that filled it. */
t('the container is gone', !d.getElementById('stateField') && !d.getElementById('nodeStateInput'));
t('and the words with it', s.indexOf('State / Province') === -1);
t('its list builders went too, per the rule that a control and its code go together',
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').indexOf('refreshStateOptions') === -1);
/* AND THE COUNTRY FIELD FOLLOWED IT ON 2026-08-31. This asserted its SURVIVAL,
   which was right when only the state picker had gone: the point was that
   removing one control must not take its neighbour with it. Both are gone now
   for the same reason -- a field whose only right answer is derivable from the
   city is a field that can be got wrong -- so what is checked is that the
   DERIVATION is what is left. */
t('the Country field went the same way', !d.getElementById('nodeCountryInput'));
t('and its filler with it, per the rule that a control and its code go together',
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').indexOf('fillCountrySelect') === -1);
t('the country is derived from the city instead',
  /const countryCode = parsedCity\.countryCode/.test(s));
t('and so is the City box, which carries the whole place now', !!d.getElementById('nodeCityInput'));
t('the state is derived from the city instead', /parsedCity\.stateCode/.test(s));

const all = [...s.matchAll(/id="([\w-]+)"/g)].map((x) => x[1]);
t('no repeated ids', all.filter((v, i) => all.indexOf(v) !== i).length === 0);

console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
