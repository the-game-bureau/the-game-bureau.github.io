/* waypoint-geo.js — locating a waypoint, and filling in what it is.
 *
 * Everything here is the geocoding half of the Waypoints page, lifted out of
 * mc/data/waypoints.html on 2026-08-08 so the Path Builder can do the same
 * work while that page is folded into it. It is PURE LOGIC: no DOM, no page
 * state, no Supabase. A caller hands it a waypoint-shaped object
 *
 *     { name, address, city, state, zip, description, lat, lon }
 *
 * and gets points, patches and suggestions back. What to do with them - paint
 * a card, open a popup, PATCH a row - belongs to the page.
 *
 * WHY A MODULE AND NOT A COPY. This codebase already carries the Plus Code
 * codec twice and the waypoints import helper twice, each with a standing
 * "keep them in sync" note, and CLAUDE.md records what that costs. The
 * merge is the moment to stop adding to the pile: waypoints.html keeps its
 * inline copy only until it is deleted, and nothing new should be written
 * against that copy.
 *
 *   TgbWaypointGeo.pointFor(row, opts)      -> {lat, lon} | null   (no network)
 *   TgbWaypointGeo.locate(row)              -> {lat, lon} | null   (network)
 *   TgbWaypointGeo.fill(row, opts)          -> {filled[], zipApprox, error}
 *   TgbWaypointGeo.suggestWalk(points)      -> {order[], metres}
 *   plus the Plus Code codec and the small helpers those need.
 *
 * NOMINATIM'S RULE IS ONE REQUEST A SECOND and it is a usage policy, not a
 * rate limiter to route around. Every multi-step path here pauses between
 * calls. Do not parallelise them.
 */
