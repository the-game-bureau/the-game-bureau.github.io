(function (global) {
  'use strict';

  var SUPABASE_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    publishableKey: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  function buildLoginButton(document) {
    var topbar = document.createElement('div');
    topbar.className = 'topbar research-topbar';
    topbar.setAttribute('aria-label', 'Mission Control navigation');
    topbar.innerHTML = [
      '<div class="topbar-actions">',
      '  <button class="mc-back-btn" type="button" data-mc-back data-mc-back-fallback="/" data-mc-new-tab>TGB HOME</button>',
      '  <button class="mc-back-btn" type="button" data-mc-home="/mc/">MISSION CONTROL</button>',
      '  <button class="signout-btn" id="signOutBtn" type="button" aria-label="ADMIN LOGIN" title="ADMIN LOGIN">',
      '    <svg viewBox="0 0 24 24" aria-hidden="true">',
      '      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      '      <path d="M5.5 19.5c1.2-3.4 3.8-5.1 6.5-5.1s5.3 1.7 6.5 5.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
      '    </svg>',
      '  </button>',
      '</div>'
    ].join('');
    document.body.insertBefore(topbar, document.body.firstChild);
    return topbar.querySelector('#signOutBtn');
  }

  function init() {
    if (!global.TgbMcAdminAuth || !global.TgbMcAdminNav) return;

    var signOutButton = global.document.getElementById('signOutBtn')
      || buildLoginButton(global.document);
    var webButton = global.document.querySelector('[data-mc-back]');
    if (webButton) {
      webButton.addEventListener('click', function () {
        global.open(webButton.getAttribute('data-mc-back-fallback') || '/', '_blank', 'noopener,noreferrer');
      });
    }
    var mcButton = global.document.querySelector('[data-mc-home]');
    if (mcButton) {
      mcButton.addEventListener('click', function () {
        global.location.href = mcButton.getAttribute('data-mc-home') || '/mc/';
      });
    }
    var adminAuth = global.TgbMcAdminAuth.create({
      supabaseConfig: SUPABASE_CONFIG,
      homeHref: '/'
    });

    global.TgbMcAdminNav.init({
      signOutButton: signOutButton,
      auth: adminAuth
    });
    adminAuth.init();
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}(window));
