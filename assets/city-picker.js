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
      '?select=*&order=sort_order.asc,city.asc';
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
      label: row.label || row.city_name || '',   // label column is being retired; fall back to the stem
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
      ignored: row.ignored === true
    };
  }

  // Countries come from the single source (public.countries) via TgbGeo, which
  // hydrates it. { code, name }, United States first then alphabetical.
  function countryOptions() {
    var g = global.TgbGeo;
    return (g && g.countryOptions ? g.countryOptions() : []).map(function (o) {
      return { code: String(o.code).toUpperCase(), name: o.name };
    });
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

  // ── Structured geo from the separate City / State / Country fields ──────────
  // Uses TgbGeo's option lists to resolve a typed state/country (code OR name)
  // and infer the country from a US state / CA province. Returns the canonical
  // `city` key string plus the structured columns to store alongside it.
  function stateList() {
    var g = global.TgbGeo, out = [];
    (g && g.usStateOptions ? g.usStateOptions() : []).forEach(function (o) { out.push({ code: String(o.code).toUpperCase(), name: o.name, country: 'USA' }); });
    (g && g.provinceOptions ? g.provinceOptions() : []).forEach(function (o) { out.push({ code: String(o.code).toUpperCase(), name: o.name, country: 'CAN' }); });
    return out;
  }
  function countryList() { return countryOptions(); }
  function findState(val) {
    val = String(val == null ? '' : val).trim();
    if (!val) return null;
    var u = val.toUpperCase(), l = val.toLowerCase(), list = stateList();
    for (var i = 0; i < list.length; i++) { if (list[i].code === u || list[i].name.toLowerCase() === l) return list[i]; }
    return { code: val.length <= 3 ? u : '', name: val.length <= 3 ? '' : titleCaseTypedName(val), country: '' };
  }
  function findCountry(val) {
    val = String(val == null ? '' : val).trim();
    if (!val) return null;
    var u = val.toUpperCase(), l = val.toLowerCase(), list = countryList();
    for (var i = 0; i < list.length; i++) { if (list[i].code === u || list[i].name.toLowerCase() === l) return list[i]; }
    // Not in the catalog yet: let geo.js resolve a typed name/code to an alpha-3
    // (it knows the catalog's aliases too), so the oval badge still gets a code.
    var g = global.TgbGeo;
    if (g && g.parseGeo) {
      var parsed = g.parseGeo('X, ' + val);
      if (parsed && parsed.countryCode) return { code: parsed.countryCode, name: parsed.countryName || titleCaseTypedName(val) };
    }
    return { code: val.length === 3 ? u : '', name: titleCaseTypedName(val) };
  }
  function resolveGeoParts(cityRaw, stateRaw, countryRaw) {
    var cityName = titleCaseTypedName(String(cityRaw == null ? '' : cityRaw).trim());
    var st = findState(stateRaw);
    var ct = findCountry(countryRaw);
    if ((!ct || !ct.code) && st && st.country) ct = findCountry(st.country) || { code: st.country, name: '' };
    var composed = (global.TgbGeo && global.TgbGeo.composeGeo)
      ? global.TgbGeo.composeGeo({
          cityName: cityName,
          stateCode: st ? st.code : '', stateName: st ? st.name : '',
          countryCode: ct ? ct.code : '', countryName: ct ? ct.name : ''
        })
      : cityName;
    return {
      composed: composed || cityName,
      geo: {
        city_name: cityName || null,
        state_code: (st && st.code) || null,
        state_name: (st && st.name) || null,
        country_code: (ct && ct.code) || null,
        country_name: (ct && ct.name) || null
      }
    };
  }

  // Insert a city. The slug is always filled by the cities_fill_slug trigger.
  // opts.geo (city_name/state_code/state_name/country_code/country_name) is sent
  // explicitly so the structured columns match exactly what was entered — the
  // tgb_sync_geo trigger fills any left null via coalesce(existing, parsed). On a
  // database missing those columns (or `ignored`), we strip them and retry so the
  // add still succeeds.
  function add(city, opts) {
    var canonicalCity = canonical(city);
    if (!canonicalCity) return Promise.reject(new Error('City is required.'));
    var headers = (opts && typeof opts.authHeaders === 'function')
      ? opts.authHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' })
      : readHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' });
    var wantIgnored = !!(opts && opts.ignored);
    var geo = (opts && opts.geo) || null;

    function post(payload) {
      return fetch(config.url + '/rest/v1/cities?on_conflict=city', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });
    }
    function base() {
      var p = { city: canonicalCity };
      if (wantIgnored) p.ignored = true;
      return p;
    }
    var payload = base();
    if (geo) {
      ['city_name', 'state_code', 'state_name', 'country_code', 'country_name'].forEach(function (k) {
        if (geo[k]) payload[k] = geo[k];
      });
    }

    // Try full; on a column error, retry without geo, then without ignored.
    function attempt(p, allowGeoStrip, allowIgnoredStrip) {
      return post(p).then(function (res) {
        if (res.ok) return res.json();
        return res.text().then(function (text) {
          var t = text || '';
          if (allowGeoStrip && geo && /city_name|state_code|state_name|country_code|country_name|column/i.test(t)) {
            var noGeo = base();
            return attempt(noGeo, false, allowIgnoredStrip);
          }
          if (allowIgnoredStrip && wantIgnored && /ignored/.test(t)) {
            return attempt({ city: canonicalCity }, false, false);
          }
          throw new Error(t || 'Could not add "' + canonicalCity + '".');
        });
      });
    }

    return attempt(payload, !!geo, wantIgnored).then(function (rows) {
      var row = normalizeRow((Array.isArray(rows) && rows[0]) || { city: canonicalCity });
      return load({ force: true }).then(function () { return row; });
    });
  }

  // ── Countries (public.countries — the shared country catalog) ───────────────
  // Insert/upsert a country, then re-hydrate geo.js so every dropdown/parser on
  // the page sees it immediately. Needs an admin session (authHeaders). Requires
  // the countries table to exist (migration 2026072304).
  function addCountry(country, opts) {
    var code = String(country && country.code || '').trim().toUpperCase();
    var name = String(country && country.name || '').trim();
    if (!/^[A-Z]{3}$/.test(code)) return Promise.reject(new Error('Country code must be 3 letters (e.g. PRT).'));
    if (!name) return Promise.reject(new Error('Country name is required.'));
    var aliases = ((country && country.aliases) || []).map(function (a) { return String(a).trim().toLowerCase(); }).filter(Boolean);
    var headers = (opts && typeof opts.authHeaders === 'function')
      ? opts.authHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' })
      : readHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' });
    return fetch(config.url + '/rest/v1/countries?on_conflict=code', {
      method: 'POST', headers: headers, body: JSON.stringify({ code: code, name: name, aliases: aliases })
    }).then(function (res) {
      if (res.ok) return res.json();
      return res.text().then(function (t) { throw new Error(t || 'Could not add "' + name + '".'); });
    }).then(function (rows) {
      var row = (Array.isArray(rows) && rows[0]) || { code: code, name: name, aliases: aliases };
      // Refresh geo's country maps (re-fetch the table) so callers see the new one.
      if (global.TgbGeo && typeof global.TgbGeo.configure === 'function') {
        return global.TgbGeo.configure().then(function () { return row; }, function () { return row; });
      }
      return row;
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
      '.tgb-city-card input,.tgb-city-card select{width:100%;height:40px;padding:0 10px;margin-bottom:6px;',
      'border:1px solid #cdcbc4;border-radius:8px;font:inherit;box-sizing:border-box;',
      'background:#fff;color:inherit;appearance:auto;}',
      '.tgb-city-row{display:flex;gap:8px;}',
      '.tgb-city-row > *{flex:1;min-width:0;}',
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
          '<h3>Add</h3>' +
          '<p>City, state/province, and country. The rest of the row (slug and the map/oval fields) fills in from these.</p>' +
          '<input type="text" class="tgb-city-in-city" placeholder="City, e.g. Youngstown" autocomplete="off">' +
          '<div class="tgb-city-row">' +
            '<input type="text" class="tgb-city-in-state" placeholder="State / Province" autocomplete="off" list="tgb-city-states">' +
            '<span class="tgb-city-wrap">' +
              '<select class="tgb-city-in-country" aria-label="Country"></select>' +
              '<button type="button" class="tgb-city-add tgb-city-add-country" title="Add a country to the shared list" aria-label="Add a country">+</button>' +
            '</span>' +
          '</div>' +
          '<datalist id="tgb-city-states"></datalist>' +
          '<div class="tgb-city-preview"></div>' +
          '<label class="tgb-city-ignored-note">' +
            '<input type="checkbox" class="tgb-city-ignored-box"> Venue only — hide from gifts and soundtracks' +
          '</label>' +
          '<div class="tgb-city-actions">' +
            '<button type="button" class="tgb-city-cancel">Cancel</button>' +
            '<button type="button" class="tgb-city-save">Add</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);

      var cityInput = wrap.querySelector('.tgb-city-in-city');
      var stateInput = wrap.querySelector('.tgb-city-in-state');
      var countryInput = wrap.querySelector('.tgb-city-in-country');
      var ignoredBox = wrap.querySelector('.tgb-city-ignored-box');
      var preview = wrap.querySelector('.tgb-city-preview');
      var saveBtn = wrap.querySelector('.tgb-city-save');

      // State is a type-ahead from geo.js; Country is a real dropdown sourced
      // from the countries catalog (public.countries via TgbGeo). Refill once
      // the catalog loads, keeping the current pick.
      var stateDl = wrap.querySelector('#tgb-city-states');
      stateList().forEach(function (s) { var o = document.createElement('option'); o.value = s.name; stateDl.appendChild(o); });
      function fillCountries() {
        var keep = countryInput.value;
        countryInput.innerHTML = '';
        countryList().forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.name; o.textContent = c.name;
          countryInput.appendChild(o);
        });
        countryInput.value = keep || 'United States';
      }
      fillCountries();
      if (global.TgbGeo && global.TgbGeo.countriesReady) global.TgbGeo.countriesReady.then(fillCountries).catch(function () {});

      function close(result) {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(result || null);
      }
      function onKey(event) {
        if (event.key === 'Escape') close(null);
        if (event.key === 'Enter' && wrap.contains(document.activeElement)) save();
      }
      function refreshPreview() {
        var r = resolveGeoParts(cityInput.value, stateInput.value, countryInput.value);
        preview.classList.remove('is-error');
        preview.textContent = r.geo.city_name ? 'Saves as: ' + r.composed : '';
      }
      function save() {
        var r = resolveGeoParts(cityInput.value, stateInput.value, countryInput.value);
        if (!r.geo.city_name) {
          preview.classList.add('is-error');
          preview.textContent = 'Type a city first.';
          cityInput.focus();
          return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'Adding...';
        add(r.composed, { authHeaders: opts && opts.authHeaders, ignored: ignoredBox.checked, geo: r.geo })
          .then(function (row) { close(row); })
          .catch(function (error) {
            preview.classList.add('is-error');
            preview.textContent = error && error.message ? error.message : 'Could not add that city.';
            saveBtn.disabled = false;
            saveBtn.textContent = 'Add';
          });
      }

      // "+" beside the country field → add a country to the shared catalog.
      wrap.querySelector('.tgb-city-add-country').addEventListener('click', function () {
        openAddCountryDialog({ authHeaders: opts && opts.authHeaders, initialName: countryInput.value.trim() })
          .then(function (row) {
            if (!row) return;
            fillCountries();
            countryInput.value = row.name;
            refreshPreview();
          });
      });

      [cityInput, stateInput, countryInput].forEach(function (el) { el.addEventListener('input', refreshPreview); });
      countryInput.addEventListener('change', refreshPreview);   // <select> fires change
      wrap.querySelector('.tgb-city-cancel').addEventListener('click', function () { close(null); });
      saveBtn.addEventListener('click', save);
      wrap.addEventListener('click', function (event) { if (event.target === wrap) close(null); });
      document.addEventListener('keydown', onKey);

      // Prefill from a typed value ("Youngstown, Ohio") passed by the + button.
      if (opts && opts.initialValue) {
        var parsed = (global.TgbGeo && global.TgbGeo.parseGeo) ? global.TgbGeo.parseGeo(opts.initialValue) : null;
        if (parsed && parsed.cityName) {
          cityInput.value = parsed.cityName;
          stateInput.value = parsed.stateName || parsed.stateCode || '';
          if (parsed.countryName) countryInput.value = parsed.countryName;
        } else {
          cityInput.value = String(opts.initialValue).replace(/,.*$/, '').trim();
        }
        refreshPreview();
      }
      cityInput.focus();
    });
  }

  // ── Add-country dialog ──────────────────────────────────────────────────────
  // Resolves the created row ({ code, name, aliases }) or null if cancelled.
  function openAddCountryDialog(opts) {
    ensureStyles();
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'tgb-city-dialog';
      wrap.innerHTML =
        '<div class="tgb-city-card" role="dialog" aria-modal="true" aria-label="Add a country">' +
          '<h3>Add a country</h3>' +
          '<p>Adds a row to the shared countries catalog. It appears in every country dropdown right away.</p>' +
          '<input type="text" class="tgb-ctry-name" placeholder="Country name, e.g. Portugal" autocomplete="off">' +
          '<input type="text" class="tgb-ctry-code" placeholder="3-letter code, e.g. PRT" autocomplete="off" maxlength="3" style="text-transform:uppercase;">' +
          '<input type="text" class="tgb-ctry-aliases" placeholder="Other spellings (optional, comma-separated)" autocomplete="off">' +
          '<div class="tgb-city-preview"></div>' +
          '<div class="tgb-city-actions">' +
            '<button type="button" class="tgb-city-cancel">Cancel</button>' +
            '<button type="button" class="tgb-city-save">Add country</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);

      var nameInput = wrap.querySelector('.tgb-ctry-name');
      var codeInput = wrap.querySelector('.tgb-ctry-code');
      var aliasInput = wrap.querySelector('.tgb-ctry-aliases');
      var preview = wrap.querySelector('.tgb-city-preview');
      var saveBtn = wrap.querySelector('.tgb-city-save');
      if (opts && opts.initialName) nameInput.value = opts.initialName;

      function aliasesOf() { return aliasInput.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
      function close(result) { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(result || null); }
      function onKey(event) {
        if (event.key === 'Escape') close(null);
        if (event.key === 'Enter' && wrap.contains(document.activeElement)) save();
      }
      function refreshPreview() {
        var code = codeInput.value.trim().toUpperCase(), name = nameInput.value.trim();
        preview.classList.remove('is-error');
        preview.textContent = (code && name) ? ('Saves as: ' + code + ' — ' + name) : '';
      }
      function save() {
        var code = codeInput.value.trim().toUpperCase(), name = nameInput.value.trim();
        if (!name) { preview.classList.add('is-error'); preview.textContent = 'Country name is required.'; nameInput.focus(); return; }
        if (!/^[A-Z]{3}$/.test(code)) { preview.classList.add('is-error'); preview.textContent = 'Code must be 3 letters (e.g. PRT).'; codeInput.focus(); return; }
        saveBtn.disabled = true; saveBtn.textContent = 'Adding...';
        addCountry({ code: code, name: name, aliases: aliasesOf() }, { authHeaders: opts && opts.authHeaders })
          .then(function (row) { close(row); })
          .catch(function (error) {
            preview.classList.add('is-error');
            preview.textContent = error && error.message ? error.message : 'Could not add that country.';
            saveBtn.disabled = false; saveBtn.textContent = 'Add country';
          });
      }

      [nameInput, codeInput].forEach(function (el) { el.addEventListener('input', refreshPreview); });
      wrap.querySelector('.tgb-city-cancel').addEventListener('click', function () { close(null); });
      saveBtn.addEventListener('click', save);
      wrap.addEventListener('click', function (event) { if (event.target === wrap) close(null); });
      document.addEventListener('keydown', onKey);
      nameInput.focus();
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
    countryOptions: countryOptions,
    selectable: selectable,
    isIgnored: isIgnored,
    canonical: canonical,
    refreshAll: refreshAll,
    openAddDialog: openAddDialog
  };

  // Country catalog helpers, for the "+ add a country" affordance on country
  // dropdowns. The list itself is served by TgbGeo (public.countries).
  global.TgbCountries = {
    add: addCountry,
    openAddDialog: openAddCountryDialog
  };
}(typeof window !== 'undefined' ? window : this));
