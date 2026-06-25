/*
 * TgbInstance — records a game playthrough ("game instance"), its responses,
 * and lifecycle events to Supabase, so we can build stats about people playing.
 *
 * Vocabulary: a "team leader" leads a play; a "game instance" is one playthrough
 * by one team. Writes are append-only against the public/anon key (the schema's
 * RLS only allows inserts). The team leader's email is folded in server-side
 * from the Stripe / gift_codes pipeline (via the access_code) — never sent here.
 *
 * Tables: game_instances, game_responses, game_events
 * (see supabase/migrations/20260625_game_instances_responses.sql).
 *
 * Usage (from an engine):
 *   TgbInstance.start({
 *     supabaseUrl, key, gameId, accessCode, engine, mode, session,
 *     playerDeviceId, routeColor, teamName, teamLeaderName, stopsTotal
 *   });
 *   TgbInstance.recordResponse({ stopId, stopTitle, stopIndex, waypointId,
 *     varName, value, kind, isCorrect, routeColor });
 *   TgbInstance.recordEvent('arrived', { waypointId, stopIndex });
 */
(function () {
  'use strict';

  var state = {
    ready: false,
    url: '',
    key: '',
    gameId: '',
    instanceId: '',
    routeColor: ''
  };

  function uuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (e) {}
    // RFC4122-ish fallback.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function restUrl(table) {
    return new URL('rest/v1/' + table, state.url.replace(/\/+$/, '') + '/').toString();
  }

  function post(table, row) {
    if (!state.url || !state.key) return Promise.resolve(false);
    return fetch(restUrl(table), {
      method: 'POST',
      headers: {
        apikey: state.key,
        Authorization: 'Bearer ' + state.key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(row),
      keepalive: true
    }).then(function (res) {
      if (!res.ok) console.warn('[TgbInstance] write to ' + table + ' failed', res.status);
      return res.ok;
    }).catch(function (err) {
      console.warn('[TgbInstance] write to ' + table + ' error', err);
      return false;
    });
  }

  function clean(v) {
    return v == null ? '' : String(v).trim();
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var TgbInstance = {
    // Ensure a game instance exists for this play and remember it. Idempotent:
    // reuses the same instance id (per game + access code) across reloads, and
    // only inserts the instance row once.
    start: function (opts) {
      opts = opts || {};
      state.url = clean(opts.supabaseUrl);
      state.key = clean(opts.key);
      state.gameId = clean(opts.gameId);
      // route_color = the engine's route-rotation slot (blue/black/...), NOT a
      // sports-team color. A Game Bureau team is identified by team_name.
      state.routeColor = clean(opts.routeColor);
      if (!state.url || !state.key || !state.gameId) return '';

      var code = clean(opts.accessCode);
      var storeKey = 'tgb_instance_' + state.gameId + (code ? '_' + code : '');
      var sentKey = storeKey + '_sent';

      var id = clean(lsGet(storeKey));
      if (!id) {
        id = uuid();
        lsSet(storeKey, id);
      }
      state.instanceId = id;
      state.ready = true;

      if (lsGet(sentKey) === '1') return id; // already inserted this play

      post('game_instances', {
        id: id,
        game_id: state.gameId,
        access_code: code || null,
        team_leader_name: clean(opts.teamLeaderName) || null,
        team_name: clean(opts.teamName) || null,
        route_color: state.routeColor || null,
        engine: clean(opts.engine) || null,
        mode: clean(opts.mode) || null,
        player_device_id: clean(opts.playerDeviceId) || null,
        session: clean(opts.session) || null,
        stops_total: Number.isFinite(opts.stopsTotal) ? opts.stopsTotal : null,
        user_agent: (navigator && navigator.userAgent) || null,
        page_url: window.location.href
      }).then(function (ok) {
        if (ok) lsSet(sentKey, '1');
      });

      this.recordEvent('started', {});
      return id;
    },

    recordResponse: function (opts) {
      if (!state.ready || !state.instanceId) return;
      opts = opts || {};
      var wp = opts.waypointId;
      post('game_responses', {
        instance_id: state.instanceId,
        game_id: state.gameId,
        stop_id: clean(opts.stopId) || null,
        stop_title: clean(opts.stopTitle) || null,
        stop_index: Number.isFinite(opts.stopIndex) ? opts.stopIndex : null,
        waypoint_id: wp != null && wp !== '' && Number.isFinite(Number(wp)) ? Number(wp) : null,
        var_name: clean(opts.varName) || null,
        response_kind: clean(opts.kind) || 'text',
        response_value: opts.value == null ? null : String(opts.value),
        is_correct: typeof opts.isCorrect === 'boolean' ? opts.isCorrect : null,
        route_color: clean(opts.routeColor) || state.routeColor || null
      });
    },

    recordEvent: function (eventType, opts) {
      if (!state.ready || !state.instanceId) return;
      opts = opts || {};
      var wp = opts.waypointId;
      post('game_events', {
        instance_id: state.instanceId,
        game_id: state.gameId,
        event_type: clean(eventType) || 'event',
        stop_id: clean(opts.stopId) || null,
        stop_index: Number.isFinite(opts.stopIndex) ? opts.stopIndex : null,
        waypoint_id: wp != null && wp !== '' && Number.isFinite(Number(wp)) ? Number(wp) : null,
        detail: opts.detail != null ? opts.detail : null
      });
    },

    getInstanceId: function () { return state.instanceId; }
  };

  window.TgbInstance = TgbInstance;
}());
