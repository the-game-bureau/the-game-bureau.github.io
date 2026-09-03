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
      // ---- THE FORMULA ----------------------------------------------------
      // WAYPOINT + CHALLENGE = GAME STOP, which is printed on three of these
      // four cards. The group and its contents explain each other.
      //
      // IT WAS CALLED GAME STOPS UNTIL 2026-08-31, and TWO OF THE FOUR ARE
      // NOT STOPS: the Waypoint Library and the Challenge Bank sit BELOW a
      // stop, being its two halves, and TGB Atlas sits ABOVE it, collecting
      // stops into maps. Only the Stop Builder makes one.
      //
      // `The Core` was considered and refused: this file uses core-versus-
      // periphery for the whole product, which spans this group AND The
      // Spine, so taking the word here would make the bigger distinction
      // unsayable. `Game Elements` was this group name until 2026-08-17 and
      // was deliberately moved off; reviving it undoes that without the
      // reason being available.
      //
      // ---- GAME PIECES ----------------------------------------------------
      // THE PIECES A GAME IS MADE OF, drawn as the diagram that says so: the
      // game across the top, the three things it names under it, and under the
      // map what a map is made of.
      //
      // IT WAS `The Formula` UNTIL 2026-08-31 and `Game Stops` before that.
      // The layout is driven by the `flow` FLAG rather than by this string,
      // which is why a rename is one line -- and it has now earned that three
      // times.
      //
      // IT LEADS THE MENU, above what used to be The Spine. It sat under it, on
      // the argument that the list should read in the order the work runs in:
      // the game and its audience first, then the stops it is assembled from.
      // That is true of ASSEMBLING a game and it is not what a menu is for --
      // the same reasoning that already put the Game Builder at the head of
      // the spine ahead of its own ingredients, and the Socializer at the head
      // of the periphery. A menu is ordered by what somebody came to open.
      //
      // `routes` stays in the spine deliberately -- a route is the WALK, an
      // ordered list of stops, so it is a step in building a game rather than
      // one of the two halves of a stop.
      label: 'Game Pieces',
      /* IT DRAWS AS THE EQUATION, NOT AS A ROW OF CARDS. `flow` is read by
         the hub, which lays this one group out as a chart: the two halves
         stacked with a + between them, an = into the room that pairs them,
         and an arrow on into the one that collects the result. A flag on the
         GROUP rather than a test on its label, so the layout is a property of
         the data and not a special case keyed on a string somebody may rename. */
      flow: true,
      /* ---- SEVEN BOXES, AND THE CHART IS WHAT A GAME IS MADE OF ---------
         GAME INFO across the top; under it the three things a game names --
         an ANCHOR EVENT, its AUDIENCES, and a MAP -- and under the map what a
         map is made of: STOPS, each of them a WAYPOINT and a CHALLENGE.

         THE ORDER IS THE CHART READ TOP TO BOTTOM, LEFT TO RIGHT, which is
         also a sensible menu order: the room you came to open, then the three
         it sends you to, then the three under the map. The dropdown renders
         this same list flat, so the two cannot disagree.

         THE GAME BUILDER, ANCHOR EVENTS AND AUDIENCES CAME FROM THE SPINE
         (2026-08-31), which held exactly those three and is therefore gone.
         They are not a separate stage of the work: they are the top of this
         diagram, and having them in two groups said they were two things. */
      items: [
        {
          href: '/mc/games/',
          label: 'Game Builder',
          description: 'Admins and AI build games here.'
        },
        {
          href: '/mc/events/',
          label: 'Anchor Events',
          description: 'The real world events that are catalysts for one of our games.'
        },
        {
          href: '/mc/audiences/',
          label: 'Audiences',
          description: 'Audience records are the working catalogue of fandoms, interests, artists, and other groups.'
        },
        {
          // AND LAST, because a map is stops in an ORDER and there is nothing
          // to order until they exist. It sits in this group rather than in
          // Assembly with Routes because it is made OF stops, which is what this
          // group is about; Routes and the Flow Builder are the sequence a game
          // is finally assembled into.
          //
          // THE LABEL IS THE ROOM'S OWN NAME. The room is TGB ATLAS -- the book
          // the maps live in -- and a door describes a room in the room's own
          // words, or the two drift on the first read. THE FOLDER NAMES THE
          // ROOM rather than the things in it, the way every folder here does:
          // `/mc/atlas/` since 2026-08-31, a hard break from `/mc/atlases/`.
          href: '/mc/atlas/',
          label: 'TGB Atlas',
          description: 'Maps made up of ordered lists of stops. A stop can be in as many maps as you like, so a map collects stops rather than copying them.'
        },
        {
          // THIRD OF THE FOUR, because it is the one that makes something out
          // of the first two. Waypoints and Challenges are the halves; a stop
          // is the pair, and it is what a team actually experiences.
          href: '/mc/stop-builder/',
          label: 'Stops Builder',
          // THE ROOM OWN SENTENCE, plus the one thing about this room nobody
          // would guess from its name. It opened `A place, a thing to do
          // there`, which is the word scrubbed from the waypoint rooms.
          description: 'Waypoint + Challenge = Stop. Leave the challenge on RANDOM and the stop takes whatever fits at play time.'
        },
        {
          href: '/mc/waypoints/',
          // THE LABEL IS THE ROOM'S OWN NAME (2026-08-31). The FOLDER stays
          // `/mc/waypoints/`, which is the noun the room is a library OF and
          // the address every stored link uses.
          label: 'Waypoint Library',
          // THE ROOM OWN SENTENCE, minus the live count, which is a runtime
          // figure and not a description.
          //   IT SAID `place` THREE TIMES, which is the word scrubbed from
          // all three waypoint rooms on 2026-08-31: `public.places` is a real
          // table and it holds CITIES, so a waypoint called a place collides
          // with a table that means something else. A door left out of that
          // sweep is how the word comes back.
          description: 'A Waypoint is a real world location where a game\'s challenge takes place, and Waypoint + Challenge = Game Stop. Find one, see them all on the map, and fix what is missing.'
        },
        {
          href: '/mc/challenges/',
          // THE ROOM OWN NAME (2026-08-31). The FOLDER stays
          // `/mc/challenges/`, which is the noun the room is a bank OF and
          // the address every stored link uses.
          label: 'Challenge Bank',
          // THE ROOM OWN SENTENCE. It read `What a team does when they get
          // there. Written once, with variables, and used in every game it
          // fits.` -- true, and it had drifted from the room, which says the
          // pair as an equation. The equation is the half that places a
          // challenge in the product, and it is the same line the Waypoint
          // Library and the Stop Builder carry.
          description: 'A Challenge is what a team does when they get there, and Waypoint + Challenge = Game Stop. Trivia lives here too, keyed to a fandom or a city rather than to a scope.'
        }
      ]
    },
    // ---- THE SPINE IS GONE (2026-08-31) ---------------------------------
    // It held the Game Builder, Audiences and Anchor Events, and all three are
    // in The Formula now -- they are the top of that diagram, not a separate
    // stage of the work, and a room in two groups says it is two things.
    //
    // WHAT IS LOST, said rather than discovered: the argument the Spine made.
    // It read in the order a game is ASSEMBLED and its comment carried the
    // reasoning for why the Game Builder leads rather than trails. That order
    // survives inside The Formula, which reads the same way top to bottom.
    //
    // TRIVIA WAS A ROOM OF ITS OWN HERE UNTIL 2026-08-31, at /mc/trivia/. Its
    // 38 questions are `challenges` rows carrying kind = trivia, edited in the
    // Challenge Bank, so a second door to the same table would be the
    // duplication this menu keeps removing.
    {
      // ---- POST GAME ------------------------------------------------------
      // What comes back AFTER a team has walked it. A stop is where they stood;
      // this is the photograph they sent from it, which is the only part of the
      // whole product that arrives from the outside rather than being written.
      //
      // It sits below the two groups a game is built from
      // stops are what a team walks, and this is what the walk returns. It was
      // in Running It until 2026-08-31, among the daily chores, which is true
      // of when you open it and says nothing about what it is.
      label: 'Post Game',
      items: [
        {
          href: '/mc/highlights/',
          label: "Winner's Wall",
          description: 'Photographs teams sent in, and whether they are fit to publish.'
        }
      ]
    },
    {
      // ---- UNDER CONSTRUCTION ---------------------------------------------
      // RUNNING IT, FOR REVIEW AND ASSEMBLY, merged on 2026-08-31. Eleven
      // rooms in one group.
      //
      // WHAT THE THREE WERE SAYING, kept here so the argument is not lost with
      // the headings:
      //
      //   RUNNING IT   nothing here makes a game; you open these because one
      //                already exists and something needs looking at.
      //   FOR REVIEW   reachable, real code, and linked from nothing -- the
      //                state in which a page rots quietly. Listing them was
      //                never a proposal to delete them; it was a list of
      //                decisions somebody has to take.
      //   ASSEMBLY     the two rooms that put the pieces in an ORDER: the walk
      //                a team takes, and the conversation they have on it.
      //
      // THOSE ARE THREE DIFFERENT STATEMENTS AND THIS GROUP MAKES NONE OF
      // THEM. What it says instead is one thing that is true of all eleven:
      // none of them is finished. For a list somebody scans from the top that
      // is more useful than three headings each describing a smaller idea.
      //
      // IT SITS WHERE RUNNING IT WAS, so The Periphery still follows it and
      // External Tools is still last.
      label: 'Under Construction',
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
          href: '/mc/picmaker/',
          label: 'Picmaker',
          description: 'Sport marks, takeover heroes, and the reusable portrait prompts.'
        },
        {
          href: '/mc/tags/',
          label: 'Tags',
          // THE ROOM OWN SENTENCE. `public.tags` already existed and had no
          // rule that a tag is a WORD rather than a spelling, so Sports,
          // SPORTS and sports were three tags across 382 games. 2026090101
          // folded them and this room is where they are kept straight.
          description: 'A tag is one word a game is filed under, and the same word is one tag however it is spelled. Rename one here and it changes on every game carrying it.'
        },
        {
          href: '/mc/logostudio/',
          // THE GUIDE GREEN ROOM'S SHAPE, for the same reason: the picture
          // lives IN the row rather than at an address that can rot. 390 of
          // 395 guide image urls were 404 before anybody looked.
          label: 'Logo Studio',
          description: 'Logos a game can wear. The image lives in the row, not at an address that can rot.'
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
        },
        {
          href: '/mc/routes/',
          label: 'Routes',
          // THE ROOM OWN SENTENCE. It said `order the places`, which is the
          // word scrubbed from the waypoint rooms, and the room says the same
          // thing as the equation every other door in this group carries.
          description: 'A Route is the walk a game takes. Waypoint + Challenge = Stop, and the Direction is what sends a team to the next one.'
        },
        {
          href: '/mc/builder/',
          label: 'Flow Builder',
          description: 'The playable conversation: messages, prompts, replies and branches. Not the game identity, which is next door.'
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
        // AND THIS ONE, WHICH THE HUB LAYS OUT AS A CHART. Every key a group
        // carries has to be named HERE as well as in MENU_GROUPS: this
        // function builds a new object rather than copying, so a flag added to
        // the data and not to this list is silently dropped and the feature
        // simply does not happen.
        flow: !!group.flow,
        items: items
      };
    });
  }

  global.TgbMcAdminNav = {
    init: init,
    getGroups: getGroups
  };
}(window));
