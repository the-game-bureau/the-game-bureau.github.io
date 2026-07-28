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
  const state = { data: null, view: 'pretty', query: '' };

  /* Optional Supabase backend (opt-in via body data-attributes). When set, the
     Results section loads rows from a table instead of a cousin file, and
     Append / Overwrite / Edit-Save UPSERT rows back via PostgREST (writes need
     an admin session token, same as the other MC tools). Pages without these
     attributes keep the file-based cousin behavior untouched. */
  const SB = {
    table:    (document.body.getAttribute('data-supabase-table') || '').trim(),
    url:      (document.body.getAttribute('data-supabase-url') || '').trim().replace(/\/+$/, ''),
    key:      (document.body.getAttribute('data-supabase-key') || '').trim(),
    conflict: (document.body.getAttribute('data-supabase-conflict') || '').trim(),
    omit: (document.body.getAttribute('data-supabase-omit') || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
  };
  const usingSupabase = () => !!(SB.table && SB.url && SB.key);

  /* Optional logical field order for the Results area (structured + edit views).
     Set body data-field-order="a,b,c"; listed keys render first in that order,
     any unlisted keys follow in their original order. Raw view stays verbatim. */
  const FIELD_ORDER = (document.body.getAttribute('data-field-order') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  function orderedEntries(obj) {
    const keys = Object.keys(obj || {});
    if (!FIELD_ORDER.length) return keys.map((k) => [k, obj[k]]);
    const rank = (k) => {
      const i = FIELD_ORDER.indexOf(k);
      return i < 0 ? FIELD_ORDER.length + keys.indexOf(k) : i;   // unlisted keep original order, after listed
    };
    return keys.slice().sort((a, b) => rank(a) - rank(b)).map((k) => [k, obj[k]]);
  }
  function sessionToken() {
    try {
      const s = JSON.parse(localStorage.getItem('tgb-photo-review-auth-session') || 'null');
      return (s && s.access_token) || '';
    } catch (_) { return ''; }
  }
  async function loadRowsFromSupabase() {
    const res = await fetch(SB.url + '/rest/v1/' + SB.table + '?select=*', {
      headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  async function upsertToSupabase(records) {
    const token = sessionToken();
    if (!token) throw new Error('Sign in as an admin first (no session token)');
    const clean = records.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) if (!SB.omit.includes(k)) out[k] = r[k];
      return out;
    });
    const url = SB.url + '/rest/v1/' + SB.table +
      (SB.conflict ? '?on_conflict=' + encodeURIComponent(SB.conflict) : '');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SB.key,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(clean),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' · ' + (await res.text()).slice(0, 300));
  }

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
    // data-include-cousin: "true" appends the CURRENT records inline to the prompt
    // (e.g. places.html); "separate" renders them as their own copyable artifact
    // (get_teams) so the prompt stays short. Framing via data-cousin-note.
    const mode = document.body.getAttribute('data-include-cousin');
    if ((mode === 'true' || mode === 'separate') &&
        Array.isArray(state.records) && state.records.length) {
      // City-based cousins (places) → only the scope city named in keywords.
      // Cousins without a per-record city (teams) → include everything.
      let recs = state.records;
      if (state.records.some((r) => r && r.city)) {
        const kw = ((els.keywords && els.keywords.value) || '').toLowerCase();
        recs = state.records.filter((r) => r && r.city &&
          kw.includes(String(r.city).split(',')[0].trim().toLowerCase()));
      }
      // For a Supabase-backed table, drop generated/auto columns (team_key,
      // updated_at, …) so the embedded rows are clean, editable table content
      // and the AI doesn't echo read-only columns back.
      let dump = recs;
      if (usingSupabase() && SB.omit.length) {
        dump = recs.map((r) => {
          const o = {};
          for (const k of Object.keys(r)) if (!SB.omit.includes(k)) o[k] = r[k];
          return o;
        });
      }
      if (dump.length) {
        const label = (els.jsonName && els.jsonName.textContent) || 'current data';
        const note = document.body.getAttribute('data-cousin-note') ||
          'update these IN PLACE — preserve every existing id and hand-curated field; return the full updated set';
        // "separate" → render the data as its own copyable artifact (keeps the
        // prompt short); "true" → append it inline to the prompt (legacy).
        if (mode === 'separate') renderDataArtifact(dump, label);
        else out += '\n\n--- CURRENT ' + label + ' (' + note + ') ---\n' + JSON.stringify(dump, null, 2);
      }
    }
    els.output.textContent = out;
    return out;
  }

  // Render the current data as its own panel with a Copy button (data-include-
  // cousin="separate"), so the prompt and the data can be pasted independently.
  function renderDataArtifact(dump, label) {
    let pre = $('dataArtifact');
    if (!pre) {
      const section = document.createElement('section');
      section.className = 'panel';
      section.id = 'dataArtifactSection';
      section.innerHTML =
        '<div class="panel-head"><span class="panel-tag" id="dataArtifactLabel">Current Data</span>' +
          '<button class="mini" id="copyDataBtn" type="button">Copy data</button></div>' +
        '<div class="panel-body">' +
          '<details class="field field-collapse"><summary>Show data</summary>' +
          '<pre id="dataArtifact" class="prompt-text"></pre></details>' +
        '</div>';
      const after = $('generatedPromptSection') ||
        (els.basePrompt && els.basePrompt.closest('section.panel'));
      if (after && after.parentNode) after.parentNode.insertBefore(section, after.nextSibling);
      else (document.querySelector('main.research') || document.body).appendChild(section);
      pre = $('dataArtifact');
      const copyBtn = $('copyDataBtn');
      if (copyBtn) copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('dataArtifact').textContent); toast('Data copied'); }
        catch (_) { toast('Copy failed'); }
      });
    }
    pre.textContent = JSON.stringify(dump, null, 2);
    const lbl = $('dataArtifactLabel');
    if (lbl) lbl.textContent = (label || 'Current Data') + ' · ' + dump.length + ' record(s)';
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
    // data-cousin-file lets a renamed page point at a differently-named cousin
    // (a renamed page → data/<original>.json). Value is the base name, no extension.
    const override = document.body.getAttribute('data-cousin-file');
    if (override) return path.replace(/[^/]*$/, '') + override.replace(/\.[^.]*$/, '');
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
    state.query = '';   // fresh data → clear any active results search
    if (usingSupabase()) {
      if (els.jsonName) els.jsonName.textContent = SB.table + ' · supabase';
      try {
        state.data = await loadRowsFromSupabase();   // array of table rows
        renderResult();
        generate();
      } catch (err) {
        renderEmpty(SB.table + ' (supabase)', err);
      }
      return;
    }
    const base = cousinBase();
    // Cousin data files live in the sibling data/ folder (e.g. /mc/get_games.html →
    // /mc/data/get_games.jsonl). Pages with data-supabase-table load from Supabase
    // instead of a cousin file (see the SB backend at the top of this file).
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
  //                            preserved. This keeps wrapper JSON valid.
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
        '<input type="search" id="resultSearch" class="result-search" ' +
          'placeholder="Search results…" autocomplete="off" spellcheck="false">' +
        '<div class="result-tools">' +
          '<button class="mini" data-view="pretty" aria-pressed="true">Structured</button>' +
          '<button class="mini" data-view="raw" aria-pressed="false">Raw</button>' +
          '<button class="mini" data-view="edit" aria-pressed="false">Edit</button>' +
        '</div>' +
      '</div>' +
      '<div class="result-view" id="resultView"></div>';

    els.result.querySelectorAll('[data-view]').forEach((b) =>
      b.addEventListener('click', () => setView(b.dataset.view))
    );
    $('prevRec').addEventListener('click', () => step(-1));
    $('nextRec').addEventListener('click', () => step(1));
    const search = $('resultSearch');
    if (search) {
      search.value = state.query;   // preserved across saves; cleared on fresh load
      search.addEventListener('input', () => {
        state.query = search.value;
        state.index = 0;
        renderCurrent();
      });
    }
    setView(state.view);
  }

  // Records currently shown — filtered by the search box (matches anywhere in the
  // record's JSON, case-insensitive). Empty query → all records.
  function visibleRecords() {
    const all = Array.isArray(state.records) ? state.records : [];
    const q = (state.query || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }

  function step(delta) {
    const n = visibleRecords().length;
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
    const list = visibleRecords();
    const n = list.length;
    if (state.index >= n) state.index = 0;
    const nav = els.result.querySelector('.result-nav');
    if (nav) nav.style.display = n > 1 ? '' : 'none';
    const counter = $('recCounter');
    if (counter) counter.textContent = n ? (state.index + 1) + ' / ' + n : '0 / 0';

    const host = $('resultView');
    if (!host) return;
    if (!n) {
      host.innerHTML = '<div class="result-empty">No results match “' + esc(state.query) + '”.</div>';
      return;
    }
    const rec = list[state.index];
    if (state.view === 'raw') {
      host.innerHTML = '<pre class="result-raw">' + esc(JSON.stringify(rec, null, 2)) + '</pre>';
    } else if (state.view === 'edit') {
      host.innerHTML = renderEditor(rec);
      wireEditor();
    } else {
      host.innerHTML = renderNode(rec);
    }
  }

  /* ── Inline editor: edit the current record's fields, then save the whole
     file back in its detected shape (JSONL or wrapper object). Scalar fields
     get an input/select; nested objects/arrays (and null) get a JSON textarea. */
  function editorRow(key, val) {
    const label = '<div class="field-label">' + esc(key) + '</div>';
    if (val === null || typeof val === 'object') {
      return '<div class="field">' + label +
        '<textarea class="edit-input" data-key="' + esc(key) + '" data-type="json" rows="3">' +
        esc(JSON.stringify(val, null, 2)) + '</textarea></div>';
    }
    if (typeof val === 'boolean') {
      return '<div class="field">' + label +
        '<select class="edit-input" data-key="' + esc(key) + '" data-type="boolean">' +
          '<option value="true"' + (val ? ' selected' : '') + '>true</option>' +
          '<option value="false"' + (!val ? ' selected' : '') + '>false</option>' +
        '</select></div>';
    }
    const type = typeof val === 'number' ? 'number' : 'string';
    return '<div class="field">' + label +
      '<input class="edit-input" type="text" data-key="' + esc(key) + '" data-type="' + type +
      '" value="' + esc(val) + '"></div>';
  }

  function renderEditor(rec) {
    const actions =
      '<div class="edit-actions">' +
        '<button class="btn btn--primary" id="saveRecBtn" type="button">Save</button>' +
        '<button class="mini" id="cancelEditBtn" type="button">Cancel</button>' +
      '</div>';
    // Plain object → per-field form; anything else → one JSON textarea.
    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
      return '<div class="result-edit">' +
        orderedEntries(rec).map(([k, v]) => editorRow(k, v)).join('') + actions + '</div>';
    }
    return '<div class="result-edit">' +
      '<div class="field"><textarea class="edit-input" data-key="__root__" data-type="json" rows="8">' +
      esc(JSON.stringify(rec, null, 2)) + '</textarea></div>' + actions + '</div>';
  }

  // Read the editor inputs back into a record (throws on invalid JSON).
  function collectEditor() {
    const host = $('resultView');
    const root = host.querySelector('[data-key="__root__"]');
    if (root) return JSON.parse(root.value);
    const rec = {};
    host.querySelectorAll('[data-key]').forEach((el) => {
      const key = el.getAttribute('data-key');
      const type = el.getAttribute('data-type');
      let v = el.value;
      if (type === 'json') v = JSON.parse(v);
      else if (type === 'number') v = v.trim() === '' ? null : Number(v);
      else if (type === 'boolean') v = v === 'true';
      rec[key] = v;
    });
    return rec;
  }

  async function saveEdit() {
    let rec;
    try { rec = collectEditor(); }
    catch (e) { toast('Invalid JSON: ' + e.message); return false; }
    // The editor edits the record currently shown (which may be a filtered view),
    // so map it back to its real slot in state.records before saving.
    const current = visibleRecords()[state.index];
    const realIdx = Array.isArray(state.records) ? state.records.indexOf(current) : -1;
    if (realIdx >= 0) state.records[realIdx] = rec;
    else state.records.push(rec);
    try {
      await commitRecords(state.records, realIdx >= 0 ? realIdx : state.records.length - 1, state.shape);
      toast('Saved ✓');
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Save failed: ' + e.message);
      return false;
    }
  }

  // Wrap an async save action with on-button feedback: disable + "Saving…" while
  // it runs, "Saved ✓" briefly on success (truthy return), restore on failure.
  async function buttonFeedback(btn, fn) {
    if (!btn) return fn();
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    let ok = false;
    try { ok = await fn(); }
    finally {
      btn.disabled = false;
      if (ok) {
        btn.textContent = 'Saved ✓';
        setTimeout(() => { if (document.body.contains(btn)) btn.textContent = orig; }, 1600);
      } else {
        btn.textContent = orig;
      }
    }
    return ok;
  }

  function wireEditor() {
    const save = $('saveRecBtn');
    if (save) save.addEventListener('click', () => buttonFeedback(save, saveEdit));
    const cancel = $('cancelEditBtn');
    if (cancel) cancel.addEventListener('click', () => setView('pretty'));
  }

  /* ── Merge / append new AI results into the cousin file ────────
     Format-aware: a JSONL/array cousin is written as JSON Lines; a wrapper
     object (e.g. { _ai_update_prompt, records:[...] }) is re-emitted
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
      return JSON.stringify(obj, null, 2) + '\n';   // pretty wrapper object
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
    if (usingSupabase()) {
      await upsertToSupabase(records);
      // Re-read the table so Results show the TRUE post-write state (updated +
      // added + the untouched rows that were never in the paste, all still there).
      try { state.data = await loadRowsFromSupabase(); }
      catch (_) { state.data = records; }
    } else {
      const text = serializeRecords(records, shape);
      if (window.showSaveFilePicker) await writeTextToHandle(await ensureHandle(), text);
      else downloadText(els.jsonName.textContent || 'results.jsonl', text);
      state.data = shape.kind === 'object'
        ? Object.assign({}, shape.wrapper, { [shape.collectionKey]: records })
        : records;
    }
    renderResult();   // recomputes state.shape + state.records from state.data
    state.index = Math.min(Math.max(firstNew, 0), state.records.length - 1);
    renderCurrent();
    generate();       // keep the prompt's embedded "current data" in sync (opt-in)
    const mergeBox = $('mergeInput');
    if (mergeBox) mergeBox.value = '';   // may be absent on data-merge="off" pages
  }

  async function appendResults() {
    const input = readMergeInput();
    if (!input) return false;
    try {
      // Read the file fresh (catches external edits), but NEVER lose what Section
      // 2 already loaded — union the two. If the file read comes back empty or
      // unreadable (a showSaveFilePicker quirk), the loaded records carry it, so
      // Append can't silently turn into Overwrite.
      let fileRecords = [], fileShape = state.shape || { kind: 'jsonl' };
      if (usingSupabase()) {
        try {
          fileRecords = await loadRowsFromSupabase();   // re-read live rows
          fileShape = detectShape(fileRecords);
        } catch (_) { /* table unreadable → fall back to the loaded records */ }
      } else if (window.showSaveFilePicker) {
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
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Write failed: ' + e.message);
      return false;
    }
  }

  async function overwriteResults() {
    const input = readMergeInput();
    if (!input) return false;
    const confirmMsg = usingSupabase()
      ? 'Overwrite the ' + SB.table + ' table with these ' + input.records.length +
        ' record(s)? Existing rows are updated and new ones added (nothing is deleted).'
      : 'Overwrite with these ' + input.records.length + ' record(s)? This replaces ALL current results.';
    if (!window.confirm(confirmMsg)) return false;
    try {
      // If the paste is itself a wrapper object, adopt it (keeps its top-level
      // fields, e.g. _ai_update_prompt); otherwise reuse the file's shape.
      const pasted = detectShape(input.parsed);
      const shape = pasted.kind === 'object' ? pasted : (state.shape || { kind: 'jsonl' });
      await commitRecords(input.records, 0, shape);
      toast('Overwrote · ' + input.records.length + ' record(s)' + skipNote(input.skipped));
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Write failed: ' + e.message);
      return false;
    }
  }

  /* ── Review-before-overwrite (Supabase, team_key identity) ──────────────
     Diffs the pasted reply against the live rows so you see exactly what an
     overwrite will do — and forces each existing team's identity (league, code,
     tgbid) to its stored value so the AI can never corrupt an id. */
  const IDENTITY_FIELDS = ['league', 'code', 'tgbid'];
  function teamKeyOf(row) {
    const lg = String((row && row.league) || '').trim().toUpperCase();
    const cd = String((row && row.code) || '').trim().toUpperCase();
    return (lg && cd) ? lg + ':' + cd : null;
  }

  function computeOverwritePlan(pasted) {
    const current = Array.isArray(state.records) ? state.records : [];
    const curByKey = new Map();
    current.forEach((r) => { const k = r.team_key || teamKeyOf(r); if (k) curByKey.set(k, r); });
    const usedTgbids = new Set(current.map((r) => Number(r.tgbid)).filter(Number.isFinite));
    const seen = new Set();
    const updates = [], adds = [], errors = [], safe = [];
    const ignore = new Set(SB.omit.concat(['team_key']));
    pasted.forEach((p, i) => {
      const key = teamKeyOf(p);
      if (!key) { errors.push('Row ' + (i + 1) + ' is missing league or code — skipped.'); return; }
      if (seen.has(key)) { errors.push('Team ' + key + ' appears more than once in your paste.'); return; }
      seen.add(key);
      const cur = curByKey.get(key);
      if (cur) {
        const merged = Object.assign({}, p);
        const idIgnored = [];
        IDENTITY_FIELDS.forEach((f) => {
          if (p[f] != null && String(p[f]) !== String(cur[f])) idIgnored.push(f);
          merged[f] = cur[f];   // force stored identity — AI can't change it
        });
        const changed = [];
        Object.keys(merged).forEach((f) => {
          if (ignore.has(f) || IDENTITY_FIELDS.includes(f)) return;
          const from = cur[f] == null ? '' : String(cur[f]);
          const to = merged[f] == null ? '' : String(merged[f]);
          if (from !== to) changed.push({ f, from, to });
        });
        updates.push({ key, changed, idIgnored });
        safe.push(merged);
      } else {
        if (p.tgbid == null || p.tgbid === '')
          errors.push('New team ' + key + ' has no tgbid (required).');
        else if (usedTgbids.has(Number(p.tgbid)))
          errors.push('New team ' + key + ' uses tgbid ' + p.tgbid + ', which already exists.');
        else usedTgbids.add(Number(p.tgbid));
        adds.push(key);
        safe.push(p);
      }
    });
    const untouched = current.filter((r) => !seen.has(r.team_key || teamKeyOf(r)));
    return { updates, adds, untouched, errors, safe };
  }

  function showOverwritePreview() {
    const host = $('mergePreview');
    const input = readMergeInput();
    if (!input || !host) return;
    const plan = computeOverwritePlan(input.records);
    const edited = plan.updates.filter((u) => u.changed.length);
    const idIgnored = plan.updates.filter((u) => u.idIgnored.length);
    let h = '<div class="preview-card"><div class="preview-title">Review before saving</div><ul class="preview-stats">';
    h += '<li class="ok">✎ ' + plan.updates.length + ' existing team(s) in your paste — ' + edited.length + ' with field changes</li>';
    h += '<li class="ok">＋ ' + plan.adds.length + ' new team(s) to add</li>';
    h += '<li class="' + (plan.untouched.length ? 'warn' : '') + '">○ ' + plan.untouched.length +
      ' existing team(s) NOT in your paste — kept unchanged (never deleted)</li>';
    h += '</ul>';
    if (edited.length) {
      const swatch = (v) => /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)
        ? '<span class="diff-swatch" style="background:' + esc(v) + '"></span>' : '';
      const val = (v) => v === '' ? '<span class="diff-empty">∅</span>' : swatch(v) + esc(v);
      h += '<details class="preview-details" open><summary>' + edited.length + ' changed team(s)</summary><ul class="preview-changes">' +
        edited.slice(0, 60).map((u) =>
          '<li><b>' + esc(u.key) + '</b><ul class="preview-diff">' +
          u.changed.map((c) => '<li><span class="diff-field">' + esc(c.f) + '</span> ' +
            '<span class="from">' + val(c.from) + '</span> → <span class="to">' + val(c.to) + '</span></li>').join('') +
          '</ul></li>').join('') +
        (edited.length > 60 ? '<li>…and ' + (edited.length - 60) + ' more</li>' : '') + '</ul></details>';
    }
    if (idIgnored.length)
      h += '<div class="preview-note">Kept stored id (league/code/tgbid) on ' + idIgnored.length +
        ' team(s) where the reply tried to change it.</div>';
    if (plan.errors.length)
      h += '<div class="preview-errors"><b>' + plan.errors.length + ' problem(s) — fix before applying:</b><ul>' +
        plan.errors.slice(0, 40).map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    h += '<div class="preview-actions">';
    if (!plan.errors.length)
      h += '<button class="btn btn--primary" id="applyOverwriteBtn" type="button">Save changes</button>';
    h += '<button class="mini" id="cancelPreviewBtn" type="button">Cancel</button></div></div>';
    host.innerHTML = h;
    const apply = $('applyOverwriteBtn');
    if (apply) apply.addEventListener('click', () => buttonFeedback(apply, () => applyOverwrite(plan.safe)));
    const cancel = $('cancelPreviewBtn');
    if (cancel) cancel.addEventListener('click', () => { host.innerHTML = ''; });
  }

  async function applyOverwrite(records) {
    try {
      await commitRecords(records, 0, state.shape || { kind: 'jsonl' });
      toast('Saved · ' + records.length + ' team(s) upserted');
      const host = $('mergePreview'); if (host) host.innerHTML = '';
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') toast('Write failed: ' + e.message);
      return false;
    }
  }

  function mountMerge() {
    if (!els.result || $('mergePanel')) return;
    // Pages whose cousin file isn't plain JSONL (e.g. a wrapper object with a
    // fixed { _ai_update_prompt, teams:[…] } shape) opt out so the JSONL writer
    // can't clobber them — those are edited by their own dedicated tool.
    if (document.body.getAttribute('data-merge') === 'off') return;
    const resultsSection = els.result.closest('section.panel');
    const section = document.createElement('section');   // its own block
    section.className = 'panel';
    section.id = 'mergePanel';
    const mergeTitle = document.body.getAttribute('data-merge-title') || 'Add Results';
    // data-merge-mode="overwrite" → a single Overwrite button (the AI returns the
    // COMPLETE set, so there's no separate append step). Default → Append + Overwrite.
    const overwriteOnly = document.body.getAttribute('data-merge-mode') === 'overwrite';
    const overwriteLabel = overwriteOnly && usingSupabase() ? 'Review changes' : 'Overwrite';
    const buttons = overwriteOnly
      ? '<button class="btn btn--primary" id="overwriteBtn" type="button">' + overwriteLabel + '</button>'
      : '<button class="btn btn--primary" id="appendBtn" type="button">Append &amp; save</button>' +
        '<button class="btn btn--danger" id="overwriteBtn" type="button">Overwrite</button>';
    const hint = overwriteOnly
      ? (usingSupabase()
          ? 'Overwrite shows a review of exactly what will change first; Apply then upserts by ' +
            (SB.conflict || 'key') + ' — edits existing, adds new, never deletes.'
          : 'Overwrite replaces the whole file with your full result.')
      : (usingSupabase()
          ? 'Saves upsert into the ' + SB.table + ' table by ' + (SB.conflict || 'key') +
            ' (insert new, update existing). No deletes.'
          : (window.showSaveFilePicker
            ? 'Append merges new records in; Overwrite replaces the whole file.'
            : 'No file-write here — you’ll get a download to save over the file.'));
    section.innerHTML =
      '<div class="panel-head"><span class="panel-tag">2 · ' + mergeTitle + '</span></div>' +
      '<div class="panel-body">' +
        '<textarea id="mergeInput" class="merge-input" placeholder="' +
          esc(document.body.getAttribute('data-merge-placeholder') ||
            'Paste the AI reply here — one record per line, or a JSON array.') + '"></textarea>' +
        '<div class="merge-actions">' +
          buttons +
          '<span class="merge-hint">' + hint + '</span>' +
        '</div>' +
        '<div id="mergePreview" class="merge-preview"></div>' +
      '</div>';
    // Place it directly under the Copy button (fall back to after Results).
    const anchor = (els.copyBtn && els.copyBtn.parentNode) ? els.copyBtn : resultsSection;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(section, anchor.nextSibling);
    } else {
      els.result.parentNode.appendChild(section);
    }
    const appendBtn = $('appendBtn');
    if (appendBtn) appendBtn.addEventListener('click', () => buttonFeedback(appendBtn, appendResults));
    const overwriteBtn = $('overwriteBtn');
    // Supabase → show the review/diff first (Apply commits). File pages → direct.
    if (usingSupabase()) overwriteBtn.addEventListener('click', showOverwritePreview);
    else overwriteBtn.addEventListener('click', () => buttonFeedback(overwriteBtn, overwriteResults));
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
      const rows = orderedEntries(val).map(([k, v]) => {
        const vHtml = renderNode(v);
        return '<div class="kv"><div class="k">' + esc(k) + '</div><div class="v-wrap">' + vHtml + '</div></div>';
      }).join('');
      return '<div class="node-obj">' + rows + '</div>';
    }
    if (typeof val === 'number')  return '<span class="v v-num">' + esc(val) + '</span>';
    if (typeof val === 'boolean') return '<span class="v v-bool">' + val + '</span>';
    if (isHexColor(val)) {
      return '<span class="v v-color"><span class="swatch" style="background:' + esc(val) +
        '"></span>' + esc(val) + '</span>';
    }
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
  // #RGB, #RGBA, #RRGGBB, or #RRGGBBAA hex color string
  function isHexColor(s) { return typeof s === 'string' && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s.trim()); }

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
