/* Notebook kit: the game editor in the studio (/studio/?game=<folder>). Needs kit.js and gh.js.
 *
 * Everything about one notebook in one place:
 *   Checklist    the steps from idea to a live notebook, ticked off as you go
 *   Website     words on the public page, specs, how it works, price and order link
 *   Colors       the colour scheme, with presets
 *   Rules        rules.md (shown on the rules page and printed in the notebook)
 *   Cover        cover.html: front, back and spine
 *   Inside pages contents.html: the pages after the rules. The Game tab picks where the game pages
 *                come from (game.json "pages"): this HTML, a link, or a generator's saved edition
 *   Media        gallery photos and videos
 *   Sampler      pick which parts go in the free sampler and their order (game.json "sampler")
 *   Bundle       print settings (trim, bleed, spine); build the cover, contents, print-at-home and sampler PDFs
 * Edits are kept as a draft in this browser and shown live in the preview. The title bar's
 * SAVE keeps them on GitHub (studio-drafts branch, not live); then the same button reads SAVED. PUBLISH?
 * and commits them to main in one go, and the site republishes and the PDFs rebuild.
 * (Copies kept on the studio-drafts branch, by older studios or when starting another new notebook, still open and can be thrown away.)
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
  const FILES = { game: 'game.json', rules: 'rules.md', cover: 'cover.html', contents: 'contents.html', sampler: 'sampler.html' };
  // The free sampler is built from parts the Sampler tab picks and orders (game.json "sampler",
  // Kevin, 2026-11-28). The same keys are in build-pdfs.js. With no list it is SAMPLER_DEFAULT.
  // sampler.html is the "sample game sheet" part; a notebook without one gets one game sheet
  // from its inside pages.
  const SAMPLER_PARTS = {
    front: ['Front cover', 'Your chosen cover, with the SAMPLER stamp'],
    rules: [null, 'The notebook\'s rules'], // the name is the rules name
    scoring: ['Scoring pages', 'The fixed pages after the rules'],
    game: ['Game pages', 'Game sheets from the notebook\'s game pages'],
    sampler: ['Sample game sheet', 'The sheet made for the sampler'],
    back: ['Back cover', 'The notebook\'s back cover'],
  };
  const SAMPLER_DEFAULT = ['front', 'rules', 'scoring', 'sampler'];
  const samplerPicked = () => Array.isArray(draft.game.sampler) ? [...new Set(draft.game.sampler)].filter(k => SAMPLER_PARTS[k]) : SAMPLER_DEFAULT.slice();
  // How many of each non-cover part go in the sampler (game.json "samplerQty"; 1 when not set).
  const samplerQty = k => /^(front|back)$/.test(k) ? 1 : Math.max(1, Math.min(99, Math.floor(+((draft.game.samplerQty || {})[k]) || 1)));
  const samplerName = k => SAMPLER_PARTS[k][0] || NB.rulesName(draft.game);
  const samplerFrom = contents => {
    const x = splitContents(contents);
    if (!x) return contents;
    return x.head.replace(/<title>[^<]*<\/title>/i, '<title>Sampler</title>') + '\n\n' +
      (x.game.trim() ? '<template data-repeat="1">\n' + x.game + '\n</template>\n\n' : '') + x.tail.replace(/^\s+/, '');
  };
  const PRESETS = NB.PRESETS; // in kit.js, shared with the studio
  // The tabs under the Pages header in the nav.
  const PAGES = ['rules', 'scoring', 'game'];
  const TABS = [['welcome', 'Welcome'], ['connect', 'Connect'], ['games', 'Notebooks'], ['colors', 'Colors'], ['media', 'Media'], ['content', 'Website'], ['cover', 'Covers'], ['rules', 'Rules'], ['scoring', 'Scoring'], ['game', 'Game'], ['sampler', 'Sampler'], ['pdfs', 'Bundle'], ['checklist', 'Checklist'], ['history', 'History'], ['ideas', 'Ideas']];
  const ALIAS = { contents: 'scoring', pages: 'scoring', setup: 'checklist', new: 'content', games: 'games', elements: 'content', website: 'content', generators: 'game' }; // generators open from the Game tab now (Kevin, 2026-11-27)
  const tabFromHash = () => { const h = location.hash.slice(1); const t = ALIAS[h] || h; return TABS.some(x => x[0] === t) ? t : ''; };

  let saved = null;   // { game, rules, cover, contents } as last saved (text, except game)
  let draft = null;   // same shape, being edited
  let build = null;   // pdf/build.json
  let tab = 'colors';
  const pending = (window.NB_PENDING = {}); // images/x.jpg -> data URL, picked but not saved
  // Previews read the editor's current state straight from here (kit.js NB.draft), not from storage.
  window.NB_LIVE_KEY = DKEY;
  window.NB_LIVE = () => draft && { game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, sampler: draft.sampler };
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
  const sig = () => JSON.stringify([draft.game, draft.rules, draft.cover, draft.contents, draft.sampler, Object.keys(pendingB64).sort()]);
  const unsaved = () => IS_NEW ? sig() !== serverSig : (serverSig ? sig() !== serverSig : changed());
  const changed = () => !!saved && (gameText(draft.game) !== gameText(saved.game) || ['rules', 'cover', 'contents', 'sampler'].some(k => draft[k] !== saved[k]) || Object.keys(pendingB64).length > 0);

  function persist() {
    try { localStorage.setItem(DKEY, JSON.stringify({ game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, sampler: draft.sampler, at: Date.now(), start: IS_NEW ? FOLDER : undefined, savedKey: serverKey || undefined, base: serverAt || undefined, pub: pubSig() })); } catch (e) { /* quota or blocked */ }
    if (!$('#ad-bar')) return; // still loading
    updateBar();
    schedulePreview();
  }
  let samplerMissing = false; // no sampler.html on the site yet: PUBLISH writes one
  function clearDraft() { try { localStorage.removeItem(DKEY); } catch (e) { /* blocked */ } }
  // A fingerprint of the published files. This browser's copy remembers it, so a copy made before
  // someone else published (another browser, or a change made on GitHub) isn't laid over the new version.
  function pubSig() {
    if (!saved || IS_NEW) return undefined;
    const t = gameText(saved.game) + '\u0000' + [saved.rules, saved.cover, saved.contents, saved.sampler].join('\u0000');
    let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) >>> 0;
    return t.length + '-' + h.toString(36);
  }
  let staleNote = '';
  // Drops this browser's copy when the notebook was published since it was made. Copies from before
  // the fingerprint existed are checked against the time of the last commit to the notebook's files.
  async function dropStaleDraft() {
    if (IS_NEW) return;
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (e) { return; }
    if (!d || !d.game) return;
    let stale = false;
    if (d.pub) stale = d.pub !== pubSig();
    else if (GH.token() && d.at) {
      try {
        const lists = await Promise.all(Object.values(FILES).map(f => GH.api('/commits?sha=' + GH.BRANCH + '&path=' + encodeURIComponent(FOLDER + '/' + f) + '&per_page=1').catch(() => [])));
        stale = lists.some(l => l && l[0] && new Date(l[0].commit.committer.date).getTime() > d.at);
      } catch (e) { /* keep it */ }
    }
    if (stale) { clearDraft(); staleNote = 'This notebook was published since you last had it open here, so the studio opened the published version.'; }
  }

  // ---------- loading ----------
  async function loadSaved() {
    const read = async f => {
      if (GH.token()) { try { return await GH.readText(FOLDER + '/' + f); } catch (e) { /* fall back to the site */ } }
      const r = await fetch(BASE + f + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error(f + ' not found (' + r.status + ')');
      return r.text();
    };
    const [game, rules, cover, contents, sampler] = await Promise.all([read(FILES.game), read(FILES.rules), read(FILES.cover), read(FILES.contents), read(FILES.sampler).catch(() => null)]);
    samplerMissing = sampler == null;
    saved = { game: JSON.parse(game), rules, cover, contents, sampler: sampler != null ? sampler : samplerFrom(contents) };
    if (IS_NEW) { build = null; return; }
    if (GH.token()) { try { await GH.api('/contents/' + FOLDER + '/admin.html?ref=' + GH.BRANCH); legacyAdmin = true; } catch (e) { legacyAdmin = false; } }
    try { const b = await fetch(BASE + 'pdf/build.json?t=' + Date.now(), { cache: 'no-store' }); build = b.ok ? await b.json() : null; } catch (e) { build = null; }
  }
  const galaxyNumber = () => 100 + Math.floor(Math.random() * 900);
  const isDefaultTitle = g => /^Galaxy \d+$/.test(g.title || '') && !g.slugTouched && g.slug === 'galaxy-' + g.title.slice(7);
  function loadDraft() {
    draft = clone(saved);
    if (IS_NEW) {
      // A fresh notebook from the template: titled Galaxy and a random number (Kevin's default),
      // with the address to match, and nothing ticked. bindNew picks another number if it's taken.
      const n = galaxyNumber();
      Object.assign(draft.game, { slug: 'galaxy-' + n, title: 'Galaxy ' + n, subtitle: 'You are lost in space!', shareText: '', setup: {}, layout: 'product', media: clone(NB.PLACEHOLDER_MEDIA) });
      // Every new notebook's order button starts as ORDER PRINTED NOTEBOOK (Kevin), even when copied from a game
      // that renamed it. It can be renamed on the Website tab.
      draft.game.order = Object.assign({}, draft.game.order, { url: '', label: 'ORDER PRINTED NOTEBOOK' });
      draft.game.print = Object.assign({}, draft.game.print, { sheets: 72 });
      delete draft.game.favicon; delete draft.game.slugTouched;
      freshSig = sig();
    }
    try {
      const d = JSON.parse(localStorage.getItem(DKEY) || 'null');
      if (d && d.carry) { Object.assign(draft.game, d.carry); } // kept when switching templates
      else if (d && d.game) { draft = { game: d.game, rules: d.rules, cover: d.cover, contents: d.contents, sampler: d.sampler != null ? d.sampler : saved.sampler }; draft.at = d.at; }
    } catch (e) { /* none */ }
    draft.game.setup = draft.game.setup || {};
    draft.game.media = draft.game.media || [];
    // Rules are HTML now. Older notebooks wrote them in Markdown, which turns into HTML here.
    htmlRules(saved); htmlRules(draft);
  }
  function htmlRules(o) { if (o && o.rules != null && !NB.isHTML(o.rules)) o.rules = NB.mdSource(o.rules); return o; }

  // ---------- page frame ----------
  function frame() {
    document.body.classList.add('ad-app');
    document.body.innerHTML =
      '<header class="ad-top"><div class="ad-top-in">' +
      '<div class="ad-id"><svg class="ad-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="3" width="15" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 7h4M3 12h4M3 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 9h6M10 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/></svg><span class="ad-studio">THE GAME BUREAU - Game Notebook Studio</span><h1 id="ad-title" hidden></h1></div>' +
      '<div class="ad-actions"' + (CHOSEN ? '' : ' hidden') + '><a class="ad-pdfst" id="ad-pdfst" href="#pdfs" hidden></a>' + (IS_NEW ? '' : '<a class="nb-btn" href="' + BASE + '" target="_blank" rel="noopener">WEBSITE</a>') +
      '<button class="nb-btn ad-discard" id="ad-discard" type="button" title="Throw away changes" hidden>DISCARD</button>' +
      '<button class="nb-btn solid ad-pub" id="ad-publish" type="button"><span data-l="save">SAVE</span><span data-l="pub">SAVED. PUBLISH?</span><span data-l="busy">WORKING…</span></button></div></div>' +
      '<div class="ad-bar" id="ad-bar" role="status"></div><div class="ad-keywarn" id="ad-keywarn" hidden></div></header>' +
      '<div class="ad-shell"><nav class="ad-tabs" id="ad-tabs">' + TABS.map(([k, l]) => (k === 'cover' ? '<div class="ad-tabgrp" role="group" aria-label="The notebook">' : '') +
        // Pages is a header that opens to Rules, Scoring and Game.
        (k === PAGES[0] ? '<button type="button" class="ad-pgs" id="ad-pgs" aria-expanded="false" aria-controls="ad-pgs-sub"' + (locked(k) ? ' disabled' : '') + '>Pages</button><div class="ad-sub" id="ad-pgs-sub" role="group" aria-label="Pages" hidden>' : '') +
        '<button type="button" data-tab="' + k + '"' + (locked(k) ? ' disabled title="Choose a notebook in Notebooks first"' : '') + '>' + l + '</button>' +
        (k === PAGES[PAGES.length - 1] ? '</div></div>' : '')).join('') +
      '</nav>' +
      '<main class="ad-panel" id="ad-panel"></main>' +
      '<aside class="ad-preview" id="ad-preview"></aside></div>';
    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
    $('#ad-pgs').onclick = () => pagesOpen($('#ad-pgs').getAttribute('aria-expanded') !== 'true');
    $('#ad-publish').onclick = () => mode() === 'save' ? saveDraft() : save();
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
    if (mode() === 'save') { bar.className = 'ad-bar show dirty'; bar.innerHTML = 'Not saved yet. Click SAVE at the top.'; }
    else if (mode() === 'pub') { bar.className = 'ad-bar show dirty'; bar.innerHTML = 'Saved, not live yet. Click SAVED. PUBLISH? at the top to put it on the site.'; }
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

  // Opens or closes the Pages header's three tabs. It stays open while one of them is showing.
  function pagesOpen(on) {
    const b = $('#ad-pgs'), sub = $('#ad-pgs-sub'); if (!b || !sub) return;
    if (!on && PAGES.includes(tab)) on = true;
    b.setAttribute('aria-expanded', on); sub.hidden = !on;
  }
  function show(t, keepBar) {
    if (locked(t)) t = 'games';
    tab = t;
    if (PAGES.includes(t)) pagesOpen(true);
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t));
    if (tabFromHash() !== t) history.replaceState(null, '', location.pathname + location.search + '#' + t);
    const panel = $('#ad-panel');
    panel.innerHTML = '';
    ({ welcome: tabWelcome, connect: p => ST.connect(p, () => { updateBar(); keyWarn(); }), games: p => ST.games(p, IS_NEW ? '' : FOLDER), ideas: tabIdeas, checklist: tabSetup, content: tabContent, colors: tabColors, rules: tabRules, cover: tabCover, scoring: p => pagesTab(p, 'scoring'), game: tabGame, sampler: tabSampler, media: tabMedia, pdfs: tabPdfs, history: tabHistory })[t](panel);
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
      colors: [['duo', 'Web and notebook']],
      rules: null, // the Rules tab has a button to the rules page instead of a preview
      cover: null, // Kevin (2026-11-27): no preview pane; clicking a style opens it big (coverPop)
      // Each Pages tab previews only its own pages.
      scoring: [['scoring', 'Scoring pages']],
      game: [['game', 'Game sheets']],
      // The parts picked for the free sampler, in the order they print.
      sampler: samplerPicked().map((k, i) => ['sampler-' + k, (i + 1) + '. ' + samplerName(k) + (samplerQty(k) > 1 ? ' x' + samplerQty(k) : '')]),
    }[t];
    document.querySelector('.ad-shell').classList.toggle('no-preview', !opts);
    document.querySelector('.ad-shell').classList.toggle('wide', t === 'content');
    if (!opts || !opts.length) { pv.innerHTML = opts ? '<p class="ad-help">Nothing is picked for the sampler yet.</p>' : ''; return; }
    if (t === 'colors') {
      // A small sample of this game's own page (its name, photo, words and steps), drawn only to show
      // the four colours at work. Without a photo, a notebook in the game's colours stands in.
      const g = draft.game, e = esc, ph = NB.coverPhoto(g) || (g.media || []).find(m => (m.type === 'image' || !m.type) && m.src);
      const src = ph && (pending[ph.src] || (/^(https?:|\/|data:)/.test(ph.src) ? ph.src : BASE + ph.src));
      const steps = (g.steps || []).filter(x => x && (x.title || x.text)).slice(0, 3);
      pv.innerHTML = '<div class="ad-pv-head"><b>Preview</b><span class="ad-pv-note">This game\'s page in your colours.</span></div>' +
        '<div class="ad-mock" id="ad-mock">' +
        '<div class="mk-bar"><em>The Game Bureau</em><b>' + e((g.title || 'Game').toUpperCase()) + '</b><i>ORDER</i><span>SAMPLER</span><span>RULES</span></div>' +
        '<div class="mk-hero">' + (src ? '<img class="mk-pic" src="' + e(src) + '" alt=""' + NB.focusStyle(ph) + '>' : '<svg class="mk-book" viewBox="0 0 120 150" aria-hidden="true">' +
          '<rect x="14" y="10" width="96" height="132" rx="6" fill="var(--mk-color)"/>' +
          '<rect x="30" y="52" width="64" height="30" rx="3" fill="var(--mk-paper)"/><rect x="38" y="62" width="48" height="4" fill="var(--mk-accent)"/><rect x="38" y="70" width="32" height="3" fill="var(--mk-ink)" opacity=".6"/>' +
          Array.from({ length: 9 }, (_, i) => '<rect x="' + (22 + i * 10) + '" y="2" width="4" height="16" rx="2" fill="var(--mk-ink)"/>').join('') + '</svg>') +
        '<div class="mk-txt"><small>' + e((g.kicker || 'The Game Bureau presents').toUpperCase()) + '</small><h3>' + e(g.title || 'Game') + '</h3>' + (g.subtitle ? '<p class="mk-sub">' + e(g.subtitle) + '</p>' : '') +
          (g.tagline ? '<p>' + e(g.tagline) + '</p>' : '') +
          (g.price ? '<div class="mk-price">' + e(g.price) + ' <span>' + e(g.currency || 'USD') + '</span></div>' : '') +
          '<div class="mk-btns"><span class="mk-buy">' + e(((g.order || {}).label || 'Order printed notebook').toUpperCase()) + '</span><span class="mk-more">' + 'FREE SAMPLER' + '</span></div></div></div>' +
        (steps.length ? '<div class="mk-steps">' + steps.map((x, k) => '<div><em>' + (k + 1) + '</em><b>' + e(x.title || '') + '</b><span>' + e(x.text || '') + '</span></div>').join('') + '</div>' : '') +
        '<div class="mk-foot">' + e((g.title || 'Game').toUpperCase()) + ' &middot; THEGAMEBUREAU.COM</div></div>' +
        '<p class="ad-help">Main: top bar, headings, cover. Accent: highlights and the order button. Paper: page background. Ink: text and lines.</p>';
      renderPreview();
      return;
    }
    const cur = opts.some(o => o[0] === pvMode[t]) ? pvMode[t] : opts[0][0];
    pvMode[t] = cur;
    pv.innerHTML = '<div class="ad-pv-head"><b>Preview</b>' + opts.map(([k, l]) => '<button type="button" data-pv="' + k + '" aria-current="' + (k === cur) + '">' + l + '</button>').join('') +
