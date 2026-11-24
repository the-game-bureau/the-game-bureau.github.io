/* Notebook kit: the game editor in the studio (/studio/?game=<folder>). Needs kit.js and gh.js.
 *
 * Everything about one notebook in one place:
 *   Setup        the steps from idea to a live notebook, ticked off as you go
 *   Content      words on the public page, specs, how it works, price and order link, print size
 *   Colors       the colour scheme, with presets
 *   Rules        rules.md (shown on the rules page and printed in the notebook)
 *   Cover        cover.html: front, back and spine
 *   Inside pages contents.html: the pages after the rules
 *   Photos       gallery photos and videos
 *   PDFs         build the cover, contents, print-at-home and sampler PDFs
 * Edits are kept as a draft in this browser and shown live in the preview. "Save and publish"
 * commits them to GitHub in one go; the site republishes and the PDFs rebuild on their own.
 * Folders under studio/ are the template itself and are read-only here.
 */
(function () {
  'use strict';
  const NB = window.NB, GH = window.GH, esc = NB.esc;
  // The game being edited: /studio/?game=<folder> (or a legacy <folder>/admin.html).
  // /studio/ on its own opens the same editor on a NEW notebook: a draft started from a template
  // (studio/starter by default). Its first save creates the folder, then the editor switches to it.
  const ST = window.NBStudio;
  const QS = new URLSearchParams(location.search).get('game') || '';
  const STUDIO_PATH = /^\/studio\/(index\.html|edit\.html)?$/.test(location.pathname);
  const GAME = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(QS) ? QS
    : STUDIO_PATH ? '' : location.pathname.replace(/\/[^/]*$/, '').replace(/^\/+/, '');
  const IS_NEW = !GAME && STUDIO_PATH;
  // Plain /studio/ starts with only Connect and Notebooks open; the other tabs wait until a
  // notebook is chosen there (an existing one, or New notebook, which opens /studio/?new).
  const CHOSEN = !IS_NEW || new URLSearchParams(location.search).has('new');
  const OPEN_TABS = ['connect', 'games'];
  const locked = t => !CHOSEN && !OPEN_TABS.includes(t);
  const NEWKEY = 'nb-draft:/studio/new/';
  const newStart = () => { try { const d = JSON.parse(localStorage.getItem(NEWKEY) || 'null'); if (d && ST.STARTS.some(x => x[0] === d.start)) return d.start; } catch (e) { /* none */ } return ST.STARTS[0][0]; };
  const FOLDER = IS_NEW ? newStart() : GAME; // for a new notebook: the template it previews in
  const BASE = '/' + FOLDER + '/'; // the game's folder on the site
  const DKEY = IS_NEW ? NEWKEY : NB.draftKey('/' + FOLDER + '/');
  // Where the notebook lives (or will live, for a new one).
  const target = () => IS_NEW ? (draft && draft.game.slug) || 'your-game' : FOLDER;
  const FILES = { game: 'game.json', rules: 'rules.md', cover: 'cover.html', contents: 'contents.html' };
  const PRESETS = NB.PRESETS; // in kit.js, shared with the studio
  const TABS = [['connect', 'Connect'], ['games', 'Notebooks'], ['how', 'How it works'], ['checklist', 'Checklist'], ['content', 'Content'], ['colors', 'Colors'], ['rules', 'Rules'], ['cover', 'Cover'], ['contents', 'Inside pages'], ['media', 'Photos & video'], ['pdfs', 'PDFs']];
  const ALIAS = { setup: 'checklist', new: 'content', games: 'games' };
  const tabFromHash = () => { const h = location.hash.slice(1); const t = ALIAS[h] || h; return TABS.some(x => x[0] === t) ? t : ''; };

  let saved = null;   // { game, rules, cover, contents } as last saved (text, except game)
  let draft = null;   // same shape, being edited
  let build = null;   // pdf/build.json
  let tab = 'checklist';
  const pending = (window.NB_PENDING = {}); // images/x.jpg -> data URL, picked but not saved
  const pendingB64 = {};
  const isTemplate = !IS_NEW && /^studio\//.test(FOLDER);
  let allowTemplate = false;
  let legacyAdmin = false; // an old <game>/admin.html that the next save removes

  // ---------- small helpers ----------
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };
  const gameText = g => JSON.stringify(g, null, 2) + '\n';
  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const changed = () => !!saved && (gameText(draft.game) !== gameText(saved.game) || ['rules', 'cover', 'contents'].some(k => draft[k] !== saved[k]) || Object.keys(pending).length > 0);

  function persist() {
    try { localStorage.setItem(DKEY, JSON.stringify({ game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, at: Date.now(), start: IS_NEW ? FOLDER : undefined })); } catch (e) { /* quota or blocked */ }
    updateBar();
    schedulePreview();
  }
  function clearDraft() { try { localStorage.removeItem(DKEY); } catch (e) { /* blocked */ } }

  // ---------- loading ----------
  async function loadSaved() {
    const read = async f => {
      if (GH.token()) { try { return await GH.readText(FOLDER + '/' + f); } catch (e) { /* fall back to the site */ } }
      const r = await fetch(BASE + f + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(f + ' not found (' + r.status + ')');
      return r.text();
    };
    const [game, rules, cover, contents] = await Promise.all([read(FILES.game), read(FILES.rules), read(FILES.cover), read(FILES.contents)]);
    saved = { game: JSON.parse(game), rules, cover, contents };
    if (IS_NEW) { build = null; return; }
    if (GH.token()) { try { await GH.api('/contents/' + FOLDER + '/admin.html?ref=' + GH.BRANCH); legacyAdmin = true; } catch (e) { legacyAdmin = false; } }
    try { const b = await fetch(BASE + 'pdf/build.json?t=' + Date.now(), { cache: 'no-store' }); build = b.ok ? await b.json() : null; } catch (e) { build = null; }
  }
  function loadDraft() {
    draft = clone(saved);
    if (IS_NEW) {
      // A fresh notebook from the template: no name or address yet, and nothing ticked.
      Object.assign(draft.game, { slug: '', title: '', shareText: '', setup: {}, media: [] });
      draft.game.order = Object.assign({}, draft.game.order, { url: '' });
      draft.game.print = Object.assign({}, draft.game.print, { sheets: 72 });
      delete draft.game.favicon;
    }
    try {
      const d = JSON.parse(localStorage.getItem(DKEY) || 'null');
      if (d && d.carry) { Object.assign(draft.game, d.carry); } // kept when switching templates
      else if (d && d.game) { draft = { game: d.game, rules: d.rules, cover: d.cover, contents: d.contents }; draft.at = d.at; }
    } catch (e) { /* none */ }
    draft.game.setup = draft.game.setup || {};
    draft.game.media = draft.game.media || [];
  }

  // ---------- page frame ----------
  function frame() {
    document.body.classList.add('ad-app');
    document.body.innerHTML =
      '<header class="ad-top"><div class="ad-top-in">' +
      '<div class="ad-id"><span class="ad-studio">THE GAME BUREAU - Game Notebook Studio</span><h1 id="ad-title"></h1><span class="ad-folder" id="ad-folder"></span></div>' +
      '<div class="ad-actions"' + (CHOSEN ? '' : ' hidden') + '>' + (IS_NEW ? '' : '<a class="nb-btn" href="' + BASE + '" target="_blank" rel="noopener">VIEW PAGE</a>') +
      '<button class="nb-btn" id="ad-discard" type="button">' + (IS_NEW ? 'START OVER' : 'DISCARD CHANGES') + '</button>' +
      '<button class="nb-btn solid" id="ad-save" type="button">' + (IS_NEW ? 'CREATE NOTEBOOK' : 'SAVE AND PUBLISH') + '</button></div></div>' +
      '<div class="ad-bar" id="ad-bar" role="status"></div></header>' +
      '<div class="ad-shell"><nav class="ad-tabs" id="ad-tabs">' + TABS.map(([k, l]) => '<button type="button" data-tab="' + k + '"' + (locked(k) ? ' disabled title="Choose a notebook in Notebooks first"' : '') + '>' + l + '</button>').join('') +
      '</nav>' +
      '<main class="ad-panel" id="ad-panel"></main>' +
      '<aside class="ad-preview" id="ad-preview"></aside></div>';
    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
    $('#ad-save').onclick = save;
    $('#ad-discard').onclick = () => {
      if (IS_NEW) {
        if (!confirm('Throw away this new notebook and start again from the template?')) return;
        clearDraft(); Object.keys(pending).forEach(k => { delete pending[k]; delete pendingB64[k]; });
        location.reload(); return;
      }
      if (!changed()) return;
      if (!confirm('Throw away the changes you have not saved?')) return;
      clearDraft(); Object.keys(pending).forEach(k => { delete pending[k]; delete pendingB64[k]; });
      draft = clone(saved); show(tab); updateBar();
    };
  }

  function updateBar(msg, kind) {
    if (!CHOSEN) { $('#ad-title').textContent = 'Choose a notebook'; $('#ad-folder').textContent = ''; document.title = 'Notebook Studio'; if (!msg) { $('#ad-bar').className = 'ad-bar'; $('#ad-bar').textContent = ''; } else { $('#ad-bar').className = 'ad-bar show ' + (kind || ''); $('#ad-bar').innerHTML = msg; } return; }
    $('#ad-title').textContent = draft.game.title || (IS_NEW ? 'New notebook' : 'Untitled');
    $('#ad-folder').textContent = IS_NEW ? (draft.game.slug ? '/' + draft.game.slug + '/ (not created yet)' : 'not created yet') : '/' + FOLDER + '/';
    document.title = (draft.game.title || (IS_NEW ? 'New notebook' : 'Notebook')) + ' · Notebook Studio';
    const bar = $('#ad-bar');
    if (msg) { bar.className = 'ad-bar show ' + (kind || ''); bar.innerHTML = msg; return; }
    if (IS_NEW) {
      $('#ad-save').disabled = false; $('#ad-discard').disabled = false;
      bar.className = 'ad-bar'; bar.textContent = '';
      return;
    }
    const dirty = changed();
    $('#ad-save').disabled = !dirty;
    $('#ad-discard').disabled = !dirty;
    if (isTemplate && !allowTemplate) {
      bar.className = 'ad-bar show warn';
      bar.innerHTML = 'This is a template, so it is read-only here. Edits show in the preview but can\'t be saved. <a href="/studio/?new#content">Start a new notebook</a> instead.';
      $('#ad-save').disabled = true;
      return;
    }
    if (dirty) { bar.className = 'ad-bar show dirty'; bar.textContent = 'Unsaved changes' + (draft.at ? ' (kept in this browser since ' + when(new Date(draft.at).toISOString()) + ')' : '') + '. Save and publish when ready.'; }
    else { bar.className = 'ad-bar'; bar.textContent = ''; }
  }

  function show(t) {
    if (locked(t)) t = 'games';
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t));
    if (tabFromHash() !== t) history.replaceState(null, '', location.pathname + location.search + '#' + t);
    const panel = $('#ad-panel');
    panel.innerHTML = '';
    ({ how: ST.how, connect: p => ST.connect(p, () => updateBar()), games: p => ST.games(p, IS_NEW ? '' : FOLDER), checklist: tabSetup, content: tabContent, colors: tabColors, rules: tabRules, cover: tabCover, contents: tabContents, media: tabMedia, pdfs: tabPdfs })[t](panel);
    previewFor(t);
    updateBar();
  }

  // ---------- preview ----------
  let pvMode = {};
  let pvTimer = null;
  function previewFor(t) {
    const pv = $('#ad-preview');
    const opts = {
      how: null, connect: null, checklist: null, games: null, pdfs: null,
      content: [['page', 'Game page'], ['rules', 'Rules page'], ['front', 'Front cover'], ['back', 'Back cover']],
      media: [['page', 'Game page']],
      colors: [['page', 'Game page'], ['front', 'Front cover'], ['contents', 'Inside pages']],
      rules: [['rules', 'Rules page'], ['contents', 'In the notebook']],
      cover: [['spread', 'Spread'], ['front', 'Front'], ['back', 'Back']],
      contents: [['contents', 'With bleed'], ['nobleed', 'No bleed'], ['sampler', 'Sampler']],
    }[t];
    document.querySelector('.ad-shell').classList.toggle('no-preview', !opts);
    if (!opts) { pv.innerHTML = ''; return; }
    const cur = opts.some(o => o[0] === pvMode[t]) ? pvMode[t] : opts[0][0];
    pvMode[t] = cur;
    pv.innerHTML = '<div class="ad-pv-head"><b>Preview</b>' + opts.map(([k, l]) => '<button type="button" data-pv="' + k + '" aria-current="' + (k === cur) + '">' + l + '</button>').join('') +
      '<span class="ad-pv-note">Unsaved changes show here.</span></div><div class="ad-pv-box"><iframe id="ad-pv" title="Preview"></iframe></div>';
    pv.querySelectorAll('[data-pv]').forEach(b => { b.onclick = () => { pvMode[t] = b.dataset.pv; previewFor(t); }; });
    renderPreview();
  }
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 450); }
  function renderPreview() {
    const f = $('#ad-pv');
    if (!f) return;
    const mode = pvMode[tab];
    const doc = (html, query) => html.replace(/<head>/i, '<head><base href="/' + FOLDER + '/"><meta name="nb-query" content="' + query + '"><meta name="nb-draft" content="' + esc(DKEY) + '">');
    const dq = '&draft=' + encodeURIComponent(DKEY);
    const box = f.parentElement;
    box.className = 'ad-pv-box ' + (['page', 'rules'].includes(mode) ? 'web' : 'print');
    if (mode === 'page') { f.removeAttribute('srcdoc'); f.src = BASE + '?preview=1' + dq + '&t=' + Date.now(); }
    else if (mode === 'rules') { f.removeAttribute('srcdoc'); f.src = BASE + 'rules.html?preview=1' + dq + '&t=' + Date.now(); }
    else if (['spread', 'front', 'back'].includes(mode)) f.srcdoc = doc(draft.cover, 'layout=' + mode);
    else if (mode === 'contents') f.srcdoc = doc(draft.contents, 'bleed=1');
    else if (mode === 'nobleed') f.srcdoc = doc(draft.contents, 'bleed=0');
    else if (mode === 'sampler') f.srcdoc = doc(draft.contents, 'bleed=0&sampler=1');
    // Shrink print pages to fit the preview column.
    if (box.classList.contains('print')) f.onload = () => {
      try {
        const d = f.contentDocument;
        // Wait for print.js to lay the pages out, then zoom so the widest sheet fits.
        let tries = 0;
        const fit = () => {
          if (d.body.dataset.ready !== '1' && tries++ < 40) return setTimeout(fit, 150);
          const tb = d.querySelector('.pk-toolbar'); if (tb) tb.remove();
          const w = Math.max(...[...d.querySelectorAll('.pk-cover, .page, .flow')].map(e => e.offsetWidth), 1) + 48;
          d.documentElement.style.zoom = Math.min(1, (box.clientWidth - 4) / w);
        };
        fit();
      } catch (e) { /* not ready */ }
    };
  }

  // ---------- tab: setup ----------
  function steps() {
    const g = draft.game, s = g.setup || {};
    const starterTag = 'One sentence that says what the game is and why it\'s fun.';
    return [
      IS_NEW ? { k: 'folder', t: 'Create the notebook', d: 'Give it a name and web address in Content, then click Create notebook at the top. Until then it is kept in this browser.', tab: 'content', done: false }
        : { k: 'folder', t: 'Create the notebook', d: 'Done. The game page lives at /' + FOLDER + '/.', done: true },
      { k: 'content', t: 'Name it and describe it', d: 'Title, tagline, what it is, specs and the three how-it-works steps.', tab: 'content', done: !!(g.title && g.tagline && g.tagline !== starterTag && g.title !== 'Starter Notebook') },
      { k: 'colors', t: 'Pick the colours', d: 'Four colours run through the page, the cover and the inside pages.', tab: 'colors', manual: true },
      { k: 'rules', t: 'Write the rules', d: 'One page if you can. They appear on the rules page and at the front of the notebook.', tab: 'rules', done: !/First step\.|Say how the game ends/.test(draft.rules) },
      { k: 'contents', t: 'Design the inside pages', d: 'Score sheets and game sheets. Set how many game sheets the notebook holds.', tab: 'contents', manual: true },
      { k: 'cover', t: 'Design the cover', d: 'Front, back and spine. The starter cover fills itself in from your content.', tab: 'cover', manual: true },
      { k: 'sampler', t: 'Choose the free sampler pages', d: 'The sampler is the cover, the rules and the first ' + ((g.print && g.print.samplerPages) || 2) + ' inside pages (set in Content, Print). Or mark pages with data-sampler.', tab: 'content', manual: true },
      { k: 'save', t: 'Save and publish', d: 'Commits your changes. The site republishes in about a minute.', done: !IS_NEW && !changed() && !!saved },
      { k: 'pdfs', t: 'Build and check the PDFs', d: 'They rebuild on their own after each save. Open each one and check it.', tab: 'pdfs', manual: true },
      { k: 'media', t: 'Add photos and a video', d: 'Until you add photos, the page shows pictures of the cover and pages from the PDF build.', tab: 'media', done: (g.media || []).some(m => (m.type === 'image' && m.src) || ((m.type === 'youtube' || m.type === 'vimeo') && m.id) || (m.type === 'video' && m.src)) },
      { k: 'order', t: 'Set up ordering', d: 'Paste a Stripe Payment Link (or any checkout link) and set the price.', tab: 'content', done: !!(g.order && g.order.url) },
      { k: 'proof', t: 'Order a printed proof', d: 'Upload the cover and contents PDFs to your printer (Lulu, Amazon KDP) and order one copy to check.', manual: true },
      { k: 'subdomain', t: 'Give it its own web address', d: 'Make https://' + target().split('/').pop() + '.' + GH.SITE + ' open this game page, using Cloudflare. About 5 minutes, once per game.', manual: true, html: subdomainHow() },
      { k: 'share', t: 'Share it', d: 'Use the Share button on the game page, or copy https://' + GH.SITE + '/' + target() + '/', manual: true },
    ].map(x => Object.assign(x, { done: x.manual ? !!s[x.k] || !!x.done : !!x.done }));
  }
  // The short address: <slug>.thegamebureau.com redirects to the game's folder on the main site.
  function subdomainHow() {
    const SLUG = target().split('/').pop(), SUB = SLUG + '.' + GH.SITE;
    const tgt = 'https://' + GH.SITE + '/' + target();
    const expr = 'concat("' + tgt + '", http.request.uri.path)';
    const code = t => '<code class="ad-copy" title="Click to copy">' + esc(t) + '</code>';
    return '<details class="ad-how"><summary>Show me how</summary><ol>' +
      '<li>Open <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare</a> and pick ' + code(GH.SITE) + '.</li>' +
      '<li><b>DNS, Records, Add record.</b> Type ' + code('AAAA') + ', Name ' + code(SLUG) + ', IPv6 address ' + code('100::') +
        ', Proxy status <b>Proxied</b> (orange cloud). Save. This address only exists so Cloudflare can catch visits and send them on.</li>' +
      '<li><b>Rules, Create rule, Redirect Rule.</b> Rule name ' + code(SLUG + ' short address') + '.</li>' +
      '<li>Under <b>If incoming requests match</b>, choose <b>Custom filter expression</b>: Field ' + code('Hostname') + ', Operator ' + code('equals') + ', Value ' + code(SUB) + '.</li>' +
      '<li>Under <b>Then</b>: Type <b>Dynamic</b>, Expression ' + code(expr) + ', Status code ' + code('301') + ', tick <b>Preserve query string</b>. Deploy.</li>' +
      '<li>Wait a minute, then open <a href="https://' + SUB + '" target="_blank" rel="noopener">https://' + esc(SUB) + '</a>. It should land on ' + esc(tgt) + '/. ' +
        'Pages carry on working too: https://' + esc(SUB) + '/rules.html opens the rules.</li>' +
      '</ol><p>Why a redirect: GitHub Pages serves the whole site on one address, so Cloudflare forwards the short one to this game\'s folder.</p></details>';
  }
  function tabSetup(p) {
    const list = steps();
    const n = list.filter(x => x.done).length;
    p.innerHTML = '<h2>Checklist</h2><h3 class="ad-sub">From idea to live notebook</h3><p class="ad-lede">' + n + ' of ' + list.length + ' steps done. Work down the list; each step opens the tab where it happens.</p>' +
      '<p class="ad-help ad-legend"><span class="ad-tick" aria-hidden="true"></span> ticks itself when the editor sees the step is done. <input type="checkbox" disabled aria-hidden="true"> is yours to tick when you are happy with it.</p>' +
      '<ol class="ad-steps">' + list.map(x => '<li class="' + (x.done ? 'done' : '') + '">' +
        (x.manual ? '<input type="checkbox" data-step="' + x.k + '"' + (x.done ? ' checked' : '') + ' aria-label="Mark done">' : '<span class="ad-tick" aria-hidden="true">' + (x.done ? '&#10003;' : '') + '</span>') +
        '<div><b>' + esc(x.t) + '</b><p>' + esc(x.d) + '</p>' + (x.html || '') + '</div>' +
        (x.tab ? '<button type="button" class="nb-btn" data-go="' + x.tab + '">OPEN</button>' : '') + '</li>').join('') + '</ol>' +
      (IS_NEW ? '<p class="ad-help">Ticks are saved with the notebook when you create it.</p>' : '<p class="ad-help">Ticks are saved with the notebook. Links: <a href="' + BASE + '" target="_blank" rel="noopener">game page</a> · <a href="' + BASE + 'rules.html" target="_blank" rel="noopener">rules page</a> · <a href="/studio/?new#content">new notebook</a>.</p>');
    p.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {}); }; });
    p.querySelectorAll('[data-step]').forEach(c => { c.onchange = () => { draft.game.setup[c.dataset.step] = c.checked; persist(); show('checklist'); }; });
  }

  // ---------- tab: content ----------
  function field(path, label, opts = {}) {
    const v = get(draft.game, path);
    const id = 'f-' + path.replace(/\W/g, '-');
    const input = opts.area
      ? '<textarea id="' + id + '" data-path="' + path + '" rows="' + (opts.rows || 3) + '">' + esc(v == null ? '' : v) + '</textarea>'
      : opts.check ? '<input id="' + id + '" type="checkbox" data-path="' + path + '"' + (v ? ' checked' : '') + '>'
      : '<input id="' + id + '" type="' + (opts.type || 'text') + '" data-path="' + path + '"' + (opts.step ? ' step="' + opts.step + '"' : '') + ' value="' + esc(v == null ? '' : v) + '"' + (opts.ph ? ' placeholder="' + esc(opts.ph) + '"' : '') + '>';
    return '<label class="ad-field' + (opts.check ? ' check' : '') + '" for="' + id + '"><span>' + esc(label) + '</span>' + input + (opts.help ? '<small>' + opts.help + '</small>' : '') + '</label>';
  }
  function bindFields(p) {
    p.querySelectorAll('[data-path]').forEach(el => {
      el.oninput = el.onchange = () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'number') v = el.value === '' ? null : +el.value;
        set(draft.game, el.dataset.path, v);
        persist();
      };
    });
  }
  function rows(key, cols, labels) {
    const list = draft.game[key] || [];
    return '<div class="ad-rows" data-rows="' + key + '">' + list.map((r, i) => '<div class="ad-row">' +
      cols.map((c, j) => '<input data-r="' + i + '" data-c="' + c + '" placeholder="' + esc(labels[j]) + '" value="' + esc(Array.isArray(r) ? r[c] : r[c]) + '">').join('') +
      '<button type="button" class="ad-x" data-del="' + i + '" aria-label="Remove">&times;</button></div>').join('') +
      '<button type="button" class="ad-link" data-add="' + key + '">+ Add</button></div>';
  }
  function bindRows(p, key, blank) {
    const box = p.querySelector('[data-rows="' + key + '"]');
    box.querySelectorAll('input').forEach(el => { el.oninput = () => { draft.game[key][+el.dataset.r][isNaN(el.dataset.c) ? el.dataset.c : +el.dataset.c] = el.value; persist(); }; });
    box.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { draft.game[key].splice(+b.dataset.del, 1); persist(); show(tab); }; });
    box.querySelector('[data-add]').onclick = () => { (draft.game[key] = draft.game[key] || []).push(blank()); persist(); show(tab); };
  }
  // ---------- a new notebook: its web address, template and creation ----------
  let taken = null; // every path in the repo, to check the address is free
  async function loadTaken() { if (taken || !GH.token()) return; try { taken = (await GH.listFiles()).map(f => f.path); } catch (e) { taken = null; } }
  function slugProblem(v) {
    if (!v) return 'Pick a web address: lowercase letters, numbers and dashes.';
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(v)) return 'Use 2 to 40 lowercase letters, numbers and dashes.';
    if (/^(studio|template|mc|game|parlay)$/.test(v) || (taken && taken.some(f => f === v || f.startsWith(v + '/')))) return 'thegamebureau.com/' + v + '/ is already taken.';
    return '';
  }
  function bindNew(p) {
    const inp = p.querySelector('#f-slug'), msg = p.querySelector('#f-slug-msg');
    const check = () => { const bad = slugProblem(inp.value.trim()); msg.textContent = bad || 'The game page will be thegamebureau.com/' + inp.value.trim() + '/'; msg.style.color = bad && inp.value ? '#B42318' : ''; };
    inp.oninput = () => { draft.game.slug = inp.value.trim(); persist(); check(); };
    const title = p.querySelector('[data-path="title"]');
    title.addEventListener('input', () => { if (!draft.game.slugTouched) { draft.game.slug = ST.slugify(title.value); inp.value = draft.game.slug; persist(); check(); } });
    inp.addEventListener('input', () => { draft.game.slugTouched = true; });
    p.querySelectorAll('[name=f-start]').forEach(r => { r.onchange = () => {
      const g = draft.game, keep = {};
      ['title', 'subtitle', 'tagline', 'kicker', 'description', 'specs', 'steps', 'brand', 'price', 'slug', 'slugTouched', 'rulesName', 'setup'].forEach(k => { if (g[k] !== undefined) keep[k] = g[k]; });
      try { localStorage.setItem(NEWKEY, JSON.stringify({ start: r.value, carry: keep })); } catch (e) { /* blocked */ }
      location.reload();
    }; });
    check(); loadTaken().then(check);
  }
  async function createNew() {
    const g = draft.game, slug = (g.slug || '').trim();
    if (!GH.token()) { updateBar('Creating a notebook needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); show('connect'); return; }
    if (!(g.title || '').trim()) { updateBar('Give the notebook a title first.', 'bad'); show('content'); return; }
    taken = null; await loadTaken();
    const bad = slugProblem(slug);
    if (bad) { updateBar(esc(bad), 'bad'); show('content'); return; }
    $('#ad-save').disabled = true;
    try {
      updateBar('Copying the template…');
      const all = await GH.listFiles();
      const src = all.filter(f => f.path.startsWith(FOLDER + '/') && !f.path.startsWith(FOLDER + '/pdf/') && !/\/\.keep$/.test(f.path));
      const out = [];
      const ours = ['game.json', 'index.html', 'rules.html', 'admin.html', 'rules.md', 'cover.html', 'contents.html'];
      const used = JSON.stringify(g) + draft.cover + draft.contents;
      for (const f of src) {
        const rel = f.path.slice(FOLDER.length + 1);
        if (ours.includes(rel)) continue;
        if (/^images\//.test(rel) && !used.includes(rel)) continue; // photos removed in the editor
        if (/\.(md|html|css|js|json|txt|svg)$/.test(rel)) out.push({ path: slug + '/' + rel, text: await GH.readBlobText(f.sha) });
        else out.push({ path: slug + '/' + rel, sha: f.sha }); // images: reuse the same file
      }
      const game = clone(g); delete game.slugTouched; game.slug = slug;
      if (!game.shareText && game.tagline) game.shareText = game.title + ': ' + game.tagline;
      out.push({ path: slug + '/game.json', text: gameText(game) });
      out.push({ path: slug + '/rules.md', text: draft.rules }, { path: slug + '/cover.html', text: draft.cover }, { path: slug + '/contents.html', text: draft.contents });
      Object.entries(GH.shells(slug, game)).forEach(([f, t]) => out.push({ path: slug + '/' + f, text: t }));
      Object.keys(pendingB64).forEach(p => out.push({ path: slug + '/' + p, base64: pendingB64[p] }));
      await GH.commit(out, 'Start the ' + game.title + ' notebook (from ' + FOLDER + ')', m => updateBar(esc(m)));
      Object.keys(pendingB64).forEach(p => { delete pendingB64[p]; });
      clearDraft();
      updateBar('Created. Opening ' + esc(game.title) + '…', 'ok');
      location.replace('/studio/?game=' + encodeURIComponent(slug) + '#checklist');
    } catch (e) {
      updateBar('Not created: ' + esc(e.message), 'bad');
      $('#ad-save').disabled = false;
    }
  }

  function tabContent(p) {
    const g = draft.game;
    g.print = g.print || {}; g.order = g.order || {};
    p.innerHTML = '<h2>Content</h2><p class="ad-lede">Everything on the game page comes from here. The starter cover uses it too.</p>' +
      (IS_NEW ? '<fieldset class="ad-newnb"><legend>New notebook</legend>' +
        '<label class="ad-field" for="f-slug"><span>Web address</span><span class="st-url"><b>thegamebureau.com/</b><input id="f-slug" value="' + esc(g.slug || '') + '" placeholder="pitch-count" autocomplete="off" spellcheck="false"></span><small id="f-slug-msg"></small></label>' +
        '<div class="ad-field"><span>Start from</span><div class="st-starts">' + ST.STARTS.map(x => '<label><input type="radio" name="f-start" value="' + x[0] + '"' + (x[0] === FOLDER ? ' checked' : '') + '><span><b>' + x[1] + '</b><small>' + x[2] + '</small></span></label>').join('') + '</div>' +
        '<small>Switching keeps your Content and colours, and swaps in that template\'s rules, cover and inside pages.</small></div></fieldset>' : '') +
      '<fieldset><legend>The basics</legend>' + field('title', 'Title', IS_NEW ? { ph: 'e.g. Pitch Count' } : {}) + field('subtitle', 'Subtitle', { ph: 'The Notebook' }) +
      field('tagline', 'Tagline', { area: true, rows: 2, help: 'One sentence. Shown under the title and in link previews.' }) +
      field('kicker', 'Small line above the title') + field('announce', 'Announcement strip', { help: 'Optional. A coloured strip under the top bar.' }) +
      field('shareText', 'Share message', { help: 'What the Share button sends with the link.' }) +
      field('rulesName', 'Name for the rules', { ph: 'Rules', help: 'For example How to Play or Field Guide. Shown on the rules buttons, the rules page and its heading. Leave empty for Rules.' }) + '</fieldset>' +
      '<fieldset><legend>What it is</legend>' + field('aboutHeading', 'Heading') +
      '<label class="ad-field"><span>Description</span><textarea id="f-desc" rows="6">' + esc((g.description || []).join('\n\n')) + '</textarea><small>Leave a blank line between paragraphs.</small></label>' +
      '<div class="ad-field"><span>Specs</span>' + rows('specs', [0, 1], ['Label, e.g. PLAYERS', 'Value, e.g. 2 to 6']) + '</div></fieldset>' +
      '<fieldset><legend>How it works</legend>' + field('stepsHeading', 'Heading') + '<div class="ad-field"><span>Steps</span>' + rows('steps', ['title', 'text'], ['Step title', 'What happens']) + '</div></fieldset>' +
      '<fieldset><legend>Price and ordering</legend>' + field('price', 'Price', { ph: '$9.99' }) + field('currency', 'Currency') +
      field('order.url', 'Order link', { ph: 'https://buy.stripe.com/...', help: 'A Stripe Payment Link gets the quantity passed along (turn on "Let customers adjust quantity" in Stripe). Any other link opens as is. Leave empty to show "coming soon".' }) +
      field('order.label', 'Order button text') + field('order.comingSoon', 'Coming-soon note') + field('order.shippingNote', 'Small print under the buttons') +
      field('freeFullPdf', 'Offer the whole notebook free instead of the sampler', { check: true }) + '</fieldset>' +
      '<fieldset><legend>Other headings</legend>' + field('videoHeading', 'Video section heading') + field('rulesBlurb', 'Rules box text', { area: true, rows: 2 }) + '</fieldset>' +
      '<fieldset><legend>Print</legend><div class="ad-grid">' +
      field('print.trim.0', 'Width (in)', { type: 'number', step: '0.01' }) + field('print.trim.1', 'Height (in)', { type: 'number', step: '0.01' }) +
      field('print.sheets', 'Game sheets', { type: 'number', help: 'Fills {{sheets}} in the inside pages.' }) + field('print.samplerPages', 'Sampler pages', { type: 'number', help: 'Inside pages after the rules.' }) +
      field('print.bleed', 'Bleed (in)', { type: 'number', step: '0.001' }) + field('print.margin', 'Safe margin (in)', { type: 'number', step: '0.01' }) +
      field('print.padTo', 'Pad page count to a multiple of', { type: 'number' }) + field('print.spinePerPage', 'Spine per page (in)', { type: 'number', step: '0.000001', help: 'KDP white paper: 0.002252. Lulu: check its calculator.' }) +
      '</div></fieldset>';
    bindFields(p);
    if (IS_NEW) bindNew(p);
    
    $('#f-desc').oninput = e => { draft.game.description = e.target.value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); persist(); };
    bindRows(p, 'specs', () => ['', '']);
    bindRows(p, 'steps', () => ({ title: '', text: '' }));
  }

  // ---------- tab: colors ----------
  function tabColors(p) {
    const b = draft.game.brand = Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, draft.game.brand || {});
    const one = (k, l, h) => '<label class="ad-color"><input type="color" data-color="' + k + '" value="' + esc(b[k]) + '"><span><b>' + l + '</b><small>' + h + '</small><input type="text" data-hex="' + k + '" value="' + esc(b[k]) + '" maxlength="7" spellcheck="false"></span></label>';
    p.innerHTML = '<h2>Colors</h2><p class="ad-lede">Four colours run through the game page, the cover and the inside pages.</p>' +
      '<div class="ad-colors">' + one('color', 'Main', 'Top bar, headings, buttons, cover') + one('accent', 'Accent', 'Highlights, numbers, order button') + one('paper', 'Paper', 'Page background in the notebook') + one('ink', 'Ink', 'Text and lines') + '</div>' +
      '<h3>Presets</h3><div class="ad-presets">' + PRESETS.map((x, i) => '<button type="button" data-preset="' + i + '"><span style="background:' + x[1] + '"></span><span style="background:' + x[2] + '"></span><span style="background:' + x[3] + '"></span><span style="background:' + x[4] + '"></span><b>' + x[0] + '</b></button>').join('') + '</div>' +
      '<p class="ad-help">Check that text is easy to read: the Main colour sits behind white text, and Ink sits on Paper.</p>';
    const setColor = (k, v) => { if (!/^#[0-9a-f]{6}$/i.test(v)) return; b[k] = v.toUpperCase(); p.querySelector('[data-color="' + k + '"]').value = v; p.querySelector('[data-hex="' + k + '"]').value = b[k]; persist(); };
    p.querySelectorAll('[data-color]').forEach(el => { el.oninput = () => setColor(el.dataset.color, el.value); });
    p.querySelectorAll('[data-hex]').forEach(el => { el.oninput = () => setColor(el.dataset.hex, el.value.trim()); });
    p.querySelectorAll('[data-preset]').forEach(el => { el.onclick = () => { const x = PRESETS[+el.dataset.preset]; ['color', 'accent', 'paper', 'ink'].forEach((k, i) => setColor(k, x[i + 1])); }; });
  }

  // ---------- tabs: rules, cover, contents (code editors) ----------
  // ---------- editing a page with an AI ----------
  // What an AI needs to know to edit rules.md, cover.html or contents.html without breaking the print layout.
  const aiFile = key => key === 'rules' ? 'rules.md' : key + '.html';
  function aiBrief(key) {
    const g = draft.game, P = Object.assign({ trim: [8.5, 11], bleed: 0.125, margin: 0.5 }, g.print || {});
    const file = target() + '/' + aiFile(key);
    if (key === 'rules') return [
      'This is ' + file + ', the rules of "' + (g.title || 'a notebook game') + '", a paper notebook game sold on ' + GH.SITE + '.',
      'The same text is the rules page on the website (' + GH.SITE + '/' + target() + '/rules.html) and the first printed pages of the notebook, so write it for someone holding the book and a pencil.',
      'It is Markdown: # for the one title at the top, ## for sections, ### for sub-sections, 1. for numbered steps, - for bullet points, **bold**, *italic*, > for a highlighted tip box, and --- for a line. No HTML, tables or images.',
      'Keep the "# ' + (g.title || 'Title') + ' rules" heading first: the website swaps it for the game\'s rules name. Keep steps short and clear, in the order players do them.',
    ];
    const common = [
      'This is ' + file + ' for "' + (g.title || 'a notebook game') + '", a paper notebook game sold on ' + GH.SITE + '.',
      'It is printed as a book: trim ' + P.trim[0] + ' x ' + P.trim[1] + ' in, bleed ' + P.bleed + ' in on every outside edge, and a safe margin of ' + P.margin + ' in inside the trim for text.',
      'The page loads /studio/kit/print.css and /studio/kit/print.js, which size and lay out the pages. Keep those tags and the <body> attributes as they are. Use inches or points, never px or vw.',
      'Colours: var(--brand) var(--accent) var(--paper) var(--ink). Fonts: "NB Display" (headings) and "NB Text" (body). Keep it printable: no scripts, animations or web fonts from other sites.',
    ];
    const per = key === 'cover' ? [
      'Design inside .cover-front, .cover-back and .cover-spine. print.js places each one on its panel with bleed and pads it to the safe area. The spine is narrow (about ' + (P.spine || 0.03) + ' in for a thin book), so keep it to one short line or leave it empty.',
      'These are filled in from the game\'s details: {{title}} {{subtitle}} {{tagline}} {{kicker}} {{url}} {{price}}, and as HTML blocks {{steps}} {{specs}} {{description}}. Keep them as placeholders rather than typing the text in.',
      'Leave about 2 x 1.2 in clear at the lower right of the back cover for a barcode. Images go in images/ next to the file: <img src="images/name.jpg">.',
    ] : [
      'Keep <section data-rules></section>: the rules flow in there from rules.md.',
      'Each <section class="page"> is exactly one page, already padded to the safe area. Anything that overflows is cut off, so design to fit one page.',
      '<template data-repeat="{{sheets}}"> repeats the pages inside it ({{sheets}} = ' + ((g.print && g.print.sheets) || 'the number of game sheets') + '). Inside it, {{n}} is the copy number. With data-per="2", {{i}} and {{i+1}} number two items per page.',
      'Pages marked data-sampler go in the free sampler. Put page-specific CSS in the <style> block in the <head>.',
    ];
    return common.concat(per);
  }
  let aiOpen = false; // keeps the AI box open after pasting re-draws the tab
  function aiBox(key) {
    const file = target() + '/' + aiFile(key);
    const gh = 'https://github.com/' + GH.REPO + '/blob/' + GH.BRANCH + '/' + file;
    const live = 'https://' + GH.SITE + '/' + (key === 'rules' ? target() + '/rules.html' : file);
    const c = t => '<code class="ad-copy" title="Click to copy">' + esc(t) + '</code>';
    return '<details class="ad-help-box ad-ai"' + (aiOpen ? ' open' : '') + '><summary>Edit this page with an AI</summary>' +
      '<p><b>With a chat AI</b> (Claude, ChatGPT and so on):</p><ol>' +
      '<li>Click <button type="button" class="nb-btn" id="ad-ai-copy">COPY FOR AI</button> and paste into the chat. It copies ' + (key === 'rules' ? 'how the rules are written and used' : 'the page size, the layout rules') + ' and this whole file. Then say what you want, for example ' + (key === 'rules' ? '"make the scoring section easier to follow"' : '"add a page for tracking each player\'s best score"') + '.</li>' +
      '<li>Copy the AI\'s whole answer and click <button type="button" class="nb-btn" id="ad-ai-paste">PASTE AI ANSWER</button>. The editor and preview update. Nothing is saved until you click Save and publish, and <i>Undo all changes to this file</i> puts it back.</li></ol>' +
      '<p id="ad-ai-msg" class="ad-help"></p>' +
      '<p><b>With an AI that can use GitHub</b> (such as Claude Code), point it at the file:</p><ul>' +
      '<li>Repository ' + c(GH.REPO) + ', branch ' + c(GH.BRANCH) + ', file ' + c(file) + ' (<a href="' + gh + '" target="_blank" rel="noopener">open on GitHub</a>).</li>' +
      '<li>Live page to look at: <a href="' + live + '" target="_blank" rel="noopener">' + esc(live) + '</a>.</li>' +
      '<li>Tell it to read ' + c('studio/README.md') + (key === 'rules' ? '' : ' and ' + c('studio/kit/print.css')) + ' first, change only ' + c(file) + ', and commit to ' + c(GH.BRANCH) + '. The PDFs rebuild about 3 minutes after the commit.</li>' +
      '<li>Then reload this page. If it says you have unsaved changes to this file, click <i>Undo all changes to this file</i> to see the AI\'s version.</li></ul></details>';
  }
  function bindAi(key) {
    const ta = $('#ad-code'), msg = $('#ad-ai-msg');
    $('#ad-ai-copy').onclick = () => {
      const lang = key === 'rules' ? 'markdown' : 'html';
      const text = 'Please edit ' + (key === 'rules' ? 'the rules' : 'this page') + ' of my notebook game.\n\n' + aiBrief(key).map(x => '- ' + x).join('\n') +
        '\n\nReply with the complete updated file in one ```' + lang + ' code block, with nothing left out.\n\nWhat I want: [describe your change here]\n\nThe current file:\n```' + lang + '\n' + draft[key] + '\n```\n';
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { msg.textContent = 'Copied. Paste it into your AI chat and replace [describe your change here] with what you want.'; },
        () => { msg.textContent = 'Your browser blocked copying. Select the editor text instead.'; });
    };
    const apply = raw => {
      const m = raw.match(/```(?:html|markdown|md)?[ \t]*\n([\s\S]*?)```/i);
      const code = (m ? m[1] : raw).trim();
      if (key === 'rules' && !/^#\s/m.test(code)) { msg.textContent = 'That doesn\'t look like the whole rules file. Ask the AI for the complete file in one code block.'; return; }
      if (key !== 'rules' && !/<html[\s>]|<!doctype/i.test(code)) { msg.textContent = 'That doesn\'t look like a whole HTML file. Ask the AI for the complete file in one code block.'; return; }
      draft[key] = code + '\n'; persist(); aiOpen = true; show(tab); aiOpen = false;
      const m2 = $('#ad-ai-msg'); if (m2) m2.textContent = 'Pasted. Check the preview, then Save and publish.';
    };
    $('#ad-ai-paste').onclick = async () => {
      let raw = '';
      try { raw = await navigator.clipboard.readText(); } catch (e) { raw = prompt('Paste the AI\'s answer here:') || ''; }
      if (raw) apply(raw);
    };
  }

  function codeTab(p, key, title, lede, help) {
    const ai = true; // every code tab has the "Edit this page with an AI" box
    p.innerHTML = '<h2>' + title + '</h2><p class="ad-lede">' + lede + '</p>' + (ai ? aiBox(key) : '') +
      '<textarea class="ad-code" id="ad-code" spellcheck="' + (key === 'rules') + '" wrap="' + (key === 'rules' ? 'soft' : 'off') + '">' + esc(draft[key]) + '</textarea>' +
      '<div class="ad-code-foot"><button type="button" class="ad-link" id="ad-revert">Undo all changes to this file</button></div>' +
      '<details class="ad-help-box"><summary>How this file works</summary>' + help + '</details>';
    const ta = $('#ad-code');
    ta.oninput = () => { draft[key] = ta.value; persist(); };
    ta.onkeydown = e => { if (e.key === 'Tab' && key !== 'rules') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.oninput(); } };
    if (ai) bindAi(key);
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).catch(() => {}); }; });
    $('#ad-revert').onclick = () => { if (confirm('Put this file back the way it was last saved?')) { draft[key] = saved[key]; persist(); show(tab); } };
  }
  const tabRules = p => codeTab(p, 'rules', 'Rules', 'Written in Markdown. The same text is the rules page and the first pages of the notebook.',
    '<ul><li><code># Title</code>, <code>## Section</code>, <code>### Sub-section</code></li><li><code>1.</code> numbered steps, <code>-</code> bullet points</li><li><code>**bold**</code>, <code>*italic*</code>, <code>[link](https://...)</code></li><li><code>&gt; Tip text</code> makes a highlighted box</li><li><code>---</code> draws a line</li></ul>');
  const tabCover = p => codeTab(p, 'cover', 'Cover', 'HTML and CSS for the front, back and spine. The preview shows the printer\'s spread and each side alone.',
    '<ul><li>Design inside <code>.cover-front</code>, <code>.cover-back</code> and <code>.cover-spine</code>. Each fills its panel to the bleed edge, with padding set so content stays in the safe area.</li><li>Filled in from Content: <code>{{title}}</code> <code>{{subtitle}}</code> <code>{{tagline}}</code> <code>{{kicker}}</code> <code>{{url}}</code> <code>{{price}}</code>, and as blocks <code>{{steps}}</code> <code>{{specs}}</code> <code>{{description}}</code>.</li><li>Colours: <code>var(--brand)</code> <code>var(--accent)</code> <code>var(--paper)</code> <code>var(--ink)</code>. Fonts: <code>"NB Display"</code> and <code>"NB Text"</code>.</li><li>Leave about 2 x 1.2 in clear at the lower right of the back if your printer adds a barcode.</li><li>Images: upload them in Photos &amp; video, then use <code>&lt;img src="images/name.jpg"&gt;</code>.</li></ul>');
  const tabContents = p => codeTab(p, 'contents', 'Inside pages', 'HTML and CSS for every page after the rules: score sheets, game sheets, anything you play on.',
    '<ul><li><code>&lt;section data-rules&gt;</code> is where the rules go. They flow onto as many pages as they need.</li><li>Each <code>&lt;section class="page"&gt;</code> is one page, padded to the safe area.</li><li><code>&lt;template data-repeat="{{sheets}}"&gt;</code> repeats the pages inside it. <code>{{n}}</code> numbers each copy. With <code>data-per="2"</code>, <code>{{i}}</code> and <code>{{i+1}}</code> number two items per page.</li><li>The free sampler keeps the rules and the first pages (Content, Print, Sampler pages), or only pages marked <code>data-sampler</code>.</li><li>Colours and fonts as on the cover.</li></ul>');

  // ---------- tab: photos and video ----------
  // Pictures of the cover and pages from the PDF build, shown while a game has no photos of its own.
  function autoBox() {
    const g = draft.game, prev = (build && build.previews) || [];
    if (!prev.length || g.media.some(x => x.type === 'image' && x.src)) return '';
    const off = g.autoPreviews === false;
    return '<div class="ad-auto' + (off ? ' off' : '') + '"><p><b>' + (off ? 'Hidden: ' : 'Showing now: ') + 'automatic pictures from the PDF build.</b> ' +
      (off ? 'The page shows "Photos coming soon" until you add photos.' : 'The game page shows these until you add photos of your own.') + '</p>' +
      '<div class="ad-auto-row">' + prev.map(src => '<img src="' + esc(BASE + src) + '" alt="">').join('') + '</div>' +
      '<button type="button" class="nb-btn" id="ad-auto">' + (off ? 'SHOW THEM AGAIN' : 'REMOVE THESE FROM THE PAGE') + '</button></div>';
  }
  // The browser-tab icon for the game and rules pages: a .ico file saved as favicon.ico in the game folder.
  function iconBox() {
    const f = draft.game.favicon, file = f ? f.split('?')[0] : '';
    return '<h3 class="ad-icon-h">Browser tab icon</h3><div class="ad-icon">' +
      (f ? '<img src="' + esc(pending[file] || BASE + f) + '" alt="" width="32" height="32"><span><code>' + esc(file) + '</code>' + (pending[file] ? ' (not saved yet)' : '') + '</span>'
         : '<img src="/favicon.ico" alt="" width="32" height="32"><span>Using The Game Bureau icon.</span>') + '</div>' +
      '<div class="nb-row"><label class="nb-btn' + (f ? '' : ' solid') + ' ad-file-in">' + (f ? 'REPLACE .ICO FILE' : 'UPLOAD .ICO FILE') + '<input type="file" id="ad-ico" accept=".ico,image/x-icon,image/vnd.microsoft.icon" hidden></label>' +
      (f ? '<button type="button" class="ad-rm" id="ad-ico-rm">REMOVE</button>' : '') + '</div>' +
      '<p class="ad-help">The little picture in the browser tab for the game and rules pages. Upload a <code>.ico</code> file (up to 200 KB). It is saved as <code>favicon.ico</code> in the game folder when you save.</p>';
  }
  function tabMedia(p) {
    const m = draft.game.media;
    const thumb = x => x.type === 'image' ? '<img src="' + esc(pending[x.src] || (/^(https?:|\/)/.test(x.src || '') ? x.src : BASE + x.src)) + '" alt="">' : '<span class="ad-vid">' + (x.type === 'youtube' ? 'YouTube' : x.type === 'vimeo' ? 'Vimeo' : 'Video') + (x.id || x.src ? '' : '<br>coming soon') + '</span>';
    p.innerHTML = '<h2>Photos &amp; video</h2><p class="ad-lede">The gallery at the top of the game page, in this order. Videos also get their own section.' +
      (build && build.previews ? ' With no photos, the page shows pictures of the cover and pages from the last PDF build.' : '') + '</p>' +
      '<div class="ad-media">' + (m.length ? m.map((x, i) => '<div class="ad-mitem">' + thumb(x) + '<div><input data-alt="' + i + '" value="' + esc(x.alt || '') + '" placeholder="Describe it (for screen readers)">' +
        (x.type === 'youtube' || x.type === 'vimeo' ? '<input data-vid="' + i + '" value="' + esc(x.id || '') + '" placeholder="' + (x.type === 'youtube' ? 'YouTube' : 'Vimeo') + ' link or ID">' : '') +
        '<small>' + esc(x.src || '') + (pending[x.src] ? ' (not saved yet)' : '') + '</small></div>' +
        '<div class="ad-mbtns"><button type="button" data-up="' + i + '" aria-label="Move up">&uarr;</button><button type="button" data-down="' + i + '" aria-label="Move down">&darr;</button><button type="button" class="ad-rm" data-rm="' + i + '" title="Remove from the page">REMOVE</button></div></div>').join('')
        : '<p class="ad-empty">No photos or videos yet.</p>') + '</div>' + autoBox() +
      '<div class="nb-row"><label class="nb-btn solid ad-file-in">ADD PHOTOS<input type="file" id="ad-up" accept="image/*" multiple hidden></label>' +
      '<button type="button" class="nb-btn" id="ad-yt">ADD YOUTUBE VIDEO</button><button type="button" class="nb-btn" id="ad-vm">ADD VIMEO VIDEO</button>' +
      '<button type="button" class="nb-btn" id="ad-soon">ADD "VIDEO COMING SOON"</button></div>' +
      '<p class="ad-help">Photos are resized to 1600 px and saved as JPEG in <code>images/</code> when you save. Until then they stay in this tab only, so save before leaving the page. The first photo is also the picture in link previews.</p>' + iconBox();
    const parseVid = (type, v) => { v = v.trim(); const yt = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/); const vm = v.match(/vimeo\.com\/(?:video\/)?(\d+)/); return type === 'youtube' ? (yt ? yt[1] : v) : (vm ? vm[1] : v); };
    p.querySelectorAll('[data-alt]').forEach(el => { el.oninput = () => { m[+el.dataset.alt].alt = el.value; persist(); }; });
    p.querySelectorAll('[data-vid]').forEach(el => { el.onchange = () => { const x = m[+el.dataset.vid]; x.id = parseVid(x.type, el.value); el.value = x.id; persist(); show('media'); }; });
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= m.length) return; [m[i], m[j]] = [m[j], m[i]]; persist(); show('media'); };
    p.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => move(+b.dataset.up, -1); });
    p.querySelectorAll('[data-down]').forEach(b => { b.onclick = () => move(+b.dataset.down, 1); });
    p.querySelectorAll('[data-rm]').forEach(b => { b.onclick = () => { const [x] = m.splice(+b.dataset.rm, 1); if (x && pending[x.src]) { delete pending[x.src]; delete pendingB64[x.src]; } persist(); show('media'); }; });
    if ($('#ad-auto')) $('#ad-auto').onclick = () => { if (draft.game.autoPreviews === false) delete draft.game.autoPreviews; else draft.game.autoPreviews = false; persist(); show('media'); };
    $('#ad-yt').onclick = () => { m.push({ type: 'youtube', id: '', alt: 'Video' }); persist(); show('media'); };
    $('#ad-vm').onclick = () => { m.push({ type: 'vimeo', id: '', alt: 'Video' }); persist(); show('media'); };
    $('#ad-soon').onclick = () => { m.push({ type: 'youtube', id: '', alt: 'Video coming soon' }); persist(); show('media'); };
    $('#ad-ico').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      if (!/\.ico$/i.test(file.name)) { updateBar(esc(file.name) + ' is not a .ico file.', 'bad'); return; }
      if (file.size > 200 * 1024) { updateBar(esc(file.name) + ' is over 200 KB. Browser tab icons are usually under 50 KB.', 'bad'); return; }
      const r = new FileReader();
      r.onload = () => {
        const dataURL = 'data:image/x-icon;base64,' + String(r.result).split(',')[1];
        pending['favicon.ico'] = dataURL; pendingB64['favicon.ico'] = dataURL.split(',')[1];
        draft.game.favicon = 'favicon.ico?v=' + Date.now().toString(36); // the version makes browsers fetch a replaced icon
        persist(); show('media');
      };
      r.onerror = () => updateBar('Could not read ' + esc(file.name) + '.', 'bad');
      r.readAsDataURL(file);
    };
    if ($('#ad-ico-rm')) $('#ad-ico-rm').onclick = () => { delete draft.game.favicon; delete pending['favicon.ico']; delete pendingB64['favicon.ico']; persist(); show('media'); };
    $('#ad-up').onchange = async e => {
      for (const file of e.target.files) {
        try {
          const dataURL = await resize(file, 1600);
          let name = file.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photo';
          let path = 'images/' + name + '.jpg', k = 2;
          while (pending[path] || m.some(x => x.src === path)) path = 'images/' + name + '-' + (k++) + '.jpg';
          pending[path] = dataURL; pendingB64[path] = dataURL.split(',')[1];
          m.push({ type: 'image', src: path, alt: '' });
        } catch (err) { updateBar('Could not read ' + esc(file.name) + ': ' + esc(err.message), 'bad'); }
      }
      persist(); show('media');
    };
  }
  function resize(file, max) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const z = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * z); c.height = Math.round(img.height * z);
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => rej(new Error('not an image this browser can open'));
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- tab: PDFs ----------
  function tabPdfs(p) {
    if (IS_NEW) { p.innerHTML = '<h2>PDFs</h2><p class="ad-lede">The cover, contents, print-at-home and free sampler PDFs build on GitHub about 3 minutes after you create the notebook, and again after each save.</p><p class="ad-help">Until then, the Cover and Inside pages tabs preview exactly what will print.</p>'; return; }
    const g = draft.game, slug = g.slug;
    const pdf = n => 'pdf/' + slug + n + '.pdf';
    const files = [
      ['Cover', 'Front and back cover for the printer: one wraparound spread (back, spine, front) with bleed. The spine width follows the page count.', pdf('-cover'), b => (2 * b.trim[0] + b.spine + 2 * b.bleed).toFixed(3) + ' x ' + (b.trim[1] + 2 * b.bleed).toFixed(3) + ' in, spine ' + b.spine + ' in'],
      ['Contents', 'Every inside page for the printer, rules first, with bleed.', pdf('-contents'), b => b.pages.contents + ' pages at ' + (b.trim[0] + 2 * b.bleed) + ' x ' + (b.trim[1] + 2 * b.bleed) + ' in' + (b.pages.blanksAdded ? ' (' + b.pages.blanksAdded + ' blank added)' : '')],
      ['Print-at-home notebook', 'The whole notebook at trim size: front cover, rules, contents, back cover.' + (g.freeFullPdf ? ' Offered free on the game page.' : ''), pdf(''), b => b.pages.printAtHome + ' pages'],
      ['Free sampler', 'Front cover, rules, the sampler pages and back cover.' + (g.freeFullPdf ? '' : ' The free download on the game page.'), pdf('-sampler'), b => b.pages.sampler + ' pages'],
    ];
    p.innerHTML = '<h2>PDFs</h2><p class="ad-lede">Built on GitHub from the saved cover, inside pages and rules. They rebuild on their own about 3 minutes after each save.</p>' +
      '<div class="ad-card ad-build"><div class="nb-row"><button class="nb-btn solid big" id="ad-go" type="button">' + (GH.token() ? 'BUILD PDFS NOW' : 'BUILD PDFS ON GITHUB') + '</button><span class="ad-last">' + (build ? 'Last built ' + when(build.built) : 'Not built yet') + '</span></div>' +
      (changed() ? '<p class="ad-warn">You have unsaved changes. Builds use the saved version, so save first.</p>' : '') + '<div class="ad-status" id="ad-status" hidden></div></div>' +
      '<div class="ad-files">' + files.map(([n, a, f, info]) => '<div class="ad-file"><div><h3>' + n + '</h3><p>' + esc(a) + '</p>' + (build ? '<small>' + esc(info(build)) + '</small>' : '') + '</div>' +
        '<div class="ad-file-btns"><a class="nb-btn solid" href="' + BASE + f + '" target="_blank" rel="noopener">OPEN</a><a class="nb-btn" href="' + BASE + f + '" download>DOWNLOAD</a></div></div>').join('') + '</div>' +
      '<details class="ad-help-box"><summary>Save from this browser instead</summary><p>Chrome works best. In the print dialog choose Save as PDF, margins None, background graphics on. Page sizes are set for you; the spine width and the merged print-at-home and sampler files come only from the build.</p><p>' +
      '<a href="' + BASE + 'cover.html?layout=spread&autoprint" target="_blank" rel="noopener">Cover</a> · <a href="' + BASE + 'contents.html?autoprint" target="_blank" rel="noopener">Contents</a> · <a href="' + BASE + 'contents.html?bleed=0&sampler=1&autoprint" target="_blank" rel="noopener">Sampler pages</a></p></details>';
    $('#ad-go').onclick = runBuild;
  }
  async function runBuild() {
    const st = $('#ad-status');
    const say = (h, k) => { st.hidden = false; st.className = 'ad-status ' + (k || ''); st.innerHTML = h; };
    if (!GH.token()) { window.open(GH.ACTIONS_URL, '_blank', 'noopener'); say('Opened the workflow on GitHub. Click <b>Run workflow</b>, enter <code>' + esc(FOLDER) + '</code>, and click <b>Run workflow</b> again.'); return; }
    const go = $('#ad-go'); go.disabled = true;
    const before = build && build.built, t0 = Date.now();
    try {
      say('Starting the build…');
      await GH.dispatchBuild(FOLDER);
      let run = null;
      for (let i = 0; i < 24 && !run; i++) {
        await sleep(5000);
        const list = await GH.runs(GH.WORKFLOW, '&event=workflow_dispatch');
        run = (list.workflow_runs || []).find(x => new Date(x.created_at).getTime() > t0 - 60000 && (x.display_title || '').includes(FOLDER));
      }
      if (!run) throw new Error('The build started but has not shown up yet. <a href="' + GH.ACTIONS_URL + '" target="_blank" rel="noopener">Check it on GitHub</a>.');
      while (run.status !== 'completed') {
        say('Building (' + esc(run.status.replace('_', ' ')) + ', ' + Math.round((Date.now() - t0) / 1000) + 's). <a href="' + esc(run.html_url) + '" target="_blank" rel="noopener">Progress on GitHub</a>.');
        await sleep(6000);
        run = await GH.api('/actions/runs/' + run.id);
      }
      if (run.conclusion !== 'success') throw new Error('The build ' + esc(run.conclusion) + '. The old PDFs are still in place. <a href="' + esc(run.html_url) + '" target="_blank" rel="noopener">See what went wrong</a>.');
      say('Built. Publishing to the site…');
      const ok = await GH.waitForSite(BASE + 'pdf/build.json', t => { try { return JSON.parse(t).built !== before; } catch (e) { return false; } }, null, 40);
      await loadSaved().catch(() => {});
      if (tab === 'pdfs') show('pdfs');
      updateBar(ok ? 'New PDFs are live.' : 'Built. The site has not republished yet; reload in a minute.', 'ok');
    } catch (e) { say(e.message, 'bad'); }
    finally { if ($('#ad-go')) $('#ad-go').disabled = false; }
  }

  // ---------- save and publish ----------
  async function save() {
    if (IS_NEW) return createNew();
    if (!changed()) return;
    if (isTemplate && !allowTemplate) return;
    if (!GH.token()) { updateBar('Saving needs the one-time setup first: <a href="/studio/#connect">Connect in the Notebook Studio</a>, or paste the GitHub token on the left.', 'bad'); return; }
    const g = draft.game;
    if (!g.title) { updateBar('Give the notebook a title first.', 'bad'); show('content'); return; }
    $('#ad-save').disabled = true;
    if (g.favicon && !pendingB64['favicon.ico'] && !saved.game.favicon) delete g.favicon; // picked before a reload, so the file is gone
    const files = [];
    const add = (f, text) => files.push({ path: FOLDER + '/' + f, text });
    add('game.json', gameText(g));
    if (draft.rules !== saved.rules) add('rules.md', draft.rules);
    if (draft.cover !== saved.cover) add('cover.html', draft.cover);
    if (draft.contents !== saved.contents) add('contents.html', draft.contents);
    Object.entries(GH.shells(FOLDER, g)).forEach(([f, t]) => add(f, t));
    if (legacyAdmin) files.push({ path: FOLDER + '/admin.html', delete: true }); // games are edited in the studio now
    Object.keys(pendingB64).forEach(p => files.push({ path: FOLDER + '/' + p, base64: pendingB64[p] }));
    // Photos removed in the editor: delete their files too, unless something still uses them.
    const used = JSON.stringify(g) + draft.cover + draft.contents;
    (saved.game.media || []).filter(x => x && x.type === 'image' && /^images\/[\w.-]+$/.test(x.src || '') && !used.includes(x.src))
      .forEach(x => files.push({ path: FOLDER + '/' + x.src, delete: true }));
    if (saved.game.favicon && !g.favicon) files.push({ path: FOLDER + '/favicon.ico', delete: true });
    try {
      const commit = await GH.commit(files, 'Update ' + g.title + ' notebook from the studio', s => updateBar(esc(s)));
      legacyAdmin = false;
      saved = clone({ game: g, rules: draft.rules, cover: draft.cover, contents: draft.contents });
      draft = clone(saved);
      Object.keys(pendingB64).forEach(p => { delete pendingB64[p]; });
      clearDraft();
      updateBar('Saved (<a href="https://github.com/' + GH.REPO + '/commit/' + commit.sha + '" target="_blank" rel="noopener">commit</a>). The site republishes in about a minute and the PDFs rebuild in about 3.', 'ok');
      // Keep showing just-uploaded photos until the site serves them.
      setTimeout(() => { Object.keys(pending).forEach(p => delete pending[p]); }, 180000);
      if (tab === 'checklist' || tab === 'pdfs') show(tab);
      setTimeout(() => updateBar(), 15000);
    } catch (e) {
      updateBar('Not saved: ' + esc(e.message), 'bad');
      $('#ad-save').disabled = false;
    }
  }

  addEventListener('beforeunload', e => { if (Object.keys(pendingB64).length) { e.preventDefault(); e.returnValue = ''; } });

  document.addEventListener('DOMContentLoaded', async () => {
    if (document.body.dataset.page !== 'admin') return;
    if (!FOLDER) { location.replace('/studio/'); return; }
    if (!GH) { document.body.innerHTML = '<p style="padding:24px">The editor needs /studio/kit/gh.js.</p>'; return; }
    // Old <game>/admin.html links move to the studio.
    if (!IS_NEW && !/^\/studio\/(index\.html)?$/.test(location.pathname)) { location.replace('/studio/?game=' + encodeURIComponent(FOLDER) + location.hash); return; }
    document.body.innerHTML = '<p style="padding:24px">Loading…</p>';
    try {
      await loadSaved();
      loadDraft();
      const g = saved.game;
      document.title = !CHOSEN ? 'Notebook Studio' : (IS_NEW ? 'New notebook' : g.title) + ' · Notebook Studio';
      NB.applyBrand(Object.assign({ brand: {} }, g, { brand: Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, g.brand || {}) }));
      frame();
      show(tabFromHash() || (!GH.token() ? 'connect' : !CHOSEN ? 'games' : IS_NEW ? 'content' : 'checklist'));
      addEventListener('hashchange', () => { const t = tabFromHash(); if (t && t !== tab) show(t); });
      if (isTemplate) {
        const box = document.createElement('label'); box.className = 'ad-help ad-tpl';
        box.innerHTML = '<input type="checkbox" id="ad-tpl"> Let me save changes to the template itself';
        $('#ad-tabs').append(box);
        $('#ad-tpl').onchange = e => { allowTemplate = e.target.checked; updateBar(); };
      }
    } catch (e) {
      document.body.innerHTML = '<p style="padding:24px">Could not load this notebook: ' + esc(e.message) + '</p>';
    }
  });
})();
