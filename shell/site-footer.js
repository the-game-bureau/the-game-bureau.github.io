/* Shared site footer for public pages (home/games + gift shop + highlights).
   Drop a placeholder into the page:
     <footer class="site-footer" data-site-footer></footer>
     <script src="/shell/site-footer.js"></script>
   The script fills the placeholder with the standard copyright + social row,
   so the footer is literally identical across every public page (one source of
   truth, mirroring /shell/site-nav.js for the header). */
(function () {
  // Styles ship with the markup so a page only needs the one <script> tag.
  // Everything is in palette vars, so the sign-off follows whichever skin the
  // page is wearing (the civic layer remaps the same names).
  // `body .site-footer.site-footer` is specificity, not shouting: the skin sets
  // `body.home-page .site-footer`, and a plain `.site-footer` rule would lose to
  // it no matter where this stylesheet lands.
  var FOOTER_CSS = [
    /* CIVIC MODERNIST, same as the rest of the public site. The footer used to
       be a transparent strip of 0.72rem muted text with no border and no
       structure — it read as leftover margin rather than as the end of the
       document.

       It is now the NAV'S MIRROR, which is where the whole design comes from:
       the nav is a white slab with a 4px civic-blue rule on top and the brand
       set in uppercase Arial 800, so the footer closes the page with the same
       slab and the same rule. Open and shut with the same device.

       Everything is token-driven (--accent / --ink / --line / --signal), so the
       civic layer supplies the palette and any future skin remaps the same
       names. The hardcoded fallbacks are only for a page that somehow loads the
       footer without the site stylesheets. */

    /* `body .site-footer.site-footer` is specificity, not shouting. The civic
       layer sets `body.home-page .site-footer` — also (0,2,1) — so a plain
       `.site-footer` rule would lose to it. Doubling the class ties on
       specificity and wins on source order, because this <style> is appended to
       <head> at runtime, after the linked sheets. */
    'body .site-footer.site-footer{display:block;width:100%;margin:44px 0 0;',
    'padding:clamp(20px,3vw,28px) clamp(18px,3vw,30px) 18px;',
    'border:1px solid var(--line,#c9d2dc);border-top:4px solid var(--accent,#003c71);',
    'border-radius:0;background:var(--paper-strong,#fff);color:var(--muted,#52616f);',
    'box-shadow:none;opacity:1;}',

    /* ── Columns. auto-fit rather than a fixed count: three fit side by side on
          a laptop, two on a tablet, one on a phone, with no breakpoints. */
    '.site-footer .footer-cols{display:grid;gap:22px 28px;',
    'grid-template-columns:repeat(auto-fit,minmax(158px,1fr));',
    'padding:0 0 20px;}',
    '.site-footer .footer-col{display:grid;gap:9px;align-content:start;min-width:0;}',

    /* The yellow rule under each column heading is the site's signal color doing
       the same job as the 6px yellow bar pinned to the top of the viewport —
       it is the one warm mark in an otherwise blue-and-paper palette, and it is
       what stops three columns of links reading as a bare list. */
    'body .site-footer.site-footer .footer-col-label{margin:0 0 2px;padding:0 0 6px;',
    'border-bottom:2px solid var(--signal,#ffcd00);color:var(--ink,#111820);',
    'font-family:Arial,Helvetica,sans-serif;font-size:.68rem;font-weight:800;',
    'text-transform:uppercase;line-height:1;}',

    /* Links are UNDERLINED ON HOVER ONLY. The civic layer underlines every
       footer anchor by default, which is right for one line of prose and wrong
       for three columns of them — twelve underlines is a page of noise. */
    'body .site-footer.site-footer a{font-family:Arial,Helvetica,sans-serif;',
    'font-size:.82rem;font-weight:700;color:var(--ink,#111820);text-decoration:none;}',
    'body .site-footer.site-footer a:hover,body .site-footer.site-footer a:focus-visible{',
    'color:var(--accent,#003c71);text-decoration:underline;text-underline-offset:3px;outline:none;}',
    'body .site-footer.site-footer a:focus-visible{outline:2px solid var(--accent,#003c71);',
    'outline-offset:3px;}',

    /* ── Section icons. The glyph is a MASK filled with currentColor, so it
          turns civic blue with its label on hover — one asset doing two colours
          instead of a light copy and a dark copy.

          The row is inline-grid with a fixed 15px first column, not a flex gap,
          so all four labels start on the SAME x whatever the glyph's width. A
          trophy and a map pin do not have the same silhouette, and left to
          themselves the four words would sit at four different indents. */
    'body .site-footer.site-footer a.footer-sec{display:inline-grid;',
    'grid-template-columns:15px auto;align-items:center;gap:8px;}',
    '.site-footer a.footer-sec::before{content:"";width:15px;height:15px;',
    'background:currentColor;',
    '-webkit-mask:var(--footer-ico) center/contain no-repeat;',
    'mask:var(--footer-ico) center/contain no-repeat;}',
    /* A link with no glyph still reserves the column, so its label lines up
       with the ones that have one. background:transparent is load-bearing —
       with no --footer-ico the mask resolves to nothing and currentColor would
       paint a solid 15px block. */
    '.site-footer a.footer-sec--blank::before{background:transparent;}',

    /* ── Sign-off bar. Separated by a hairline, quieter than everything above
          it: this is the fine print, not a destination. */
    'body .site-footer.site-footer .footer-bottom{display:flex;flex-wrap:wrap;align-items:baseline;',
    'justify-content:space-between;gap:8px 18px;padding:14px 0 0;',
    'border-top:1px solid var(--line,#c9d2dc);}',
    'body .site-footer.site-footer .footer-mark{color:var(--muted,#52616f);',
    'font-family:Arial,Helvetica,sans-serif;font-size:.72rem;font-weight:700;}',
    /* Mission Control is an admin door on a public page. It stays deliberately
       the quietest thing here — muted, small, no hover fill — so it never reads
       as an invitation to a visitor. */
    'body .site-footer.site-footer .footer-mc-link{color:var(--muted,#52616f);font-size:.72rem;',
    'font-weight:700;}',
    /* The Follow reel. margin-left:auto rather than relying on the row's
       space-between: with three children, space-between would strand this in
       the middle of a wide footer. The auto margin eats the free space instead,
       so the copyright stays left and the reel sits beside Mission Control. */
    /* BOTH SELECTORS, AND THE WRAP IS THE ONE THAT MATTERS. followPopup
       re-parents the button into a .tgb-followpop-wrap so the panel has
       something to position against, which makes the WRAP the flex child of
       this row. Styling the button alone would put the auto margin on an
       element the flex layout is no longer looking at, and the reel would sit
       jammed against the copyright. This is the same mistake the nav made when
       `order` went on the button and FOLLOW jumped to the front. */
    'body .site-footer.site-footer .footer-bottom>.tgb-followpop-wrap,',
    'body .site-footer.site-footer .footer-follow{margin-left:auto;align-self:center;',
    /* align-self because the row is baseline-aligned and a button with no text
       has no baseline to align to, so it would hang low. */
    'display:inline-flex;padding:0;border:0;background:none;cursor:pointer;',
    'color:var(--muted,#52616f);}',
    'body .site-footer.site-footer .footer-follow[hidden]{display:none;}',
    'body .site-footer.site-footer .footer-follow:hover{color:var(--ink,#1b2438);}',
    'body .site-footer.site-footer .footer-follow:focus-visible{outline:2px solid ',
    'var(--ink,#1b2438);outline-offset:3px;border-radius:3px;}',
    /* Field guide lightbox: the article lives at /shell/aboutshop.html and is
       fetched on demand, so there is one copy of the text for every page. The
       injected article arrives without that page's stylesheet, so these rules
       dress it. */
    '.tgb-doc{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;',
    'padding:20px;background:rgba(17,24,32,.72);}',
    '.tgb-doc[hidden]{display:none;}',
    /* The panel wears the civic card device — an 8px blue rule across the top,
       the same one the page's own cards carry — so the fetched article reads as
       part of this site rather than as a bare browser dialog. */
    '.tgb-doc-panel{position:relative;width:min(720px,100%);max-height:min(86vh,900px);',
    'overflow:auto;padding:30px clamp(18px,4vw,36px) 28px;border:1px solid var(--line,#c9d2dc);',
    'border-top:8px solid var(--accent,#003c71);',
    'background:var(--paper-strong,#fff);color:var(--ink,#111820);text-align:left;}',
    '.tgb-doc-close{position:absolute;right:10px;top:10px;display:grid;place-items:center;',
    'width:30px;height:30px;padding:0;border:1px solid var(--line-strong,#111);',
    'background:var(--surface,#fff);color:var(--ink,#111);font-family:inherit;font-size:.72rem;',
    'line-height:1;cursor:pointer;}',
    '.tgb-doc-close:hover,.tgb-doc-close:focus-visible{border-color:var(--accent,#2d4880);',
    'color:var(--accent,#2d4880);outline:none;}',
    '.tgb-doc h1{margin:0 0 14px;font-size:clamp(1.4rem,3.4vw,1.9rem);line-height:1.15;}',
    '.tgb-doc h2{margin:26px 0 8px;font-size:1.02rem;}',
    '.tgb-doc p{margin:0 0 14px;font-size:.88rem;line-height:1.65;color:var(--muted,#69655e);}',
    '.tgb-doc p.lead{color:var(--ink,#111);font-size:.95rem;}',
    '.tgb-doc ul{margin:0 0 16px;padding-left:20px;}',
    '.tgb-doc li{margin:0 0 9px;font-size:.88rem;line-height:1.6;color:var(--muted,#69655e);}',
    '.tgb-doc li b{color:var(--ink,#111);}',
    '.tgb-doc a{color:var(--accent,#2d4880);text-decoration:underline;text-underline-offset:3px;}',
    '.tgb-doc .doc-fine{margin:22px 0 0;padding-top:14px;border-top:1px solid var(--line,#cdc5b8);',
    'font-size:.72rem;color:var(--muted,#69655e);}',
    /* The privacy policy's own furniture. It is a longer, more formal document
       than the shop guide — dated, with callouts and a table — and it arrives
       here WITHOUT its page's stylesheet, so these rules are what stop it
       rendering as a wall of unstyled prose. Kept in step with the matching
       block in shell/privacy.html by hand; that page still renders on its own
       URL and needs its own copy. */
    '.tgb-doc .doc-updated{margin:0 0 26px;font-family:"IBM Plex Mono",monospace;',
    'font-size:.72rem;color:var(--muted,#69655e);}',
    '.tgb-doc .doc-lead{font-size:.95rem;color:var(--ink,#111820);}',
    '.tgb-doc .doc-callout{margin:18px 0;padding:14px 16px;',
    'border-left:4px solid var(--accent,#003c71);background:var(--accent-soft,#e8f2fb);',
    'font-size:.86rem;}',
    '.tgb-doc .doc-callout p:last-child{margin-bottom:0;}',
    '.tgb-doc h3{margin:22px 0 6px;font-size:.95rem;}',
    '.tgb-doc table{width:100%;border-collapse:collapse;margin:14px 0 6px;font-size:.84rem;}',
    '.tgb-doc th,.tgb-doc td{padding:9px 10px;text-align:left;vertical-align:top;',
    'border-bottom:1px solid var(--line,#c9d2dc);}',
    '.tgb-doc th{font-family:"IBM Plex Mono",monospace;font-size:.68rem;font-weight:800;',
    'text-transform:uppercase;color:var(--ink,#111820);}',
    '.tgb-doc td{color:var(--muted,#52616f);}',
    /* Phones keep the columns LEFT-ALIGNED rather than centring them. A centred
       stack of ragged link lists is the classic small-screen footer mistake:
       every row starts at a different x and the eye has nothing to run down.
       Only the sign-off bar collapses, and it stays a row for as long as it
       fits. */
    '@media (max-width:640px){',
    'body .site-footer.site-footer{margin-top:32px;}',
    '.site-footer .footer-cols{gap:20px;}',
    'body .site-footer.site-footer .footer-bottom{gap:6px 14px;}',
    '}'
  ].join('');

  // A footer document opens in place rather than navigating away: fetch the
  // page, lift its content element, drop it in a lightbox. Modified clicks and
  // any failure fall through to the plain link, so the document is always
  // reachable even if the fetch dies.
  //
  // THE PAGE IS THE SOURCE OF TRUTH AND HAS TO KEEP EXISTING. Nothing is
  // inlined here — the lightbox is a nicer way to read a page that also stands
  // on its own URL, which matters most for the privacy policy: that link gets
  // filed with payment processors and app stores, and it has to resolve for a
  // person who is not running our JavaScript.
  //
  // The selector is per-link because the two documents are not built the same:
  // aboutshop.html wraps its copy in <article class="doc">, privacy.html in
  // <main class="doc-main">. Passing it in beats rewriting a page that renders
  // correctly on its own.
  function wireDocLightbox(link, contentSelector, label) {
    if (!link || typeof DOMParser !== 'function') return;
    var box = null, panel = null, lastFocus = null, loaded = false;

    function close() {
      if (!box) return;
      box.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    function build() {
      box = document.createElement('div');
      box.className = 'tgb-doc';
      box.hidden = true;
      box.innerHTML =
        '<div class="tgb-doc-panel" role="dialog" aria-modal="true" aria-label="' + (label || 'Document') + '">' +
          '<button class="tgb-doc-close" type="button" aria-label="Close">X</button>' +
          '<div class="tgb-doc-body"></div>' +
        '</div>';
      document.body.appendChild(box);
      panel = box.querySelector('.tgb-doc-body');
      box.querySelector('.tgb-doc-close').addEventListener('click', close);
      box.addEventListener('click', function (e) { if (e.target === box) close(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && box && !box.hidden) close();
      });
    }

    function show() {
      box.hidden = false;
      document.body.style.overflow = 'hidden';
      box.querySelector('.tgb-doc-close').focus();
      box.querySelector('.tgb-doc-panel').scrollTop = 0;
    }

    link.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      lastFocus = link;
      if (!box) build();
      if (loaded) { show(); return; }
      fetch(link.getAttribute('href'), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (html) {
          if (!html) throw new Error('no document');
          var article = new DOMParser().parseFromString(html, 'text/html')
            .querySelector(contentSelector || 'article.doc');
          if (!article) throw new Error('no content element');
          // "Back to the shop" and any other in-page return link is a PAGE
          // affordance; inside the lightbox the close button is the way out, and
          // a link that navigates away would strand the reader.
          Array.prototype.slice.call(article.querySelectorAll('a[href="/gifts/"],a[href="/"]')).forEach(function (a) {
            var p = a.closest('p');
            if (p) p.remove(); else a.remove();
          });
          panel.innerHTML = '';
          while (article.firstChild) panel.appendChild(article.firstChild);
          loaded = true;
          show();
        })
        .catch(function () { window.location.href = link.href; });
    });
  }

  function injectFooterStyles() {
    if (document.querySelector('style[data-tgb-footer-css]')) return;
    var style = document.createElement('style');
    style.dataset.tgbFooterCss = 'true';
    style.textContent = FOOTER_CSS;
    document.head.appendChild(style);
  }

  var navStatsSetter = window.TgbNav && typeof window.TgbNav.setButtonStats === 'function'
    ? window.TgbNav.setButtonStats
    : window.TgbNav && typeof window.TgbNav.setStats === 'function'
      ? window.TgbNav.setStats
    : null;
  var SB_URL = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var SB_KEY = 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3';
  var sbHeaders = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    Accept: 'application/json'
  };

  var footer =
    document.querySelector('footer[data-site-footer]') ||
    document.querySelector('footer.site-footer');
  if (!footer || footer.dataset.tgbFooterReady === 'true') return;

  // Mission Control is one fixed destination: the hub at /mc/index.html, on every
  // page this footer renders on. It used to be derived from location.pathname —
  // /gifts/ -> /gifts/admin/, /soundtracks/ -> /soundtracks/admin/ — against a
  // whitelist of sections that actually had an admin, so the link appeared on
  // some public pages and not others. One static href instead: the hub links out
  // to every section admin, so nothing is lost and there is no path logic to keep
  // in step with the folder layout. It is a root-absolute path, not '../mc/',
  // because the footer renders at several depths and a relative hop would land in
  // the wrong place from all but one of them.
  var MISSION_CONTROL_HREF = '/mc/index.html';

  // The four public sections plus How It Works. Hardcoded rather than derived
  // from the nav: the nav carries two primary links and two utility ones and
  // rearranges itself by page, while a footer index should list everything, in
  // one order, on every page.
  // The four public sections, each with the glyph that already stands for it in
  // the admin nav — map pin, gift box, double note, trophy, all Lucide on the
  // same 24-box. Copied rather than shared: mc/js/admin-site-nav.js is an admin
  // file and this is public chrome, so importing it here would drag the whole
  // room bar onto every visitor page. If a section's glyph changes, change it in
  // BOTH — the same bargain TEAM_COLOR_ORDER and the Plus Code codec make.
  //
  // They are rendered as a MASK over currentColor, not as <img>, which is what
  // lets a link's icon turn civic blue with its text on hover. One asset, two
  // colours, no second file.
  var SECTIONS = [
    ['/games/', 'Games', "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'/%3E%3Ccircle cx='12' cy='10' r='3'/%3E%3C/svg%3E"],
    ['/gifts/', 'Gifts', "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8'/%3E%3Cpath d='M2 7h20v5H2z'/%3E%3Cpath d='M12 22V7'/%3E%3Cpath d='M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7Z'/%3E%3Cpath d='M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z'/%3E%3C/svg%3E"],
    ['/soundtracks/', 'Soundtracks', "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E"],
    ['/highlights/', 'Highlights', "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9H4.5a2.5 2.5 0 0 1 0-5H6'/%3E%3Cpath d='M18 9h1.5a2.5 2.5 0 0 0 0-5H18'/%3E%3Cpath d='M4 22h16'/%3E%3Cpath d='M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'/%3E%3Cpath d='M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'/%3E%3Cpath d='M18 2H6v7a6 6 0 0 0 12 0V2Z'/%3E%3C/svg%3E"]
,
  ];
  // Lucide shield, on the same 24-box as the four section glyphs. A shield
  // rather than the padlock the admin nav carries: that padlock means "signed
  // in / signed out" everywhere else on this site, and reusing it for a policy
  // document would be the same picture meaning two things.
  var ICON_PRIVACY = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'/%3E%3C/svg%3E";
  // Lucide info. Not a shopping bag: the Gifts section above already carries a
  // gift box, and two commerce glyphs in one footer would read as two links to
  // the same place. This document explains how the shop works, so the glyph is
  // an explanation mark, not a product one.
  var ICON_ABOUT = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E";

  // THE FOLLOW COLUMN IS GONE (2026-08-20), and `SOCIALS` went with it. It was
  // five icon links straight to the accounts, built at a time when there was
  // nowhere else to put them. There is now: /follow/, which is in The Site
  // column above and can carry a handle and a line about what each account
  // actually posts. Five urls in two places is two places to keep in step, and
  // the footer is the copy that had already drifted (bare instagram.com against
  // the page's www.).
  //
  // WHAT THIS COSTS, plainly: reaching one account is now two clicks rather
  // than one, from every public page. If that turns out to matter, bring the
  // column back by reading /follow/ rather than by retyping the list here.

  function link(href, label, attrs) {
    return '<a href="' + href + '"' + (attrs || '') + '>' + label + '</a>';
  }

  // An icon link, or — when `icon` is omitted — one that reserves the icon
  // column and leaves it empty. THE BLANK IS THE POINT: as soon as one link in
  // a column has a glyph, a sibling without one starts its text 23px to the
  // left and the column reads as broken. The placeholder keeps every label on
  // the same x whether or not it has a picture.
  function iconLink(href, label, icon, extra) {
    var attrs = ' class="footer-sec' + (icon ? '' : ' footer-sec--blank') + '"' + (extra || '');
    if (icon) attrs += ' style="--footer-ico:url(&quot;data:image/svg+xml,' + icon + '&quot;)"';
    return link(href, label, attrs);
  }
  function column(label, links) {
    return '<nav class="footer-col" aria-label="' + label + '">' +
      '<h2 class="footer-col-label">' + label + '</h2>' + links.join('') + '</nav>';
  }

  // The year is stamped at render rather than typed into the markup, so nobody
  // has to remember it every January.
  var year = new Date().getFullYear();

  footer.classList.add('site-footer');
  // NO MASTHEAD, deliberately. A brand lockup here repeated the nav's verbatim
  // at the other end of the page, and with the columns carrying real structure
  // it was not doing any work — the copyright line below still signs the page.
  // The blue rule across the top is what says "this is The Game Bureau's
  // footer"; the name said it twice.
  footer.innerHTML =
    '<div class="footer-cols">' +
      column('The Site', SECTIONS.map(function (s) {
        return iconLink(s[0], s[1], s[2]);
      })) +
      column('Documents', [
        // data-doc-lightbox is the hook wireDocLightbox looks for. It used to
        // find this link with querySelector('.footer-doc-link') — the FIRST
        // match — so adding a document above it, or reordering the two, would
        // have silently attached the shop lightbox to the privacy policy.
        // No glyph yet, so it takes the blank icon column and stays aligned
        // with Privacy below it.
        iconLink('/shell/aboutshop.html', 'About the Gift Shop', ICON_ABOUT,
          ' data-doc-lightbox="article.doc"'),
        iconLink('/shell/privacy.html', 'Privacy', ICON_PRIVACY,
          ' data-doc-lightbox="main.doc-main"')
      ]) +
    '</div>' +
    '<div class="footer-bottom">' +
      '<span class="footer-mark">&copy; ' + year + ' The Game Bureau</span>' +
      // FOLLOW LIVES IN THE SIGN-OFF BAR, not in The Site column. That column
      // is four destinations and this is a menu-opener, which is why it looked
      // wrong there through three attempts. This row already holds the things
      // that are not sections.
      //
      // NO LABEL, DELIBERATELY. The reel names the five networks by showing
      // them, which is more than the word FOLLOW says, and an unlabelled glyph
      // is at home in a line of fine print in a way it never was in a list.
      //
      // IT IS EMPTY IN THE MARKUP. site-nav.js fills it with the reel and hangs
      // the menu on it; see the wiring below for what happens when that file is
      // absent.
      '<button type="button" class="footer-follow" data-follow-reel="1" hidden' +
        ' aria-label="Follow The Game Bureau" title="Follow The Game Bureau"></button>' +
      '<a class="footer-mc-link" href="' + MISSION_CONTROL_HREF + '">Mission Control</a>' +
    '</div>';
  footer.dataset.tgbFooterReady = 'true';

  // HANDED TO site-nav.js, WHICH OWNS BOTH THE LIST AND THE REEL. The footer
  // does not know our account urls and must not learn them: it carried its own
  // copy once and they drifted, bare instagram.com against www., which is why
  // that column was deleted in the first place.
  //
  // THE BUTTON SHIPS `hidden` AND IS ONLY REVEALED ON SUCCESS. It has no href
  // to fall back to and its whole content is injected, so without site-nav.js
  // it would be an empty button that does nothing. An absent control is better
  // than a dead one.
  var followBtn = footer.querySelector('.footer-follow');
  if (followBtn && window.TgbNav && typeof window.TgbNav.followPopup === 'function') {
    window.TgbNav.followPopup(followBtn);
    followBtn.hidden = false;
  }
  injectFooterStyles();
  // Every link carrying the attribute gets its own lightbox, with the content
  // selector read off the attribute value. Iterating beats the old
  // querySelector('.footer-doc-link') — that took the FIRST match, so the second
  // document would silently have opened the first one's text.
  Array.prototype.slice.call(footer.querySelectorAll('[data-doc-lightbox]')).forEach(function (a) {
    wireDocLightbox(a, a.getAttribute('data-doc-lightbox'), a.textContent);
  });

  function setStats(games, cities, gifts, soundtracks, highlights) {
    if (navStatsSetter) navStatsSetter(games, cities, gifts, soundtracks, highlights);
  }

  window.TgbFooterStats = { setStats: setStats };
  window.TgbNav = window.TgbNav || {};
  window.TgbNav.setStats = setStats;

  // soundtrackTrackCount() and countSoundtracks() lived here until 2026-08-06.
  // They only ever parsed the shape of the committed soundtracks.json, so they
  // died with it.

  // Tapes live in public.soundtracks / public.soundtrack_songs as of 2026-07-29.
  // soundtrack_stats already has the per-tape active count, so the stat is one
  // HEAD-shaped request: filter to tapes with at least one active song and read
  // the exact count off Content-Range.
  function fetchSoundtrackCount() {
    var url = SB_URL + '/rest/v1/soundtrack_stats?select=city_slug'
      + '&archived=is.false&active_songs=gt.0&limit=1&apikey=' + SB_KEY;
    return fetch(url, {
      headers: Object.assign({}, sbHeaders, { Prefer: 'count=exact' }),
      cache: 'no-store'
    }).then(function (r) {
      if (!r.ok) throw new Error('Soundtrack count unavailable');
      var match = String(r.headers.get('content-range') || '').match(/\/(\d+)$/);
      if (!match) throw new Error('Soundtrack count missing from Content-Range');
      return Number(match[1]) || 0;
    });
  }

  // No JSON fallback: soundtracks/soundtracks.json was deleted on 2026-08-06 and
  // Supabase is the only source. A failed count simply leaves the stat unset,
  // which is what the trailing catch already did for every other failure here.
  fetchSoundtrackCount()
    .then(function (count) {
      if (count != null) setStats(null, null, null, count);
    })
    .catch(function () {});

  function isMissingResultsRelation(status, detail) {
    return status === 404 && /PGRST205|Could not find the table/i.test(String(detail || ''));
  }

  function fetchHighlightsCountFrom(table) {
    return fetch(SB_URL + '/rest/v1/' + encodeURIComponent(table) + '?select=instanceid&limit=1&apikey=' + SB_KEY, {
      headers: Object.assign({}, sbHeaders, {
        Prefer: 'count=exact'
      }),
      cache: 'no-store'
    }).then(function (r) {
      if (r.ok) {
        var range = r.headers.get('content-range') || '';
        var match = String(range || '').match(/\/(\d+)$/);
        if (match) return Number(match[1]) || 0;
        return r.json().then(function (rows) { return Array.isArray(rows) ? rows.length : 0; });
      }
      return r.text().then(function (detail) {
        if (isMissingResultsRelation(r.status, detail)) return null;
        throw new Error('Highlights count unavailable');
      });
    });
  }

  fetchHighlightsCountFrom('highlights')
    .then(function (count) {
      if (count != null) return count;
      return fetchHighlightsCountFrom('game_results');
    })
    .then(function (count) {
      if (count != null) setStats(null, null, null, null, count);
    })
    .catch(function () {});

  // The Games page has its own animated ticker for game and gift counts.
  if (document.body && document.body.dataset.adminPage === 'mission-control') return;

  function isArchived(value) {
    if (value == null) return false;
    var s = String(value).trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  fetch(SB_URL + '/rest/v1/games?select=city,archived&apikey=' + SB_KEY, {
    headers: sbHeaders,
    cache: 'no-store'
  })
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (rows) {
      var live = (Array.isArray(rows) ? rows : []).filter(function (game) {
        return !isArchived(game && game.archived);
      });
      var cities = new Set();
      live.forEach(function (game) {
        var city = game && game.city ? String(game.city).trim() : '';
        if (city) cities.add(city.toLowerCase());
      });
      setStats(live.length, cities.size, null);
    })
    .catch(function () {});

  fetch(SB_URL + '/rest/v1/gift_shop_items?select=id&certified_at=not.is.null&archived=is.false&apikey=' + SB_KEY, {
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      Accept: 'application/json',
      Prefer: 'count=exact',
      Range: '0-0'
    },
    cache: 'no-store'
  })
    .then(function (r) {
      var range = r.headers.get('content-range') || '';
      var total = range.indexOf('/') >= 0 ? parseInt(range.split('/')[1], 10) : NaN;
      if (!isNaN(total)) setStats(null, null, total);
    })
    .catch(function () {});
}());
