/* THE ATLAS BOX, and the State / Province container that went. Read from the
   source and the built DOM: a column reaches the database through all six
   wiring points or none, and missing one is SILENT -- the picker works, the
   value shows, and the PATCH quietly does not carry it. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const s = fs.readFileSync('mc/games/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

[['the schema map', 'atlas_id: true,'],
 ['normalizeGameRow', 'atlas_id:              row && row.atlas_id'],
 ['initGameMeta, snake ?? camel ?? node', 'atlasId:              g.atlas_id ?? g.atlasId ?? gn.atlasId'],
 ['the column-to-node map', "atlas_id: 'atlasId'"],
 ['normalizeSavedGame', 'atlas_id:              raw && raw.atlas_id'],
 ['serializeGameRow', 'atlas_id:              _meta.atlasId || null']
].forEach(([n, p]) => t('wired: ' + n, s.indexOf(p) !== -1));

t('the write sends null, never an empty string', s.indexOf('_meta.atlasId || null') !== -1);
t('the loader reads the atlases table', /select: 'atlas_id,atlas_name,stop_number'/.test(s));
t('and groups the rows, since the id repeats per stop', /by\.set\(r\.atlas_id/.test(s));
t('a typed value is resolved back to an id', /function atlasFromTyped/.test(s));
t('a bare key resolves too', /byId \? byId\.id : null/.test(s));
t('a stored atlas that is not on file is NAMED, since no key can say it',
  /No atlas called ' \+ stored/.test(s));
t('the field is gated on showGameDetails, not isGameNode',
  /atlasBox\.disabled = !showGameDetails/.test(s));
t('it commits on change, not per keystroke', /addEventListener\('change', commitAtlasField\)/.test(s));

const d = new JSDOM(s).window.document;
/* THE BAR LAYOUT LIVES IN game-builder-boxes.js, not here. This suite is about
   the atlas WIRING; asserting the order in both would be two copies to keep in
   step, and they drifted the moment the Audience box split out of the Anchor --
   which is what these three assertions caught, correctly, about themselves. */
t('the atlas box is there and holds a combo bound to a datalist',
  d.getElementById('gameAtlasInput').getAttribute('list') === 'gameAtlasList'
  && !!d.getElementById('gameAtlasList'));
t('it ships disabled, like every other identity field', d.getElementById('gameAtlasInput').disabled);
t('and carries a note for what no key can enforce', !!d.getElementById('gameAtlasNote'));

/* THE STATE / PROVINCE CONTAINER, and everything that filled it. */
t('the container is gone', !d.getElementById('stateField') && !d.getElementById('nodeStateInput'));
t('and the words with it', s.indexOf('State / Province') === -1);
t('its list builders went too, per the rule that a control and its code go together',
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').indexOf('refreshStateOptions') === -1);
t('the Country field is untouched', !!d.getElementById('nodeCountryInput'));
t('and so is the City box, which carries the whole place now', !!d.getElementById('nodeCityInput'));
t('the state is derived from the city instead', /parsedCity\.stateCode/.test(s));

const all = [...s.matchAll(/id="([\w-]+)"/g)].map((x) => x[1]);
t('no repeated ids', all.filter((v, i) => all.indexOf(v) !== i).length === 0);

console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
