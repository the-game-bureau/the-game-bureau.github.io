(function (global) {
  'use strict';

  var SUPABASE_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  var state = {
    initialized: false,
    authorized: false,
    selectedGameId: '',
    auth: null,
    listeners: []
  };

  function qs(id) {
    return global.document.getElementById(id);
  }

  function builderHrefForGame(gameId) {
    var id = String(gameId || '').trim();
    return '/mc/builder.html' + (id ? '?id=' + encodeURIComponent(id) : '');
  }

  function updateBuilderLink() {
    var link = qs('navBuilderLink');
    if (!link) return;
    link.href = builderHrefForGame(state.selectedGameId);
    link.textContent = 'Challenge Builder';
    link.title = state.selectedGameId
      ? 'Open the selected game in Builder'
      : 'Build games in Mission Control';
  }

  function notify(signedIn, session) {
    state.listeners.slice().forEach(function (listener) {
      try {
        listener(!!signedIn, session || null);
      } catch (error) {
      }
    });
  }

  function setMenuOpen(isOpen) {
    var button = qs('navLoginBtn');
    var panel = qs('navAdminMenuPanel');
    if (!button || !panel) return;
    var shouldOpen = Boolean(isOpen && state.authorized);
    panel.hidden = !shouldOpen;
    button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  }

  function toggleMenu() {
    var panel = qs('navAdminMenuPanel');
    setMenuOpen(Boolean(panel && panel.hidden));
  }

  function setAuthorized(isAuthorized, session) {
    var button = qs('navLoginBtn');
    state.authorized = !!isAuthorized;
    if (button) button.textContent = state.authorized ? 'Mission Control' : 'Login';
    if (!state.authorized) state.selectedGameId = '';
    updateBuilderLink();
    setMenuOpen(false);
    notify(state.authorized, session || null);
  }

  function init() {
    if (state.initialized) return state.auth;
    state.initialized = true;

    var menu = qs('navAdminMenu');
    var button = qs('navLoginBtn');
    var signOutButton = qs('navAdminSignOutBtn');
    if (!menu || !button || !global.TgbMcAdminAuth) return null;

    state.auth = global.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      modalCopy: 'Sign in to Mission Control with an admin account.',
      initialMessage: '',
      homeHref: '/index.html',
      onAuthorized: function (session) {
        setAuthorized(true, session);
      },
      onSignedOut: function (session) {
        setAuthorized(false, session);
      }
    });

    button.addEventListener('click', function () {
      if (state.authorized) {
        toggleMenu();
        return;
      }
      if (state.auth) state.auth.showAuth();
    });

    if (signOutButton) {
      signOutButton.addEventListener('click', function () {
        setMenuOpen(false);
        if (state.auth) state.auth.signOut({ silent: true });
      });
    }

    global.document.addEventListener('click', function (event) {
      if (!menu || menu.contains(event.target)) return;
      setMenuOpen(false);
    });

    global.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenuOpen(false);
    });

    state.auth.init().then(function (signedIn) {
      if (!signedIn) {
        if (state.auth) state.auth.close();
        setAuthorized(false, null);
      }
    });
    updateBuilderLink();
    return state.auth;
  }

  global.TgbSiteNavAdmin = {
    init: init,
    getAuth: function () {
      return state.auth || init();
    },
    isAuthorized: function () {
      return state.authorized;
    },
    setSelectedGameId: function (gameId) {
      state.selectedGameId = String(gameId || '').trim();
      updateBuilderLink();
    },
    onAuthChange: function (listener) {
      if (typeof listener !== 'function') return function () {};
      state.listeners.push(listener);
      listener(state.authorized, state.auth && state.auth.getSession ? state.auth.getSession() : null);
      return function () {
        state.listeners = state.listeners.filter(function (item) {
          return item !== listener;
        });
      };
    }
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
