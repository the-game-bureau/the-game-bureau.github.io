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
          // Renamed from "Game Admin" 2026-08-07, and /mc/builder.html gave up
          // the name to make room: this is the ROOM you enter to build a game,
          // and the builder is one tool inside it. The specific name belongs to
          // the specific tool, so that one is Flow Builder now.
          label: 'Game Builder',
          description: 'The games room — profiles, the flow builder, stops, and the waypoint catalog.'
        },
        {
          href: '/games/admin/profiles.html',
          label: 'Game Profiles',
          description: 'Edit game metadata, pricing, teams, public copy, engine, and launch details.',
          appendOpenGameId: true
        },
        {
          href: '/mc/builder.html',
          // Was "Game Builder" until 2026-08-07, which overstated it: this edits
          // the conversation FLOW, not the game as a whole — the game's identity,
          // pricing, teams and start point are next door in Game Profiles.
          label: 'Flow Builder',
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
      // NOT "Data & Research", which described the storage rather than the
      // purpose. Every catalog in here is a PART a game gets assembled from: an
      // anchor event to build around, waypoints that become its stops, the city
      // it is played in, the club whose colors it wears. Naming them by what
      // they are for is what tells you why Cities sits beside Anchor Events.
      label: 'Game Elements',
      combined: true,
      items: [
        {
          href: '/mc/data/events.html',
          // Absorbed /mc/get_games.html ("Sports Games Research") and
          // /mc/mlb.html ("MLB Generator") on 2026-08-07, both deleted. Both
          // gathered real schedules the long way round and neither wrote
          // anchor_events; the SCHEDULE button on this page reads the same ESPN
          // feed in the browser and imports straight into the table.
          label: 'Anchor Events',
          description: 'Real matchups, concerts and conventions a game is built around — import a league schedule or add one by hand.'
        },
        {
          href: '/mc/data/waypoints.html',
          // Absorbed /mc/places.html ("Game Places") on 2026-08-07, deleted.
          // Its research was good and its DELIVERY was the problem: a JSONL file
          // that needed a hand-written migration to reach this table. The same
          // research is now the "With AI (tour places)" prompt here, returning
          // the import SQL every other prompt on the page returns.
          label: 'Waypoints',
          description: 'Manage the catalog of real-world points and review nightly scout candidates.'
        },
        {
          href: '/mc/data/cities.html',
          label: 'Cities',
          description: 'The one city catalog the whole site reads — add, edit, mark venue-only/archived, or delete.'
        },
        {
          href: '/mc/data/teams.html',
          // Was /mc/get_teams.html, the last "research assistant". Research Home
          // sat above it and was deleted the same day: two cards, both already
          // in this menu, on a page that had to be hand-edited to stay true.
          label: 'Teams',
          description: 'The pro teams a fandom game is built on — palettes, identity, and the AI refresh with a reviewed diff.'
        }
      ]
    },
    {
      label: 'Socials',
      // Menu only. /mc/ already carries Socializer as a Daily Chore at the
      // top of the page, so a directory card below it was the same link twice —
      // the same reason Gifts Admin and Soundtracks Admin are chores and appear
      // in no menu group. It stays HERE because the socials room has no button
      // in the site nav (the four rooms are games/gifts/soundtracks/highlights),
      // so this dropdown is the only way to reach it from another page.
      hubHidden: true,
      items: [
        {
          href: '/mc/socials/',
          label: 'Socializer',
          description: 'Review AI-scouted stories and open prefilled composers for The Game Bureau social channels.'
        }
      ]
    },
    {
      // Every item here leaves the site — Supabase, iCloud, Cloudflare, GitHub.
      // "External" is the whole distinction: the other groups are rooms we
      // built, this one is other people's dashboards we happen to need.
      label: 'External Tools',
      combined: true,
      items: [
        {
          href: 'https://www.icloud.com/notes/note/UHJpdmF0ZTo6Tm90ZXM6OmN1cnJlbnRVc2VyOjo4YTBhZTliYy1lNGQ5LTQxNTMtYTA0Zi03NjM2NWRhN2IwNjQ=',
          // First on purpose, ahead of the dashboards. It is the only item here
          // that is opened to WRITE rather than to look something up, and the
          // one most likely to be wanted mid-thought.
          label: 'Notes',
          description: 'Open the shared working notes used alongside Mission Control.',
          external: true
        },
        {
          href: 'https://supabase.com/dashboard/project/qmaafbncpzrdmqapkkgr/editor/17583?schema=public&sort=name%3Adesc',
          label: 'Supabase',
          description: 'Open the Supabase table editor for the live games database.',
          external: true
        },
        {
          href: 'https://dashboard.stripe.com/',
          // Beside Supabase because the two are one story: a purchase creates a
          // Stripe session, the stripe-webhook function writes the gift_codes
          // row, and a trigger folds the Stripe email onto the play. Chasing an
          // order that did not arrive means both tabs.
          label: 'Stripe',
          description: 'Payments dashboard — checkout sessions, orders, refunds, and the webhook deliveries that issue access codes.',
          external: true
        },
        {
          href: 'https://resend.com/emails',
          label: 'Resend',
          description: 'Transactional email — every access-code and receipt message the shop sends, with its delivery log.',
          external: true
        },
        {
          href: 'https://console.anthropic.com/',
          // The API key behind the anthropic-proxy and shop-coherence-check
          // functions. NOT where the four bots live — those run on the Claude
          // subscription and bill separately, which is the whole reason they
          // exist as routines instead of as API calls.
          label: 'Anthropic',
          description: 'API console for the anthropic-proxy and the gift shop AI audit — usage, billing, and the API key.',
          external: true
        },
        {
          href: 'https://claude.ai/code/routines',
          label: 'Claude Routines',
          description: 'The four scheduled bots — gift shop, soundtracks, socials, waypoint scout. Edit their cron and prompts here.',
          external: true
        },
        {
          href: 'https://dash.cloudflare.com/',
          label: 'Cloudflare',
          description: 'DNS, caching, and security dashboard for the site’s domains.',
          external: true
        },
        {
          href: 'https://dash.cloudflare.com/?to=/:account/web-analytics',
          // Its own entry rather than a note on Cloudflare above: the numbers
          // cannot be shown on our own pages (that needs a secret API token,
          // and every admin page here is public HTML), so this link IS the
          // reporting surface.
          label: 'Web Analytics',
          description: 'Visitor counts for the public pages — the cookieless Cloudflare beacon in mc/assets/site-analytics.js.',
          external: true
        },
        {
          href: 'https://affiliate-program.amazon.com/home',
          label: 'Amazon Associates',
          description: 'Affiliate account behind the gift shop tag thegamebureau-20 — link checker, reports, and payouts.',
          external: true
        },
        {
          href: 'https://bookshop.org/affiliates',
          label: 'Bookshop.org',
          description: 'The other book affiliate, id 87073. Bookshop links are derived from the ISBN by tgb_pull_book_candidates.',
          external: true
        },
        {
          href: 'https://www.printful.com/dashboard',
          // Dormant, not dead: stripe-webhook still creates Printful orders when
          // PRINTFUL_API_KEY is set and returns quietly when it is not. Listed
          // so the dashboard is one click away if print-on-demand comes back.
          label: 'Printful',
          description: 'Print-on-demand orders from the legacy gift-shop path in stripe-webhook. Dormant unless PRINTFUL_API_KEY is set.',
          external: true
        },
        {
          href: 'https://business.facebook.com/',
          // The socials-post function is written and deployed against the Graph
          // API, but autopost is still gated off — a human clicks Post in the
          // socials room. This is here for the day that flips.
          label: 'Meta Business',
          description: 'Facebook and Instagram accounts for the socials-post function. Autopost is still off; posting is manual.',
          external: true
        },
        {
          href: 'https://github.com/the-game-bureau/the-game-bureau.github.io',
          label: 'Github',
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
