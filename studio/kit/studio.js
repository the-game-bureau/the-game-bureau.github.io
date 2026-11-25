/* Notebook kit: studio parts the editor uses (/studio/). Needs kit.js and gh.js.
 * The studio is one interface: the game editor (admin.js). /studio/?new opens it on a new
 * notebook started from the blank starter or a copy of another notebook, and
 * /studio/?game=<folder> opens an existing one. This file
 * holds the editor's Connect tab (the one-time GitHub setup) and Notebooks tab (every notebook,
 * with edit and delete). The template folders themselves are only read, never changed.
 */
(function () {
  'use strict';
  const NB = window.NB, GH = window.GH, esc = NB.esc;
  const S = (window.NBStudio = {});

  // A new notebook starts from the blank starter (studio/starter, hidden from the Notebooks list)
  // or from a copy of any notebook already on the site.
  S.STARTER = 'studio/starter';
  S.STARTS = [[S.STARTER, 'Blank starter', 'A plain cover that fills itself in from your words, a score book and numbered game sheets.']];
  const isGame = folder => !/^studio\//.test(folder);
  S.startChoices = async function () {
    const r = await GH.listGames();
    return S.STARTS.concat(r.games.filter(x => isGame(x.folder)).sort((a, b) => a.folder.localeCompare(b.folder))
      .map(x => [x.folder, 'Copy of ' + (x.game.title || x.folder), '/' + x.folder + '/: its colours, rules, cover and inside pages.']));
  };
  S.slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  // ---------- Connect tab: the one-time GitHub setup ----------
  S.connect = function (el, onChange) {
    const $ = s => el.querySelector(s);
    const ok = !!GH.token();
    const repo = '<a href="https://github.com/' + esc(GH.REPO) + '" target="_blank" rel="noopener">https://github.com/' + esc(GH.REPO) + '</a>';
    el.innerHTML = '<h2>Connect</h2><p class="ad-lede st-conn-lede">In order to save and publish a notebook game, you must be connected to ' + repo + '</p>' +
      (ok ? connected()
        : '<div class="st-conn off"><div class="st-conn-head"><span class="st-conn-dot" aria-hidden="true">!</span><div><b>Not connected in this browser</b><small>One-time setup, about 2 minutes. GitHub gives you a key, and the studio uses it to save.</small></div></div>' +
          '<ol class="st-howto">' +
          '<li><b>Open GitHub\'s token page.</b> <a class="nb-btn" href="' + GH.TOKEN_URL + '" target="_blank" rel="noopener">OPEN GITHUB ↗</a><small>Sign in as someone who can change the website.</small></li>' +
          '<li><b>Fill in the form.</b><small>Token name: <code>Notebook Studio</code>. Expiration: up to you (a year is fine; note the date). Resource owner: <code>the-game-bureau</code>. Repository access: <b>Only select repositories</b>, then pick <code>' + esc(GH.REPO) + '</code>.</small></li>' +
          '<li><b>Give it two permissions.</b><small>Under Repository permissions, set <b>Contents</b> to Read and write and <b>Actions</b> to Read and write. Leave everything else alone.</small></li>' +
          '<li><b>Generate the token and paste it here.</b><small>It starts with <code>github_pat_</code>. It stays in this browser and is only ever sent to GitHub.</small>' +
          '<div class="st-tok-row"><label class="st-exp st-grow"><span>Key</span><input id="st-tok" type="password" placeholder="github_pat_..." autocomplete="off"></label>' +
          '<label class="st-exp"><span>Expires on</span><input id="st-exp" type="date" value="' + inAYear() + '"></label></div>' +
          '<small>The expiry date is the one you chose on GitHub. The studio warns you 14 days before.</small>' +
          '<div class="nb-row" style="margin-top:12px"><button class="nb-btn solid" id="st-tok-save" type="button">FINISH SETUP</button></div><p class="ad-help" id="st-tok-msg"></p></li></ol></div>');
    if (ok) {
      GH.check().then(w => { $('.st-who').textContent = 'Signed in as ' + w + ', in this browser'; }).catch(e => { $('.st-who').textContent = e.message; });
      GH.permissions().then(p => { perm($('[data-perm=contents]'), p.contents, 'Contents'); perm($('[data-perm=actions]'), p.actions, 'Actions'); })
        .catch(() => { el.querySelectorAll('[data-perm]').forEach(d => { d.innerHTML = '<span class="st-q">Could not check</span>'; }); });
      $('.st-forget').onclick = () => { GH.setToken(''); S.connect(el, onChange); if (onChange) onChange(false); };
      const edit = () => { $('#st-exp-view').hidden = true; $('#st-exp-form').hidden = false; $('#st-exp').focus(); };
      if ($('#st-exp-edit')) $('#st-exp-edit').onclick = edit;
      $('#st-exp-save').onclick = () => { GH.setExpires($('#st-exp').value); S.connect(el, onChange); if (onChange) onChange(true); };
      return;
    }
    $('#st-tok-save').onclick = async () => {
      $('#st-tok-msg').textContent = 'Checking…';
      GH.setToken($('#st-tok').value.trim());
      try {
        await GH.check();
        const p = await GH.permissions();
        if (p.contents === false) throw new Error('The key can\'t write to ' + GH.REPO + '. On GitHub, set Contents to Read and write, then paste it again.');
        GH.setExpires($('#st-exp').value); GH.rejected = false; S.connect(el, onChange); if (onChange) onChange(true); }
      catch (e) { GH.setToken(''); $('#st-tok-msg').textContent = e.status === 401 ? 'GitHub did not accept that key. Check you copied all of it.' : e.message; }
    };
  };

  // Connected: one card with who is signed in, then a row each for the repository, the two
  // permissions and when the key expires.
  function connected() {
    const v = GH.expires(), n = GH.daysLeft();
    const when = v ? new Date(v + 'T12:00').toLocaleDateString([], { dateStyle: 'long' }) : '';
    const bad = GH.rejected || (v && n < 0);
    const exp = GH.rejected ? '<span class="st-bad">GitHub no longer accepts this key</span><small>It has probably expired. DISCONNECT, then set up a new key.</small>'
      : !v ? '<span class="st-q">Not set</span><small>Add the date and the studio warns you 14 days before.</small>'
      : n < 0 ? '<span class="st-bad">Expired ' + esc(when) + '</span><small>DISCONNECT, then set up a new key.</small>'
      : n <= 14 ? '<span class="st-warn">' + esc(when) + ', ' + (n === 0 ? 'today' : 'in ' + n + ' day' + (n === 1 ? '' : 's')) + '</span><small>DISCONNECT, then set up a new key before then.</small>'
      : '<span>' + esc(when) + '</span><small>The studio warns you 14 days before.</small>';
    return '<div class="st-conn' + (bad ? ' bad' : '') + '"><div class="st-conn-head"><span class="st-conn-dot" aria-hidden="true">' + (bad ? '!' : '✓') + '</span>' +
      '<div><b>' + (bad ? 'Connected, but the key no longer works' : 'Connected to GitHub') + '</b><small class="st-who">Checking…</small></div>' +
      '<button type="button" class="nb-btn st-forget">DISCONNECT</button></div>' +
      '<dl class="st-conn-rows">' +
      '<div><dt>Repository</dt><dd><a href="https://github.com/' + esc(GH.REPO) + '" target="_blank" rel="noopener">' + esc(GH.REPO) + ' ↗</a></dd></div>' +
      '<div><dt>Save and publish</dt><dd data-perm="contents"><span class="st-q">Checking…</span></dd></div>' +
      '<div><dt>PDF builds</dt><dd data-perm="actions"><span class="st-q">Checking…</span></dd></div>' +
      '<div><dt>Key expires</dt><dd><div id="st-exp-view"' + (v ? '' : ' hidden') + '>' + exp + (v ? ' <button type="button" class="ad-link" id="st-exp-edit">Change date</button>' : '') + '</div>' +
      '<div id="st-exp-form"' + (v ? ' hidden' : '') + '>' + (v ? '' : exp) + '<div class="st-exp-form"><input id="st-exp" type="date" value="' + esc(v) + '" aria-label="Key expiry date"><button type="button" class="nb-btn" id="st-exp-save">SAVE DATE</button></div></div></dd></div>' +
      '</dl></div>';
  }
  // One permission row: allowed, or what is missing and how to fix it on GitHub.
  function perm(dd, v, name) {
    if (!dd) return;
    const uses = name === 'Contents' ? 'SAVE and PUBLISH won\'t work.' : 'BUILD PDFS NOW and the PDF status after PUBLISH won\'t work. The PDFs still rebuild on their own after each publish.';
    dd.innerHTML = v ? '<span class="st-ok">✓ Allowed</span><small>' + name + ': Read and write</small>'
      : v === false ? '<span class="st-bad">✕ Not allowed</span><small>' + uses + ' <a href="' + GH.LIST_TOKENS_URL + '" target="_blank" rel="noopener">Open your keys on GitHub ↗</a>, click this one and set ' + name + ' to Read and write. The same key keeps working.</small>'
      : '<span class="st-q">Could not check</span>';
  }
  function inAYear() { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); }

  // ---------- Notebooks tab ----------
  // A notebook card's picture: the cover from its last PDF build, else its first photo. The build is
  // listed on GitHub a minute or two before the website has it, so a picture that doesn't load yet
  // falls back to the first photo, and then to a strip of the notebook's colour.
  function cardPic(folder, g, built) {
    const ph = (g.media || []).find(m => (m.type || 'image') === 'image' && m.src);
    const photo = ph ? (/^(https?:)?\//.test(ph.src) ? ph.src : '/' + folder + '/' + ph.src.replace(/^\.\//, '')) : '';
    const src = built ? '/' + folder + '/pdf/preview-1.jpg' : photo;
    const sw = '<div class="sw" style="background:' + esc((g.brand && g.brand.color) || '#1F3A5F') + '"></div>';
    if (!src) return sw;
    const next = built && photo ? photo : '';
    return '<a class="st-cover" href="/studio/?game=' + encodeURIComponent(folder) + '" aria-label="Edit ' + esc(g.title) + '"><img src="' + esc(src) + '" alt="" loading="lazy"' +
      ' data-next="' + esc(next) + '" data-sw="' + esc(sw) + '" onerror="if(this.dataset.next){this.src=this.dataset.next;this.dataset.next=\'\'}else{this.parentNode.outerHTML=this.dataset.sw}"></a>';
  }
  S.games = async function (el, current) {
    el.innerHTML = '<h2>Notebooks</h2><p class="ad-lede">Start a new notebook or edit an existing notebook to continue.</p>' +
      '<div class="nb-row"><a class="nb-btn solid" href="/studio/?new#content">+ NEW NOTEBOOK</a></div><div class="st-games-box"><p class="ad-help">Loading…</p></div>';
    const box = el.querySelector('.st-games-box');
    try {
      const [r, drafts] = await Promise.all([GH.listGames(), GH.token() ? GH.listDrafts().catch(() => []) : []]);
      const saved = {}; drafts.forEach(d => { saved[d.key] = d; });
      // A picture of each cover, from its last PDF build.
      const pics = new Set(r.files.filter(f => /\/pdf\/preview-1\.jpg$/.test(f.path)).map(f => f.path.replace(/\/pdf\/preview-1\.jpg$/, '')));
      const fresh = drafts.filter(d => d.isNew).sort((a, b) => b.at - a.at).map(d =>
        '<div class="st-game"><div class="sw" style="background:' + esc((d.brand && d.brand.color) || '#1F3A5F') + '"></div><div class="b"><span class="tag">SAVED, NOT PUBLISHED</span>' +
        '<h3>' + esc(d.title || d.key) + '</h3><small>/' + esc(d.key) + '/ · saved ' + esc(new Date(d.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + (d.by ? ' by ' + esc(d.by) : '') + '</small><p class="ad-help">' + esc(d.tagline) + '</p>' +
        '<div class="nb-row"><a class="nb-btn solid" href="/studio/?new&open=' + encodeURIComponent(d.key) + '#content">EDIT</a>' +
        '<button type="button" class="nb-btn st-del" data-deldraft="' + esc(d.key) + '" data-title="' + esc(d.title || d.key) + '">DELETE</button></div><div class="st-del-box" hidden></div></div></div>').join('');
      box.innerHTML = '<div class="st-games">' + fresh + r.games.filter(x => isGame(x.folder)).sort((a, b) => a.folder.localeCompare(b.folder)).map(({ folder, game: g }) =>
        '<div class="st-game' + (folder === current ? ' current' : '') + '">' + cardPic(folder, g, pics.has(folder)) + '<div class="b">' +
        (folder === current ? '<span class="tag">OPEN NOW</span>' : '') + (saved[folder] ? '<span class="tag">SAVED CHANGES, NOT PUBLISHED</span>' : '') +
        '<h3>' + esc(g.title) + '</h3><small>/' + esc(folder) + '/<span class="st-pub" data-pub="' + esc(folder) + '"></span></small><p class="ad-help">' + esc(g.tagline || '') + '</p>' +
        '<div class="nb-row"><a class="nb-btn solid" href="/studio/?game=' + encodeURIComponent(folder) + '">EDIT</a>' +
        (canDelete(folder) ? '<button type="button" class="nb-btn st-del" data-del="' + esc(folder) + '" data-title="' + esc(g.title) + '">DELETE</button>' : '') +
        '</div><div class="st-del-box" hidden></div></div></div>').join('') + '</div>';
      box.querySelectorAll('[data-del]').forEach(btn => { btn.onclick = () => askDelete(btn, () => S.games(el, current)); });
      // When each was last published (the PDF bot's commits don't count).
      box.querySelectorAll('[data-pub]').forEach(el => {
        GH.history(el.dataset.pub).then(list => {
          const c = (list || []).find(x => !/^Rebuild notebook PDFs/.test(x.commit.message));
          if (c) el.textContent = ' · published ' + new Date(c.commit.author.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        }).catch(() => {});
      });
      box.querySelectorAll('[data-deldraft]').forEach(btn => { btn.onclick = () => askDeleteDraft(btn, () => S.games(el, current)); });
    } catch (e) {
      box.innerHTML = '<p class="ad-help">Could not list notebooks: ' + esc(e.message) + '</p>';
    }
  };

  // ---------- deleting a notebook ----------
  // The template folders (studio/...) can never be deleted from here.
  const canDelete = folder => /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/.test(folder) && !/^(studio|template)(\/|$)/.test(folder);
  function askDelete(btn, reload) {
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
        reload();
      } catch (e) { msg.textContent = 'Not deleted: ' + e.message; go.disabled = false; input.disabled = false; }
    };
    input.focus();
  }

  // A notebook saved but never published lives only on the studio-drafts branch, so deleting it
  // touches nothing on the site.
  function askDeleteDraft(btn, reload) {
    const key = btn.dataset.deldraft, title = btn.dataset.title;
    const box = btn.closest('.b').querySelector('.st-del-box');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p><b>Delete ' + esc(title) + '?</b> It was saved but never published, so nothing on the site changes. The saved copy is gone for every browser.</p>' +
      '<div class="nb-row"><button type="button" class="nb-btn st-del-go">DELETE ' + esc(title.toUpperCase()) + '</button><button type="button" class="nb-btn st-del-no">CANCEL</button></div><p class="ad-help st-del-msg"></p>';
    const go = box.querySelector('.st-del-go'), msg = box.querySelector('.st-del-msg');
    box.querySelector('.st-del-no').onclick = () => { box.hidden = true; };
    go.onclick = async () => {
      go.disabled = true; msg.textContent = 'Deleting…';
      try {
        await GH.writeDrafts([{ key, delete: true }], 'Delete the saved notebook ' + title + ' (never published)', s => { msg.textContent = s; });
        // This browser forgets it too, if it was the new notebook open here.
        try { const d = JSON.parse(localStorage.getItem('nb-draft:/studio/new/') || 'null'); if (d && d.savedKey === key) localStorage.removeItem('nb-draft:/studio/new/'); } catch (e) { /* blocked */ }
        reload();
      } catch (e) { msg.textContent = 'Not deleted: ' + e.message; go.disabled = false; }
    };
  }

  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.ad-copy');
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {});
  });
})();
