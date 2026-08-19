// waypoint-editor.js -- ONE waypoint editor, shared by every room that has one.
//
// window.TgbWaypointEditor
//
// WHY THIS FILE EXISTS. The editor lived inside mc/paths.html and the Waypoint
// Finder had a five-field form of its own, so the same job was done two ways in
// two rooms: the Path Builder could geocode, search OpenStreetMap, run a Plus
// Code, warn about a near-duplicate and shelve a place, and the Finder could
// type five boxes. They edit the SAME ROW of the same table. Keeping them in
// step by hand is the arrangement this repo has already lost to twice, with the
// Plus Code codec and the waypoints import helper, which is why waypoint-geo.js
// and waypoint-prompts.js were extracted rather than copied. Same call here.
//
// IT BRINGS ITS OWN MARKUP AND ITS OWN CSS. A host page adds a script tag and
// mounts it; there is no dialog to paste and no rules to keep aligned, so the
// two rooms cannot drift apart by somebody restyling one of them.
//
// THE HOST CONTRACT is small on purpose. Everything the editor needs from a
// page is passed in, and the only thing it insists on is the two Supabase
// helpers, because a page's key handling is the page's business:
//
//   mount({
//     restUrl(table, params)   -> string          REQUIRED
//     authHeaders(extra)       -> object          REQUIRED
//     setStatus(msg, tone)                        optional, the room's notice line
//     waypoints()  -> array                       optional, the loaded library:
//                                                 used for near-duplicate warnings
//                                                 and kept in step after a write
//     removeWaypoint(wpid)                        optional, drop one locally
//     onChanged()                                 optional, repaint the room
//     path: {                                     optional, PATH BUILDER ONLY
//       isOpen() -> boolean,
//       has(wpid) -> boolean,
//       add(wpid)
//     }
//   })
//
// A room with no `path` simply never offers "add it to the open path", which is
// the only part of this editor that is not about the waypoint itself.
//
// STYLING IS THE HOST'S TOKENS. Every colour here is a var() the admin pages
// already define (--ink, --line, --warn, --muted, --paper, --bic-blue-rgb,
// --success), so the editor takes on whichever room it opens in rather than
// carrying a palette of its own.

