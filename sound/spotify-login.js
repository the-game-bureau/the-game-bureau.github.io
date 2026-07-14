/* spotify-login.js
 * -----------------
 * Real "Log in with Spotify" for the static sound page, using the
 * Authorization Code + PKCE flow. The Client ID is public and safe to commit;
 * NO client secret is used (PKCE is the browser/public-client flow).
 *
 * What it does: real login/logout state + the user's display name.
 * What it does NOT do: change playback. Full-length songs in the browser
 * require the *listener* to have Spotify Premium — a Spotify restriction that
 * login cannot bypass. Free accounts get ~30-second previews either way.
 *
 * DASHBOARD SETUP (developer.spotify.com/dashboard -> this app -> Settings):
 *   - Redirect URIs: add  https://thegamebureau.com/sound/
 *     (and any other origin you open the page from, e.g. the github.io one,
 *      each as  <origin>/sound/ ).
 *   - User Management: while the app is in Dev Mode, add the Spotify account(s)
 *     that will log in (name + the account's email).
 *
 * Exposes window.TgbSpotifyAuth = { login, logout, subscribe, getState }.
 */
(function (global) {
  'use strict';

  var CLIENT_ID = '3b6ee04f2b1249b79f50e71e3a1f41a6';
  var SCOPES = 'user-read-private user-read-email';
  var AUTH_URL = 'https://accounts.spotify.com/authorize';
  var TOKEN_URL = 'https://accounts.spotify.com/api/token';
  var STORE = 'tgb_spotify_auth';
  var redirectUri = global.location.origin + '/sound/';

  var state = { ready: false, loggedIn: false, name: '' };
  var subscribers = [];
  function emit() { subscribers.forEach(function (fn) { try { fn(state); } catch (e) {} }); }

  // ── PKCE helpers ──────────────────────────────────────────────────────────
  function base64url(buffer) {
    var bytes = new Uint8Array(buffer), str = '';
    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(len) {
    var a = new Uint8Array(len);
    global.crypto.getRandomValues(a);
    return base64url(a).slice(0, len);
  }
  function sha256(text) {
    return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  }

  // ── token storage ─────────────────────────────────────────────────────────
  function saveTokens(t) { t.obtained_at = Date.now(); localStorage.setItem(STORE, JSON.stringify(t)); }
  function loadTokens() { try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { return null; } }
  function clearTokens() { localStorage.removeItem(STORE); }

  // ── flow ──────────────────────────────────────────────────────────────────
  function login() {
    var verifier = randomString(96);
    var st = randomString(16);
    sessionStorage.setItem('tgb_sp_verifier', verifier);
    sessionStorage.setItem('tgb_sp_state', st);
    sha256(verifier).then(function (hash) {
      var q = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: base64url(hash),
        scope: SCOPES,
        state: st
      });
      global.location.assign(AUTH_URL + '?' + q.toString());
    });
  }

  function logout() {
    clearTokens();
    state.loggedIn = false;
    state.name = '';
    emit();
  }

  function postToken(body) {
    return fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body)
    }).then(function (r) { return r.json(); });
  }

  function exchangeCode(code) {
    return postToken({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      code_verifier: sessionStorage.getItem('tgb_sp_verifier') || ''
    }).then(function (t) { if (t.access_token) saveTokens(t); return t; });
  }

  function refresh(t) {
    return postToken({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token
    }).then(function (nt) {
      if (!nt.access_token) throw new Error('refresh failed');
      if (!nt.refresh_token) nt.refresh_token = t.refresh_token;
      saveTokens(nt);
      return nt;
    });
  }

  function validToken() {
    var t = loadTokens();
    if (!t || !t.access_token) return Promise.resolve(null);
    if (Date.now() < t.obtained_at + (t.expires_in - 60) * 1000) return Promise.resolve(t);
    if (t.refresh_token) return refresh(t).catch(function () { clearTokens(); return null; });
    clearTokens();
    return Promise.resolve(null);
  }

  function loadProfile() {
    return validToken().then(function (t) {
      if (!t) { state.loggedIn = false; state.name = ''; return; }
      return fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: 'Bearer ' + t.access_token }
      }).then(function (r) { return r.ok ? r.json() : null; }).then(function (me) {
        if (me && me.id) { state.loggedIn = true; state.name = me.display_name || me.id; }
        else { state.loggedIn = false; state.name = ''; clearTokens(); }
      });
    }).then(function () { state.ready = true; emit(); })
      .catch(function () { state.loggedIn = false; state.name = ''; state.ready = true; emit(); });
  }

  // ── boot: handle the OAuth redirect, else load existing session ────────────
  var params = new URLSearchParams(global.location.search);
  if (params.get('code') && params.get('state') && params.get('state') === sessionStorage.getItem('tgb_sp_state')) {
    exchangeCode(params.get('code')).then(function () {
      history.replaceState({}, document.title, global.location.pathname);
      loadProfile();
    });
  } else {
    if (params.get('error')) history.replaceState({}, document.title, global.location.pathname);
    loadProfile();
  }

  global.TgbSpotifyAuth = {
    login: login,
    logout: logout,
    getState: function () { return state; },
    subscribe: function (fn) { subscribers.push(fn); if (state.ready) fn(state); }
  };
}(window));
