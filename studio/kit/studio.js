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

  function page() {
    NB.applyBrand({ brand: { color: '#1F3A5F', accent: '#E0A526', paper: '#FFFDF7', ink: '#16181A' } });
    document.body.innerHTML =
      '<header class="nb-bar"><div class="nb-wrap"><a class="nb-home" href="/">THE GAME BUREAU</a></div></header>' +
      '<main class="st-main">' +
      '<h1>Notebook Studio</h1><p class="lede">Use the studio to go from an idea to a live notebook game on thegamebureau.com.</p>' +

      '<section class="st-card st-setup" id="connect"><div class="st-step-head"><span class="st-num">1</span><div><div class="st-kick">ONE-TIME SETUP · ABOUT 2 MINUTES</div><h2>Set up the studio</h2></div><span class="st-badge" id="st-badge"></span></div>' +
      '<p class="ad-lede" id="st-setup-lede">The studio saves your notebooks to the website through GitHub, so it needs a key from GitHub before it can do anything. You only do this once on each computer or browser.</p>' +
      '<div id="st-gh"></div></section>' +

      '<section class="st-card" id="new"><div class="st-step-head"><span class="st-num">2</span><div><div class="st-kick">EVERY NEW GAME</div><h2>Make a notebook</h2></div></div>' +
      '<p class="st-locked-msg" id="st-locked-msg">Finish step 1 first. This form unlocks once the studio is set up.</p>' +
      '<div id="st-new-body">' +
      '<p class="ad-lede">You can change all of this later in the editor.</p>' +
      '<div class="st-form">' +
      '<label class="ad-field"><span>Game name</span><input id="n-title" placeholder="e.g. Pitch Count" autocomplete="off"></label>' +
      '<label class="ad-field"><span>Web address</span><span class="st-url"><b>thegamebureau.com/</b><input id="n-folder" placeholder="pitch-count" autocomplete="off" spellcheck="false"></span><small id="n-folder-msg">Lowercase letters, numbers and dashes.</small></label>' +
      '<label class="ad-field wide"><span>Tagline</span><input id="n-tagline" placeholder="One sentence: what it is and why it\'s fun."></label>' +
      '<label class="ad-field wide"><span>The idea</span><textarea id="n-pitch" rows="4" placeholder="Who plays, what you do, what makes it fun. Leave a blank line between paragraphs."></textarea></label>' +
      '<label class="ad-field"><span>Players</span><input id="n-players" value="2 to 6"></label>' +
      '<label class="ad-field"><span>Time</span><input id="n-time" placeholder="About 30 minutes"></label>' +
      '<label class="ad-field"><span>You need</span><input id="n-need" value="A pencil"></label>' +
      '<label class="ad-field"><span>Price</span><input id="n-price" value="$9.99"></label>' +
      '<label class="ad-field"><span>Game sheets in the notebook</span><input id="n-sheets" type="number" value="24" min="1" max="300"></label>' +
      '<div class="ad-field"><span>Colours</span><div class="ad-presets" id="n-colors"></div></div>' +
      '<div class="ad-field wide"><span>Start from</span><div class="st-starts">' + STARTS.map((s, i) => '<label><input type="radio" name="n-start" value="' + s[0] + '"' + (i ? '' : ' checked') + '><span><b>' + s[1] + '</b><small>' + s[2] + '</small></span></label>').join('') + '</div></div>' +
      '</div>' +
      '<div class="nb-row"><button class="nb-btn solid big" id="n-go" type="button">CREATE THE NOTEBOOK</button></div>' +
      '<ul class="st-progress" id="n-progress" hidden></ul><div id="n-done"></div>' +
      '</div></section>' +

      '<section class="st-card"><div class="st-step-head"><span class="st-num">3</span><div><div class="st-kick">IN THE EDITOR</div><h2>Finish it and go live</h2></div></div>' +
      '<p class="ad-lede">Creating a notebook opens it in the editor, which has a checklist for the rest. To come back to a notebook later, click EDIT on it under Notebooks below.</p><ol class="st-flow">' +
      '<li><b>Shape it</b>Words, colours, rules, cover, inside pages, photos. A live preview shows each change.</li>' +
      '<li><b>Save and publish</b>One button. The site republishes in about a minute.</li>' +
      '<li><b>PDFs build</b>Cover, contents, print-at-home and free sampler, about 3 minutes after each save.</li>' +
      '<li><b>Sell and share</b>Add a Stripe link, order a printed proof, share the page.</li>' +
      '</ol></section>' +

      '<section class="st-card" id="games"><h2>Notebooks</h2><div id="st-games"><p class="ad-help">Loading…</p></div></section>' +
      '</main>';

    $('#n-colors').innerHTML = PRESETS.map((x, i) => '<button type="button" data-p="' + i + '"' + (i ? '' : ' aria-pressed="true"') + ' title="' + esc(x[0]) + '">' + x.slice(1).map(c => '<span style="background:' + c + '"></span>').join('') + '<b>' + esc(x[0]) + '</b></button>').join('');
    document.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => { colors = PRESETS[+b.dataset.p].slice(1); document.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
    let folderTouched = false;
    $('#n-title').oninput = () => { if (!folderTouched) { $('#n-folder').value = slugify($('#n-title').value); checkFolder(); } };
    $('#n-folder').oninput = () => { folderTouched = true; checkFolder(); };
    $('#n-go').onclick = create;
    ghBox();
    loadGames();
  }

  function setupState(ok, who) {
    const card = $('#connect');
    card.classList.toggle('done', ok);
    $('#st-badge').textContent = ok ? '✓ DONE' : 'NOT SET UP YET';
    $('#st-setup-lede').hidden = ok;
    const nw = $('#new');
    nw.classList.toggle('st-locked', !ok);
    $('#st-locked-msg').hidden = ok;
    nw.querySelectorAll('#st-new-body input, #st-new-body textarea, #st-new-body button').forEach(el => { el.disabled = !ok; });
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
      try { await GH.check(); ghBox(); loadGames(); location.hash = 'new'; } catch (e) { GH.setToken(''); $('#st-tok-msg').textContent = e.message; }
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
    if (!GH.token()) { location.hash = 'connect'; $('#st-tok') && $('#st-tok').focus(); return; }
    if (!title) { $('#n-title').focus(); return; }
    if (!files) await loadGames();
    if (!checkFolder()) { $('#n-folder').focus(); return; }
    const go = $('#n-go'); go.disabled = true;
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
      g.print = Object.assign({}, g.print, { sheets: Math.max(1, +$('#n-sheets').value || 24) });
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
    } finally { go.disabled = false; }
  }

  document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.page === 'studio') page(); });
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.ad-copy');
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {});
  });
})();