(function () {
  'use strict';

  var host = null;
  var mounted = false;

  function el(id) { return document.getElementById(id); }
  function cleanText(v) { return String(v == null ? '' : v).trim(); }

  // Host shims. Each one is safe to call whether or not the page supplied it,
  // so the editor works in a room that only handed over the two REST helpers.
  function setStatus(msg, tone) { if (host.setStatus) host.setStatus(msg, tone); }
  function restUrl(t, p) { return host.restUrl(t, p); }
  function authHeaders(x) { return host.authHeaders(x); }
  function hostPathOpen() { return !!(host.path && host.path.isOpen && host.path.isOpen()); }
  function hostPathHas(wpid) { return !!(host.path && host.path.has && host.path.has(wpid)); }


  // Defaults, applied at mount, so the body below can call these unguarded.
  function applyHostDefaults(h) {
    var o = Object.assign({}, h);
    if (typeof o.waypoints !== 'function') o.waypoints = function () { return []; };
    if (typeof o.removeWaypoint !== 'function') {
      o.removeWaypoint = function (wpid) {
        var list = o.waypoints();
        for (var i = list.length - 1; i >= 0; i--) {
          if (String(list[i].wpid) === String(wpid)) list.splice(i, 1);
        }
      };
    }
    if (typeof o.onChanged !== 'function') o.onChanged = function () {};
    if (o.path && typeof o.path.add !== 'function') o.path.add = function () {};
    return o;
  }



  // ---- helpers the editor used to borrow from its host page -------------------
  // Each of these lived in mc/paths.html and is pulled in here so the module
  // stands alone. They are small and have no page state in them.

  // COLUMN PROBING, NOT ASSUMING. Naming a column PostgREST does not have 400s
  // the whole request, so the editor learns which optional columns exist by
  // looking at rows it has actually been given, and a database that has not run
  // a migration still works: the field is simply hidden.
  var wpCols = { source_url: false, latlon: false, walk_order: false };

  function probeWaypointColumns(rows) {
    var has = function (key) {
      return (Array.isArray(rows) ? rows : []).some(function (r) {
        return r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, key);
      });
    };
    wpCols.source_url = has('source_url');
    wpCols.latlon = has('lat');
    wpCols.walk_order = has('walk_order');
  }

  function wpById(id) {
    return host.waypoints().find(function (w) { return String(w.wpid) === String(id); });
  }

  // The city a NEW waypoint is born in. The Path Builder answers with the open
  // path's city; a room with no path answers with whatever it is filtered to,
  // and '' is a fine answer -- the field is editable and required.
  function pathCity() { return host.defaultCity ? cleanText(host.defaultCity()) : ''; }

  function mkBtn(text, title, onClick, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small';
    b.textContent = text;
    if (title) b.title = title;
    b.disabled = !!disabled;
    if (!disabled && onClick) b.addEventListener('click', onClick);
    return b;
  }

  // FROM THE CITY CATALOGUE where the page has it loaded, so the field offers
  // the canonical spelling rather than whatever was typed last. Fails soft in
  // every direction: no TgbCities, no list, no problem. The field stays free
  // text either way, because a waypoint's city genuinely may be somewhere the
  // catalogue does not hold.
  function fillCityList() {
    var list = el('pathCityList');
    if (!list || !window.TgbCities || typeof window.TgbCities.load !== 'function') return;
    window.TgbCities.load().then(function () {
      list.innerHTML = '';
      window.TgbCities.all().forEach(function (row) {
        var o = document.createElement('option');
        // The BARE city, which is what waypoints.city holds; the canonical
        // string goes on the label so the list still reads in full.
        o.value = host.cityName ? host.cityName(row.city)
          : String(row.city || '').split(',')[0].trim();
        o.label = row.city;
        list.appendChild(o);
      });
    }).catch(function () {});
  }

  async function readError(res) {
    var body = await res.text().catch(function () { return ''; });
    try {
      var j = JSON.parse(body);
      return j.message || j.hint || body || ('HTTP ' + res.status);
    } catch (_) { return body || ('HTTP ' + res.status); }
  }

  // A token that expires mid-edit turns a Save into a silent 401. The host
  // hands over its auth object if it has one; a room without one is unaffected.
  async function ensureFreshSession() {
    if (host.ensureFreshSession) return host.ensureFreshSession();
  }

  // ---- the editor's own CSS -------------------------------------------------
  // Injected once, so a host page has no rules to keep aligned with another
  // room's. Every colour is a var() the admin pages already define, so the
  // dialog takes on whichever room it opens in. Injected FIRST in <head>, ahead
  // of the page's own <style>, so a room can still override a rule if it has to
  // without needing !important.
  var CSS = [
    '.wp-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }',
    '.wp-form .wp-field { display: grid; gap: 4px; min-width: 0; }',
    '.wp-form .wp-field--full { grid-column: 1 / -1; }',
    '.wp-form label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }',
    '.wp-form input, .wp-form textarea { width: 100%; font: inherit; font-size: 0.9rem; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 3px; padding: 6px 8px; }',
    '.wp-form textarea { min-height: 92px; resize: vertical; }',
    /* The red a walking tour actually needs: a field left blank that a path
       cannot do without. You cannot walk to a waypoint with no address, and one
       with no description gives a challenge writer nothing to build on. */
    '.wp-form .is-error input, .wp-form .is-error textarea { border-color: var(--warn); }',
    '.wp-readonly { font-family: "IBM Plex Mono", monospace; font-size: 0.82rem; color: var(--muted); padding: 6px 0; overflow-wrap: anywhere; }',
    '.wp-hint { font-size: 0.72rem; color: var(--muted); }',
    '.dlg-note.busy { color: var(--ink); }',
    '.find-bar { display: flex; gap: 8px; }',
    '.find-bar input { flex: 1; font: inherit; font-size: 0.9rem; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 3px; padding: 6px 8px; }',
    '.find-list { display: grid; gap: 6px; max-height: 46vh; overflow: auto; }',
    '.find-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 3px; background: #fff; }',
    '.find-row-main { flex: 1; min-width: 0; }',
    '.find-row-name { font-weight: 600; font-size: 0.92rem; overflow-wrap: anywhere; }',
    '.find-row-sub { font-size: 0.76rem; color: var(--muted); overflow-wrap: anywhere; }',
    /* A result we appear to hold already. Never blocked, since one address is
       routinely several stops, but never silently offered as if it were new. */
    '.find-row.is-dupe { border-color: var(--warn); }',
    '.find-row-dupe { font-size: 0.72rem; color: var(--warn); font-weight: 700; }',
    /* The dialog shell, for a room that has no .dlg of its own. A host that
       already styles .dlg (the Path Builder does) overrides these from its own
       sheet, which loads later. */
    '.dlg { position: fixed; inset: 0; z-index: 1100; display: none; place-items: center; padding: 24px; background: rgba(2, 6, 23, 0.55); }',
    '.dlg.is-open { display: grid; }',
    '.dlg-panel { width: min(100%, 460px); display: grid; gap: 14px; padding: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-base, #fff); box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3); max-height: calc(100vh - 48px); overflow: auto; }',
    '.dlg-panel--wide { width: min(100%, 760px); }',
    '.dlg-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }',
    '.dlg-title { margin: 0; font-size: 1.05rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }',
    '.dlg-id { font-family: "IBM Plex Mono", monospace; font-size: 0.76rem; color: var(--muted); }',
    '.dlg-note { margin: 0; font-size: 0.78rem; color: var(--muted); }',
    '.dlg-note.error { color: var(--warn); }',
    '.dlg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }',
    /* A BAND, not a row. The gap INSIDE a group is tighter than the gap between
       groups, which is the whole mechanism: two buttons that belong together
       read as a pair without a rule, a box or a label. */
    '.dlg-group { display: inline-flex; align-items: center; gap: 6px; }',
    /* A REAL RULE, not a wider gap. The bands were separated by 14px against
       6px inside, which is a difference you have to measure rather than see. */
    '.dlg-rule { align-self: stretch; width: 1px; min-height: 22px; background: var(--line); flex: 0 0 auto; }',
    /* THE HELPERS ARE QUIETER THAN THE DECISIONS. Look up, Find online and
       Duplicate only act on the form in front of you; Close and Save end the
       dialog and Delete destroys the row. Six buttons at one weight made those
       look like six equal choices. No border and no ground until you go near
       them, so they read as available rather than as offered. */
    '#wpDlg .btn.ghost, #findDlg .btn.ghost { border-color: transparent; background: none; color: rgba(var(--bic-blue-rgb), 0.86); }',
    '#wpDlg .btn.ghost:hover:not(:disabled), #findDlg .btn.ghost:hover:not(:disabled) { border-color: var(--line); background: var(--paper, #fff); color: var(--ink); }',
    /* MAPS AND LOCATE SIT ON THE COORDINATES FIELD, because both are about that
       one value and neither is about the row. Small, quiet, and beside the thing
       they act on. */
    '.wp-readonly-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }',
    '.wp-inline-act { appearance: none; border: 0; background: none; padding: 0; margin: 0; font: inherit; font-family: "IBM Plex Mono", monospace; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--bic-blue, #2d4880); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }',
    '.wp-inline-act:hover { color: var(--ink); }',
    '.wp-inline-act[disabled] { opacity: 0.45; cursor: default; text-decoration: none; }',
    '.dlg-spacer { flex: 1 1 auto; }',
    /* THE EDITOR'S BUTTONS ARE THE EDITOR'S, and they are ID-SCOPED so they
       win. Every room defines .btn its own way: the Path Builder uppercases at
       3px radius, the Waypoint Finder does not at 6px, so the same dialog was
       reading as two different dialogs depending which door you came through,
       which is the whole thing this module exists to stop. A page's own sheet
       loads AFTER this one, so matching a bare .btn would lose on source order;
       `#wpDlg .btn` carries an id and beats a class outright whatever the
       order. The rest of each room's buttons are untouched. */
    '#wpDlg .btn, #findDlg .btn { appearance: none; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 3px; background: var(--paper, #fff); color: var(--ink); font: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 9px; cursor: pointer; text-decoration: none; }',
    '#wpDlg .btn:hover:not(:disabled), #findDlg .btn:hover:not(:disabled) { border-color: var(--ink); }',
    '#wpDlg .btn:disabled, #findDlg .btn:disabled { opacity: 0.45; cursor: default; }',
    '#wpDlg .btn.primary, #findDlg .btn.primary { background: var(--ink); color: #fff; border-color: var(--ink); }',
    '#wpDlg .btn.warn, #findDlg .btn.warn { color: var(--warn); }'
  ].join('\n');

  // ---- the editor's own markup ----------------------------------------------
  // Two dialogs: the editor, and Find online behind it. Appended to <body> at
  // mount, so a host page carries no copy of this to fall out of step.
  var MARKUP = [
    // THE CITY SUGGESTIONS BELONG TO THE EDITOR, not to a host page. The City
    // field is the editor's, so the list behind it is too. A room that kept its
    // own copy is a room that can lose it, which is exactly what happened the
    // moment the Waypoint Finder's dialog markup came out and took its datalist
    // with it, leaving fillCityList writing to null on every load.
    '<datalist id="pathCityList"></datalist>',
    '<div class="dlg" id="wpDlg" role="dialog" aria-modal="true" aria-labelledby="wpDlgTitle">',
    '  <div class="dlg-panel dlg-panel--wide">',
    '    <div class="dlg-head">',
    '      <h2 class="dlg-title" id="wpDlgTitle">Waypoint</h2>',
    // THE SWITCH LIVES IN THE HEADER, not in the button row. It is a STATE, and
    // it WRITES IMMEDIATELY; every other control in that row waits for Save, so
    // sitting among them it read as one more pending change. Up here beside the
    // WPID it reads as what this row currently is, which is what it is.
    // NO LIVE / SHELVED SWITCH. It sat here for about an hour. Every waypoint
    // is live as of 2026-08-18: the library holds all of them and every one is
    // eligible for a path, so there is no second state for a switch to show.
    '      <span class="dlg-id" id="wpDlgId"></span>',
    '    </div>',
    '    <div class="wp-form" id="wpForm"></div>',
    '    <p class="dlg-note" id="wpDlgNote" aria-live="polite"></p>',
    '    <div class="dlg-actions">',
    // A SWITCH, NOT A BUTTON. It was a button whose face read the state it was
    // about to PRODUCE ("Archive" when live, "Restore" when shelved), so it said
    // what pressing it does and never what the waypoint IS. It sits FIRST
    // because it is the one control here stating what the row currently is:
    // state, then the things you can do. It stays in this row rather than in the
    // form because it WRITES IMMEDIATELY and the fields do not.
    // ORDERED BY CONSEQUENCE, and the two ends are the two ends on purpose.
    //
    // DELETE IS ALONE ON THE FAR LEFT, as far from SAVE as the row goes. It is
    // the only irreversible control here and it used to sit fourth of six, one
    // button from Close, coloured red in the middle of the line where it pulled
    // the eye to the least likely thing you came to do. Destructive-hard-left,
    // primary-hard-right is the arrangement most dialogs settle on, and the
    // reason is the gap between them.
    //
    // THE MIDDLE IS HELP: two that only fill the form in front of you, and one
    // that copies it. None of them ends the dialog.
    //
    // THE RIGHT IS HOW YOU LEAVE. Close discards, Save commits, and Save is the
    // only filled button in the room.
    '      <button class="btn small warn" id="wpDeleteBtn" type="button" title="Remove this row for good. There is no undo.">Delete</button>',
    '      <span class="dlg-rule" role="separator" aria-orientation="vertical"></span>',
    '      <span class="dlg-group">',
    '        <button class="btn small ghost" id="wpFillBtn" type="button" title="Geocode from what is set and fill in every blank field, coordinates included">Look up</button>',
    '        <button class="btn small ghost" id="wpFindBtn" type="button" title="Search OpenStreetMap for what is in the Name box and open a result as a draft">Find online</button>',
    '        <button class="btn small ghost" id="wpDupeBtn" type="button" title="Create a new waypoint from this one, minus its id">Duplicate</button>',
    '      </span>',
    '      <span class="dlg-spacer"></span>',
    '      <button class="btn small" id="wpCloseBtn" type="button">Close</button>',
    '      <button class="btn small primary" id="wpSaveBtn" type="button">Save</button>',
    '    </div>',
    '  </div>',
    '</div>',
    // Find online. Three sources behind one box: Nominatim for addresses and
    // famous places, Overpass by category ("bakery savannah"), Overpass by name
    // for the shop on the corner Nominatim has never heard of. A result is never
    // inserted straight from here; it opens in the editor as an unsaved draft.
    '<div class="dlg" id="findDlg" role="dialog" aria-modal="true" aria-labelledby="findDlgTitle">',
    '  <div class="dlg-panel dlg-panel--wide">',
    '    <div class="dlg-head">',
    '      <h2 class="dlg-title" id="findDlgTitle">Find a waypoint</h2>',
    '      <span class="dlg-id" id="findCount"></span>',
    '    </div>',
    '    <div class="find-bar">',
    '      <input type="search" id="findQuery" placeholder="Name, address, or &quot;bakery savannah&quot;">',
    '      <button class="btn small primary" id="findGoBtn" type="button">Search</button>',
    '    </div>',
    '    <p class="dlg-note" id="findNote" aria-live="polite"></p>',
    '    <div class="find-list" id="findList"></div>',
    '    <div class="dlg-actions">',
    '      <button class="btn small" id="findBlankBtn" type="button" title="Skip the search and type it in by hand">Blank waypoint</button>',
    '      <span class="dlg-spacer"></span>',
    '      <button class="btn small" id="findCloseBtn" type="button">Close</button>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');


  // The two-letter code for a city string, via the shared geo module -- the
  // same one that turns "Denver, Colorado" into CO everywhere else. Returns
  // '' when the city is not one it can parse, which is a real case: a
  // waypoint's city is free text and may be somewhere not in the library.
  function stateFromCity(city) {
    const name = cleanText(city);
    if (!name || !window.TgbGeo || typeof window.TgbGeo.parseGeo !== 'function') return '';
    try {
      const geo = window.TgbGeo.parseGeo(name) || {};
      return cleanText(geo.stateCode || geo.state_code || '');
    } catch (err) { return ''; }
  }

  // A field a walking tour actually needs. Same list the Waypoints page paints
  // red, so the two cannot disagree about what "incomplete" means.
  const WP_ERROR_FIELDS = ['address', 'city', 'zip', 'description'];


  const wpEdit = { row: null, wpid: '', dirty: false, busy: false, addToPath: false };

  function wpDlgOpen() { return el('wpDlg').classList.contains('is-open'); }

  function wpNote(text, kind) {
    const note = el('wpDlgNote');
    note.textContent = text || '';
    note.classList.toggle('warn', kind === 'error');
    note.classList.toggle('busy', kind === 'busy');
  }

  // A Plus Code in Address is not a missing address - it is a more precise one
  // than a street number, and it is why the field accepts one at all. It also
  // clears the ZIP error: ZIP only counts because it is what the map falls
  // back to when a street will not geocode.
  function wpErrors(row) {
    const geo = window.TgbWaypointGeo;
    if (!row) return [];
    const plusCoded = geo && geo.looksLikePlusCode(row.address)
      && !geo.isShortPlusCode(row.address) && !!geo.decodePlusCode(row.address);
    return WP_ERROR_FIELDS.filter((f) => {
      if (plusCoded && (f === 'address' || f === 'zip')) return false;
      return !cleanText(row[f]);
    });
  }

  // opts.point moves the waypoint to a new coordinate and opens DIRTY, so the
  // dialog is a confirmation rather than a write: dragging a pin is easy to do
  // by accident on a trackpad, and a drag that saved itself would move a place
  // in the database with nothing to press to undo it. Close discards it.
  function openWaypointEditor(wpid, opts) {
    const source = wpid == null ? null : wpById(wpid);
    if (wpid != null && !source) return;
    // A working COPY. Everything up to Save happens here, so Close can throw
    // the edit away without the list having been changed underneath.
    wpEdit.row = source
      ? Object.assign({}, source)
      : { wpid: '', name: '', city: pathCity(), state: '', zip: '', address: '',
          description: '', source_url: '', lat: null, lon: null };
    wpEdit.wpid = source ? String(source.wpid) : '';
    wpEdit.dirty = false;
    wpEdit.busy = false;

    const movedTo = opts && opts.point;
    if (movedTo) {
      const geo = window.TgbWaypointGeo;
      const r6 = (n) => (geo && geo.round6 ? geo.round6(n) : Math.round(n * 1e6) / 1e6);
      wpEdit.row.lat = r6(Number(movedTo.lat));
      wpEdit.row.lon = r6(Number(movedTo.lon));
      // The ADDRESS IS NOT TOUCHED and must not be. Moving a pin says where the
      // place is, not what its street line is, and reverse-geocoding a point
      // into an address produces a plausible, wrong, uncheckable line - the
      // rule this project has held since the nightly scout was written.
      wpEdit.dirty = true;
    }
    // A waypoint made while a path is open is almost always for that path.
    wpEdit.addToPath = !source && hostPathOpen();
    el('wpDlg').classList.add('is-open');
    renderWaypointForm();
    if (movedTo) {
      wpNote('Moved on the map. Save to store the new point, or Close to leave it where it was.', 'busy');
    }
    const first = el('wpForm').querySelector('input, textarea');
    if (first) first.focus();
  }

  function closeWaypointEditor(force) {
    if (!force && wpEdit.dirty
      && !window.confirm('This waypoint has unsaved changes. Close and lose them?')) return;
    el('wpDlg').classList.remove('is-open');
    wpEdit.row = null;
    wpEdit.dirty = false;
  }

  function wpField(label, key, opts) {
    const options = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'wp-field' + (options.full ? ' wp-field--full' : '');
    const lab = document.createElement('label');
    lab.className = 'inline';
    lab.textContent = label;
    const input = document.createElement(options.multiline ? 'textarea' : 'input');
    if (!options.multiline) input.type = 'text';
    input.value = cleanText(wpEdit.row[key]);
    if (options.placeholder) input.placeholder = options.placeholder;
    if (options.list) input.setAttribute('list', options.list);
    input.addEventListener('input', () => {
      wpEdit.row[key] = input.value;
      // Editing the address invalidates the stored point - the coordinates
      // describe where the OLD address was. Locate or Fill sets them again.
      if (key === 'address') { wpEdit.row.lat = null; wpEdit.row.lon = null; }
      wpEdit.dirty = true;
      paintWpErrors();
    });
    wrap.append(lab, input);
    if (options.hint) {
      const hint = document.createElement('p');
      hint.className = 'wp-hint';
      hint.textContent = options.hint;
      wrap.appendChild(hint);
    }
    wrap.dataset.field = key;
    return wrap;
  }

  function paintWpErrors() {
    const bad = wpErrors(wpEdit.row);
    el('wpForm').querySelectorAll('[data-field]').forEach((node) => {
      node.classList.toggle('is-error', bad.indexOf(node.dataset.field) > -1);
    });
  }

  function renderWaypointForm() {
    const row = wpEdit.row;
    if (!row) return;
    const box = el('wpForm');
    box.innerHTML = '';
    const isNew = !wpEdit.wpid;

    // THE TITLE NAMES THE ROOM, NOT THE ROW. It printed the waypoint's own
    // name, which the Name field directly beneath it already carries in an
    // editable box: the heading was the same word twice, and it changed as you
    // typed. A dialog's heading should say what you are doing.
    el('wpDlgTitle').textContent = isNew ? 'New waypoint' : 'Waypoint edit';
    el('wpDlgId').textContent = isNew ? 'not saved yet' : ('WPID ' + wpEdit.wpid);

    box.append(
      wpField('Name', 'name', { full: true, placeholder: 'What the waypoint is called' }),
      wpField('Description', 'description', { full: true, multiline: true,
        placeholder: 'What a visitor standing here is told' }),
      wpField('Address', 'address', { full: true,
        placeholder: '200 E Colfax Ave',
        hint: 'Street only - city, state and ZIP have their own fields. A Plus Code is allowed where there is no street.' }),
      wpField('City', 'city', { list: 'pathCityList' }),
      // NO STATE BOX. The city carries it: public.cities holds the canonical
      // string, TgbGeo parses "Denver, Colorado" into a state, and stateFromCity
      // below writes the two-letter CODE the other 280 rows use. A field that
      // can only be filled in one correct way is a field that can be got
      // wrong, and this one was: Nominatim answers "Florida" where every
      // stored row says "FL".
      // The COLUMN is untouched and still written on save.
      wpField('ZIP', 'zip'),
      wpField('Source URL', 'source_url', { placeholder: 'https://en.wikipedia.org/...' })
    );

    // Read-only, one writer each. See the dialog's markup comment.
    const point = document.createElement('div');
    point.className = 'wp-field';
    const pl = document.createElement('label');
    pl.className = 'inline';
    pl.textContent = 'Coordinates';
    const located = row.lat != null && row.lon != null;
    const pv = document.createElement('div');
    pv.className = 'wp-readonly-row';
    const pt = document.createElement('span');
    pt.className = 'wp-readonly';
    pt.textContent = located
      ? (Number(row.lat).toFixed(6) + ', ' + Number(row.lon).toFixed(6))
      : (wpCols.latlon ? 'not located' : 'no column');
    pv.appendChild(pt);

    // LOCATE AND MAPS BELONG TO THIS FIELD. They were buttons in the action row
    // among Fill, Duplicate and Delete, which made four different kinds of thing
    // look alike. Both are only ever about the coordinate pair, so they sit on
    // it.
    //
    // LOCATE SURVIVES THE MERGE for one job: RE-locating a row that already has
    // a point. Look up fills BLANKS only and will not move a stored pair, which
    // is correct -- a point somebody dragged into place must not be overwritten
    // by a guess -- so without this there would be no way to say "that pin is
    // wrong, go again" short of clearing the address.
    if (wpCols.latlon) {
      const loc = document.createElement('button');
      loc.type = 'button';
      loc.className = 'wp-inline-act';
      loc.textContent = located ? 'Re-locate' : 'Locate';
      loc.title = located
        ? 'Geocode the address again and REPLACE the stored point.'
        : 'Find this waypoint\'s coordinates from its address and store them.';
      loc.addEventListener('click', locateWaypoint);
      pv.appendChild(loc);
    }
    // A DOOR, so it is drawn as a link rather than a button: it opens a tab and
    // changes nothing here.
    const maps = document.createElement('button');
    maps.type = 'button';
    maps.className = 'wp-inline-act';
    maps.textContent = 'Maps';
    maps.title = 'Open this place in Google Maps';
    maps.addEventListener('click', openWaypointInMaps);
    pv.appendChild(maps);

    point.append(pl, pv);
    box.appendChild(point);

    if (wpEdit.addToPath !== null && !wpEdit.wpid && hostPathOpen()) {
      const add = document.createElement('div');
      add.className = 'wp-field wp-field--full';
      const lab = document.createElement('label');
      lab.style.display = 'flex';
      lab.style.gap = '6px';
      lab.style.alignItems = 'center';
      lab.style.fontSize = '0.85rem';
      const box2 = document.createElement('input');
      box2.type = 'checkbox';
      box2.checked = wpEdit.addToPath;
      box2.addEventListener('change', () => { wpEdit.addToPath = box2.checked; });
      lab.append(box2, document.createTextNode('Put this on the open path when it saves'));
      add.appendChild(lab);
      box.appendChild(add);
    }

    el('wpDupeBtn').hidden = isNew;
    el('wpDeleteBtn').hidden = isNew;

    el('wpSaveBtn').textContent = isNew ? 'Create' : 'Save';
    paintWpErrors();
    const bad = wpErrors(row);
    wpNote(bad.length ? 'Missing: ' + bad.join(', ') + '.' : '');
  }

  function wpBusy(on, text) {
    wpEdit.busy = !!on;
    ['wpSaveBtn', 'wpFillBtn', 'wpFindBtn', 'wpDupeBtn', 'wpDeleteBtn']
      .forEach((id) => { el(id).disabled = !!on; });
    if (text) wpNote(text, 'busy');
  }

  // Editable columns only, and only the ones the database actually has.
  function wpPayload(row) {
    const payload = {};
    WP_FIELDS.forEach((f) => { payload[f] = cleanText(row[f]) || null; });
    // STATE COMES FROM THE CITY. It has no box any more, so a row edited here
    // would otherwise write back whatever it happened to arrive with -- and a
    // row whose city was just corrected would keep the old state.
    // The derived value only overwrites when it resolves: a city TgbGeo cannot
    // parse leaves whatever was already stored alone rather than nulling it.
    const derived = stateFromCity(row.city);
    if (derived) payload.state = derived;
    if (wpCols.source_url) payload.source_url = cleanText(row.source_url) || null;
    if (wpCols.latlon && row.lat != null && row.lon != null) {
      payload.lat = Number(row.lat);
      payload.lon = Number(row.lon);
    }
    return payload;
  }

  // Put a freshly written row back into the library in place, rather than
  // reloading every waypoint to see one change.
  function absorbWaypoint(fresh) {
    if (!fresh) return null;
    const i = host.waypoints().findIndex((w) => String(w.wpid) === String(fresh.wpid));
    if (i > -1) host.waypoints()[i] = fresh;
    else host.waypoints().push(fresh);
    return fresh;
  }

  async function saveWaypoint() {
    const row = wpEdit.row;
    if (!row || wpEdit.busy) return;
    if (!cleanText(row.name) && !cleanText(row.address)) {
      wpNote('A waypoint needs at least a name or an address.', 'error');
      return;
    }
    const isNew = !wpEdit.wpid;
    // The last gate before a duplicate enters the library. Two rows for one
    // place are very hard to spot later - both look correct - and the importers
    // dedupe on name + address, so a near-miss defeats them too.
    if (isNew && window.TgbWaypointGeo) {
      const match = window.TgbWaypointGeo.findSimilar(row, host.waypoints());
      if (match && !window.confirm(
        'This looks like WPID ' + match.row.wpid
        + (cleanText(match.row.name) ? ' (' + match.row.name + ')' : '')
        + ' by ' + match.reason + '.\n\nCreate it anyway?')) return;
    }
    wpBusy(true, isNew ? 'Creating...' : 'Saving...');
    try {
      await ensureFreshSession();
      const res = await fetch(
        restUrl('waypoints', isNew ? {} : { wpid: 'eq.' + wpEdit.wpid }),
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
          body: JSON.stringify(wpPayload(row))
        });
      if (!res.ok) throw new Error(await readError(res));
      const [fresh] = await res.json();
      absorbWaypoint(fresh);
      const wasNew = isNew;
      wpEdit.wpid = String(fresh.wpid);
      wpEdit.row = Object.assign({}, fresh);
      wpEdit.dirty = false;
      wpBusy(false);
      // Creating a waypoint for the open path and then having to find it in
      // the pool to add it is two steps for one intention.
      if (wasNew && wpEdit.addToPath && hostPathOpen()) {
        host.path.add(fresh.wpid);
        setStatus('Created ' + (cleanText(fresh.name) || ('WPID ' + fresh.wpid))
          + ' and put it on the path - press Save to keep the order.', 'success');
      } else {
        setStatus('Saved ' + (cleanText(fresh.name) || ('WPID ' + fresh.wpid)) + '.', 'success');
      }
      renderWaypointForm();
      host.onChanged();
    } catch (err) {
      wpBusy(false);
      wpNote(err.message || 'Could not save this waypoint.', 'error');
    }
  }

  async function deleteWaypointRow() {
    const wpid = wpEdit.wpid;
    if (!wpid || wpEdit.busy) return;
    const name = cleanText(wpEdit.row.name) || ('WPID ' + wpid);
    const onPaths = hostPathHas(wpid) ? ' It is on the open path.' : '';
    if (!window.confirm('Delete ' + name + '?' + onPaths
      + '\n\nThis cannot be undone. Archive instead if you only want it out of the way.')) return;
    wpBusy(true, 'Deleting...');
    try {
      await ensureFreshSession();
      const res = await fetch(restUrl('waypoints', { wpid: 'eq.' + wpid }), {
        method: 'DELETE', headers: authHeaders({ Prefer: 'return=minimal' })
      });
      if (!res.ok) throw new Error(await readError(res));
      host.removeWaypoint(wpid);
      // path_stops cascades on the database side; drop it here too so the
      // open path does not show a stop whose place no longer exists.
      
      wpBusy(false);
      closeWaypointEditor(true);
      host.onChanged();
      setStatus('Deleted ' + name + '.', 'success');
    } catch (err) {
      wpBusy(false);
      wpNote(err.message || 'Could not delete this waypoint.', 'error');
    }
  }

  async function duplicateWaypointRow() {
    if (!wpEdit.wpid || wpEdit.busy) return;
    // A copy is a LOOSE waypoint: it belongs to no path, and it is never born
    const copy = Object.assign({}, wpEdit.row);
    copy.wpid = '';
    copy.name = cleanText(copy.name) ? cleanText(copy.name) + ' (copy)' : '';
    wpEdit.row = copy;
    wpEdit.wpid = '';
    wpEdit.dirty = true;
    wpEdit.addToPath = false;
    renderWaypointForm();
    wpNote('A copy of the original, not saved yet. Press Create.', 'busy');
  }

  // Coordinates only - no fields touched. This is the one the map wants: it
  // is what turns an unplaced row into a pin.
  async function locateWaypoint() {
    const geo = window.TgbWaypointGeo;
    if (!geo || wpEdit.busy) return;
    wpBusy(true, 'Locating... (one request a second, Nominatim\'s rule)');
    try {
      const point = geo.pointFor(wpEdit.row) || await geo.locate(wpEdit.row);
      if (!point) { wpBusy(false); wpNote('Could not locate that address.', 'error'); return; }
      wpEdit.row.lat = geo.round6(point.lat);
      wpEdit.row.lon = geo.round6(point.lon);
      wpEdit.dirty = true;
      wpBusy(false);
      renderWaypointForm();
      wpNote('Located. Save to store the point.', 'busy');
    } catch (err) {
      wpBusy(false);
      wpNote(err.message || 'Locate failed.', 'error');
    }
  }

  // Fill BLANK fields only, from whatever the row already says. Everything
  // typed is kept - see waypoint-geo.js.
  async function fillWaypoint() {
    const geo = window.TgbWaypointGeo;
    if (!geo || wpEdit.busy) return;
    wpBusy(true, 'Filling... this makes several geocoder calls a second apart.');
    try {
      const result = await geo.fill(wpEdit.row, {
        onStage: (stage) => { if (stage === 'zip') wpNote('Chasing the ZIP...', 'busy'); }
      });
      wpBusy(false);
      if (result.complete) { wpNote('Nothing blank to fill.'); return; }
      if (result.error) { wpNote(result.error, 'error'); return; }
      if (!result.filled.length) { wpNote('Found a match, but nothing new to fill.'); return; }
      wpEdit.dirty = true;
      renderWaypointForm();
      wpNote('Filled ' + result.filled.join(', ') + '.'
        + (result.zipApprox ? ' The ZIP is the city-centre one - check it.' : '')
        + ' Review, then Save.', 'busy');
    } catch (err) {
      wpBusy(false);
      wpNote(err.message || 'Lookup failed.', 'error');
    }
  }

  function openWaypointInMaps() {
    const geo = window.TgbWaypointGeo;
    const url = geo && geo.googleMapsUrl(wpEdit.row, {
      lat: Number(wpEdit.row.lat), lon: Number(wpEdit.row.lon)
    });
    if (url) window.open(url, '_blank', 'noopener');
    else wpNote('Nothing to search for yet - add a name or an address.', 'error');
  }

  // --- find a place online --------------------------------------------------
  //
  // Phase two of the merge: what the Waypoints page called Manual + "Find
  // online". The old flow inserted a chosen result straight into the table and
  // then took you to its card to correct it. This one opens the result in the
  // editor as an unsaved DRAFT, because the geocoder is usually nearly right,
  // and nearly right inserted unreviewed is what fills a library with
  // rubbish nobody can tell from real rows afterwards.

  const findState = { busy: false, items: [] };

  function openFindDialog(seed) {
    el('findDlg').classList.add('is-open');
    const box = el('findQuery');
    if (seed !== undefined) box.value = cleanText(seed);
    el('findNote').textContent = '';
    el('findNote').classList.remove('warn');
    renderFindResults();
    box.focus();
    box.select();
  }

  function closeFindDialog() { el('findDlg').classList.remove('is-open'); }

  function findNote(text, kind) {
    const note = el('findNote');
    note.textContent = text || '';
    note.classList.toggle('warn', kind === 'error');
    note.classList.toggle('busy', kind === 'busy');
  }

  async function runFind() {
    const geo = window.TgbWaypointGeo;
    const query = cleanText(el('findQuery').value);
    if (!geo || findState.busy) return;
    if (!query) { findNote('Type something to look for, or press Blank waypoint.', 'error'); return; }
    findState.busy = true;
    el('findGoBtn').disabled = true;
    findNote('Searching OpenStreetMap...', 'busy');
    findState.items = [];
    renderFindResults();
    try {
      const result = await geo.search(query);
      findState.items = result.items;
      // A partial answer is still an answer. Overpass 504s often enough that
      // treating it as fatal would make the button feel broken.
      const partial = result.failed.length
        ? ' (' + result.failed.join(' and ') + ' did not respond - OpenStreetMap\'s free endpoints are often busy; try again in a moment)'
        : '';
      findNote(result.items.length
        ? 'Pick one to open it as a draft. Nothing is saved until you press Create.' + partial
        : 'Nothing found' + (partial || '. For a business, add the city - "Euclid Records New Orleans".'),
        result.items.length ? '' : 'error');
    } catch (err) {
      findNote(err.message || 'Search failed.', 'error');
    } finally {
      findState.busy = false;
      el('findGoBtn').disabled = false;
      renderFindResults();
    }
  }

  function renderFindResults() {
    const geo = window.TgbWaypointGeo;
    const box = el('findList');
    box.innerHTML = '';
    el('findCount').textContent = findState.items.length
      ? findState.items.length + ' found' : '';
    findState.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'find-row';
      const main = document.createElement('div');
      main.className = 'find-row-main';
      const name = document.createElement('div');
      name.className = 'find-row-name';
      name.textContent = item.name;
      const sub = document.createElement('div');
      sub.className = 'find-row-sub';
      sub.textContent = item.sub || '';
      main.append(name, sub);
      // Checked on the NAME only at this stage: a result's address is not
      // known until its draft is built, and building every draft would mean a
      // reverse geocode per result at one a second.
      const dupe = geo && geo.findSimilar({ name: item.name }, host.waypoints());
      if (dupe) {
        row.classList.add('is-dupe');
        const flag = document.createElement('div');
        flag.className = 'find-row-dupe';
        flag.textContent = 'Already in the library as WPID ' + dupe.row.wpid;
        main.appendChild(flag);
      }
      row.append(main, mkBtn('Open', 'Open this as an unsaved draft', () => openDraftFrom(item)));
      box.appendChild(row);
    });
  }

  async function openDraftFrom(item) {
    const geo = window.TgbWaypointGeo;
    if (!geo || findState.busy) return;
    findState.busy = true;
    findNote('Building the draft...', 'busy');
    try {
      const draft = await geo.draftFromResult(item);
      // The path's city is the one you are working in; a geocoder that
      // returns "Miami Beach" for a Miami place would otherwise quietly file
      // the waypoint where the pool cannot see it.
      if (!cleanText(draft.city)) draft.city = pathCity();
      closeFindDialog();
      openWaypointEditor(null);
      Object.assign(wpEdit.row, draft);
      wpEdit.dirty = true;
      renderWaypointForm();
      const match = geo.findSimilar(wpEdit.row, host.waypoints());
      wpNote(match
        ? 'Careful: this looks like WPID ' + match.row.wpid + ' ('
          + (cleanText(match.row.name) || 'unnamed') + ') by ' + match.reason
          + '. Create it anyway only if it is genuinely a different waypoint.'
        : 'Draft from OpenStreetMap - check it, then press Create.',
        match ? 'error' : 'busy');
    } catch (err) {
      findNote(err.message || 'Could not build a draft from that result.', 'error');
    } finally {
      findState.busy = false;
    }
  }

  // ---- mounting ---------------------------------------------------------------
  function mount(opts) {
    if (mounted) return api;
    if (!opts || typeof opts.restUrl !== 'function' || typeof opts.authHeaders !== 'function') {
      throw new Error('TgbWaypointEditor.mount needs restUrl(table, params) and authHeaders(extra).');
    }
    host = applyHostDefaults(opts);

    // FIRST IN <head>, so a host page's own sheet still wins on a tie. The
    // Path Builder styles .dlg itself and must keep doing so.
    var style = document.createElement('style');
    style.id = 'tgb-waypoint-editor-css';
    style.textContent = CSS;
    document.head.insertBefore(style, document.head.firstChild);

    var holder = document.createElement('div');
    holder.innerHTML = MARKUP;
    while (holder.firstChild) document.body.appendChild(holder.firstChild);

    probeWaypointColumns(host.waypoints());
    fillCityList();
    wire();
    mounted = true;
    return api;
  }

  function wire() {
    el('wpCloseBtn').addEventListener('click', function () { closeWaypointEditor(); });
    el('wpSaveBtn').addEventListener('click', saveWaypoint);
    el('wpDeleteBtn').addEventListener('click', deleteWaypointRow);
    el('wpDupeBtn').addEventListener('click', duplicateWaypointRow);
    el('wpFillBtn').addEventListener('click', fillWaypoint);
    // Seeded with the name AND the city: "Freedom Tower" alone matches one in
    // Manhattan, and the geocoder has no idea which town you are working in.
    el('wpFindBtn').addEventListener('click', function () {
      var seed = [cleanText(wpEdit.row && wpEdit.row.name), cleanText(wpEdit.row && wpEdit.row.city)]
        .filter(Boolean).join(' ');
      openFindDialog(seed);
    });
    el('wpDlg').addEventListener('click', function (e) { if (e.target === el('wpDlg') && !wpEdit.busy) closeWaypointEditor(); });

    el('findGoBtn').addEventListener('click', runFind);
    el('findCloseBtn').addEventListener('click', closeFindDialog);
    el('findBlankBtn').addEventListener('click', function () { closeFindDialog(); openWaypointEditor(null); });
    el('findQuery').addEventListener('keydown', function (e) { if (e.key === 'Enter') runFind(); });
    el('findDlg').addEventListener('click', function (e) { if (e.target === el('findDlg') && !findState.busy) closeFindDialog(); });

    // ESCAPE CLOSES THE TOP DIALOG ONLY. Find sits over the editor, so putting
    // a search away must not also discard a half-filled form underneath it.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (el('findDlg').classList.contains('is-open')) { if (!findState.busy) closeFindDialog(); return; }
      if (wpDlgOpen() && !wpEdit.busy) closeWaypointEditor();
    });
  }

  var api = {
    mount: mount,
    open: function (wpid, opts) { return openWaypointEditor(wpid, opts); },
    openFind: function (seed) { return openFindDialog(seed); },
    close: function (force) { return closeWaypointEditor(force); },
    isOpen: wpDlgOpen,
    // Re-probe after a host reloads its rows: which optional columns exist is
    // learned from rows the page actually holds, so a fresh load re-teaches it.
    probe: probeWaypointColumns,
    // The dirty flag, for a host that guards a reload or a page unload.
    isDirty: function () { return !!wpEdit.dirty; }
  };

  window.TgbWaypointEditor = api;
}());
