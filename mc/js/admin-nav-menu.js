// Shared Mission Control navigation bar.
//
// Usage (after TgbMcAdminAuth is created):
//   window.TgbMcAdminNav.init({ signOutButton: signOutBtn, auth: adminAuth });
//
// Do not also pass signOutButton to TgbMcAdminAuth.create(). This module owns
// the account-button click so it can open the sign-out menu when authorized.
(function (global) {
  'use strict';

  if (global.TgbMcAdminNav) return;

  var MENU_GROUPS = [
    {
      label: 'EDIT GAMES',
      href: '/mc/editgames.html'
    },
    {
      label: 'OPERATIONS',
      href: '/mc/gs-codes.html'
    },
    {
      label: 'Batch Edit',
      items: [
        {
          href: '/mc/guides.html',
          label: 'Guides',
          description: 'Review and batch edit guide scripts across multiple games.'
        },
        {
          href: '/mc/taglines.html',
          label: 'Taglines',
          description: 'Generate, compare, and update public game taglines in bulk.'
        }
      ]
    },
    {
      label: 'Website',
      items: [
        {
          href: '/mc/photos.html',
          label: "Winner's Wall",
          description: "Review and curate player photos for the public Winner's Wall."
        },
        {
          href: '/mc/gs-shop.html',
          label: 'Gift Shop',
          description: 'Manage gift-shop items, game gifts, pricing, and storefront content.'
        }
      ]
    },
    {
      label: 'Reference',
      items: [
        {
          href: '/mc/research.html',
          label: 'Research',
          description: 'Open research assistants and their supporting datasets.'
        },
        {
          href: 'https://www.icloud.com/notes/note/UHJpdmF0ZTo6Tm90ZXM6OmN1cnJlbnRVc2VyOjo4YTBhZTliYy1lNGQ5LTQxNTMtYTA0Zi03NjM2NWRhN2IwNjQ=',
          label: 'Apple Notes',
          description: 'Open the shared working notes used alongside Mission Control.',
          external: true
        }
      ]
    }
  ];

  function init(options) {
    options = options || {};
    var button = options.signOutButton;
    var auth = options.auth;
    if (!button || !auth || button.getAttribute('data-mc-nav-ready') === 'true') return null;

    button.setAttribute('data-mc-nav-ready', 'true');

    var controls = button.parentNode;
    var navbar = buildNavigation(currentPathname());
    controls.insertBefore(navbar, button);

    var account = wrapAccountButton(button);
    var accountMenu = buildAccountMenu();
    account.appendChild(accountMenu);

    var state = { authorized: false };
    var groups = Array.prototype.slice.call(navbar.querySelectorAll('.mc-admin-nav-group'));

    function closeGroups(except) {
      groups.forEach(function (group) {
        if (group === except) return;
        setGroupOpen(group, false);
      });
    }

    function setGroupOpen(group, open) {
      if (!group) return;
      var trigger = group.querySelector('.mc-admin-nav-trigger');
      var panel = group.querySelector('.mc-admin-nav-panel');
      var shouldOpen = !!open && state.authorized;
      group.classList.toggle('is-open', shouldOpen);
      if (trigger) trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      if (panel) panel.hidden = !shouldOpen;
    }

    function setAccountOpen(open) {
      var shouldOpen = !!open && state.authorized;
      account.classList.toggle('is-open', shouldOpen);
      accountMenu.hidden = !shouldOpen;
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function closeAll() {
      closeGroups();
      setAccountOpen(false);
    }

    function setAuthorized(isAuthorized) {
      state.authorized = !!isAuthorized;
      navbar.hidden = !state.authorized;
      var title = state.authorized ? 'Mission Control account' : 'ADMIN LOGIN';
      button.setAttribute('aria-label', title);
      button.title = title;
      button.setAttribute('aria-haspopup', state.authorized ? 'menu' : 'false');
      if (!state.authorized) closeAll();
    }

    groups.forEach(function (group) {
      var trigger = group.querySelector('.mc-admin-nav-trigger');
      var panel = group.querySelector('.mc-admin-nav-panel');
      if (!trigger || !panel) return;
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = !group.classList.contains('is-open');
        closeGroups(group);
        setAccountOpen(false);
        setGroupOpen(group, shouldOpen);
      });
    });

    navbar.querySelectorAll('.mc-admin-nav-item').forEach(function (link) {
      link.addEventListener('click', closeAll);
    });

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (state.authorized) {
        closeGroups();
        setAccountOpen(accountMenu.hidden);
      } else if (typeof auth.showAuth === 'function') {
        auth.showAuth();
      }
    });

    var signOutEl = accountMenu.querySelector('[data-mc-nav-signout]');
    if (signOutEl) {
      signOutEl.addEventListener('click', function (event) {
        event.preventDefault();
        closeAll();
        if (typeof auth.signOut === 'function') auth.signOut({ silent: true });
      });
    }

    global.addEventListener('tgb-admin-auth-change', function (event) {
      var detail = event && event.detail;
      setAuthorized(!!(detail && detail.signedIn));
    });

    global.document.addEventListener('click', function (event) {
      if (navbar.contains(event.target) || account.contains(event.target)) return;
      closeAll();
    });

    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAll();
    });

    // Admin auth dispatches the real state shortly after init.
    setAuthorized(false);

    return {
      setAuthorized: setAuthorized,
      close: closeAll
    };
  }

  function wrapAccountButton(button) {
    if (button.parentNode && button.parentNode.classList &&
        button.parentNode.classList.contains('mc-admin-account')) {
      return button.parentNode;
    }
    var wrapper = global.document.createElement('div');
    wrapper.className = 'mc-admin-account';
    button.parentNode.insertBefore(wrapper, button);
    wrapper.appendChild(button);
    return wrapper;
  }

  function buildNavigation(currentPath) {
    var navbar = global.document.createElement('nav');
    navbar.className = 'mc-admin-navbar';
    navbar.setAttribute('aria-label', 'Mission Control');
    navbar.hidden = true;

    MENU_GROUPS.forEach(function (groupData, groupIndex) {
      var group = global.document.createElement('div');
      group.className = 'mc-admin-nav-group';

      // A group with an href renders as a single link button (no dropdown).
      if (groupData.href) {
        var navLink = global.document.createElement('a');
        navLink.className = 'mc-admin-nav-trigger mc-admin-nav-trigger--link';
        navLink.textContent = groupData.label;
        navLink.href = groupData.href;
        if (groupData.external) {
          navLink.target = '_blank';
          navLink.rel = 'noopener noreferrer';
        }
        if (isCurrentPath(currentPath, groupData.href)) {
          navLink.classList.add('is-current');
          navLink.setAttribute('aria-current', 'page');
        }
        group.appendChild(navLink);
        navbar.appendChild(group);
        return;
      }

      var trigger = global.document.createElement('button');
      var panelId = 'mcAdminNavPanel' + groupIndex;
      trigger.type = 'button';
      trigger.className = 'mc-admin-nav-trigger';
      trigger.textContent = groupData.label;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panelId);
      trigger.setAttribute('aria-haspopup', 'menu');

      var panel = global.document.createElement('div');
      panel.id = panelId;
      panel.className = 'mc-admin-nav-panel';
      panel.setAttribute('role', 'menu');
      panel.hidden = true;

      var groupIsCurrent = false;
      groupData.items.forEach(function (item) {
        var link = buildLink(item, currentPath);
        if (link.classList.contains('is-current')) groupIsCurrent = true;
        panel.appendChild(link);
      });

      if (groupIsCurrent) trigger.classList.add('is-current');
      group.appendChild(trigger);
      group.appendChild(panel);
      navbar.appendChild(group);
    });

    return navbar;
  }

  function buildLink(item, currentPath) {
    var link = global.document.createElement('a');
    link.className = 'mc-admin-nav-item';
    link.setAttribute('role', 'menuitem');
    link.href = item.href;
    link.textContent = item.label;
    if (item.external) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    if (item.id) link.id = item.id;
    if (isCurrentPath(currentPath, item.href)) {
      link.classList.add('is-current');
      link.setAttribute('aria-current', 'page');
    }
    return link;
  }

  function buildAccountMenu() {
    var menu = global.document.createElement('div');
    menu.className = 'mc-admin-account-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;

    var signOut = global.document.createElement('button');
    signOut.type = 'button';
    signOut.className = 'mc-admin-account-item';
    signOut.setAttribute('role', 'menuitem');
    signOut.setAttribute('data-mc-nav-signout', '');
    signOut.textContent = 'Sign Out';
    menu.appendChild(signOut);
    return menu;
  }

  function isCurrentPath(currentPath, href) {
    if (!href || /^https?:\/\//i.test(href)) return false;
    var current = normalizePath(currentPath);
    var target = normalizePath(href);
    return current === target;
  }

  function normalizePath(path) {
    var normalized = String(path || '').split('?')[0].split('#')[0].toLowerCase();
    normalized = normalized.replace(/\/index\.html$/, '/');
    if (normalized.length > 1 && normalized.slice(-1) === '/') return normalized;
    return normalized;
  }

  function currentPathname() {
    try {
      return global.location.pathname || '';
    } catch (error) {
      return '';
    }
  }

  function getGroups() {
    return MENU_GROUPS.map(function (group) {
      // Link-only groups (no items) surface as a single card in the hub.
      var items = group.items
        ? group.items.map(function (item) {
            return Object.assign({}, item);
          })
        : [{
            href: group.href,
            label: group.label,
            description: group.description || '',
            external: group.external
          }];
      return {
        label: group.label,
        items: items
      };
    });
  }

  global.TgbMcAdminNav = {
    init: init,
    getGroups: getGroups
  };
}(window));
