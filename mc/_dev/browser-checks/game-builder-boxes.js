/* THE SEVEN BOXES, and what left them. Read from the built DOM and the source.
   THE THREE-BOX ROW WENT ON 2026-08-31: the anchor, the audiences and the city
   each have a line of their own, so what this reads is the ORDER of seven
   full-width bars. How wide the fields inside them come out is measured in a
   real browser instead; jsdom has no layout and would pass over an overflow. */
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
/* COMMENTS STRIPPED. A scan for a dead selector matches the note explaining
   its removal as readily as the selector itself -- which is how this project
   has three times reported a name as present when the match was the comment
   saying it had gone. */
const css = [...s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join(' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ---- the seven boxes, in the order the work runs in ---------------------- */
const bars = [...d.querySelectorAll('fieldset.game-id-bar')];
/* SEVEN SINCE 2026-08-31: Guide came out of the inspector drawer. */
/* FIFTEEN. One thing per box is the shape this room converged on across
   2026-08-31: the name, the tagline, the game id, the emoji, the category icon,
   the logo, and last the price and the engine. */
/* FIFTEEN. The AUDIENCES bar came back on 2026-09-02, second, over
   `games.target` and `games.rival`. */
t('fifteen bars', bars.length === 15, bars.length);
/* THE ORDER IS THE ARGUMENT: why they are in town, who the game is for, where
   they walk, which walk, then what the game IS, how it is tagged, and whether
   it is on sale. */
t('the legends read in the order the work runs',
  bars.map((b) => b.querySelector('legend').textContent).join(' | ')
    === 'Anchor Event | Audiences | Game City | Map | Game Name | Tagline | Game ID | Game | Price | Engine | Default Emoji | Category Icon | Guide | Logo | Tags',
  bars.map((b) => b.querySelector('legend').textContent).join(' | '));

/* ---- EACH ON ITS OWN LINE ------------------------------------------------
   The three shared a flex row for a day. What it cost is that the box holding
   TWO fields had a third of the width, so both audience combos came out
   narrower than the single field beside them. */
t('the row wrapper is gone', d.querySelectorAll('.gid-row').length === 0,
  d.querySelectorAll('.gid-row').length);
/* AND ITS CSS WENT WITH IT, which is the other half of deleting a control:
   a dead selector is how a room ends up with a rule nobody can explain. */
t('and so did its CSS', css.indexOf('.gid-row') === -1);
t('every bar is a direct child of the page, in order',
  bars.map((b) => b.id).join(',')
    === 'anchorBar,audienceBar,cityBar,mapBar,gameNameBar,taglineBar,gameIdBar,gameIdentityBar,priceBar,engineBar,emojiBar,categoryIconBar,guideBar,logoBar,tagsBar',
  bars.map((b) => b.id).join(','));

/* ---- the anchor is the event, and there is no audience bar --------------- */
t('the anchor box holds the event and nothing else',
  bars[0].querySelectorAll('.gid-field').length === 1 && !!bars[0].querySelector('#anchorEventInput'));
/* THE AUDIENCES BAR: TWO BOXES, TARGET FIRST, EACH OVER A COLUMN OF THE SAME
   NAME. `target` -> games.target, `rival` -> games.rival. The three names
   matching is the point: the pair spent a day as a box called `target` over a
   column called `target_audience_id`, and the slot map was then the only thing
   tying them together. */
t('the audience box holds both boxes, target first',
  [...bars[1].querySelectorAll('.gid-field')].map((f) => f.id).join(',')
    === 'targetField,rivalField',
  [...bars[1].querySelectorAll('.gid-field')].map((f) => f.id).join(','));
t('as plain text boxes, not pickers',
  !!d.getElementById('target') && !!d.getElementById('rival')
  && !d.getElementById('target').hasAttribute('list')
  && !d.getElementById('rival').hasAttribute('list')
  && d.querySelectorAll('#audienceList').length === 0);
/* EACH KEEPS ITS OWN LABEL, unlike the anchor and the map: those are one field
   under a legend, so a label there would be the box named twice; this box holds
   TWO fields and one legend cannot name either. */
t('and each carries its own label',
  [...bars[1].querySelectorAll('.gid-label')].map((l) => l.textContent).join('/')
    === 'Target/Rival',
  [...bars[1].querySelectorAll('.gid-label')].map((l) => l.textContent).join('/'));
t('and its CSS is back',
  css.indexOf('gid-field--audience') !== -1
  && css.indexOf('game-id-bar-inner--audience') !== -1);
t('the dead wrapper class went with the split', s.indexOf('game-id-bar-inner--anchor') === -1);

/* ---- the legacy team pickers are gone ------------------------------------ */
t('the Teams section is gone', !d.getElementById('detailsTeamsSection'));
t('and both selects with it',
  !d.getElementById('nodeAwayTeamInput') && !d.getElementById('nodeHomeTeamCityInput'));
t('the words are gone from what a reader sees',
  noComments.indexOf("Away Team (Fan's Team)") === -1);
t('no dead selector is left for the section', s.indexOf('#detailsTeamsSection') === -1);
t('the dead team select binder is gone', !/function bindTeamSelect/.test(s));
/* THE PREFILL STILL WRITES THE LEGACY FIELDS; only the control went.

   THIS MATCHED AN EXACT SOURCE LINE AND WAS WRONG TO. `awayTeamCity =
   ev.away_team_geo` wrote a BARE CITY, which `games_away_team_city_format_check`
   refuses -- so the whole save was rejected and no game could carry an anchor.
   The fix routes both sides through `legacyTeamCityFromEvent`, and this
   assertion failed on it while the behaviour it protects was intact.

   SO IT ASKS FOR THE BEHAVIOUR: both cities go through the canonical helper,
   and both mascots still come straight off the event. */
t('an anchor event still fills the legacy team fields',
  noComments.indexOf("legacyTeamCityFromEvent(ev, 'away')") !== -1
  && noComments.indexOf("legacyTeamCityFromEvent(ev, 'home')") !== -1
  && noComments.indexOf('awayTeamCity = awayCity') !== -1
  && noComments.indexOf('homeTeamCity = homeCity') !== -1
  && noComments.indexOf('awayTeamMascot = ev.away_team_nickname') !== -1
  && noComments.indexOf('homeTeamMascot = ev.home_team_nickname') !== -1);

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


/* ---- PRICE AND ENGINE, EACH IN A BOX (2026-08-31) ------------------------
   They came out of the inspector drawer into row 3 of the GAME box that
   morning and out of it again that evening. THREE ASSERTIONS ABOUT THAT ROW
   WERE CORRECTLY BROKEN -- they read `_bar.contains(...)`, true of the
   arrangement they were written for.

   WHAT THEY WERE PROTECTING IS THE LINE BELOW: that both MOVED rather than
   being copied, since two boxes writing `price` would disagree the moment one
   was edited. */
const _bar = d.getElementById('gameIdentityBar');
t('price has a box of its own', !!d.getElementById('priceBar')
  && !_bar.contains(d.getElementById('priceField')));
t('engine has a box of its own', !!d.getElementById('engineBar')
  && !_bar.contains(d.getElementById('engineField')));
t('and their controls came with them',
  d.getElementById('priceBar').contains(d.getElementById('nodePriceInput'))
  && d.getElementById('engineBar').contains(d.getElementById('nodeEngineInput')));
/* THE LABEL GOES WHERE THE LEGEND SAYS THE SAME WORD, and each control keeps
   an `aria-label` -- a legend names the GROUP, not the field. */
t('neither box repeats its legend as a label',
  !d.querySelector('#priceBar label') && !d.querySelector('#engineBar label'));
t('and both controls are still named',
  d.getElementById('nodePriceInput').getAttribute('aria-label') === 'Price'
  && d.getElementById('nodeEngineInput').getAttribute('aria-label') === 'Engine');
/* THE ENGINE KEEPS THE BUBBLE THE LEGEND CANNOT REPLACE: it says which engine
   a game uses and that players land in it from the run page Start button. */
t('the engine keeps its bubble',
  !!d.querySelector('#engineField .field-info'));
/* AND THE WRAPPER THEY LEFT WENT WITH THEM -- markup and rule both. A wrapper
   whose only children have gone is the dead markup this repo sweeps for. */
t('the settings row and its rule are both gone',
  s.indexOf('game-id-bar-inner--settings') === -1);
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
/* ONE ROW: the intro alone. The name and the tagline left for boxes of their
   own that morning, and price and engine that evening.

   SO THE GAME BOX NOW HOLDS ONE FIELD WHOSE LABEL SAYS INTRO under a legend
   saying GAME -- which is NOT the box-named-twice fault, since the two words
   differ, but it is worth knowing: if anything else leaves, the box is a
   legend over a single paragraph and wants renaming rather than keeping. */
t('the Game box is one row now',
  _bar.querySelectorAll('.game-id-bar-inner').length === 1,
  _bar.querySelectorAll('.game-id-bar-inner').length);
t('and it is the intro',
  _bar.contains(d.getElementById('descriptionField')));
/* THE SECOND ROW IS GONE WITH ITS TWO FIELDS, so the assertion about what it
   held goes too -- it read index [1] of a list that now has one entry, which is
   a crash rather than a failure. What replaced it is the pair of box
   assertions above. */
t('and holds no second row',
  !_bar.querySelectorAll('.game-id-bar-inner')[1]);
/* THE GAME ID TOOK A BOX OF ITS OWN (2026-08-31). It is the row's permanent
   key -- six tables reference it -- which is why it was kept in the drawer for
   a day, and why it is worth reading rather than buried.

   THE ONE THING THIS HAS ALWAYS PROTECTED is that there is exactly ONE of it:
   a second box writing `id` would be the duplication this repo keeps removing,
   on the one column nothing downstream could recover from. */
t('the Game ID is in a box of its own',
  !!d.getElementById('gameIdBar')
  && !!d.getElementById('selectionIdInput')
  && !_bar.contains(d.getElementById('selectionIdInput'))
  && d.querySelectorAll('#selectionIdInput').length === 1);
/* AND SO ARE THE OTHER FOUR, each exactly once. */
t('name, tagline, emoji and icon are each in one box, once',
  d.querySelectorAll('#nodeTitleInput').length === 1
  && d.querySelectorAll('#nodeTaglineInput').length === 1
  && d.querySelectorAll('#nodeDefaultEmojiInput').length === 1
  && d.querySelectorAll('#nodeCategoryIconInput').length === 1);
/* THE LABEL GOES WHERE THE LEGEND SAYS THE SAME WORD -- the call the anchor,
   the city, the map and the status boxes all made. Each input keeps an
   `aria-label`, or it has no accessible name at all: a legend is not one. */
t('the boxed fields are named for a screen reader',
  ['nodeTitleInput', 'nodeTaglineInput', 'selectionIdInput',
   'nodeDefaultEmojiInput', 'nodeCategoryIconInput']
    .every((id) => !!(d.getElementById(id) || {}).getAttribute
      && !!d.getElementById(id).getAttribute('aria-label')));
/* THE CATEGORY ICON KEEPS ITS BUBBLE: it says which icon the PUBLIC card
   takes, which the legend does not. */
t('the category icon keeps the bubble the legend cannot replace',
  !!d.querySelector('#categoryIconField .field-info'));
/* THE LABEL WRITER WENT WITH THE LABEL. It was the only write to that span,
   so a guarded write to an element that is no longer there is dead code. */
t('the dynamic name label and its writer are both gone',
  !d.getElementById('nodeTitleLabelText') && s.indexOf('nodeTitleLabelText') === -1);
/* THE LOGO BAR SHARES THE GUIDE BAR'S CSS RATHER THAN COPYING IT, so the two
   cannot drift into two ways of drawing one idea. Asserted on the rule that
   carries the white ground, which is the one a copy would most likely lose. */
t('the logo frame shares the guide frame\'s rule',
  css.indexOf('.guide-pick-shot,') !== -1 && css.indexOf('.logo-pick-shot{') !== -1);
/* AND IT WRITES THE POINTER, NOT THE URL. `games.logo_url` is the older hosted
   copy the ENGINES read; the drawer widget that maintains it is untouched. */
t('the logo bar writes logo_id, not logo_url',
  noComments.indexOf('logo_id: next ? Number(next) : null') !== -1
  && noComments.indexOf('nodeLogoSelect') !== -1);
/* THE OLD BOX IS GONE (2026-08-31), and this assertion was CORRECTLY BROKEN by
   that: it was written an hour earlier, when the url field was deliberately
   left beside the new picker.

   WHAT IT COSTS: games.logo_url has NO EDITOR ANYWHERE. 378 games carry one,
   both ENGINES read it, nothing clears it and nothing maintains it -- the same
   trade the AWAY/HOME TEAM pickers and the three date fields already made. It
   is SQL until the engines read logos.image through games.logo_id. */
t('the old game logo url box is gone',
  !d.getElementById('nodeGameLogoInput') && !d.getElementById('gameLogoField'));
/* AND THE SHARED ASSET MACHINERY SURVIVED IT. Those helpers were written for
   the logo picker and NAMED after it, so the first cut took them and the room
   threw on first render -- the guide and bubble image menus both use them. */
t('the published-asset helpers are still there, renamed',
  /function fetchPublishedAssets/.test(s) && /function registerUploadedAsset/.test(s)
  && noComments.toLowerCase().indexOf('gamelogo') === -1);

/* ---- THE ROOM DOORS ARE LEGENDS ------------------------------------------
   The anchor door was a button beside its field and the map door was a button
   beside its field; all three are the legend now -- the room a field comes from
   is named by the field's own heading rather than by a control next to it.

   THE TAB DIFFERS AND THE DIFFERENCE IS THE POINT. The anchor is a DEPARTURE --
   somewhere you go to file an event -- and a same-tab navigation inherits this
   page's own unsaved-work warning for free. The map and the audiences are a
   GLANCE at a list, and a half-edited game must not be lost to one. */
[
  ['anchorEventRoomLink', '/mc/events/', 'same'],
  ['audienceRoomLink', '/mc/audiences/', 'new'],
  ['mapRoomLink', '/mc/atlas/', 'new']
].forEach(([id, href, tab]) => {
  const a = d.getElementById(id);
  t('the ' + id + ' door exists', !!a && a.tagName === 'A');
  if (!a) return;
  t('  and is the legend itself, not a control beside the field', !!a.closest('legend'));
  t('  going to ' + href, a.getAttribute('href') === href, a.getAttribute('href'));
  t('  in the ' + tab + ' tab',
    tab === 'new'
      ? (a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || ''))
      : !a.getAttribute('target'),
    a.getAttribute('target'));
  /* IT READS AS A LABEL FIRST, which is what `.gid-label-link` carries: a row
     of fields with one heading shouting at the others is worse than no link. */
  t('  wearing the linked-label class', a.className.indexOf('gid-label-link') !== -1, a.className);
  /* AN ANCHOR INSIDE A LABEL IS THE NESTING BROWSERS DISAGREE ABOUT, and a
     label whose click both focuses an input and navigates does two things at
     once. A LEGEND is not a label, so this holds by construction -- asserted
     so it stays true if one is ever moved back beside its field. */
  t('  and not nested in a label', !a.closest('label'));
});
/* AND EXACTLY THREE, so a fourth box growing a door is a decision somebody
   takes rather than something that arrives. */
t('three doors on the page, no more',
  d.querySelectorAll('.gid-label-link').length === 3,
  d.querySelectorAll('.gid-label-link').length);
/* THE INPUTS ARE STILL NAMED. A legend names the GROUP, never the field, so a
   box whose label became a door must name its input some other way.

   EITHER MECHANISM COUNTS, and demanding  was this check being
   wrong about the page: the two AUDIENCE fields carry real <label for> --
   Target audience and Rival audience -- which they keep BECAUSE that box holds
   two fields and one legend cannot name either. A label is the better
   mechanism where there is room for one. */
const named = (id) => {
  const el = d.getElementById(id);
  if (!el) return false;
  if (el.getAttribute('aria-label')) return true;
  return [...d.querySelectorAll('label[for]')].some((l) => l.getAttribute('for') === id);
};
t('and the anchor, map, target and rival fields are still named',
  ['gameMapInput', 'anchorEventInput', 'target', 'rival']
    .every(named));
/* HOVER IS BLACK, NOT THE ACCENT -- a pale blue on a bar whose ink is already
   blue is a shift nobody reads as a state change. Read from the stylesheet,
   since jsdom resolves no hover. */
t('a linked legend hovers to black',
  css.split(' ').join('').indexOf('.gid-label-link:hover') !== -1
  && css.split(' ').join('').indexOf('color:#000') !== -1);

/* THE ANCHOR DOOR IS THE LEGEND ITSELF (2026-08-31), which replaced a
   `View all Anchor Events` button beside the field. FOUR ASSERTIONS ABOUT THAT
   BUTTON WERE CORRECTLY BROKEN and are replaced rather than deleted: what they
   protected is that there is exactly ONE way to the events room and that it
   does not shout at the fields around it. */
const alegend = d.querySelector('#anchorBar legend a');
t('the anchor legend is the door', !!alegend && alegend.getAttribute('href') === '/mc/events/',
  alegend && alegend.getAttribute('href'));
t('and it is the only door in that box',
  d.querySelectorAll('#anchorBar a[href="/mc/events/"]').length === 1,
  d.querySelectorAll('#anchorBar a[href="/mc/events/"]').length);
/* SAME TAB: filing an event is leaving rather than glancing, and a same-tab
   navigation fires `beforeunload`, so it gets the page's existing unsaved-work
   warning with no new code. */
t('it stays in this tab', !alegend.getAttribute('target'));
/* AND THE BUTTON AND ITS RULE WENT TOGETHER -- a control and its stylesheet in
   one pass. `.gid-new--far` had no other wearer. */
t('the old button and its rule are both gone',
  !d.getElementById('anchorEventNewBtn') && s.indexOf('gid-new--far') === -1);
/* AND THE MAP BOX SAYS MAP ONCE. The legend names the group; a label under it
   saying the same word was the box named twice a few pixels apart. */
t('the map box has no label repeating its legend',
  !d.querySelector('#mapField .gid-label'));


/* ---- THE GUIDE, OUT OF THE DRAWER ------------------------------------- */
/* IT IS NOT A SETTING. A guide is the VOICE IN THE PLAYER'S EAR, which is part
   of what the game IS, so it sits under GAME rather than among Brand and
   Payment in the inspector. */
t('the guide is a bar on the page, not a drawer section',
  !!d.getElementById('guideBar') && !d.getElementById('detailsGuideSection'));
/* MOVED, NEVER COPIED, WHICH IS WHY NO WIRING CHANGED. The four hidden fields
   are the ones to watch: the save path reads them and hands the loaded guide
   straight back, so dropping them writes four empty strings over a character
   somebody wrote in the Green Room next door. */
['guidePickShot', 'nodeGuideSelect', 'guideGreenroomBtn', 'guideImageUrlInput',
 'nodeGuideNameInput', 'nodeGuideBioInput', 'nodeGuideBackgroundInput',
 'nodeGuideImageInput'].forEach((id) => {
  t('  ' + id + ' came across', !!d.getElementById(id));
});
t('and it carries the four hidden fields the save path reads',
  ['nodeGuideNameInput', 'nodeGuideBioInput', 'nodeGuideBackgroundInput',
   'nodeGuideImageInput'].every((id) => d.getElementById(id).closest('#guideBar')));
/* THE LEGEND SAYS GUIDE AND IT IS THE ONLY FIELD UNDER IT, so a label saying
   the word again was the box named twice -- the call every box on this page
   made today. */
t('the guide box has no label repeating its legend',
  !d.querySelector('#guidePickField .field-label'));
/* THE NOTE WENT TOO (2026-08-31), the day after it arrived, and its CSS with
   it -- a control and its stylesheet in one pass.

   WHAT IS LOST IS REAL AND IS RECORDED IN CLAUDE.md: nothing on screen says
   the picker WRITES ON CHOOSING, which every other box on this page
   contradicts. This asserts the removal was CLEAN rather than that the rule is
   stated -- a rule nobody can see is a decision, a class nobody wears is a
   bug. */
t('the guide note and its rule are both gone',
  !d.querySelector('.guide-note') && css.indexOf('.guide-note') === -1);
/* SCOPED TO THE PICKER, and deliberately not to the whole bar. Two bubbles
   survive on the hidden grid that carries the four save fields -- that block
   is `hidden`, so they reach no reader, and the fields themselves are
   load-bearing. Asserting over the bar would fail on markup nobody sees. */
t('so the info bubble is gone with it',
  !d.querySelector('#guidePickField .field-info'));
t('and the four save fields are in a hidden block, as they were in the drawer',
  d.getElementById('nodeGuideNameInput').closest('[hidden]') !== null);


console.log('');
/* ---- THE TGB TEAM NAMES SECTION IS GONE (2026-09-02) ----------------------
   Eight boxes over games.team01..team08, deleted with `teamInputs`, its three
   loops and `setTeamFieldValue` -- a control and its wiring go in one pass.
     THE COLUMNS ARE UNTOUCHED and still serialized from the node, so nothing is
   cleared and nothing on this page can edit them. Same trade the away/home team
   pickers and the three date fields already made. */
t('the TGB team names section is gone',
  !d.getElementById('detailsTeamNamesSection') && !d.getElementById('team01Input'));
t('and its inputs and setter went with it',
  !/teamInputs|setTeamFieldValue/.test(noComments));
t('but the columns are still written',
  noComments.indexOf('team01:                row && row.team01') !== -1
  && noComments.indexOf('getTeamFieldState') !== -1);
t('and its CSS went with it', css.indexOf('detailsTeamNamesSection') === -1);


console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
