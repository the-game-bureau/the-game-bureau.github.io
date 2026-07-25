/* Shared site footer for public pages (home/games + gift shop + highlights).
   Drop a placeholder into the page:
     <footer class="site-footer" data-site-footer></footer>
     <script src="/assets/site-footer.js"></script>
   The script fills the placeholder with the standard copyright + social row,
   so the footer is literally identical across every public page (one source of
   truth, mirroring /assets/site-nav.js for the header). */
(function () {
  var footer =
    document.querySelector('footer[data-site-footer]') ||
    document.querySelector('footer.site-footer');
  if (!footer || footer.dataset.tgbFooterReady === 'true') return;

  footer.classList.add('site-footer');
  footer.innerHTML =
    '<div class="footer-stats nav-stats" aria-label="Site counts">' +
      '<a class="nav-stats-stat nav-stats-stat--link" href="/games/" aria-label="Browse games">' +
        '<span class="nav-stats-num" id="heroKickerGameCount" data-tgb-footer-stat="games">0</span>' +
        '<span class="nav-stats-label">games</span>' +
      '</a>' +
      '<a class="nav-stats-stat nav-stats-stat--link" href="/games/?mode=city" aria-label="Browse games by city">' +
        '<span class="nav-stats-num" id="heroKickerCityCount" data-tgb-footer-stat="cities">0</span>' +
        '<span class="nav-stats-label">cities</span>' +
      '</a>' +
      '<a class="nav-stats-stat nav-stats-stat--link" href="/shop/" aria-label="Browse gifts">' +
        '<span class="nav-stats-num" id="heroKickerGiftCount" data-tgb-footer-stat="gifts">0</span>' +
        '<span class="nav-stats-label">gifts</span>' +
      '</a>' +
    '</div>' +
    '<div class="footer-bottom">' +
      '<span>&copy; The Game Bureau</span>' +
      '<span class="footer-social-links">' +
        '<a href="https://instagram.com/thegamebureau" target="_blank" rel="noopener">Instagram</a>' +
        '&nbsp;&nbsp;&nbsp;' +
        '<a href="https://x.com/thegamebureau" target="_blank" rel="noopener">X</a>' +
        '&nbsp;&nbsp;&nbsp;' +
        '<a href="https://youtube.com/@thegamebureau" target="_blank" rel="noopener">YouTube</a>' +
      '</span>' +
    '</div>';
  footer.dataset.tgbFooterReady = 'true';

  var gamesEl = footer.querySelector('[data-tgb-footer-stat="games"]');
  var citiesEl = footer.querySelector('[data-tgb-footer-stat="cities"]');
  var giftsEl = footer.querySelector('[data-tgb-footer-stat="gifts"]');

  function setStats(games, cities, gifts) {
    if (games != null && gamesEl) gamesEl.textContent = String(Number(games) || 0);
    if (cities != null && citiesEl) citiesEl.textContent = String(Number(cities) || 0);
    if (gifts != null && giftsEl) giftsEl.textContent = String(Number(gifts) || 0);
  }

  window.TgbFooterStats = { setStats: setStats };
  window.TgbNav = window.TgbNav || {};
  window.TgbNav.setStats = setStats;

  // The Games page has its own animated ticker wired to the same IDs above.
  if (document.body && document.body.dataset.adminPage === 'mission-control') return;

  var SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var SB_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
  var sbHeaders = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json'
  };

  function isArchived(value) {
    if (value == null) return false;
    var s = String(value).trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  fetch(SB_URL + '/rest/v1/games?select=city,archived&apikey=' + SB_KEY, {
    headers: sbHeaders,
    cache: 'no-store'
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var live = (Array.isArray(rows) ? rows : []).filter(function (game) {
        return !isArchived(game && game.archived);
      });
      var cities = new Set();
      live.forEach(function (game) {
        var city = game && game.city ? String(game.city).trim() : '';
        if (city) cities.add(city.toLowerCase());
      });
      setStats(live.length, cities.size, null);
    })
    .catch(function () {});

  fetch(SB_URL + '/rest/v1/gift_shop_items?select=id&certified_at=not.is.null&archived=is.false&apikey=' + SB_KEY, {
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      Accept: 'application/json',
      Prefer: 'count=exact',
      Range: '0-0'
    },
    cache: 'no-store'
  })
    .then(function (r) {
      var range = r.headers.get('content-range') || '';
      var total = range.indexOf('/') >= 0 ? parseInt(range.split('/')[1], 10) : NaN;
      if (!isNaN(total)) setStats(null, null, total);
    })
    .catch(function () {});
}());
