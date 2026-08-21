/* Shared site nav for public pages (home/games + gift shop + future).
   Drop a placeholder into the page:
     <header class="site-nav" data-site-nav></header>
     <script src="/shell/site-nav.js"></script>

   The script fills the placeholder with the shared brand + nav links.
   Site count data is fetched by /shell/site-footer.js and mirrored into the
   nav buttons through window.TgbNav.setStats.
*/
(function () {
  var header =
    document.querySelector('header[data-site-nav]') ||
    document.querySelector('header.site-nav');
  if (!header || header.dataset.tgbNavReady === 'true') return;

  header.classList.add('site-nav');

  var statValues = {};

  function statBadge(key) {
    return '<span class="nav-count" data-tgb-nav-stat="' + key + '" hidden>0</span>';
  }

  function statBadges(keys) {
    return '<span class="nav-counts">' + keys.map(statBadge).join('') + '</span>';
  }

  var navHtml =
    '<div class="brand-lockup">' +
      '<span class="brand-name">The Game Bureau</span>' +
      '<p class="brand-tagline">The Cure for the Common Walking Tour</p>' +
    '</div>' +
    '<nav class="nav-links" aria-label="Primary">' +
      '<div class="nav-primary-links" aria-label="Featured">' +
        '<a class="nav-link nav-link--major nav-link--games nav-link--has-count" href="/games/"><span class="nav-label">GAMES</span>' + statBadges(['games']) + '</a>' +
        '<a class="nav-link nav-link--major nav-link--gifts nav-link--has-count" href="/gifts/"><span class="nav-label">GIFTS</span>' + statBadges(['gifts']) + '</a>' +
        '<a class="nav-link nav-link--major nav-link--sound nav-link--has-count" href="/soundtracks/"><span class="nav-label">SOUNDTRACKS</span>' + statBadges(['soundtracks']) + '</a>' +
        '<a class="nav-link nav-link--major nav-link--highlights nav-link--has-count" href="/highlights/"><span class="nav-label">HIGHLIGHTS</span>' + statBadges(['highlights']) + '</a>' +
        // FOLLOW CARRIES NO COUNT, and that is the point of it not having one.
        // The other four badge a number that MOVES: games built, gifts stocked,
        // tapes made, scorelines posted. The accounts are five and will be five
        // next year, so a badge there would be furniture that looks like news.
        // It takes no `nav-link--has-count` class and no statBadges call; the
        // base .nav-link is already inline-flex, so it lays out with its icon
        // regardless.
        '<a class="nav-link nav-link--major nav-link--follow" href="/follow/"><span class="nav-label">FOLLOW</span></a>' +
      '</div>' +
    '</nav>';

  // ── THE FOLLOW POPUP ────────────────────────────────────────────────────
  //
  // FOLLOW is the one nav button that does not take you anywhere. The other
  // four lead to sections with hundreds of rows behind them; this one has five
  // links, and a whole page navigation to show five links is a page load, a
  // scroll and a way back for something that fits under the button.
  //
  // PROGRESSIVE ENHANCEMENT, DELIBERATELY. The button is still a real <a> to
  // /follow/ and the click is intercepted. With no JavaScript, or before this
  // runs, it navigates to the page exactly as it always did. Nothing here is
  // load-bearing for reaching the accounts.
  //
  // THIS MODULE OWNS THE LIST. The footer used to carry its own copy and they
  // had already drifted (bare instagram.com against www.), which is why that
  // column went. Anything else that needs the accounts reads TgbNav.socials()
  // rather than typing them again.
  var SOCIALS = [
    ['https://www.instagram.com/thegamebureau', 'Instagram', '@thegamebureau',
      "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='20' height='20' x='2' y='2' rx='5'/%3E%3Cpath d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z'/%3E%3Cline x1='17.5' x2='17.51' y1='6.5' y2='6.5'/%3E%3C/svg%3E"],
    // threads.COM, not .net: Meta moved the domain and the old one redirects
    // rather than resolving, a hop worth not making.
    ['https://www.threads.com/@thegamebureau', 'Threads', '@thegamebureau',
      "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.44 12.01v-.017c.06-3.576.91-6.43 2.555-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.56 12c.057 3.086.748 5.496 2.055 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.32.142 1.48.696 2.562 1.75 3.132 3.048.795 1.81.868 4.759-1.542 7.11-1.843 1.8-4.08 2.61-7.243 2.63Z'/%3E%3C/svg%3E"],
    ['https://x.com/thegamebureau', 'X', '@thegamebureau',
      "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'/%3E%3C/svg%3E"],
    ['https://www.facebook.com/thegamebureau', 'Facebook', 'The Game Bureau',
      "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'/%3E%3C/svg%3E"],
    ['https://youtube.com/@thegamebureau', 'YouTube', '@thegamebureau',
      "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12z'/%3E%3C/svg%3E"]
  ];

  var POP_STYLE_ID = 'tgb-follow-pop-css';
  var POP_CSS = [
    '.tgb-followpop-wrap { position: relative; display: inline-flex; }',
    /* A PANEL UNDER THE BUTTON, not a full-screen modal. Five links do not earn
       a scrim and a dismissal; this is a menu, and it should feel like one. */
    '.tgb-followpop {',
    '  position: absolute;',
    '  top: calc(100% + 8px);',
    '  right: 0;',
    '  z-index: 400;',
    '  min-width: 244px;',
    '  padding: 6px;',
    '  border: 1px solid rgba(27, 36, 56, 0.16);',
    '  border-radius: 12px;',
    '  background: #fff;',
    '  box-shadow: 0 10px 30px rgba(17, 24, 39, 0.16);',
    '}',
    '.tgb-followpop[hidden] { display: none; }',
    /* LINKTREE SHAPE: full-width stacked rows, each one a whole target. The
       point of that pattern is that there is nothing to aim at, because the
       row IS the button. */
    '.tgb-followpop-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 11px;',
    '  padding: 9px 11px;',
    '  border-radius: 8px;',
    '  color: #1b2438;',
    '  text-decoration: none;',
    '  transition: background 0.12s ease;',
    '}',
    '.tgb-followpop-item:hover, .tgb-followpop-item:focus-visible {',
    '  background: rgba(45, 72, 128, 0.07);',
    '  outline: none;',
    '}',
    '.tgb-followpop-item:focus-visible { box-shadow: inset 0 0 0 2px rgba(45,72,128,0.5); }',
    /* The glyph is a MASK over currentColor, the same trick the nav and footer
       icons use: one asset, whatever colour the row is. */
    '.tgb-followpop-ico {',
    '  flex: 0 0 18px;',
    '  width: 18px;',
    '  height: 18px;',
    '  background: currentColor;',
    '}',
    '.tgb-followpop-name { font-weight: 600; font-size: 0.9rem; line-height: 1.15; }',
    '.tgb-followpop-handle {',
    '  display: block;',
    '  font-family: "IBM Plex Mono", ui-monospace, monospace;',
    '  font-size: 0.68rem;',
    '  color: rgba(27, 36, 56, 0.55);',
    '}',
    /* On a phone the nav wraps and an absolutely positioned panel can hang off
       the edge. Pinned to the right of the viewport instead. */
    '@media (max-width: 560px) {',
    '  .tgb-followpop { right: 0; left: auto; min-width: 210px; }',
    '}'
  ].join('\n');

  function wireFollowPopup(link) {
    if (!link) return;
    if (!document.getElementById(POP_STYLE_ID)) {
      var st = document.createElement('style');
      st.id = POP_STYLE_ID;
      st.textContent = POP_CSS;
      document.head.appendChild(st);
    }

    var wrap = document.createElement('span');
    wrap.className = 'tgb-followpop-wrap';
    link.parentNode.insertBefore(wrap, link);
    wrap.appendChild(link);

    var pop = document.createElement('div');
    pop.className = 'tgb-followpop';
    pop.hidden = true;
    pop.setAttribute('role', 'menu');
    SOCIALS.forEach(function (s) {
      var a = document.createElement('a');
      a.className = 'tgb-followpop-item';
      a.href = s[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('role', 'menuitem');
      var ico = document.createElement('span');
      ico.className = 'tgb-followpop-ico';
      ico.style.mask = 'url("data:image/svg+xml,' + s[3] + '") center / contain no-repeat';
      ico.style.webkitMask = 'url("data:image/svg+xml,' + s[3] + '") center / contain no-repeat';
      var txt = document.createElement('span');
      var nm = document.createElement('span');
      nm.className = 'tgb-followpop-name';
      nm.textContent = s[1];
      var hd = document.createElement('span');
      hd.className = 'tgb-followpop-handle';
      hd.textContent = s[2];
      txt.append(nm, hd);
      a.append(ico, txt);
      pop.appendChild(a);
    });
    wrap.appendChild(pop);

    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');

    function open() {
      pop.hidden = false;
      link.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onOutside, true);
      document.addEventListener('keydown', onKey, true);
    }
    function close() {
      pop.hidden = true;
      link.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
    }
    function onOutside(e) { if (!wrap.contains(e.target)) close(); }
    function onKey(e) {
      if (e.key === 'Escape') { close(); link.focus(); }
    }

    link.addEventListener('click', function (e) {
      // THE ANCHOR STILL WORKS when the browser wants it to: a middle click, a
      // modified click, or a right click must open /follow/ the way any link
      // does. Only a plain left click becomes the menu.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (pop.hidden) open(); else close();
    });
  }

  var holder = document.createElement('div');
  holder.innerHTML = navHtml;
  header.prepend.apply(header, Array.prototype.slice.call(holder.childNodes));
  header.dataset.tgbNavReady = 'true';

  // FOLLOW opens a menu instead of navigating; see wireFollowPopup. Wired
  // AFTER the markup is in the document, because it re-parents the anchor
  // into a positioned wrapper.
  wireFollowPopup(header.querySelector('a.nav-link--follow'));

  function normalizePath(path) {
    if (!path) return '/';
    return path.replace(/\/+$/, '/') || '/';
  }

  var currentPath = normalizePath(location.pathname);
  header.querySelectorAll('a.nav-link').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;

    var hrefPath;
    try {
      hrefPath = normalizePath(new URL(href, location.href).pathname);
    } catch (error) {
      return;
    }

    if (hrefPath === currentPath) {
      link.setAttribute('aria-current', 'page');
    }
  });

  var statEls = {};
  header.querySelectorAll('[data-tgb-nav-stat]').forEach(function (el) {
    statEls[el.getAttribute('data-tgb-nav-stat')] = el;
  });

  var statLabels = {
    games: 'games',
    cities: 'cities',
    gifts: 'gifts',
    soundtracks: 'soundtracks',
    highlights: 'scorelines'
  };

  function formatStatPhrase(key, count) {
    var label = statLabels[key] || key;
    return count + ' ' + label;
  }

  function updateLinkAria(link) {
    if (!link) return;
    var labelEl = link.querySelector && link.querySelector('.nav-label');
    var label = labelEl ? String(labelEl.textContent || '').trim() : String(link.textContent || '').trim();
    var phrases = [];
    if (link.querySelectorAll) {
      link.querySelectorAll('[data-tgb-nav-stat]').forEach(function (el) {
        var key = el.getAttribute('data-tgb-nav-stat');
        if (key && statValues[key] != null) phrases.push(formatStatPhrase(key, statValues[key]));
      });
    }
    link.setAttribute('aria-label', phrases.length ? label + ': ' + phrases.join(', ') : label);
  }

  function setStat(key, value) {
    var el = statEls[key];
    if (!el || value == null) return;
    var count = Number(value);
    if (!isFinite(count)) count = 0;
    count = Math.max(0, Math.round(count));
    statValues[key] = count;
    el.textContent = String(count);
    el.hidden = false;

    var link = el.closest && el.closest('a.nav-link');
    updateLinkAria(link);
  }

  function setStats(games, cities, gifts, soundtracks, highlights) {
    setStat('games', games);
    setStat('cities', cities);
    setStat('gifts', gifts);
    setStat('soundtracks', soundtracks);
    setStat('highlights', highlights);
  }

  window.TgbNav = window.TgbNav || {};
  window.TgbNav.setButtonStats = setStats;
  // THE ONE LIST OF OUR ACCOUNTS. Returns copies, so a caller cannot edit
  // the source by accident. Anything that needs them reads this.
  window.TgbNav.socials = function () {
    return SOCIALS.map(function (s) {
      return { url: s[0], name: s[1], handle: s[2], icon: s[3] };
    });
  };
  window.TgbNav.setStats = setStats;
  window.TgbNav.dropdown = {
    close: function () {},
    open: function () {}
  };
  window.TgbNav.onDropdownItemClick = function () {};
}());
