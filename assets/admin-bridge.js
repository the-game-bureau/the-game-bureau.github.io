(function (global) {
  'use strict';

  if (global.TgbPublicAdminBridge) return;

  var SB_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };
  var STORAGE_KEY = 'tgb-photo-review-auth-session';
  var STYLE_ID = 'tgb-admin-bridge-style';
  var authorized = false;
  var currentSession = null;
  var observer = null;
  var scanTimer = 0;

  function scriptRootUrl() {
    var script = document.currentScript;
    var src = script && script.src ? script.src : 'assets/admin-bridge.js';
    return new URL('../../', src);
  }

  var ROOT_URL = scriptRootUrl();

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.tgb-admin-edit-link{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border:1px solid #111;background:#111;color:#fff!important;font-family:"IBM Plex Mono",Consolas,monospace;font-size:11px;font-weight:800;letter-spacing:.12em;line-height:1;text-decoration:none!important;text-transform:uppercase;white-space:nowrap;box-sizing:border-box;transition:background .14s ease,color .14s ease,border-color .14s ease,transform .14s ease;}',
      '.tgb-admin-edit-link:hover,.tgb-admin-edit-link:focus-visible{background:#fff;color:#111!important;border-color:#111;outline:none;}',
      '.tgb-admin-edit-wrap{position:relative;display:grid;min-width:0;}',
      '.tgb-admin-edit-wrap>.tgb-admin-edit-link{position:absolute;right:8px;bottom:8px;z-index:3;min-height:30px;background:rgba(17,17,17,.92);}',
      '.tgb-admin-edit-wrap>.tgb-admin-edit-link:hover,.tgb-admin-edit-wrap>.tgb-admin-edit-link:focus-visible{background:#fff;}',
      '[data-admin-target] .tgb-admin-edit-link{position:static;}'
    ].join('');
    document.head.appendChild(style);
  }

  function readStoredSession() {
    try {
      var session = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null');
      return session && session.access_token ? session : null;
    } catch (error) {
      return null;
    }
  }

  function storeSession(session) {
    try {
      if (session) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else global.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
    }
  }

  function authUrl(path) {
    return new URL('/auth/v1/' + String(path || '').replace(/^\/+/, ''), SB_CONFIG.url + '/').toString();
  }

  function headersForSession(session, extra) {
    return Object.assign({
      apikey: SB_CONFIG.key,
      Authorization: 'Bearer ' + ((session && session.access_token) || '')
    }, extra || {});
  }

  function restUrl(table, params) {
    var url = new URL('/rest/v1/' + encodeURIComponent(table), SB_CONFIG.url + '/');
    Object.entries(params || {}).forEach(function (entry) {
      if (entry[1] !== undefined && entry[1] !== null && entry[1] !== '') {
        url.searchParams.set(entry[0], String(entry[1]));
      }
    });
    return url.toString();
  }

  async function fetchUser(accessToken) {
    var response = await fetch(authUrl('user'), {
      headers: {
        apikey: SB_CONFIG.key,
        Authorization: 'Bearer ' + accessToken
      },
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return response.json();
  }

  async function normalizeSession(payload, fallbackRefreshToken) {
    if (!payload || !payload.access_token) return null;
    var user = payload.user || await fetchUser(payload.access_token);
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || fallbackRefreshToken || '',
      expires_at: payload.expires_at || Math.floor((Date.now() + ((payload.expires_in || 3600) * 1000)) / 1000),
      user: user || null
    };
  }

  async function refreshSession(session) {
    if (!session || !session.refresh_token) return null;
    var response = await fetch(authUrl('token?grant_type=refresh_token'), {
      method: 'POST',
      headers: {
        apikey: SB_CONFIG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      cache: 'no-store'
    });
    if (!response.ok) return null;
    return normalizeSession(await response.json(), session.refresh_token);
  }

  async function getUsableSession() {
    var stored = readStoredSession();
    if (!stored || !stored.access_token) return null;
    var expiresAt = Number(stored.expires_at || 0) * 1000;
    if (expiresAt && expiresAt <= Date.now() + 60000) {
      var refreshed = await refreshSession(stored);
      if (!refreshed || !refreshed.access_token) {
        storeSession(null);
        return null;
      }
      storeSession(refreshed);
      return refreshed;
    }
    if (!stored.user || !stored.user.email) {
      stored.user = await fetchUser(stored.access_token);
      if (stored.user && stored.user.email) storeSession(stored);
    }
    return stored;
  }

  async function verifyStoredSession(session) {
    if (!session || !session.access_token) return false;
    var expiresAt = Number(session.expires_at || 0) * 1000;
    if (expiresAt && expiresAt <= Date.now() + 60000) return false;
    var email = session.user && session.user.email ? session.user.email : '';
    if (!email) return false;
    var response = await fetch(restUrl('admin_users', {
      select: 'email',
      email: 'eq.' + email,
      limit: '1'
    }), {
      headers: headersForSession(session, { Accept: 'application/json' }),
      cache: 'no-store'
    });
    if (!response.ok) return false;
    var rows = await response.json();
    return Array.isArray(rows) && rows.length > 0;
  }

  function encode(value) {
    return encodeURIComponent(String(value || '').trim());
  }

  function rootHref(path) {
    return new URL(String(path || '').replace(/^\/+/, ''), ROOT_URL).href;
  }

  function currentGameId() {
    return new URLSearchParams(global.location.search).get('id') || '';
  }

  function routeFor(kind, data) {
    var id = data.id || '';
    var gameId = data.gameId || currentGameId();
    var explicit = data.href || '';
    if (explicit) return rootHref(explicit);
    if (kind === 'game') return rootHref('mc/builder.html' + (id ? '?id=' + encode(id) : ''));
    if (kind === 'game-run') return rootHref('mc/builder.html' + (gameId ? '?id=' + encode(gameId) : ''));
    if (kind === 'gift-item') return rootHref('mc/gs-shop.html' + (id ? '?item=' + encode(id) : ''));
    if (kind === 'gift-shop') return rootHref('mc/gs-shop.html');
    if (kind === 'winners-wall') return rootHref('mc/photos.html');
    if (kind === 'photo') return rootHref('mc/photos.html' + (id ? '?photo=' + encode(id) : (gameId ? '?game=' + encode(gameId) : '')));
    return rootHref('mc/index.html');
  }

  function labelFor(kind, data) {
    if (data.label) return data.label;
    if (kind === 'game' || kind === 'game-run') return 'EDIT GAME';
    if (kind === 'gift-item') return 'EDIT ITEM';
    if (kind === 'gift-shop') return 'EDIT GIFT SHOP';
    if (kind === 'winners-wall') return 'EDIT WINNERS WALL';
    if (kind === 'photo') return 'REVIEW PHOTO';
    return 'MISSION CONTROL';
  }

  function dataFor(el) {
    return {
      id: el.dataset.adminId || '',
      gameId: el.dataset.adminGameId || '',
      href: el.dataset.adminHref || '',
      label: el.dataset.adminLabel || '',
      target: el.dataset.adminTarget || ''
    };
  }

  function createEditLink(kind, data) {
    var link = document.createElement('a');
    link.className = 'tgb-admin-edit-link';
    link.href = routeFor(kind, data);
    link.textContent = labelFor(kind, data);
    link.dataset.tgbAdminInjected = 'true';
    return link;
  }

  function appendEditLink(el) {
    if (!el || el.dataset.tgbAdminReady === 'true') return;
    var kind = el.dataset.adminEdit || '';
    if (!kind) return;
    var data = dataFor(el);
    var link = createEditLink(kind, data);
    var target = data.target ? el.querySelector(data.target) : null;
    if (target) {
      target.appendChild(link);
      el.dataset.tgbAdminReady = 'true';
      return;
    }
    if (el.tagName && el.tagName.toLowerCase() === 'a') {
      var wrapper = document.createElement('div');
      wrapper.className = 'tgb-admin-edit-wrap';
      wrapper.dataset.tgbAdminWrap = 'true';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
      el.dataset.tgbAdminWrapped = 'true';
      wrapper.appendChild(link);
      el.dataset.tgbAdminReady = 'true';
      return;
    }
    el.appendChild(link);
    el.dataset.tgbAdminReady = 'true';
  }

  function scan(root) {
    if (!authorized) return;
    ensureStyle();
    var scope = root && root.querySelectorAll ? root : document;
    if (scope.matches && scope.matches('[data-admin-edit]')) appendEditLink(scope);
    scope.querySelectorAll('[data-admin-edit]').forEach(appendEditLink);
  }

  function scheduleScan() {
    if (!authorized) return;
    global.clearTimeout(scanTimer);
    scanTimer = global.setTimeout(function () { scan(); }, 60);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.documentElement.classList.remove('tgb-admin-authorized');
    document.querySelectorAll('.tgb-admin-edit-link[data-tgb-admin-injected="true"]').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('[data-tgb-admin-ready]').forEach(function (el) {
      delete el.dataset.tgbAdminReady;
    });
    document.querySelectorAll('[data-tgb-admin-wrap="true"]').forEach(function (wrapper) {
      var child = wrapper.querySelector('[data-tgb-admin-wrapped="true"]');
      if (!child) {
        wrapper.remove();
        return;
      }
      delete child.dataset.tgbAdminWrapped;
      wrapper.parentNode.insertBefore(child, wrapper);
      wrapper.remove();
    });
  }

  function setAuthorized(next, session) {
    authorized = !!next;
    currentSession = authorized ? (session || currentSession) : null;
    if (!authorized) {
      cleanup();
      return;
    }
    document.documentElement.classList.add('tgb-admin-authorized');
    scan();
    startObserver();
  }

  async function refresh() {
    var session = await getUsableSession();
    if (!session) {
      setAuthorized(false);
      return false;
    }
    try {
      var ok = await verifyStoredSession(session);
      setAuthorized(ok, ok ? session : null);
      return ok;
    } catch (error) {
      setAuthorized(false);
      return false;
    }
  }

  function init() {
    refresh();
    global.addEventListener('tgb-admin-auth-change', function (event) {
      var detail = event.detail || {};
      setAuthorized(!!detail.signedIn, detail.session || null);
    });
    global.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) refresh();
    });
  }

  global.TgbPublicAdminBridge = {
    scan: scan,
    refresh: refresh,
    setAuthorized: setAuthorized,
    isAuthorized: function () { return authorized; },
    getSession: function () { return currentSession; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}(window));
