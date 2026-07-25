/* Shared site nav for public pages (home/games + gift shop + future).
   Drop a placeholder into the page:
     <header class="site-nav" data-site-nav></header>
     <script src="/assets/site-nav.js"></script>

   The script fills the placeholder with the shared brand + nav links.
   Site count badges live in /assets/site-footer.js.
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
        '<a class="nav-link nav-link--major nav-link--games" href="/games/">GAMES</a>' +
        '<a class="nav-link nav-link--major nav-link--gifts" href="/shop/">GIFTS</a>' +
        '<a class="nav-link nav-link--major nav-link--highlights" href="/highlights/">HIGHLIGHTS</a>' +
        '<a class="nav-link nav-link--major nav-link--sound" href="/sound/">SOUNDTRACKS</a>' +
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

  window.TgbNav = window.TgbNav || {};
  window.TgbNav.dropdown = {
    close: function () {},
    open: function () {}
  };
  window.TgbNav.onDropdownItemClick = function () {};
}());