'<span class="ad-pv-note">' + (SLOW_PV.includes(t) ? 'Redraws when you pause typing or click away.' : 'Unsaved changes show here.') + '</span>' + '</div><div class="ad-pv-box"><iframe id="ad-pv" title="Preview"></iframe></div>';
    pv.querySelectorAll('[data-pv]').forEach(b => { b.onclick = () => { pvMode[t] = b.dataset.pv; previewFor(t); }; });
    renderPreview();
  }
  // The code tabs redraw their (heavier) print previews after a longer typing pause, or right away
  // when you click out of the editor; the others follow every edit.
  const SLOW_PV = ['rules', 'cover', 'scoring', 'game', 'sampler'];
  let pvDrawn = '';
  const pvSig = () => tab + '|' + draft.rules + draft.cover + draft.contents + draft.sampler + JSON.stringify(draft.game);
  document.addEventListener('focusout', e => { if (e.target.matches && e.target.matches('#ad-code, #ad-css') && SLOW_PV.includes(tab) && pvSig() !== pvDrawn) { clearTimeout(pvTimer); renderPreview(); } });
  // A print or web page from the draft, for a preview frame. Kit files load at this kit's version.
  const pvDoc = (html, query) => html
    .replace(/(["'])(\/studio\/kit\/[\w.-]+\.(?:js|css))(\?[^"']*)?\1/g, (m, q, u) => q + u + '?v=' + KITV + q)
    .replace(/<head>/i, '<head><base href="/' + FOLDER + '/"><meta name="nb-query" content="' + query + '"><meta name="nb-draft" content="' + esc(DKEY) + '">') + '<!-- ' + Date.now() + ' -->'; // a new value each time, so the frame always reloads
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(renderPreview, SLOW_PV.includes(tab) ? 1500 : 450); }
  // Colors tab Notebook preview: front cover, every inside page in order, back cover, one at a time.
  let nbAt = 0, nbPages = [];
  // Waits for print.js in a frame, then calls done(document).
  function whenLaid(f, done) {
    f.onload = () => {
      let tries = 0;
      const go = () => {
        let d; try { d = f.contentDocument; } catch (e) { return; }
        if (!d || !d.body) return;
        if (d.body.dataset.ready !== '1' && tries++ < 40) return setTimeout(go, 150);
        const tb = d.querySelector('.pk-toolbar'); if (tb) tb.remove();
        d.documentElement.style.overflow = 'hidden';
        done(d);
      };
      go();
    };
  }
  // Zooms a frame so el fits (by width only for a tall rules flow), and scrolls to it.
  function fitTo(f, d, el) {
    if (!el) return;
    d.documentElement.style.zoom = 1;
    const tall = el.offsetHeight > el.offsetWidth * 1.6;
    const z = tall ? f.clientWidth / (el.offsetWidth + 16) : Math.min(f.clientWidth / (el.offsetWidth + 16), f.clientHeight / (el.offsetHeight + 16));
    d.documentElement.style.zoom = z;
    const w = d.defaultView, r = el.getBoundingClientRect(); w.scrollTo(0, Math.max(0, r.top + w.scrollY - 8));
  }
  function nbGo(i) {
    const fr = $('#ad-pv-front'), ins = $('#ad-pv-inside'), bk = $('#ad-pv-back'); if (!fr) return;
    const last = nbPages.length + 1;
    nbAt = Math.max(0, Math.min(last, i));
    fr.hidden = nbAt !== 0; bk.hidden = nbAt !== last; ins.hidden = nbAt === 0 || nbAt === last;
    try {
      if (!ins.hidden) { nbPages.forEach((el, k) => { el.style.display = k === nbAt - 1 ? '' : 'none'; }); fitTo(ins, ins.contentDocument, nbPages[nbAt - 1]); }
      else { const f = fr.hidden ? bk : fr, d = f.contentDocument; if (d && d.body && d.body.dataset.ready === '1') fitTo(f, d, d.querySelector('.pk-cover')); }
    } catch (e) { /* still loading */ }
    $('#ad-nb-at').textContent = nbAt === 0 ? 'Front cover' : nbAt === last ? 'Back cover' : 'Page ' + nbAt + ' of ' + nbPages.length;
    $('#ad-nb-prev').disabled = nbAt === 0; $('#ad-nb-next').disabled = nbAt === last;
  }
  function renderColorsPreview() {
    const m = $('#ad-mock'); if (!m) return;
    const b = Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, draft.game.brand || {});
    ['color', 'accent', 'paper', 'ink'].forEach(k => m.style.setProperty('--mk-' + k, b[k]));
  }
  function renderPreview() {
    if (tab === 'colors') return renderColorsPreview();
    const f = $('#ad-pv');
    if (!f) return;
    pvDrawn = pvSig();
    let mode = pvMode[tab];
    // The sampler's game page from a link or a generator edition previews like the Game tab does.
    if (mode === 'sampler-game' && NB.pagesSource(draft.game).source !== 'html') mode = 'game';
    const doc = pvDoc;
    const box = f.parentElement;
    box.className = 'ad-pv-box ' + (['page', 'rules'].includes(mode) ? 'web' : 'print');
    const shells = GH.shells(FOLDER, draft.game);
    if (mode === 'page') f.srcdoc = doc(shells['index.html'], '');
    else if (mode === 'rules') f.srcdoc = doc(shells['rules.html'], '');
    else if (mode === 'spread') f.srcdoc = doc(coverTagged(), 'layout=spread&spine=' + spineInfo().spine);
    else if (['front', 'back'].includes(mode)) f.srcdoc = doc(coverTagged(), 'layout=' + mode);
    else if (mode === 'contents') f.srcdoc = doc(draft.contents, 'bleed=1');
    else if (mode === 'nobleed') f.srcdoc = doc(draft.contents, 'bleed=0');
    else if (mode === 'game' && gameSrcUrl()) { box.className = 'ad-pv-box web'; f.removeAttribute('srcdoc'); f.src = gameSrcUrl(); return; }
    else if (mode === 'game' && NB.pagesSource(draft.game).source !== 'html') {
      const gs = NB.pagesSource(draft.game);
      box.className = 'ad-pv-box web';
      f.removeAttribute('src');
      f.srcdoc = '<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:90vh;font:16px system-ui,sans-serif;color:#555;text-align:center;padding:24px">' +
        '<p>' + (gs.source === 'link' ? 'Paste the game pages link to see the pages here.' : IS_NEW ? 'Publish the notebook, then make and SAVE an edition in the generator. Its pages show here.' : 'No saved edition yet. OPEN THE GENERATOR, GENERATE, then SAVE. Its pages show here.') + '</p></body>';
      return;
    }
    else if (mode === 'scoring' || mode === 'game') f.srcdoc = doc(draft.contents, 'bleed=1&only=' + mode);
    else if (mode === 'sampler-sampler') f.srcdoc = doc(draft.sampler, 'bleed=0&part=sampler&repeat=' + samplerQty('sampler'));
    else if (mode === 'sampler-front') f.srcdoc = doc(coverTagged(), 'layout=front&stamp=sampler');
    else if (mode === 'sampler-back') f.srcdoc = doc(coverTagged(), 'layout=back');
    else if (mode === 'sampler-rules') f.srcdoc = doc(draft.contents, 'bleed=0&only=rules');
    else if (mode === 'sampler-scoring') f.srcdoc = doc(draft.contents, 'bleed=0&only=scoring');
    else if (mode === 'sampler-game') f.srcdoc = doc(draft.contents, 'bleed=0&only=game&repeat=' + samplerQty('game'));
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
          if (tab === 'cover') bindCoverEdit(d);
          if (tab === 'scoring' || tab === 'game') pageMap(d, d.documentElement.style.zoom || 1);
        };
        fit();
      } catch (e) { /* not ready */ }
    };
  }

  // ---------- page map (Inside pages) ----------
  // A strip at the top of the preview: a small picture of each kind of page, in order, with
  // repeated pages shown once (x72), and the total. Click one to jump to it.
  function pageMap(d, z) {
    const els = [...d.querySelectorAll('.flow, .page')];
    const page = d.querySelector('.page');
    if (!els.length) return;
    const P = Object.assign({ padTo: 2 }, draft.game.print || {});
    const pw = (page || els[0]).offsetWidth, ph = page ? page.offsetHeight : els[0].offsetWidth * (P.trim ? P.trim[1] / P.trim[0] : 11 / 8.5);
    const sig = el => el.className + '|' + el.innerHTML.replace(/\d+/g, '#').replace(/\s+/g, ' ');
    const label = el => {
      if (el.matches('.flow')) return 'Rules';
      const h = el.querySelector('h1, h2, h3');
      const t = h ? h.textContent.split(draft.game.title || '\u0000').join('').replace(/^[\s·:–-]+/, '').replace(/[·:#-]?\s*(game|sheet|page|no\.?)?\s*\d+\s*$/i, '').replace(/\s+/g, ' ').trim() : '';
      return t ? (t.length > 28 ? t.slice(0, 27) + '…' : t) : el.closest('template') || /\d/.test(h ? h.textContent : '') ? 'Game sheet' : 'Page';
    };
    const groups = [];
    let total = 0;
    els.forEach(el => {
      let n = 1;
      if (el.matches('.flow')) {
        const cs = d.defaultView.getComputedStyle(el), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        n = Math.max(1, Math.ceil((el.scrollHeight - pad - 2) / (ph - pad)));
      }
      total += n;
      const k = sig(el), last = groups[groups.length - 1];
      if (last && last.k === k) last.n += n; else groups.push({ k, el, n, label: label(el), from: total - n + 1 });
    });
    const pad = Math.max(1, P.padTo | 0), blanks = (pad - total % pad) % pad;
    const px = v => (v / z) + 'px';
    const T = 70; // thumbnail width on screen
    const map = d.createElement('div');
    map.className = 'pk-map';
    map.style.cssText = 'margin:' + px(16) + ' auto 0;max-width:' + pw + 'px;background:#fff;border-radius:' + px(8) + ';padding:' + px(12) + ';font:600 ' + px(12) + '/1.3 system-ui,sans-serif;color:#16181a';
    map.innerHTML = '<div style="margin-bottom:' + px(8) + '"><b>Page map</b> · ' + total + ' inside page' + (total === 1 ? '' : 's') + (blanks ? ', plus ' + blanks + ' blank to make ' + (total + blanks) : '') + '</div>';
    const row = d.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:' + px(10);
    groups.forEach(g => {
      const item = d.createElement('button');
      item.type = 'button';
      item.title = 'Go to ' + g.label;
      item.style.cssText = 'all:unset;cursor:pointer;display:grid;gap:' + px(4) + ';width:' + px(T) + ';text-align:center';
      const pic = d.createElement('div');
      pic.style.cssText = 'width:' + px(T) + ';height:' + px(T * ph / pw) + ';overflow:hidden;border:1px solid #c9cdd2;border-radius:' + px(3) + ';position:relative;background:var(--paper)';
      const c = g.el.cloneNode(true);
      c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
      c.style.cssText = 'position:absolute;left:0;top:0;margin:0;box-shadow:none;width:' + pw + 'px;height:' + ph + 'px;overflow:hidden;transform-origin:0 0;transform:scale(' + (T / z / pw) + ');pointer-events:none';
      pic.appendChild(c);
      const cap = d.createElement('span');
      cap.style.cssText = 'font-size:' + px(11) + ';line-height:1.25';
      cap.innerHTML = '<span style="display:block">' + esc(g.label) + (g.n > 1 ? ' <b>×' + g.n + '</b>' : '') + '</span><span style="color:#666;font-weight:400">' + (g.n > 1 ? 'pages ' + g.from + '–' + (g.from + g.n - 1) : 'page ' + g.from) + '</span>';
      item.append(pic, cap);
      item.onclick = () => g.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      row.appendChild(item);
    });
    map.appendChild(row);
    d.body.insertBefore(map, d.body.firstChild);
  }

  // ---------- editing cover words in the preview ----------
  // Each element in cover.html whose content is only text (no tags inside) gets data-cve="<n>"
  // in the preview copy, n being where its text sits in cover.html. Clicking it in the preview
  // opens a box to change that text, which is written back into cover.html at that spot.
  let coverSnap = '', coverSpots = [];
  const FIELD_NAMES = { title: 'Title', subtitle: 'Subtitle', tagline: 'Tagline', kicker: 'Small line above the title', price: 'Price' };
  function coverTagged() {
    const src = draft.cover, body = src.search(/<body[\s>]/i);
    coverSnap = src; coverSpots = [];
    if (body < 0) return src;
    let out = src.slice(0, body), i = body;
    const re = /<([a-zA-Z][\w-]*)(\s[^<>]*?)?(\/?)>/g;
    re.lastIndex = body;
    let m;
    while ((m = re.exec(src))) {
      const name = m[1].toLowerCase(), end = m.index + m[0].length;
      if (name === 'body' || m[3] || ['script', 'style', 'template'].includes(name)) continue;
      const close = '</' + name + '>';
      const next = src.indexOf('<', end);
      if (next < 0 || src.slice(next, next + close.length).toLowerCase() !== close) continue;
      const text = src.slice(end, next);
      if (!text.trim() || /\{\{(steps|specs|description|image)\}\}/.test(text)) continue;
      const n = coverSpots.push({ from: end, to: next, text }) - 1;
      out += src.slice(i, end - 1) + ' data-cve="' + n + '">';
      i = end;
    }
    return out + src.slice(i);
  }
  function bindCoverEdit(d) {
    if (d.body.dataset.cveBound) return;
    d.body.dataset.cveBound = '1';
    const st = d.createElement('style');
    st.textContent = '[data-cve]{cursor:text}[data-cve]:hover{outline:2px dashed #2A7DE1;outline-offset:2px}.pk-steps:hover,.pk-specs:hover,.pk-image:hover,.pk-art:hover{outline:2px dashed #999;outline-offset:2px;cursor:pointer}';
    d.head.appendChild(st);
    d.addEventListener('click', e => {
      const gen = e.target.closest('.pk-steps, .pk-specs, .pk-image, .pk-art');
      const el = e.target.closest('[data-cve]');
      if (!el && !gen) return;
      e.preventDefault();
      if (gen) return coverEditBox(null, gen.matches('.pk-steps') ? 'steps' : gen.matches('.pk-specs') ? 'specs' : 'image');
      coverEditBox(+el.dataset.cve);
    });
  }
  function coverEditBox(n, block) {
    const old = $('#ad-cedit'); if (old) old.remove();
    const box = document.createElement('div');
    box.className = 'ad-cedit'; box.id = 'ad-cedit';
    const close = '<button type="button" class="ad-link" id="ad-cedit-x">Close</button>';
    if (block) {
      const where = block === 'image' ? ['media', 'Media', 'This is the photo marked FOR NOTEBOOK COVER in Media.'] : ['content', 'Website', block === 'steps' ? 'These are the "How it works" steps from the Website tab.' : 'These are the specs from the Website tab.'];
      box.innerHTML = '<p>' + where[2] + '</p><div class="ad-cedit-btns"><button type="button" class="nb-btn" id="ad-cedit-go">OPEN ' + esc(where[1].toUpperCase()) + '</button>' + close + '</div>';
      $('#ad-preview .ad-pv-head').after(box);
      $('#ad-cedit-go').onclick = () => show(where[0]);
      $('#ad-cedit-x').onclick = () => box.remove();
      return;
    }
    const spot = coverSpots[n]; if (!spot) return;
    const decode = t => { const x = document.createElement('textarea'); x.innerHTML = t; return x.value; };
    const only = spot.text.trim().match(/^\{\{(\w+)\}\}$/);
    const field = only && FIELD_NAMES[only[1]] ? only[1] : null;
    if (only && only[1] === 'url') {
      box.innerHTML = '<p>This is the game\'s web address. It comes from the notebook\'s folder name.</p><div class="ad-cedit-btns">' + close + '</div>';
      $('#ad-preview .ad-pv-head').after(box); $('#ad-cedit-x').onclick = () => box.remove(); return;
    }
    const value = field ? (draft.game[field] || '') : decode(spot.text.trim());
    box.innerHTML = '<label><span>' + (field ? esc(FIELD_NAMES[field]) + ' <small>from the Website tab. Changing it here changes it on the game page too.</small>' : 'Cover text' + (/\{\{\w+\}\}/.test(value) ? ' <small>Words in {{double braces}} fill in from the Website tab.</small>' : '')) + '</span>' +
      '<textarea id="ad-cedit-t" rows="' + (value.length > 70 ? 3 : 1) + '">' + esc(value) + '</textarea></label>' +
      '<div class="ad-cedit-btns"><button type="button" class="nb-btn solid" id="ad-cedit-ok">CHANGE IT</button>' + close + '</div>';
    $('#ad-preview .ad-pv-head').after(box);
    const ta = $('#ad-cedit-t'); ta.focus(); ta.select();
    $('#ad-cedit-x').onclick = () => box.remove();
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ad-cedit-ok').click(); } if (e.key === 'Escape') box.remove(); };
    $('#ad-cedit-ok').onclick = () => {
      const v = ta.value.trim();
      if (field) draft.game[field] = v;
      else {
        if (draft.cover !== coverSnap) { updateBar('The cover code changed since the preview was drawn. Try again in a moment.', 'bad'); return; }
        const lead = spot.text.match(/^\s*/)[0], trail = spot.text.match(/\s*$/)[0];
        const enc = v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        draft.cover = draft.cover.slice(0, spot.from) + lead + enc + trail + draft.cover.slice(spot.to);
        const code = $('#ad-code'); if (code) code.value = draft.cover;
      }
      persist(); box.remove(); renderPreview();
      flash(field ? esc(FIELD_NAMES[field]) + ' changed.' : 'Cover text changed. SAVE to keep it.', 'ok');
    };
  }

  // ---------- tab: setup ----------
  function steps() {
    const g = draft.game, s = g.setup || {};
    const starterTag = 'One sentence that says what the game is and why it\'s fun.';
    return [
      IS_NEW ? { k: 'folder', t: 'Create the notebook', d: 'Give it a name and web address on the Website tab, then click SAVE at the top, and SAVED. PUBLISH? to create it on the site.', tab: 'content', done: false }
        : { k: 'folder', t: 'Create the notebook', d: 'Done. The game page lives at /' + FOLDER + '/.', done: true },
      { k: 'content', t: 'Name it and describe it', d: 'Title, tagline, what it is, specs and the three how-it-works steps.', tab: 'content', done: !!(g.title && g.tagline && g.tagline !== starterTag && g.title !== 'Starter Notebook') },
      { k: 'colors', t: 'Pick the colours', d: 'Four colours run through the page, the cover and the inside pages.', tab: 'colors', manual: true, auto: starter && JSON.stringify(g.brand || {}) !== JSON.stringify(starter.brand || {}) },
      { k: 'rules', t: 'Write the rules', d: 'One page if you can. They appear on the rules page and at the front of the notebook.', tab: 'rules', done: !!NB.rulesLink(g) || !/First step\.|Say how the game ends/.test(draft.rules) },
      { k: 'contents', t: 'Design the inside pages', d: 'Scoring pages and the game sheet, in Pages. Set how many game sheets the notebook holds in Bundle.', tab: 'game', manual: true, auto: starter && squash(draft.contents) !== squash(starter.contents) },
      { k: 'cover', t: 'Design the cover', d: 'Front, back and spine. The starter cover fills itself in from your content.', tab: 'cover', manual: true, auto: starter && squash(draft.cover) !== squash(starter.cover) },
      { k: 'sampler', t: 'Pick what goes in the free sampler', d: 'Tick the parts and put them in order in the Sampler tab. The free download on the game page.', tab: 'sampler', manual: true, auto: Array.isArray(g.sampler) },
      { k: 'save', t: 'Save and publish', d: 'Click SAVE at the top, then SAVED. PUBLISH? to put it live. The site republishes in about a minute.', done: !IS_NEW && !changed() && !!saved },
      { k: 'pdfs', t: 'Build and check the PDFs', d: 'They rebuild on their own after each publish. Open each one and check it.', tab: 'pdfs', manual: true, auto: !IS_NEW && !!(build && build.built && lastPublish && new Date(build.built) >= new Date(lastPublish)) },
      { k: 'media', t: 'Add photos and a video', d: (g.media || []).some(m => m && m.placeholder) ? 'The game page still shows placeholder pictures (another company\'s notebook). Replace them in Media before you publish.' : 'Until you add photos, the page shows pictures of the cover and pages from the PDF build.', tab: 'media', done: !(g.media || []).some(m => m && m.placeholder) && (g.media || []).some(m => (m.type === 'image' && m.src) || ((m.type === 'youtube' || m.type === 'vimeo') && m.id) || (m.type === 'video' && m.src)) },
      { k: 'order', t: 'Set up ordering', d: 'Paste a Stripe Payment Link (or any checkout link) and set the price.', tab: 'content', done: !!NB.orderURL(g, 1) },
      { k: 'proof', t: 'Order a printed proof', d: 'Upload the cover and contents PDFs to your printer (Lulu, Amazon KDP) and order one copy to check.', manual: true },
      { k: 'subdomain', t: 'Give it its own web address', d: 'Optional. Make ' + target().split('/').pop() + '.' + GH.SITE + ' forward to this game page with a redirect in Cloudflare. About 5 minutes.', manual: true, html: subdomainHow() },
      { k: 'homepage', t: 'Add this game to the TGB homepage', d: 'Give it a card in the games list on the ' + GH.SITE + ' home page (index.html at the top of the site). This ticks itself once the home page links to /' + target() + '/.', manual: true, auto: !IS_NEW && onHome, html: '<p class="ad-help"><a href="/" target="_blank" rel="noopener">Open the home page</a></p>' },
      { k: 'share', t: 'Share it', d: 'Use the Share button on the game page, or copy https://' + GH.SITE + '/' + target() + '/', manual: true },
    ].map(x => Object.assign(x, {
      // A step ticked or unticked by hand keeps that; otherwise it ticks itself when the editor sees it done.
      byEditor: x.manual && s[x.k] === undefined && !!x.auto,
      done: x.manual ? (s[x.k] !== undefined ? !!s[x.k] : !!x.auto || !!x.done) : !!x.done,
    }));
  }
  // What a notebook looks like straight from the blank starter, and when it was last published,
  // so the checklist can tell what has been done.
  let starter = null, lastPublish = '', onHome = false;
  const squash = t => String(t || '').replace(/\s+/g, ' ').trim();
  async function loadChecklistFacts() {
    const get = f => fetch('/' + ST.STARTER + '/' + f + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : Promise.reject(new Error(f)));
    try { const [g, cover, contents] = await Promise.all([get('game.json'), get('cover.html'), get('contents.html')]); starter = { brand: JSON.parse(g).brand, cover, contents }; } catch (e) { starter = null; }
    if (!IS_NEW) { try { const c = ((await GH.history(FOLDER)) || []).find(x => !/^Rebuild notebook PDFs|\(web page only\)/.test(x.commit.message)); lastPublish = c ? c.commit.author.date : ''; } catch (e) { lastPublish = ''; } }
    // Whether The Game Bureau home page links to this game yet.
    if (!IS_NEW) { try { const home = await fetch('/?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : ''); onHome = new RegExp('href=["\'](https?://(www\\.)?' + GH.SITE.replace(/\./g, '\\.') + ')?/' + FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?["\'#?]').test(home); } catch (e) { onHome = false; } }
    if (tab === 'checklist') show('checklist', true);
  }
  // The short address: <slug>.thegamebureau.com redirects to the game's folder on the main site.
  function subdomainHow() {
    const SLUG = target().split('/').pop(), SUB = SLUG + '.' + GH.SITE;
    const tgt = 'https://' + GH.SITE + '/' + target() + '/';
    const code = t => '<code class="ad-copy" title="Click to copy">' + esc(t) + '</code>';
    // The easiest way: one DNS record and one static redirect in Cloudflare, where the domain lives.
    return '<details class="ad-how"><summary>Show me how</summary><ol>' +
      '<li>In <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Cloudflare</a>, open ' + code(GH.SITE) + ', then <b>DNS, Add record</b>: Type ' + code('AAAA') + ', Name ' + code(SLUG) + ', Address ' + code('100::') + ', <b>Proxied</b>. Save.</li>' +
      '<li><b>Rules, Redirect Rules, Create rule</b>: when Hostname equals ' + code(SUB) + ', redirect (Static, 301) to ' + code(tgt) + '. Deploy.</li>' +
      '<li>After a minute, open <a href="https://' + SUB + '" target="_blank" rel="noopener">' + esc(SUB) + '</a>. It should land on the game page.</li>' +
      '</ol></details>';
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
      (IS_NEW ? '<p class="ad-help">Ticks are saved with the notebook when you click SAVE.</p>' : '<p class="ad-help">Ticks are saved with the notebook. Links: <a href="' + BASE + '" target="_blank" rel="noopener">game page</a> · <a href="' + BASE + 'rules.html" target="_blank" rel="noopener">rules page</a> · <a href="/studio/?new#content">new notebook</a>.</p>');
    p.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {}); }; });
    p.querySelectorAll('[data-step]').forEach(c => { c.onclick = () => { draft.game.setup[c.dataset.step] = c.getAttribute('aria-pressed') !== 'true'; persist(); show('checklist'); }; });
  }

  // ---------- tab: website (id 'content') ----------
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
    // Typing the title on the page fills in the address until the address is typed by hand.
    onTitleEdit = () => { if (!draft.game.slugTouched) { draft.game.slug = ST.slugify(draft.game.title || ''); inp.value = draft.game.slug; check(); } };
    inp.addEventListener('input', () => { draft.game.slugTouched = true; });
    check();
    loadTaken().then(() => {
      // The default "Galaxy <number>" must not match a notebook or folder that already exists.
      const g = draft.game;
      if (isDefaultTitle(g) && slugProblem(g.slug)) {
        const fresh = sig() === freshSig;
        for (let i = 0; i < 200 && slugProblem(g.slug); i++) { const n = galaxyNumber(); g.title = 'Galaxy ' + n; g.slug = 'galaxy-' + n; }
        inp.value = g.slug; if (fresh) freshSig = sig();
        persist(); if (tab === 'content') renderSite();
      }
      check();
    });
  }
  // ---------- changing an existing notebook's web address ----------
  // Moves every file of the game (pages, photos, PDFs) to the new folder in one commit. The old
  // address keeps two small pages that forward to the new one, so shared links keep working, and
  // game.json remembers it (formerAddresses) so History still shows the versions from before.
  function bindMove(p) {
    const open = p.querySelector('#ad-mv-open'); if (!open) return;
    const box = p.querySelector('#ad-mv'), inp = p.querySelector('#f-newslug'), msg = p.querySelector('#ad-mv-msg'), go = p.querySelector('#ad-mv-go');
    const keep = msg.innerHTML;
    const check = () => {
      const v = inp.value.trim(), bad = v === FOLDER ? 'Type the new address.' : slugProblem(v);
      msg.textContent = bad || 'The game page will move to thegamebureau.com/' + v + '/'; msg.style.color = bad && v !== FOLDER ? '#B42318' : ''; go.disabled = !!bad || working;
    };
    open.onclick = () => { box.hidden = false; open.hidden = true; inp.focus(); inp.select(); check(); loadTaken().then(check); };
    p.querySelector('#ad-mv-x').onclick = () => { box.hidden = true; open.hidden = false; msg.innerHTML = keep; msg.style.color = ''; };
    inp.oninput = () => { inp.value = inp.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); check(); };
    go.onclick = () => {
      const v = inp.value.trim();
      if (changed() || serverKey) { updateBar('Publish (or DISCARD) your changes first, then change the address.', 'bad'); return; }
      askBar('Move ' + esc(saved.game.title || FOLDER) + ' from <b>thegamebureau.com/' + esc(FOLDER) + '/</b> to <b>thegamebureau.com/' + esc(v) + '/</b>? It goes live right away. Links to the old address forward to the new one, and the PDFs rebuild with the new address on them.',
        [{ label: 'MOVE IT', solid: true, fn: () => moveTo(v) }]);
    };
  }
  const forwardPage = (to, title) => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + esc(title) + ' has moved</title>\n<meta name="robots" content="noindex">\n<link rel="canonical" href="' + esc(to) + '">\n' +
    '<meta http-equiv="refresh" content="0;url=' + esc(to) + '">\n<script>location.replace(' + JSON.stringify(to) + ' + location.search + location.hash)</script>\n</head>\n<body><p>' + esc(title) + ' has moved to <a href="' + esc(to) + '">' + esc(to) + '</a>.</p></body>\n</html>\n';
  async function moveTo(to) {
    if (!GH.token()) { updateBar('Moving needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); return; }
    if (changed() || serverKey) { updateBar('Publish (or DISCARD) your changes first, then change the address.', 'bad'); return; }
    busy(true); updateBar('Checking thegamebureau.com/' + esc(to) + '/ is free…');
    const bad = await freshSlugProblem(to);
    if (bad) { busy(false); updateBar(esc(bad), 'bad'); return; }
    try {
      const all = await GH.listFiles(), from = FOLDER + '/';
      const mine = all.filter(f => f.path.startsWith(from));
      const g = clone(saved.game); delete g.slugTouched;
      g.slug = to; g.formerAddresses = [FOLDER].concat(g.formerAddresses || []).filter((x, i, a) => x !== to && a.indexOf(x) === i);
      const shells = GH.shells(to, g), out = [];
      mine.forEach(f => {
        const rel = f.path.slice(from.length);
        if (rel !== 'game.json' && !shells[rel]) out.push({ path: to + '/' + rel, sha: f.sha });
        if (rel !== 'index.html' && rel !== 'rules.html') out.push({ path: f.path, delete: true });
      });
      out.push({ path: to + '/game.json', text: gameText(g) });
      Object.entries(shells).forEach(([f, t]) => out.push({ path: to + '/' + f, text: t }));
      out.push({ path: from + 'index.html', text: forwardPage('/' + to + '/', g.title) }, { path: from + 'rules.html', text: forwardPage('/' + to + '/rules.html', g.title) });
      const commit = await GH.commit(out, 'Move ' + g.title + ' from /' + FOLDER + '/ to /' + to + '/', m => updateBar(esc(m)), null, { newFolder: to });
      clearDraft(); leaving = true;
      try { sessionStorage.setItem(PDFWATCH, JSON.stringify({ sha: commit.sha, folder: to, t0: Date.now() })); } catch (e) { /* blocked */ }
      updateBar('Moved. Opening it at its new address…', 'ok');
      location.replace('/studio/?game=' + encodeURIComponent(to) + '#content');
    } catch (e) { busy(false); updateBar('Not moved: ' + esc(e.message), 'bad'); }
  }

  async function createNew() {
    const g = draft.game, slug = (g.slug || '').trim();
    if (!GH.token()) { show('connect'); updateBar('Saving needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); return; }
    if (needs(g)) { show('content'); updateBar(needs(g), 'bad'); return; }
    const bad = await freshSlugProblem(slug);
    if (bad) { show('content'); updateBar(esc(bad), 'bad'); return; }
    busy(true);
    try {
      updateBar('Copying the template…');
      const all = await GH.listFiles();
      const src = all.filter(f => f.path.startsWith(FOLDER + '/') && !f.path.startsWith(FOLDER + '/pdf/') && !/\/\.keep$/.test(f.path));
      const out = [];
      const ours = ['game.json', 'index.html', 'rules.html', 'admin.html', 'rules.md', 'cover.html', 'contents.html', 'sampler.html'];
      const used = JSON.stringify(g) + draft.cover + draft.contents + draft.sampler;
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
      out.push({ path: slug + '/rules.md', text: draft.rules }, { path: slug + '/cover.html', text: draft.cover }, { path: slug + '/contents.html', text: draft.contents }, { path: slug + '/sampler.html', text: draft.sampler });
      Object.entries(GH.shells(slug, game)).forEach(([f, t]) => out.push({ path: slug + '/' + f, text: t }));
      Object.keys(pendingB64).forEach(p => out.push({ path: slug + '/' + p, base64: pendingB64[p] }));
      const commit = await GH.commit(out, 'Start the ' + game.title + ' notebook (from ' + FOLDER + ')', m => updateBar(esc(m)), null, { newFolder: slug });
      try { sessionStorage.setItem(PDFWATCH, JSON.stringify({ sha: commit.sha, folder: slug, t0: Date.now() })); } catch (e) { /* blocked */ }
      Object.keys(pendingB64).forEach(p => { delete pendingB64[p]; });
      clearDraft();
      if (serverKey) await GH.writeDrafts([{ key: serverKey, delete: true }], 'Published ' + game.title + ', so drop its saved draft').catch(() => {});
      updateBar('Published. Opening ' + esc(game.title) + '…', 'ok');
      leaving = true; location.replace('/studio/?game=' + encodeURIComponent(slug) + '#colors');
    } catch (e) {
      updateBar('Not saved: ' + esc(e.message), 'bad');
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
    const photo = (g.media || []).find(NB.realPhoto);
    const src = g.shareImage ? (pending[g.shareImage] || BASE + g.shareImage) : photo ? (pending[photo.src] || (/^(https?:|\/|data:)/.test(photo.src) ? photo.src : BASE + photo.src)) : IS_NEW ? '' : BASE + 'pdf/preview-1.jpg';
    const title = (g.title || 'Your game') + (g.subtitle ? ': ' + g.subtitle : '');
    const msg = g.shareText || (g.title && g.tagline ? g.title + ': ' + g.tagline : '');
    box.innerHTML = (msg ? '<p class="ad-share-msg">' + esc(msg) + ' <span>https://' + esc(url) + '</span></p>' : '') +
      '<div class="ad-share-card"><div class="ad-share-img">' + (src ? '<img src="' + esc(src) + '" alt=""' + (g.shareImage ? '' : NB.focusStyle(photo)) + ' onerror="this.remove()">' : '') + '</div>' +
      '<div class="ad-share-txt"><small>' + esc(GH.SITE.toUpperCase()) + '</small><b>' + esc(title) + '</b><span>' + esc(g.tagline || g.title || '') + '</span></div></div>';
  }

  // The game page itself, drawn from the draft in a frame, with its words editable in place.
  // Things the page doesn't show (web address, dates, order link, share message) sit below it.
  // Kevin's Stripe dashboard, open on a new product. Only the studio shows it, never a game page.
  const STRIPE_NEW_PRODUCT = 'https://dashboard.stripe.com/acct_1MF10bBFJf3v75By/products?status=active&amp;listId=active&amp;source=product_list&amp;create=product';
  const PH = { title: 'Title', subtitle: 'Subtitle', price: 'Price', tagline: 'One sentence that says what the game is and why it\'s fun.', 'order.shippingNote': 'Small print under the price (optional)' };
  let sitePH = new Set(), siteTimer = null, siteEditing = false, onTitleEdit = null;
  // A copy of the game for the editor: empty words get grey placeholders so there is something to click.
  function siteCopy() {
    const g = clone(draft.game); sitePH = new Set();
    Object.entries(PH).forEach(([k, v]) => { if (!String(get(g, k) || '').trim()) { set(g, k, v); sitePH.add(k); } });
    g.order = g.order || {};
    if (!(g.description || []).length) { g.description = ['Two or three short paragraphs about the game: who plays, what you do, and what makes it fun.']; sitePH.add('description'); }
    if (!(g.steps || []).length) { g.steps = [{ title: 'Step title', text: 'What happens' }]; sitePH.add('steps.0.title'); sitePH.add('steps.0.text'); }
    if (String(g.announce || '').trim()) { delete g.announceFrom; delete g.announceUntil; }
    return g;
  }
  // Sets a value by path, making arrays for numeric keys (steps.0.title, specs.1.0).
  function setPath(o, p, v) {
    const ks = p.split('.'), last = ks.pop();
    const t = ks.reduce((a, k, i) => (a[k] = a[k] || (/^\d+$/.test(ks[i + 1] || last) ? [] : {})), o);
    t[last] = v;
  }
  function renderSite() {
    const f = $('#ad-site'), box = $('#ad-site-box'); if (!f || !box) return;
    const key = DKEY + '#site';
    try { localStorage.setItem(key, JSON.stringify({ game: siteCopy(), rules: draft.rules, at: Date.now() })); } catch (e) { /* blocked */ }
    // The page fills the box; it is scaled down only between phone and desktop widths.
    // sizeSite runs again whenever the box changes width, so the page always fills it.
    const sizeSite = () => {
      const avail = box.clientWidth || 860, W = avail < 760 || avail > 1100 ? avail : 1100, s = Math.min(1, avail / W);
      f.style.width = W + 'px'; f.style.transform = s < 1 ? 'scale(' + s + ')' : '';
      const d = f.contentDocument, end = d && d.querySelector('.nb-foot');
      if (end) { const h = Math.ceil(end.getBoundingClientRect().bottom + d.defaultView.scrollY); f.style.height = h + 'px'; box.style.height = Math.ceil(h * s) + 2 + 'px'; }
    };
    sizeSite();
    if (window.ResizeObserver && !box._ro) { let w = box.clientWidth; box._ro = new ResizeObserver(() => { if (box.clientWidth !== w) { w = box.clientWidth; box._size(); } }); box._ro.observe(box); }
    box._size = sizeSite;
    const y = window.scrollY;
    f.onload = () => {
      const d = f.contentDocument; let tries = 0;
      const ready = () => {
        if (!d.querySelector('.nb-info') && tries++ < 60) return setTimeout(ready, 100);
        bindSite(d);
        const fit = () => box._size && box._size();
        fit(); setTimeout(fit, 400); d.addEventListener('input', fit);
        window.scrollTo(0, y);
      };
      ready();
    };
    f.srcdoc = pvDoc(GH.shells(FOLDER, draft.game)['index.html'], '').replace('content="' + esc(DKEY) + '"', 'content="' + esc(key) + '"');
  }
  function bindSite(d) {
    const st = d.createElement('style');
    st.textContent = '[data-ed]{cursor:text;outline:1px dashed transparent;outline-offset:3px;border-radius:2px}[data-ed]:hover{outline-color:#2A7DE1}[data-ed]:focus{outline:2px solid #2A7DE1}' +
      '.ed-ph{opacity:.45}.ed-x,.ed-add{font:700 12px system-ui,sans-serif;border:1px solid #2A7DE1;color:#2A7DE1;background:#fff;border-radius:4px;cursor:pointer}' +
      '.ed-x{position:absolute;top:2px;right:2px;width:22px;height:22px;padding:0;opacity:0}li:hover>.ed-x{opacity:1}.nb-specs li,.nb-steps li{position:relative}.ed-add{display:inline-block;margin:10px 0;padding:5px 10px}' +
      'a:not([data-ed]),button:not([data-ed]):not(.ed-x):not(.ed-add){cursor:default}a[data-ed],button[data-ed]{cursor:text}' +
      '.nb-gallery{cursor:pointer}[data-ed]:empty{display:inline-block;min-width:3em;min-height:1em;background:rgba(42,125,225,.08)}';
    d.head.appendChild(st);
    const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
    const ed = (el, path, multi) => { if (!el) return; el.dataset.ed = path; if (multi) el.dataset.multi = '1'; el.contentEditable = 'true'; el.spellcheck = true; if (sitePH.has(path)) el.classList.add('ed-ph'); };
    ed(q('.nb-announce'), 'announce');
    // The rules button under the free sampler: its words are the rules name (How to Play, Field Guide...). Empty means Rules.
    // The one in the top bar always says RULES.
    const rl = q('.nb-free .nb-rules-btn');
    if (rl) { rl.textContent = String(draft.game.rulesName || '').trim() || 'Rules'; rl.style.textTransform = 'uppercase'; ed(rl, 'rulesName'); }
    ed(q('.nb-info .nb-kick'), 'kicker');
    const h1 = q('.nb-info h1');
    if (h1) {
      const sub = h1.querySelector('span');
      h1.innerHTML = '<i style="font-style:normal">' + esc(draft.game.title || PH.title) + '</i>';
      if (sub) h1.appendChild(sub);
      ed(h1.querySelector('i'), 'title'); ed(sub, 'subtitle');
    }
    ed(q('.nb-price b'), 'price'); ed(q('.nb-price span'), 'currency');
    ed(q('#nb-order'), 'order.label');
    ed(q('.nb-ship') || q('.nb-info .nb-fine'), 'order.shippingNote');
    ed(q('.nb-info .nb-tag b') || q('.nb-tag'), 'tagline');
    // The description: lists on the page; while you type, one line per entry with the "- " and "-- " bullet marks.
    const ps = qa('.nb-about > p, .nb-about > ul, .nb-about > h3');
    if (ps.length) {
      const w = d.createElement('div'); ps[0].before(w); ps.forEach(x => w.appendChild(x)); ed(w, 'description', true); if (sitePH.has('description')) w.classList.add('ed-ph');
      w.title = 'Start a line with "- " for a bullet, "-- " for a bullet inside it. A line ending ":" above bullets is their heading.';
      const lines = () => (draft.game.description || []).map(x => '<p>' + esc(x) + '</p>').join('');
      w.addEventListener('focus', () => { if (!sitePH.has('description')) w.innerHTML = lines(); });
      w.addEventListener('blur', () => setTimeout(() => { const K = d.defaultView.NB; if (K && K.descHTML && !sitePH.has('description')) w.innerHTML = K.descHTML(draft.game.description); }, 0));
    }
    qa('.nb-specs li').forEach((li, i) => { ed(li.querySelector('b'), 'specs.' + i + '.0'); ed(li.querySelector('span'), 'specs.' + i + '.1'); li.insertAdjacentHTML('beforeend', '<button type="button" class="ed-x" data-x="specs" data-i="' + i + '" title="Remove">&times;</button>'); });
    const about = q('.nb-about'), specs = q('.nb-specs');
    // "+ Add a spec" goes after the specs; with none yet, where they would be (under the buttons on a product page).
    const specAt = specs || q('.nb-hero.is-product .nb-free') || (about && about.lastElementChild);
    if (specAt) specAt.insertAdjacentHTML('afterend', '<button type="button" class="ed-add" data-add="specs">+ Add a spec</button>');
    const steps = q('.nb-steps');
    if (steps) {
      ed(steps.closest('.nb-card').querySelector('h2'), 'stepsHeading');
      qa('.nb-steps > li').forEach((li, i) => { ed(li.querySelector('h3'), 'steps.' + i + '.title'); ed(li.querySelector('p'), 'steps.' + i + '.text'); if (!sitePH.has('steps.0.title')) li.insertAdjacentHTML('beforeend', '<button type="button" class="ed-x" data-x="steps" data-i="' + i + '" title="Remove">&times;</button>'); });
      steps.insertAdjacentHTML('afterend', '<button type="button" class="ed-add" data-add="steps">+ Add a step</button>');
    }
    // Links and buttons on the page don't go anywhere while editing.
    d.addEventListener('click', e => {
      const x = e.target.closest('.ed-x, .ed-add');
      if (x) {
        e.preventDefault(); const k = x.dataset.x || x.dataset.add, list = draft.game[k] = draft.game[k] || [];
        if (x.dataset.x) list.splice(+x.dataset.i, 1); else list.push(k === 'specs' ? ['LABEL', 'Value'] : { title: 'Step title', text: 'What happens' });
        persist(); renderSite(); return;
      }
      if (e.target.closest('.nb-gallery')) { e.preventDefault(); e.stopPropagation(); flash('Photos and videos are set in <a href="#media">Media</a>.'); return; }
      // Links and buttons are only for show: nothing opens, plays or goes anywhere. Words marked
      // data-ed (the Rules and order buttons) can still be clicked into and renamed.
      // The QTY - and + work, so the price can be seen changing with the quantity.
      if (e.target.closest('[data-q]')) return;
      if (e.target.closest('a, button, [role=button], summary, label')) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    ['auxclick', 'dblclick', 'submit'].forEach(t => d.addEventListener(t, e => { if (t === 'submit' || e.target.closest('a, button')) { e.preventDefault(); e.stopImmediatePropagation(); } }, true));
    d.addEventListener('focusin', e => { const el = e.target.closest('[data-ed]'); if (!el) return; siteEditing = true; if (el.classList.contains('ed-ph')) { el.dataset.ph = el.innerHTML; el.innerHTML = ''; } });
    // A placeholder clears when clicked, and comes back if nothing was typed.
    d.addEventListener('focusout', e => { siteEditing = false; const el = e.target.closest && e.target.closest('[data-ed]'); if (el && el.dataset.ph != null && !el.textContent.trim()) { el.innerHTML = el.dataset.ph; el.classList.add('ed-ph'); } });
    d.addEventListener('keydown', e => { const el = e.target.closest('[data-ed]'); if (el && e.key === 'Enter' && !el.dataset.multi) { e.preventDefault(); el.blur(); } });
    d.addEventListener('paste', e => { if (!e.target.closest('[data-ed]')) return; e.preventDefault(); d.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    d.addEventListener('input', e => {
      const el = e.target.closest('[data-ed]'); if (!el) return;
      el.classList.remove('ed-ph'); sitePH.delete(el.dataset.ed);
      const path = el.dataset.ed;
      const v = el.dataset.multi ? el.innerText.split(/\n+/).map(x => x.trim()).filter(Boolean) : (path === 'rulesName' ? el.textContent : el.innerText).replace(/\s+/g, ' ').trim(); // innerText would bring back the button's capitals
      if (/^steps\.0\./.test(path) && sitePH.size && !(draft.game.steps || []).length) draft.game.steps = [{ title: '', text: '' }];
      setPath(draft.game, path, v);
      const inp = document.querySelector('#ad-panel [data-path="' + path + '"]'); if (inp) inp.value = v;
      if (path === 'title' && onTitleEdit) onTitleEdit();
      persist(); sharePreview(); annStatus();
    });
  }

  function tabContent(p) {
    const g = draft.game;
    g.print = g.print || {}; g.order = g.order || {};
    onTitleEdit = null;
    p.innerHTML = '<h2>Website</h2><p class="ad-lede">This is the game\'s web page. Click any words on it to change them.</p>' +
      '<div class="ad-bands ad-addr"><div class="ad-band">' +
      // The web address: made from the title for a new notebook (editable), fixed once it exists.
      (IS_NEW ? '<label class="ad-field" for="f-slug"><span>Web address</span><span class="st-url"><b>thegamebureau.com/</b><input id="f-slug" value="' + esc(g.slug || '') + '" placeholder="pitch-count" autocomplete="off" spellcheck="false"></span><small id="f-slug-msg"></small></label>'
        : '<div class="ad-field"><span>Web address</span><span class="st-url is-fixed"><b>thegamebureau.com/</b><a href="' + esc(BASE) + '" target="_blank" rel="noopener">' + esc(FOLDER) + '/</a>' +
          (isTemplate || FOLDER.includes('/') ? '' : '<button type="button" class="nb-btn ad-mv-open" id="ad-mv-open">CHANGE</button>') + '</span>' +
          '<div class="ad-mv" id="ad-mv" hidden><span class="st-url"><b>thegamebureau.com/</b><input id="f-newslug" value="' + esc(FOLDER) + '" autocomplete="off" spellcheck="false"></span>' +
          '<div class="nb-row"><button type="button" class="nb-btn solid" id="ad-mv-go">MOVE TO THIS ADDRESS</button><button type="button" class="nb-btn" id="ad-mv-x">CANCEL</button></div></div>' +
          '<small id="ad-mv-msg">' + ((g.formerAddresses || []).length ? 'Old address' + (g.formerAddresses.length > 1 ? 'es' : '') + ' ' + g.formerAddresses.map(x => 'thegamebureau.com/' + esc(x) + '/').join(', ') + ' forward here.' : 'The game page lives here.') + '</small></div>') +
      '</div></div>' +
      // The web address sits above the page; the rest of what isn't on the page goes below it.
      '<div class="ad-site-box" id="ad-site-box"><iframe id="ad-site" title="Game page, editable"></iframe></div>' +
      '<h3>Not shown on the page</h3>' +
      '<div class="ad-bands"><div class="ad-band">' + field('announce', 'Announcement strip', { help: 'Optional. A coloured strip under the top bar. Once it has words you can also change them on the page.' }) +
      '<div class="ad-dates">' + field('announceFrom', 'Show the strip from', { type: 'date' }) + field('announceUntil', 'Until', { type: 'date' }) + '</div>' +
      '<p class="ad-help ad-ann-status" id="ad-ann-status"></p>' +
      '</div><div class="ad-band">' +
      field('order.url', 'Order link', { ph: 'https://buy.stripe.com/...', help: 'A Stripe Payment Link opens checkout at the quantity the buyer picked, with the same price and shipping as the link. Any other link opens as is. Leave it empty until you have a link: the order buttons still show, and clicking them says printed copies are coming soon.' +
        ' <a href="' + STRIPE_NEW_PRODUCT + '" target="_blank" rel="noopener">Create a product in Stripe ↗</a>, then make a Payment Link for it and paste that link here.' }) +
      '</div><div class="ad-band">' +
      field('shareText', 'Share message', { help: 'What the Share button sends with the link.' }) +
      '<div class="ad-field"><span>How a shared link looks</span><div id="ad-share" class="ad-share"></div><small>In texts and social posts. It updates as you type; the picture is the SHARE PICTURE from Media, or the cover once the PDFs are built.</small></div>' +
      '</div></div>';
    bindFields(p);
    if (IS_NEW) bindNew(p); else bindMove(p);
    sharePreview(); p.addEventListener('input', sharePreview);
    annStatus(); p.addEventListener('input', annStatus); p.addEventListener('change', annStatus);
    // Changes below redraw the page above.
    const redraw = () => { clearTimeout(siteTimer); siteTimer = setTimeout(() => { if (!siteEditing) renderSite(); }, 500); };
    p.querySelectorAll('[data-path]').forEach(el => el.addEventListener('input', redraw));
    setTimeout(renderSite, 0); // after the panel takes its full width
  }
  window.addEventListener('resize', () => { if (tab === 'content') { clearTimeout(siteTimer); siteTimer = setTimeout(renderSite, 300); } });

  // Print settings (game.json print.*): trim, sheets, bleed, margin, padding, spine. Shown on the Bundle tab.
  function printFields() {
    const g = draft.game; g.print = g.print || {};
    return '<fieldset class="ad-print"><legend>Print</legend><div class="ad-grid">' +
      field('print.trim.0', 'Width (in)', { type: 'number', step: '0.01' }) + field('print.trim.1', 'Height (in)', { type: 'number', step: '0.01' }) +
      field('print.sheets', 'Game sheets', { type: 'number', help: 'Fills {{sheets}} in the inside pages.' }) +
      field('print.bleed', 'Bleed (in)', { type: 'number', step: '0.001' }) + field('print.margin', 'Safe margin (in)', { type: 'number', step: '0.01' }) +
      field('print.padTo', 'Pad page count to a multiple of', { type: 'number' }) + field('print.spinePerPage', 'Spine per page (in)', { type: 'number', step: '0.000001', help: 'KDP white paper: 0.002252. Lulu: check its calculator.' }) +
      '</div></fieldset>';
  }

  // ---------- tab: colors ----------
  let colorsAtStart = null; // the scheme when the Colors tab was first opened in this visit, for NEVER MIND
  // Palettes added with "Add a color palette" (palettes.json on studio-drafts, shared by every connected browser).
  // null until read. Each is {name, color, accent, paper, ink, at, by}.
  let myPalettes = null, palDesc = '';
  const fetchPalettes = () => GH.token() ? GH.readPalettes().catch(() => []) : Promise.resolve([]);
  // Every palette in the gallery, A to Z: [name, main, accent, paper, ink, added?].
  const gallery = () => PRESETS.map(x => x.slice(0, 5)).concat((myPalettes || []).map(x => [x.name, x.color, x.accent, x.paper, x.ink, true]))
    .sort((x, y) => x[0].localeCompare(y[0], undefined, { sensitivity: 'base', numeric: true }));
  // The prompt to paste into any chat AI. It asks for one JSON object the paste box below can read.
  function palettePrompt(desc) {
    return 'Please design a 4-color palette for a printed paper notebook game and its web page.\n\n' +
      'What I want: ' + (desc.trim() || '[describe the palette here]') + '\n\n' +
      'The four colors:\n' +
      '- main: top bar, headings, buttons and the cover. Dark enough that white or paper-colored text on it is easy to read.\n' +
      '- accent: highlights, numbers and the order button. Bright, and stands out against main.\n' +
      '- paper: the web page background and the cover. Very light, close to white.\n' +
      '- ink: text and lines. Very dark, easy to read on paper.\n\n' +
      'Also give the palette a short name of 1 to 3 words (for example "Autumn cabin").\n\n' +
      'Reply with ONLY this JSON, in one ```json code block, with each color as a 6-digit hex code:\n' +
      '```json\n{"name": "Palette name", "main": "#RRGGBB", "accent": "#RRGGBB", "paper": "#RRGGBB", "ink": "#RRGGBB"}\n```\n';
  }
  // Reads the AI's answer. Returns {palette} or {error} with a message for the person.
  function parsePalette(raw) {
    raw = (raw || '').trim();
    if (!raw) return { error: 'Paste the AI\'s answer in the box first.' };
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i), body = fence ? fence[1] : raw;
    const i = body.indexOf('{'), j = body.lastIndexOf('}');
    if (i < 0 || j < i) return { error: 'I couldn\'t find a palette in that. The answer should look like {"name": …, "main": "#…", …}. Ask the AI to reply with only the JSON.' };
    let o;
    try { o = JSON.parse(body.slice(i, j + 1).replace(/[“”]/g, '"').replace(/,\s*}/g, '}')); }
    catch (e) { return { error: 'That palette isn\'t written quite right, so I can\'t read it. Ask the AI to reply with only the JSON in one code block, then paste again.' }; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: 'I couldn\'t find a palette in that. Ask the AI to reply with only the JSON.' };
    const low = {}; Object.keys(o).forEach(k => { low[k.toLowerCase().trim()] = o[k]; });
    const name = String(low.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return { error: 'The palette needs a name. Ask the AI to add one, or add "name": "Your name" to the pasted text.' };
    if (name.length > 40) return { error: 'The name "' + name.slice(0, 40) + '…" is too long. Keep it to 40 letters or fewer.' };
    const roles = [['color', ['main', 'color', 'brand', 'primary'], 'main'], ['accent', ['accent', 'highlight'], 'accent'], ['paper', ['paper', 'background'], 'paper'], ['ink', ['ink', 'text'], 'ink']];
    const pal = { name };
    for (const [k, keys, label] of roles) {
      const key = keys.find(x => low[x] != null);
      if (!key) return { error: 'The ' + label + ' color is missing. The answer needs all four: main, accent, paper and ink.' };
      let v = String(low[key]).trim().replace(/^#?/, '#');
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join('');
      if (!/^#[0-9a-f]{6}$/i.test(v)) return { error: 'The ' + label + ' color "' + String(low[key]) + '" isn\'t a color code. It should look like #1F3A5F.' };
      pal[k] = v.toUpperCase();
    }
    const taken = gallery().find(x => x[0].toLowerCase() === name.toLowerCase());
    if (taken) return { error: 'There is already a palette called "' + taken[0] + '". Change the name in the pasted text and click ADD PALETTE again.' };
    return { palette: pal };
  }
  function tabColors(p) {
    const b = draft.game.brand = Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, draft.game.brand || {});
    if (!colorsAtStart) colorsAtStart = Object.assign({}, b);
    const one = (k, l, h) => '<label class="ad-color"><input type="color" data-color="' + k + '" value="' + esc(b[k]) + '"><span><b>' + l + '</b><small>' + h + '</small><input type="text" data-hex="' + k + '" value="' + esc(b[k]) + '" maxlength="7" spellcheck="false"></span></label>';
    p.innerHTML = '<div class="ad-colors-head"><h2>Colors</h2><div class="nb-row ad-nevermind"><button type="button" class="nb-btn" id="ad-nevermind" title="Put back the colours from when you opened this tab" hidden>NEVER MIND</button></div></div><p class="ad-lede">The four colors used for the game notebook website and the game notebook itself.</p>' +
      '<div class="ad-colors">' + one('color', 'Main', 'Top bar, headings, buttons, cover') + one('accent', 'Accent', 'Highlights, numbers, order button') + one('paper', 'Paper', 'Web page background and the cover. Notebook pages always print on white regardless of this Paper color setting.') + one('ink', 'Ink', 'Text and lines') + '</div>' +
      '<h3>Presets</h3><div class="ad-presets" id="ad-presets"></div>' +
      '<h3>Add a color palette</h3><div class="ad-help-box ad-ai ad-addpal">' +
      '<ol><li><label for="ad-pal-desc"><b>Describe the palette you want.</b></label><textarea id="ad-pal-desc" rows="2" placeholder="For example: a cozy autumn cabin, warm rust and mustard with a deep brown">' + esc(palDesc) + '</textarea></li>' +
      '<li>Click <button type="button" class="nb-btn" id="ad-pal-copy">COPY PROMPT</button> and paste it into your AI of choice (Claude, ChatGPT and so on).<span class="ad-pal-note" id="ad-pal-copied"></span></li>' +
      '<li><label for="ad-pal-paste"><b>Paste the AI\'s whole answer here</b></label> and click ADD PALETTE. It joins the presets above and this notebook switches to it.<textarea id="ad-pal-paste" rows="4" spellcheck="false" placeholder="{&quot;name&quot;: &quot;Autumn cabin&quot;, &quot;main&quot;: &quot;#…&quot;, &quot;accent&quot;: &quot;#…&quot;, &quot;paper&quot;: &quot;#…&quot;, &quot;ink&quot;: &quot;#…&quot;}"></textarea>' +
      '<div class="ad-pal-btns"><button type="button" class="nb-btn solid" id="ad-pal-add">ADD PALETTE</button></div><p class="ad-pal-msg" id="ad-pal-msg" role="status"></p></li></ol></div>';
    const same = (x, y) => ['color', 'accent', 'paper', 'ink'].every(k => (x[k] || '').toUpperCase() === (y[k] || '').toUpperCase());
    const asBrand = x => ({ color: x[1], accent: x[2], paper: x[3], ink: x[4] });
    const drawPresets = () => {
      const box = $('#ad-presets'); if (!box) return;
      box.innerHTML = gallery().map(x => '<div class="ad-preset"><button type="button" data-preset="' + esc(x[0]) + '" aria-pressed="' + same(b, asBrand(x)) + '"><span style="background:' + x[1] + '"></span><span style="background:' + x[2] + '"></span><span style="background:' + x[3] + '"></span><span style="background:' + x[4] + '"></span><b>' + esc(x[0]) + '</b></button>' +
        (x[5] ? '<button type="button" class="ad-pal-del" data-pal-del="' + esc(x[0]) + '" title="Remove ' + esc(x[0]) + ' from the presets" aria-label="Remove ' + esc(x[0]) + '">&times;</button>' : '') + '</div>').join('');
    };
    const mark = () => p.querySelectorAll('[data-preset]').forEach(el => { const x = gallery().find(g => g[0] === el.dataset.preset); el.setAttribute('aria-pressed', !!x && same(b, asBrand(x))); });
    const setColor = (k, v) => { if (!/^#[0-9a-f]{6}$/i.test(v)) return; b[k] = v.toUpperCase(); p.querySelector('[data-color="' + k + '"]').value = v; p.querySelector('[data-hex="' + k + '"]').value = b[k]; persist(); };
    const setAll = x => ['color', 'accent', 'paper', 'ink'].forEach(k => setColor(k, x[k]));
    p.querySelectorAll('[data-color]').forEach(el => { el.oninput = () => setColor(el.dataset.color, el.value); });
    p.querySelectorAll('[data-hex]').forEach(el => { el.oninput = () => setColor(el.dataset.hex, el.value.trim()); });
    const nm = $('#ad-nevermind');
    // Colour changes are kept with the rest of the notebook by SAVE in the title bar (Kevin removed SAVE COLORS).
    const sync = () => { nm.hidden = same(b, colorsAtStart); mark(); };
    $('#ad-presets').addEventListener('click', e => {
      const del = e.target.closest('[data-pal-del]');
      if (del) { removePalette(del.dataset.palDel); return; }
      const el = e.target.closest('[data-preset]'); if (!el) return;
      const x = gallery().find(g => g[0] === el.dataset.preset); if (x) setAll(asBrand(x));
      sync();
    });
    p.querySelector('.ad-colors').addEventListener('input', sync);
    nm.onclick = () => { setAll(colorsAtStart); sync(); flash('Colours put back.', 'ok'); };
    drawPresets(); sync();
    if (!myPalettes) fetchPalettes().then(l => { myPalettes = l; if (tab === 'colors') { drawPresets(); sync(); } });

    // Add a color palette: describe it, copy a prompt for any AI, paste its answer back.
    const msg = $('#ad-pal-msg'), say = (t, kind) => { msg.textContent = t; msg.className = 'ad-pal-msg' + (kind ? ' ' + kind : ''); };
    $('#ad-pal-desc').oninput = e => { palDesc = e.target.value; };
    $('#ad-pal-copy').onclick = () => {
      const note = $('#ad-pal-copied');
      if (!palDesc.trim()) { note.textContent = ' Describe the palette first.'; $('#ad-pal-desc').focus(); return; }
      const text = palettePrompt(palDesc);
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { note.textContent = ' Copied. Paste it into your AI chat.'; },
        () => { note.textContent = ' Your browser blocked copying, so here it is to copy yourself:'; note.insertAdjacentHTML('beforeend', '<textarea class="ad-pal-prompt" rows="6" readonly>' + esc(text) + '</textarea>'); });
    };
    $('#ad-pal-paste').oninput = () => say('');
    $('#ad-pal-add').onclick = async () => {
      if (myPalettes == null) myPalettes = await fetchPalettes();
      const r = parsePalette($('#ad-pal-paste').value);
      if (r.error) { say(r.error, 'bad'); return; }
      const x = r.palette;
      setAll(x); sync();
      if (!GH.token()) { say('This notebook now uses ' + x.name + ', but it could not join the presets: connect to GitHub in the Connect tab to keep palettes for every notebook.', 'bad'); return; }
      const btn = $('#ad-pal-add'); btn.disabled = true; say('Adding ' + x.name + '…');
      try {
        const by = await GH.login().catch(() => '');
        const pal = Object.assign({}, x, { at: new Date().toISOString(), by });
        const fresh = await GH.readPalettes(); // re-read so two browsers don't lose each other's palettes
        if (fresh.some(y => y.name.toLowerCase() === x.name.toLowerCase())) throw new Error('someone already added a palette called "' + x.name + '"');
        const next = fresh.concat([pal]);
        await GH.writePalettes(next, 'Add colour palette: ' + x.name);
        myPalettes = next;
        if (tab !== 'colors') return;
        $('#ad-pal-paste').value = ''; drawPresets(); sync();
        say('Added ' + x.name + ' to the presets, and this notebook now uses it. Click SAVE at the top to keep it for this notebook.', 'ok');
      } catch (e) { say('This notebook now uses ' + x.name + ', but it could not join the presets: ' + e.message, 'bad'); }
      finally { const bb = $('#ad-pal-add'); if (bb) bb.disabled = false; }
    };
    async function removePalette(name) {
      if (!confirm('Remove the palette "' + name + '" from the presets? Notebooks already using its colours keep them.')) return;
      try {
        const next = (await GH.readPalettes()).filter(y => y.name !== name);
        await GH.writePalettes(next, 'Remove colour palette: ' + name);
        myPalettes = next; if (tab === 'colors') { drawPresets(); sync(); }
        flash('Removed ' + name + '.', 'ok');
      } catch (e) { updateBar('Could not remove the palette: ' + esc(e.message), 'bad'); }
    }
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
      'It is a fragment of HTML (no <html>, <head> or <body>): <h1> for the one title at the top, <h2> for sections, <h3> for sub-sections, <p>, <ol>/<ul> with <li>, <strong>, <em>, <a href>, <hr>, and <aside class="callout"> for a highlighted tip box. No scripts or style attributes: the page\'s own styles do the look.',
      'Keep <h1>{{title}} rules</h1> first, written exactly like that: {{title}} becomes the game\'s name, and the website swaps "rules" for the game\'s rules name. Keep steps short and clear, in the order players do them.',
    ];
    const common = [
      'This is ' + file + ' for "' + (g.title || 'a notebook game') + '", a paper notebook game sold on ' + GH.SITE + '.',
      'It is printed as a book: trim ' + P.trim[0] + ' x ' + P.trim[1] + ' in, bleed ' + P.bleed + ' in on every outside edge, and a safe margin of ' + P.margin + ' in inside the trim for text.',
      'The page loads /studio/kit/print.css and /studio/kit/print.js, which size and lay out the pages. Keep those tags and the <body> attributes as they are. Use inches or points, never px or vw.',
      'Colours: var(--brand) var(--accent) var(--paper) var(--ink). Fonts: "NB Display" (headings) and "NB Text" (body). Keep it printable: no scripts, animations or web fonts from other sites.',
    ];
    const per = key === 'cover' ? [
      'Design inside .cover-front, .cover-back and .cover-spine. print.js places each one on its panel with bleed and pads it to the safe area. The spine is ' + spineInfo().spine + ' in wide for this notebook (inside pages x paper thickness). Its text is sized to fit and only prints when the spine is at least ' + spineInfo().min.toFixed(2) + ' in, so keep it to one short line.',
      'These are filled in from the game\'s details: {{title}} {{subtitle}} {{tagline}} {{kicker}} {{url}} {{price}}, and as HTML blocks {{steps}} {{specs}} {{description}} {{image}}. {{image}} is the photo marked FOR NOTEBOOK COVER in Media at the time the cover is generated (a pattern of squares when none is marked). Keep them as placeholders rather than typing the text in.',
      'Images go in images/ next to the file (they are uploaded in the studio\'s Media tab): <img src="images/name.jpg">.',
    ] : [
      'Keep <section data-rules></section>: the rules flow in there from rules.md.',
      'Each <section class="page"> is exactly one page, already padded to the safe area. Anything that overflows is cut off, so design to fit one page.',
      '<template data-repeat="{{sheets}}"> repeats the pages inside it ({{sheets}} = ' + ((g.print && g.print.sheets) || 'the number of game sheets') + '). Inside it, {{n}} is the copy number. With data-per="2", {{i}} and {{i+1}} number two items per page.',
      'Put page-specific CSS in the <style> block in the <head>.',
    ].concat(key === 'sampler' ? ['This file is the free sampler\'s own pages only. The sampler PDF is always, in order: the chosen front cover with a SAMPLER stamp, the rules, the scoring pages from contents.html, then these pages. Nothing else. So do not put the rules or the scoring pages here: <section data-rules> is ignored in this file. It is separate from contents.html, so a page changed here does not change the notebook.'] : []);
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
      '<li>Copy the AI\'s whole answer and click <button type="button" class="nb-btn" id="ad-ai-paste">PASTE AI ANSWER</button>. The editor and preview update. Nothing is saved until you click SAVE at the top, and <i>Undo all changes to this file</i> puts it back.</li></ol>' +
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
      const lang = 'html';
      const text = 'Please edit ' + (key === 'rules' ? 'the rules' : 'this page') + ' of my notebook game.\n\n' + aiBrief(key).map(x => '- ' + x).join('\n') +
        '\n\nReply with the complete updated file in one ```' + lang + ' code block, with nothing left out.\n\nWhat I want: [describe your change here]\n\nThe current file:\n```' + lang + '\n' + draft[key] + '\n```\n';
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { msg.textContent = 'Copied. Paste it into your AI chat and replace [describe your change here] with what you want.'; },
        () => { msg.textContent = 'Your browser blocked copying. Select the editor text instead.'; });
    };
    const apply = raw => {
      const m = raw.match(/```(?:html|markdown|md)?[ \t]*\n([\s\S]*?)```/i);
      const code = (m ? m[1] : raw).trim();
      if (key === 'rules' && !NB.isHTML(code)) { msg.textContent = 'That doesn\'t look like the whole rules file. Ask the AI for the complete file in one code block.'; return; }
      if (key !== 'rules' && !/<html[\s>]|<!doctype/i.test(code)) { msg.textContent = 'That doesn\'t look like a whole HTML file. Ask the AI for the complete file in one code block.'; return; }
      draft[key] = code + '\n'; persist(); aiOpen = true; show(tab); aiOpen = false;
      const m2 = $('#ad-ai-msg'); if (m2) m2.textContent = 'Pasted. Check the preview, then click SAVE.';
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
      '<textarea class="ad-code" id="ad-code" spellcheck="false" wrap="' + (key === 'rules' ? 'soft' : 'off') + '">' + esc(draft[key]) + '</textarea>' +
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
  const tabRules = p => {
    rulesTab(p);
    // Where the site's rules buttons go: the rules written here, or a link (a Google Doc, say).
    const g = draft.game, isLink = Object.prototype.hasOwnProperty.call(g, 'rulesLink');
    const v = String(g.rulesLink || '').trim();
    const box = document.createElement('div');
    box.className = 'ad-rules-src';
    box.innerHTML = '<div class="ad-rules-pick" role="radiogroup" aria-label="Where the rules live">' +
      '<button type="button" role="radio" data-src="html" aria-checked="' + !isLink + '"><b>Write them here</b><small>HTML below. The site gets its own rules page.</small></button>' +
      '<button type="button" role="radio" data-src="link" aria-checked="' + isLink + '"><b>Link to them</b><small>A Google Doc or any web page, shown inside the rules page.</small></button></div>' +
      (isLink ? '<label class="ad-field" for="f-rules-link"><span>Rules link</span><input id="f-rules-link" type="url" value="' + esc(v) + '" placeholder="https://docs.google.com/document/d/..." autocomplete="off" spellcheck="false">' +
        '<small id="f-rules-link-msg"></small></label>' +
        '<p class="ad-help">The printed notebook keeps the rules last written under <i>Write them here</i>.</p>' : '');
    // No preview here: a button opens the rules page (or the link) in a new tab.
    const href = IS_NEW ? '' : BASE + 'rules.html';
    box.insertAdjacentHTML('beforeend', '<p class="ad-rules-view">' + (href
      ? '<a class="nb-btn" id="ad-rules-view" href="' + esc(href) + '" target="_blank" rel="noopener">VIEW THE RULES PAGE</a><small>Opens the published page. Changes show there after you publish.</small>'
      : '<small>The rules page goes live when you publish this notebook.</small>') + '</p>');
    p.querySelector('.ad-lede').after(box);
    // With a link, the HTML editor and everything about it is hidden.
    if (isLink) {
      p.querySelector('.ad-lede').textContent = 'Where the rules come from. The rules page on the site shows them.';
      p.querySelectorAll('.ad-ai, #ad-code, .ad-code-foot, #ad-rules-warn, .ad-help-box').forEach(el => el.remove());
    }
    box.querySelectorAll('[data-src]').forEach(b => { b.onclick = () => {
      if (b.dataset.src === 'link') { if (!isLink) draft.game.rulesLink = ''; } else delete draft.game.rulesLink;
      persist(); show(tab);
      const f = $('#f-rules-link'); if (f && !f.value) f.focus();
    }; });
    const inp = $('#f-rules-link');
    if (inp) {
      const msg = () => {
        const t = inp.value.trim(), m = $('#f-rules-link-msg');
        m.innerHTML = !t ? 'Paste the link. Until then the rules page shows the rules written below.'
          : NB.rulesLink({ rulesLink: t }) ? 'The rules page shows <a href="' + esc(t) + '" target="_blank" rel="noopener">this page</a> inside it, with a link to open it in a new tab. For a Google Doc, set sharing to <i>Anyone with the link</i>.'
          : 'That isn\'t a web address. It should start with https://';
      };
      inp.oninput = () => {
        draft.game.rulesLink = inp.value.trim(); persist(); msg();
      };
      msg();
    }
    rulesLength();
  };
  // Words, reading time and printed pages of the rules, under the editor.
  let rulesTimer = null, rulesPages = null;
  function rulesLength() {
    if (!drawRulesLen()) return;
    clearTimeout(rulesTimer);
    rulesTimer = setTimeout(measureRules, 800);
  }
  // Likely mistakes in the rules, shown under the editor.
  function rulesProblems() {
    const g = draft.game, out = [];
    const html = NB.isHTML(draft.rules) ? draft.rules : NB.mdSource(draft.rules);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
    const first = (html.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i) || [])[0] || '';
    if (!/^<h1>\s*\{\{title\}\}\s+rules\s*<\/h1>$/i.test(first.trim())) out.push('The first heading should be <code>&lt;h1&gt;{{title}} rules&lt;/h1&gt;</code>, so the game\'s name and its rules name (' + esc(NB.rulesName(g)) + ') fill in by themselves.');
    if (h1s.length > 1) out.push('There are ' + h1s.length + ' main titles (&lt;h1&gt;). Use &lt;h2&gt; for sections after the first.');
    // Tags opened and never closed (or the other way round) break the layout.
    for (const t of ['p', 'ol', 'ul', 'li', 'h1', 'h2', 'h3', 'strong', 'em', 'aside', 'a']) {
      const o = (html.match(new RegExp('<' + t + '\\b', 'gi')) || []).length, c = (html.match(new RegExp('</' + t + '>', 'gi')) || []).length;
      if (o !== c && !(t === 'p' || t === 'li')) out.push('&lt;' + t + '&gt; is opened ' + o + ' time' + (o === 1 ? '' : 's') + ' but closed ' + c + '.');
    }
    // Players, time and ages should agree with the Website tab's specs.
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
      if (want && m && nums(want).length && !same(nums(m[1]), nums(want))) out.push(name + ': the rules say <b>' + esc(m[0]) + '</b> but the Website tab says <b>' + esc(want) + '</b>.');
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
    const words = (draft.rules.replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\{\{\w+\}\}/g, 'x').replace(/[#>*_`\[\]()-]+/g, ' ').match(/[A-Za-z0-9\u00C0-\uFFFF'’]+/g) || []).length;
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
  const rulesTab = p => codeTab(p, 'rules', 'Rules', 'HTML for the rules. The same rules are the rules page and the first pages of the notebook.',
    '<ul><li><code>&lt;h1&gt;{{title}} rules&lt;/h1&gt;</code> first, then <code>&lt;h2&gt;</code> for sections and <code>&lt;h3&gt;</code> for sub-sections</li><li><code>&lt;p&gt;</code> paragraphs, <code>&lt;ol&gt;</code> numbered steps and <code>&lt;ul&gt;</code> bullet points, each item in <code>&lt;li&gt;</code></li><li><code>&lt;strong&gt;</code> bold, <code>&lt;em&gt;</code> italic, <code>&lt;a href="https://..."&gt;</code> link</li><li><code>&lt;aside class="callout"&gt;</code> makes a highlighted box</li><li><code>&lt;hr&gt;</code> draws a line</li></ul>');
  // The Cover tab has no "How this file works" box: that guidance is in the COPY FOR AI brief (aiBrief).
  // Kevin (2026-11-27): the Covers tab is only the style picker. No AI box, HTML editor or undo link here.
  const tabCover = p => {
    codeTab(p, 'cover', 'Covers', 'Choose the cover style from the choices below. Use the MEDIA tab to select the cover photo.', '');
    p.querySelectorAll('.ad-ai, #ad-code, .ad-code-foot').forEach(el => el.remove());
    coverStyles(p);
  };
  // Ready-made cover designs. Each is a whole cover.html, filled in from this game's details
  // and colours. USE THIS swaps it in (DISCARD in the title bar undoes unsaved changes).
  const COVER_STYLES = [['classic', 'Classic', '/' + ST.STARTER + '/cover.html'], ['photo', 'Big photo', '/studio/kit/covers/photo.html'], ['bold', 'Bold title', '/studio/kit/covers/bold.html'], ['notebook', 'Notebook', '/studio/kit/covers/notebook.html'],
    ['split', 'Split', '/studio/kit/covers/split.html'], ['framed', 'Framed', '/studio/kit/covers/framed.html'], ['badge', 'Badge', '/studio/kit/covers/badge.html'], ['duotone', 'Duotone', '/studio/kit/covers/duotone.html']];
  const coverSrc = {};
  const getCover = u => coverSrc[u] || (coverSrc[u] = fetch(u + '?v=' + KITV, { cache: 'no-cache' }).then(r => r.ok ? r.text() : Promise.reject(new Error('could not load ' + u))));
  function coverStyles(p) {
    const box = document.createElement('div');
    box.className = 'ad-cstyles';
    box.innerHTML =
      '<div class="ad-cstyle-row">' + COVER_STYLES.map(([k, l]) => '<figure class="ad-cstyle"><div class="ad-cstyle-pic" role="button" tabindex="0" data-pop="' + k + '" aria-label="Look at the ' + esc(l) + ' cover, back and front"><iframe data-cstyle="' + k + '" title="' + esc(l) + ' cover" tabindex="-1" loading="lazy"></iframe></div>' +
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
            f.classList.add('ready'); // shown only now, so the unfilled page never flashes by
          };
          fit();
        };
        f.srcdoc = pvDoc(html, 'layout=front');
      }).catch(() => { f.replaceWith(Object.assign(document.createElement('p'), { className: 'ad-help', textContent: 'Could not load this style.' })); });
    });
    box.querySelectorAll('[data-use]').forEach(b => { b.onclick = () => useCoverStyle(b.dataset.use); });
    box.querySelectorAll('[data-pop]').forEach(b => {
      b.onclick = () => coverPop(b.dataset.pop);
      b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); coverPop(b.dataset.pop); } };
    });
  }
  async function useCoverStyle(k) {
    const st = COVER_STYLES.find(x => x[0] === k);
    try {
      const html = await getCover(st[2]);
      draft.cover = html; persist(); show('cover');
      flash('Swapped in the ' + esc(st[1]) + ' cover. Click it to look closer, then SAVE.', 'ok', 8000);
    } catch (e) { updateBar('Could not load that cover style: ' + esc(e.message), 'bad'); }
  }
  // A style's back and front (with the spine) in a pop-up. Click the cover to make it very large,
  // then drag to look around; click again to fit it back on screen. Esc, CLOSE or the dark edge closes it.
  function coverPop(k) {
    const st = COVER_STYLES.find(x => x[0] === k); if (!st) return;
    const old = $('#ad-cpop'); if (old) old.remove();
    const pop = document.createElement('div');
    pop.className = 'ad-cpop'; pop.id = 'ad-cpop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-label', st[1] + ' cover');
    pop.innerHTML = '<div class="ad-cpop-bar"><b>' + esc(st[1]) + '</b><span class="ad-cpop-hint">Back and front. Click to zoom in, drag to look around.</span>' +
      '<button type="button" class="nb-btn solid" id="ad-cpop-use">USE THIS</button><button type="button" class="nb-btn" id="ad-cpop-x">CLOSE</button></div>' +
      '<div class="ad-cpop-stage"><div class="ad-cpop-sheet"><iframe title="' + esc(st[1]) + ' cover, back and front" tabindex="-1"></iframe><div class="ad-cpop-grab"></div></div><p class="ad-cpop-wait">Loading…</p></div>';
    document.body.appendChild(pop);
    document.documentElement.classList.add('ad-cpop-open');
    const stage = pop.querySelector('.ad-cpop-stage'), sheet = pop.querySelector('.ad-cpop-sheet'), f = sheet.querySelector('iframe'), grab = sheet.querySelector('.ad-cpop-grab');
    let W = 0, H = 0, s = 1, x = 0, y = 0, zoomed = false;
    const place = () => { sheet.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')'; };
    const fitS = () => Math.min((stage.clientWidth - 24) / W, (stage.clientHeight - 24) / H);
    const clamp = () => {
      const sw = W * s, sh = H * s, cw = stage.clientWidth, ch = stage.clientHeight;
      x = sw <= cw ? (cw - sw) / 2 : Math.min(0, Math.max(cw - sw, x));
      y = sh <= ch ? (ch - sh) / 2 : Math.min(0, Math.max(ch - sh, y));
    };
    const fit = () => { zoomed = false; s = fitS(); clamp(); place(); pop.classList.remove('zoomed'); };
    const zoomAt = (px, py) => {
      // About 1.6 times real size, and always well past the fitted size.
      const ns = Math.max(1.6, fitS() * 3);
      x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns; zoomed = true; clamp(); place(); pop.classList.add('zoomed');
    };
    const close = () => { pop.remove(); document.documentElement.classList.remove('ad-cpop-open'); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const onResize = () => { if (!W) return; if (zoomed) { clamp(); place(); } else fit(); };
    document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
    pop.querySelector('#ad-cpop-x').onclick = close;
    pop.querySelector('#ad-cpop-use').onclick = () => { close(); useCoverStyle(k); };
    stage.addEventListener('click', e => { if (e.target === stage) close(); });
    // Drag to pan; a press that barely moves counts as a click and toggles the zoom.
    let down = null;
    grab.addEventListener('pointerdown', e => { down = { px: e.clientX, py: e.clientY, x, y, moved: false }; grab.setPointerCapture(e.pointerId); e.preventDefault(); });
    grab.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.px, dy = e.clientY - down.py;
      if (Math.abs(dx) + Math.abs(dy) > 5) down.moved = true;
      if (zoomed && down.moved) { x = down.x + dx; y = down.y + dy; clamp(); place(); }
    });
    grab.addEventListener('pointerup', e => {
      if (!down) return; const d = down; down = null;
      if (d.moved) return;
      const r = stage.getBoundingClientRect();
      if (zoomed) fit(); else zoomAt(e.clientX - r.left, e.clientY - r.top);
    });
    grab.addEventListener('pointercancel', () => { down = null; });
    getCover(st[2]).then(html => {
      f.onload = () => {
        let tries = 0;
        const ready = () => {
          const d = f.contentDocument; if (!d) return;
          if (d.body.dataset.ready !== '1' && tries++ < 60) return setTimeout(ready, 150);
          const tb = d.querySelector('.pk-toolbar'); if (tb) tb.remove();
          const c = d.querySelector('.pk-cover'); if (!c) return;
          c.style.margin = '0'; c.style.boxShadow = 'none'; d.body.style.background = 'transparent'; d.body.style.padding = '0';
          W = c.offsetWidth; H = c.offsetHeight;
          f.style.width = W + 'px'; f.style.height = H + 'px'; sheet.style.width = W + 'px'; sheet.style.height = H + 'px';
          pop.classList.add('ready'); fit();
        };
        ready();
      };
      f.srcdoc = pvDoc(html, 'layout=spread&bleed=0');
    }).catch(e => { pop.querySelector('.ad-cpop-wait').textContent = 'Could not load this style: ' + e.message; });
    pop.querySelector('#ad-cpop-x').focus();
  }
  // ---------- tabs: Scoring and Game (Pages) ----------
  // contents.html stays one file. Scoring edits its fixed pages: everything in <body> except the
  // rules spot and the repeated sheet. Game edits the sheet inside <template data-repeat>, which
  // prints print.sheets times. The <style> in its head is shared by both.
  function splitContents(html) {
    const b = html.match(/<body[^>]*>/i); if (!b) return null;
    const from = b.index + b[0].length, e = html.search(/<\/body>/i), to = e < 0 ? html.length : e;
    const body = html.slice(from, to);
    const t = body.match(/<template\b[^>]*\bdata-repeat\b[^>]*>([\s\S]*?)<\/template>/i);
    const rulesRe = /[ \t]*<section\b[^>]*\bdata-rules\b[^>]*>\s*<\/section>[ \t]*\n?/i;
    let rest = t ? body.slice(0, t.index) + '\n' + body.slice(t.index + t[0].length) : body;
    const rules = rulesRe.test(rest); rest = rest.replace(rulesRe, '');
    const block = x => x.replace(/^\s*\n/, '').replace(/\s+$/, '');
    return { head: html.slice(0, from), tail: html.slice(to), rules, open: t ? t[0].match(/^<template\b[^>]*>/i)[0] : '<template data-repeat="{{sheets}}">', game: block(t ? t[1] : ''), scoring: block(rest.replace(/\n{3,}/g, '\n\n')) };
  }
  function joinContents(x) {
    return x.head + '\n\n' + (x.rules ? '<section data-rules></section>\n\n' : '') + (x.scoring ? x.scoring + '\n\n' : '') +
      (x.game.trim() ? x.open + '\n' + x.game + '\n</template>\n\n' : '') + x.tail.replace(/^\s+/, '');
  }
  const cssOf = html => { const m = html.match(/<style>([\s\S]*?)<\/style>/i); return m ? m[1].replace(/^\n/, '').replace(/\s+$/, '') : null; };
  function pagesTab(p, part) {
    const x = splitContents(draft.contents);
    const sheets = (draft.game.print && draft.game.print.sheets) || 'the set number of';
    const T = part === 'scoring'
      ? ['Scoring', 'HTML for the scoring pages, such as the score book. They print once, right after the rules.',
        '<ul><li>Each <code>&lt;section class="page"&gt;</code> is one page, padded to the safe area.</li><li>A <code>&lt;script&gt;</code> here can fill pages in, like the score book\'s numbered rows.</li><li>The rules always come first and the game sheets come after these pages.</li><li>Colours and fonts as on the cover.</li></ul>']
      : ['Game', 'HTML for one game sheet. The notebook prints it ' + esc(String(sheets)) + ' times, after the scoring pages. Set how many in <a href="#pdfs">Bundle</a>.',
        '<ul><li>Each <code>&lt;section class="page"&gt;</code> is one page of the sheet. Two sections make a two-page sheet.</li><li><code>{{n}}</code> is the sheet number (1, 2, 3...). <code>{{title}}</code> is the game\'s name.</li><li>Colours and fonts as on the cover.</li></ul>'];
    if (!x) { p.innerHTML = '<h2>' + T[0] + '</h2><p class="ad-lede">contents.html has no &lt;body&gt;, so it can\'t be split into Scoring and Game. Fix it with the AI box on the Notebooks tab or on GitHub.</p>'; return; }
    const css = cssOf(draft.contents);
    p.innerHTML = '<h2>' + T[0] + '</h2><p class="ad-lede">' + T[1] + '</p>' + aiBox('contents') +
      '<textarea class="ad-code" id="ad-code" spellcheck="false" wrap="off">' + esc(x[part]) + '</textarea>' +
      '<div class="ad-code-foot"><button type="button" class="ad-link" id="ad-revert">Undo all changes to the inside pages</button></div>' +
      (css != null ? '<details class="ad-help-box"><summary>Page styles (CSS, shared by Scoring and Game)</summary><textarea class="ad-code ad-css" id="ad-css" spellcheck="false" wrap="off">' + esc(css) + '</textarea></details>' : '') +
      '<details class="ad-help-box"><summary>How this works</summary>' + T[2] + '</details>';
    const ta = $('#ad-code'), cs = $('#ad-css');
    const tabKey = el => e => { if (e.key === 'Tab') { e.preventDefault(); el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end'); el.oninput(); } };
    ta.oninput = () => { const y = splitContents(draft.contents); if (!y) return; y[part] = ta.value.replace(/\s+$/, ''); draft.contents = joinContents(y); persist(); };
    ta.onkeydown = tabKey(ta);
    if (cs) { cs.oninput = () => { draft.contents = draft.contents.replace(/<style>[\s\S]*?<\/style>/i, () => '<style>\n' + cs.value.replace(/\s+$/, '') + '\n</style>'); persist(); }; cs.onkeydown = tabKey(cs); }
    bindAi('contents');
    p.querySelectorAll('.ad-copy').forEach(c => { c.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(c.textContent).catch(() => {}); }; });
    $('#ad-revert').onclick = () => { if (confirm('Put the scoring and game pages back the way they were last saved?')) { draft.contents = saved.contents; persist(); show(tab); } };
  }

  // Sampler tab: nothing but the notebook's parts, each ticked in or out, in the order they print
  // (Kevin, 2026-11-28). The picked parts are game.json "sampler"; the PDF build follows it.
  function tabSampler(p) {
    const on = samplerPicked(), off = Object.keys(SAMPLER_PARTS).filter(k => !on.includes(k));
    const row = (k, i) => {
      const yes = i >= 0;
      return '<li class="ad-smp' + (yes ? '' : ' off') + '" data-k="' + k + '"><label><input type="checkbox"' + (yes ? ' checked' : '') + '>' +
        '<span class="ad-smp-n">' + (yes ? i + 1 : '') + '</span><span><b>' + esc(samplerName(k)) + '</b><small>' + esc(SAMPLER_PARTS[k][1]) + '</small></span></label>' +
        (yes && !/^(front|back)$/.test(k) ? '<label class="ad-smp-q" title="How many in the sampler">Qty <input type="number" min="1" max="99" step="1" inputmode="numeric" value="' + samplerQty(k) + '" data-q></label>' : '') +
        (yes ? '<span class="ad-smp-mv"><button type="button" data-mv="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button type="button" data-mv="1" aria-label="Move down"' + (i === on.length - 1 ? ' disabled' : '') + '>&darr;</button></span>' : '') + '</li>';
    };
    p.innerHTML = '<h2>Sampler</h2><p class="ad-lede">Tick what goes in the free sampler, set how many of each page, and use the arrows to put it in order. The sampler PDF is built from this list.</p>' +
      '<ol class="ad-smp-list">' + on.map(row).join('') + off.map(k => row(k, -1)).join('') + '</ol>';
    const set = list => { draft.game.sampler = list; persist(); show(tab); };
    p.querySelectorAll('.ad-smp').forEach(li => {
      const k = li.dataset.k;
      const q = li.querySelector('[data-q]');
      if (q) q.onchange = () => {
        const n = Math.max(1, Math.min(99, Math.floor(+q.value) || 1)), m = Object.assign({}, draft.game.samplerQty);
        if (n > 1) m[k] = n; else delete m[k];
        if (Object.keys(m).length) draft.game.samplerQty = m; else delete draft.game.samplerQty;
        persist(); show(tab);
      };
      li.querySelector('input[type=checkbox]').onchange = e => set(e.target.checked ? on.concat(k) : on.filter(x => x !== k));
      li.querySelectorAll('[data-mv]').forEach(b => { b.onclick = () => {
        const i = on.indexOf(k), j = i + +b.dataset.mv, list = on.slice();
        [list[i], list[j]] = [list[j], list[i]]; set(list);
      }; });
    });
  }

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
  // The link-preview picture: game.json shareImage if set, otherwise the first photo.
  const shareSrc = () => { const g = draft.game, first = (g.media || []).find(NB.realPhoto); return g.shareImage || (first ? first.src : ''); };
  const coverOf = () => NB.coverPhoto(draft.game);
  function tabMedia(p) {
    const m = draft.game.media;
    const thumb = x => x.type === 'image' ? '<img src="' + esc(pending[x.src] || (/^(https?:|\/)/.test(x.src || '') ? x.src : BASE + x.src)) + '" alt=""' + NB.focusStyle(x) + '>' : '<span class="ad-vid">' + (x.type === 'youtube' ? 'YouTube' : x.type === 'vimeo' ? 'Vimeo' : 'Video') + (x.id || x.src ? '' : '<br>coming soon') + '</span>';
    p.innerHTML = '<h2>Media</h2><p class="ad-lede">Photos and videos used on the website, and in the notebook.</p>' +
      (m.some(x => x && x.placeholder) ? '<div class="ad-warn ad-ph-warn"><p><b>These are placeholders.</b> The pictures marked PLACEHOLDER show another company\'s notebook, and the video is the studio\'s sample. Replace them with photos of this game before you publish. They are never used for the cover or link previews.</p><button type="button" class="nb-btn" id="ad-ph-rm">REMOVE PLACEHOLDERS</button></div>' : '') +
      '<div class="ad-media">' + (m.length ? m.map((x, i) => '<div class="ad-mitem" draggable="true" data-i="' + i + '" title="Drag to reorder"><span class="ad-grip" aria-hidden="true">&#8942;&#8942;</span>' + thumb(x) + '<div><input data-alt="' + i + '" value="' + esc(x.alt || '') + '" placeholder="Describe it (for screen readers)">' +
        (x.type === 'youtube' || x.type === 'vimeo' ? '<input data-vid="' + i + '" value="' + esc(x.id || '') + '" placeholder="' + (x.type === 'youtube' ? 'YouTube' : 'Vimeo') + ' link or ID">' : '') +
        '<small>' + (x.placeholder ? '<b class="ad-ph-tag">PLACEHOLDER</b> ' : '') + esc(x.src || '') + (pending[x.src] ? ' (not saved yet)' : '') + '</small></div>' +
        '<div class="ad-mbtns">' + (x.type === 'image' ? '<button type="button" class="ad-fbtn" data-focus="' + i + '" title="Choose the spot to keep when this photo is cropped">FOCUS</button>' +
          (x.placeholder ? '' : '<button type="button" class="ad-fbtn ad-sbtn" data-cover="' + i + '" aria-pressed="' + (coverOf() === x) + '" title="' + (coverOf() === x ? 'This photo is on the notebook cover. Click again for no photo there' : 'Put this photo on the notebook cover') + '">' + (coverOf() === x ? '&#10003; FOR NOTEBOOK COVER' : 'FOR NOTEBOOK COVER') + '</button>') +
          (x.placeholder ? '' : '<button type="button" class="ad-fbtn ad-sbtn" data-share="' + i + '" aria-pressed="' + (shareSrc() === x.src) + '" title="' + (shareSrc() === x.src ? 'This photo shows when the link is shared' : 'Show this photo when the link is shared') + '">' + (shareSrc() === x.src ? '&#10003; SHARE PICTURE' : 'SHARE PICTURE') + '</button>') : '') + '<button type="button" data-up="' + i + '" aria-label="Move up">&uarr;</button><button type="button" data-down="' + i + '" aria-label="Move down">&darr;</button><button type="button" class="ad-rm" data-rm="' + i + '" title="Remove from the page">REMOVE</button></div></div>').join('')
        : '<p class="ad-empty">No photos or videos yet.</p>') + '</div>' + autoBox() +
      '<div class="nb-row"><label class="nb-btn solid ad-file-in">ADD PHOTOS<input type="file" id="ad-up" accept="image/*" multiple hidden></label>' +
      '<button type="button" class="nb-btn" id="ad-yt">ADD YOUTUBE VIDEO</button><button type="button" class="nb-btn" id="ad-vm">ADD VIMEO VIDEO</button>' +
      '<button type="button" class="nb-btn" id="ad-soon">ADD "VIDEO COMING SOON"</button></div>' +
      '<p class="ad-help">Drop photos anywhere here to add them, and drag a photo to move it. Photos are resized to 1600 px and saved as JPEG in <code>images/</code> when you save. Until then they stay in this tab only, so save before leaving the page. FOR NOTEBOOK COVER puts that photo on the cover (click it again for no photo, and the cover shows its pattern of squares). SHARE PICTURE picks the photo that shows when the link is shared in texts and posts (the first photo unless you pick another).</p>' + iconBox();
    const parseVid = (type, v) => { v = v.trim(); const yt = v.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/); const vm = v.match(/vimeo\.com\/(?:video\/)?(\d+)/); return type === 'youtube' ? (yt ? yt[1] : v) : (vm ? vm[1] : v); };
    p.querySelectorAll('[data-alt]').forEach(el => { el.oninput = () => { m[+el.dataset.alt].alt = el.value; persist(); }; });
    p.querySelectorAll('[data-vid]').forEach(el => { el.onchange = () => { const x = m[+el.dataset.vid]; x.id = parseVid(x.type, el.value); el.value = x.id; persist(); show('media'); }; });
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= m.length) return; [m[i], m[j]] = [m[j], m[i]]; persist(); show('media'); };
    p.querySelectorAll('[data-up]').forEach(b => { b.onclick = () => move(+b.dataset.up, -1); });
    p.querySelectorAll('[data-down]').forEach(b => { b.onclick = () => move(+b.dataset.down, 1); });
    p.querySelectorAll('[data-rm]').forEach(b => { b.onclick = () => { const [x] = m.splice(+b.dataset.rm, 1); if (x && draft.game.shareImage === x.src) delete draft.game.shareImage; if (x && coverOf() === x) draft.game.coverImage = ''; if (x && pending[x.src]) { delete pending[x.src]; delete pendingB64[x.src]; } persist(); show('media'); }; });
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
    // FOR NOTEBOOK COVER: one photo at most; clicking the marked one again leaves the cover without a photo.
    p.querySelectorAll('[data-cover]').forEach(b => { b.onclick = () => {
      const x = m[+b.dataset.cover];
      draft.game.coverImage = coverOf() === x ? '' : x.src;
      persist(); show('media');
    }; });
    p.querySelectorAll('[data-share]').forEach(b => { b.onclick = () => {
      const x = m[+b.dataset.share], first = m.find(NB.realPhoto);
      if (draft.game.shareImage === x.src || (!draft.game.shareImage && first === x)) delete draft.game.shareImage; // back to the first photo
      else if (first === x) delete draft.game.shareImage;
      else draft.game.shareImage = x.src;
      persist(); show('media');
    }; });
    // FOCUS: click the spot that matters; every crop of this photo (gallery thumbnails, covers,
    // link-preview card in the studio) keeps that spot in view.
    p.querySelectorAll('[data-focus]').forEach(b => { b.onclick = () => {
      const i = +b.dataset.focus, x = m[i], row = b.closest('.ad-mitem');
      const open = p.querySelector('.ad-focus'); if (open) { const was = +open.dataset.i; open.remove(); if (was === i) return; }
      const src = pending[x.src] || (/^(https?:|\/|data:)/.test(x.src || '') ? x.src : BASE + x.src);
      const box = document.createElement('div');
      box.className = 'ad-focus'; box.dataset.i = i;
      box.innerHTML = '<p><b>Click the spot to keep in view</b> when this photo is cropped: gallery thumbnails, the cover and so on.</p>' +
        '<div class="ad-focus-row"><div class="ad-focus-pick"><img src="' + esc(src) + '" alt=""><span class="ad-focus-dot"></span></div>' +
        '<div class="ad-focus-crops"><figure><div class="sq"><img src="' + esc(src) + '" alt=""></div><figcaption>Square</figcaption></figure>' +
        '<figure><div class="tall"><img src="' + esc(src) + '" alt=""></div><figcaption>Cover</figcaption></figure>' +
        '<figure><div class="wide"><img src="' + esc(src) + '" alt=""></div><figcaption>Wide</figcaption></figure></div></div>' +
        '<div class="ad-focus-btns"><button type="button" class="nb-btn solid" data-fdone>DONE</button><button type="button" class="ad-link" data-freset>Back to the middle</button></div>';
      row.after(box);
      const draw = () => {
        const f = Array.isArray(x.focus) ? x.focus : [50, 50];
        const dot = box.querySelector('.ad-focus-dot'); dot.style.left = f[0] + '%'; dot.style.top = f[1] + '%';
        box.querySelectorAll('.ad-focus-crops img').forEach(im => { im.style.objectPosition = f[0] + '% ' + f[1] + '%'; });
      };
      draw();
      box.querySelector('.ad-focus-pick').onclick = e => {
        const r = e.currentTarget.getBoundingClientRect();
        const pc = v => Math.max(0, Math.min(100, Math.round(v)));
        x.focus = [pc((e.clientX - r.left) / r.width * 100), pc((e.clientY - r.top) / r.height * 100)];
        persist(); draw();
        const t = row.querySelector('img'); if (t) t.style.objectPosition = x.focus[0] + '% ' + x.focus[1] + '%';
      };
      box.querySelector('[data-freset]').onclick = () => { delete x.focus; persist(); draw(); };
      box.querySelector('[data-fdone]').onclick = () => box.remove();
    }; });

    // Drop photos anywhere on the tab to add them; drag a photo to change the order.
    let dragFrom = null;
    const isFiles = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
    p.querySelectorAll('.ad-mitem').forEach(el => {
      el.ondragstart = e => { if (/^(INPUT|BUTTON)$/.test(e.target.tagName)) return; dragFrom = +el.dataset.i; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom)); };
      el.ondragend = () => { dragFrom = null; el.classList.remove('dragging'); p.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); };
      el.ondragover = e => {
        if (dragFrom == null) return;
        e.preventDefault();
        const r = el.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
        p.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
        el.classList.add(after ? 'drop-after' : 'drop-before');
      };
      el.ondrop = e => {
        if (dragFrom == null) return;
        e.preventDefault(); e.stopPropagation();
        const r = el.getBoundingClientRect();
        let to = +el.dataset.i + (e.clientY > r.top + r.height / 2 ? 1 : 0);
        const [x] = m.splice(dragFrom, 1);
        if (to > dragFrom) to--;
        m.splice(to, 0, x); dragFrom = null; persist(); show('media');
      };
    });
    p.ondragover = e => { if (!isFiles(e)) return; e.preventDefault(); p.classList.add('ad-dropping'); };
    p.ondragleave = e => { if (e.target === p || !p.contains(e.relatedTarget)) p.classList.remove('ad-dropping'); };
    p.ondrop = e => {
      if (!isFiles(e)) return;
      e.preventDefault(); p.classList.remove('ad-dropping');
      const files = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type));
      if (!files.length) { updateBar('Only photos can be dropped here.', 'bad'); return; }
      addPhotos(files);
    };
    $('#ad-up').onchange = e => addPhotos([...e.target.files]);
    if ($('#ad-ph-rm')) $('#ad-ph-rm').onclick = () => { draft.game.media = m.filter(x => !(x && x.placeholder)); persist(); show('media'); };
    async function addPhotos(list) {
      for (const file of list) {
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
    }
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
  // Small pictures of a PDF's first pages, made by the last build (pdf/thumbs/). Click to open the PDF.
  function pdfThumbs(key, href) {
    const list = build && build.thumbs && build.thumbs[key];
    if (!build) return '';
    if (!list || !list.length) return '<p class="ad-help ad-pdf-nothumbs">Pictures of the first pages show here after the next build.</p>';
    const v = encodeURIComponent(build.built || '');
    return '<a class="ad-pdf-thumbs" href="' + esc(href) + '" target="_blank" rel="noopener" title="Open the PDF">' + list.map(t => '<img src="' + esc(BASE + t) + '?b=' + v + '" alt="" loading="lazy">').join('') + '</a>';
  }
  function tabPdfs(p) {
    if (IS_NEW) { p.innerHTML = '<h2>Bundle</h2><p class="ad-lede">The cover, contents, print-at-home and free sampler PDFs build on GitHub about 3 minutes after you publish the notebook, and again after each publish.</p><p class="ad-help">Until then, the Cover and Pages tabs preview exactly what will print.</p>' + printFields(); bindFields(p); return; }
    const g = draft.game, slug = g.slug;
    const pdf = n => 'pdf/' + slug + n + '.pdf';
    const files = [
      ['Cover', 'Front and back cover for the printer: one wraparound spread (back, spine, front) with bleed. The spine width follows the page count.', pdf('-cover'), b => (2 * b.trim[0] + b.spine + 2 * b.bleed).toFixed(3) + ' x ' + (b.trim[1] + 2 * b.bleed).toFixed(3) + ' in, spine ' + b.spine + ' in'],
      ['Contents', 'Every inside page for the printer, rules first, with bleed.', pdf('-contents'), b => b.pages.contents + ' pages at ' + (b.trim[0] + 2 * b.bleed) + ' x ' + (b.trim[1] + 2 * b.bleed) + ' in' + (b.pages.blanksAdded ? ' (' + b.pages.blanksAdded + ' blank added)' : '')],
      ['Print-at-home notebook', 'The whole notebook at trim size: front cover, rules, contents, back cover.', pdf(''), b => b.pages.printAtHome + ' pages'],
      ['Free sampler', 'The parts picked in the Sampler tab, in that order. The free download on the game page.', pdf('-sampler'), b => b.pages.sampler + ' pages'],
    ];
    p.innerHTML = '<h2>Bundle</h2><p class="ad-lede">Built on GitHub from the saved cover, inside pages and rules. They rebuild on their own about 3 minutes after each save.</p>' +
      '<div class="ad-card ad-build"><div class="nb-row"><button class="nb-btn solid big" id="ad-go" type="button">' + (GH.token() ? 'BUILD PDFS NOW' : 'BUILD PDFS ON GITHUB') + '</button><span class="ad-last">' + (build ? 'Last built ' + when(build.built) : 'Not built yet') + '</span></div>' +
      (changed() ? '<p class="ad-warn">You have unsaved changes. Builds use the saved version, so save first.</p>' : '') + '<div class="ad-status" id="ad-status" hidden></div></div>' +
      (build ? '<div class="ad-card ad-printer"><div><h3>Printer files</h3><p>One zip with the cover PDF, the contents PDF and a sheet of the sizes (trim, bleed, page count, spine) to type into Lulu, KDP or your printer\'s order form.</p></div><button class="nb-btn" id="ad-zip" type="button">PRINTER FILES (.ZIP)</button></div>' : '') +
      '<div class="ad-files">' + files.map(([n, a, f, info], k) => '<div class="ad-file"><div><h3>' + n + '</h3><p>' + esc(a) + '</p>' + (build ? '<small>' + esc(info(build)) + '</small>' : '') + pdfThumbs(['cover', 'contents', 'print', 'sampler'][k], BASE + f) + '</div>' +
        '<div class="ad-file-btns"><a class="nb-btn solid" href="' + BASE + f + '" target="_blank" rel="noopener">OPEN</a><a class="nb-btn" href="' + BASE + f + '" download>DOWNLOAD</a></div></div>').join('') + '</div>' +
      '<details class="ad-help-box"><summary>Save from this browser instead</summary><p>Chrome works best. In the print dialog choose Save as PDF, margins None, background graphics on. Page sizes are set for you; the spine width and the merged print-at-home and sampler files come only from the build.</p><p>' +
      '<a href="' + BASE + 'cover.html?layout=spread&autoprint" target="_blank" rel="noopener">Cover</a> · <a href="' + BASE + 'contents.html?autoprint" target="_blank" rel="noopener">Contents</a> · <a href="' + BASE + 'sampler.html?bleed=0&part=sampler&autoprint" target="_blank" rel="noopener">Sampler pages</a></p></details>';
    p.querySelector('.ad-files').insertAdjacentHTML('afterend', printFields()); bindFields(p);
    $('#ad-go').onclick = runBuild;
    const z = $('#ad-zip'); if (z) z.onclick = () => printerZip(z);
  }
  // Everything a print shop asks for, in one download: cover + contents PDFs and a sizes sheet.
  function printerSpecs(b) {
    const g = draft.game, f = n => (+n).toFixed(3).replace(/\.?0+$/, '');
    const w = 2 * b.trim[0] + b.spine + 2 * b.bleed, h = b.trim[1] + 2 * b.bleed;
    return [
      g.title + ' - printer specs',
      'Built ' + when(b.built),
      '',
      'Trim size:        ' + f(b.trim[0]) + ' x ' + f(b.trim[1]) + ' in',
      'Bleed:            ' + f(b.bleed) + ' in on each side',
      'Interior pages:   ' + b.pages.contents + (b.pages.blanksAdded ? ' (includes ' + b.pages.blanksAdded + ' blank added to make an even count)' : ''),
      'Interior file:    ' + g.slug + '-contents.pdf, ' + f(b.trim[0] + 2 * b.bleed) + ' x ' + f(h) + ' in per page (trim plus bleed)',
      'Spine width:      ' + f(b.spine) + ' in',
      'Cover file:       ' + g.slug + '-cover.pdf, one wraparound spread (back, spine, front)',
      'Cover size:       ' + f(w) + ' x ' + f(h) + ' in (with bleed)',
      'Binding:          perfect bound (paperback)',
      ''
    ].join('\r\n');
  }
  let zipLib = null;
  function loadZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return zipLib || (zipLib = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => window.JSZip ? ok(window.JSZip) : no(new Error('zip tool did not load'));
      s.onerror = () => { zipLib = null; no(new Error('could not load the zip tool')); };
      document.head.appendChild(s);
    }));
  }
  async function printerZip(btn) {
    const b = build, slug = draft.game.slug;
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'MAKING ZIP…';
    try {
      const get = async n => { const r = await fetch(BASE + 'pdf/' + slug + n + '.pdf?b=' + encodeURIComponent(b.built || ''), { cache: 'no-store' }); if (!r.ok) throw new Error(slug + n + '.pdf is missing (' + r.status + ')'); return r.arrayBuffer(); };
      const [JSZip, cover, contents] = await Promise.all([loadZip(), get('-cover'), get('-contents')]);
      const zip = new JSZip(), dir = zip.folder(slug + '-printer-files');
      dir.file(slug + '-cover.pdf', cover);
      dir.file(slug + '-contents.pdf', contents);
      dir.file('printer-specs.txt', printerSpecs(b));
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = slug + '-printer-files.zip';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      flash('Downloaded ' + slug + '-printer-files.zip', 'ok');
    } catch (e) { flash('Could not make the zip: ' + e.message, 'bad'); }
    btn.disabled = false; btn.textContent = label;
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

  // ---------- SAVE, then SAVED. PUBLISH? (one title-bar button, Kevin) ----------
  // 'save': changes not saved yet; SAVE keeps them on GitHub (studio-drafts branch, not live).
  // 'pub': saved, not live; the button reads SAVED. PUBLISH? and puts it live (a new notebook gets its folder).
  // 'none': nothing to do; a greyed-out SAVE.
  function mode() {
    if (IS_NEW) return sig() === freshSig && !serverKey ? 'none' : unsaved() ? (sig() === freshSig ? 'none' : 'save') : 'pub';
    return unsaved() ? 'save' : changed() ? 'pub' : 'none';
  }
  let working = false;
  function refreshButtons() {
    const pb = $('#ad-publish'); if (!pb) return;
    const locked = isTemplate && !allowTemplate, m = working ? 'busy' : mode();
    pb.dataset.mode = m === 'none' ? 'save' : m;
    pb.title = m === 'pub' ? 'Put it live on thegamebureau.com' : m === 'save' ? 'Keep these changes on GitHub. Not live yet.' : 'No changes to save';
    pb.disabled = working || locked || m === 'none';
    const dc = $('#ad-discard');
    dc.hidden = locked || !(IS_NEW ? serverKey || sig() !== freshSig : changed() || serverKey);
    dc.disabled = working;
  }
  const busy = on => { working = on; refreshButtons(); };
  // Title and subtitle are required (Kevin). Says what's missing, or '' when both are there.
  const needs = g => !String(g.title || '').trim() ? 'Give the notebook a title first. Click the title on the Website tab.'
    : !String(g.subtitle || '').trim() ? 'Give the notebook a subtitle first. Click under the title on the Website tab.' : '';
  async function saveDraft(force) {
    const g = draft.game, key = IS_NEW ? (g.slug || '').trim() : FOLDER;
    if (!GH.token()) { updateBar('Saving needs the one-time setup first. Open <a href="#connect">Connect</a>.', 'bad'); return; }
    if (needs(g)) { show('content'); updateBar(needs(g), 'bad'); return; }
    if (IS_NEW) { const bad = await freshSlugProblem(key); if (bad) { show('content'); updateBar(esc(bad), 'bad'); return; } }
    busy(true);
    if (force !== true) {
      const warn = await otherSave(key);
      if (warn) { busy(false); askBar(warn + ' Saving now replaces their version with yours.', [{ label: 'SAVE MINE ANYWAY', solid: true, fn: () => saveDraft(true) }, { label: 'OPEN THEIRS', fn: () => openTheirs(key) }]); return; }
    }
    const at = Date.now();
    const data = { v: 1, by: await GH.login(), isNew: IS_NEW, start: IS_NEW ? FOLDER : undefined, at, game: draft.game, rules: draft.rules, cover: draft.cover, contents: draft.contents, sampler: draft.sampler, files: Object.fromEntries(Object.keys(pendingB64).map(k => [k, pending[k]])) };
    const files = [{ key, data }];
    if (serverKey && serverKey !== key) files.push({ key: serverKey, delete: true }); // the address changed
    try {
      await GH.writeDrafts(files, 'Save ' + (g.title || key) + ' in the studio (not published)', m => updateBar(esc(m)));
      serverKey = key; serverAt = at; serverSig = sig(); serverTitle = g.title || key;
      persist();
      busy(false);
      flash('Saved (not live yet). Click SAVED. PUBLISH? at the top to put it on the site.', 'ok', 8000);
      if (tab === 'colors') show('colors');
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
      draft = htmlRules({ game: d.game, rules: d.rules, cover: d.cover, contents: d.contents, sampler: d.sampler != null ? d.sampler : saved.sampler });
      draft.game.setup = draft.game.setup || {}; draft.game.media = draft.game.media || [];
      takeFiles();
      serverSig = sig();
      persist();
    } else {
      // This browser has edits on top of the saved copy: keep them, with the saved photos.
      const mine = draft; draft = htmlRules({ game: d.game, rules: d.rules, cover: d.cover, contents: d.contents, sampler: d.sampler != null ? d.sampler : saved.sampler });
      takeFiles(); serverSig = sig(); draft = mine;
    }
  }

  // ---------- save and publish ----------
  async function save(force) {
    if (IS_NEW) return createNew();
    if (!changed()) return;
    if (isTemplate && !allowTemplate) return;
    if (!GH.token()) { updateBar('Saving needs the one-time setup first: <a href="/studio/#connect">Connect in the Notebook Studio</a>.', 'bad'); return; }
    const g = draft.game;
    if (needs(g)) { show('content'); updateBar(needs(g), 'bad'); return; }
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
    if (g.print) delete g.print.samplerPages; // the sampler is its own file, sampler.html, now
    add('game.json', gameText(g));
    if (draft.rules !== saved.rules) add('rules.md', draft.rules);
    if (draft.cover !== saved.cover) add('cover.html', draft.cover);
    if (draft.contents !== saved.contents) add('contents.html', draft.contents);
    if (draft.sampler !== saved.sampler || samplerMissing) add('sampler.html', draft.sampler);
    Object.entries(GH.shells(FOLDER, g)).forEach(([f, t]) => add(f, t));
    if (legacyAdmin) files.push({ path: FOLDER + '/admin.html', delete: true }); // games are edited in the studio now
    Object.keys(pendingB64).forEach(p => files.push({ path: FOLDER + '/' + p, base64: pendingB64[p] }));
    // Photos removed in the editor: delete their files too, unless something still uses them.
    const used = JSON.stringify(g) + draft.cover + draft.contents + draft.sampler;
    (saved.game.media || []).filter(x => x && x.type === 'image' && /^images\/[\w.-]+$/.test(x.src || '') && !used.includes(x.src))
      .forEach(x => files.push({ path: FOLDER + '/' + x.src, delete: true }));
    if (saved.game.favicon && !g.favicon) files.push({ path: FOLDER + '/favicon.ico', delete: true });
    try {
      // Only what changed is sent, in one commit. A change only the web page uses (price link,
      // announcement, photos other than the cover picture...) says so, and the PDFs don't rebuild.
      const printed = files.some(f => /\/(rules\.md|cover\.html|contents\.html|sampler\.html)$/.test(f.path)) || NB.printKey(g) !== NB.printKey(saved.game);
      const commit = await GH.commit(files, 'Update ' + g.title + ' notebook from the studio' + (printed ? '' : ' (web page only)'), s => updateBar(esc(s)), null, { skipSame: true });
      legacyAdmin = false;
      saved = clone({ game: g, rules: draft.rules, cover: draft.cover, contents: draft.contents, sampler: draft.sampler }); samplerMissing = false;
      draft = clone(saved);
      Object.keys(pendingB64).forEach(p => { delete pendingB64[p]; });
      clearDraft();
      if (serverKey) { await GH.writeDrafts([{ key: serverKey, delete: true }], 'Published ' + g.title + ', so drop its saved draft').catch(() => {}); serverKey = ''; serverAt = 0; serverSig = ''; }
      serverTitle = '';
      busy(false);
      if (!commit) flash('Saved. Nothing had changed from the live version.', 'ok');
      else flash('Saved and published (<a href="https://github.com/' + GH.REPO + '/commit/' + commit.sha + '" target="_blank" rel="noopener">commit</a>). The site republishes in about a minute' + (printed ? '; the PDF status shows at the top.' : '. Only the web page changed, so the PDFs stay as they are.'), 'ok', 15000);
      // Keep showing just-uploaded photos until the site serves them.
      setTimeout(() => { Object.keys(pending).forEach(p => delete pending[p]); }, 180000);
      if (tab === 'checklist' || tab === 'pdfs' || tab === 'history') show(tab, true);
      if (commit && printed) watchPdfs(commit.sha);
    } catch (e) {
      updateBar('Not saved: ' + esc(e.message), 'bad');
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
  // Throws changes away: back to a copy kept on GitHub (when there is one), back to the live
  // version, or (for a notebook never published) the whole notebook, including any copy on GitHub.
  function askDiscard() {
    const btns = [], since = serverAt ? ' (saved ' + esc(when(serverAt)) + ')' : '';
    const toSave = serverKey && unsaved();
    if (toSave) btns.push({ label: 'BACK TO THE COPY ON GITHUB', fn: backToSave });
    if (IS_NEW) btns.push({ label: 'THROW THIS NOTEBOOK AWAY', danger: true, fn: throwAway });
    else btns.push({ label: 'BACK TO THE LIVE VERSION', danger: true, fn: backToLive });
    askBar(IS_NEW
      ? (serverKey ? 'Throw away changes? ' + (toSave ? '<b>Back to the copy on GitHub</b> drops what you changed since it was kept' + since + '. ' : '') + '<b>Throw this notebook away</b> deletes it, including the copy on GitHub. It was never published.'
        : 'Throw this notebook away? It has not been published.')
      : 'Throw away changes? ' + (toSave ? '<b>Back to the copy on GitHub</b> drops what you changed since it was kept' + since + '. ' : '') + '<b>Back to the live version</b> drops every change that is not published' + (serverKey ? ', including the copy on GitHub' : '') + '.', btns);
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
      const keys = ['game', 'rules', 'cover', 'contents', 'sampler'];
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
    pdfChip('Publishing…');
    while (watching === sha && Date.now() - t0 < 30 * 60000) {
      let run = null;
      try { run = ((await GH.runs(GH.WORKFLOW, '&event=push&head_sha=' + sha)).workflow_runs || [])[0] || null; } catch (e) { /* try again */ }
      // No build after 3 minutes: nothing that goes in the PDFs changed (only photos, say).
      if (!run && Date.now() - t0 > 3 * 60000) { pdfChip(''); done(); return; }
      if (run && run.status === 'completed') {
        done();
        if (run.conclusion !== 'success') { pdfChip('PDF build failed. See why', 'bad', run.html_url); return; }
        pdfChip('PDFs ready ✓', 'ok');
        // The site serves them about a minute later; then the Bundle tab shows the new build.
        GH.waitForSite(BASE + 'pdf/build.json', t => { try { return JSON.parse(t).built !== before; } catch (e) { return false; } }, null, 15)
          .then(async ok => { if (!ok) return; try { const r = await fetch(BASE + 'pdf/build.json?t=' + Date.now(), { cache: 'no-store' }); build = await r.json(); } catch (e) { /* keep the old one */ } if (tab === 'pdfs') show('pdfs', true); });
        setTimeout(() => { if (watching === sha) pdfChip(''); }, 5 * 60000);
        return;
      }
      if (run) pdfChip('Publishing…');
      await sleep(10000);
    }
  }

  // ---------- tab: welcome ----------
  // Kevin's words: what a game notebook is.
  const tabWelcome = p => {
    p.innerHTML = '<h2>Welcome</h2><p class="ad-lede">One of the types of games The Game Bureau creates is Game Notebooks. Think playing Tic-Tac-Toe with pen and paper, except the game board is already drawn for you on every page of a notebook. Hopefully our notebook games are a little more fun than that, but that gives you an idea. Each notebook game has a subdomain website, a games notebook for sale and a sampler games notebook for download and print.</p>' +
      '<video class="ad-welcome-video" src="/studio/assets/notebook-open.mp4" autoplay muted playsinline controls preload="auto"></video>';
  };

  // ---------- generators ----------
  // Tools that make a game's pages. Each lives in its own folder under studio/generators/ and saves
  // editions to <game>/pages/<edition>.json. They open from the Game tab (Use a generator).
  // To add one, put its folder there and add a line here.
  const GENERATORS = [
    { path: 'wordfleet-battle-sheets', title: 'Word Fleet battle sheets',
      about: 'Letter-size battle sheets, each with its own hidden fleet of five words and five launch codes.',
      match: /^\d/ },
    { path: 'tic-tac-toe', title: 'Tic Tac Toe pages',
      about: 'Letter-size pages of traditional Tic Tac Toe: nine numbered boards of nine squares on every page, with a win tally.',
      match: /^tic-tac-toe-/ }
  ];

  // ---------- tab: Game (Pages) ----------
  // Where the game pages come from (game.json "pages", NB.pagesSource): the HTML game sheet here, a
  // link to pages made elsewhere, or a generator's saved edition. The PDF build uses the one chosen.
  const genOf = k => GENERATORS.find(x => x.path === k) || GENERATORS[0];
  // The Game tab preview for a link or an edition (null for the HTML sheet, or nothing chosen yet).
  function gameSrcUrl() {
    const s = NB.pagesSource(draft.game);
    if (s.source === 'link' && /^(https:\/\/|\/)/.test(s.link)) return NB.rulesEmbed(s.link);
    if (s.source === 'generator' && s.edition) return '/studio/generators/' + genOf(s.generator).path + '/?bare=1&edition=' + encodeURIComponent(s.edition);
    return null;
  }
  let editions = null; // { folder, list: [{ name, path }] } saved editions in <folder>/pages/
  // Coming back from the generator's tab: look again, so a just-saved edition shows up.
  window.addEventListener('focus', () => { if (tab === 'game' && NB.pagesSource(draft.game).source === 'generator' && !IS_NEW && $('#ad-eds')) { editions = null; drawEditions(); } });
  function tabGame(p) {
    const s = NB.pagesSource(draft.game), g = draft.game;
    const sheets = (g.print && g.print.sheets) || 72;
    if (s.source === 'html') pagesTab(p, 'game');
    else p.innerHTML = '<h2>Game</h2><p class="ad-lede"></p>';
    const lede = p.querySelector('.ad-lede');
    if (s.source === 'link') lede.textContent = 'The game pages come from a link. The notebook prints them ' + sheets + ' times, after the scoring pages.';
    if (s.source === 'generator') lede.textContent = 'The game pages come from a generator. The notebook prints every sheet of the chosen edition once, after the scoring pages.';
    const box = document.createElement('div');
    box.className = 'ad-rules-src';
    const opt = (k, t, d) => '<button type="button" role="radio" data-src="' + k + '" aria-checked="' + (s.source === k) + '"><b>' + t + '</b><small>' + d + '</small></button>';
    box.innerHTML = '<div class="ad-rules-pick three" role="radiogroup" aria-label="Where the game pages come from">' +
      opt('html', 'Edit the HTML here', 'One game sheet, printed ' + esc(String(sheets)) + ' times.') +
      opt('link', 'Link to game pages', 'A PDF, Google Doc or web page you already have.') +
      opt('generator', 'Use a generator', 'Pages made by a generator, such as battle sheets or Tic Tac Toe pages.') + '</div>';
    if (s.source === 'link') {
      box.insertAdjacentHTML('beforeend', '<label class="ad-field" for="f-pages-link"><span>Game pages link</span><input id="f-pages-link" type="url" value="' + esc(s.link) + '" placeholder="https://docs.google.com/document/d/... or /' + esc(target()) + '/pages/sheet.pdf" autocomplete="off" spellcheck="false"><small id="f-pages-link-msg"></small></label>' +
        '<p class="ad-help">Every page behind the link is one page of the notebook, scaled to fit the page. They print ' + esc(String(sheets)) + ' times: set how many in <a href="#pdfs">Bundle</a> (1 if the link already holds every page). For a Google file, set sharing to <i>Anyone with the link</i>.</p>');
    }
    if (s.source === 'generator') {
      const gen = genOf(s.generator);
      box.insertAdjacentHTML('beforeend', (GENERATORS.length > 1 ? '<label class="ad-field" for="f-pages-gen"><span>Generator</span><select id="f-pages-gen">' + GENERATORS.map(x => '<option value="' + esc(x.path) + '"' + (x === gen ? ' selected' : '') + '>' + esc(x.title) + '</option>').join('') + '</select></label>' : '') +
        '<div class="ad-card ad-gen"><div><h3>' + esc(gen.title) + '</h3><p>' + esc(gen.about) + ' GENERATE makes a new edition and SAVE keeps it in this game\'s pages folder.</p></div>' +
        // A new notebook has no folder yet, so its generator opens without one: try it out now, and SAVE editions for this notebook once it is published.
        '<a class="nb-btn solid" href="/studio/generators/' + esc(gen.path) + '/' + (IS_NEW ? '?new=1' : '?game=' + encodeURIComponent(FOLDER)) + '" target="_blank" rel="noopener">OPEN THE GENERATOR</a></div>' +
        '<h3 class="ad-ed-head">Saved editions <button type="button" class="ad-link" id="ad-ed-refresh">Refresh</button></h3><div id="ad-eds"><p class="ad-help">' + (IS_NEW ? 'You can open the generator and try it now. To keep an edition in this notebook, publish the notebook first, then GENERATE and SAVE with it picked as the game.' : 'Looking for saved editions…') + '</p></div>');
    }
    lede.after(box);
    box.querySelectorAll('[data-src]').forEach(b => { b.onclick = () => {
      const k = b.dataset.src;
      if (k === s.source) return;
      if (k === 'html') delete draft.game.pages;
      else draft.game.pages = k === 'link' ? { source: 'link', link: (g.pages && g.pages.link) || '' } : { source: 'generator', generator: genOf((g.pages || {}).generator).path, edition: (g.pages && g.pages.edition) || '' };
      persist(); show(tab);
      const f = $('#f-pages-link'); if (f && !f.value) f.focus();
    }; });
    const inp = $('#f-pages-link');
    if (inp) {
      const msg = () => {
        const t = inp.value.trim();
        $('#f-pages-link-msg').innerHTML = !t ? 'Paste the link. Until then the notebook keeps its HTML game sheet.'
          : /^(https:\/\/|\/)/.test(t) ? 'The next PDF build prints <a href="' + esc(t) + '" target="_blank" rel="noopener">these pages</a>.' : 'That isn\'t a web address. It should start with https:// (or / for a file on this site).';
      };
      inp.oninput = () => { draft.game.pages.link = inp.value.trim(); persist(); msg(); };
      msg();
    }
    const gs = $('#f-pages-gen');
    if (gs) gs.onchange = () => { draft.game.pages = { source: 'generator', generator: gs.value, edition: '' }; persist(); show(tab); };
    if (s.source === 'generator' && !IS_NEW) {
      $('#ad-ed-refresh').onclick = () => { editions = null; drawEditions(); };
      // Read the list fresh each time: editions are usually saved in the generator's own browser tab.
      editions = null; drawEditions();
    }
  }
  async function drawEditions() {
    const el = () => $('#ad-eds');
    try {
      if (!editions || editions.folder !== FOLDER) {
        let list = [];
        try { list = await GH.api('/contents/' + FOLDER.split('/').map(encodeURIComponent).join('/') + '/pages?ref=' + GH.BRANCH); }
        catch (e) { if (e.status !== 404) throw e; }
        editions = { folder: FOLDER, list: (Array.isArray(list) ? list : []).filter(f => f.type === 'file' && /\.json$/.test(f.name)).map(f => ({ name: f.name.replace(/\.json$/, ''), path: FOLDER + '/pages/' + f.name })).sort((a, b) => b.name.localeCompare(a.name)) };
      }
      if (!el() || tab !== 'game') return;
      const src = NB.pagesSource(draft.game), cur = src.edition, gen = genOf(src.generator);
      // Only this generator's editions (each generator names its files its own way).
      const list = editions.list.filter(x => gen.match.test(x.name));
      // Nothing picked yet: use the newest saved edition, so a first SAVE in the generator is all it takes.
      if (!cur && list.length) { draft.game.pages.edition = list[0].path; persist(); show(tab); return; }
      const missing = cur && !list.some(x => x.path === cur);
      el().innerHTML = list.length || missing ? '<ul class="ad-eds" role="radiogroup" aria-label="Saved editions">' +
        (missing ? '<li><button type="button" role="radio" aria-checked="true" disabled><b>' + esc(cur.split('/').pop().replace(/\.json$/, '').toUpperCase()) + '</b><small>Chosen, but no longer saved. Pick another.</small></button></li>' : '') +
        list.map(x => '<li><button type="button" role="radio" data-ed="' + esc(x.path) + '" aria-checked="' + (x.path === cur) + '"><b>' + esc(x.name.toUpperCase()) + '</b><small>' + (x.path === cur ? 'In the notebook' : 'Use this edition') + '</small></button></li>').join('') + '</ul>' +
        (cur ? '' : '<p class="ad-help">Pick the edition the notebook prints.</p>')
        : '<p class="ad-help">No saved editions yet. OPEN THE GENERATOR, GENERATE, then SAVE. Then click Refresh.</p>';
      el().querySelectorAll('[data-ed]').forEach(b => { b.onclick = () => { draft.game.pages.edition = b.dataset.ed; persist(); show(tab); }; });
    } catch (e) { if (el()) el().innerHTML = '<p class="ad-help">Could not list the saved editions: ' + esc(e.message) + '</p>'; }
  }

  // ---------- tab: ideas ----------
  // Ideas for future games, shared by every connected browser (ideas.json on studio-drafts).
  // Each change re-reads the list first, so two browsers adding ideas don't lose each other's.
  const IDEAS_SEED = [{ id: 'reveal-device', title: 'Reveal-one-at-a-time device', at: '2026-11-24T12:00:00Z', by: '',
    notes: 'A printable device that shows only one item at a time.\n\n- **Dial version:** a paper sleeve with a window. Dial a letter and a number, and the window reveals what belongs at that coordinate.\n- **Punch version:** punch a hole at a coordinate on the top sheet, and the answer shows through from the paper underneath.' }];
  let ideas = null, ideaEdit = null; // ideaEdit: id being edited, 'new' for a new idea
  async function fetchIdeas() { const l = await GH.readIdeas(); return l || IDEAS_SEED.slice(); }
  function tabIdeas(p) {
    p.innerHTML = '<h2>Ideas</h2><p class="ad-lede">Ideas for future notebook games. These ideas are for this game or any other aspect of the business.</p><div id="ad-ideas"><p class="ad-help">Loading…</p></div>';
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
    p.innerHTML = '<h2>History</h2><p class="ad-lede">Every published version, newest first. LOAD puts that version back in the editor: words, colours, rules, cover, inside pages and photos. The site does not change until you save and publish it.</p><div id="ad-hist"><p class="ad-help">Loading…</p></div>';
    // Versions from before a change of web address are found under the old folder.
    const places = [FOLDER].concat(saved.game.formerAddresses || []);
    Promise.all(places.map(f => GH.history(f).then(l => (l || []).map(c => Object.assign(c, { folder: f }))).catch(() => []))).then(lists => {
      const box = $('#ad-hist'); if (!box) return;
      const seen = new Set(), list = [].concat(...lists).filter(c => !seen.has(c.sha) && seen.add(c.sha)).sort((a, b) => new Date(b.commit.author.date) - new Date(a.commit.author.date));
      const rows = list.filter(c => !/^Rebuild notebook PDFs/.test(c.commit.message) && !(c.folder !== FOLDER && /^Move .* to \//.test(c.commit.message)));
      if (!rows.length) { box.innerHTML = '<p class="ad-empty">No published versions found.</p>'; return; }
      box.innerHTML = '<ol class="ad-hist">' + rows.map((c, i) => {
        const at = when(c.commit.author.date), who = (c.author && c.author.login) || c.commit.author.name;
        return '<li><div><b>' + esc(c.commit.message.split('\n')[0]) + '</b><small>' + esc(at) + ' · ' + esc(who) + ' · <a href="' + esc(c.html_url) + '" target="_blank" rel="noopener">' + esc(c.sha.slice(0, 7)) + '</a></small></div>' +
          (i === 0 ? '<span class="ad-hist-live">LIVE NOW</span>' : '<button type="button" class="nb-btn" data-load="' + esc(c.sha) + '" data-when="' + esc(at) + '" data-folder="' + esc(c.folder) + '">LOAD</button>') + '</li>';
      }).join('') + '</ol>';
      box.querySelectorAll('[data-load]').forEach(b => { b.onclick = () => loadVersion(b.dataset.load, b.dataset.when, b.dataset.folder); });
    }).catch(e => { const box = $('#ad-hist'); if (box) box.innerHTML = '<p class="ad-help">Could not read the history: ' + esc(e.message) + '</p>'; });
  }
  async function loadVersion(sha, label, from) {
    from = from || FOLDER; // the folder the game lived in at that version
    if (unsaved() && !confirm('Load the version from ' + label + '? Changes you have not saved will be replaced.')) return;
    busy(true); updateBar('Loading the version from ' + esc(label) + '…');
    try {
      const at = k => GH.readTextAt(from + '/' + FILES[k], sha);
      const [game, rules, cover, contents, sampler] = await Promise.all([at('game'), at('rules'), at('cover'), at('contents'), at('sampler')]);
      if (!game) throw new Error('that version has no game.json');
      const g = JSON.parse(game);
      if (from !== FOLDER) { g.slug = saved.game.slug; g.formerAddresses = saved.game.formerAddresses; } // keep today's address
      g.setup = g.setup || {}; g.media = g.media || [];
      const next = { game: g, rules: rules != null ? (NB.isHTML(rules) ? rules : NB.mdSource(rules)) : saved.rules, cover: cover != null ? cover : saved.cover, contents: contents != null ? contents : saved.contents, sampler: sampler != null ? sampler : contents != null ? samplerFrom(contents) : saved.sampler };
      // Photos (and the tab icon) deleted since then come back from that version.
      const used = JSON.stringify(g) + next.cover + next.contents + next.sampler;
      const [nowFiles, thenFiles] = await Promise.all([GH.listFiles(), GH.filesAt(sha)]);
      const have = new Set(nowFiles.map(f => f.path));
      const type = f => /\.png$/i.test(f) ? 'image/png' : /\.ico$/i.test(f) ? 'image/x-icon' : /\.webp$/i.test(f) ? 'image/webp' : /\.gif$/i.test(f) ? 'image/gif' : /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/jpeg';
      for (const f of thenFiles) {
        if (!f.path.startsWith(from + '/')) continue;
        const rel = f.path.slice(from.length + 1);
        if (have.has(FOLDER + '/' + rel)) continue;
        if (!/^(images\/[^/]+|favicon\.ico)$/.test(rel) || !used.includes(rel)) continue;
        const b64 = await GH.readBlobB64(f.sha);
        pending[rel] = 'data:' + type(rel) + ';base64,' + b64; pendingB64[rel] = b64;
      }
      draft = next; persist(); busy(false);
      updateBar('Loaded the version from ' + esc(label) + '. Check it in the other tabs, then SAVE and PUBLISH to make it live again, or DISCARD to go back.', 'ok');
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

  // Unsaved changes: the browser asks before closing or leaving the page (they are also kept in this browser).
  addEventListener('beforeunload', e => { if (!leaving && CHOSEN && saved && mode() === 'save') { e.preventDefault(); e.returnValue = ''; } });

  // ---------- NEW NOTEBOOK ----------
  // Always opens a fresh notebook from the blank starter, even from /studio/?new itself. Work in
  // progress stays safe: an existing notebook's edits stay in this browser under its own name, and a
  // new notebook with unsaved edits is saved to GitHub first (it then shows in Notebooks).
  async function startNew() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(NEWKEY) || 'null'); } catch (e) { /* none */ }
    if (IS_NEW && (draft.game.title || '').trim() && unsaved()) {
      const key = (draft.game.slug || '').trim();
      const bad = GH.token() ? await freshSlugProblem(key) : 'not connected';
      if (!bad) { await saveDraft(); if (unsaved()) return; }
      else if (!confirm('Start a new notebook? "' + draft.game.title + '" is not saved yet' + (GH.token() ? ' (it needs a free web address on the Website tab first)' : '') + ', so it will be thrown away.')) return;
    } else if (!IS_NEW && d && d.game && (d.game.title || '').trim() && !d.savedKey) {
      if (!confirm('Start a new notebook? The unsaved new notebook "' + d.game.title + '" in this browser will be thrown away.')) return;
    }
    try { localStorage.removeItem(NEWKEY); } catch (e) { /* blocked */ }
    leaving = true;
    history.replaceState(null, '', '/studio/?new#content');
    location.reload();
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href="/studio/?new#content"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault(); startNew();
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
      await dropStaleDraft();
      loadDraft();
      await loadServerDraft();
      const g = saved.game;
      document.title = !CHOSEN ? 'Notebook Studio' : (IS_NEW ? 'New notebook' : g.title) + ' · Notebook Studio';
      NB.applyBrand(Object.assign({ brand: {} }, g, { brand: Object.assign({ color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' }, g.brand || {}) }));
      frame();
      // Plain /studio/ always opens on Welcome (Kevin); a link that names a tab opens that tab.
      // Plain /studio/ always opens on Welcome (Kevin); a link that names a tab opens that tab; a loaded notebook opens on Colors (Kevin, 2026-11-28).
      show(tabFromHash() || (!GH.token() || !CHOSEN ? 'welcome' : IS_NEW ? 'content' : 'colors'));
      loadChecklistFacts();
      if (staleNote) flash(esc(staleNote), 'ok', 9000);
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
