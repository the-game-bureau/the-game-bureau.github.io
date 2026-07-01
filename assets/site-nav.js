/* Shared site nav for public pages (home/games + gift shop + future).
   Drop a placeholder into the page:
     <header class="site-nav" data-site-nav></header>
     <script src="/assets/site-nav.js"></script>
   Any pre-existing children of the placeholder (e.g. a page-specific
   nav-stats block) are preserved and appear after the shared brand +
   nav-links. The script runs synchronously where it's placed in the
   document, so subsequent inline scripts can rely on the nav DOM
   being present.

   Pages that want to intercept clicks on dropdown items (e.g. the
   games page swaps mode in-place rather than reloading) can call:
     TgbNav.onDropdownItemClick(function(item, event) {
       // return false to preventDefault + close the menu.
     });
*/
(function () {
  var header =
    document.querySelector('header[data-site-nav]') ||
    document.querySelector('header.site-nav');
  if (!header || header.dataset.tgbNavReady === 'true') return;

  header.classList.add('site-nav');

  var navHtml =
    '<div class="brand-lockup">' +
      '<span class="brand-name">The Game Bureau</span>' +
      '<p class="brand-tagline">The Cure for the Common Walking Tour</p>' +
    '</div>' +
    '<nav class="nav-links" aria-label="Primary">' +
      '<div class="nav-primary-links" aria-label="Featured">' +
        '<div class="nav-dropdown" id="navGamesDropdown">' +
          '<button class="nav-link nav-link--major nav-link--games" id="navGamesBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="navGamesMenu">GAMES</button>' +
          '<div class="nav-dropdown-menu" id="navGamesMenu" role="menu" aria-labelledby="navGamesBtn" hidden>' +
            '<a class="nav-dropdown-item" href="/games/?mode=fan" role="menuitem" data-mode="fan">Who Do You Cheer For?</a>' +
            '<a class="nav-dropdown-item" href="/games/?mode=city" role="menuitem" data-mode="city">Where Are You Headed?</a>' +
          '</div>' +
        '</div>' +
        '<a class="nav-link nav-link--major nav-link--gifts" href="/shop/">GIFTS</a>' +
        '<a class="nav-link nav-link--major nav-link--highlights" href="/highlights/">HIGHLIGHTS</a>' +
      '</div>' +
    '</nav>';

  var holder = document.createElement('div');
  holder.innerHTML = navHtml;
  // Prepend in their original order so page-specific children
  // (nav-stats, etc.) stay last. Using .prepend() with spread keeps
  // the brand-lockup → nav-links ordering intact.
  header.prepend.apply(header, Array.prototype.slice.call(holder.childNodes));
  header.dataset.tgbNavReady = 'true';

  // ── aria-current="page" on the matching link ───────────────────────
  function normalizePath(p) {
    if (!p) return '/';
    return p.replace(/\/+$/, '/') || '/';
  }
  var currentPath = normalizePath(location.pathname);
  header.querySelectorAll('a.nav-link, a.nav-dropdown-item').forEach(function (a) {
    var href = a.getAttribute('href');
    if (!href) return;
    var hrefPath;
    try { hrefPath = normalizePath(new URL(href, location.href).pathname); }
    catch (e) { return; }
    if (hrefPath === currentPath) {
      a.setAttribute('aria-current', 'page');
    }
  });

  // ── Dropdown hover/click/escape ────────────────────────────────────
  var dropdown = header.querySelector('#navGamesDropdown');
  var btn = header.querySelector('#navGamesBtn');
  var menu = header.querySelector('#navGamesMenu');
  if (!dropdown || !btn || !menu) return;

  var closeTimer = null;
  function setOpen(open) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
  }
  function openMenu() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    setOpen(true);
  }
  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { closeTimer = null; setOpen(false); }, 220);
  }
  function closeNow() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    setOpen(false);
  }

  dropdown.addEventListener('mouseenter', openMenu);
  dropdown.addEventListener('mouseleave', scheduleClose);
  menu.addEventListener('mouseenter', openMenu);
  menu.addEventListener('mouseleave', scheduleClose);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (btn.getAttribute('aria-expanded') === 'true') closeNow();
    else openMenu();
  });
  document.addEventListener('click', function (e) {
    if (!dropdown.contains(e.target)) closeNow();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      closeNow();
      btn.focus();
    }
  });

  // ── Page hook for dropdown items (e.g. in-page mode switch) ────────
  window.TgbNav = window.TgbNav || {};
  window.TgbNav.dropdown = { close: closeNow, open: openMenu };
  window.TgbNav.onDropdownItemClick = function (handler) {
    if (typeof handler !== 'function') return;
    menu.querySelectorAll('.nav-dropdown-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var result;
        try { result = handler(item, e); } catch (err) { result = undefined; }
        if (result === false) {
          e.preventDefault();
          closeNow();
        }
      });
    });
  };

  // ── Auto stats chip (games + cities) ───────────────────────────────
  // Skip if the page is already painting its own nav-stats (e.g. the
  // games page drives a richer ticker tied to its filtered directory).
  if (!header.querySelector('.nav-stats')) {
    var statsHtml =
      '<div class="nav-stats" aria-label="Game count">' +
        '<div class="nav-stats-stat">' +
          '<span class="nav-stats-num" data-tgb-nav-stat="games">0</span>' +
          '<span class="nav-stats-label">games</span>' +
        '</div>' +
        '<div class="nav-stats-stat">' +
          '<span class="nav-stats-num" data-tgb-nav-stat="cities">0</span>' +
          '<span class="nav-stats-label">cities</span>' +
        '</div>' +
      '</div>';
    var statsHolder = document.createElement('div');
    statsHolder.innerHTML = statsHtml;
    header.appendChild(statsHolder.firstChild);

    var gamesEl = header.querySelector('[data-tgb-nav-stat="games"]');
    var citiesEl = header.querySelector('[data-tgb-nav-stat="cities"]');

    // ── Ticker: open-ended count-up until real numbers land ────────
    var GAME_TICK_MS = 50;
    var CITY_TICK_MS = 150;
    var EASE_DURATION = 1400;
    var gameDisplayed = 0;
    var cityDisplayed = 0;
    var gameTarget = null;
    var cityTarget = null;
    var lastGameTick = 0;
    var lastCityTick = 0;
    var easing = false;
    var easeStart = 0;
    var easeGameFrom = 0;
    var easeCityFrom = 0;
    var raf = null;

    function render() {
      if (gamesEl) gamesEl.textContent = String(gameDisplayed);
      if (citiesEl) citiesEl.textContent = String(cityDisplayed);
    }
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function tick(ts) {
      if (easing) {
        var t = Math.min(1, (ts - easeStart) / EASE_DURATION);
        var e = easeOutCubic(t);
        gameDisplayed = Math.round(easeGameFrom + (gameTarget - easeGameFrom) * e);
        cityDisplayed = Math.round(easeCityFrom + (cityTarget - easeCityFrom) * e);
        render();
        if (t >= 1) { easing = false; raf = null; return; }
      } else {
        if (!lastGameTick) lastGameTick = ts;
        if (!lastCityTick) lastCityTick = ts;
        if (ts - lastGameTick >= GAME_TICK_MS) { gameDisplayed += 1; lastGameTick = ts; }
        if (ts - lastCityTick >= CITY_TICK_MS) { cityDisplayed += 1; lastCityTick = ts; }
        render();
      }
      raf = requestAnimationFrame(tick);
    }
    function setStats(games, cities) {
      gameTarget = Number(games) || 0;
      cityTarget = Number(cities) || 0;
      if (gameDisplayed > gameTarget) gameDisplayed = gameTarget;
      if (cityDisplayed > cityTarget) cityDisplayed = cityTarget;
      easeGameFrom = gameDisplayed;
      easeCityFrom = cityDisplayed;
      easeStart = performance.now();
      easing = true;
      if (!raf) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    window.TgbNav.setStats = setStats;

    // ── Fetch live games for real targets ──────────────────────────
    var SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
    var SB_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
    fetch(SB_URL + '/rest/v1/games?select=city,archived&apikey=' + SB_KEY, {
      headers: {
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        Accept: 'application/json'
      },
      cache: 'no-store'
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var live = (Array.isArray(rows) ? rows : []).filter(function (g) {
          var a = g && g.archived;
          if (a == null) return true;
          var s = String(a).trim().toLowerCase();
          return !(s === 'yes' || s === 'true' || s === '1');
        });
        var cities = new Set();
        live.forEach(function (g) {
          var c = g && g.city ? String(g.city).trim() : '';
          if (c) cities.add(c.toLowerCase());
        });
        setStats(live.length, cities.size);
      })
      .catch(function () { /* leave ticker climbing; not worth surfacing */ });
  }
}());
