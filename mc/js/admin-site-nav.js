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
  var LOCK_OPEN = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 9.9-1'/%3E%3C/svg%3E";
  var LOCK_SHUT = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='11' rx='2'/%3E%3Cpath d='M7 11V7a5 5 0 0 1 10 0v4'/%3E%3C/svg%3E";

  // The gear watermark, same artwork the Stock Room and Tape Room carry in
  // their own headers, sunk into the top-left of the bar behind the brand. It
  // lives here so all four rooms get it from one place. The 'atmosphere' and
  // 'halo' groups the page copies ship are dropped rather than carried and
  // hidden, since nothing here draws them.
  var GEAR = '<svg class="asn-gear" viewBox="128 -12 220 216" aria-hidden="true"><g class="asn-cog asn-cog--large" transform="translate(212 72) rotate(-14)"><polygon class="asn-cog-body" points="-11.3,-65.0 -13.8,-78.8 -7.5,-79.6 7.5,-79.6 13.8,-78.8 11.3,-65.0 22.7,-62.0 27.5,-75.1 33.3,-72.7 46.3,-65.2 51.3,-61.4 42.3,-50.6 50.6,-42.3 61.4,-51.3 65.2,-46.3 72.7,-33.3 75.1,-27.5 62.0,-22.7 65.0,-11.3 78.8,-13.8 79.6,-7.5 79.6,7.5 78.8,13.8 65.0,11.3 62.0,22.7 75.1,27.5 72.7,33.3 65.2,46.3 61.4,51.3 50.6,42.3 42.3,50.6 51.3,61.4 46.3,65.2 33.3,72.7 27.5,75.1 22.7,62.0 11.3,65.0 13.8,78.8 7.5,79.6 -7.5,79.6 -13.8,78.8 -11.3,65.0 -22.7,62.0 -27.5,75.1 -33.3,72.7 -46.3,65.2 -51.3,61.4 -42.3,50.6 -50.6,42.3 -61.4,51.3 -65.2,46.3 -72.7,33.3 -75.1,27.5 -62.0,22.7 -65.0,11.3 -78.8,13.8 -79.6,7.5 -79.6,-7.5 -78.8,-13.8 -65.0,-11.3 -62.0,-22.7 -75.1,-27.5 -72.7,-33.3 -65.2,-46.3 -61.4,-51.3 -50.6,-42.3 -42.3,-50.6 -51.3,-61.4 -46.3,-65.2 -33.3,-72.7 -27.5,-75.1 -22.7,-62.0"></polygon><circle class="asn-cog-ring" r="54"></circle><circle class="asn-cog-inner" r="34"></circle><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5"></rect><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5" transform="rotate(60)"></rect><rect class="asn-cog-spoke" x="-5.5" y="-33" width="11" height="66" rx="5.5" transform="rotate(120)"></rect><circle class="asn-cog-core" r="11"></circle><circle class="asn-cog-bore" r="5.5"></circle><line class="asn-cog-crosshair" x1="-18" y1="0" x2="18" y2="0"></line><line class="asn-cog-crosshair" x1="0" y1="-18" x2="0" y2="18"></line></g><g class="asn-cog asn-cog--small" transform="translate(286 132) rotate(19)"><polygon class="asn-cog-body" points="-9.8,-45.0 -12.3,-56.7 -6.5,-57.6 6.5,-57.6 12.3,-56.7 9.8,-45.0 18.5,-42.1 23.4,-53.1 28.6,-50.5 39.2,-42.8 43.3,-38.6 34.3,-30.6 39.7,-23.2 50.1,-29.2 52.8,-24.0 56.8,-11.6 57.7,-5.8 45.8,-4.6 45.8,4.6 57.7,5.8 56.8,11.6 52.8,24.0 50.1,29.2 39.7,23.2 34.3,30.6 43.3,38.6 39.2,42.8 28.6,50.5 23.4,53.1 18.5,42.1 9.8,45.0 12.3,56.7 6.5,57.6 -6.5,57.6 -12.3,56.7 -9.8,45.0 -18.5,42.1 -23.4,53.1 -28.6,50.5 -39.2,42.8 -43.3,38.6 -34.3,30.6 -39.7,23.2 -50.1,29.2 -52.8,24.0 -56.8,11.6 -57.7,5.8 -45.8,4.6 -45.8,-4.6 -57.7,-5.8 -56.8,-11.6 -52.8,-24.0 -50.1,-29.2 -39.7,-23.2 -34.3,-30.6 -43.3,-38.6 -39.2,-42.8 -28.6,-50.5 -23.4,-53.1 -18.5,-42.1"></polygon><circle class="asn-cog-ring" r="38"></circle><circle class="asn-cog-inner" r="24"></circle><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5"></rect><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5" transform="rotate(60)"></rect><rect class="asn-cog-spoke" x="-4.5" y="-22" width="9" height="44" rx="4.5" transform="rotate(120)"></rect><circle class="asn-cog-core" r="7.5"></circle><circle class="asn-cog-bore" r="3.8"></circle><line class="asn-cog-crosshair" x1="-12" y1="0" x2="12" y2="0"></line><line class="asn-cog-crosshair" x1="0" y1="-12" x2="0" y2="12"></line></g></svg>';

  var STYLE_ID = 'tgb-admin-site-nav-style';

  var CSS = [
    /* Solid white, so the bar caps the page instead of letting the room's graph
       paper run through it. The gear watermark sits on that white, not on the
       paper.

       Full-bleed. The bar lives inside <main class="app">, which admin-shell.css
       caps at 1180px and pads 24px down from the top of the page, so left alone
       the white would stop short of the window edges and float in the middle of
       the page. The negative margins push the box out to the viewport edges; the
       matching padding pulls the CONTENTS back onto the 1180px column, so the
       brand and the buttons still line up with everything below while the fill
       and the rules run the full width.

       50vw counts the scrollbar, so this overhangs by half a scrollbar width on
       the right; admin-shell.css sets body { overflow-x: clip }, which absorbs
       it without producing a horizontal scrollbar. */
    '.admin-site-nav {',
    '  display: grid;',
    '  grid-template-columns: minmax(0, 1fr) auto;',
    '  align-items: center;',
    '  gap: 18px;',
    '  position: relative;',
    '  overflow: hidden;',
    '  margin: calc(-1 * var(--mc-top-pad, 24px)) calc(50% - 50vw) 18px;',
    '  padding: 14px max(16px, calc(50vw - 50%));',
    '  border-bottom: 1px solid #111820;',
    '  border-top: 4px solid #003c71;',
    '  background: #ffffff;',
    '  color: #111820;',
    '}',
    /* Watermark: pinned to the top-left of the bar, bleeding off both edges, and
       behind everything. The bar clips it (overflow: hidden), so the cogs read
       as continuing under the page rather than as a floating logo. */
    '.admin-site-nav .asn-gear {',
    '  position: absolute;',
    '  top: -44px;',
    '  left: -58px;',
    '  z-index: 0;',
    '  width: 250px;',
    '  height: 238px;',
    '  pointer-events: none;',
    '}',
    '.admin-site-nav .asn-cog { fill: none; stroke-linecap: round; stroke-linejoin: round; }',
    '.admin-site-nav .asn-cog--large { stroke: rgba(45, 72, 128, 0.15); }',
    '.admin-site-nav .asn-cog--small { stroke: rgba(45, 72, 128, 0.11); }',
    '.admin-site-nav .asn-cog-body { fill: rgba(45, 72, 128, 0.022); stroke-width: 3.4; }',
    '.admin-site-nav .asn-cog-ring { fill: none; stroke-width: 3; }',
    '.admin-site-nav .asn-cog-inner { fill: none; stroke-width: 2.4; }',
    '.admin-site-nav .asn-cog-spoke { fill: rgba(45, 72, 128, 0.06); stroke: none; }',
    '.admin-site-nav .asn-cog-core { fill: rgba(45, 72, 128, 0.05); stroke-width: 2.2; }',
    '.admin-site-nav .asn-cog-bore { fill: none; stroke-width: 2; }',
    '.admin-site-nav .asn-cog-crosshair { stroke: rgba(45, 72, 128, 0.12); stroke-width: 1.4; }',
    /* Everything real sits above the watermark. */
    '.admin-site-nav .asn-brand,',
    '.admin-site-nav .asn-links {',
    '  position: relative;',
    '  z-index: 1;',
    '}',
    '.admin-site-nav .asn-brand {',
    '  text-decoration: none;',
    '  color: inherit;',
    '}',
    /* Grow, never underline. The brand is a two-line block, so underlining only
       the name split the pair visually and read as a stray link; scaling both
       together keeps them one target. Origin is left because the brand sits at
       the left edge — scaling from centre would nudge it into the padding. */
    '.admin-site-nav .asn-brand:hover .asn-brand-name,',
    '.admin-site-nav .asn-brand:focus-visible .asn-brand-name,',
    '.admin-site-nav .asn-brand:hover .asn-brand-tagline,',
    '.admin-site-nav .asn-brand:focus-visible .asn-brand-tagline {',
    '  transform: scale(1.045);',
    '}',
    '.admin-site-nav .asn-brand:focus-visible {',
    '  outline: 2px solid rgba(0, 60, 113, 0.34);',
    '  outline-offset: 4px;',
    '}',
    '.admin-site-nav .asn-brand-name {',
    '  display: block;',
    '  color: #003c71;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  font-size: 1rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0.02em;',
    '  text-transform: uppercase;',
    '  transform-origin: left center;',
    '  transition: transform 140ms ease;',
    '}',
    '.admin-site-nav .asn-brand-tagline {',
    '  margin: 2px 0 0;',
    '  color: #52616f;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  font-size: 0.78rem;',
    '  font-weight: 700;',
    '  transform-origin: left center;',
    '  transition: transform 140ms ease;',
    '}',
    '@media (prefers-reduced-motion: reduce) {',
    '  .admin-site-nav .asn-brand-name,',
    '  .admin-site-nav .asn-brand-tagline { transition: none; }',
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
    '  color: #52616f;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  font-size: 0.62rem;',
    '  font-weight: 700;',
    '  letter-spacing: 0.06em;',
    '  line-height: 1.2;',
    '  text-align: center;',
    '  text-decoration: none;',
    '  text-transform: uppercase;',
    '}',
    '.admin-site-nav .asn-public:hover,',
    '.admin-site-nav .asn-public:focus-visible {',
    '  color: #003c71;',
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
    '  border: 1px solid #111820;',
    '  border-radius: 0;',
    '  background: #ffffff;',
    '  color: #111820;',
    '  font-family: Arial, Helvetica, sans-serif;',
    '  font-size: 0.88rem;',
    '  font-weight: 800;',
    '  letter-spacing: 0;',
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
    '  opacity: 0.72;',
    '}',
    '.admin-site-nav .asn-link:hover,',
    '.admin-site-nav .asn-link:focus-visible,',
    '.admin-site-nav .asn-link[aria-current="page"] {',
    '  border-color: #003c71;',
    '  background: #003c71;',
    '  color: #ffffff;',
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
    '  border-color: #003c71;',
    '  color: #003c71;',
    '}',
    '.admin-site-nav .asn-lock[data-signed-in="true"]::before {',
    '  --asn-icon: var(--asn-lock-open);',
    '}',
    '.admin-site-nav .asn-lock:hover,',
    '.admin-site-nav .asn-lock:focus-visible {',
    '  border-color: #003c71;',
    '  background: #003c71;',
    '  color: #ffffff;',
    '  outline: none;',
    '}',
    '@media (max-width: 900px) {',
    '  .admin-site-nav {',
    '    grid-template-columns: minmax(0, 1fr);',
    '    gap: 10px;',
    '  }',
    '  .admin-site-nav .asn-links { justify-content: flex-start; }',
    '  .admin-site-nav .asn-link { font-size: 0.76rem; }',
    '}'
  ].join('\n');

  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  header.classList.add('admin-site-nav');

  var path = String(location.pathname || '');

  var brand = document.createElement('a');
  brand.className = 'asn-brand';
  brand.href = '/mc/';
  brand.title = 'Mission Control';
  brand.setAttribute('aria-label', 'Mission Control');
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

  // ── The padlock: sign in / sign out, right of HIGHLIGHTS ──────────────────
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
  links.appendChild(lock);

  // Watermark first, so it sits under the brand and the buttons in paint order
  // as well as by z-index. It is not a grid item — absolute, out of flow — so it
  // does not disturb the two-column layout.
  var gear = document.createElement('div');
  gear.innerHTML = GEAR;
  var gearSvg = gear.firstChild;
  if (gearSvg) header.appendChild(gearSvg);

  header.appendChild(brand);
  header.appendChild(links);
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
