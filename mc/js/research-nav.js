(function (global) {
  'use strict';

  var SUPABASE_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  function ensureSiteNavPlaceholder(document) {
    var existing =
      document.querySelector('header[data-admin-site-nav]') ||
      document.querySelector('header.admin-site-nav');
    if (existing) return existing;

    var header = document.createElement('header');
    header.className = 'admin-site-nav';
    header.setAttribute('data-admin-site-nav', '');

    var main = document.querySelector('main.research') || document.querySelector('main');
    if (main) {
      main.insertBefore(header, main.firstChild);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
    return header;
  }

  function ensureSiteNavScript(document, done) {
    if (global.TgbAdminSiteNav) {
      done();
      return;
    }

    var existing = document.querySelector('script[data-admin-site-nav-loader]');
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', done, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = 'js/admin-site-nav.js';
    script.setAttribute('data-admin-site-nav-loader', '');
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', done, { once: true });
    document.body.appendChild(script);
  }

  function init() {
    if (!global.TgbMcAdminAuth) return;

    ensureSiteNavPlaceholder(global.document);
    var adminAuth = global.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      homeHref: '/'
    });

    ensureSiteNavScript(global.document, function () {
      if (global.TgbAdminSiteNav) global.TgbAdminSiteNav.bindAuth(adminAuth);
      adminAuth.init();
    });
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
