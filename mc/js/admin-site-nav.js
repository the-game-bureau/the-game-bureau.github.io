/* Shared nav across the admin rooms. Drop a placeholder into the page:

     <header class="admin-site-nav" data-admin-site-nav></header>
     <script src="/mc/js/admin-site-nav.js"></script>

   It fills the placeholder with the same section buttons the public site nav
   carries — GAMES / GIFTS / SOUNDTRACKS / HIGHLIGHTS — styled to match, and
   marks the current room with aria-current so it fills in like the public one.

   THE TWIST: the buttons look public and go somewhere else. Each one lands on
   the ADMIN version of that section (/games/admin/, /gifts/admin/, and so on),
   not the public page. That is deliberate — an admin moving between rooms wants
   the other room, not the storefront — and it is why every link carries a title
   that says so plainly ("Admin gifts"), so a hover resolves the destination even
   though the button face gives nothing away.

   SELF-CONTAINED BY DESIGN. The look is copied out of site-pages.css and
   civic-modernist-pages.css rather than linked, because those two stylesheets
   are written against body.home-page and would restyle an admin page wholesale
   if pulled in for a nav bar. The cost is that a change to the public nav's
   appearance has to be mirrored here by hand — the same bargain TEAM_COLOR_ORDER
   and the Plus Code codec already make in this repo.
*/
(function () {
  var header =
    document.querySelector('header[data-admin-site-nav]') ||
    document.querySelector('header.admin-site-nav');
  if (!header || header.dataset.tgbAdminNavReady === 'true') return;

  // The admin rooms. `match` is what makes a button read as current: the admin
  // pages sit at different depths (/gifts/admin/ vs /highlights/admin/), so this
  // tests the section rather than comparing the whole path.
  var ROOMS = [
    {
      key: 'games',
      label: 'GAMES',
      href: '/games/admin/',
      title: 'Admin games',
      publicHref: '/games/',
      publicTitle: 'Public games page',
      match: /^\/games\/admin\//,
      // Map pin.
      icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E"
    },
    {
      key: 'gifts',
      label: 'GIFTS',
      href: '/gifts/admin/',
      title: 'Admin gifts',
      publicHref: '/gifts/',
      publicTitle: 'Public gift shop',
      match: /^\/gifts\/admin\//,
      // Gift box.
      icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8'/%3E%3Cpath d='M2 7h20v5H2z'/%3E%3Cpath d='M12 22V7'/%3E%3Cpath d='M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z'/%3E%3Cpath d='M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z'/%3E%3C/svg%3E"
    },
    {
      key: 'soundtracks',
      label: 'SOUNDTRACKS',
      href: '/soundtracks/admin/',
      title: 'Admin soundtracks',
      publicHref: '/soundtracks/',
      publicTitle: 'Public soundtracks page',
      match: /^\/soundtracks\/admin\//,
      // Double note.
      icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E"
    },
    {
      key: 'highlights',
      label: 'HIGHLIGHTS',
      href: '/highlights/admin/',
      title: 'Admin highlights',
      publicHref: '/highlights/',
      publicTitle: 'Public highlights page',
      match: /^\/highlights\/admin\//,
      // Trophy.
      icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9H4.5a2.5 2.5 0 0 1 0-5H6'/%3E%3Cpath d='M18 9h1.5a2.5 2.5 0 0 0 0-5H18'/%3E%3Cpath d='M4 22h16'/%3E%3Cpath d='M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'/%3E%3Cpath d='M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'/%3E%3Cpath d='M18 2H6v7a6 6 0 0 0 12 0V2Z'/%3E%3C/svg%3E"
    }
  ];

  // The padlock shows STATE, not the action: open shackle = you are signed in,
  // closed = you are not. Clicking it toggles, so signed in it signs you out and
  // the lock swings shut. Sized on the same 24-box as the nav icons.
  // Mission Control: the hub the rooms hang off, and the one destination in this
  // bar that is not a section. It gets no public sibling link because it has no
  // public page — /mc/ is admin all the way down — which is why it renders as a
  // lone button beside the padlock rather than as another ROOMS column.
  var MISSION_CONTROL = {
    label: 'MISSION CONTROL',
    href: '/mc/',
    title: 'Mission Control',
    match: /^\/mc\//,
    // Broadcast mast. Deliberately NOT the gear that watermarks these headers: a
    // gear says configuration, and /mc/ is a hub, not a settings page. The tall
    // thin silhouette also separates it from the four rounded room glyphs beside
    // it, which matters more here than matching the wallpaper.
    icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.9 16.1C1 12.2 1 5.8 4.9 1.9'/%3E%3Cpath d='M7.8 4.7a6.14 6.14 0 0 0-.8 7.5'/%3E%3Ccircle cx='12' cy='9' r='2'/%3E%3Cpath d='M16.2 4.8c2 2 2.26 5.11.8 7.47'/%3E%3Cpath d='M19.1 1.9a9.96 9.96 0 0 1 0 14.1'/%3E%3Cpath d='M9.5 18h5'/%3E%3Cpath d='m8 22 4-11 4 11'/%3E%3C/svg%3E"
  };

  // Three rules and an X. Same 24-box and the same mask pipeline as every other
  // glyph here, so the burger flips to white with the button like the rest.
  var BURGER = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6h16'/%3E%3Cpath d='M4 12h16'/%3E%3Cpath d='M4 18h16'/%3E%3C/svg%3E";
  var BURGER_X = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 6 6 18'/%3E%3Cpath d='m6 6 12 12'/%3E%3C/svg%3E";

  var LOCK_OPEN = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 9.9-1'/%3E%3C/svg%3E";
  var LOCK_SHUT = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E";

  // The gear watermark, same artwork the Stock Room and Tape Room carry in
  // their own headers. It is injected by the shared nav script, but mounted on
  // the page behind the room header instead of inside the nav, so the nav fade
  // and the room surface read as one continuous sheet.
  var GEAR = '<svg class="asn-gear" viewBox="128 -12 220 216" aria-hidden="true"><g class="asn-cog asn-cog--large" transform="translate(212 72) rotate(-14)"><polygon class="asn-cog-body" points="-11.3,-65.0 -13.8,-78.8 -7.5,-79.6 7.5,-79.6 13.8,-78.8 11.3,-65.0 22.7,-62.0 27.5,-75.1 33.3,-72.7 46.3,-65.2 51.3,-61.4 42.3,-50.6 50.6,-42.3 61.4,-51.3 65.2,-46.3 72.7,-33.3 75.1,-27.5 62.0,-22.7 65.0,-11.3 78.8,-13.8 79.6,-7.5 79.6,7.5 78.8,13.8 65.0,11.3 62.0,22.7 75.1,27.5 72.7,33.3 65.2,46.3 61.4,51.3 50.6,42.3 42.3,50.6 51.3,61.4 46.3,65.2 33.3,72.7 27.5,75.1 22.7,62.0 11.3,65.0 13.8,78.8 7.5,79.6 -7.5,79.6 -13.8,78.8 -11.3,65.0 -22.7,62.0 -27.5,75.1 -33.3,72.7 -46.3,65.2 -51.3,61.4 -42.3,50.6 -50.6,42.3 -61.4,51.3 -65.2,46.3 -72.7,33.3 -75.1,27.5 -62.0,22.7 -65.0,11.3 -78.8,13.8 -79.6,7.5 -79.6,-7.5 -78.8,-13.8 -65.0,-11.3 -62.0,-22.7 -75.1,-27.5 -72.7,-33.3 -65.2,-46.3 -61.4,-51.3 -50.6,-42.3 -42.3,-50.6 -51.3,-61.4 -46.3,-65.2 -33.3,-72.7 -27.5,-75.1 -22.7,-62.0"></polygon><circle class="asn-cog-ring" r="54"></circle><circle class="asn-cog-inner" r="34"></circle><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5"></rect><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5" transform="rotate(60)"></rect><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5" transform="rotate(120)"></rect><circle class="asn-cog-core" r="11"></circle><circle class="asn-cog-bore" r="5.5"></circle><line class="asn-cog-crosshair" x1="-18" y1="0" x2="18" y2="0"></line><line class="asn-cog-crosshair" x1="0" y1="-18" x2="0" y2="18"></line></g><g class="asn-cog asn-cog--small" transform="translate(286 132) rotate(19)"><polygon class="asn-cog-body" points="-9.8,-45.0 -12.3,-56.7 -6.5,-57.6 6.5,-57.6 12.3,-56.7 9.8,-45.0 18.5,-42.1 23.4,-53.1 28.6,-50.5 39.2,-42.8 43.3,-38.6 34.3,-30.6 39.7,-23.2 50.1,-29.2 52.8,-24.0 56.8,-11.6 57.7,-5.8 45.8,-4.6 45.8,4.6 57.7,5.8 56.8,11.6 52.8,24.0 50.1,29.2 39.7,23.2 34.3,30.6 43.3,38.6 39.2,42.8 28.6,50.5 23.4,53.1 18.5,42.1 9.8,45.0 12.3,56.7 6.5,57.6 -6.5,57.6 -12.3,56.7 -9.8,45.0 -18.5,42.1 -23.4,53.1 -28.6,50.5 -39.2,42.8 -43.3,38.6 -34.3,30.6 -39.7,23.2 -50.1,29.2 -52.8,24.0 -56.8,11.6 -57.7,5.8 -45.8,4.6 -45.8,-4.6 -57.7,-5.8 -56.8,-11.6 -52.8,-24.0 -50.1,-29.2 -39.7,-23.2 -34.3,-30.6 -43.3,-38.6 -39.2,-42.8 -28.6,-50.5 -23.4,-53.1 -18.5,-42.1"></polygon><circle class="asn-cog-ring" r="38"></circle><circle class="asn-cog-inner" r="24"></circle><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5"></rect><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5" transform="rotate(60)"></rect><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5" transform="rotate(120)"></rect><circle class="asn-cog-core" r="7.5"></circle><circle class="asn-cog-bore" r="3.8"></circle><line class="asn-cog-crosshair" x1="-12" y1="0" x2="12" y2="0"></line><line class="asn-cog-crosshair" x1="0" y1="-12" x2="0" y2="12"></line></g></svg>';

  var STYLE_ID = 'tgb-admin-site-nav-style';

  var CSS = [
    /* Paper-blue, so the bar belongs to the admin rooms instead of arriving
       with the black-and-white public-site skin. It does not draw its own graph
       paper; the room/page background shows through the translucent wash.

       Full-bleed. The bar lives inside <main class="app">, which admin-shell.css
       caps at 1180px and pads 24px down from the top of the page, so left alone
       the fill would stop short of the window edges and float in the middle of
       the page. The negative margins push the box out to the viewport edges; the
       matching padding pulls the CONTENTS back onto the 1180px column, so the
       brand and the buttons still line up with everything below while the fill
       and the rules run the full width.

       50vw counts the scrollbar, so this overhangs by half a scrollbar width on
       the right; admin-shell.css sets body { overflow-x: clip }, which absorbs
       it without producing a horizontal scrollbar. */
    '.admin-site-nav {',
    '  --asn-blue: var(--bic-blue, #2d4880);',
    '  --asn-blue-rgb: var(--bic-blue-rgb, 45, 72, 128);',
    '  --asn-ink: var(--ink, var(--asn-blue));',
    '  --asn-paper: var(--paper-base, #fefef9);',
    '  --asn-panel: var(--cut-panel-bg, #e4ecfa);',
    '  --asn-panel-light: #f8fbff;',
    '  --asn-line: var(--cut-panel-line, rgba(var(--asn-blue-rgb), 0.38));',
    '  display: grid;',
    /* brand | rooms | tools. The tools column (burger + padlock) used to be the
       last item inside .asn-links; it is its own column now so that on a phone
       it can stay on the top row while the rooms drop into a panel underneath. */
    '  grid-template-columns: minmax(0, 1fr) auto auto;',
    '  align-items: center;',
    '  gap: 18px;',
    '  position: relative;',
    '  overflow: visible;',
    '  margin: calc(-1 * var(--mc-top-pad, 24px)) calc(50% - 50vw) 18px;',
    '  padding: 14px max(16px, calc(50vw - 50%));',
    '  border-bottom: 0;',
    '  border-top: 4px solid var(--asn-blue);',
    '  background:',
    '    linear-gradient(90deg, rgba(var(--asn-blue-rgb), 0) 0%, rgba(var(--asn-blue-rgb), 0) 50%, rgba(var(--asn-blue-rgb), 0.24) 100%);',
    '  background-size: 100% 100%;',
    '  box-shadow: none;',
    '  color: var(--asn-ink);',
    '}',
    '.admin-site-nav-host {',
    '  --asn-blue: var(--bic-blue, #2d4880);',
    '  --asn-blue-rgb: var(--bic-blue-rgb, 45, 72, 128);',
    '  --asn-ink: var(--ink, var(--asn-blue));',
    '  --asn-paper: var(--paper-base, #fefef9);',
    '  --asn-panel: var(--cut-panel-bg, #e4ecfa);',
    '  --asn-panel-light: #f8fbff;',
    '  --asn-line: var(--cut-panel-line, rgba(var(--asn-blue-rgb), 0.38));',
    '  position: relative;',
    '  isolation: isolate;',
    '  z-index: 0;',
    '}',
    '.admin-site-nav-host > .admin-site-nav {',
    '  z-index: 2;',
    '}',
    /* Watermark: a page layer, not a nav child. It starts in the upper-left and
       sits behind both the translucent nav and the room tooling, so the gears
       read as one continuous sheet instead of a clipped nav ornament. */
    '.admin-site-nav-host > .asn-page-gear {',
    '  position: absolute;',
    '  top: -52px;',
    '  left: -58px;',
    '  z-index: -1;',
    '  width: 330px;',
    '  height: 316px;',
    '  opacity: 0.88;',
    '  overflow: visible;',
    '  pointer-events: none;',
    '}',
    '.admin-site-nav-host .asn-cog { fill: none; stroke-linecap: round; stroke-linejoin: round; }',
    '.admin-site-nav-host .asn-cog--large { stroke: rgba(var(--asn-blue-rgb), 0.18); }',
    '.admin-site-nav-host .asn-cog--small { stroke: rgba(var(--asn-blue-rgb), 0.13); }',
    '.admin-site-nav-host .asn-cog-body { fill: rgba(var(--asn-blue-rgb), 0.028); stroke-width: 3.4; }',
    '.admin-site-nav-host .asn-cog-ring { fill: none; stroke-width: 3; }',
    '.admin-site-nav-host .asn-cog-inner { fill: none; stroke-width: 2.4; }',
    '.admin-site-nav-host .asn-cog-spoke { fill: rgba(var(--asn-blue-rgb), 0.07); stroke: none; }',
    '.admin-site-nav-host .asn-cog-core { fill: rgba(var(--asn-blue-rgb), 0.06); stroke-width: 2.2; }',
    '.admin-site-nav-host .asn-cog-bore { fill: none; stroke-width: 2; }',
    '.admin-site-nav-host .asn-cog-crosshair { stroke: rgba(var(--asn-blue-rgb), 0.14); stroke-width: 1.4; }',
    /* Everything real in the nav sits above the watermark. */
    '.admin-site-nav .asn-brand,',
    '.admin-site-nav .asn-tools,',
    '.admin-site-nav .asn-links {',
    '  position: relative;',
    '  z-index: 3;',
    '}',
    /* align-self: start rather than the header's align-items: center. The rooms
       column is a button with a public link under it, ~15px taller than the lone
       44px padlock; centred, the lock would float half a line below the buttons
       it sits beside. Start pins it to the same top edge. */
    '.admin-site-nav .asn-tools {',
    '  display: flex;',
    '  align-items: flex-start;',
    '  align-self: start;',
    '  gap: 6px;',
    '}',
    /* Desktop has room for all five destinations, so the burger is not merely
       hidden -- it is absent from the tab order too, which `display: none` gives
       for free and `visibility` would not.

       COMPOUND SELECTOR, and it has to be. The burger carries both classes, and
       `.admin-site-nav .asn-burger` ties `.admin-site-nav .asn-link` at (0,2,0)
       -- so the later of the two won, which is .asn-link's display: inline-flex,
       and the burger showed on desktop. Matching on .asn-link.asn-burger scores
       (0,3,0) and stops depending on where in the sheet the rule sits. */
    '.admin-site-nav .asn-link.asn-burger { display: none; }',
    '.admin-site-nav .asn-brand {',
    '  color: inherit;',
    '  cursor: default;',
    '}',
    /* Static printed lockup, not a link. The light stroke gives the letters a
       drawn edge so they hold up over the gear watermark. */
    '.admin-site-nav .asn-brand-name {',
    '  display: block;',
    '  color: var(--asn-ink);',
    '  font-family: "Space Grotesk", Arial, Helvetica, sans-serif;',
    '  font-size: 1.16rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0.035em;',
    '  line-height: 1;',
    '  text-transform: uppercase;',
    '  -webkit-text-stroke: 0.45px rgba(var(--asn-blue-rgb), 0.72);',
    '  paint-order: stroke fill;',
    '}',
    '.admin-site-nav .asn-brand-tagline {',
    '  margin: 5px 0 0;',
    '  color: rgba(var(--asn-blue-rgb), 0.78);',
    '  font-family: "IBM Plex Mono", Consolas, monospace;',
    '  font-size: 0.74rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0.1em;',
    '  line-height: 1;',
    '  text-transform: uppercase;',
    '  -webkit-text-stroke: 0.32px rgba(var(--asn-blue-rgb), 0.62);',
    '  paint-order: stroke fill;',
    '}',
    /* flex-start, not center: each section is a two-row column (button over
       public link) while the padlock is a lone button, and centering would push
       the lock down to the middle of the taller columns. */
    '.admin-site-nav .asn-links {',
    '  display: flex;',
    '  flex-wrap: wrap;',
    '  align-items: flex-start;',
    '  justify-content: flex-end;',
    '  gap: 6px;',
    '}',
    '.admin-site-nav .asn-item {',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: stretch;',
    '  gap: 3px;',
    '}',
    /* The public link, deliberately plain: no border, no fill, smaller and
       lighter than the button above it, so the button stays the primary target
       and this reads as a footnote to it. */
    '.admin-site-nav .asn-public {',
    '  display: block;',
    '  padding: 0 2px;',
    '  color: rgba(var(--asn-blue-rgb), 0.78);',
    '  font-family: "IBM Plex Mono", Consolas, monospace;',
    '  font-size: 0.62rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0.08em;',
    '  line-height: 1.2;',
    '  text-align: center;',
    '  text-decoration: none;',
    '  text-transform: uppercase;',
    '}',
    '.admin-site-nav .asn-public:hover,',
    '.admin-site-nav .asn-public:focus-visible {',
    '  color: var(--asn-ink);',
    '  text-decoration: underline;',
    '  outline: none;',
    '}',
    '.admin-site-nav .asn-link {',
    '  display: inline-flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  gap: 8px;',
    '  min-height: 44px;',
    '  padding: 0 14px;',
    '  border: 1px solid var(--asn-line);',
    '  border-radius: 8px;',
    '  background: var(--asn-panel-light);',
    '  color: var(--asn-ink);',
    '  box-shadow: 0 1px 1px rgba(var(--asn-blue-rgb), 0.08);',
    '  font-family: "IBM Plex Mono", Consolas, monospace;',
    '  font-size: 0.74rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0.08em;',
    '  line-height: 1;',
    '  text-decoration: none;',
    '  text-transform: uppercase;',
    '  white-space: nowrap;',
    '}',
    /* currentColor + mask, so the glyph flips to white with the button when it
       fills in — one icon asset instead of a light and a dark copy. */
    '.admin-site-nav .asn-link::before {',
    '  content: "";',
    '  display: inline-block;',
    '  width: 17px;',
    '  height: 17px;',
    '  flex: 0 0 17px;',
    '  align-self: center;',
    '  background: currentColor;',
    '  mask: var(--asn-icon) center / contain no-repeat;',
    '  -webkit-mask: var(--asn-icon) center / contain no-repeat;',
    '}',
    /* The label block: section word, ADMIN centred beneath it. A column so the
       two lines centre on each other rather than on the button, which keeps
       ADMIN under the word and clear of the icon beside it. */
    '.admin-site-nav .asn-labelcol {',
    '  display: inline-flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  gap: 1px;',
    '  line-height: 1;',
    '}',
    '.admin-site-nav .asn-word { line-height: 1; }',
    /* Smaller, lighter and letterspaced, so it labels the button without
       competing with the section name above it. */
    '.admin-site-nav .asn-admin {',
    '  font-size: 0.56rem;',
    '  font-weight: 700;',
    '  letter-spacing: 0.16em;',
    '  line-height: 1;',
    '  opacity: 0.78;',
    '}',
    '.admin-site-nav .asn-link:hover,',
    '.admin-site-nav .asn-link:focus-visible,',
    '.admin-site-nav .asn-link[aria-current="page"] {',
    '  border-color: var(--asn-blue);',
    '  background: var(--asn-blue);',
    '  color: #ffffff;',
    '  box-shadow: 0 1px 4px rgba(var(--asn-blue-rgb), 0.2);',
    '  outline: none;',
    '}',
    /* Icon-only, square, and it sits in the same row so it reads as the last
       button after the section links rather than as a separate control. */
    '.admin-site-nav .asn-lock {',
    '  width: 40px;',
    '  padding: 0;',
    '  cursor: pointer;',
    '}',
    '.admin-site-nav .asn-lock::before {',
    '  --asn-icon: var(--asn-lock-shut);',
    '}',
    '.admin-site-nav .asn-lock[data-signed-in="true"] {',
    '  border-color: var(--asn-blue);',
    '  background: #ffffff;',
    '  color: var(--asn-blue);',
    '}',
    '.admin-site-nav .asn-lock[data-signed-in="true"]::before {',
    '  --asn-icon: var(--asn-lock-open);',
    '}',
    '.admin-site-nav .asn-lock:hover,',
    '.admin-site-nav .asn-lock:focus-visible {',
    '  border-color: var(--asn-blue);',
    '  background: var(--asn-blue);',
    '  color: #ffffff;',
    '  outline: none;',
    '}',
    /* 900px is not a taste call: brand (~200px) plus five buttons and a padlock
       (~700px) is what the row costs, so below this it cannot lay out and used to
       wrap into three ragged lines that pushed the page's own header off a phone
       screen. Under it the rooms collapse into a panel behind the burger, and the
       top row keeps only the two things worth a permanent tap target -- the menu,
       and the padlock, which is also the sign-in indicator. */
    /* TWO TRIGGERS, and the second is not redundant. Width alone failed on a real
       iPhone: Safari's "Request Desktop Website" -- which is a per-site toggle a
       phone keeps forever once you have tapped it, and which a home-screen app
       inherits at install -- reports a ~980px layout viewport and ignores
       width=device-width entirely. The page was then over the breakpoint, so the
       burger stayed hidden and the five-button row came back on a 390px screen,
       which is the exact case this menu exists for.

       (hover: none) and (pointer: coarse) is a fact about the input device that
       no viewport setting can misreport. A touch laptop with a mouse reports
       pointer: fine and is unaffected; a tablet gets the burger at any width,
       which is the right answer for a thumb regardless of how much room it has. */
    '@media (max-width: 900px), (hover: none) and (pointer: coarse) {',
    '  .admin-site-nav {',
    '    grid-template-columns: minmax(0, 1fr) auto;',
    '    align-items: center;',
    '    gap: 10px 10px;',
    '    padding: 10px max(16px, env(safe-area-inset-right), calc(50vw - 50%))',
    '             10px max(16px, env(safe-area-inset-left), calc(50vw - 50%));',
    '  }',
    '  .admin-site-nav .asn-tools { align-self: center; }',
    '  .admin-site-nav .asn-link.asn-burger { display: inline-flex; }',
    /* 44px square each. The padlock is 40 on a desktop, which is fine for a
       cursor and one pixel-row short of the smallest reliable thumb target. */
    /* Compound again, for the same reason: padding here has to beat
       .asn-link's `0 14px`, and on a plain class selector that only holds
       because this block happens to sit last in the sheet. */
    '  .admin-site-nav .asn-link.asn-burger,',
    '  .admin-site-nav .asn-link.asn-lock {',
    '    width: 44px;',
    '    padding: 0;',
    '  }',
    /* The panel spans both columns on its own row, so it pushes the page down
       instead of overlaying it. An overlay would need a scroll lock and a
       backdrop; a phone has nothing behind this bar worth protecting. */
    '  .admin-site-nav .asn-links {',
    '    grid-column: 1 / -1;',
    '    display: none;',
    '    flex-direction: column;',
    '    align-items: stretch;',
    '    gap: 6px;',
    '    margin-top: 2px;',
    '  }',
    '  .admin-site-nav[data-nav-open="true"] .asn-links { display: flex; }',
    /* Room button and public link side by side. The public link was 0.62rem of
       bare text under the button -- a ~10px tap target, well under the 44px a
       thumb needs, and the single worst thing on this bar to hit by accident. It
       is a real button here, dashed to stay visibly secondary. */
    '  .admin-site-nav .asn-item {',
    '    flex-direction: row;',
    '    align-items: stretch;',
    '    gap: 6px;',
    '  }',
    '  .admin-site-nav .asn-item > .asn-link {',
    '    flex: 1 1 auto;',
    '    min-width: 0;',
    '    justify-content: flex-start;',
    '  }',
    '  .admin-site-nav .asn-labelcol { align-items: flex-start; }',
    '  .admin-site-nav .asn-public {',
    '    display: inline-flex;',
    '    align-items: center;',
    '    flex: 0 0 auto;',
    '    min-height: 44px;',
    '    padding: 0 13px;',
    '    border: 1px dashed var(--asn-line);',
    '    border-radius: 8px;',
    '    background: rgba(255, 255, 255, 0.55);',
    '  }',
    '  .admin-site-nav .asn-mc {',
    '    justify-content: flex-start;',
    '  }',
    '  .admin-site-nav .asn-mc .asn-labelcol {',
    '    flex-direction: row;',
    '    gap: 0.32em;',
    '  }',
    '  .admin-site-nav .asn-brand-name { font-size: 1.02rem; }',
    '  .admin-site-nav .asn-brand-tagline { font-size: 0.66rem; }',
    /* Half the size and fainter. At 330px the watermark filled a phone screen
       and turned the one bar you navigate by into a texture. */
    '  .admin-site-nav-host > .asn-page-gear {',
    '    top: -30px;',
    '    left: -46px;',
    '    right: auto;',
    '    width: 190px;',
    '    height: 182px;',
    '    opacity: 0.5;',
    '  }',
    '}'
  ].join('\n');

  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  header.classList.add('admin-site-nav');
  var host = header.parentElement;
  if (host) host.classList.add('admin-site-nav-host');

  var path = String(location.pathname || '');

  var brand = document.createElement('div');
  brand.className = 'asn-brand';
  brand.innerHTML =
    '<span class="asn-brand-name">The Game Bureau</span>' +
    '<p class="asn-brand-tagline">Mission Control</p>';

  var links = document.createElement('nav');
  links.className = 'asn-links';
  links.setAttribute('aria-label', 'Admin sections');

  ROOMS.forEach(function (room) {
    // Each section is a column: the admin button, and under it a plain-text link
    // to the PUBLIC page. The button and the link carry the same word, which is
    // the point — one takes you to the room, the other to what a visitor sees.
    // Without the second one there is no way from a room to its own public page,
    // since every button in this bar is an admin destination.
    var column = document.createElement('div');
    column.className = 'asn-item';

    var a = document.createElement('a');
    a.className = 'asn-link';
    a.href = room.href;
    a.style.setProperty('--asn-icon', 'url("data:image/svg+xml,' + room.icon + '")');
    a.title = room.title;
    // Just the title: "GAMES — Admin games" reads as a stutter to a screen
    // reader, and the title already contains the label.
    a.setAttribute('aria-label', room.title);
    // Two stacked lines of text, centred on each other, sitting to the RIGHT of
    // the icon rather than under it: the icon stays a single glyph beside the
    // label block. ADMIN is what tells you the button is not the public page —
    // the plain link below the button is.
    var labelCol = document.createElement('span');
    labelCol.className = 'asn-labelcol';

    var word = document.createElement('span');
    word.className = 'asn-word';
    word.textContent = room.label;

    var admin = document.createElement('span');
    admin.className = 'asn-admin';
    admin.textContent = 'ADMIN';

    labelCol.appendChild(word);
    labelCol.appendChild(admin);
    a.appendChild(labelCol);
    if (room.match.test(path)) a.setAttribute('aria-current', 'page');
    column.appendChild(a);

    var pub = document.createElement('a');
    pub.className = 'asn-public';
    pub.href = room.publicHref;
    pub.title = room.publicTitle;
    pub.setAttribute('aria-label', room.publicTitle);
    pub.textContent = room.label;
    column.appendChild(pub);

    links.appendChild(column);
  });

  // ── Mission Control, between HIGHLIGHTS and the padlock ───────────────────
  // Every room can be reached from every other room by now; the hub could not be
  // reached from any of them without typing the URL. It is a bare button, no
  // ADMIN sub-label and no public link under it, because both would be lies.
  var mc = document.createElement('a');
  mc.className = 'asn-link asn-mc';
  mc.href = MISSION_CONTROL.href;
  mc.title = MISSION_CONTROL.title;
  mc.setAttribute('aria-label', MISSION_CONTROL.title);
  mc.style.setProperty('--asn-icon', 'url("data:image/svg+xml,' + MISSION_CONTROL.icon + '")');
  // Two stacked lines, both full-size — the same label column the section
  // buttons use, but MISSION over CONTROL rather than word over ADMIN. One long
  // line made this button half again as wide as any other and pushed the padlock
  // off the row on a narrow screen.
  var mcLabel = document.createElement('span');
  mcLabel.className = 'asn-labelcol';
  MISSION_CONTROL.label.split(' ').forEach(function (line) {
    var span = document.createElement('span');
    span.className = 'asn-word';
    span.textContent = line;
    mcLabel.appendChild(span);
  });
  mc.appendChild(mcLabel);
  // Lights on any /mc/ page, not just the hub index — the section test the
  // ROOMS buttons use, applied to a section that happens to hold the hub.
  if (MISSION_CONTROL.match.test(path)) mc.setAttribute('aria-current', 'page');
  links.appendChild(mc);

  // ── The padlock: sign in / sign out, right of MISSION CONTROL ─────────────
  // It lives here rather than on each page because it is the one control every
  // room needs and none of them should style differently. A page hands it its
  // auth controller with TgbAdminSiteNav.bindAuth(adminAuth); until then the
  // lock still tracks state, because admin-auth.js fires tgb-admin-auth-change
  // on the window whatever created it.
  var lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'asn-link asn-lock';
  lock.setAttribute('data-asn-lock', '');
  lock.style.setProperty('--asn-lock-open', 'url("data:image/svg+xml,' + LOCK_OPEN + '")');
  lock.style.setProperty('--asn-lock-shut', 'url("data:image/svg+xml,' + LOCK_SHUT + '")');

  var boundAuth = null;

  function setSignedIn(signedIn) {
    var isIn = !!signedIn;
    lock.setAttribute('data-signed-in', isIn ? 'true' : 'false');
    var label = isIn ? 'Signed in — click to sign out' : 'Signed out — click to sign in';
    lock.title = label;
    lock.setAttribute('aria-label', label);
    lock.setAttribute('aria-pressed', isIn ? 'true' : 'false');
  }

  function isSignedIn() {
    if (!boundAuth || typeof boundAuth.getSession !== 'function') {
      return lock.getAttribute('data-signed-in') === 'true';
    }
    var session = boundAuth.getSession();
    return !!(session && session.access_token);
  }

  lock.addEventListener('click', function () {
    if (!boundAuth) return;
    if (isSignedIn()) {
      if (typeof boundAuth.signOut === 'function') boundAuth.signOut({ silent: true });
    } else if (typeof boundAuth.showAuth === 'function') {
      boundAuth.showAuth('Sign in with an admin account.');
    }
  });

  window.addEventListener('tgb-admin-auth-change', function (event) {
    var detail = event && event.detail;
    setSignedIn(detail && detail.signedIn);
  });

  setSignedIn(false);

  // ── The burger, left of the padlock ──────────────────────────────────────
  // Hidden above 900px, where every destination is already on the bar.
  var tools = document.createElement('div');
  tools.className = 'asn-tools';

  var burger = document.createElement('button');
  burger.type = 'button';
  burger.className = 'asn-link asn-burger';
  burger.setAttribute('aria-controls', 'asn-links');
  burger.style.setProperty('--asn-burger-icon', 'url("data:image/svg+xml,' + BURGER + '")');
  burger.style.setProperty('--asn-burger-x', 'url("data:image/svg+xml,' + BURGER_X + '")');
  links.id = 'asn-links';

  function setOpen(open) {
    header.setAttribute('data-nav-open', open ? 'true' : 'false');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.title = open ? 'Close menu' : 'Menu';
    burger.setAttribute('aria-label', burger.title);
    burger.style.setProperty('--asn-icon', open ? 'var(--asn-burger-x)' : 'var(--asn-burger-icon)');
  }

  burger.addEventListener('click', function () {
    setOpen(header.getAttribute('data-nav-open') !== 'true');
  });

  // Escape and outside-tap close it. Both matter more than on a desktop menu:
  // the panel pushes the page down, so leaving it open silently costs a screenful
  // every time you come back to the tab.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && header.getAttribute('data-nav-open') === 'true') {
      setOpen(false);
      burger.focus();
    }
  });
  document.addEventListener('click', function (e) {
    if (header.getAttribute('data-nav-open') !== 'true') return;
    if (!header.contains(e.target)) setOpen(false);
  });

  // Widening past the breakpoint reveals the links again by CSS alone, which
  // would leave aria-expanded="true" describing a control that is no longer
  // there. Reset the state with the layout.
  if (window.matchMedia) {
    var wide = window.matchMedia('(min-width: 901px)');
    var onWide = function (mq) { if (mq.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  setOpen(false);
  tools.appendChild(burger);
  tools.appendChild(lock);

  // Page watermark. It is not a grid item and no longer lives in the nav, so the
  // SVG can drift into the room header without being clipped.
  var gear = document.createElement('div');
  gear.innerHTML = GEAR;
  var gearSvg = gear.firstChild;
  if (gearSvg && host) {
    gearSvg.classList.add('asn-page-gear');
    host.insertBefore(gearSvg, header.nextSibling);
  }

  header.appendChild(brand);
  header.appendChild(links);
  header.appendChild(tools);
  header.dataset.tgbAdminNavReady = 'true';

  window.TgbAdminSiteNav = {
    // Called once by each room, after it builds its TgbMcAdminAuth controller.
    bindAuth: function (auth) {
      boundAuth = auth || null;
      setSignedIn(isSignedIn());
      return lock;
    },
    setSignedIn: setSignedIn,
    lockButton: lock
  };
}());
