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

  // The two left-aligned navigation buttons, shared across every Mission
  // Control page. Injected by init() so they live in one place instead of
  // being hand-duplicated in each page's topbar markup.
  var BACK_BUTTONS = [
    { label: 'TGB HOME', target: '/', newTab: true },
    { label: 'MISSION CONTROL', target: '/mc/', newTab: false }
  ];

  // OPERATIONS is surfaced only as a hub card (via getGroups) — like every other
  // destination, it is no longer a top-bar button on any page.
  var OPERATIONS_LINK = {
    label: 'OPERATIONS',
    href: '/shop/operations.html'
  };

  // localStorage key the game editor (overview.html) uses to remember the last
  // opened game. EDIT GAMES links to that game so it reopens where you left off.
  var OPEN_GAME_KEY = 'tgb-games-phoneanalogy-open';

  function resolveNavHref(groupData) {
    var href = groupData && groupData.href ? groupData.href : '';
    if (groupData && groupData.appendOpenGameId && href) {
      var id = '';
      try {
        id = String((global.localStorage && global.localStorage.getItem(OPEN_GAME_KEY)) || '').trim();
      } catch (error) { /* localStorage unavailable */ }
      if (id) href += (href.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(id);
    }
    return href;
  }

  var MENU_GROUPS = [
    {
      label: 'EDIT GAMES',
      href: '/mc/overview.html',
      appendOpenGameId: true
    },
    {
      label: 'Game Plays',
      href: '/mc/game-plays.html',
      description: 'See every recorded playthrough — team names, their answers at each stop, and the lifecycle timeline.'
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
        },
        {
          href: '/mc/waypoints/',
          label: 'Waypoints',
          description: 'Manage the waypoints catalog — add, edit, and delete real-world points.'
        },
        {
          href: '/mc/cities/index.htm',
          label: 'Cities',
          description: 'The one city catalog the whole site reads — add, edit, mark venue-only/archived, or delete.'
        },
        {
          href: '/mc/anchor-events.html',
          label: 'Anchor Events',
          description: 'Manage the anchor-events catalog — the real sporting matchups a fandom game can be anchored to. Bulk-import, add, edit, delete.'
        },
        {
          href: '/mc/mapper.html',
          label: 'Game Mapper',
          description: 'Build a game’s route from ordered waypoints and save it to the map.'
        }
      ]
    },
    {
      // Single button to the Stock Room. The affiliate/API reference links
      // (Google Cloud, Amazon Associates, Bookshop.org) now live on the Stock
      // Room page itself, so the hub just needs the one door in.
      label: 'Stock Room',
      href: '/shop/admin/',
      description: 'Manage gift-shop items — links, images, cities, and publish/archive state.'
    },
    {
      label: 'Website',
      items: [
        {
          href: '/highlights/admin/',
          label: 'Highlights Admin',
          description: 'Review and curate photos and highlight assets for the public Highlights page.'
        },
        {
          href: '/highlights/',
          label: 'HIGHLIGHTS',
          description: 'Open the public highlights backed by the highlights table.'
        },
        {
          href: '/sound/admin/',
          label: 'Soundtracks',
          description: 'Maintain the city soundtracks — review Gmail suggestions, add tracks, and how it all works.'
        }
      ]
    },
    {
      label: 'Creative',
      items: [
        {
          href: '/mc/picmaker/',
          label: 'Picmaker',
          description: 'Generate sport marks, takeover hero images, and reusable guide portrait image prompts.'
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
          href: 'https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/editor/17583?schema=public&sort=name%3Adesc',
          label: 'Database',
          description: 'Open the Supabase table editor for the live games database.',
          external: true
        },
        {
          href: 'https://www.icloud.com/notes/note/UHJpdmF0ZTo6Tm90ZXM6OmN1cnJlbnRVc2VyOjo4YTBhZTliYy1lNGQ5LTQxNTMtYTA0Zi03NjM2NWRhN2IwNjQ=',
          label: 'Apple Notes',
          description: 'Open the shared working notes used alongside Mission Control.',
          external: true
        },
        {
          href: 'https://dash.cloudflare.com/',
          label: 'Cloudflare',
          description: 'DNS, caching, and security dashboard for the site’s domains.',
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

    // The two left back-buttons (TGB HOME / MISSION CONTROL) go on every MC page.
    if (!controls.querySelector('.mc-back-nav')) {
      controls.insertBefore(buildBackNav(), controls.firstChild);
    }

    // The dropdown menus + OPERATIONS now live ONLY as cards on the Mission
    // Control hub (mc/index.html via getGroups). Every other MC page carries
    // nothing at the top but the two back-buttons — so REMOVE the account /
    // sign-out button there. (Hiding via `hidden` doesn't work: admin-shell.css
    // sets `display: inline-flex` on the button, which beats the UA [hidden]
    // rule.) Login still auto-opens via admin-auth on any protected page, and
    // sign-out is done from the hub.
    if (!isHubPage(currentPathname())) {
      button.remove();
      return { setAuthorized: function () {}, close: function () {} };
    }

    // ── Hub only: the account / login button (with Sign Out). No dropdown nav
    // here either — the directory cards below cover every destination. ──
    var account = wrapAccountButton(button);
    var accountMenu = buildAccountMenu();
    account.appendChild(accountMenu);
    controls.appendChild(account);

    var state = { authorized: false };

    function setAccountOpen(open) {
      var shouldOpen = !!open && state.authorized;
      account.classList.toggle('is-open', shouldOpen);
      accountMenu.hidden = !shouldOpen;
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function closeAll() {
      setAccountOpen(false);
    }

    function setAuthorized(isAuthorized) {
      state.authorized = !!isAuthorized;
      var title = state.authorized ? 'Mission Control account' : 'ADMIN LOGIN';
      button.setAttribute('aria-label', title);
      button.title = title;
      button.setAttribute('aria-haspopup', state.authorized ? 'menu' : 'false');
      if (!state.authorized) closeAll();
    }

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      if (state.authorized) {
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
      if (account.contains(event.target)) return;
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

  function isHubPage(path) {
    var normalized = normalizePath(path);
    return normalized === '/mc/' || normalized === '/mc';
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

  function buildBackNav() {
    var nav = global.document.createElement('div');
    nav.className = 'mc-back-nav';
    nav.setAttribute('aria-label', 'Site navigation');

    BACK_BUTTONS.forEach(function (data) {
      var btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'mc-back-btn';
      btn.textContent = data.label;
      // Bind navigation here (rather than relying on admin-shell.js's data-*
      // hooks) since these buttons are injected after that script has run.
      btn.addEventListener('click', function () {
        if (data.newTab) {
          global.open(data.target, '_blank', 'noopener,noreferrer');
        } else {
          global.location.href = data.target;
        }
      });
      nav.appendChild(btn);
    });

    return nav;
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
    // OPERATIONS is pulled out of the nav bar (it rides with login on the
    // right) but still belongs on the hub, in its original second slot.
    var groups = MENU_GROUPS.slice();
    groups.splice(1, 0, OPERATIONS_LINK);
    return groups.map(function (group) {
      // Link-only groups (no items) surface as a single card in the hub.
      var items = group.items ? group.items.map(function (item) {
            return Object.assign({}, item);
          })
        : [{
            href: resolveNavHref(group),
            label: group.label,
            description: group.description || '',
            external: group.external
          }];
      return {
        label: group.label,
        combined: !!group.combined,
        items: items
      };
    });
  }

  global.TgbMcAdminNav = {
    init: init,
    getGroups: getGroups
  };
}(window));
