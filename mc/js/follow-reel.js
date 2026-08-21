/* THE FOLLOW REEL, for admin surfaces.
 *
 * A one-icon-wide window with our five account icons scrolling through it. It
 * is DECORATION: it names the networks by showing them, which is more than the
 * word FOLLOW ever said, and it is the visual signature of anything to do with
 * our social accounts.
 *
 * THE REEL ITSELF IS NEVER THE CONTROL. It is aria-hidden and carries
 * pointer-events: none, always, in both of its uses. Where it needs to be
 * pressable a real <button> is put AROUND it and takes the click, which is why
 * that property can stay unconditional: the reel is the face, the button is the
 * control, and a decoration that ate a click meant for something else would be
 * a bug. On the Mission Control hub the SOCIALIZER card is one big <a>, so its
 * follow button is a SIBLING of that anchor rather than a child of it: a
 * <button> inside an <a> is invalid HTML and browsers disagree about it.
 *
 * WHY A FILE RATHER THAN INLINE. This is the THIRD place the reel has been
 * wanted (public nav, admin nav, the hub card) and the second time it was
 * copied. The public nav keeps its own copy inside shell/site-nav.js, and that
 * one cannot be shared: site-nav.js returns early when there is no public
 * header to build and never reaches its exports, so an admin page loading it
 * gets nothing. Every ADMIN surface reads this file instead.
 *
 * IT CARRIES THE URLS AS WELL AS THE ICONS, AND THAT REVERSES WHAT THIS FILE
 * SAID WHEN IT WAS WRITTEN. The first version held icons only, on the argument
 * that a drifted url sends somebody to the wrong account (which is what killed
 * the footer's old Follow column) while a drifted icon merely costs a picture.
 * That argument was sound while the reel was decoration and had nowhere to go.
 * It stopped applying the moment the hub's reel became a BUTTON that opens the
 * menu: a menu with no links in it is not a menu.
 *
 * SO THE DRIFT RISK IS REAL AGAIN and there is no clever way around it. This
 * list and the one in shell/site-nav.js are the same five accounts written
 * twice, kept in step by hand. site-nav.js cannot be shared: it returns early
 * when there is no public header to build and never reaches its exports, so an
 * admin page loading it gets nothing back. CHANGE AN ACCOUNT IN BOTH FILES.
 */
