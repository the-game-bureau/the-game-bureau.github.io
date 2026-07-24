/* geo.js — shared geography model for The Game Bureau.
 *
 * One source of truth for turning a place into structured parts and back:
 *   - state / province / country lookup tables (code <-> name)
 *   - parseGeo("Denver, CO")   -> { cityName, stateCode, stateName, countryCode, countryName }
 *   - composeGeo(parts)        -> canonical "City, State" / "City, Country" display string
 *   - canonicalCity(str)       -> composeGeo(parseGeo(str)) with verbatim fall-through
 *   - geoBadge(rowOrStr)       -> { kind:'state'|'country', value } for the map icons
 *   - usStateOptions()/provinceOptions()/countryOptions() for builder dropdowns
 *
 * This replaces the copy-pasted US_STATES / COUNTRY_CODES maps and the
 * canonicalShopCity()/cityGeoBadge() logic that previously lived in
 * games/index.html, shop/index.html and shop/admin/index.html. Load it with
 * <script src="/assets/geo.js"></script> and read window.TgbGeo.
 *
 * Canonical composed-string standard (the value stored in games.city /
 * cities.city and passed through the /shop/?city= URL):
 *   - US:   "City, FullStateName"        (e.g. "Denver, Colorado")
 *   - DC:   "City, D.C."                  (e.g. "Washington, D.C.")
 *   - Intl: "City, CountryName"          (e.g. "Paris, France")
 * The 2-letter code lives in the separate state_code column and drives icons.
 *
 * The SQL twin (tgb_parse_geo / tgb_canonical_gift_shop_city in Supabase) must
 * stay in lock-step with parseGeo/canonicalCity — keep the test cases identical.
 */
