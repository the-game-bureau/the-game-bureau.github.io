/* THE FOLLOW REEL, for admin surfaces.
 *
 * A one-icon-wide window with our five account icons scrolling through it. It
 * is DECORATION: it names the networks by showing them, which is more than the
 * word FOLLOW ever said, and it is the visual signature of anything to do with
 * our social accounts.
 *
 * IT IS NOT A CONTROL. No click handler, no href, aria-hidden, and
 * pointer-events: none so it cannot swallow a click meant for whatever it sits
 * inside. On the Mission Control hub it sits inside the SOCIALIZER card, which
 * is itself one big link, and a decoration that ate that click would be a bug.
 *
 * WHY A FILE RATHER THAN INLINE. This is the THIRD place the reel has been
 * wanted (public nav, admin nav, the hub card) and the second time it was
 * copied. The public nav keeps its own copy inside shell/site-nav.js, and that
 * one cannot be shared: site-nav.js returns early when there is no public
 * header to build and never reaches its exports, so an admin page loading it
 * gets nothing. Every ADMIN surface reads this file instead.
 *
 * ICONS ONLY, NEVER THE URLS. That asymmetry is the safety argument. A drifted
 * url sends somebody to the wrong account, which is what killed the footer's
 * old Follow column; a drifted icon costs a picture. Nothing here links
 * anywhere, so there is no url to get wrong. Adding a sixth account means
 * editing this file and shell/site-nav.js; until both are done the reel simply
 * shows five.
 */
(function () {
  'use strict';

  var ICONS = [
    // Instagram
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='20' x='2' y='2' rx='5'/%3E%3Cpath d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z'/%3E%3Cline x1='17.5' x2='17.51' y1='6.5' y2='6.5'/%3E%3C/svg%3E",
    // Threads
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.44 12.01v-.017c.06-3.576.91-6.43 2.555-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.56 12c.057 3.086.748 5.496 2.055 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.32.142 1.48.696 2.562 1.75 3.132 3.048.795 1.81.868 4.759-1.542 7.11-1.843 1.8-4.08 2.61-7.243 2.63Z'/%3E%3C/svg%3E",
    // X
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'/%3E%3C/svg%3E",
    // Facebook
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'/%3E%3C/svg%3E",
    // YouTube
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12z'/%3E%3C/svg%3E"
  ];

  var STYLE_ID = 'tgb-follow-reel-css';

  // SIZE IS A CSS VARIABLE so a host can match whatever it sits beside without
  // this file knowing anything about that page. The keyframes are written in
  // multiples of it, which is why they use calc rather than fixed pixels: the
  // track has to travel exactly one tile per step or the icons land half cut.
  var CSS = [
    '.tgb-reel {',
    '  --reel-size: 17px;',
    '  display: inline-block;',
    '  width: var(--reel-size);',
    '  height: var(--reel-size);',
    '  overflow: hidden;',
    '  vertical-align: -0.15em;',
    /* DECORATION, SO IT NEVER TAKES A CLICK. The hub card is one big anchor and
       this sits inside its heading; without this a press on the icon would be a
       press on nothing instead of on the card. */
    '  pointer-events: none;',
    '}',
    '.tgb-reel-track {',
    '  display: block;',
    '  will-change: transform;',
    '  animation: tgbReel 11s infinite;',
    '}',
    /* currentColor, so it takes the colour of whatever it is sitting in and
       needs no light and dark copy. */
    '.tgb-reel-tile {',
    '  display: block;',
    '  width: var(--reel-size);',
    '  height: var(--reel-size);',
    '  background: currentColor;',
    '}',
    /* Each icon HOLDS, then slides. A continuous crawl is a fidget; a hold
       reads as "these are the five" and gives the eye time to name one. */
    '@keyframes tgbReel {',
    '  0%, 16%   { transform: translateY(0); }',
    '  20%, 36%  { transform: translateY(calc(var(--reel-size) * -1)); }',
    '  40%, 56%  { transform: translateY(calc(var(--reel-size) * -2)); }',
    '  60%, 76%  { transform: translateY(calc(var(--reel-size) * -3)); }',
    '  80%, 96%  { transform: translateY(calc(var(--reel-size) * -4)); }',
    '  100%      { transform: translateY(calc(var(--reel-size) * -5)); }',
    '}',
    /* A LOOPING ANIMATION IS EXACTLY WHAT THIS SETTING IS FOR. Frozen on the
       first icon, which is still a truthful face. */
    '@media (prefers-reduced-motion: reduce) {',
    '  .tgb-reel-track { animation: none; }',
    '}'
  ].join('\n');

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // SIX TILES FOR FIVE ACCOUNTS. The last frame repeats the first, so the track
  // travels one whole tile past the end and the loop restarts at 0 invisibly.
  // Without the repeat it snaps backwards through four icons every eleven
  // seconds.
  function build() {
    ensureCss();
    var reel = document.createElement('span');
    reel.className = 'tgb-reel';
    reel.setAttribute('aria-hidden', 'true');
    var track = document.createElement('span');
    track.className = 'tgb-reel-track';
    ICONS.concat([ICONS[0]]).forEach(function (ic) {
      var tile = document.createElement('span');
      tile.className = 'tgb-reel-tile';
      tile.style.mask = 'url("data:image/svg+xml,' + ic + '") center / contain no-repeat';
      tile.style.webkitMask = 'url("data:image/svg+xml,' + ic + '") center / contain no-repeat';
      track.appendChild(tile);
    });
    reel.appendChild(track);
    return reel;
  }

  // Fills any empty element carrying data-tgb-reel, so a host page declares it
  // in markup and never has to write a line of script. Painted twice for the
  // same reason room-blurbs.js is: once now for a script at the end of the
  // body, once on DOMContentLoaded for one in the head.
  function paint(root) {
    var scope = root || document;
    Array.prototype.forEach.call(
      scope.querySelectorAll('[data-tgb-reel]'),
      function (el) {
        if (el.dataset.tgbReelReady === '1') return;
        el.dataset.tgbReelReady = '1';
        el.appendChild(build());
      }
    );
  }

  paint();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { paint(); });
  }

  window.TgbFollowReel = { build: build, paint: paint };
})();