(function () {
  'use strict';

  // name and handle are shown in the menu; the icon is shared with the reel, so
  // the faces scrolling on the button and the rows behind it cannot disagree.
  var ACCOUNTS = [
    ['https://www.instagram.com/thegamebureau', 'Instagram', '@thegamebureau'],
    // threads.COM, not .net: Meta moved the domain and the old one redirects
    // rather than resolving, a hop worth not making.
    ['https://www.threads.com/@thegamebureau', 'Threads', '@thegamebureau'],
    ['https://x.com/thegamebureau', 'X', '@thegamebureau'],
    ['https://www.facebook.com/thegamebureau', 'Facebook', 'The Game Bureau'],
    ['https://youtube.com/@thegamebureau', 'YouTube', '@thegamebureau']
  ];

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
    '}',
    /* -- THE MENU ---------------------------------------------------------
       A panel under the button, not a full-screen modal. Five links do not
       earn a scrim and a dismissal; this is a menu and should feel like one.
       Same shape as the public nav's, deliberately: it is the same five
       accounts and should not read as a different object depending which
       side of the site you are standing on. */
    '.tgb-reelpop-wrap { position: relative; display: inline-flex; }',
    '.tgb-reelpop {',
    '  position: absolute;',
    '  top: calc(100% + 8px);',
    '  right: 0;',
    '  z-index: 400;',
    '  min-width: 232px;',
    '  padding: 6px;',
    '  border: 1px solid rgba(27, 36, 56, 0.16);',
    '  border-radius: 12px;',
    '  background: #fff;',
    '  box-shadow: 0 10px 30px rgba(17, 24, 39, 0.16);',
    '  text-align: left;',
    '}',
    '.tgb-reelpop[hidden] { display: none; }',
    /* Opens upward when there is more room above; see popup() for how that
       is decided. */
    '.tgb-reelpop--up { top: auto; bottom: calc(100% + 8px); }',
    /* LINKTREE SHAPE: full-width stacked rows, each one a whole target. The
       point of that pattern is there is nothing to aim at, because the row
       IS the button. */
    '.tgb-reelpop-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 11px;',
    '  padding: 9px 11px;',
    '  border-radius: 8px;',
    '  color: #1b2438;',
    '  text-decoration: none;',
    '  transition: background 0.12s ease;',
    '}',
    '.tgb-reelpop-item:hover, .tgb-reelpop-item:focus-visible {',
    '  background: rgba(45, 72, 128, 0.07);',
    '  outline: none;',
    '}',
    '.tgb-reelpop-item:focus-visible { box-shadow: inset 0 0 0 2px rgba(45,72,128,0.5); }',
    '.tgb-reelpop-ico {',
    '  flex: 0 0 18px;',
    '  width: 18px;',
    '  height: 18px;',
    '  background: currentColor;',
    '}',
    '.tgb-reelpop-name { font-weight: 600; font-size: 0.9rem; line-height: 1.15; }',
    '.tgb-reelpop-handle {',
    '  display: block;',
    '  font-family: "IBM Plex Mono", ui-monospace, monospace;',
    '  font-size: 0.68rem;',
    '  color: rgba(27, 36, 56, 0.55);',
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

  // -- THE MENU --------------------------------------------------------------
  //
  // Hangs the five accounts off any trigger you give it. The trigger keeps
  // whatever it already is; this only re-parents it into a positioned wrap so
  // the panel has something to sit under, builds the rows, and wires open and
  // close.
  //
  // IT OPENS UPWARD WHEN THERE IS MORE ROOM ABOVE, decided at open time from
  // getBoundingClientRect rather than from which trigger it is, so one function
  // is safe on a button anywhere on the page.
  function popup(trigger) {
    if (!trigger || trigger.dataset.tgbReelPop === '1') return trigger;
    trigger.dataset.tgbReelPop = '1';
    ensureCss();

    var wrap = document.createElement('span');
    wrap.className = 'tgb-reelpop-wrap';
    trigger.parentNode.insertBefore(wrap, trigger);
    wrap.appendChild(trigger);

    var pop = document.createElement('div');
    pop.className = 'tgb-reelpop';
    pop.hidden = true;
    pop.setAttribute('role', 'menu');
    ACCOUNTS.forEach(function (acct, i) {
      var a = document.createElement('a');
      a.className = 'tgb-reelpop-item';
      a.href = acct[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('role', 'menuitem');
      var ico = document.createElement('span');
      ico.className = 'tgb-reelpop-ico';
      ico.style.mask = 'url("data:image/svg+xml,' + ICONS[i] + '") center / contain no-repeat';
      ico.style.webkitMask = 'url("data:image/svg+xml,' + ICONS[i] + '") center / contain no-repeat';
      var txt = document.createElement('span');
      var nm = document.createElement('span');
      nm.className = 'tgb-reelpop-name';
      nm.textContent = acct[1];
      var hd = document.createElement('span');
      hd.className = 'tgb-reelpop-handle';
      hd.textContent = acct[2];
      txt.appendChild(nm);
      txt.appendChild(hd);
      a.appendChild(ico);
      a.appendChild(txt);
      pop.appendChild(a);
    });
    wrap.appendChild(pop);

    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');

    function onOutside(e) { if (!wrap.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') { close(); trigger.focus(); } }
    function open() {
      var box = trigger.getBoundingClientRect ? trigger.getBoundingClientRect() : null;
      var below = box ? window.innerHeight - box.bottom : 999;
      pop.classList.toggle('tgb-reelpop--up', !!(below < 260 && box && box.top > below));
      pop.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }
    function close() {
      pop.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
    }

    // preventDefault AND stopPropagation. The first is belt and braces on a
    // <button type="button">; the second is load-bearing, because the
    // outside-click handler is registered in the CAPTURE phase and would
    // otherwise see this very click on its way down and shut the menu the
    // instant it opened.
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (pop.hidden) open(); else close();
    });
    return trigger;
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

  window.TgbFollowReel = { build: build, paint: paint, popup: popup };
})();
