/* Notebook kit: shared code for every notebook game on thegamebureau.com.
 *
 * Each game folder (e.g. /chess/) holds a game.json with its words, prices,
 * photos and print settings. The game's pages are thin shells that load this file
 * and say which page they are with <body data-page="...">:
 *   public   index.html     photos and videos, explanation, order, share, rules link
 *   rules    rules.html     the full rules, rendered from rules.md
 *   editor   /studio/?game=<folder> edits the game and builds its PDFs (see admin.js)
 * The printable pages (cover.html, contents.html) use print.js instead.
 */
(function () {
  'use strict';

  const NB = (window.NB = window.NB || {});

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  NB.esc = esc;
  // Colour schemes offered in the studio and the editor: name, brand, accent, paper, ink.
  // Brand and ink are dark enough for white or paper text; accent is the bright highlight.
  NB.PRESETS = [
    ['Navy and gold', '#1F3A5F', '#E0A526', '#FFFBF2', '#16181A'],
    ['Field green', '#2D5016', '#FFD400', '#FFFDF5', '#101510'],
    ['Brick', '#8C2F1B', '#F2B134', '#FFF8EE', '#1C1412'],
    ['Teal', '#0F5C63', '#F28C38', '#F7FBFA', '#10201F'],
    ['Plum', '#5B2A6E', '#F5C542', '#FFFAF3', '#1D1420'],
    ['Charcoal', '#2B2E33', '#E94F37', '#FAFAF7', '#121314'],
    ['Royal', '#283593', '#00BFA6', '#F8F9FF', '#14162B'],
    ['Pink', '#B0306A', '#FFD166', '#FFF8FA', '#21121A'],
    ['Midnight', '#14213D', '#FCA311', '#FAF7F0', '#0E1424'],
    ['Forest', '#1E4D3A', '#E9C46A', '#F9F7EE', '#0F1F18'],
    ['Crimson', '#9B111E', '#F4D35E', '#FFF9F0', '#1F0E10'],
    ['Ocean', '#035E7B', '#FF6B6B', '#F4FAFB', '#0B1E26'],
    ['Espresso', '#4A2C1D', '#D9A441', '#FBF6EE', '#1B120D'],
    ['Slate', '#3D4F5C', '#7FD1AE', '#F7F9F9', '#151C21'],
    ['Grape', '#3F1D5A', '#FF9F1C', '#FCF8FF', '#170D21'],
    ['Olive', '#4B5320', '#E76F51', '#FBFAF2', '#191B0C'],
    // NHL team colours.
    ['Bruins', '#111111', '#FFB81C', '#FFFBF0', '#111111'],
    ['Canadiens', '#192168', '#E03A3E', '#FFFFFF', '#10142E'],
    ['Oilers', '#041E42', '#FF4C00', '#FAF8F5', '#041E42'],
    ['Kraken', '#001628', '#99D9D9', '#F5FBFB', '#001628'],
    ['Flyers', '#1A1A1A', '#F74902', '#FFFAF5', '#111111'],
    ['Avalanche', '#6F263D', '#6CACE4', '#FBF8F9', '#22101A'],
    ['Wild', '#154734', '#A6192E', '#F8F3E6', '#0E2219'],
    ['Golden Knights', '#333F48', '#B4975A', '#FAF8F3', '#151A1E'],
  ];

  // ---------- drafts (live preview from the admin page) ----------
  // The admin page keeps unsaved edits in localStorage under this folder's key. A page opened
  // with ?preview (or written into a preview frame) shows the draft instead of the saved files.
  NB.folder = () => new URL('./', document.baseURI).pathname;
  NB.draftKey = folder => 'nb-draft:' + (folder || NB.folder());
  NB.isPreview = () => location.protocol === 'about:' || new URLSearchParams(location.search).has('preview');
  // The editor can name the draft to show: ?draft=<key> on a page, or <meta name="nb-draft"> in a frame.
  // (A new notebook's draft is kept under its own key while it previews in the template's folder.)
  NB.previewKey = () => {
    const q = new URLSearchParams(location.search).get('draft'), m = document.querySelector('meta[name="nb-draft"]');
    return /^nb-draft:/.test(q || '') ? q : m && /^nb-draft:/.test(m.content) ? m.content : NB.draftKey();
  };
  NB.draft = function () {
    if (!NB.isPreview()) return null;
    // Inside the studio's preview, read the editor's current state directly (always up to date).
    try { const p = window.parent; if (p !== window && p.NB_LIVE && p.NB_LIVE_KEY === NB.previewKey()) { const d = p.NB_LIVE(); if (d) return JSON.parse(JSON.stringify(d)); } } catch (e) { /* other origin */ }
    try { return JSON.parse(localStorage.getItem(NB.previewKey()) || 'null'); } catch (e) { return null; }
  };

  NB.loadGame = async function () {
    const d = NB.draft();
    let g;
    if (d && d.game) {
      g = JSON.parse(JSON.stringify(d.game));
      // Photos picked on the admin page but not saved yet live in the admin window.
      try { const pend = window.parent !== window && window.parent.NB_PENDING; if (pend) { (g.media || []).forEach(m => { if (m && pend[m.src]) m.src = pend[m.src]; }); if (pend[g.coverImage]) g.coverImage = pend[g.coverImage]; } } catch (e) { /* other origin */ }
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
  // The announcement strip shows only between announceFrom and announceUntil (YYYY-MM-DD,
  // both days included, in the visitor's own time zone). An empty date means no limit.
  NB.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  NB.announceOn = (g, day) => {
    if (!g || !String(g.announce || '').trim()) return false;
    day = day || NB.today();
    return !(g.announceFrom && day < g.announceFrom) && !(g.announceUntil && day > g.announceUntil);
  };
  NB.rulesName = g => ((g && g.rulesName) || '').trim() || 'Rules';
  // With a custom name, the starter heading "# <Title> rules" becomes "# <Title>: <name>".
  // {{title}} in rules.md is the game's title, so the heading follows the name.
  const nameRules = (text, g) => {
    if (!g) return text;
    if (NB.rulesName(g) !== 'Rules') {
      const hs = ['# ' + g.title + ' rules', '# {{title}} rules'].map(h => h.toLowerCase());
      text = text.replace(/^\s*# .*$/m, line => hs.includes(line.trim().toLowerCase()) ? '# ' + g.title + ': ' + NB.rulesName(g) : line);
    }
    return text.replace(/\{\{title\}\}/g, g.title || '');
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
  // A photo's focus spot ([x, y] in percent, set in the studio): where to keep it when it is cropped.
  // A new notebook starts with these stand-in photos and video (Kevin's). They are marked placeholder:true:
  // never used for the cover picture or link previews, and the studio warns until they are replaced.
  NB.PLACEHOLDER_MEDIA = [
    { type: 'image', src: '/studio/assets/placeholder-game-notebook.webp', alt: 'Placeholder game notebook', placeholder: true },
    { type: 'image', src: '/studio/assets/placeholder-open.webp', alt: 'Placeholder open', placeholder: true },
    { type: 'image', src: '/studio/assets/placeholder-with-pencil.webp', alt: 'Placeholder with pencil', placeholder: true },
    { type: 'video', src: '/studio/assets/notebook-open.mp4', alt: 'Placeholder video', placeholder: true }
  ];
  // What in game.json can change the printed notebook. Fields only the web page uses are left out,
  // and of the photos only the cover picture counts. The same list is in .github/workflows/notebook-pdfs.yml.
  NB.WEB_ONLY = ['order', 'announce', 'announceFrom', 'announceUntil', 'shareText', 'layout', 'setup', 'autoPreviews', 'favicon', 'videoHeading', 'slugTouched'];
  NB.printKey = g => {
    const o = Object.assign({}, g); NB.WEB_ONLY.forEach(k => delete o[k]);
    const m = NB.coverPhoto(g); o.media = m ? [m.src, m.focus || null] : null; delete o.coverImage;
    const st = v => Array.isArray(v) ? '[' + v.map(st).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + st(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v);
    return st(o);
  };
  // A photo of the game itself (not a placeholder), for the cover picture and link previews.
  NB.realPhoto = m => !!(m && (m.type === 'image' || !m.type) && m.src && !m.placeholder);
  // The photo on the notebook cover: game.json coverImage picks one ('' means none, so the squares
  // show). Without coverImage, as before, the first photo.
  NB.coverPhoto = g => { const ph = (g.media || []).filter(NB.realPhoto); return g.coverImage === undefined ? ph[0] || null : ph.find(x => x.src === g.coverImage) || null; };
  NB.focusStyle = m => m && Array.isArray(m.focus) && m.focus.length === 2 ? ' style="object-position:' + (+m.focus[0]) + '% ' + (+m.focus[1]) + '%"' : '';
  NB.mediaHTML = function (m, opts = {}) {
    if (m.type === 'youtube' && m.id) return '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(m.id) + '" title="' + esc(m.alt || 'Video') + '" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>';
    if (m.type === 'vimeo' && m.id) return '<iframe src="https://player.vimeo.com/video/' + encodeURIComponent(m.id) + '" title="' + esc(m.alt || 'Video') + '" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
    if (m.type === 'video' && m.src) return '<video src="' + esc(m.src) + '"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : '') + ' controls playsinline preload="metadata"></video>';
    if (m.type === 'image' || (!m.type && m.src)) return '<img src="' + esc(m.src) + '" alt="' + esc(m.alt || '') + '"' + NB.focusStyle(m) + (opts.lazy ? ' loading="lazy"' : '') + '>';
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
    // Every notebook page links back to The Game Bureau's home page, next to the game's name.
    '<a class="nb-tgb" href="/">The Game Bureau</a>' +
    '<nav>' +
    (here !== 'rules' && g.layout !== 'product' ? '<a href="./rules.html">' + esc(NB.rulesName(g).toUpperCase()) + '</a>' : '') +
    '<a class="solid" href="./#order">ORDER</a>' +
    '<button type="button" class="nb-share" id="nb-share" aria-label="Share">' +
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7c0 .3 0 .5.1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4A3 3 0 1 0 18 16z"/></svg>' +
    '<span>SHARE</span></button>' +
    '</nav></div></header>';
  // The Share button in the top bar shares the game page, from any page.
  const bindShare = g => { const b = document.getElementById('nb-share'); if (b) b.onclick = e => NB.share(g, e.currentTarget); };
  const footer = g =>
    '<footer class="nb-foot"><div class="nb-wrap">' +
    '<nav><a href="./">' + esc(g.title.toUpperCase()) + '</a>' + (g.layout === 'product' ? '' : '<a href="./rules.html">' + esc(NB.rulesName(g).toUpperCase()) + '</a>') + '<a href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + (g.freeFullPdf ? 'PRINT FREE' : 'FREE SAMPLER') + '</a><a href="./#order">ORDER</a></nav>' +
    '<a href="/">THEGAMEBUREAU.COM</a></div></footer>';

  // ---------- lightbox ----------
  // Something that can open full screen: a photo, or a video with a source.
  const lbOK = m => !!m && (((m.type === 'image' || !m.type) && m.src) || (m.type === 'video' && m.src) || ((m.type === 'youtube' || m.type === 'vimeo') && m.id));
  // In the product gallery a video shows as a still with a play button, so a click opens it in the lightbox.
  const cover = m => {
    if (!isVideo(m) || !lbOK(m)) return NB.mediaHTML(m);
    const still = m.poster ? '<img src="' + esc(m.poster) + '" alt="' + esc(m.alt || 'Video') + '">'
      : m.type === 'youtube' ? '<img src="https://i.ytimg.com/vi/' + encodeURIComponent(m.id) + '/hqdefault.jpg" alt="' + esc(m.alt || 'Video') + '">'
      : m.type === 'video' ? '<video src="' + esc(m.src) + '#t=0.1" muted playsinline preload="metadata" aria-label="' + esc(m.alt || 'Video') + '"></video>'
      : '<div class="media-soon"></div>';
    return '<div class="nb-vcover">' + still + '<span class="nb-bigplay" aria-hidden="true"><span class="tplay"></span></span></div>';
  };
  NB.lightbox = function (items, start) {
    const list = items.filter(lbOK);
    if (!list.length) return;
    let i = Math.max(0, list.indexOf(items[start]));
    const back = document.activeElement;
    const lb = document.createElement('div');
    lb.className = 'nb-lb'; lb.id = 'nb-lb';
    lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photos and videos');
    const many = list.length > 1;
    lb.innerHTML = '<div class="nb-lb-media"></div>' +
      '<button class="nb-lb-x" type="button" aria-label="Close">&times;</button>' +
      (many ? '<button class="nb-lb-arrow prev" type="button" aria-label="Previous">&#8249;</button><button class="nb-lb-arrow next" type="button" aria-label="Next">&#8250;</button><div class="nb-lb-count"></div>' : '');
    const box = lb.querySelector('.nb-lb-media');
    const go = k => {
      i = (k + list.length) % list.length;
      const m = list[i];
      box.innerHTML = NB.mediaHTML(m);
      box.className = 'nb-lb-media' + (isVideo(m) ? ' is-video' : '');
      const v = box.querySelector('video'); if (v) { v.autoplay = true; v.play().catch(() => {}); }
      const f = box.querySelector('iframe'); if (f) f.src += (f.src.includes('?') ? '&' : '?') + 'autoplay=1';
      if (many) lb.querySelector('.nb-lb-count').textContent = (i + 1) + ' / ' + list.length;
    };
    const close = () => { lb.remove(); document.removeEventListener('keydown', key); document.documentElement.classList.remove('nb-lb-open'); if (back && back.focus) back.focus(); };
    const key = e => {
      if (e.key === 'Escape') close();
      else if (many && e.key === 'ArrowLeft') go(i - 1);
      else if (many && e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'Tab') { const b = [...lb.querySelectorAll('button')]; const at = b.indexOf(document.activeElement); e.preventDefault(); b[(at + (e.shiftKey ? -1 : 1) + b.length) % b.length].focus(); }
    };
    lb.addEventListener('click', e => {
      if (e.target.closest('.nb-lb-x')) close();
      else if (e.target.closest('.prev')) go(i - 1);
      else if (e.target.closest('.next')) go(i + 1);
      else if (e.target === lb || e.target === box) close(); // the dark area around the picture
    });
    let tx = null;
    lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', e => { if (tx === null || !many) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) go(i + (d < 0 ? 1 : -1)); tx = null; });
    document.addEventListener('keydown', key);
    document.documentElement.classList.add('nb-lb-open');
    document.body.appendChild(lb);
    go(i);
    lb.querySelector('.nb-lb-x').focus();
  };

  // ---------- public page ----------
  NB.renderPublic = function (g) {
    let media = (g.media || []).filter(m => m && (m.type !== 'image' || m.src));
    if (g.autoPreviews !== false && !media.some(m => m.type === 'image' || (!m.type && m.src)) && g.build && g.build.previews) {
      media = g.build.previews.map((src, i) => ({ type: 'image', src, alt: i ? 'A page from the notebook' : 'The front cover' })).concat(media);
    }
    if (!media.length) media = [{ type: 'soon', alt: 'Photos coming soon' }];
    const videos = media.filter(isVideo);
    const order = g.order || {};
    // layout "product" (new notebooks): a shop-style page. The story and the specs sit beside the
    // gallery, under the order button, and any photo or video opens full screen in a lightbox.
    const prod = g.layout === 'product';
    const about = () => (g.description || []).map(p => '<p>' + esc(p) + '</p>').join('') +
      (g.specs && g.specs.length ? '<ul class="nb-specs">' + g.specs.map(s => '<li><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></li>').join('') + '</ul>' : '');
    const html =
      header(g, 'public') +
      (NB.announceOn(g) ? '<div class="nb-announce">' + esc(g.announce) + '</div>' : '') +
      '<main>' +
      '<section class="nb-hero' + (prod ? ' is-product' : '') + '" id="order"><div class="nb-wrap">' +
      '<div class="nb-gallery" aria-label="Photos and videos">' +
      '<div class="nb-stage" id="nb-stage"></div>' +
      (media.length > 1 ? '<div class="nb-thumbs" id="nb-thumbs"></div>' : '') +
      '</div>' +
      '<div class="nb-info">' +
      '<div class="nb-kick">' + esc(g.kicker || 'The Game Bureau presents') + '</div>' +
      '<h1>' + esc(g.title) + (g.subtitle ? '<span>' + esc(g.subtitle) + '</span>' : '') + '</h1>' +
      (g.tagline && !prod ? '<p class="nb-tag">' + esc(g.tagline) + '</p>' : '') +
      (g.price ? '<div class="nb-price"><b>' + esc(g.price) + '</b><span>' + esc(g.currency || 'USD') + '</span></div>' : '') +
      (NB.orderURL(g, 1) ? '<div class="nb-buy">' +
      '<div class="nb-qty"><label for="nb-qty">QTY</label><button type="button" data-q="-1" aria-label="Fewer">&minus;</button><input id="nb-qty" type="number" min="1" max="50" value="1" inputmode="numeric"><button type="button" data-q="1" aria-label="More">+</button></div>' +
      '<a class="nb-btn solid big" id="nb-order" href="#order" role="button">' + esc(order.label || 'ORDER A PRINTED COPY') + '</a>' +
      '</div>' : '') +
      (prod ? '<div class="nb-free"><a class="nb-btn" href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + g.pdf.freeLabel + '</a>' + '</div>' : '') +
      (prod && order.shippingNote ? '<p class="nb-fine nb-ship">' + esc(order.shippingNote) + '</p>' : '') +
      (prod && g.tagline ? '<p class="nb-tag"><b>' + esc(g.tagline) + '</b></p>' : '') +
      (prod && (g.description && g.description.length || g.specs && g.specs.length) ? '<div class="nb-about">' + about() + '</div>' : '') +
      (prod ? '' : '<div class="nb-row">' +
      '<a class="nb-btn" href="./rules.html">' + (NB.rulesName(g) === 'Rules' ? 'FULL RULES' : esc(NB.rulesName(g).toUpperCase())) + '</a>' +
      '<a class="nb-btn" href="./' + esc(g.pdf.free) + '" target="_blank" rel="noopener">' + g.pdf.freeLabel + '</a>' +
      '</div>') +
      (order.shippingNote && !prod ? '<p class="nb-fine">' + esc(order.shippingNote) + '</p>' : '') +
      '</div></div></section>' +

      (!prod && g.description && g.description.length ? '<section class="nb-block"><div class="nb-wrap nb-card nb-about">' +
        '<h2>' + esc(g.aboutHeading || 'What it is') + '</h2>' + about() +
        '</div></section>' : '') +

      (g.steps && g.steps.length ? '<section class="nb-block"><div class="nb-wrap nb-card">' +
        '<h2>' + esc(g.stepsHeading || 'How it works') + '</h2>' +
        '<ol class="nb-steps">' + g.steps.map(s => '<li><h3>' + esc(s.title) + '</h3><p>' + esc(s.text) + '</p></li>').join('') + '</ol>' +
        '</div></section>' : '') +

      (videos.length && !prod ? '<section class="nb-block"><div class="nb-wrap nb-card">' +
        '<h2>' + esc(g.videoHeading || 'See it played') + '</h2>' +
        '<div class="nb-videos">' + videos.map(v => '<div class="nb-video">' + NB.mediaHTML(v, { lazy: true }) + '</div>').join('') + '</div>' +
        '</div></section>' : '') +

      // The product page leaves the rules out: they are printed in the notebook.
      (prod ? '' : '<section class="nb-block"><div class="nb-wrap nb-card nb-rules-cta">' +
      '<div><h2>' + (NB.rulesName(g) === 'Rules' ? 'The full rules' : esc(NB.rulesName(g))) + '</h2><p>' + esc(g.rulesBlurb || 'Everything you need to play, on one page. The same rules are printed inside the notebook.') + '</p></div>' +
      '<a class="nb-btn solid big" href="./rules.html">' + (NB.rulesName(g) === 'Rules' ? 'READ THE RULES' : esc(NB.rulesName(g).toUpperCase())) + '</a>' +
      '</div></section>') +
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
      stage.innerHTML = (prod ? cover(media[gi]) : NB.mediaHTML(media[gi])) +
        (media.length > 1 ? '<button class="nb-arrow prev" type="button" aria-label="Previous">&#8249;</button><button class="nb-arrow next" type="button" aria-label="Next">&#8250;</button><div class="nb-count">' + (gi + 1) + ' / ' + media.length + '</div>' : '');
      stage.classList.toggle('is-video', isVideo(media[gi]) && !prod);
      stage.classList.toggle('can-zoom', prod && lbOK(media[gi]));
      const p = stage.querySelector('.prev'), n = stage.querySelector('.next');
      if (p) p.onclick = () => show(gi - 1);
      if (n) n.onclick = () => show(gi + 1);
      if (thumbs) [...thumbs.children].forEach((t, k) => t.setAttribute('aria-current', k === gi));
    };
    if (thumbs) media.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', m.alt || (isVideo(m) ? 'Video' : 'Photo ' + (i + 1)));
      b.innerHTML = m.type === 'image' || (!m.type && m.src) ? '<img src="' + esc(m.src) + '" alt=""' + NB.focusStyle(m) + ' loading="lazy">' : (m.poster ? '<img src="' + esc(m.poster) + '" alt="" loading="lazy">' : '') + '<span class="tplay" aria-hidden="true"></span>';
      if (isVideo(m)) b.classList.add('tvid');
      b.onclick = () => show(i);
      thumbs.appendChild(b);
    });
    if (prod) stage.addEventListener('click', e => { if (!e.target.closest('.nb-arrow') && lbOK(media[gi])) NB.lightbox(media, gi); });
    let tx = null;
    stage.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => { if (tx === null) return; const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 40) show(gi + (d < 0 ? 1 : -1)); tx = null; });
    show(0);

    // quantity, order, share
    const qty = document.getElementById('nb-qty');
    if (qty) {
      const clamp = v => Math.min(50, Math.max(1, Math.round(+v) || 1));
      document.querySelectorAll('[data-q]').forEach(b => { b.onclick = () => { qty.value = clamp(+qty.value + +b.dataset.q); }; });
      qty.onchange = () => { qty.value = clamp(qty.value); };
      if (!/buy\.stripe\.com/.test(order.url || '') && order.url) document.querySelector('.nb-qty').hidden = true;
      document.getElementById('nb-order').onclick = e => {
        e.preventDefault();
        const u = NB.orderURL(g, qty.value);
        if (u) location.href = u;
      };
    }
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
