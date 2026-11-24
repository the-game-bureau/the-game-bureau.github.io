/* Notebook kit: the Notebook Studio (/studio/). Needs kit.js and gh.js.
 * Lists every notebook game, and turns an idea into a new notebook: it copies the starter
 * template (or the Dice Derby sample) into a new folder on GitHub with your name, pitch and
 * colours filled in, publishes it, and opens it in the studio's editor for the rest.
 * The template folders themselves are only read, never changed.
 */
(function () {
  'use strict';
  const NB = window.NB, GH = window.GH, esc = NB.esc;
  const $ = s => document.querySelector(s);
  const STARTS = [
    ['studio/starter', 'Blank starter', 'A plain cover that fills itself in from your words, a score book and numbered game sheets. Best for a new idea.'],
    ['studio/dice-derby', 'Dice Derby sample', 'A finished example game with custom race cards. Start here to adapt its layouts.'],
  ];
  const PRESETS = NB.PRESETS; // [name, brand, accent, paper, ink], in kit.js, shared with the editor
  let files = null;
  let colors = PRESETS[0].slice(1);

  const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  // The studio uses the same frame as the game editor: a top bar, sections on the left, one panel.
  const TABS = [['setup', 'Setup'], ['content', 'Content'], ['colors', 'Colors'], ['template', 'Template'], ['create', 'Create'], ['games', 'Notebooks']];
  const HASH = { connect: 'setup', new: 'content' }; // older links into the one-page studio
  const NEXT = { setup: 'content', content: 'colors', colors: 'template', template: 'create' };
  let tab = 'setup';
  function page() {
    NB.applyBrand({ brand: { color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' } });
    document.body.classList.add('ad-app');
    const next = k => NEXT[k] ? '<div class="nb-row st-next"><button type="button" class="nb-btn" data-go="' + NEXT[k] + '">NEXT: ' + TABS.find(t => t[0] === NEXT[k])[1].toUpperCase() + ' →</button></div>' : '';
    const panel = (k, html) => '<section class="st-tab" data-panel="' + k + '" hidden>' + html + next(k) + '</section>';
    document.body.innerHTML =
      '<header class="ad-top"><div class="ad-top-in">' +
      '<div class="ad-id"><a class="ad-studio" href="/">The Game Bureau</a><h1>Notebook Studio</h1><span class="ad-folder">new notebook</span></div>' +
      '<div class="ad-actions"><button class="nb-btn" type="button" data-go="games">MY NOTEBOOKS</button><button class="nb-btn solid" id="n-go-top" type="button">CREATE THE NOTEBOOK</button></div></div>' +
      '<div class="ad-bar" id="st-bar" role="status"></div></header>' +
      '<div class="ad-shell no-preview"><nav class="ad-tabs">' + TABS.map(([k, l]) => '<button type="button" data-tab="' + k + '">' + l + '</button>').join('') +
      '<div class="ad-gh" id="st-side"></div></nav>' +
      '<main class="ad-panel st-panel" id="st-panel">' +

      panel('setup', '<h2>Setup</h2><p class="ad-lede">Use the studio to go from an idea to a live notebook game on thegamebureau.com.</p>' +
        '<h3>Connect GitHub <span class="st-badge" id="st-badge"></span></h3>' +
        '<p class="ad-help" id="st-setup-lede">One-time setup, about 2 minutes. The studio saves your notebooks to the website through GitHub, so it needs a key from GitHub before it can do anything. You only do this once on each computer or browser.</p>' +
        '<div id="st-gh"></div>' +
        '<h3>How it works</h3><ol class="st-flow">' +
        '<li><b>Make a notebook</b>Fill in Content, Colors and Template here, then Create. It takes about a minute.</li>' +
        '<li><b>Shape it in the editor</b>Words, colours, rules, cover, inside pages, photos, with a live preview.</li>' +
        '<li><b>Save and publish</b>One button. The site republishes in about a minute, and the PDFs build about 3 minutes later.</li>' +
        '<li><b>Sell and share</b>Add a Stripe link, order a printed proof, share the page.</li></ol>') +

      panel('content', '<h2>Content</h2><p class="ad-lede">The basics of the new game. You can change all of this later in the editor.</p><div class="st-form st-lockable">' +
        '<label class="ad-field"><span>Game name</span><input id="n-title" placeholder="e.g. Pitch Count" autocomplete="off"></label>' +
        '<label class="ad-field"><span>Web address</span><span class="st-url"><b>thegamebureau.com/</b><input id="n-folder" placeholder="pitch-count" autocomplete="off" spellcheck="false"></span><small id="n-folder-msg">Lowercase letters, numbers and dashes.</small></label>' +
        '<label class="ad-field wide"><span>Tagline</span><input id="n-tagline" placeholder="One sentence: what it is and why it\'s fun."></label>' +
        '<label class="ad-field wide"><span>The idea</span><textarea id="n-pitch" rows="4" placeholder="Who plays, what you do, what makes it fun. Leave a blank line between paragraphs."></textarea></label>' +
        '<label class="ad-field"><span>Players</span><input id="n-players" value="2 to 6"></label>' +
        '<label class="ad-field"><span>Time</span><input id="n-time" placeholder="About 30 minutes"></label>' +
        '<label class="ad-field"><span>You need</span><input id="n-need" value="A pencil"></label>' +
        '<label class="ad-field"><span>Price</span><input id="n-price" value="$9.99"></label></div>') +

      panel('colors', '<h2>Colors</h2><p class="ad-lede">Pick a colour scheme for the game page, the cover and the inside pages. You can fine-tune each colour in the editor.</p>' +
        '<div class="ad-presets st-lockable" id="n-colors"></div>') +

      panel('template', '<h2>Template</h2><p class="ad-lede">What the new notebook starts from, and how many game sheets it holds.</p><div class="st-form st-lockable">' +
        '<div class="ad-field wide"><span>Start from</span><div class="st-starts">' + STARTS.map((s, i) => '<label><input type="radio" name="n-start" value="' + s[0] + '"' + (i ? '' : ' checked') + '><span><b>' + s[1] + '</b><small>' + s[2] + '</small></span></label>').join('') + '</div></div>' +
        '<label class="ad-field"><span>Game sheets in the notebook</span><input id="n-sheets" type="number" value="72" min="1" max="300"></label></div>') +

      panel('create', '<h2>Create</h2><p class="ad-lede">Check the details, then create the notebook. It is copied from the template, saved to GitHub and published, and then opens in the editor.</p>' +
        '<div id="n-summary"></div>' +
        '<div class="nb-row st-lockable"><button class="nb-btn solid big" id="n-go" type="button">CREATE THE NOTEBOOK</button></div>' +
        '<ul class="st-progress" id="n-progress" hidden></ul><div id="n-done"></div>') +

      panel('games', '<h2>Notebooks</h2><p class="ad-lede">Every notebook game on the site. EDIT opens it in the editor.</p><div id="st-games"><p class="ad-help">Loading…</p></div>') +
      '</main></div>';

    $('#n-colors').innerHTML = PRESETS.map((x, i) => '<button type="button" data-p="' + i + '"' + (i ? '' : ' aria-pressed="true"') + ' title="' + esc(x[0]) + '">' + x.slice(1).map(c => '<span style="background:' + c + '"></span>').join('') + '<b>' + esc(x[0]) + '</b></button>').join('');
    document.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => { colors = PRESETS[+b.dataset.p].slice(1); document.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
    let folderTouched = false;
    $('#n-title').oninput = () => { if (!folderTouched) { $('#n-folder').value = slugify($('#n-title').value); checkFolder(); } };
    $('#n-folder').oninput = () => { folderTouched = true; checkFolder(); };
    $('#n-go').onclick = create;
    $('#n-go-top').onclick = () => { show('create'); create(); };
    document.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
    document.querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
    addEventListener('hashchange', () => { const h = location.hash.slice(1); const t = HASH[h] || h; if (t !== tab && TABS.some(x => x[0] === t)) show(t); });
    ghBox();
    loadGames();
    const h = location.hash.slice(1), want = HASH[h] || h;
    show(TABS.some(x => x[0] === want) ? want : GH.token() ? 'content' : 'setup');
  }

  function show(t) {
    tab = t;
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === t));
    document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t; });
    if (t === 'create') summary();
    if (location.hash.slice(1) !== t) history.replaceState(null, '', '#' + t);
    scrollTo(0, 0);
  }

  // What will be created, on the Create tab.
  function summary() {
    const v = id => ($(id).value || '').trim();
    const pre = PRESETS.find(x => x.slice(1).join() === colors.join()) || ['Custom'].concat(colors);
    const start = STARTS.find(s => s[0] === (document.querySelector('[name=n-start]:checked') || {}).value) || STARTS[0];
    const row = (k, val, go) => '<tr><th>' + k + '</th><td>' + (val || '<i>not set</i>') + '</td><td><button type="button" class="ad-link" data-go="' + go + '">Change</button></td></tr>';
    $('#n-summary').innerHTML = '<table class="st-sum">' +
      row('Game name', esc(v('#n-title')), 'content') +
      row('Web address', v('#n-folder') ? 'thegamebureau.com/' + esc(v('#n-folder')) + '/' : '', 'content') +
      row('Tagline', esc(v('#n-tagline')), 'content') +
      row('Colors', '<span class="st-sw">' + pre.slice(1).map(c => '<i style="background:' + c + '"></i>').join('') + '</span> ' + esc(pre[0]), 'colors') +
      row('Template', esc(start[1]) + ', ' + esc(v('#n-sheets') || '72') + ' game sheets', 'template') + '</table>';
    $('#n-summary').querySelectorAll('[data-go]').forEach(b => { b.onclick = () => show(b.dataset.go); });
  }

  function setupState(ok) {
    $('#st-badge').textContent = ok ? '✓ DONE' : 'NOT SET UP YET';
    $('#st-badge').classList.toggle('done', ok);
    $('#st-setup-lede').hidden = ok;
    document.querySelectorAll('.st-lockable').forEach(box => { box.classList.toggle('st-locked', !ok); box.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = !ok; }); });
    $('#n-go-top').disabled = !ok;
    const bar = $('#st-bar');
    if (ok) { bar.className = 'ad-bar'; bar.textContent = ''; }
    else { bar.className = 'ad-bar show warn'; bar.innerHTML = 'Finish the one-time setup first: <button type="button" class="ad-link" data-go="setup">Connect GitHub in Setup</button>. Making a notebook unlocks after that.'; bar.querySelector('[data-go]').onclick = () => show('setup'); }
    $('#st-side').innerHTML = ok ? '<p>GitHub connected.</p>' : '<p><b>One-time setup needed.</b> See <button type="button" class="ad-link" id="st-side-go">Setup</button>.</p>';
    if (!ok) $('#st-side-go').onclick = () => show('setup');
  }

  function ghBox() {
    const el = $('#st-gh');
    if (GH.token()) {
      el.innerHTML = '<p>The studio is set up in this browser. <span id="st-who"></span> <button type="button" class="ad-link" id="st-forget">Disconnect</button></p>';
      setupState(true);
      GH.check().then(w => { $('#st-who').textContent = 'Signed in to GitHub as ' + w + '.'; })
        .catch(e => { $('#st-who').textContent = e.message; setupState(false); });
      $('#st-forget').onclick = () => { GH.setToken(''); ghBox(); };
      return;
    }
    setupState(false);
    el.innerHTML = '<ol class="st-howto">' +
      '<li><b>Open GitHub\'s token page.</b> <a class="nb-btn" href="' + GH.TOKEN_URL + '" target="_blank" rel="noopener">OPEN GITHUB ↗</a><small>Sign in as someone who can change the website.</small></li>' +
      '<li><b>Fill in the form.</b><small>Token name: <code>Notebook Studio</code>. Expiration: up to you (a year is fine). Resource owner: <code>the-game-bureau</code>. Repository access: <b>Only select repositories</b>, then pick <code>' + esc(GH.REPO) + '</code>.</small></li>' +
      '<li><b>Give it two permissions.</b><small>Under Repository permissions, set <b>Contents</b> to Read and write and <b>Actions</b> to Read and write. Leave everything else alone.</small></li>' +
      '<li><b>Generate the token and paste it here.</b><small>It starts with <code>github_pat_</code>. It stays in this browser and is only ever sent to GitHub.</small>' +
      '<div class="nb-row" style="margin-top:8px"><input id="st-tok" type="password" placeholder="github_pat_..." autocomplete="off" style="flex:1 1 260px;min-height:44px;border:1px solid #C9CDD2;border-radius:5px;padding:0 10px;font:14px ui-monospace,monospace"><button class="nb-btn solid" id="st-tok-save" type="button">FINISH SETUP</button></div><p class="ad-help" id="st-tok-msg"></p></li>' +
      '</ol>';
    $('#st-tok-save').onclick = async () => {
      $('#st-tok-msg').textContent = 'Checking…';
      GH.setToken($('#st-tok').value.trim());
      try { await GH.check(); ghBox(); loadGames(); show('content'); } catch (e) { GH.setToken(''); $('#st-tok-msg').textContent = e.message; }
    };
  }

  async function loadGames() {
    const box = $('#st-games');
    try {
      const r = await GH.listGames();
      files = r.files;
      box.innerHTML = '<div class="st-games">' + r.games.sort((a, b) => a.folder.startsWith('studio/') - b.folder.startsWith('studio/') || a.folder.localeCompare(b.folder)).map(({ folder, game: g }) =>
        '<div class="st-game"><div class="sw" style="background:' + esc((g.brand && g.brand.color) || '#1F3A5F') + '"></div><div class="b">' +
        (folder.startsWith('studio/') ? '<span class="tag">TEMPLATE</span>' : '') +
        '<h3>' + esc(g.title) + '</h3><small>/' + esc(folder) + '/</small><p class="ad-help">' + esc(g.tagline || '') + '</p>' +
        '<div class="nb-row"><a class="nb-btn solid" href="/studio/?game=' + encodeURIComponent(folder) + '">EDIT</a><a class="nb-btn" href="/' + esc(folder) + '/" target="_blank" rel="noopener">PAGE</a>' +
        (canDelete(folder) ? '<button type="button" class="nb-btn st-del" data-del="' + esc(folder) + '" data-title="' + esc(g.title) + '">DELETE</button>' : '') +
        '</div><div class="st-del-box" hidden></div></div></div>').join('') + '</div>';
      box.querySelectorAll('[data-del]').forEach(btn => { btn.onclick = () => askDelete(btn); });
      checkFolder();
    } catch (e) {
      box.innerHTML = '<p class="ad-help">Could not list notebooks: ' + esc(e.message) + '</p>';
    }
  }

  // ---------- deleting a notebook ----------
  // The template folders (studio/...) can never be deleted from here.
  const canDelete = folder => /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(folder) && !/^(studio|template)(\/|$)/.test(folder);
  function askDelete(btn) {
    const folder = btn.dataset.del, title = btn.dataset.title;
    const box = btn.closest('.b').querySelector('.st-del-box');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p><b>Are you sure?</b> This deletes the whole <code>/' + esc(folder) + '/</code> folder: the game page, rules, PDFs and photos. ' +
      'Links to thegamebureau.com/' + esc(folder) + '/ will stop working.</p>' +
      '<label class="ad-field"><span>Type <b>' + esc(folder) + '</b> to confirm</span><input class="st-del-in" autocomplete="off" spellcheck="false"></label>' +
      '<div class="nb-row"><button type="button" class="nb-btn st-del-go" disabled>DELETE ' + esc(title.toUpperCase()) + '</button><button type="button" class="nb-btn st-del-no">CANCEL</button></div><p class="ad-help st-del-msg"></p>';
    const input = box.querySelector('.st-del-in'), go = box.querySelector('.st-del-go'), msg = box.querySelector('.st-del-msg');
    input.oninput = () => { go.disabled = input.value.trim() !== folder; };
    box.querySelector('.st-del-no').onclick = () => { box.hidden = true; };
    go.onclick = async () => {
      if (input.value.trim() !== folder || !canDelete(folder)) return;
      go.disabled = true; input.disabled = true; msg.textContent = 'Deleting…';
      try {
        const all = await GH.listFiles();
        const doomed = all.filter(f => f.path.startsWith(folder + '/'));
        if (!doomed.some(f => f.path === folder + '/game.json')) throw new Error('/' + folder + '/ is not a notebook folder, so it was left alone.');
        await GH.commit(doomed.map(f => ({ path: f.path, delete: true })), 'Delete the ' + title + ' notebook (/' + folder + '/)', s => { msg.textContent = s; });
        try { localStorage.removeItem(NB.draftKey('/' + folder + '/')); } catch (e) { /* blocked */ }
        msg.textContent = 'Deleted. The page goes offline when the site republishes, in about a minute.';
        loadGames();
      } catch (e) { msg.textContent = 'Not deleted: ' + e.message; go.disabled = false; input.disabled = false; }
    };
    input.focus();
  }

  function checkFolder() {
    const v = $('#n-folder').value.trim();
    const msg = $('#n-folder-msg');
    let bad = '';
    if (!v) { msg.textContent = 'Lowercase letters, numbers and dashes.'; msg.style.color = ''; return false; }
    else if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(v)) bad = 'Use 2 to 40 lowercase letters, numbers and dashes.';
    else if (files && files.some(f => f.path === v || f.path.startsWith(v + '/'))) bad = 'thegamebureau.com/' + v + '/ is already taken.';
    msg.textContent = bad || (v ? 'The game page will be thegamebureau.com/' + v + '/' : 'Lowercase letters, numbers and dashes.');
    msg.style.color = bad ? '#B42318' : '';
    return !bad;
  }

  function progress(items) {
    const ul = $('#n-progress'); ul.hidden = false;
    ul.innerHTML = items.map(([t, s]) => '<li class="' + (s || '') + '">' + t + '</li>').join('');
  }

  async function create() {
    const title = $('#n-title').value.trim();
    const folder = $('#n-folder').value.trim();
    const start = (document.querySelector('[name=n-start]:checked') || {}).value;
    if (!GH.token()) { show('setup'); $('#st-tok') && $('#st-tok').focus(); return; }
    if (!title) { show('content'); $('#n-title').focus(); return; }
    if (!files) await loadGames();
    if (!checkFolder()) { show('content'); $('#n-folder').focus(); return; }
    const go = $('#n-go'); go.disabled = true; $('#n-go-top').disabled = true;
    const steps = [['Copy the template', 'doing'], ['Fill in your details', ''], ['Save to GitHub', ''], ['Wait for the site to publish (about a minute)', '']];
    const mark = (i, s) => { steps[i][1] = s; progress(steps); };
    progress(steps);
    try {
      files = (await GH.listFiles());
      if (files.some(f => f.path.startsWith(folder + '/'))) throw new Error('thegamebureau.com/' + folder + '/ was just taken. Pick another address.');
      const src = files.filter(f => f.path.startsWith(start + '/') && !f.path.startsWith(start + '/pdf/') && !/\/\.keep$/.test(f.path));
      const srcJson = src.find(f => f.path === start + '/game.json');
      // An old copy of this page (open in a tab from before an update) can ask for a folder that has moved.
      if (!srcJson) throw new Error('Could not find /' + start + '/ on GitHub. The studio has probably been updated since this page was opened. Reload the page and try again.');
      const srcGame = JSON.parse(await GH.readBlobText(srcJson.sha));
      const oldTitle = srcGame.title;
      mark(0, 'done'); mark(1, 'doing');

      const g = srcGame;
      g.slug = folder; g.title = title;
      const tagline = $('#n-tagline').value.trim(); if (tagline) g.tagline = tagline;
      const pitch = $('#n-pitch').value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); if (pitch.length) g.description = pitch;
      g.shareText = tagline ? title + ': ' + tagline : '';
      g.price = $('#n-price').value.trim();
      const specs = [['PLAYERS', $('#n-players').value.trim()], ['TIME', $('#n-time').value.trim()], ['YOU NEED', $('#n-need').value.trim()]].filter(s => s[1]);
      if (start === 'studio/starter' || specs.length) g.specs = specs;
      g.brand = { color: colors[0], accent: colors[1], paper: colors[2], ink: colors[3] };
      g.print = Object.assign({}, g.print, { sheets: Math.max(1, +$('#n-sheets').value || 72) });
      g.setup = { colors: true };
      g.order = Object.assign({}, g.order, { url: '' });

      const swap = t => t.split(oldTitle).join(title).split(oldTitle.toUpperCase()).join(title.toUpperCase());
      const out = [];
      for (const f of src) {
        const rel = f.path.slice(start.length + 1);
        if (['game.json', 'index.html', 'rules.html', 'admin.html'].includes(rel)) continue;
        if (/\.(md|html|css|js|json|txt|svg)$/.test(rel)) out.push({ path: folder + '/' + rel, text: swap(await GH.readBlobText(f.sha)) });
        else out.push({ path: folder + '/' + rel, sha: f.sha }); // images: reuse the same file
      }
      out.push({ path: folder + '/game.json', text: JSON.stringify(g, null, 2) + '\n' });
      Object.entries(GH.shells(folder, g)).forEach(([f, t]) => out.push({ path: folder + '/' + f, text: t }));
      mark(1, 'done'); mark(2, 'doing');

      await GH.commit(out, 'Start the ' + title + ' notebook (from ' + start + ')');
      mark(2, 'done'); mark(3, 'doing');
      const live = await GH.waitForSite('/' + folder + '/game.json', null, i => { steps[3][0] = 'Wait for the site to publish (' + (i + 1) * 8 + 's)'; progress(steps); }, 40);
      mark(3, live ? 'done' : 'fail');
      $('#n-done').innerHTML = '<div class="ad-status ok" style="margin-top:14px"><b>' + esc(title) + ' is started.</b> ' +
        (live ? 'Its editor walks you through the rest.' : 'The site is still publishing, so the game page will show up in a minute or two. You can start editing now.') +
        ' The first PDFs build on their own in about 3 minutes.<div class="nb-row" style="margin-top:10px"><a class="nb-btn solid" href="/studio/?game=' + encodeURIComponent(folder) + '">EDIT IT</a><a class="nb-btn" href="/' + esc(folder) + '/" target="_blank" rel="noopener">VIEW THE GAME PAGE</a></div></div>';
      loadGames();
    } catch (e) {
      const i = steps.findIndex(s => s[1] === 'doing'); if (i >= 0) mark(i, 'fail');
      $('#n-done').innerHTML = '<div class="ad-status bad" style="margin-top:14px">' + esc(e.message) + '</div>';
    } finally { go.disabled = false; $('#n-go-top').disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.page === 'studio') page(); });
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.ad-copy');
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {});
  });
})();
