(function () {
  const SUPABASE_CONFIG = {
    url: 'https://qmaafbncpzrdmqapkkgr.supabase.co',
    key: 'sb_publishable_6a9XqxYa0-AZtyrwz4ZeUg_aiMsVH-3'
  };

  const STORAGE_KEY = 'tgb-public-auth-session';

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

  function updateAccountLinks(session) {
    const email = getEmail(session);
    document.querySelectorAll('[data-account-link]').forEach((link) => {
      link.textContent = email ? 'Account' : 'Sign in';
      link.classList.toggle('is-signed-in', !!email);
      if (email) link.title = email;
      else link.removeAttribute('title');
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
    getDisplayName
  };

  document.addEventListener('DOMContentLoaded', () => {
    getSession().catch(() => updateAccountLinks(null));
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      updateAccountLinks(readStoredSession());
    }
  });
}());
