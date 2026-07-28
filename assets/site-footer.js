/* Shared site footer for public pages (home/games + gift shop + highlights).
   Drop a placeholder into the page:
     <footer class="site-footer" data-site-footer></footer>
     <script src="/assets/site-footer.js"></script>
   The script fills the placeholder with the standard copyright + social row,
   so the footer is literally identical across every public page (one source of
   truth, mirroring /assets/site-nav.js for the header). */
(function () {
  // Styles ship with the markup so a page only needs the one <script> tag.
  // Everything is in palette vars, so the sign-off follows whichever skin the
  // page is wearing (the civic layer remaps the same names).
  // `body .site-footer.site-footer` is specificity, not shouting: the skin sets
  // `body.home-page .site-footer`, and a plain `.site-footer` rule would lose to
  // it no matter where this stylesheet lands.
  var FOOTER_CSS = [
    'body .site-footer.site-footer{display:block;margin:0;padding:14px 2px 22px;',
    'border:0;border-radius:0;background:transparent;box-shadow:none;}',
    'body .site-footer.site-footer .footer-bottom{display:flex;flex-wrap:wrap;align-items:center;',
    'justify-content:space-between;gap:10px 18px;}',
    '.site-footer .footer-mark{font-size:.72rem;letter-spacing:.06em;color:var(--muted,#69655e);}',
    '.site-footer .footer-social-links{display:flex;flex-wrap:wrap;gap:18px;}',
    'body .site-footer.site-footer a{font-size:.72rem;font-weight:700;letter-spacing:.06em;',
    'color:var(--muted,#69655e);text-decoration:none;}',
    'body .site-footer.site-footer a:hover,body .site-footer.site-footer a:focus-visible{',
    'color:var(--accent,#2d4880);text-decoration:underline;text-underline-offset:3px;outline:none;}',
    '.footer-mark-stack{display:grid;gap:4px;justify-items:start;}',
    /* Right column mirrors the left: the social row, with Mission Control on its
       own line beneath it. */
    '.footer-social-stack{display:grid;gap:4px;justify-items:end;}',
    /* Field guide lightbox: the article lives at /shop/aboutshop.html and is
       fetched on demand, so there is one copy of the text for every page. The
       injected article arrives without that page's stylesheet, so these rules
       dress it. */
    '.tgb-doc{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;',
    'padding:20px;background:rgba(17,24,32,.72);}',
    '.tgb-doc[hidden]{display:none;}',
    '.tgb-doc-panel{position:relative;width:min(720px,100%);max-height:min(86vh,900px);',
    'overflow:auto;padding:30px clamp(18px,4vw,36px) 28px;border:1px solid var(--line-strong,#111);',
    'background:var(--paper-strong,#fff);color:var(--ink,#111);text-align:left;}',
    '.tgb-doc-close{position:absolute;right:10px;top:10px;display:grid;place-items:center;',
    'width:30px;height:30px;padding:0;border:1px solid var(--line-strong,#111);',
    'background:var(--surface,#fff);color:var(--ink,#111);font-family:inherit;font-size:.72rem;',
    'line-height:1;cursor:pointer;}',
    '.tgb-doc-close:hover,.tgb-doc-close:focus-visible{border-color:var(--accent,#2d4880);',
    'color:var(--accent,#2d4880);outline:none;}',
    '.tgb-doc .doc-kicker{margin:0 0 6px;color:var(--accent,#2d4880);font-size:.66rem;',
    'font-weight:800;letter-spacing:.16em;text-transform:uppercase;}',
    '.tgb-doc h1{margin:0 0 14px;font-size:clamp(1.4rem,3.4vw,1.9rem);line-height:1.15;}',
    '.tgb-doc h2{margin:26px 0 8px;font-size:1.02rem;}',
    '.tgb-doc p{margin:0 0 14px;font-size:.88rem;line-height:1.65;color:var(--muted,#69655e);}',
    '.tgb-doc p.lead{color:var(--ink,#111);font-size:.95rem;}',
    '.tgb-doc ul{margin:0 0 16px;padding-left:20px;}',
    '.tgb-doc li{margin:0 0 9px;font-size:.88rem;line-height:1.6;color:var(--muted,#69655e);}',
    '.tgb-doc li b{color:var(--ink,#111);}',
    '.tgb-doc a{color:var(--accent,#2d4880);text-decoration:underline;text-underline-offset:3px;}',
    '.tgb-doc .doc-fine{margin:22px 0 0;padding-top:14px;border-top:1px solid var(--line,#cdc5b8);',
    'font-size:.72rem;color:var(--muted,#69655e);}',
    '@media (max-width:640px){',
    '.footer-mark-stack{justify-items:center;}',
    '.footer-social-stack{justify-items:center;}',
    'body .site-footer.site-footer .footer-bottom{justify-content:center;text-align:center;}',
    '}'
  ].join('');

  // "How our shop works" opens in place rather than navigating away. The source
  // of truth stays /shop/aboutshop.html — fetch it, lift its <article>, drop it
  // in a lightbox. Modified clicks and any failure fall through to the link.
  function wireDocLightbox(link) {
    if (!link || typeof DOMParser !== 'function') return;
    var box = null, panel = null, lastFocus = null, loaded = false;

    function close() {
      if (!box) return;
      box.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    function build() {
      box = document.createElement('div');
      box.className = 'tgb-doc';
      box.hidden = true;
      box.innerHTML =
        '<div class="tgb-doc-panel" role="dialog" aria-modal="true" aria-label="How our shop works">' +
          '<button class="tgb-doc-close" type="button" aria-label="Close">X</button>' +
          '<div class="tgb-doc-body"></div>' +
        '</div>';
      document.body.appendChild(box);
      panel = box.querySelector('.tgb-doc-body');
      box.querySelector('.tgb-doc-close').addEventListener('click', close);
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && box && !box.hidden) close();
      });
    }

    function show() {
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      box.querySelector('.tgb-doc-close').focus();
      box.querySelector('.tgb-doc-panel').scrollTop = 0;
    }

    link.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      lastFocus = link;
      if (!box) build();
      if (loaded) { show(); return; }
      fetch(link.getAttribute('href'), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (html) {
          if (!html) throw new Error('no document');
          var article = new DOMParser().parseFromString(html, 'text/html').querySelector('article.doc');
          if (!article) throw new Error('no article');
          // "Back to the shop" is a page affordance; here the close button is
          // the way out.
          Array.prototype.slice.call(article.querySelectorAll('a[href="/shop/"]')).forEach(function (a) {
            var p = a.closest('p');
            if (p) p.remove(); else a.remove();
          });
          panel.innerHTML = '';
          while (article.firstChild) panel.appendChild(article.firstChild);
          loaded = true;
          show();
        })
        .catch(function () { window.location.href = link.href; });
    });
  }

  function injectFooterStyles() {
    if (document.querySelector('style[data-tgb-footer-css]')) return;
    var style = document.createElement('style');
    style.dataset.tgbFooterCss = 'true';
    style.textContent = FOOTER_CSS;
    document.head.appendChild(style);
  }

  var navStatsSetter = window.TgbNav && typeof window.TgbNav.setButtonStats === 'function'
    ? window.TgbNav.setButtonStats
    : window.TgbNav && typeof window.TgbNav.setStats === 'function'
      ? window.TgbNav.setStats
    : null;
  var SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var SB_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
  var sbHeaders = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json'
  };

  var footer =
    document.querySelector('footer[data-site-footer]') ||
    document.querySelector('footer.site-footer');
  if (!footer || footer.dataset.tgbFooterReady === 'true') return;

  // Mission Control: the admin surface for whichever section you are on, always
  // resolved relative to the CURRENT directory — /sound/ -> /sound/admin/,
  // /shop/ -> /shop/admin/. Deriving it from location.pathname keeps one shared
  // footer working everywhere instead of hard-coding a section into shared code.
  //
  // Only sections that actually HAVE an admin get the link; this footer also
  // renders on /games/, /how/, /account/ and friends, where the same relative
  // href would be a 404. Add a directory here when it gains an admin page.
  var MISSION_CONTROL_DIRS = ['/shop/admin/', '/sound/admin/', '/highlights/admin/', '/socials/admin/'];

  function missionControlHref() {
    var path = window.location.pathname || '/';
    var dir = path.replace(/[^/]*$/, '');          // drop any file name
    if (/\/admin\/$/.test(dir)) return dir;        // already there: don't nest admin/admin/
    var candidate = dir + 'admin/';
    return MISSION_CONTROL_DIRS.indexOf(candidate) === -1 ? '' : candidate;
  }

  footer.classList.add('site-footer');
  footer.innerHTML =
    '<div class="footer-bottom">' +
      '<span class="footer-mark-stack">' +
        '<span class="footer-mark">&copy; The Game Bureau</span>' +
        '<a class="footer-doc-link" href="/shop/aboutshop.html">How our shop works &rsaquo;</a>' +
      '</span>' +
      '<span class="footer-social-stack">' +
        '<span class="footer-social-links">' +
          '<a href="https://instagram.com/thegamebureau" target="_blank" rel="noopener">Instagram</a>' +
          '<a href="https://x.com/thegamebureau" target="_blank" rel="noopener">X</a>' +
          '<a href="https://www.facebook.com/thegamebureau" target="_blank" rel="noopener">Facebook</a>' +
          '<a href="https://youtube.com/@thegamebureau" target="_blank" rel="noopener">YouTube</a>' +
        '</span>' +
        (missionControlHref()
          ? '<a class="footer-mc-link" href="' + missionControlHref() + '">Mission Control</a>'
          : '') +
      '</span>' +
    '</div>';
  footer.dataset.tgbFooterReady = 'true';
  injectFooterStyles();
  wireDocLightbox(footer.querySelector('.footer-doc-link'));

  function setStats(games, cities, gifts, soundtracks, highlights) {
    if (navStatsSetter) navStatsSetter(games, cities, gifts, soundtracks, highlights);
  }

  window.TgbFooterStats = { setStats: setStats };
  window.TgbNav = window.TgbNav || {};
  window.TgbNav.setStats = setStats;

  function soundtrackTrackCount(tracklist) {
    if (!tracklist || !Array.isArray(tracklist.songs)) return 0;
    return tracklist.songs.filter(function (song) {
      return song && String(song.spotifyId || song.spotify_url || song.title || song.artist || '').trim();
    }).length;
  }

  function countSoundtracks(data) {
    var rows = Array.isArray(data && data.soundtracks) ? data.soundtracks : [];
    return rows.filter(function (tracklist) {
      return tracklist && tracklist.city_slug && soundtrackTrackCount(tracklist) > 0;
    }).length;
  }

  fetch('/sound/soundtracks.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data) setStats(null, null, null, countSoundtracks(data));
    })
    .catch(function () {});

  function isMissingResultsRelation(status, detail) {
    return status === 404 && /PGRST205|Could not find the table/i.test(String(detail || ''));
  }

  function fetchHighlightsCountFrom(table) {
    return fetch(SB_URL + '/rest/v1/' + encodeURIComponent(table) + '?select=instanceid&limit=1&apikey=' + SB_KEY, {
      headers: Object.assign({}, sbHeaders, {
        Prefer: 'count=exact'
      }),
      cache: 'no-store'
    }).then(function (r) {
      if (r.ok) {
        var range = r.headers.get('content-range') || '';
        var match = String(range || '').match(/\/(\d+)$/);
        if (match) return Number(match[1]) || 0;
        return r.json().then(function (rows) { return Array.isArray(rows) ? rows.length : 0; });
      }
      return r.text().then(function (detail) {
        if (isMissingResultsRelation(r.status, detail)) return null;
        throw new Error('Highlights count unavailable');
      });
    });
  }

  fetchHighlightsCountFrom('highlights')
    .then(function (count) {
      if (count != null) return count;
      return fetchHighlightsCountFrom('game_results');
    })
    .then(function (count) {
      if (count != null) setStats(null, null, null, null, count);
    })
    .catch(function () {});

  // The Games page has its own animated ticker for game and gift counts.
  if (document.body && document.body.dataset.adminPage === 'mission-control') return;

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
