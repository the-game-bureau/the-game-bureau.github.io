// waypoint-editor.js -- ONE waypoint editor, shared by every room that has one.
//
// window.TgbWaypointEditor
//
// THE ROOM IS CALLED WAYPOINTS AND LIVES AT mc/waypoints/index.html. It was
// the PATH BUILDER at mc/pathbuilder.html until 2026-08-28, which is the name
// most of the comments below were written under; where one says Path Builder
// it means that room, and nothing about this module changed with the rename.
//
// WHY THIS FILE EXISTS. The editor lived inside that room's page and the Waypoint
// Finder had a five-field form of its own, so the same job was done two ways in
// two rooms: WAYPOINTS could geocode, search OpenStreetMap, run a Plus
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
//     path: {                                     optional, WAYPOINTS ROOM ONLY
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
  // Each of these lived in the WAYPOINTS room's page and is pulled in here so the module
  // stands alone. They are small and have no page state in them.

  // COLUMN PROBING, NOT ASSUMING. Naming a column PostgREST does not have 400s
  // the whole request, so the editor learns which optional columns exist by
  // looking at rows it has actually been given, and a database that has not run
  // a migration still works: the field is simply hidden.
  var wpCols = { source_url: false, latlon: false, walk_order: false, partner: false };

  // THE COLUMNS wpPayload ALWAYS WRITES.
  //
  // THIS LIVED IN THE WAYPOINTS ROOM'S PAGE UNTIL 2026-08-20 AND THE MODULE
  // READ IT AS A GLOBAL. It worked, because a top-level `const` in a classic
  // script is visible to every other script on the page, and that room was
  // the only host. The moment a SECOND room mounted this editor, wpPayload
  // threw `WP_FIELDS is not defined` on the first write -- which surfaced as
  // Fill quietly failing on mc/partners.html, with the ReferenceError caught
  // and reported as though the geocoder had refused.
  //
  // A module that reads a host's variable is not a module. The header of this
  // file says it brings its own markup, CSS and datalist so a host carries no
  // copy to fall out of step; this was the one thing that had been left
  // behind. Nothing outside this file may declare it.
  var WP_FIELDS = ['name', 'city', 'state', 'zip', 'address', 'description'];

  // THE PARTNER COLUMNS, written on every save alongside the place's own. They
  // are listed separately because they are handled differently: `partner_teams`
  // is an ARRAY and the two dates are DATES, so a blank has to become null
  // rather than the empty string WP_FIELDS uses, and Postgres refuses '' for
  // both types.
  var WP_PARTNER_TEXT = [
    'partner_status', 'partner_kind', 'partner_fandom',
    'partner_contact_name', 'partner_contact_role', 'partner_contact_email',
    'partner_contact_phone', 'partner_contact_url', 'partner_contact_source',
    'partner_why', 'partner_notes'
  ];
  var WP_PARTNER_DATES = ['partner_event_date', 'partner_game_date'];

  // A WAYPOINT'S NAME, AS A LINK TO ITS SOURCE.
  //
  // `source_url` is where a claim about a place came from, and it is the one
  // field on a waypoint nobody could check without leaving the room. It was
  // stored, required by three prompts, filled by Fill and read by nothing: the
  // rooms printed the name as dead text and the URL not at all.
  //
  // ONE HELPER RATHER THAN FOUR COPIES, because it appears in the WAYPOINTS room's
  // library rows, its path rows and its map popup, and on the Partners card, and
  // four hand-written anchors is how three of them end up missing `rel=noopener`
  // and the fourth swallows a drag.
  //
  // IT LIVES HERE because this is the shared waypoint module and every room that
  // renders a waypoint already loads it. It is not part of the editor, and it is
  // the first thing in this file that is not.
  //
  // THREE THINGS IT MUST DO, each of them a bug if left out:
  //   * draggable = false. The WAYPOINTS room's rows are dragged BY THE WHOLE ROW,
  //     and a browser starts its own link-drag from an anchor inside one, which
  //     hijacks the gesture the room is built on.
  //   * stopPropagation on click. A row click focuses or selects; following a
  //     link should do neither.
  //   * NO LINK WITHOUT A PARSEABLE http(s) URL. A source that will not parse is
  //     a source nobody can check, and an anchor that goes nowhere is worse than
  //     plain text because it invites the click.
  function waypointNameEl(row, fallback) {
    var name = cleanText(row && row.name)
      || cleanText(fallback)
      || ('WPID ' + ((row && row.wpid) || '?'));
    var raw = cleanText(row && row.source_url);
    var url = null;
    if (raw) {
      try {
        var u = new URL(raw);
        if (u.protocol === 'http:' || u.protocol === 'https:') url = u.href;
      } catch (err) {
        url = null;
      }
    }

    if (!url) {
      var span = document.createElement('span');
      span.textContent = name;
      // Say WHY it is not a link, on the name itself, because an unlinked name
      // beside a linked one otherwise reads as a rendering fault.
      span.title = raw
        ? 'Source is not a web address, so there is nothing to open: ' + raw
        : 'No source recorded for this place.';
      return span;
    }

    var a = document.createElement('a');
    a.className = 'wp-name-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.draggable = false;
    a.textContent = name;
    a.title = 'Open the source for this place in a new tab: ' + url;
    a.addEventListener('click', function (e) { e.stopPropagation(); });
    // NO dragstart HANDLER, AND THAT IS THE POINT OF draggable = false ABOVE.
    // preventDefault here would cancel the drag ENTIRELY, not just the link's:
    // dragstart bubbles, and the WAYPOINTS room's rows are dragged BY THE WHOLE
    // ROW, so killing it on the name would make the middle of every row dead to
    // the one gesture the room is built on. With the anchor not a drag source,
    // the browser walks up to the row and drags that instead, which is exactly
    // what is wanted.
    return a;
  }

  function probeWaypointColumns(rows) {
    var has = function (key) {
      return (Array.isArray(rows) ? rows : []).some(function (r) {
        return r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, key);
      });
    };
    wpCols.source_url = has('source_url');
    wpCols.partner = has('partner_status');
    wpCols.latlon = has('lat');
    wpCols.walk_order = has('walk_order');
  }

  function wpById(id) {
    return host.waypoints().find(function (w) { return String(w.wpid) === String(id); });
  }

  // The city a NEW waypoint is born in. The WAYPOINTS room answers with the open
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
    /* THE NAME LINK. It inherits the name's colour and weight rather than
       going browser-blue and underlined: it is still the row's title, and a
       list of forty underlined blue names reads as a link farm. The dotted
       underline appears on hover, which is the room's own idiom for "this
       does something". A name with no source is a plain span and looks
       identical until you point at it, which is correct: whether we recorded
       a source is not a fact about the PLACE. */
    'a.wp-name-link { color: inherit; font: inherit; text-decoration: none; }',
    'a.wp-name-link:hover { text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; }',
    'a.wp-name-link:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; }',
    '.wp-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }',
    '.wp-form .wp-field { display: grid; gap: 4px; min-width: 0; }',
    '.wp-form .wp-field--full { grid-column: 1 / -1; }',
    /* The box takes the slack so the button keeps its width. align-items:start
       keeps them level when the field carries a hint underneath. */
    '.wp-form .wp-field-line { display: flex; align-items: stretch; gap: 6px; min-width: 0; }',
    '.wp-form .wp-field-line input { flex: 1 1 auto; min-width: 0; }',
    /* Matches the box it sits against rather than the buttons at the foot: a
       control on a field should look like part of the field. */
    /* Matches the height of the box it sits against, so the two read as one
       control rather than a button parked beside a field. */
    '.wp-form .wp-field-act { flex: 0 0 auto; align-self: stretch; padding: 0 11px; }',
    '.wp-form label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }',
    '.wp-form input, .wp-form textarea { width: 100%; font: inherit; font-size: 0.9rem; color: var(--ink); background: #fff; border: 1px solid var(--line); border-radius: 3px; padding: 6px 8px; }',
    /* LIGHTER THAN THE TEXT, and clearly so. A placeholder inherits near enough
       the input's own colour by default in some engines, which makes an empty
       box look like a filled one at a glance -- the exact misreading that made
       the address example look like a stored value. */
    '.wp-form input::placeholder, .wp-form textarea::placeholder { color: rgba(var(--bic-blue-rgb), 0.38); opacity: 1; }',
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
       already styles .dlg (the WAYPOINTS room does) overrides these from its own
       sheet, which loads later. */
    '.dlg { position: fixed; inset: 0; z-index: 1100; display: none; place-items: center; padding: 24px; background: rgba(2, 6, 23, 0.55); }',
    '.dlg.is-open { display: grid; }',
    '.dlg-panel { width: min(100%, 460px); display: grid; gap: 14px; padding: 22px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-base, #fff); box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3); max-height: calc(100vh - 48px); overflow: auto; }',
    '.dlg-panel--wide { width: min(100%, 760px); }',
    '.dlg-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }',
    /* The id reads as a label on the button rather than a stray number, so they
       share a group and the button leads: it is the thing you press. */
    '.dlg-head-tools { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }',
    '.dlg-title { margin: 0; font-size: 1.05rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }',
    '.dlg-id { font-family: "IBM Plex Mono", monospace; font-size: 0.76rem; color: var(--muted); }',
    '.dlg-note { margin: 0; font-size: 0.78rem; color: var(--muted); }',
    '.dlg-note.error { color: var(--warn); }',
    '.dlg-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }',
    /* A BAND, not a row. The gap INSIDE a group is tighter than the gap between
       groups, which is the whole mechanism: two buttons that belong together
       read as a pair without a rule, a box or a label. */
    '.dlg-spacer { flex: 1 1 auto; }',
    /* THE EDITOR'S BUTTONS ARE THE EDITOR'S, and they are ID-SCOPED so they
       win. Every room defines .btn its own way: WAYPOINTS uppercases at
       3px radius, the Waypoint Finder does not at 6px, so the same dialog was
       reading as two different dialogs depending which door you came through,
       which is the whole thing this module exists to stop. A page's own sheet
       loads AFTER this one, so matching a bare .btn would lose on source order;
       `#wpDlg .btn` carries an id and beats a class outright whatever the
       order. The rest of each room's buttons are untouched. */
    '#wpDlg .btn, #findDlg .btn { appearance: none; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 3px; background: var(--paper, #fff); color: var(--ink); font: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; padding: 5px 9px; cursor: pointer; text-decoration: none; }',
    /* [hidden] HAS TO BE RE-ASSERTED, and this is the third time this project
       has been bitten by it. `display: inline-flex` above is an author rule and
       `[hidden]` is only a UA-sheet `display: none`, so the author rule wins and
       `btn.hidden = true` silently does nothing. It showed up as DELETE offered
       on a waypoint that has not been created yet. Same trap the public
       soundtracks deck hit with .sx-modal--inline and the admin dialogs hit with
       section.tool-modal-panel:not([hidden]). */
    '#wpDlg .btn[hidden], #findDlg .btn[hidden] { display: none; }',
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
    // FILL LIVES ON THE HEAD, beside the WPID: "fill this form in", said at the
    // top of the form it fills. See the foot for why it is not down there.
    '      <span class="dlg-head-tools">',
    '        <button class="btn small" id="wpFillBtn" type="button" title="Geocode from what is set, then fill every blank field: ZIP, coordinates, description, source url, whatever is missing">Fill</button>',
    '        <span class="dlg-id" id="wpDlgId"></span>',
    '      </span>',
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
    // THE MIDDLE IS HELP: one that fills the form in front of you and one that
    // copies it. Neither ends the dialog.
    //
    // FIND ONLINE'S BUTTON WAS DELETED (2026-08-18). The dialog behind it is
    // still here and still works, reachable as TgbWaypointEditor.openFind(seed):
    // it is the only thing in this project that can pull a place out of
    // OpenStreetMap by name, and the search half of waypoint-geo.js exists for
    // it. Nothing calls it today. Either give it a door somewhere or delete
    // openFindDialog, runFind, renderFindResults, openDraftFrom, #findDlg, the
    // .find-* CSS and that half of waypoint-geo.js together.
    //
    // THE RIGHT IS HOW YOU LEAVE. Close discards, Save commits, and Save is the
    // only filled button in the room.
    //
    // SAVE FIRST, THEN CLOSE. The opposite of the usual, and asked for: SAVE
    // stays the last thing before the panel's right edge nowhere in this file,
    // so if that reads wrong later, THIS is the line to change back.
    '      <button class="btn small warn" id="wpDeleteBtn" type="button" title="Remove this row for good. There is no undo.">Delete</button>',
    '      <span class="dlg-spacer"></span>',
    // THREE BUTTONS OF ONE KIND. Delete destroys the record, Save commits it,
    // Close discards: every one of them ENDS this dialog and you press each at
    // most once a visit.
    //
    // FILL IS NOT ONE OF THOSE and used to sit here anyway, which is why it got
    // moved three times in an afternoon before it went up to the form. It is a
    // tool you press repeatedly WHILE editing and it acts on the form rather
    // than on the record, which makes it the same kind of thing as Open beside
    // the Source box. A row of endings was never going to hold it.
    //
    // DUPLICATE WENT (2026-08-18), and duplicateWaypointRow with it.
    '      <button class="btn small primary" id="wpSaveBtn" type="button">Save</button>',
    '      <button class="btn small" id="wpCloseBtn" type="button">Close</button>',
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

  // ── THE PARTNER BAND ──────────────────────────────────────────────────────
  //
  // A PARTNER IS A WAYPOINT, so it is edited in the waypoint editor. There was a
  // whole room for this (mc/partners.html) and it is gone: once the columns
  // moved onto public.waypoints, that page was a second list of the same rows
  // with a second set of boxes writing the same table, reachable from a second
  // door. Everything it did is here and in the WAYPOINTS room's library filter.
  //
  // COLLAPSED UNTIL IT APPLIES. 475 of 480 waypoints are not partners, and a
  // dozen empty contact boxes under every museum and statue would make the
  // common case worse to serve the rare one. The band is a checkbox that opens
  // the rest, and it opens itself for a row that already carries a status.
  //
  // TURNING IT OFF CLEARS THE STATUS, which is what "not a partner" means: the
  // column being null IS the flag. The other columns are left alone on purpose,
  // so ticking the box again brings back the contact details somebody typed
  // rather than making them find them a second time.
  var PARTNER_STATUSES = ['candidate', 'contacted', 'approved', 'declined'];
  var PARTNER_STATUS_LABEL = {
    candidate: 'Candidate, nobody has called yet',
    contacted: 'Contacted, waiting to hear',
    approved: 'Approved, they will host',
    declined: 'Declined'
  };
  var PARTNER_KINDS = [
    { value: 'game_end', label: 'Game end' },
    { value: 'game_start', label: 'Game start' },
    { value: 'watch_party', label: 'Watch party' }
  ];

  // A READ-ONLY VALUE. Provenance and trigger-written stamps: things the row
  // knows about itself that nobody should type over. Drawn in the form rather
  // than left off it, because "what wrote this and when" is the first question
  // asked of a row that looks wrong, and the answer was previously nowhere.
  function wpReadonly(label, value, hint) {
    var wrap = document.createElement('div');
    wrap.className = 'wp-field';
    var lab = document.createElement('label');
    lab.className = 'inline';
    lab.textContent = label;
    var v = document.createElement('div');
    v.className = 'wp-readonly';
    v.textContent = cleanText(value) || 'not set';
    wrap.append(lab, v);
    if (hint) {
      var h = document.createElement('p');
      h.className = 'wp-hint';
      h.textContent = hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  // A NUMBER FIELD. Blank is a real value and becomes null, which is what
  // "unsequenced" means for walk_order.
  function wpNumber(label, key, opts) {
    var o = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'wp-field' + (o.full ? ' wp-field--full' : '');
    var lab = document.createElement('label');
    lab.className = 'inline';
    lab.textContent = label;
    var input = document.createElement('input');
    input.type = 'number';
    if (o.step) input.step = o.step;
    if (o.placeholder) input.placeholder = o.placeholder;
    input.value = wpEdit.row[key] == null ? '' : String(wpEdit.row[key]);
    input.addEventListener('input', function () {
      wpEdit.row[key] = input.value === '' ? null : input.value;
      wpEdit.dirty = true;
      paintWpErrors();
    });
    wrap.append(lab, input);
    if (o.hint) {
      var h = document.createElement('p');
      h.className = 'wp-hint';
      h.textContent = o.hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  // THE STORED POINT, EDITABLE AS A PAIR.
  //
  // It was a read-only reading for months, on the reasoning that Fill writes it
  // and the map moves it, so there was nothing left for a box to do. That holds
  // right up until the two ways of setting it both fail: a place Nominatim
  // cannot find, whose pin you cannot drag because there is no pin to drag. Then
  // a coordinate copied off a map is the only way in, and there was none.
  //
  // BOTH OR NEITHER, ENFORCED HERE AND AGAIN IN wpPayload. A lat with no lon is
  // not half a point, it is no point, and a row carrying one of the two would
  // read as located everywhere the map looks at it.
  function wpPointFields(box, row) {
    var wrap = document.createElement('div');
    wrap.className = 'wp-field wp-field--full';
    var lab = document.createElement('label');
    lab.className = 'inline';
    lab.textContent = 'Coordinates';
    var line = document.createElement('div');
    line.className = 'wp-field-line';

    var lat = document.createElement('input');
    lat.type = 'text';
    lat.placeholder = 'latitude';
    lat.value = row.lat == null ? '' : String(row.lat);
    var lon = document.createElement('input');
    lon.type = 'text';
    lon.placeholder = 'longitude';
    lon.value = row.lon == null ? '' : String(row.lon);

    function commit() {
      var a = cleanText(lat.value);
      var b = cleanText(lon.value);
      wpEdit.row.lat = a === '' ? null : a;
      wpEdit.row.lon = b === '' ? null : b;
      wpEdit.dirty = true;
      paintWpErrors();
    }
    lat.addEventListener('input', commit);
    lon.addEventListener('input', commit);

    line.append(lat, lon);
    wrap.append(lab, line);
    var hint = document.createElement('p');
    hint.className = 'wp-hint';
    hint.textContent = wpCols.latlon
      ? 'Both or neither. Fill writes these from the address and will not overwrite a point that is already there; the map can move it by dragging its pin. Type them only when neither of those can.'
      : 'This database has no lat/lon columns.';
    wrap.appendChild(hint);
    box.appendChild(wrap);
  }

  function wpSelect(label, key, options, opts) {
    var o = opts || {};
    var wrap = document.createElement('div');
    wrap.className = 'wp-field' + (o.full ? ' wp-field--full' : '');
    var lab = document.createElement('label');
    lab.className = 'inline';
    lab.textContent = label;
    var sel = document.createElement('select');
    options.forEach(function (opt) {
      var el2 = document.createElement('option');
      el2.value = opt.value;
      el2.textContent = opt.label;
      if (String(cleanText(wpEdit.row[key])) === String(opt.value)) el2.selected = true;
      sel.appendChild(el2);
    });
    sel.addEventListener('change', function () {
      wpEdit.row[key] = sel.value;
      wpEdit.dirty = true;
      if (o.rerender) renderWpForm();
    });
    wrap.append(lab, sel);
    if (o.hint) {
      var h = document.createElement('p');
      h.className = 'wp-hint';
      h.textContent = o.hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  function renderPartnerBand(box) {
    // NOT OFFERED AGAINST A DATABASE THAT CANNOT STORE IT. A tick box that
    // silently fails to save is worse than no tick box.
    if (!wpCols.partner) return;
    var on = !!cleanText(wpEdit.row.partner_status);

    var head = document.createElement('div');
    head.className = 'wp-field wp-field--full wp-partner-head';
    var toggle = document.createElement('label');
    toggle.className = 'inline wp-partner-toggle';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = on;
    var cbText = document.createElement('span');
    cbText.textContent = 'This place is a PARTNER: somewhere a game can end';
    toggle.append(cb, cbText);
    head.appendChild(toggle);
    var hint = document.createElement('p');
    hint.className = 'wp-hint';
    hint.textContent = on
      ? 'Bars, breweries and rooms that will host visiting fans. Unticking this stops it being a partner and keeps everything you typed.'
      : 'Tick to record contacts and a decision for this place.';
    head.appendChild(hint);
    box.appendChild(head);

    cb.addEventListener('change', function () {
      // The status IS the flag, so this is the only column the toggle writes.
      wpEdit.row.partner_status = cb.checked ? 'candidate' : null;
      if (cb.checked && !cleanText(wpEdit.row.partner_kind)) {
        wpEdit.row.partner_kind = 'game_end';
      }
      wpEdit.dirty = true;
      renderWpForm();
    });

    if (!on) return;

    box.append(
      wpSelect('Status', 'partner_status', PARTNER_STATUSES.map(function (v) {
        return { value: v, label: PARTNER_STATUS_LABEL[v] };
      }), {
        hint: 'Approved is the one that counts: it is what tells the routine this city is sorted.'
      }),
      wpSelect('What for', 'partner_kind', PARTNER_KINDS, {}),
      wpField('Contact name', 'partner_contact_name', {
        placeholder: 'who to ask for',
        hint: 'Blank is better than a guess.' }),
      wpField('Role', 'partner_contact_role', { placeholder: 'manager, events' }),
      wpField('Email', 'partner_contact_email', { placeholder: 'none found' }),
      wpField('Phone', 'partner_contact_phone', { placeholder: 'none found' }),
      wpField('Their website', 'partner_contact_url', { placeholder: 'https://' }),
      wpField('Where the contact came from', 'partner_contact_source', {
        placeholder: 'the page you read it on',
        hint: 'What makes the details checkable in three months.' }),
      wpField('Visiting fandom', 'partner_fandom', {
        placeholder: 'e.g. Packers',
        hint: 'The one anchor event that made us look here.' }),
      wpField('Teams it could take', 'partner_teams', {
        full: true,
        placeholder: 'Packers, Bears - leave empty for a room that takes anybody',
        hint: 'Comma separated. EMPTY IS A REAL ANSWER and the strongest one: a general room covers its whole city.' }),
      wpField('Anchor event date', 'partner_event_date', { placeholder: 'YYYY-MM-DD' }),
      wpField('Our game date', 'partner_game_date', {
        placeholder: 'YYYY-MM-DD',
        hint: 'The day before the anchor event.' }),
      wpField('Why this room', 'partner_why', { full: true, multiline: true,
        placeholder: 'what makes it suit away fans' }),
      wpField('Notes from the call', 'partner_notes', { full: true, multiline: true,
        placeholder: 'what they said when you rang' })
    );
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
    // AN ACTION ON THE FIELD, sat beside the box rather than in the button row
    // at the foot: it is about this one value, and the row at the foot is about
    // the whole waypoint. The input and the button share a line, the input
    // taking the slack, so the button stays the same width whatever the box is.
    if (options.action) {
      const line = document.createElement('div');
      line.className = 'wp-field-line';
      const act = document.createElement('button');
      act.type = 'button';
      // NOT .ghost. The borderless treatment is right in the action row, where
      // the buttons sit among other buttons and the quiet ones read as quiet;
      // beside a text box it read as a stray word floating between two fields.
      // A control next to an input has to look like a control.
      act.className = 'btn small wp-field-act';
      act.textContent = options.action.label;
      act.title = options.action.title || '';
      act.addEventListener('click', () => options.action.run(input.value));
      // Nothing to open until there is something in the box. Repainted on every
      // keystroke, so it comes alive as you paste a url in.
      const sync = () => {
        const ok = options.action.enabled ? options.action.enabled(input.value) : !!cleanText(input.value);
        act.disabled = !ok;
      };
      input.addEventListener('input', sync);
      sync();
      line.append(input, act);
      wrap.append(lab, line);
    } else {
      wrap.append(lab, input);
    }
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
        // A PLAINLY FAKE ADDRESS. It was "200 E Colfax Ave", which is the real
        // Colorado State Capitol and is a real row in this library, so the hint
        // read as a value somebody had typed rather than as an example of the
        // shape wanted.
        placeholder: '123 Main St',
        hint: 'Street only - city, state and ZIP have their own fields. A Plus Code is allowed where there is no street.' }),
      wpField('City', 'city', { list: 'pathCityList' }),
      // THE STATE BOX IS BACK (2026-08-20), and the rule that removed it moved
      // rather than being dropped. It was taken off because a field that can
      // only be filled in one correct way is a field that can be got wrong:
      // Nominatim answers "Florida" where all 480 stored rows say "FL", so the
      // city derived it and the box was the way to break it.
      //
      // WHAT CHANGED IS WHERE THE DERIVATION APPLIES. It used to overwrite
      // whatever was typed whenever the city resolved, which would make this box
      // a control that silently ignores you. It now fills a BLANK only, and the
      // action re-derives on demand. So the common case still costs nothing, and
      // the rare correct answer the city cannot produce is finally typeable.
      //
      // THE COST, and it is the reason it was removed: change the city and the
      // old state stays. That is now VISIBLE, in a box next to the city, rather
      // than silently stored, and one press of From city fixes it.
      wpField('State', 'state', {
        placeholder: 'FL',
        hint: 'Two-letter code for US places, otherwise the country. Filled from the city when blank.',
        action: {
          label: 'From city',
          title: 'Derive the state from the city, replacing what is here',
          enabled: () => !!cleanText(wpEdit.row.city),
          run: () => {
            const derived = stateFromCity(wpEdit.row.city);
            if (!derived) { wpNote('That city does not resolve to a state.', 'error'); return; }
            wpEdit.row.state = derived;
            wpEdit.dirty = true;
            renderWpForm();
          }
        }
      }),
      // NO STATE BOX. The city carries it: public.cities holds the canonical
      // string, TgbGeo parses "Denver, Colorado" into a state, and stateFromCity
      // below writes the two-letter CODE the other 280 rows use. A field that
      // can only be filled in one correct way is a field that can be got
      // wrong, and this one was: Nominatim answers "Florida" where every
      // stored row says "FL".
      // The COLUMN is untouched and still written on save.
      wpField('ZIP', 'zip'),
      // "SOURCE", not "Source URL". The box holds a url and looks like one, so
      // the label was naming the format rather than the thing: what it is FOR
      // is the place the claim came from.
      wpField('Source', 'source_url', {
        placeholder: 'https://en.wikipedia.org/...',
        action: {
          label: 'Open',
          title: 'Open the source in a new tab',
          // A url, not any old text. A source that will not parse is a source
          // nobody can check, and opening it would put the browser somewhere
          // strange rather than saying so.
          enabled: (v) => /^https?:\/\/\S+$/i.test(cleanText(v)),
          run: (v) => {
            const url = cleanText(v);
            if (url) window.open(url, '_blank', 'noopener');
          }
        }
      })
    );

    renderPartnerBand(box);

    wpPointFields(box, row);

    // WALK ORDER IS A PER-CITY HINT AND IS NOT A PATH POSITION. It predates
    // paths entirely: a path's order is `path_stops.ord`, rewritten by RECALC
    // and by dragging, and nothing may read a walk out of this column. It is
    // here because it is a real column somebody may need to correct, with the
    // distinction on its hint so nobody mistakes it for the other thing.
    box.appendChild(wpNumber('Walk order', 'walk_order', {
      placeholder: 'unsequenced',
      hint: 'Advisory order within this CITY. NOT a path position: the order of a path is set by dragging its rows.'
    }));

    // PROVENANCE AND STAMPS, read-only. What wrote this row and when is the
    // first question asked of one that looks wrong, and the answer used to be
    // nowhere on this form. Typing over `ai_model` would destroy the only trace
    // of which model produced a bad address.
    box.appendChild(wpReadonly('Written by', row.ai_model,
      'The model or importer that created this row. Provenance, so it is not editable.'));
    box.appendChild(wpReadonly('Created', row.created_at
      ? String(row.created_at).slice(0, 10) : '',
      'Null on a row that predates the column, which is honest rather than a made-up date.'));
    if (wpCols.partner && cleanText(row.partner_status)) {
      box.appendChild(wpReadonly('Contacted', row.partner_contacted_at
        ? String(row.partner_contacted_at).slice(0, 10) : '',
        'Stamped by the database from the status, so the two cannot disagree.'));
      box.appendChild(wpReadonly('Decided', row.partner_decided_at
        ? String(row.partner_decided_at).slice(0, 10) : ''));
    }

    // THE THREE tour_* COLUMNS ARE DELIBERATELY ABSENT. `tour_id`, `tour_title`
    // and `tour_shape` are RETIRED IN PLACE: nothing has read them since paths
    // became their own tables on 2026-08-08, and they are kept only so a stale
    // deploy does not 400. A box for a dead column is an invitation to write one.

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

    el('wpDeleteBtn').hidden = isNew;

    el('wpSaveBtn').textContent = isNew ? 'Create' : 'Save';
    paintWpErrors();
    const bad = wpErrors(row);
    wpNote(bad.length ? 'Missing: ' + bad.join(', ') + '.' : '');
  }

  function wpBusy(on, text) {
    wpEdit.busy = !!on;
    ['wpSaveBtn', 'wpFillBtn', 'wpDeleteBtn']
      .forEach((id) => { el(id).disabled = !!on; });
    if (text) wpNote(text, 'busy');
  }

  // Editable columns only, and only the ones the database actually has.
  function wpPayload(row) {
    const payload = {};
    WP_FIELDS.forEach((f) => { payload[f] = cleanText(row[f]) || null; });
    // STATE IS DERIVED ONLY INTO A BLANK, since 2026-08-20. It used to overwrite
    // whatever was stored whenever the city resolved, which was right while
    // there was no State box and is wrong now there is one: a control that
    // silently discards what you type is worse than no control. The box carries
    // a From city action for the case the derivation is wanted.
    if (!cleanText(payload.state)) {
      const derived = stateFromCity(row.city);
      if (derived) payload.state = derived;
    }

    // WALK ORDER, and a blank is null rather than 0: unsequenced is not
    // position zero, and 1..n is what the column holds.
    if (wpCols.walk_order) {
      const wo = parseInt(cleanText(row.walk_order), 10);
      payload.walk_order = isFinite(wo) && wo > 0 ? wo : null;
    }
    if (wpCols.source_url) payload.source_url = cleanText(row.source_url) || null;

    // THE PARTNER COLUMNS, and only when the database has them. Probed like
    // every other optional column, so a deploy that has not run 2026082003 still
    // saves a waypoint instead of 400ing on a column PostgREST has never heard
    // of. `partner_status` is the one the probe asks about, because it is the
    // flag the whole set hangs off.
    if (wpCols.partner) {
      WP_PARTNER_TEXT.forEach(function (f) { payload[f] = cleanText(row[f]) || null; });
      // A DATE CANNOT BE ''. Postgres rejects the empty string for date and for
      // text[], which is why these two groups are not in WP_FIELDS: that loop
      // writes '' || null, and '' is what an untouched box holds.
      WP_PARTNER_DATES.forEach(function (f) {
        var v = cleanText(row[f]);
        payload[f] = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      });
      // COMMA SEPARATED IN THE BOX, ARRAY IN THE COLUMN. Empty means a general
      // room that takes anybody, which is a real answer and is stored as null,
      // because tgb_partner_coverage reads a null list as "covers the city".
      var teams = row.partner_teams;
      if (Array.isArray(teams)) {
        teams = teams.map(function (t) { return cleanText(t); }).filter(Boolean);
      } else {
        teams = cleanText(teams).split(',').map(function (t) { return cleanText(t); }).filter(Boolean);
      }
      payload.partner_teams = teams.length ? teams : null;
      // NOT A PARTNER MEANS THE WHOLE SET GOES. Leaving a phone number on a row
      // whose status is null would put a contact on a place nothing calls a
      // partner, which is the state nobody could interpret later.
      if (!payload.partner_status) {
        WP_PARTNER_TEXT.forEach(function (f) { payload[f] = null; });
        WP_PARTNER_DATES.forEach(function (f) { payload[f] = null; });
        payload.partner_teams = null;
      }
    }
    // BOTH OR NEITHER, and CLEARING IS NOW POSSIBLE. This used to write the pair
    // only when both were present, so emptying the boxes left the stored point
    // untouched: a coordinate you deleted came straight back on reload. Now a
    // pair that is blank, unparseable, out of range or 0,0 writes NULL, which is
    // the honest answer and the one the map already draws as "not located yet".
    if (wpCols.latlon) {
      const la = Number(cleanText(row.lat));
      const lo = Number(cleanText(row.lon));
      const ok = cleanText(row.lat) !== '' && cleanText(row.lon) !== ''
        && isFinite(la) && isFinite(lo)
        && la >= -90 && la <= 90 && lo >= -180 && lo <= 180
        && !(la === 0 && lo === 0);
      payload.lat = ok ? la : null;
      payload.lon = ok ? lo : null;
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

  // locateWaypoint IS GONE (2026-08-18). It filled the coordinate pair and
  // nothing else, behind a Locate link on the Coordinates field. Fill does the
  // whole job now, the point included, so a second button for one field of the
  // several it fills was a choice nobody needed to make.
  // geo.locate() itself is untouched and still exported; fill() calls it.

  // FILL EVERY BLANK FIELD from whatever the row already says: ZIP,
  // coordinates, description, source url, the lot. Everything already typed is
  // kept - see waypoint-geo.js, which does the work.
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
    // The WAYPOINTS room styles .dlg itself and must keep doing so.
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
    el('wpFillBtn').addEventListener('click', fillWaypoint);
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

  // WHAT A ROW IS STILL MISSING. Exported because a bulk run has to ask the
  // question the same way the tag on a library row asks it: two answers to
  // "is this row complete" is how a list and a counter start disagreeing.
  //
  // `description` is not on this list, and that is not an oversight: every row
  // has one, and fill() writes one from Wikipedia or from the address, so a
  // "missing description" is a state the library does not actually reach.
  function missingFields(row) {
    var out = [];
    if (!cleanText(row && row.address)) out.push('address');
    if (wpCols.latlon && !hasStoredPoint(row)) out.push('coordinates');
    if (!cleanText(row && row.zip)) out.push('zip');
    if (wpCols.source_url && !cleanText(row && row.source_url)) out.push('source');
    return out;
  }

  // The same null-is-not-zero trap waypoint-geo.js documents: Number(null) is 0
  // and isFinite(0) is true, so the short test calls an unlocated row located.
  function hasStoredPoint(row) {
    if (!row) return false;
    if (row.lat === null || row.lat === undefined || row.lat === '') return false;
    if (row.lon === null || row.lon === undefined || row.lon === '') return false;
    var la = Number(row.lat), lo = Number(row.lon);
    return isFinite(la) && isFinite(lo) && !(la === 0 && lo === 0);
  }

  // FILL ONE ROW AND WRITE IT, with no dialog involved. This is what a bulk run
  // calls; the Fill button calls fillWaypoint(), which does the same work
  // against the open form and leaves the writing to Save.
  //
  // IT GOES THROUGH wpPayload, deliberately. A second idea of what to write is
  // how a bulk job and a hand edit start producing different rows, and this
  // project has paid for that twice already with duplicated helpers.
  //
  // NOTHING CHANGED MEANS NOTHING WRITTEN. A row fill() could not improve is not
  // PATCHed at all, so a run over hundreds of rows touches only the ones it
  // actually helped.
  async function fillAndSaveRow(row) {
    var geo = window.TgbWaypointGeo;
    if (!geo) return { filled: [], error: 'The geocoder module is not loaded.' };
    var working = Object.assign({}, row);
    var result;
    try {
      result = await geo.fill(working, {});
    } catch (err) {
      return { filled: [], error: err.message || String(err) };
    }
    if (result.error) return { filled: [], error: result.error };
    if (!result.filled || !result.filled.length) return { filled: [], error: '' };

    try {
      await ensureFreshSession();
      var res = await fetch(restUrl('waypoints', { wpid: 'eq.' + row.wpid }), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(wpPayload(working))
      });
      if (!res.ok) return { filled: [], error: await readError(res) };
      var back = await res.json();
      // PostgREST answers 200 with an EMPTY ARRAY when RLS refuses a write: no
      // error, no rows, nothing changed. Without this a bulk run reports
      // hundreds of successes and writes none of them.
      if (!Array.isArray(back) || !back.length) {
        return { filled: [], error: 'The database refused that write. Are you still signed in?' };
      }
      absorbWaypoint(back[0]);
      return { filled: result.filled, error: '', row: back[0] };
    } catch (err) {
      return { filled: [], error: err.message || String(err) };
    }
  }

  var api = {
    mount: mount,
    missingFields: missingFields,
    fillAndSaveRow: fillAndSaveRow,
    open: function (wpid, opts) { return openWaypointEditor(wpid, opts); },
    openFind: function (seed) { return openFindDialog(seed); },
    close: function (force) { return closeWaypointEditor(force); },
    isOpen: wpDlgOpen,
    // Re-probe after a host reloads its rows: which optional columns exist is
    // learned from rows the page actually holds, so a fresh load re-teaches it.
    probe: probeWaypointColumns,
    waypointNameEl: waypointNameEl,
    // The dirty flag, for a host that guards a reload or a page unload.
    isDirty: function () { return !!wpEdit.dirty; }
  };

  window.TgbWaypointEditor = api;
}());
