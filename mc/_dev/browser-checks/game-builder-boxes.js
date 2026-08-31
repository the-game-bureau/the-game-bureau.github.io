/* THE FIVE BOXES, and what left them. Read from the built DOM and the source.
   The geometry -- whether three boxes actually FIT on one row -- is measured in
   a real browser instead; jsdom has no layout and would pass over an overflow. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const s = fs.readFileSync('mc/games/index.html', 'utf8');
const d = new JSDOM(s).window.document;
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));
const noComments = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
/* A DEAD SELECTOR IS THE OTHER HALF OF DELETING A CONTROL, so the stylesheet is
   read as well as the DOM. */
const css = [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join(' ');

/* ---- the five boxes ------------------------------------------------------ */
const bars = [...d.querySelectorAll('fieldset.game-id-bar')];
t('six bars', bars.length === 6, bars.length);
t('Anchor, Audience, Atlas, Game, Tags, Status',
  bars.map((b) => b.querySelector('legend').textContent).join(' | ')
    === 'Anchor | Audience | Atlas | Game | Tags | Status',
  bars.map((b) => b.querySelector('legend').textContent).join(' | '));

/* ---- three of them share a row ------------------------------------------- */
const row = d.querySelector('.gid-row');
t('one row', !!row && d.querySelectorAll('.gid-row').length === 1);
t('holding exactly anchor, audience, atlas',
  [...row.children].map((c) => c.id).join(',') === 'anchorBar,audienceBar,atlasBar',
  [...row.children].map((c) => c.id).join(','));
t('each keeps its own folder tab, so the row needs no legend naming all three',
  [...row.children].every((c) => c.tagName === 'FIELDSET' && !!c.querySelector('legend')));
t('the Game box is the first thing under the row',
  row.nextElementSibling && row.nextElementSibling.id === 'gameIdentityBar',
  row.nextElementSibling && row.nextElementSibling.id);

/* ---- the anchor is the event, and the audiences are their own box -------- */
t('the anchor box holds the event and nothing else',
  bars[0].querySelectorAll('.gid-field').length === 1 && !!bars[0].querySelector('#anchorEventInput'));
t('the audience box holds both fandoms, target first',
  [...bars[1].querySelectorAll('.gid-field')].map((f) => f.id).join(',')
    === 'targetAudienceField,rivalAudienceField',
  [...bars[1].querySelectorAll('.gid-field')].map((f) => f.id).join(','));
t('with both swatch strips',
  !!bars[1].querySelector('#targetAudienceSwatches') && !!bars[1].querySelector('#rivalAudienceSwatches'));
/* ONE DATALIST FOR BOTH: a second copy would be 641 duplicate option nodes and
   two lists to keep in step. */
t('one datalist still serves both audience fields',
  d.getElementById('targetAudienceInput').getAttribute('list') === 'audienceList'
  && d.getElementById('rivalAudienceInput').getAttribute('list') === 'audienceList'
  && d.querySelectorAll('#audienceList').length === 1);
t('the dead wrapper class went with the split', s.indexOf('game-id-bar-inner--anchor') === -1);

/* ---- the legacy team pickers are gone ------------------------------------ */
t('the Teams section is gone', !d.getElementById('detailsTeamsSection'));
t('and both selects with it',
  !d.getElementById('nodeAwayTeamInput') && !d.getElementById('nodeHomeTeamCityInput'));
t('the words are gone from what a reader sees',
  noComments.indexOf("Away Team (Fan's Team)") === -1);
t('no dead selector is left for the section', s.indexOf('#detailsTeamsSection') === -1);
/* `bindTeamSelect` IS KEPT ON PURPOSE, with no callers: it is the only thing
   that knows how a team select writes a city, a mascot, a key and the palette
   together. Asserted so a later sweep does not delete it as dead by accident. */
t('bindTeamSelect is still defined, deliberately', /function bindTeamSelect/.test(s));
t('and has no callers left', noComments.indexOf('bindTeamSelect(node') === -1);
/* THE PREFILL STILL WRITES THE LEGACY FIELDS; only the control went. */
t('an anchor event still fills the legacy team fields',
  /state\.currentGameMeta\.awayTeamCity = ev\.away_team_geo/.test(s)
  && /state\.currentGameMeta\.homeTeamCity = ev\.home_team_geo/.test(s));

const all = [...s.matchAll(/id="([\w-]+)"/g)].map((x) => x[1]);
t('no repeated ids', all.filter((v, i) => all.indexOf(v) !== i).length === 0);

/* ---- AND THREE IDS THAT ARE WIRED TO NOTHING, pre-existing ---------------
   `nodeAwayTeamMascotInput`, `nodeHomeTeamMascotInput` and `nodeAwayTeamCityInput`
   are looked up and never exist in the markup -- at HEAD and now. Every use is
   guarded, so nothing crashes and the code they guard can never run. The same
   fault this project recorded as five dead ids in the Tape Room. Asserted as it
   IS, so the day somebody adds the markup this check says the state changed. */
['nodeAwayTeamMascotInput', 'nodeHomeTeamMascotInput', 'nodeAwayTeamCityInput']
  .forEach((id) => t('known dead id, still absent from the markup: ' + id, !d.getElementById(id)));


/* ---- ROW 3: PRICE AND ENGINE (2026-08-31) --------------------------------
   Both were fields in the inspector drawer. They MOVED, whole, so the check is
   as much that nothing was duplicated as that they arrived. */
const _bar = d.getElementById('gameIdentityBar');
t('price is in the Game box', _bar.contains(d.getElementById('priceField')));
t('engine is in the Game box', _bar.contains(d.getElementById('engineField')));
t('and their inputs came with them',
  _bar.contains(d.getElementById('nodePriceInput')) && _bar.contains(d.getElementById('nodeEngineInput')));
/* MOVED, NOT COPIED. A second control for one column is the duplication this
   repo keeps removing, and two boxes writing `price` would disagree the moment
   one was edited. */
t('there is exactly one of each control',
  d.querySelectorAll('#nodePriceInput').length === 1 && d.querySelectorAll('#nodeEngineInput').length === 1);
/* THE PAYMENT SECTION HELD PRICE ALONE and went with it: a drawer heading over
   an empty grid is worse than no heading. */
t('the Payment section is gone', !d.getElementById('detailsPaymentSection'));
t('and no CSS rule still names it',
  css.indexOf('#detailsPaymentSection') === -1);
t('the Game box is three rows now',
  _bar.querySelectorAll('.game-id-bar-inner').length === 3,
  _bar.querySelectorAll('.game-id-bar-inner').length);
t('price and engine share the third, and it holds nothing else',
  _bar.querySelectorAll('.game-id-bar-inner')[2].querySelectorAll('.field').length === 2);
/* THE GAME ID STAYED PUT, deliberately: it is the row's permanent key, not a
   setting, and it is the one field on the page that must not be casually
   retyped -- every game points at it. */
t('the Game ID is still in the drawer',
  !!d.getElementById('selectionIdInput') && !_bar.contains(d.getElementById('selectionIdInput')));

/* ---- THE ATLAS LABEL IS A DOOR (2026-08-31) ------------------------------ */
const alink = d.querySelector('#atlasField .gid-label-link');
t('the atlas label is a link', !!alink && alink.tagName === 'A');
t('to the Atlases room', alink && alink.getAttribute('href') === '/mc/atlases/',
  alink && alink.getAttribute('href'));
t('in a new tab, so a half-edited game is not lost to a glance',
  alink && alink.getAttribute('target') === '_blank'
  && /noopener/.test(alink.getAttribute('rel') || ''));
/* AN ANCHOR INSIDE A LABEL IS THE NESTING BROWSERS DISAGREE ABOUT, and a label
   whose click both focuses an input and navigates is a control doing two things
   at once. So the anchor stands alone and the input is named directly. */
t('it is not nested in a label', !alink.closest('label'));
t('and the input is still named for a screen reader',
  d.getElementById('gameAtlasInput').getAttribute('aria-label') === 'Atlas');


console.log('');
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
