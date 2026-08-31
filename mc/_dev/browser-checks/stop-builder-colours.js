/* THE TWO HUES: measured from the stylesheet, not eyeballed.
   jsdom does NOT resolve a var(), so a computed-colour check here would compare
   the literal string `var(--wp-ink)` and pass against a broken rule -- a trap
   this file has recorded twice. So the token VALUES are read out of the sheet
   and the contrast and separation are recomputed from them, which is what the
   Events room's band check does. */
const fs = require('fs');
const { JSDOM } = require('C:/tmp/node_modules/jsdom');
const SRC = fs.readFileSync('mc/stop-builder/index.html', 'utf8');
let ok = 0, bad = 0;
const t = (m, c, g) => c ? (ok++, console.log('  ok  ' + m))
  : (bad++, console.log('  FAIL ' + m + (g !== undefined ? '   got: ' + g : '')));

const token = (name) => {
  const m = SRC.match(new RegExp('--' + name + ':\\s*([^;]+);'));
  return m ? m[1].trim() : '';
};

const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (rgb) => {
  const a = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(hex(a)), lum(hex(b))].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const lab = (h) => {
  let [r, g, b] = hex(h).map((v) => v / 255);
  [r, g, b] = [r, g, b].map((v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (x) => x > 0.008856 ? Math.cbrt(x) : (7.787 * x) + 16 / 116;
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const dE = (a, b) => {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
};

const WP = token('wp-ink'), CH = token('ch-ink');
const INK = '#2d4880', RED = '#c23737', PANEL = '#ffffff';

t('both hues are declared as tokens', /^#[0-9a-f]{6}$/i.test(WP) && /^#[0-9a-f]{6}$/i.test(CH),
  WP + ' / ' + CH);
t('and they are not the same colour', WP.toLowerCase() !== CH.toLowerCase());

/* CONTRASTING IS THE ASK, and dE is what measures it: two hues can sit close in
   Lab and still differ in hue angle, which is the pair a reader cannot separate. */
t('they are far apart: dE >= 60', dE(WP, CH) >= 60, dE(WP, CH).toFixed(1));

/* AND EACH MUST BE READABLE WHERE IT IS ACTUALLY USED -- a kicker at 0.58rem. */
t('waypoint hue clears 4.5:1 on the panel', contrast(WP, PANEL) >= 4.5, contrast(WP, PANEL).toFixed(2));
t('challenge hue clears 4.5:1 on the panel', contrast(CH, PANEL) >= 4.5, contrast(CH, PANEL).toFixed(2));

/* NOTHING IN THIS ROOM MAY RESEMBLE THE RED PEN. The Events room shipped a band
   whose token WAS the error red, byte for byte, and it read as a fault. */
t('neither is the red pen: dE >= 50', dE(WP, RED) >= 50 && dE(CH, RED) >= 50,
  dE(WP, RED).toFixed(1) + ' / ' + dE(CH, RED).toFixed(1));
/* NOR THE ROOM'S OWN INK, or a coloured label reads as ordinary text. */
t('neither is the room ink: dE >= 25', dE(WP, INK) >= 25 && dE(CH, INK) >= 25,
  dE(WP, INK).toFixed(1) + ' / ' + dE(CH, INK).toFixed(1));

/* ---- and the rules actually apply them -------------------------------------
   A correct token proves nothing about what a viewer sees. */
t('the row halves are given their side', /stop-half--wp/.test(SRC) && /stop-half--ch/.test(SRC));
t('each side sets --half-ink from its own token',
  /\.stop-half--wp \{ --half-ink: var\(--wp-ink\)/.test(SRC)
  && /\.stop-half--ch \{ --half-ink: var\(--ch-ink\)/.test(SRC));
t('the kicker takes it', /\.stop-kicker \{[\s\S]{0,220}color: var\(--half-ink/.test(SRC));
t('and the left edge confirms it', /\.stop-half \{[\s\S]{0,200}border-left: 3px solid var\(--half-ink/.test(SRC));
t('RANDOM takes the challenge hue, not a third colour',
  /\.stop-name\.is-random \{ color: var\(--ch-ink\)/.test(SRC));
t('and the old accent is gone from it', !/\.stop-name\.is-random \{ color: var\(--bic-blue\)/.test(SRC));
t('the popup wears the same two hues',
  /#svWaypoint \{ --half-ink: var\(--wp-ink\)/.test(SRC)
  && /#svChallenge \{ --half-ink: var\(--ch-ink\)/.test(SRC));
/* THE LATER RULE WOULD HAVE WON ON SOURCE ORDER. `.sv-label` is declared twice
   at the same weight, so a colour in the second would quietly undo the first. */
t('the generic sv-label rule declares no colour of its own',
  !/\.sv-label \{\n      font: 700 0\.58rem[\s\S]{0,120}color:/.test(SRC));

/* ---- the built DOM ---------------------------------------------------------- */
const dom = new JSDOM(SRC, { url: 'https://x/mc/stop-builder/' });
t('the blurb is the one sentence',
  dom.window.document.querySelector('.room-blurb').textContent
    === 'A stop is a waypoint plus a challenge, in a city.',
  dom.window.document.querySelector('.room-blurb').textContent);

console.log('');
console.log('  wp ' + WP + '  ch ' + CH
  + '  |  dE apart ' + dE(WP, CH).toFixed(1)
  + '  |  contrast ' + contrast(WP, PANEL).toFixed(2) + ' / ' + contrast(CH, PANEL).toFixed(2));
console.log(ok + ' ok, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
