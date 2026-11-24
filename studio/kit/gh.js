/* Notebook kit: talking to GitHub from the browser (the studio and the admin pages).
 *
 * The site is GitHub Pages, so "saving" a page means committing it to the repository;
 * every commit to main republishes the site, and the notebook-pdfs workflow rebuilds
 * the PDFs. All calls use a fine-grained token saved in this browser:
 *   repository: the-game-bureau/the-game-bureau.github.io only
 *   permissions: Contents: Read and write, Actions: Read and write
 */
(function () {
  'use strict';
  const GH = (window.GH = window.GH || {});
  GH.REPO = 'the-game-bureau/the-game-bureau.github.io';
  GH.BRANCH = 'main';
  GH.WORKFLOW = 'notebook-pdfs.yml';
  GH.SITE = 'thegamebureau.com';
  const TOKEN_KEY = 'nb-github-token';
  const API = 'https://api.github.com/repos/' + GH.REPO;
  GH.TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
  GH.ACTIONS_URL = 'https://github.com/' + GH.REPO + '/actions/workflows/' + GH.WORKFLOW;

  GH.token = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  GH.setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ } };

  GH.api = async function (path, opts = {}) {
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (GH.token()) headers.Authorization = 'Bearer ' + GH.token();
    const r = await fetch(path.startsWith('http') ? path : API + path, {
      method: opts.method || 'GET', headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store',
    });
    if (opts.raw) return r;
    if (!r.ok) {
      let msg = r.status + ' ' + r.statusText;
      try { const j = await r.json(); if (j.message) msg = j.message + ' (' + r.status + ')'; } catch (e) { /* not json */ }
      if (r.status === 401) msg = 'GitHub did not accept the token. It may be expired or mistyped. (' + r.status + ')';
      if (r.status === 403 || r.status === 404) msg += '. Check the token is for ' + GH.REPO + ' with Contents and Actions set to Read and write.';
      const e = new Error(msg); e.status = r.status; throw e;
    }
    return r.status === 204 ? null : r.json();
  };

  // Checks the saved token can write to the repository. Resolves to the GitHub login.
  GH.check = async function () {
    if (!GH.token()) throw new Error('No GitHub token saved yet.');
    const repo = await GH.api('');
    if (!repo.permissions || !repo.permissions.push) throw new Error('The token can read the repository but not write to it. Give it Contents: Read and write.');
    const me = await GH.api('https://api.github.com/user').catch(() => ({ login: 'you' }));
    return me.login;
  };

  // ---------- reading ----------
  const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
  const bytesToText = bytes => new TextDecoder().decode(bytes);
  GH.textToB64 = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  GH.headTree = async function () {
    const ref = await GH.api('/git/ref/heads/' + GH.BRANCH);
    const commit = await GH.api('/git/commits/' + ref.object.sha);
    return { commitSha: ref.object.sha, treeSha: commit.tree.sha };
  };

  // Every file path in the repository, with its blob sha.
  GH.listFiles = async function () {
    const { treeSha } = await GH.headTree();
    const t = await GH.api('/git/trees/' + treeSha + '?recursive=1');
    if (t.truncated) throw new Error('The repository is too big for GitHub to list in one go, so the studio cannot see every file. Ask for help moving large files out of it.');
    return t.tree.filter(x => x.type === 'blob');
  };

  // Reads a text file from main (not the published site, which can lag a minute behind).
  GH.readText = async function (path) {
    const f = await GH.api('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + GH.BRANCH);
    return bytesToText(b64ToBytes(f.content));
  };
  GH.readBlobText = async sha => bytesToText(b64ToBytes((await GH.api('/git/blobs/' + sha)).content));

  // Folders that hold a notebook game (game.json with "kit": "notebook").
  GH.listGames = async function () {
    const files = await GH.listFiles();
    const jsons = files.filter(f => /(^|\/)game\.json$/.test(f.path) && f.path.split('/').length <= 4);
    const games = [];
    for (const f of jsons) {
      try {
        const g = JSON.parse(await GH.readBlobText(f.sha));
        if (g.kit === 'notebook') games.push({ folder: f.path.replace(/\/?game\.json$/, ''), game: g });
      } catch (e) { /* not ours */ }
    }
    return { games, files };
  };

  // ---------- writing ----------
  // Commits many files to main in one commit. files: [{path, text}] or [{path, base64}]
  // or [{path, sha}] (reuse an existing blob) or [{path, delete: true}].
  GH.commit = async function (files, message, onStep) {
    const step = onStep || (() => {});
    for (let attempt = 0; attempt < 3; attempt++) {
      step('Preparing ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
      const head = await GH.headTree();
      const tree = [];
      for (const f of files) {
        if (f.delete) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
        let sha = f.sha;
        if (!sha) {
          const blob = await GH.api('/git/blobs', { method: 'POST', body: f.base64 != null ? { content: f.base64, encoding: 'base64' } : { content: f.text, encoding: 'utf-8' } });
          sha = blob.sha;
        }
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha });
      }
      step('Committing…');
      const newTree = await GH.api('/git/trees', { method: 'POST', body: { base_tree: head.treeSha, tree } });
      const commit = await GH.api('/git/commits', { method: 'POST', body: { message, tree: newTree.sha, parents: [head.commitSha] } });
      try {
        await GH.api('/git/refs/heads/' + GH.BRANCH, { method: 'PATCH', body: { sha: commit.sha, force: false } });
        return commit;
      } catch (e) {
        // Someone (often the PDF bot) pushed in between: start again from the new head.
        if (e.status !== 422 || attempt === 2) throw e;
        step('The site changed while saving. Trying again…');
      }
    }
  };

  // ---------- builds and publishing ----------
  GH.dispatchBuild = folder => GH.api('/actions/workflows/' + GH.WORKFLOW + '/dispatches', { method: 'POST', body: { ref: GH.BRANCH, inputs: { game: folder } } });
  GH.runs = (workflow, query) => GH.api('/actions/workflows/' + workflow + '/runs?per_page=10' + (query || ''));

  // Waits until the published site serves the given file and check(text) is true.
  GH.waitForSite = async function (url, check, onTick, tries = 60) {
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
        if (r.ok && (!check || check(await r.text()))) return true;
      } catch (e) { /* not there yet */ }
      if (onTick) onTick(i);
      await new Promise(r => setTimeout(r, 8000));
    }
    return false;
  };

  // ---------- page shells ----------
  // index.html, rules.html and admin.html are short shells; their <head> carries the title and
  // share-preview tags, which link previews read without running JavaScript. The studio and
  // admin page write them from game.json so they never drift.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  GH.shells = function (folder, g) {
    const rnFull = ((g.rulesName || '').trim() || 'Rules'), rn = rnFull === 'Rules' ? 'rules' : rnFull;
    const url = 'https://' + GH.SITE + '/' + folder + '/';
    const img = g.shareImage ? url + g.shareImage : (g.media || []).find(m => m && m.type === 'image' && m.src) ? url + g.media.find(m => m && m.type === 'image' && m.src).src : url + 'pdf/preview-1.jpg';
    const desc = g.tagline || g.title;
    const full = g.title + (g.subtitle ? ': ' + g.subtitle : '');
    const head = (title, extra) => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<!-- Made with the notebook kit (/studio/). This page is built from game.json; the tags below are written by the admin page when you save. -->\n' +
      '<title>' + esc(title) + '</title>\n' + extra +
      '<link rel="icon" href="/favicon.ico">\n<link rel="stylesheet" href="/studio/kit/kit.css">\n<script src="/studio/kit/kit.js" defer></script>\n';
    const og = (title, u) => '<meta name="description" content="' + esc(desc) + '">\n<link rel="canonical" href="' + esc(u) + '">\n' +
      '<meta property="og:type" content="product">\n<meta property="og:title" content="' + esc(title) + '">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
      '<meta property="og:url" content="' + esc(u) + '">\n<meta property="og:image" content="' + esc(img) + '">\n<meta name="twitter:card" content="summary_large_image">\n';
    return {
      'index.html': head(g.title + ' | The Game Bureau', og(full, url)) + '</head>\n<body data-page="public">\n<noscript><p style="padding:24px">' + esc(full) + '. <a href="./rules.html">' + esc(rnFull === 'Rules' ? 'Read the rules' : rnFull) + '</a>.</p></noscript>\n</body>\n</html>\n',
      'rules.html': head(g.title + ' ' + rn + ' | The Game Bureau', og(g.title + ' ' + rn, url + 'rules.html')) + '</head>\n<body data-page="rules"></body>\n</html>\n',
      'admin.html': head(g.title + ' · Notebook admin', '<meta name="robots" content="noindex,nofollow">\n').replace('<script src="/studio/kit/kit.js" defer></script>\n',
        '<link rel="stylesheet" href="/studio/kit/admin.css">\n<script src="/studio/kit/kit.js" defer></script>\n<script src="/studio/kit/gh.js" defer></script>\n<script src="/studio/kit/admin.js" defer></script>\n') +
        '</head>\n<body data-page="admin"></body>\n</html>\n',
    };
  };
})();
