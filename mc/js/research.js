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
    basePromptLabel: $('basePromptLabel'),
  };

  /* Move a <pre> prompt into its own panel section — a short, scrolling box —
     placed before/after the Prompt Additions section it currently lives in.
     The <pre> keeps its id, so assemblePrompt (#basePrompt) and Copy (#output)
     keep working. */
  function makePromptSection(pre, title, sectionId, place) {
    if (!pre || $(sectionId)) return;
    const builder = pre.closest('section.panel');   // the Prompt Additions section
    const wrapper = pre.closest('details') || pre;

    const section = document.createElement('section');
    section.className = 'panel';
    section.id = sectionId;
    section.innerHTML =
      '<div class="panel-head"><span class="panel-tag">' + title + '</span></div>' +
      '<div class="panel-body"></div>';
    section.querySelector('.panel-body').appendChild(pre);   // move the <pre> in
    pre.classList.add('prompt-box');
    if (wrapper !== pre && wrapper.parentNode) wrapper.remove();   // drop the old <details>

    if (builder && builder.parentNode) {
      const ref = place === 'after' ? builder.nextSibling : builder;
      builder.parentNode.insertBefore(section, ref);
    }
  }

  /* Move Copy out of Prompt Additions to a standalone full-width button placed
     directly under the Generated Prompt section. */
  function relocateCopyButton() {
    const btn = els.copyBtn;
    const gen = $('generatedPromptSection');
    if (!btn || !gen || !gen.parentNode) return;
    const oldWrap = btn.closest('.panel-actions');
    gen.parentNode.insertBefore(btn, gen.nextSibling);
    btn.classList.add('copy-prompt-btn');
    if (oldWrap && oldWrap.parentNode && oldWrap.children.length === 0) oldWrap.remove();
  }

  /* ── Section 1: prompt builder ───────────────────────────── */

  function assemblePrompt() {
    const base = (els.basePrompt.textContent || '').trim();
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
    let out = assemblePrompt();
    // Pages with data-include-cousin auto-append the CURRENT cousin records to the
    // prompt (e.g. places.html appends places.jsonl). The framing comes from
    // data-cousin-note; default is teams.html's "update in place".
    if (document.body.getAttribute('data-include-cousin') === 'true' &&
        Array.isArray(state.records) && state.records.length) {
      // City-based cousins (places) → only the scope city named in keywords.
      // Cousins without a per-record city (teams) → include everything.
      let recs = state.records;
      if (state.records.some((r) => r && r.city)) {
        const kw = ((els.keywords && els.keywords.value) || '').toLowerCase();
        recs = state.records.filter((r) => r && r.city &&
          kw.includes(String(r.city).split(',')[0].trim().toLowerCase()));
      }
      if (recs.length) {
        const label = (els.jsonName && els.jsonName.textContent) || 'current data';
        const note = document.body.getAttribute('data-cousin-note') ||
          'update these IN PLACE — preserve every existing id and hand-curated field; return the full updated set';
        out += '\n\n--- CURRENT ' + label + ' (' + note + ') ---\n' + JSON.stringify(recs, null, 2);
      }
    }
    els.output.textContent = out;
    return out;
  }

  async function copyPrompt() {
    if (!els.output.textContent.trim()) generate();
    const text = els.output.textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents(els.output);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
    }
    toast('Prompt copied. Paste to ai site now.');
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
      if (els.output.textContent.trim()) generate(); // refresh with the edited template
      toast('Edit applied for this session');
    }
  }

  /* ── Section 2: cousin result file (.jsonl preferred, .json ok) ── */

  function cousinBase() {
    const path = location.pathname;
    if (/\.html?$/i.test(path)) return path.replace(/\.html?$/i, '');
    return path.replace(/\/+$/, ''); // directory-style URL (…/foo/ or …/foo)
  }

  function fileNameOf(url) {
    return url.split('/').pop() || url;
  }

  // Undo markdown auto-linking that breaks JSON: turn [text](url) back into text.
  // AI/chat renderers often linkify the trailing part of a JSON URL value, e.g.
  //   "url":"https://x/"}}  →  "url":"[https://x/"}}](https://x/%22}})
  // which spills ](…) outside the braces and makes the line unparseable.
  function stripMarkdownLinks(s) {
    let prev;
    do { prev = s; s = s.replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1'); } while (s !== prev);
    return s;
  }

  let lastSkipped = 0;   // unparseable lines from the most recent parseRecords()

  /* Parse a result file flexibly:
       • a normal JSON value (object or array)         → used as-is
       • JSON Lines (.jsonl): one JSON object per line → array of records
     Markdown-link artifacts are cleaned first so corrupted pastes self-heal. */
  function parseRecords(text) {
    lastSkipped = 0;
    const trimmed = text.trim();
    if (!trimmed) return [];
    try {
      return JSON.parse(stripMarkdownLinks(trimmed));   // whole-file JSON (array/object)
    } catch (_) { /* not a single JSON value — try JSON Lines */ }

    const records = [];
    trimmed.split(/\r?\n/).forEach((raw) => {
      const line = stripMarkdownLinks(raw.trim()).replace(/,\s*$/, ''); // clean + tolerate trailing commas
      if (!line || line === '[' || line === ']') return;
      try { records.push(JSON.parse(line)); } catch (_) { lastSkipped++; }
    });
    if (!records.length) throw new Error('No valid JSON records found');
    return records;
  }

  async function loadResult() {
    const base = cousinBase();
    // Cousin data files live in the sibling data/ folder (e.g. /mc/games.html →
    // /mc/data/games.jsonl; teams.html → /mc/data/teams.json).
    const dataBase = base.replace(/\/([^/]*)$/, '/data/$1');
    const candidates = [dataBase + '.jsonl', dataBase + '.json']; // prefer append-friendly .jsonl
    let lastErr;
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue; }
        state.data = parseRecords(await res.text());
        if (els.jsonName) els.jsonName.textContent = fileNameOf(url);
        renderResult();
        generate();   // re-include the freshly-loaded data in the prompt (opt-in pages)
        return;
      } catch (err) { lastErr = err; }
    }
    const preferred = fileNameOf(base + '.jsonl');
    if (els.jsonName) els.jsonName.textContent = preferred;
    renderEmpty(preferred, lastErr || new Error('not found'));
  }

  function renderEmpty(name, err) {
    els.result.innerHTML =
      '<div class="result-empty">' +
        'No result loaded yet for <code>' + esc(name) + '</code>.<br><br>' +
        'Run the generated prompt in your AI, then save the reply beside this page as ' +
        '<code>' + esc(name) + '</code> — <strong>one JSON object per line</strong> (JSON Lines). ' +
        'Append more lines later to add records; a plain <code>.json</code> array also works.' +
        '<br><br><span style="opacity:.7">(' + esc(err.message) +
        ' — loading needs the page served over http, not opened as a file.)</span>' +
      '</div>';
  }

  // Classify loaded/pasted data so we can both PAGE it and WRITE it back in the
  // right format:
  //   • an array            → JSONL (one object per line)
  //   • { teams:[…] } etc.  → a wrapper OBJECT; page its inner collection and,
  //                            on save, re-emit the pretty-printed object with
  //                            every other top-level field (e.g. _ai_update_prompt)
  //                            preserved. This keeps teams.json valid.
  //   • anything else        → a single-item JSONL list
  function detectShape(data) {
    if (Array.isArray(data)) return { kind: 'jsonl', records: data };
    if (data && typeof data === 'object') {
      const KEYS = ['records', 'items', 'results', 'teams', 'games', 'data', 'rows'];
      let key = KEYS.find((k) => Array.isArray(data[k]));
      if (!key) {
        const arrs = Object.keys(data).filter((k) => Array.isArray(data[k]));
        if (arrs.length === 1) key = arrs[0];
      }
      if (key) return { kind: 'object', records: data[key], wrapper: data, collectionKey: key };
    }
    return { kind: 'jsonl', records: [data] };
  }

  function renderResult() {
    state.shape = detectShape(state.data);
    state.records = state.shape.records;
    state.index = 0;

    els.result.innerHTML =
      '<div class="result-bar">' +
        '<div class="result-nav">' +
          '<button class="mini nav-arrow" id="prevRec" type="button" aria-label="Previous result">‹</button>' +
          '<span class="result-counter" id="recCounter"></span>' +
          '<button class="mini nav-arrow" id="nextRec" type="button" aria-label="Next result">›</button>' +
        '</div>' +
        '<div class="result-tools">' +
          '<button class="mini" data-view="pretty" aria-pressed="true">Structured</button>' +
          '<button class="mini" data-view="raw" aria-pressed="false">Raw</button>' +
          '<button class="mini" id="copyJsonBtn" type="button">Copy</button>' +
        '</div>' +
      '</div>' +
      '<div class="result-view" id="resultView"></div>';

    els.result.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(b.dataset.view))
    );
    $('prevRec').addEventListener('click', () => step(-1));
    $('nextRec').addEventListener('click', () => step(1));
    $('copyJsonBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(state.records[state.index], null, 2));
        toast('Record copied');
      } catch (_) { toast('Copy failed'); }
    });
    setView(state.view);
  }

  function step(delta) {
    const n = state.records.length;
    if (n < 2) return;
    state.index = (state.index + delta + n) % n; // wrap around
    renderCurrent();
  }

  function setView(view) {
    state.view = view;
    els.result.querySelectorAll('[data-view]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === view))
    );
    renderCurrent();
  }

  function renderCurrent() {
    const n = state.records.length;
    const nav = els.result.querySelector('.result-nav');
    if (nav) nav.style.display = n > 1 ? '' : 'none';
    const counter = $('recCounter');
    if (counter) counter.textContent = (state.index + 1) + ' / ' + n;

    const rec = state.records[state.index];
    const host = $('resultView');
    host.innerHTML = state.view === 'raw'
      ? '<pre class="result-raw">' + esc(JSON.stringify(rec, null, 2)) + '</pre>'
      : renderNode(rec);
  }

  /* ── Merge / append new AI results into the cousin file ────────
     Format-aware: a JSONL/array cousin is written as JSON Lines; a wrapper
     object (e.g. teams.json's { _ai_update_prompt, teams:[…] }) is re-emitted
     as a pretty-printed object with its other top-level fields preserved.
     Chromium writes straight back to a file you pick; others get a download. */

  function dedupe(list) {
    const seen = new Set(), out = [];
    for (const r of list) {
      const key = JSON.stringify(r);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  // Serialize `records` in the file's shape → the exact text to write.
  function serializeRecords(records, shape) {
    if (shape && shape.kind === 'object') {
      const obj = Object.assign({}, shape.wrapper, { [shape.collectionKey]: records });
      return JSON.stringify(obj, null, 2) + '\n';   // pretty object (e.g. teams.json)
    }
    return records.map((r) => JSON.stringify(r)).join('\n') + '\n';   // JSONL
  }

  async function writeTextToHandle(handle, text) {
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }
  function downloadText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Read the picked file fresh and classify it (so appends merge against the
  // true on-disk content and preserve its wrapper).
  async function readExisting(handle) {
    const text = (await (await handle.getFile()).text()).trim();
    if (!text) return { records: [], shape: state.shape || { kind: 'jsonl' } };
    const shape = detectShape(parseRecords(text));
    return { records: shape.records, shape };
  }

  // Parse the paste box → { parsed, records }. Accepts JSONL, a JSON array, a
  // single object, or a wrapper object (whose inner collection becomes records).
  function readMergeInput() {
    const raw = (($('mergeInput').value) || '').trim();
    if (!raw) { toast('Paste some results first'); return null; }
    let parsed;
    try { parsed = parseRecords(raw); }
    catch (e) { toast('Could not parse: ' + e.message); return null; }
    const skipped = lastSkipped;   // capture before any later parseRecords() call
    const records = detectShape(parsed).records;
    if (!records.length) { toast('No records found in that paste'); return null; }
    return { parsed, records, skipped };
  }

  const skipNote = (n) => (n ? ' · ' + n + ' line(s) skipped' : '');

  async function ensureHandle() {
    if (!state.fileHandle) {
      state.fileHandle = await window.showSaveFilePicker({
        suggestedName: els.jsonName.textContent || 'results.jsonl',
        types: [{ description: 'JSON / JSON Lines', accept: { 'application/json': ['.jsonl', '.json'] } }],
      });
    }
    return state.fileHandle;
  }

  // Persist `records` in `shape`'s format, then re-render landing on `firstNew`.
  async function commitRecords(records, firstNew, shape) {
    shape = shape || state.shape || { kind: 'jsonl' };
    const text = serializeRecords(records, shape);
    if (window.showSaveFilePicker) await writeTextToHandle(await ensureHandle(), text);
    else downloadText(els.jsonName.textContent || 'results.jsonl', text);

    state.data = shape.kind === 'object'
      ? Object.assign({}, shape.wrapper, { [shape.collectionKey]: records })
      : records;
    renderResult();   // recomputes state.shape + state.records from state.data
    state.index = Math.min(Math.max(firstNew, 0), state.records.length - 1);
    renderCurrent();
    generate();       // keep the prompt's embedded "current data" in sync (opt-in)
    $('mergeInput').value = '';
  }

  async function appendResults() {
    const input = readMergeInput();
    if (!input) return;
    try {
      // Read the file fresh (catches external edits), but NEVER lose what Section
      // 2 already loaded — union the two. If the file read comes back empty or
      // unreadable (a showSaveFilePicker quirk), the loaded records carry it, so
      // Append can't silently turn into Overwrite.
      let fileRecords = [], fileShape = state.shape || { kind: 'jsonl' };
      if (window.showSaveFilePicker) {
        try {
          const r = await readExisting(await ensureHandle());
          fileRecords = r.records; fileShape = r.shape;
        } catch (e) {
          if (e.name === 'AbortError') throw e;   // user cancelled the picker
          /* unreadable/corrupt file → fall back to the loaded records */
        }
      }
      const loaded = Array.isArray(state.records) ? state.records : [];
      const existing = dedupe(fileRecords.concat(loaded));
      const shape = fileRecords.length ? fileShape : (state.shape || fileShape);

      const before = existing.length;
      const merged = dedupe(existing.concat(input.records));
      await commitRecords(merged, before, shape);
      toast('Added ' + (merged.length - before) + ' · total ' + merged.length + skipNote(input.skipped));
    } catch (e) {
      if (e.name !== 'AbortError') toast('Write failed: ' + e.message);
    }
  }

  async function overwriteResults() {
    const input = readMergeInput();
    if (!input) return;
    if (!window.confirm('Overwrite the file with these ' + input.records.length +
        ' record(s)? This replaces ALL current results.')) return;
    try {
      // If the paste is itself a wrapper object, adopt it (keeps its top-level
      // fields, e.g. _ai_update_prompt); otherwise reuse the file's shape.
      const pasted = detectShape(input.parsed);
      const shape = pasted.kind === 'object' ? pasted : (state.shape || { kind: 'jsonl' });
      await commitRecords(input.records, 0, shape);
      toast('Overwrote · ' + input.records.length + ' record(s)' + skipNote(input.skipped));
    } catch (e) {
      if (e.name !== 'AbortError') toast('Write failed: ' + e.message);
    }
  }

  function mountMerge() {
    if (!els.result || $('mergePanel')) return;
    // Pages whose cousin file isn't plain JSONL (e.g. teams.json, which has a
    // fixed { _ai_update_prompt, teams:[…] } shape) opt out so the JSONL writer
    // can't clobber them — those are edited by their own dedicated tool.
    if (document.body.getAttribute('data-merge') === 'off') return;
    const resultsSection = els.result.closest('section.panel');
    const section = document.createElement('section');   // its own block
    section.className = 'panel';
    section.id = 'mergePanel';
    section.innerHTML =
      '<div class="panel-head"><span class="panel-tag">Add Results</span></div>' +
      '<div class="panel-body">' +
        '<textarea id="mergeInput" class="merge-input" ' +
          'placeholder="Paste the AI reply — JSONL lines, a JSON array, or one object"></textarea>' +
        '<div class="merge-actions">' +
          '<button class="btn btn--primary" id="appendBtn" type="button">Append &amp; save</button>' +
          '<button class="btn btn--danger" id="overwriteBtn" type="button">Overwrite</button>' +
          '<span class="merge-hint">' + (window.showSaveFilePicker
            ? 'Append merges new records in; Overwrite replaces the whole file.'
            : 'No file-write here — you’ll get a download to save over the file.') +
          '</span>' +
        '</div>' +
      '</div>';
    // Place it directly under the Copy button (fall back to after Results).
    const anchor = (els.copyBtn && els.copyBtn.parentNode) ? els.copyBtn : resultsSection;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(section, anchor.nextSibling);
    } else {
      els.result.parentNode.appendChild(section);
    }
    $('appendBtn').addEventListener('click', appendResults);
    $('overwriteBtn').addEventListener('click', overwriteResults);
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
      const rows = Object.entries(val).map(([k, v]) => {
        const vHtml = (k === 'w3w' && typeof v === 'string' && v)
          ? '<a class="v v-link" href="https://what3words.com/' + esc(v) + '" target="_blank" rel="noopener">///' + esc(v) + '</a>'
          : renderNode(v);
        return '<div class="kv"><div class="k">' + esc(k) + '</div><div class="v-wrap">' + vHtml + '</div></div>';
      }).join('');
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

  // Two-column layout: header full-width, prompt panels left, Results + Add
  // Results right. The sections are injected dynamically, so we regroup them here.
  function layoutTwoColumns() {
    const main = document.querySelector('main.research');
    if (!main || main.querySelector('.research-cols')) return;
    const header = main.querySelector('.research-head');
    const resultsSection = els.result && els.result.closest('section.panel');
    const mergePanel = $('mergePanel');

    const cols = document.createElement('div');
    cols.className = 'research-cols';
    const left = document.createElement('div'); left.className = 'research-col';
    const right = document.createElement('div'); right.className = 'research-col';
    cols.append(left, right);

    [...main.children].forEach((ch) => {
      if (ch === header || ch === cols) return;
      ((ch === resultsSection || ch === mergePanel) ? right : left).appendChild(ch);
    });
    main.appendChild(cols);
  }

  /* ── wire up ─────────────────────────────────────────────── */
  function init() {
    if (els.generateBtn) els.generateBtn.addEventListener('click', generate);
    if (els.copyBtn)     els.copyBtn.addEventListener('click', copyPrompt);
    if (els.editBtn)     els.editBtn.addEventListener('click', toggleEdit);
    // Live-assemble: the generated prompt stays in sync as you type (no button).
    if (els.keywords) els.keywords.addEventListener('input', generate);
    if (els.openText) els.openText.addEventListener('input', generate);
    makePromptSection(els.basePrompt, 'Base Prompt', 'basePromptSection', 'before');
    makePromptSection(els.output, 'Generated Prompt', 'generatedPromptSection', 'after');
    relocateCopyButton();   // standalone full-width Copy under Generated Prompt
    generate();    // seed #output from the template on load
    loadResult();  // pull in the cousin JSON
    mountMerge();  // the "Add results" merge/append box
    layoutTwoColumns();   // prompt panels left, Results + Add Results right

    // ←/→ page through results, but never while typing in a field.
    document.addEventListener('keydown', (e) => {
      if (!state.records || state.records.length < 2) return;
      const tag = (document.activeElement || {}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
