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

  // Country name (lowercased, incl. common sub-nation aliases) -> ISO 3166-1
  // alpha-3 code (the Olympic/FIFA-style code shown in the oval decal).
  var COUNTRY_NAME_TO_CODE = {
    'united kingdom': 'GBR', 'england': 'GBR', 'scotland': 'GBR', 'wales': 'GBR', 'northern ireland': 'GBR', 'great britain': 'GBR', 'uk': 'GBR',
    'france': 'FRA', 'germany': 'DEU', 'spain': 'ESP', 'italy': 'ITA', 'portugal': 'PRT',
    'netherlands': 'NLD', 'belgium': 'BEL', 'ireland': 'IRL', 'sweden': 'SWE', 'norway': 'NOR',
    'denmark': 'DNK', 'finland': 'FIN', 'austria': 'AUT', 'switzerland': 'CHE', 'poland': 'POL',
    'czech republic': 'CZE', 'czechia': 'CZE', 'greece': 'GRC', 'turkey': 'TUR', 'russia': 'RUS', 'ukraine': 'UKR',
    'mexico': 'MEX', 'canada': 'CAN', 'brazil': 'BRA', 'argentina': 'ARG', 'chile': 'CHL',
    'colombia': 'COL', 'peru': 'PER', 'uruguay': 'URY',
    'australia': 'AUS', 'new zealand': 'NZL', 'japan': 'JPN', 'china': 'CHN', 'south korea': 'KOR',
    'india': 'IND', 'singapore': 'SGP', 'thailand': 'THA', 'indonesia': 'IDN', 'philippines': 'PHL',
    'south africa': 'ZAF', 'egypt': 'EGY', 'israel': 'ISR', 'united arab emirates': 'ARE', 'uae': 'ARE',
    'united states': 'USA', 'united states of america': 'USA', 'usa': 'USA', 'us': 'USA', 'u.s.': 'USA', 'u.s.a.': 'USA'
  };

  // alpha-3 code -> canonical display name (for composeGeo + the country dropdown).
  var COUNTRY_CODE_TO_NAME = {
    USA: 'United States', GBR: 'United Kingdom', FRA: 'France', DEU: 'Germany', ESP: 'Spain',
    ITA: 'Italy', PRT: 'Portugal', NLD: 'Netherlands', BEL: 'Belgium', IRL: 'Ireland',
    SWE: 'Sweden', NOR: 'Norway', DNK: 'Denmark', FIN: 'Finland', AUT: 'Austria',
    CHE: 'Switzerland', POL: 'Poland', CZE: 'Czech Republic', GRC: 'Greece', TUR: 'Turkey',
    RUS: 'Russia', UKR: 'Ukraine', MEX: 'Mexico', CAN: 'Canada', BRA: 'Brazil',
    ARG: 'Argentina', CHL: 'Chile', COL: 'Colombia', PER: 'Peru', URY: 'Uruguay',
    AUS: 'Australia', NZL: 'New Zealand', JPN: 'Japan', CHN: 'China', KOR: 'South Korea',
    IND: 'India', SGP: 'Singapore', THA: 'Thailand', IDN: 'Indonesia', PHL: 'Philippines',
    ZAF: 'South Africa', EGY: 'Egypt', ISR: 'Israel', ARE: 'United Arab Emirates'
  };

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
    // United States first, then alphabetical.
    var rest = Object.keys(COUNTRY_CODE_TO_NAME)
      .filter(function (c) { return c !== 'USA'; })
      .map(function (code) { return { code: code, name: COUNTRY_CODE_TO_NAME[code] }; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
    return [{ code: 'USA', name: 'United States' }].concat(rest);
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
    countryOptions: countryOptions
  };
}(typeof window !== 'undefined' ? window : this));
