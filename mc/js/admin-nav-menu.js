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

  // localStorage key the game editors use to remember the last opened game.
  // Hub cards with appendOpenGameId reopen that game where possible.
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
      label: 'Games',
      // One panel listing its tools, not ten full-height cards. `combined` only
      // affects the /mc/ hub; the dropdown renders every group the same way.
      combined: true,
      items: [
        {
          href: '/games/admin/',
          label: 'Game Admin',
          description: 'Open the games room: profiles, builder, stops, and waypoint finder.'
        },
        {
          href: '/games/admin/profiles.html',
          label: 'Game Profiles',
          description: 'Edit game metadata, pricing, teams, public copy, engine, and launch details.',
          appendOpenGameId: true
        },
        {
          href: '/mc/builder.html',
          label: 'Game Builder',
          description: 'Build the playable conversation flow: messages, prompts, replies, and branches.',
          appendOpenGameId: true
        },
        {
          href: '/games/admin/stops.html',
          label: 'Game Stops',
          description: 'Pair each waypoint with a challenge, then organize those stops for play.'
        },
        {
          href: '/mc/game-plays.html',
          label: 'Game Plays',
          description: 'See recorded playthroughs: team names, answers at each stop, and lifecycle timeline.'
        },
        {
          href: '/gifts/operations.html',
          label: 'Operations',
          description: 'Monitor TGB game operations: issued access codes, play stats, and live-game workflows.'
        },
        {
          href: '/mc/review/',
          label: 'Daily Review',
          description: 'Review recent game-stop candidates, gift-shop items, and sound findings.'
        },
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
          href: '/mc/picmaker/',
          label: 'Picmaker',
          description: 'Generate sport marks, takeover hero images, and reusable guide portrait image prompts.'
        }
      ]
    },
    {
      label: 'Data & Research',
      combined: true,
      items: [
        {
          href: '/mc/data/waypoints.html',
          label: 'Waypoint Finder',
          description: 'Manage the catalog of real-world points and review nightly scout candidates.'
        },
        {
          href: '/mc/data/cities.html',
          label: 'Cities',
          description: 'The one city catalog the whole site reads — add, edit, mark venue-only/archived, or delete.'
        },
        {
          href: '/mc/data/events.html',
          label: 'Anchor Events',
          description: 'Manage the real sporting matchups a fandom game can be anchored to.'
        },
        {
          href: '/mc/places.html',
          label: 'Game Places',
          description: 'Use the research assistant to gather reusable place ideas for game stops.'
        },
        {
          href: '/mc/research.html',
          label: 'Research Home',
          description: 'Open research assistants and their supporting datasets.'
        },
        {
          href: '/mc/get_games.html',
          label: 'Sports Games Research',
          description: 'Generate sports matchup records for fandom games.'
        },
        {
          href: '/mc/get_teams.html',
          label: 'Team Database',
          description: 'Research and upsert sports team identity rows into Supabase.'
        },
        {
          href: '/mc/mlb.html',
          label: 'MLB Generator',
          description: 'Generate MLB Fans Takeover games from schedule data and push selected rows.'
        }
      ]
    },
    {
      label: 'Socials',
      // Menu only. /mc/ already carries Socials Admin as a Daily Chore at the
      // top of the page, so a directory card below it was the same link twice —
      // the same reason Gifts Admin and Soundtracks Admin are chores and appear
      // in no menu group. It stays HERE because the socials room has no button
      // in the site nav (the four rooms are games/gifts/soundtracks/highlights),
      // so this dropdown is the only way to reach it from another page.
      hubHidden: true,
      items: [
        {
          href: '/mc/socials/',
          label: 'Socials Admin',
          description: 'Review AI-scouted stories and open prefilled composers for The Game Bureau social channels.'
        }
      ]
    },
    {
      label: 'Tools',
      combined: true,
      items: [
        {
          href: 'https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/editor/17583?schema=public&sort=name%3Adesc',
          label: 'Database',
          description: 'Open the Supabase table editor for the live games database.',
          external: true
        },
        {
          href: 'https://www.icloud.com/notes/note/UHJpdmF0ZTo6Tm90ZXM6OmN1cnJlbnRVc2VyOjo4YTBhZTliYy1lNGQ5LTQxNTMtYTA0Zi03NjM2NWRhN2IwNjQ=',
          label: 'Notes',
          description: 'Open the shared working notes used alongside Mission Control.',
          external: true
        },
        {
          href: 'https://dash.cloudflare.com/',
          label: 'Cloudflare',
          description: 'DNS, caching, and security dashboard for the site’s domains.',
          external: true
        },
        {
          href: 'https://github.com/the-game-bureau/the-game-bureau.github.io',
          label: 'GITHUB',
          description: 'Open the website repository for code, content, commits, and GitHub Pages publishing.',
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

    // The dropdown menus now live ONLY as cards on the Mission
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
    return MENU_GROUPS.map(function (group) {
      // Link-only groups (no items) surface as a single card in the hub.
      var items = group.items ? group.items.map(function (item) {
            var copy = Object.assign({}, item);
            copy.href = resolveNavHref(copy);
            return copy;
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
        // The hub reads this and skips the group; the dropdown ignores it.
        hubHidden: !!group.hubHidden,
        items: items
      };
    });
  }

  global.TgbMcAdminNav = {
    init: init,
    getGroups: getGroups
  };
}(window));
