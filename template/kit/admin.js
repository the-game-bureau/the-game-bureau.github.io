/* Notebook kit: the admin page (<game>/admin.html).
 *
 * The PDFs are built by the GitHub workflow .github/workflows/notebook-pdfs.yml,
 * which renders cover.html and contents.html in Chrome, checks the page sizes,
 * commits the PDFs to <game>/pdf/ and republishes the site.
 *
 * "Build PDFs" starts that workflow straight from this page when a GitHub token is
 * saved in this browser (a fine-grained token for this one repository with
 * "Actions: Read and write"). Without a token, it opens the workflow on GitHub,
 * where you click "Run workflow" and type the game's folder name.
 */
(function () {
  'use strict';
  const NB = window.NB, esc = NB.esc;
  const REPO = 'the-game-bureau/the-game-bureau.github.io';
  const WORKFLOW = 'notebook-pdfs.yml';
  const BRANCH = 'main';
  const TOKEN_KEY = 'nb-github-token';
  const API = 'https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW;
  const ACTIONS_URL = 'https://github.com/' + REPO + '/actions/workflows/' + WORKFLOW;

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ } };
  const gh = (url, opts = {}) => fetch(url, Object.assign({}, opts, {
    headers: Object.assign({ Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + getToken(), 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {}),
  }));
  // This game's folder from the site root, e.g. "template/dice-derby"; the workflow builds that folder.
  const FOLDER = location.pathname.replace(/\/[^/]*$/, '').replace(/^\/+/, '');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const when = iso => iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never';

  async function readBuild() {
    try { const r = await fetch('./pdf/build.json', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  function render(g) {
    const files = [
      ['Cover', 'Front and back cover for the printer: one wraparound spread (back, spine, front) with bleed. The spine width follows the page count.', g.pdf.cover],
      ['Contents', 'Every inside page for the printer, rules first, with bleed. Padded with blank pages to a multiple of ' + g.print.padTo + '.', g.pdf.contents],
      ['Print-at-home notebook', 'The whole notebook at ' + g.print.trim.join(' x ') + ' in: front cover, rules, contents, back cover.' + (g.freeFullPdf ? ' Offered free on the game page.' : ''), g.pdf.print],
      ['Free sampler', 'Front cover, rules, the sampler pages and back cover. ' + (g.freeFullPdf ? '' : 'This is the free download on the game page.'), g.pdf.sampler],
    ];
    document.body.innerHTML =
      '<main class="ad-main">' +
      '<p class="ad-crumb"><a href="./">' + esc(g.title) + '</a> · <a href="./rules.html">Rules</a> · Admin</p>' +
      '<h1>' + esc(g.title) + ' notebook admin</h1>' +
      '<p class="ad-sub">The PDFs are built from this folder\'s <code>cover.html</code>, <code>contents.html</code> and <code>rules.md</code>. Edit those, then build.</p>' +

      '<section class="ad-card ad-build"><h2>Build the notebook</h2>' +
      '<p>Renders the cover, contents, print-at-home notebook and free sampler, checks the page sizes, saves them to the site and republishes. Takes about 2 to 3 minutes.</p>' +
      '<div class="nb-row"><button class="nb-btn solid big" id="ad-go" type="button">BUILD PDFS</button><span class="ad-last" id="ad-last"></span></div>' +
      '<div class="ad-status" id="ad-status" role="status" hidden></div>' +
      '<details class="ad-token" id="ad-token"><summary>GitHub access for one-click builds</summary>' +
      '<p>To build from this button, save a GitHub token in this browser. Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a> for the <b>' + esc(REPO) + '</b> repository only, with <b>Actions: Read and write</b>. It stays in this browser and is sent only to GitHub.</p>' +
      '<p>Without a token, Build opens the workflow on GitHub: click <b>Run workflow</b>, enter <code>' + esc(FOLDER) + '</code>, and click <b>Run workflow</b> again.</p>' +
      '<div class="nb-row"><input id="ad-token-in" type="password" placeholder="github_pat_..." autocomplete="off" spellcheck="false"><button class="nb-btn" id="ad-token-save" type="button">SAVE</button><button class="nb-btn" id="ad-token-clear" type="button">FORGET</button></div>' +
      '<p class="ad-token-state" id="ad-token-state"></p></details>' +
      '</section>' +

      '<section class="ad-card"><h2>PDFs</h2><div class="ad-files">' +
      files.map(([name, about, file]) => '<div class="ad-file"><div><h3>' + esc(name) + '</h3><p>' + esc(about) + '</p><small data-size="' + esc(file) + '"></small></div>' +
        '<div class="ad-file-btns"><a class="nb-btn solid" href="./' + esc(file) + '" target="_blank" rel="noopener">OPEN</a><a class="nb-btn" href="./' + esc(file) + '" download>DOWNLOAD</a></div></div>').join('') +
      '</div></section>' +

      '<section class="ad-card"><h2>Proof in the browser</h2><p>The same pages the PDFs are made from. The dashed pink line is where the printer trims off the bleed.</p><ul class="ad-links">' +
      '<li><a href="./cover.html?layout=spread" target="_blank" rel="noopener">Cover spread</a></li>' +
      '<li><a href="./cover.html?layout=front" target="_blank" rel="noopener">Front cover</a></li>' +
      '<li><a href="./cover.html?layout=back" target="_blank" rel="noopener">Back cover</a></li>' +
      '<li><a href="./contents.html" target="_blank" rel="noopener">Contents, with bleed</a></li>' +
      '<li><a href="./contents.html?bleed=0" target="_blank" rel="noopener">Contents, no bleed</a></li>' +
      '<li><a href="./contents.html?bleed=0&sampler=1" target="_blank" rel="noopener">Sampler contents</a></li>' +
      '</ul>' +
      '<p class="ad-browser">No GitHub? Save print-ready files straight from this browser (Chrome works best): <a href="./cover.html?layout=spread&autoprint" target="_blank" rel="noopener">cover</a> · <a href="./contents.html?autoprint" target="_blank" rel="noopener">contents</a> · <a href="./contents.html?bleed=0&sampler=1&autoprint" target="_blank" rel="noopener">sampler pages</a>. In the print dialog choose <b>Save as PDF</b>, margins <b>None</b>, <b>Background graphics</b> on. The page sizes are set for you; the spine width and the merged print-at-home and sampler files come only from the Build button.</p>' +
      '</section>' +
      '</main>';

    const tokenIn = document.getElementById('ad-token-in');
    const tokenState = () => {
      document.getElementById('ad-token-state').textContent = getToken() ? 'A token is saved in this browser. Build runs from this page.' : 'No token saved. Build opens GitHub instead.';
      document.getElementById('ad-go').textContent = getToken() ? 'BUILD PDFS' : 'BUILD PDFS ON GITHUB';
    };
    document.getElementById('ad-token-save').onclick = () => { setToken(tokenIn.value.trim()); tokenIn.value = ''; tokenState(); };
    document.getElementById('ad-token-clear').onclick = () => { setToken(''); tokenState(); };
    tokenState();
    document.getElementById('ad-go').onclick = () => build(g);
    refresh(g);
  }

  async function refresh(g) {
    const b = await readBuild();
    document.getElementById('ad-last').textContent = b ? 'Last built ' + when(b.built) : 'Not built yet';
    if (b) {
      const info = {
        [g.pdf.cover]: (2 * b.trim[0] + b.spine + 2 * b.bleed).toFixed(3) + ' x ' + (b.trim[1] + 2 * b.bleed).toFixed(3) + ' in, spine ' + b.spine + ' in',
        [g.pdf.contents]: b.pages.contents + ' pages at ' + (b.trim[0] + 2 * b.bleed) + ' x ' + (b.trim[1] + 2 * b.bleed) + ' in' + (b.pages.blanksAdded ? ' (' + b.pages.blanksAdded + ' blank added)' : ''),
        [g.pdf.print]: b.pages.printAtHome + ' pages at ' + b.trim.join(' x ') + ' in',
        [g.pdf.sampler]: b.pages.sampler + ' pages at ' + b.trim.join(' x ') + ' in',
      };
      document.querySelectorAll('[data-size]').forEach(el => { el.textContent = (info[el.dataset.size] || '') + ' · built ' + when(b.built); });
    }
    return b;
  }

  function status(html, kind) {
    const el = document.getElementById('ad-status');
    el.hidden = false; el.className = 'ad-status ' + (kind || ''); el.innerHTML = html;
  }

  async function build(g) {
    if (!getToken()) {
      window.open(ACTIONS_URL, '_blank', 'noopener');
      status('Opened the workflow on GitHub. Click <b>Run workflow</b>, enter <code>' + esc(FOLDER) + '</code>, and click <b>Run workflow</b> again. Come back here in about 3 minutes and reload.');
      return;
    }
    const go = document.getElementById('ad-go');
    go.disabled = true;
    const before = await readBuild();
    const t0 = Date.now();
    try {
      status('Starting the build&hellip;');
      const r = await gh(API + '/dispatches', { method: 'POST', body: JSON.stringify({ ref: BRANCH, inputs: { game: FOLDER } }) });
      if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error('GitHub refused the token (' + r.status + '). Check that it is for ' + REPO + ' with Actions: Read and write, and not expired.');
      if (!r.ok) throw new Error('GitHub answered ' + r.status + ': ' + (await r.text()).slice(0, 200));

      // Find the run we just started.
      let run = null;
      for (let i = 0; i < 24 && !run; i++) {
        await sleep(5000);
        const list = await (await gh(API + '/runs?event=workflow_dispatch&per_page=10')).json();
        run = (list.workflow_runs || []).find(x => new Date(x.created_at).getTime() > t0 - 60000 && (x.display_title || '').includes(FOLDER));
      }
      if (!run) throw new Error('The build started but has not shown up yet. <a href="' + ACTIONS_URL + '" target="_blank" rel="noopener">Check it on GitHub</a>.');
      const link = '<a href="' + esc(run.html_url) + '" target="_blank" rel="noopener">progress on GitHub</a>';
      while (run.status !== 'completed') {
        const secs = Math.round((Date.now() - t0) / 1000);
        status('Building (' + esc(run.status.replace('_', ' ')) + ', ' + secs + 's). See the ' + link + '.');
        await sleep(6000);
        run = await (await gh('https://api.github.com/repos/' + REPO + '/actions/runs/' + run.id)).json();
      }
      if (run.conclusion !== 'success') throw new Error('The build ' + esc(run.conclusion) + '. The old PDFs are still in place. See the <a href="' + esc(run.html_url) + '" target="_blank" rel="noopener">log on GitHub</a> for what went wrong.');

      // Built and committed. Wait for the site to republish with the new files.
      for (let i = 0; i < 40; i++) {
        status('Built. Publishing to the site&hellip;');
        const b = await readBuild();
        if (b && (!before || b.built !== before.built)) {
          await refresh(g);
          status('Done. The new PDFs are live.', 'ok');
          return;
        }
        await sleep(8000);
      }
      status('Built, but the site has not republished yet. Reload this page in a minute.', 'ok');
    } catch (e) {
      status(e.message, 'bad');
    } finally {
      go.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (document.body.dataset.page !== 'admin') return;
    try { render(await NB.loadGame()); } catch (e) { document.body.innerHTML = '<p style="padding:24px">Could not load game.json: ' + esc(e.message) + '</p>'; }
  });
})();
