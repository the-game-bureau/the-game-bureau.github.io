/* Notebook kit: shared code for every notebook game on thegamebureau.com.
 *
 * Each game folder (e.g. /dice-derby/) holds a game.json with its words, prices,
 * photos and print settings. The game's pages are thin shells that load this file
 * and say which page they are with <body data-page="...">:
 *   public   index.html     photos and videos, explanation, order, share, rules link
 *   rules    rules.html     the full rules, rendered from rules.md
 *   admin    admin.html     builds the cover and contents PDFs (see admin.js)
 * The printable pages (cover.html, contents.html) use print.js instead.
 */
(function () {
  'use strict';

  const NB = (window.NB = window.NB || {});

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  NB.esc = esc;

  // ---------- drafts (live preview from the admin page) ----------
  // The admin page keeps unsaved edits in localStorage under this folder's key. A page opened
  // with ?preview (or written into a preview frame) shows the draft instead of the saved files.
  NB.folder = () => new URL('./', document.baseURI).pathname;
  NB.draftKey = folder => 'nb-draft:' + (folder || NB.folder());
  NB.isPreview = () => location.protocol === 'about:' || new URLSearchParams(location.search).has('preview');
  NB.draft = function () {
    if (!NB.isPreview()) return null;
    try { return JSON.parse(localStorage.getItem(NB.draftKey()) || 'null'); } catch (e) { return null; }
  };

  NB.loadGame = async function () {
    const d = NB.draft();
    let g;
    if (d && d.game) {
      g = JSON.parse(JSON.stringify(d.game));
      // Photos picked on the admin page but not saved yet live in the admin window.
      try { const pend = window.parent !== window && window.parent.NB_PENDING; if (pend) (g.media || []).forEach(m => { if (m && pend[m.src]) m.src = pend[m.src]; }); } catch (e) { /* other origin */ }
    }
    else {
      const r = await fetch('./game.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('game.json not found (' + r.status + ')');
      g = await r.json();
    }
    // Pictures made by the PDF build (pdf/preview-*.jpg) stand in until real photos are added.
    try { const b = await fetch('./pdf/build.json', { cache: 'no-cache' }); g.build = b.ok ? await b.json() : null; } catch (e) { g.build = null; }
    g.print = Object.assign({ trim: [8.5, 11], bleed: 0.125, spinePerPage: 0.002252, padTo: 2, author: 'The Game Bureau' }, g.print || {});
    g.brand = Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, g.brand || {});
    g.pdf = {
      print: 'pdf/' + g.slug + '.pdf',
      cover: 'pdf/' + g.slug + '-cover.pdf',
      contents: 'pdf/' + g.slug + '-contents.pdf',
      sampler: 'pdf/' + g.slug + '-sampler.pdf',
    };
    // The public page offers the free sampler; set "freeFullPdf": true to offer the whole notebook instead.
    g.pdf.free = g.freeFullPdf ? g.pdf.print : g.pdf.sampler;
    g.pdf.freeLabel = g.freeFullPdf ? 'PRINT FREE (PDF)' : 'FREE SAMPLER (PDF)';
    NB.applyBrand(g);
    return g;
  };

  NB.applyBrand = function (g) {
    const s = document.documentElement.style;
    s.setProperty('--brand', g.brand.color);
    s.setProperty('--accent', g.brand.accent);
    s.setProperty('--paper', g.brand.paper);
    s.setProperty('--ink', g.brand.ink);
  };

  // What the rules are called (game.json "rulesName", e.g. "How to Play"). Default "Rules".
  NB.rulesName = g => ((g && g.rulesName) || '').trim() || 'Rules';
  // With a custom name, the starter heading "# <Title> rules" becomes "# <Title>: <name>".
  const nameRules = (text, g) => {
    if (!g || NB.rulesName(g) === 'Rules') return text;
    const h = '# ' + g.title + ' rules';
    return text.replace(/^\s*# .*$/m, line => line.trim().toLowerCase() === h.toLowerCase() ? '# ' + g.title + ': ' + NB.rulesName(g) : line);
  };
  NB.loadRules = async function (g) {
    const d = NB.draft();
    if (d && d.rules != null) return NB.md(nameRules(d.rules, g));
    const r = await fetch('./rules.md', { cache: 'no-cache' });
    if (!r.ok) throw new Error('rules.md not found (' + r.status + ')');
    return NB.md(nameRules(await r.text(), g));
  };

  // ---------- a small Markdown renderer for rules.md ----------
  // Handles: # ## ### headings, paragraphs, - and 1. lists, > callouts, ---,
  // **bold**, *italic*, [links](url). Raw HTML lines (starting with <) pass through.
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^(https?:|mailto:|\.?\/|#)/.test(u.replace(/&amp;/g, '&')) ? '<a href="' + u + '">' + t + '</a>' : t);

  NB.md = function (src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [], list = null, quote = [];
    const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
    const flushList = () => { if (list) { out.push('<' + list.tag + '>' + list.items.map(i => '<li>' + inline(i) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
    const flushQuote = () => { if (quote.length) { out.push('<aside class="callout">' + NB.md(quote.join('\n')) + '</aside>'); quote = []; } };
    const flush = () => { flushPara(); flushList(); flushQuote(); };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (/^>\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^>\s?/, '')); continue; }
      flushQuote();
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); const n = m[1].length; out.push('<h' + n + '>' + inline(m[2]) + '</h' + n + '>'); continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); out.push('<hr>'); continue; }
      if ((m = line.match(/^\s*([-*]|\d+[.)])\s+(.*)$/))) {
        flushPara();
        const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[2]);
        continue;
      }
      if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      if (/^\s*</.test(line)) { flush(); out.push(line); continue; }
      flushList();
      para.push(line.trim());
    }
    flush();
    return out.join('\n');
  };

  // ---------- media (photos, YouTube, Vimeo, video files) ----------
  NB.mediaHTML = function (m, opts = {}) {
    if (m.type === 'youtube' && m.id) return '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(m.id) + '" title="' + esc(m.alt || 'Video') + '" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>';
    if (m.type === 'vimeo' && m.id) return '<iframe src="https://player.vimeo.com/video/' + encodeURIComponent(m.id) + '" title="' + esc(m.alt || 'Video') + '" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
    if (m.type === 'video' && m.src) return '<video src="' + esc(m.src) + '"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : '') + ' controls playsinline preload="metadata"></video>';
    if (m.type === 'image' || (!m.type && m.src)) return '<img src="' + esc(m.src) + '" alt="' + esc(m.alt || '') + '"' + (opts.lazy ? ' loading="lazy"' : '') + '>';
    // A video entry with no source yet shows a placeholder.
    if (m.type === 'soon') return '<div class="media-soon photo"><b>PHOTOS COMING SOON</b></div>';
    return '<div class="media-soon"><div class="play" aria-hidden="true"></div><b>VIDEO COMING SOON</b>' + (m.alt ? '<small>' + esc(m.alt) + '</small>' : '') + '</div>';
  };
  const isVideo = m => m.type && m.type !== 'image' && m.type !== 'soon';

  // ---------- share ----------
  NB.share = async function (g, btn) {
    const url = location.href.split('#')[0].split('?')[0].replace(/(index|rules)\.html$/, '');
    const data = { title: g.title, text: g.shareText || g.tagline || g.title, url };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) { /* clipboard blocked */ }
    NB.toast(ok ? 'Link copied. Paste it anywhere to share.' : url);
    if (btn) btn.blur();
  };

  NB.toast = function (msg) {
    let t = document.getElementById('nb-toast');
    if (!t) { t = document.createElement('div'); t.id = 'nb-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
  };

  // ---------- order ----------
  // game.json "order": { "url": "https://buy.stripe.com/...", "label": "ORDER A COPY" }
  // A Stripe Payment Link gets the chosen quantity as client_reference_id.
  NB.orderURL = function (g, qty) {
    const u = (g.order && g.order.url) || '';
    if (!u) return '';
    if (/buy\.stripe\.com/.test(u)) return u + (u.includes('?') ? '&' : '?') + 'client_reference_id=qty-' + qty;
    return u;
  };

  // ---------- shared header and footer ----------
  const header = (g, here) =>
    '<header class="nb-bar"><div class="nb-wrap">' +
    '<a class="nb-home" href="./">' + esc((g.title || 'The Game Bureau').toUpperCase()) + '</a>' +
    '<nav>' +
    (here !== 'rules' ? '<a href="./rules.html">' + esc(NB.rulesName(g).toUpperCase()) + '</a>' : '') +
    '<a class="solid" href="./#order">ORDER</a>' +
    '<button type="button" class="nb-share" id="nb-share" aria-label="Share">' +
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7c0 .3 0 .5.1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4A3 3 0 1 0 18 16z"/></svg>' +
    '<span>SHARE</span></button>' +
    '</nav></div></header>';
  // The Share button in the top bar shares the game page, from any page.
  const bindShare = g => { const b = document.getElementById('nb-share'); if (b) b.onclick = e => NB.share(g, e.currentTarget); };
  const footer = g =>
    '<footer class="nb-foot"><div class="nb-wrap">' +
    '<nav><a href="./">' + esc(g.title.toUpperCase()) + '</a><a href="./rules.html">' + esc(NB.rulesName(g).toUpperCase()) + '</a><a href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + (g.freeFullPdf ? 'PRINT FREE' : 'FREE SAMPLER') + '</a><a href="./#order">ORDER</a></nav>' +
    '<a href="/">THEGAMEBUREAU.COM</a></div></footer>';

  // ---------- public page ----------
  NB.renderPublic = function (g) {
    let media = (g.media || []).filter(m => m && (m.type !== 'image' || m.src));
    if (!media.some(m => m.type === 'image' || (!m.type && m.src)) && g.build && g.build.previews) {
      media = g.build.previews.map((src, i) => ({ type: 'image', src, alt: i ? 'A page from the notebook' : 'The front cover' })).concat(media);
    }
    if (!media.length) media = [{ type: 'soon', alt: 'Photos coming soon' }];
    const videos = media.filter(isVideo);
    const order = g.order || {};
    const html =
      header(g, 'public') +
      (g.announce ? '<div class="nb-announce">' + esc(g.announce) + '</div>' : '') +
      '<main>' +
      '<section class="nb-hero" id="order"><div class="nb-wrap">' +
      '<div class="nb-gallery" aria-label="Photos and videos">' +
      '<div class="nb-stage" id="nb-stage"></div>' +
      (media.length > 1 ? '<div class="nb-thumbs" id="nb-thumbs"></div>' : '') +
      '</div>' +
      '<div class="nb-info">' +
      '<div class="nb-kick">' + esc(g.kicker || 'A NOTEBOOK GAME FROM THE GAME BUREAU') + '</div>' +
      '<h1>' + esc(g.title) + (g.subtitle ? '<span>' + esc(g.subtitle) + '</span>' : '') + '</h1>' +
      (g.tagline ? '<p class="nb-tag">' + esc(g.tagline) + '</p>' : '') +
      (g.price ? '<div class="nb-price"><b>' + esc(g.price) + '</b><span>' + esc(g.currency || 'USD') + '</span></div>' : '') +
      '<div class="nb-buy">' +
      '<div class="nb-qty"><label for="nb-qty">QTY</label><button type="button" data-q="-1" aria-label="Fewer">&minus;</button><input id="nb-qty" type="number" min="1" max="50" value="1" inputmode="numeric"><button type="button" data-q="1" aria-label="More">+</button></div>' +
      '<a class="nb-btn solid big" id="nb-order" href="#order" role="button">' + esc(order.label || 'ORDER A PRINTED COPY') + '</a>' +
      '</div>' +
      '<p class="nb-note" id="nb-order-note" role="status" hidden>' + esc(order.comingSoon || 'Printed copies are coming soon. In the meantime, try the free sampler.') + '</p>' +
      '<div class="nb-row">' +
      '<a class="nb-btn" href="./rules.html">' + (NB.rulesName(g) === 'Rules' ? 'FULL RULES' : esc(NB.rulesName(g).toUpperCase())) + '</a>' +
      '<a class="nb-btn" href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + g.pdf.freeLabel + '</a>' +
      '</div>' +
      (order.shippingNote ? '<p class="nb-fine">' + esc(order.shippingNote) + '</p>' : '') +
      '</div></div></section>' +

      (g.description && g.description.length ? '<section class="nb-block"><div class="nb-wrap nb-card nb-about">' +
        '<h2>' + esc(g.aboutHeading || 'What it is') + '</h2>' +
        g.description.map(p => '<p>' + esc(p) + '</p>').join('') +
        (g.specs && g.specs.length ? '<ul class="nb-specs">' + g.specs.map(s => '<li><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></li>').join('') + '</ul>' : '') +
        '</div></section>' : '') +

      (g.steps && g.steps.length ? '<section class="nb-block"><div class="nb-wrap nb-card">' +
        '<h2>' + esc(g.stepsHeading || 'How it works') + '</h2>' +
        '<ol class="nb-steps">' + g.steps.map(s => '<li><h3>' + esc(s.title) + '</h3><p>' + esc(s.text) + '</p></li>').join('') + '</ol>' +
        '</div></section>' : '') +

      (videos.length ? '<section class="nb-block"><div class="nb-wrap nb-card">' +
        '<h2>' + esc(g.videoHeading || 'See it played') + '</h2>' +
        '<div class="nb-videos">' + videos.map(v => '<div class="nb-video">' + NB.mediaHTML(v, { lazy: true }) + '</div>').join('') + '</div>' +
        '</div></section>' : '') +

      '<section class="nb-block"><div class="nb-wrap nb-card nb-rules-cta">' +
      '<div><h2>' + (NB.rulesName(g) === 'Rules' ? 'The full rules' : esc(NB.rulesName(g))) + '</h2><p>' + esc(g.rulesBlurb || 'Everything you need to play, on one page. The same rules are printed inside the notebook.') + '</p></div>' +
      '<a class="nb-btn solid big" href="./rules.html">' + (NB.rulesName(g) === 'Rules' ? 'READ THE RULES' : esc(NB.rulesName(g).toUpperCase())) + '</a>' +
      '</div></section>' +
      '</main>' + footer(g);

    document.body.insertAdjacentHTML('afterbegin', html);
    document.title = g.title + (g.subtitle ? ' ' + g.subtitle : '') + ' | The Game Bureau';

    // gallery
    const stage = document.getElementById('nb-stage');
    const thumbs = document.getElementById('nb-thumbs');
    let gi = 0;
    const show = i => {
      if (!media.length) return;
      gi = (i + media.length) % media.length;
      stage.innerHTML = NB.mediaHTML(media[gi]) +
        (media.length > 1 ? '<button class="nb-arrow prev" type="button" aria-label="Previous">&#8249;</button><button class="nb-arrow next" type="button" aria-label="Next">&#8250;</button><div class="nb-count">' + (gi + 1) + ' / ' + media.length + '</div>' : '');
      stage.classList.toggle('is-video', isVideo(media[gi]));
      const p = stage.querySelector('.prev'), n = stage.querySelector('.next');
      if (p) p.onclick = () => show(gi - 1);
      if (n) n.onclick = () => show(gi + 1);
      if (thumbs) [...thumbs.children].forEach((t, k) => t.setAttribute('aria-current', k === gi));
    };
    if (thumbs) media.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', m.alt || (isVideo(m) ? 'Video' : 'Photo ' + (i + 1)));
      b.innerHTML = m.type === 'image' || (!m.type && m.src) ? '<img src="' + esc(m.src) + '" alt="" loading="lazy">' : (m.poster ? '<img src="' + esc(m.poster) + '" alt="" loading="lazy">' : '') + '<span class="tplay" aria-hidden="true"></span>';
      if (isVideo(m)) b.classList.add('tvid');
      b.onclick = () => show(i);
      thumbs.appendChild(b);
    });
    let tx = null;
    stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { if (tx === null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 40) show(gi + (d < 0 ? 1 : -1)); tx = null; });
    show(0);

    // quantity, order, share
    const qty = document.getElementById('nb-qty');
    const clamp = v => Math.min(50, Math.max(1, Math.round(+v) || 1));
    document.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { qty.value = clamp(+qty.value + +b.dataset.q); }; });
    qty.onchange = () => { qty.value = clamp(qty.value); };
    if (!/buy\.stripe\.com/.test(order.url || '') && order.url) document.querySelector('.nb-qty').hidden = true;
    document.getElementById('nb-order').onclick = e => {
      e.preventDefault();
      const u = NB.orderURL(g, qty.value);
      if (u) { location.href = u; return; }
      document.getElementById('nb-order-note').hidden = false;
    };
    bindShare(g);
  };

  // ---------- rules page ----------
  NB.renderRules = async function (g) {
    document.body.insertAdjacentHTML('afterbegin',
      header(g, 'rules') +
      '<main class="nb-wrap nb-rules-page">' +
      '<div class="nb-rules-top"><a href="./">&larr; ' + esc(g.title) + '</a><button class="nb-btn" type="button" onclick="print()">PRINT ' + (NB.rulesName(g) === 'Rules' ? 'THE RULES' : esc(NB.rulesName(g).toUpperCase())) + '</button></div>' +
      '<article class="nb-card nb-rules" id="nb-rules"><p>Loading the rules&hellip;</p></article>' +
      '<div class="nb-card nb-rules-cta"><div><h2>Play it on paper</h2><p>The rules are printed inside the notebook, with everything else you need.</p></div><div class="nb-row"><a class="nb-btn solid big" href="./#order">ORDER A COPY</a><a class="nb-btn big" href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + (g.freeFullPdf ? 'PRINT FREE' : 'FREE SAMPLER') + '</a></div></div>' +
      '</main>' + footer(g));
    bindShare(g);
    document.title = g.title + ' ' + (NB.rulesName(g) === 'Rules' ? 'rules' : NB.rulesName(g)) + ' | The Game Bureau';
    const el = document.getElementById('nb-rules');
    try { el.innerHTML = await NB.loadRules(g); } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
  };

  // ---------- boot ----------
  document.addEventListener('DOMContentLoaded', async () => {
    const page = document.body.dataset.page;
    if (!page || !['public', 'rules'].includes(page)) return;
    try {
      const g = await NB.loadGame();
      if (page === 'public') NB.renderPublic(g);
      if (page === 'rules') await NB.renderRules(g);
    } catch (e) {
      document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px">Could not load this game: ' + esc(e.message) + '</p>');
    }
  });
})();