(function (global) {
  'use strict';

  // ── Lookup tables ──────────────────────────────────────────────────────────
  // US states: 2-letter code -> full name. DC is spelled "D.C." to match the
  // stored "Washington, D.C." canonical form; its icon shape is keyed "DC".
  var US_STATE_CODE_TO_NAME = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'D.C.'
  };

  // Canadian provinces/territories: code -> name.
  var CA_PROVINCE_CODE_TO_NAME = {
    AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
    NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
    NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
    SK: 'Saskatchewan', YT: 'Yukon'
  };

  // Countries are NOT hardcoded here — they live in one place, the public.countries
  // table, and are hydrated into these two live maps at runtime (see the
  // "Country catalog" block below). Both stay the SAME object reference for the
  // module's lifetime (filled/cleared in place) so callers that captured a
  // reference — e.g. `TgbGeo.COUNTRY_CODE_TO_NAME` — keep seeing fresh data.
  //   COUNTRY_NAME_TO_CODE: lowercased name/alias/code -> alpha-3 code (parsing)
  //   COUNTRY_CODE_TO_NAME: alpha-3 code -> canonical display name (compose + dropdown)
  var COUNTRY_NAME_TO_CODE = {};
  var COUNTRY_CODE_TO_NAME = {};

  // Reverse maps: lowercased full name -> code (for parsing).
  var US_STATE_NAME_TO_CODE = buildNameToCode(US_STATE_CODE_TO_NAME);
  var CA_PROVINCE_NAME_TO_CODE = buildNameToCode(CA_PROVINCE_CODE_TO_NAME);
  // Extra US aliases the reverse map above doesn't cover.
  US_STATE_NAME_TO_CODE['district of columbia'] = 'DC';
  US_STATE_NAME_TO_CODE['dc'] = 'DC';
  US_STATE_NAME_TO_CODE['d.c.'] = 'DC';
  US_STATE_NAME_TO_CODE['d. c.'] = 'DC';

  function buildNameToCode(codeToName) {
    var out = {};
    Object.keys(codeToName).forEach(function (code) {
      out[String(codeToName[code]).toLowerCase()] = code;
    });
    return out;
  }

  // ── Country catalog (hydrated from public.countries) ───────────────────────
  // The single source of truth is the DB table. This module fetches it once and
  // fills the two maps above. To avoid a first-paint gap on public pages that
  // draw the country oval, the last successful fetch is cached in localStorage
  // and replayed synchronously on load; the network copy refreshes it in the
  // background. Admin dropdowns should await TgbGeo.countriesReady for freshness.
  var DEFAULT_SUPABASE = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };
  var geoConfig = {
    url: (global.TGB_SUPABASE_CONFIG && global.TGB_SUPABASE_CONFIG.url) || DEFAULT_SUPABASE.url,
    publishableKey: (global.TGB_SUPABASE_CONFIG && (global.TGB_SUPABASE_CONFIG.publishableKey || global.TGB_SUPABASE_CONFIG.anonKey)) || DEFAULT_SUPABASE.publishableKey
  };
  var COUNTRIES_CACHE_KEY = 'tgb_countries_v1';
  var IS_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

  function hydrateCountries(rows) {
    Object.keys(COUNTRY_CODE_TO_NAME).forEach(function (k) { delete COUNTRY_CODE_TO_NAME[k]; });
    Object.keys(COUNTRY_NAME_TO_CODE).forEach(function (k) { delete COUNTRY_NAME_TO_CODE[k]; });
    (rows || []).forEach(function (r) {
      var code = String(r && r.code || '').toUpperCase();
      if (!code) return;
      var name = (r && r.name) || code;
      COUNTRY_CODE_TO_NAME[code] = name;
      COUNTRY_NAME_TO_CODE[String(name).toLowerCase()] = code;
      COUNTRY_NAME_TO_CODE[code.toLowerCase()] = code;         // code typed as a "name"
      (r && r.aliases || []).forEach(function (a) {
        if (a) COUNTRY_NAME_TO_CODE[String(a).toLowerCase()] = code;
      });
    });
  }

  function readCountriesCache() {
    try {
      var raw = IS_BROWSER && window.localStorage && window.localStorage.getItem(COUNTRIES_CACHE_KEY);
      if (raw) { var d = JSON.parse(raw); if (Array.isArray(d) && d.length) return d; }
    } catch (e) {}
    return null;
  }
  function writeCountriesCache(rows) {
    try {
      if (IS_BROWSER && window.localStorage) window.localStorage.setItem(COUNTRIES_CACHE_KEY, JSON.stringify(rows));
    } catch (e) {}
  }

  var cachedCountries = readCountriesCache();
  if (cachedCountries) hydrateCountries(cachedCountries);   // instant, offline-safe

  function fetchTable(path) {
    return fetch(geoConfig.url + '/rest/v1/' + path, {
      headers: { apikey: geoConfig.publishableKey, Authorization: 'Bearer ' + geoConfig.publishableKey },
      cache: 'no-store'
    }).then(function (res) { return res.ok ? res.json() : []; }).catch(function () { return []; });
  }
  // Distinct { code, name } from the cities catalog — the fallback used before
  // public.countries exists (the migration window), so ovals/dropdowns never go
  // blank. No aliases, so alt spellings like "England" won't parse until the
  // countries table is live; canonical names ("United Kingdom") still do.
  function citiesToCountries(rows) {
    var seen = {}, out = [];
    (rows || []).forEach(function (r) {
      var code = String(r && r.country_code || '').toUpperCase();
      if (!code || seen[code]) return;
      seen[code] = true;
      out.push({ code: code, name: (r && r.country_name) || code, aliases: [] });
    });
    return out;
  }
  function fetchCountries() {
    if (!IS_BROWSER || typeof fetch !== 'function') return Promise.resolve(cachedCountries || []);
    return fetchTable('countries?select=code,name,aliases&order=name.asc')
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length) return rows;
        return fetchTable('cities?select=country_code,country_name').then(citiesToCountries);
      })
      .then(function (rows) {
        if (Array.isArray(rows) && rows.length) { hydrateCountries(rows); writeCountriesCache(rows); return rows; }
        return cachedCountries || [];
      })
      .catch(function () { return cachedCountries || []; });
  }

  // Promise that resolves when countries are loaded (from network, or the cache
  // if the network is unavailable). Reassigned by configure().
  var countriesReady = fetchCountries();

  // ── Helpers ────────────────────────────────────────────────────────────────
  function norm(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }
  // A token like "D.C." or "U.S.A." collapsed to "dc"/"usa" for code matching.
  function tokenKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  }
  var DC_TAIL_RE = /\bd\.?\s*c\.?$/i;

  // ── parseGeo ─────────────────────────────────────────────────────────────
  // Split a "City, Region[, Country]" string into structured parts. Walks the
  // comma-parts from the end inward so "London, England" and "Toronto, ON" both
  // resolve. `matched` is false when no state/province/country was recognized
  // (callers use it to preserve the raw string verbatim).
  function parseGeo(value) {
    var raw = norm(value);
    var empty = {
      cityName: '', stateCode: '', stateName: '', countryCode: '', countryName: '',
      raw: raw, matched: false
    };
    if (!raw) return empty;

    // Washington, D.C. (and comma-less "Washington D.C.") — the D.C. is the
    // "state", the remainder is the city.
    if (DC_TAIL_RE.test(raw)) {
      var beforeDc = raw.replace(/,?\s*d\.?\s*c\.?$/i, '').trim();
      return {
        cityName: beforeDc || 'Washington',
        stateCode: 'DC', stateName: 'D.C.',
        countryCode: 'USA', countryName: 'United States',
        raw: raw, matched: true
      };
    }

    var parts = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    for (var i = parts.length - 1; i >= 1; i--) {
      var partRaw = parts[i];
      var lower = partRaw.toLowerCase();
      var code = partRaw.toUpperCase();
      var key = tokenKey(partRaw);
      var cityName = parts.slice(0, i).join(', ').trim();

      // US state — by full name or 2-letter code.
      if (US_STATE_NAME_TO_CODE[lower] || US_STATE_CODE_TO_NAME[code]) {
        var sc = US_STATE_NAME_TO_CODE[lower] || code;
        return {
          cityName: cityName, stateCode: sc, stateName: US_STATE_CODE_TO_NAME[sc] || '',
          countryCode: 'USA', countryName: 'United States', raw: raw, matched: true
        };
      }
      // Canadian province — by full name or code.
      if (CA_PROVINCE_NAME_TO_CODE[lower] || CA_PROVINCE_CODE_TO_NAME[code]) {
        var pc = CA_PROVINCE_NAME_TO_CODE[lower] || code;
        return {
          cityName: cityName, stateCode: pc, stateName: CA_PROVINCE_CODE_TO_NAME[pc] || '',
          countryCode: 'CAN', countryName: 'Canada', raw: raw, matched: true
        };
      }
      // Country — by name/alias or alpha-3 code.
      if (COUNTRY_NAME_TO_CODE[lower] || COUNTRY_NAME_TO_CODE[key] || COUNTRY_CODE_TO_NAME[code]) {
        var cc = COUNTRY_NAME_TO_CODE[lower] || COUNTRY_NAME_TO_CODE[key] || code;
        return {
          cityName: cityName, stateCode: '', stateName: '',
          countryCode: cc, countryName: COUNTRY_CODE_TO_NAME[cc] || partRaw, raw: raw, matched: true
        };
      }
    }

    // Nothing recognized — keep the first comma-part as the city, flag unmatched.
    empty.cityName = parts[0] || raw;
    return empty;
  }

  // ── composeGeo ───────────────────────────────────────────────────────────
  // Build the canonical display/key string from structured parts. Accepts
  // either code or name for state/country. Returns '' when there is no city.
  function composeGeo(parts) {
    parts = parts || {};
    var cityName = norm(parts.cityName || parts.city_name || parts.city);
    if (!cityName) return '';

    var stateCode = String(parts.stateCode || parts.state_code || '').toUpperCase();
    var stateName = norm(parts.stateName || parts.state_name);
    if (!stateCode && stateName) {
      stateCode = US_STATE_NAME_TO_CODE[stateName.toLowerCase()]
        || CA_PROVINCE_NAME_TO_CODE[stateName.toLowerCase()] || '';
    }
    var countryCode = String(parts.countryCode || parts.country_code || '').toUpperCase();
    var countryName = norm(parts.countryName || parts.country_name);
    if (!countryCode && countryName) countryCode = COUNTRY_NAME_TO_CODE[countryName.toLowerCase()] || '';
    // A US state / Canadian province implies its country when none was provided.
    if (!countryCode && US_STATE_CODE_TO_NAME[stateCode]) countryCode = 'USA';
    if (!countryCode && CA_PROVINCE_CODE_TO_NAME[stateCode]) countryCode = 'CAN';

    var isUS = countryCode === 'USA' || (!countryCode && !!US_STATE_CODE_TO_NAME[stateCode]);
    if (isUS && stateCode) {
      if (stateCode === 'DC') return cityName + ', D.C.';
      var full = US_STATE_CODE_TO_NAME[stateCode] || stateName;
      return full ? cityName + ', ' + full : cityName;
    }
    // Non-US: "City, CountryName".
    if (countryCode && countryCode !== 'USA') {
      var cn = COUNTRY_CODE_TO_NAME[countryCode] || countryName;
      return cn ? cityName + ', ' + cn : cityName;
    }
    return cityName;
  }

  // ── canonicalCity ────────────────────────────────────────────────────────
  // Normalize any "City, State/Country" string to the canonical form. Drop-in
  // replacement for the old canonicalShopCity(): unknown formats fall through
  // verbatim (space-normalized) instead of being mangled.
  function canonicalCity(value) {
    var parsed = parseGeo(value);
    if (!parsed.raw) return '';
    if (!parsed.matched) return parsed.raw;
    return composeGeo(parsed) || parsed.raw;
  }

  // The city portion only, e.g. "Houston, Texas" -> "Houston".
  function cityDisplayName(value) {
    return parseGeo(value).cityName;
  }

  // ── geoBadge ─────────────────────────────────────────────────────────────
  // Decide which map icon to draw. Prefers explicit structured codes on a row
  // (state_code/country_code, or camelCase), and falls back to parsing a
  // "City, State" string. Returns null when there's nothing to show.
  function geoBadge(input) {
    if (input && typeof input === 'object') {
      var sc = String(input.stateCode || input.state_code || '').toUpperCase();
      if (sc) return { kind: 'state', value: sc };
      var cc = String(input.countryCode || input.country_code || '').toUpperCase();
      if (cc && cc !== 'USA') return { kind: 'country', value: cc };
      // A row that only carries a composed string.
      if (input.city != null || input.label != null) input = input.city || input.label;
      else return null;
    }
    var parsed = parseGeo(input);
    if (parsed.stateCode) return { kind: 'state', value: parsed.stateCode };
    if (parsed.countryCode && parsed.countryCode !== 'USA') return { kind: 'country', value: parsed.countryCode };
    return null;
  }

  // ── Dropdown option helpers (for the builder) ────────────────────────────
  function optionsFromMap(codeToName) {
    return Object.keys(codeToName)
      .map(function (code) { return { code: code, name: codeToName[code] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function usStateOptions() { return optionsFromMap(US_STATE_CODE_TO_NAME); }
  function provinceOptions() { return optionsFromMap(CA_PROVINCE_CODE_TO_NAME); }
  function countryOptions() {
    // From the hydrated catalog: United States first, then alphabetical. Returns
    // [] until countries load (callers that need it await TgbGeo.countriesReady).
    var codes = Object.keys(COUNTRY_CODE_TO_NAME);
    var usa = codes.filter(function (c) { return c === 'USA'; })
      .map(function (c) { return { code: c, name: COUNTRY_CODE_TO_NAME[c] }; });
    var rest = codes.filter(function (c) { return c !== 'USA'; })
      .map(function (code) { return { code: code, name: COUNTRY_CODE_TO_NAME[code] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    return usa.concat(rest);
  }

  global.TgbGeo = {
    US_STATE_CODE_TO_NAME: US_STATE_CODE_TO_NAME,
    US_STATE_NAME_TO_CODE: US_STATE_NAME_TO_CODE,
    CA_PROVINCE_CODE_TO_NAME: CA_PROVINCE_CODE_TO_NAME,
    COUNTRY_NAME_TO_CODE: COUNTRY_NAME_TO_CODE,
    COUNTRY_CODE_TO_NAME: COUNTRY_CODE_TO_NAME,
    parseGeo: parseGeo,
    composeGeo: composeGeo,
    canonicalCity: canonicalCity,
    cityDisplayName: cityDisplayName,
    geoBadge: geoBadge,
    usStateOptions: usStateOptions,
    provinceOptions: provinceOptions,
    countryOptions: countryOptions,
    // Country catalog (public.countries):
    hydrateCountries: hydrateCountries,
    get countriesReady() { return countriesReady; },
    configure: function (next) {
      if (next && next.url) geoConfig.url = next.url;
      if (next && (next.publishableKey || next.anonKey)) geoConfig.publishableKey = next.publishableKey || next.anonKey;
      countriesReady = fetchCountries();
      return countriesReady;
    }
  };
}(typeof window !== 'undefined' ? window : this));
