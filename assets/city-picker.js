/* city-picker.js — every city control in the product, from one table.
 *
 * public.cities is the site's single city catalog. This module loads it once
 * per page, fills any <select> or text <input> from it, and hangs a small add
 * button next to the control so a missing city can be created without leaving
 * the page.
 *
 *   TgbCities.load()                     -> Promise<rows>   (cached)
 *   TgbCities.attach(el, opts)           -> controller
 *   TgbCities.add(city, opts)            -> Promise<row>
 *   TgbCities.isIgnored(cityString)      -> boolean
 *
 * `ignored` marks a venue-only city (Orchard Park, Santa Clara): real, current,
 * but never a gift-shop or soundtrack destination. Ignored cities render grey
 * and are left out unless a control asks for them:
 *
 *   attach(el, { includeIgnored: true })   admin pickers and filters
 *   attach(el, { })                        gifts, soundtracks — selectable only
 *
 * Adding requires an admin session: pass authHeaders (the page's own function)
 * or the add button stays hidden. The insert sends { city } only — the
 * cities_fill_slug trigger derives the slug, cities_sync_geo the geo columns.
 *
 * Load with <script src="/assets/city-picker.js"></script>, after geo.js when
 * the page has it (canonicalization is nicer with it, but not required).
 */
(function (global) {
  'use strict';

  var DEFAULT_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  var config = {
    url: (global.TGB_SUPABASE_CONFIG && global.TGB_SUPABASE_CONFIG.url) || DEFAULT_CONFIG.url,
    publishableKey: (global.TGB_SUPABASE_CONFIG && (global.TGB_SUPABASE_CONFIG.publishableKey || global.TGB_SUPABASE_CONFIG.anonKey)) || DEFAULT_CONFIG.publishableKey
  };

  var cache = null;       // rows, once loaded
  var inflight = null;    // de-dupes concurrent load() calls
  var attached = [];      // live controllers, refreshed together after an add

  // ── Data ───────────────────────────────────────────────────────────────────

  function readHeaders(extra) {
    var h = { apikey: config.publishableKey, Authorization: 'Bearer ' + config.publishableKey };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  // PostgREST caps a response at 1000 rows; page until a short page comes back.
  function fetchAll(url, headers) {
    var out = [];
    function page(from) {
      var h = {};
      Object.keys(headers).forEach(function (k) { h[k] = headers[k]; });
      h.Range = from + '-' + (from + 999);
      return fetch(url, { headers: h, cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('Could not load cities (' + res.status + ').');
        return res.json();
      }).then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return out;
        out = out.concat(rows);
        return rows.length < 1000 ? out : page(from + 1000);
      });
    }
    return page(0);
  }

  function load(opts) {
    var force = !!(opts && opts.force);
    if (cache && !force) return Promise.resolve(cache);
    if (inflight && !force) return inflight;
    // select=* on purpose: naming `ignored` explicitly would 400 on a database
    // that has not run 2026072205_cities_ignored.sql yet.
    var url = config.url + '/rest/v1/cities' +
      '?select=*&archived=eq.false&order=sort_order.asc,city.asc';
    inflight = fetchAll(url, readHeaders({ Accept: 'application/json' }))
      .then(function (rows) {
        cache = rows.map(normalizeRow);
        inflight = null;
        return cache;
      })
      .catch(function (error) {
        inflight = null;
        throw error;
      });
    return inflight;
  }

  // `ignored` is absent until 2026072205_cities_ignored.sql is applied — treat
  // a missing column as "not ignored" so the pages work either way.
  function normalizeRow(row) {
    return {
      slug: row.slug || '',
      city: row.city || '',
      label: row.label || '',
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
      ignored: row.ignored === true
    };
  }

  function isIgnored(city) {
    if (!cache || !city) return false;
    for (var i = 0; i < cache.length; i++) if (cache[i].city === city) return cache[i].ignored;
    return false;
  }

  function selectable() {
    return (cache || []).filter(function (row) { return !row.ignored; });
  }

  // geo.js canonicalizes the state/country half but keeps the city name exactly
  // as typed (its SQL twin does the same, so don't "fix" it there). People type
  // lowercase into a picker, so tidy an all-lowercase word here — deliberate
  // casing like "d'Iberville" or "LaGrange" is left alone.
  function titleCaseTypedName(value) {
    return String(value == null ? '' : value).replace(/[^\s,]+/g, function (word) {
      if (word !== word.toLowerCase()) return word;   // has capitals: intentional
      if (word.length <= 2 && word.indexOf('.') === -1) return word.toUpperCase(); // "oh"
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
  }

  function canonical(value) {
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return '';
    raw = titleCaseTypedName(raw);
    if (global.TgbGeo && typeof global.TgbGeo.canonicalCity === 'function') {
      return global.TgbGeo.canonicalCity(raw) || raw;
    }
    return raw;
  }

  // Insert a city. Slug and the structured geo columns are filled by triggers.
  function add(city, opts) {
    var canonicalCity = canonical(city);
    if (!canonicalCity) return Promise.reject(new Error('City is required.'));
    var headers = (opts && typeof opts.authHeaders === 'function')
      ? opts.authHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' })
      : readHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' });
    var wantIgnored = !!(opts && opts.ignored);
    function post(payload) {
      return fetch(config.url + '/rest/v1/cities?on_conflict=city', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
    }
    var payload = { city: canonicalCity, archived: false };
    if (wantIgnored) payload.ignored = true;
    return post(payload).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (text) {
          // Database without 2026072205_cities_ignored.sql: retry without the
          // column rather than failing the whole add.
          if (wantIgnored && /ignored/.test(text || '')) {
            return post({ city: canonicalCity, archived: false }).then(function (retry) {
              if (!retry.ok) throw new Error('Could not add "' + canonicalCity + '".');
              return retry.json();
            });
          }
          throw new Error(text || 'Could not add "' + canonicalCity + '".');
        });
      }
      return res.json();
    }).then(function (rows) {
      var row = normalizeRow((Array.isArray(rows) && rows[0]) || { city: canonicalCity });
      return load({ force: true }).then(function () { return row; });
    });
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  function ensureStyles() {
    if (document.getElementById('tgb-city-picker-styles')) return;
    var style = document.createElement('style');
    style.id = 'tgb-city-picker-styles';
    style.textContent = [
      '.tgb-city-wrap{display:inline-flex;align-items:center;gap:6px;min-width:0;}',
      '.tgb-city-wrap > select,.tgb-city-wrap > input{min-width:0;flex:1 1 auto;}',
      '.tgb-city-ignored{color:#9aa0a6;}',
      '.tgb-city-add{flex:0 0 auto;width:30px;height:30px;padding:0;line-height:1;',
      'border:1px solid currentColor;border-radius:6px;background:transparent;',
      'color:inherit;font:600 16px/1 system-ui,sans-serif;cursor:pointer;opacity:.75;}',
      '.tgb-city-add:hover,.tgb-city-add:focus-visible{opacity:1;}',
      '.tgb-city-add[disabled]{opacity:.35;cursor:not-allowed;}',
      '.tgb-city-dialog{position:fixed;inset:0;z-index:9999;display:flex;',
      'align-items:center;justify-content:center;background:rgba(8,11,17,.55);}',
      '.tgb-city-dialog[hidden]{display:none;}',
      '.tgb-city-card{width:min(420px,calc(100vw - 32px));padding:18px;border-radius:12px;',
      'background:#fff;color:#16181d;box-shadow:0 24px 60px rgba(0,0,0,.35);',
      'font:14px/1.5 system-ui,sans-serif;}',
      '.tgb-city-card h3{margin:0 0 4px;font-size:1rem;}',
      '.tgb-city-card p{margin:0 0 12px;color:#5b616e;font-size:.85rem;}',
      '.tgb-city-card input{width:100%;height:40px;padding:0 10px;margin-bottom:6px;',
      'border:1px solid #cdcbc4;border-radius:8px;font:inherit;box-sizing:border-box;}',
      '.tgb-city-preview{min-height:18px;margin-bottom:12px;color:#5b616e;font-size:.8rem;}',
      '.tgb-city-preview.is-error{color:#c02c22;}',
      '.tgb-city-actions{display:flex;justify-content:flex-end;gap:8px;}',
      '.tgb-city-actions button{height:36px;padding:0 14px;border-radius:8px;',
      'border:1px solid #cdcbc4;background:#fff;font:inherit;cursor:pointer;}',
      '.tgb-city-actions .tgb-city-save{border-color:#1f3f77;background:#1f3f77;color:#fff;}',
      '.tgb-city-ignored-note{display:flex;align-items:center;gap:6px;margin:0 0 12px;',
      'color:#5b616e;font-size:.8rem;}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Add dialog ─────────────────────────────────────────────────────────────

  function openAddDialog(opts) {
    ensureStyles();
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'tgb-city-dialog';
      wrap.innerHTML =
        '<div class="tgb-city-card" role="dialog" aria-modal="true" aria-label="Add a city">' +
          '<h3>Add a city</h3>' +
          '<p>Type it as "City, State" or "City, Country". It is saved to the one city list the whole site reads.</p>' +
          '<input type="text" placeholder="e.g. Youngstown, Ohio" autocomplete="off">' +
          '<div class="tgb-city-preview"></div>' +
          '<label class="tgb-city-ignored-note">' +
            '<input type="checkbox" class="tgb-city-ignored-box"> Venue only — hide from gifts and soundtracks' +
          '</label>' +
          '<div class="tgb-city-actions">' +
            '<button type="button" class="tgb-city-cancel">Cancel</button>' +
            '<button type="button" class="tgb-city-save">Add city</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);

      var input = wrap.querySelector('input[type="text"]');
      var ignoredBox = wrap.querySelector('.tgb-city-ignored-box');
      var preview = wrap.querySelector('.tgb-city-preview');
      var saveBtn = wrap.querySelector('.tgb-city-save');

      function close(result) {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(result || null);
      }
      function onKey(event) {
        if (event.key === 'Escape') close(null);
        if (event.key === 'Enter' && document.activeElement === input) save();
      }
      function refreshPreview() {
        var canonicalCity = canonical(input.value);
        preview.classList.remove('is-error');
        preview.textContent = canonicalCity ? 'Saves as: ' + canonicalCity : '';
      }
      function save() {
        var canonicalCity = canonical(input.value);
        if (!canonicalCity) {
          preview.classList.add('is-error');
          preview.textContent = 'Type a city first.';
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Adding...';
        add(canonicalCity, { authHeaders: opts && opts.authHeaders, ignored: ignoredBox.checked })
          .then(function (row) { close(row); })
          .catch(function (error) {
            preview.classList.add('is-error');
            preview.textContent = error && error.message ? error.message : 'Could not add that city.';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Add city';
          });
      }

      input.addEventListener('input', refreshPreview);
      wrap.querySelector('.tgb-city-cancel').addEventListener('click', function () { close(null); });
      saveBtn.addEventListener('click', save);
      wrap.addEventListener('click', function (event) { if (event.target === wrap) close(null); });
      document.addEventListener('keydown', onKey);
      if (opts && opts.initialValue) { input.value = opts.initialValue; refreshPreview(); }
      input.focus();
    });
  }

  // ── attach ─────────────────────────────────────────────────────────────────
  //   includeIgnored  show venue-only cities (grey). Default false.
  //   allowAdd        show the + button. Default true; needs authHeaders to
  //                   write, so pass the page's own auth function.
  //   allOption       label for a leading "no filter" choice, e.g. 'All cities'.
  //   onChange        called with the chosen city string.
  function attach(el, opts) {
    if (!el) return null;
    var options = opts || {};
    ensureStyles();

    var isSelect = el.tagName === 'SELECT';
    var wrap = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('tgb-city-wrap')
      ? el.parentNode
      : null;
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'tgb-city-wrap';
      el.parentNode.insertBefore(wrap, el);
      wrap.appendChild(el);
    }

    var listId = null;
    if (!isSelect) {
      listId = el.id ? el.id + '-tgb-cities' : 'tgb-cities-' + attached.length;
      var list = document.getElementById(listId);
      if (!list) {
        list = document.createElement('datalist');
        list.id = listId;
        wrap.appendChild(list);
      }
      el.setAttribute('list', listId);
    }

    var addBtn = null;
    if (options.allowAdd !== false) {
      addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'tgb-city-add';
      addBtn.title = 'Add a city to the shared list';
      addBtn.setAttribute('aria-label', 'Add a city');
      addBtn.textContent = '+';
      addBtn.addEventListener('click', function () {
        var typed = !isSelect && el.value ? el.value : '';
        openAddDialog({ authHeaders: options.authHeaders, initialValue: typed }).then(function (row) {
          if (!row) return;
          refreshAll();
          controller.value(row.city);
          if (typeof options.onChange === 'function') options.onChange(row.city);
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
      wrap.appendChild(addBtn);
    }

    function rows() {
      var all = cache || [];
      return options.includeIgnored ? all : all.filter(function (r) { return !r.ignored; });
    }

    function render() {
      var current = el.value;
      var list = rows();
      if (isSelect) {
        el.innerHTML = '';
        if (options.allOption) {
          var blank = document.createElement('option');
          blank.value = '';
          blank.textContent = options.allOption;
          el.appendChild(blank);
        }
        list.forEach(function (row) {
          var opt = document.createElement('option');
          opt.value = row.city;
          opt.textContent = row.city;
          if (row.ignored) {
            opt.className = 'tgb-city-ignored';
            opt.title = 'Venue only — hidden from gifts and soundtracks';
          }
          el.appendChild(opt);
        });
        // Keep a value the catalog doesn't know about rather than dropping it.
        if (current && !list.some(function (r) { return r.city === current; })) {
          var orphan = document.createElement('option');
          orphan.value = current;
          orphan.textContent = current + ' (not in the city list)';
          orphan.className = 'tgb-city-ignored';
          el.appendChild(orphan);
        }
        el.value = current;
      } else {
        var datalist = document.getElementById(listId);
        if (datalist) {
          datalist.innerHTML = '';
          list.forEach(function (row) {
            var opt = document.createElement('option');
            opt.value = row.city;
            if (row.ignored) opt.label = row.city + ' — venue only';
            datalist.appendChild(opt);
          });
        }
        el.classList.toggle('tgb-city-ignored', isIgnored(el.value));
      }
      if (addBtn) addBtn.disabled = false;
    }

    var controller = {
      el: el,
      refresh: render,
      value: function (next) {
        if (next === undefined) return el.value;
        el.value = next;
        if (!isSelect) el.classList.toggle('tgb-city-ignored', isIgnored(next));
        return next;
      },
      rows: rows
    };

    el.addEventListener('change', function () {
      if (!isSelect) el.classList.toggle('tgb-city-ignored', isIgnored(el.value));
      if (typeof options.onChange === 'function') options.onChange(el.value);
    });

    attached.push(controller);
    load().then(render).catch(function (error) {
      console.error('[city-picker]', error);
      if (addBtn) addBtn.disabled = false; // adding still works without a list
    });
    return controller;
  }

  function refreshAll() {
    attached.forEach(function (controller) {
      try { controller.refresh(); } catch (error) { console.error('[city-picker]', error); }
    });
  }

  global.TgbCities = {
    configure: function (next) {
      if (next && next.url) config.url = next.url;
      if (next && (next.publishableKey || next.anonKey)) config.publishableKey = next.publishableKey || next.anonKey;
    },
    load: load,
    attach: attach,
    add: add,
    all: function () { return (cache || []).slice(); },
    selectable: selectable,
    isIgnored: isIgnored,
    canonical: canonical,
    refreshAll: refreshAll,
    openAddDialog: openAddDialog
  };
}(typeof window !== 'undefined' ? window : this));
