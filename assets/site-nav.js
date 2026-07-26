/* Shared site nav for public pages (home/games + gift shop + future).
   Drop a placeholder into the page:
     <header class="site-nav" data-site-nav></header>
     <script src="/assets/site-nav.js"></script>

   The script fills the placeholder with the shared brand + nav links.
   Site count data is fetched by /assets/site-footer.js and mirrored into the
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
        '<a class="nav-link nav-link--major nav-link--gifts nav-link--has-count" href="/shop/"><span class="nav-label">GIFTS</span>' + statBadges(['gifts']) + '</a>' +
        '<a class="nav-link nav-link--major nav-link--sound nav-link--has-count" href="/sound/"><span class="nav-label">SOUNDTRACKS</span>' + statBadges(['soundtracks']) + '</a>' +
        '<a class="nav-link nav-link--major nav-link--highlights nav-link--has-count" href="/highlights/"><span class="nav-label">HIGHLIGHTS</span>' + statBadges(['highlights']) + '</a>' +
      '</div>' +
    '</nav>';

  var holder = document.createElement('div');
  holder.innerHTML = navHtml;
  header.prepend.apply(header, Array.prototype.slice.call(holder.childNodes));
  header.dataset.tgbNavReady = 'true';

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
  window.TgbNav.setStats = setStats;
  window.TgbNav.dropdown = {
    close: function () {},
    open: function () {}
  };
  window.TgbNav.onDropdownItemClick = function () {};
}());
