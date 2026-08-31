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
      // ---- THE SPINE ------------------------------------------------------
      // The order IS the argument, and it is the whole reason this group is
      // first: a game is assembled down this list. An anchor event brings
      // people to a city; waypoints are the places they will stand in; a
      // challenge is what they do there; a route puts those in order; the
      // Game Builder is where a game becomes something somebody can buy.
      //
      // Everything above the Game Builder is an INGREDIENT and everything below
      // it is the finished thing. That line is what the old Game Elements /
      // Game Builder split was reaching for and never quite said -- and the name
      // is free again, because games/admin/ was deleted on 2026-08-07. The room
      // was called MARQUEE until 2026-08-30; `mc/builder/` is the FLOW builder,
      // which is the distinction that split was drawing.
      label: 'The Spine',
      items: [
        {
          href: '/mc/events/',
          label: 'Anchor Events',
          description: 'Real matchups, concerts and conventions a game is built around. The reason people are already in town.'
        },
        {
          href: '/mc/waypoints/',
          label: 'Waypoints',
          description: 'Every real place we hold. One row per place, ever, whatever it is later used for.'
        },
        {
          href: '/mc/challenges/',
          label: 'Challenges',
          description: 'What a team does when they get there. Written once, with variables, and used in every game it fits.'
        },
        {
          href: '/mc/audiences/',
          label: 'Audiences',
          description: 'Audiences are built-in fandoms interested in the subject matter of our games. Each game has a TARGET audience and a RIVAL audience. Game locations are also pulled from the audiences table.'
        },
        {
          href: '/mc/trivia/',
          label: 'Trivia',
          description: 'Questions keyed to a place. Know your enemy, or prove you know your own club. Play them here the way a team meets them.'
        },
        {
          href: '/mc/routes/',
          label: 'Routes',
          description: 'The walk itself. Order the places, hang a challenge on each, and write the words that send a team to the next one.'
        },
        {
          href: '/mc/games/',
          label: 'Game Builder',
          description: 'Admins and AI build games here.'
        },
        {
          href: '/mc/builder/',
          label: 'Flow Builder',
          description: 'The playable conversation: messages, prompts, replies and branches. Not the game identity, which is next door.'
        }
      ]
    },
    {
      // ---- THE CATALOGUE --------------------------------------------------
      // Reference a game READS but does not consume. None of these is a step
      // in building one, which is exactly why they are not in the spine: you
      // come here to correct a fact, not to make something.
      label: 'The Catalogue',
      combined: true,
      items: [
        {
          href: '/mc/leagues/',
          label: 'Leagues',
          description: 'Which sport each league plays. The list anchor events and teams are both naming.'
        },
        {
          href: '/mc/data/',
          label: 'Data Warehouse',
          description: 'The older directory of table editors. Most of what it points at now has a room of its own.'
        }
      ]
    },
    {
      // ---- RUNNING IT -----------------------------------------------------
      // Nothing here makes a game. These are the rooms you open because a game
      // already exists and something about it needs looking at.
      label: 'Running It',
      combined: true,
      items: [
        {
          href: '/mc/review/',
          label: 'Daily Review',
          description: 'What the routines filed since yesterday, in one pass.'
        },
        {
          href: '/mc/game-plays/',
          label: 'Game Plays',
          description: 'Recorded playthroughs: team names, the answer at every stop, and the timeline.'
        },
        {
          href: '/mc/operations/',
          label: 'Operations',
          description: 'Issued access codes, play stats, and the live-game workflow.'
        },
        {
          href: '/mc/highlights/',
          label: "Winner's Wall",
          description: 'Photographs teams sent in, and whether they are fit to publish.'
        },
        {
          href: '/mc/taglines/',
          label: 'Taglines',
          description: 'Generate, compare and approve the public one-liner on every game.'
        },
        {
          href: '/mc/picmaker/',
          label: 'Picmaker',
          description: 'Sport marks, takeover heroes, and the reusable portrait prompts.'
        }
      ]
    },
    {
      // ---- THE PERIPHERY --------------------------------------------------
      // Soundtracks, gifts and socials hang off the product rather than being
      // it. The Gift Shop and the Tape Room are not listed here because they
      // are already the two chore cards at the top of the hub, and a page in
      // two places is the same link twice.
      label: 'The Periphery',
      hubHidden: true,
      items: [
        {
          href: '/mc/socializer/',
          label: 'Socializer',
          description: 'Review what the bot found and post it, one account at a time.'
        },
        {
          href: '/mc/issues/',
          label: 'Issues',
          description: 'What the audits found wrong, across every area, and visitor suggestions.'
        }
      ]
    },
    {
      // ---- FOR REVIEW -----------------------------------------------------
      // LAST, AND DELIBERATELY VISIBLE. Every page below is reachable, carries
      // real code, and is linked from nothing. That is the state in which a
      // page rots quietly: it keeps working, nobody opens it, and the next
      // person cannot tell whether it is load-bearing.
      //
      // Listing them is not a proposal to delete them. It is a list of
      // decisions somebody has to take, in one place, so the answer is
      // recorded rather than rediscovered.
      label: 'For Review',
      combined: true,
      items: [
        {
          href: '/mc/stops/',
          // PARKED 2026-08-09 and it cannot simply go: it is the only writer of
          // public.stops, which both engines read through the game_stops view.
          // The Route Builder is what replaces it.
          label: 'Stop Builder',
          description: 'Parked. Keyed by city, so a city cannot have two walks, which is the fault routes exist to fix. Still the only writer of public.stops.'
        },
        {
          href: '/mc/greenroom/',
          // Kevin asked for guides out of the game on 2026-08-30. The room is
          // listed here rather than deleted because 41 rows and four columns on
          // public.games depend on it, and both engines read those at play time.
          label: 'Guide Green Room',
          description: 'Guides are being removed from the game. 41 rows, and four columns the engines still read at play time.'
        },
        {
          href: '/mc/assets/states/',
          label: 'Team Colors',
          description: 'A standalone colour sheet under assets. Nothing links to it and nothing reads it.'
        },
        {
          href: '/mc/editgames/',
          label: 'editgames (stub)',
          description: 'A forwarding stub, 28 lines. Nothing links to it. Safe to delete once you have said so.'
        },
        {
          href: '/mc/photos/',
          label: 'photos (stub)',
          description: 'A forwarding stub to the highlights admin, 16 lines. Nothing links to it.'
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
          href: 'https://console.cloud.google.com/',
          // Moved off the gift shop admin's command bar 2026-08-07. The shop's
          // ONLY Google dependency is GOOGLE_BOOKS_API_KEY, read by the
          // scrape-amazon function for the Auto Fill book lookup — and that
          // lookup works keyless on a shared quota, so the key is optional and
          // touched roughly never. That is an External Tools link, not a button
          // in the row you file items from.
          label: 'Google Cloud',
          description: 'Console for GOOGLE_BOOKS_API_KEY — the optional key behind the gift shop\'s Auto Fill book lookup.',
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
