/* Public Supabase backup fallback.
   Live Supabase stays primary. If a public REST GET fails, this wrapper tries
   the latest static backup snapshot from /mc/backups/. Keep this list limited to
   data that is already safe for browser delivery. */
(function (root) {
  'use strict';

  if (!root || root.__tgbSupabaseFallbackInstalled || typeof root.fetch !== 'function') return;

  var SUPABASE_ORIGIN = 'https://qmaafbncpzrdmqapkkgr.supabase.co';
  var FALLBACK_RELATIONS = {
    games: ['/mc/backups/supabase-games-latest.json'],
    games_with_teams: [
      '/mc/backups/supabase-games_with_teams-latest.json',
      '/mc/backups/supabase-games-latest.json'
    ],
    games_with_graph: ['/mc/backups/supabase-games_with_graph-latest.json'],
    games_with_graph_and_teams: [
      '/mc/backups/supabase-games_with_graph_and_teams-latest.json',
      '/mc/backups/supabase-games_with_graph-latest.json'
    ],
    teams: ['/mc/backups/supabase-teams-latest.json']
  };
  var originalFetch = root.fetch.bind(root);

  function requestMethod(input, init) {
    return String(
      (init && init.method) ||
      (input && typeof input === 'object' && input.method) ||
      'GET'
    ).toUpperCase();
  }

  function requestUrl(input) {
    var value = input && typeof input === 'object' && 'url' in input ? input.url : input;
    try { return new URL(String(value), root.location && root.location.href || undefined); }
    catch (error) { return null; }
  }

  function publicRelationFromUrl(url) {
    if (!url || url.origin !== SUPABASE_ORIGIN) return '';
    var match = url.pathname.match(/^\/rest\/v1\/([^/]+)\/?$/);
    if (!match) return '';
    var relation = decodeURIComponent(match[1]);
    return FALLBACK_RELATIONS[relation] ? relation : '';
  }

  function compareValue(left, right) {
    if (left == null) return right == null || right === '';
    if (typeof left === 'boolean') {
      var normalized = String(right || '').trim().toLowerCase();
      return (left && ['true', '1', 'yes'].indexOf(normalized) >= 0)
        || (!left && ['false', '0', 'no'].indexOf(normalized) >= 0);
    }
    return String(left) === String(right);
  }

  function wildcardToRegex(pattern) {
    var escaped = String(pattern || '').replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$', 'i');
  }

  function splitFilter(value) {
    var index = String(value || '').indexOf('.');
    if (index < 0) return { op: '', value: value };
    return { op: value.slice(0, index), value: value.slice(index + 1) };
  }

  function parseInList(value) {
    var raw = String(value || '').trim();
    if (raw[0] === '(' && raw[raw.length - 1] === ')') raw = raw.slice(1, -1);
    if (!raw) return [];
    return raw.split(',').map(function (item) {
      return item.trim().replace(/^"(.*)"$/, '$1');
    });
  }

  function rowMatchesFilter(row, column, filterValue) {
    var filter = splitFilter(filterValue);
    var value = row && row[column];
    switch (filter.op) {
      case 'eq':
        return compareValue(value, filter.value);
      case 'neq':
        return !compareValue(value, filter.value);
      case 'is':
        if (filter.value === 'null') return value == null;
        if (filter.value === 'true' || filter.value === 'false') return compareValue(value, filter.value);
        return false;
      case 'like':
      case 'ilike':
        return wildcardToRegex(filter.value).test(String(value == null ? '' : value));
      case 'in':
        return parseInList(filter.value).some(function (item) { return compareValue(value, item); });
      default:
        return true;
    }
  }

  function applyFilters(rows, searchParams) {
    var ignored = { apikey: true, select: true, order: true, limit: true, offset: true };
    var next = Array.isArray(rows) ? rows.slice() : [];
    searchParams.forEach(function (value, key) {
      if (ignored[key]) return;
      next = next.filter(function (row) { return rowMatchesFilter(row, key, value); });
    });
    return next;
  }

  function compareRows(column, dir, a, b) {
    var left = a && a[column];
    var right = b && b[column];
    var leftEmpty = left == null || left === '';
    var rightEmpty = right == null || right === '';
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    var result;
    if (typeof left === 'number' && typeof right === 'number') result = left - right;
    else result = String(left).localeCompare(String(right), undefined, { sensitivity: 'base', numeric: true });
    return dir === 'desc' ? -result : result;
  }

  function applyOrder(rows, searchParams) {
    var orders = [];
    searchParams.getAll('order').forEach(function (value) {
      String(value || '').split(',').forEach(function (piece) {
        var parts = piece.trim().split('.');
        var column = parts[0];
        if (!column) return;
        orders.push({ column: column, dir: parts.indexOf('desc') >= 0 ? 'desc' : 'asc' });
      });
    });
    if (!orders.length) return rows;
    return rows.slice().sort(function (a, b) {
      for (var i = 0; i < orders.length; i += 1) {
        var result = compareRows(orders[i].column, orders[i].dir, a, b);
        if (result) return result;
      }
      return 0;
    });
  }

  function applyLimit(rows, searchParams) {
    var offset = Number(searchParams.get('offset') || 0);
    var limitRaw = searchParams.get('limit');
    var limit = limitRaw == null ? rows.length : Number(limitRaw);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    if (!Number.isFinite(limit) || limit < 0) limit = rows.length;
    return rows.slice(offset, offset + limit);
  }

  function queryBackupRows(rows, url) {
    return applyLimit(applyOrder(applyFilters(rows, url.searchParams), url.searchParams), url.searchParams);
  }

  async function readBackupRows(relation) {
    var backupUrls = FALLBACK_RELATIONS[relation] || [];
    var lastError = null;
    for (var i = 0; i < backupUrls.length; i += 1) {
      try {
        var response = await originalFetch(backupUrls[i], {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('backup fallback ' + relation + ' failed: ' + (lastError && lastError.message || 'no snapshot'));
  }

  async function fallbackResponse(relation, url) {
    var rows = await readBackupRows(relation);
    var body = JSON.stringify(queryBackupRows(rows, url));
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-TGB-Supabase-Fallback': relation
      }
    });
  }

  root.fetch = async function tgbSupabaseFallbackFetch(input, init) {
    var url = requestUrl(input);
    var relation = requestMethod(input, init) === 'GET' ? publicRelationFromUrl(url) : '';
    if (!relation) return originalFetch(input, init);

    try {
      var response = await originalFetch(input, init);
      if (response.ok) return response;
      try { return await fallbackResponse(relation, url); }
      catch (fallbackError) { return response; }
    } catch (networkError) {
      try { return await fallbackResponse(relation, url); }
      catch (fallbackError) { throw networkError; }
    }
  };

  root.TgbSupabaseFallback = {
    fetchRelation: function (relation) {
      if (!FALLBACK_RELATIONS[relation]) return Promise.resolve([]);
      return readBackupRows(relation);
    },
    queryRows: queryBackupRows,
    relations: Object.assign({}, FALLBACK_RELATIONS)
  };

  root.__tgbSupabaseFallbackInstalled = true;
}(typeof globalThis !== 'undefined' ? globalThis : this));
