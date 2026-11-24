/* Notebook kit: studio parts the editor uses (/studio/). Needs kit.js and gh.js.
 * The studio is one interface: the game editor (admin.js). /studio/ opens it on a new, unsaved
 * notebook started from a template, and /studio/?game=<folder> opens an existing one. This file
 * holds the editor's Connect tab (the one-time GitHub setup) and Notebooks tab (every notebook,
 * with edit and delete). The template folders themselves are only read, never changed.
 */
(function () {
  'use strict';
  const NB = window.NB, GH = window.GH, esc = NB.esc;
  const S = (window.NBStudio = {});

  // The templates a new notebook can start from.
  S.STARTS = [
    ['studio/starter', 'Blank starter', 'A plain cover that fills itself in from your words, a score book and numbered game sheets. Best for a new idea.'],
    ['studio/dice-derby', 'Dice Derby sample', 'A finished example game with custom race cards. Start here to adapt its layouts.'],
  ];
  S.slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

  // ---------- Connect tab: the one-time GitHub setup ----------
  S.connect = function (el, onChange) {
    const $ = s => el.querySelector(s);
    const ok = !!GH.token();
    el.innerHTML = '<h2>Connect</h2><p class="ad-lede">The studio saves notebooks to the website through GitHub. Connect it once in each browser you use.</p>' +
      '<h3>GitHub <span class="st-badge' + (ok ? ' done' : '') + '">' + (ok ? '✓ DONE' : 'NOT SET UP YET') + '</span></h3>' +
      (ok ? '<p>The studio is set up in this browser. <span class="st-who"></span> <button type="button" class="ad-link st-forget">Disconnect</button></p>'
        : '<p class="ad-help">One-time setup, about 2 minutes. GitHub gives you a key, and the studio uses it to save.</p>' +
          '<ol class="st-howto">' +
          '<li><b>Open GitHub\'s token page.</b> <a class="nb-btn" href="' + GH.TOKEN_URL + '" target="_blank" rel="noopener">OPEN GITHUB ↗</a><small>Sign in as someone who can change the website.</small></li>' +
          '<li><b>Fill in the form.</b><small>Token name: <code>Notebook Studio</code>. Expiration: up to you (a year is fine). Resource owner: <code>the-game-bureau</code>. Repository access: <b>Only select repositories</b>, then pick <code>' + esc(GH.REPO) + '</code>.</small></li>' +
          '<li><b>Give it two permissions.</b><small>Under Repository permissions, set <b>Contents</b> to Read and write and <b>Actions</b> to Read and write. Leave everything else alone.</small></li>' +
          '<li><b>Generate the token and paste it here.</b><small>It starts with <code>github_pat_</code>. It stays in this browser and is only ever sent to GitHub.</small>' +
          '<div class="nb-row" style="margin-top:8px"><input id="st-tok" type="password" placeholder="github_pat_..." autocomplete="off" style="flex:1 1 260px;min-height:44px;border:1px solid #C9CDD2;border-radius:5px;padding:0 10px;font:14px ui-monospace,monospace"><button class="nb-btn solid" id="st-tok-save" type="button">FINISH SETUP</button></div><p class="ad-help" id="st-tok-msg"></p></li></ol>');
    if (ok) {
      GH.check().then(w => { $('.st-who').textContent = 'Signed in to GitHub as ' + w + '.'; }).catch(e => { $('.st-who').textContent = e.message; });
      $('.st-forget').onclick = () => { GH.setToken(''); S.connect(el, onChange); if (onChange) onChange(false); };
      return;
    }
    $('#st-tok-save').onclick = async () => {
      $('#st-tok-msg').textContent = 'Checking…';
      GH.setToken($('#st-tok').value.trim());
      try { await GH.check(); S.connect(el, onChange); if (onChange) onChange(true); }
      catch (e) { GH.setToken(''); $('#st-tok-msg').textContent = e.message; }
    };
  };

  // ---------- How it works tab ----------
  S.how = function (el) {
    el.innerHTML = '<h2>How it works</h2><p class="ad-lede">Use the studio to go from an idea to a live notebook game on thegamebureau.com.</p>' +
      '<ol class="st-flow">' +
      '<li><b>Connect</b>Once per browser, connect the studio to GitHub so it can save. See the Connect tab.</li>' +
      '<li><b>Make a notebook</b>Open the studio, give it a title and web address in Content, shape the rest, and click Create notebook.</li>' +
      '<li><b>Shape it</b>Colors, rules, cover, inside pages and photos, each with a live preview. The Checklist walks you through it.</li>' +
      '<li><b>Save and publish</b>One button. The site republishes in about a minute, and the PDFs build about 3 minutes later.</li>' +
      '<li><b>Sell and share</b>Add a Stripe link, order a printed proof, and share the page.</li></ol>' +
      '<h3>The tabs</h3><ul class="st-tabs-help">' +
      '<li><b>Checklist</b>: every step from idea to live notebook, ticked off as you go.</li>' +
      '<li><b>Content</b>: the words on the game page: title, tagline, description, specs, how it works, price and ordering, print size.</li>' +
      '<li><b>Colors</b>: the four colours, with 24 ready-made schemes.</li>' +
      '<li><b>Rules</b>, <b>Cover</b>, <b>Inside pages</b>: the files that make the notebook, each with an "Edit this page with an AI" box.</li>' +
      '<li><b>Photos &amp; video</b>: the gallery on the game page, and the browser-tab icon.</li>' +
      '<li><b>PDFs</b>: the cover, contents, print-at-home and free sampler PDFs.</li>' +
      '<li><b>Notebooks</b>: every notebook on the site, to open, view or delete.</li></ul>' +
      '<p class="ad-help">Edits are kept in this browser until you save, and the preview always shows them.</p>';
  };

  // ---------- Notebooks tab ----------
  S.games = async function (el, current) {
    el.innerHTML = '<h2>Notebooks</h2><p class="ad-lede">Every notebook game on the site. EDIT opens it here in the studio.</p>' +
      '<div class="nb-row"><a class="nb-btn solid" href="/studio/">+ NEW NOTEBOOK</a></div><div class="st-games-box"><p class="ad-help">Loading…</p></div>';
    const box = el.querySelector('.st-games-box');
    try {
      const r = await GH.listGames();
      box.innerHTML = '<div class="st-games">' + r.games.sort((a, b) => a.folder.startsWith('studio/') - b.folder.startsWith('studio/') || a.folder.localeCompare(b.folder)).map(({ folder, game: g }) =>
        '<div class="st-game' + (folder === current ? ' current' : '') + '"><div class="sw" style="background:' + esc((g.brand && g.brand.color) || '#1F3A5F') + '"></div><div class="b">' +
        (folder.startsWith('studio/') ? '<span class="tag">TEMPLATE</span>' : '') + (folder === current ? '<span class="tag">OPEN NOW</span>' : '') +
        '<h3>' + esc(g.title) + '</h3><small>/' + esc(folder) + '/</small><p class="ad-help">' + esc(g.tagline || '') + '</p>' +
        '<div class="nb-row"><a class="nb-btn solid" href="/studio/?game=' + encodeURIComponent(folder) + '">EDIT</a><a class="nb-btn" href="/' + esc(folder) + '/" target="_blank" rel="noopener">PAGE</a>' +
        (canDelete(folder) ? '<button type="button" class="nb-btn st-del" data-del="' + esc(folder) + '" data-title="' + esc(g.title) + '">DELETE</button>' : '') +
        '</div><div class="st-del-box" hidden></div></div></div>').join('') + '</div>';
      box.querySelectorAll('[data-del]').forEach(btn => { btn.onclick = () => askDelete(btn, () => S.games(el, current)); });
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

  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('.ad-copy');
    if (c && navigator.clipboard) navigator.clipboard.writeText(c.textContent).then(() => { c.classList.add('copied'); setTimeout(() => c.classList.remove('copied'), 1200); }, () => {});
  });
})();
