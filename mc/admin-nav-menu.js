// Mission Control dropdown menu — mirrors the Login/Mission Control menu
// behavior from assets/site-nav-login.js, but for /mc/ pages.
//
// Usage (inside a /mc/ page, after TgbMcAdminAuth is created):
//   window.TgbMcAdminNav.init({ signOutButton: signOutBtn, auth: adminAuth });
//
// Do NOT also pass signOutButton to TgbMcAdminAuth.create() — this module
// owns the button click so the menu can open instead of signing out
// immediately. It listens to the 'tgb-admin-auth-change' window event
// dispatched by admin-auth.js to keep its UI in sync.
(function (global) {
  'use strict';

  if (global.TgbMcAdminNav) return;

  var MENU_ITEMS = [
    { header: 'Game' },
    { href: '/mc/index.html',     label: 'Game Details' },
    { href: '/research/content.html', label: 'Content' },
    { header: 'Batch Edit' },
    { href: '/mc/guides.html',    label: 'Guides', subitem: true },
    { href: '/mc/taglines.html',  label: 'Taglines', subitem: true },
    { header: 'Website' },
    { href: '/mc/photos.html',    label: 'Edit Wall', subitem: true },
    { href: '/gifts/admin/gs-shop.html',  label: 'Edit Gifts', subitem: true },
    { href: '/gifts/admin/gs-codes.html', label: 'Access Codes', subitem: true },
    { header: 'Reference' },
    { href: '/research/',         label: 'Research', subitem: true },
    {
      href: 'https://www.icloud.com/notes/note/UHJpdmF0ZTo6Tm90ZXM6OmN1cnJlbnRVc2VyOjo4YTBhZTliYy1lNGQ5LTQxNTMtYTA0Zi03NjM2NWRhN2IwNjQ=',
      label: 'Apple Notes',
      external: true,
      subitem: true
    }
  ];

  function init(options) {
    options = options || {};
    var button = options.signOutButton;
    var auth = options.auth;
    if (!button || !auth) return null;

    var wrapper = wrapButton(button);
    var menu = buildMenu(currentPathname());
    wrapper.appendChild(menu);

    var state = { authorized: false };

    function setOpen(open) {
      var shouldOpen = !!open && state.authorized;
      menu.hidden = !shouldOpen;
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function setAuthorized(isAuthorized) {
      state.authorized = !!isAuthorized;
      var title = state.authorized ? 'Mission Control' : 'ADMIN LOGIN';
      button.setAttribute('aria-label', title);
      button.title = title;
      button.setAttribute('aria-haspopup', state.authorized ? 'menu' : 'false');
      if (!state.authorized) setOpen(false);
    }

    button.setAttribute('aria-expanded', 'false');

    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (state.authorized) {
        setOpen(menu.hidden);
      } else if (typeof auth.showAuth === 'function') {
        auth.showAuth();
      }
    });

    var signOutEl = menu.querySelector('[data-mc-nav-signout]');
    if (signOutEl) {
      signOutEl.addEventListener('click', function (event) {
        event.preventDefault();
        setOpen(false);
        if (typeof auth.signOut === 'function') auth.signOut({ silent: true });
      });
    }

    global.addEventListener('tgb-admin-auth-change', function (event) {
      var detail = event && event.detail;
      setAuthorized(!!(detail && detail.signedIn));
    });

    global.document.addEventListener('click', function (event) {
      if (wrapper.contains(event.target)) return;
      setOpen(false);
    });

    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setOpen(false);
    });

    // Initial paint — admin-auth.js will fire the auth-change event
    // shortly after init() resolves, but until then start signed-out.
    setAuthorized(false);

    return {
      setAuthorized: setAuthorized,
      close: function () { setOpen(false); }
    };
  }

  function wrapButton(button) {
    if (button.parentNode && button.parentNode.classList &&
        button.parentNode.classList.contains('mc-admin-nav')) {
      return button.parentNode;
    }
    var wrapper = global.document.createElement('div');
    wrapper.className = 'mc-admin-nav';
    button.parentNode.insertBefore(wrapper, button);
    wrapper.appendChild(button);
    return wrapper;
  }

  function buildMenu(currentPath) {
    var menu = global.document.createElement('div');
    menu.className = 'mc-admin-nav-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    var normalized = String(currentPath || '').toLowerCase();

    MENU_ITEMS.forEach(function (item) {
      if (item.divider) {
        menu.appendChild(buildDivider());
        return;
      }

      if (item.header) {
        var header = global.document.createElement('span');
        header.className = 'mc-admin-nav-menu-header';
        header.setAttribute('role', 'presentation');
        header.textContent = item.header;
        menu.appendChild(header);
        return;
      }

      var link = global.document.createElement('a');
      link.className = 'mc-admin-nav-menu-item';
      if (item.subitem) link.classList.add('mc-admin-nav-menu-item--subitem');
      link.setAttribute('role', 'menuitem');
      link.href = item.href;
      link.textContent = item.label;
      if (item.external) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      if (item.id) link.id = item.id;
      if (normalized === item.href.toLowerCase()) {
        link.classList.add('is-current');
        link.setAttribute('aria-current', 'page');
      }
      menu.appendChild(link);
    });

    menu.appendChild(buildDivider());

    var signOut = global.document.createElement('button');
    signOut.type = 'button';
    signOut.className = 'mc-admin-nav-menu-item';
    signOut.setAttribute('role', 'menuitem');
    signOut.setAttribute('data-mc-nav-signout', '');
    signOut.textContent = 'Sign Out';
    menu.appendChild(signOut);

    return menu;
  }

  function buildDivider() {
    var divider = global.document.createElement('span');
    divider.className = 'mc-admin-nav-menu-divider';
    divider.setAttribute('aria-hidden', 'true');
    return divider;
  }

  function currentPathname() {
    try {
      return global.location.pathname || '';
    } catch (error) {
      return '';
    }
  }

  global.TgbMcAdminNav = { init: init };
}(window));
