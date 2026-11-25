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
  GH.setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : (localStorage.removeItem(TOKEN_KEY), localStorage.removeItem(EXP_KEY)); } catch (e) { /* storage blocked */ } };
  // When the key expires (YYYY-MM-DD), as chosen on GitHub. GitHub doesn't let web pages read
  // it, so Connect asks for it once; the studio warns 14 days ahead.
  const EXP_KEY = 'nb-github-token-expires';
  GH.expires = () => { try { const v = localStorage.getItem(EXP_KEY) || ''; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; } catch (e) { return ''; } };
  GH.setExpires = v => { try { /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? localStorage.setItem(EXP_KEY, v) : localStorage.removeItem(EXP_KEY); } catch (e) { /* storage blocked */ } };
  GH.daysLeft = () => { const v = GH.expires(); if (!v) return null; const [y, m, d] = v.split('-').map(Number); return Math.ceil((new Date(y, m - 1, d) - new Date(new Date().toDateString())) / 86400000); };
  GH.rejected = false; // GitHub turned the key down (expired or revoked)

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
      if (r.status === 401 && GH.token()) { msg = 'GitHub no longer accepts this browser\'s key. It has probably expired: open Connect, click Disconnect, and set up a new key.'; GH.rejected = true; document.dispatchEvent(new Event('nb-key-rejected')); }
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

  // What the key may do, tested without changing anything. Each probe asks for something GitHub
  // turns down either for a reason it only checks once the permission is there (422: the object
  // or branch doesn't exist), or for lack of the permission (403/404). true, false, or null if unsure.
  GH.LIST_TOKENS_URL = 'https://github.com/settings/personal-access-tokens';
  GH.permissions = async function () {
    const probe = async (path, body) => {
      try { await GH.api(path, { method: 'POST', body }); return true; }
      catch (e) { return e.status === 422 ? true : (e.status === 403 || e.status === 404) ? false : null; }
    };
    const [contents, actions] = await Promise.all([
      probe('/git/refs', { ref: 'refs/heads/studio-permission-check', sha: '0000000000000000000000000000000000000000' }),
      probe('/actions/workflows/' + GH.WORKFLOW + '/dispatches', { ref: 'studio-permission-check-no-such-branch', inputs: { game: 'studio-permission-check' } }),
    ]);
    return { contents, actions };
  };

  // ---------- reading ----------
  const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
  const bytesToText = bytes => new TextDecoder().decode(bytes);
  GH.textToB64 = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  GH.headTree = async function (branch) {
    const ref = await GH.api('/git/ref/heads/' + (branch || GH.BRANCH));
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
  GH.readBlobB64 = async sha => (await GH.api('/git/blobs/' + sha)).content.replace(/\s/g, '');
  // A text file as it was at a commit (or branch). null if it did not exist then.
  GH.readTextAt = async function (path, ref) {
    try { const f = await GH.api('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref)); return bytesToText(b64ToBytes(f.content)); }
    catch (e) { if (e.status === 404) return null; throw e; }
  };
  // Every file at a commit, with its blob sha.
  GH.filesAt = async function (commitSha) {
    const c = await GH.api('/git/commits/' + commitSha);
    const t = await GH.api('/git/trees/' + c.tree.sha + '?recursive=1');
    return t.tree.filter(x => x.type === 'blob');
  };
  // Commits on main that touched a folder, newest first.
  GH.history = folder => GH.api('/commits?sha=' + GH.BRANCH + '&path=' + encodeURIComponent(folder) + '&per_page=50');
  // The GitHub login of whoever owns the token (cached), to say who saved a draft.
  let login = null;
  GH.login = async function () {
    if (login) return login;
    try { login = (await GH.api('https://api.github.com/user')).login || ''; } catch (e) { login = ''; }
    return login;
  };

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
  // opts.newFolder: refuse (and write nothing) if that folder, or a file of that name, already
  // exists at the moment of committing, so a new notebook can never overwrite anything.
  // Git's own id for a file's content (sha1 of "blob <size>\0<bytes>"), to tell an unchanged file without uploading it.
  GH.blobSha = async function (f) {
    const body = f.base64 != null ? Uint8Array.from(atob(f.base64), c => c.charCodeAt(0)) : new TextEncoder().encode(f.text);
    const head = new TextEncoder().encode('blob ' + body.length + '\0');
    const all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  // opts.skipSame: leave out files whose content is already on the branch, and deletes of files
  // that are not there. Returns null (and commits nothing) when nothing is left to change.
  GH.commit = async function (files, message, onStep, branch, opts) {
    const step = onStep || (() => {});
    branch = branch || GH.BRANCH;
    opts = opts || {};
    for (let attempt = 0; attempt < 3; attempt++) {
      step('Preparing ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
      const head = await GH.headTree(branch);
      if (opts.newFolder) {
        const t = await GH.api('/git/trees/' + head.treeSha + '?recursive=1');
        const nf = opts.newFolder.toLowerCase();
        if (t.truncated || t.tree.some(x => { const p = x.path.toLowerCase(); return p === nf || p.startsWith(nf + '/'); })) {
          const e = new Error('thegamebureau.com/' + opts.newFolder + '/ already exists, so nothing was written. Pick another address.'); e.status = 409; throw e;
        }
      }
      let todo = files;
      if (opts.skipSame) {
        const t = await GH.api('/git/trees/' + head.treeSha + '?recursive=1');
        if (!t.truncated) {
          const have = new Map(t.tree.filter(x => x.type === 'blob').map(x => [x.path, x.sha]));
          todo = [];
          for (const f of files) {
            if (f.delete ? !have.has(f.path) : have.get(f.path) === (f.sha || await GH.blobSha(f))) continue;
            todo.push(f);
          }
          if (!todo.length) return null;
          step('Sending ' + todo.length + ' changed file' + (todo.length === 1 ? '' : 's') + '…');
        }
      }
      const tree = [];
      for (const f of todo) {
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
        await GH.api('/git/refs/heads/' + branch, { method: 'PATCH', body: { sha: commit.sha, force: false } });
        return commit;
      } catch (e) {
        // Someone (often the PDF bot) pushed in between: start again from the new head.
        if (e.status !== 422 || attempt === 2) throw e;
        step('The site changed while saving. Trying again…');
      }
    }
  };

  // ---------- saved drafts ----------
  // SAVE in the studio stores the whole notebook (text, plus photos not yet published) as one
  // JSON file on the studio-drafts branch. That branch is never deployed, so a saved draft is
  // private to the studio, but any browser connected to GitHub can open it. PUBLISH writes to
  // main (which goes live) and removes the draft.
  GH.DRAFTS = 'studio-drafts';
  const draftPath = key => 'drafts/' + key.replace(/\//g, '--') + '.json';
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  GH.readDraft = async function (key) {
    try {
      const f = await GH.api('/contents/' + enc(draftPath(key)) + '?ref=' + GH.DRAFTS);
      return Object.assign(JSON.parse(await GH.readBlobText(f.sha)), { key });
    } catch (e) { if (e.status === 404) return null; throw e; }
  };
  GH.listDraftKeys = async function () {
    try { return (await GH.api('/contents/drafts?ref=' + GH.DRAFTS)).filter(x => /\.json$/.test(x.name)).map(x => x.name.replace(/\.json$/, '').replace(/--/g, '/').toLowerCase()); }
    catch (e) { if (e.status === 404) return []; throw e; }
  };
  GH.listDrafts = async function () {
    let list;
    try { list = await GH.api('/contents/drafts?ref=' + GH.DRAFTS); } catch (e) { if (e.status === 404) return []; throw e; }
    const out = [];
    for (const f of list.filter(x => /\.json$/.test(x.name))) {
      try { const d = JSON.parse(await GH.readBlobText(f.sha)); out.push({ key: f.name.replace(/\.json$/, '').replace(/--/g, '/'), isNew: !!d.isNew, title: (d.game && d.game.title) || '', at: d.at, by: d.by || '', brand: d.game && d.game.brand, tagline: (d.game && d.game.tagline) || '' }); } catch (e) { /* skip */ }
    }
    return out;
  };
  // files: [{key, data}] to write, [{key, delete: true}] to remove.
  GH.writeDrafts = function (files, message, onStep) {
    return toDrafts(files.map(f => f.delete ? { path: draftPath(f.key), delete: true } : { path: draftPath(f.key), text: JSON.stringify(f.data) }), message, onStep);
  };
  // Game ideas (the studio's Ideas tab) live in ideas.json on the same never-deployed branch.
  // null when there is no list yet.
  GH.readIdeas = async function () {
    const t = await GH.readTextAt('ideas.json', GH.DRAFTS);
    return t == null ? null : JSON.parse(t);
  };
  GH.writeIdeas = (list, message) => toDrafts([{ path: 'ideas.json', text: JSON.stringify(list, null, 2) + '\n' }], message);
  // Commits [{path, text}] or [{path, delete: true}] to the studio-drafts branch, starting the branch if needed.
  async function toDrafts(tree, message, onStep) {
    try { await GH.api('/git/ref/heads/' + GH.DRAFTS); } catch (e) {
      if (e.status !== 404) throw e;
      const write = tree.filter(f => !f.delete);
      if (!write.length) return null;
      // First save ever: start the branch with just the drafts folder.
      const t = await GH.api('/git/trees', { method: 'POST', body: { tree: write.map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })) } });
      const c = await GH.api('/git/commits', { method: 'POST', body: { message, tree: t.sha, parents: [] } });
      await GH.api('/git/refs', { method: 'POST', body: { ref: 'refs/heads/' + GH.DRAFTS, sha: c.sha } });
      return c;
    }
    return GH.commit(tree, message, onStep, GH.DRAFTS);
  }

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
  // index.html and rules.html are short shells; their <head> carries the title and share-preview
  // tags, which link previews read without running JavaScript. The studio writes them from
  // game.json so they never drift. (Games are edited at /studio/?game=<folder>.)
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  GH.shells = function (folder, g) {
    const rnFull = ((g.rulesName || '').trim() || 'Rules'), rn = rnFull === 'Rules' ? 'rules' : rnFull;
    const url = 'https://' + GH.SITE + '/' + folder + '/';
    const img = g.shareImage ? url + g.shareImage : (g.media || []).find(NB.realPhoto) ? url + g.media.find(NB.realPhoto).src : url + 'pdf/preview-1.jpg';
    const desc = g.tagline || g.title;
    const full = g.title + (g.subtitle ? ': ' + g.subtitle : '');
    const head = (title, extra) => '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
      '<!-- Made with the notebook kit (/studio/). This page is built from game.json; the tags below are written by the admin page when you save. -->\n' +
      '<title>' + esc(title) + '</title>\n' + extra +
      '<link rel="icon" href="' + esc(g.favicon ? '/' + folder + '/' + g.favicon : '/favicon.ico') + '">\n<link rel="stylesheet" href="/studio/kit/kit.css">\n<script src="/studio/kit/kit.js" defer></script>\n';
    const og = (title, u) => '<meta name="description" content="' + esc(desc) + '">\n<link rel="canonical" href="' + esc(u) + '">\n' +
      '<meta property="og:type" content="product">\n<meta property="og:title" content="' + esc(title) + '">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
      '<meta property="og:url" content="' + esc(u) + '">\n<meta property="og:image" content="' + esc(img) + '">\n<meta name="twitter:card" content="summary_large_image">\n';
    return {
      'index.html': head(g.title + ' | The Game Bureau', og(full, url)) + '</head>\n<body data-page="public">\n<noscript><p style="padding:24px">' + esc(full) + '. <a href="./rules.html">' + esc(rnFull === 'Rules' ? 'Read the rules' : rnFull) + '</a>.</p></noscript>\n</body>\n</html>\n',
      'rules.html': head(g.title + ' ' + rn + ' | The Game Bureau', og(g.title + ' ' + rn, url + 'rules.html')) + '</head>\n<body data-page="rules"></body>\n</html>\n',
    };
  };
})();
