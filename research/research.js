/* ──────────────────────────────────────────────────────────────
   research.js — shared engine for the two-panel research pages.

   Section 1 (builder):
     • #basePrompt  – the prompt template, baked into the page at creation.
       May contain {{keywords}} and {{notes}} placeholders.
     • #keywords / #openText – the quasi-coder's inputs.
     • Generate → assembles the final prompt into #output.
     • Copy     → copies #output to the clipboard.
     • Edit     → toggles editing of the base prompt in-page.

   Section 2 (result):
     • Loads this page's COUSIN json — same basename, .json extension.
       oldestbar.html → oldestbar.json — and renders it.
   ────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { data: null, view: 'pretty' };

  const els = {
    basePrompt: $('basePrompt'),
    keywords:   $('keywords'),
    openText:   $('openText'),
    output:     $('output'),
    generateBtn:$('generateBtn'),
    copyBtn:    $('copyBtn'),
    editBtn:    $('editBtn'),
    jsonName:   $('jsonName'),
    result:     $('result'),
  };

  /* ── Section 1: prompt builder ───────────────────────────── */

  function assemblePrompt() {
    const base = (els.basePrompt.value || '').trim();
    const keywords = (els.keywords.value || '').trim();
    const notes = (els.openText.value || '').trim();

    const hasKw = /\{\{\s*keywords\s*\}\}/i.test(base);
    const hasNotes = /\{\{\s*notes\s*\}\}/i.test(base);

    let out = base
      .replace(/\{\{\s*keywords\s*\}\}/gi, keywords || '(none provided)')
      .replace(/\{\{\s*notes\s*\}\}/gi, notes || '(none provided)');

    const extra = [];
    if (!hasKw && keywords) extra.push('KEYWORDS: ' + keywords);
    if (!hasNotes && notes) extra.push('NOTES:\n' + notes);
    if (extra.length) out += '\n\n' + extra.join('\n\n');

    return out.trim();
  }

  function generate() {
    els.output.value = assemblePrompt();
    return els.output.value;
  }

  async function copyPrompt() {
    if (!els.output.value.trim()) generate();
    const text = els.output.value;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      els.output.focus();
      els.output.select();
      document.execCommand('copy');
    }
    toast('Prompt copied');
  }

  function toggleEdit() {
    const editing = els.basePrompt.hasAttribute('readonly');
    if (editing) {
      els.basePrompt.removeAttribute('readonly');
      els.basePrompt.classList.add('is-editing');
      els.basePrompt.focus();
      els.editBtn.textContent = 'Done';
      els.editBtn.classList.add('is-on');
    } else {
      els.basePrompt.setAttribute('readonly', '');
      els.basePrompt.classList.remove('is-editing');
      els.editBtn.textContent = 'Edit';
      els.editBtn.classList.remove('is-on');
      if (els.output.value.trim()) generate(); // refresh with the edited template
      toast('Edit applied for this session');
    }
  }

  /* ── Section 2: cousin JSON ──────────────────────────────── */

  function cousinJsonUrl() {
    const path = location.pathname;
    if (/\.html?$/i.test(path)) return path.replace(/\.html?$/i, '.json');
    // directory-style URL (…/foo/ or …/foo) → foo.json next to it
    return path.replace(/\/+$/, '') + '.json';
  }

  function fileNameOf(url) {
    return url.split('/').pop() || url;
  }

  async function loadResult() {
    const url = cousinJsonUrl();
    if (els.jsonName) els.jsonName.textContent = fileNameOf(url);
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.data = await res.json();
      renderResult();
    } catch (err) {
      renderEmpty(fileNameOf(url), err);
    }
  }

  function renderEmpty(name, err) {
    els.result.innerHTML =
      '<div class="result-empty">' +
        'No result loaded yet for <code>' + esc(name) + '</code>.<br><br>' +
        'Run the generated prompt in your AI, then save its JSON reply as ' +
        '<code>' + esc(name) + '</code> beside this page.' +
        '<br><br><span style="opacity:.7">(' + esc(err.message) +
        ' — note: loading needs the page served over http, not opened as a file.)</span>' +
      '</div>';
  }

  function renderResult() {
    els.result.innerHTML =
      '<div class="result-bar">' +
        '<button class="mini" data-view="pretty" aria-pressed="true">Structured</button>' +
        '<button class="mini" data-view="raw" aria-pressed="false">Raw JSON</button>' +
        '<button class="mini" id="copyJsonBtn">Copy JSON</button>' +
      '</div>' +
      '<div class="result-view" id="resultView"></div>';

    els.result.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(b.dataset.view))
    );
    $('copyJsonBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(state.data, null, 2));
        toast('JSON copied');
      } catch (_) { toast('Copy failed'); }
    });
    setView(state.view);
  }

  function setView(view) {
    state.view = view;
    els.result.querySelectorAll('[data-view]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === view))
    );
    const host = $('resultView');
    host.innerHTML = view === 'raw'
      ? '<pre class="result-raw">' + esc(JSON.stringify(state.data, null, 2)) + '</pre>'
      : renderNode(state.data);
  }

  /* recursive structured renderer for arbitrary JSON */
  function renderNode(val) {
    if (val === null || val === undefined) return '<span class="v v-null">null</span>';
    if (Array.isArray(val)) {
      if (!val.length) return '<span class="v v-empty">— empty —</span>';
      return '<ul class="node-list">' +
        val.map((item) => '<li>' + renderNode(item) + '</li>').join('') + '</ul>';
    }
    if (typeof val === 'object') {
      const rows = Object.entries(val).map(([k, v]) =>
        '<div class="kv"><div class="k">' + esc(k) + '</div>' +
        '<div class="v-wrap">' + renderNode(v) + '</div></div>'
      ).join('');
      return '<div class="node-obj">' + rows + '</div>';
    }
    if (typeof val === 'number')  return '<span class="v v-num">' + esc(val) + '</span>';
    if (typeof val === 'boolean') return '<span class="v v-bool">' + val + '</span>';
    if (isUrl(val)) {
      return '<a class="v v-link" href="' + esc(val) + '" target="_blank" rel="noopener">' + esc(val) + '</a>';
    }
    return '<span class="v v-str">' + esc(val) + '</span>';
  }

  /* ── helpers ─────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function isUrl(s) { return typeof s === 'string' && /^https?:\/\/\S+$/i.test(s); }

  let toastTimer;
  function toast(msg) {
    let el = $('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
  }

  /* ── wire up ─────────────────────────────────────────────── */
  function init() {
    if (els.generateBtn) els.generateBtn.addEventListener('click', generate);
    if (els.copyBtn)     els.copyBtn.addEventListener('click', copyPrompt);
    if (els.editBtn)     els.editBtn.addEventListener('click', toggleEdit);
    generate();    // seed #output from the template on load
    loadResult();  // pull in the cousin JSON
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
