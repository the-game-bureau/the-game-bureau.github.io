// Shared Supabase REST helpers for Mission Control pages.
//
// fetchAll(url, headers): read EVERY row of a PostgREST query, paginating past
// the 1000-row cap (Supabase's db-max-rows default). Any "load the whole table"
// read MUST go through this — an unbounded fetch silently stops at 1000 rows,
// a bug that stays invisible until the table crosses 1000 (see CLAUDE.md).
//
// Pass the already-built URL (select/order/filters) and your auth headers; the
// helper adds the Range header per page and concatenates the results.
(function (global) {
  'use strict';

  async function fetchAll(url, headers) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const res = await fetch(url, {
        headers: Object.assign({}, headers || {}, { Range: from + '-' + (from + 999) }),
        cache: 'no-store'
      });
      if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch (error) { /* ignore */ }
        throw new Error(text || ('Request failed (' + res.status + ')'));
      }
      const batch = await res.json();
      if (Array.isArray(batch)) Array.prototype.push.apply(rows, batch);
      if (!Array.isArray(batch) || batch.length < 1000) break;
    }
    return rows;
  }

  global.TgbRest = { fetchAll: fetchAll };
})(window);
