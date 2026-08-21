/* Shared nav across the admin rooms. Drop a placeholder into the page:

     <header class="admin-site-nav" data-admin-site-nav></header>
     <script src="/mc/js/admin-site-nav.js"></script>

   It fills the placeholder with the same section buttons the public site nav
   carries — GAMES / GIFTS / SOUNDTRACKS / HIGHLIGHTS — styled to match, and
   marks the current room with aria-current so it fills in like the public one.

   THE TWIST: the buttons look public and go somewhere else. Each one lands on
   the ADMIN version of that section (/mc/gifts/, /mc/soundtracks/, and so on),
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
  // pages sit at different depths (/mc/gifts/ vs /mc/soundtracks/), so this
  // tests the section rather than comparing the whole path.
  // ── THE SECTION BUTTONS ARE GONE (2026-08-20) ────────────────────────────
  //
  // This bar used to carry GAMES / GIFTS / SOUNDTRACKS / HIGHLIGHTS / FOLLOW,
  // each an admin destination wearing a public section's name, each with a
  // quiet ADMIN under it and a plain link to its public page below. All five
  // are deleted. The bar is now the brand, MISSION CONTROL, and the padlock.
  //
  // WHY: five doors on every room's header is a site map, not a navigation
  // bar. Mission Control already IS the index, it is one press away, and it
  // lists every room with a description rather than a one-word face you had to
  // learn. The bar was answering a question the hub answers better.
  //
  // WHAT WENT WITH THEM, so nobody hunts for it: the ROOMS array and its five
  // entries, the FOLLOW button's scrolling account reel (which had lived here
  // for about an hour; it is now mc/js/follow-reel.js, used by the hub card),
  // the public-counterpart links, and the burger, which existed only to
  // collapse these five on a phone and had nothing left to collapse.
  //
  // The CSS for all of it is deleted too. Git has the lot if it is ever wanted
  // back; an unrendered ROOMS array left sitting here would answer "is this
  // wired?" with a convincing yes, which is the trap PLATFORM_ORDER already
  // sprang on this project once.

  // EVERY DESTINATION IN THIS BAR OPENS IN A NEW TAB (2026-08-10). These rooms
  // hold work in progress — a half-written game in the Marquee, a dirty card in
  // the Green Room, an unsaved route order — and several of them guard it with
  // a beforeunload prompt. Navigating away in place meant either losing that or
  // answering "are you sure" to reach the next room, which is the wrong price
  // for a glance at the gift shop.
  //
  // The padlock is deliberately NOT run through this: it is not a destination,
  // it toggles the session on the page you are standing on.
  //
  // rel is set with the target, never separately. A _blank link without
  // noopener hands the new page a window.opener reference back to this one,
  // and these are admin pages.
  function openInNewTab(anchor) {
    if (!anchor) return anchor;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    return anchor;
  }

  // The padlock shows STATE, not the action: open shackle = you are signed in,
  // closed = you are not. Clicking it toggles, so signed in it signs you out and
  // the lock swings shut. Sized on the same 24-box as the nav icons.
  // Mission Control: the hub the rooms hang off, and the one destination in this
  // bar that is not a section. It gets no public sibling link because it has no
  // public page — /mc/ is admin all the way down — which is why it renders as a
  // lone button beside the padlock rather than as another ROOMS column.
  // ── THE WAY OUT TO THE PUBLIC SITE ───────────────────────────────────────
  // Left of MISSION CONTROL, and the pairing is the point: one button is the
  // way further in, the other is the way back out to what a visitor sees.
  //
  // THE PIN IS THE OLD GAMES ROOM GLYPH, kept when that button was deleted. It
  // is the waypoint mark, which is the closest thing this project has to a
  // logo, and it is doing the same job here it did there: standing for the
  // product rather than for a tool.
  //
  // NO `match` AND NO aria-current. It points at the public site, so it can
  // never be the page you are standing on: every page that loads this bar is
  // under /mc/.
  var TGB_HOME = {
    label: 'TGB',
    href: '/',
    title: 'The Game Bureau, the public site',
    icon: "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E"
  };

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
    /* WAS a wrapping flex row, which is what five buttons of different widths
       needed. The two that are left are equalised as a grid instead; see the
       rule further down. Kept as the fallback nothing currently needs, rather
       than two live definitions of one selector quietly fighting over source
       order, it is simply gone. */
    /* The public link, deliberately plain: no border, no fill, smaller and
       lighter than the button above it, so the button stays the primary target
       and this reads as a footnote to it. */
    /* The public link carries two labels and shows one at a time. On a desktop
       the button and the link under it deliberately repeat the same word — that
       pairing is what says "room, and the page a visitor sees". Stacked into a
       phone list the repeat reads as a duplicate row instead, so there the word
       gives way to a plain PUBLIC tag. Two spans rather than a JS text swap, so
       the panel needs no rebuild when the layout crosses the breakpoint. */
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
    /* ── THE FOLLOW REEL, the one wordless button in the bar ────────────────
       The reel IS the face, so the Lucide glyph is switched off: drawn as well
       it would be two pictures on one button. Padding matches the others so it
       sits in the same rhythm despite being narrower. */
    /* 17px, NOT the public nav's 18: it matches the glyph the four buttons
       beside it carry, so all five faces are drawn to one size. */
    /* currentColor, like every other glyph here, so it flips to white with the
       button when it fills in as the current room. */
    /* Each icon HOLDS, then slides. A continuous crawl is a fidget; a hold
       reads as "these are the five" and gives the eye time to name one. */
    '@keyframes asnFollowReel {',
    '  0%, 16%   { transform: translateY(0); }',
    '  20%, 36%  { transform: translateY(-17px); }',
    '  40%, 56%  { transform: translateY(-34px); }',
    '  60%, 76%  { transform: translateY(-51px); }',
    '  80%, 96%  { transform: translateY(-68px); }',
    '  100%      { transform: translateY(-85px); }',
    '}',
    /* A LOOPING ANIMATION IS EXACTLY WHAT THIS SETTING IS FOR. Frozen on the
       first icon, which is still a truthful face for the button. */
    '@media (prefers-reduced-motion: reduce) {',
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
    /* ── TGB AND MISSION CONTROL ARE ONE SIZE ────────────────────────────────
       They are the only two buttons on the bar and they read as a pair, so a
       three-character face beside a two-line one looked like a mistake rather
       than a difference.
       EQUALISED BY GRID, NOT BY A MEASURED WIDTH. `grid-auto-columns: 1fr` in
       an auto-width container sizes every track to the WIDEST one, so the pair
       matches whatever the longest label happens to be and keeps matching if
       either is renamed or a third button is added. A hand-measured min-width
       would be a number nobody could maintain, and it would be wrong the first
       time the font changed.
       The default `align-items: stretch` is what makes the heights agree: the
       one-line button grows to the two-line one rather than floating at 44px
       beside a taller neighbour. */
    '.admin-site-nav .asn-links {',
    '  display: grid;',
    '  grid-auto-flow: column;',
    '  grid-auto-columns: 1fr;',
    '  gap: 6px;',
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
    /* WIDTH ONLY. THE TOUCH TRIGGER IS GONE, and it is worth saying why rather
       than leaving it to be helpfully re-added.

       It used to also fire on `(hover: none) and (pointer: coarse)`, on the
       reasoning that the input device is a fact no viewport setting can
       misreport, and that a touch laptop with a mouse would report
       `pointer: fine` and be unaffected. That last part is simply not true of
       Windows touchscreens, which report coarse and no-hover whether or not a
       mouse is attached. So a maximised browser on a touch laptop matched, and
       the phone panel appeared on a full-size desktop window.

       WHAT THIS COSTS: Safari's "Request Desktop Website" is a per-site toggle
       an iPhone keeps forever once tapped, and which a home-screen app inherits
       at install. It reports a ~980px layout viewport and ignores
       width=device-width, so such a phone now sails over this breakpoint and
       gets the five-button row on a 390px screen. That was the case the touch
       trigger was added for.
       It cannot be fixed by moving the number: the affected iPhone reports ~980
       and an affected laptop reports ~970, ten pixels apart. If it becomes a
       real problem, separate them on the PHYSICAL screen rather than the layout
       viewport -- `(max-device-width: 500px)` -- not by bringing the bare
       pointer test back. */
    /* THE TOUCH TRIGGER IS NOW WIDTH-CAPPED, and the cap is the whole point.
       `(hover: none) and (pointer: coarse)` on its own is a fact about the
       INPUT DEVICE with nothing said about the screen, so a desktop or laptop
       with a touchscreen -- which is most Windows machines now -- matched it at
       any width and got the phone menu on a 1280px browser window. That is the
       burger appearing on the web version.
       1100px keeps the case the trigger was added for: Safari's "Request
       Desktop Website", a per-site toggle an iPhone keeps forever and a
       home-screen app inherits at install, reports a ~980px layout viewport and
       ignores width=device-width, so a real phone sails over the 900px test and
       used to get the five-button row on a 390px screen. 980 is under 1100, so
       it still collapses; a touch laptop at 1280 no longer does. */
    '@media (max-width: 900px) {',
    '  .admin-site-nav {',
    '    grid-template-columns: minmax(0, 1fr) auto;',
    '    align-items: center;',
    '    gap: 10px 10px;',
    '    padding: 10px max(16px, env(safe-area-inset-right), calc(50vw - 50%))',
    '             10px max(16px, env(safe-area-inset-left), calc(50vw - 50%));',
    '  }',
    '  .admin-site-nav .asn-tools { align-self: center; }',
    /* 44px square. The padlock is 40 on a desktop, which is fine for a cursor
       and one pixel-row short of the smallest reliable thumb target.
       Compound selector, because this padding has to beat .asn-link's
       `0 14px`, which on a plain class alone would only hold by source order. */
    '  .admin-site-nav .asn-link.asn-lock {',
    '    width: 44px;',
    '    padding: 0;',
    '  }',
    /* THE BAR STAYS A ROW ON A PHONE. It used to collapse into a stacked panel
       that pushed the page down, revealed by the burger, because five buttons
       with a public link under each could not fit a 390px screen. There are two
       buttons now and they fit, so the panel, the burger and the whole list
       treatment are gone.

       THIS WAS BRIEFLY BROKEN AND IT IS WORTH KNOWING HOW. The panel rules
       outlived the burger by about an hour, and they said `display: none` with
       `[data-nav-open="true"]` as the only way back. That attribute is written
       by the burger, so with the burger gone nothing could set it: under 900px
       the bar built its two buttons and then hid them, with no error and
       nothing to click. Two more rules hid the icon and the word on every
       `.asn-links .asn-link`, which existed so a section button could shrink to
       its ADMIN tag; these buttons have no tag, so they would have rendered
       EMPTY. DELETE A CONTROL AND ITS CSS IN THE SAME PASS. */
    '  .admin-site-nav .asn-links { gap: 6px; }',
    '  .admin-site-nav .asn-links .asn-link { padding: 0 10px; }',
    '  .admin-site-nav .asn-mc .asn-labelcol { gap: 0.32em; }',
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

  // TWO BUTTONS CANNOT BOTH BE THE CURRENT PAGE. Every room moved under /mc/
  // during the 2026-08-07 consolidation — /mc/gifts/, /mc/highlights/,
  // /mc/soundtracks/, and the game editors at /mc/*.html — but MISSION
  // CONTROL still matches the whole of /^\/mc\//, so on any of those pages the
  // room button AND the mast button both filled in. The rooms are the more
  // specific answer, so Mission Control only claims the page when none of them
  // does. Computed once here, before any button is built.
  // WAS `ROOMS.some(...)`: the room buttons were the more specific answer, so
  // Mission Control stood down whenever one of them claimed the page. With the
  // rooms gone there is nothing to defer to, and the mast button is the only
  // thing that can be current.
  var roomIsCurrent = false;

  var brand = document.createElement('div');
  brand.className = 'asn-brand';
  brand.innerHTML =
    '<span class="asn-brand-name">The Game Bureau</span>' +
    '<p class="asn-brand-tagline">Mission Control</p>';

  var links = document.createElement('nav');
  links.className = 'asn-links';
  links.setAttribute('aria-label', 'Admin sections');


  // ── TGB, first on the bar ─────────────────────────────────────────────────
  // THIS TAB, unlike MISSION CONTROL beside it. It briefly opened a new one, on
  // the reasoning that a glance at the live site should not take your admin page
  // away. That is the wrong model of the press: leaving the admin area is a
  // departure, not a peek, and a door that quietly spawns a tab every time you
  // press it is how you end up with nine of them. The back button is the way
  // back, which is what it is for.
  var home = document.createElement('a');
  home.className = 'asn-link asn-home';
  home.href = TGB_HOME.href;
  home.title = TGB_HOME.title;
  home.setAttribute('aria-label', TGB_HOME.title);
  home.style.setProperty('--asn-icon', 'url("data:image/svg+xml,' + TGB_HOME.icon + '")');
  // The same label column MISSION CONTROL uses, holding one word instead of
  // two. Both buttons are 44px tall whatever is in them, so a one-line face and
  // a two-line face sit level.
  var homeLabel = document.createElement('span');
  homeLabel.className = 'asn-labelcol';
  var homeWord = document.createElement('span');
  homeWord.className = 'asn-word';
  homeWord.textContent = TGB_HOME.label;
  homeLabel.appendChild(homeWord);
  home.appendChild(homeLabel);
  links.appendChild(home);

  // ── Mission Control, right of TGB and left of the padlock ─────────────────
  // Every room can be reached from every other room by now; the hub could not be
  // reached from any of them without typing the URL. It is a bare button, no
  // ADMIN sub-label and no public link under it, because both would be lies.
  var mc = document.createElement('a');
  mc.className = 'asn-link asn-mc';
  mc.href = MISSION_CONTROL.href;
  openInNewTab(mc);
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
  if (!roomIsCurrent && MISSION_CONTROL.match.test(path)) mc.setAttribute('aria-current', 'page');
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

  // ── The padlock ──────────────────────────────────────────────────────────
  // THE BURGER WENT WITH THE SECTION BUTTONS (2026-08-20). It existed only to
  // collapse the five room buttons into a panel on a phone, and with nothing
  // left to collapse it was a control that opened an empty drawer. Gone with it:
  // setOpen, the data-nav-open attribute, the Escape and outside-tap handlers,
  // and the matchMedia listener that reset the state when the layout widened.
  var tools = document.createElement('div');
  tools.className = 'asn-tools';

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