(function (global) {
  'use strict';

  var GEO_STORE_KEY = 'tgb_waypoint_geo_v1';
  var GEO_STORE_MAX = 800;

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  var pause = function () { return new Promise(function (r) { setTimeout(r, 1100); }); };

  // ── Plus Codes ─────────────────────────────────────────────────────────────
  // A waypoint's Address may hold a Google Plus Code instead of a street: some
  // stops genuinely have no street address (a monument in a park, a trailhead,
  // a bench with a plaque), and a Plus Code names the exact spot without
  // inventing a street number for it. Mirrors the codec in mc/builder.html.

  var OLC_ALPHABET = '23456789CFGHJMPQRVWX';
  var OLC_BASE_ = 20;
  var OLC_SEP_POS_ = 8;
  var OLC_PAIR_LEN_ = 10;
  var OLC_MAX_LEN_ = 15;
  var OLC_GRID_COLS_ = 4;
  var OLC_GRID_ROWS_ = 5;
  var OLC_PAIR_PREC_ = Math.pow(OLC_BASE_, 3);
  var OLC_GRID_CODE_LEN_ = OLC_MAX_LEN_ - OLC_PAIR_LEN_;
  var OLC_FINAL_LAT_PREC_ = OLC_PAIR_PREC_ * Math.pow(OLC_GRID_ROWS_, OLC_GRID_CODE_LEN_);
  var OLC_FINAL_LNG_PREC_ = OLC_PAIR_PREC_ * Math.pow(OLC_GRID_COLS_, OLC_GRID_CODE_LEN_);

  function parseLatLon(text) {
    var m = cleanText(text).match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!m) return null;
    var lat = parseFloat(m[1]);
    var lon = parseFloat(m[2]);
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon };
  }

  function decodePlusCode(text) {
    var match = cleanText(text).toUpperCase().replace(/\s+/g, '')
      .match(/[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}/);
    if (!match) return null;
    var code = match[0];
    if (code.indexOf('+') !== 8 || code.indexOf('0') > -1) return null; // full code, no padding
    var digits = code.replace('+', '');
    for (var c = 0; c < digits.length; c += 1) {
      if (OLC_ALPHABET.indexOf(digits.charAt(c)) === -1) return null;
    }
    var southLat = 0, westLng = 0, latRes = 400, lngRes = 400, i = 0;
    while (i < digits.length) {
      if (i < 10) {
        latRes /= 20; lngRes /= 20;
        southLat += OLC_ALPHABET.indexOf(digits.charAt(i)) * latRes;
        if (i + 1 < digits.length) westLng += OLC_ALPHABET.indexOf(digits.charAt(i + 1)) * lngRes;
        i += 2;
      } else {
        var d = OLC_ALPHABET.indexOf(digits.charAt(i));
        latRes /= 5; lngRes /= 4;
        southLat += Math.floor(d / 4) * latRes;
        westLng += (d % 4) * lngRes;
        i += 1;
      }
    }
    var lat = (southLat - 90) + latRes / 2;
    var lon = (westLng - 180) + lngRes / 2;
    if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) };
  }

  // Default length 11 (~3.5 m), the same default the builder uses so a code
  // copied between them matches.
  function encodePlusCode(latitude, longitude, codeLength) {
    if (!isFinite(latitude) || !isFinite(longitude)) return '';
    codeLength = Math.min(OLC_MAX_LEN_, codeLength || OLC_PAIR_LEN_ + 1);
    var lat = Math.min(90, Math.max(-90, latitude));
    var lon = longitude;
    while (lon < -180) lon += 360;
    while (lon >= 180) lon -= 360;
    if (lat === 90) lat -= 1 / OLC_FINAL_LAT_PREC_;
    var latVal = Math.floor(Math.round((lat + 90) * OLC_FINAL_LAT_PREC_ * 1e6) / 1e6);
    var lngVal = Math.floor(Math.round((lon + 180) * OLC_FINAL_LNG_PREC_ * 1e6) / 1e6);
    var code = '';
    for (var i = 0; i < OLC_GRID_CODE_LEN_; i += 1) {
      var ndx = (latVal % OLC_GRID_ROWS_) * OLC_GRID_COLS_ + (lngVal % OLC_GRID_COLS_);
      code = OLC_ALPHABET.charAt(ndx) + code;
      latVal = Math.floor(latVal / OLC_GRID_ROWS_);
      lngVal = Math.floor(lngVal / OLC_GRID_COLS_);
    }
    for (var j = 0; j < OLC_PAIR_LEN_ / 2; j += 1) {
      code = OLC_ALPHABET.charAt(lngVal % OLC_BASE_) + code;
      code = OLC_ALPHABET.charAt(latVal % OLC_BASE_) + code;
      latVal = Math.floor(latVal / OLC_BASE_);
      lngVal = Math.floor(lngVal / OLC_BASE_);
    }
    code = code.substring(0, OLC_SEP_POS_) + '+' + code.substring(OLC_SEP_POS_);
    return code.substring(0, codeLength + 1);
  }

  // A SHORT code ("CWC8+R9" - the form Google Maps shows and people paste) is
  // ambiguous across the globe on its own, so it is recovered against a nearby
  // reference point. That is why the city matters.
  function recoverNearestPlusCode(shortCode, refLat, refLon) {
    if (!isFinite(refLat) || !isFinite(refLon)) return null;
    var code = cleanText(shortCode).toUpperCase().replace(/\s+/g, '');
    var sepIdx = code.indexOf('+');
    if (sepIdx < 0 || sepIdx >= OLC_SEP_POS_) return null;   // not short
    if (code.indexOf('0') > -1) return null;
    var paddingLength = OLC_SEP_POS_ - sepIdx;
    var resolution = Math.pow(OLC_BASE_, 2 - (paddingLength / 2));
    var halfRes = resolution / 2;
    var reconstructed = encodePlusCode(refLat, refLon, OLC_PAIR_LEN_).substring(0, paddingLength) + code;
    var area = decodePlusCode(reconstructed);
    if (!area) return null;
    var lat = area.lat;
    var lon = area.lon;
    if (refLat + halfRes < lat && lat - resolution >= -90) lat -= resolution;
    else if (refLat - halfRes > lat && lat + resolution <= 90) lat += resolution;
    if (refLon + halfRes < lon) lon -= resolution;
    else if (refLon - halfRes > lon) lon += resolution;
    return { lat: parseFloat(lat.toFixed(6)), lon: parseFloat(lon.toFixed(6)) };
  }

  function looksLikePlusCode(text) {
    return /^[23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3}$/i
      .test(cleanText(text).replace(/\s+/g, ''));
  }
  function isShortPlusCode(text) {
    var c = cleanText(text).replace(/\s+/g, '');
    return looksLikePlusCode(c) && c.indexOf('+') < OLC_SEP_POS_;
  }
  // Coordinates or a full Plus Code -> a point, with no network at all.
  function addressToPoint(text) {
    return parseLatLon(text) || decodePlusCode(text) || null;
  }

  // ── The localStorage point cache ───────────────────────────────────────────
  // Secondary to the stored lat/lon columns, which are what actually made the
  // map fast: this only ever helps the machine that already sat through the
  // geocoding once.
  var geoStore = null;
  function loadGeoStore() {
    if (geoStore) return geoStore;
    try {
      var raw = JSON.parse(localStorage.getItem(GEO_STORE_KEY) || '{}');
      geoStore = (raw && typeof raw === 'object') ? raw : {};
    } catch (error) { geoStore = {}; }
    return geoStore;
  }
  function geoStoreGet(key) {
    var hit = loadGeoStore()[key];
    return (hit && isFinite(hit.lat) && isFinite(hit.lon)) ? hit : null;
  }
  function geoStoreSet(key, point) {
    var store = loadGeoStore();
    if (!point) return;
    store[key] = { lat: point.lat, lon: point.lon, precise: point.precise !== false, at: Date.now() };
    var keys = Object.keys(store);
    if (keys.length > GEO_STORE_MAX) {
      // Oldest out first. A cache that grows without bound eventually blows the
      // 5 MB localStorage quota and every write starts throwing.
      keys.sort(function (a, b) { return (store[a].at || 0) - (store[b].at || 0); })
        .slice(0, keys.length - GEO_STORE_MAX)
        .forEach(function (k) { delete store[k]; });
    }
    try { localStorage.setItem(GEO_STORE_KEY, JSON.stringify(store)); } catch (error) {}
  }
  function geoKeyFor(row) {
    return [cleanText(row.address), cleanText(row.city), cleanText(row.state), cleanText(row.zip)]
      .join('|').toLowerCase();
  }

  // A row's point without touching the network. opts.reference supplies a
  // nearby point for recovering a SHORT Plus Code - the caller knows its own
  // catalogue and can offer a sibling in the same city.
  function pointFor(row, opts) {
    if (!row) return null;
    var options = opts || {};
    // THE STORED POINT WINS. It is why the map is fast: a row located once is
    // placed from data on every later visit, in every browser, by everyone.
    var lat = Number(row.lat);
    var lon = Number(row.lon);
    if (isFinite(lat) && isFinite(lon) && !(lat === 0 && lon === 0)) {
      return { lat: lat, lon: lon, precise: true };
    }
    var local = addressToPoint(cleanText(row.address));
    if (local) return local;
    if (isShortPlusCode(row.address) && options.reference) {
      var recovered = recoverNearestPlusCode(row.address, options.reference.lat, options.reference.lon);
      if (recovered) return recovered;
    }
    return geoStoreGet(geoKeyFor(row));
  }

  // ── Scoring a Nominatim result ─────────────────────────────────────────────
  // Taking the first hit is what used to put the imagery in the wrong spot: a
  // free-text street query usually matches the ROAD, and a road's point is its
  // midpoint. So candidates are scored, and a match that is only a road (or
  // worse, the whole city) loses to one that resolved to a street number.
  var PRECISE_CLASSES = ['building', 'amenity', 'shop', 'tourism', 'leisure', 'historic', 'office', 'craft', 'club'];
  var AREA_TYPES = ['city', 'town', 'village', 'hamlet', 'suburb', 'county', 'state', 'postcode', 'country', 'municipality'];

  function stateAbbrOf(value) {
    var v = cleanText(value).toLowerCase();
    if (!v) return '';
    var geo = global.TgbGeo;
    var options = (geo && typeof geo.usStateOptions === 'function') ? geo.usStateOptions() : [];
    for (var i = 0; i < options.length; i += 1) {
      var o = options[i];
      if (cleanText(o.code).toLowerCase() === v || cleanText(o.name).toLowerCase() === v) return o.code;
    }
    return '';
  }

  // Does a candidate sit in the same place as the row? A postcode from the
  // wrong town is worse than a blank one - it looks entered and checked.
  function sameLocality(addr, row) {
    var city = cleanText(row.city).toLowerCase();
    var state = cleanText(row.state).toLowerCase();
    if (!city && !state) return true;
    var stateKey = function (value) {
      var abbr = stateAbbrOf(value);
      return (abbr || cleanText(value)).toLowerCase();
    };
    var candCities = [addr.city, addr.town, addr.village, addr.hamlet, addr.suburb, addr.municipality, addr.county]
      .map(function (v) { return cleanText(v).toLowerCase(); })
      .filter(Boolean);
    var candState = stateKey(addr.state);
    // A city can be written a dozen ways ("St. Louis" / "City of St. Louis"),
    // so containment either way counts as a match.
    var cityOk = !city || !candCities.length
      || candCities.some(function (c) { return c === city || c.indexOf(city) > -1 || city.indexOf(c) > -1; });
    var stateOk = !state || !candState || candState === stateKey(state);
    return cityOk && stateOk;
  }

  function addressResultScore(hit, row) {
    var addr = hit.address || {};
    // The right street number in the wrong town is the worst possible answer:
    // it looks completely plausible. Never use one.
    if (!sameLocality(addr, row)) return -1;
    // jsonv2 names the field `category`; the older format calls it `class`.
    var cls = cleanText(hit.class || hit.category).toLowerCase();
    var type = cleanText(hit.addresstype || hit.type).toLowerCase();
    var score = 1;
    if (cleanText(addr.house_number)) score += 4;              // pinned to a number
    if (PRECISE_CLASSES.indexOf(cls) > -1) score += 3;         // a named place, not a line
    if (cls === 'highway' || type === 'road') score -= 3;
    if (AREA_TYPES.indexOf(type) > -1) score -= 5;
    return score;
  }

  function addressQuery(row) {
    return [cleanText(row.address), cleanText(row.city), cleanText(row.state), cleanText(row.zip)]
      .filter(Boolean).join(', ');
  }

  async function searchBestPoint(params, row) {
    try {
      var query = new URLSearchParams(Object.assign(
        { format: 'jsonv2', addressdetails: '1', limit: '5' }, params));
      var res = await fetch('https://nominatim.openstreetmap.org/search?' + query.toString(),
        { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return null;
      var arr = await res.json();
      if (!Array.isArray(arr) || !arr.length) return null;
      var best = null;
      arr.forEach(function (hit) {
        var lat = parseFloat(hit.lat);
        var lon = parseFloat(hit.lon);
        if (!isFinite(lat) || !isFinite(lon)) return;
        var score = addressResultScore(hit, row);
        if (score < 0) return;
        if (!best || score > best.score) {
          best = { point: { lat: lat, lon: lon, precise: score >= 5 }, score: score };
        }
      });
      return best;
    } catch (error) { return null; }
  }

  // Where this row actually is. Three ways of asking, best-first, stopping as
  // soon as one comes back precise (a street number or a named building). A
  // merely-adequate answer is kept in case the better-shaped queries find
  // nothing at all.
  var addressPointCache = new Map();
  async function locate(row) {
    // A Plus Code is a point, not a street: it has already been decoded, and
    // handing it to Nominatim as street= burns a request to match nothing.
    var street = looksLikePlusCode(row.address) ? '' : cleanText(row.address);
    var city = cleanText(row.city);
    var state = cleanText(row.state);
    var zip = cleanText(row.zip);
    var name = cleanText(row.name);
    if (!street && !name) return null;

    var key = [street, city, state, zip, name].join('|').toLowerCase();
    if (addressPointCache.has(key)) return addressPointCache.get(key);

    var attempts = [];
    // 1. Structured - the endpoint that actually understands house numbers.
    if (street) {
      var structured = { street: street };
      if (city) structured.city = city;
      if (state) structured.state = state;
      if (zip) structured.postalcode = zip;
      attempts.push(structured);
    }
    // 2. The venue by name at its address - a named building beats a road.
    if (name && (city || state)) {
      attempts.push({ q: [name, street, city, state].filter(Boolean).join(', ') });
    }
    // 3. Plain free text, as a floor.
    if (street) attempts.push({ q: addressQuery(row) });

    var fallback = null;
    var transient = false;
    for (var i = 0; i < attempts.length; i += 1) {
      if (i > 0) await pause();
      var best = await searchBestPoint(attempts[i], row);
      if (!best) { transient = true; continue; }
      if (best.score >= 5) {          // a street number or a named building
        addressPointCache.set(key, best.point);
        return best.point;
      }
      if (!fallback || best.score > fallback.score) fallback = best;
    }
    var result = fallback ? fallback.point : null;
    // Don't cache a miss that may just have been a rate-limited request.
    if (result || !transient) addressPointCache.set(key, result);
    if (result) geoStoreSet(geoKeyFor(row), result);
    return result;
  }

  // ── Fill ───────────────────────────────────────────────────────────────────

  // Ordered lookup queries built from EVERY filled field - richest first, then
  // degrading. Nominatim often needs the venue name dropped to match a street
  // address, so the all-fields query is tried first, then name-less variants.
  function fillQueries(row) {
    var name = cleanText(row.name);
    var address = looksLikePlusCode(row.address) ? '' : cleanText(row.address);
    var city = cleanText(row.city);
    var state = cleanText(row.state);
    var zip = cleanText(row.zip);
    var queries = [];
    var add = function () {
      var q = Array.prototype.slice.call(arguments).map(cleanText).filter(Boolean).join(', ');
      if (q && queries.indexOf(q) === -1) queries.push(q);
    };
    if (address) {
      add(address, city, state, zip);  // most precise
      add(address, zip);
      add(address);
      add(name, address);
    }
    add(name, city, state, zip);
    add(city, state, zip);
    add(city, state);
    add(zip);                          // Nominatim resolves US ZIPs
    add(name);                         // last resort
    return queries;
  }

  async function geocodeFirst(queries) {
    for (var i = 0; i < queries.length; i += 1) {
      if (i > 0) await pause();
      try {
        var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(queries[i])
          + '&format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=1';
        var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!res.ok) continue;
        var arr = await res.json();
        if (Array.isArray(arr) && arr.length) return { place: arr[0], query: queries[i] };
      } catch (error) { /* bad/non-JSON response - try the next query */ }
    }
    return null;
  }

  // US ZIPs are stored as the 5-digit form: OSM sometimes carries ZIP+4, which
  // is more precision than the column means and breaks equality with every
  // other row in the same ZIP. Non-US postcodes are kept verbatim - they have
  // their own shapes ("SW1A 1AA", "75008") and must not be digit-scraped.
  function normalizeZip(value, addr) {
    var raw = cleanText(value);
    if (!raw) return '';
    var country = cleanText(addr && addr.country_code).toLowerCase();
    var looksUS = country === 'us' || (!country && /^\d{5}(-\d{4})?$/.test(raw));
    if (!looksUS) return raw;
    var digits = raw.match(/\d{5}/);
    return digits ? digits[0] : '';
  }

  async function reverseGeocode(lat, lon, zoom) {
    if (!isFinite(lat) || !isFinite(lon)) return null;
    try {
      var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon
        + '&format=jsonv2&addressdetails=1' + (zoom ? '&zoom=' + zoom : '');
      var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return null;
      var data = await res.json();
      return (data && !data.error) ? data : null;
    } catch (error) { return null; }
  }

  async function structuredLookup(row) {
    var street = cleanText(row.address);
    var city = cleanText(row.city);
    var state = cleanText(row.state);
    if (!street || !(city || state)) return null;
    try {
      var params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '1', street: street });
      if (city) params.set('city', city);
      if (state) params.set('state', state);
      var res = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(),
        { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return null;
      var arr = await res.json();
      return (Array.isArray(arr) && arr[0]) ? arr[0] : null;
    } catch (error) { return null; }
  }

  // Best ZIP available, given whatever place/point Fill already resolved.
  // Returns { zip, approx } - approx means it came from a city-level fallback
  // and names the right town but not necessarily the right block. Every step is
  // a network call, hence the pauses.
  async function resolveZip(row, place, point) {
    var fromAddr = function (addr) { return normalizeZip(addr && addr.postcode, addr || {}); };

    // 1. Whatever Fill already matched.
    if (place && place.address) {
      var direct = fromAddr(place.address);
      if (direct) return { zip: direct, approx: false };
    }

    // 2. The exact point, reverse-geocoded at building zoom and then wider. A
    // house has a postcode even when its road does not, and if the building is
    // untagged the enclosing suburb or town usually carries one.
    var lat = point ? point.lat : (place ? parseFloat(place.lat) : NaN);
    var lon = point ? point.lon : (place ? parseFloat(place.lon) : NaN);
    if (isFinite(lat) && isFinite(lon)) {
      var zooms = [18, 16, 14];
      for (var i = 0; i < zooms.length; i += 1) {
        await pause();
        var rev = await reverseGeocode(lat, lon, zooms[i]);
        var zip = rev ? fromAddr(rev.address) : '';
        // Coordinates we already trust - no locality check needed.
        if (zip) return { zip: zip, approx: zooms[i] < 18 && !cleanText(row.address) };
      }
    }

    // 3. The typed address, asked structurally.
    if (cleanText(row.address)) {
      await pause();
      var hit = await structuredLookup(row);
      if (hit && hit.address && sameLocality(hit.address, row)) {
        var hitZip = fromAddr(hit.address);
        if (hitZip) return { zip: hitZip, approx: false };
        var hLat = parseFloat(hit.lat);
        var hLon = parseFloat(hit.lon);
        if (isFinite(hLat) && isFinite(hLon)) {
          await pause();
          var hRev = await reverseGeocode(hLat, hLon, 18);
          var revZip = hRev ? fromAddr(hRev.address) : '';
          if (revZip && sameLocality(hRev.address || {}, row)) return { zip: revZip, approx: false };
        }
      }
    }

    // 4. City centre - a real ZIP for the right town, flagged approximate
    // because a city has many and this is only the one at its middle.
    var city = cleanText(row.city);
    var state = cleanText(row.state);
    if (city) {
      await pause();
      var found = await geocodeFirst([[city, state].filter(Boolean).join(', ')]);
      var cLat = found ? parseFloat(found.place.lat) : NaN;
      var cLon = found ? parseFloat(found.place.lon) : NaN;
      if (isFinite(cLat) && isFinite(cLon)) {
        await pause();
        var cRev = await reverseGeocode(cLat, cLon, 16);
        var cZip = cRev ? fromAddr(cRev.address) : '';
        if (cZip && sameLocality(cRev.address || {}, row)) return { zip: cZip, approx: true };
      }
    }

    return { zip: '', approx: false };
  }

  // ── Describing a place ─────────────────────────────────────────────────────
  var GENERIC_PLACE_TYPES = [
    'house', 'yes', 'residential', 'administrative', 'postcode', 'address',
    'road', 'construction', 'locality', 'neighbourhood', 'suburb', 'town',
    'city', 'village', 'hamlet', 'county', 'state', 'country', 'unclassified'
  ];

  function normalizeName(value) {
    return cleanText(value)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')   // fold accents: Café -> Cafe
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(the|a|an|of|and)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function namesSimilar(a, b) {
    var na = normalizeName(a);
    var nb = normalizeName(b);
    if (!na || !nb) return false;
    return na === nb || na.indexOf(nb) > -1 || nb.indexOf(na) > -1;
  }
  function capitalize(text) {
    var t = cleanText(text);
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }
  function trimSentences(text, maxSentences, maxChars) {
    var parts = String(text).match(/[^.!?]+[.!?]+/g) || [text];
    var out = parts.slice(0, maxSentences).join(' ').trim();
    if (out.length > maxChars) out = out.slice(0, maxChars - 1).replace(/\s+\S*$/, '').trim() + '…';
    return out;
  }
  // An English Wikipedia title from OSM's tag ("en:Madison Square Garden").
  function wikipediaTitle(extratags) {
    var w = cleanText(extratags && extratags.wikipedia);
    if (!w) return '';
    var m = w.match(/^([a-z-]+):(.+)$/i);
    if (m) return m[1].toLowerCase() === 'en' ? cleanText(m[2]) : '';
    return w;
  }
  async function wikidataEnTitle(qid) {
    try {
      var url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids=' + encodeURIComponent(qid)
        + '&props=sitelinks&format=json&origin=*';
      var res = await fetch(url);
      if (!res.ok) return '';
      var data = await res.json();
      var entity = data && data.entities && data.entities[qid];
      var link = entity && entity.sitelinks && entity.sitelinks.enwiki;
      return link ? cleanText(link.title) : '';
    } catch (error) { return ''; }
  }
  async function fetchWikiSummary(title) {
    try {
      var url = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
      var res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return '';
      var data = await res.json();
      if (data && data.type === 'disambiguation') return '';
      var extract = cleanText(data && data.extract);
      return extract ? trimSentences(extract, 2, 320) : '';
    } catch (error) { return ''; }
  }
  function buildLocalDescription(place, addr, row) {
    var extratags = (place && place.extratags) || {};
    var rawType = cleanText(place.type || place.addresstype || place.category).toLowerCase();
    var type = GENERIC_PLACE_TYPES.indexOf(rawType) > -1 ? '' : rawType.replace(/_/g, ' ');
    var cuisine = cleanText(extratags.cuisine).replace(/_/g, ' ').replace(/;/g, ', ');
    var descriptor = [cuisine, type].filter(Boolean).join(' ');
    var name = cleanText(row && row.name) || cleanText(place.name);
    var hood = cleanText(addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district);
    var town = cleanText(addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county);
    var where = [hood, town, cleanText(addr.state)].filter(Boolean).join(', ');
    if (name && descriptor && where) return name + ', a ' + descriptor + ' in ' + where + '.';
    if (name && where) return name + ' in ' + where + '.';
    if (descriptor && where) return capitalize(descriptor) + ' in ' + where + '.';
    if (where) return where + '.';
    return cleanText(place.display_name);
  }
  // A real Wikipedia summary ONLY when the article is actually about this
  // waypoint (its name matches the geocoded place, or it has no name yet).
  // Otherwise a geocoded address drags in the article for a containing building
  // or a nearby landmark - the wrong place.
  async function resolveDescription(place, addr, row) {
    var extratags = (place && place.extratags) || {};
    var rowName = cleanText(row && row.name);
    var samePlace = !rowName || namesSimilar(rowName, cleanText(place && place.name));
    if (samePlace) {
      var title = wikipediaTitle(extratags);
      if (!title && /^Q\d+$/.test(cleanText(extratags.wikidata))) {
        title = await wikidataEnTitle(cleanText(extratags.wikidata));
      }
      if (title) {
        var summary = await fetchWikiSummary(title);
        if (summary) return summary;
      }
    }
    return buildLocalDescription(place, addr, row);
  }

  function placeName(place, addr) {
    var nd = place && place.namedetails;
    var direct = cleanText(place && place.name) || cleanText(nd && (nd.name || nd['name:en']));
    if (direct) return direct;
    var street = [cleanText(addr.house_number), cleanText(addr.road)].filter(Boolean).join(' ');
    if (street) return street;
    var hood = cleanText(addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district);
    if (hood) return hood;
    var town = cleanText(addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.county);
    if (town) return town;
    var dn = cleanText(place && place.display_name);
    return dn ? dn.split(',')[0].trim() : '';
  }

  // Fill `row` from a geocoded `place` (+ optional precise `point`). With
  // overwrite=false only blank fields are set. Returns the fields it touched.
  async function fillFieldsFromPlace(row, place, point, overwrite) {
    var addr = place.address || {};
    var lat = point ? point.lat : parseFloat(place.lat);
    var lon = point ? point.lon : parseFloat(place.lon);
    var hasCoords = isFinite(lat) && isFinite(lon);

    var name = cleanText(placeName(place, addr));
    var city = cleanText(addr.city || addr.town || addr.village || addr.hamlet
      || addr.suburb || addr.municipality || addr.county);
    // THE CODE, NOT THE NAME. Nominatim answers "Florida"; all 280-odd rows in
    // public.waypoints hold "FL". Writing the long form makes a row that looks
    // fine on its own and sorts, groups and matches differently from every
    // other row in its state. Non-US regions have no code and keep their name.
    var state = stateAbbrOf(addr.state) || cleanText(addr.state);
    var zip = normalizeZip(addr.postcode, addr);
    // Address is the STREET ONLY (house number + road) - city/state/zip live in
    // their own fields. If the reverse geocode has no street, leave it blank so
    // the missing-address check finds it. It used to fall back to a "lat, lon"
    // string, which put coordinates in a field nothing could parse or geocode.
    var address = [cleanText(addr.house_number), cleanText(addr.road)].filter(Boolean).join(' ');

    if (overwrite) {
      var description = cleanText(await resolveDescription(place, addr, { name: name }));
      row.name = name;
      row.city = city;
      row.state = state;
      row.zip = zip;
      row.address = address;
      row.description = description;
      if (hasCoords) { row.lat = round6(lat); row.lon = round6(lon); }
      return ['name', 'city', 'state', 'zip', 'address', 'description'];
    }

    var filled = [];
    var setIfBlank = function (field, value) {
      var v = cleanText(value);
      if (v && !cleanText(row[field])) { row[field] = v; filled.push(field); }
    };
    setIfBlank('name', name);
    setIfBlank('city', city);
    setIfBlank('state', state);
    setIfBlank('zip', zip);
    setIfBlank('address', address);
    if (!cleanText(row.description)) {
      var desc = await resolveDescription(place, addr, row);
      if (desc) { row.description = desc; filled.push('description'); }
    }
    if (hasCoords && !(isFinite(Number(row.lat)) && isFinite(Number(row.lon)))) {
      row.lat = round6(lat);
      row.lon = round6(lon);
    }
    return filled;
  }

  // THE WHOLE FILL, with no DOM in it. Mutates `row` and reports what changed:
  //
  //   { filled: [fields], zipApprox: bool, error: '' }
  //
  // A precise point (coordinates / Plus Code) takes priority; otherwise the
  // richest text query is tried first, degrading until one hits. Existing
  // values are kept unless opts.overwrite.
  async function fill(row, opts) {
    var options = opts || {};
    var geoFields = ['name', 'city', 'state', 'zip', 'address', 'description'];
    var blanks = geoFields.filter(function (f) { return !cleanText(row[f]); });
    if (!blanks.length && !options.overwrite) {
      return { filled: [], zipApprox: false, error: '', complete: true };
    }
    var point = pointFor(row, options);
    var queries = fillQueries(row);
    if (!point && !queries.length) {
      return { filled: [], zipApprox: false, error: 'Fill in a name or address first.' };
    }
    var place;
    if (point) {
      // A precise point wins - reverse-geocode it.
      var url = 'https://nominatim.openstreetmap.org/reverse?lat=' + point.lat + '&lon=' + point.lon
        + '&format=jsonv2&addressdetails=1&extratags=1&namedetails=1';
      var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      place = await res.json();
      if (!place || place.error) {
        return { filled: [], zipApprox: false, error: 'No place found at that point.' };
      }
    } else {
      var found = await geocodeFirst(queries);
      if (!found) return { filled: [], zipApprox: false, error: 'No match found for this waypoint.' };
      place = found.place;
    }
    var filled = await fillFieldsFromPlace(row, place, point, !!options.overwrite);
    // A match with no postcode is the common case, not a dead end - chase the
    // ZIP separately before reporting what Fill managed to get.
    var zipApprox = false;
    if (!cleanText(row.zip)) {
      if (typeof options.onStage === 'function') options.onStage('zip');
      var guess = await resolveZip(row, place, point);
      if (guess.zip) {
        row.zip = guess.zip;
        zipApprox = guess.approx;
        filled.push('zip');
      }
    }
    return { filled: filled, zipApprox: zipApprox, error: '' };
  }

  // ── Distance and the walk solver ───────────────────────────────────────────
  function haversineMeters(lat1, lon1, lat2, lon2) {
    var toRad = function (d) { return d * Math.PI / 180; };
    var R = 6371000;
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.pow(Math.sin(dLat / 2), 2)
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.pow(Math.sin(dLon / 2), 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Nearest neighbour, then 2-opt until it stops improving. Nearest neighbour
  // alone paints itself into a corner and crosses the city to collect what it
  // skipped; 2-opt removes exactly those crossings. It is an OPEN walk - you
  // need not end where you started - so the ends are never joined.
  //
  // Returns { order: [indices into points], metres }.
  function suggestWalk(points) {
    var n = points.length;
    if (n < 3) return { order: points.map(function (_, i) { return i; }), metres: 0 };

    var dist = function (i, j) {
      return haversineMeters(points[i].lat, points[i].lon, points[j].lat, points[j].lon);
    };
    // Start from the northernmost point: arbitrary, but STABLE, so the same
    // city always gives the same walk.
    var start = 0;
    for (var s = 1; s < n; s += 1) if (points[s].lat > points[start].lat) start = s;

    var unvisited = new Set(points.map(function (_, i) { return i; }));
    var tour = [start];
    unvisited.delete(start);
    while (unvisited.size) {
      var last = tour[tour.length - 1];
      var best = null;
      var bestD = Infinity;
      unvisited.forEach(function (i) {
        var d = dist(last, i);
        if (d < bestD) { bestD = d; best = i; }
      });
      tour.push(best);
      unvisited.delete(best);
    }

    var legs = function (t) {
      var sum = 0;
      for (var i = 0; i < t.length - 1; i += 1) sum += dist(t[i], t[i + 1]);
      return sum;
    };
    var improved = true;
    var guard = 0;
    while (improved && guard < 60) {
      improved = false;
      guard += 1;
      for (var i = 0; i < tour.length - 2; i += 1) {
        for (var k = i + 2; k < tour.length; k += 1) {
          var before = dist(tour[i], tour[i + 1])
            + (k + 1 < tour.length ? dist(tour[k], tour[k + 1]) : 0);
          var after = dist(tour[i], tour[k])
            + (k + 1 < tour.length ? dist(tour[i + 1], tour[k + 1]) : 0);
          if (after + 0.01 < before) {
            var seg = tour.slice(i + 1, k + 1).reverse();
            tour.splice.apply(tour, [i + 1, seg.length].concat(seg));
            improved = true;
          }
        }
      }
    }
    return { order: tour, metres: Math.round(legs(tour)) };
  }

  // Miles, because every city in this table is in the US and a walk is
  // something a person estimates in blocks and minutes, not kilometres.
  function formatWalkDistance(metres) {
    var miles = metres / 1609.344;
    var mins = Math.round(metres / 80);   // ~3 mph, the usual walking figure
    return (miles < 0.1 ? '<0.1' : miles.toFixed(1)) + ' mi · about ' + mins + ' min walking';
  }

  // Google Maps for a waypoint, asked BY ADDRESS - the official Maps URL search
  // form, so Google geocodes it and shows the place exactly as it would for
  // someone typing it in. Coordinates are the fallback only.
  function googleMapsUrl(row, point) {
    var q = addressQuery(row) || cleanText(row.name);
    if (q) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
    if (point && isFinite(point.lat) && isFinite(point.lon)) {
      return 'https://www.google.com/maps/search/?api=1&query=' + point.lat + ',' + point.lon;
    }
    return '';
  }

  // ── Telling two places apart ───────────────────────────────────────────────
  // Used before adding anything: the catalogue is the same place twice more
  // often than it is two places with similar names, and a duplicate is very
  // hard to notice later - both rows look correct.

  function dedupKey(value) {
    return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    var prev = new Array(n + 1);
    for (var j = 0; j <= n; j += 1) prev[j] = j;
    for (var i = 1; i <= m; i += 1) {
      var cur = [i];
      for (var k = 1; k <= n; k += 1) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost);
      }
      prev = cur;
    }
    return prev[n];
  }

  function dedupSimilarity(rawA, rawB) {
    var a = dedupKey(rawA), b = dedupKey(rawB);
    if (!a || !b) return 0;
    if (a === b) return 1;
    // Containment ("Cafe du Monde" vs "Cafe du Monde Decatur St") counts high.
    if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return 0.95;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  // Leading house number ("800 Decatur St" -> "800"). Empty when there is none.
  function houseNumber(value) {
    var m = cleanText(value).match(/^\s*#?\s*(\d{1,6})\b/);
    return m ? m[1] : '';
  }
  // Two addresses with DIFFERENT house numbers are not the same place, however
  // well the rest of the street matches. Missing numbers do not conflict.
  function streetNumbersConflict(a, b) {
    var na = houseNumber(a), nb = houseNumber(b);
    return !!(na && nb && na !== nb);
  }
  function addressSimilarity(a, b) {
    if (!cleanText(a) || !cleanText(b)) return 0;
    if (streetNumbersConflict(a, b)) return 0;
    return dedupSimilarity(a, b);
  }

  var DEDUP_NAME_T = 0.86;
  var DEDUP_ADDR_T = 0.92;

  // The first existing row that looks like `candidate`, or null. ADDRESS ALONE
  // is deliberately not enough to match on elsewhere in this product (one
  // address is routinely several stops - a museum and the sculpture outside
  // it), which is why the address threshold is the higher of the two and a
  // conflicting house number vetoes outright.
  function findSimilar(candidate, rows) {
    var name = cleanText(candidate && candidate.name);
    var address = cleanText(candidate && candidate.address);
    if (!name && !address) return null;
    var list = rows || [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row) continue;
      var nameSim = (name && cleanText(row.name)) ? dedupSimilarity(name, row.name) : 0;
      var addrSim = addressSimilarity(address, row.address);
      if (nameSim >= DEDUP_NAME_T || addrSim >= DEDUP_ADDR_T) {
        return { row: row, reason: nameSim >= addrSim ? 'name' : 'address' };
      }
    }
    return null;
  }

  // ── Finding a place in the world ───────────────────────────────────────────
  // Three ways of asking, because one is not enough: Nominatim knows addresses
  // and famous places, Overpass knows the shop on the corner. A business that
  // Nominatim has never heard of is the normal case, not the edge case.

  // Friendly category words -> OSM tag filters, for "stadium charlotte".
  var CATEGORY_TAGS = {
    stadium: ['leisure=stadium', 'building=stadium'], arena: ['leisure=sports_centre', 'leisure=stadium'],
    park: ['leisure=park'], garden: ['leisure=garden'], playground: ['leisure=playground'],
    museum: ['tourism=museum'], gallery: ['tourism=gallery'], zoo: ['tourism=zoo'], aquarium: ['tourism=aquarium'],
    hotel: ['tourism=hotel'], motel: ['tourism=motel'], hostel: ['tourism=hostel'],
    restaurant: ['amenity=restaurant'], diner: ['amenity=restaurant'], cafe: ['amenity=cafe'], coffee: ['amenity=cafe'],
    bar: ['amenity=bar', 'amenity=pub'], pub: ['amenity=pub'], brewery: ['craft=brewery', 'microbrewery=yes'],
    bakery: ['shop=bakery'], market: ['amenity=marketplace', 'shop=supermarket'], supermarket: ['shop=supermarket'],
    theater: ['amenity=theatre'], theatre: ['amenity=theatre'], cinema: ['amenity=cinema'], movie: ['amenity=cinema'],
    library: ['amenity=library'], church: ['amenity=place_of_worship'], cathedral: ['amenity=place_of_worship'],
    school: ['amenity=school'], university: ['amenity=university'], college: ['amenity=college'],
    hospital: ['amenity=hospital'], pharmacy: ['amenity=pharmacy'], bank: ['amenity=bank'],
    bookstore: ['shop=books'], bookshop: ['shop=books'], store: ['shop'], shop: ['shop'], mall: ['shop=mall'],
    monument: ['historic=monument', 'historic=memorial'], memorial: ['historic=memorial'],
    statue: ['tourism=artwork', 'historic=memorial'], landmark: ['tourism=attraction'], attraction: ['tourism=attraction'],
    golf: ['leisure=golf_course'], gym: ['leisure=fitness_centre'], pool: ['leisure=swimming_pool'],
    cemetery: ['landuse=cemetery', 'amenity=grave_yard'], hall: ['amenity=townhall'], 'city hall': ['amenity=townhall']
  };

  // Nearness in walking steps (~2,000 steps per mile), or miles once it is far.
  function formatDistance(m) {
    var miles = m / 1609.34;
    if (miles >= 0.25) return miles.toFixed(1) + ' mi';
    var steps = Math.max(1, Math.round(miles * 2000));
    return steps + (steps === 1 ? ' step' : ' steps');
  }

  async function nominatimSearch(query) {
    var variants = [query];
    if (query.indexOf(',') >= 0) variants.push(query.replace(/,/g, ' ').replace(/\s+/g, ' ').trim());
    for (var i = 0; i < variants.length; i += 1) {
      if (i > 0) await pause();
      var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(variants[i])
        + '&format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=10';
      var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      var arr = await res.json();
      if (Array.isArray(arr) && arr.length) return arr;
    }
    return [];
  }

  // Pull a category keyword out of the query; the rest is the location.
  function parseCategory(query) {
    var words = String(query).toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    var term = null, tags = null, idx = -1;
    for (var i = 0; i < words.length; i += 1) {
      if (CATEGORY_TAGS[words[i]]) { term = words[i]; tags = CATEGORY_TAGS[words[i]]; idx = i; break; }
    }
    if (!term) return null;
    var connectors = ['near', 'in', 'around', 'by', 'at', 'close', 'to', 'the', 'of', 'a'];
    var location = words.filter(function (w, i) {
      return i !== idx && connectors.indexOf(w) === -1;
    }).join(' ').trim();
    return { term: term, tags: tags, location: location };
  }

  async function geocodePlace(q) {
    var url = 'https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q)
      + '&format=jsonv2&addressdetails=1&limit=1';
    var res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    var arr = await res.json();
    var p = (Array.isArray(arr) && arr[0]) || null;
    if (!p) return null;
    var bb = p.boundingbox;
    return {
      center: { lat: parseFloat(p.lat), lon: parseFloat(p.lon) },
      bbox: bb ? { s: parseFloat(bb[0]), n: parseFloat(bb[1]), w: parseFloat(bb[2]), e: parseFloat(bb[3]) } : null,
      addr: p.address || {},
      label: cleanText(p.display_name).split(',').slice(0, 2).join(', ')
    };
  }

  function poisFromOverpass(data, center, catKeys) {
    var seen = {};
    var out = [];
    (data.elements || []).forEach(function (elem) {
      var t = elem.tags || {};
      var nm = cleanText(t.name);
      if (!nm) return;
      var plat = elem.lat != null ? elem.lat : (elem.center && elem.center.lat);
      var plon = elem.lon != null ? elem.lon : (elem.center && elem.center.lon);
      if (plat == null || plon == null) return;
      var key = nm.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var cat = '';
      for (var i = 0; i < catKeys.length && !cat; i += 1) cat = cleanText(t[catKeys[i]]);
      out.push({
        name: nm, cat: cat.replace(/_/g, ' '), lat: plat, lon: plon, tags: t,
        dist: haversineMeters(center.lat, center.lon, plat, plon)
      });
    });
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out;
  }

  async function overpass(query) {
    var res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!res.ok) throw new Error('Overpass ' + res.status);
    return res.json();
  }

  async function fetchCategoryPois(tags, bbox, center) {
    var bb = bbox.s + ',' + bbox.w + ',' + bbox.n + ',' + bbox.e; // south,west,north,east
    var filters = tags.map(function (t) {
      var parts = t.split('=');
      return parts[1] ? '["' + parts[0] + '"="' + parts[1] + '"]' : '["' + parts[0] + '"]';
    });
    var q = '[out:json][timeout:25];('
      + filters.map(function (f) {
        return 'node' + f + '["name"](' + bb + ');way' + f + '["name"](' + bb + ');';
      }).join('')
      + ');out center tags 50;';
    var data = await overpass(q);
    return poisFromOverpass(data, center,
      ['amenity', 'leisure', 'tourism', 'shop', 'historic', 'building']).slice(0, 30);
  }

  async function fetchNamedPois(name, bbox, center) {
    var bb = bbox.s + ',' + bbox.w + ',' + bbox.n + ',' + bbox.e;
    var safe = name.replace(/[^\p{L}\p{N}]+/gu, '.').replace(/^\.+|\.+$/g, ''); // lenient; trim seps
    if (!safe) return [];
    var q = '[out:json][timeout:25];(nwr["name"~"' + safe + '",i](' + bb + '););out center tags 30;';
    var data = await overpass(q);
    return poisFromOverpass(data, center,
      ['shop', 'amenity', 'leisure', 'tourism', 'historic', 'office', 'craft']).slice(0, 30);
  }

  function localityOf(geo) {
    var a = geo.addr || {};
    return {
      city: cleanText(a.city || a.town || a.village || a.municipality || a.county),
      state: cleanText(a.state)
    };
  }

  async function categorySearch(query) {
    var parsed = parseCategory(query);
    if (!parsed || !parsed.location) return null;
    var geo = await geocodePlace(parsed.location);
    if (!geo || !geo.bbox) return null;
    var pois = await fetchCategoryPois(parsed.tags, geo.bbox, geo.center);
    var fallback = localityOf(geo);
    return {
      label: '"' + parsed.term + '" in ' + geo.label,
      items: pois.map(function (poi) {
        return {
          kind: 'poi', poi: poi, fallback: fallback, name: poi.name,
          sub: [poi.cat, formatDistance(poi.dist) + ' away'].filter(Boolean).join(' · ')
        };
      })
    };
  }

  // Find a business by name within a place. Tries the last 1-3 words as the
  // location and the rest as the name, then Overpass name-matches inside that
  // bounding box. Catches the names Nominatim does not index.
  async function nameSearch(query) {
    var tries = [];
    var ci = query.lastIndexOf(',');
    if (ci > 0) {
      var cnm = cleanText(query.slice(0, ci));
      var cloc = cleanText(query.slice(ci + 1));
      if (cnm && cloc) tries.push({ nm: cnm, loc: cloc });
    }
    var words = cleanText(query).replace(/,/g, ' ').replace(/\s+/g, ' ').split(' ').filter(Boolean);
    for (var take = Math.min(3, words.length - 1); take >= 1; take -= 1) {
      var loc = words.slice(words.length - take).join(' ');
      var nm = words.slice(0, words.length - take).join(' ');
      if (nm && loc) tries.push({ nm: nm, loc: loc });
    }
    var seen = {};
    for (var i = 0; i < tries.length; i += 1) {
      var key = tries[i].nm.toLowerCase() + '|' + tries[i].loc.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      var geo = await geocodePlace(tries[i].loc);
      if (!geo || !geo.bbox) continue;
      var pois = await fetchNamedPois(tries[i].nm, geo.bbox, geo.center);
      if (pois.length) {
        var fallback = localityOf(geo);
        return {
          items: pois.map(function (poi) {
            return {
              kind: 'poi', poi: poi, fallback: fallback, name: poi.name,
              sub: [poi.cat, formatDistance(poi.dist) + ' away'].filter(Boolean).join(' · ')
            };
          })
        };
      }
    }
    return null;
  }

  // THE WHOLE SEARCH: named matches first, category matches appended when the
  // text contains a category word, and the Overpass name search only as a last
  // resort - it is the slowest and the least precise.
  // EVERY STAGE FAILS SOFT, and that is not defensive habit - it is the whole
  // reliability story of this function. Overpass is a free public endpoint that
  // returns 504 whenever it feels busy, and the first cut let that reject the
  // search, throwing away the Nominatim matches already in hand and showing
  // "Overpass 504" to somebody who only wanted to add a museum. Each source is
  // now independent, and `sources` reports which ones actually answered so the
  // page can say "some of the search failed" rather than pretending or dying.
  async function search(query) {
    var q = cleanText(query);
    if (!q) return { items: [], sources: {}, failed: [] };
    var items = [];
    var failed = [];
    var sources = { nominatim: false, category: false, name: false };

    try {
      var named = await nominatimSearch(q);
      sources.nominatim = true;
      items = named.map(function (p) {
        var addr = p.address || {};
        return {
          kind: 'place', place: p,
          name: placeName(p, addr) || cleanText(p.display_name).split(',')[0],
          sub: cleanText(p.display_name)
        };
      });
    } catch (error) { failed.push('the address search'); }

    if (parseCategory(q)) {
      try {
        var cat = await categorySearch(q);
        sources.category = true;
        if (cat && cat.items.length) {
          var seen = {};
          items.forEach(function (i) { seen[i.name.toLowerCase()] = true; });
          items = items.concat(cat.items.filter(function (i) { return !seen[i.name.toLowerCase()]; }));
        }
      } catch (error) { failed.push('the category search'); }
    }

    // Last resort only: it is the slowest of the three and the least precise.
    if (!items.length) {
      try {
        var nm = await nameSearch(q);
        sources.name = true;
        if (nm && nm.items.length) items = nm.items;
      } catch (error) { failed.push('the by-name search'); }
    }

    return { items: items, sources: sources, failed: failed };
  }

  // A search result -> a waypoint-shaped draft, ready for the editor. Nothing
  // is written: the point of reviewing before inserting is that the geocoder is
  // often nearly right, and nearly right is what fills a catalogue with rubbish.
  async function draftFromResult(item) {
    var draft = {
      wpid: '', name: '', city: '', state: '', zip: '', address: '',
      description: '', source_url: '', archived: false, lat: null, lon: null
    };
    if (!item) return draft;
    if (item.kind === 'place') {
      var lat = parseFloat(item.place.lat);
      var lon = parseFloat(item.place.lon);
      var point = (isFinite(lat) && isFinite(lon)) ? { lat: lat, lon: lon } : null;
      await fillFieldsFromPlace(draft, item.place, point, true);
      return draft;
    }
    // An Overpass POI carries its own address tags, which are better than a
    // reverse geocode when they are there, and absent more often than not.
    var t = (item.poi && item.poi.tags) || {};
    var fallback = item.fallback || {};
    draft.name = cleanText(item.poi.name);
    draft.address = [cleanText(t['addr:housenumber']), cleanText(t['addr:street'])].filter(Boolean).join(' ');
    draft.city = cleanText(t['addr:city']) || cleanText(fallback.city);
    draft.state = cleanText(t['addr:state']) || cleanText(fallback.state);
    draft.zip = normalizeZip(t['addr:postcode'], {});
    draft.description = item.poi.cat
      ? draft.name + ', a ' + item.poi.cat + (draft.city ? ' in ' + draft.city : '') + '.'
      : '';
    if (isFinite(item.poi.lat) && isFinite(item.poi.lon)) {
      draft.lat = round6(item.poi.lat);
      draft.lon = round6(item.poi.lon);
    }
    return draft;
  }

  global.TgbWaypointGeo = {
    cleanText: cleanText,
    round6: round6,
    stateAbbrOf: stateAbbrOf,
    // Plus Codes / coordinates
    parseLatLon: parseLatLon,
    decodePlusCode: decodePlusCode,
    encodePlusCode: encodePlusCode,
    recoverNearestPlusCode: recoverNearestPlusCode,
    looksLikePlusCode: looksLikePlusCode,
    isShortPlusCode: isShortPlusCode,
    addressToPoint: addressToPoint,
    // Points
    pointFor: pointFor,
    locate: locate,
    addressQuery: addressQuery,
    googleMapsUrl: googleMapsUrl,
    // Fill
    fill: fill,
    fillFieldsFromPlace: fillFieldsFromPlace,
    resolveZip: resolveZip,
    reverseGeocode: reverseGeocode,
    geocodeFirst: geocodeFirst,
    normalizeZip: normalizeZip,
    resolveDescription: resolveDescription,
    placeName: placeName,
    namesSimilar: namesSimilar,
    // Finding a place, and telling it apart from one we hold
    search: search,
    draftFromResult: draftFromResult,
    findSimilar: findSimilar,
    dedupSimilarity: dedupSimilarity,
    addressSimilarity: addressSimilarity,
    formatDistance: formatDistance,
    // Geometry
    haversineMeters: haversineMeters,
    suggestWalk: suggestWalk,
    formatWalkDistance: formatWalkDistance
  };
}(window));
