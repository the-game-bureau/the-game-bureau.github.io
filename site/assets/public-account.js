(function () {
  const SUPABASE_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  const STORAGE_KEY = 'tgb-public-auth-session';
  const LIGHTBOX_STYLE_ID = 'tgb-account-lightbox-style';
  const LIGHTBOX_ROOT_ID = 'tgb-account-lightbox';
  let accountLightbox = null;

  function authUrl(path) {
    return new URL('/auth/v1/' + String(path || '').replace(/^\/+/, ''), SUPABASE_CONFIG.url + '/').toString();
  }

  async function readError(response, fallback) {
    try {
      const text = await response.text();
      if (!text) return fallback;
      try {
        const payload = JSON.parse(text);
        return payload.msg || payload.message || payload.error_description || payload.error || fallback;
      } catch (error) {
        return text.slice(0, 240) || fallback;
      }
    } catch (error) {
      return fallback;
    }
  }

  function normalizeSession(payload) {
    const rawSession = payload && payload.session ? payload.session : payload;
    if (!rawSession || !rawSession.access_token) return null;
    const session = { ...rawSession };
    if (!session.user && payload && payload.user) session.user = payload.user;
    if (!session.expires_at && session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 0);
    }
    return session;
  }

  function readStoredSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      return null;
    }
  }

  function storeSession(session) {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
    }
    updateAccountLinks(session);
  }

  async function refreshSession(session) {
    if (!session || !session.refresh_token) return null;
    const response = await fetch(authUrl('token?grant_type=refresh_token'), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!response.ok) return null;
    return normalizeSession(await response.json());
  }

  async function getSession() {
    const stored = normalizeSession(readStoredSession());
    if (!stored) {
      updateAccountLinks(null);
      return null;
    }

    const expiresAt = Number(stored.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt > Date.now() + 60000) {
      updateAccountLinks(stored);
      return stored;
    }

    const refreshed = await refreshSession(stored);
    storeSession(refreshed);
    return refreshed;
  }

  async function signIn(email, password) {
    const response = await fetch(authUrl('token?grant_type=password'), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) throw new Error(await readError(response, 'Sign in failed.'));
    const session = normalizeSession(await response.json());
    storeSession(session);
    return session;
  }

  async function signUp(email, password, data) {
    const response = await fetch(authUrl('signup'), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        data: data || {}
      })
    });

    if (!response.ok) throw new Error(await readError(response, 'Could not create account.'));
    const payload = await response.json();
    const session = normalizeSession(payload);
    if (session) storeSession(session);
    return payload;
  }

  async function updateUser(data) {
    const session = await getSession();
    if (!session || !session.access_token) throw new Error('Sign in first.');

    const response = await fetch(authUrl('user'), {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: data || {} })
    });

    if (!response.ok) throw new Error(await readError(response, 'Could not update account.'));
    const payload = await response.json();
    const user = payload && payload.user ? payload.user : payload;
    const nextSession = { ...session, user };
    storeSession(nextSession);
    return user;
  }

  async function recoverPassword(email) {
    const response = await fetch(authUrl('recover'), {
      method: 'POST',
      headers: {
        apikey: SUPABASE_CONFIG.key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) throw new Error(await readError(response, 'Could not send reset email.'));
    return true;
  }

  async function signOut() {
    const session = readStoredSession();
    if (session && session.access_token) {
      await fetch(authUrl('logout'), {
        method: 'POST',
        headers: {
          apikey: SUPABASE_CONFIG.key,
          Authorization: 'Bearer ' + session.access_token
        }
      }).catch(() => {});
    }
    storeSession(null);
  }

  function getEmail(session) {
    return String(session && session.user && session.user.email || '').trim();
  }

  function getDisplayName(session) {
    const metadata = session && session.user && session.user.user_metadata || {};
    return String(metadata.display_name || metadata.name || '').trim();
  }

  function isAccountPage() {
    return /(^|\/)account\.html$/i.test(window.location.pathname);
  }

  function buildEmbeddedAccountUrl(href) {
    const url = new URL(href || 'account.html', window.location.href);
    url.searchParams.set('embedded', '1');
    return url.toString();
  }

  function ensureLightboxStyles() {
    if (document.getElementById(LIGHTBOX_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = LIGHTBOX_STYLE_ID;
    style.textContent = [
      'body.tgb-account-lightbox-open{overflow:hidden;}',
      '.tgb-account-lightbox{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(17,17,17,.52);backdrop-filter:blur(10px);}',
      '.tgb-account-lightbox.is-open{display:flex;}',
      '.tgb-account-lightbox__dialog{position:relative;width:min(940px,100%);height:min(88svh,860px);display:grid;grid-template-rows:auto minmax(0,1fr);border:1px solid rgba(17,17,17,.82);background:#f3eee6;box-shadow:0 24px 80px rgba(0,0,0,.28);overflow:hidden;}',
      '.tgb-account-lightbox__chrome{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 60px 14px 16px;border-bottom:1px solid rgba(17,17,17,.14);}',
      '.tgb-account-lightbox__meta{display:grid;gap:4px;}',
      '.tgb-account-lightbox__kicker{margin:0;color:#d73a31;font:600 .68rem/1 "IBM Plex Mono",monospace;letter-spacing:.2em;text-transform:uppercase;}',
      '.tgb-account-lightbox__copy{margin:0;color:rgba(17,17,17,.62);font:500 .84rem/1.4 "Archivo","Helvetica Neue",sans-serif;}',
      '.tgb-account-lightbox__close{position:absolute;top:12px;right:12px;width:36px;height:36px;border:1px solid rgba(17,17,17,.82);background:#fff;color:#111;font:500 1.3rem/1 Arial,sans-serif;cursor:pointer;}',
      '.tgb-account-lightbox__close:hover,.tgb-account-lightbox__close:focus-visible{border-color:#d73a31;background:#d73a31;color:#fff;outline:none;}',
      '.tgb-account-lightbox__frame{width:100%;height:100%;border:0;background:#f3eee6;}',
      '@media (max-width:720px){.tgb-account-lightbox{padding:12px;}.tgb-account-lightbox__dialog{height:min(92svh,920px);}.tgb-account-lightbox__chrome{padding:12px 52px 12px 12px;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureLightbox() {
    if (accountLightbox) return accountLightbox;
    ensureLightboxStyles();

    const root = document.createElement('div');
    root.id = LIGHTBOX_ROOT_ID;
    root.className = 'tgb-account-lightbox';
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;
    root.innerHTML = [
      '<div class="tgb-account-lightbox__dialog" role="dialog" aria-modal="true" aria-labelledby="tgbAccountLightboxKicker">',
      '  <button class="tgb-account-lightbox__close" type="button" aria-label="Close account">×</button>',
      '  <div class="tgb-account-lightbox__chrome">',
      '    <div class="tgb-account-lightbox__meta">',
      '      <p class="tgb-account-lightbox__kicker" id="tgbAccountLightboxKicker">ACCOUNT</p>',
      '      <p class="tgb-account-lightbox__copy">Sign in, create an account, or manage your profile.</p>',
      '    </div>',
      '  </div>',
      '  <iframe class="tgb-account-lightbox__frame" title="Account" src="about:blank" loading="lazy"></iframe>',
      '</div>'
    ].join('');
    document.body.appendChild(root);

    const closeButton = root.querySelector('.tgb-account-lightbox__close');
    const frame = root.querySelector('.tgb-account-lightbox__frame');
    const kicker = root.querySelector('.tgb-account-lightbox__kicker');

    function closeLightbox() {
      root.classList.remove('is-open');
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('tgb-account-lightbox-open');
      if (frame) frame.src = 'about:blank';
    }

    root.addEventListener('click', (event) => {
      if (event.target === root) closeLightbox();
    });
    closeButton.addEventListener('click', closeLightbox);

    accountLightbox = {
      root,
      frame,
      kicker,
      closeButton,
      close: closeLightbox
    };
    return accountLightbox;
  }

  function openAccountLightbox(href, label) {
    const lightbox = ensureLightbox();
    const lightboxLabel = String(label || 'ACCOUNT').trim().toUpperCase();
    lightbox.kicker.textContent = lightboxLabel;
    lightbox.frame.src = buildEmbeddedAccountUrl(href);
    lightbox.root.hidden = false;
    lightbox.root.setAttribute('aria-hidden', 'false');
    lightbox.root.classList.add('is-open');
    document.body.classList.add('tgb-account-lightbox-open');
    window.requestAnimationFrame(() => {
      if (lightbox.closeButton) lightbox.closeButton.focus();
    });
  }

  function shouldInterceptAccountClick(event, link) {
    if (!link) return false;
    if (isAccountPage()) return false;
    if (event.defaultPrevented) return false;
    if (event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.hasAttribute('download')) return false;
    if (link.target && String(link.target).toLowerCase() !== '_self') return false;
    return true;
  }

  function updateAccountLinks(session) {
    const email = getEmail(session);
    const signedIn = !!email;
    const label = signedIn ? 'Account' : 'Sign in';
    const state = signedIn ? 'signed-in' : 'signed-out';
    const ariaLabel = signedIn ? 'Account, signed in' : 'Account, signed out';
    const title = signedIn ? ('Signed in as ' + email) : 'Signed out. Open account to sign in.';
    document.querySelectorAll('[data-account-link]').forEach((link) => {
      link.textContent = label;
      link.setAttribute('aria-label', ariaLabel);
      link.setAttribute('data-auth-state', state);
      link.classList.toggle('is-signed-in', signedIn);
      link.classList.toggle('is-signed-out', !signedIn);
      link.title = title;
    });
  }

  window.TGBAccount = {
    getSession,
    readStoredSession,
    signIn,
    signUp,
    signOut,
    updateUser,
    recoverPassword,
    getEmail,
    getDisplayName,
    openAccountLightbox,
    closeAccountLightbox: () => {
      if (accountLightbox) accountLightbox.close();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    getSession().catch(() => updateAccountLinks(null));
    if (!isAccountPage()) {
      document.addEventListener('click', (event) => {
        const link = event.target.closest('[data-account-link]');
        if (!shouldInterceptAccountClick(event, link)) return;
        event.preventDefault();
        openAccountLightbox(
          link.href || 'account.html',
          link.getAttribute('aria-label') || link.getAttribute('title') || 'ACCOUNT'
        );
      });
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      updateAccountLinks(readStoredSession());
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (accountLightbox && accountLightbox.root && accountLightbox.root.classList.contains('is-open')) {
      accountLightbox.close();
    }
  });

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const payload = event.data || {};
    if (payload.source !== 'tgb-account-page') return;

    if (payload.type === 'close') {
      if (accountLightbox) accountLightbox.close();
      return;
    }

    if (payload.type === 'navigate') {
      if (accountLightbox) accountLightbox.close();
      if (payload.href) window.location.href = String(payload.href);
      return;
    }

    if (payload.type === 'auth-changed') {
      getSession().catch(() => updateAccountLinks(null));
    }
  });
}());
