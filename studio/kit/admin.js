/* Notebook kit: the game editor in the studio (/studio/?game=<folder>). Needs kit.js and gh.js.
 *
 * Everything about one notebook in one place:
 *   Checklist    the steps from idea to a live notebook, ticked off as you go
 *   Content      words on the public page, specs, how it works, price and order link, print size
 *   Colors       the colour scheme, with presets
 *   Rules        rules.md (shown on the rules page and printed in the notebook)
 *   Cover        cover.html: front, back and spine
 *   Inside pages contents.html: the pages after the rules
 *   Photos       gallery photos and videos
 *   PDFs         build the cover, contents, print-at-home and sampler PDFs
 * Edits are kept as a draft in this browser and shown live in the preview. The title bar's
 * SAVE stores them on GitHub (the studio-drafts branch, not deployed) so any browser can carry on;
 * PUBLISH commits them to main in one go, and the site republishes and the PDFs rebuild.
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
  const OPEN_TABS = ['welcome', 'connect', 'games', 'ideas'];
  const locked = t => !CHOSEN && !OPEN_TABS.includes(t);
  const NEWKEY = 'nb-draft:/studio/new/';
  const newStart = () => { try { const d = JSON.parse(localStorage.getItem(NEWKEY) || 'null'); if (d && typeof d.start === 'string' && /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(d.start)) return d.start; } catch (e) { /* none */ } return ST.STARTER; };
  // A new notebook starts from the blank starter or a copy of an existing notebook.
  const FOLDER = IS_NEW ? newStart() : GAME; // for a new notebook: the template it previews in
  const BASE = '/' + FOLDER + '/'; // the game's folder on the site
  const DKEY = IS_NEW ? NEWKEY : NB.draftKey('/' + FOLDER + '/');
  // Where the notebook lives (or will live, for a new one).
  const target = () => IS_NEW ? (draft && draft.game.slug) || 'your-game' : FOLDER;
  const FILES = { game: 'game.json', rules: 'rules.md', cover: 'cover.html', contents: 'contents.html' };
  const PRESETS = NB.PRESETS; // in kit.js, shared with the studio
  const TABS = [['welcome', 'Welcome'], ['connect', 'Connect'], ['games', 'Notebooks'], ['ideas', 'Ideas'], ['checklist', 'Checklist'], ['content', 'Content'], ['colors', 'Colors'], ['rules', 'Rules'], ['cover', 'Cover'], ['contents', 'Inside pages'], ['media', 'Photos & video'], ['pdfs', 'PDFs'], ['history', 'History']];
  const ALIAS = { setup: 'checklist', new: 'content', games: 'games' };
  const tabFromHash = () => { const h = location.hash.slice(1); const t = ALIAS[h] || h; return TABS.some(x => x[0] === t) ? t : ''; };

  let saved = null;   // { game, rules, cover, contents } as last saved (text, except game)
  let draft = null;   // same shape, being edited
  let build = null;   // pdf/build.json
  let tab = 'checklist';
  const pending = (window.NB_PENDING = {}); // images/x.jpg -> data URL, picked but not saved
  // Previews read the editor's current state straight from here (kit.js NB.draft), not from storage.
  window.NB_LIVE_KEY = DKEY;
  window.NB_LIVE = () => draft && { game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents };
  // The kit version this page loaded, so previews never run an older cached kit.
  const KITV = ((document.currentScript && document.currentScript.src.match(/[?&]v=([\w.-]+)/)) || [])[1] || String(Date.now());
  const pendingB64 = {};
  const isTemplate = !IS_NEW && /^studio\//.test(FOLDER);
  let allowTemplate = false;
  // The copy saved on GitHub with SAVE (studio-drafts branch, never deployed; see gh.js).
  let serverKey = '';  // its address: the folder, or the new notebook's slug
  let serverAt = 0;    // when it was saved
  let serverSig = '';  // what it held, to tell whether there is anything new to save
  let serverTitle = ''; // its title, shown in the header once saved
  const OPEN = new URLSearchParams(location.search).get('open') || ''; // /studio/?new&open=<slug>: a saved new notebook
  let legacyAdmin = false;
  let freshSig = ''; // a new notebook straight from its template, before any edit // an old <game>/admin.html that the next save removes

  // ---------- small helpers ----------
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[last] = v; };
  const gameText = g => JSON.stringify(g, null, 2) + '\n';
  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sig = () => JSON.stringify([draft.game, draft.rules, draft.cover, draft.contents, Object.keys(pendingB64).sort()]);
  const unsaved = () => IS_NEW ? sig() !== serverSig : (serverSig ? sig() !== serverSig : changed());
  const changed = () => !!saved && (gameText(draft.game) !== gameText(saved.game) || ['rules', 'cover', 'contents'].some(k => draft[k] !== saved[k]) || Object.keys(pendingB64).length > 0);

  function persist() {
    try { localStorage.setItem(DKEY, JSON.stringify({ game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, at: Date.now(), start: IS_NEW ? FOLDER : undefined, savedKey: serverKey || undefined, base: serverAt || undefined })); } catch (e) { /* quota or blocked */ }
    if (!$('#ad-bar')) return; // still loading
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
      delete draft.game.favicon; delete draft.game.slugTouched;
      freshSig = sig();
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
      '<div class="ad-id"><span class="ad-studio">THE GAME BUREAU - Game Notebook Studio</span><h1 id="ad-title" hidden></h1></div>' +
      '<div class="ad-actions"' + (CHOSEN ? '' : ' hidden') + '><a class="ad-pdfst" id="ad-pdfst" href="#pdfs" hidden></a>' + (IS_NEW ? '' : '<a class="nb-btn" href="' + BASE + '" target="_blank" rel="noopener">VIEW PAGE</a>') +
      '<button class="nb-btn ad-discard" id="ad-discard" type="button" title="Throw away changes" hidden>DISCARD</button>' +
      '<button class="nb-btn" id="ad-savedraft" type="button" title="Keep it on GitHub so any browser can open it. Not on the site yet.">SAVE</button>' +
      '<button class="nb-btn solid" id="ad-publish" type="button" title="Put it live on thegamebureau.com">PUBLISH</button></div></div>' +
      '<div class="ad-bar" id="ad-bar" role="status"></div><div class="ad-keywarn" id="ad-keywarn" hidden></div></header>' +
      '<div class="ad-shell"><nav class="ad-tabs" id="ad-tabs">' + TABS.map(([k, l]) => '<button type="button" data-tab="' + k + '"' + (locked(k) ? ' disabled title="Choose a notebook in Notebooks first"' : '') + '>' + l + '</button>').join('') +
      '</nav>' +
      '<main class="ad-panel" id="ad-panel"></main>' +
      '<aside class="ad-preview" id="ad-preview"></aside></div>';
    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
    $('#ad-savedraft').onclick = () => saveDraft();
    $('#ad-publish').onclick = () => save();
    $('#ad-discard').onclick = askDiscard;
    keyWarn();
    document.addEventListener('nb-key-rejected', () => setTimeout(keyWarn, 0));
  }

  function updateBar(msg, kind) {
    if (!CHOSEN) { document.title = 'Notebook Studio'; if (!msg) { $('#ad-bar').className = 'ad-bar'; $('#ad-bar').textContent = ''; } else { $('#ad-bar').className = 'ad-bar show ' + (kind || ''); $('#ad-bar').innerHTML = msg; } return; }
    // Header: the studio name, then the notebook's name as last saved or published ("New" until a new one is saved).
    const t = $('#ad-title'); t.textContent = serverTitle || (IS_NEW ? 'New' : (saved.game.title || FOLDER)); t.hidden = false;
    refreshButtons();
    document.title = (draft.game.title || (IS_NEW ? 'New notebook' : 'Notebook')) + ' · Notebook Studio';
    const bar = $('#ad-bar');
    if (msg) { bar.className = 'ad-bar show ' + (kind || ''); bar.innerHTML = msg; return; }
    if (IS_NEW) { bar.className = 'ad-bar'; bar.textContent = ''; return; }
    if (isTemplate && !allowTemplate) {
      bar.className = 'ad-bar show warn';
      bar.innerHTML = 'This is a template, so it is read-only here. Edits show in the preview but can\'t be saved. <a href="/studio/?new#content">Start a new notebook</a> instead.';
      return;
    }
    if (unsaved()) { bar.className = 'ad-bar show dirty'; bar.innerHTML = 'Changes kept in this browser only. Click SAVE or PUBLISH at the top.'; }
    else if (changed()) { bar.className = 'ad-bar show dirty'; bar.innerHTML = 'Saved, not live yet. Click PUBLISH to put the changes on the site.'; }
    else { bar.className = 'ad-bar'; bar.textContent = ''; }
  }

  // The GitHub key: a strip under the title bar when it has expired or expires within 14 days.
  function keyWarn() {
    const el = $('#ad-keywarn'); if (!el) return;
    const n = GH.token() ? GH.daysLeft() : null;
    const when = GH.expires() ? new Date(GH.expires() + 'T12:00').toLocaleDateString([], { dateStyle: 'long' }) : '';
    let msg = '';
    if (GH.token() && GH.rejected) msg = 'GitHub no longer accepts this browser\'s key, so SAVE and PUBLISH won\'t work. It has probably expired.';
    else if (n != null && n < 0) msg = 'The GitHub key for this browser expired on ' + esc(when) + ', so SAVE and PUBLISH won\'t work.';
    else if (n != null && n <= 14) msg = 'The GitHub key for this browser expires ' + (n === 0 ? 'today' : 'on ' + esc(when) + ', in ' + n + ' day' + (n === 1 ? '' : 's')) + '.';
    el.hidden = !msg;
    el.innerHTML = msg ? msg + ' <a href="#connect">Set up a new key in Connect</a>.' : '';
  }

  // A message that clears itself after ms, unless another message has replaced it by then.
  function flash(msg, kind, ms = 4000) {
    updateBar(msg, kind);
    const html = $('#ad-bar').innerHTML;
    setTimeout(() => { if ($('#ad-bar').innerHTML === html) updateBar(); }, ms);
  }

  function show(t, keepBar) {
    if (locked(t)) t = 'games';
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t));
    if (tabFromHash() !== t) history.replaceState(null, '', location.pathname + location.search + '#' + t);
    const panel = $('#ad-panel');
    panel.innerHTML = '';
    ({ welcome: tabWelcome, connect: p => ST.connect(p, () => { updateBar(); keyWarn(); }), games: p => ST.games(p, IS_NEW ? '' : FOLDER), ideas: tabIdeas, checklist: tabSetup, content: tabContent, colors: tabColors, rules: tabRules, cover: tabCover, contents: tabContents, media: tabMedia, pdfs: tabPdfs, history: tabHistory })[t](panel);
    previewFor(t);
    if (!keepBar) updateBar();
  }

  // ---------- preview ----------
  let pvMode = {};
  let pvTimer = null;
  function previewFor(t) {
    const pv = $('#ad-preview');
    const opts = {
      welcome: null, connect: null, checklist: null, games: null, ideas: null, pdfs: null, content: null, history: null,
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
      (MANUAL_PV.includes(t) ? '<button type="button" class="nb-btn ad-pv-regen" id="ad-pv-regen">REGENERATE</button><span class="ad-pv-note">Shows your latest edits when you click REGENERATE.</span>'
        : '<span class="ad-pv-note">Unsaved changes show here.</span>') + '</div><div class="ad-pv-box"><iframe id="ad-pv" title="Preview"></iframe></div>';
    pv.querySelectorAll('[data-pv]').forEach(b => { b.onclick = () => { pvMode[t] = b.dataset.pv; previewFor(t); }; });
    if ($('#ad-pv-regen')) $('#ad-pv-regen').onclick = renderPreview;
    renderPreview();
  }
  // Rules, Cover and Inside pages redraw only when you click REGENERATE; the others follow every edit.
  const MANUAL_PV = ['rules', 'cover', 'contents'];
  // A print or web page from the draft, for a preview frame. Kit files load at this kit's version.
  const pvDoc = (html, query) => html
    .replace(/(["'])(\/studio\/kit\/[\w.-]+\.(?:js|css))(\?[^"']*)?\1/g, (m, q, u) => q + u + '?v=' + KITV + q)
    .replace(/<head>/i, '<head><base href="/' + FOLDER + '/"><meta name="nb-query" content="' + query + '"><meta name="nb-draft" content="' + esc(DKEY) + '">') + '<!-- ' + Date.now() + ' -->'; // a new value each time, so the frame always reloads
  function schedulePreview() { if (MANUAL_PV.includes(tab)) return; clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, 450); }
  function renderPreview() {
    const f = $('#ad-pv');
    if (!f) return;
    const mode = pvMode[tab];
    const doc = pvDoc;
    const box = f.parentElement;
    box.className = 'ad-pv-box ' + (['page', 'rules'].includes(mode) ? 'web' : 'print');
    const shells = GH.shells(FOLDER, draft.game);
    if (mode === 'page') f.srcdoc = doc(shells['index.html'], '');
    else if (mode === 'rules') f.srcdoc = doc(shells['rules.html'], '');
    else if (mode === 'spread') f.srcdoc = doc(draft.cover, 'layout=spread&spine=' + spineInfo().spine);
    else if (['front', 'back'].includes(mode)) f.srcdoc = doc(draft.cover, 'layout=' + mode);
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
      IS_NEW ? { k: 'folder', t: 'Create the notebook', d: 'Give it a name and web address in Content. SAVE at the top keeps it on GitHub for any browser; PUBLISH creates it on the site.', tab: 'content', done: false }
        : { k: 'folder', t: 'Create the notebook', d: 'Done. The game page lives at /' + FOLDER + '/.', done: true },
      { k: 'content', t: 'Name it and describe it', d: 'Title, tagline, what it is, specs and the three how-it-works steps.', tab: 'content', done: !!(g.title && g.tagline && g.tagline !== starterTag && g.title !== 'Starter Notebook') },
      { k: 'colors', t: 'Pick the colours', d: 'Four colours run through the page, the cover and the inside pages.', tab: 'colors', manual: true, auto: starter && JSON.stringify(g.brand || {}) !== JSON.stringify(starter.brand || {}) },
      { k: 'rules', t: 'Write the rules', d: 'One page if you can. They appear on the rules page and at the front of the notebook.', tab: 'rules', done: !/First step\.|Say how the game ends/.test(draft.rules) },
      { k: 'contents', t: 'Design the inside pages', d: 'Score sheets and game sheets. Set how many game sheets the notebook holds.', tab: 'contents', manual: true, auto: starter && squash(draft.contents) !== squash(starter.contents) },
      { k: 'cover', t: 'Design the cover', d: 'Front, back and spine. The starter cover fills itself in from your content.', tab: 'cover', manual: true, auto: starter && squash(draft.cover) !== squash(starter.cover) },
      { k: 'sampler', t: 'Choose the free sampler pages', d: 'The sampler is the cover, the rules and the first ' + ((g.print && g.print.samplerPages) || 2) + ' inside pages (set in Content, Print). Or mark pages with data-sampler.', tab: 'content', manual: true },
      { k: 'save', t: 'Publish', d: 'Click PUBLISH at the top. The site republishes in about a minute.', done: !IS_NEW && !changed() && !!saved },
      { k: 'pdfs', t: 'Build and check the PDFs', d: 'They rebuild on their own after each publish. Open each one and check it.', tab: 'pdfs', manual: true, auto: !IS_NEW && !!(build && build.built && lastPublish && new Date(build.built) >= new Date(lastPublish)) },
      { k: 'media', t: 'Add photos and a video', d: 'Until you add photos, the page shows pictures of the cover and pages from the PDF build.', tab: 'media', done: (g.media || []).some(m => (m.type === 'image' && m.src) || ((m.type === 'youtube' || m.type === 'vimeo') && m.id) || (m.type === 'video' && m.src)) },
      { k: 'order', t: 'Set up ordering', d: 'Paste a Stripe Payment Link (or any checkout link) and set the price.', tab: 'content', done: !!(g.order && g.order.url) },
      { k: 'proof', t: 'Order a printed proof', d: 'Upload the cover and contents PDFs to your printer (Lulu, Amazon KDP) and order one copy to check.', manual: true },
      { k: 'subdomain', t: 'Give it its own web address', d: 'Make https://' + target().split('/').pop() + '.' + GH.SITE + ' open this game page, using Cloudflare. About 5 minutes, once per game.', manual: true, html: subdomainHow() },
      { k: 'share', t: 'Share it', d: 'Use the Share button on the game page, or copy https://' + GH.SITE + '/' + target() + '/', manual: true },
    ].map(x => Object.assign(x, {
      // A step ticked or unticked by hand keeps that; otherwise it ticks itself when the editor sees it done.
      byEditor: x.manual && s[x.k] === undefined && !!x.auto,
      done: x.manual ? (s[x.k] !== undefined ? !!s[x.k] : !!x.auto || !!x.done) : !!x.done,
    }));
  }
  // What a notebook looks like straight from the blank starter, and when it was last published,
  // so the checklist can tell what has been done.
  let starter = null, lastPublish = '';
  const squash = t => String(t || '').replace(/\s+/g, ' ').trim();
  async function loadChecklistFacts() {
    const get = f => fetch('/' + ST.STARTER + '/' + f + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(new Error(f)));
    try { const [g, cover, contents] = await Promise.all([get('game.json'), get('cover.html'), get('contents.html')]); starter = { brand: JSON.parse(g).brand, cover, contents }; } catch (e) { starter = null; }
    if (!IS_NEW) { try { const c = ((await GH.history(FOLDER)) || []).find(x => !/^Rebuild notebook PDFs/.test(x.commit.message)); lastPublish = c ? c.commit.author.date : ''; } catch (e) { lastPublish = ''; } }
    if (tab === 'checklist') show('checklist', true);
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
    p.innerHTML = '<h2>Checklist</h2><p class="ad-lede">' + n + ' of ' + list.length + ' steps done.</p>' +
      '<ol class="ad-steps">' + list.map(x => {
        // Every step gets a circle. Hovering it says who ticks it: you, the editor, or both.
        const kind = x.manual ? ('auto' in x ? 'Manual and automatic' : 'Manual') : 'Automatic';
        const mark = x.done ? '&#10003;' : '';
        return '<li class="' + (x.done ? 'done' : '') + '">' +
        (x.manual ? '<button type="button" class="ad-tick manual" data-step="' + x.k + '" data-kind="' + kind + '" aria-pressed="' + x.done + '" aria-label="' + esc(x.t) + ': ' + kind.toLowerCase() + ', click to ' + (x.done ? 'untick' : 'tick') + '">' + mark + '</button>'
          : '<span class="ad-tick" tabindex="0" data-kind="' + kind + '" role="img" aria-label="' + (x.done ? 'Done' : 'Not done') + ', automatic">' + mark + '</span>') +
        '<div><b>' + esc(x.t) + '</b>' + (x.byEditor ? ' <small class="ad-autotick">ticked for you</small>' : '') + '<p>' + esc(x.d) + '</p>' + (x.html || '') + '</div>' +
        (x.tab ? '<button type="button" class="nb-btn" data-go="' + x.tab + '">OPEN</button>' : '') + '</li>';
      }).join('') + '</ol>' +
      (IS_NEW ? '<p class="ad-help">Ticks are saved with the notebook when you save or publish it.</p>' : '<p class="ad-help">Ticks are saved with the notebook. Links: <a href="' + BASE + '" target="_blank" rel="noopener">game page</a> · <a href="' + BASE + 'rules.html" target="_blank" rel="noopener">rules page</a> · <a href="/studio/?new#content">new notebook</a>.</p>');
    p.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {}); }; });
    p.querySelectorAll('[data-step]').forEach(c => { c.onclick = () => { draft.game.setup[c.dataset.step] = c.getAttribute('aria-pressed') !== 'true'; persist(); show('checklist'); }; });
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
  // A new notebook may never land on anything already in the repository: a game, any other
  // folder or file of the site, or another notebook saved but not yet published.
  let taken = null;       // every path in the repo (lowercased)
  let takenDrafts = null; // addresses of saved, unpublished notebooks
  async function loadTaken() {
    if (taken || !GH.token()) return !!taken;
    try {
      const [files, drafts] = await Promise.all([GH.listFiles(), GH.listDraftKeys()]);
      taken = files.map(f => f.path.toLowerCase()); takenDrafts = drafts;
      return true;
    } catch (e) { taken = null; takenDrafts = null; return false; }
  }
  // Re-reads the repository so the check is current, and fails closed if it can't.
  async function freshSlugProblem(v) {
    taken = null; takenDrafts = null;
    if (!(await loadTaken())) return 'Could not check that thegamebureau.com/' + v + '/ is free, so nothing was written. Try again in a moment.';
    return slugProblem(v);
  }
  function slugProblem(v) {
    if (!v) return 'Pick a web address: lowercase letters, numbers and dashes.';
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(v)) return 'Use 2 to 40 lowercase letters, numbers and dashes.';
    const lv = v.toLowerCase();
    if (/^(studio|template|mc|game|parlay|drafts)$/.test(lv) || (taken && taken.some(f => f === lv || f.startsWith(lv + '/')))) return 'thegamebureau.com/' + v + '/ already exists on the site. Pick another address.';
    if (takenDrafts && takenDrafts.includes(lv) && lv !== serverKey) return 'Another saved notebook already uses thegamebureau.com/' + v + '/. Pick another address.';
    return '';
  }
  function bindNew(p) {
    const inp = p.querySelector('#f-slug'), msg = p.querySelector('#f-slug-msg');
    const check = () => { const bad = slugProblem(inp.value.trim()); msg.textContent = bad || 'The game page will be thegamebureau.com/' + inp.value.trim() + '/'; msg.style.color = bad && inp.value ? '#B42318' : ''; };
    inp.oninput = () => { draft.game.slug = inp.value.trim(); persist(); check(); };
    const title = p.querySelector('[data-path="title"]');
    title.addEventListener('input', () => { if (!draft.game.slugTouched) { draft.game.slug = ST.slugify(title.value); inp.value = draft.game.slug; persist(); check(); } });
    inp.addEventListener('input', () => { draft.game.slugTouched = true; });
    const starts = p.querySelector('.st-starts');
    starts.addEventListener('change', e => {
      const r = e.target; if (r.name !== 'f-start' || r.value === FOLDER) return;
      // Keep only what was typed here; everything else comes from the notebook switched to.
      const g = draft.game, keep = {};
      ['title', 'subtitle', 'tagline', 'kicker', 'description', 'specs', 'steps', 'brand', 'price', 'slug', 'slugTouched', 'rulesName', 'setup'].forEach(k => { if (g[k] !== undefined && JSON.stringify(g[k]) !== JSON.stringify(saved.game[k])) keep[k] = g[k]; });
      try { localStorage.setItem(NEWKEY, JSON.stringify({ start: r.value, carry: keep, savedKey: serverKey || undefined })); } catch (e2) { /* blocked */ }
      location.reload();
    });
    ST.startChoices().then(list => {
      starts.innerHTML = list.map(x => '<label><input type="radio" name="f-start" value="' + esc(x[0]) + '"' + (x[0] === FOLDER ? ' checked' : '') + '><span><b>' + esc(x[1]) + '</b><small>' + esc(x[2]) + '</small></span></label>').join('');
    }).catch(() => {});
    check(); loadTaken().then(check);
  }
  async function createNew() {
    const g = draft.game, slug = (g.slug || '').trim();
    if (!GH.token()) { show('connect'); updateBar('Publishing needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); return; }
    if (!(g.title || '').trim()) { show('content'); updateBar('Give the notebook a title first.', 'bad'); return; }
    const bad = await freshSlugProblem(slug);
    if (bad) { show('content'); updateBar(esc(bad), 'bad'); return; }
    busy(true);
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
      const commit = await GH.commit(out, 'Start the ' + game.title + ' notebook (from ' + FOLDER + ')', m => updateBar(esc(m)), null, { newFolder: slug });
      try { sessionStorage.setItem(PDFWATCH, JSON.stringify({ sha: commit.sha, folder: slug, t0: Date.now() })); } catch (e) { /* blocked */ }
      Object.keys(pendingB64).forEach(p => { delete pendingB64[p]; });
      clearDraft();
      if (serverKey) await GH.writeDrafts([{ key: serverKey, delete: true }], 'Published ' + game.title + ', so drop its saved draft').catch(() => {});
      updateBar('Published. Opening ' + esc(game.title) + '…', 'ok');
      location.replace('/studio/?game=' + encodeURIComponent(slug) + '#checklist');
    } catch (e) {
      updateBar('Not published: ' + esc(e.message), 'bad');
      busy(false);
    }
  }

  // What a shared link shows: the Share button's message, then the card that link previews build
  // from the page's tags (GH.shells): picture, title, tagline and the address.
  // Says whether the announcement strip is showing today, given its dates.
  function annStatus() {
    const el = $('#ad-ann-status'); if (!el) return;
    const g = draft.game, day = NB.today();
    const nice = d => new Date(d + 'T12:00').toLocaleDateString([], { dateStyle: 'medium' });
    const from = g.announceFrom || '', until = g.announceUntil || '';
    el.textContent = !String(g.announce || '').trim() ? 'No announcement.'
      : from && until && from > until ? 'The end date is before the start date, so the strip never shows.'
      : NB.announceOn(g, day) ? 'Showing now' + (until ? ', until the end of ' + nice(until) : ', with no end date') + '.'
      : from && day < from ? 'Hidden now. It appears on ' + nice(from) + (until ? ' and goes away after ' + nice(until) : '') + '.'
      : 'Hidden. It ended on ' + nice(until) + '.';
  }
  function sharePreview() {
    const box = $('#ad-share'); if (!box) return;
    const g = draft.game, slug = IS_NEW ? (g.slug || 'your-game') : FOLDER;
    const url = GH.SITE + '/' + slug + '/';
    const photo = (g.media || []).find(m => m && m.type === 'image' && m.src);
    const src = g.shareImage ? BASE + g.shareImage : photo ? (pending[photo.src] || (/^(https?:|\/|data:)/.test(photo.src) ? photo.src : BASE + photo.src)) : IS_NEW ? '' : BASE + 'pdf/preview-1.jpg';
    const title = (g.title || 'Your game') + (g.subtitle ? ': ' + g.subtitle : '');
    const msg = g.shareText || (g.title && g.tagline ? g.title + ': ' + g.tagline : '');
    box.innerHTML = (msg ? '<p class="ad-share-msg">' + esc(msg) + ' <span>https://' + esc(url) + '</span></p>' : '') +
      '<div class="ad-share-card"><div class="ad-share-img">' + (src ? '<img src="' + esc(src) + '" alt="" onerror="this.remove()">' : '') + '</div>' +
      '<div class="ad-share-txt"><small>' + esc(GH.SITE.toUpperCase()) + '</small><b>' + esc(title) + '</b><span>' + esc(g.tagline || g.title || '') + '</span></div></div>';
  }

  function tabContent(p) {
    const g = draft.game;
    g.print = g.print || {}; g.order = g.order || {};
    p.innerHTML = '<h2>Content</h2><p class="ad-lede">Provide information about your notebook game. This will be used on the game\'s website and inside the game notebook.</p>' +
      (IS_NEW ? '<fieldset class="ad-newnb"><legend>New notebook</legend>' +
        '<label class="ad-field" for="f-slug"><span>Web address</span><span class="st-url"><b>thegamebureau.com/</b><input id="f-slug" value="' + esc(g.slug || '') + '" placeholder="pitch-count" autocomplete="off" spellcheck="false"></span><small id="f-slug-msg"></small></label>' +
        '<div class="ad-field"><span>Start from</span><div class="st-starts"><label><input type="radio" name="f-start" value="' + esc(FOLDER) + '" checked><span><b>' + esc(FOLDER === ST.STARTER ? 'Blank starter' : 'Copy of ' + (saved.game.title || FOLDER)) + '</b><small>Loading the other choices…</small></span></label></div>' +
        '<small>The blank starter, or a copy of a notebook already on the site. Switching keeps what you have typed here and takes the rest (colours, rules, cover and inside pages) from your choice.</small></div></fieldset>' : '') +
      '<fieldset><legend>The basics</legend>' + field('title', 'Title', IS_NEW ? { ph: 'e.g. Pitch Count' } : {}) + field('subtitle', 'Subtitle', { ph: 'Optional' }) +
      field('tagline', 'Tagline', { area: true, rows: 2, help: 'One sentence. Shown under the title and in link previews.' }) +
      field('kicker', 'Small line above the title') + field('announce', 'Announcement strip', { help: 'Optional. A coloured strip under the top bar.' }) +
      '<div class="ad-dates">' + field('announceFrom', 'Show the strip from', { type: 'date' }) + field('announceUntil', 'Until', { type: 'date' }) + '</div>' +
      '<p class="ad-help ad-ann-status" id="ad-ann-status"></p>' +
      field('shareText', 'Share message', { help: 'What the Share button sends with the link.' }) +
      '<div class="ad-field"><span>How a shared link looks</span><div id="ad-share" class="ad-share"></div><small>In texts and social posts. It updates as you type; the picture is the first photo in Photos &amp; video, or the cover once the PDFs are built.</small></div>' +
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
    sharePreview(); p.addEventListener('input', sharePreview);
    annStatus(); p.addEventListener('input', annStatus); p.addEventListener('change', annStatus);
    
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
      'Keep the "# {{title}} rules" heading first, written exactly like that: {{title}} becomes the game\'s name, and the website swaps "rules" for the game\'s rules name. Keep steps short and clear, in the order players do them.',
    ];
    const common = [
      'This is ' + file + ' for "' + (g.title || 'a notebook game') + '", a paper notebook game sold on ' + GH.SITE + '.',
      'It is printed as a book: trim ' + P.trim[0] + ' x ' + P.trim[1] + ' in, bleed ' + P.bleed + ' in on every outside edge, and a safe margin of ' + P.margin + ' in inside the trim for text.',
      'The page loads /studio/kit/print.css and /studio/kit/print.js, which size and lay out the pages. Keep those tags and the <body> attributes as they are. Use inches or points, never px or vw.',
      'Colours: var(--brand) var(--accent) var(--paper) var(--ink). Fonts: "NB Display" (headings) and "NB Text" (body). Keep it printable: no scripts, animations or web fonts from other sites.',
    ];
    const per = key === 'cover' ? [
      'Design inside .cover-front, .cover-back and .cover-spine. print.js places each one on its panel with bleed and pads it to the safe area. The spine is ' + spineInfo().spine + ' in wide for this notebook (inside pages x paper thickness). Its text is sized to fit and only prints when the spine is at least ' + spineInfo().min.toFixed(2) + ' in, so keep it to one short line.',
      'These are filled in from the game\'s details: {{title}} {{subtitle}} {{tagline}} {{kicker}} {{url}} {{price}}, and as HTML blocks {{steps}} {{specs}} {{description}} {{image}}. {{image}} is the game\'s main image: photo 1 in Photos & video at the time the cover is generated (a pattern of squares until there is a photo). Keep them as placeholders rather than typing the text in.',
      'Leave about 2 x 1.2 in clear at the lower right of the back cover for a barcode. Images go in images/ next to the file (they are uploaded in the studio\'s Photos & video tab): <img src="images/name.jpg">.',
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
      '<li>Copy the AI\'s whole answer and click <button type="button" class="nb-btn" id="ad-ai-paste">PASTE AI ANSWER</button>. The editor and preview update. Nothing is saved until you click SAVE or PUBLISH at the top, and <i>Undo all changes to this file</i> puts it back.</li></ol>' +
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
      const m2 = $('#ad-ai-msg'); if (m2) m2.textContent = 'Pasted. Check the preview, then click SAVE or PUBLISH.';
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
      '<div class="ad-code-foot">' + (key === 'rules' ? '<span class="ad-rules-len" id="ad-rules-len"></span>' : '') + '<button type="button" class="ad-link" id="ad-revert">Undo all changes to this file</button></div>' +
      (key === 'rules' ? '<div class="ad-rules-warn" id="ad-rules-warn" role="status" hidden></div>' : '') +
      (help ? '<details class="ad-help-box"><summary>How this file works</summary>' + help + '</details>' : '');
    const ta = $('#ad-code');
    ta.oninput = () => { draft[key] = ta.value; persist(); if (key === 'rules') rulesLength(); };
    ta.onkeydown = e => { if (e.key === 'Tab' && key !== 'rules') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.oninput(); } };
    if (ai) bindAi(key);
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).catch(() => {}); }; });
    $('#ad-revert').onclick = () => { if (confirm('Put this file back the way it was last saved?')) { draft[key] = saved[key]; persist(); show(tab); } };
  }
  const tabRules = p => { rulesTab(p); rulesLength(); };
  // Words, reading time and printed pages of the rules, under the editor.
  let rulesTimer = null, rulesPages = null;
  function rulesLength() {
    if (!drawRulesLen()) return;
    clearTimeout(rulesTimer);
    rulesTimer = setTimeout(measureRules, 800);
  }
  // Likely mistakes in the rules, shown under the editor.
  function rulesProblems() {
    const g = draft.game, text = draft.rules, out = [];
    const lines = text.split('\n');
    const tops = lines.filter(l => /^#\s/.test(l));
    const first = (lines.find(l => /^#{1,6}\s/.test(l)) || '').trim();
    if (!/^#\s+\{\{title\}\}\s+rules$/i.test(first)) out.push('The first line should be <code># {{title}} rules</code>, so the game\'s name and its rules name (' + esc(NB.rulesName(g)) + ') fill in by themselves.');
    if (tops.length > 1) out.push('There are ' + tops.length + ' main titles (lines starting with one #). Use ## for sections after the first.');
    // Numbered steps that skip or repeat a number (1. 2. 4.). A list of all "1." is fine.
    let prev = null;
    lines.forEach((l, i) => {
      const m = l.match(/^(\d+)\.\s/);
      if (!m) { if (!/^\s+\S/.test(l)) prev = null; return; }
      const n = +m[1];
      if (prev != null && n !== prev + 1 && !(n === 1 && prev === 1)) out.push('Step ' + n + ' (line ' + (i + 1) + ') comes after step ' + prev + '.');
      prev = n;
    });
    // Players, time and ages should agree with the Content tab's specs.
    const nums = s => (String(s).match(/\d+/g) || []).map(Number);
    const spec = re => ((g.specs || []).find(r => re.test(r[0] || '')) || [])[1];
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    const checks = [
      [/^(time|play ?time|length)$/i, /(\d+(?:\s*[–-]\s*\d+)?\+?)\s*(?:min|minutes)\b/i, 'Time'],
      [/^(players?|people)$/i, /(\d+(?:\s*[–-]\s*\d+)?\+?)\s+(?:players?|people|captains?)\b/i, 'Players'],
      [/^ages?$/i, /\bages?\s+(\d+(?:\s*[–-]\s*\d+)?\+?)/i, 'Ages'],
    ];
    for (const [lab, re, name] of checks) {
      const want = spec(lab), m = text.match(re);
      if (want && m && nums(want).length && !same(nums(m[1]), nums(want))) out.push(name + ': the rules say <b>' + esc(m[0]) + '</b> but the Content tab says <b>' + esc(want) + '</b>.');
    }
    return out;
  }
  function drawRulesWarn() {
    const el = $('#ad-rules-warn'); if (!el) return;
    const w = rulesProblems();
    el.hidden = !w.length;
    el.innerHTML = w.length ? '<b>Check before you publish</b><ul>' + w.map(x => '<li>' + x + '</li>').join('') + '</ul>' : '';
  }
  function drawRulesLen() {
    drawRulesWarn();
    const el = $('#ad-rules-len'); if (!el) return false;
    const words = (draft.rules.replace(/\{\{\w+\}\}/g, 'x').replace(/[#>*_`\[\]()-]+/g, ' ').match(/[A-Za-z0-9\u00C0-\uFFFF'’]+/g) || []).length;
    const mins = Math.max(1, Math.round(words / 200));
    el.innerHTML = '<b>' + words.toLocaleString() + ' words</b> · about ' + mins + ' minute' + (mins === 1 ? '' : 's') + ' to read · ' +
      (rulesPages == null ? 'counting printed pages…' : '<b>' + rulesPages + ' printed page' + (rulesPages === 1 ? '' : 's') + '</b> in the notebook');
    return true;
  }
  // Lays the notebook out in a hidden frame and measures how tall the rules run, in pages.
  function measureRules() {
    const old = $('#ad-rules-measure'); if (old) old.remove();
    if (!$('#ad-rules-len')) return;
    const f = document.createElement('iframe');
    f.id = 'ad-rules-measure'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1100px;height:900px;border:0;visibility:hidden';
    f.onload = () => {
      let tries = 0;
      const look = () => {
        if (!f.isConnected) return;
        const d = f.contentDocument, r = d && d.querySelector('.pk-rules');
        if ((!d || d.body.dataset.ready !== '1' || !r) && tries++ < 60) return setTimeout(look, 150);
        if (r) {
          const P = Object.assign({ trim: [8.5, 11], margin: 0.5 }, draft.game.print || {});
          const cs = getComputedStyle(r), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
          const per = (P.trim[1] - 2 * P.margin) * 96;
          rulesPages = Math.max(1, Math.ceil((r.scrollHeight - pad - 2) / per));
        }
        f.remove();
        drawRulesLen();
      };
      look();
    };
    document.body.appendChild(f);
    f.srcdoc = pvDoc(draft.contents, 'bleed=0');
  }
  const rulesTab = p => codeTab(p, 'rules', 'Rules', 'Written in Markdown. The same text is the rules page and the first pages of the notebook.',
    '<ul><li><code># Title</code>, <code>## Section</code>, <code>### Sub-section</code></li><li><code>1.</code> numbered steps, <code>-</code> bullet points</li><li><code>**bold**</code>, <code>*italic*</code>, <code>[link](https://...)</code></li><li><code>&gt; Tip text</code> makes a highlighted box</li><li><code>---</code> draws a line</li></ul>');
  // The Cover tab has no "How this file works" box: that guidance is in the COPY FOR AI brief (aiBrief).
  const tabCover = p => { codeTab(p, 'cover', 'Cover', 'HTML and CSS for the front, back and spine. The preview shows the printer\'s spread and each side alone. ' + esc(spineNote()), ''); coverStyles(p); };
  // Ready-made cover designs. Each is a whole cover.html, filled in from this game's details
  // and colours. USE THIS swaps it in; "Put my cover back" undoes the last swap.
  const COVER_STYLES = [['classic', 'Classic', '/' + ST.STARTER + '/cover.html'], ['photo', 'Big photo', '/studio/kit/covers/photo.html'], ['bold', 'Bold title', '/studio/kit/covers/bold.html'], ['notebook', 'Notebook', '/studio/kit/covers/notebook.html']];
  const coverSrc = {};
  let coverBefore = null;
  const getCover = u => coverSrc[u] || (coverSrc[u] = fetch(u + '?v=' + KITV, { cache: 'no-cache' }).then(r => r.ok ? r.text() : Promise.reject(new Error('could not load ' + u))));
  function coverStyles(p) {
    const box = document.createElement('div');
    box.className = 'ad-cstyles';
    box.innerHTML = '<p class="ad-cstyles-h"><b>Start from a cover style</b> Filled in with this game\'s details and colours. ' +
      (coverBefore != null ? '<button type="button" class="ad-link" id="ad-cstyle-undo">Put my cover back</button>' : '') + '</p>' +
      '<div class="ad-cstyle-row">' + COVER_STYLES.map(([k, l]) => '<figure class="ad-cstyle"><div class="ad-cstyle-pic"><iframe data-cstyle="' + k + '" title="' + esc(l) + ' cover" tabindex="-1" loading="lazy"></iframe></div>' +
        '<figcaption>' + esc(l) + '<button type="button" class="nb-btn" data-use="' + k + '">USE THIS</button></figcaption></figure>').join('') + '</div>';
    p.querySelector('.ad-lede').after(box);
    COVER_STYLES.forEach(([k, , u]) => {
      const f = box.querySelector('[data-cstyle="' + k + '"]');
      getCover(u).then(html => {
        f.onload = () => {
          let tries = 0;
          const fit = () => {
            const d = f.contentDocument; if (!d) return;
            if (d.body.dataset.ready !== '1' && tries++ < 40) return setTimeout(fit, 150);
            const tb = d.querySelector('.pk-toolbar'); if (tb) tb.remove();
            const c = d.querySelector('.pk-cover'); if (!c) return;
            c.style.margin = '0'; c.style.boxShadow = 'none'; d.body.style.background = 'transparent'; d.body.style.padding = '0';
            d.documentElement.style.zoom = f.clientWidth / c.offsetWidth;
          };
          fit();
        };
        f.srcdoc = pvDoc(html, 'layout=front');
      }).catch(() => { f.replaceWith(Object.assign(document.createElement('p'), { className: 'ad-help', textContent: 'Could not load this style.' })); });
    });
    box.querySelectorAll('[data-use]').forEach(b => { b.onclick = async () => {
      const st = COVER_STYLES.find(x => x[0] === b.dataset.use);
      try {
        const html = await getCover(st[2]);
        coverBefore = draft.cover;
        draft.cover = html; persist(); show('cover');
        flash('Swapped in the ' + esc(st[1]) + ' cover. Check the preview, then SAVE or PUBLISH. "Put my cover back" undoes it.', 'ok', 8000);
      } catch (e) { updateBar('Could not load that cover style: ' + esc(e.message), 'bad'); }
    }; });
    const undo = box.querySelector('#ad-cstyle-undo');
    if (undo) undo.onclick = () => { draft.cover = coverBefore; coverBefore = null; persist(); show('cover'); };
  }
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
    if (IS_NEW) { p.innerHTML = '<h2>PDFs</h2><p class="ad-lede">The cover, contents, print-at-home and free sampler PDFs build on GitHub about 3 minutes after you publish the notebook, and again after each save.</p><p class="ad-help">Until then, the Cover and Inside pages tabs preview exactly what will print.</p>'; return; }
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

  // ---------- SAVE and PUBLISH (title bar) ----------
  // SAVE: the notebook goes to GitHub (not the site), so any browser can pick it up from Notebooks.
  // PUBLISH: it goes live. For a new notebook that creates its folder.
  let working = false;
  function refreshButtons() {
    const sv = $('#ad-savedraft'), pb = $('#ad-publish'); if (!sv) return;
    const locked = isTemplate && !allowTemplate;
    sv.disabled = working || locked || !unsaved();
    pb.disabled = working || locked || (!IS_NEW && !changed());
    const dc = $('#ad-discard');
    dc.hidden = locked || !(IS_NEW ? serverKey || sig() !== freshSig : unsaved() || changed() || serverKey);
    dc.disabled = working;
  }
  const busy = on => { working = on; refreshButtons(); };
  async function saveDraft(force) {
    const g = draft.game, key = IS_NEW ? (g.slug || '').trim() : FOLDER;
    if (!GH.token()) { updateBar('Saving needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); return; }
    if (IS_NEW) { const bad = await freshSlugProblem(key); if (bad) { show('content'); updateBar(esc(bad), 'bad'); return; } }
    busy(true);
    if (force !== true) {
      const warn = await otherSave(key);
      if (warn) { busy(false); askBar(warn + ' Saving now replaces their version with yours.', [{ label: 'SAVE MINE ANYWAY', solid: true, fn: () => saveDraft(true) }, { label: 'OPEN THEIRS', fn: () => openTheirs(key) }]); return; }
    }
    const at = Date.now();
    const data = { v: 1, by: await GH.login(), isNew: IS_NEW, start: IS_NEW ? FOLDER : undefined, at, game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, files: Object.fromEntries(Object.keys(pendingB64).map(k => [k, pending[k]])) };
    const files = [{ key, data }];
    if (serverKey && serverKey !== key) files.push({ key: serverKey, delete: true }); // the address changed
    try {
      await GH.writeDrafts(files, 'Save ' + (g.title || key) + ' in the studio (not published)', m => updateBar(esc(m)));
      serverKey = key; serverAt = at; serverSig = sig(); serverTitle = g.title || key;
      persist();
      busy(false);
      flash('Saved to GitHub. Open it from Notebooks in any browser. It is not live until you publish.', 'ok', 8000);
    } catch (e) { busy(false); updateBar('Not saved: ' + esc(e.message), 'bad'); }
  }
  // Picks up the copy saved on GitHub. Called once on load.
  async function loadServerDraft() {
    let local = null;
    try { local = JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (e) { /* none */ }
    const key = IS_NEW ? (OPEN || (local && local.savedKey) || '') : FOLDER;
    if (!key || !GH.token()) return;
    let d = null;
    try { d = await GH.readDraft(key); } catch (e) { return; }
    if (OPEN) history.replaceState(null, '', '/studio/?new' + location.hash);
    if (!d || !d.game) { if (IS_NEW && local && local.savedKey) { serverKey = ''; serverAt = 0; } return; }
    if (IS_NEW && d.start && d.start !== FOLDER) {
      // Saved from another template: switch to it and open again.
      try { localStorage.setItem(NEWKEY, JSON.stringify({ start: d.start, savedKey: key })); } catch (e) { /* blocked */ }
      location.reload(); return new Promise(() => {});
    }
    serverKey = key; serverAt = d.at || 0; serverTitle = d.game.title || key;
    const files = d.files || {};
    const takeFiles = () => Object.entries(files).forEach(([k, v]) => { if (!pending[k] && /^data:/.test(v)) { pending[k] = v; pendingB64[k] = v.split(',')[1]; } });
    const sameBase = local && local.base === d.at && local.game;
    if (OPEN || !sameBase) {
      // Nothing newer in this browser: open the saved copy.
      draft = { game: d.game, rules: d.rules, cover: d.cover, contents: d.contents };
      draft.game.setup = draft.game.setup || {}; draft.game.media = draft.game.media || [];
      takeFiles();
      serverSig = sig();
      persist();
    } else {
      // This browser has edits on top of the saved copy: keep them, with the saved photos.
      const mine = draft; draft = { game: d.game, rules: d.rules, cover: d.cover, contents: d.contents };
      takeFiles(); serverSig = sig(); draft = mine;
    }
  }

  // ---------- save and publish ----------
  async function save(force) {
    if (IS_NEW) return createNew();
    if (!changed()) return;
    if (isTemplate && !allowTemplate) return;
    if (!GH.token()) { updateBar('Publishing needs the one-time setup first: <a href="/studio/#connect">Connect in the Notebook Studio</a>.', 'bad'); return; }
    const g = draft.game;
    if (!g.title) { show('content'); updateBar('Give the notebook a title first.', 'bad'); return; }
    busy(true);
    if (force !== true) {
      updateBar('Checking for newer versions…');
      const warn = (await otherPublish()) || (await otherSave(FOLDER));
      if (warn) { busy(false); askBar(warn + ' Publishing now puts your version live instead.', [{ label: 'PUBLISH MINE ANYWAY', solid: true, fn: () => save(true) }, { label: 'OPEN THEIRS', fn: () => openTheirs(FOLDER) }]); return; }
    }
    if (g.favicon && !pendingB64['favicon.ico'] && !saved.game.favicon) delete g.favicon; // picked before a reload, so the file is gone
    const files = [];
    const add = (f, text) => files.push({ path: FOLDER + '/' + f, text });
    delete g.slugTouched; // editor-only: whether the web address was typed by hand
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
      if (serverKey) { await GH.writeDrafts([{ key: serverKey, delete: true }], 'Published ' + g.title + ', so drop its saved draft').catch(() => {}); serverKey = ''; serverAt = 0; serverSig = ''; }
      serverTitle = '';
      busy(false);
      flash('Published (<a href="https://github.com/' + GH.REPO + '/commit/' + commit.sha + '" target="_blank" rel="noopener">commit</a>). The site republishes in about a minute; the PDF status shows at the top.', 'ok', 15000);
      // Keep showing just-uploaded photos until the site serves them.
      setTimeout(() => { Object.keys(pending).forEach(p => delete pending[p]); }, 180000);
      if (tab === 'checklist' || tab === 'pdfs' || tab === 'history') show(tab, true);
      watchPdfs(commit.sha);
    } catch (e) {
      updateBar('Not published: ' + esc(e.message), 'bad');
      busy(false);
    }
  }

  let leaving = false;
  // ---------- questions in the title bar ----------
  // A message with buttons in the bar under the title, for a choice that needs an answer now.
  function askBar(msg, buttons, kind) {
    const bar = $('#ad-bar');
    bar.className = 'ad-bar show ask ' + (kind || 'warn');
    bar.innerHTML = '<span>' + msg + '</span><span class="ad-bar-btns">' + buttons.map((b, i) => '<button type="button" class="nb-btn' + (b.solid ? ' solid' : '') + (b.danger ? ' ad-danger' : '') + '" data-ask="' + i + '">' + esc(b.label) + '</button>').join('') +
      '<button type="button" class="nb-btn" data-ask="x">CANCEL</button></span>';
    bar.querySelectorAll('[data-ask]').forEach(el => { el.onclick = () => { const b = buttons[+el.dataset.ask]; if (b) b.fn(); else updateBar(); }; });
  }
  const reloadTo = url => { leaving = true; if (url) location.href = url; else location.reload(); };

  // ---------- DISCARD (title bar) ----------
  // Throws changes away: back to the last SAVE, back to the live version, or (for a notebook
  // never published) the whole notebook, including its copy saved on GitHub.
  function askDiscard() {
    const btns = [], since = serverAt ? ' (saved ' + esc(when(serverAt)) + ')' : '';
    const toSave = serverKey && unsaved();
    if (toSave) btns.push({ label: 'BACK TO LAST SAVE', fn: backToSave });
    if (IS_NEW) btns.push({ label: 'THROW THIS NOTEBOOK AWAY', danger: true, fn: throwAway });
    else btns.push({ label: 'BACK TO THE LIVE VERSION', danger: true, fn: backToLive });
    askBar(IS_NEW
      ? (serverKey ? 'Throw away changes? ' + (toSave ? '<b>Back to last save</b> drops what you changed since your last SAVE' + since + '. ' : '') + '<b>Throw this notebook away</b> deletes it, including the copy saved on GitHub. It was never published.'
        : 'Throw this notebook away? It has not been saved or published.')
      : 'Throw away changes? ' + (toSave ? '<b>Back to last save</b> drops what you changed since your last SAVE' + since + '. ' : '') + '<b>Back to the live version</b> drops every change that is not published' + (serverKey ? ', including the copy saved on GitHub' : '') + '.', btns);
  }
  function backToSave() {
    if (IS_NEW) { try { localStorage.removeItem(NEWKEY); } catch (e) { /* blocked */ } reloadTo('/studio/?new&open=' + encodeURIComponent(serverKey) + '#' + tab); return; }
    clearDraft(); reloadTo();
  }
  async function dropServerDraft(message) {
    if (!serverKey) return true;
    busy(true); updateBar('Removing the copy saved on GitHub…');
    try { await GH.writeDrafts([{ key: serverKey, delete: true }], message); return true; }
    catch (e) { busy(false); updateBar('Nothing was thrown away: ' + esc(e.message), 'bad'); return false; }
  }
  async function backToLive() {
    if (!(await dropServerDraft('Discard unpublished changes to ' + (saved.game.title || FOLDER)))) return;
    clearDraft(); reloadTo();
  }
  async function throwAway() {
    if (!(await dropServerDraft('Delete the saved notebook ' + (draft.game.title || serverKey) + ' (never published)'))) return;
    try { localStorage.removeItem(NEWKEY); } catch (e) { /* blocked */ }
    reloadTo('/studio/#games');
  }

  // ---------- someone else got there first ----------
  // Before SAVE or PUBLISH: has another browser saved or published this notebook since it was
  // opened here? Returns the warning, or '' when it is safe to go ahead.
  async function otherSave(key) {
    let d = null;
    try { d = await GH.readDraft(key); } catch (e) { return ''; }
    if (!d || !d.at || d.at === serverAt) return '';
    return (d.by ? esc(d.by) : 'Someone') + ' saved this notebook in another browser at ' + esc(when(d.at)) + ', after you opened it here.';
  }
  async function otherPublish() {
    try {
      const keys = ['game', 'rules', 'cover', 'contents'];
      const now = await Promise.all(keys.map(k => GH.readTextAt(FOLDER + '/' + FILES[k], GH.BRANCH)));
      const same = (k, t) => { if (k !== 'game') return t === saved[k]; try { return JSON.stringify(JSON.parse(t)) === JSON.stringify(saved.game); } catch (e) { return false; } };
      if (keys.every((k, i) => now[i] == null || same(k, now[i]))) return '';
      const c = ((await GH.history(FOLDER).catch(() => [])) || []).find(x => !/^Rebuild notebook PDFs/.test(x.commit.message));
      return 'This notebook was published' + (c ? ' by ' + esc((c.author && c.author.login) || c.commit.author.name) + ' at ' + esc(when(c.commit.author.date)) : ' again') + ', after you opened it here.';
    } catch (e) { return ''; }
  }
  function openTheirs(key) {
    if (IS_NEW) { try { localStorage.removeItem(NEWKEY); } catch (e) { /* blocked */ } reloadTo('/studio/?new&open=' + encodeURIComponent(key) + '#' + tab); return; }
    clearDraft(); reloadTo();
  }

  // ---------- PDF status after PUBLISH ----------
  // The PDFs rebuild on GitHub after a publish; the title bar follows that build until it is done.
  const PDFWATCH = 'nb-pdf-watch';
  function pdfChip(html, kind, href) {
    const c = $('#ad-pdfst'); if (!c) return;
    c.hidden = !html; c.className = 'ad-pdfst ' + (kind || ''); c.innerHTML = html || '';
    c.href = href || '#pdfs'; if (href) { c.target = '_blank'; c.rel = 'noopener'; } else c.removeAttribute('target');
  }
  let watching = '';
  async function watchPdfs(sha, t0) {
    if (!sha || !GH.token()) return;
    watching = sha; t0 = t0 || Date.now();
    try { sessionStorage.setItem(PDFWATCH, JSON.stringify({ sha, folder: FOLDER, t0 })); } catch (e) { /* blocked */ }
    const done = () => { try { sessionStorage.removeItem(PDFWATCH); } catch (e) { /* blocked */ } };
    const before = build && build.built;
    pdfChip('PDFs: starting…');
    while (watching === sha && Date.now() - t0 < 30 * 60000) {
      let run = null;
      try { run = ((await GH.runs(GH.WORKFLOW, '&event=push&head_sha=' + sha)).workflow_runs || [])[0] || null; } catch (e) { /* try again */ }
      // No build after 3 minutes: nothing that goes in the PDFs changed (only photos, say).
      if (!run && Date.now() - t0 > 3 * 60000) { pdfChip(''); done(); return; }
      if (run && run.status === 'completed') {
        done();
        if (run.conclusion !== 'success') { pdfChip('PDF build failed. See why', 'bad', run.html_url); return; }
        pdfChip('PDFs ready ✓', 'ok');
        // The site serves them about a minute later; then the PDFs tab shows the new build.
        GH.waitForSite(BASE + 'pdf/build.json', t => { try { return JSON.parse(t).built !== before; } catch (e) { return false; } }, null, 15)
          .then(async ok => { if (!ok) return; try { const r = await fetch(BASE + 'pdf/build.json?t=' + Date.now(), { cache: 'no-store' }); build = await r.json(); } catch (e) { /* keep the old one */ } if (tab === 'pdfs') show('pdfs', true); });
        setTimeout(() => { if (watching === sha) pdfChip(''); }, 5 * 60000);
        return;
      }
      if (run) pdfChip(/queued|waiting|pending|requested/.test(run.status) ? 'PDFs waiting to build…' : 'PDFs building… about 3 min');
      await sleep(10000);
    }
  }

  // ---------- tab: welcome ----------
  // Kevin's words: what a game notebook is.
  const tabWelcome = p => {
    p.innerHTML = '<h2>Welcome</h2><p class="ad-lede">One of the types of games The Game Bureau creates is Game Notebooks. Think playing Tic-Tac-Toe with pen and paper, except the game board is already drawn for you on every page of a notebook. Hopefully our notebook games are a little nicer than that, but hopefully that gives you an idea. Each notebook game has a subdomain website, a pdf for sale and a sampler for download and print.</p>';
  };

  // ---------- tab: ideas ----------
  // Ideas for future games, shared by every connected browser (ideas.json on studio-drafts).
  // Each change re-reads the list first, so two browsers adding ideas don't lose each other's.
  const IDEAS_SEED = [{ id: 'reveal-device', title: 'Reveal-one-at-a-time device', at: '2026-11-24T12:00:00Z', by: '',
    notes: 'A printable device that shows only one item at a time.\n\n- **Dial version:** a paper sleeve with a window. Dial a letter and a number, and the window reveals what belongs at that coordinate.\n- **Punch version:** punch a hole at a coordinate on the top sheet, and the answer shows through from the paper underneath.' }];
  let ideas = null, ideaEdit = null; // ideaEdit: id being edited, 'new' for a new idea
  async function fetchIdeas() { const l = await GH.readIdeas(); return l || IDEAS_SEED.slice(); }
  function tabIdeas(p) {
    p.innerHTML = '<h2>Ideas</h2><p class="ad-lede">Ideas for future notebook games. They are kept on GitHub but never on the website, so any connected browser sees the same list.</p><div id="ad-ideas"><p class="ad-help">Loading…</p></div>';
    if (!GH.token()) { $('#ad-ideas').innerHTML = '<p class="ad-help">Connect to GitHub in the Connect tab to see and add ideas.</p>'; return; }
    if (ideas) { drawIdeas(); return; }
    fetchIdeas().then(l => { ideas = l; drawIdeas(); }).catch(e => { const b = $('#ad-ideas'); if (b) b.innerHTML = '<p class="ad-help">Could not read the ideas: ' + esc(e.message) + '</p>'; });
  }
  function ideaForm(x) {
    return '<form class="ad-idea-form" id="ad-idea-form"><label>Idea<input id="ad-idea-title" value="' + esc(x ? x.title : '') + '" placeholder="A short name for it" required></label>' +
      '<label>Notes<textarea id="ad-idea-notes" rows="6" placeholder="How it plays, what makes it fun, what it needs. - for bullet points, **bold** for bold.">' + esc(x ? x.notes : '') + '</textarea></label>' +
      '<div class="ad-idea-btns"><button class="nb-btn solid" type="submit">' + (x ? 'SAVE IDEA' : 'ADD IDEA') + '</button><button class="nb-btn" type="button" id="ad-idea-cancel">CANCEL</button></div><p class="ad-help" id="ad-idea-msg"></p></form>';
  }
  function drawIdeas() {
    const box = $('#ad-ideas'); if (!box) return;
    const day = iso => iso ? new Date(iso).toLocaleDateString([], { dateStyle: 'medium' }) : '';
    box.innerHTML = (ideaEdit === 'new' ? ideaForm(null) : '<p><button class="nb-btn solid" type="button" id="ad-idea-add">ADD AN IDEA</button></p>') +
      (ideas.length ? '<ol class="ad-ideas">' + ideas.map(x => ideaEdit === x.id ? '<li>' + ideaForm(x) + '</li>' :
        '<li><div class="ad-idea-head"><h3>' + esc(x.title) + '</h3><span><button type="button" class="ad-link" data-idea-edit="' + esc(x.id) + '">Edit</button> <button type="button" class="ad-link" data-idea-del="' + esc(x.id) + '">Delete</button></span></div>' +
        (x.notes ? '<div class="ad-idea-notes">' + NB.md(x.notes) + '</div>' : '') +
        '<small>Added ' + esc(day(x.at)) + (x.by ? ' by ' + esc(x.by) : '') + (x.edited ? ' · edited ' + esc(day(x.edited)) : '') + '</small></li>').join('') + '</ol>'
        : '<p class="ad-empty">No ideas yet.</p>');
    const add = $('#ad-idea-add'); if (add) add.onclick = () => { ideaEdit = 'new'; drawIdeas(); $('#ad-idea-title').focus(); };
    box.querySelectorAll('[data-idea-edit]').forEach(b => { b.onclick = () => { ideaEdit = b.dataset.ideaEdit; drawIdeas(); $('#ad-idea-title').focus(); }; });
    box.querySelectorAll('[data-idea-del]').forEach(b => { b.onclick = () => {
      const x = ideas.find(i => i.id === b.dataset.ideaDel);
      if (x && confirm('Delete the idea "' + x.title + '"?')) changeIdeas(l => l.filter(i => i.id !== x.id), 'Delete idea: ' + x.title);
    }; });
    const f = $('#ad-idea-form'); if (!f) return;
    $('#ad-idea-cancel').onclick = () => { ideaEdit = null; drawIdeas(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const title = $('#ad-idea-title').value.trim(), notes = $('#ad-idea-notes').value.trim();
      if (!title) return;
      const now = new Date().toISOString();
      if (ideaEdit === 'new') {
        const by = await GH.login();
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '-' + Date.now().toString(36);
        changeIdeas(l => [{ id, title, notes, at: now, by }].concat(l), 'Add idea: ' + title);
      } else {
        const id = ideaEdit;
        changeIdeas(l => l.map(i => i.id === id ? Object.assign({}, i, { title, notes, edited: now }) : i), 'Edit idea: ' + title);
      }
    };
  }
  async function changeIdeas(fn, message) {
    const msg = $('#ad-idea-msg');
    document.querySelectorAll('#ad-ideas button').forEach(b => { b.disabled = true; });
    if (msg) msg.textContent = 'Saving…';
    try {
      const next = fn(await fetchIdeas());
      await GH.writeIdeas(next, message);
      ideas = next; ideaEdit = null; drawIdeas();
      flash('Saved the ideas.', 'ok');
    } catch (e) {
      drawIdeas();
      updateBar('Could not save the ideas: ' + esc(e.message), 'bad');
    }
  }

  // ---------- tab: history ----------
  function tabHistory(p) {
    if (IS_NEW) { p.innerHTML = '<h2>History</h2><p class="ad-lede">Every published version of the notebook shows here once it is published.</p>'; return; }
    p.innerHTML = '<h2>History</h2><p class="ad-lede">Every published version, newest first. LOAD puts that version back in the editor: words, colours, rules, cover, inside pages and photos. The site does not change until you PUBLISH it.</p><div id="ad-hist"><p class="ad-help">Loading…</p></div>';
    GH.history(FOLDER).then(list => {
      const box = $('#ad-hist'); if (!box) return;
      const rows = (list || []).filter(c => !/^Rebuild notebook PDFs/.test(c.commit.message));
      if (!rows.length) { box.innerHTML = '<p class="ad-empty">No published versions found.</p>'; return; }
      box.innerHTML = '<ol class="ad-hist">' + rows.map((c, i) => {
        const at = when(c.commit.author.date), who = (c.author && c.author.login) || c.commit.author.name;
        return '<li><div><b>' + esc(c.commit.message.split('\n')[0]) + '</b><small>' + esc(at) + ' · ' + esc(who) + ' · <a href="' + esc(c.html_url) + '" target="_blank" rel="noopener">' + esc(c.sha.slice(0, 7)) + '</a></small></div>' +
          (i === 0 ? '<span class="ad-hist-live">LIVE NOW</span>' : '<button type="button" class="nb-btn" data-load="' + esc(c.sha) + '" data-when="' + esc(at) + '">LOAD</button>') + '</li>';
      }).join('') + '</ol>';
      box.querySelectorAll('[data-load]').forEach(b => { b.onclick = () => loadVersion(b.dataset.load, b.dataset.when); });
    }).catch(e => { const box = $('#ad-hist'); if (box) box.innerHTML = '<p class="ad-help">Could not read the history: ' + esc(e.message) + '</p>'; });
  }
  async function loadVersion(sha, label) {
    if (unsaved() && !confirm('Load the version from ' + label + '? Changes you have not saved will be replaced.')) return;
    busy(true); updateBar('Loading the version from ' + esc(label) + '…');
    try {
      const at = k => GH.readTextAt(FOLDER + '/' + FILES[k], sha);
      const [game, rules, cover, contents] = await Promise.all([at('game'), at('rules'), at('cover'), at('contents')]);
      if (!game) throw new Error('that version has no game.json');
      const g = JSON.parse(game);
      g.setup = g.setup || {}; g.media = g.media || [];
      const next = { game: g, rules: rules != null ? rules : saved.rules, cover: cover != null ? cover : saved.cover, contents: contents != null ? contents : saved.contents };
      // Photos (and the tab icon) deleted since then come back from that version.
      const used = JSON.stringify(g) + next.cover + next.contents;
      const [nowFiles, thenFiles] = await Promise.all([GH.listFiles(), GH.filesAt(sha)]);
      const have = new Set(nowFiles.map(f => f.path));
      const type = f => /\.png$/i.test(f) ? 'image/png' : /\.ico$/i.test(f) ? 'image/x-icon' : /\.webp$/i.test(f) ? 'image/webp' : /\.gif$/i.test(f) ? 'image/gif' : /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/jpeg';
      for (const f of thenFiles) {
        if (!f.path.startsWith(FOLDER + '/') || have.has(f.path)) continue;
        const rel = f.path.slice(FOLDER.length + 1);
        if (!/^(images\/[^/]+|favicon\.ico)$/.test(rel) || !used.includes(rel)) continue;
        const b64 = await GH.readBlobB64(f.sha);
        pending[rel] = 'data:' + type(rel) + ';base64,' + b64; pendingB64[rel] = b64;
      }
      draft = next; persist(); busy(false);
      updateBar('Loaded the version from ' + esc(label) + '. Check it in the other tabs, then PUBLISH to make it live again, or DISCARD to go back.', 'ok');
    } catch (e) { busy(false); updateBar('Could not load that version: ' + esc(e.message), 'bad'); }
  }

  // ---------- the spine ----------
  // Spine width = inside pages x paper thickness (print.spinePerPage), as the PDF build works it
  // out. The page count comes from the last build; with no build yet, or a new sheet count, it is
  // estimated (one page per game sheet).
  const SPINE_TEXT = 0.125 + 6 / 72; // print.js: 1/16 in clear each side, and at least 6 pt text
  function spineInfo() {
    const P = Object.assign({ spinePerPage: 0.002252, padTo: 2 }, draft.game.print || {});
    const min = P.spineTextMin != null ? +P.spineTextMin : SPINE_TEXT;
    if (P.spine != null && P.spine !== '') return { spine: +P.spine, fixed: true, min };
    const bp = build && build.pages && build.pages.contents;
    const sheets = +P.sheets || 0, was = +((saved.game.print || {}).sheets) || 0;
    let pages = bp, est = false;
    if (!bp || sheets !== was) {
      est = true;
      const pad = Math.max(1, P.padTo | 0);
      pages = Math.ceil(Math.max(1, bp ? bp + sheets - was : sheets + 2) / pad) * pad;
    }
    return { spine: +(pages * (+P.spinePerPage || 0)).toFixed(3), pages, est, per: +P.spinePerPage || 0, min };
  }
  function spineNote() {
    const s = spineInfo();
    const text = s.spine >= s.min ? 'Wide enough for the spine text.'
      : 'Spine text needs ' + s.min.toFixed(2) + ' in' + (s.per ? ' (about ' + Math.ceil(s.min / s.per) + ' inside pages on this paper)' : '') + ', so for now the spine prints as plain colour.';
    if (s.fixed) return 'Spine: ' + s.spine + ' in, set in Content, Print. ' + text;
    return 'Spine: ' + s.spine + ' in for ' + (s.est ? 'about ' : '') + s.pages + ' inside pages' + (s.est ? '' : ' (last PDF build)') + '. ' + text;
  }

  addEventListener('beforeunload', e => { if (!leaving && Object.keys(pendingB64).length && unsaved()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- NEW NOTEBOOK ----------
  // Always opens a fresh notebook from the blank starter (or a copy of a notebook, from COPY), even from /studio/?new itself. Work in
  // progress stays safe: an existing notebook's edits stay in this browser under its own name, and a
  // new notebook with unsaved edits is saved to GitHub first (it then shows in Notebooks).
  // start: the notebook to copy (COPY on a Notebooks card); the blank starter when left out.
  async function startNew(start) {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(NEWKEY) || 'null'); } catch (e) { /* none */ }
    if (IS_NEW && (draft.game.title || '').trim() && unsaved()) {
      const key = (draft.game.slug || '').trim();
      const bad = GH.token() ? await freshSlugProblem(key) : 'not connected';
      if (!bad) { await saveDraft(); if (unsaved()) return; }
      else if (!confirm('Start a new notebook? "' + draft.game.title + '" is not saved yet' + (GH.token() ? ' (it needs a free web address in Content first)' : '') + ', so it will be thrown away.')) return;
    } else if (!IS_NEW && d && d.game && (d.game.title || '').trim() && !d.savedKey) {
      if (!confirm('Start a new notebook? The unsaved new notebook "' + d.game.title + '" in this browser will be thrown away.')) return;
    }
    try { localStorage.removeItem(NEWKEY); if (start) localStorage.setItem(NEWKEY, JSON.stringify({ start })); } catch (e) { /* blocked */ }
    leaving = true;
    history.replaceState(null, '', '/studio/?new#content');
    location.reload();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href="/studio/?new#content"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); startNew(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(a.dataset.copy || '') ? a.dataset.copy : '');
  });

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
      await loadServerDraft();
      const g = saved.game;
      document.title = !CHOSEN ? 'Notebook Studio' : (IS_NEW ? 'New notebook' : g.title) + ' · Notebook Studio';
      NB.applyBrand(Object.assign({ brand: {} }, g, { brand: Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, g.brand || {}) }));
      frame();
      show(tabFromHash() || (!GH.token() ? 'welcome' : !CHOSEN ? 'games' : IS_NEW ? 'content' : 'checklist'));
      loadChecklistFacts();
      addEventListener('hashchange', () => { const t = tabFromHash(); if (t && t !== tab) show(t); });
      try { const w = JSON.parse(sessionStorage.getItem(PDFWATCH) || 'null'); if (w && !IS_NEW && w.folder === FOLDER && Date.now() - w.t0 < 30 * 60000) watchPdfs(w.sha, w.t0); } catch (e) { /* none */ }
      if (isTemplate) {
        const box = document.createElement('label'); box.className = 'ad-help ad-tpl';
        box.innerHTML = '<input type="checkbox" id="ad-tpl"> Let me save changes to the template itself';
        $('#ad-tabs').append(box);
        $('#ad-tpl').onchange = e => { allowTemplate = e.target.checked; updateBar(); };
      }
    } catch (e) {
      if (IS_NEW && FOLDER !== ST.STARTER) { try { localStorage.setItem(NEWKEY, JSON.stringify({ start: ST.STARTER })); } catch (e2) { /* blocked */ } location.reload(); return; }
      document.body.innerHTML = '<p style="padding:24px">Could not load this notebook: ' + esc(e.message) + '</p>';
    }
  });
})();
